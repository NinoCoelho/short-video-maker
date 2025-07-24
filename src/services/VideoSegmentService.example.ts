/**
 * VideoSegmentService Usage Examples
 * 
 * This file demonstrates how to use the enhanced VideoSegmentService
 * with all its features including keyframe alignment, speech boundaries,
 * transition effects, and smart segmentation.
 */

import { VideoSegmentService, SegmentOptions } from './VideoSegmentService';
import { TranscriptSegment } from '../types/import';
import path from 'path';

async function examples() {
  const dataDir = path.join(__dirname, '../../data');
  const segmentService = new VideoSegmentService(dataDir);
  
  const videoPath = '/path/to/your/video.mp4';
  
  // Example 1: Basic video segmentation with keyframe alignment
  console.log('=== Example 1: Basic Segmentation with Keyframe Alignment ===');
  try {
    const basicSegments = await segmentService.cutSegments(
      videoPath,
      [
        { startTime: 0, endTime: 30 },
        { startTime: 30, endTime: 60 },
        { startTime: 60, endTime: 90 }
      ],
      {
        quality: 'high',
        alignToKeyframes: true,
        fadeIn: 0.5,
        fadeOut: 0.5,
        minDuration: 15,
        maxDuration: 45
      }
    );
    
    console.log(`Created ${basicSegments.length} segments with keyframe alignment`);
    basicSegments.forEach((segment, index) => {
      console.log(`  Segment ${index + 1}: ${segment.startTime}s - ${segment.endTime}s (${segment.duration}s)`);
    });
  } catch (error) {
    console.error('Error in basic segmentation:', error);
  }

  // Example 2: Smart segmentation with transcription alignment
  console.log('\n=== Example 2: Smart Segmentation with Speech Alignment ===');
  try {
    // Sample transcript segments (normally from TranscriptionService)
    const transcriptSegments: TranscriptSegment[] = [
      { text: 'Welcome to this tutorial.', startTime: 5, endTime: 8 },
      { text: 'Today we will learn about video processing.', startTime: 9, endTime: 14 },
      { text: 'First, let me show you the basics.', startTime: 15, endTime: 19 },
      { text: 'This is very important to understand.', startTime: 20, endTime: 25 },
      { text: 'Now, let us move to the next topic.', startTime: 26, endTime: 31 },
      { text: 'Here is another example.', startTime: 32, endTime: 36 },
      { text: 'Finally, let me summarize everything.', startTime: 37, endTime: 42 }
    ];

    const smartSegments = await segmentService.smartSegmentation(
      videoPath,
      transcriptSegments,
      {
        preferredDuration: 20,
        minDuration: 10,
        maxDuration: 35,
        useSceneDetection: true,
        preserveContext: true,
        quality: 'high'
      }
    );
    
    console.log(`Created ${smartSegments.length} smart segments with context preservation`);
    smartSegments.forEach((segment, index) => {
      console.log(`  Segment ${index + 1}: ${segment.startTime}s - ${segment.endTime}s (${segment.duration}s)`);
      if (segment.transcriptSegments && segment.transcriptSegments.length > 0) {
        console.log(`    Speech: "${segment.transcriptSegments.map(t => t.text).join(' ')}"`);
      }
    });
  } catch (error) {
    console.error('Error in smart segmentation:', error);
  }

  // Example 3: Scene-based automatic segmentation
  console.log('\n=== Example 3: Automatic Scene Detection ===');
  try {
    const detectedScenes = await segmentService.detectScenes(videoPath, {
      threshold: 0.4,
      minSceneDuration: 5,
      method: 'content'
    });
    
    console.log(`Detected ${detectedScenes.length} scenes automatically`);
    detectedScenes.forEach((scene, index) => {
      console.log(`  Scene ${index + 1}: ${scene.startTime}s - ${scene.endTime}s (${scene.duration}s)`);
    });
  } catch (error) {
    console.error('Error in scene detection:', error);
  }

  // Example 4: Extract highlights based on audio activity
  console.log('\n=== Example 4: Audio-based Highlight Extraction ===');
  try {
    const highlights = await segmentService.extractHighlights(videoPath, {
      minVolume: -15, // Higher threshold for more selective highlights
      minDuration: 8,
      maxDuration: 25
    });
    
    console.log(`Extracted ${highlights.length} highlight segments`);
    highlights.forEach((highlight, index) => {
      console.log(`  Highlight ${index + 1}: ${highlight.startTime}s - ${highlight.endTime}s (${highlight.duration}s)`);
    });
  } catch (error) {
    console.error('Error in highlight extraction:', error);
  }

  // Example 5: Merge segments with transition effects
  console.log('\n=== Example 5: Merge Segments with Transitions ===');
  try {
    // Assume we have some segments to merge
    const segmentsToMerge = await segmentService.splitIntoChunks(videoPath, 15, {
      quality: 'medium',
      fadeIn: 0.3,
      fadeOut: 0.3
    });
    
    // Take first 3 segments for merging example
    const firstThreeSegments = segmentsToMerge.slice(0, 3);
    
    if (firstThreeSegments.length > 0) {
      const mergedPath = path.join(dataDir, 'merged-with-transitions.mp4');
      await segmentService.mergeSegments(firstThreeSegments, mergedPath, {
        transition: 'fade',
        transitionDuration: 1.0,
        quality: 'high',
        format: 'mp4'
      });
      
      console.log(`Merged ${firstThreeSegments.length} segments with fade transitions`);
      console.log(`Output saved to: ${mergedPath}`);
    }
  } catch (error) {
    console.error('Error in segment merging:', error);
  }

  // Example 6: Advanced options showcase
  console.log('\n=== Example 6: Advanced Options Showcase ===');
  try {
    const advancedSegments = await segmentService.cutSegments(
      videoPath,
      [{ startTime: 30, endTime: 90 }],
      {
        quality: 'high',
        format: 'mp4',
        codec: 'libx264',
        alignToKeyframes: true,
        alignToSpeech: true,
        contextPadding: 2, // 2 seconds of context before/after
        fadeIn: 1,
        fadeOut: 1,
        speed: 1.2, // Slight speed increase
        transition: 'fade',
        transitionDuration: 0.8,
        minDuration: 20,
        maxDuration: 70
      },
      transcriptSegments
    );
    
    console.log('Advanced segmentation with all options enabled:');
    advancedSegments.forEach((segment, index) => {
      console.log(`  Segment ${index + 1}:`);
      console.log(`    Time: ${segment.startTime}s - ${segment.endTime}s (${segment.duration}s)`);
      console.log(`    Keyframe aligned: ${segment.keyframeAligned}`);
      console.log(`    Has speech data: ${!!segment.transcriptSegments?.length}`);
      console.log(`    Output: ${segment.outputPath}`);
    });
  } catch (error) {
    console.error('Error in advanced segmentation:', error);
  }

  // Event listeners example
  console.log('\n=== Setting up event listeners ===');
  segmentService.on('segmentation:started', (data) => {
    console.log(`Started segmenting video with ${data.segments} segments`);
  });

  segmentService.on('segmentation:progress', (data) => {
    console.log(`Progress: ${data.progress.toFixed(1)}% (${data.completed}/${data.total})`);
  });

  segmentService.on('segmentation:completed', (data) => {
    console.log(`Segmentation completed! Created ${data.segments.length} segments`);
  });

  segmentService.on('merge:started', (data) => {
    console.log(`Started merging ${data.segments} segments`);
  });

  segmentService.on('merge:progress', (progress) => {
    if (progress.percent) {
      console.log(`Merge progress: ${progress.percent.toFixed(1)}%`);
    }
  });

  segmentService.on('merge:completed', (data) => {
    console.log(`Merge completed! Output: ${data.outputPath}`);
  });

  console.log('\nAll examples completed! Check the console output above for results.');
}

// Export for use in other modules
export { examples };

// Run examples if this file is executed directly
if (require.main === module) {
  examples().catch(console.error);
}