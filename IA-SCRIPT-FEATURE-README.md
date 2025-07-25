# IA Script Studio - Feature Documentation

## Overview

The IA Script Studio is an advanced chat-based interface for creating video scripts using AI. It allows users to upload text files as content sources and use a sophisticated placeholder system to dynamically insert content into prompts.

## Key Features

### 1. Chat-Like Interface
- Interactive conversation flow with AI
- Real-time script generation
- Message history with timestamps
- Visual separation between user and AI messages

### 2. File Upload System
- Supports text files (.txt, .md, .csv, .json)
- File metadata display (size, lines, words)
- Multi-file selection
- File preview capabilities

### 3. Placeholder System
Dynamic content insertion with three types:
- **Full File**: Insert entire file content
- **Partial File**: Insert specific line ranges
- **Random Lines**: Insert random lines from file

Placeholder syntax: `{{placeholder_name}}`

### 4. Template Management
- Save prompts as reusable templates
- Associate files with templates
- Public/private template sharing
- Usage tracking and statistics

### 5. Configuration Persistence
All video settings saved with templates:
- Voice selection
- Music mood
- Orientation (portrait/landscape/square)
- Caption settings
- Language preferences

### 6. Direct Integration
- Review generated scripts in Video Studio
- Render videos immediately
- Seamless workflow integration

## Technical Architecture

### Database Schema

#### Tables
1. **uploaded_files**: Stores text file content and metadata
2. **script_templates**: Reusable prompt templates
3. **script_sessions**: Chat sessions and generated scripts
4. **template_file_associations**: Links templates to files
5. **session_file_associations**: Links sessions to files

### API Endpoints

#### Template Management
- `POST /api/ia-script/templates` - Create template
- `GET /api/ia-script/templates` - List templates
- `GET /api/ia-script/templates/:id` - Get template
- `PUT /api/ia-script/templates/:id` - Update template
- `DELETE /api/ia-script/templates/:id` - Delete template
- `POST /api/ia-script/templates/:id/use` - Use template

#### Session Management
- `POST /api/ia-script/sessions` - Create session
- `GET /api/ia-script/sessions/:id` - Get session
- `POST /api/ia-script/sessions/:id/chat` - Send message
- `POST /api/ia-script/sessions/:id/render` - Render video

#### File Management
- `POST /api/ia-script/files/upload` - Upload file
- `GET /api/ia-script/files` - List files
- `GET /api/ia-script/files/:id` - Get file
- `DELETE /api/ia-script/files/:id` - Delete file
- `POST /api/ia-script/files/:id/extract` - Extract content

## Usage Guide

### Getting Started

1. **Navigate to IA Script Studio**
   - Click on "IA Script Studio" in the sidebar
   - The interface opens with empty chat and file panels

2. **Upload Content Files**
   - Click "Enviar Arquivo" button
   - Select text files to use as content sources
   - Files appear in the left panel

3. **Create Your First Script**
   - Type your prompt in the input area
   - Use placeholders to reference files: `{{filename}}`
   - Configure video settings in the right panel
   - Click "Enviar" to generate script

### Using Placeholders

1. **Quick Placeholders**
   - Click the + button in the input field
   - Select placeholder type from menu
   - Configure extraction settings

2. **Manual Placeholders**
   - Type `{{placeholder_name}}` in your prompt
   - System automatically resolves to file content

3. **Placeholder Types**
   ```
   {{full_file}} - Inserts entire file content
   {{lines_1_10}} - Inserts lines 1-10
   {{random_5}} - Inserts 5 random lines
   ```

### Working with Templates

1. **Save a Template**
   - After creating a successful prompt
   - Click "Salvar Template"
   - Name and describe your template
   - Choose public/private visibility

2. **Use a Template**
   - Click the template icon in header
   - Browse available templates
   - Click "Usar" to load template

3. **Edit Templates**
   - Open template manager
   - Click edit icon on template
   - Modify and save changes

### Video Generation

1. **Review Mode**
   - Click "Revisar no Studio"
   - Opens Video Studio with script
   - Make manual adjustments if needed

2. **Direct Render**
   - Click "Renderizar Agora"
   - Video added to processing queue
   - Monitor progress in Dashboard

## Configuration Options

### Voice Settings
- Paulo (Portuguese)
- Noel (Portuguese)
- Scarlett (English)
- NinoCoelho (Portuguese)

### Music Moods
- Alegre (Happy)
- Triste (Sad)
- Animado (Excited)
- Relaxante (Chill)
- Inspiracional (Inspirational)
- Cinematográfico (Cinematic)
- Adoração (Worship)

### Video Orientation
- Portrait (9:16) - TikTok, Reels
- Landscape (16:9) - YouTube
- Square (1:1) - Instagram Feed

### Caption Settings
- Position: Top, Center, Bottom
- Background color customization
- Text color customization

## Environment Setup

### Required Environment Variables
```env
# Database Configuration (optional - feature disabled if not set)
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
# OR
DB_HOST=localhost
DB_PORT=5432
DB_NAME=short_video_maker
DB_USER=postgres
DB_PASSWORD=yourpassword

# AI Provider Keys (at least one required)
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
```

### Database Migration
```bash
# Run migrations to create tables
npm run db:migrate

# Rollback if needed
npm run db:rollback
```

## Security Considerations

1. **File Upload Security**
   - MIME type validation
   - File size limits (10MB)
   - Filename sanitization
   - Content scanning

2. **Template Security**
   - User-based permissions
   - Template injection prevention
   - Sanitized content storage

3. **Rate Limiting**
   - AI generation endpoints protected
   - Per-user request limits
   - Prevents API abuse

## Performance Optimization

1. **File Caching**
   - Recently used files cached in memory
   - Reduces database queries

2. **Template Caching**
   - Popular templates cached
   - Faster template loading

3. **Lazy Loading**
   - Files loaded on demand
   - Pagination for large lists

4. **Streaming Responses**
   - Large scripts streamed
   - Better user experience

## Troubleshooting

### Common Issues

1. **"Database not configured" error**
   - Set DATABASE_URL or DB_* environment variables
   - Run database migrations

2. **"No AI provider available" error**
   - Add OPENAI_API_KEY or GEMINI_API_KEY to .env

3. **File upload fails**
   - Check file type (must be text-based)
   - Verify file size < 10MB

4. **Placeholders not resolving**
   - Ensure file is selected
   - Check placeholder syntax

### Debug Mode
Enable debug logging:
```bash
DEBUG=ia-script:* npm run dev
```

## Future Enhancements

1. **Collaboration Features**
   - Real-time collaborative editing
   - Shared templates and sessions

2. **Advanced Placeholders**
   - Conditional placeholders
   - Dynamic transformations
   - Regular expression extraction

3. **Version Control**
   - Template versioning
   - Script history tracking
   - Diff viewer

4. **Analytics**
   - Template usage statistics
   - Success rate tracking
   - Popular prompt patterns

5. **AI Improvements**
   - Fine-tuning on successful scripts
   - Style learning from templates
   - Multi-language support

## API Usage Examples

### Create a Session
```javascript
const response = await fetch('/api/ia-script/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    config: {
      voice: 'Paulo',
      orientation: 'portrait',
      language: 'pt'
    }
  })
});
```

### Upload a File
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/ia-script/files/upload', {
  method: 'POST',
  body: formData
});
```

### Send Chat Message
```javascript
const response = await fetch(`/api/ia-script/sessions/${sessionId}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: 'Create a motivational script about {{morning_routine}}',
    fileIds: ['file123'],
    placeholderValues: {
      'morning_routine': extractedContent
    }
  })
});
```

## Contributing

When contributing to the IA Script feature:

1. Follow existing code patterns
2. Add tests for new functionality
3. Update documentation
4. Consider performance impact
5. Ensure security best practices

## License

This feature is part of the Short Video Maker project and follows the same MIT license.