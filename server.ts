import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { Pool } from 'pg';

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
  'id', 'title', 'issue_number', 'volume', 'event', 'copies_owned', 'publisher',
  'publication_year', 'publication_month', 'publication_date', 'genre', 'writer',
  'artist', 'cover_artist', 'creator_contributions', 'cover_image', 'format',
  'size_thickness', 'current_box_id', 'proposed_box_id', 'reading_status', 
  'user_rating', 'condition', 'purchase_price', 'estimated_value',
  'notes', 'tags', 'created_at', 'updated_at',
] as const;

const comicFields: Record<(typeof comicColumns)[number], string> = {
  id: 'id', title: 'title', issue_number: 'issueNumber', volume: 'volume', event: 'event',
  copies_owned: 'copiesOwned', publisher: 'publisher', publication_year: 'publicationYear',
  publication_month: 'publicationMonth', publication_date: 'publicationDate', genre: 'genre',
  writer: 'writer', artist: 'artist', cover_artist: 'coverArtist',
  creator_contributions: 'creatorContributions', cover_image: 'coverImage', format: 'format',
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
    return ['creator_contributions', 'tags'].includes(column) ? JSON.stringify(value ?? []) : value ?? null;
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
    comic[comicFields[column]] = ['creator_contributions', 'tags'].includes(column)
      ? (typeof value === 'string' ? JSON.parse(value) : value ?? [])
      : numericColumns.has(column) && value !== null && value !== undefined ? Number(value) : value;
  }
  return comic;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '25mb' }));

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
      const [comics, boxes] = await Promise.all([
        pool!.query('SELECT * FROM comic_books ORDER BY created_at DESC, title ASC'),
        pool!.query('SELECT id, name, location, max_capacity, color_tag, notes FROM storage_boxes WHERE id > 0 ORDER BY id'),
      ]);
      res.json({
        comics: comics.rows.map(rowToComic),
        boxes: boxes.rows.map((box) => ({
          id: box.id, name: box.name, location: box.location, maxCapacity: Number(box.max_capacity),
          colorTag: box.color_tag, notes: box.notes ?? undefined,
        })),
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

  // --- API ROUTE: Proxy image for 3D visualizer WebGL textures to bypass CORS ---
  app.get('/api/proxy-image', async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      if (!rawUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'Invalid URL protocol' });
      }

      const response = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Upstream image fetch failed with status ${response.status}` });
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
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

  // Helper CSV parser for public Google Sheets export
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
        if (currentRow.some(cell => cell.length > 0)) {
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
      if (currentRow.some(cell => cell.length > 0)) {
        lines.push(currentRow);
      }
    }

    return lines;
  }

  // --- API ROUTE: Google Sheets Integration ---
  app.post('/api/google-sheets/fetch', async (req, res) => {
    try {
      const { spreadsheetId, sheetName = 'Sheet1', accessToken } = req.body;
      
      if (!spreadsheetId) {
        return res.status(400).json({ error: 'spreadsheetId is required' });
      }

      // Strategy 1: If client provided OAuth access token, use Google Sheets API
      if (accessToken) {
        try {
          const auth = new google.auth.OAuth2();
          auth.setCredentials({ access_token: accessToken });
          const sheets = google.sheets({ version: 'v4', auth });
          const range = sheetName ? `'${sheetName}'!A1:Z500` : 'A1:Z500';

          const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
          });

          const rows = response.data.values;
          if (rows && rows.length > 0) {
            const headers = rows[0].map((h: any) => String(h).trim());
            const dataRows = rows.slice(1);
            return res.json({
              success: true,
              spreadsheetId,
              headers,
              rowCount: dataRows.length,
              rows: dataRows,
            });
          }
        } catch (authErr: any) {
          console.warn('Google Sheets OAuth API fetch failed, trying public CSV fallback...', authErr.message);
        }
      }

      // Strategy 2: Fallback to public CSV export endpoint (works for any sheet shared with "Anyone with the link")
      const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName || 'Sheet1')}`;
      const csvResponse = await fetch(csvUrl);

      if (csvResponse.ok) {
        const csvText = await csvResponse.text();
        if (csvText && !csvText.includes('<!DOCTYPE html>')) {
          const parsedRows = parseCSV(csvText);
          if (parsedRows.length > 0) {
            const headers = parsedRows[0];
            const dataRows = parsedRows.slice(1);
            return res.json({
              success: true,
              spreadsheetId,
              headers,
              rowCount: dataRows.length,
              rows: dataRows,
            });
          }
        }
      }

      // Secondary export URL attempt
      const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
      const exportResponse = await fetch(exportUrl);
      if (exportResponse.ok) {
        const csvText = await exportResponse.text();
        if (csvText && !csvText.includes('<!DOCTYPE html>')) {
          const parsedRows = parseCSV(csvText);
          if (parsedRows.length > 0) {
            const headers = parsedRows[0];
            const dataRows = parsedRows.slice(1);
            return res.json({
              success: true,
              spreadsheetId,
              headers,
              rowCount: dataRows.length,
              rows: dataRows,
            });
          }
        }
      }

      return res.status(400).json({
        error: 'Could not read Google Sheet. Please ensure the Google Sheet access is set to "Anyone with the link can view", or sign in with Google Drive.',
      });
    } catch (err: any) {
      console.error('Google Sheets Fetch Error:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch Google Sheet data' });
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
