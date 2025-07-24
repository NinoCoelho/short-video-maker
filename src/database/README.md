# Database Migrations

This directory contains database migrations for the short-video-maker application.

## Migration Files

### Current Migrations

1. **001_create_videos_table.sql** - Creates the base `videos` table for storing video metadata
2. **002_create_video_import_tables.sql** - Creates tables for the video import feature:
   - `import_jobs` - Tracks import job status and progress
   - `transcriptions` - Stores video transcriptions with timestamps
   - `highlights` - AI-detected highlight segments
   - `video_segments` - Video segments extracted from parent videos
   - `translations` - Translation cache to avoid duplicate API calls

### Rollback Files

Each migration has a corresponding `.down.sql` file for rollbacks.

## Database Schema

### Videos Table
- Base table for all video metadata
- Referenced by import jobs and video segments

### Import Jobs Table
- Tracks the status of video import operations
- Links to the created video record
- Stores settings and error information

### Transcriptions Table
- Stores transcribed text from videos
- Includes timestamps for synchronization
- Supports multiple languages per video

### Highlights Table
- AI-detected interesting segments
- Scored highlights with reasons and tags
- Used for automatic clip generation

### Video Segments Table
- Extracted segments from parent videos
- Supports different orientations and crop configurations
- Links to both parent and rendered videos

### Translations Table
- Caches translations to reduce API calls
- Indexed by source text hash for fast lookups
- Supports multiple language pairs

## Running Migrations

To use these migrations, you'll need to:

1. Set up PostgreSQL database
2. Configure environment variables:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=short_video_maker
   DB_USER=postgres
   DB_PASSWORD=your_password
   ```

3. Install a PostgreSQL client library:
   ```bash
   npm install pg
   ```

4. Run migrations manually or integrate with your preferred migration tool

## Notes

- All IDs use VARCHAR(32) to accommodate CUIDs
- Foreign keys include CASCADE deletes where appropriate
- Indexes are created for common query patterns
- JSONB columns store flexible metadata
- Timestamps use TIMESTAMP type (without timezone)