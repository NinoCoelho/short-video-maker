import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTSManager, TTSResult } from './TTSManager';
import { LocalTTS } from '../libraries/LocalTTS';
import { Remotion } from '../libraries/Remotion';
import { Config } from '../../config';
import { RenderConfig, VoiceEnum, Caption } from '../../types/shorts';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

// Mock dependencies
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('fs-extra', () => ({
  access: vi.fn(),
  stat: vi.fn(),
  removeSync: vi.fn(),
  moveSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
  openSync: vi.fn(),
  closeSync: vi.fn(),
}));

vi.mock('path', () => ({
  join: vi.fn((...paths: string[]) => paths.join('/')),
}));

vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mock-hash-123'),
  })),
}));

vi.mock('cuid', () => ({
  default: vi.fn(() => 'mock-cuid-123'),
}));

describe('TTSManager', () => {
  let ttsManager: TTSManager;
  let mockLocalTTS: any;
  let mockConfig: Config;
  let mockRemotion: any;

  beforeEach(() => {
    mockConfig = {
      tempDirPath: '/tmp/test',
    } as Config;

    mockLocalTTS = {
      generateSpeech: vi.fn(),
    };

    mockRemotion = {
      getMediaDuration: vi.fn(),
    };

    ttsManager = new TTSManager(mockLocalTTS, mockConfig, mockRemotion);

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Cached TTS Generation', () => {
    const mockConfig: RenderConfig = {
      voice: VoiceEnum.Paulo,
      language: 'pt',
    };

    it('should return cached TTS if available and valid', async () => {
      const text = 'Hello world';
      const expectedPath = '/tmp/test/mock-hash-123.wav';
      const mockDuration = 2.5;

      // Mock file exists and has content
      (fs.access as any).mockResolvedValue(undefined);
      (fs.stat as any).mockResolvedValue({ size: 1024 });
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockRemotion.getMediaDuration.mockResolvedValue(mockDuration);

      const result = await ttsManager.getCachedOrGenerateTTS(text, mockConfig);

      expect(result.audioPath).toBe(expectedPath);
      expect(result.duration).toBe(mockDuration);
      expect(result.subtitles).toBeDefined();
      expect(result.subtitles.length).toBeGreaterThan(0);
      expect(mockLocalTTS.generateSpeech).not.toHaveBeenCalled();
    });

    it('should regenerate TTS if cached file is empty', async () => {
      const text = 'Hello world';
      const mockTTSResult = {
        audioPath: '/tmp/test/temp-audio.wav',
        subtitles: [{ text: 'Hello', start: 0, end: 500 }] as Caption[],
      };

      // Mock cached file exists but is empty
      (fs.access as any).mockResolvedValue(undefined);
      (fs.stat as any).mockResolvedValue({ size: 0 });
      
      // Mock new file generation
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);
      mockRemotion.getMediaDuration.mockResolvedValue(2.5);

      const result = await ttsManager.getCachedOrGenerateTTS(text, mockConfig);

      expect(fs.removeSync).toHaveBeenCalled();
      expect(mockLocalTTS.generateSpeech).toHaveBeenCalled();
      expect(fs.moveSync).toHaveBeenCalled();
      expect(result.duration).toBe(2.5);
    });

    it('should regenerate TTS if cached file has invalid duration', async () => {
      const text = 'Hello world';

      // Mock cached file exists but has invalid duration
      (fs.access as any).mockResolvedValue(undefined);
      (fs.stat as any).mockResolvedValue({ size: 1024 });
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockRemotion.getMediaDuration.mockResolvedValue(0); // Invalid duration

      // Mock new file generation
      const mockTTSResult = {
        audioPath: '/tmp/test/temp-audio.wav',
        subtitles: [],
      };
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);
      mockRemotion.getMediaDuration.mockResolvedValueOnce(0).mockResolvedValueOnce(2.5);

      const result = await ttsManager.getCachedOrGenerateTTS(text, mockConfig);

      expect(mockLocalTTS.generateSpeech).toHaveBeenCalled();
      expect(result.duration).toBe(2.5);
    });

    it('should force regenerate TTS when forceRegenerate is true', async () => {
      const text = 'Hello world';
      const mockTTSResult = {
        audioPath: '/tmp/test/temp-audio.wav',
        subtitles: [],
      };

      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);
      mockRemotion.getMediaDuration.mockResolvedValue(2.5);

      const result = await ttsManager.getCachedOrGenerateTTS(text, mockConfig, true);

      expect(fs.access).not.toHaveBeenCalled(); // Should skip cache check
      expect(mockLocalTTS.generateSpeech).toHaveBeenCalled();
      expect(result.duration).toBe(2.5);
    });
  });

  describe('New TTS Generation', () => {
    const mockConfig: RenderConfig = {
      voice: VoiceEnum.Paulo,
      language: 'pt',
    };

    it('should generate new TTS successfully', async () => {
      const text = 'Hello world';
      const mockTTSResult = {
        audioPath: '/tmp/test/mock-cuid-123.wav',
        subtitles: [
          { text: 'Hello', start: 0, end: 500 },
          { text: 'world', start: 500, end: 1000 },
        ] as Caption[],
      };

      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);
      mockRemotion.getMediaDuration.mockResolvedValue(2.5);

      // Mock cache miss
      (fs.access as any).mockRejectedValue(new Error('File not found'));

      const result = await ttsManager.getCachedOrGenerateTTS(text, mockConfig);

      expect(mockLocalTTS.generateSpeech).toHaveBeenCalledWith(
        text,
        '/tmp/test/mock-cuid-123.wav',
        mockConfig.voice,
        mockConfig.language,
        undefined
      );
      expect(fs.moveSync).toHaveBeenCalled();
      expect(result.duration).toBe(2.5);
      expect(result.subtitles).toEqual(mockTTSResult.subtitles);
    });

    it('should handle TTS generation with reference audio', async () => {
      const text = 'Hello world';
      const configWithReference: RenderConfig = {
        ...mockConfig,
        referenceAudioPath: '/path/to/reference.wav',
      };

      const mockTTSResult = {
        audioPath: '/tmp/test/mock-cuid-123.wav',
        subtitles: [],
      };

      (fs.access as any).mockRejectedValue(new Error('File not found'));
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);
      mockRemotion.getMediaDuration.mockResolvedValue(2.5);

      await ttsManager.getCachedOrGenerateTTS(text, configWithReference);

      expect(mockLocalTTS.generateSpeech).toHaveBeenCalledWith(
        text,
        expect.any(String),
        configWithReference.voice,
        configWithReference.language,
        '/path/to/reference.wav'
      );
    });

    it('should throw error if generated file is empty', async () => {
      const text = 'Hello world';
      const mockTTSResult = {
        audioPath: '/tmp/test/mock-cuid-123.wav',
        subtitles: [],
      };

      (fs.access as any).mockRejectedValue(new Error('File not found'));
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 0 }); // Empty file
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);

      await expect(
        ttsManager.getCachedOrGenerateTTS(text, mockConfig)
      ).rejects.toThrow('Generated TTS file is empty');
    });

    it('should throw error if duration is invalid', async () => {
      const text = 'Hello world';
      const mockTTSResult = {
        audioPath: '/tmp/test/mock-cuid-123.wav',
        subtitles: [],
      };

      (fs.access as any).mockRejectedValue(new Error('File not found'));
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);
      mockRemotion.getMediaDuration.mockResolvedValue(0); // Invalid duration

      await expect(
        ttsManager.getCachedOrGenerateTTS(text, mockConfig)
      ).rejects.toThrow('Invalid audio duration: 0');
    });
  });

  describe('Single TTS Generation', () => {
    const mockConfig: RenderConfig = {
      voice: VoiceEnum.Paulo,
      language: 'pt',
    };

    it('should generate single TTS successfully', async () => {
      const text = 'Hello world';
      const mockTTSResult = {
        audioPath: '/tmp/test/mock-cuid-123.wav',
        subtitles: [{ text: 'Hello world', start: 0, end: 2000 }] as Caption[],
      };

      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);
      mockRemotion.getMediaDuration.mockResolvedValue(2.5);

      const result = await ttsManager.generateSingleTTS(text, mockConfig);

      expect(mockLocalTTS.generateSpeech).toHaveBeenCalledWith(
        text,
        '/tmp/test/mock-cuid-123.wav',
        mockConfig.voice,
        mockConfig.language,
        undefined
      );
      expect(result.audioPath).toBe(mockTTSResult.audioPath);
      expect(result.duration).toBe(2.5);
      expect(result.subtitles).toEqual(mockTTSResult.subtitles);
    });
  });

  describe('Fallback Subtitles Generation', () => {
    it('should generate fallback subtitles correctly', async () => {
      const text = 'Hello world test';
      const duration = 3.0; // 3 seconds
      const expectedPath = '/tmp/test/mock-hash-123.wav';

      // Mock cached file exists but duration method fails (no subtitles available)
      (fs.access as any).mockResolvedValue(undefined);
      (fs.stat as any).mockResolvedValue({ size: 1024 });
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockRemotion.getMediaDuration.mockResolvedValue(duration);

      const result = await ttsManager.getCachedOrGenerateTTS(text, {
        voice: VoiceEnum.Paulo,
        language: 'pt',
      });

      expect(result.subtitles).toHaveLength(3); // 3 words
      expect(result.subtitles[0]).toEqual({
        text: 'Hello',
        start: 0,
        end: 1000, // 3000ms / 3 words = 1000ms per word
      });
      expect(result.subtitles[1]).toEqual({
        text: 'world',
        start: 1000,
        end: 2000,
      });
      expect(result.subtitles[2]).toEqual({
        text: 'test',
        start: 2000,
        end: 3000,
      });
    });

    it('should handle empty text in fallback subtitles', async () => {
      const text = '';
      const duration = 1.0;

      (fs.access as any).mockResolvedValue(undefined);
      (fs.stat as any).mockResolvedValue({ size: 1024 });
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockRemotion.getMediaDuration.mockResolvedValue(duration);

      const result = await ttsManager.getCachedOrGenerateTTS(text, {
        voice: VoiceEnum.Paulo,
        language: 'pt',
      });

      expect(result.subtitles).toHaveLength(0);
    });
  });

  describe('File Ready Waiting', () => {
    it('should wait for file to be ready successfully', async () => {
      const text = 'Hello world';
      const mockTTSResult = {
        audioPath: '/tmp/test/mock-cuid-123.wav',
        subtitles: [],
      };

      (fs.access as any).mockRejectedValue(new Error('File not found'));
      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);
      mockRemotion.getMediaDuration.mockResolvedValue(2.5);

      const result = await ttsManager.getCachedOrGenerateTTS(text, {
        voice: VoiceEnum.Paulo,
        language: 'pt',
      });

      expect(result).toBeDefined();
      expect(fs.openSync).toHaveBeenCalled();
      expect(fs.closeSync).toHaveBeenCalled();
    });

    it('should throw error if file is not ready after max retries', async () => {
      const text = 'Hello world';
      const mockTTSResult = {
        audioPath: '/tmp/test/mock-cuid-123.wav',
        subtitles: [],
      };

      (fs.access as any).mockRejectedValue(new Error('File not found'));
      (fs.existsSync as any).mockReturnValue(false); // File never appears
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);

      await expect(
        ttsManager.getCachedOrGenerateTTS(text, {
          voice: VoiceEnum.Paulo,
          language: 'pt',
        })
      ).rejects.toThrow('File not found after 30 retries');
    });
  });

  describe('Text Processing', () => {
    it('should split text into scenes by line breaks', () => {
      const text = 'Line 1\n\nLine 2\nLine 3\n\n\nLine 4';
      const result = ttsManager.splitTextIntoScenes(text);

      expect(result).toEqual(['Line 1', 'Line 2', 'Line 3', 'Line 4']);
    });

    it('should filter out empty lines', () => {
      const text = 'Line 1\n\n\n\nLine 2\n   \n\nLine 3';
      const result = ttsManager.splitTextIntoScenes(text);

      expect(result).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should process text for TTS by cleaning and splitting', () => {
      const text = '  Line 1\n\nLine 2\nLine 3  ';
      const result = ttsManager.processTextForTTS(text);

      expect(result).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should handle empty text processing', () => {
      const text = '';
      const result = ttsManager.processTextForTTS(text);

      expect(result).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle LocalTTS generation errors', async () => {
      const text = 'Hello world';
      const error = new Error('TTS generation failed');

      (fs.access as any).mockRejectedValue(new Error('File not found'));
      mockLocalTTS.generateSpeech.mockRejectedValue(error);

      await expect(
        ttsManager.getCachedOrGenerateTTS(text, {
          voice: VoiceEnum.Paulo,
          language: 'pt',
        })
      ).rejects.toThrow('TTS generation failed');
    });

    it('should handle file system errors gracefully', async () => {
      const text = 'Hello world';
      
      (fs.access as any).mockResolvedValue(undefined);
      (fs.stat as any).mockResolvedValue({ size: 1024 });
      mockRemotion.getMediaDuration.mockRejectedValue(new Error('Cannot read media'));

      // Should fall back to regeneration
      const mockTTSResult = {
        audioPath: '/tmp/test/mock-cuid-123.wav',
        subtitles: [],
      };

      (fs.existsSync as any).mockReturnValue(true);
      (fs.statSync as any).mockReturnValue({ size: 1024 });
      (fs.openSync as any).mockReturnValue(5);
      (fs.closeSync as any).mockReturnValue(undefined);
      mockLocalTTS.generateSpeech.mockResolvedValue(mockTTSResult);
      mockRemotion.getMediaDuration.mockResolvedValueOnce(new Error('Cannot read')).mockResolvedValueOnce(2.5);

      const result = await ttsManager.getCachedOrGenerateTTS(text, {
        voice: VoiceEnum.Paulo,
        language: 'pt',
      });

      expect(result).toBeDefined();
      expect(mockLocalTTS.generateSpeech).toHaveBeenCalled();
    });
  });
});