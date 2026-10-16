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
} from '../db';

export const collectionRouter = express.Router();

collectionRouter.get('/api/collection', requireDatabase, async (_req, res) => {
  try {
    const [comics, boxes, seriesTotals, creatorTypesResult] = await Promise.all([
      pool!.query('SELECT * FROM comic_books ORDER BY created_at DESC, title ASC'),
      pool!.query('SELECT id, name, location, max_capacity, color_tag, notes FROM storage_boxes WHERE id > 0 ORDER BY id'),
      pool!.query('SELECT id, publisher, series_name AS "seriesName", volume, issue_count AS "issueCount", updated_at AS "updatedAt" FROM series_issue_totals ORDER BY series_name ASC'),
      pool!.query(`
        SELECT DISTINCT type_name FROM (
          SELECT type_name FROM creator_types WHERE type_name IS NOT NULL AND TRIM(type_name) != ''
          UNION
          SELECT creator_type AS type_name FROM title_contributors WHERE creator_type IS NOT NULL AND TRIM(creator_type) != ''
        ) all_types
        ORDER BY type_name ASC
      `),
    ]);
    res.json({
      comics: comics.rows.map(rowToComic).filter((c) => !isSampleComicId(String(c.id))),
      boxes: boxes.rows.map((box) => ({
        id: box.id,
        name: box.name,
        location: box.location,
        maxCapacity: Number(box.max_capacity),
        colorTag: box.color_tag,
        notes: box.notes ?? undefined,
      })),
      seriesTotals: seriesTotals.rows,
      creatorTypes: creatorTypesResult.rows.map((r) => r.type_name),
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
    await client.query(
      ids.length ? 'DELETE FROM comic_books WHERE NOT (id = ANY($1::text[]))' : 'DELETE FROM comic_books',
      ids.length ? [ids] : []
    );
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
    await client.query(
      ids.length ? 'DELETE FROM storage_boxes WHERE NOT (id = ANY($1::integer[]))' : 'DELETE FROM storage_boxes',
      ids.length ? [ids] : []
    );
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
    res.sendStatus(204);
  } catch (error) {
    const detail = databaseErrorMessage(error);
    console.error('PostgreSQL box deletion failed:', detail);
    res.status(500).json({ error: `Unable to delete box: ${detail}` });
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
