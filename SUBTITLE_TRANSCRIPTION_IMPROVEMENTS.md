# YouTube Subtitle Transcription Improvements

## Overview

This document describes the improvements made to the transcription system to prioritize YouTube subtitles over Whisper transcription, implementing overlapping chunks for better AI highlight detection.

## Key Features Implemented

### 1. YouTube Subtitle Downloader Service
- **File**: `src/services/YouTubeSubtitleDownloader.ts`
- Downloads subtitles directly from YouTube in SRT format
- Supports both manual and auto-generated subtitles
- Multiple language support with intelligent selection
- Parsing support for SRT, VTT, and JSON formats

### 2. Enhanced TranscriptionService
- **File**: `src/services/TranscriptionService.ts`
- New method `transcribeYouTubeVideo()` that:
  - Attempts to download YouTube subtitles first
  - Falls back to Whisper transcription if subtitles unavailable
  - Provides perfect confidence scores for subtitle-based transcriptions
  - Caches results for performance

### 3. Overlapping Chunk Processing
- Implemented `createOverlappingChunks()` method
- Creates 30-second chunks with 5-second overlaps by default
- Ensures important content at chunk boundaries isn't missed
- Better context for AI highlight detection

### 4. Integration with Import Pipeline
- **File**: `src/services/ImportPipelineService.ts`
- Updated to use the new transcription flow
- Processes chunks with overlap for AI analysis
- Deduplicates suggestions from overlapping regions
- Ranks suggestions based on score and overlap status

## Benefits

1. **Faster Processing**: YouTube subtitles download in seconds vs minutes for Whisper
2. **Better Accuracy**: YouTube's auto-generated subtitles are often very accurate
3. **Reduced Resource Usage**: No GPU/CPU intensive processing when subtitles available
4. **Improved Highlight Detection**: Overlapping chunks ensure no important moments are missed
5. **Graceful Fallback**: Whisper still available when subtitles don't exist

## Usage Example

```typescript
// For YouTube videos
const result = await transcriptionService.transcribeYouTubeVideo(url, {
  language: 'en',
  preferSubtitles: true // Default is true
});

// Create overlapping chunks for AI processing
const { chunks, metadata } = transcriptionService.createOverlappingChunks(
  result.segments,
  30, // chunk duration in seconds
  5   // overlap duration in seconds
);
```

## Testing

Run the test script to see the improvements in action:
```bash
tsx src/services/test-youtube-subtitle-transcription.ts https://www.youtube.com/watch?v=VIDEO_ID
```

## Architecture Flow

1. **YouTube URL Detection** → Check if video has subtitles
2. **Subtitle Download** → Attempt to download in preferred language
3. **Parse Subtitles** → Convert to standardized TranscriptSegment format
4. **Fallback to Whisper** → If subtitles unavailable or download fails
5. **Chunk Processing** → Create overlapping chunks for AI analysis
6. **AI Highlight Detection** → Process each chunk for potential highlights
7. **Deduplication** → Merge overlapping suggestions and rank by quality

## Performance Comparison

| Method | Processing Time | Resource Usage | Accuracy |
|--------|----------------|----------------|----------|
| YouTube Subtitles | 2-5 seconds | Minimal | Very High |
| Whisper (base model) | 30-60 seconds | Medium CPU/GPU | High |
| Whisper (large model) | 2-5 minutes | High CPU/GPU | Very High |

## Future Enhancements

1. Support for more video platforms (Vimeo, Dailymotion, etc.)
2. Multi-language subtitle merging for better coverage
3. Subtitle quality scoring to choose best available option
4. Real-time streaming subtitle processing
5. Custom chunk sizing based on content type