/**
 * Example usage of OllamaService for video analysis
 */

import { OllamaService } from './OllamaService';
import type { TranscriptSegment, DetectedScene } from '../types/import';

async function demonstrateOllamaService() {
  // Initialize the service with custom configuration
  const ollamaService = new OllamaService({
    baseUrl: 'http://localhost:11434',
    defaultModel: 'gemma3:12b-it-qat',
    timeout: 60000, // 60 seconds for long videos
    maxRetries: 3,
    contextWindowSize: 8192,
    batchSize: 5,
    cacheEnabled: true,
    cacheTTL: 3600000 // 1 hour cache
  });

  // Wait for service to be ready
  const isAvailable = await ollamaService.refreshAvailability();
  if (!isAvailable) {
    console.error('Ollama service is not available');
    return;
  }

  // Example transcript from a video
  const transcript: TranscriptSegment[] = [
    {
      startTime: 0,
      endTime: 15,
      text: "Welcome to today's cooking show! I'm going to reveal the secret ingredient that will transform your pasta dishes forever.",
      confidence: 0.95
    },
    {
      startTime: 15,
      endTime: 30,
      text: "But first, let me tell you a funny story about how I discovered this technique. It was a complete accident!",
      confidence: 0.93
    },
    {
      startTime: 30,
      endTime: 45,
      text: "I was in my grandmother's kitchen in Italy, and she was making her famous carbonara. Then something unexpected happened...",
      confidence: 0.96
    },
    {
      startTime: 45,
      endTime: 60,
      text: "She added a splash of pasta water to the pan! I was shocked. But the result was the creamiest, most delicious carbonara I'd ever tasted.",
      confidence: 0.94
    },
    {
      startTime: 60,
      endTime: 75,
      text: "The starch in the pasta water is the secret. It helps create that perfect, silky sauce that clings to every strand of pasta.",
      confidence: 0.97
    },
    {
      startTime: 75,
      endTime: 90,
      text: "Now let me show you exactly how to do it. First, you need to save about a cup of pasta water before draining.",
      confidence: 0.95
    }
  ];

  console.log('=== Video Analysis Example ===\n');

  // 1. Detect highlights for short-form content
  console.log('1. Detecting Highlights...');
  const highlights = await ollamaService.detectHighlights(transcript, {
    minScore: 70,
    maxResults: 3,
    contextWindow: 45 // 45-second windows
  });

  console.log(`Found ${highlights.length} potential highlights:`);
  highlights.forEach(highlight => {
    console.log(`\n- ${highlight.title}`);
    console.log(`  Time: ${highlight.startTime}s - ${highlight.endTime}s`);
    console.log(`  Score: ${highlight.highlightScore.score}/100`);
    console.log(`  Reason: ${highlight.highlightScore.reason}`);
    console.log(`  Factors:`, highlight.highlightScore.factors);
  });

  // 2. Detect scene boundaries
  console.log('\n\n2. Detecting Scene Boundaries...');
  const boundaries = await ollamaService.detectSceneBoundaries(transcript);
  
  console.log(`Found ${boundaries.length} scene boundaries:`);
  boundaries.forEach(boundary => {
    console.log(`- ${boundary.timestamp}s: ${boundary.type} (confidence: ${boundary.confidence})`);
  });

  // 3. Analyze overall video content
  console.log('\n\n3. Analyzing Video Content...');
  const analysis = await ollamaService.analyzeTranscript(transcript);
  
  console.log('Video Analysis:');
  console.log(`- Topics: ${analysis.topics.join(', ')}`);
  console.log(`- Keywords: ${analysis.keywords.join(', ')}`);
  console.log(`- Sentiment: ${analysis.sentiment}`);
  console.log(`- Summary: ${analysis.summary}`);

  // 4. Generate video metadata
  console.log('\n\n4. Generating Video Metadata...');
  const metadata = await ollamaService.generateVideoMetadata({
    summary: analysis.summary,
    topics: analysis.topics,
    keywords: analysis.keywords,
    sentiment: analysis.sentiment,
    duration: 90,
    scenes: [],
    suggestedClips: highlights
  });

  console.log('Generated Metadata:');
  console.log(`- Title: ${metadata.title}`);
  console.log(`- Description: ${metadata.description}`);
  console.log(`- Tags: ${metadata.tags.join(', ')}`);

  // 5. Batch processing example
  console.log('\n\n5. Batch Processing Example...');
  const batchOperations = [
    { type: 'highlight' as const, data: { transcript: transcript.slice(0, 3), options: { minScore: 60 } } },
    { type: 'topic' as const, data: { transcript: transcript.slice(3, 6) } },
    { type: 'scene' as const, data: { transcript } }
  ];

  const batchResults = await ollamaService.batchAnalyze(batchOperations);
  console.log(`Batch processed ${batchResults.size} operations`);
  
  batchResults.forEach((result, key) => {
    console.log(`- ${key}: ${result.success ? 'Success' : 'Failed'}`);
  });

  // 6. Example with scenes
  console.log('\n\n6. Analyzing Scenes with Visual Context...');
  const scenes: DetectedScene[] = [
    {
      id: 'scene_1',
      startTime: 0,
      endTime: 30,
      duration: 30,
      dominantColors: ['#8B4513', '#F5DEB3', '#FFE4B5'],
      keyFrames: []
    },
    {
      id: 'scene_2', 
      startTime: 30,
      endTime: 60,
      duration: 30,
      dominantColors: ['#FF6347', '#FFA500', '#FFFACD'],
      keyFrames: []
    },
    {
      id: 'scene_3',
      startTime: 60,
      endTime: 90,
      duration: 30,
      dominantColors: ['#F0E68C', '#FAFAD2', '#FFFFE0'],
      keyFrames: []
    }
  ];

  const analyzedScenes = await ollamaService.analyzeScenes(scenes);
  console.log('Scene Analysis:');
  analyzedScenes.forEach(scene => {
    console.log(`\n- Scene ${scene.id} (${scene.startTime}s - ${scene.endTime}s):`);
    console.log(`  Activity: ${scene.activity || 'Unknown'}`);
    console.log(`  Objects: ${scene.objects?.join(', ') || 'None detected'}`);
  });

  // 7. Generate clip suggestions based on transcript and scenes
  console.log('\n\n7. Generating Clip Suggestions...');
  const clipSuggestions = await ollamaService.generateClipSuggestions(
    transcript,
    analyzedScenes,
    5 // Top 5 suggestions
  );

  console.log(`Generated ${clipSuggestions.length} clip suggestions:`);
  clipSuggestions.forEach((clip, index) => {
    console.log(`\n${index + 1}. ${clip.title}`);
    console.log(`   Time: ${clip.startTime}s - ${clip.endTime}s`);
    console.log(`   Description: ${clip.description}`);
    console.log(`   Reason: ${clip.reason}`);
    console.log(`   Score: ${(clip.score * 100).toFixed(0)}/100`);
    console.log(`   Keywords: ${clip.keywords.join(', ')}`);
  });

  // Clean up
  await ollamaService.cleanup();
  console.log('\n\nService cleaned up successfully.');
}

// Performance monitoring example
async function monitorPerformance() {
  const service = new OllamaService({
    defaultModel: 'gemma3:12b-it-qat',
    cacheEnabled: true
  });

  // Listen to service events
  service.on('service:unavailable', () => {
    console.log('⚠️  Ollama service became unavailable');
  });

  // Long video processing with progress tracking
  console.log('Processing long video transcript...');
  
  // Create a very long transcript (e.g., 30 minutes)
  const longTranscript: TranscriptSegment[] = Array.from({ length: 180 }, (_, i) => ({
    startTime: i * 10,
    endTime: (i + 1) * 10,
    text: `Segment ${i + 1}: This is content from minute ${Math.floor(i * 10 / 60)} of the video.`,
    confidence: 0.95
  }));

  const startTime = Date.now();
  
  // Process in chunks to avoid timeouts
  const chunkSize = 30; // 30 segments at a time
  const allHighlights = [];
  
  for (let i = 0; i < longTranscript.length; i += chunkSize) {
    const chunk = longTranscript.slice(i, i + chunkSize);
    const progress = ((i + chunkSize) / longTranscript.length * 100).toFixed(1);
    
    console.log(`Processing: ${progress}%`);
    
    const highlights = await service.detectHighlights(chunk, {
      minScore: 75,
      maxResults: 2
    });
    
    allHighlights.push(...highlights);
  }

  const processingTime = (Date.now() - startTime) / 1000;
  console.log(`\nProcessing completed in ${processingTime.toFixed(1)} seconds`);
  console.log(`Found ${allHighlights.length} total highlights`);

  // Get token usage stats
  const stats = service.getTokenUsageStats();
  console.log('\nToken Usage Statistics:');
  console.log(`- Average per request: ${stats.averagePerRequest} tokens`);
  console.log(`- Estimated cost: $${stats.estimatedCost.toFixed(4)}`);

  await service.cleanup();
}

// Error handling example
async function handleErrors() {
  const service = new OllamaService({
    baseUrl: 'http://localhost:11434',
    defaultModel: 'nonexistent-model', // This will cause errors
    maxRetries: 2
  });

  try {
    await service.analyzeTranscript([
      { startTime: 0, endTime: 10, text: 'Test', confidence: 0.95 }
    ]);
  } catch (error) {
    console.error('Failed to analyze transcript:', error);
  }

  // Service will still return default values on error
  const result = await service.analyzeTranscript([
    { startTime: 0, endTime: 10, text: 'Test', confidence: 0.95 }
  ]);
  
  console.log('Fallback result:', result);

  await service.cleanup();
}

// Run examples
if (require.main === module) {
  (async () => {
    try {
      await demonstrateOllamaService();
      console.log('\n\n=== Performance Monitoring Example ===\n');
      await monitorPerformance();
      console.log('\n\n=== Error Handling Example ===\n');
      await handleErrors();
    } catch (error) {
      console.error('Example failed:', error);
    }
  })();
}

export { demonstrateOllamaService, monitorPerformance, handleErrors };