import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranscriptionService } from '../TranscriptionService';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';

describe('TranscriptionService', () => {
  let service: TranscriptionService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transcription-test-'));
    service = new TranscriptionService(tempDir);
    await new Promise(resolve => setTimeout(resolve, 100)); // Allow initialization
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('initialization', () => {
    it('should initialize service successfully', () => {
      expect(service).toBeDefined();
    });

    it('should return supported languages', () => {
      const languages = service.getSupportedLanguages();
      expect(languages).toBeInstanceOf(Array);
      expect(languages.length).toBeGreaterThan(0);
      expect(languages[0]).toHaveProperty('code');
      expect(languages[0]).toHaveProperty('name');
    });

    it('should return available models', () => {
      const models = service.getAvailableModels();
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('size');
      expect(models[0]).toHaveProperty('description');
    });
  });

  describe('caching', () => {
    it('should manage cache operations', async () => {
      const stats = await service.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(typeof stats.size).toBe('number');

      await service.clearCache();
      const clearedStats = await service.getCacheStats();
      expect(clearedStats.size).toBe(0);
    });
  });

  describe('service statistics', () => {
    it('should return service statistics', async () => {
      const stats = await service.getServiceStats();
      expect(stats).toHaveProperty('totalTranscriptions');
      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('storageSize');
      expect(stats).toHaveProperty('supportedProviders');
      expect(stats).toHaveProperty('availableModels');
      
      expect(Array.isArray(stats.supportedProviders)).toBe(true);
      expect(Array.isArray(stats.availableModels)).toBe(true);
      expect(stats.supportedProviders).toContain('system');
    });
  });

  describe('job management', () => {
    it('should manage jobs', () => {
      const allJobs = service.getAllJobs();
      expect(Array.isArray(allJobs)).toBe(true);
    });

    it('should return undefined for non-existent job', () => {
      const job = service.getJob('non-existent');
      expect(job).toBeUndefined();
    });
  });

  describe('storage cleanup', () => {
    it('should clean up storage', async () => {
      const result = await service.cleanupStorage({
        olderThanDays: 0, // Clean everything
        clearCache: true
      });
      
      expect(result).toHaveProperty('deletedFiles');
      expect(result).toHaveProperty('freedSpace');
      expect(typeof result.deletedFiles).toBe('number');
      expect(typeof result.freedSpace).toBe('number');
    });
  });

  // Note: Actual transcription tests would require audio files and Whisper installation
  // These would be integration tests rather than unit tests
});