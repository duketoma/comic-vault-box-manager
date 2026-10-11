-- Migration 005: Reading Challenges, Immutable Snapshot Items, and Reading History

-- Ensure read_count column exists on comic_books
ALTER TABLE comic_books ADD COLUMN IF NOT EXISTS read_count INTEGER DEFAULT 0;

UPDATE comic_books
SET read_count = 1
WHERE reading_status = 'Read' AND (read_count IS NULL OR read_count = 0);

-- 1. Challenges table
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

-- Partial unique index ensuring only one Active challenge per collection at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_challenges_active_unique 
  ON reading_challenges (status) WHERE status = 'Active';

CREATE INDEX IF NOT EXISTS idx_reading_challenges_status_created 
  ON reading_challenges (status, created_at DESC);

-- 2. Challenge items snapshot table
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

-- 3. Reading history table
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
