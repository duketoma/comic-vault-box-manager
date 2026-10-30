import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: ['.env.local', '.env'] });

const csvPath = path.resolve('db/migrations/Comic Book Collection - Comics.csv');
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

const numberOr = (value, fallback = null) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const integerOr = (value, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};
const enabled = (value) => String(value).trim() === '1';
const yearFromDate = (value) => {
  const match = String(value).match(/(?:18|19|20)\d{2}/);
  return match ? Number(match[0]) : null;
};
const monthFromDate = (value) => {
  const match = String(value).match(/(?:18|19|20)\d{2}[-/](0[1-9]|1[0-2])\b/);
  return match ? Number(match[0]) : null;
};
const cleaned = (value) => String(value ?? '').trim();

function buildNotes(row) {
  const existing = cleaned(row.Notes);
  const imported = [
    ['Story Arc', row['Story Arc']],
    ['Date Purchased', row['Date Purchased']],
    ['Signature', row.Signature],
    ['Slabbing', row.Slabbing],
    ['Grading', row.Grading],
    ['Grading Company', row['Grading Company']],
  ].filter(([, value]) => cleaned(value)).map(([label, value]) => `${label}: ${cleaned(value)}`);
  return [existing, ...imported].filter(Boolean).join(existing && imported.length ? '\n\n' : '');
}

function toComic(row, index) {
  const wishlist = enabled(row['In Wish List']);
  const markedRead = enabled(row['Marked Read']);
  const box = integerOr(row.Box, 0);
  const proposedBox = integerOr(row['Proposed Box']);
  const releaseDate = cleaned(row['Release Date']);
  const rawFullTitle = cleaned(row['Full Title']);
  let title = cleaned(row.Title) || cleaned(row['Series Name']) || rawFullTitle || 'Untitled Comic';
  let issueNumber = cleaned(row['Issue Number']) || 'Unknown';
  const negativeMatch = (rawFullTitle || title).match(/#\s*(-\d+[a-zA-Z0-9.-]*)/i) ||
                        (rawFullTitle || title).match(/\s+(-\d+[a-zA-Z]?)(?:\s|$|\()/i);
  if (negativeMatch && (!issueNumber || issueNumber === 'Unknown' || issueNumber === '1' || issueNumber === '0')) {
    issueNumber = negativeMatch[1];
  }
  const publisher = cleaned(row['Publisher Name']) || 'Unknown Publisher';
  const idSeed = [index, publisher, title, issueNumber, releaseDate, rawFullTitle].join('|');

  const seriesName = cleaned(row['Series Name']) || undefined;
  const fullTitle = rawFullTitle || (issueNumber && issueNumber !== 'Unknown' ? `${title} #${issueNumber}` : title);

  return {
    id: `csv-${createHash('sha256').update(idSeed).digest('hex').slice(0, 24)}`,
    title,
    issueNumber,
    volume: cleaned(row.Volume) || undefined,
    seriesName,
    fullTitle,
    event: cleaned(row.Event) || undefined,
    copiesOwned: wishlist ? 0 : Math.max(1, integerOr(row['Copies Owned'], 1)),
    publisher,
    publicationYear: yearFromDate(releaseDate),
    publicationMonth: monthFromDate(releaseDate),
    publicationDate: releaseDate || undefined,
    genre: '',
    writer: '',
    artist: '',
    creatorContributions: [],
    characterAppearances: [],
    coverImage: cleaned(row['Cover Image Link']) || cleaned(row['Image Link']) || 'https://drive.google.com/file/d/1h-E8ndmQeDajXJaZKqRW9JU9PjXZH0jX/view?usp=sharing',
    format: 'Single Issue',
    sizeThickness: Math.max(0.1, numberOr(row['Equivalant Comic Book Size Per Issue'], 1)),
    currentBoxId: wishlist && !box ? 0 : box,
    proposedBoxId: proposedBox ?? undefined,
    readingStatus: wishlist ? 'Wishlist' : markedRead ? 'Read' : 'Unread',
    readCount: markedRead ? 1 : 0,
    userRating: integerOr(row['My Rating']),
    condition: cleaned(row.Condition) || 'Near Mint',
    purchasePrice: numberOr(row['Price Paid']),
    notes: buildNotes(row) || undefined,
    tags: cleaned(row.Tags).split(/[,;]/).map((tag) => tag.trim()).filter(Boolean),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const columns = [
  'id', 'title', 'issue_number', 'volume', 'series_name', 'full_title', 'event', 'copies_owned', 'publisher', 'publication_year',
  'publication_month', 'publication_date', 'genre', 'writer', 'artist', 'cover_artist',
  'creator_contributions', 'character_appearances', 'cover_image', 'cover_image_full', 'format', 'size_thickness',
  'current_box_id', 'proposed_box_id', 'reading_status',
  'user_rating', 'condition', 'purchase_price', 'estimated_value', 'notes', 'tags', 'created_at', 'updated_at',
];
const fields = {
  id: 'id', title: 'title', issue_number: 'issueNumber', volume: 'volume',
  series_name: 'seriesName', full_title: 'fullTitle', event: 'event',
  copies_owned: 'copiesOwned', publisher: 'publisher', publication_year: 'publicationYear',
  publication_month: 'publicationMonth', publication_date: 'publicationDate', genre: 'genre', writer: 'writer',
  artist: 'artist', cover_artist: 'coverArtist', creator_contributions: 'creatorContributions',
  character_appearances: 'characterAppearances',
  cover_image: 'coverImage', cover_image_full: 'coverImageFull', format: 'format', size_thickness: 'sizeThickness',
  current_box_id: 'currentBoxId', proposed_box_id: 'proposedBoxId', reading_status: 'readingStatus',
  user_rating: 'userRating', condition: 'condition',
  purchase_price: 'purchasePrice', estimated_value: 'estimatedValue', notes: 'notes', tags: 'tags', created_at: 'createdAt', updated_at: 'updatedAt',
};
const upsertSql = `INSERT INTO comic_books (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
  ON CONFLICT (id) DO UPDATE SET ${columns.filter((column) => column !== 'id' && column !== 'created_at' && column !== 'updated_at').map((column) => `${column} = EXCLUDED.${column}`).join(', ')}, updated_at = NOW()`;
const valuesFor = (comic) => columns.map((column) => {
  const value = comic[fields[column]];
  return ['creator_contributions', 'character_appearances', 'tags'].includes(column) ? JSON.stringify(value ?? []) : value ?? null;
});

const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const client = await pool.connect();
try {
  const rows = parseCsv(await readFile(csvPath, 'utf8'));
  const comics = rows.map(toComic);
  await client.query('BEGIN');
  await client.query(`INSERT INTO storage_boxes (id, name, location, max_capacity, color_tag, notes) VALUES
    (0, 'Box 00 - Unassigned / Wishlist', 'Internal', 1, '#94A3B8', 'Hidden internal box for unassigned wishlist comics'),
    (1, 'Box 01 - Amazing Spider-Man & Marvel Silver Age', 'Top Shelf - Left', 150, '#EF4444', 'Silver & Bronze Age Marvel keys'),
    (2, 'Box 02 - X-Men & Mutants (1980s-1990s)', 'Top Shelf - Center', 150, '#F59E0B', 'Uncanny X-Men, X-Force, Wolverine'),
    (3, 'Box 03 - Batman & Gotham Detective Run', 'Top Shelf - Right', 150, '#3B82F6', 'Batman Vol. 1 & 2, Detective Comics'),
    (4, 'Box 04 - Superman & Justice League', 'Middle Rack - Shelf 1', 150, '#10B981', 'Action Comics, JLA, Flash'),
    (5, 'Box 05 - Image Comics & Creator Owned', 'Middle Rack - Shelf 2', 150, '#8B5CF6', 'Saga, Spawn, Invincible'),
    (6, 'Box 06 - Vertigo & Dark Horse Favorites', 'Middle Rack - Shelf 3', 150, '#EC4899', 'Sandman, Preacher, Hellboy'),
    (7, 'Box 07 - Trade Paperbacks & Graphic Novels A-M', 'Bottom Storage - Bay A', 150, '#6366F1', 'Thicker TPB volumes'),
    (8, 'Box 08 - Trade Paperbacks & Hardcovers N-Z', 'Bottom Storage - Bay B', 150, '#14B8A6', 'Collected hardcovers'),
    (9, 'Box 09 - Modern Marvel Era (2000-2015)', 'Bottom Storage - Bay C', 150, '#F97316', 'New Avengers, Civil War, Daredevil'),
    (10, 'Box 10 - Modern DC & Black Label', 'Closet - Shelf 1', 150, '#06B6D4', 'Batman White Knight, Watchmen, Doomsday Clock'),
    (11, 'Box 11 - Sci-Fi & Space Opera', 'Closet - Shelf 2', 150, '#84CC16', 'Star Wars, Guardians of the Galaxy, East of West'),
    (12, 'Box 12 - Horror, Crime & Mystery', 'Closet - Shelf 3', 150, '#64748B', 'Department of Truth, Criminal, Something is Killing the Children'),
    (13, 'Box 13 - Indie Publishers & Zines', 'Office Desk Cabinet', 150, '#A855F7', 'BOOM! Studios, IDW, AWA, Vault'),
    (14, 'Box 14 - Oversized Omnibuses & Hardcovers', 'Display Stand Base', 150, '#E11D48', 'Heavy omnibus volumes'),
    (15, 'Box 15 - Overflow & Unsorted Back issues', 'Worktable Staging Area', 150, '#F43F5E', 'Recent pick-ups waiting for cataloging'),
    (16, 'Box 16 - Planned', 'Planned Expansion', 150, '#64748B', 'Created from collection import'),
    (17, 'Box 17 - Planned', 'Planned Expansion', 150, '#64748B', 'Created from collection import'),
    (18, 'Box 18 - Planned', 'Planned Expansion', 150, '#64748B', 'Created from collection import')
    ON CONFLICT (id) DO NOTHING`);
  for (const comic of comics) await client.query(upsertSql, valuesFor(comic));
  await client.query('COMMIT');
  console.log(`Imported ${comics.length} comics from ${path.basename(csvPath)}.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
