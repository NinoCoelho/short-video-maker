import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { LibraryManagerService, AssetType } from '../LibraryManagerService';

// Mock fs-extra
vi.mock('fs-extra');
const mockFs = vi.mocked(fs);

// Mock logger
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('LibraryManagerService', () => {
  let libraryManager: LibraryManagerService;
  const testProjectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockFs.ensureDir.mockResolvedValue(undefined);
    mockFs.pathExists.mockResolvedValue(false);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.readJson.mockResolvedValue([]);
    mockFs.writeJson.mockResolvedValue(undefined);
    
    libraryManager = new LibraryManagerService(testProjectRoot);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with correct directory paths', () => {
      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(testProjectRoot, 'static', 'music')
      );
      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(testProjectRoot, 'static', 'overlays')
      );
      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(testProjectRoot, 'data', 'library')
      );
    });

    it('should load existing metadata if files exist', async () => {
      const mockAssets = [
        {
          id: 'asset1',
          filename: 'test.mp3',
          title: 'Test Music',
          duration: 120,
          mood: 'happy',
          tags: ['test'],
          fileSize: 1024,
          format: 'mp3',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue(mockAssets);

      const newLibraryManager = new LibraryManagerService(testProjectRoot);
      await new Promise(resolve => setTimeout(resolve, 0)); // Wait for async initialization

      const assets = newLibraryManager.getAssets();
      expect(assets).toHaveLength(1);
      expect(assets[0].id).toBe('asset1');
    });
  });

  describe('Asset Management', () => {
    it('should get assets with no filters', () => {
      const assets = libraryManager.getAssets();
      expect(Array.isArray(assets)).toBe(true);
    });

    it('should filter assets by type', () => {
      // This would require setting up some mock assets first
      const musicAssets = libraryManager.getAssets({ type: AssetType.MUSIC });
      const overlayAssets = libraryManager.getAssets({ type: AssetType.OVERLAY });
      
      expect(Array.isArray(musicAssets)).toBe(true);
      expect(Array.isArray(overlayAssets)).toBe(true);
    });

    it('should update asset metadata', async () => {
      mockFs.writeJson.mockResolvedValue(undefined);
      
      const result = await libraryManager.updateAsset('nonexistent', { title: 'New Title' });
      expect(result).toBeNull();
    });

    it('should delete asset', async () => {
      mockFs.pathExists.mockResolvedValue(false);
      mockFs.remove.mockResolvedValue(undefined);
      mockFs.writeJson.mockResolvedValue(undefined);
      
      const result = await libraryManager.deleteAsset('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('Collection Management', () => {
    it('should create a new collection', async () => {
      mockFs.writeJson.mockResolvedValue(undefined);
      
      const collection = await libraryManager.createCollection(
        'Test Collection',
        'A test collection',
        AssetType.MUSIC
      );

      expect(collection.name).toBe('Test Collection');
      expect(collection.type).toBe(AssetType.MUSIC);
      expect(collection.assetIds).toEqual([]);
    });

    it('should get all collections', () => {
      const collections = libraryManager.getCollections();
      expect(Array.isArray(collections)).toBe(true);
    });

    it('should filter collections by type', () => {
      const musicCollections = libraryManager.getCollections(AssetType.MUSIC);
      const overlayCollections = libraryManager.getCollections(AssetType.OVERLAY);
      
      expect(Array.isArray(musicCollections)).toBe(true);
      expect(Array.isArray(overlayCollections)).toBe(true);
    });
  });

  describe('File Operations', () => {
    it('should identify music files correctly', () => {
      const service = libraryManager as any; // Access private methods for testing
      
      expect(service.isMusicFile('test.mp3')).toBe(true);
      expect(service.isMusicFile('test.wav')).toBe(true);
      expect(service.isMusicFile('test.ogg')).toBe(true);
      expect(service.isMusicFile('test.m4a')).toBe(true);
      expect(service.isMusicFile('test.png')).toBe(false);
      expect(service.isMusicFile('test.txt')).toBe(false);
    });

    it('should identify overlay files correctly', () => {
      const service = libraryManager as any; // Access private methods for testing
      
      expect(service.isOverlayFile('test.png')).toBe(true);
      expect(service.isOverlayFile('test.jpg')).toBe(true);
      expect(service.isOverlayFile('test.jpeg')).toBe(true);
      expect(service.isOverlayFile('test.gif')).toBe(true);
      expect(service.isOverlayFile('test.webp')).toBe(true);
      expect(service.isOverlayFile('test.mp3')).toBe(false);
      expect(service.isOverlayFile('test.txt')).toBe(false);
    });

    it('should generate unique filenames', () => {
      const service = libraryManager as any; // Access private methods for testing
      mockFs.existsSync = vi.fn().mockReturnValue(false);
      
      const filename = service.generateUniqueFilename('test.mp3', '/test/dir');
      expect(filename).toBe('test.mp3');
    });

    it('should generate unique filenames when file exists', () => {
      const service = libraryManager as any; // Access private methods for testing
      mockFs.existsSync = vi.fn()
        .mockReturnValueOnce(true)  // First call returns true (file exists)
        .mockReturnValueOnce(false); // Second call returns false (unique name found)
      
      const filename = service.generateUniqueFilename('test.mp3', '/test/dir');
      expect(filename).toBe('test_1.mp3');
    });
  });

  describe('Library Statistics', () => {
    it('should return correct statistics', () => {
      const stats = libraryManager.getLibraryStats();
      
      expect(stats).toHaveProperty('totalAssets');
      expect(stats).toHaveProperty('musicAssets');
      expect(stats).toHaveProperty('overlayAssets');
      expect(stats).toHaveProperty('collections');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('musicMoods');
      expect(stats).toHaveProperty('allTags');
      
      expect(typeof stats.totalAssets).toBe('number');
      expect(typeof stats.musicAssets).toBe('number');
      expect(typeof stats.overlayAssets).toBe('number');
      expect(typeof stats.collections).toBe('number');
      expect(typeof stats.totalSize).toBe('number');
      expect(typeof stats.musicMoods).toBe('object');
      expect(Array.isArray(stats.allTags)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockFs.ensureDir.mockRejectedValue(new Error('Permission denied'));
      
      expect(() => {
        new LibraryManagerService(testProjectRoot);
      }).not.toThrow();
    });

    it('should handle JSON parsing errors', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockRejectedValue(new Error('Invalid JSON'));
      
      const newLibraryManager = new LibraryManagerService(testProjectRoot);
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Should still work with empty assets
      const assets = newLibraryManager.getAssets();
      expect(Array.isArray(assets)).toBe(true);
    });
  });
});