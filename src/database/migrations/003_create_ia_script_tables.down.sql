-- Migration: 003_create_ia_script_tables (rollback)
-- Description: Drop tables created for IA Script feature
-- Created: 2025-01-25

-- Drop triggers
DROP TRIGGER IF EXISTS update_script_templates_updated_at ON script_templates;
DROP TRIGGER IF EXISTS update_script_sessions_updated_at ON script_sessions;

-- Drop function if no other tables use it
-- Note: Only drop if this was the first migration to create it
-- DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop association tables first (foreign key constraints)
DROP TABLE IF EXISTS session_file_associations;
DROP TABLE IF EXISTS template_file_associations;

-- Drop main tables
DROP TABLE IF EXISTS script_sessions;
DROP TABLE IF EXISTS script_templates;
DROP TABLE IF EXISTS uploaded_files;