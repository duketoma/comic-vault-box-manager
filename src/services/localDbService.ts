import { ComicBook, ReadingStatus, SeriesIssueTotal, StorageBox } from '../types';
import { DEFAULT_BOXES, INITIAL_COMICS, isSampleComicId } from '../data/initialData';
import { sortBoxes } from '../utils/boxUtils';
import { prepareComic } from './postgresService';

const DB_NAME = 'ComicVaultLocalDB';
const DB_VERSION = 1;

const STORE_COMICS = 'comics';
const STORE_BOXES = 'boxes';
const STORE_SERIES_TOTALS = 'series_totals';
const STORE_OUTBOX = 'sync_outbox';
const STORE_META = 'meta';

export interface SyncMutation {
  entityKey: string; // `${entityType}:${entityId}`
  entityType: 'comic' | 'box' | 'series_total';
  entityId: string;
  operation: 'UPSERT' | 'DELETE';
  payload?: ComicBook | StorageBox | SeriesIssueTotal;
  baseStatus?: ReadingStatus;
  updatedAt: string;
  label?: string;
}

export interface LocalDbSnapshot {
  comics: ComicBook[];
  boxes: StorageBox[];
  seriesTotals: SeriesIssueTotal[];
  creatorTypes: string[];
  lastSyncAt: string | null;
  outbox: SyncMutation[];
}

export interface SyncServerResponse {
  serverTimestamp: string;
  isFullSync: boolean;
  pushedCount: number;
  comics: ComicBook[];
  boxes: StorageBox[];
  seriesTotals: SeriesIssueTotal[];
  creatorTypes: string[];
  deletedComicIds: string[];
  deletedBoxIds: number[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openLocalDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_COMICS)) {
        const comicStore = db.createObjectStore(STORE_COMICS, { keyPath: 'id' });
        comicStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        comicStore.createIndex('currentBoxId', 'currentBoxId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BOXES)) {
        db.createObjectStore(STORE_BOXES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SERIES_TOTALS)) {
        db.createObjectStore(STORE_SERIES_TOTALS, { keyPath: 'syncKey' });
      }
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const outboxStore = db.createObjectStore(STORE_OUTBOX, { keyPath: 'entityKey' });
        outboxStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });

  return dbPromise;
}

function getAllFromStore<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function getFromStore<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function getSeriesSyncKey(item: SeriesIssueTotal): string {
  return `${String(item.seriesName || '').trim().toLowerCase()}|${String(item.volume || '').trim().toLowerCase()}`;
}

/**
 * Loads the complete local database snapshot from IndexedDB.
 * Automatically synchronizes existing localStorage data on startup.
 */
export async function loadLocalSnapshot(): Promise<LocalDbSnapshot> {
  try {
    const db = await openLocalDb();

    // Check if localStorage has seeded comics (e.g. test runner or initial run)
    const rawComics =
      typeof window !== 'undefined' && window.localStorage
        ? localStorage.getItem('comic_vault_comics')
        : null;
    if (rawComics) {
      await syncFromLocalStorage(db);
    }

    return await readSnapshotFromDb(db);
  } catch (err) {
    console.warn('IndexedDB load fallback to localStorage:', err);
    return loadFallbackSnapshotFromLocalStorage();
  }
}

async function syncFromLocalStorage(db: IDBDatabase): Promise<void> {
  try {
    const rawComics = localStorage.getItem('comic_vault_comics');
    const rawBoxes = localStorage.getItem('comic_vault_boxes');
    const rawSeries = localStorage.getItem('comic_vault_series_totals');

    const parsedComics: ComicBook[] = rawComics ? JSON.parse(rawComics) : [];
    const parsedBoxes: StorageBox[] = rawBoxes ? JSON.parse(rawBoxes) : DEFAULT_BOXES;
    const parsedSeries: SeriesIssueTotal[] = rawSeries ? JSON.parse(rawSeries) : [];

    const tx = db.transaction([STORE_COMICS, STORE_BOXES, STORE_SERIES_TOTALS, STORE_META], 'readwrite');
    const comicStore = tx.objectStore(STORE_COMICS);
    const boxStore = tx.objectStore(STORE_BOXES);
    const seriesStore = tx.objectStore(STORE_SERIES_TOTALS);
    const metaStore = tx.objectStore(STORE_META);

    if (parsedComics.length > 0) {
      comicStore.clear();
      for (const c of parsedComics) {
        if (c && c.id && !isSampleComicId(c.id)) {
          const clean = c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c;
          comicStore.put(clean);
        }
      }
    }

    if (parsedBoxes.length > 0) {
      for (const b of parsedBoxes) {
        if (b && b.id) {
          boxStore.put(b);
        }
      }
    }

    if (parsedSeries.length > 0) {
      for (const s of parsedSeries) {
        if (s && s.seriesName) {
          seriesStore.put({ ...s, syncKey: getSeriesSyncKey(s) });
        }
      }
    }

    metaStore.put({ key: 'migratedFromLocalStorage', value: true });
    if (parsedComics.length > 0) {
      metaStore.put({ key: 'lastSyncAt', value: new Date().toISOString() });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Sync from localStorage to IndexedDB warning:', err);
  }
}

async function readSnapshotFromDb(db: IDBDatabase): Promise<LocalDbSnapshot> {
  const tx = db.transaction(
    [STORE_COMICS, STORE_BOXES, STORE_SERIES_TOTALS, STORE_OUTBOX, STORE_META],
    'readonly'
  );

  const [rawComics, rawBoxes, rawSeries, outbox, lastSyncMeta, creatorTypesMeta] = await Promise.all([
    getAllFromStore<ComicBook>(tx.objectStore(STORE_COMICS)),
    getAllFromStore<StorageBox>(tx.objectStore(STORE_BOXES)),
    getAllFromStore<SeriesIssueTotal & { syncKey?: string }>(tx.objectStore(STORE_SERIES_TOTALS)),
    getAllFromStore<SyncMutation>(tx.objectStore(STORE_OUTBOX)),
    getFromStore<{ key: string; value: string | null }>(tx.objectStore(STORE_META), 'lastSyncAt'),
    getFromStore<{ key: string; value: string[] }>(tx.objectStore(STORE_META), 'creatorTypes'),
  ]);

  const comics = rawComics
    .filter((c) => c && c.id && !isSampleComicId(c.id))
    .map((c) => (c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c))
    .sort((a, b) => {
      const dateCmp = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      if (dateCmp !== 0) return dateCmp;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });

  const boxes = sortBoxes(rawBoxes.length > 0 ? rawBoxes : DEFAULT_BOXES);
  const seriesTotals = rawSeries
    .map(({ syncKey: _k, ...rest }) => rest)
    .sort((a, b) => String(a.seriesName || '').localeCompare(String(b.seriesName || '')));

  const sortedOutbox = [...outbox].sort((a, b) =>
    String(a.updatedAt || '').localeCompare(String(b.updatedAt || ''))
  );

  // Safety guard: if outbox has over 500 items, it was an accidental bulk enqueue
  if (sortedOutbox.length > 500) {
    try {
      const clearTx = db.transaction([STORE_OUTBOX], 'readwrite');
      clearTx.objectStore(STORE_OUTBOX).clear();
      sortedOutbox.length = 0;
    } catch {
      // ignore
    }
  }

  return {
    comics,
    boxes,
    seriesTotals,
    creatorTypes: Array.isArray(creatorTypesMeta?.value) ? creatorTypesMeta!.value : [],
    lastSyncAt: lastSyncMeta?.value || null,
    outbox: sortedOutbox,
  };
}

function loadFallbackSnapshotFromLocalStorage(): LocalDbSnapshot {
  const savedBoxes = localStorage.getItem('comic_vault_boxes');
  const savedComics = localStorage.getItem('comic_vault_comics');
  const savedSeries = localStorage.getItem('comic_vault_series_totals');

  const boxes = sortBoxes(savedBoxes ? JSON.parse(savedBoxes) : DEFAULT_BOXES);
  const comics: ComicBook[] = (savedComics ? JSON.parse(savedComics) : INITIAL_COMICS)
    .filter((c: ComicBook) => !isSampleComicId(c.id))
    .map((c: ComicBook) => (c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c));
  const seriesTotals: SeriesIssueTotal[] = savedSeries ? JSON.parse(savedSeries) : [];

  return {
    comics,
    boxes,
    seriesTotals,
    creatorTypes: [],
    lastSyncAt: null,
    outbox: [],
  };
}

/**
 * Directly populates comics in IndexedDB without enqueuing them to sync_outbox
 * (used when hydrating from backend loadCollection or server snapshot).
 */
export async function putLocalComicsDirect(comics: ComicBook[]): Promise<void> {
  if (comics.length === 0) return;
  const db = await openLocalDb();
  const tx = db.transaction([STORE_COMICS], 'readwrite');
  const comicStore = tx.objectStore(STORE_COMICS);

  for (const c of comics) {
    if (c && c.id && !isSampleComicId(c.id)) {
      const clean = c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c;
      comicStore.put(clean);
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Saves a single comic to IndexedDB and enqueues an UPSERT mutation in sync_outbox.
 */
export async function saveLocalComicAndEnqueue(
  comic: ComicBook,
  baseStatus?: ReadingStatus
): Promise<SyncMutation[]> {
  const nowIso = new Date().toISOString();
  const prepared = await prepareComic({
    ...comic,
    copiesOwned: comic.readingStatus === 'Wishlist' ? 0 : comic.copiesOwned,
    createdAt: comic.createdAt || nowIso,
    updatedAt: nowIso,
  });

  const db = await openLocalDb();
  const tx = db.transaction([STORE_COMICS, STORE_OUTBOX], 'readwrite');
  const comicStore = tx.objectStore(STORE_COMICS);
  const outboxStore = tx.objectStore(STORE_OUTBOX);

  const entityKey = `comic:${prepared.id}`;
  const existingMut = await getFromStore<SyncMutation>(outboxStore, entityKey);

  comicStore.put(prepared);
  outboxStore.put({
    entityKey,
    entityType: 'comic',
    entityId: prepared.id,
    operation: 'UPSERT',
    payload: prepared,
    baseStatus: existingMut?.baseStatus || baseStatus,
    updatedAt: nowIso,
    label: `${prepared.title || 'Comic'} #${prepared.issueNumber || '1'}`,
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return getOutboxMutations();
}

/**
 * Saves a batch of comics to IndexedDB and enqueues UPSERT mutations in sync_outbox.
 */
export async function saveLocalComicsBatchAndEnqueue(
  comics: ComicBook[],
  baseStatuses?: Map<string, ReadingStatus>
): Promise<SyncMutation[]> {
  if (comics.length === 0) return getOutboxMutations();

  const nowIso = new Date().toISOString();
  const preparedList = await Promise.all(
    comics
      .filter((c) => c && c.id && !isSampleComicId(c.id))
      .map((c) =>
        prepareComic({
          ...c,
          copiesOwned: c.readingStatus === 'Wishlist' ? 0 : c.copiesOwned,
          createdAt: c.createdAt || nowIso,
          updatedAt: nowIso,
        })
      )
  );

  const db = await openLocalDb();
  const tx = db.transaction([STORE_COMICS, STORE_OUTBOX], 'readwrite');
  const comicStore = tx.objectStore(STORE_COMICS);
  const outboxStore = tx.objectStore(STORE_OUTBOX);

  const existingOutbox = await getAllFromStore<SyncMutation>(outboxStore);
  const existingMap = new Map<string, SyncMutation>(existingOutbox.map((m) => [m.entityKey, m]));

  for (const comic of preparedList) {
    const entityKey = `comic:${comic.id}`;
    const prevMut = existingMap.get(entityKey);
    const baseStatus = prevMut?.baseStatus || baseStatuses?.get(comic.id);

    comicStore.put(comic);
    outboxStore.put({
      entityKey,
      entityType: 'comic',
      entityId: comic.id,
      operation: 'UPSERT',
      payload: comic,
      baseStatus,
      updatedAt: nowIso,
      label: `${comic.title || 'Comic'} #${comic.issueNumber || '1'}`,
    });
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return getOutboxMutations();
}

/**
 * Replaces the entire local comic collection and enqueues UPSERT and DELETE mutations accordingly.
 */
export async function replaceAllLocalComicsAndEnqueue(newComics: ComicBook[]): Promise<SyncMutation[]> {
  const nowIso = new Date().toISOString();
  const preparedList = await Promise.all(
    newComics
      .filter((c) => c && c.id && !isSampleComicId(c.id))
      .map((c) =>
        prepareComic({
          ...c,
          copiesOwned: c.readingStatus === 'Wishlist' ? 0 : c.copiesOwned,
          createdAt: c.createdAt || nowIso,
          updatedAt: c.updatedAt || nowIso,
        })
      )
  );

  const db = await openLocalDb();
  const tx = db.transaction([STORE_COMICS, STORE_OUTBOX], 'readwrite');
  const comicStore = tx.objectStore(STORE_COMICS);
  const outboxStore = tx.objectStore(STORE_OUTBOX);

  const existingComics = await getAllFromStore<ComicBook>(comicStore);
  const newIdSet = new Set(preparedList.map((c) => c.id));

  // Any comic that existed locally but is not in newComics gets a DELETE mutation
  for (const oldComic of existingComics) {
    if (!newIdSet.has(oldComic.id)) {
      comicStore.delete(oldComic.id);
      outboxStore.put({
        entityKey: `comic:${oldComic.id}`,
        entityType: 'comic',
        entityId: oldComic.id,
        operation: 'DELETE',
        updatedAt: nowIso,
        label: `Deleted ${oldComic.title || 'Comic'} #${oldComic.issueNumber || '1'}`,
      });
    }
  }

  for (const comic of preparedList) {
    comicStore.put(comic);
    outboxStore.put({
      entityKey: `comic:${comic.id}`,
      entityType: 'comic',
      entityId: comic.id,
      operation: 'UPSERT',
      payload: comic,
      updatedAt: nowIso,
      label: `${comic.title || 'Comic'} #${comic.issueNumber || '1'}`,
    });
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return getOutboxMutations();
}

/**
 * Deletes a single comic from IndexedDB and enqueues a DELETE mutation in sync_outbox.
 */
export async function deleteLocalComicAndEnqueue(
  comicId: string,
  comicLabel?: string
): Promise<SyncMutation[]> {
  const nowIso = new Date().toISOString();
  const db = await openLocalDb();
  const tx = db.transaction([STORE_COMICS, STORE_OUTBOX], 'readwrite');
  const comicStore = tx.objectStore(STORE_COMICS);
  const outboxStore = tx.objectStore(STORE_OUTBOX);

  comicStore.delete(comicId);
  outboxStore.put({
    entityKey: `comic:${comicId}`,
    entityType: 'comic',
    entityId: comicId,
    operation: 'DELETE',
    updatedAt: nowIso,
    label: comicLabel ? `Deleted ${comicLabel}` : `Deleted comic ${comicId}`,
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return getOutboxMutations();
}

/**
 * Saves a storage box to IndexedDB and enqueues an UPSERT mutation in sync_outbox.
 */
export async function saveLocalBoxAndEnqueue(box: StorageBox): Promise<SyncMutation[]> {
  const nowIso = new Date().toISOString();
  const updatedBox: StorageBox = { ...box, updatedAt: nowIso };

  const db = await openLocalDb();
  const tx = db.transaction([STORE_BOXES, STORE_OUTBOX], 'readwrite');
  const boxStore = tx.objectStore(STORE_BOXES);
  const outboxStore = tx.objectStore(STORE_OUTBOX);

  boxStore.put(updatedBox);
  outboxStore.put({
    entityKey: `box:${updatedBox.id}`,
    entityType: 'box',
    entityId: String(updatedBox.id),
    operation: 'UPSERT',
    payload: updatedBox,
    updatedAt: nowIso,
    label: `Box ${updatedBox.id}: ${updatedBox.name}`,
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return getOutboxMutations();
}

/**
 * Deletes a storage box from IndexedDB and enqueues a DELETE mutation in sync_outbox.
 */
export async function deleteLocalBoxAndEnqueue(boxId: number): Promise<SyncMutation[]> {
  const nowIso = new Date().toISOString();
  const db = await openLocalDb();
  const tx = db.transaction([STORE_BOXES, STORE_OUTBOX], 'readwrite');
  const boxStore = tx.objectStore(STORE_BOXES);
  const outboxStore = tx.objectStore(STORE_OUTBOX);

  boxStore.delete(boxId);
  outboxStore.put({
    entityKey: `box:${boxId}`,
    entityType: 'box',
    entityId: String(boxId),
    operation: 'DELETE',
    updatedAt: nowIso,
    label: `Deleted Box ${boxId}`,
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return getOutboxMutations();
}

/**
 * Saves series issue totals to IndexedDB and optionally enqueues them for sync.
 */
export async function saveLocalSeriesTotals(
  seriesTotals: SeriesIssueTotal[],
  enqueue = false
): Promise<SyncMutation[]> {
  const nowIso = new Date().toISOString();
  const db = await openLocalDb();
  const tx = db.transaction([STORE_SERIES_TOTALS, STORE_OUTBOX], 'readwrite');
  const seriesStore = tx.objectStore(STORE_SERIES_TOTALS);
  const outboxStore = tx.objectStore(STORE_OUTBOX);

  for (const item of seriesTotals) {
    if (!item || !item.seriesName) continue;
    const syncKey = getSeriesSyncKey(item);
    seriesStore.put({ ...item, syncKey, updatedAt: item.updatedAt || nowIso });
    if (enqueue) {
      outboxStore.put({
        entityKey: `series_total:${syncKey}`,
        entityType: 'series_total',
        entityId: syncKey,
        operation: 'UPSERT',
        payload: item,
        updatedAt: nowIso,
        label: `Series Total: ${item.seriesName}`,
      });
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return getOutboxMutations();
}

export async function getOutboxMutations(): Promise<SyncMutation[]> {
  try {
    const db = await openLocalDb();
    const tx = db.transaction([STORE_OUTBOX], 'readonly');
    const all = await getAllFromStore<SyncMutation>(tx.objectStore(STORE_OUTBOX));
    return all.sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')));
  } catch {
    return [];
  }
}

/**
 * Resets lastSyncAt to null so the next sync performs a full pull from PostgreSQL
 * (while preserving any pending outbox mutations).
 */
export async function clearLastSyncTimestamp(): Promise<void> {
  const db = await openLocalDb();
  const tx = db.transaction([STORE_META], 'readwrite');
  tx.objectStore(STORE_META).put({ key: 'lastSyncAt', value: null });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Sets the lastSyncAt metadata timestamp in IndexedDB.
 */
export async function setLastSyncTimestamp(isoTimestamp: string): Promise<void> {
  const db = await openLocalDb();
  const tx = db.transaction([STORE_META], 'readwrite');
  tx.objectStore(STORE_META).put({ key: 'lastSyncAt', value: isoTimestamp });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Transactionally merges the server's POST /api/sync response into IndexedDB,
 * removes synced mutations from sync_outbox, and returns the updated local snapshot.
 */
export async function applyServerSyncResponse(
  response: SyncServerResponse,
  pushedMutations: SyncMutation[]
): Promise<LocalDbSnapshot> {
  const db = await openLocalDb();
  const tx = db.transaction(
    [STORE_COMICS, STORE_BOXES, STORE_SERIES_TOTALS, STORE_OUTBOX, STORE_META],
    'readwrite'
  );

  const comicStore = tx.objectStore(STORE_COMICS);
  const boxStore = tx.objectStore(STORE_BOXES);
  const seriesStore = tx.objectStore(STORE_SERIES_TOTALS);
  const outboxStore = tx.objectStore(STORE_OUTBOX);
  const metaStore = tx.objectStore(STORE_META);

  // 1. Remove pushed mutations from outbox if they haven't been modified again while in flight
  const currentOutbox = await getAllFromStore<SyncMutation>(outboxStore);
  const currentOutboxMap = new Map<string, SyncMutation>(currentOutbox.map((m) => [m.entityKey, m]));

  for (const pushed of pushedMutations) {
    const live = currentOutboxMap.get(pushed.entityKey);
    if (live && live.updatedAt === pushed.updatedAt) {
      outboxStore.delete(pushed.entityKey);
      currentOutboxMap.delete(pushed.entityKey);
    }
  }

  // 2. Apply server snapshot or delta
  if (response.isFullSync) {
    comicStore.clear();
    for (const c of response.comics || []) {
      if (!c || !c.id || isSampleComicId(c.id)) continue;
      // Do not overwrite an item that still has a newer in-flight mutation in outbox
      const pendingMut = currentOutboxMap.get(`comic:${c.id}`);
      if (pendingMut) {
        if (pendingMut.operation === 'UPSERT' && pendingMut.payload) {
          comicStore.put(pendingMut.payload);
        }
      } else {
        const clean = c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c;
        comicStore.put(clean);
      }
    }

    if (Array.isArray(response.boxes) && response.boxes.length > 0) {
      boxStore.clear();
      for (const b of response.boxes) {
        const pendingBox = currentOutboxMap.get(`box:${b.id}`);
        if (pendingBox) {
          if (pendingBox.operation === 'UPSERT' && pendingBox.payload) {
            boxStore.put(pendingBox.payload);
          }
        } else {
          boxStore.put(b);
        }
      }
    }

    if (Array.isArray(response.seriesTotals) && response.seriesTotals.length > 0) {
      seriesStore.clear();
      for (const s of response.seriesTotals) {
        if (!s || !s.seriesName) continue;
        seriesStore.put({ ...s, syncKey: getSeriesSyncKey(s) });
      }
    }
  } else {
    // Delta Sync
    for (const delComicId of response.deletedComicIds || []) {
      if (!currentOutboxMap.has(`comic:${delComicId}`)) {
        comicStore.delete(delComicId);
      }
    }

    for (const c of response.comics || []) {
      if (!c || !c.id || isSampleComicId(c.id)) continue;
      const pendingMut = currentOutboxMap.get(`comic:${c.id}`);
      if (!pendingMut) {
        const clean = c.readingStatus === 'Wishlist' ? { ...c, copiesOwned: 0 } : c;
        comicStore.put(clean);
      }
    }

    for (const delBoxId of response.deletedBoxIds || []) {
      if (!currentOutboxMap.has(`box:${delBoxId}`)) {
        boxStore.delete(delBoxId);
      }
    }

    for (const b of response.boxes || []) {
      if (!currentOutboxMap.has(`box:${b.id}`)) {
        boxStore.put(b);
      }
    }

    for (const s of response.seriesTotals || []) {
      if (!s || !s.seriesName) continue;
      seriesStore.put({ ...s, syncKey: getSeriesSyncKey(s) });
    }
  }

  // 3. Persist sync metadata
  if (response.serverTimestamp) {
    metaStore.put({ key: 'lastSyncAt', value: response.serverTimestamp });
  }
  if (Array.isArray(response.creatorTypes) && response.creatorTypes.length > 0) {
    metaStore.put({ key: 'creatorTypes', value: response.creatorTypes });
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return readSnapshotFromDb(db);
}
