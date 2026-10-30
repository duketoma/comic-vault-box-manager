import express from 'express';
import { ComicBook } from '../../src/types';
import { isSampleComicId } from '../../src/data/initialData';
import { sortComicsByTitleAndIssue } from '../../src/utils/comicSortUtils';
import {
  pool,
  requireDatabase,
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

function isPlaceholderCover(cover?: unknown): boolean {
  if (!cover || typeof cover !== 'string') return true;
  const trimmed = cover.trim().toLowerCase();
  return !trimmed || trimmed === 'noimage.webp' || trimmed === 'noimage.png' || trimmed.includes('noimage');
}

collectionRouter.get('/api/collection', requireDatabase, async (_req, res) => {
  try {
    const [comics, boxes, seriesTotals, creatorTypesResult, timeRes] = await Promise.all([
      pool!.query('SELECT * FROM comic_books ORDER BY created_at DESC, title ASC'),
      pool!.query('SELECT id, name, location, max_capacity, color_tag, notes, updated_at FROM storage_boxes WHERE id > 0 ORDER BY id'),
      pool!.query('SELECT id, publisher, series_name AS "seriesName", volume, issue_count AS "issueCount", updated_at AS "updatedAt" FROM series_issue_totals ORDER BY series_name ASC'),
      pool!.query(`
        SELECT DISTINCT type_name FROM (
          SELECT type_name FROM creator_types WHERE type_name IS NOT NULL AND TRIM(type_name) != ''
          UNION
          SELECT creator_type AS type_name FROM title_contributors WHERE creator_type IS NOT NULL AND TRIM(creator_type) != ''
        ) all_types
        ORDER BY type_name ASC
      `),
      pool!.query('SELECT NOW() AS server_time'),
    ]);
    const serverTimestamp =
      timeRes.rows[0]?.server_time instanceof Date
        ? timeRes.rows[0].server_time.toISOString()
        : new Date().toISOString();

    res.json({
      comics: comics.rows.map(rowToComic).filter((c) => !isSampleComicId(String(c.id))),
      boxes: boxes.rows.map((box) => ({
        id: box.id,
        name: box.name,
        location: box.location,
        maxCapacity: Number(box.max_capacity),
        colorTag: box.color_tag,
        notes: box.notes ?? undefined,
        updatedAt: box.updated_at instanceof Date ? box.updated_at.toISOString() : String(box.updated_at || serverTimestamp),
      })),
      seriesTotals: seriesTotals.rows,
      creatorTypes: creatorTypesResult.rows.map((r) => r.type_name),
      serverTimestamp,
    });
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL collection read failed:', detail);
    res.status(500).json({ error: `Unable to load collection from PostgreSQL: ${detail}` });
  }
});

collectionRouter.put('/api/comics/:id', requireDatabase, async (req, res) => {
  if (req.body?.id !== req.params.id) {
    return res.status(400).json({ error: 'Comic ID must match the request path.' });
  }
  if (isSampleComicId(req.params.id)) {
    return res.sendStatus(204);
  }
  try {
    await pool!.query(comicUpsertSql, comicValues(req.body));
    await clearDeletionTombstones(pool!, 'comic', [req.params.id]);
    res.sendStatus(204);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL comic save failed:', detail);
    res.status(500).json({ error: `Unable to save comic: ${detail}` });
  }
});

collectionRouter.delete('/api/comics/:id', requireDatabase, async (req, res) => {
  try {
    await pool!.query('DELETE FROM comic_books WHERE id = $1', [req.params.id]);
    await recordDeletionTombstones(pool!, 'comic', [req.params.id]);
    res.sendStatus(204);
  } catch (error) {
    console.error('PostgreSQL comic deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete comic.' });
  }
});

collectionRouter.put('/api/comics', requireDatabase, async (req, res) => {
  if (!Array.isArray(req.body?.comics)) {
    return res.status(400).json({ error: 'comics must be an array.' });
  }
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
    res.sendStatus(204);
  } catch (error) {
    await client.query('ROLLBACK');
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL comic replacement failed:', detail);
    res.status(500).json({ error: `Unable to replace comics: ${detail}` });
  } finally {
    client.release();
  }
});

collectionRouter.post('/api/comics/batch', requireDatabase, async (req, res) => {
  if (!Array.isArray(req.body?.comics)) {
    return res.status(400).json({ error: 'comics must be an array.' });
  }
  const validComics = req.body.comics.filter((comic: { id: string }) => !isSampleComicId(comic?.id));
  const client = await pool!.connect();
  try {
    await client.query('BEGIN');
    await upsertComicsBatch(client, validComics);
    await client.query('COMMIT');
    res.status(200).json({ success: true, count: validComics.length });
  } catch (error) {
    await client.query('ROLLBACK');
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL comic batch insert failed:', detail);
    res.status(500).json({ error: `Unable to batch save comics: ${detail}` });
  } finally {
    client.release();
  }
});

collectionRouter.put('/api/boxes/:id', requireDatabase, async (req, res) => {
  if (Number(req.params.id) !== req.body?.id) {
    return res.status(400).json({ error: 'Box ID must match the request path.' });
  }
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
    res.sendStatus(204);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL box save failed:', detail);
    res.status(500).json({ error: `Unable to save box: ${detail}` });
  }
});

collectionRouter.put('/api/boxes', requireDatabase, async (req, res) => {
  if (!Array.isArray(req.body?.boxes)) {
    return res.status(400).json({ error: 'boxes must be an array.' });
  }
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
        ? 'DELETE FROM storage_boxes WHERE NOT (id = ANY($1::integer[])) RETURNING id'
        : 'DELETE FROM storage_boxes RETURNING id',
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
    res.sendStatus(204);
  } catch (error) {
    await client.query('ROLLBACK');
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL box replacement failed:', detail);
    res.status(500).json({ error: `Unable to replace boxes: ${detail}` });
  } finally {
    client.release();
  }
});

collectionRouter.delete('/api/boxes/:id', requireDatabase, async (req, res) => {
  try {
    await pool!.query('DELETE FROM storage_boxes WHERE id = $1', [req.params.id]);
    await recordDeletionTombstones(pool!, 'box', [req.params.id]);
    res.sendStatus(204);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL box deletion failed:', detail);
    res.status(500).json({ error: `Unable to delete box: ${detail}` });
  }
});

/**
 * Bidirectional Delta Sync Endpoint (`POST /api/sync`)
 * 1. Pushes queued offline mobile mutations (boxes, comics, series_totals) using Last-Write-Wins
 *    and Safe Wishlist->Owned Purchase merging.
 * 2. Pulls server-side deltas (or full snapshot when lastSyncAt is null) since lastSyncAt.
 */
collectionRouter.post('/api/sync', requireDatabase, async (req, res) => {
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

    // Sort mutations so box upserts run before comic upserts (foreign key safety)
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

    // Load valid box IDs so comic current_box_id references won't violate FK if a box was deleted
    const existingBoxesRes = await client.query('SELECT id, updated_at FROM storage_boxes');
    const validBoxIds = new Set<number>(existingBoxesRes.rows.map((r) => Number(r.id)));
    const boxUpdatedAtMap = new Map<number, number>(
      existingBoxesRes.rows.map((r) => [Number(r.id), r.updated_at ? new Date(r.updated_at).getTime() : 0])
    );

    let pushedCount = 0;

    for (const mut of sortedMutations) {
      if (!mut || !mut.entityType || !mut.entityId) continue;
      const clientUpdatedMs = mut.updatedAt && !Number.isNaN(Date.parse(mut.updatedAt))
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
            // Check if deleted on server more recently than this client mutation
            const tombRes = await client.query(
              "SELECT deleted_at FROM deleted_records WHERE entity_type = 'comic' AND entity_id = $1",
              [comicId]
            );
            const deletedMs =
              tombRes.rows.length > 0 && tombRes.rows[0].deleted_at
                ? new Date(tombRes.rows[0].deleted_at).getTime()
                : 0;
            // Always preserve newly added comics or wishlist purchases
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
              // Mobile edit is newer (Last-Write-Wins)
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
              // PC edit is newer, but preserve Safe Wishlist Purchase & newly scanned covers from mobile
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
            }
            // Ensure currentBoxId references a valid box
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

    // Pull Phase: capture authoritative server timestamp
    const timeRes = await client.query('SELECT NOW() AS server_time');
    const serverTimestamp =
      timeRes.rows[0]?.server_time instanceof Date
        ? timeRes.rows[0].server_time.toISOString()
        : new Date().toISOString();

    const creatorTypesResult = await client.query(`
      SELECT DISTINCT type_name FROM (
        SELECT type_name FROM creator_types WHERE type_name IS NOT NULL AND TRIM(type_name) != ''
        UNION
        SELECT creator_type AS type_name FROM title_contributors WHERE creator_type IS NOT NULL AND TRIM(creator_type) != ''
      ) all_types
      ORDER BY type_name ASC
    `);
    const creatorTypes = creatorTypesResult.rows.map((r) => r.type_name);

    if (!lastSyncDate) {
      // Full Sync
      const comicsRes = await client.query('SELECT * FROM comic_books ORDER BY created_at DESC, title ASC');
      const boxesRes = await client.query('SELECT id, name, location, max_capacity, color_tag, notes, updated_at FROM storage_boxes WHERE id > 0 ORDER BY id');
      const seriesTotalsRes = await client.query('SELECT id, publisher, series_name AS "seriesName", volume, issue_count AS "issueCount", updated_at AS "updatedAt" FROM series_issue_totals ORDER BY series_name ASC');

      await client.query('COMMIT');

      return res.json({
        serverTimestamp,
        isFullSync: true,
        pushedCount,
        comics: comicsRes.rows.map(rowToComic).filter((c) => !isSampleComicId(String(c.id))),
        boxes: boxesRes.rows.map((box) => ({
          id: box.id,
          name: box.name,
          location: box.location,
          maxCapacity: Number(box.max_capacity),
          colorTag: box.color_tag,
          notes: box.notes ?? undefined,
          updatedAt: box.updated_at instanceof Date ? box.updated_at.toISOString() : String(box.updated_at || serverTimestamp),
        })),
        seriesTotals: seriesTotalsRes.rows,
        creatorTypes,
        deletedComicIds: [],
        deletedBoxIds: [],
      });
    } else {
      // Delta Sync since lastSyncDate
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
        boxes: boxesRes.rows.map((box) => ({
          id: box.id,
          name: box.name,
          location: box.location,
          maxCapacity: Number(box.max_capacity),
          colorTag: box.color_tag,
          notes: box.notes ?? undefined,
          updatedAt: box.updated_at instanceof Date ? box.updated_at.toISOString() : String(box.updated_at || serverTimestamp),
        })),
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
    res.status(500).json({ error: `Unable to synchronize collection: ${detail}` });
  } finally {
    client.release();
  }
});

collectionRouter.get('/api/boxes/:id/comics', requireDatabase, async (req, res) => {
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
    const comics = sortComicsByTitleAndIssue(rawComics);
    res.json({
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
    res.status(500).json({ error: `Unable to fetch comics for box: ${detail}` });
  }
});

collectionRouter.get('/api/series-totals', requireDatabase, async (_req, res) => {
  try {
    const result = await pool!.query(
      'SELECT id, publisher, series_name AS "seriesName", volume, issue_count AS "issueCount", updated_at AS "updatedAt" FROM series_issue_totals ORDER BY series_name ASC'
    );
    res.json(result.rows);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL series totals fetch failed:', detail);
    res.status(500).json({ error: `Unable to load series totals: ${detail}` });
  }
});

collectionRouter.get('/api/creator-types', requireDatabase, async (_req, res) => {
  try {
    const result = await pool!.query(`
      SELECT DISTINCT type_name FROM (
        SELECT type_name FROM creator_types WHERE type_name IS NOT NULL AND TRIM(type_name) != ''
        UNION
        SELECT creator_type AS type_name FROM title_contributors WHERE creator_type IS NOT NULL AND TRIM(creator_type) != ''
      ) all_types
      ORDER BY type_name ASC
    `);
    res.json({ creatorTypes: result.rows.map((r) => r.type_name) });
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL creator-types read failed:', detail);
    res.status(500).json({ error: `Unable to load creator types: ${detail}` });
  }
});

collectionRouter.post('/api/series-totals', requireDatabase, async (req, res) => {
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
    res.json({ success: true, count: upserted });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL series totals save failed:', detail);
    res.status(500).json({ error: `Unable to save series totals: ${detail}` });
  } finally {
    client.release();
  }
});

collectionRouter.get('/api/creators', requireDatabase, async (_req, res) => {
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

    res.json({ success: true, creators: result.rows });
  } catch (error) {
    const detail = databaseErrorMessage(error);
    res.status(500).json({ error: `Failed to load creators: ${detail}` });
  }
});

collectionRouter.get('/api/reports/creators', requireDatabase, async (_req, res) => {
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

    res.json({
      success: true,
      topCreators: topCreators.rows,
      multiRoleCreators: multiRoleCreators.rows,
      roleDistribution: roleDistribution.rows,
      characterStats: characterStats.rows,
      summary: counts.rows[0],
    });
  } catch (error) {
    const detail = databaseErrorMessage(error);
    res.status(500).json({ error: `Failed to load creator reports: ${detail}` });
  }
});
