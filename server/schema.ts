/**
 * Shared database schema definitions and SQL export generator.
 * Serves as the single source of truth for PostgreSQL runtime initialization
 * and SQLite / PostgreSQL SQL dump generation.
 */

export const POSTGRES_INIT_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS storage_boxes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    max_capacity NUMERIC(8, 2) NOT NULL CHECK (max_capacity > 0),
    color_tag TEXT NOT NULL,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS comic_books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    issue_number TEXT NOT NULL,
    volume TEXT,
    event TEXT,
    copies_owned INTEGER NOT NULL DEFAULT 0 CHECK (copies_owned >= 0),
    publisher TEXT NOT NULL,
    publication_year INTEGER,
    publication_month TEXT,
    publication_date TEXT,
    genre TEXT,
    writer TEXT,
    artist TEXT,
    cover_artist TEXT,
    creator_contributions JSONB NOT NULL DEFAULT '[]'::jsonb,
    cover_image TEXT NOT NULL,
    format TEXT NOT NULL,
    size_thickness NUMERIC(8, 2) NOT NULL DEFAULT 1,
    current_box_id INTEGER REFERENCES storage_boxes(id) ON DELETE SET NULL,
    proposed_box_id INTEGER,
    reading_status TEXT NOT NULL DEFAULT 'Unread',
    user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
    condition TEXT,
    purchase_price NUMERIC(12, 2),
    estimated_value NUMERIC(12, 2),
    notes TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    in_collection boolean NOT NULL DEFAULT TRUE,
    created_at TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS comic_books_current_box_id_idx ON comic_books (current_box_id);
  CREATE INDEX IF NOT EXISTS comic_books_title_idx ON comic_books (title);

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
  ALTER TABLE comic_books ADD COLUMN IF NOT EXISTS cover_image_full TEXT;
  ALTER TABLE comic_books ADD COLUMN IF NOT EXISTS read_count INTEGER DEFAULT 0;

  UPDATE comic_books
  SET read_count = 1
  WHERE reading_status = 'Read' AND (read_count IS NULL OR read_count = 0);

  UPDATE comic_books
  SET full_title = CASE 
    WHEN (title ~* 'annual\\s*[''’\`][0-9]{2}' OR title ~* 'annual\\s*(19|20)[0-9]{2}' OR title ~* '(19|20)[0-9]{2}\\s*annual') THEN title
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

  CREATE TABLE IF NOT EXISTS reading_challenges (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Completed', 'Abandoned')),
    criteria_snapshot JSONB NOT NULL,
    criteria_version INTEGER NOT NULL DEFAULT 1,
    reading_order TEXT NOT NULL DEFAULT 'PublicationDate',
    sort_direction TEXT NOT NULL DEFAULT 'Ascending',
    batch_size INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    total_eligible_count INTEGER NOT NULL DEFAULT 0,
    criteria_summary TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_challenges_active_unique 
    ON reading_challenges (status) WHERE status = 'Active';

  CREATE INDEX IF NOT EXISTS idx_reading_challenges_status_created 
    ON reading_challenges (status, created_at DESC);

  CREATE TABLE IF NOT EXISTS reading_challenge_items (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES reading_challenges(id) ON DELETE CASCADE,
    comic_id TEXT REFERENCES comic_books(id) ON DELETE SET NULL,
    sequence_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Unread' CHECK (status IN ('Unread', 'Read', 'Skipped')),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    skipped_at TIMESTAMPTZ,
    metadata_snapshot JSONB NOT NULL,
    CONSTRAINT uq_challenge_item_comic UNIQUE (challenge_id, comic_id),
    CONSTRAINT uq_challenge_item_seq UNIQUE (challenge_id, sequence_number)
  );

  CREATE INDEX IF NOT EXISTS idx_challenge_items_queue 
    ON reading_challenge_items (challenge_id, status, sequence_number);

  CREATE INDEX IF NOT EXISTS idx_challenge_items_comic 
    ON reading_challenge_items (challenge_id, comic_id);

  CREATE TABLE IF NOT EXISTS reading_history (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES reading_challenges(id) ON DELETE SET NULL,
    challenge_item_id INTEGER REFERENCES reading_challenge_items(id) ON DELETE SET NULL,
    comic_id TEXT REFERENCES comic_books(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('Read', 'Unread', 'Skipped', 'Unskipped')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_reading_history_challenge 
    ON reading_history (challenge_id, occurred_at DESC);

  CREATE INDEX IF NOT EXISTS idx_reading_history_comic 
    ON reading_history (comic_id, occurred_at DESC);

  CREATE TABLE IF NOT EXISTS deleted_records (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entity_type, entity_id)
  );

  CREATE INDEX IF NOT EXISTS idx_deleted_records_deleted_at 
    ON deleted_records (deleted_at);
`;

export function sqlStr(val: unknown, fallback = ''): string {
  const raw = val === undefined || val === null ? fallback : String(val);
  return `'${raw.replace(/'/g, "''")}'`;
}

export function sqlNullableNumber(val: unknown): string {
  if (val === undefined || val === null || val === '') return 'NULL';
  const num = Number(val);
  return Number.isFinite(num) ? String(num) : 'NULL';
}

export function sqlNumber(val: unknown, fallback = 0): string {
  const num = Number(val);
  return Number.isFinite(num) ? String(num) : String(fallback);
}

export function getExportDdlSql(dialect: 'sqlite' | 'postgres'): string {
  if (dialect === 'sqlite') {
    return [
      `CREATE TABLE IF NOT EXISTS storage_boxes (`,
      `  id INTEGER PRIMARY KEY,`,
      `  name TEXT NOT NULL,`,
      `  location TEXT NOT NULL,`,
      `  max_capacity REAL NOT NULL,`,
      `  color_tag TEXT,`,
      `  notes TEXT`,
      `);\n`,
      `CREATE TABLE IF NOT EXISTS comic_books (`,
      `  id TEXT PRIMARY KEY,`,
      `  title TEXT NOT NULL,`,
      `  issue_number TEXT NOT NULL,`,
      `  volume TEXT,`,
      `  event TEXT,`,
      `  copies_owned INTEGER DEFAULT 1,`,
      `  publisher TEXT NOT NULL,`,
      `  publication_year INTEGER,`,
      `  publication_month TEXT,`,
      `  publication_date TEXT,`,
      `  genre TEXT,`,
      `  writer TEXT,`,
      `  artist TEXT,`,
      `  cover_artist TEXT,`,
      `  cover_image TEXT,`,
      `  cover_image_full TEXT,`,
      `  format TEXT NOT NULL,`,
      `  size_thickness REAL NOT NULL DEFAULT 1.0,`,
      `  current_box_id INTEGER REFERENCES storage_boxes(id),`,
      `  proposed_box_id INTEGER REFERENCES storage_boxes(id),`,
      `  reading_status TEXT NOT NULL DEFAULT 'Unread',`,
      `  read_count INTEGER DEFAULT 0,`,
      `  user_rating INTEGER,`,
      `  condition TEXT,`,
      `  purchase_price REAL,`,
      `  estimated_value REAL,`,
      `  notes TEXT,`,
      `  tags TEXT,`,
      `  created_at TEXT,`,
      `  updated_at TEXT`,
      `);\n`,
      `CREATE TABLE IF NOT EXISTS creators (`,
      `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
      `  first_name TEXT,`,
      `  last_name TEXT,`,
      `  full_name TEXT NOT NULL UNIQUE,`,
      `  bio TEXT,`,
      `  created_at TEXT`,
      `);\n`,
      `CREATE TABLE IF NOT EXISTS creator_types (`,
      `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
      `  role_name TEXT NOT NULL UNIQUE`,
      `);\n`,
      `CREATE TABLE IF NOT EXISTS comic_creator_contributions (`,
      `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
      `  comic_id TEXT REFERENCES comic_books(id),`,
      `  title TEXT NOT NULL,`,
      `  creator_id INTEGER REFERENCES creators(id),`,
      `  creator_name TEXT NOT NULL,`,
      `  creator_type_id INTEGER REFERENCES creator_types(id),`,
      `  role_name TEXT NOT NULL`,
      `);\n`,
      `CREATE TABLE IF NOT EXISTS series_issue_totals (`,
      `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
      `  publisher TEXT NOT NULL,`,
      `  series_name TEXT NOT NULL,`,
      `  volume TEXT NOT NULL DEFAULT '',`,
      `  issue_count INTEGER NOT NULL DEFAULT 0,`,
      `  created_at TEXT DEFAULT CURRENT_TIMESTAMP,`,
      `  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,`,
      `  UNIQUE(series_name, volume)`,
      `);\n\n`,
    ].join('\n');
  }

  return [
    `CREATE TABLE IF NOT EXISTS storage_boxes (`,
    `  id INT PRIMARY KEY,`,
    `  name VARCHAR(255) NOT NULL,`,
    `  location VARCHAR(255) NOT NULL,`,
    `  max_capacity NUMERIC(6,2) NOT NULL,`,
    `  color_tag VARCHAR(50),`,
    `  notes TEXT`,
    `);\n`,
    `CREATE TABLE IF NOT EXISTS comic_books (`,
    `  id VARCHAR(100) PRIMARY KEY,`,
    `  title VARCHAR(500) NOT NULL,`,
    `  issue_number VARCHAR(255) NOT NULL,`,
    `  volume VARCHAR(100),`,
    `  event VARCHAR(255),`,
    `  copies_owned INT DEFAULT 1,`,
    `  publisher VARCHAR(255) NOT NULL,`,
    `  publication_year INT,`,
    `  publication_month INT,`,
    `  publication_date DATE,`,
    `  genre VARCHAR(100),`,
    `  writer VARCHAR(255),`,
    `  artist VARCHAR(255),`,
    `  cover_artist VARCHAR(255),`,
    `  cover_image TEXT,`,
    `  cover_image_full TEXT,`,
    `  format VARCHAR(100) NOT NULL,`,
    `  size_thickness NUMERIC(5,2) NOT NULL DEFAULT 1.0,`,
    `  current_box_id INT REFERENCES storage_boxes(id),`,
    `  proposed_box_id INT REFERENCES storage_boxes(id),`,
    `  reading_status VARCHAR(50) NOT NULL DEFAULT 'Unread',`,
    `  read_count INT DEFAULT 0,`,
    `  user_rating INT,`,
    `  condition VARCHAR(50),`,
    `  purchase_price NUMERIC(10,2),`,
    `  estimated_value NUMERIC(10,2),`,
    `  notes TEXT,`,
    `  tags TEXT,`,
    `  created_at TIMESTAMP WITH TIME ZONE,`,
    `  updated_at TIMESTAMP WITH TIME ZONE`,
    `);\n`,
    `CREATE TABLE IF NOT EXISTS creators (`,
    `  id SERIAL PRIMARY KEY,`,
    `  first_name VARCHAR(255),`,
    `  last_name VARCHAR(255),`,
    `  full_name VARCHAR(255) NOT NULL UNIQUE,`,
    `  bio TEXT,`,
    `  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`,
    `);\n`,
    `CREATE TABLE IF NOT EXISTS creator_types (`,
    `  id SERIAL PRIMARY KEY,`,
    `  role_name VARCHAR(100) NOT NULL UNIQUE`,
    `);\n`,
    `CREATE TABLE IF NOT EXISTS comic_creator_contributions (`,
    `  id SERIAL PRIMARY KEY,`,
    `  comic_id VARCHAR(100) REFERENCES comic_books(id) ON DELETE CASCADE,`,
    `  title VARCHAR(500) NOT NULL,`,
    `  creator_id INT REFERENCES creators(id),`,
    `  creator_name VARCHAR(255) NOT NULL,`,
    `  creator_type_id INT REFERENCES creator_types(id),`,
    `  role_name VARCHAR(100) NOT NULL`,
    `);\n`,
    `CREATE TABLE IF NOT EXISTS series_issue_totals (`,
    `  id SERIAL PRIMARY KEY,`,
    `  publisher VARCHAR(255) NOT NULL,`,
    `  series_name VARCHAR(500) NOT NULL,`,
    `  volume VARCHAR(100) NOT NULL DEFAULT '',`,
    `  issue_count INT NOT NULL DEFAULT 0,`,
    `  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,`,
    `  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,`,
    `  CONSTRAINT uq_series_issue_totals UNIQUE (series_name, volume)`,
    `);\n\n`,
  ].join('\n');
}

const DEFAULT_CREATOR_TYPE_ROLES = [
  'writer',
  'penciller',
  'inker',
  'letterer',
  'colorist',
  'assistant editor',
  'editor',
  'editor-in-chief',
  'cover penciller',
  'cover inker',
  'cover letterer',
  'cover colorist',
];

export function generateSqlExportScript({
  comics,
  boxes,
  dialect = 'sqlite',
}: {
  comics?: any[];
  boxes?: any[];
  dialect?: string;
}): string {
  const normalizedDialect: 'sqlite' | 'postgres' = dialect === 'sqlite' ? 'sqlite' : 'postgres';
  let sql = `-- Comic Book Collection SQL Import Script (${normalizedDialect.toUpperCase()})\n`;
  sql += `-- Generated on ${new Date().toISOString()}\n\n`;
  sql += getExportDdlSql(normalizedDialect);

  // Seed Creator Types
  sql += `-- Seed Creator Types Roles\n`;
  DEFAULT_CREATOR_TYPE_ROLES.forEach((role, idx) => {
    const escapedRole = sqlStr(role);
    if (normalizedDialect === 'sqlite') {
      sql += `INSERT OR IGNORE INTO creator_types (id, role_name) VALUES (${idx + 1}, ${escapedRole});\n`;
    } else {
      sql += `INSERT INTO creator_types (id, role_name) VALUES (${idx + 1}, ${escapedRole}) ON CONFLICT (role_name) DO NOTHING;\n`;
    }
  });
  sql += `\n`;

  // Populate boxes
  if (Array.isArray(boxes)) {
    sql += `-- Insert Storage Boxes\n`;
    boxes.forEach((b: any) => {
      sql += `INSERT INTO storage_boxes (id, name, location, max_capacity, color_tag, notes) VALUES (`;
      sql += [
        sqlNumber(b.id, 1),
        sqlStr(b.name),
        sqlStr(b.location),
        sqlNumber(b.maxCapacity, 150),
        sqlStr(b.colorTag, '#3B82F6'),
        sqlStr(b.notes),
      ].join(', ');
      sql += `);\n`;
    });
    sql += `\n`;
  }

  // Populate comics & creators
  if (Array.isArray(comics)) {
    sql += `-- Insert Comic Books\n`;
    const creatorsSet = new Set<string>();
    const nowIso = new Date().toISOString();

    comics.forEach((c: any) => {
      const copiesOwned = c.copiesOwned ?? 1;
      const tagsStr = Array.isArray(c.tags) ? c.tags.join(',') : String(c.tags || '');

      if (c.writer) creatorsSet.add(String(c.writer));
      if (c.artist) creatorsSet.add(String(c.artist));
      if (Array.isArray(c.creatorContributions)) {
        c.creatorContributions.forEach((cc: any) => {
          if (cc?.creatorName) creatorsSet.add(String(cc.creatorName));
        });
      }

      sql += `INSERT INTO comic_books (id, title, issue_number, volume, event, copies_owned, publisher, publication_year, genre, writer, artist, format, size_thickness, current_box_id, proposed_box_id, reading_status, read_count, user_rating, condition, purchase_price, estimated_value, notes, tags, created_at, updated_at) VALUES (`;
      sql += [
        sqlStr(c.id),
        sqlStr(c.title),
        sqlStr(c.issueNumber),
        sqlStr(c.volume),
        sqlStr(c.event),
        sqlNumber(copiesOwned, 1),
        sqlStr(c.publisher),
        sqlNullableNumber(c.publicationYear),
        sqlStr(c.genre),
        sqlStr(c.writer),
        sqlStr(c.artist),
        sqlStr(c.format, 'Single Issue'),
        sqlNumber(c.sizeThickness, 1.0),
        sqlNumber(c.currentBoxId, 1),
        sqlNullableNumber(c.proposedBoxId),
        sqlStr(c.readingStatus, 'Unread'),
        sqlNumber(c.readCount, 0),
        sqlNullableNumber(c.userRating),
        sqlStr(c.condition, 'Near Mint'),
        sqlNullableNumber(c.purchasePrice),
        sqlNullableNumber(c.estimatedValue),
        sqlStr(c.notes),
        sqlStr(tagsStr),
        sqlStr(c.createdAt, nowIso),
        sqlStr(c.updatedAt, nowIso),
      ].join(', ');
      sql += `);\n`;
    });

    // Populate Creators
    if (creatorsSet.size > 0) {
      sql += `\n-- Insert Creators\n`;
      Array.from(creatorsSet).forEach((creatorName) => {
        const escCreator = sqlStr(creatorName);
        if (normalizedDialect === 'sqlite') {
          sql += `INSERT OR IGNORE INTO creators (full_name) VALUES (${escCreator});\n`;
        } else {
          sql += `INSERT INTO creators (full_name) VALUES (${escCreator}) ON CONFLICT (full_name) DO NOTHING;\n`;
        }
      });
    }

    // Populate Contributions
    sql += `\n-- Insert Creator Contributions\n`;
    comics.forEach((c: any) => {
      const escId = sqlStr(c.id);
      const escTitle = sqlStr(c.title);

      if (c.writer) {
        sql += `INSERT INTO comic_creator_contributions (comic_id, title, creator_name, role_name) VALUES (${escId}, ${escTitle}, ${sqlStr(c.writer)}, 'writer');\n`;
      }
      if (c.artist && c.artist !== c.writer) {
        sql += `INSERT INTO comic_creator_contributions (comic_id, title, creator_name, role_name) VALUES (${escId}, ${escTitle}, ${sqlStr(c.artist)}, 'penciller');\n`;
      }
      if (Array.isArray(c.creatorContributions)) {
        c.creatorContributions.forEach((cc: any) => {
          if (cc?.creatorName && cc?.roleName) {
            sql += `INSERT INTO comic_creator_contributions (comic_id, title, creator_name, role_name) VALUES (${escId}, ${escTitle}, ${sqlStr(cc.creatorName)}, ${sqlStr(String(cc.roleName).toLowerCase())});\n`;
          }
        });
      }
    });
  }

  return sql;
}
