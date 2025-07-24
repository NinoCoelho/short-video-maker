# Smart Cropping System

This document provides comprehensive information about the Smart Cropping System implemented for the short-video-maker project.

## Overview

The Smart Cropping System uses AI-powered subject detection and motion tracking to automatically crop videos for different aspect ratios while preserving important content. It's designed to integrate seamlessly with the video import pipeline and supports batch processing with quality control.

## Features

### Core Capabilities
- ✅ **ML-based Subject Detection**: Face detection using BlazeFace model
- ✅ **Multi-subject Handling**: Handles multiple faces/persons in frame
- ✅ **Motion Prediction**: Smooth tracking across frames
- ✅ **Orientation Conversion**: Landscape to portrait/square
- ✅ **Batch Processing**: Parallel processing support
- ✅ **Quality Control**: Automatic quality validation and fallbacks
- ✅ **Memory Management**: Optimized for large videos
- ✅ **Progress Tracking**: Real-time processing updates

### Supported Aspect Ratios
- **Vertical (9:16)**: TikTok, Instagram Reels, YouTube Shorts
- **Square (1:1)**: Instagram posts
- **Horizontal (16:9)**: YouTube videos
- **Custom ratios**: Instagram Portrait (4:5), Instagram Landscape (1.91:1)

### Detection Capabilities
- **Face Detection**: Uses TensorFlow.js BlazeFace model
- **Person Detection**: Heuristic-based person detection (fallback)
- **Object Tracking**: Framework for advanced object detection
- **Motion Analysis**: Tracks movement for dynamic cropping

## Installation

### Dependencies
```bash
npm install @tensorflow/tfjs-node sharp
npm install @types/sharp --save-dev
```

### Optional: GPU Acceleration
For GPU acceleration, ensure you have compatible hardware and drivers:
```bash
# For CUDA support (Linux/Windows)
npm install @tensorflow/tfjs-node-gpu
```

## Usage

### Basic Usage

```typescript
import { CropService, ASPECT_RATIOS } from './services/CropService';

const cropService = new CropService('/path/to/data', {
  enableFaceDetection: true,
  enablePersonDetection: true,
  gpuAcceleration: true,
  maxParallel: 2,
  qualityThreshold: 0.7
});

// Smart crop a single video
const result = await cropService.smartCrop(
  '/path/to/input.mp4',
  '/path/to/output.mp4',
  {
    aspectRatio: ASPECT_RATIOS.VERTICAL,
    detectFaces: true,
    detectMotion: true,
    quality: 'high'
  }
);

console.log('Crop result:', {
  confidence: result.confidence,
  qualityScore: result.qualityScore,
  detections: result.detections?.length || 0
});
```

### Batch Processing

```typescript
const batchResults = await cropService.batchCrop({
  videos: [
    { inputPath: '/path/to/video1.mp4', outputPath: '/path/to/output1.mp4' },
    { inputPath: '/path/to/video2.mp4', outputPath: '/path/to/output2.mp4' }
  ],
  cropOptions: {
    aspectRatio: ASPECT_RATIOS.VERTICAL,
    detectFaces: true,
    quality: 'high'
  },
  config: {
    maxParallel: 2,
    memoryLimit: 4096
  },
  onProgress: (progress) => {
    console.log(`Progress: ${progress.completed}/${progress.total}`);
  }
});
```

### Integration with VideoSegmentService

```typescript
import { VideoSegmentCropIntegration } from './services/VideoSegmentService.integration';

const integration = new VideoSegmentCropIntegration('/path/to/data', {
  enableSmartCrop: true,
  targetAspectRatio: 'vertical',
  cropQuality: 'high',
  batchProcessing: true
});

const result = await integration.processImportedVideo(
  '/path/to/input.mp4',
  '/path/to/output/dir',
  {
    segmentDuration: 30,
    generateHighlights: true
  }
);
```

### Preview Generation

```typescript
// Generate crop configuration with previews
const cropConfig = await cropService.generateCropConfig(
  '/path/to/video.mp4',
  ASPECT_RATIOS.VERTICAL,
  { detectFaces: true, detectMotion: true }
);

console.log('Crop analysis:', {
  confidence: cropConfig.confidence,
  qualityScore: cropConfig.qualityScore,
  previewFrames: cropConfig.previewFrames.length,
  detections: cropConfig.metadata.detections?.length || 0
});
```

## Configuration Options

### ProcessingConfig
```typescript
interface ProcessingConfig {
  enableFaceDetection: boolean;      // Use ML face detection
  enablePersonDetection: boolean;    // Use person detection
  enableObjectTracking: boolean;     // Advanced object tracking
  motionPrediction: boolean;         // Motion-based tracking
  gpuAcceleration: boolean;          // Use GPU if available
  batchSize: number;                 // Videos per batch
  maxParallel: number;               // Parallel processing limit
  qualityThreshold: number;          // Minimum quality score
  memoryLimit: number;               // Memory limit in MB
}
```

### CropOptions
```typescript
interface CropOptions {
  aspectRatio?: AspectRatio;         // Target aspect ratio
  position?: string;                 // Fallback position
  quality?: 'high' | 'medium' | 'low'; // Output quality
  detectFaces?: boolean;             // Enable face detection
  detectMotion?: boolean;            // Enable motion detection
}
```

## Architecture

### Class Structure
```
CropService
├── ML Models Management
│   ├── BlazeFace (face detection)
│   ├── Model loading/disposal
│   └── GPU/CPU backend configuration
├── Video Processing
│   ├── Dimension analysis
│   ├── Frame extraction
│   └── Subject detection
├── Cropping Engine
│   ├── Smart crop calculation
│   ├── Quality validation
│   └── Fallback mechanisms
└── Batch Processing
    ├── Parallel execution
    ├── Memory management
    └── Progress tracking
```

### Processing Pipeline
1. **Video Analysis**: Extract metadata and sample frames
2. **Subject Detection**: Analyze frames for faces/persons/objects
3. **Crop Calculation**: Determine optimal crop area
4. **Motion Prediction**: Adjust for predicted movement
5. **Quality Validation**: Verify crop quality
6. **Fallback Handling**: Use center crop if quality is low
7. **Video Rendering**: Apply crop using FFmpeg

## Performance Optimization

### Memory Management
- Automatic garbage collection triggers
- TensorFlow tensor disposal
- Batch size optimization
- Memory usage monitoring

### Processing Optimization
- Parallel video processing
- GPU acceleration when available
- Efficient frame sampling
- Smart caching strategies

### Quality vs Speed Trade-offs
```typescript
// High Quality (slower)
{
  quality: 'high',
  maxParallel: 1,
  batchSize: 2,
  qualityThreshold: 0.8
}

// Balanced (recommended)
{
  quality: 'medium',
  maxParallel: 2,
  batchSize: 4,
  qualityThreshold: 0.7
}

// Fast Processing (lower quality)
{
  quality: 'low',
  maxParallel: 4,
  batchSize: 8,
  qualityThreshold: 0.5
}
```

## Error Handling & Fallbacks

### Automatic Fallbacks
1. **ML Model Loading Fails**: Falls back to heuristic detection
2. **GPU Unavailable**: Uses CPU backend
3. **Face Detection Fails**: Uses center crop
4. **Low Quality Detected**: Applies center crop with warning
5. **Memory Exhaustion**: Reduces batch size automatically

### Error Recovery
```typescript
try {
  const result = await cropService.smartCrop(inputPath, outputPath, options);
} catch (error) {
  console.error('Crop failed:', error.message);
  
  // Fallback to center crop
  const fallbackResult = await cropService.cropVideo(
    inputPath,
    outputPath,
    centerCropDimensions
  );
}
```

## Testing

### Run Tests
```bash
npm test src/services/__tests__/CropService.test.ts
```

### Test Coverage
- ✅ Service initialization
- ✅ Aspect ratio calculations
- ✅ Crop position calculations
- ✅ Batch processing
- ✅ Memory management
- ✅ Error handling
- ✅ Cleanup procedures

## Integration Examples

### VideoImporter Integration
```typescript
// In video import pipeline
const cropService = new CropService(dataDir);
const cropConfig = await cropService.generateCropConfig(
  importedVideoPath,
  ASPECT_RATIOS.VERTICAL
);

// Apply cropping during import
const segments = await segmentVideo(importedVideoPath);
const croppedSegments = await cropService.batchCrop({
  videos: segments.map(s => ({
    inputPath: s.path,
    outputPath: s.path.replace('.mp4', '_cropped.mp4')
  })),
  cropOptions: { aspectRatio: ASPECT_RATIOS.VERTICAL }
});
```

### REST API Integration
```typescript
// Add to REST routes
app.post('/api/crop-video', async (req, res) => {
  const { inputPath, aspectRatio } = req.body;
  
  try {
    const result = await cropService.smartCrop(
      inputPath,
      outputPath,
      { aspectRatio }
    );
    
    res.json({
      success: true,
      result: {
        outputPath: result.outputPath,
        confidence: result.confidence,
        processingTime: result.processingTime
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Monitoring & Metrics

### Service Status
```typescript
const status = cropService.getStatus();
console.log('Service Status:', {
  isReady: status.isReady,
  modelsLoaded: status.modelsLoaded,
  memoryUsage: status.memoryUsage,
  queueSize: status.queueSize
});
```

### Performance Metrics
- Processing time per video
- Success rate of smart cropping
- Quality scores distribution
- Memory usage patterns
- GPU utilization (if available)

## Troubleshooting

### Common Issues

#### TensorFlow Not Loading
```
Error: Cannot find module '@tensorflow/tfjs-node'
```
**Solution**: Install with legacy peer deps: `npm install @tensorflow/tfjs-node --legacy-peer-deps`

#### GPU Acceleration Issues
```
Warning: GPU acceleration not available, falling back to CPU
```
**Solution**: Install GPU version: `npm install @tensorflow/tfjs-node-gpu`

#### Memory Issues
```
Error: Out of memory during processing
```
**Solution**: Reduce batch size or memory limit in configuration

#### Low Quality Scores
```
Warning: Low crop quality detected, using fallback
```
**Solution**: Check input video quality, adjust quality threshold, or disable AI detection

### Debug Mode
```typescript
const cropService = new CropService(dataDir, {
  enableFaceDetection: false, // Disable for debugging
  qualityThreshold: 0.3       // Lower threshold
});

// Enable detailed logging
process.env.LOG_LEVEL = 'debug';
```

## Future Enhancements

### Planned Features
- [ ] Advanced object detection (COCO-SSD)
- [ ] Custom model training support
- [ ] Real-time preview generation
- [ ] Advanced motion tracking
- [ ] Cloud-based ML processing
- [ ] Batch optimization algorithms

### Performance Improvements
- [ ] WebGL acceleration
- [ ] Worker thread processing
- [ ] Streaming video processing
- [ ] Distributed processing support

## Contributing

When contributing to the Smart Cropping System:

1. **Add Tests**: Include comprehensive tests for new features
2. **Update Documentation**: Keep this README updated
3. **Performance Testing**: Validate memory usage and processing time
4. **Error Handling**: Ensure graceful fallbacks
5. **Integration Testing**: Test with VideoSegmentService

## License

This Smart Cropping System is part of the short-video-maker project and follows the same MIT license.