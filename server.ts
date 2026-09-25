import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { parseTitleAndIssue } from './src/utils/titleParser';

// Local development overrides belong in .env.local; .env remains a shared fallback.
dotenv.config({ path: ['.env.local', '.env'] });

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  : null;

const comicColumns = [
  'id', 'title', 'issue_number', 'volume', 'series_name', 'full_title', 'event', 'copies_owned', 'publisher',
  'publication_year', 'publication_month', 'publication_date', 'genre', 'writer',
  'artist', 'cover_artist', 'creator_contributions', 'character_appearances', 'cover_image', 'format',
  'size_thickness', 'current_box_id', 'proposed_box_id', 'reading_status', 
  'user_rating', 'condition', 'purchase_price', 'estimated_value',
  'notes', 'tags', 'created_at', 'updated_at',
] as const;

const comicFields: Record<(typeof comicColumns)[number], string> = {
  id: 'id', title: 'title', issue_number: 'issueNumber', volume: 'volume',
  series_name: 'seriesName', full_title: 'fullTitle',
  event: 'event', copies_owned: 'copiesOwned', publisher: 'publisher', publication_year: 'publicationYear',
  publication_month: 'publicationMonth', publication_date: 'publicationDate', genre: 'genre',
  writer: 'writer', artist: 'artist', cover_artist: 'coverArtist',
  creator_contributions: 'creatorContributions', character_appearances: 'characterAppearances',
  cover_image: 'coverImage', format: 'format',
  size_thickness: 'sizeThickness', current_box_id: 'currentBoxId', proposed_box_id: 'proposedBoxId',
  reading_status: 'readingStatus', user_rating: 'userRating', condition: 'condition', purchase_price: 'purchasePrice',
  estimated_value: 'estimatedValue', notes: 'notes', tags: 'tags', created_at: 'createdAt', updated_at: 'updatedAt',
};

function databaseErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function comicValues(comic: Record<string, unknown>) {
  return comicColumns.map((column) => {
    const value = comic[comicFields[column]];
    return ['creator_contributions', 'character_appearances', 'tags'].includes(column)
      ? JSON.stringify(value ?? [])
      : value ?? null;
  });
}

function rowToComic(row: Record<string, unknown>) {
  const comic: Record<string, unknown> = {};
  const numericColumns = new Set([
    'copies_owned', 'publication_year', 'size_thickness', 'current_box_id', 'proposed_box_id',
    'read_count', 'user_rating', 'purchase_price', 'estimated_value',
  ]);
  for (const column of comicColumns) {
    const value = row[column];
    comic[comicFields[column]] = ['creator_contributions', 'character_appearances', 'tags'].includes(column)
      ? (typeof value === 'string' ? JSON.parse(value) : value ?? [])
      : numericColumns.has(column) && value !== null && value !== undefined ? Number(value) : value;
  }
  if (!comic.title || !String(comic.title).trim()) {
    comic.title = (comic.fullTitle as string) || (comic.seriesName as string) || 'Untitled Comic';
  }
  return comic;
}

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentVal.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      lines.push(currentRow);
    }
  }

  return lines;
}

async function initDatabase(db: Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS creators (
      id SERIAL PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      full_name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_creators_full_name ON creators (full_name);

    CREATE TABLE IF NOT EXISTS creator_types (
      id SERIAL PRIMARY KEY,
      type_name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS title_contributors (
      id SERIAL PRIMARY KEY,
      series_name TEXT,
      full_title TEXT NOT NULL,
      creator_full_name TEXT NOT NULL,
      creator_type TEXT NOT NULL,
      comic_id TEXT REFERENCES comic_books(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_title_contributors_full_title ON title_contributors (full_title);
    CREATE INDEX IF NOT EXISTS idx_title_contributors_series_name ON title_contributors (series_name);
    CREATE INDEX IF NOT EXISTS idx_title_contributors_creator_name ON title_contributors (creator_full_name);
    CREATE INDEX IF NOT EXISTS idx_title_contributors_creator_type ON title_contributors (creator_type);
    CREATE INDEX IF NOT EXISTS idx_title_contributors_comic_id ON title_contributors (comic_id);

    CREATE TABLE IF NOT EXISTS title_character_appearances (
      id SERIAL PRIMARY KEY,
      series_name TEXT,
      full_title TEXT NOT NULL,
      character_name TEXT NOT NULL,
      appearance_type TEXT NOT NULL,
      comic_id TEXT REFERENCES comic_books(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_title_char_app_full_title ON title_character_appearances (full_title);
    CREATE INDEX IF NOT EXISTS idx_title_char_app_series_name ON title_character_appearances (series_name);
    CREATE INDEX IF NOT EXISTS idx_title_char_app_character_name ON title_character_appearances (character_name);
    CREATE INDEX IF NOT EXISTS idx_title_char_app_comic_id ON title_character_appearances (comic_id);

    ALTER TABLE comic_books ADD COLUMN IF NOT EXISTS series_name TEXT;
    ALTER TABLE comic_books ADD COLUMN IF NOT EXISTS full_title TEXT;
    ALTER TABLE comic_books ADD COLUMN IF NOT EXISTS character_appearances JSONB NOT NULL DEFAULT '[]'::jsonb;

    UPDATE comic_books
    SET full_title = CASE 
      WHEN issue_number IS NOT NULL AND issue_number != '' AND issue_number != 'Unknown' THEN title || ' #' || issue_number
      ELSE title
    END
    WHERE full_title IS NULL;

    CREATE INDEX IF NOT EXISTS idx_comic_books_full_title ON comic_books (full_title);

    CREATE TABLE IF NOT EXISTS series_issue_totals (
      id SERIAL PRIMARY KEY,
      publisher TEXT NOT NULL,
      series_name TEXT NOT NULL,
      volume TEXT NOT NULL DEFAULT '',
      issue_count INTEGER NOT NULL DEFAULT 0 CHECK (issue_count >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_series_issue_totals UNIQUE (series_name, volume)
    );

    CREATE INDEX IF NOT EXISTS idx_series_issue_totals_series_name ON series_issue_totals (series_name);
    CREATE INDEX IF NOT EXISTS idx_series_issue_totals_publisher ON series_issue_totals (publisher);
  `);

  // Auto-repair any comics where title is missing or empty
  try {
    const emptyTitlesResult = await db.query(
      "SELECT id, full_title, series_name, volume, issue_number FROM comic_books WHERE title IS NULL OR title = '' OR trim(title) = ''"
    );
    if (emptyTitlesResult.rows.length > 0) {
      console.log(`Found ${emptyTitlesResult.rows.length} comic(s) with empty title. Auto-repairing...`);
      for (const row of emptyTitlesResult.rows) {
        const source = (row.full_title as string) || (row.series_name as string) || '';
        const parsed = parseTitleAndIssue(source, row.issue_number && row.issue_number !== '1' ? (row.issue_number as string) : undefined);
        const newTitle = parsed.cleanTitle || source || 'Untitled Comic';
        const newIssue = parsed.issueNumber || (row.issue_number && row.issue_number !== '1' ? (row.issue_number as string) : '1');
        let vol = row.volume as string | null | undefined;
        if (!vol && parsed.volume) {
          vol = parsed.volume;
        } else if (!vol && row.series_name) {
          const volMatch = (row.series_name as string).match(/\b(vol|volume|v)\.?\s*(\d+)\b/i);
          if (volMatch) vol = volMatch[2];
        }

        await db.query(
          `UPDATE comic_books
           SET title = $1,
               issue_number = CASE WHEN issue_number IS NULL OR issue_number = '' OR issue_number = '1' THEN $2 ELSE issue_number END,
               volume = COALESCE(volume, $3),
               updated_at = NOW()
           WHERE id = $4`,
          [newTitle, newIssue, vol ?? null, row.id]
        );
      }
      console.log(`Successfully repaired ${emptyTitlesResult.rows.length} comic title(s).`);
    }
  } catch (repairErr) {
    console.warn('Auto-repair empty titles warning:', repairErr);
  }

  // Auto-seed series_issue_totals from CSV if table is empty
  try {
    const totalsCountRes = await db.query('SELECT COUNT(*) FROM series_issue_totals');
    if (parseInt(totalsCountRes.rows[0].count, 10) === 0) {
      const seriesCsvPath = path.resolve('db/migrations/Comic Book Collection - SeriesIssueTotal.csv');
      if (fs.existsSync(seriesCsvPath)) {
        console.log('Seeding series_issue_totals from CSV...');
        const csvText = await fs.promises.readFile(seriesCsvPath, 'utf8');
        const parsedLines = parseCSV(csvText);
        if (parsedLines.length > 1) {
          const headers = parsedLines[0].map((h: string) => h.trim());
          const pIdx = headers.indexOf('Publisher Name');
          const sIdx = headers.indexOf('Series Name');
          const vIdx = headers.indexOf('Volume');
          const cIdx = headers.indexOf('Issue Count');
          for (const r of parsedLines.slice(1)) {
            const publisher = pIdx >= 0 ? r[pIdx] : 'Unknown Publisher';
            const seriesName = sIdx >= 0 ? r[sIdx] : '';
            const volume = vIdx >= 0 ? r[vIdx] : '';
            const issueCount = cIdx >= 0 ? parseInt(r[cIdx], 10) || 0 : 0;
            if (!seriesName) continue;
            await db.query(`
              INSERT INTO series_issue_totals (publisher, series_name, volume, issue_count, updated_at)
              VALUES ($1, $2, $3, $4, NOW())
              ON CONFLICT (series_name, volume) DO UPDATE SET
                publisher = EXCLUDED.publisher,
                issue_count = EXCLUDED.issue_count,
                updated_at = NOW()
            `, [publisher, seriesName, volume, issueCount]);
          }
          console.log('Seeded series_issue_totals from CSV successfully.');
        }
      }
    }
  } catch (seedErr) {
    console.warn('Auto-seed series_issue_totals warning:', seedErr);
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '25mb' }));

  if (pool) {
    try {
      await initDatabase(pool);
      console.log('Database initialized with creators & character appearance tables.');
    } catch (err) {
      console.warn('Database initialization warning:', err);
    }
  }

  const requireDatabase: express.RequestHandler = (_req, res, next) => {
    if (!pool) {
      return res.status(503).json({ error: 'DATABASE_URL is not configured. Add it to .env.local and restart the server.' });
    }
    next();
  };

const comicUpsertSql = `
  INSERT INTO comic_books (${comicColumns.join(', ')})
  VALUES (${comicColumns.map((_, index) => `$${index + 1}`).join(', ')})
  ON CONFLICT (id) DO UPDATE SET
    ${comicColumns
      .filter((column) => column !== 'id' && column !== 'created_at' && column !== 'updated_at')
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(', ')},
    updated_at = NOW()`;

  app.get('/api/collection', requireDatabase, async (_req, res) => {
    try {
      const [comics, boxes, seriesTotals] = await Promise.all([
        pool!.query('SELECT * FROM comic_books ORDER BY created_at DESC, title ASC'),
        pool!.query('SELECT id, name, location, max_capacity, color_tag, notes FROM storage_boxes WHERE id > 0 ORDER BY id'),
        pool!.query('SELECT id, publisher, series_name AS "seriesName", volume, issue_count AS "issueCount", updated_at AS "updatedAt" FROM series_issue_totals ORDER BY series_name ASC'),
      ]);
      res.json({
        comics: comics.rows.map(rowToComic),
        boxes: boxes.rows.map((box) => ({
          id: box.id, name: box.name, location: box.location, maxCapacity: Number(box.max_capacity),
          colorTag: box.color_tag, notes: box.notes ?? undefined,
        })),
        seriesTotals: seriesTotals.rows,
      });
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL collection read failed:', detail);
      res.status(500).json({ error: `Unable to load collection from PostgreSQL: ${detail}` });
    }
  });

  app.put('/api/comics/:id', requireDatabase, async (req, res) => {
    if (req.body?.id !== req.params.id) return res.status(400).json({ error: 'Comic ID must match the request path.' });
    try {
      await pool!.query(comicUpsertSql, comicValues(req.body));
      res.sendStatus(204);
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL comic save failed:', detail);
      res.status(500).json({ error: `Unable to save comic: ${detail}` });
    }
  });

  app.delete('/api/comics/:id', requireDatabase, async (req, res) => {
    try {
      await pool!.query('DELETE FROM comic_books WHERE id = $1', [req.params.id]);
      res.sendStatus(204);
    } catch (error) {
      console.error('PostgreSQL comic deletion failed:', error);
      res.status(500).json({ error: 'Unable to delete comic.' });
    }
  });

  app.put('/api/comics', requireDatabase, async (req, res) => {
    if (!Array.isArray(req.body?.comics)) return res.status(400).json({ error: 'comics must be an array.' });
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      const ids = req.body.comics.map((comic: { id: string }) => comic.id);
      await client.query(ids.length ? 'DELETE FROM comic_books WHERE NOT (id = ANY($1::text[]))' : 'DELETE FROM comic_books', ids.length ? [ids] : []);
      for (const comic of req.body.comics) await client.query(comicUpsertSql, comicValues(comic));
      await client.query('COMMIT');
      res.sendStatus(204);
    } catch (error) {
      await client.query('ROLLBACK');
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL comic replacement failed:', detail);
      res.status(500).json({ error: `Unable to replace comics: ${detail}` });
    } finally { client.release(); }
  });

  app.put('/api/boxes/:id', requireDatabase, async (req, res) => {
    if (Number(req.params.id) !== req.body?.id) return res.status(400).json({ error: 'Box ID must match the request path.' });
    try {
      const box = req.body;
      await pool!.query(`INSERT INTO storage_boxes (id, name, location, max_capacity, color_tag, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location,
        max_capacity = EXCLUDED.max_capacity, color_tag = EXCLUDED.color_tag, notes = EXCLUDED.notes, updated_at = NOW()`,
        [box.id, box.name, box.location, box.maxCapacity, box.colorTag, box.notes ?? null]);
      res.sendStatus(204);
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL box save failed:', detail);
      res.status(500).json({ error: `Unable to save box: ${detail}` });
    }
  });

  app.put('/api/boxes', requireDatabase, async (req, res) => {
    if (!Array.isArray(req.body?.boxes)) return res.status(400).json({ error: 'boxes must be an array.' });
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      for (const box of req.body.boxes) {
        await client.query(`INSERT INTO storage_boxes (id, name, location, max_capacity, color_tag, notes)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location,
          max_capacity = EXCLUDED.max_capacity, color_tag = EXCLUDED.color_tag, notes = EXCLUDED.notes, updated_at = NOW()`,
          [box.id, box.name, box.location, box.maxCapacity, box.colorTag, box.notes ?? null]);
      }
      const ids = req.body.boxes.map((box: { id: number }) => box.id);
      await client.query(ids.length ? 'DELETE FROM storage_boxes WHERE NOT (id = ANY($1::integer[]))' : 'DELETE FROM storage_boxes', ids.length ? [ids] : []);
      await client.query('COMMIT');
      res.sendStatus(204);
    } catch (error) {
      await client.query('ROLLBACK');
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL box replacement failed:', detail);
      res.status(500).json({ error: `Unable to replace boxes: ${detail}` });
    } finally { client.release(); }
  });

  app.delete('/api/boxes/:id', requireDatabase, async (req, res) => {
    try {
      await pool!.query('DELETE FROM storage_boxes WHERE id = $1', [req.params.id]);
      res.sendStatus(204);
    } catch (error) {
      const detail = databaseErrorMessage(error);
      console.error('PostgreSQL box deletion failed:', detail);
      res.status(500).json({ error: `Unable to delete box: ${detail}` });
    }
  });

  // --- API ROUTE: Get ordered comics in a specific box (for 3D visualizer) ---
  app.get('/api/boxes/:id/comics', requireDatabase, async (req, res) => {
    try {
      const boxId = Number(req.params.id);
      if (!Number.isInteger(boxId) || boxId < 0) {
        return res.status(400).json({ error: 'Box ID must be a non-negative integer.' });
      }

      // Fetch the box first to verify it exists
      const boxResult = await pool!.query('SELECT id, name FROM storage_boxes WHERE id = $1', [boxId]);
      if (boxResult.rows.length === 0) {
        return res.status(404).json({ error: `Box ${boxId} not found.` });
      }

      // Fetch comics in this box, sorted by creation order (stable ordering)
      // Order by: current_box_id (ensures box filter), then created_at for stable ordering, then id as tiebreaker
      const comicsResult = await pool!.query(
        `SELECT ${comicColumns.join(', ')}
         FROM comic_books
         WHERE current_box_id = $1
         ORDER BY created_at ASC, id ASC`,
        [boxId]
      );

      const comics = comicsResult.rows.map(rowToComic);
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

  // --- API ROUTE: Get all series issue totals ---
  app.get('/api/series-totals', requireDatabase, async (_req, res) => {
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

  // --- API ROUTE: Upsert series issue totals batch ---
  app.post('/api/series-totals', requireDatabase, async (req, res) => {
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
        await client.query(`
          INSERT INTO series_issue_totals (publisher, series_name, volume, issue_count, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (series_name, volume) DO UPDATE SET
            publisher = EXCLUDED.publisher,
            issue_count = EXCLUDED.issue_count,
            updated_at = NOW()
        `, [publisher, seriesName, volume, issueCount]);
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

  // --- API ROUTE: Proxy image for 3D visualizer WebGL textures and image fallbacks to bypass CORS & referer blocking ---
  app.get('/api/proxy-image', async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      if (!rawUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'Invalid URL protocol' });
      }

      let fetchUrl = rawUrl;
      // If it's a Google Drive URL, normalize to direct lh3 link or extract file ID
      const driveMatch =
        fetchUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
        fetchUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
        fetchUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);

      if (driveMatch && driveMatch[1]) {
        const fileId = driveMatch[1];
        if (!fetchUrl.includes('lh3.googleusercontent.com')) {
          fetchUrl = `https://lh3.googleusercontent.com/d/${fileId}=s800`;
        } else if (fetchUrl.includes('=s1000')) {
          fetchUrl = fetchUrl.replace('=s1000', '=s800');
        }
      }

      const requestHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      };

      let response = await fetch(fetchUrl, { headers: requestHeaders });

      // If lh3 or primary URL returns non-200 or HTML (e.g. Google Drive warning page), try drive.google.com/uc export
      const initialContentType = response.headers.get('content-type') || '';
      if ((!response.ok || initialContentType.includes('text/html')) && driveMatch && driveMatch[1]) {
        const fallbackDriveUrl = `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
        const fallbackRes = await fetch(fallbackDriveUrl, { headers: requestHeaders });
        if (fallbackRes.ok) {
          const fbContentType = fallbackRes.headers.get('content-type') || '';
          if (fbContentType.startsWith('image/')) {
            response = fallbackRes;
          }
        }
      }

      if (!response.ok) {
        return res.status(response.status).json({ error: `Upstream image fetch failed with status ${response.status}` });
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      if (contentType.includes('text/html')) {
        return res.status(404).json({ error: 'Requested URL did not return an image' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const buffer = Buffer.from(await response.arrayBuffer());
      return res.send(buffer);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to proxy image' });
    }
  });

  // Helper lazy init for Gemini API
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not configured');
    }
    return new GoogleGenAI({ apiKey });
  };

  // --- API ROUTE: Scan Comic Cover Image with Gemini AI ---
  app.post('/api/scan-cover', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg' } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'Missing imageBase64 data' });
      }

      const ai = getGeminiClient();
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      const prompt = `
Analyze this comic book cover photo carefully and extract or estimate all details in raw JSON format with these exact keys:
{
  "title": "Comic Title (e.g. The Amazing Spider-Man)",
  "issueNumber": "Issue number or designation (e.g. 300, 1, Annual #2, TPB Vol 1)",
  "volume": "Volume identifier if visible (e.g. Vol. 1)",
  "publisher": "Publisher name (e.g. Marvel Comics, DC Comics, Image Comics, Dark Horse, BOOM! Studios)",
  "publicationYear": 1988 (number year estimate or exact),
  "genre": "Main Genre (e.g. Superhero, Sci-Fi, Horror, Fantasy, Crime, Mystery)",
  "writer": "Primary writer(s)",
  "artist": "Primary artist(s) or penciler/inker",
  "coverArtist": "Cover artist if known",
  "format": "Single Issue" | "Trade Paperback" | "Hardcover" | "Omnibus" | "Graphic Novel",
  "sizeThickness": 1.0 (number: 1.0 for single issue, 3.5 for trade paperback, 6.0 for hardcover, 12.0 for omnibus/compendium),
  "estimatedValue": 15.0 (estimated USD value based on title/issue/condition),
  "summary": "Brief 1-2 sentence description of the issue or cover scene",
  "tags": ["Key Issue", "First Appearance", "Marvel"]
}
Return ONLY valid JSON without markdown fences if possible or clean JSON.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
      });

      const responseText = response.text || '';
      // Clean potential JSON markdown blocks
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        return res.json({ success: true, data: parsedData });
      }

      return res.json({ success: true, rawText: responseText });
    } catch (err: any) {
      console.error('Scan Cover Error:', err);
      return res.status(500).json({ error: err.message || 'Failed to scan comic cover' });
    }
  });

  // Helper to fetch Google Sheet data by tab name using OAuth or public CSV export
  async function fetchSheetData(spreadsheetId: string, sheetName: string, accessToken?: string): Promise<{ headers: string[]; rows: string[][] }> {
    let cleanId = spreadsheetId.trim();
    const urlMatch = cleanId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) cleanId = urlMatch[1];

    // Strategy 1: If client provided OAuth access token, use Google Sheets API
    if (accessToken) {
      try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const sheets = google.sheets({ version: 'v4', auth });
        const range = sheetName ? `'${sheetName}'` : 'A1:ZZ';

        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: cleanId,
          range,
        });

        const rows = response.data.values;
        if (rows && rows.length > 0) {
          const headers = rows[0].map((h: any) => String(h ?? '').trim());
          const dataRows = rows.slice(1).map((r: any[]) => r.map((c: any) => String(c ?? '').trim()));
          return { headers, rows: dataRows };
        }
      } catch (authErr: any) {
        console.warn(`OAuth fetch failed for tab "${sheetName}":`, authErr.message);
      }
    }

    // Strategy 2: Fallback to public CSV export endpoint (works for any sheet shared with "Anyone with the link")
    const csvUrl = `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName || 'Sheet1')}`;
    const csvResponse = await fetch(csvUrl);

    if (csvResponse.ok) {
      const csvText = await csvResponse.text();
      if (csvText && !csvText.includes('<!DOCTYPE html>')) {
        const parsedRows = parseCSV(csvText);
        if (parsedRows.length > 0) {
          const headers = parsedRows[0].map((h) => h.trim());
          const dataRows = parsedRows.slice(1);
          return { headers, rows: dataRows };
        }
      }
    }

    // Strategy 3: Secondary export URL attempt
    const exportUrl = `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv&sheet=${encodeURIComponent(sheetName || 'Sheet1')}`;
    const exportResponse = await fetch(exportUrl);
    if (exportResponse.ok) {
      const csvText = await exportResponse.text();
      if (csvText && !csvText.includes('<!DOCTYPE html>')) {
        const parsedRows = parseCSV(csvText);
        if (parsedRows.length > 0) {
          const headers = parsedRows[0].map((h) => h.trim());
          const dataRows = parsedRows.slice(1);
          return { headers, rows: dataRows };
        }
      }
    }

    throw new Error(`Could not read sheet tab "${sheetName}". Ensure the tab exists and the Google Sheet is shared with "Anyone with the link can view".`);
  }

  // --- API ROUTE: Google Sheets Fetch Single Tab ---
  app.post('/api/google-sheets/fetch', async (req, res) => {
    try {
      const { spreadsheetId, sheetName = 'Sheet1', accessToken } = req.body;
      if (!spreadsheetId) {
        return res.status(400).json({ error: 'spreadsheetId is required' });
      }

      const { headers, rows } = await fetchSheetData(spreadsheetId, sheetName, accessToken);
      return res.json({
        success: true,
        spreadsheetId,
        sheetName,
        headers,
        rowCount: rows.length,
        rows,
      });
    } catch (err: any) {
      console.error('Google Sheets Fetch Error:', err);
      return res.status(400).json({ error: err.message || 'Failed to fetch Google Sheet data' });
    }
  });

  // --- API ROUTE: Google Sheets Batch Fetch Multiple Subsheets ---
  app.post('/api/google-sheets/fetch-subsheets', async (req, res) => {
    try {
      const { spreadsheetId, sheetNames = {}, accessToken } = req.body;
      if (!spreadsheetId) {
        return res.status(400).json({ error: 'spreadsheetId is required' });
      }

      const results: Record<string, { sheetName: string; headers: string[]; rows: string[][]; rowCount: number; error?: string }> = {};

      const fetchPromises = Object.entries(sheetNames).map(async ([key, sheetName]) => {
        const name = String(sheetName || '').trim();
        if (!name) return;
        try {
          const { headers, rows } = await fetchSheetData(spreadsheetId, name, accessToken);
          results[key] = {
            sheetName: name,
            headers,
            rows,
            rowCount: rows.length,
          };
        } catch (tabErr: any) {
          results[key] = {
            sheetName: name,
            headers: [],
            rows: [],
            rowCount: 0,
            error: tabErr.message,
          };
        }
      });

      await Promise.all(fetchPromises);

      return res.json({
        success: true,
        spreadsheetId,
        subsheets: results,
      });
    } catch (err: any) {
      console.error('Google Sheets Fetch Subsheets Error:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch subsheets' });
    }
  });

  // --- API ROUTE: Import and Store Subsheets into Database ---
  app.post('/api/import/subsheets', requireDatabase, async (req, res) => {
    const client = await pool!.connect();
    try {
      const {
        creators = [],
        creatorTypes = [],
        contributors = [],
        characterAppearances = [],
        seriesTotals = [],
        syncWithComics = true,
      } = req.body;

      await client.query('BEGIN');

      let creatorsInserted = 0;
      let creatorTypesInserted = 0;
      let contributorsInserted = 0;
      let appearancesInserted = 0;
      let seriesTotalsInserted = 0;
      let comicsUpdated = 0;

      // 1. Creators import: (First Name, Last Name, Full Name)
      if (Array.isArray(creators) && creators.length > 0) {
        await client.query('DELETE FROM creators');
        for (const creator of creators) {
          const fullName = String(creator.fullName || '').trim();
          if (!fullName) continue;
          const firstName = creator.firstName ? String(creator.firstName).trim() : null;
          const lastName = creator.lastName ? String(creator.lastName).trim() : null;

          await client.query(`
            INSERT INTO creators (first_name, last_name, full_name, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (full_name) DO UPDATE SET
              first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), creators.first_name),
              last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), creators.last_name),
              updated_at = NOW()
          `, [firstName, lastName, fullName]);
          creatorsInserted++;
        }
      }

      // 2. Creator Types import (Penciller, Inker, Editor, Writer, etc.)
      if (Array.isArray(creatorTypes) && creatorTypes.length > 0) {
        await client.query('DELETE FROM creator_types');
        for (const ct of creatorTypes) {
          const typeName = String(ct.typeName || ct.roleName || ct.name || '').trim();
          if (!typeName) continue;
          await client.query(`
            INSERT INTO creator_types (type_name, updated_at)
            VALUES ($1, NOW())
            ON CONFLICT (type_name) DO NOTHING
          `, [typeName]);
          creatorTypesInserted++;
        }
      }

      // 3. Title Contributors import (Series Name, Full Title, Creator Full Name, Creator Type)
      if (Array.isArray(contributors) && contributors.length > 0) {
        await client.query('DELETE FROM title_contributors');

        for (const c of contributors) {
          const fullTitle = String(c.fullTitle || '').trim();
          const creatorFullName = String(c.creatorFullName || c.creatorName || '').trim();
          const creatorType = String(c.creatorType || c.roleName || 'Contributor').trim();
          const seriesName = c.seriesName ? String(c.seriesName).trim() : null;

          if (!fullTitle || !creatorFullName) continue;

          // Ensure creator exists in creators table
          const nameParts = creatorFullName.split(' ');
          const autoFirst = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : null;
          const autoLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : creatorFullName;

          await client.query(`
            INSERT INTO creators (first_name, last_name, full_name, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (full_name) DO NOTHING
          `, [autoFirst, autoLast, creatorFullName]);

          // Ensure creator type exists
          await client.query(`
            INSERT INTO creator_types (type_name, updated_at)
            VALUES ($1, NOW())
            ON CONFLICT (type_name) DO NOTHING
          `, [creatorType]);

          await client.query(`
            INSERT INTO title_contributors (series_name, full_title, creator_full_name, creator_type, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
          `, [seriesName, fullTitle, creatorFullName, creatorType]);
          contributorsInserted++;
        }
      }

      // 4. Character Appearances import (Series Name, Full Title, Character Name, Appearance Type)
      if (Array.isArray(characterAppearances) && characterAppearances.length > 0) {
        await client.query('DELETE FROM title_character_appearances');

        for (const a of characterAppearances) {
          const fullTitle = String(a.fullTitle || '').trim();
          const characterName = String(a.characterName || '').trim();
          const appearanceType = String(a.appearanceType || 'Supporting').trim();
          const seriesName = a.seriesName ? String(a.seriesName).trim() : null;

          if (!fullTitle || !characterName) continue;

          await client.query(`
            INSERT INTO title_character_appearances (series_name, full_title, character_name, appearance_type, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
          `, [seriesName, fullTitle, characterName, appearanceType]);
          appearancesInserted++;
        }
      }

      // 4.5 Series Issue Totals import (Publisher Name, Series Name, Volume, Issue Count)
      if (Array.isArray(seriesTotals) && seriesTotals.length > 0) {
        for (const st of seriesTotals) {
          const publisher = String(st.publisher || 'Unknown Publisher').trim();
          const seriesName = String(st.seriesName || '').trim();
          const volume = String(st.volume ?? '').trim();
          const issueCount = Math.max(0, parseInt(st.issueCount, 10) || 0);

          if (!seriesName) continue;

          await client.query(`
            INSERT INTO series_issue_totals (publisher, series_name, volume, issue_count, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (series_name, volume) DO UPDATE SET
              publisher = EXCLUDED.publisher,
              issue_count = EXCLUDED.issue_count,
              updated_at = NOW()
          `, [publisher, seriesName, volume, issueCount]);
          seriesTotalsInserted++;
        }
      }

      // 5. Link with comic_books and update creator contributions and character appearances
      if (syncWithComics) {
        // Reset previous creator contributions and character appearances to avoid stale data
        await client.query(`
          UPDATE comic_books
          SET 
            creator_contributions = '[]'::jsonb,
            character_appearances = '[]'::jsonb,
            writer = CASE WHEN writer = title OR writer = series_name OR writer = full_title THEN NULL ELSE writer END,
            artist = CASE WHEN artist = title OR artist = series_name OR artist = full_title THEN NULL ELSE artist END
          WHERE TRUE
        `);

        // Link comic_id in contributors with fast indexed passes
        await client.query(`
          UPDATE title_contributors tc
          SET comic_id = cb.id
          FROM comic_books cb
          WHERE LOWER(TRIM(tc.full_title)) = LOWER(TRIM(cb.full_title))
        `);
        await client.query(`
          UPDATE title_contributors tc
          SET comic_id = cb.id
          FROM comic_books cb
          WHERE tc.comic_id IS NULL
            AND (
              LOWER(TRIM(tc.full_title)) = LOWER(TRIM(cb.title))
              OR LOWER(TRIM(tc.full_title)) = LOWER(TRIM(cb.title || ' #' || cb.issue_number))
              OR LOWER(TRIM(tc.full_title)) = LOWER(TRIM(cb.title || ' ' || cb.issue_number))
            )
        `);

        // Link comic_id in character appearances with fast indexed passes
        await client.query(`
          UPDATE title_character_appearances tca
          SET comic_id = cb.id
          FROM comic_books cb
          WHERE LOWER(TRIM(tca.full_title)) = LOWER(TRIM(cb.full_title))
        `);
        await client.query(`
          UPDATE title_character_appearances tca
          SET comic_id = cb.id
          FROM comic_books cb
          WHERE tca.comic_id IS NULL
            AND (
              LOWER(TRIM(tca.full_title)) = LOWER(TRIM(cb.title))
              OR LOWER(TRIM(tca.full_title)) = LOWER(TRIM(cb.title || ' #' || cb.issue_number))
              OR LOWER(TRIM(tca.full_title)) = LOWER(TRIM(cb.title || ' ' || cb.issue_number))
            )
        `);

        // Backfill series_name on comic_books if available from contributors or appearances
        await client.query(`
          UPDATE comic_books cb
          SET series_name = tc.series_name
          FROM title_contributors tc
          WHERE tc.comic_id = cb.id
            AND (cb.series_name IS NULL OR cb.series_name = '')
            AND tc.series_name IS NOT NULL
        `);
        await client.query(`
          UPDATE comic_books cb
          SET series_name = tca.series_name
          FROM title_character_appearances tca
          WHERE tca.comic_id = cb.id
            AND (cb.series_name IS NULL OR cb.series_name = '')
            AND tca.series_name IS NOT NULL
        `);

        // Aggregate contributors and update comic_books
        const contribsAgg = await client.query(`
          SELECT 
            cb.id as comic_id,
            json_agg(json_build_object('creatorName', tc.creator_full_name, 'roleName', tc.creator_type)) as contributions
          FROM comic_books cb
          JOIN title_contributors tc ON tc.comic_id = cb.id
          GROUP BY cb.id
        `);

        for (const row of contribsAgg.rows) {
          const contribs = row.contributions || [];
          const writerNames = contribs
            .filter((c: any) => /writer|story|script|plot/i.test(c.roleName))
            .map((c: any) => c.creatorName);
          const artistNames = contribs
            .filter((c: any) => /pencill?er|artist|art|pencils/i.test(c.roleName))
            .map((c: any) => c.creatorName);

          const writerStr = writerNames.length ? Array.from(new Set(writerNames)).join(', ') : null;
          const artistStr = artistNames.length ? Array.from(new Set(artistNames)).join(', ') : null;

          await client.query(`
            UPDATE comic_books
            SET 
              creator_contributions = $1,
              writer = COALESCE(NULLIF($2, ''), writer),
              artist = COALESCE(NULLIF($3, ''), artist),
              updated_at = NOW()
            WHERE id = $4
          `, [JSON.stringify(contribs), writerStr, artistStr, row.comic_id]);
          comicsUpdated++;
        }

        // Aggregate character appearances and update comic_books
        const charsAgg = await client.query(`
          SELECT 
            cb.id as comic_id,
            json_agg(json_build_object('characterName', tca.character_name, 'appearanceType', tca.appearance_type)) as characters
          FROM comic_books cb
          JOIN title_character_appearances tca ON tca.comic_id = cb.id
          GROUP BY cb.id
        `);

        for (const row of charsAgg.rows) {
          await client.query(`
            UPDATE comic_books
            SET 
              character_appearances = $1,
              updated_at = NOW()
            WHERE id = $2
          `, [JSON.stringify(row.characters || []), row.comic_id]);
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        counts: {
          creators: creatorsInserted,
          creatorTypes: creatorTypesInserted,
          contributors: contributorsInserted,
          characterAppearances: appearancesInserted,
          seriesTotals: seriesTotalsInserted,
          comicsUpdated,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      const detail = databaseErrorMessage(error);
      console.error('Subsheets import failed:', detail);
      res.status(500).json({ error: `Unable to import subsheets: ${detail}` });
    } finally {
      client.release();
    }
  });

  // --- API ROUTE: Creators List with Stats & Breakdown ---
  app.get('/api/creators', requireDatabase, async (_req, res) => {
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

  // --- API ROUTE: Creator Reports & Analytics ---
  app.get('/api/reports/creators', requireDatabase, async (_req, res) => {
    try {
      // 1. Top Contributors by Issue Count with roles breakdown
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

      // 2. Cross-role creators (Pencillers who wrote, writers who drew)
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

      // 3. Creator Type Role Distribution
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

      // 4. Character appearances
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

      // 5. Overall summary counts
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

  // --- API ROUTE: Generate SQL Import Script ---
  app.post('/api/export-sql', (req, res) => {
    try {
      const { comics, boxes, dialect = 'sqlite' } = req.body;

      let sql = `-- Comic Book Collection SQL Import Script (${dialect.toUpperCase()})\n`;
      sql += `-- Generated on ${new Date().toISOString()}\n\n`;

      if (dialect === 'sqlite') {
        sql += `CREATE TABLE IF NOT EXISTS storage_boxes (\n`;
        sql += `  id INTEGER PRIMARY KEY,\n`;
        sql += `  name TEXT NOT NULL,\n`;
        sql += `  location TEXT NOT NULL,\n`;
        sql += `  max_capacity REAL NOT NULL,\n`;
        sql += `  color_tag TEXT,\n`;
        sql += `  notes TEXT\n`;
        sql += `);\n\n`;

        sql += `CREATE TABLE IF NOT EXISTS comic_books (\n`;
        sql += `  id TEXT PRIMARY KEY,\n`;
        sql += `  title TEXT NOT NULL,\n`;
        sql += `  issue_number TEXT NOT NULL,\n`;
        sql += `  volume TEXT,\n`;
        sql += `  event TEXT,\n`;
        sql += `  copies_owned INTEGER DEFAULT 1,\n`;
        sql += `  publisher TEXT NOT NULL,\n`;
        sql += `  publication_year INTEGER,\n`;
        sql += `  publication_month TEXT,\n`;
        sql += `  publication_date TEXT,\n`;
        sql += `  genre TEXT,\n`;
        sql += `  writer TEXT,\n`;
        sql += `  artist TEXT,\n`;
        sql += `  cover_artist TEXT,\n`;
        sql += `  format TEXT NOT NULL,\n`;
        sql += `  size_thickness REAL NOT NULL DEFAULT 1.0,\n`;
        sql += `  current_box_id INTEGER FOREIGN KEY REFERENCES storage_boxes(id),\n`;
        sql += `  proposed_box_id INTEGER FOREIGN KEY REFERENCES storage_boxes(id),\n`;
        sql += `  reading_status TEXT NOT NULL DEFAULT 'Unread',\n`;
        sql += `  read_count INTEGER DEFAULT 0,\n`;
        sql += `  user_rating INTEGER,\n`;
        sql += `  condition TEXT,\n`;
        sql += `  purchase_price REAL,\n`;
        sql += `  estimated_value REAL,\n`;
        sql += `  notes TEXT,\n`;
        sql += `  tags TEXT,\n`;
        sql += `  created_at TEXT,\n`;
        sql += `  updated_at TEXT\n`;
        sql += `);\n\n`;

        sql += `CREATE TABLE IF NOT EXISTS creators (\n`;
        sql += `  id INTEGER PRIMARY KEY AUTOINCREMENT,\n`;
        sql += `  name TEXT NOT NULL UNIQUE,\n`;
        sql += `  bio TEXT,\n`;
        sql += `  created_at TEXT\n`;
        sql += `);\n\n`;

        sql += `CREATE TABLE IF NOT EXISTS creator_types (\n`;
        sql += `  id INTEGER PRIMARY KEY AUTOINCREMENT,\n`;
        sql += `  role_name TEXT NOT NULL UNIQUE\n`;
        sql += `);\n\n`;

        sql += `CREATE TABLE IF NOT EXISTS comic_creator_contributions (\n`;
        sql += `  id INTEGER PRIMARY KEY AUTOINCREMENT,\n`;
        sql += `  comic_id TEXT REFERENCES comic_books(id),\n`;
        sql += `  title TEXT NOT NULL,\n`;
        sql += `  creator_id INTEGER REFERENCES creators(id),\n`;
        sql += `  creator_name TEXT NOT NULL,\n`;
        sql += `  creator_type_id INTEGER REFERENCES creator_types(id),\n`;
        sql += `  role_name TEXT NOT NULL\n`;
        sql += `);\n\n`;

        sql += `CREATE TABLE IF NOT EXISTS series_issue_totals (\n`;
        sql += `  id INTEGER PRIMARY KEY AUTOINCREMENT,\n`;
        sql += `  publisher TEXT NOT NULL,\n`;
        sql += `  series_name TEXT NOT NULL,\n`;
        sql += `  volume TEXT NOT NULL DEFAULT '',\n`;
        sql += `  issue_count INTEGER NOT NULL DEFAULT 0,\n`;
        sql += `  created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n`;
        sql += `  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,\n`;
        sql += `  UNIQUE(series_name, volume)\n`;
        sql += `);\n\n`;
      } else {
        // PostgreSQL DDL
        sql += `CREATE TABLE IF NOT EXISTS storage_boxes (\n`;
        sql += `  id INT PRIMARY KEY,\n`;
        sql += `  name VARCHAR(255) NOT NULL,\n`;
        sql += `  location VARCHAR(255) NOT NULL,\n`;
        sql += `  max_capacity NUMERIC(6,2) NOT NULL,\n`;
        sql += `  color_tag VARCHAR(50),\n`;
        sql += `  notes TEXT\n`;
        sql += `);\n\n`;

        sql += `CREATE TABLE IF NOT EXISTS comic_books (\n`;
        sql += `  id VARCHAR(100) PRIMARY KEY,\n`;
        sql += `  title VARCHAR(500) NOT NULL,\n`;
        sql += `  issue_number VARCHAR(255) NOT NULL,\n`;
        sql += `  volume VARCHAR(100),\n`;
        sql += `  event VARCHAR(255),\n`;
        sql += `  copies_owned INT DEFAULT 1,\n`;
        sql += `  publisher VARCHAR(255) NOT NULL,\n`;
        sql += `  publication_year INT,\n`;
        sql += `  publication_month INT,\n`;
        sql += `  publication_date DATE,\n`;
        sql += `  genre VARCHAR(100),\n`;
        sql += `  writer VARCHAR(255),\n`;
        sql += `  artist VARCHAR(255),\n`;
        sql += `  cover_artist VARCHAR(255),\n`;
        sql += `  format VARCHAR(100) NOT NULL,\n`;
        sql += `  size_thickness NUMERIC(5,2) NOT NULL DEFAULT 1.0,\n`;
        sql += `  current_box_id INT REFERENCES storage_boxes(id),\n`;
        sql += `  proposed_box_id INT REFERENCES storage_boxes(id),\n`;
        sql += `  reading_status VARCHAR(50) NOT NULL DEFAULT 'Unread',\n`;
        sql += `  read_count INT DEFAULT 0,\n`;
        sql += `  user_rating INT,\n`;
        sql += `  condition VARCHAR(50),\n`;
        sql += `  purchase_price NUMERIC(10,2),\n`;
        sql += `  estimated_value NUMERIC(10,2),\n`;
        sql += `  notes TEXT,\n`;
        sql += `  tags TEXT,\n`;
        sql += `  created_at TIMESTAMP WITH TIME ZONE\n`;
        sql += `  updated_at TIMESTAMP WITH TIME ZONE\n`;
        sql += `);\n\n`;

        sql += `CREATE TABLE IF NOT EXISTS creators (\n`;
        sql += `  id SERIAL PRIMARY KEY,\n`;
        sql += `  name VARCHAR(255) NOT NULL UNIQUE,\n`;
        sql += `  bio TEXT,\n`;
        sql += `  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP\n`;
        sql += `);\n\n`;

        sql += `CREATE TABLE IF NOT EXISTS creator_types (\n`;
        sql += `  id SERIAL PRIMARY KEY,\n`;
        sql += `  role_name VARCHAR(100) NOT NULL UNIQUE\n`;
        sql += `);\n\n`;

        sql += `CREATE TABLE IF NOT EXISTS comic_creator_contributions (\n`;
        sql += `  id SERIAL PRIMARY KEY,\n`;
        sql += `  comic_id VARCHAR(100) REFERENCES comic_books(id) ON DELETE CASCADE,\n`;
        sql += `  title VARCHAR(500) NOT NULL,\n`;
        sql += `  creator_id INT REFERENCES creators(id),\n`;
        sql += `  creator_name VARCHAR(255) NOT NULL,\n`;
        sql += `  creator_type_id INT REFERENCES creator_types(id),\n`;
        sql += `  role_name VARCHAR(100) NOT NULL\n`;
        sql += `);\n\n`;

        sql += `CREATE TABLE IF NOT EXISTS series_issue_totals (\n`;
        sql += `  id SERIAL PRIMARY KEY,\n`;
        sql += `  publisher VARCHAR(255) NOT NULL,\n`;
        sql += `  series_name VARCHAR(500) NOT NULL,\n`;
        sql += `  volume VARCHAR(100) NOT NULL DEFAULT '',\n`;
        sql += `  issue_count INT NOT NULL DEFAULT 0,\n`;
        sql += `  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n`;
        sql += `  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n`;
        sql += `  CONSTRAINT uq_series_issue_totals UNIQUE (series_name, volume)\n`;
        sql += `);\n\n`;
      }

      // Seed Creator Types
      sql += `-- Seed Creator Types Roles\n`;
      const creatorTypeRoles = [
        'writer',
        'penciler',
        'inker',
        'letterer',
        'colorist',
        'assistant editor',
        'editor',
        'editor-in-chief',
        'cover penciler',
        'cover inker',
        'cover letterer',
        'cover colorer',
      ];
      creatorTypeRoles.forEach((role, idx) => {
        if (dialect === 'sqlite') {
          sql += `INSERT OR IGNORE INTO creator_types (id, role_name) VALUES (${idx + 1}, '${role}');\n`;
        } else {
          sql += `INSERT INTO creator_types (id, role_name) VALUES (${idx + 1}, '${role}') ON CONFLICT (role_name) DO NOTHING;\n`;
        }
      });
      sql += `\n`;

      // Populate boxes
      if (Array.isArray(boxes)) {
        sql += `-- Insert Storage Boxes\n`;
        boxes.forEach((b: any) => {
          const escName = (b.name || '').replace(/'/g, "''");
          const escLoc = (b.location || '').replace(/'/g, "''");
          const escNotes = (b.notes || '').replace(/'/g, "''");
          sql += `INSERT INTO storage_boxes (id, name, location, max_capacity, color_tag, notes) VALUES `;
          sql += `(${b.id}, '${escName}', '${escLoc}', ${b.maxCapacity || 150}, '${b.colorTag || '#3B82F6'}', '${escNotes}');\n`;
        });
        sql += `\n`;
      }

      // Populate comics & creators
      if (Array.isArray(comics)) {
        sql += `-- Insert Comic Books\n`;
        const creatorsSet = new Set<string>();

        comics.forEach((c: any) => {
          const escTitle = (c.title || '').replace(/'/g, "''");
          const escIssue = (c.issueNumber || '').replace(/'/g, "''");
          const escVol = (c.volume || '').replace(/'/g, "''");
          const escEvent = (c.event || '').replace(/'/g, "''");
          const copiesOwned = c.copiesOwned || 1;
          const escPub = (c.publisher || '').replace(/'/g, "''");
          const escGenre = (c.genre || '').replace(/'/g, "''");
          const escWriter = (c.writer || '').replace(/'/g, "''");
          const escArtist = (c.artist || '').replace(/'/g, "''");
          const escNotes = (c.notes || '').replace(/'/g, "''");
          const tagsStr = (c.tags || []).join(',');

          if (c.writer) creatorsSet.add(c.writer);
          if (c.artist) creatorsSet.add(c.artist);
          if (Array.isArray(c.creatorContributions)) {
            c.creatorContributions.forEach((cc: any) => {
              if (cc.creatorName) creatorsSet.add(cc.creatorName);
            });
          }

          sql += `INSERT INTO comic_books (id, title, issue_number, volume, event, copies_owned, publisher, publication_year, genre, writer, artist, format, size_thickness, current_box_id, proposed_box_id, reading_status, read_count, user_rating, condition, purchase_price, estimated_value, notes, tags, created_at, updated_at) VALUES `;
          sql += `('${c.id}', '${escTitle}', '${escIssue}', '${escVol}', '${escEvent}', ${copiesOwned}, '${escPub}', ${c.publicationYear || 'NULL'}, '${escGenre}', '${escWriter}', '${escArtist}', '${c.format || 'Single Issue'}', ${c.sizeThickness || 1.0}, ${c.currentBoxId || 1}, ${c.proposedBoxId || 'NULL'}, '${c.readingStatus || 'Unread'}', ${c.readCount || 0}, ${c.userRating || 'NULL'}, '${c.condition || 'Near Mint'}', ${c.purchasePrice || 'NULL'}, ${c.estimatedValue || 'NULL'}, '${escNotes}', '${tagsStr}', '${c.createdAt || new Date().toISOString()}', '${c.updatedAt || new Date().toISOString()}');\n`, '$';
        });

        // Populate Creators
        if (creatorsSet.size > 0) {
          sql += `\n-- Insert Creators\n`;
          Array.from(creatorsSet).forEach((creatorName) => {
            const escCreator = creatorName.replace(/'/g, "''");
            if (dialect === 'sqlite') {
              sql += `INSERT OR IGNORE INTO creators (name) VALUES ('${escCreator}');\n`;
            } else {
              sql += `INSERT INTO creators (name) VALUES ('${escCreator}') ON CONFLICT (name) DO NOTHING;\n`;
            }
          });
        }

        // Populate Contributions
        sql += `\n-- Insert Creator Contributions\n`;
        comics.forEach((c: any) => {
          const escTitle = (c.title || '').replace(/'/g, "''");

          if (c.writer) {
            const escWriter = c.writer.replace(/'/g, "''");
            sql += `INSERT INTO comic_creator_contributions (comic_id, title, creator_name, role_name) VALUES ('${c.id}', '${escTitle}', '${escWriter}', 'writer');\n`;
          }
          if (c.artist && c.artist !== c.writer) {
            const escArtist = c.artist.replace(/'/g, "''");
            sql += `INSERT INTO comic_creator_contributions (comic_id, title, creator_name, role_name) VALUES ('${c.id}', '${escTitle}', '${escArtist}', 'penciler');\n`;
          }
          if (Array.isArray(c.creatorContributions)) {
            c.creatorContributions.forEach((cc: any) => {
              if (cc.creatorName && cc.roleName) {
                const escCreator = cc.creatorName.replace(/'/g, "''");
                const escRole = cc.roleName.replace(/'/g, "''").toLowerCase();
                sql += `INSERT INTO comic_creator_contributions (comic_id, title, creator_name, role_name) VALUES ('${c.id}', '${escTitle}', '${escCreator}', '${escRole}');\n`;
              }
            });
          }
        });
      }

      return res.json({ success: true, sql });
    } catch (err: any) {
      console.error('SQL Export Error:', err);
      return res.status(500).json({ error: err.message || 'Failed to export SQL script' });
    }
  });

  // --- VITE MIDDLEWARE SETUP ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
});
