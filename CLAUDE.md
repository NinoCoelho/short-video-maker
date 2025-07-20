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

#### Service Layer Architecture
```
src/
├── server/              # Express backend
│   ├── events/          # Event system (EventBus)
│   ├── routers/         # API routers (REST, MCP)
│   ├── websocket/       # Real-time updates
│   └── routes/          # Individual endpoints
├── short-creator/       # Core video creation logic
│   ├── libraries/       # External integrations
│   │   ├── FFmpeg/      # Video/audio processing
│   │   ├── TTS/         # Multiple TTS providers
│   │   └── Videos/      # Background video providers
│   └── utils/           # Helper functions
├── services/            # Shared services
│   ├── FileService      # File operations
│   ├── QueueService     # Video processing queue
│   └── StatusService    # Video status management
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

#### MCP Server (`/mcp/*`)
- SSE endpoint: `/mcp/sse`
- Health check: `/mcp/health`
- 7 tools for video operations

#### WebSocket Events
- `connect` - Client connection
- `video-status` - Progress updates
- `video-complete` - Rendering finished
- `video-error` - Error notifications

### Key Technical Decisions

#### Performance Optimizations
- Smart video caching system to avoid re-downloading
- Virtual scrolling in UI for large lists
- Debounced search and filtering
- React.memo and useCallback for render optimization

#### Error Handling
- Comprehensive error boundaries in React
- Retry logic for failed video downloads
- Graceful degradation for TTS providers
- Detailed error logging with Winston

#### Testing Approach
- Vitest for unit tests
- Test files co-located with source
- Focus on core business logic (ShortCreator)
- Run with `npm test`

### Working with the Codebase

#### Adding New Features
1. For UI changes: Start in `src/ui/pages` or `src/ui/components`
2. For API endpoints: Add to `src/server/routes` and update router
3. For video processing: Modify `src/short-creator/ShortCreator.ts`
4. For real-time features: Use EventBus and WebSocket patterns

#### Common Tasks
- **Add new TTS provider**: Implement interface in `src/short-creator/libraries/TTS/`
- **Add video source**: Create provider in `src/short-creator/libraries/Videos/`
- **Modify video template**: Edit Remotion components in `src/components/`
- **Add MCP tool**: Update `src/server/routers/mcpRouter.ts`

#### Environment Variables
Key variables to configure:
- `PORT` - Server port (default: 3000)
- `REMOTION_HOST` - Remotion server host
- `NODE_ENV` - Environment mode
- API keys for AI providers (OpenAI, Google)

#### TypeScript Configuration
- Strict mode enabled
- ES2022 target
- Two configs: main and build-specific
- Type definitions in `src/types/`