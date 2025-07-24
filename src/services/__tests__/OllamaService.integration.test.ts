import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OllamaService } from '../OllamaService';
import type { TranscriptSegment } from '../../types/import';

// Integration tests - these run against a real Ollama instance
// Skip if Ollama is not available locally
describe.skipIf(!process.env.OLLAMA_INTEGRATION_TEST)('OllamaService Integration', () => {
  let service: OllamaService;

  beforeAll(async () => {
    service = new OllamaService({
      baseUrl: 'http://localhost:11434',
      defaultModel: 'gemma3:12b-it-qat',
      timeout: 60000, // 60 seconds for real requests
      cacheEnabled: false
    });

    // Wait for service to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if service is available
    const isAvailable = await service.refreshAvailability();
    if (!isAvailable) {
      console.warn('Ollama service not available - skipping integration tests');
    }
  }, 10000);

  afterAll(async () => {
    if (service) {
      await service.cleanup();
    }
  });

  it('should connect to Ollama and get models', async () => {
    const isAvailable = service.getAvailability();
    if (!isAvailable) {
      console.log('Skipping test - Ollama not available');
      return;
    }

    const models = await service.getModels();
    expect(Array.isArray(models)).toBe(true);
  }, 15000);

  it('should analyze a simple transcript', async () => {
    const isAvailable = service.getAvailability();
    if (!isAvailable) {
      console.log('Skipping test - Ollama not available');
      return;
    }

    const transcript: TranscriptSegment[] = [
      {
        startTime: 0,
        endTime: 30,
        text: 'Welcome to this amazing cooking tutorial. Today I will show you how to make the perfect carbonara.',
        confidence: 0.95
      }
    ];

    const analysis = await service.analyzeTranscript(transcript);
    
    expect(analysis).toHaveProperty('topics');
    expect(analysis).toHaveProperty('keywords');
    expect(analysis).toHaveProperty('sentiment');
    expect(analysis).toHaveProperty('summary');
    
    console.log('Analysis result:', analysis);
  }, 30000);

  it('should detect highlights in a cooking video transcript', async () => {
    const isAvailable = service.getAvailability();
    if (!isAvailable) {
      console.log('Skipping test - Ollama not available');
      return;
    }

    const transcript: TranscriptSegment[] = [
      {
        startTime: 0,
        endTime: 15,
        text: 'Welcome to my kitchen! Today I have an incredible secret to share.',
        confidence: 0.95
      },
      {
        startTime: 15,
        endTime: 30,
        text: 'This one ingredient will completely transform your pasta dishes forever.',
        confidence: 0.93
      },
      {
        startTime: 30,
        endTime: 45,
        text: 'Are you ready for this mind-blowing revelation? Here it is...',
        confidence: 0.96
      }
    ];

    const highlights = await service.detectHighlights(transcript, {
      minScore: 60,
      maxResults: 3
    });
    
    expect(Array.isArray(highlights)).toBe(true);
    console.log(`Found ${highlights.length} highlights:`, highlights);
    
    if (highlights.length > 0) {
      expect(highlights[0]).toHaveProperty('highlightScore');
      expect(highlights[0].highlightScore).toHaveProperty('score');
      expect(highlights[0].highlightScore).toHaveProperty('factors');
    }
  }, 45000);

  it('should generate video metadata', async () => {
    const isAvailable = service.getAvailability();
    if (!isAvailable) {
      console.log('Skipping test - Ollama not available');
      return;
    }

    const analysis = {
      summary: 'A cooking tutorial showing how to make perfect carbonara with a secret ingredient.',
      topics: ['cooking', 'pasta', 'carbonara', 'tutorial'],
      keywords: ['secret', 'ingredient', 'pasta', 'cooking', 'carbonara'],
      sentiment: 'positive' as const,
      duration: 300,
      scenes: [],
      suggestedClips: []
    };

    const metadata = await service.generateVideoMetadata(analysis);
    
    expect(metadata).toHaveProperty('title');
    expect(metadata).toHaveProperty('description');
    expect(metadata).toHaveProperty('tags');
    expect(Array.isArray(metadata.tags)).toBe(true);
    
    console.log('Generated metadata:', metadata);
  }, 30000);
});

// Performance test - run with PERFORMANCE_TEST=true
describe.skipIf(!process.env.PERFORMANCE_TEST)('OllamaService Performance', () => {
  let service: OllamaService;

  beforeAll(async () => {
    service = new OllamaService({
      baseUrl: 'http://localhost:11434',
      defaultModel: 'gemma3:12b-it-qat',
      cacheEnabled: true,
      batchSize: 3
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    await service.cleanup();
  });

  it('should handle large transcript efficiently', async () => {
    const isAvailable = service.getAvailability();
    if (!isAvailable) {
      console.log('Skipping performance test - Ollama not available');
      return;
    }

    // Create a large transcript (10 minutes)
    const transcript: TranscriptSegment[] = Array.from({ length: 60 }, (_, i) => ({
      startTime: i * 10,
      endTime: (i + 1) * 10,
      text: `This is segment ${i + 1} of the video. Here we discuss important topic number ${i + 1} with interesting insights and valuable information that viewers will find engaging.`,
      confidence: 0.95
    }));

    const startTime = Date.now();
    
    const highlights = await service.detectHighlights(transcript, {
      minScore: 70,
      maxResults: 5,
      contextWindow: 60 // Process in 60-second windows
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`Processed ${transcript.length} segments in ${duration}ms`);
    console.log(`Found ${highlights.length} highlights`);
    console.log(`Average: ${(duration / transcript.length).toFixed(1)}ms per segment`);
    
    expect(duration).toBeLessThan(120000); // Should complete within 2 minutes
    expect(Array.isArray(highlights)).toBe(true);
  }, 180000); // 3 minute timeout

  it('should use caching effectively', async () => {
    const isAvailable = service.getAvailability();
    if (!isAvailable) {
      console.log('Skipping cache test - Ollama not available');
      return;
    }

    const transcript: TranscriptSegment[] = [
      {
        startTime: 0,
        endTime: 30,
        text: 'This is a test transcript for caching.',
        confidence: 0.95
      }
    ];

    // First call - should hit the API
    const start1 = Date.now();
    const result1 = await service.detectHighlights(transcript);
    const duration1 = Date.now() - start1;

    // Second call - should use cache (much faster)
    const start2 = Date.now();
    const result2 = await service.detectHighlights(transcript);
    const duration2 = Date.now() - start2;

    console.log(`First call: ${duration1}ms, Second call: ${duration2}ms`);
    
    expect(duration2).toBeLessThan(duration1 * 0.1); // Cache should be 10x faster
    expect(result1).toEqual(result2);
  }, 60000);
});