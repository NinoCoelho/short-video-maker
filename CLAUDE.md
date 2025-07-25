# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Run both server and UI concurrently (server on :3233, UI on :3232)
- `npm run dev:server` - Development server only with hot reload (tsx watch)
- `npm run dev:ui` - Frontend development only (Vite on :3232)
- `npm run build` - Full production build (TypeScript + Vite + Remotion)
- `npm start` - Production server (runs dist/index.js)
- `npm test` - Run tests with Vitest

### Additional Services
- `npm run tts:service` - Run Python TTS service (requires `pip install -r requirements.txt`)
- Port 3122 - Remotion video rendering server (auto-started with dev)

### Testing Commands
- `npm test` - Run unit tests with Vitest
- `npm run test:e2e` - Run end-to-end tests
- `npm run test:performance` - Run performance tests
- `npm run test:performance:report` - Generate performance report

### Performance Monitoring
- `npm run performance:start` - Start performance monitoring
- `npm run performance:stop` - Stop monitoring
- `npm run performance:report` - Generate performance report
- `npm run performance:baseline` - Set performance baseline
- `npm run performance:health` - Check system health

### Docker
- `npm run publish:docker` - Build all Docker variants
- `npm run publish:docker:normal` - Standard image
- `npm run publish:docker:cuda` - GPU-accelerated image
- `npm run publish:docker:tiny` - Minimal image

## Architecture Overview

### Full-Stack Video Creation Platform
This is a monolithic application for creating short-form videos (TikTok, Instagram Reels, YouTube Shorts) with:
- **Frontend**: React 18 + Material-UI + TypeScript + Vite
- **Backend**: Express.js + TypeScript with REST API and MCP server
- **Video Processing**: Remotion (React-based programmatic video creation)
- **Real-time**: WebSocket (Socket.io) for live updates during rendering
- **AI Integration**: OpenAI and Google Generative AI for script generation

### Key Architectural Patterns

#### Event-Driven Architecture
- `EventBus` pattern for internal communication between services
- WebSocket server for real-time client updates
- Queue system for video processing with retry logic
- Download events (progress, status, complete, error)
- Scene processing events
- Memory-efficient weak references

#### Service Layer Architecture
```
src/
├── server/              # Express backend
│   ├── events/          # Event system (EventBus)
│   ├── routers/         # API routers (REST, MCP)
│   ├── websocket/       # Real-time updates
│   ├── routes/          # Individual endpoints
│   └── middleware/      # Security, validation, rate limiting
├── short-creator/       # Core video creation logic
│   ├── libraries/       # External integrations
│   │   ├── FFmpeg/      # Video/audio processing
│   │   ├── TTS/         # Multiple TTS providers
│   │   └── Videos/      # Background video providers
│   └── utils/           # Helper functions
├── services/            # Shared services
│   ├── LibraryManagerService # Music and overlay asset management
│   ├── TranslationService # Multi-provider translation
│   ├── QueueService     # Priority-based processing queue
│   ├── StatusService    # Video status management
│   ├── TranscriptionService # Video-to-text conversion
│   ├── DownloadProcessor # Platform-specific downloads
│   └── downloaders/     # YouTube, TikTok, Instagram, etc.
├── database/            # PostgreSQL migrations & queries
│   └── migrations/      # Schema versioning
├── performance/         # Performance monitoring system
│   ├── analyzers/       # CPU, Memory, IO, Network analysis
│   └── reports/         # Performance reports & baselines
└── ui/                  # React frontend
    ├── pages/           # Main application pages
    ├── components/      # Reusable UI components
    └── hooks/           # Custom React hooks
```

#### Video Creation Flow
1. **Script Generation**: AI generates script with scenes
2. **Scene Processing**: Each scene gets TTS audio + background video
3. **Remotion Rendering**: React components render as video frames
4. **FFmpeg Processing**: Final video assembly with captions
5. **Real-time Updates**: WebSocket broadcasts progress

### API Structure

#### REST API (`/api/*`)
- `/api/render` - Create new video
- `/api/status/:id` - Get video status
- `/api/search-background-videos` - Search video providers
- `/api/generate-tts` - Generate audio
- `/api/replace-scene-video` - Replace background video
- `/api/regenerate-scene-audio` - Regenerate scene audio
- `/api/library/*` - Library manager endpoints for assets and collections
- `/api/translate` - Translate text with multiple providers
- `/api/translate/batch` - Batch translation

#### MCP Server (`/mcp/*`)
- SSE endpoint: `/mcp/sse`
- Health check: `/mcp/health`
- 7 tools for video operations

#### WebSocket Events
- `connect` - Client connection
- `video-status` - Progress updates
- `video-complete` - Rendering finished
- `video-error` - Error notifications
- `download-progress` - Download progress updates
- `download-complete` - Download finished
- `download-error` - Download failed
- `queue-update` - Queue status changes

### Key Technical Decisions

#### Performance Optimizations
- Smart video caching system to avoid re-downloading
- Virtual scrolling in UI for large lists
- Debounced search and filtering
- React.memo and useCallback for render optimization
- Translation caching to reduce API costs
- Priority-based queue processing
- Real-time performance monitoring system
- Memory leak detection and prevention

#### Security Features
- Path traversal protection for file operations
- SSRF protection with domain allowlisting
- API key validation middleware
- Rate limiting per endpoint
- Input validation with Joi schemas
- Request sanitization to prevent prototype pollution

#### Error Handling
- Comprehensive error boundaries in React
- Retry logic with exponential backoff
- Graceful degradation for TTS providers
- Detailed error logging with Winston
- Fallback providers for translation
- Error recovery in download system

#### Library Manager
- **Asset Management**: Upload, organize, and manage music files and overlay images
- **Collections**: Group assets into organized collections by type and purpose
- **Metadata**: Track titles, tags, moods, file sizes, and other properties
- **Preview System**: Audio playback for music, image preview for overlays
- **API Integration**: RESTful API for programmatic asset management
- **File Validation**: MIME type checking and format validation
- **Storage**: Assets stored in `static/music/` and `static/overlays/` directories
- **Database**: Metadata stored in JSON files in `data/library/` directory

#### Testing Approach
- Vitest for unit tests
- Playwright for E2E tests
- Performance tests with memory analysis
- Test files co-located with source
- Integration tests for services
- Run with `npm test`

### Working with the Codebase

#### Adding New Features
1. For UI changes: Start in `src/ui/pages` or `src/ui/components`
2. For API endpoints: Add to `src/server/routes` and update router
3. For video processing: Modify `src/short-creator/ShortCreator.ts`
4. For real-time features: Use EventBus and WebSocket patterns
6. For translation: Add providers to `TranslationService`
7. For asset management: Use `LibraryManagerService` for music and overlay operations
8. For security: Add middleware to `src/server/middleware/security.ts`

#### Common Tasks
- **Add new TTS provider**: Implement interface in `src/short-creator/libraries/TTS/`
- **Add video source**: Create provider in `src/short-creator/libraries/Videos/`
- **Modify video template**: Edit Remotion components in `src/components/`
- **Add MCP tool**: Update `src/server/routers/mcpRouter.ts`
- **Add platform downloader**: Create in `src/services/downloaders/`
- **Add translation provider**: Implement in `TranslationService`
- **Manage music/overlays**: Use Library Manager UI at `/library-manager` or API at `/api/library/*`
- **Add performance metric**: Update analyzers in `performance/analyzers/`

#### Environment Variables
Key variables to configure:
- `PORT` - Server port (default: 3000)
- `REMOTION_HOST` - Remotion server host
- `NODE_ENV` - Environment mode
- API keys for AI providers (OpenAI, Google)
- `GOOGLE_TRANSLATE_API_KEY` - Google Cloud Translate
- `DEEPL_API_KEY` - DeepL translation
- `DATABASE_URL` - PostgreSQL connection string
- `PERFORMANCE_MONITORING_ENABLED` - Enable performance monitoring
- `SECURITY_RATE_LIMIT_*` - Rate limiting configuration

#### TypeScript Configuration
- Strict mode enabled
- ES2022 target
- Two configs: main and build-specific
- Type definitions in `src/types/`

#### Database Management
- Migrations in `src/database/migrations/`
- Run migrations: `npm run db:migrate`
- Rollback: `npm run db:rollback`
- Schema includes: videos, transcriptions, translations, segments