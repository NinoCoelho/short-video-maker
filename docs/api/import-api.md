# Import API Documentation

The Import API provides comprehensive video import functionality with support for analyzing, downloading, processing, and segmenting videos from various sources including YouTube, TikTok, Instagram, Facebook, and direct URLs.

## Table of Contents

- [Base Configuration](#base-configuration)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Import Endpoints](#import-endpoints)
- [Ollama AI Analysis Endpoints](#ollama-ai-analysis-endpoints)
- [Translation Endpoints](#translation-endpoints)
- [WebSocket Events](#websocket-events)
- [Error Handling](#error-handling)
- [Usage Examples](#usage-examples)

## Base Configuration

**Base URL**: `http://localhost:3233/api`  
**Content-Type**: `application/json`  
**Server Port**: 3233 (configurable via `PORT` environment variable)

## Authentication

Currently, the Import API does not require authentication tokens. However, some features require API keys to be configured server-side:

### Required Environment Variables

```bash
# AI Analysis (Optional - for enhanced features)
OPENAI_API_KEY=your_openai_key
GOOGLE_AI_API_KEY=your_google_key
DEEPL_API_KEY=your_deepl_key

# Ollama Local AI (Optional)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama2

# Video Provider API Keys (Required for video downloads)
PEXELS_API_KEY=your_pexels_key
PIXABAY_API_KEY=your_pixabay_key
```

## Rate Limiting

The API implements rate limiting using `express-rate-limit` middleware:

- **Import Operations**: 10 requests per hour per IP
- **Analysis Operations**: 100 requests per hour per IP  
- **Translation Operations**: 200 requests per hour per IP
- **Status Checks**: 1000 requests per hour per IP

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1640995200
```

## Import Endpoints

### 1. Analyze URL

Analyze a video URL to extract metadata without downloading.

**Endpoint**: `POST /api/import/analyze`

**Request Body**:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "options": {
    "includeTranscript": true,
    "detectSegments": true,
    "analyzeContent": true
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "metadata": {
    "title": "Rick Astley - Never Gonna Give You Up",
    "duration": 213,
    "format": "mp4",
    "resolution": "1920x1080",
    "fileSize": 52428800,
    "fps": 30,
    "codec": "h264",
    "audioCodec": "aac",
    "thumbnail": "/api/thumbnail/abc123.jpg",
    "canDownload": true,
    "estimatedProcessingTime": 42,
    "platform": "youtube",
    "sourceUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "transcript": "Never gonna give you up, never gonna let you down...",
    "language": "en",
    "hasClosedCaptions": true,
    "suggestedSegments": [
      {
        "startTime": 0,
        "endTime": 60,
        "confidence": 0.8
      },
      {
        "startTime": 60,
        "endTime": 120,
        "confidence": 0.75
      }
    ]
  },
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "analyzedAt": "2024-07-22T10:30:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid URL or request parameters
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Analysis failed

**cURL Example**:
```bash
curl -X POST "http://localhost:3233/api/import/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "options": {
      "includeTranscript": true,
      "detectSegments": true,
      "analyzeContent": true
    }
  }'
```

### 2. Start Import Process

Begin full video import with processing pipeline.

**Endpoint**: `POST /api/import/process`

**Request Body**:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "config": {
    "segmentDetection": {
      "method": "scene-change",
      "threshold": 0.5,
      "duration": 30
    },
    "contentAnalysis": {
      "extractKeywords": true,
      "generateSummary": true,
      "detectHighlights": true
    },
    "translation": {
      "enabled": true,
      "targetLanguage": "es",
      "preserveOriginal": true
    }
  }
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Import process started",
  "statusUrl": "/api/import/550e8400-e29b-41d4-a716-446655440000/status"
}
```

**cURL Example**:
```bash
curl -X POST "http://localhost:3233/api/import/process" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "config": {
      "segmentDetection": {
        "method": "ai-analysis"
      },
      "contentAnalysis": {
        "extractKeywords": true,
        "generateSummary": true
      }
    }
  }'
```

### 3. Get Import Status

Monitor import job progress and status.

**Endpoint**: `GET /api/import/:id/status`

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "status": "processing",
  "progress": 65,
  "metadata": {
    "title": "Rick Astley - Never Gonna Give You Up",
    "duration": 213,
    "format": "mp4",
    "resolution": "1920x1080",
    "fileSize": 52428800
  },
  "segmentCount": 4,
  "createdAt": "2024-07-22T10:30:00.000Z",
  "updatedAt": "2024-07-22T10:32:15.000Z"
}
```

**Status Values**:
- `pending`: Job created, waiting to start
- `analyzing`: Analyzing video metadata
- `downloading`: Downloading video file
- `processing`: Processing video content
- `segmenting`: Detecting and creating segments
- `completed`: Import completed successfully
- `failed`: Import failed with error

**cURL Example**:
```bash
curl "http://localhost:3233/api/import/550e8400-e29b-41d4-a716-446655440000/status"
```

### 4. Get Video Segments

Retrieve detected video segments after import completion.

**Endpoint**: `GET /api/import/:id/segments`

**Response** (200 OK):
```json
{
  "segments": [
    {
      "id": "seg-1",
      "startTime": 0,
      "endTime": 60,
      "title": "Introduction",
      "description": "Video introduction and setup",
      "keywords": ["intro", "welcome", "overview"]
    },
    {
      "id": "seg-2", 
      "startTime": 60,
      "endTime": 120,
      "title": "Main Content",
      "description": "Core content of the video",
      "keywords": ["main", "content", "tutorial"]
    }
  ],
  "metadata": {
    "totalDuration": 213,
    "segmentCount": 4
  }
}
```

**Error Responses**:
- `404 Not Found`: Import job not found
- `400 Bad Request`: Segments not available (import not completed)

**cURL Example**:
```bash
curl "http://localhost:3233/api/import/550e8400-e29b-41d4-a716-446655440000/segments"
```

### 5. Update Segments

Modify segment boundaries and metadata.

**Endpoint**: `PUT /api/import/:id/segments`

**Request Body**:
```json
{
  "segments": [
    {
      "id": "seg-1",
      "startTime": 0,
      "endTime": 65,
      "title": "Updated Introduction",
      "description": "Extended introduction section",
      "keywords": ["intro", "welcome", "overview", "extended"]
    },
    {
      "id": "seg-2",
      "startTime": 65,
      "endTime": 135,
      "title": "Main Tutorial",
      "keywords": ["tutorial", "main", "guide"]
    }
  ]
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Segments updated successfully",
  "segments": [
    {
      "id": "seg-1",
      "startTime": 0,
      "endTime": 65,
      "title": "Updated Introduction",
      "description": "Extended introduction section",
      "keywords": ["intro", "welcome", "overview", "extended"]
    }
  ]
}
```

**cURL Example**:
```bash
curl -X PUT "http://localhost:3233/api/import/550e8400-e29b-41d4-a716-446655440000/segments" \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [
      {
        "id": "seg-1", 
        "startTime": 0,
        "endTime": 65,
        "title": "Updated Introduction"
      }
    ]
  }'
```

### 6. Detect Highlights

Use AI to identify the best segments for short-form content.

**Endpoint**: `POST /api/import/:id/highlights`

**Request Body**:
```json
{
  "prompt": "Find the most engaging moments suitable for TikTok",
  "maxHighlights": 5,
  "minDuration": 15,
  "criteria": ["engagement", "visual-quality", "audio-clarity"]
}
```

**Response** (200 OK):
```json
{
  "highlights": [
    {
      "segmentId": "seg-2",
      "startTime": 60,
      "endTime": 90,
      "score": 0.87,
      "reason": "High engagement potential with clear audio and visual content",
      "suggestedTitle": "Best Part - Tutorial Highlight"
    },
    {
      "segmentId": "seg-1",
      "startTime": 30,
      "endTime": 50,
      "score": 0.72,
      "reason": "Good introduction with hook potential",
      "suggestedTitle": "Intro Hook"
    }
  ],
  "criteria": ["engagement", "visual-quality", "audio-clarity"],
  "totalAnalyzed": 4
}
```

**cURL Example**:
```bash
curl -X POST "http://localhost:3233/api/import/550e8400-e29b-41d4-a716-446655440000/highlights" \
  -H "Content-Type: application/json" \
  -d '{
    "maxHighlights": 3,
    "criteria": ["engagement", "visual-quality"]
  }'
```

## Ollama AI Analysis Endpoints

Local AI analysis using Ollama models for content understanding.

### Analyze Content

**Endpoint**: `POST /api/ollama/analyze`

**Request Body**:
```json
{
  "content": "This is a tutorial about cooking pasta. First, boil water...",
  "prompt": "Summarize this cooking tutorial and extract key steps",
  "model": "llama2",
  "options": {
    "temperature": 0.7,
    "maxTokens": 500
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "analysis": "This cooking tutorial covers pasta preparation with the following key steps: 1. Boil water in a large pot, 2. Add salt to the water, 3. Add pasta and cook according to package directions...",
  "model": "llama2",
  "totalDuration": 1250,
  "promptEvalCount": 45,
  "analyzedAt": "2024-07-22T10:30:00.000Z"
}
```

**Fallback Response** (200 OK - when Ollama unavailable):
```json
{
  "success": false,
  "error": "Ollama service not available",
  "analysis": "Please ensure Ollama is running and the specified model is available",
  "model": "unavailable",
  "details": "Connection refused to localhost:11434",
  "fallback": true
}
```

**cURL Example**:
```bash
curl -X POST "http://localhost:3233/api/ollama/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Video transcript here...",
    "prompt": "Extract main topics and create a summary",
    "model": "llama2"
  }'
```

## Translation Endpoints

Multi-provider translation service supporting OpenAI, Google, and DeepL.

### Get Supported Languages

**Endpoint**: `GET /api/translation/languages`

**Response** (200 OK):
```json
{
  "languages": [
    {
      "code": "en",
      "name": "English",
      "nativeName": "English"
    },
    {
      "code": "es", 
      "name": "Spanish",
      "nativeName": "Español"
    },
    {
      "code": "fr",
      "name": "French", 
      "nativeName": "Français"
    }
  ],
  "defaultSource": "auto",
  "defaultTarget": "en"
}
```

**cURL Example**:
```bash
curl "http://localhost:3233/api/translation/languages"
```

### Translate Text

**Endpoint**: `POST /api/translation/translate`

**Request Body**:
```json
{
  "text": "Hello, how are you today?",
  "targetLanguage": "es",
  "sourceLanguage": "en"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "translation": {
    "translatedText": "Hola, ¿cómo estás hoy?",
    "sourceLanguage": "en",
    "targetLanguage": "es",
    "confidence": 0.98,
    "alternatives": [
      "Hola, ¿cómo te encuentras hoy?",
      "Hola, ¿qué tal estás hoy?"
    ],
    "provider": "openai"
  },
  "translatedAt": "2024-07-22T10:30:00.000Z"
}
```

**cURL Example**:
```bash
curl -X POST "http://localhost:3233/api/translation/translate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "targetLanguage": "es"
  }'
```

## WebSocket Events

Real-time updates for import progress using Socket.IO.

### Connection

**URL**: `ws://localhost:3233`

**Client Connection**:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3233');

// Subscribe to import job updates
socket.emit('subscribe-import', 'job-id-here');
```

### Import Progress Events

**Event**: `import-progress`

```javascript
socket.on('import-progress', (data) => {
  console.log('Import progress:', data);
});
```

**Event Data**:
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 65,
  "status": "processing",
  "message": "Extracting audio and analyzing content...",
  "updatedAt": "2024-07-22T10:32:15.000Z"
}
```

**Event**: `import-complete`

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "videoId": "vid-12345",
  "timestamp": "2024-07-22T10:35:00.000Z"
}
```

**Event**: `import-error`

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "error": "Failed to download video: Network timeout",
  "timestamp": "2024-07-22T10:33:00.000Z"
}
```

### Download Progress Events

**Event**: `download-progress`

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "videoId": "vid-12345",
  "progress": 45,
  "downloadedBytes": 23456789,
  "totalBytes": 52428800,
  "speed": "1.2 MB/s",
  "eta": "00:02:30",
  "timestamp": "2024-07-22T10:31:30.000Z"
}
```

### Connection Management

```javascript
// Subscribe to specific import job
socket.emit('subscribe-import', 'job-id');

// Unsubscribe from import job  
socket.emit('unsubscribe-import', 'job-id');

// Health check
socket.emit('ping');
socket.on('pong', () => console.log('Connection healthy'));

// Handle disconnection
socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

## Error Handling

### Standard Error Format

```json
{
  "error": "Error message describing what went wrong",
  "details": "Additional technical details",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_URL` | URL format is invalid |
| 400 | `INVALID_REQUEST` | Request body validation failed |
| 404 | `JOB_NOT_FOUND` | Import job ID not found |
| 404 | `SEGMENTS_NOT_AVAILABLE` | Segments not ready (import incomplete) |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `ANALYSIS_FAILED` | Video analysis failed |
| 500 | `DOWNLOAD_FAILED` | Video download failed |
| 500 | `PROCESSING_FAILED` | Video processing failed |
| 503 | `SERVICE_UNAVAILABLE` | External service (Ollama, AI) unavailable |

### Error Handling Best Practices

1. **Check Status Codes**: Always check HTTP status codes
2. **Parse Error Details**: Use the `details` field for debugging
3. **Implement Retry Logic**: For 5xx errors and rate limits
4. **Handle Timeouts**: Import jobs can take several minutes
5. **Monitor WebSocket**: Use WebSocket events for real-time updates

## Usage Examples

### Complete Import Workflow

```javascript
async function importVideo(url) {
  try {
    // 1. First analyze the URL
    const analysis = await fetch('/api/import/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url,
        options: { 
          includeTranscript: true,
          detectSegments: true 
        }
      })
    });
    
    const { metadata } = await analysis.json();
    console.log('Video duration:', metadata.duration);
    
    // 2. Start the import process
    const importResponse = await fetch('/api/import/process', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        config: {
          segmentDetection: { method: 'ai-analysis' },
          contentAnalysis: { extractKeywords: true }
        }
      })
    });
    
    const { jobId, statusUrl } = await importResponse.json();
    console.log('Import job started:', jobId);
    
    // 3. Monitor progress via WebSocket
    const socket = io('http://localhost:3233');
    socket.emit('subscribe-import', jobId);
    
    socket.on('import-progress', (data) => {
      console.log(`Progress: ${data.progress}% - ${data.message}`);
    });
    
    socket.on('import-complete', async (data) => {
      console.log('Import completed!');
      
      // 4. Get the segments
      const segments = await fetch(`/api/import/${jobId}/segments`);
      const { segments: videoSegments } = await segments.json();
      
      // 5. Detect highlights
      const highlights = await fetch(`/api/import/${jobId}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          maxHighlights: 3,
          criteria: ['engagement', 'visual-quality']
        })
      });
      
      const { highlights: bestMoments } = await highlights.json();
      console.log('Best moments:', bestMoments);
      
      socket.disconnect();
    });
    
    socket.on('import-error', (data) => {
      console.error('Import failed:', data.error);
      socket.disconnect();
    });
    
  } catch (error) {
    console.error('Import workflow failed:', error);
  }
}
```

### Batch Processing

```javascript
async function batchImport(urls) {
  const jobs = [];
  
  for (const url of urls) {
    try {
      const response = await fetch('/api/import/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const { jobId } = await response.json();
      jobs.push({ url, jobId });
      
      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to start import for ${url}:`, error);
    }
  }
  
  // Monitor all jobs
  const socket = io('http://localhost:3233');
  let completedJobs = 0;
  
  jobs.forEach(({ jobId }) => {
    socket.emit('subscribe-import', jobId);
  });
  
  socket.on('import-complete', (data) => {
    completedJobs++;
    console.log(`Job ${data.jobId} completed (${completedJobs}/${jobs.length})`);
    
    if (completedJobs === jobs.length) {
      console.log('All imports completed!');
      socket.disconnect();
    }
  });
}
```

### Error Recovery

```javascript
async function robustImport(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('/api/import/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      if (response.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = response.headers.get('Retry-After') || 60;
        console.log(`Rate limited. Waiting ${retryAfter}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const { jobId } = await response.json();
      return jobId;
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw new Error(`Import failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## Performance Optimization

### Tips for Better Performance

1. **Use Analysis First**: Call `/analyze` before `/process` to validate URLs
2. **Configure Segments Wisely**: Choose appropriate segmentation methods
3. **Monitor Progress**: Use WebSocket events instead of polling status
4. **Batch Operations**: Group multiple operations when possible
5. **Handle Rate Limits**: Implement exponential backoff

### Recommended Configuration

```json
{
  "config": {
    "segmentDetection": {
      "method": "scene-change",
      "threshold": 0.3
    },
    "contentAnalysis": {
      "extractKeywords": true,
      "generateSummary": false,
      "detectHighlights": true
    }
  }
}
```

This configuration balances processing speed with analysis quality.