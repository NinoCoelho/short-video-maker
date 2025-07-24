import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OllamaService } from '../OllamaService';
import type { TranscriptSegment, DetectedScene } from '../../types/import';
import type { MockFetchOptions } from '../../types/mocks';

// Mock fetch
global.fetch = vi.fn();

describe('OllamaService', () => {
  let service: OllamaService;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock successful health check for all instances
    (global.fetch as any).mockImplementation(async (url: string, options?: MockFetchOptions) => {
      if (url.endsWith('/api/tags') && options.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ models: [] })
        };
      }
      
      // Default mock for other requests
      return {
        ok: true,
        json: async () => ({ response: '{}' })
      };
    });
    
    service = new OllamaService({
      baseUrl: 'http://localhost:11434',
      defaultModel: 'gemma3:12b-it-qat',
      cacheEnabled: false // Disable cache for tests
    });
    
    // Wait for health check to complete
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(async () => {
    await service.cleanup();
  });

  describe('health checks', () => {
    it('should check availability on construction', async () => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('should handle unavailable service', async () => {
      // Create a new mock that rejects health checks
      (global.fetch as any).mockRejectedValue(new Error('Connection refused'));
      
      const unavailableService = new OllamaService();
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for async check
      
      expect(unavailableService.getAvailability()).toBe(false);
      await unavailableService.cleanup();
    });
  });

  describe('highlight detection', () => {
    it('should detect highlights in transcript', async () => {
      const transcript: TranscriptSegment[] = [
        {
          startTime: 0,
          endTime: 10,
          text: 'This is an amazing revelation that will shock you!',
          confidence: 0.95
        },
        {
          startTime: 10,
          endTime: 20,
          text: 'Here is the incredible secret nobody talks about.',
          confidence: 0.98
        }
      ];

      // Mock Ollama response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            score: 85,
            reason: 'High engagement potential with shocking revelation and secret',
            confidence: 0.9,
            factors: {
              engagement: 90,
              narrative: 85,
              emotional: 80,
              visual: 70,
              viral: 95
            },
            suggestedStart: 0,
            suggestedEnd: 20,
            title: 'Shocking Secret Revealed',
            description: 'An amazing revelation that will blow your mind',
            keywords: ['shocking', 'secret', 'revelation']
          })
        })
      });

      const highlights = await service.detectHighlights(transcript, {
        minScore: 70,
        maxResults: 5
      });

      expect(highlights).toHaveLength(1);
      expect(highlights[0]).toMatchObject({
        startTime: 0,
        endTime: 20,
        title: 'Shocking Secret Revealed',
        score: 0.85,
        highlightScore: {
          score: 85,
          confidence: 0.9
        }
      });
    });

    it('should handle long transcripts with context windows', async () => {
      // Create a long transcript
      const transcript: TranscriptSegment[] = Array.from({ length: 100 }, (_, i) => ({
        startTime: i * 10,
        endTime: (i + 1) * 10,
        text: `Segment ${i} content here.`,
        confidence: 0.95
      }));

      let callCount = 0;
      (global.fetch as any).mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            response: JSON.stringify({
              score: 60, // Below threshold
              reason: 'Normal content',
              confidence: 0.7,
              factors: {
                engagement: 60,
                narrative: 60,
                emotional: 60,
                visual: 60,
                viral: 60
              }
            })
          })
        };
      });

      const highlights = await service.detectHighlights(transcript, {
        minScore: 70,
        contextWindow: 60 // 60 second windows
      });

      expect(highlights).toHaveLength(0);
      expect(callCount).toBeGreaterThan(1); // Should process multiple windows
    });
  });

  describe('scene boundary detection', () => {
    it('should detect scene boundaries', async () => {
      const transcript: TranscriptSegment[] = [
        {
          startTime: 0,
          endTime: 30,
          text: 'Welcome to our cooking show. Today we will make pasta.',
          confidence: 0.95
        },
        {
          startTime: 30,
          endTime: 60,
          text: 'Now let me show you the garden where we grow our vegetables.',
          confidence: 0.98
        },
        {
          startTime: 60,
          endTime: 90,
          text: 'Back in the kitchen, let us start cooking.',
          confidence: 0.96
        }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            boundaries: [
              {
                timestamp: 30,
                type: 'location_change',
                confidence: 0.95
              },
              {
                timestamp: 60,
                type: 'location_change',
                confidence: 0.92
              }
            ]
          })
        })
      });

      const boundaries = await service.detectSceneBoundaries(transcript);

      expect(boundaries).toHaveLength(2);
      expect(boundaries[0]).toMatchObject({
        timestamp: 30,
        type: 'location_change'
      });
    });
  });

  describe('batch processing', () => {
    it('should batch process multiple operations', async () => {
      const transcript: TranscriptSegment[] = [
        {
          startTime: 0,
          endTime: 10,
          text: 'Test content',
          confidence: 0.95
        }
      ];

      // Mock responses for different operation types
      let callCount = 0;
      (global.fetch as any).mockImplementation(async (url: string, options?: MockFetchOptions) => {
        const body = JSON.parse(options.body);
        callCount++;

        if (body.prompt.includes('highlight')) {
          return {
            ok: true,
            json: async () => ({
              response: JSON.stringify({
                score: 75,
                reason: 'Good content',
                confidence: 0.8,
                factors: { engagement: 75, narrative: 75, emotional: 75, visual: 75, viral: 75 }
              })
            })
          };
        } else if (body.prompt.includes('scene')) {
          return {
            ok: true,
            json: async () => ({
              response: JSON.stringify({
                boundaries: [{ timestamp: 5, type: 'topic_change', confidence: 0.8 }]
              })
            })
          };
        } else {
          return {
            ok: true,
            json: async () => ({
              response: JSON.stringify({
                topics: ['test'],
                keywords: ['content'],
                sentiment: 'neutral',
                summary: 'Test summary'
              })
            })
          };
        }
      });

      const operations = [
        { type: 'highlight' as const, data: { transcript, options: {} } },
        { type: 'scene' as const, data: { transcript } },
        { type: 'topic' as const, data: { transcript } }
      ];

      const results = await service.batchAnalyze(operations);

      expect(results.size).toBe(3);
      expect(results.get('highlight_0')).toHaveProperty('success', true);
      expect(results.get('scene_0')).toHaveProperty('success', true);
      expect(results.get('topic_0')).toHaveProperty('success', true);
    });
  });

  describe('prompt templates', () => {
    it('should use correct prompt template for highlight detection', async () => {
      const transcript: TranscriptSegment[] = [
        {
          startTime: 0,
          endTime: 10,
          text: 'Test content',
          confidence: 0.95
        }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            score: 80,
            reason: 'Test',
            confidence: 0.8,
            factors: { engagement: 80, narrative: 80, emotional: 80, visual: 80, viral: 80 }
          })
        })
      });

      await service.detectHighlights(transcript);

      const fetchCall = (global.fetch as any).mock.calls[1]; // First call is health check
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.prompt).toContain('Analyze this video transcript segment');
      expect(requestBody.prompt).toContain('Engagement potential');
      expect(requestBody.prompt).toContain('Viral potential');
      expect(requestBody.system).toContain('expert video editor');
    });
  });

  describe('error handling', () => {
    it('should retry on failure with exponential backoff', async () => {
      let attempts = 0;
      (global.fetch as any).mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Network error');
        }
        return {
          ok: true,
          json: async () => ({
            response: JSON.stringify({
              topics: ['test'],
              keywords: ['test'],
              sentiment: 'neutral',
              summary: 'Test'
            })
          })
        };
      });

      const start = Date.now();
      const result = await service.analyzeTranscript([
        { startTime: 0, endTime: 10, text: 'Test', confidence: 0.95 }
      ]);
      const duration = Date.now() - start;

      expect(attempts).toBe(3);
      expect(duration).toBeGreaterThan(1000); // Should have delays
      expect(result).toHaveProperty('topics');
    });

    it('should handle malformed responses gracefully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: 'Invalid JSON'
        })
      });

      const result = await service.analyzeTranscript([
        { startTime: 0, endTime: 10, text: 'Test', confidence: 0.95 }
      ]);

      expect(result).toMatchObject({
        topics: [],
        keywords: [],
        sentiment: 'neutral',
        summary: 'Analysis failed'
      });
    });
  });

  describe('cache management', () => {
    it('should cache results when enabled', async () => {
      const cachedService = new OllamaService({
        cacheEnabled: true,
        cacheTTL: 60000
      });

      const transcript: TranscriptSegment[] = [
        {
          startTime: 0,
          endTime: 10,
          text: 'Test content',
          confidence: 0.95
        }
      ];

      // First call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            score: 80,
            reason: 'Test',
            confidence: 0.8,
            factors: { engagement: 80, narrative: 80, emotional: 80, visual: 80, viral: 80 }
          })
        })
      });

      const result1 = await cachedService.detectHighlights(transcript);
      
      // Second call should use cache
      const result2 = await cachedService.detectHighlights(transcript);

      expect(result1).toEqual(result2);
      expect(global.fetch).toHaveBeenCalledTimes(2); // One for health check, one for detection
      
      await cachedService.cleanup();
    });
  });
});