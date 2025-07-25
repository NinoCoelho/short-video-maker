-- Migration: 003_create_ia_script_tables
-- Description: Create tables for IA Script feature - templates, sessions, and uploaded files
-- Created: 2025-01-25

-- Create uploaded files table
CREATE TABLE IF NOT EXISTS uploaded_files (
  id VARCHAR(32) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes BIGINT,
  content TEXT, -- For text files
  metadata JSONB, -- Line count, word count, etc.
  uploaded_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create script templates table
CREATE TABLE IF NOT EXISTS script_templates (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  placeholders JSONB DEFAULT '[]', -- Array of placeholder definitions
  default_config JSONB DEFAULT '{}', -- Default video configuration
  file_associations JSONB DEFAULT '[]', -- Associated file IDs
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT false
);

-- Create script sessions table
CREATE TABLE IF NOT EXISTS script_sessions (
  id VARCHAR(32) PRIMARY KEY,
  template_id VARCHAR(32) REFERENCES script_templates(id) ON DELETE SET NULL,
  conversation_history JSONB DEFAULT '[]', -- Array of messages
  current_script JSONB, -- Generated script
  config JSONB DEFAULT '{}', -- Video configuration
  status VARCHAR(50) DEFAULT 'draft', -- draft, generating, completed, rendered
  video_id VARCHAR(32), -- Reference to created video
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create template file associations table (many-to-many)
CREATE TABLE IF NOT EXISTS template_file_associations (
  template_id VARCHAR(32) REFERENCES script_templates(id) ON DELETE CASCADE,
  file_id VARCHAR(32) REFERENCES uploaded_files(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (template_id, file_id)
);

-- Create session file associations table (many-to-many)
CREATE TABLE IF NOT EXISTS session_file_associations (
  session_id VARCHAR(32) REFERENCES script_sessions(id) ON DELETE CASCADE,
  file_id VARCHAR(32) REFERENCES uploaded_files(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, file_id)
);

-- Indexes
CREATE INDEX idx_files_uploaded_by ON uploaded_files(uploaded_by);
CREATE INDEX idx_files_created_at ON uploaded_files(created_at);

CREATE INDEX idx_templates_created_by ON script_templates(created_by);
CREATE INDEX idx_templates_public ON script_templates(is_public);
CREATE INDEX idx_templates_usage ON script_templates(usage_count DESC);
CREATE INDEX idx_templates_created_at ON script_templates(created_at);

CREATE INDEX idx_sessions_template ON script_sessions(template_id);
CREATE INDEX idx_sessions_status ON script_sessions(status);
CREATE INDEX idx_sessions_created_by ON script_sessions(created_by);
CREATE INDEX idx_sessions_video_id ON script_sessions(video_id);
CREATE INDEX idx_sessions_created_at ON script_sessions(created_at);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_script_templates_updated_at BEFORE UPDATE
  ON script_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_script_sessions_updated_at BEFORE UPDATE
  ON script_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE uploaded_files IS 'Stores uploaded text files for IA Script feature';
COMMENT ON TABLE script_templates IS 'Stores reusable script generation templates';
COMMENT ON TABLE script_sessions IS 'Stores individual script generation sessions';
COMMENT ON TABLE template_file_associations IS 'Links templates to their associated files';
COMMENT ON TABLE session_file_associations IS 'Links sessions to files used during generation';

COMMENT ON COLUMN script_templates.placeholders IS 'JSON array of placeholder definitions with type and config';
COMMENT ON COLUMN script_templates.default_config IS 'Default video rendering configuration for this template';
COMMENT ON COLUMN script_sessions.conversation_history IS 'JSON array of chat messages between user and AI';
COMMENT ON COLUMN script_sessions.status IS 'Session status: draft, generating, completed, rendered';