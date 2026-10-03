-- Migration 004: Add cover_image_full column to comic_books for wraparound / full cover art
ALTER TABLE comic_books ADD COLUMN IF NOT EXISTS cover_image_full TEXT;
