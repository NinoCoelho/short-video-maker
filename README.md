# 🎬 Short Video Maker

> **AI-Powered Professional Short Video Creation Platform** - A comprehensive solution for creating videos for TikTok, Instagram Reels, and YouTube Shorts

![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.8+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ Key Features

### 🎬 **Core Video Creation**
- **AI Script Generation** - Automated script creation with OpenAI & Google Generative AI
- **Multi-Provider TTS** - ElevenLabs and local TTS support
- **Background Videos** - Integration with Pixabay, Pexels, and Unsplash
- **Remotion Rendering** - React-based programmatic video creation
- **Real-time Updates** - WebSocket-based progress tracking

### 📥 **Video Import & Processing**
- **Multi-Platform Import** - YouTube, TikTok, Instagram, Facebook support
- **Automatic Transcription** - Video-to-text conversion
- **AI Highlight Detection** - Smart scene extraction
- **Video Segmentation** - Automatic clip creation
- **Translation Pipeline** - Multi-language support

### 🌐 **Translation System**
- **Multiple Providers** - Google Cloud, DeepL, OpenAI, Ollama
- **Context-Aware Translation** - Style and cultural adaptation
- **Caching System** - Reduced API costs
- **Batch Processing** - Efficient bulk translations

### 🔒 **Security & Performance**
- **Path Traversal Protection** - Secure file operations
- **SSRF Protection** - Domain allowlisting
- **Rate Limiting** - Configurable API limits
- **Performance Monitoring** - Real-time system analysis
- **Memory Leak Detection** - Automatic prevention
- **Resource Optimization** - CPU, Memory, IO tracking

## 🏗️ Architecture

### **Event-Driven Design**
- Central EventBus for service communication
- WebSocket server for real-time updates
- Priority-based queue system with retry logic
- Memory-efficient weak references

### **Microservices Architecture**
```
├── Video Creation Service    # Core video generation
├── Import Pipeline Service   # Multi-platform video import
├── Translation Service       # Multi-provider translation
├── Download Service         # Platform-specific downloaders
├── Queue Service           # Priority-based processing
├── Performance Monitor     # Real-time system analysis
└── Security Middleware     # Input validation & protection
```

### **Database Schema**
- PostgreSQL with migrations
- Tables: videos, imports, transcriptions, translations, segments
- JSONB for flexible metadata
- Optimized indexing for performance

### **Technology Stack**
- **Frontend**: React 18 + Material-UI + TypeScript + Vite
- **Backend**: Express.js + TypeScript + Socket.io
- **Video**: Remotion + FFmpeg
- **Database**: PostgreSQL with migrations
- **AI**: OpenAI, Google Generative AI, Ollama
- **Testing**: Vitest + Playwright

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ 
- **FFmpeg** installed
- **Python** 3.8+ (for local TTS)
- **PostgreSQL** (optional, for import features)

### Installation

```bash
# Clone repository
git clone https://github.com/gyoridavid/short-video-maker.git
cd short-video-maker

# Install dependencies
npm install

# Setup Python TTS (optional)
pip install -r requirements.txt

# Start development server
npm run dev
```

### Environment Setup

```bash
# Copy example environment file
cp .env.example .env

# Configure required API keys:
# - OPENAI_API_KEY
# - GOOGLE_GENERATIVE_AI_API_KEY
# - GOOGLE_TRANSLATE_API_KEY (optional)
# - DEEPL_API_KEY (optional)
# - DATABASE_URL (optional)
```

## 📖 Usage

### Creating Videos
```bash
# Using the UI
1. Open http://localhost:3232
2. Navigate to Video Studio
3. Add scenes with text and keywords
4. Configure voice, orientation, and music
5. Click "Create Video"

# Using the API
curl -X POST http://localhost:3233/api/render \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [{
      "text": "Welcome to our channel",
      "searchTerms": ["welcome", "intro"]
    }],
    "config": {
      "voice": "Paulo",
      "orientation": "portrait"
    }
  }'
```

### Importing Videos
```bash
# Analyze video URL
curl -X POST http://localhost:3233/api/import/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=..."}'  

# Start import job
curl -X POST http://localhost:3233/api/import/start \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://youtube.com/watch?v=...",
    "options": {
      "transcribe": true,
      "detectHighlights": true,
      "translate": true,
      "targetLanguage": "pt"
    }
  }'
```

## 🔌 API Reference

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/render` | POST | Create new video |
| `/api/status/:id` | GET | Get video status |
| `/api/generate-tts` | POST | Generate TTS audio |
| `/api/search-background-videos` | POST | Search video providers |
| `/api/replace-scene-video` | POST | Replace scene background |
| `/api/regenerate-scene-audio` | POST | Regenerate scene audio |

### Import Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/import/analyze` | POST | Analyze video URL |
| `/api/import/start` | POST | Start import job |
| `/api/import/job/:jobId` | GET | Get job status |
| `/api/import/queue/status` | GET | Queue status |

### Translation Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/translate` | POST | Translate text |
| `/api/translate/batch` | POST | Batch translation |

### WebSocket Events

```javascript
// Connect to WebSocket
const socket = io('http://localhost:3233');

// Listen for events
socket.on('video-status', (data) => {
  console.log('Progress:', data.progress);
});

socket.on('download-progress', (data) => {
  console.log('Download:', data.percentage + '%');
});
```

## 🤖 Model Context Protocol (MCP)

### Available Tools

```typescript
// MCP Server endpoint
const MCP_ENDPOINT = 'http://localhost:3233/mcp/sse';

// Available tools:
- create-short-video    // Create videos with AI scripts
- get-video-status     // Check rendering progress
- list-videos         // List all videos
- delete-video       // Remove videos
- search-videos     // Search background videos
- generate-tts     // Generate TTS audio
- get-system-info // System information
```

### MCP Integration Example

```bash
# Add to Claude Desktop config
{
  "mcpServers": {
    "short-video-maker": {
      "command": "npx",
      "args": ["short-video-maker"]
    }
  }
}
```

## ⚙️ Configuration

### Environment Variables

```env
# Server Configuration
PORT=3233
NODE_ENV=production
REMOTION_HOST=0.0.0.0

# AI Providers
OPENAI_API_KEY=your_key
GOOGLE_GENERATIVE_AI_API_KEY=your_key

# Translation Services (optional)
GOOGLE_TRANSLATE_API_KEY=your_key
DEEPL_API_KEY=your_key

# Database (optional)
DATABASE_URL=postgresql://user:pass@localhost/dbname

# Performance Monitoring
PERFORMANCE_MONITORING_ENABLED=true
PERFORMANCE_MONITORING_INTERVAL=5000

# Security
SECURITY_RATE_LIMIT_WINDOW=60000
SECURITY_RATE_LIMIT_MAX=100
```

## 🔧 Advanced Features

### Performance Monitoring

```bash
# Start monitoring
npm run performance:start

# Generate report
npm run performance:report

# Check health
npm run performance:health
```

Monitored metrics:
- CPU usage and bottlenecks
- Memory usage and leak detection
- Disk I/O operations
- Network latency and throughput
- Cache hit rates
- Database query performance

### Security Features

- **Path Traversal Protection**: Validates all file paths
- **SSRF Protection**: Domain allowlisting for external requests
- **Rate Limiting**: Configurable per-endpoint limits
- **Input Validation**: Joi schemas for all endpoints
- **File Upload Security**: MIME validation and size limits

## 🧪 Testing

### Test Suites

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Performance tests
npm run test:performance

# Specific test suites
npm run test:e2e:websocket  # WebSocket tests
npm run test:e2e:batch      # Batch import tests
npm run test:e2e:ui         # UI tests
```

### Test Coverage

- **Unit Tests**: Core services, utilities
- **Integration Tests**: API endpoints, database
- **E2E Tests**: Full user workflows
- **Performance Tests**: Memory, CPU, throughput

## 🐳 Docker Deployment

### Available Images

```bash
# Standard image
docker pull gyoridavid/short-video-maker:latest

# GPU-accelerated (CUDA)
docker pull gyoridavid/short-video-maker:latest-cuda

# Minimal size
docker pull gyoridavid/short-video-maker:latest-tiny
```

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    image: gyoridavid/short-video-maker:latest
    ports:
      - "3233:3233"
      - "3232:3232"
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./data:/app/data
```

## 🤝 Contributing

### Development Workflow

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push branch (`git push origin feature/amazing-feature`)
6. Open Pull Request

### Code Standards

- TypeScript with strict mode
- ESLint + Prettier formatting
- Comprehensive test coverage
- JSDoc for public APIs

## 📚 Documentation

- [API Documentation](docs/api/README.md)
- [Developer Guide](docs/developer/README.md)
- [User Guide](docs/user-guide/README.md)
- [Platform Guides](docs/user-guide/platforms/README.md)

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/gyoridavid/short-video-maker/issues)
- **Documentation**: [Full Docs](docs/)
- **Examples**: [Example Code](examples/)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Remotion** - Programmatic video framework
- **Material-UI** - React component library
- **FFmpeg** - Video processing
- **Model Context Protocol** - AI integration

---

**Built with ❤️ for content creators**

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/gyoridavid/short-video-maker) 