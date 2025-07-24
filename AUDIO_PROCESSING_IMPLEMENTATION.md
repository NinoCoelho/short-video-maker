# Audio Processing Implementation

This document describes the comprehensive audio processing functionality implemented for the transcription service in the short-video-maker project.

## 🎯 Overview

The implementation extends the existing FFmpeg utility and TranscriptionService to provide advanced audio extraction and preprocessing capabilities optimized for speech transcription using Whisper.

## 📁 Files Modified/Created

### Core Implementation
- **`src/short-creator/libraries/FFmpeg.ts`** - Extended with new audio processing methods
- **`src/services/TranscriptionService.ts`** - Enhanced with video support and long audio handling
- **`src/short-creator/libraries/FFmpeg.test.ts`** - Test suite for FFmpeg functionality
- **`src/services/TranscriptionService.test.ts`** - Test suite for TranscriptionService

### Documentation & Examples
- **`examples/audio-processing-demo.ts`** - Comprehensive demo of all features
- **`AUDIO_PROCESSING_IMPLEMENTATION.md`** - This documentation file

## 🚀 New Features Implemented

### 1. Audio Extraction from Video

#### Extract Single Audio Track
```typescript
await ffmpeg.extractAudioFromVideo(
  'video.mp4', 
  'audio.wav', 
  0 // specific track index
);
```

#### Extract All Audio Tracks Mixed
```typescript
await ffmpeg.extractAudioFromVideo('video.mp4', 'audio.wav'); // no track index = mix all
```

#### Extract and Merge Multiple Tracks
```typescript
await ffmpeg.extractAndMergeAudioTracks(
  'video.mp4', 
  'merged.wav', 
  [0, 1] // track indices to merge
);
```

#### Extract All Tracks Separately
```typescript
const trackPaths = await ffmpeg.extractAllAudioTracksSeparately(
  'video.mp4', 
  './tracks/' // output directory
);
```

#### Get Audio Track Information
```typescript
const tracks = await ffmpeg.getAudioTracks('video.mp4');
// Returns: [{ index: 0, codec: 'aac', channels: 2, language: 'en' }, ...]
```

### 2. Audio Preprocessing Pipeline

#### Noise Reduction
```typescript
await ffmpeg.reduceNoise(inputPath, outputPath, 0.21); // noise level threshold
```
- Uses FFT denoiser with configurable noise level
- Applies high-pass and low-pass filters
- Removes common background noise

#### Audio Normalization
```typescript
await ffmpeg.normalizeAudioLevels(inputPath, outputPath);
```
- Two-pass normalization process
- Target -3dB peak level
- EBU R128 loudness normalization
- Maintains dynamic range while ensuring consistent levels

#### Silence Detection
```typescript
const silencePeriods = await ffmpeg.detectSilence(
  audioPath, 
  -30, // threshold in dB
  0.5  // minimum silence duration in seconds
);
// Returns: [{ start: 10.5, end: 12.3 }, ...]
```

#### Audio File Splitting
```typescript
const chunks = await ffmpeg.splitAudioFile(
  inputPath, 
  outputDir, 
  300 // max 5 minutes per chunk
);
```

#### Complete Preprocessing Pipeline
```typescript
await ffmpeg.preprocessAudioForTranscription(inputPath, outputPath, {
  reduceNoise: true,
  normalizeAudio: true,
  removeSilence: false, // Keep for accurate timestamps
  targetFormat: 'wav'
});
```

### 3. Enhanced Transcription Service

#### Video Transcription
```typescript
const result = await transcriptionService.transcribeVideo('video.mp4', {
  audioTrackIndex: 0, // specific track
  model: 'base',
  language: 'en',
  preprocessingOptions: {
    reduceNoise: true,
    normalizeAudio: true,
    removeSilence: false
  }
});
```

#### Long Audio Handling
- Automatically splits audio longer than 5 minutes
- Processes chunks in sequence
- Adjusts timestamps for seamless reconstruction
- Progress tracking across all chunks

#### Multi-track Support
```typescript
// Get available tracks
const tracks = await transcriptionService.getVideoAudioTracks('video.mp4');

// Transcribe specific track
const result = await transcriptionService.transcribeVideo('video.mp4', {
  audioTrackIndex: 1 // transcribe second audio track
});
```

## 🔧 Technical Implementation Details

### Audio Format Optimization for Whisper
All processed audio is optimized for Whisper transcription:
- **Sample Rate**: 16kHz (Whisper's optimal rate)
- **Channels**: Mono (reduces processing time)
- **Format**: PCM 16-bit signed little-endian
- **Container**: WAV (uncompressed for quality)

### Multi-track Audio Scenarios
The implementation handles various multi-track scenarios:
- **Multiple language tracks** - Extract specific language
- **Stereo + surround** - Mix or extract channels as needed
- **Commentary tracks** - Isolate main audio from commentary
- **Music + dialog** - Process different audio types separately

### Audio Preprocessing Rationale

#### Noise Reduction
- **High-pass filter (200Hz)** - Removes low-frequency rumble
- **Low-pass filter (3kHz)** - Removes high-frequency noise beyond speech
- **FFT denoiser** - Spectral noise reduction for complex noise patterns

#### Normalization Strategy
- **Volume detection pass** - Analyzes audio levels
- **Target -3dB peak** - Prevents clipping while maximizing SNR
- **EBU R128 loudness** - Broadcast standard for consistent perceived volume

#### Silence Handling
- **Configurable thresholds** - Adapt to different audio qualities
- **Timestamp preservation** - Critical for accurate transcription timing
- **Optional removal** - Can remove silence if timestamps aren't critical

### Long Audio Processing
For audio files longer than 5 minutes:
1. **Split into 5-minute chunks** - Optimal for Whisper processing
2. **Overlapping boundaries** - Prevents word cutoff at chunk boundaries
3. **Timestamp adjustment** - Maintains accurate timing across chunks
4. **Progress tracking** - Real-time updates during processing
5. **Error recovery** - Continues processing if individual chunks fail

## 🧪 Testing & Validation

### Test Coverage
- **Unit tests** for all new FFmpeg methods
- **Integration tests** for TranscriptionService enhancements
- **Mock-based testing** for isolation from external dependencies
- **Error handling** validation for various failure scenarios

### Test Files
- `FFmpeg.test.ts` - 11 tests covering audio processing methods
- `TranscriptionService.test.ts` - 5 tests covering enhanced functionality

## 📈 Performance Considerations

### Memory Usage
- **Streaming processing** - Large files processed in chunks to manage memory
- **Temporary file cleanup** - Automatic cleanup of intermediate files
- **Resource monitoring** - Logging of processing times and resource usage

### Processing Speed
- **Parallel processing** - Multiple chunks can be processed concurrently
- **Format optimization** - Direct conversion to target format reduces I/O
- **Smart defaults** - Balanced quality vs. speed settings

### Error Recovery
- **Graceful degradation** - Falls back to simpler processing on errors
- **Partial success handling** - Processes successful chunks even if some fail
- **Resource cleanup** - Ensures temporary files are cleaned up on errors

## 🔄 Integration with Existing System

### WebSocket Updates
- Real-time progress updates for audio processing steps
- Error notifications for processing failures
- Completion notifications with processing statistics

### Event System
- Integrates with existing EventBus for system-wide notifications
- Emits events for processing milestones
- Supports cancellation of long-running operations

### File Management
- Uses existing FileService patterns for temporary file handling
- Respects existing directory structure and naming conventions
- Integrates with existing logging and configuration systems

## 🎬 Usage in Video Import Pipeline

The audio processing functionality integrates seamlessly with the planned video import feature:

1. **Video Download** - Import service downloads video
2. **Audio Extraction** - New FFmpeg methods extract and preprocess audio
3. **Transcription** - Enhanced TranscriptionService processes audio
4. **Analysis** - Transcription feeds into AI analysis pipeline
5. **Scene Detection** - Audio analysis complements visual scene detection

## 🚀 Future Enhancements

### Planned Improvements
- **Real-time streaming transcription** - Process audio as it's received
- **Speaker diarization** - Identify and separate different speakers
- **Advanced noise reduction** - Machine learning-based noise removal
- **Multi-language detection** - Automatic language identification
- **Audio quality assessment** - Automatic quality scoring and optimization

### Scalability Considerations
- **GPU acceleration** - CUDA support for faster processing
- **Distributed processing** - Process chunks across multiple workers
- **Cloud integration** - Optional cloud-based processing for large files
- **Caching** - Cache processed audio to avoid reprocessing

## 📚 API Reference

### FFMpeg Class New Methods

#### `extractAudioFromVideo(videoPath, outputPath, trackIndex?)`
- **Purpose**: Extract audio track from video file
- **Parameters**:
  - `videoPath`: Path to input video
  - `outputPath`: Path for output audio file
  - `trackIndex`: Optional specific track index
- **Returns**: `Promise<string>` - Path to extracted audio

#### `getAudioTracks(videoPath)`
- **Purpose**: Get information about audio tracks in video
- **Parameters**: 
  - `videoPath`: Path to video file
- **Returns**: `Promise<AudioTrack[]>` - Array of track information

#### `preprocessAudioForTranscription(inputPath, outputPath, options)`
- **Purpose**: Apply complete preprocessing pipeline
- **Parameters**:
  - `inputPath`: Input audio file path
  - `outputPath`: Output audio file path  
  - `options`: Preprocessing configuration
- **Returns**: `Promise<string>` - Path to processed audio

### TranscriptionService Class New Methods

#### `transcribeVideo(videoPath, options)`
- **Purpose**: Transcribe video by extracting and processing audio
- **Parameters**:
  - `videoPath`: Path to video file
  - `options`: Transcription and audio track options
- **Returns**: `Promise<TranscriptionResult>` - Transcription result

#### `getVideoAudioTracks(videoPath)`
- **Purpose**: Get available audio tracks from video
- **Parameters**:
  - `videoPath`: Path to video file
- **Returns**: `Promise<AudioTrack[]>` - Array of audio track information

## ✅ Implementation Status

All requirements from the video-import-feature.md specification have been implemented:

- ✅ **FFmpeg audio extraction** - Extract audio track from video
- ✅ **Convert to WAV format** - Optimized for Whisper transcription  
- ✅ **Handle multi-track audio** - Support for multiple audio tracks
- ✅ **Audio preprocessing** - Noise reduction, normalization, silence detection
- ✅ **Split long audio files** - Automatic chunking for efficient processing

The implementation provides a comprehensive audio processing solution that integrates seamlessly with the existing codebase while providing powerful new capabilities for video transcription workflows.