# Short Video Maker Import API Documentation

Welcome to the comprehensive documentation for the Short Video Maker Import API. This API enables importing, analyzing, and processing videos from various sources to create short-form content suitable for TikTok, Instagram Reels, and YouTube Shorts.

## 📚 Documentation Overview

This documentation is organized into several focused sections:

### Core Documentation

- **[Import API Reference](./import-api.md)** - Complete REST API documentation with all endpoints, request/response schemas, and cURL examples
- **[OpenAPI Specification](./openapi.yaml)** - Machine-readable API specification in OpenAPI 3.0 format
- **[WebSocket Events Reference](./websocket-events.md)** - Real-time event documentation for monitoring import progress
- **[Examples and Best Practices](./examples-and-best-practices.md)** - Production-ready code examples and optimization strategies

## 🚀 Quick Start

### 1. Analyze a Video URL

```bash
curl -X POST "http://localhost:3233/api/import/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "options": {
      "includeTranscript": true,
      "detectSegments": true
    }
  }'
```

### 2. Start Video Import

```bash
curl -X POST "http://localhost:3233/api/import/process" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "config": {
      "segmentDetection": {
        "method": "scene-change"
      },
      "contentAnalysis": {
        "extractKeywords": true,
        "detectHighlights": true
      }
    }
  }'
```

### 3. Monitor Progress via WebSocket

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3233');
socket.emit('subscribe-import', 'your-job-id');
socket.on('import-progress', (data) => {
  console.log(`Progress: ${data.progress}%`);
});
```

## 🎯 Key Features

### Multi-Platform Support
- **YouTube**: Full video analysis with transcript extraction
- **TikTok**: Direct video downloading and processing
- **Instagram**: Reels and video content import
- **Facebook**: Video content analysis
- **Direct URLs**: Support for any direct video URL

### AI-Powered Analysis
- **Content Segmentation**: Automatic scene detection and segmentation
- **Highlight Detection**: AI identification of engaging moments
- **Keyword Extraction**: Automatic tagging and content analysis
- **Language Detection**: Multi-language content support

### Real-Time Processing
- **WebSocket Updates**: Live progress monitoring
- **Event-Driven Architecture**: Efficient resource utilization
- **Queue Management**: Intelligent job scheduling

### Translation Support
- **Multi-Provider**: OpenAI, Google, DeepL integration
- **Auto-Detection**: Automatic source language detection
- **Alternatives**: Multiple translation options provided

## 🏗️ API Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client App    │────│   REST API       │────│  Import Engine  │
│                 │    │  /api/import/*   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WebSocket     │────│   Event Bus      │────│   AI Services   │
│   Real-time     │    │                  │    │   (Ollama)      │
│   Updates       │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📋 API Endpoints Summary

### Import Operations
- `POST /api/import/analyze` - Analyze video URL without downloading
- `POST /api/import/process` - Start full import and processing
- `GET /api/import/{jobId}/status` - Monitor import progress
- `GET /api/import/{jobId}/segments` - Retrieve detected segments
- `PUT /api/import/{jobId}/segments` - Update segment boundaries
- `POST /api/import/{jobId}/highlights` - Detect video highlights

### AI Analysis (Ollama)
- `POST /api/ollama/analyze` - Local AI content analysis

### Translation Services
- `GET /api/translation/languages` - Get supported languages
- `POST /api/translation/translate` - Translate text content

### WebSocket Events
- `import-progress` - Real-time import updates
- `import-complete` - Import completion notification
- `import-error` - Error notifications
- `download-progress` - Download progress updates

## ⚙️ Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3233
NODE_ENV=production

# AI Services (Optional)
OPENAI_API_KEY=your_openai_key
GOOGLE_AI_API_KEY=your_google_key
DEEPL_API_KEY=your_deepl_key

# Local AI (Optional)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama2

# Video Providers
PEXELS_API_KEY=your_pexels_key
PIXABAY_API_KEY=your_pixabay_key
```

### Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| Import | 10 requests | 1 hour |
| Analysis | 100 requests | 1 hour |
| Translation | 200 requests | 1 hour |
| Status Checks | 1000 requests | 1 hour |

## 🎬 Common Use Cases

### 1. Content Creator Workflow
```
YouTube Video → Analyze → Import → Segment → Highlight Detection → Short Clips
```

### 2. Social Media Manager
```
Multiple Sources → Batch Import → Translation → Content Optimization → Publishing
```

### 3. Educational Content
```
Long Lectures → AI Segmentation → Key Moments → Digestible Clips
```

## 📊 Response Codes

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request successful |
| 202 | Accepted | Import job started |
| 400 | Bad Request | Invalid parameters |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

## 🔧 Error Handling

### Standard Error Format
```json
{
  "error": "Error description",
  "details": "Additional technical details",
  "code": "ERROR_CODE"
}
```

### Common Error Codes
- `INVALID_URL` - URL format is invalid
- `JOB_NOT_FOUND` - Import job doesn't exist
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `ANALYSIS_FAILED` - Video analysis failed
- `PROCESSING_FAILED` - Import processing failed

## 🛠️ Development Tools

### API Testing
Use the included [OpenAPI specification](./openapi.yaml) with tools like:
- **Swagger UI**: Interactive API documentation
- **Postman**: Import the OpenAPI spec for testing
- **Insomnia**: REST client with OpenAPI support

### Code Generation
Generate client libraries from the OpenAPI spec:
```bash
# Generate TypeScript client
npx @openapitools/openapi-generator-cli generate \
  -i docs/api/openapi.yaml \
  -g typescript-fetch \
  -o src/generated-client
```

## 🚦 Health Monitoring

### Health Check Endpoint
```bash
curl http://localhost:3233/health
```

### WebSocket Health Check
```javascript
socket.emit('ping');
socket.on('pong', () => console.log('Service healthy'));
```

### Monitoring Metrics
- Import success rate
- Average processing time
- Queue depth
- Error rates by type

## 📖 Additional Resources

### External Links
- [Socket.IO Documentation](https://socket.io/docs/)
- [OpenAPI Specification](https://swagger.io/specification/)
- [YouTube Data API](https://developers.google.com/youtube/v3)

### Internal Documentation
- [WebSocket API Overview](../../WEBSOCKET_API.md)
- [Import Feature Status](../../IMPORT-FEATURE-STATUS.md)
- [Architecture Documentation](../developer/)

## 🤝 Contributing

### Reporting Issues
When reporting API issues, please include:
- Request/response examples
- Error messages and codes
- Environment details
- Steps to reproduce

### API Versioning
The API uses semantic versioning. Breaking changes will increment the major version number.

Current version: `v1.0.0`

## 📄 License

This API documentation is part of the Short Video Maker project, licensed under the MIT License.

---

## 📞 Support

For technical support and questions:
- **GitHub Issues**: [Project Repository](https://github.com/your-repo/short-video-maker)
- **API Documentation**: This documentation
- **Community**: Join our developer community

## 🔄 Version History

- **v1.0.0** (2024-07-22) - Initial API release
  - Full import pipeline
  - WebSocket real-time updates
  - Multi-language translation
  - AI analysis integration

---

*Last updated: July 22, 2024*