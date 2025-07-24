# Video Import UI Components

This directory contains the React components for the video import feature as specified in `video-import-feature.md`.

## Components Created

### 1. TranscriptionViewer.tsx
**Purpose**: Display and edit video transcription with timestamps

**Features**:
- Display transcription text with timestamps
- Navigate to specific times by clicking timestamps
- Edit transcription text inline
- Search functionality with highlighting
- Export options (SRT, VTT, TXT, JSON)
- Real-time updates via WebSocket
- Speaker identification support
- Confidence scoring for auto-transcriptions

**Key Props**:
- `videoId`: Video identifier
- `segments`: Array of transcription segments with timestamps
- `onSegmentEdit`: Callback for text edits
- `onTimeClick`: Navigate to timestamp
- `currentTime`: Current playback position for highlighting

### 2. HighlightEditor.tsx
**Purpose**: Visual highlights management with scoring and editing

**Features**:
- Display highlights with scores and reasons
- Drag-to-reorder functionality (requires `@hello-pangea/dnd`)
- Score adjustment with sliders
- Add/remove highlights manually
- Auto-detect highlights via AI
- Batch operations (delete, score adjustment, merge)
- Real-time preview of segments
- Filtering and sorting options

**Key Props**:
- `highlights`: Array of highlight objects
- `onHighlightUpdate`: Callback for highlight changes
- `onPreview`: Preview segment callback
- `currentTime`: Current playback position

### 3. SegmentTimeline.tsx
**Purpose**: Visual timeline for video segment manipulation

**Features**:
- Visual timeline with draggable segments
- Zoom and pan controls
- Segment resize handles
- Context menu for operations (split, merge, delete)
- Undo/redo functionality
- Snap-to-grid for precise editing
- Waveform overlay support
- Manual keyframe management

**Key Props**:
- `segments`: Video segments to display
- `duration`: Total video duration
- `currentTime`: Playback position
- `onSegmentUpdate`: Segment change callback
- `waveformData`: Audio waveform data

### 4. CropPreview.tsx
**Purpose**: Live video cropping preview with subject tracking

**Features**:
- Live preview with before/after comparison
- Multiple view modes (split, before, after, overlay)
- Manual crop adjustment with drag handles
- Subject tracking integration
- Preset aspect ratios
- Zoom and pan controls
- Manual keyframe support
- Apply to all segments functionality

**Key Props**:
- `videoUrl`: Source video URL
- `originalDimensions`: Video dimensions
- `targetAspectRatio`: Target crop ratio
- `cropRegion`: Current crop settings
- `subjectDetections`: AI-detected subjects

## Integration

All components are designed to work with:
- **Material-UI**: Consistent styling and theming
- **WebSocket**: Real-time updates and collaboration
- **TypeScript**: Full type safety
- **Existing hooks**: `useWebSocket`, `useDebounce`

## Dependencies Note

Some advanced features require additional packages:
- `@hello-pangea/dnd`: For drag-and-drop in HighlightEditor
- Subject tracking APIs for CropPreview
- Canvas manipulation for video cropping

## Usage Example

```typescript
import {
  TranscriptionViewer,
  HighlightEditor,
  SegmentTimeline,
  CropPreview
} from './components/import';

// Use components in your video import workflow
<TranscriptionViewer
  videoId="video-123"
  segments={transcriptionSegments}
  onSegmentEdit={handleTranscriptionEdit}
  currentTime={playbackTime}
/>
```

## WebSocket Events

Components emit and listen for these WebSocket events:
- `transcription-update`: Transcription changes
- `highlight-update`: Highlight modifications
- `segment-update`: Timeline segment changes
- `crop-update`: Crop region updates
- `tracking-update`: Subject tracking data