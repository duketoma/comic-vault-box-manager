import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { parseTitleAndIssue } from '../src/utils/titleParser';
import { POSTGRES_INIT_SCHEMA_SQL } from './schema';

// Local development overrides belong in .env.local; .env remains a shared fallback.
dotenv.config({ path: ['.env.local', '.env'] });

const databaseUrl = process.env.DATABASE_URL;
export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: process.env.DATABASE_SSL_ALLOW_SELF_SIGNED !== 'true' }
          : undefined,
    })
  : null;

export const requireDatabase: express.RequestHandler = (_req, res, next) => {
  if (!pool) {
    return res
      .status(503)
      .json({ error: 'DATABASE_URL is not configured. Add it to .env.local and restart the server.' });
  }
  next();
};

export const comicColumns = [
  'id', 'title', 'issue_number', 'volume', 'series_name', 'full_title', 'event', 'copies_owned', 'publisher',
  'publication_year', 'publication_month', 'publication_date', 'genre', 'writer',
  'artist', 'cover_artist', 'creator_contributions', 'character_appearances', 'cover_image', 'cover_image_full', 'format',
  'size_thickness', 'current_box_id', 'proposed_box_id', 'reading_status', 'read_count',
  'user_rating', 'condition', 'purchase_price', 'estimated_value',
  'notes', 'tags', 'created_at', 'updated_at',
] as const;

export const comicFields: Record<(typeof comicColumns)[number], string> = {
  id: 'id', title: 'title', issue_number: 'issueNumber', volume: 'volume',
  series_name: 'seriesName', full_title: 'fullTitle',
  event: 'event', copies_owned: 'copiesOwned', publisher: 'publisher', publication_year: 'publicationYear',
  publication_month: 'publicationMonth', publication_date: 'publicationDate', genre: 'genre',
  writer: 'writer', artist: 'artist', cover_artist: 'coverArtist',
  creator_contributions: 'creatorContributions', character_appearances: 'characterAppearances',
  cover_image: 'coverImage', cover_image_full: 'coverImageFull', format: 'format',
  size_thickness: 'sizeThickness', current_box_id: 'currentBoxId', proposed_box_id: 'proposedBoxId',
  reading_status: 'readingStatus', read_count: 'readCount', user_rating: 'userRating', condition: 'condition', purchase_price: 'purchasePrice',
  estimated_value: 'estimatedValue', notes: 'notes', tags: 'tags', created_at: 'createdAt', updated_at: 'updatedAt',
};

const comicUpdateSetClause = [
  ...comicColumns
    .filter((column) => column !== 'id' && column !== 'created_at' && column !== 'updated_at')
    .map((column) => `${column} = EXCLUDED.${column}`),
  'updated_at = NOW()',
].join(', ');

export const comicUpsertSql = `
  INSERT INTO comic_books (${comicColumns.join(', ')})
  VALUES (${comicColumns.map((_, index) => `$${index + 1}`).join(', ')})
  ON CONFLICT (id) DO UPDATE SET ${comicUpdateSetClause}`;

export function databaseErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function comicValues(comic: Record<string, unknown>) {
  const nowIso = new Date().toISOString();
  return comicColumns.map((column) => {
    const value = comic[comicFields[column]];
    if (['creator_contributions', 'character_appearances', 'tags'].includes(column)) {
      return JSON.stringify(value ?? []);
    }
    if (column === 'read_count') {
      return Number(value) || 0;
    }
    if (column === 'copies_owned') {
      const isWishlist = comic.reading_status === 'Wishlist' || comic.readingStatus === 'Wishlist';
      return isWishlist ? 0 : Math.max(1, Number(value) || 1);
    }
    if (column === 'created_at' || column === 'updated_at') {
      return value ? String(value) : nowIso;
    }
    return value ?? null;
  });
}

export async function recordDeletionTombstones(
  client: Pool | PoolClient,
  entityType: 'comic' | 'box',
  entityIds: Array<string | number>
): Promise<void> {
  const cleanIds = entityIds.map((id) => String(id).trim()).filter(Boolean);
  if (cleanIds.length === 0) return;
  await client.query(
    `INSERT INTO deleted_records (entity_type, entity_id, deleted_at)
     SELECT $1, unnest($2::text[]), NOW()
     ON CONFLICT (entity_type, entity_id) DO UPDATE SET deleted_at = NOW()`,
    [entityType, cleanIds]
  );
}

export async function clearDeletionTombstones(
  client: Pool | PoolClient,
  entityType: 'comic' | 'box',
  entityIds: Array<string | number>
): Promise<void> {
  const cleanIds = entityIds.map((id) => String(id).trim()).filter(Boolean);
  if (cleanIds.length === 0) return;
  await client.query(
    `DELETE FROM deleted_records WHERE entity_type = $1 AND entity_id = ANY($2::text[])`,
    [entityType, cleanIds]
  );
}

/**
 * Performs batched multi-row upserts into comic_books (up to 100 rows per query)
 * to eliminate N sequential round-trips when saving or replacing collections.
 */
export async function upsertComicsBatch(
  client: Pool | PoolClient,
  comics: Record<string, unknown>[],
  chunkSize = 100
): Promise<void> {
  if (!comics.length) return;
  const colsPerRow = comicColumns.length;

  for (let offset = 0; offset < comics.length; offset += chunkSize) {
    const chunk = comics.slice(offset, offset + chunkSize);
    const values: unknown[] = [];
    const rowPlaceholders: string[] = [];

    for (let rowIdx = 0; rowIdx < chunk.length; rowIdx++) {
      const rowVals = comicValues(chunk[rowIdx]);
      values.push(...rowVals);
      const base = rowIdx * colsPerRow;
      const placeholders = comicColumns.map((_, colIdx) => `$${base + colIdx + 1}`).join(', ');
      rowPlaceholders.push(`(${placeholders})`);
    }

    const batchSql = `
      INSERT INTO comic_books (${comicColumns.join(', ')})
      VALUES ${rowPlaceholders.join(', ')}
      ON CONFLICT (id) DO UPDATE SET ${comicUpdateSetClause}
    `;
    await client.query(batchSql, values);
  }
  await clearDeletionTombstones(
    client,
    'comic',
    comics.map((c) => String(c.id || ''))
  );
}

export function rowToComic(row: Record<string, unknown>) {
  const comic: Record<string, unknown> = {};
  const numericColumns = new Set([
    'copies_owned', 'publication_year', 'size_thickness', 'current_box_id', 'proposed_box_id',
    'read_count', 'user_rating', 'purchase_price', 'estimated_value',
  ]);
  for (const column of comicColumns) {
    const value = row[column];
    if (['creator_contributions', 'character_appearances', 'tags'].includes(column)) {
      comic[comicFields[column]] = typeof value === 'string' ? JSON.parse(value) : value ?? [];
    } else if (column === 'created_at' || column === 'updated_at') {
      comic[comicFields[column]] =
        value instanceof Date ? value.toISOString() : value ? String(value) : new Date().toISOString();
    } else if (numericColumns.has(column) && value !== null && value !== undefined) {
      comic[comicFields[column]] = Number(value);
    } else {
      comic[comicFields[column]] = value;
    }
  }
  if (!comic.title || !String(comic.title).trim()) {
    comic.title = (comic.fullTitle as string) || (comic.seriesName as string) || 'Untitled Comic';
  }
  if (comic.proposedBoxId === null) {
    comic.proposedBoxId = undefined;
  }
  return comic;
}

export function parseCSV(text: string): string[][] {
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

export async function initDatabase(db: Pool) {
  await db.query(POSTGRES_INIT_SCHEMA_SQL);

  // Purge any legacy sample comics (c-001 through c-014) that may have been persisted from initialData
  try {
    const purged = await db.query(
      "DELETE FROM comic_books WHERE id ~* '^c-0(0[1-9]|1[0-4])$' RETURNING id"
    );
    if (purged.rowCount && purged.rowCount > 0) {
      console.log(`Purged ${purged.rowCount} legacy sample comic(s) from database.`);
    }
  } catch (purgeErr) {
    console.warn('Sample comic cleanup warning:', purgeErr);
  }

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

  // Auto-repair any comics where full_title specifies a negative issue (e.g. #-1), but issue_number is '1' or not negative
  try {
    const negativeIssuesResult = await db.query(
      "SELECT id, title, full_title, issue_number FROM comic_books WHERE full_title ~* '#\\s*-[0-9]' AND (issue_number = '1' OR issue_number NOT LIKE '-%')"
    );
    if (negativeIssuesResult.rows.length > 0) {
      console.log(`Found ${negativeIssuesResult.rows.length} comic(s) with negative issue in full_title. Auto-repairing issue_number...`);
      for (const row of negativeIssuesResult.rows) {
        const fullTitle = row.full_title as string;
        const match = fullTitle.match(/#\s*(-\d+[a-zA-Z0-9.-]*)/i);
        if (match) {
          const correctIssue = match[1];
          await db.query(
            "UPDATE comic_books SET issue_number = $1, updated_at = NOW() WHERE id = $2",
            [correctIssue, row.id]
          );
        }
      }
      console.log(`Successfully repaired ${negativeIssuesResult.rows.length} comic issue number(s).`);
    }
  } catch (negErr) {
    console.warn('Auto-repair negative issue numbers warning:', negErr);
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
