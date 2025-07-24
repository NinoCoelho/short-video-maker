-- Rollback Migration: 002_create_video_import_tables
-- Description: Drop tables created for video import feature
-- Created: 2025-01-21

-- Drop indexes first
DROP INDEX IF EXISTS idx_translations_lookup;
DROP INDEX IF EXISTS idx_translations_hash;
DROP INDEX IF EXISTS idx_segments_number;
DROP INDEX IF EXISTS idx_segments_parent;
DROP INDEX IF EXISTS idx_highlights_score;
DROP INDEX IF EXISTS idx_highlights_video;
DROP INDEX IF EXISTS idx_transcriptions_language;
DROP INDEX IF EXISTS idx_transcriptions_video;
DROP INDEX IF EXISTS idx_import_jobs_created;
DROP INDEX IF EXISTS idx_import_jobs_status;

-- Drop tables in reverse order of dependencies
DROP TABLE IF EXISTS translations CASCADE;
DROP TABLE IF EXISTS video_segments CASCADE;
DROP TABLE IF EXISTS highlights CASCADE;
DROP TABLE IF EXISTS transcriptions CASCADE;
DROP TABLE IF EXISTS import_jobs CASCADE;