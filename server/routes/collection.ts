import express from 'express';
import { ComicBook } from '../../src/types';
import { isSampleComicId } from '../../src/data/initialData';
import { sortComicsByBoxOrder } from '../../src/utils/comicSortUtils';
import { getFirestoreDb, isFirestoreConfigured } from '../firebaseAdmin.ts';
import { optionalAuth } from '../middleware/auth.ts';
import { quotaMiddleware } from '../middleware/quota.ts';
import {
  pool,
  databaseErrorMessage,
  comicColumns,
  comicValues,
  rowToComic,
  comicUpsertSql,
  upsertComicsBatch,
  recordDeletionTombstones,
  clearDeletionTombstones,
} from '../db';

export const collectionRouter = express.Router();

// Apply auth and quota middleware to all collection routes
collectionRouter.use(optionalAuth);
collectionRouter.use(quotaMiddleware);

const PG_CREATOR_TYPES_SQL = `
  SELECT DISTINCT type_name FROM (
    SELECT type_name FROM creator_types WHERE type_name IS NOT NULL AND TRIM(type_name) != ''
    UNION
    SELECT creator_type AS type_name FROM title_contributors WHERE creator_type IS NOT NULL AND TRIM(creator_type) != ''
  ) all_types
  ORDER BY type_name ASC
`;

function ensurePostgresPool(res: express.Response): boolean {
  if (!pool) {
    res
      .status(503)
      .json({ error: 'DATABASE_URL is not configured. Add it to .env.local and restart the server.' });
    return false;
  }
  return true;
}

function mapPgBoxRow(box: Record<string, any>, fallbackTimestamp: string) {
  return {
    id: Number(box.id),
    name: box.name,
    location: box.location,
    maxCapacity: Number(box.max_capacity),
    colorTag: box.color_tag,
    notes: box.notes ?? undefined,
    updatedAt:
      box.updated_at instanceof Date
        ? box.updated_at.toISOString()
        : String(box.updated_at || fallbackTimestamp),
  };
}

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
  const user = req.user!;
  const todayDate = new Date().toISOString().slice(0, 10);
  const fallbackProfile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || 'Creator Admin',
    avatarUrl: null,
    role: user.role,
    vipTier: user.vipTier,
    isBannedFromProposals: Boolean(user.isBannedFromProposals),
    storageBytesUsed: 0,
    dailyUsage: { usageDate: todayDate, readsCount: 0, writesCount: 0 },
  };

  if (!isFirestoreConfigured()) {
    return res.json(fallbackProfile);
  }

  try {
    const db = getFirestoreDb();
    const userDocSnap = await db.collection('users').doc(user.uid).get();
    const data = userDocSnap.exists ? userDocSnap.data() || {} : {};

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
    res.json(fallbackProfile);
  }
});

/**
 * GET /api/collection
 * Fetches user-scoped collection, boxes, and shared series totals from Cloud Firestore (or PostgreSQL fallback).
 */
collectionRouter.get('/api/collection', async (req, res) => {
  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    try {
      const [comics, boxes, seriesTotals, creatorTypesResult, timeRes] = await Promise.all([
        pool!.query('SELECT * FROM comic_books ORDER BY created_at DESC, title ASC'),
        pool!.query('SELECT id, name, location, max_capacity, color_tag, notes, updated_at FROM storage_boxes WHERE id > 0 ORDER BY id'),
        pool!.query('SELECT id, publisher, series_name AS "seriesName", volume, issue_count AS "issueCount", updated_at AS "updatedAt" FROM series_issue_totals ORDER BY series_name ASC'),
        pool!.query(PG_CREATOR_TYPES_SQL),
        pool!.query('SELECT NOW() AS server_time'),
      ]);
      const serverTimestamp =
        timeRes.rows[0]?.server_time instanceof Date
          ? timeRes.rows[0].server_time.toISOString()
          : new Date().toISOString();

      return res.json({
        comics: comics.rows.map(rowToComic).filter((c) => !isSampleComicId(String(c.id))),
        boxes: boxes.rows.map((box) => mapPgBoxRow(box, serverTimestamp)),
        seriesTotals: seriesTotals.rows,
        creatorTypes: creatorTypesResult.rows.map((r) => r.type_name),
        serverTimestamp,
      });
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL collection read failed:', detail);
      return res.status(500).json({ error: `Unable to load collection from PostgreSQL: ${detail}` });
    }
  }

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

  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    try {
      await pool!.query(comicUpsertSql, comicValues(req.body));
      await clearDeletionTombstones(pool!, 'comic', [req.params.id]);
      return res.sendStatus(204);
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL comic save failed:', detail);
      return res.status(500).json({ error: `Unable to save comic: ${detail}` });
    }
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
  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    try {
      await pool!.query('DELETE FROM comic_books WHERE id = $1', [req.params.id]);
      await recordDeletionTombstones(pool!, 'comic', [req.params.id]);
      return res.sendStatus(204);
    } catch (error) {
      console.error('PostgreSQL comic deletion failed:', error);
      return res.status(500).json({ error: 'Unable to delete comic.' });
    }
  }

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

  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    const validComics = req.body.comics.filter((comic: { id: string }) => !isSampleComicId(comic?.id));
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      const ids = validComics.map((comic: { id: string }) => comic.id);
      const deletedRes = await client.query(
        ids.length
          ? 'DELETE FROM comic_books WHERE NOT (id = ANY($1::text[])) RETURNING id'
          : 'DELETE FROM comic_books RETURNING id',
        ids.length ? [ids] : []
      );
      if (deletedRes.rows.length > 0) {
        await recordDeletionTombstones(
          client,
          'comic',
          deletedRes.rows.map((r) => r.id)
        );
      }
      await upsertComicsBatch(client, validComics);
      await client.query('COMMIT');
      return res.sendStatus(204);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL comic replacement failed:', detail);
      return res.status(500).json({ error: `Unable to replace comics: ${detail}` });
    } finally {
      client.release();
    }
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

  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    const validComics = req.body.comics.filter((comic: { id: string }) => !isSampleComicId(comic?.id));
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      await upsertComicsBatch(client, validComics);
      await client.query('COMMIT');
      return res.status(200).json({ success: true, count: validComics.length });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL comic batch insert failed:', detail);
      return res.status(500).json({ error: `Unable to batch save comics: ${detail}` });
    } finally {
      client.release();
    }
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

  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    try {
      const box = req.body;
      await pool!.query(
        `INSERT INTO storage_boxes (id, name, location, max_capacity, color_tag, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location,
         max_capacity = EXCLUDED.max_capacity, color_tag = EXCLUDED.color_tag, notes = EXCLUDED.notes, updated_at = NOW()`,
        [box.id, box.name, box.location, box.maxCapacity, box.colorTag, box.notes ?? null]
      );
      await clearDeletionTombstones(pool!, 'box', [box.id]);
      return res.sendStatus(204);
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL box save failed:', detail);
      return res.status(500).json({ error: `Unable to save box: ${detail}` });
    }
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

  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      for (const box of req.body.boxes) {
        await client.query(
          `INSERT INTO storage_boxes (id, name, location, max_capacity, color_tag, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location,
           max_capacity = EXCLUDED.max_capacity, color_tag = EXCLUDED.color_tag, notes = EXCLUDED.notes, updated_at = NOW()`,
          [box.id, box.name, box.location, box.maxCapacity, box.colorTag, box.notes ?? null]
        );
      }
      const ids = req.body.boxes.map((box: { id: number }) => box.id);
      if (ids.length > 0) {
        await clearDeletionTombstones(client, 'box', ids);
      }
      const deletedRes = await client.query(
        ids.length
          ? 'DELETE FROM storage_boxes WHERE id > 0 AND NOT (id = ANY($1::integer[])) RETURNING id'
          : 'DELETE FROM storage_boxes WHERE id > 0 RETURNING id',
        ids.length ? [ids] : []
      );
      if (deletedRes.rows.length > 0) {
        await recordDeletionTombstones(
          client,
          'box',
          deletedRes.rows.map((r) => r.id)
        );
      }
      await client.query('COMMIT');
      return res.sendStatus(204);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL box replacement failed:', detail);
      return res.status(500).json({ error: `Unable to replace boxes: ${detail}` });
    } finally {
      client.release();
    }
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
  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    try {
      await pool!.query('DELETE FROM storage_boxes WHERE id = $1', [req.params.id]);
      await recordDeletionTombstones(pool!, 'box', [req.params.id]);
      return res.sendStatus(204);
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL box deletion failed:', detail);
      return res.status(500).json({ error: `Unable to delete box: ${detail}` });
    }
  }

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
 * Bidirectional delta sync between client IndexedDB and Cloud Firestore (or PostgreSQL fallback).
 */
collectionRouter.post('/api/sync', async (req, res) => {
  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    const client = await pool!.connect();
    try {
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

      await client.query('BEGIN');

      const sortedMutations = [...mutations].sort((a, b) => {
        const order = (m: typeof a) => {
          if (m.entityType === 'box' && m.operation === 'UPSERT') return 1;
          if (m.entityType === 'series_total') return 2;
          if (m.entityType === 'comic' && m.operation === 'UPSERT') return 3;
          if (m.entityType === 'comic' && m.operation === 'DELETE') return 4;
          if (m.entityType === 'box' && m.operation === 'DELETE') return 5;
          return 6;
        };
        return order(a) - order(b);
      });

      const existingBoxesRes = await client.query('SELECT id, updated_at FROM storage_boxes');
      const validBoxIds = new Set<number>(existingBoxesRes.rows.map((r) => Number(r.id)));
      validBoxIds.add(0);
      validBoxIds.add(-1);
      const boxUpdatedAtMap = new Map<number, number>(
        existingBoxesRes.rows.map((r) => [Number(r.id), r.updated_at ? new Date(r.updated_at).getTime() : 0])
      );

      let pushedCount = 0;

      for (const mut of sortedMutations) {
        if (!mut || !mut.entityType || !mut.entityId) continue;
        const clientUpdatedMs =
          mut.updatedAt && !Number.isNaN(Date.parse(mut.updatedAt))
            ? new Date(mut.updatedAt).getTime()
            : Date.now();

        if (mut.entityType === 'box') {
          const boxId = Number(mut.entityId);
          if (!Number.isInteger(boxId) || boxId <= 0) continue;

          if (mut.operation === 'UPSERT' && mut.payload) {
            const box = mut.payload;
            const serverBoxMs = boxUpdatedAtMap.get(boxId) ?? 0;
            if (!validBoxIds.has(boxId) || clientUpdatedMs >= serverBoxMs) {
              await client.query(
                `INSERT INTO storage_boxes (id, name, location, max_capacity, color_tag, notes, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())
                 ON CONFLICT (id) DO UPDATE SET
                   name = EXCLUDED.name,
                   location = EXCLUDED.location,
                   max_capacity = EXCLUDED.max_capacity,
                   color_tag = EXCLUDED.color_tag,
                   notes = EXCLUDED.notes,
                   updated_at = NOW()`,
                [
                  boxId,
                  String(box.name || `Box ${boxId}`),
                  String(box.location || 'Storage Shelf'),
                  Math.min(150, Math.max(10, Number(box.maxCapacity) || 150)),
                  String(box.colorTag || '#3B82F6'),
                  box.notes ?? null,
                ]
              );
              await clearDeletionTombstones(client, 'box', [boxId]);
              validBoxIds.add(boxId);
              boxUpdatedAtMap.set(boxId, Date.now());
              pushedCount++;
            }
          } else if (mut.operation === 'DELETE') {
            const serverBoxMs = boxUpdatedAtMap.get(boxId) ?? 0;
            if (clientUpdatedMs >= serverBoxMs) {
              await client.query('DELETE FROM storage_boxes WHERE id = $1', [boxId]);
              await recordDeletionTombstones(client, 'box', [boxId]);
              validBoxIds.delete(boxId);
              pushedCount++;
            }
          }
        } else if (mut.entityType === 'series_total' && mut.operation === 'UPSERT' && mut.payload) {
          const item = mut.payload;
          const publisher = String(item.publisher || 'Unknown Publisher').trim();
          const seriesName = String(item.seriesName || '').trim();
          const volume = String(item.volume ?? '').trim();
          const issueCount = Math.max(0, parseInt(String(item.issueCount), 10) || 0);
          if (seriesName) {
            await client.query(
              `INSERT INTO series_issue_totals (publisher, series_name, volume, issue_count, updated_at)
               VALUES ($1, $2, $3, $4, NOW())
               ON CONFLICT (series_name, volume) DO UPDATE SET
                 publisher = EXCLUDED.publisher,
                 issue_count = EXCLUDED.issue_count,
                 updated_at = NOW()`,
              [publisher, seriesName, volume, issueCount]
            );
            pushedCount++;
          }
        } else if (mut.entityType === 'comic') {
          const comicId = String(mut.entityId);
          if (isSampleComicId(comicId)) continue;

          if (mut.operation === 'UPSERT' && mut.payload) {
            const incoming: Record<string, any> = { ...mut.payload, id: comicId };
            const existingRes = await client.query('SELECT * FROM comic_books WHERE id = $1', [comicId]);

            let comicToSave: Record<string, unknown> | null = null;

            if (existingRes.rows.length === 0) {
              const tombRes = await client.query(
                "SELECT deleted_at FROM deleted_records WHERE entity_type = 'comic' AND entity_id = $1",
                [comicId]
              );
              const deletedMs =
                tombRes.rows.length > 0 && tombRes.rows[0].deleted_at
                  ? new Date(tombRes.rows[0].deleted_at).getTime()
                  : 0;
              const isPurchaseOrNew =
                mut.baseStatus === 'Wishlist' ||
                incoming.readingStatus !== 'Wishlist' ||
                clientUpdatedMs >= deletedMs;

              if (isPurchaseOrNew) {
                comicToSave = incoming;
              }
            } else {
              const serverRow = existingRes.rows[0];
              const serverComic = rowToComic(serverRow);
              const serverUpdatedMs = serverRow.updated_at ? new Date(serverRow.updated_at).getTime() : 0;

              const isWishlistPurchase =
                (mut.baseStatus === 'Wishlist' || serverComic.readingStatus === 'Wishlist') &&
                incoming.readingStatus !== 'Wishlist' &&
                Number(incoming.copiesOwned ?? 1) > 0;

              if (clientUpdatedMs >= serverUpdatedMs) {
                comicToSave = {
                  ...serverComic,
                  ...incoming,
                  coverImage:
                    !isPlaceholderCover(incoming.coverImage)
                      ? incoming.coverImage
                      : !isPlaceholderCover(serverComic.coverImage)
                      ? serverComic.coverImage
                      : incoming.coverImage || 'NoImage.webp',
                  coverImageFull:
                    incoming.coverImageFull || (serverComic.coverImageFull as string | undefined),
                };
              } else {
                comicToSave = {
                  ...serverComic,
                  ...(isWishlistPurchase
                    ? {
                        readingStatus: incoming.readingStatus,
                        copiesOwned: Math.max(1, Number(incoming.copiesOwned) || 1),
                        currentBoxId: incoming.currentBoxId ?? serverComic.currentBoxId,
                        purchasePrice: incoming.purchasePrice ?? serverComic.purchasePrice,
                        condition: incoming.condition || serverComic.condition,
                      }
                    : {}),
                  coverImage:
                    !isPlaceholderCover(incoming.coverImage) && isPlaceholderCover(serverComic.coverImage)
                      ? incoming.coverImage
                      : serverComic.coverImage,
                  coverImageFull:
                    (serverComic.coverImageFull as string | undefined) || incoming.coverImageFull,
                  notes:
                    incoming.notes && !serverComic.notes ? incoming.notes : serverComic.notes,
                };
              }
            }

            if (comicToSave) {
              if (comicToSave.readingStatus === 'Wishlist') {
                comicToSave.copiesOwned = 0;
                comicToSave.currentBoxId = -1;
              }
              const targetBoxId = Number(comicToSave.currentBoxId);
              if (!validBoxIds.has(targetBoxId)) {
                const firstValidBox = validBoxIds.values().next().value;
                comicToSave.currentBoxId = firstValidBox ?? null;
              }
              await client.query(comicUpsertSql, comicValues(comicToSave));
              await clearDeletionTombstones(client, 'comic', [comicId]);
              pushedCount++;
            }
          } else if (mut.operation === 'DELETE') {
            const existingRes = await client.query('SELECT updated_at FROM comic_books WHERE id = $1', [comicId]);
            const serverUpdatedMs =
              existingRes.rows.length > 0 && existingRes.rows[0].updated_at
                ? new Date(existingRes.rows[0].updated_at).getTime()
                : 0;
            if (existingRes.rows.length === 0 || clientUpdatedMs >= serverUpdatedMs) {
              await client.query('DELETE FROM comic_books WHERE id = $1', [comicId]);
              await recordDeletionTombstones(client, 'comic', [comicId]);
              pushedCount++;
            }
          }
        }
      }

      const timeRes = await client.query('SELECT NOW() AS server_time');
      const serverTimestamp =
        timeRes.rows[0]?.server_time instanceof Date
          ? timeRes.rows[0].server_time.toISOString()
          : new Date().toISOString();

      const creatorTypesResult = await client.query(PG_CREATOR_TYPES_SQL);
      const creatorTypes = creatorTypesResult.rows.map((r) => r.type_name);

      if (!lastSyncDate) {
        const comicsRes = await client.query('SELECT * FROM comic_books ORDER BY created_at DESC, title ASC');
        const boxesRes = await client.query('SELECT id, name, location, max_capacity, color_tag, notes, updated_at FROM storage_boxes WHERE id > 0 ORDER BY id');
        const seriesTotalsRes = await client.query('SELECT id, publisher, series_name AS "seriesName", volume, issue_count AS "issueCount", updated_at AS "updatedAt" FROM series_issue_totals ORDER BY series_name ASC');

        await client.query('COMMIT');

        return res.json({
          serverTimestamp,
          isFullSync: true,
          pushedCount,
          comics: comicsRes.rows.map(rowToComic).filter((c) => !isSampleComicId(String(c.id))),
          boxes: boxesRes.rows.map((box) => mapPgBoxRow(box, serverTimestamp)),
          seriesTotals: seriesTotalsRes.rows,
          creatorTypes,
          deletedComicIds: [],
          deletedBoxIds: [],
        });
      } else {
        const lastSyncIso = lastSyncDate.toISOString();
        const comicsRes = await client.query('SELECT * FROM comic_books WHERE updated_at >= $1 ORDER BY created_at DESC, title ASC', [lastSyncIso]);
        const boxesRes = await client.query('SELECT id, name, location, max_capacity, color_tag, notes, updated_at FROM storage_boxes WHERE id > 0 AND updated_at >= $1 ORDER BY id', [lastSyncIso]);
        const seriesTotalsRes = await client.query('SELECT id, publisher, series_name AS "seriesName", volume, issue_count AS "issueCount", updated_at AS "updatedAt" FROM series_issue_totals WHERE updated_at >= $1 ORDER BY series_name ASC', [lastSyncIso]);
        const deletedRes = await client.query('SELECT entity_type, entity_id FROM deleted_records WHERE deleted_at >= $1', [lastSyncIso]);

        await client.query('COMMIT');

        const deletedComicIds: string[] = [];
        const deletedBoxIds: number[] = [];
        for (const row of deletedRes.rows) {
          if (row.entity_type === 'comic') {
            deletedComicIds.push(String(row.entity_id));
          } else if (row.entity_type === 'box') {
            const bId = Number(row.entity_id);
            if (Number.isInteger(bId)) deletedBoxIds.push(bId);
          }
        }

        return res.json({
          serverTimestamp,
          isFullSync: false,
          pushedCount,
          comics: comicsRes.rows.map(rowToComic).filter((c) => !isSampleComicId(String(c.id))),
          boxes: boxesRes.rows.map((box) => mapPgBoxRow(box, serverTimestamp)),
          seriesTotals: seriesTotalsRes.rows,
          creatorTypes,
          deletedComicIds,
          deletedBoxIds,
        });
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL bidirectional sync failed:', detail);
      return res.status(500).json({ error: `Unable to synchronize collection: ${detail}` });
    } finally {
      client.release();
    }
  }

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
  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    try {
      const boxId = Number(req.params.id);
      if (!Number.isInteger(boxId) || boxId < 0) {
        return res.status(400).json({ error: 'Box ID must be a non-negative integer.' });
      }

      const boxResult = await pool!.query('SELECT id, name FROM storage_boxes WHERE id = $1', [boxId]);
      if (boxResult.rows.length === 0) {
        return res.status(404).json({ error: `Box ${boxId} not found.` });
      }

      const comicsResult = await pool!.query(
        `SELECT ${comicColumns.join(', ')}
         FROM comic_books
         WHERE current_box_id = $1
         ORDER BY title ASC, issue_number ASC, created_at ASC, id ASC`,
        [boxId]
      );

      const rawComics = comicsResult.rows.map(rowToComic) as unknown as ComicBook[];
      const comics = sortComicsByBoxOrder(rawComics);
      return res.json({
        box: {
          id: boxResult.rows[0].id,
          name: boxResult.rows[0].name,
        },
        comics,
        count: comics.length,
      });
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL box comics fetch failed:', detail);
      return res.status(500).json({ error: `Unable to fetch comics for box: ${detail}` });
    }
  }

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
  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    try {
      const result = await pool!.query(
        'SELECT id, publisher, series_name AS "seriesName", volume, issue_count AS "issueCount", updated_at AS "updatedAt" FROM series_issue_totals ORDER BY series_name ASC'
      );
      return res.json(result.rows);
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL series totals fetch failed:', detail);
      return res.status(500).json({ error: `Unable to load series totals: ${detail}` });
    }
  }

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
  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    const client = await pool!.connect();
    try {
      const { seriesTotals = [] } = req.body;
      if (!Array.isArray(seriesTotals)) {
        return res.status(400).json({ error: 'seriesTotals must be an array.' });
      }
      await client.query('BEGIN');
      let upserted = 0;
      for (const item of seriesTotals) {
        const publisher = String(item.publisher || 'Unknown Publisher').trim();
        const seriesName = String(item.seriesName || '').trim();
        const volume = String(item.volume ?? '').trim();
        const issueCount = Math.max(0, parseInt(item.issueCount, 10) || 0);
        if (!seriesName) continue;
        await client.query(
          `INSERT INTO series_issue_totals (publisher, series_name, volume, issue_count, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (series_name, volume) DO UPDATE SET
             publisher = EXCLUDED.publisher,
             issue_count = EXCLUDED.issue_count,
             updated_at = NOW()`,
          [publisher, seriesName, volume, issueCount]
        );
        upserted++;
      }
      await client.query('COMMIT');
      return res.json({ success: true, count: upserted });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL series totals save failed:', detail);
      return res.status(500).json({ error: `Unable to save series totals: ${detail}` });
    } finally {
      client.release();
    }
  }

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
  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    try {
      const result = await pool!.query(PG_CREATOR_TYPES_SQL);
      return res.json({ creatorTypes: result.rows.map((r) => r.type_name) });
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL creator-types read failed:', detail);
      return res.status(500).json({ error: `Unable to load creator types: ${detail}` });
    }
  }

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
  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    try {
      const result = await pool!.query(`
        SELECT 
          c.id,
          c.first_name as "firstName",
          c.last_name as "lastName",
          c.full_name as "fullName",
          COUNT(DISTINCT tc.full_title) as "issueCount",
          ARRAY_AGG(DISTINCT tc.series_name) FILTER (WHERE tc.series_name IS NOT NULL) as "series",
          COALESCE(
            json_agg(DISTINCT jsonb_build_object('roleName', tc.creator_type)) FILTER (WHERE tc.creator_type IS NOT NULL),
            '[]'::json
          ) as "roles",
          bool_or(tc.creator_type ILIKE '%pencill%' OR tc.creator_type ILIKE '%artist%') AND 
          bool_or(tc.creator_type ILIKE '%writer%' OR tc.creator_type ILIKE '%story%' OR tc.creator_type ILIKE '%script%') as "isMultiRole"
        FROM creators c
        LEFT JOIN title_contributors tc ON LOWER(TRIM(tc.creator_full_name)) = LOWER(TRIM(c.full_name))
        GROUP BY c.id, c.first_name, c.last_name, c.full_name
        ORDER BY "issueCount" DESC, c.full_name ASC
      `);

      return res.json({ success: true, creators: result.rows });
    } catch (error) {
      const detail = databaseErrorMessage(error);
      return res.status(500).json({ error: `Failed to load creators: ${detail}` });
    }
  }

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
  if (!isFirestoreConfigured()) {
    if (!ensurePostgresPool(res)) return;
    try {
      const topCreators = await pool!.query(`
        SELECT 
          tc.creator_full_name as "creatorName",
          COUNT(DISTINCT tc.full_title) as "issueCount",
          ARRAY_AGG(DISTINCT tc.creator_type) as "roleList",
          bool_or(tc.creator_type ILIKE '%pencill%' OR tc.creator_type ILIKE '%artist%') AND 
          bool_or(tc.creator_type ILIKE '%writer%' OR tc.creator_type ILIKE '%story%' OR tc.creator_type ILIKE '%script%') as "isMultiRole"
        FROM title_contributors tc
        GROUP BY tc.creator_full_name
        ORDER BY "issueCount" DESC
        LIMIT 50
      `);

      const multiRoleCreators = await pool!.query(`
        SELECT 
          tc.creator_full_name as "creatorName",
          COUNT(DISTINCT tc.full_title) as "issueCount",
          ARRAY_AGG(DISTINCT tc.creator_type) as "roleList",
          COUNT(DISTINCT CASE WHEN tc.creator_type ILIKE '%pencill%' OR tc.creator_type ILIKE '%artist%' THEN tc.full_title END) as "artIssues",
          COUNT(DISTINCT CASE WHEN tc.creator_type ILIKE '%writer%' OR tc.creator_type ILIKE '%story%' OR tc.creator_type ILIKE '%script%' THEN tc.full_title END) as "storyIssues"
        FROM title_contributors tc
        GROUP BY tc.creator_full_name
        HAVING bool_or(tc.creator_type ILIKE '%pencill%' OR tc.creator_type ILIKE '%artist%')
           AND bool_or(tc.creator_type ILIKE '%writer%' OR tc.creator_type ILIKE '%story%' OR tc.creator_type ILIKE '%script%')
        ORDER BY "issueCount" DESC
        LIMIT 50
      `);

      const roleDistribution = await pool!.query(`
        SELECT 
          creator_type as "roleName",
          COUNT(*) as "contributionsCount",
          COUNT(DISTINCT full_title) as "issuesCount",
          COUNT(DISTINCT creator_full_name) as "creatorsCount"
        FROM title_contributors
        GROUP BY creator_type
        ORDER BY "contributionsCount" DESC
      `);

      const characterStats = await pool!.query(`
        SELECT 
          character_name as "characterName",
          COUNT(*) as "totalAppearances",
          COUNT(DISTINCT full_title) as "issuesCount",
          COUNT(*) FILTER (WHERE appearance_type ILIKE '%main%') as "mainCount",
          COUNT(*) FILTER (WHERE appearance_type ILIKE '%supporting%') as "supportingCount",
          COUNT(*) FILTER (WHERE appearance_type ILIKE '%cameo%') as "cameoCount"
        FROM title_character_appearances
        GROUP BY character_name
        ORDER BY "totalAppearances" DESC
        LIMIT 50
      `);

      const counts = await pool!.query(`
        SELECT 
          (SELECT COUNT(*) FROM creators) as "totalCreators",
          (SELECT COUNT(*) FROM creator_types) as "totalCreatorTypes",
          (SELECT COUNT(*) FROM title_contributors) as "totalContributions",
          (SELECT COUNT(*) FROM title_character_appearances) as "totalAppearances",
          (SELECT COUNT(DISTINCT comic_id) FROM title_contributors WHERE comic_id IS NOT NULL) as "comicsWithContributors",
          (SELECT COUNT(DISTINCT comic_id) FROM title_character_appearances WHERE comic_id IS NOT NULL) as "comicsWithCharacters"
      `);

      return res.json({
        success: true,
        topCreators: topCreators.rows,
        multiRoleCreators: multiRoleCreators.rows,
        roleDistribution: roleDistribution.rows,
        characterStats: characterStats.rows,
        summary: counts.rows[0],
      });
    } catch (error) {
      const detail = databaseErrorMessage(error);
      return res.status(500).json({ error: `Failed to load creator reports: ${detail}` });
    }
  }

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
