-- Migration 002: Creators, Creator Types, Title Contributors, and Character Appearances

-- 1. Creators table
CREATE TABLE IF NOT EXISTS creators (
  id SERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creators_full_name ON creators (full_name);

-- 2. Creator types table
CREATE TABLE IF NOT EXISTS creator_types (
  id SERIAL PRIMARY KEY,
  type_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Title Contributors table
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

-- 4. Title Character Appearances table
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

-- 5. Add columns to comic_books for fast direct access and indexing
ALTER TABLE comic_books ADD COLUMN IF NOT EXISTS series_name TEXT;
ALTER TABLE comic_books ADD COLUMN IF NOT EXISTS full_title TEXT;
ALTER TABLE comic_books ADD COLUMN IF NOT EXISTS character_appearances JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 6. Backfill full_title for existing records
UPDATE comic_books
SET full_title = CASE 
  WHEN issue_number IS NOT NULL AND issue_number != '' AND issue_number != 'Unknown' THEN title || ' #' || issue_number
  ELSE title
END
WHERE full_title IS NULL;

CREATE INDEX IF NOT EXISTS idx_comic_books_full_title ON comic_books (full_title);
CREATE INDEX IF NOT EXISTS idx_comic_books_series_name ON comic_books (series_name);
