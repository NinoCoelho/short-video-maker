import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { TranslationService } from '../TranslationService';
import { TranscriptSegment } from '../../types/import';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import NodeCache from 'node-cache';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Translate } from '@google-cloud/translate/build/src/v2';
import * as deepl from 'deepl-node';

// Mock modules
vi.mock('fs-extra');
vi.mock('openai');
vi.mock('@google/generative-ai');
vi.mock('@google-cloud/translate/build/src/v2');
vi.mock('deepl-node');
vi.mock('node-cache');
vi.mock('../OllamaService');
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('TranslationService', () => {
  let service: TranslationService;
  let tempDir: string;
  let mockCache: any;
  let mockOpenAI: any;
  let mockGoogleAI: any;
  let mockGoogleTranslate: any;
  let mockDeepL: any;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), 'translation-test-' + Date.now());
    
    // Mock fs operations
    (fs.ensureDir as MockedFunction<typeof fs.ensureDir>).mockResolvedValue(undefined);
    (fs.readJson as MockedFunction<typeof fs.readJson>).mockResolvedValue({});
    (fs.writeJson as MockedFunction<typeof fs.writeJson>).mockResolvedValue(undefined);
    
    // Mock cache
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      flushAll: vi.fn(),
      keys: vi.fn().mockReturnValue([])
    };
    (NodeCache as any).mockImplementation(() => mockCache);

    // Mock OpenAI
    mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify([
                  { text: 'Translated text 1', startTime: 0, endTime: 5 },
                  { text: 'Translated text 2', startTime: 5, endTime: 10 }
                ])
              }
            }]
          })
        }
      }
    };
    (OpenAI as any).mockImplementation(() => mockOpenAI);

    // Mock Google Generative AI
    const mockModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { text: 'Google translated 1', startTime: 0, endTime: 5 },
            { text: 'Google translated 2', startTime: 5, endTime: 10 }
          ])
        }
      })
    };
    mockGoogleAI = {
      getGenerativeModel: vi.fn().mockReturnValue(mockModel)
    };
    (GoogleGenerativeAI as any).mockImplementation(() => mockGoogleAI);

    // Mock Google Cloud Translate
    mockGoogleTranslate = {
      translate: vi.fn().mockResolvedValue(['Translated text'])
    };
    (Translate as any).mockImplementation(() => mockGoogleTranslate);

    // Mock DeepL
    mockDeepL = {
      Translator: vi.fn().mockImplementation(() => ({
        translateText: vi.fn().mockResolvedValue({
          text: 'DeepL translated text'
        })
      }))
    };
    Object.assign(deepl, mockDeepL);

    service = new TranslationService(tempDir);
    await new Promise(resolve => setTimeout(resolve, 10)); // Allow initialization
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize service successfully', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(EventEmitter);
      expect(fs.ensureDir).toHaveBeenCalledWith(expect.stringContaining('translations'));
    });

    it('should initialize with custom config', async () => {
      const config = {
        defaultProvider: 'deepl' as const,
        enableCache: false,
        apiKeys: {
          deepl: 'test-key'
        }
      };

      const customService = new TranslationService(tempDir, config);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(customService).toBeDefined();
    });
  });

  describe('translateSegments', () => {
    const segments: TranscriptSegment[] = [
      { startTime: 0, endTime: 5, text: 'Hello world', confidence: 0.95 },
      { startTime: 5, endTime: 10, text: 'How are you?', confidence: 0.98 }
    ];

    it('should translate segments with OpenAI', async () => {
      const options = {
        provider: 'openai' as const,
        targetLanguage: 'es'
      };

      const result = await service.translateSegments(segments, options);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('Translated text 1');
      expect(result.targetLanguage).toBe('es');
      expect(result.provider).toBe('openai');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should translate segments with Google AI', async () => {
      const options = {
        provider: 'google-ai' as const,
        targetLanguage: 'fr'
      };

      const result = await service.translateSegments(segments, options);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('Google translated 1');
      expect(result.provider).toBe('google-ai');
      expect(mockGoogleAI.getGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-pro' });
    });

    it('should translate segments with Google Cloud Translate', async () => {
      const options = {
        provider: 'google-cloud' as const,
        targetLanguage: 'de'
      };

      const result = await service.translateSegments(segments, options);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('Translated text');
      expect(result.provider).toBe('google-cloud');
      expect(mockGoogleTranslate.translate).toHaveBeenCalledTimes(2);
    });

    it('should translate segments with DeepL', async () => {
      const options = {
        provider: 'deepl' as const,
        targetLanguage: 'ja'
      };

      const result = await service.translateSegments(segments, options);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('DeepL translated text');
      expect(result.provider).toBe('deepl');
    });

    it('should detect source language automatically', async () => {
      mockGoogleTranslate.translate.mockResolvedValue([
        'Translated text',
        { data: { translations: [{ detectedSourceLanguage: 'en' }] } }
      ]);

      const options = {
        provider: 'google-cloud' as const,
        targetLanguage: 'es'
      };

      const result = await service.translateSegments(segments, options);

      expect(result.sourceLanguage).toBe('en');
    });

    it('should use cache when enabled', async () => {
      mockCache.get.mockReturnValue({
        segments: [{ text: 'Cached translation', startTime: 0, endTime: 5 }],
        sourceLanguage: 'en',
        targetLanguage: 'es'
      });

      const options = {
        targetLanguage: 'es',
        enableCache: true
      };

      const result = await service.translateSegments(segments, options);

      expect(result.segments[0].text).toBe('Cached translation');
      expect(result.cached).toBe(true);
      expect(mockCache.get).toHaveBeenCalled();
    });

    it('should apply glossary terms', async () => {
      const options = {
        provider: 'openai' as const,
        targetLanguage: 'es',
        glossary: {
          'Hello': 'Hola',
          'world': 'mundo'
        }
      };

      await service.translateSegments(segments, options);

      const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      expect(createCall.messages[1].content).toContain('Glossary');
      expect(createCall.messages[1].content).toContain('Hello');
      expect(createCall.messages[1].content).toContain('Hola');
    });

    it('should handle translation style', async () => {
      const options = {
        provider: 'openai' as const,
        targetLanguage: 'fr',
        style: 'formal' as const
      };

      await service.translateSegments(segments, options);

      const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      expect(createCall.messages[0].content).toContain('formal');
    });

    it('should handle cultural adaptation', async () => {
      const options = {
        provider: 'openai' as const,
        targetLanguage: 'ja',
        culturalAdaptation: true
      };

      await service.translateSegments(segments, options);

      const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      expect(createCall.messages[0].content).toContain('cultural');
    });

    it('should handle length optimization', async () => {
      const options = {
        provider: 'openai' as const,
        targetLanguage: 'de',
        lengthOptimization: true
      };

      await service.translateSegments(segments, options);

      const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      expect(createCall.messages[0].content).toContain('timing');
    });
  });

  describe('fallback providers', () => {
    it('should fallback to next provider on error', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('API error'));

      const options = {
        provider: 'openai' as const,
        targetLanguage: 'es',
        fallbackProviders: ['google-ai', 'deepl']
      };

      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Test', confidence: 0.95 }
      ];

      const result = await service.translateSegments(segments, options);

      expect(result.provider).toBe('google-ai');
      expect(mockGoogleAI.getGenerativeModel).toHaveBeenCalled();
    });

    it('should try all fallback providers', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));
      mockGoogleAI.getGenerativeModel.mockImplementation(() => ({
        generateContent: vi.fn().mockRejectedValue(new Error('Google error'))
      }));

      const options = {
        provider: 'openai' as const,
        targetLanguage: 'es',
        fallbackProviders: ['google-ai', 'deepl']
      };

      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Test', confidence: 0.95 }
      ];

      const result = await service.translateSegments(segments, options);

      expect(result.provider).toBe('deepl');
    });

    it('should throw error if all providers fail', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI error'));
      mockGoogleAI.getGenerativeModel.mockImplementation(() => ({
        generateContent: vi.fn().mockRejectedValue(new Error('Google error'))
      }));

      const options = {
        provider: 'openai' as const,
        targetLanguage: 'es',
        fallbackProviders: ['google-ai']
      };

      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Test', confidence: 0.95 }
      ];

      await expect(service.translateSegments(segments, options))
        .rejects.toThrow('All translation providers failed');
    });
  });

  describe('batch translation', () => {
    it('should handle large batches with context windows', async () => {
      const largeSegments: TranscriptSegment[] = Array.from({ length: 100 }, (_, i) => ({
        startTime: i * 5,
        endTime: (i + 1) * 5,
        text: `Segment ${i}`,
        confidence: 0.95
      }));

      const options = {
        provider: 'openai' as const,
        targetLanguage: 'es',
        contextWindow: 10
      };

      await service.translateSegments(largeSegments, options);

      // Should make multiple API calls for large batches
      expect(mockOpenAI.chat.completions.create.mock.calls.length).toBeGreaterThan(1);
    });

    it('should maintain context across batches', async () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'He said hello.', confidence: 0.95 },
        { startTime: 5, endTime: 10, text: 'Then he left.', confidence: 0.95 }
      ];

      const options = {
        provider: 'openai' as const,
        targetLanguage: 'es',
        contextWindow: 1,
        preserveFormatting: true
      };

      await service.translateSegments(segments, options);

      const calls = mockOpenAI.chat.completions.create.mock.calls;
      expect(calls.length).toBe(2);
      // Second call should include context from first segment
      expect(calls[1][0].messages[1].content).toContain('Context');
    });
  });

  describe('subtitle generation', () => {
    it('should generate SRT subtitles', async () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Hello world', confidence: 0.95 },
        { startTime: 5, endTime: 10, text: 'How are you?', confidence: 0.98 }
      ];

      const srt = await service.generateSubtitles(segments, 'srt');

      expect(srt).toContain('1\n00:00:00,000 --> 00:00:05,000\nHello world');
      expect(srt).toContain('2\n00:00:05,000 --> 00:00:10,000\nHow are you?');
    });

    it('should generate VTT subtitles', async () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Hello world', confidence: 0.95 }
      ];

      const vtt = await service.generateSubtitles(segments, 'vtt');

      expect(vtt).toContain('WEBVTT');
      expect(vtt).toContain('00:00:00.000 --> 00:00:05.000');
      expect(vtt).toContain('Hello world');
    });

    it('should generate ASS subtitles with style', async () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Hello world', confidence: 0.95 }
      ];

      const style = {
        fontFamily: 'Arial',
        fontSize: 24,
        color: '#FFFFFF',
        position: 'bottom' as const
      };

      const ass = await service.generateSubtitles(segments, 'ass', style);

      expect(ass).toContain('[Script Info]');
      expect(ass).toContain('[V4+ Styles]');
      expect(ass).toContain('Arial');
      expect(ass).toContain('[Events]');
    });

    it('should handle empty segments', async () => {
      const segments: TranscriptSegment[] = [];

      const srt = await service.generateSubtitles(segments, 'srt');

      expect(srt).toBe('');
    });
  });

  describe('language detection', () => {
    it('should detect language from text', async () => {
      mockGoogleTranslate.translate.mockResolvedValue([
        'Translated',
        { data: { translations: [{ detectedSourceLanguage: 'en' }] } }
      ]);

      const language = await service.detectLanguage('Hello world');

      expect(language).toBe('en');
    });

    it('should handle language detection errors', async () => {
      mockGoogleTranslate.translate.mockRejectedValue(new Error('API error'));

      const language = await service.detectLanguage('Test text');

      expect(language).toBe('unknown');
    });
  });

  describe('job management', () => {
    it('should create translation job', async () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Test', confidence: 0.95 }
      ];

      const job = await service.createTranslationJob(segments, 'es');

      expect(job).toMatchObject({
        id: expect.any(String),
        status: 'pending',
        progress: 0,
        segments,
        targetLanguage: 'es'
      });
    });

    it('should process translation job', async () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Test', confidence: 0.95 }
      ];

      const job = await service.createTranslationJob(segments, 'es');
      
      const progressHandler = vi.fn();
      service.on('translation:progress', progressHandler);

      await service.processJob(job.id);

      expect(progressHandler).toHaveBeenCalledWith({
        jobId: job.id,
        progress: expect.any(Number)
      });

      const updatedJob = service.getJob(job.id);
      expect(updatedJob?.status).toBe('completed');
      expect(updatedJob?.translatedSegments).toBeDefined();
    });

    it('should handle job processing errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Test', confidence: 0.95 }
      ];

      const job = await service.createTranslationJob(segments, 'es');
      
      await expect(service.processJob(job.id)).rejects.toThrow();

      const updatedJob = service.getJob(job.id);
      expect(updatedJob?.status).toBe('failed');
      expect(updatedJob?.error).toBe('API error');
    });

    it('should get all jobs', () => {
      const jobs = service.getAllJobs();
      expect(Array.isArray(jobs)).toBe(true);
    });

    it('should cancel job', async () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Test', confidence: 0.95 }
      ];

      const job = await service.createTranslationJob(segments, 'es');
      
      await service.cancelJob(job.id);

      const cancelledJob = service.getJob(job.id);
      expect(cancelledJob?.status).toBe('cancelled');
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return supported languages', () => {
      const languages = service.getSupportedLanguages();

      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
      expect(languages[0]).toHaveProperty('code');
      expect(languages[0]).toHaveProperty('name');
      expect(languages.find(l => l.code === 'en')).toBeDefined();
    });

    it('should filter by provider', () => {
      const deeplLanguages = service.getSupportedLanguages('deepl');
      const allLanguages = service.getSupportedLanguages();

      expect(deeplLanguages.length).toBeLessThanOrEqual(allLanguages.length);
    });
  });

  describe('statistics', () => {
    it('should return service statistics', async () => {
      const stats = await service.getServiceStats();

      expect(stats).toHaveProperty('totalTranslations');
      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('supportedLanguages');
      expect(stats).toHaveProperty('activeProviders');
      expect(Array.isArray(stats.activeProviders)).toBe(true);
    });
  });

  describe('event emissions', () => {
    it('should emit translation started event', async () => {
      const startHandler = vi.fn();
      service.on('translation:started', startHandler);

      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Test', confidence: 0.95 }
      ];

      await service.translateSegments(segments, { targetLanguage: 'es' });

      expect(startHandler).toHaveBeenCalledWith({
        segmentCount: 1,
        targetLanguage: 'es',
        provider: expect.any(String)
      });
    });

    it('should emit translation completed event', async () => {
      const completeHandler = vi.fn();
      service.on('translation:completed', completeHandler);

      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Test', confidence: 0.95 }
      ];

      await service.translateSegments(segments, { targetLanguage: 'es' });

      expect(completeHandler).toHaveBeenCalledWith({
        segmentCount: 1,
        targetLanguage: 'es',
        provider: expect.any(String),
        duration: expect.any(Number)
      });
    });

    it('should emit translation error event', async () => {
      const errorHandler = vi.fn();
      service.on('translation:error', errorHandler);

      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: 'Test', confidence: 0.95 }
      ];

      await expect(service.translateSegments(segments, { 
        targetLanguage: 'es',
        provider: 'openai',
        fallbackProviders: []
      })).rejects.toThrow();

      expect(errorHandler).toHaveBeenCalledWith({
        error: expect.any(Error),
        provider: 'openai'
      });
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      await service.clearCache();

      expect(mockCache.flushAll).toHaveBeenCalled();
    });

    it('should get cache stats', async () => {
      mockCache.keys.mockReturnValue(['key1', 'key2', 'key3']);

      const stats = await service.getCacheStats();

      expect(stats).toHaveProperty('entries', 3);
      expect(stats).toHaveProperty('hitRate');
    });
  });

  describe('cleanup', () => {
    it('should save state on cleanup', async () => {
      await service.cleanup();

      expect(fs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('state.json'),
        expect.any(Object)
      );
    });
  });
});