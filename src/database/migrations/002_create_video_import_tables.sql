-- Migration: 002_create_video_import_tables
-- Description: Create tables for video import feature
-- Created: 2025-01-21

-- Import jobs tracking
CREATE TABLE IF NOT EXISTS import_jobs (
  id VARCHAR(32) PRIMARY KEY,
  source_url TEXT NOT NULL,
  source_platform VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  video_id VARCHAR(32) REFERENCES videos(id) ON DELETE CASCADE,
  settings JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Video transcriptions
CREATE TABLE IF NOT EXISTS transcriptions (
  id VARCHAR(32) PRIMARY KEY,
  video_id VARCHAR(32) REFERENCES videos(id) ON DELETE CASCADE,
  language VARCHAR(10) NOT NULL,
  text TEXT NOT NULL,
  timestamps JSONB NOT NULL,
  confidence_score FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI-detected highlights
CREATE TABLE IF NOT EXISTS highlights (
  id VARCHAR(32) PRIMARY KEY,
  video_id VARCHAR(32) REFERENCES videos(id) ON DELETE CASCADE,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  score FLOAT NOT NULL,
  reason TEXT,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Video segments
CREATE TABLE IF NOT EXISTS video_segments (
  id VARCHAR(32) PRIMARY KEY,
  parent_video_id VARCHAR(32) REFERENCES videos(id) ON DELETE CASCADE,
  segment_number INTEGER NOT NULL,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  title VARCHAR(255),
  orientation VARCHAR(20),
  crop_config JSONB,
  transcription_segment JSONB,
  rendered_video_id VARCHAR(32) REFERENCES videos(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_video_id, segment_number)
);

-- Translation cache
CREATE TABLE IF NOT EXISTS translations (
  id VARCHAR(32) PRIMARY KEY,
  source_text_hash VARCHAR(64) NOT NULL,
  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,
  translated_text TEXT NOT NULL,
  provider VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_text_hash, source_language, target_language)
);

-- Indexes for performance
CREATE INDEX idx_import_jobs_status ON import_jobs(status);
CREATE INDEX idx_import_jobs_created ON import_jobs(created_at);
CREATE INDEX idx_transcriptions_video ON transcriptions(video_id);
CREATE INDEX idx_transcriptions_language ON transcriptions(language);
CREATE INDEX idx_highlights_video ON highlights(video_id);
CREATE INDEX idx_highlights_score ON highlights(score DESC);
CREATE INDEX idx_segments_parent ON video_segments(parent_video_id);
CREATE INDEX idx_segments_number ON video_segments(parent_video_id, segment_number);
CREATE INDEX idx_translations_hash ON translations(source_text_hash);
CREATE INDEX idx_translations_lookup ON translations(source_text_hash, source_language, target_language);

-- Comments
COMMENT ON TABLE import_jobs IS 'Tracks video import job status and progress';
COMMENT ON TABLE transcriptions IS 'Stores video transcriptions with timestamps';
COMMENT ON TABLE highlights IS 'AI-detected highlight segments from videos';
COMMENT ON TABLE video_segments IS 'Video segments extracted from parent videos';
COMMENT ON TABLE translations IS 'Cache for translated text to avoid duplicate API calls';

-- Constraints
ALTER TABLE highlights ADD CONSTRAINT chk_highlights_time CHECK (end_time > start_time);
ALTER TABLE video_segments ADD CONSTRAINT chk_segments_time CHECK (end_time > start_time);
ALTER TABLE import_jobs ADD CONSTRAINT chk_import_progress CHECK (progress >= 0 AND progress <= 100);