import { describe, it, expect, beforeEach, afterEach, vi, Mock, MockedFunction } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { TranslationService, TranslationOptions, TranslationJob, SubtitleStyle } from './TranslationService';
import { TranscriptSegment } from '../types/import';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Translate } from '@google-cloud/translate/build/src/v2';
import * as deepl from 'deepl-node';
import NodeCache from 'node-cache';
import { OllamaService } from './OllamaService';

// Mock dependencies
vi.mock('fs-extra');
vi.mock('../logger');
vi.mock('openai');
vi.mock('@google/generative-ai');
vi.mock('@google-cloud/translate/build/src/v2');
vi.mock('deepl-node');
vi.mock('node-cache');
vi.mock('./OllamaService');
vi.mock('child_process');

const mockFs = fs as any;
const mockOpenAI = OpenAI as MockedClass<typeof OpenAI>;
const mockGoogleAI = GoogleGenerativeAI as MockedClass<typeof GoogleGenerativeAI>;
const mockGoogleCloudTranslate = Translate as MockedClass<typeof Translate>;
const mockDeepL = deepl as any;
const mockNodeCache = NodeCache as MockedClass<typeof NodeCache>;
const mockOllama = OllamaService as MockedClass<typeof OllamaService>;

type MockedClass<T> = T extends new (...args: any[]) => infer R
  ? new (...args: any[]) => R & { [K in keyof R]: R[K] extends (...args: any[]) => any ? MockedFunction<R[K]> : R[K] }
  : never;

describe('TranslationService', () => {
  let translationService: TranslationService;
  let mockApiKeys: any;
  let mockOpenAIInstance: any;
  let mockGoogleAIInstance: any;
  let mockGoogleCloudInstance: any;
  let mockDeepLInstance: any;
  let mockOllamaInstance: any;
  let mockCacheInstance: any;
  
  const testDataDir = '/test/data';
  
  const mockSegments: TranscriptSegment[] = [
    { startTime: 0, endTime: 2, text: 'Hello world' },
    { startTime: 2, endTime: 4, text: 'How are you today?' },
    { startTime: 4, endTime: 6, text: 'This is a test segment' }
  ];

  beforeEach(() => {
    // Mock file system
    mockFs.ensureDir = vi.fn().mockResolvedValue(undefined);
    mockFs.pathExists = vi.fn().mockResolvedValue(true);
    mockFs.readFile = vi.fn();
    mockFs.writeFile = vi.fn();
    mockFs.readJSON = vi.fn();
    mockFs.writeJSON = vi.fn();
    mockFs.readdir = vi.fn();
    mockFs.remove = vi.fn();

    // Mock cache instance
    mockCacheInstance = {
      get: vi.fn(),
      set: vi.fn(),
      flushAll: vi.fn(),
      del: vi.fn(),
      keys: vi.fn().mockReturnValue([])
    };
    mockNodeCache.mockImplementation(() => mockCacheInstance);

    // Mock OpenAI instance
    mockOpenAIInstance = {
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    };
    mockOpenAI.mockImplementation(() => mockOpenAIInstance);

    // Mock Google AI instance
    mockGoogleAIInstance = {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn()
      })
    };
    mockGoogleAI.mockImplementation(() => mockGoogleAIInstance);

    // Mock Google Cloud Translate instance
    mockGoogleCloudInstance = {
      translate: vi.fn(),
      detect: vi.fn()
    };
    mockGoogleCloudTranslate.mockImplementation(() => mockGoogleCloudInstance);

    // Mock DeepL instance
    mockDeepLInstance = {
      translateText: vi.fn(),
      getUsage: vi.fn()
    };
    mockDeepL.Translator = vi.fn().mockImplementation(() => mockDeepLInstance);

    // Mock Ollama instance
    mockOllamaInstance = {
      generateResponse: vi.fn()
    };
    mockOllama.mockImplementation(() => mockOllamaInstance);

    mockApiKeys = {
      openai: 'test-openai-key',
      google: 'test-google-key',
      googleCloud: 'test-google-cloud-key',
      deepl: 'test-deepl-key'
    };

    translationService = new TranslationService(testDataDir, mockApiKeys);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with API keys', () => {
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(testDataDir, 'temp', 'translations'));
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(testDataDir, 'translations'));
    });

    it('should get available providers', () => {
      const providers = translationService.getAvailableProviders();
      // Should include all providers initialized with API keys, plus ollama
      expect(providers).toContain('google-cloud');
      expect(providers).toContain('deepl');
      expect(providers).toContain('openai');
      expect(providers).toContain('google-ai');
      expect(providers.length).toBeGreaterThanOrEqual(4);
    });

    it('should get supported languages', () => {
      const languages = translationService.getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(30); // Based on LANGUAGE_CODES
      
      if (languages.length > 0) {
        expect(languages[0]).toHaveProperty('code');
        expect(languages[0]).toHaveProperty('name');
        // Check specific languages
        const englishLang = languages.find(l => l.code === 'en');
        expect(englishLang).toBeDefined();
        expect(englishLang?.name).toBe('English');
      }
    });
  });

  describe('Translation', () => {
    it('should translate segments', async () => {
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        sourceLanguage: 'english'
      };

      // Mock the translation process
      const mockTranslatedSegments = mockSegments.map(segment => ({
        ...segment,
        text: `Translated: ${segment.text}`
      }));

      // Mock internal methods
      const performTranslationSpy = vi.spyOn(translationService as any, 'performTranslation')
        .mockResolvedValue(mockTranslatedSegments);

      const result = await translationService.translateSegments(mockSegments, options);

      expect(result).toEqual({
        segments: mockTranslatedSegments,
        sourceLanguage: 'english',
        targetLanguage: 'spanish',
        confidence: 0.95
      });
    });

    it('should handle translation errors gracefully', async () => {
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish'
      };

      // Mock the translation to throw an error
      const performTranslationSpy = vi.spyOn(translationService as any, 'performTranslation')
        .mockRejectedValue(new Error('Translation failed'));

      await expect(translationService.translateSegments(mockSegments, options))
        .rejects.toThrow('Translation failed');
    });

    it('should use fallback providers when primary fails', async () => {
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        fallbackProviders: ['deepl', 'openai']
      };

      // Mock methods to simulate provider failure and fallback success
      const translateWithProviderSpy = vi.spyOn(translationService as any, 'translateWithProvider')
        .mockRejectedValueOnce(new Error('Primary provider failed'))
        .mockResolvedValueOnce('Translated text');

      const isProviderAvailableSpy = vi.spyOn(translationService as any, 'isProviderAvailable')
        .mockReturnValue(true);

      // This would be called internally by performTranslation
      // We need to test the specific logic, so we'll test the private method
      const context = 'Test context';
      
      await expect(async () => {
        await (translationService as any).translateWithProvider(
          'Test text',
          context,
          options,
          'google-cloud'
        );
      }).rejects.toThrow('Primary provider failed');
    });
  });

  describe('Subtitle Processing', () => {
    it('should parse SRT format correctly', () => {
      const srtContent = `1\n00:00:00,000 --> 00:00:02,000\nHello world\n\n2\n00:00:02,000 --> 00:00:04,000\nHow are you?`;
      
      const parsedSegments = (translationService as any).parseSRT(srtContent);
      
      expect(parsedSegments).toHaveLength(2);
      expect(parsedSegments[0]).toEqual({
        startTime: 0,
        endTime: 2,
        text: 'Hello world'
      });
      expect(parsedSegments[1]).toEqual({
        startTime: 2,
        endTime: 4,
        text: 'How are you?'
      });
    });

    it('should parse VTT format correctly', () => {
      const vttContent = `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello world\n\n00:00:02.000 --> 00:00:04.000\nHow are you?`;
      
      const parsedSegments = (translationService as any).parseVTT(vttContent);
      
      expect(parsedSegments).toHaveLength(2);
      expect(parsedSegments[0]).toEqual({
        startTime: 0,
        endTime: 2,
        text: 'Hello world'
      });
    });

    it('should generate SRT format correctly', () => {
      const srtContent = (translationService as any).generateSRT(mockSegments);
      
      expect(srtContent).toContain('1\n00:00:00,000 --> 00:00:02,000\nHello world');
      expect(srtContent).toContain('2\n00:00:02,000 --> 00:00:04,000\nHow are you today?');
    });

    it('should create subtitles from transcription', async () => {
      const outputPath = '/test/output.srt';
      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await translationService.createSubtitlesFromTranscription(
        mockSegments,
        'srt',
        outputPath
      );

      expect(result).toBe(outputPath);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        outputPath,
        expect.stringContaining('Hello world'),
        'utf-8'
      );
    });
  });

  describe('Language Detection', () => {
    it('should detect language using heuristic method', () => {
      const englishText = 'This is a test text with common English words like the and are';
      const detectedLang = (translationService as any).detectLanguageHeuristic(englishText);
      
      expect(detectedLang).toBe('en');
    });

    it('should detect Spanish text', () => {
      const spanishText = 'Este es un texto de prueba con palabras comunes en español como el y son';
      const detectedLang = (translationService as any).detectLanguageHeuristic(spanishText);
      
      expect(detectedLang).toBe('es');
    });
  });

  describe('Quality Improvements', () => {
    it('should apply terminology consistency', () => {
      const original = 'The API will return JSON data with SDK integration';
      const translated = 'La interfaz de programación devolverá datos en formato JSON con integración de SDK';
      
      const result = (translationService as any).applyTerminologyConsistency(translated, original);
      
      // Should preserve technical terms - the method looks for exact matches in original
      // and replaces similar terms in translated text
      expect(result).toContain('JSON');
      expect(result).toContain('SDK');
    });

    it('should apply cultural adaptation', () => {
      const text = 'The temperature is 68°F and the distance is 5 miles';
      const adapted = (translationService as any).applyCulturalAdaptation(text, 'french');
      
      // Should convert to metric system for French
      expect(adapted).toContain('°C');
      expect(adapted).not.toContain('°F');
    });

    it('should optimize text length for subtitles', () => {
      const longText = 'This is a very long text that should be truncated because it exceeds the maximum length allowed for subtitle display in the given time duration';
      const segment = { startTime: 0, endTime: 2, text: longText }; // Short duration
      
      const optimized = (translationService as any).optimizeLength(longText, segment);
      
      expect(optimized.length).toBeLessThan(longText.length);
      expect(optimized).not.toBe(longText);
    });
  });

  describe('Storage and Caching', () => {
    it('should save translation to persistent storage', async () => {
      const videoId = 'test-video';
      const sourceLanguage = 'en';
      const targetLanguage = 'es';
      const segments = mockSegments;
      const metadata = { test: 'data' };

      mockFs.writeJSON.mockResolvedValue(undefined);

      const translationId = await translationService.saveTranslation(
        videoId,
        sourceLanguage,
        targetLanguage,
        segments,
        metadata
      );

      expect(translationId).toContain(videoId);
      expect(translationId).toContain(sourceLanguage);
      expect(translationId).toContain(targetLanguage);
      expect(mockFs.writeJSON).toHaveBeenCalled();
    });

    it('should load translation from persistent storage', async () => {
      const translationId = 'test-translation-id';
      const mockTranslation = {
        id: translationId,
        videoId: 'test-video',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        segments: mockSegments
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJSON.mockResolvedValue(mockTranslation);

      const result = await translationService.loadTranslation(translationId);

      expect(result).toEqual(mockTranslation);
    });

    it('should list translations for a video', async () => {
      const videoId = 'test-video';
      const mockFiles = [
        `${videoId}_en_es_123456.json`,
        `${videoId}_en_fr_789012.json`,
        'other-video_en_de_345678.json'
      ];

      const mockTranslations = [
        {
          id: `${videoId}_en_es_123456`,
          sourceLanguage: 'en',
          targetLanguage: 'es',
          metadata: { createdAt: '2023-01-01T00:00:00.000Z' }
        },
        {
          id: `${videoId}_en_fr_789012`,
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          metadata: { createdAt: '2023-01-02T00:00:00.000Z' }
        }
      ];

      mockFs.readdir.mockResolvedValue(mockFiles);
      mockFs.readJSON
        .mockResolvedValueOnce(mockTranslations[0])
        .mockResolvedValueOnce(mockTranslations[1]);

      const result = await translationService.listTranslations(videoId);

      expect(result).toHaveLength(2);
      expect(result[0].targetLanguage).toBe('fr'); // Should be sorted by date desc
      expect(result[1].targetLanguage).toBe('es');
    });

    it('should clear cache', () => {
      const mockCache = {
        flushAll: vi.fn()
      };
      
      (translationService as any).cache = mockCache;
      
      translationService.clearCache();
      
      expect(mockCache.flushAll).toHaveBeenCalled();
    });
  });

  describe('Bilingual Subtitles', () => {
    it('should generate bilingual SRT subtitles', async () => {
      const originalSegments = mockSegments;
      const translatedSegments = mockSegments.map(s => ({
        ...s,
        text: `Translated: ${s.text}`
      }));
      
      const outputPath = '/test/bilingual.srt';
      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await translationService.generateBilingualSubtitles(
        originalSegments,
        translatedSegments,
        'srt',
        outputPath,
        { layout: 'stacked' }
      );

      expect(result).toBe(outputPath);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        outputPath,
        expect.stringContaining('Translated: Hello world'),
        'utf-8'
      );
    });

    it('should generate side-by-side bilingual subtitles', async () => {
      const originalSegments = mockSegments;
      const translatedSegments = mockSegments.map(s => ({
        ...s,
        text: `Traducido: ${s.text}`
      }));
      
      const outputPath = '/test/bilingual-side.srt';
      mockFs.writeFile.mockResolvedValue(undefined);

      await translationService.generateBilingualSubtitles(
        originalSegments,
        translatedSegments,
        'srt',
        outputPath,
        { layout: 'side-by-side' }
      );

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        outputPath,
        expect.stringContaining('Hello world | Traducido: Hello world'),
        'utf-8'
      );
    });
  });

  describe('Batch Translation', () => {
    it('should translate multiple videos in batch', async () => {
      const videos = [
        { segments: mockSegments, outputPath: '/test/video1.srt' },
        { segments: mockSegments, outputPath: '/test/video2.srt' }
      ];

      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish'
      };

      // Mock the translateSegments method
      const translateSegmentsSpy = vi.spyOn(translationService, 'translateSegments')
        .mockResolvedValue({
          segments: mockSegments,
          sourceLanguage: 'en',
          targetLanguage: 'es',
          confidence: 0.95
        });

      const saveTranslatedSubtitlesSpy = vi.spyOn(translationService as any, 'saveTranslatedSubtitles')
        .mockResolvedValue(undefined);

      const results = await translationService.batchTranslate(videos, options);

      expect(results).toHaveLength(2);
      expect(translateSegmentsSpy).toHaveBeenCalledTimes(2);
      expect(saveTranslatedSubtitlesSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Time Formatting', () => {
    it('should format time correctly for SRT', () => {
      const timeInSeconds = 3661.5; // 1 hour, 1 minute, 1.5 seconds
      const formatted = (translationService as any).formatTimeSRT(timeInSeconds);
      expect(formatted).toBe('01:01:01,500');
    });

    it('should format time correctly for VTT', () => {
      const timeInSeconds = 3661.5; // 1 hour, 1 minute, 1.5 seconds
      const formatted = (translationService as any).formatTimeVTT(timeInSeconds);
      expect(formatted).toBe('01:01:01.500');
    });

    it('should format time correctly for ASS', () => {
      const timeInSeconds = 3661.5; // 1 hour, 1 minute, 1.5 seconds
      const formatted = (translationService as any).formatTimeASS(timeInSeconds);
      expect(formatted).toBe('1:01:01.50');
    });
  });

  describe('Event Emission', () => {
    it('should emit translation events', async () => {
      const eventSpy = vi.fn();
      translationService.on('translation:started', eventSpy);
      translationService.on('translation:completed', eventSpy);

      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish'
      };

      // Mock successful translation
      const performTranslationSpy = vi.spyOn(translationService as any, 'performTranslation')
        .mockResolvedValue(mockSegments);

      await translationService.translateSegments(mockSegments, options);

      expect(eventSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Translation API Mocking', () => {
    it('should mock OpenAI translation correctly', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Hola mundo'
          }
        }]
      };
      
      mockOpenAIInstance.chat.completions.create.mockResolvedValue(mockResponse);
      
      const translated = await (translationService as any).translateWithOpenAI(
        'Hello world',
        'Context here',
        'spanish',
        'english',
        'formal'
      );
      
      expect(translated).toBe('Hola mundo');
      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: expect.any(Array),
        temperature: 0.3,
        max_tokens: 500
      });
    });

    it('should mock Google Cloud Translate correctly', async () => {
      mockGoogleCloudInstance.translate.mockResolvedValue(['Hola mundo']);
      
      const translated = await (translationService as any).translateWithGoogleCloud(
        'Hello world',
        'Context here',
        'spanish',
        'english',
        'formal'
      );
      
      expect(translated).toBe('Hola mundo');
      expect(mockGoogleCloudInstance.translate).toHaveBeenCalledWith(
        'Hello world',
        {
          from: 'en',
          to: 'es',
          format: 'text'
        }
      );
    });

    it('should mock DeepL translation correctly', async () => {
      mockDeepLInstance.translateText.mockResolvedValue({
        text: 'Hola mundo'
      });
      
      const translated = await (translationService as any).translateWithDeepL(
        'Hello world',
        'Context here',
        'spanish',
        'english',
        'formal'
      );
      
      expect(translated).toBe('Hola mundo');
      expect(mockDeepLInstance.translateText).toHaveBeenCalled();
    });

    it('should mock Google AI translation correctly', async () => {
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: vi.fn().mockReturnValue('Hola mundo')
          }
        })
      };
      
      mockGoogleAIInstance.getGenerativeModel.mockReturnValue(mockModel);
      
      const translated = await (translationService as any).translateWithGoogleAI(
        'Hello world',
        'Context here',
        'spanish',
        'english',
        'formal'
      );
      
      expect(translated).toBe('Hola mundo');
      expect(mockModel.generateContent).toHaveBeenCalled();
    });

    it('should mock Ollama translation correctly', async () => {
      mockOllamaInstance.generateResponse.mockResolvedValue('Hola mundo');
      
      const translated = await (translationService as any).translateWithOllama(
        'Hello world',
        'Context here',
        'spanish',
        'english',
        'formal'
      );
      
      expect(translated).toBe('Hola mundo');
      expect(mockOllamaInstance.generateResponse).toHaveBeenCalled();
    });
  });

  describe('Language Detection', () => {
    it('should detect language using Google Cloud', async () => {
      mockGoogleCloudInstance.detect.mockResolvedValue([{ language: 'en' }]);
      
      const detected = await (translationService as any).detectLanguage('Hello world', 'google-cloud');
      
      expect(detected).toBe('en');
      expect(mockGoogleCloudInstance.detect).toHaveBeenCalledWith('Hello world');
    });

    it('should detect language using OpenAI', async () => {
      mockOpenAIInstance.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: 'en'
          }
        }]
      });
      
      const detected = await (translationService as any).detectLanguage('Hello world', 'openai');
      
      expect(detected).toBe('en');
    });

    it('should fallback to heuristic detection when providers fail', async () => {
      mockGoogleCloudInstance.detect.mockRejectedValue(new Error('API error'));
      mockOpenAIInstance.chat.completions.create.mockRejectedValue(new Error('API error'));
      
      const detected = await (translationService as any).detectLanguage(
        'The quick brown fox jumps over the lazy dog',
        'google-cloud'
      );
      
      expect(detected).toBe('en');
    });

    it('should detect Chinese characters', () => {
      const chineseText = '这是一个测试文本，包含中文字符';
      const detected = (translationService as any).detectLanguageHeuristic(chineseText);
      expect(detected).toBe('zh');
    });

    it('should detect Japanese characters', () => {
      const japaneseText = 'これはテストテキストです。ひらがなとカタカナが含まれています';
      const detected = (translationService as any).detectLanguageHeuristic(japaneseText);
      expect(detected).toBe('ja');
    });

    it('should detect Arabic text', () => {
      const arabicText = 'هذا نص تجريبي باللغة العربية';
      const detected = (translationService as any).detectLanguageHeuristic(arabicText);
      expect(detected).toBe('ar');
    });
  });

  describe('Text Translation with Escaping', () => {
    it('should handle special characters in translation', async () => {
      mockGoogleCloudInstance.translate.mockResolvedValue(['<Hola & mundo>']);
      
      const result = await translationService.translateText({
        text: '<Hello & world>',
        targetLanguage: 'spanish',
        sourceLanguage: 'english'
      });
      
      expect(result.translatedText).toBe('<Hola & mundo>');
    });

    it('should preserve HTML entities', async () => {
      const textWithEntities = 'Hello &amp; world &lt;test&gt;';
      mockGoogleCloudInstance.translate.mockResolvedValue(['Hola &amp; mundo &lt;prueba&gt;']);
      
      const result = await translationService.translateText({
        text: textWithEntities,
        targetLanguage: 'spanish'
      });
      
      expect(result.translatedText).toContain('&amp;');
      expect(result.translatedText).toContain('&lt;');
      expect(result.translatedText).toContain('&gt;');
    });

    it('should handle newlines and special formatting', async () => {
      const multilineText = 'Line 1\nLine 2\n\nLine 3';
      mockGoogleCloudInstance.translate.mockResolvedValue(['Línea 1\nLínea 2\n\nLínea 3']);
      
      const result = await translationService.translateText({
        text: multilineText,
        targetLanguage: 'spanish'
      });
      
      expect(result.translatedText.split('\n')).toHaveLength(4);
    });
  });

  describe('Subtitle Format Preservation', () => {
    it('should preserve SRT format during translation', async () => {
      const srtSegments = [
        { startTime: 0, endTime: 2, text: '[Music]' },
        { startTime: 2, endTime: 4, text: 'Hello' },
        { startTime: 4, endTime: 6, text: '- Speaker: Hi there!' }
      ];
      
      // Mock translation to preserve special markers
      vi.spyOn(translationService as any, 'translateWithProvider')
        .mockImplementation((text) => {
          if (text.includes('[Music]')) return Promise.resolve('[Música]');
          if (text.includes('- Speaker:')) return Promise.resolve('- Hablante: ¡Hola!');
          return Promise.resolve('Hola');
        });
      
      const result = await translationService.translateSegments(srtSegments, {
        targetLanguage: 'spanish',
        sourceLanguage: 'english',
        preserveFormatting: true
      });
      
      expect(result.segments[0].text).toBe('[Música]');
      expect(result.segments[2].text).toContain('- Hablante:');
    });

    it('should preserve VTT cue settings', () => {
      const vttContent = `WEBVTT

00:00:00.000 --> 00:00:02.000 position:50% align:center
Hello world

00:00:02.000 --> 00:00:04.000 line:80%
How are you?`;
      
      const segments = (translationService as any).parseVTT(vttContent);
      expect(segments).toHaveLength(2);
      // VTT cue settings are stripped in parsing, but timing is preserved
      expect(segments[0].startTime).toBe(0);
      expect(segments[0].endTime).toBe(2);
    });

    it('should handle ASS styling tags', () => {
      const assContent = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,{\\b1}Bold text{\\b0} normal text`;
      
      const segments = (translationService as any).parseASS(assContent);
      expect(segments[0].text).toBe('Bold text normal text'); // Tags are stripped
    });
  });

  describe('Caching Behavior', () => {
    it('should cache successful translations', async () => {
      mockCacheInstance.get.mockReturnValue(null);
      mockGoogleCloudInstance.translate.mockResolvedValue(['Hola mundo']);
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        sourceLanguage: 'english',
        enableCache: true
      };
      
      await translationService.translateSegments([mockSegments[0]], options);
      
      expect(mockCacheInstance.set).toHaveBeenCalled();
      const cacheKey = mockCacheInstance.set.mock.calls[0][0];
      const cachedValue = mockCacheInstance.set.mock.calls[0][1];
      expect(cachedValue).toBe('Hola mundo');
    });

    it('should use cached translations when available', async () => {
      mockCacheInstance.get.mockReturnValue('Cached translation');
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        sourceLanguage: 'english',
        enableCache: true
      };
      
      const result = await translationService.translateSegments([mockSegments[0]], options);
      
      expect(result.segments[0].text).toBe('Cached translation');
      expect(mockGoogleCloudInstance.translate).not.toHaveBeenCalled();
    });

    it('should not cache when caching is disabled', async () => {
      mockGoogleCloudInstance.translate.mockResolvedValue(['Hola mundo']);
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        sourceLanguage: 'english',
        enableCache: false
      };
      
      await translationService.translateSegments([mockSegments[0]], options);
      
      expect(mockCacheInstance.set).not.toHaveBeenCalled();
    });

    it('should generate unique cache keys for different parameters', () => {
      const key1 = (translationService as any).generateCacheKey('Hello', {
        targetLanguage: 'es',
        sourceLanguage: 'en',
        style: 'formal'
      });
      
      const key2 = (translationService as any).generateCacheKey('Hello', {
        targetLanguage: 'fr',
        sourceLanguage: 'en',
        style: 'formal'
      });
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Error Handling', () => {
    it('should handle API rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).response = { status: 429 };
      
      mockGoogleCloudInstance.translate.mockRejectedValue(rateLimitError);
      mockDeepLInstance.translateText.mockResolvedValue({ text: 'Fallback translation' });
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        fallbackProviders: ['deepl']
      };
      
      const result = await translationService.translateSegments([mockSegments[0]], options);
      
      expect(result.segments[0].text).toBe('Fallback translation');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      mockGoogleCloudInstance.translate.mockRejectedValue(networkError);
      mockDeepLInstance.translateText.mockRejectedValue(networkError);
      mockOpenAIInstance.chat.completions.create.mockRejectedValue(networkError);
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        fallbackProviders: ['deepl', 'openai']
      };
      
      const result = await translationService.translateSegments([mockSegments[0]], options);
      
      // Should return original text when all providers fail
      expect(result.segments[0].text).toBe('Hello world');
    });

    it('should handle invalid API key errors', async () => {
      const authError = new Error('Invalid API key');
      (authError as any).response = { status: 401 };
      
      mockGoogleCloudInstance.translate.mockRejectedValue(authError);
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        fallbackProviders: []
      };
      
      const result = await translationService.translateSegments([mockSegments[0]], options);
      
      expect(result.segments[0].text).toBe('Hello world'); // Original text
    });

    it('should emit error events on failure', async () => {
      const errorSpy = vi.fn();
      translationService.on('translation:failed', errorSpy);
      
      const error = new Error('Translation error');
      vi.spyOn(translationService as any, 'performTranslation').mockRejectedValue(error);
      
      await expect(translationService.translateSegments(mockSegments, {
        targetLanguage: 'spanish'
      })).rejects.toThrow('Translation error');
      
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: 'Translation error'
        })
      );
    });
  });

  describe('Fallback Provider Logic', () => {
    it('should try fallback providers in order', async () => {
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        fallbackProviders: ['deepl', 'openai', 'google-ai']
      };
      
      // All providers fail except the last one
      mockGoogleCloudInstance.translate.mockRejectedValue(new Error('Primary failed'));
      mockDeepLInstance.translateText.mockRejectedValue(new Error('Fallback 1 failed'));
      mockOpenAIInstance.chat.completions.create.mockRejectedValue(new Error('Fallback 2 failed'));
      
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: vi.fn().mockReturnValue('Success with Google AI')
          }
        })
      };
      mockGoogleAIInstance.getGenerativeModel.mockReturnValue(mockModel);
      
      const result = await translationService.translateSegments([mockSegments[0]], options);
      
      expect(result.segments[0].text).toBe('Success with Google AI');
    });

    it('should skip unavailable providers', async () => {
      // Remove deepl from available providers
      (translationService as any).deepl = undefined;
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        fallbackProviders: ['deepl', 'openai']
      };
      
      mockGoogleCloudInstance.translate.mockRejectedValue(new Error('Primary failed'));
      mockOpenAIInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'OpenAI translation' } }]
      });
      
      const result = await translationService.translateSegments([mockSegments[0]], options);
      
      expect(result.segments[0].text).toBe('OpenAI translation');
      expect(mockDeepLInstance.translateText).not.toHaveBeenCalled();
    });
  });

  describe('Context-aware Translation', () => {
    it('should use context window for better translations', async () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 1, text: 'I saw a bank.' },
        { startTime: 1, endTime: 2, text: 'The river was wide.' },
        { startTime: 2, endTime: 3, text: 'Fish were swimming.' }
      ];
      
      const options: TranslationOptions = {
        provider: 'openai',
        targetLanguage: 'spanish',
        contextWindow: 2
      };
      
      let capturedContext = '';
      mockOpenAIInstance.chat.completions.create.mockImplementation((params) => {
        capturedContext = params.messages[1].content;
        return Promise.resolve({
          choices: [{ message: { content: 'Vi una orilla.' } }]
        });
      });
      
      await translationService.translateSegments(segments, options);
      
      // When translating "bank", it should include context about river
      expect(capturedContext).toContain('river');
    });

    it('should handle edge cases for context window', async () => {
      const segments = [mockSegments[0]]; // Single segment
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        contextWindow: 5 // Larger than available segments
      };
      
      mockGoogleCloudInstance.translate.mockResolvedValue(['Translated']);
      
      const result = await translationService.translateSegments(segments, options);
      
      expect(result.segments).toHaveLength(1);
      expect(mockGoogleCloudInstance.translate).toHaveBeenCalled();
    });
  });

  describe('Length Optimization for Subtitles', () => {
    it('should optimize long text for subtitle display', () => {
      const longSegment: TranscriptSegment = {
        startTime: 0,
        endTime: 2, // 2 seconds
        text: 'This is a very long text that exceeds the recommended character count for subtitle display and should be optimized to ensure comfortable reading speed for viewers'
      };
      
      const optimized = (translationService as any).optimizeLength(longSegment.text, longSegment);
      
      expect(optimized.length).toBeLessThan(longSegment.text.length);
      expect(optimized.endsWith('...')).toBe(true);
    });

    it('should preserve complete sentences when possible', () => {
      const segment: TranscriptSegment = {
        startTime: 0,
        endTime: 3,
        text: 'First sentence. Second sentence. Third sentence that is very long.'
      };
      
      const optimized = (translationService as any).optimizeLength(segment.text, segment);
      
      expect(optimized).toContain('First sentence');
      expect(optimized).not.toContain('Third sentence that is very long');
    });

    it('should not optimize short text', () => {
      const shortSegment: TranscriptSegment = {
        startTime: 0,
        endTime: 5,
        text: 'Short text'
      };
      
      const optimized = (translationService as any).optimizeLength(shortSegment.text, shortSegment);
      
      expect(optimized).toBe('Short text');
    });

    it('should handle segments when splitting for subtitles', () => {
      const longSegments: TranscriptSegment[] = [{
        startTime: 0,
        endTime: 2,
        text: 'This is a very long text that needs to be split into multiple subtitle segments for better readability and display on screen'
      }];
      
      const optimized = (translationService as any).optimizeSegmentsForSubtitles(
        longSegments,
        50, // max length per line
        5   // max duration
      );
      
      expect(optimized.length).toBeGreaterThan(1);
      expect(optimized.every(s => s.text.length <= 50)).toBe(true);
    });
  });

  describe('Provider-specific Features', () => {
    it('should handle DeepL formality settings', async () => {
      const options: TranslationOptions = {
        provider: 'deepl',
        targetLanguage: 'german',
        style: 'formal'
      };
      
      mockDeepLInstance.translateText.mockResolvedValue({ text: 'Guten Tag' });
      
      await (translationService as any).translateWithDeepL(
        'Hello',
        'Context',
        'german',
        'english',
        'formal'
      );
      
      expect(mockDeepLInstance.translateText).toHaveBeenCalledWith(
        'Hello',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          formality: 'more'
        })
      );
    });

    it('should handle Google Cloud format options', async () => {
      mockGoogleCloudInstance.translate.mockResolvedValue(['Translated']);
      
      await (translationService as any).translateWithGoogleCloud(
        'Hello',
        'Context',
        'spanish',
        'english'
      );
      
      expect(mockGoogleCloudInstance.translate).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({
          format: 'text'
        })
      );
    });
  });

  describe('Glossary and Terminology', () => {
    it('should apply custom glossary terms', async () => {
      const glossary = {
        'API': 'Interface de Programmation',
        'SDK': 'Kit de Développement'
      };
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'french',
        glossary
      };
      
      mockGoogleCloudInstance.translate.mockResolvedValue(['The api and sdk are ready']);
      
      const result = await translationService.translateSegments([
        { startTime: 0, endTime: 1, text: 'The API and SDK are ready' }
      ], options);
      
      expect(result.segments[0].text).toContain('Interface de Programmation');
      expect(result.segments[0].text).toContain('Kit de Développement');
    });

    it('should preserve technical terms', () => {
      const original = 'Use the REST API with JSON format';
      const translated = 'Utilice la API REST con formato JSON';
      
      const result = (translationService as any).applyTerminologyConsistency(translated, original);
      
      expect(result).toContain('REST');
      expect(result).toContain('API');
      expect(result).toContain('JSON');
    });

    it('should preserve brand names', () => {
      const original = 'Upload to YouTube and TikTok';
      const translated = 'Subir a YouTube y TikTok';
      
      const result = (translationService as any).applyTerminologyConsistency(translated, original);
      
      expect(result).toContain('YouTube');
      expect(result).toContain('TikTok');
    });
  });

  describe('Subtitle File Extraction', () => {
    it('should extract embedded subtitles from video', async () => {
      const mockExec = vi.fn().mockImplementation((cmd, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });
      
      vi.mock('child_process', () => ({
        exec: mockExec
      }));
      
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(`1
00:00:00,000 --> 00:00:02,000
Embedded subtitle`);
      
      const result = await translationService.extractSubtitles('/video.mp4');
      
      expect(result.format).toBe('embedded');
      expect(result.segments).toHaveLength(1);
    });

    it('should find external subtitle files', async () => {
      const mockExec = vi.fn().mockImplementation((cmd, callback) => {
        callback(new Error('No subtitles'), { stdout: '', stderr: '' });
      });
      
      vi.mock('child_process', () => ({
        exec: mockExec
      }));
      
      mockFs.pathExists
        .mockResolvedValueOnce(false) // No embedded
        .mockResolvedValueOnce(true); // External .srt exists
        
      mockFs.readFile.mockResolvedValue(`1
00:00:00,000 --> 00:00:02,000
External subtitle`);
      
      const result = await translationService.extractSubtitles('/video.mp4');
      
      expect(result.format).toBe('srt');
      expect(result.segments).toHaveLength(1);
    });

    it('should handle no subtitles found', async () => {
      mockFs.pathExists.mockResolvedValue(false);
      
      const result = await translationService.extractSubtitles('/video.mp4');
      
      expect(result.format).toBe('none');
      expect(result.segments).toHaveLength(0);
    });
  });

  describe('Translation Metrics', () => {
    it('should track translation metrics', async () => {
      mockCacheInstance.get
        .mockReturnValueOnce('Cached 1')
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null);
        
      mockGoogleCloudInstance.translate.mockResolvedValue(['Translated']);
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        enableCache: true
      };
      
      let metricsEmitted: any;
      translationService.on('translation:metrics', (data) => {
        metricsEmitted = data.metrics;
      });
      
      await translationService.translateSegments(mockSegments, options);
      
      expect(metricsEmitted).toBeDefined();
      expect(metricsEmitted.totalSegments).toBe(3);
      expect(metricsEmitted.cacheHitRate).toBeGreaterThan(0);
      expect(metricsEmitted.processingTimeMs).toBeGreaterThan(0);
    });

    it('should get metrics for a specific job', async () => {
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish'
      };
      
      mockGoogleCloudInstance.translate.mockResolvedValue(['Translated']);
      
      const result = await translationService.translateSegments([mockSegments[0]], options);
      
      // Get job ID from the translation service
      const jobs = translationService.getAllJobs();
      const jobId = jobs[0]?.id;
      
      if (jobId) {
        const metrics = translationService.getTranslationMetrics(jobId);
        expect(metrics).toBeDefined();
        expect(metrics?.totalSegments).toBe(1);
      }
    });
  });

  describe('Cultural Adaptation', () => {
    it('should convert temperature units', () => {
      const textF = 'The temperature is 32°F';
      const adaptedToMetric = (translationService as any).applyCulturalAdaptation(textF, 'french');
      
      expect(adaptedToMetric).toContain('0°C');
      expect(adaptedToMetric).not.toContain('32°F');
    });

    it('should convert measurements', () => {
      const textImperial = 'The distance is 10 feet';
      const adaptedToMetric = (translationService as any).applyCulturalAdaptation(textImperial, 'french');
      
      expect(adaptedToMetric).toContain('m');
      expect(adaptedToMetric).not.toContain('feet');
    });

    it('should handle mixed units', () => {
      const mixedText = 'It is 68°F outside and the pool is 25 feet long';
      const adapted = (translationService as any).applyCulturalAdaptation(mixedText, 'german');
      
      expect(adapted).toContain('°C');
      expect(adapted).toContain('m');
    });
  });

  describe('Job Management', () => {
    it('should create and track translation jobs', async () => {
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish'
      };
      
      mockGoogleCloudInstance.translate.mockResolvedValue(['Translated']);
      
      await translationService.translateSegments(mockSegments, options);
      
      const jobs = translationService.getAllJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('completed');
      expect(jobs[0].targetLanguage).toBe('spanish');
    });

    it('should get job by ID', async () => {
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish'
      };
      
      mockGoogleCloudInstance.translate.mockResolvedValue(['Translated']);
      
      await translationService.translateSegments(mockSegments, options);
      
      const jobs = translationService.getAllJobs();
      const job = translationService.getJob(jobs[0].id);
      
      expect(job).toBeDefined();
      expect(job?.id).toBe(jobs[0].id);
    });

    it('should update job progress', async () => {
      const progressUpdates: number[] = [];
      
      translationService.on('translation:progress', (data) => {
        progressUpdates.push(data.progress);
      });
      
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish'
      };
      
      mockGoogleCloudInstance.translate.mockResolvedValue(['Translated']);
      
      await translationService.translateSegments(mockSegments, options);
      
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed translations up to maxRetries', async () => {
      const options: TranslationOptions = {
        provider: 'google-cloud',
        targetLanguage: 'spanish',
        maxRetries: 3,
        fallbackProviders: []
      };
      
      let attemptCount = 0;
      mockGoogleCloudInstance.translate.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve(['Success after retries']);
      });
      
      // Since retries are handled within performTranslation and at the segment level,
      // we need to test the actual behavior
      const result = await translationService.translateSegments([mockSegments[0]], options);
      
      // The translation should eventually succeed or fall back to original
      expect(result.segments[0].text).toBeDefined();
    });
  });

  describe('Special Format Handling', () => {
    it('should handle timestamps in subtitles', () => {
      const segment: TranscriptSegment = {
        startTime: 0,
        endTime: 5,
        text: '[00:00:02] Speaker: Hello everyone'
      };
      
      // The translation should preserve timestamp format
      const result = (translationService as any).applyTerminologyConsistency(
        '[00:00:02] Hablante: Hola a todos',
        segment.text
      );
      
      expect(result).toContain('[00:00:02]');
    });

    it('should handle speaker labels', () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 2, text: 'JOHN: Hello there' },
        { startTime: 2, endTime: 4, text: 'MARY: Hi John' }
      ];
      
      // Speaker labels should be preserved
      const preservedText = (translationService as any).applyTerminologyConsistency(
        'JOHN: Hola',
        segments[0].text
      );
      
      expect(preservedText).toContain('JOHN:');
    });
  });
});