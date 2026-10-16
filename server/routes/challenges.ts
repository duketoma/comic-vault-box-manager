import express from 'express';
import { Pool } from 'pg';
import { ComicBook } from '../../src/types';
import {
  filterComicsByCriteria,
  sortChallengeComics,
  formatCriteriaSummary,
  validateCriteria,
} from '../../src/utils/challengeCriteriaEngine';
import { computeChallengeMilestones, computeTBRMilestones } from '../../src/utils/challengeMilestones';
import {
  ComicMetadataSnapshot,
  ChallengeQueueItem,
  ReadingChallengeSummary,
} from '../../src/types/readingChallenge.types';
import {
  pool,
  requireDatabase,
  databaseErrorMessage,
  comicColumns,
  rowToComic,
} from '../db';

export const challengesRouter = express.Router();

async function getChallengeSummary(db: Pool, challengeId: number): Promise<ReadingChallengeSummary | null> {
  const challengeRes = await db.query('SELECT * FROM reading_challenges WHERE id = $1', [challengeId]);
  if (challengeRes.rows.length === 0) return null;
  const challenge = challengeRes.rows[0];

  const countsRes = await db.query(
    `SELECT 
      COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE status = 'Read') AS read_count,
      COUNT(*) FILTER (WHERE status = 'Skipped') AS skipped_count,
      COUNT(*) FILTER (WHERE status = 'Unread') AS unread_count
    FROM reading_challenge_items
    WHERE challenge_id = $1`,
    [challengeId]
  );

  const counts = countsRes.rows[0];
  const totalEligible = parseInt(counts.total_count, 10) || challenge.total_eligible_count || 0;
  const readCount = parseInt(counts.read_count, 10) || 0;
  const skippedCount = parseInt(counts.skipped_count, 10) || 0;
  const remainingCount = parseInt(counts.unread_count, 10) || 0;
  const resolvedCount = readCount + skippedCount;
  const progressPercent = totalEligible > 0 ? Math.round((resolvedCount / totalEligible) * 100) : 0;

  const batchSize = challenge.batch_size || 10;
  const queueRes = await db.query(
    `SELECT 
      rci.id AS challenge_item_id,
      rci.challenge_id,
      rci.comic_id,
      rci.sequence_number,
      rci.status,
      rci.added_at,
      rci.read_at,
      rci.skipped_at,
      rci.metadata_snapshot,
      cb.current_box_id AS live_box_id,
      sb.name AS box_name,
      sb.location AS box_location,
      sb.color_tag AS box_color_tag
    FROM reading_challenge_items rci
    LEFT JOIN comic_books cb ON rci.comic_id = cb.id
    LEFT JOIN storage_boxes sb ON cb.current_box_id = sb.id
    WHERE rci.challenge_id = $1 AND rci.status = 'Unread'
    ORDER BY rci.sequence_number ASC
    LIMIT $2`,
    [challengeId, batchSize]
  );

  const queue: ChallengeQueueItem[] = queueRes.rows.map((row) => ({
    challengeItemId: row.challenge_item_id,
    challengeId: row.challenge_id,
    comicId: row.comic_id,
    sequenceNumber: row.sequence_number,
    status: row.status,
    addedAt: row.added_at,
    readAt: row.read_at,
    skippedAt: row.skipped_at,
    metadata: row.metadata_snapshot,
    currentBoxId: row.live_box_id ?? row.metadata_snapshot?.currentBoxId,
    boxName: row.box_name,
    boxLocation: row.box_location,
    boxColorTag: row.box_color_tag,
  }));

  return {
    challengeId: challenge.id,
    name: challenge.name,
    status: challenge.status,
    criteriaSnapshot: challenge.criteria_snapshot,
    criteriaSummary: challenge.criteria_summary || '',
    readingOrder: challenge.reading_order || 'PublicationDate',
    sortDirection: challenge.sort_direction || 'Ascending',
    batchSize,
    createdAt: challenge.created_at,
    startedAt: challenge.started_at,
    completedAt: challenge.completed_at,
    endedAt: challenge.ended_at,
    totalEligible,
    readCount,
    skippedCount,
    resolvedCount,
    remainingCount,
    progressPercent,
    queue,
  };
}

// 1. Preview Challenge
challengesRouter.post('/api/reading-challenges/preview', requireDatabase, async (req, res) => {
  try {
    const { criteria, sortDirection = 'Ascending', limit = 20 } = req.body;
    const valResult = validateCriteria(criteria);
    if (!valResult.valid) {
      return res.status(400).json({ error: valResult.error || 'Invalid criteria' });
    }

    const comicsRes = await pool!.query(
      "SELECT * FROM comic_books WHERE in_collection = true AND (reading_status != 'Wishlist' OR reading_status IS NULL) AND (copies_owned > 0 OR copies_owned IS NULL) ORDER BY created_at DESC"
    );
    const allComics = comicsRes.rows.map(rowToComic) as unknown as ComicBook[];
    const matching = filterComicsByCriteria(allComics, criteria);
    const sorted = sortChallengeComics(matching, sortDirection);
    const summaryText = formatCriteriaSummary(criteria.root);

    res.json({
      eligibleCount: sorted.length,
      previewItems: sorted.slice(0, Math.min(limit, 50)),
      criteriaSummary: summaryText,
      warnings: sorted.length === 0 ? ['No comics currently in your collection match this criteria.'] : [],
    });
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('Preview reading challenge failed:', detail);
    res.status(500).json({ error: `Unable to preview reading challenge: ${detail}` });
  }
});

// 2. Create and Start Challenge (Atomic snapshot with batched item insertion)
challengesRouter.post('/api/reading-challenges', requireDatabase, async (req, res) => {
  const client = await pool!.connect();
  try {
    const {
      name,
      criteria,
      readingOrder = 'PublicationDate',
      sortDirection = 'Ascending',
      batchSize = 10,
      abandonCurrentActive = false,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Challenge name cannot be empty.' });
    }

    const valResult = validateCriteria(criteria);
    if (!valResult.valid) {
      return res.status(400).json({ error: valResult.error || 'Invalid criteria' });
    }

    await client.query('BEGIN');

    const activeCheck = await client.query("SELECT id, name FROM reading_challenges WHERE status = 'Active'");
    if (activeCheck.rows.length > 0) {
      if (abandonCurrentActive) {
        await client.query("UPDATE reading_challenges SET status = 'Abandoned', ended_at = NOW() WHERE status = 'Active'");
      } else {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'An active reading challenge is already in progress.',
          activeChallenge: activeCheck.rows[0],
        });
      }
    }

    const comicsRes = await client.query(
      "SELECT * FROM comic_books WHERE in_collection = true AND (reading_status != 'Wishlist' OR reading_status IS NULL) AND (copies_owned > 0 OR copies_owned IS NULL)"
    );
    const allComics = comicsRes.rows.map(rowToComic) as unknown as ComicBook[];
    const matching = filterComicsByCriteria(allComics, criteria);

    if (matching.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No comics in your collection match the selected criteria.' });
    }

    const sorted = sortChallengeComics(matching, sortDirection);
    const summaryText = formatCriteriaSummary(criteria.root);
    const validBatchSize = Math.max(1, parseInt(batchSize, 10) || 10);

    const challengeInsert = await client.query(
      `INSERT INTO reading_challenges (
        name, status, criteria_snapshot, criteria_version, reading_order, sort_direction, batch_size, total_eligible_count, criteria_summary
      ) VALUES ($1, 'Active', $2, 1, $3, $4, $5, $6, $7)
      RETURNING id`,
      [name.trim(), JSON.stringify(criteria), readingOrder, sortDirection, validBatchSize, sorted.length, summaryText]
    );

    const challengeId = challengeInsert.rows[0].id;

    // Batch insert reading_challenge_items in chunks of 250 rows
    const chunkSize = 250;
    for (let offset = 0; offset < sorted.length; offset += chunkSize) {
      const chunk = sorted.slice(offset, offset + chunkSize);
      const values: unknown[] = [];
      const rowPlaceholders: string[] = [];

      for (let i = 0; i < chunk.length; i++) {
        const comic = chunk[i];
        const seqNum = offset + i + 1;
        const snapshot: ComicMetadataSnapshot = {
          id: comic.id,
          title: comic.title,
          fullTitle: comic.fullTitle,
          seriesName: comic.seriesName,
          issueNumber: comic.issueNumber,
          volume: comic.volume,
          publisher: comic.publisher,
          publicationYear: comic.publicationYear,
          publicationMonth: comic.publicationMonth,
          publicationDate: comic.publicationDate,
          genre: comic.genre,
          event: comic.event,
          writer: comic.writer,
          artist: comic.artist,
          coverArtist: comic.coverArtist,
          creatorContributions: comic.creatorContributions,
          characterAppearances: comic.characterAppearances,
          coverImage: comic.coverImage,
          coverImageFull: comic.coverImageFull,
          format: comic.format,
          sizeThickness: comic.sizeThickness,
          currentBoxId: comic.currentBoxId,
        };

        const base = i * 4;
        rowPlaceholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'Unread', $${base + 4})`);
        values.push(challengeId, comic.id, seqNum, JSON.stringify(snapshot));
      }

      await client.query(
        `INSERT INTO reading_challenge_items (
          challenge_id, comic_id, sequence_number, status, metadata_snapshot
        ) VALUES ${rowPlaceholders.join(', ')}`,
        values
      );
    }

    await client.query('COMMIT');

    const summary = await getChallengeSummary(pool!, challengeId);
    res.status(201).json(summary);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const detail = databaseErrorMessage(error);
    console.error('Create reading challenge failed:', detail);
    res.status(500).json({ error: `Unable to create reading challenge: ${detail}` });
  } finally {
    client.release();
  }
});

// 3. Get Active Challenge
challengesRouter.get('/api/reading-challenges/active', requireDatabase, async (_req, res) => {
  try {
    const activeRes = await pool!.query("SELECT id FROM reading_challenges WHERE status = 'Active' LIMIT 1");
    if (activeRes.rows.length === 0) {
      return res.json({ challenge: null });
    }
    const summary = await getChallengeSummary(pool!, activeRes.rows[0].id);
    res.json({ challenge: summary });
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('Get active challenge failed:', detail);
    res.status(500).json({ error: `Unable to retrieve active reading challenge: ${detail}` });
  }
});

// 4. Get Past Challenge History
challengesRouter.get('/api/reading-challenges/history', requireDatabase, async (_req, res) => {
  try {
    const historyRes = await pool!.query(`
      SELECT 
        rc.id, rc.name, rc.status, rc.created_at, rc.started_at, rc.completed_at, rc.ended_at,
        rc.total_eligible_count, rc.criteria_summary,
        COUNT(rci.id) FILTER (WHERE rci.status = 'Read') AS read_count,
        COUNT(rci.id) FILTER (WHERE rci.status = 'Skipped') AS skipped_count
      FROM reading_challenges rc
      LEFT JOIN reading_challenge_items rci ON rc.id = rci.challenge_id
      WHERE rc.status IN ('Completed', 'Abandoned')
      GROUP BY rc.id
      ORDER BY rc.created_at DESC
    `);
    const history = historyRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      endedAt: row.ended_at,
      totalEligible: Number(row.total_eligible_count),
      criteriaSummary: row.criteria_summary,
      readCount: Number(row.read_count),
      skippedCount: Number(row.skipped_count),
      completionPercent:
        Number(row.total_eligible_count) > 0
          ? Math.round(
              ((Number(row.read_count) + Number(row.skipped_count)) / Number(row.total_eligible_count)) * 100
            )
          : 0,
    }));
    res.json({ history });
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('Get challenge history failed:', detail);
    res.status(500).json({ error: `Unable to retrieve challenge history: ${detail}` });
  }
});

// 5. Get Challenge Summary and Queue
challengesRouter.get('/api/reading-challenges/:id', requireDatabase, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id, 10);
    const summary = await getChallengeSummary(pool!, challengeId);
    if (!summary) return res.status(404).json({ error: 'Challenge not found' });
    res.json(summary);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('Get challenge failed:', detail);
    res.status(500).json({ error: `Unable to retrieve challenge: ${detail}` });
  }
});

// 6. Mark item Read
challengesRouter.post('/api/reading-challenges/:id/items/:itemId/read', requireDatabase, async (req, res) => {
  const client = await pool!.connect();
  try {
    const challengeId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    const notes = req.body?.notes || null;

    await client.query('BEGIN');
    const itemRes = await client.query(
      'SELECT id, comic_id, status FROM reading_challenge_items WHERE id = $1 AND challenge_id = $2 FOR UPDATE',
      [itemId, challengeId]
    );

    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Challenge item not found' });
    }

    const item = itemRes.rows[0];
    if (item.status !== 'Read') {
      await client.query("UPDATE reading_challenge_items SET status = 'Read', read_at = NOW() WHERE id = $1", [itemId]);
      if (item.comic_id) {
        await client.query(
          "UPDATE comic_books SET reading_status = 'Read', read_count = COALESCE(read_count, 0) + 1, updated_at = NOW() WHERE id = $1",
          [item.comic_id]
        );
      }
      await client.query(
        "INSERT INTO reading_history (challenge_id, challenge_item_id, comic_id, action, occurred_at, notes) VALUES ($1, $2, $3, 'Read', NOW(), $4)",
        [challengeId, itemId, item.comic_id, notes]
      );

      const checkRes = await client.query(
        "SELECT COUNT(*) FILTER (WHERE status = 'Unread') AS unread_count FROM reading_challenge_items WHERE challenge_id = $1",
        [challengeId]
      );
      if (parseInt(checkRes.rows[0].unread_count, 10) === 0) {
        await client.query(
          "UPDATE reading_challenges SET status = 'Completed', completed_at = NOW() WHERE id = $1 AND status = 'Active'",
          [challengeId]
        );
      }
    }

    await client.query('COMMIT');
    const summary = await getChallengeSummary(pool!, challengeId);
    res.json(summary);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const detail = databaseErrorMessage(error);
    console.error('Mark item read failed:', detail);
    res.status(500).json({ error: `Unable to mark item read: ${detail}` });
  } finally {
    client.release();
  }
});

// 7. Undo Read (Unread)
challengesRouter.post('/api/reading-challenges/:id/items/:itemId/unread', requireDatabase, async (req, res) => {
  const client = await pool!.connect();
  try {
    const challengeId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);

    await client.query('BEGIN');
    const itemRes = await client.query(
      'SELECT id, comic_id, status FROM reading_challenge_items WHERE id = $1 AND challenge_id = $2 FOR UPDATE',
      [itemId, challengeId]
    );

    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Challenge item not found' });
    }

    const item = itemRes.rows[0];
    if (item.status === 'Read' || item.status === 'Skipped') {
      const wasRead = item.status === 'Read';
      await client.query(
        "UPDATE reading_challenge_items SET status = 'Unread', read_at = NULL, skipped_at = NULL WHERE id = $1",
        [itemId]
      );
      if (wasRead && item.comic_id) {
        await client.query(
          "UPDATE comic_books SET reading_status = CASE WHEN COALESCE(read_count, 1) - 1 <= 0 THEN 'Unread' ELSE reading_status END, read_count = GREATEST(0, COALESCE(read_count, 1) - 1), updated_at = NOW() WHERE id = $1",
          [item.comic_id]
        );
      }
      await client.query(
        "INSERT INTO reading_history (challenge_id, challenge_item_id, comic_id, action, occurred_at) VALUES ($1, $2, $3, 'Unread', NOW())",
        [challengeId, itemId, item.comic_id]
      );

      await client.query(
        "UPDATE reading_challenges SET status = 'Active', completed_at = NULL WHERE id = $1 AND status = 'Completed'",
        [challengeId]
      );
    }

    await client.query('COMMIT');
    const summary = await getChallengeSummary(pool!, challengeId);
    res.json(summary);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const detail = databaseErrorMessage(error);
    console.error('Undo read failed:', detail);
    res.status(500).json({ error: `Unable to undo read: ${detail}` });
  } finally {
    client.release();
  }
});

// 8. Skip Item
challengesRouter.post('/api/reading-challenges/:id/items/:itemId/skip', requireDatabase, async (req, res) => {
  const client = await pool!.connect();
  try {
    const challengeId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);

    await client.query('BEGIN');
    const itemRes = await client.query(
      'SELECT id, comic_id, status FROM reading_challenge_items WHERE id = $1 AND challenge_id = $2 FOR UPDATE',
      [itemId, challengeId]
    );

    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Challenge item not found' });
    }

    const item = itemRes.rows[0];
    if (item.status === 'Unread') {
      await client.query("UPDATE reading_challenge_items SET status = 'Skipped', skipped_at = NOW() WHERE id = $1", [
        itemId,
      ]);
      await client.query(
        "INSERT INTO reading_history (challenge_id, challenge_item_id, comic_id, action, occurred_at) VALUES ($1, $2, $3, 'Skipped', NOW())",
        [challengeId, itemId, item.comic_id]
      );

      const checkRes = await client.query(
        "SELECT COUNT(*) FILTER (WHERE status = 'Unread') AS unread_count FROM reading_challenge_items WHERE challenge_id = $1",
        [challengeId]
      );
      if (parseInt(checkRes.rows[0].unread_count, 10) === 0) {
        await client.query(
          "UPDATE reading_challenges SET status = 'Completed', completed_at = NOW() WHERE id = $1 AND status = 'Active'",
          [challengeId]
        );
      }
    }

    await client.query('COMMIT');
    const summary = await getChallengeSummary(pool!, challengeId);
    res.json(summary);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const detail = databaseErrorMessage(error);
    console.error('Skip item failed:', detail);
    res.status(500).json({ error: `Unable to skip item: ${detail}` });
  } finally {
    client.release();
  }
});

// 9. Abandon / End Active Challenge
challengesRouter.post('/api/reading-challenges/:id/end', requireDatabase, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id, 10);
    const result = await pool!.query(
      "UPDATE reading_challenges SET status = 'Abandoned', ended_at = NOW() WHERE id = $1 AND status = 'Active' RETURNING id",
      [challengeId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Active challenge not found' });
    }
    const summary = await getChallengeSummary(pool!, challengeId);
    res.json(summary);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('End challenge failed:', detail);
    res.status(500).json({ error: `Unable to end challenge: ${detail}` });
  }
});

// 10. Milestone Insights
challengesRouter.get('/api/reading-challenges/:id/insights', requireDatabase, async (req, res) => {
  try {
    const challengeId = parseInt(req.params.id, 10);
    const challengeRes = await pool!.query(
      'SELECT id, name, total_eligible_count FROM reading_challenges WHERE id = $1',
      [challengeId]
    );
    if (challengeRes.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    const challenge = challengeRes.rows[0];

    const [itemsRes, collectionRes] = await Promise.all([
      pool!.query(
        `SELECT id, comic_id, sequence_number, status, metadata_snapshot
         FROM reading_challenge_items
         WHERE challenge_id = $1
         ORDER BY sequence_number ASC`,
        [challengeId]
      ),
      pool!.query(
        `SELECT ${comicColumns.join(', ')}
         FROM comic_books
         WHERE (reading_status IS NULL OR reading_status != 'Wishlist')
           AND (copies_owned > 0 OR copies_owned IS NULL)`
      ),
    ]);

    const items = itemsRes.rows.map((r) => ({
      challengeItemId: r.id,
      comicId: r.comic_id,
      sequenceNumber: r.sequence_number,
      status: r.status,
      metadata: r.metadata_snapshot,
    }));

    const collectionComics = collectionRes.rows.map(rowToComic) as unknown as ComicBook[];
    const milestones = computeChallengeMilestones(items, collectionComics);
    const readCount = items.filter((it) => it.status === 'Read').length;

    const unreadQueue = items.filter((it) => it.status === 'Unread').slice(0, 10);
    const tbrMilestones = computeTBRMilestones(unreadQueue as unknown as ChallengeQueueItem[], collectionComics);

    res.json({
      challengeId: challenge.id,
      challengeName: challenge.name,
      totalEligible: challenge.total_eligible_count,
      readCount,
      milestones,
      tbrMilestones,
    });
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('Get challenge insights failed:', detail);
    res.status(500).json({ error: `Unable to compute challenge insights: ${detail}` });
  }
});
