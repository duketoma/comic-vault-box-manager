-- Migration 003: Series Issue Totals
-- Tracks publisher, series name, volume, and total published issue count for each comic series

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
