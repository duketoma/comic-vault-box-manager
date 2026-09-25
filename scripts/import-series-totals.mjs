import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: ['.env.local', '.env'] });

const csvPath = path.resolve('db/migrations/Comic Book Collection - SeriesIssueTotal.csv');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL is not configured. Set it in .env.local.');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"') {
      if (quoted && next === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value); value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = []; value = '';
    } else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [headers, ...data] = rows;
  return data.map((cells) => Object.fromEntries(headers.map((header, index) => [header.trim(), (cells[index] ?? '').trim()])));
}

const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const client = await pool.connect();

try {
  console.log(`Reading series totals from ${csvPath}...`);
  const content = await readFile(csvPath, 'utf8');
  const rows = parseCsv(content);

  console.log(`Parsed ${rows.length} series rows. Ensuring database table exists...`);

  await client.query(`
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

  await client.query('BEGIN');

  let upserted = 0;
  const upsertQuery = `
    INSERT INTO series_issue_totals (publisher, series_name, volume, issue_count, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (series_name, volume) DO UPDATE SET
      publisher = EXCLUDED.publisher,
      issue_count = EXCLUDED.issue_count,
      updated_at = NOW()
  `;

  for (const row of rows) {
    const publisher = String(row['Publisher Name'] || row.publisher || 'Unknown Publisher').trim();
    const seriesName = String(row['Series Name'] || row.seriesName || '').trim();
    const volume = String(row.Volume || row.volume || '').trim();
    const rawCount = row['Issue Count'] || row.issueCount || '0';
    const issueCount = Math.max(0, parseInt(rawCount, 10) || 0);

    if (!seriesName) continue;

    await client.query(upsertQuery, [publisher, seriesName, volume, issueCount]);
    upserted += 1;
  }

  await client.query('COMMIT');
  console.log(`Successfully imported/upserted ${upserted} series issue totals into PostgreSQL!`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Import failed:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
