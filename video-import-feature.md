# Video Import & Processing Feature - Technical Documentation

## Feature Overview

This feature enables importing videos from YouTube, Facebook, Instagram, and other platforms, then processing them into short-form videos with:
- Background music and overlay selection
- Video download from external sources  
- AI-powered highlight detection using local Ollama with gemma3:12b-it-qat
- Automatic video segmentation into shorts
- Smart orientation cropping with subject tracking
- Multi-language subtitle translation
- Remotion-based rendering using existing pipeline

## Architecture Design

### New Services Structure

```
src/services/
├── VideoImportService.ts        # Handle URL parsing and downloads
├── TranscriptionService.ts      # Extract audio and transcribe
├── OllamaService.ts            # Local AI integration for highlights
├── VideoSegmentService.ts      # Cut videos into segments
├── CropService.ts              # Smart cropping and orientation changes
├── TranslationService.ts       # Subtitle translation
└── ImportPipelineService.ts    # Orchestrate the entire import flow
```

### Extended Data Models

```typescript
// Add to src/types/shorts.ts

export interface ImportedVideo extends Video {
  sourceUrl: string;
  sourcePlatform: 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'other';
  originalDuration: number;
  originalResolution: { width: number; height: number };
  transcription?: Transcription;
  highlights?: Highlight[];
  segments?: VideoSegment[];
}

export interface Transcription {
  text: string;
  language: string;
  timestamps: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface Highlight {
  id: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  tags: string[];
}

export interface VideoSegment {
  id: string;
  parentVideoId: string;
  start: number;
  end: number;
  title?: string;
  orientation: OrientationEnum;
  cropConfig?: CropConfig;
  transcription?: TranscriptionSegment[];
}

export interface CropConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  trackSubject: boolean;
  subjectBounds?: { x: number; y: number; width: number; height: number }[];
}

export interface ImportSettings {
  targetLanguage: string;
  music?: MusicMoodEnum;
  overlay?: string;
  orientation: OrientationEnum;
  autoHighlights: boolean;
  maxSegmentDuration: number; // in seconds
  minSegmentDuration: number; // in seconds
}
```

### API Endpoints

```
POST /api/import/analyze         # Analyze URL and get video metadata
POST /api/import/process         # Start full import and processing
GET  /api/import/:id/status      # Get import job status with progress
GET  /api/import/:id/segments    # Get detected segments
PUT  /api/import/:id/segments    # Update segment boundaries
POST /api/import/:id/highlights  # Get AI-detected highlights
POST /api/ollama/analyze         # Direct Ollama analysis endpoint
GET  /api/translation/languages  # Get supported languages
POST /api/translation/translate  # Translate text
```

### UI Components Structure

```
src/ui/pages/
└── VideoImporter.tsx           # Main import interface page

src/ui/components/import/
├── URLInput.tsx                # URL input with platform detection
├── ImportSettings.tsx          # Music, overlay, language settings
├── ImportProgress.tsx          # Real-time import progress
├── TranscriptionViewer.tsx     # View and edit transcription
├── HighlightEditor.tsx         # Review and adjust AI highlights
├── SegmentTimeline.tsx         # Visual segment boundary editor
├── CropPreview.tsx             # Preview orientation changes
└── BatchImporter.tsx           # Import multiple videos [COMPLETED]
```

## Development Checklist

### Phase 1: Foundation Setup (Week 1)

#### Core Architecture
- [x] Create project structure for new features
  - [x] Create `src/services/` directory if not exists
  - [x] Create `src/ui/components/import/` directory
  - [x] Create `src/types/import.ts` for import-specific types
  
#### Base Services
- [x] Create `VideoImportService.ts`
  - [x] Define service interface
  - [x] Add URL validation methods
  - [x] Add platform detection logic
  - [x] Create download queue structure
  
- [x] Create `OllamaService.ts`
  - [x] Install Ollama npm client: `npm install ollama`
  - [x] Create service class with connection handling
  - [x] Add prompt templates for highlight detection
  - [x] Add error handling and retry logic
  - [x] Create test method to verify Ollama connection
  
- [x] Create `ImportPipelineService.ts`
  - [x] Define pipeline stages enum
  - [x] Create orchestration logic
  - [x] Add progress tracking
  - [x] Implement error recovery
  
#### Data Model Updates
- [x] Extend `src/types/shorts.ts`
  - [x] Add ImportedVideo interface
  - [x] Add Transcription interfaces
  - [x] Add Highlight interface
  - [x] Add VideoSegment interface
  - [x] Add ImportSettings interface
  
- [x] Create database migrations
  - [x] Design import_jobs table schema
  - [x] Design transcriptions table schema
  - [x] Design highlights table schema
  - [x] Design video_segments table schema

#### Configuration
- [x] Update `.env.example`
  - [x] Add OLLAMA_HOST variable
  - [x] Add OLLAMA_MODEL variable
  - [x] Add IMPORT_TEMP_DIR variable
  - [x] Add MAX_IMPORT_SIZE_GB variable
  
- [x] Update `src/config.ts`
  - [x] Add ollama configuration section
  - [x] Add import settings
  - [x] Add translation service config

### Phase 2: Video Download Implementation (Week 1-2)

#### Download Service
- [x] Install dependencies
  - [x] `npm install yt-dlp-exec` for YouTube downloads
  - [x] `npm install playwright` for social media scraping
  - [x] `npm install got` for direct downloads
  
- [x] Implement platform-specific downloaders
  - [x] YouTube downloader
    - [x] Use yt-dlp for video extraction
    - [x] Add quality selection logic
    - [x] Extract metadata (title, description, duration)
    - [x] Handle age-restricted content
    
  - [x] Facebook downloader
    - [x] Implement Facebook video URL parsing
    - [x] Handle private video detection
    - [x] Extract video metadata
    
  - [x] Instagram downloader
    - [x] Handle Reels URLs
    - [x] Handle IGTV URLs
    - [x] Handle post videos
    - [x] Extract metadata
    
  - [x] TikTok downloader
    - [x] Handle TikTok URLs
    - [x] Remove watermark option
    - [x] Extract metadata
    
  - [x] Generic URL handler
    - [x] Direct video URL support
    - [x] Content-type detection
    - [x] Fallback download method

#### Download Management
- [x] Queue implementation
  - [x] Extend existing QueueService
  - [x] Add download-specific queue
  - [x] Implement priority system
  - [x] Add concurrent download limits
  
- [x] Progress tracking
  - [x] Create download progress events
  - [x] Integrate with EventBus
  - [x] Add WebSocket updates
  - [x] Store progress in StatusService
  
- [x] Storage management
  - [x] Create import file structure
  - [x] Implement file naming convention
  - [x] Add to VideoCacheManager
  - [x] Create cleanup job for old imports
  
- [x] Error handling
  - [x] Network error recovery
  - [x] Partial download resume
  - [x] Platform-specific error handling
  - [x] User notification system

### Phase 3: Transcription & AI Analysis (Week 2)

#### Audio Processing
- [x] FFmpeg audio extraction
  - [x] Extract audio track from video
  - [x] Convert to WAV format for Whisper
  - [x] Handle multi-track audio
  - [x] Optimize for transcription quality
  
- [x] Audio preprocessing
  - [x] Noise reduction
  - [x] Normalize audio levels
  - [x] Split long audio files
  - [x] Handle silence detection

#### Transcription Service
- [x] Install Whisper
  - [x] `npm install whisper-node` or use existing remotion whisper
  - [x] Configure model selection
  - [x] Set up GPU acceleration if available
  
- [x] Implement TranscriptionService
  - [x] Create transcribe method
  - [x] Add language detection
  - [x] Generate word-level timestamps
  - [x] Handle long-form content
  - [x] Add confidence scores
  
- [x] Transcription storage
  - [x] Save transcription files
  - [x] Create searchable index
  - [x] Add versioning support
  - [x] Cache transcription results

#### Ollama Integration
- [x] Configure Ollama connection
  - [x] Test connection to local Ollama
  - [x] Verify gemma3:12b-it-qat model
  - [x] Set up connection pooling
  - [x] Add health check endpoint
  
- [x] Highlight detection prompts
  - [x] Create prompt template for highlights
  - [x] Add context window management
  - [x] Implement scoring system
  - [x] Add reason extraction
  
- [x] Scene analysis
  - [x] Detect scene boundaries
  - [x] Identify key moments
  - [x] Extract topics/themes
  - [x] Generate segment titles
  
- [x] Performance optimization
  - [x] Batch processing for long videos
  - [x] Implement caching layer
  - [x] Add timeout handling
  - [x] Monitor token usage

### Phase 4: Video Processing & Cropping (Week 3)

#### Video Segmentation
- [x] Create VideoSegmentService
  - [x] Define segmentation strategies
  - [x] Implement time-based cutting
  - [x] Add scene-based cutting
  - [x] Create highlight-based cutting
  
- [x] FFmpeg integration
  - [x] Implement precise cutting
  - [x] Maintain video quality
  - [x] Handle keyframe alignment
  - [x] Add transition effects
  
- [x] Segment optimization
  - [x] Ensure minimum duration
  - [x] Respect maximum duration
  - [x] Align with speech boundaries
  - [x] Preserve context

#### Smart Cropping System
- [x] Install computer vision library
  - [x] `npm install @tensorflow/tfjs-node` for ML
  - [x] `npm install sharp` for image processing
  - [x] Configure GPU support if available
  
- [x] Subject detection
  - [x] Implement face detection
  - [x] Add person detection
  - [x] Create object tracking
  - [x] Handle multiple subjects
  
- [x] Crop calculation
  - [x] Calculate optimal crop area
  - [x] Maintain subject in frame
  - [x] Handle motion prediction
  - [x] Create smooth transitions
  
- [x] Orientation handling
  - [x] Portrait from landscape
  - [x] Square from any format
  - [x] Custom aspect ratios
  - [x] Preview generation

#### Processing Pipeline
- [x] Batch processing
  - [x] Process multiple segments
  - [x] Parallel processing support
  - [x] Memory management
  - [x] Progress tracking
  
- [x] Quality control
  - [x] Verify output quality
  - [x] Check crop accuracy
  - [x] Validate segment duration
  - [x] Generate previews

### Phase 5: Translation Services (Week 3-4)

#### Translation Service Setup
- [x] Choose translation provider
  - [x] Evaluate Google Translate API
  - [x] Consider DeepL API
  - [x] Investigate local options
  - [x] Set up API keys
  
- [x] Create TranslationService
  - [x] Define service interface
  - [x] Implement provider abstraction
  - [x] Add caching layer
  - [x] Create fallback logic

#### Subtitle Processing
- [x] Subtitle extraction
  - [x] Extract existing subtitles
  - [x] Parse SRT/VTT formats
  - [x] Handle embedded captions
  - [x] Create from transcription
  
- [x] Translation workflow
  - [x] Detect source language
  - [x] Translate text segments
  - [x] Preserve timestamps
  - [x] Maintain formatting
  
- [x] Quality improvements
  - [x] Context-aware translation
  - [x] Terminology consistency
  - [x] Length optimization
  - [x] Cultural adaptation

#### Multi-language Support
- [x] Storage structure
  - [x] Design translation storage
  - [x] Version management
  - [x] Language switching API
  - [x] Cache translations
  
- [x] UI integration
  - [x] Language selector
  - [x] Translation preview
  - [x] Edit capabilities
  - [x] Export options

### Phase 6: UI Development (Week 4)

#### Import Page Creation
- [x] Create VideoImporter page
  - [x] Design page layout
  - [x] Add to React Router
  - [x] Create page state management
  - [x] Add to navigation menu
  
- [x] URL Input Component
  - [x] Create URLInput.tsx
  - [x] Add URL validation
  - [x] Platform auto-detection
  - [x] Preview URL metadata
  - [x] Error handling UI

#### Import Settings Panel
- [x] Create ImportSettings.tsx
  - [x] Music mood selector
  - [x] Overlay image picker
  - [x] Target language dropdown
  - [x] Orientation selector
  - [x] Advanced options toggle
  
- [x] Settings persistence
  - [x] Save user preferences
  - [x] Create preset system
  - [x] Quick settings templates
  - [x] Reset to defaults

#### Progress & Monitoring
- [x] Create ImportProgress.tsx
  - [x] Overall progress bar
  - [x] Stage indicators
  - [x] Time estimates
  - [x] Cancel functionality
  - [x] Error display
  
- [x] Real-time updates
  - [x] WebSocket integration
  - [x] Progress animations
  - [x] Status messages
  - [x] Log viewer

#### Editing Interface
- [x] TranscriptionViewer component
  - [x] Display transcription text
  - [x] Timestamp navigation
  - [x] Edit capabilities
  - [x] Search functionality
  - [x] Export options
  
- [x] HighlightEditor component
  - [x] Visual highlight display
  - [x] Score adjustment
  - [x] Add/remove highlights
  - [x] Reason editing
  - [x] Batch operations
  
- [x] SegmentTimeline component
  - [x] Visual timeline
  - [x] Drag to adjust
  - [x] Playback preview
  - [x] Segment properties
  - [x] Merge/split tools
  
- [x] CropPreview component
  - [x] Live preview
  - [x] Before/after view
  - [x] Manual adjustment
  - [x] Subject tracking toggle
  - [x] Apply to all option

#### Batch Import Interface
- [x] BatchImporter component
  - [x] Multiple import methods (URL list, CSV, text file)
  - [x] Batch settings management
  - [x] Individual video preview cards
  - [x] Progress tracking for each video
  - [x] Error handling and retry mechanisms
  - [x] Save/load batch configurations

### Phase 7: Integration with Existing System (Week 5)

#### Pipeline Integration
- [x] Connect to ShortCreator
  - [x] Convert segments to scenes
  - [x] Map import data to render format
  - [x] Preserve metadata
  - [x] Handle special cases
  
- [x] Queue integration
  - [x] Add import jobs to queue
  - [x] Priority handling
  - [x] Status synchronization
  - [x] Error propagation

#### Remotion Rendering
- [x] Update video components
  - [x] Handle imported videos
  - [x] Apply crop settings
  - [x] Use translated subtitles
  - [x] Maintain quality
  
- [x] Template adjustments
  - [x] Support various aspect ratios
  - [x] Handle crop metadata
  - [x] Dynamic positioning
  - [x] Smooth transitions

#### Data Flow
- [x] File management
  - [x] Link imported files
  - [x] Update file paths
  - [x] Clean temporary files
  - [x] Archive originals
  
- [x] Status tracking
  - [x] Extend VideoStatusManager
  - [x] Add import stages
  - [x] Track sub-jobs
  - [x] Aggregate progress

### Phase 8: Testing & Documentation (Week 5-6)

#### Testing Suite
- [x] Unit tests
  - [x] Service layer tests
  - [x] URL parsing tests
  - [x] Translation tests
  - [x] Crop calculation tests
  
- [x] Integration tests
  - [x] Full pipeline tests
  - [x] Platform-specific tests
  - [x] Error scenario tests
  - [x] Performance tests
  
- [x] E2E tests
  - [x] Complete import flow
  - [x] UI interaction tests
  - [x] Multi-video tests
  - [x] Edge case handling

#### Performance Optimization
- [x] Profiling
  - [x] Memory usage analysis
  - [x] CPU bottlenecks
  - [x] I/O optimization
  - [x] Network efficiency
  
- [x] Optimization implementation
  - [x] Implement caching
  - [x] Add lazy loading
  - [x] Optimize algorithms
  - [x] Reduce memory footprint

#### Documentation
- [x] API documentation
  - [x] Document all endpoints
  - [x] Provide curl examples
  - [x] Error code reference
  - [x] Rate limit info
  
- [x] User guide
  - [x] Step-by-step tutorial
  - [x] Platform guides
  - [x] FAQ section
  - [x] Troubleshooting
  
- [x] Developer docs
  - [x] Architecture overview
  - [x] Service documentation
  - [x] Extension guide
  - [x] Contributing guide
  
## Implementation Details

### Dependencies to Add

```json
{
  "dependencies": {
    "yt-dlp-exec": "^1.0.0",
    "ollama": "^0.5.0",
    "whisper-node": "^1.0.0",
    "deepl": "^1.0.0",
    "@tensorflow/tfjs-node": "^4.0.0",
    "sharp": "^0.33.0",
    "playwright": "^1.40.0",
    "got": "^13.0.0",
    "subtitle": "^4.0.0"
  }
}
```

### Environment Variables

```env
# Ollama Configuration
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=gemma3:12b-it-qat
OLLAMA_TIMEOUT=30000

# Translation Service
TRANSLATION_PROVIDER=deepl
DEEPL_API_KEY=your-key-here
GOOGLE_TRANSLATE_KEY=your-key-here

# Import Settings
IMPORT_TEMP_DIR=/tmp/short-video-imports
MAX_IMPORT_SIZE_GB=10
MAX_CONCURRENT_IMPORTS=3
IMPORT_CLEANUP_DAYS=7

# Processing Limits
MAX_VIDEO_DURATION_MINUTES=60
DEFAULT_SEGMENT_DURATION=60
MIN_SEGMENT_DURATION=15
MAX_SEGMENT_DURATION=180

# Feature Flags
ENABLE_IMPORT_FEATURE=true
ENABLE_AUTO_TRANSLATE=true
ENABLE_SMART_CROP=true
```

### Database Schema

```sql
-- Import jobs tracking
CREATE TABLE import_jobs (
  id VARCHAR(32) PRIMARY KEY,
  source_url TEXT NOT NULL,
  source_platform VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  video_id VARCHAR(32) REFERENCES videos(id),
  settings JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Video transcriptions
CREATE TABLE transcriptions (
  id VARCHAR(32) PRIMARY KEY,
  video_id VARCHAR(32) REFERENCES videos(id),
  language VARCHAR(10) NOT NULL,
  text TEXT NOT NULL,
  timestamps JSONB NOT NULL,
  confidence_score FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI-detected highlights
CREATE TABLE highlights (
  id VARCHAR(32) PRIMARY KEY,
  video_id VARCHAR(32) REFERENCES videos(id),
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  score FLOAT NOT NULL,
  reason TEXT,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Video segments
CREATE TABLE video_segments (
  id VARCHAR(32) PRIMARY KEY,
  parent_video_id VARCHAR(32) REFERENCES videos(id),
  segment_number INTEGER NOT NULL,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  title VARCHAR(255),
  orientation VARCHAR(20),
  crop_config JSONB,
  transcription_segment JSONB,
  rendered_video_id VARCHAR(32) REFERENCES videos(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Translation cache
CREATE TABLE translations (
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
CREATE INDEX idx_highlights_video ON highlights(video_id);
CREATE INDEX idx_segments_parent ON video_segments(parent_video_id);
CREATE INDEX idx_translations_hash ON translations(source_text_hash);
```

### Error Handling Strategy

#### Download Errors
- [ ] Network timeouts: Retry 3 times with exponential backoff
- [ ] Invalid URLs: Validate before processing, clear error message
- [ ] Private videos: Detect and inform user
- [ ] Size limits: Check before download, reject if too large
- [ ] Format issues: Support common formats, convert if needed

#### Processing Errors
- [ ] Transcription fails: Provide fallback, retry and manual subtitle upload option
- [ ] AI timeout: Use fallback highlight detection
- [ ] Translation errors: Cache failures, use alternative service
- [ ] Crop failures: Default to center crop
- [ ] Memory issues: Process in smaller chunks

#### Recovery Mechanisms
- [ ] Checkpoint system: Save progress at each stage
- [ ] Resume capability: Continue from last checkpoint
- [ ] Partial results: Show what succeeded
- [ ] Manual override: Allow user to skip failed steps
- [ ] Cleanup: Remove incomplete data on total failure

### Performance Considerations

#### Scalability
- [ ] Worker pool: Process multiple imports concurrently
- [ ] Queue priorities: Premium users get higher priority
- [ ] Resource limits: CPU/memory caps per job
- [ ] Horizontal scaling: Support multiple worker nodes

#### Optimization Techniques
- [ ] Stream processing: Never load full video in memory
- [ ] Chunk processing: Process video in segments
- [ ] Parallel operations: Run independent tasks concurrently
- [ ] Caching strategy: Cache transcriptions, translations, crops
- [ ] CDN integration: Serve processed videos from CDN

#### Monitoring
- [ ] Performance metrics: Track processing times
- [ ] Resource usage: Monitor CPU, memory, disk
- [ ] Error rates: Track failure patterns
- [ ] User analytics: Popular platforms, average video length
- [ ] Cost tracking: API usage, compute time

## Success Metrics

### Technical Metrics
- [ ] Import success rate > 95%
- [ ] Average processing time < 5 min for 10 min video
- [ ] Highlight accuracy > 80% user satisfaction
- [ ] Translation quality score > 4/5
- [ ] System uptime > 99.5%

### User Metrics
- [ ] Import completion rate > 80%
- [ ] Feature usage growth 20% month-over-month
- [ ] User satisfaction score > 4.5/5
- [ ] Support ticket rate < 5%
- [ ] Feature retention > 70% after 30 days

### Business Metrics
- [ ] Cost per import < $0.10
- [ ] Infrastructure costs < 20% of revenue
- [ ] API costs optimized with caching
- [ ] Storage costs managed with lifecycle policies
- [ ] ROI positive within 6 months

## Future Enhancements

### Phase 2 Features
- [ ] Batch import from playlists/channels
- [ ] Custom AI models for specific content types
- [ ] Advanced editing tools (effects, filters)
- [ ] Collaborative editing features
- [ ] API for third-party integrations

### Platform Expansions
- [ ] LinkedIn video support
- [ ] Twitch clip imports
- [ ] Vimeo integration
- [ ] Direct recording option
- [ ] Live stream highlight extraction

### AI Enhancements
- [ ] Multi-modal analysis (visual + audio)
- [ ] Emotion detection for better highlights
- [ ] Automatic thumbnail generation
- [ ] Content categorization
- [ ] Trend analysis for viral potential