-- Migration: 001_create_videos_table
-- Description: Create base videos table for storing video metadata
-- Created: 2025-01-21

-- Create videos table
CREATE TABLE IF NOT EXISTS videos (
  id VARCHAR(32) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration FLOAT,
  width INTEGER,
  height INTEGER,
  fps INTEGER,
  file_path VARCHAR(500),
  file_size BIGINT,
  format VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_created ON videos(created_at);

-- Comments
COMMENT ON TABLE videos IS 'Stores metadata for all videos in the system';
COMMENT ON COLUMN videos.id IS 'Unique identifier (CUID)';
COMMENT ON COLUMN videos.status IS 'Video status: pending, processing, completed, failed';
COMMENT ON COLUMN videos.metadata IS 'Additional metadata as JSON';