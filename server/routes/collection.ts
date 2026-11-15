import express from 'express';
import { ComicBook } from '../../src/types';
import { isSampleComicId } from '../../src/data/initialData';
import { sortComicsByBoxOrder } from '../../src/utils/comicSortUtils';
import { getFirestoreDb } from '../firebaseAdmin.ts';
import { optionalAuth } from '../middleware/auth.ts';
import { quotaMiddleware } from '../middleware/quota.ts';

export const collectionRouter = express.Router();

// Apply auth and quota middleware to all collection routes
collectionRouter.use(optionalAuth);
collectionRouter.use(quotaMiddleware);

function isPlaceholderCover(cover?: unknown): boolean {
  if (!cover || typeof cover !== 'string') return true;
  const trimmed = cover.trim().toLowerCase();
  return (
    !trimmed ||
    trimmed === 'noimage.webp' ||
    trimmed === 'noimage.png' ||
    trimmed.includes('noimage') ||
    trimmed.includes('1h-E8ndmQeDajXJaZKqRW9JU9PjXZH0jX')
  );
}

function parseOptionalNumber(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? num : undefined;
}

function resolveCoverUrls(data: Record<string, any>) {
  const coverImageOverride = data.coverImageOverride || null;
  const masterCoverImage = data.masterCoverImage || null;
  const rawCover = data.coverImage || null;

  const effectiveCover =
    coverImageOverride || masterCoverImage || rawCover || 'NoImage.webp';

  const coverImageFullOverride = data.coverImageFullOverride || null;
  const masterCoverImageFull = data.masterCoverImageFull || null;
  const rawCoverFull = data.coverImageFull || null;

  const effectiveCoverFull =
    coverImageFullOverride || masterCoverImageFull || rawCoverFull || null;

  return {
    coverImage: effectiveCover,
    coverImageFull: effectiveCoverFull,
    coverImageOverride,
    coverImageFullOverride,
    masterCoverImage,
    masterCoverImageFull,
  };
}

function docToComic(data: Record<string, any>): ComicBook {
  const covers = resolveCoverUrls(data);
  const readingStatus =
    data.readingStatus === 'Wishlist' || data.reading_status === 'Wishlist'
      ? 'Wishlist'
      : data.readingStatus || data.reading_status || 'Unread';

  const isWishlist = readingStatus === 'Wishlist';
  const currentBoxId = isWishlist
    ? -1
    : data.currentBoxId !== undefined && data.currentBoxId !== null
      ? Number(data.currentBoxId)
      : data.current_box_id !== undefined && data.current_box_id !== null
        ? Number(data.current_box_id)
        : 0;

  const copiesOwned = isWishlist
    ? 0
    : Math.max(1, Number(data.copiesOwned ?? data.copies_owned ?? 1) || 1);

  return {
    id: String(data.id),
    title: String(data.title || 'Untitled Comic'),
    issueNumber: String(data.issueNumber ?? data.issue_number ?? '1'),
    volume: data.volume ? String(data.volume) : undefined,
    seriesName: data.seriesName || data.series_name || undefined,
    fullTitle: data.fullTitle || data.full_title || undefined,
    event: data.event || undefined,
    copiesOwned,
    publisher: String(data.publisher || 'Unknown Publisher'),
    publicationYear: parseOptionalNumber(data.publicationYear ?? data.publication_year) ?? 1900,
    publicationMonth: data.publicationMonth ?? data.publication_month ? String(data.publicationMonth ?? data.publication_month) : undefined,
    publicationDate: data.publicationDate || data.publication_date || undefined,
    genre: data.genre || '',
    writer: data.writer || '',
    artist: data.artist || '',
    coverArtist: data.coverArtist || data.cover_artist || undefined,
    creatorContributions: Array.isArray(data.creatorContributions ?? data.creator_contributions)
      ? (data.creatorContributions ?? data.creator_contributions)
      : [],
    characterAppearances: Array.isArray(data.characterAppearances ?? data.character_appearances)
      ? (data.characterAppearances ?? data.character_appearances)
      : [],
    coverImage: covers.coverImage,
    coverImageFull: covers.coverImageFull || undefined,
    coverImageOverride: covers.coverImageOverride || undefined,
    coverImageFullOverride: covers.coverImageFullOverride || undefined,
    masterCoverImage: covers.masterCoverImage || undefined,
    masterCoverImageFull: covers.masterCoverImageFull || undefined,
    format: data.format || 'Single Issue',
    sizeThickness: Math.max(0.1, parseOptionalNumber(data.sizeThickness ?? data.size_thickness) || 1.0),
    currentBoxId,
    proposedBoxId: parseOptionalNumber(data.proposedBoxId ?? data.proposed_box_id),
    readingStatus,
    readCount: Math.max(0, parseOptionalNumber(data.readCount ?? data.read_count) || 0),
    userRating: parseOptionalNumber(data.userRating ?? data.user_rating),
    condition: data.condition || (isWishlist ? 'Near Mint' : 'Good'),
    purchasePrice: parseOptionalNumber(data.purchasePrice ?? data.purchase_price),
    estimatedValue: parseOptionalNumber(data.estimatedValue ?? data.estimated_value),
    previousEstimatedValue: parseOptionalNumber(data.previousEstimatedValue ?? data.previous_estimated_value),
    valueUpdatedAt: data.valueUpdatedAt || data.value_updated_at || undefined,
    valueSource: data.valueSource || data.value_source || undefined,
    lockEstimatedValue: Boolean(data.lockEstimatedValue ?? data.lock_estimated_value),
    notes: data.notes || undefined,
    tags: Array.isArray(data.tags) ? data.tags : [],
    inCollection: data.inCollection !== undefined ? Boolean(data.inCollection) : true,
    createdAt: data.createdAt || data.created_at || new Date().toISOString(),
    updatedAt: data.updatedAt || data.updated_at || new Date().toISOString(),
  };
}

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile, role, VIP tier, storage usage, and daily sync quota.
 */
collectionRouter.get('/api/auth/me', async (req, res) => {
  try {
    const user = req.user!;
    const db = getFirestoreDb();
    const userDocSnap = await db.collection('users').doc(user.uid).get();
    const data = userDocSnap.exists ? userDocSnap.data() || {} : {};

    const todayDate = new Date().toISOString().slice(0, 10);
    const dailyUsage =
      data.dailyUsage?.usageDate === todayDate
        ? data.dailyUsage
        : { usageDate: todayDate, readsCount: 0, writesCount: 0 };

    res.json({
      uid: user.uid,
      email: user.email,
      displayName: data.displayName || user.displayName || 'Creator Admin',
      avatarUrl: data.avatarUrl || null,
      role: user.role,
      vipTier: user.vipTier,
      isBannedFromProposals: Boolean(user.isBannedFromProposals),
      storageBytesUsed: Number(data.storageBytesUsed || 0),
      dailyUsage,
    });
  } catch {
    res.json({
      uid: req.user?.uid || 'admin-primary',
      email: req.user?.email || '',
      displayName: req.user?.displayName || 'Creator Admin',
      avatarUrl: null,
      role: req.user?.role || 'admin',
      vipTier: req.user?.vipTier || 'archivist',
      isBannedFromProposals: false,
      storageBytesUsed: 0,
      dailyUsage: { usageDate: new Date().toISOString().slice(0, 10), readsCount: 0, writesCount: 0 },
    });
  }
});

/**
 * GET /api/collection
 * Fetches user-scoped collection, boxes, and shared series totals from Cloud Firestore.
 */
collectionRouter.get('/api/collection', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);

    const [comicsSnap, boxesSnap, seriesTotalsSnap] = await Promise.all([
      userRef.collection('comics').get(),
      userRef.collection('storage_boxes').get(),
      db.collection('series_issue_totals').get(),
    ]);

    const comics = comicsSnap.docs
      .map((d) => docToComic(d.data()))
      .filter((c) => !isSampleComicId(String(c.id)));

    const serverTimestamp = new Date().toISOString();

    const boxes = boxesSnap.docs
      .map((d) => d.data())
      .filter((box: any) => Number(box.id) > 0)
      .map((box: any) => ({
        id: Number(box.id),
        name: String(box.name),
        location: String(box.location),
        maxCapacity: Number(box.maxCapacity || box.max_capacity || 150),
        colorTag: String(box.colorTag || box.color_tag || '#6366f1'),
        notes: box.notes ?? undefined,
        updatedAt: box.updatedAt || box.updated_at || serverTimestamp,
      }))
      .sort((a, b) => a.id - b.id);

    const seriesTotals = seriesTotalsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        publisher: data.publisher,
        seriesName: data.seriesName || data.series_name,
        volume: data.volume || '',
        issueCount: Number(data.issueCount || data.issue_count || 0),
        updatedAt: data.updatedAt || data.updated_at || serverTimestamp,
      };
    });

    // Derive creator types from creator contributions
    const typeSet = new Set<string>();
    for (const c of comics) {
      if (Array.isArray(c.creatorContributions)) {
        for (const contrib of c.creatorContributions) {
          if (contrib?.roleName) typeSet.add(contrib.roleName.trim());
        }
      }
    }
    const creatorTypes = Array.from(typeSet).sort();

    res.json({
      comics,
      boxes,
      seriesTotals,
      creatorTypes,
      serverTimestamp,
    });
  } catch (error: any) {
    console.error('Firestore collection read failed:', error.message);
    res.status(500).json({ error: `Unable to load collection from Firestore: ${error.message}` });
  }
});

/**
 * PUT /api/comics/:id
 * Saves or updates a single user-owned comic in Cloud Firestore.
 */
collectionRouter.put('/api/comics/:id', async (req, res) => {
  if (req.body?.id !== req.params.id) {
    return res.status(400).json({ error: 'Comic ID must match the request path.' });
  }
  if (isSampleComicId(req.params.id)) {
    return res.sendStatus(204);
  }

  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const comicDocRef = userRef.collection('comics').doc(req.params.id);
    const tombstoneRef = userRef.collection('deleted_records').doc(`comic_${req.params.id}`);

    const payload = {
      ...req.body,
      id: req.params.id,
      updatedAt: new Date().toISOString(),
    };

    const batch = db.batch();
    batch.set(comicDocRef, payload, { merge: true });
    batch.delete(tombstoneRef); // Clear deletion tombstone on upsert
    await batch.commit();

    res.sendStatus(204);
  } catch (error: any) {
    console.error('Firestore comic save failed:', error.message);
    res.status(500).json({ error: `Unable to save comic: ${error.message}` });
  }
});

/**
 * DELETE /api/comics/:id
 * Deletes a comic from user's collection and records a deletion tombstone.
 */
collectionRouter.delete('/api/comics/:id', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const comicDocRef = userRef.collection('comics').doc(req.params.id);
    const tombstoneRef = userRef.collection('deleted_records').doc(`comic_${req.params.id}`);

    const batch = db.batch();
    batch.delete(comicDocRef);
    batch.set(tombstoneRef, {
      entityType: 'comic',
      entityId: req.params.id,
      deletedAt: new Date().toISOString(),
    });
    await batch.commit();

    res.sendStatus(204);
  } catch (error: any) {
    console.error('Firestore comic deletion failed:', error.message);
    res.status(500).json({ error: 'Unable to delete comic.' });
  }
});

/**
 * PUT /api/comics
 * Bulk replaces comics in user's collection.
 */
collectionRouter.put('/api/comics', async (req, res) => {
  if (!Array.isArray(req.body?.comics)) {
    return res.status(400).json({ error: 'comics must be an array.' });
  }

  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const validComics = req.body.comics.filter((comic: { id: string }) => !isSampleComicId(comic?.id));
    const nowIso = new Date().toISOString();

    const existingSnap = await userRef.collection('comics').get();
    const newIdSet = new Set(validComics.map((c: any) => String(c.id)));

    // Batch operations in chunks of 200
    for (let offset = 0; offset < validComics.length; offset += 200) {
      const chunk = validComics.slice(offset, offset + 200);
      const batch = db.batch();
      for (const comic of chunk) {
        const docRef = userRef.collection('comics').doc(comic.id);
        const tombRef = userRef.collection('deleted_records').doc(`comic_${comic.id}`);
        batch.set(docRef, { ...comic, updatedAt: nowIso }, { merge: true });
        batch.delete(tombRef);
      }
      await batch.commit();
    }

    // Delete records not in new array & create tombstones
    const toDelete = existingSnap.docs.filter((d) => !newIdSet.has(d.id));
    for (let offset = 0; offset < toDelete.length; offset += 200) {
      const chunk = toDelete.slice(offset, offset + 200);
      const batch = db.batch();
      for (const doc of chunk) {
        batch.delete(doc.ref);
        const tombRef = userRef.collection('deleted_records').doc(`comic_${doc.id}`);
        batch.set(tombRef, {
          entityType: 'comic',
          entityId: doc.id,
          deletedAt: nowIso,
        });
      }
      await batch.commit();
    }

    res.sendStatus(204);
  } catch (error: any) {
    console.error('Firestore comic replacement failed:', error.message);
    res.status(500).json({ error: `Unable to replace comics: ${error.message}` });
  }
});

/**
 * POST /api/comics/batch
 * Batch saves comics to user's collection.
 */
collectionRouter.post('/api/comics/batch', async (req, res) => {
  if (!Array.isArray(req.body?.comics)) {
    return res.status(400).json({ error: 'comics must be an array.' });
  }

  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const validComics = req.body.comics.filter((comic: { id: string }) => !isSampleComicId(comic?.id));
    const nowIso = new Date().toISOString();

    for (let offset = 0; offset < validComics.length; offset += 200) {
      const chunk = validComics.slice(offset, offset + 200);
      const batch = db.batch();
      for (const comic of chunk) {
        const docRef = userRef.collection('comics').doc(comic.id);
        const tombRef = userRef.collection('deleted_records').doc(`comic_${comic.id}`);
        batch.set(docRef, { ...comic, updatedAt: nowIso }, { merge: true });
        batch.delete(tombRef);
      }
      await batch.commit();
    }

    res.status(200).json({ success: true, count: validComics.length });
  } catch (error: any) {
    console.error('Firestore comic batch insert failed:', error.message);
    res.status(500).json({ error: `Unable to batch save comics: ${error.message}` });
  }
});

/**
 * PUT /api/boxes/:id
 * Saves or updates a single storage box for the user.
 */
collectionRouter.put('/api/boxes/:id', async (req, res) => {
  const boxId = Number(req.params.id);
  if (boxId !== req.body?.id) {
    return res.status(400).json({ error: 'Box ID must match the request path.' });
  }

  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const boxRef = userRef.collection('storage_boxes').doc(String(boxId));
    const tombRef = userRef.collection('deleted_records').doc(`box_${boxId}`);

    const payload = {
      ...req.body,
      id: boxId,
      updatedAt: new Date().toISOString(),
    };

    const batch = db.batch();
    batch.set(boxRef, payload, { merge: true });
    batch.delete(tombRef);
    await batch.commit();

    res.sendStatus(204);
  } catch (error: any) {
    console.error('Firestore box save failed:', error.message);
    res.status(500).json({ error: `Unable to save box: ${error.message}` });
  }
});

/**
 * PUT /api/boxes
 * Bulk replaces storage boxes for the user.
 */
collectionRouter.put('/api/boxes', async (req, res) => {
  if (!Array.isArray(req.body?.boxes)) {
    return res.status(400).json({ error: 'boxes must be an array.' });
  }

  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const nowIso = new Date().toISOString();
    const newBoxIdSet = new Set(req.body.boxes.map((b: any) => String(b.id)));

    const existingSnap = await userRef.collection('storage_boxes').get();
    const batch = db.batch();

    for (const box of req.body.boxes) {
      const boxRef = userRef.collection('storage_boxes').doc(String(box.id));
      const tombRef = userRef.collection('deleted_records').doc(`box_${box.id}`);
      batch.set(boxRef, { ...box, updatedAt: nowIso }, { merge: true });
      batch.delete(tombRef);
    }

    // Delete boxes not in new list (preserving Box -1 and Box 0)
    for (const doc of existingSnap.docs) {
      const bId = Number(doc.id);
      if (bId > 0 && !newBoxIdSet.has(doc.id)) {
        batch.delete(doc.ref);
        const tombRef = userRef.collection('deleted_records').doc(`box_${doc.id}`);
        batch.set(tombRef, {
          entityType: 'box',
          entityId: doc.id,
          deletedAt: nowIso,
        });
      }
    }

    await batch.commit();
    res.sendStatus(204);
  } catch (error: any) {
    console.error('Firestore box replacement failed:', error.message);
    res.status(500).json({ error: `Unable to replace boxes: ${error.message}` });
  }
});

/**
 * DELETE /api/boxes/:id
 * Deletes a storage box and records a tombstone.
 */
collectionRouter.delete('/api/boxes/:id', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const boxId = String(req.params.id);
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);
    const boxRef = userRef.collection('storage_boxes').doc(boxId);
    const tombRef = userRef.collection('deleted_records').doc(`box_${boxId}`);

    const batch = db.batch();
    batch.delete(boxRef);
    batch.set(tombRef, {
      entityType: 'box',
      entityId: boxId,
      deletedAt: new Date().toISOString(),
    });
    await batch.commit();

    res.sendStatus(204);
  } catch (error: any) {
    console.error('Firestore box deletion failed:', error.message);
    res.status(500).json({ error: 'Unable to delete box.' });
  }
});

/**
 * POST /api/sync
 * Bidirectional delta sync between client IndexedDB and Cloud Firestore.
 */
collectionRouter.post('/api/sync', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);

    const rawLastSyncAt = req.body?.lastSyncAt;
    const lastSyncDate =
      typeof rawLastSyncAt === 'string' && rawLastSyncAt.trim() && !Number.isNaN(Date.parse(rawLastSyncAt))
        ? new Date(rawLastSyncAt)
        : null;

    const mutations: Array<{
      entityKey?: string;
      entityType: 'comic' | 'box' | 'series_total';
      entityId: string;
      operation: 'UPSERT' | 'DELETE';
      payload?: Record<string, any>;
      baseStatus?: string;
      updatedAt?: string;
    }> = Array.isArray(req.body?.mutations) ? req.body.mutations : [];

    let pushedCount = 0;
    const nowIso = new Date().toISOString();

    // 1. Process Client Pushes
    for (const mut of mutations) {
      if (!mut || !mut.entityType || !mut.entityId) continue;
      const clientUpdatedMs =
        mut.updatedAt && !Number.isNaN(Date.parse(mut.updatedAt))
          ? new Date(mut.updatedAt).getTime()
          : Date.now();

      if (mut.entityType === 'box') {
        const boxId = String(mut.entityId);
        const boxRef = userRef.collection('storage_boxes').doc(boxId);
        const tombRef = userRef.collection('deleted_records').doc(`box_${boxId}`);

        if (mut.operation === 'UPSERT' && mut.payload) {
          const batch = db.batch();
          batch.set(boxRef, { ...mut.payload, id: Number(boxId), updatedAt: nowIso }, { merge: true });
          batch.delete(tombRef);
          await batch.commit();
          pushedCount++;
        } else if (mut.operation === 'DELETE') {
          const batch = db.batch();
          batch.delete(boxRef);
          batch.set(tombRef, { entityType: 'box', entityId: boxId, deletedAt: nowIso });
          await batch.commit();
          pushedCount++;
        }
      } else if (mut.entityType === 'series_total' && mut.operation === 'UPSERT' && mut.payload) {
        const item = mut.payload;
        const seriesName = String(item.seriesName || '').trim();
        const volume = String(item.volume ?? '').trim();
        if (seriesName) {
          const key = mut.entityId || `${seriesName}__vol_${volume}`;
          const seriesRef = db.collection('series_issue_totals').doc(key);
          await seriesRef.set(
            {
              publisher: item.publisher || 'Unknown Publisher',
              seriesName,
              volume,
              issueCount: Math.max(0, parseInt(String(item.issueCount), 10) || 0),
              updatedAt: nowIso,
            },
            { merge: true }
          );
          pushedCount++;
        }
      } else if (mut.entityType === 'comic') {
        const comicId = String(mut.entityId);
        if (isSampleComicId(comicId)) continue;
        const comicRef = userRef.collection('comics').doc(comicId);
        const tombRef = userRef.collection('deleted_records').doc(`comic_${comicId}`);

        if (mut.operation === 'UPSERT' && mut.payload) {
          const incoming: Record<string, any> = { ...mut.payload, id: comicId };
          const existingDoc = await comicRef.get();

          let comicToSave: Record<string, any> | null = incoming;

          if (existingDoc.exists) {
            const serverData = existingDoc.data() || {};
            const serverUpdatedMs = serverData.updatedAt
              ? new Date(serverData.updatedAt).getTime()
              : 0;

            const isWishlistPurchase =
              (mut.baseStatus === 'Wishlist' || serverData.readingStatus === 'Wishlist') &&
              incoming.readingStatus !== 'Wishlist' &&
              Number(incoming.copiesOwned ?? 1) > 0;

            if (clientUpdatedMs >= serverUpdatedMs) {
              comicToSave = {
                ...serverData,
                ...incoming,
                coverImage:
                  !isPlaceholderCover(incoming.coverImage)
                    ? incoming.coverImage
                    : serverData.coverImage || incoming.coverImage || 'NoImage.webp',
                coverImageFull: incoming.coverImageFull || serverData.coverImageFull,
              };
            } else {
              comicToSave = {
                ...serverData,
                ...(isWishlistPurchase
                  ? {
                      readingStatus: incoming.readingStatus,
                      copiesOwned: Math.max(1, Number(incoming.copiesOwned) || 1),
                      currentBoxId: incoming.currentBoxId ?? serverData.currentBoxId,
                      purchasePrice: incoming.purchasePrice ?? serverData.purchasePrice,
                      condition: incoming.condition || serverData.condition,
                    }
                  : {}),
                coverImage:
                  !isPlaceholderCover(incoming.coverImage) && isPlaceholderCover(serverData.coverImage)
                    ? incoming.coverImage
                    : serverData.coverImage,
                coverImageFull: serverData.coverImageFull || incoming.coverImageFull,
                notes: incoming.notes && !serverData.notes ? incoming.notes : serverData.notes,
              };
            }
          }

          if (comicToSave) {
            if (comicToSave.readingStatus === 'Wishlist') {
              comicToSave.copiesOwned = 0;
              comicToSave.currentBoxId = -1;
            }
            comicToSave.updatedAt = nowIso;

            const batch = db.batch();
            batch.set(comicRef, comicToSave, { merge: true });
            batch.delete(tombRef);
            await batch.commit();
            pushedCount++;
          }
        } else if (mut.operation === 'DELETE') {
          const batch = db.batch();
          batch.delete(comicRef);
          batch.set(tombRef, { entityType: 'comic', entityId: comicId, deletedAt: nowIso });
          await batch.commit();
          pushedCount++;
        }
      }
    }

    // 2. Server Pull Phase
    const [allComicsSnap, allBoxesSnap, seriesTotalsSnap, deletedSnap] = await Promise.all([
      userRef.collection('comics').get(),
      userRef.collection('storage_boxes').get(),
      db.collection('series_issue_totals').get(),
      userRef.collection('deleted_records').get(),
    ]);

    const isFullSync = !lastSyncDate;
    const lastSyncMs = lastSyncDate ? lastSyncDate.getTime() : 0;

    const serverTimestamp = nowIso;

    let pulledComics = allComicsSnap.docs
      .map((d) => docToComic(d.data()))
      .filter((c) => !isSampleComicId(String(c.id)));

    if (!isFullSync) {
      pulledComics = pulledComics.filter((c) => new Date(c.updatedAt).getTime() >= lastSyncMs);
    }

    let pulledBoxes = allBoxesSnap.docs
      .map((d) => d.data())
      .filter((b: any) => Number(b.id) > 0)
      .map((box: any) => ({
        id: Number(box.id),
        name: String(box.name),
        location: String(box.location),
        maxCapacity: Number(box.maxCapacity || box.max_capacity || 150),
        colorTag: String(box.colorTag || box.color_tag || '#6366f1'),
        notes: box.notes ?? undefined,
        updatedAt: box.updatedAt || box.updated_at || serverTimestamp,
      }));

    if (!isFullSync) {
      pulledBoxes = pulledBoxes.filter((b) => new Date(b.updatedAt).getTime() >= lastSyncMs);
    }

    const seriesTotals = seriesTotalsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        publisher: data.publisher,
        seriesName: data.seriesName || data.series_name,
        volume: data.volume || '',
        issueCount: Number(data.issueCount || data.issue_count || 0),
        updatedAt: data.updatedAt || data.updated_at || serverTimestamp,
      };
    });

    const deletedComicIds: string[] = [];
    const deletedBoxIds: number[] = [];

    if (!isFullSync) {
      for (const d of deletedSnap.docs) {
        const data = d.data();
        const delMs = new Date(data.deletedAt).getTime();
        if (delMs >= lastSyncMs) {
          if (data.entityType === 'comic') {
            deletedComicIds.push(String(data.entityId));
          } else if (data.entityType === 'box') {
            deletedBoxIds.push(Number(data.entityId));
          }
        }
      }
    }

    const typeSet = new Set<string>();
    for (const c of pulledComics) {
      if (Array.isArray(c.creatorContributions)) {
        for (const contrib of c.creatorContributions) {
          if (contrib?.roleName) typeSet.add(contrib.roleName.trim());
        }
      }
    }
    const creatorTypes = Array.from(typeSet).sort();

    res.json({
      serverTimestamp,
      isFullSync,
      pushedCount,
      comics: pulledComics,
      boxes: pulledBoxes,
      seriesTotals,
      creatorTypes,
      deletedComicIds,
      deletedBoxIds,
    });
  } catch (error: any) {
    console.error('Firestore bidirectional sync failed:', error.message);
    res.status(500).json({ error: `Unable to synchronize collection: ${error.message}` });
  }
});

/**
 * GET /api/boxes/:id/comics
 */
collectionRouter.get('/api/boxes/:id/comics', async (req, res) => {
  try {
    const boxId = Number(req.params.id);
    if (!Number.isInteger(boxId) || boxId < 0) {
      return res.status(400).json({ error: 'Box ID must be a non-negative integer.' });
    }

    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const userRef = db.collection('users').doc(uid);

    const [boxDoc, comicsSnap] = await Promise.all([
      userRef.collection('storage_boxes').doc(String(boxId)).get(),
      userRef.collection('comics').where('currentBoxId', '==', boxId).get(),
    ]);

    const boxName = boxDoc.exists ? boxDoc.data()?.name || `Box #${boxId}` : `Box #${boxId}`;
    const rawComics = comicsSnap.docs.map((d) => docToComic(d.data()));
    const comics = sortComicsByBoxOrder(rawComics);

    res.json({
      box: {
        id: boxId,
        name: boxName,
      },
      comics,
      count: comics.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: `Unable to fetch comics for box: ${error.message}` });
  }
});

/**
 * GET /api/series-totals
 */
collectionRouter.get('/api/series-totals', async (_req, res) => {
  try {
    const db = getFirestoreDb();
    const snap = await db.collection('series_issue_totals').get();
    const seriesTotals = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        publisher: data.publisher,
        seriesName: data.seriesName || data.series_name,
        volume: data.volume || '',
        issueCount: Number(data.issueCount || data.issue_count || 0),
        updatedAt: data.updatedAt || data.updated_at || new Date().toISOString(),
      };
    });
    res.json(seriesTotals);
  } catch (error: any) {
    res.status(500).json({ error: `Unable to load series totals: ${error.message}` });
  }
});

/**
 * POST /api/series-totals
 */
collectionRouter.post('/api/series-totals', async (req, res) => {
  try {
    const { seriesTotals = [] } = req.body;
    if (!Array.isArray(seriesTotals)) {
      return res.status(400).json({ error: 'seriesTotals must be an array.' });
    }

    const db = getFirestoreDb();
    const nowIso = new Date().toISOString();
    const batch = db.batch();
    let upserted = 0;

    for (const item of seriesTotals) {
      const seriesName = String(item.seriesName || '').trim();
      const volume = String(item.volume ?? '').trim();
      if (!seriesName) continue;
      const key = `${seriesName}__vol_${volume}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const docRef = db.collection('series_issue_totals').doc(key);
      batch.set(
        docRef,
        {
          publisher: item.publisher || 'Unknown Publisher',
          seriesName,
          volume,
          issueCount: Math.max(0, parseInt(item.issueCount, 10) || 0),
          updatedAt: nowIso,
        },
        { merge: true }
      );
      upserted++;
    }

    await batch.commit();
    res.json({ success: true, count: upserted });
  } catch (error: any) {
    res.status(500).json({ error: `Unable to save series totals: ${error.message}` });
  }
});

/**
 * GET /api/creator-types
 */
collectionRouter.get('/api/creator-types', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const snap = await db.collection('users').doc(uid).collection('comics').get();
    const typeSet = new Set<string>();

    for (const d of snap.docs) {
      const data = d.data();
      if (Array.isArray(data.creatorContributions)) {
        for (const contrib of data.creatorContributions) {
          if (contrib?.roleName) typeSet.add(contrib.roleName.trim());
        }
      }
    }

    res.json({ creatorTypes: Array.from(typeSet).sort() });
  } catch (error: any) {
    res.status(500).json({ error: `Unable to load creator types: ${error.message}` });
  }
});

/**
 * GET /api/creators
 */
collectionRouter.get('/api/creators', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const snap = await db.collection('users').doc(uid).collection('comics').get();
    const creatorMap = new Map<string, { creatorName: string; issueCount: number; roles: Set<string>; series: Set<string> }>();

    for (const d of snap.docs) {
      const c = d.data();
      if (Array.isArray(c.creatorContributions)) {
        for (const contrib of c.creatorContributions) {
          const name = contrib?.creatorName ? String(contrib.creatorName).trim() : '';
          if (!name) continue;
          if (!creatorMap.has(name)) {
            creatorMap.set(name, { creatorName: name, issueCount: 0, roles: new Set(), series: new Set() });
          }
          const entry = creatorMap.get(name)!;
          entry.issueCount++;
          if (contrib.roleName) entry.roles.add(contrib.roleName);
          if (c.seriesName) entry.series.add(c.seriesName);
        }
      }
    }

    const creators = Array.from(creatorMap.values()).map((cr, idx) => ({
      id: idx + 1,
      fullName: cr.creatorName,
      issueCount: cr.issueCount,
      series: Array.from(cr.series),
      roles: Array.from(cr.roles).map((r) => ({ roleName: r })),
    }));

    res.json({ success: true, creators });
  } catch (error: any) {
    res.status(500).json({ error: `Failed to load creators: ${error.message}` });
  }
});

/**
 * GET /api/reports/creators
 */
collectionRouter.get('/api/reports/creators', async (req, res) => {
  try {
    const uid = req.user!.uid;
    const db = getFirestoreDb();
    const snap = await db.collection('users').doc(uid).collection('comics').get();
    const creatorMap = new Map<string, { creatorName: string; issueCount: number; roleList: Set<string> }>();

    for (const d of snap.docs) {
      const c = d.data();
      if (Array.isArray(c.creatorContributions)) {
        for (const contrib of c.creatorContributions) {
          const name = contrib?.creatorName ? String(contrib.creatorName).trim() : '';
          if (!name) continue;
          if (!creatorMap.has(name)) {
            creatorMap.set(name, { creatorName: name, issueCount: 0, roleList: new Set() });
          }
          const entry = creatorMap.get(name)!;
          entry.issueCount++;
          if (contrib.roleName) entry.roleList.add(contrib.roleName);
        }
      }
    }

    const topCreators = Array.from(creatorMap.values())
      .map((cr) => ({
        creatorName: cr.creatorName,
        issueCount: cr.issueCount,
        roleList: Array.from(cr.roleList),
      }))
      .sort((a, b) => b.issueCount - a.issueCount)
      .slice(0, 50);

    res.json({
      success: true,
      topCreators,
      multiRoleCreators: [],
      roleDistribution: [],
      characterStats: [],
      summary: { totalCreators: creatorMap.size },
    });
  } catch (error: any) {
    res.status(500).json({ error: `Failed to load creator reports: ${error.message}` });
  }
});
