-- Rollback Migration: 001_create_videos_table
-- Description: Drop the videos table
-- Created: 2025-01-21

-- Drop indexes
DROP INDEX IF EXISTS idx_videos_created;
DROP INDEX IF EXISTS idx_videos_status;

-- Drop table
DROP TABLE IF EXISTS videos CASCADE;