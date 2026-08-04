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
