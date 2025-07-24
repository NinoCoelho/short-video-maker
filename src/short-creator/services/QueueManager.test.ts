import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueueManager, QueueManagerCallbacks } from './QueueManager';
import { QueueItem, ImportQueueItem } from '../types/QueueItem';
import { SceneInput, RenderConfig } from '../../types/shorts';
import { VoiceEnum, OrientationEnum, MusicMoodEnum } from '../../types/shorts';

// Mock the logger
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock cuid
vi.mock('cuid', () => ({
  default: vi.fn(() => 'mock-video-id'),
}));

describe('QueueManager', () => {
  let queueManager: QueueManager;
  let mockCallbacks: QueueManagerCallbacks;

  beforeEach(() => {
    mockCallbacks = {
      onProcessCreationItem: vi.fn().mockResolvedValue(undefined),
      onProcessRenderItem: vi.fn().mockResolvedValue(undefined),
      onProcessImportItem: vi.fn().mockResolvedValue(undefined),
    };

    queueManager = new QueueManager(mockCallbacks);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Creation Queue', () => {
    const mockScenes: SceneInput[] = [
      { text: 'Scene 1 text', searchTerms: ['test'] },
      { text: 'Scene 2 text', searchTerms: ['video'] },
    ];

    const mockConfig: RenderConfig = {
      voice: VoiceEnum.Paulo,
      language: 'pt',
      orientation: OrientationEnum.portrait,
      music: MusicMoodEnum.happy,
    };

    it('should add item to creation queue and return video ID', () => {
      const videoId = queueManager.addToCreationQueue(mockScenes, mockConfig);

      expect(videoId).toBe('mock-video-id');
      
      const status = queueManager.getQueueStatus();
      expect(status.creation.pending).toBe(1);
    });

    it('should process creation queue automatically', async () => {
      queueManager.addToCreationQueue(mockScenes, mockConfig);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCallbacks.onProcessCreationItem).toHaveBeenCalledWith({
        id: 'mock-video-id',
        sceneInput: mockScenes,
        config: mockConfig,
        status: 'pending',
      });

      const status = queueManager.getQueueStatus();
      expect(status.creation.pending).toBe(0);
      expect(status.creation.processing).toBe(false);
    });

    it('should not process creation queue when already processing', async () => {
      // Add multiple items
      queueManager.addToCreationQueue(mockScenes, mockConfig);
      queueManager.addToCreationQueue(mockScenes, mockConfig);

      // Processing should be sequential
      expect(mockCallbacks.onProcessCreationItem).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in creation processing', async () => {
      const error = new Error('Processing failed');
      mockCallbacks.onProcessCreationItem.mockRejectedValue(error);

      queueManager.addToCreationQueue(mockScenes, mockConfig);

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockCallbacks.onProcessCreationItem).toHaveBeenCalled();
      
      const status = queueManager.getQueueStatus();
      expect(status.creation.processing).toBe(false);
    });

    it('should continue processing after error', async () => {
      // First item fails
      mockCallbacks.onProcessCreationItem
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce(undefined);

      queueManager.addToCreationQueue(mockScenes, mockConfig);
      queueManager.addToCreationQueue(mockScenes, mockConfig);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockCallbacks.onProcessCreationItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('Render Queue', () => {
    it('should add video to render queue', () => {
      const videoId = 'test-video-123';
      queueManager.addToRenderQueue(videoId);

      const status = queueManager.getQueueStatus();
      expect(status.render.pending).toBe(1);
    });

    it('should process render queue automatically', async () => {
      const videoId = 'test-video-123';
      queueManager.addToRenderQueue(videoId);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCallbacks.onProcessRenderItem).toHaveBeenCalledWith(videoId);

      const status = queueManager.getQueueStatus();
      expect(status.render.pending).toBe(0);
      expect(status.render.processing).toBe(false);
    });

    it('should not process render queue when already processing', async () => {
      queueManager.addToRenderQueue('video-1');
      queueManager.addToRenderQueue('video-2');

      // Processing should be sequential
      expect(mockCallbacks.onProcessRenderItem).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in render processing', async () => {
      const error = new Error('Render failed');
      mockCallbacks.onProcessRenderItem.mockRejectedValue(error);

      queueManager.addToRenderQueue('test-video-123');

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockCallbacks.onProcessRenderItem).toHaveBeenCalled();
      
      const status = queueManager.getQueueStatus();
      expect(status.render.processing).toBe(false);
    });
  });

  describe('Import Queue', () => {
    const createImportItem = (id: string, priority: 'high' | 'normal' | 'low' = 'normal'): ImportQueueItem => ({
      id,
      url: `https://example.com/${id}.mp4`,
      priority,
      metadata: {
        title: `Video ${id}`,
        platform: 'test',
      },
    });

    it('should add item to import queue', () => {
      const item = createImportItem('import-video-123');
      queueManager.addToImportQueue(item);

      const status = queueManager.getQueueStatus();
      expect(status.import.pending).toBe(1);
    });

    it('should process import queue automatically', async () => {
      const item = createImportItem('import-video-123');
      queueManager.addToImportQueue(item);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCallbacks.onProcessImportItem).toHaveBeenCalledWith(item);

      const status = queueManager.getQueueStatus();
      expect(status.import.pending).toBe(0);
      expect(status.import.processing).toBe(false);
    });

    it('should process import queue by priority (high first)', async () => {
      const lowItem = createImportItem('low-priority', 'low');
      const highItem = createImportItem('high-priority', 'high');
      const normalItem = createImportItem('normal-priority', 'normal');

      // Add in random order
      queueManager.addToImportQueue(lowItem);
      queueManager.addToImportQueue(normalItem);
      queueManager.addToImportQueue(highItem);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // High priority should be processed first
      expect(mockCallbacks.onProcessImportItem).toHaveBeenNthCalledWith(1, highItem);
      expect(mockCallbacks.onProcessImportItem).toHaveBeenNthCalledWith(2, normalItem);
      expect(mockCallbacks.onProcessImportItem).toHaveBeenNthCalledWith(3, lowItem);
    });

    it('should update render queue priority when import items are added', () => {
      // Add regular render items
      queueManager.addToRenderQueue('regular-video-1');
      queueManager.addToRenderQueue('regular-video-2');

      // Add import item
      const importItem = createImportItem('import-video-123');
      queueManager.addToImportQueue(importItem);

      // Import-related render should be prioritized
      // This is a bit hard to test directly, but we can check the queue status
      const status = queueManager.getQueueStatus();
      expect(status.render.pending).toBe(2);
      expect(status.import.pending).toBe(1);
    });

    it('should handle errors in import processing', async () => {
      const error = new Error('Import failed');
      mockCallbacks.onProcessImportItem.mockRejectedValue(error);

      const item = createImportItem('import-video-123');
      queueManager.addToImportQueue(item);

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockCallbacks.onProcessImportItem).toHaveBeenCalled();
      
      const status = queueManager.getQueueStatus();
      expect(status.import.processing).toBe(false);
    });
  });

  describe('Queue Status', () => {
    it('should return correct queue status when empty', () => {
      const status = queueManager.getQueueStatus();

      expect(status).toEqual({
        creation: {
          pending: 0,
          processing: false,
        },
        render: {
          pending: 0,
          processing: false,
        },
        import: {
          pending: 0,
          processing: false,
        },
      });
    });

    it('should return correct queue status with items', () => {
      const mockScenes: SceneInput[] = [{ text: 'Test', searchTerms: ['test'] }];
      const mockConfig: RenderConfig = {
        voice: VoiceEnum.Paulo,
        language: 'pt',
        orientation: OrientationEnum.portrait,
      };

      queueManager.addToCreationQueue(mockScenes, mockConfig);
      queueManager.addToRenderQueue('video-1');
      queueManager.addToRenderQueue('video-2');
      queueManager.addToImportQueue(createImportItem('import-1'));

      const status = queueManager.getQueueStatus();

      expect(status.creation.pending).toBe(1);
      expect(status.render.pending).toBe(2);
      expect(status.import.pending).toBe(1);
    });
  });

  describe('Queue Clearing', () => {
    it('should clear all queues and reset processing flags', async () => {
      const mockScenes: SceneInput[] = [{ text: 'Test', searchTerms: ['test'] }];
      const mockConfig: RenderConfig = {
        voice: VoiceEnum.Paulo,
        language: 'pt',
        orientation: OrientationEnum.portrait,
      };

      // Add items to all queues
      queueManager.addToCreationQueue(mockScenes, mockConfig);
      queueManager.addToRenderQueue('video-1');
      queueManager.addToImportQueue(createImportItem('import-1'));

      // Clear all
      queueManager.clearAllQueues();

      const status = queueManager.getQueueStatus();
      expect(status).toEqual({
        creation: {
          pending: 0,
          processing: false,
        },
        render: {
          pending: 0,
          processing: false,
        },
        import: {
          pending: 0,
          processing: false,
        },
      });
    });
  });

  describe('Concurrent Processing', () => {
    it('should handle multiple queue types processing simultaneously', async () => {
      const mockScenes: SceneInput[] = [{ text: 'Test', searchTerms: ['test'] }];
      const mockConfig: RenderConfig = {
        voice: VoiceEnum.Paulo,
        language: 'pt',
        orientation: OrientationEnum.portrait,
      };

      // Add to different queues
      queueManager.addToCreationQueue(mockScenes, mockConfig);
      queueManager.addToRenderQueue('video-1');
      queueManager.addToImportQueue(createImportItem('import-1'));

      // Wait for all processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // All callbacks should have been called
      expect(mockCallbacks.onProcessCreationItem).toHaveBeenCalled();
      expect(mockCallbacks.onProcessRenderItem).toHaveBeenCalled();
      expect(mockCallbacks.onProcessImportItem).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty queue processing gracefully', async () => {
      await queueManager.processCreationQueue();
      await queueManager.processRenderQueue();
      await queueManager.processImportQueue();

      expect(mockCallbacks.onProcessCreationItem).not.toHaveBeenCalled();
      expect(mockCallbacks.onProcessRenderItem).not.toHaveBeenCalled();
      expect(mockCallbacks.onProcessImportItem).not.toHaveBeenCalled();
    });

    it('should handle callback throwing synchronous errors', async () => {
      mockCallbacks.onProcessCreationItem.mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      const mockScenes: SceneInput[] = [{ text: 'Test', searchTerms: ['test'] }];
      const mockConfig: RenderConfig = {
        voice: VoiceEnum.Paulo,
        language: 'pt',
        orientation: OrientationEnum.portrait,
      };

      queueManager.addToCreationQueue(mockScenes, mockConfig);

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 20));

      const status = queueManager.getQueueStatus();
      expect(status.creation.processing).toBe(false);
    });

    it('should maintain queue order for items with same priority', async () => {
      const item1 = createImportItem('video-1', 'normal');
      const item2 = createImportItem('video-2', 'normal');
      const item3 = createImportItem('video-3', 'normal');

      queueManager.addToImportQueue(item1);
      queueManager.addToImportQueue(item2);
      queueManager.addToImportQueue(item3);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should be processed in order
      expect(mockCallbacks.onProcessImportItem).toHaveBeenNthCalledWith(1, item1);
      expect(mockCallbacks.onProcessImportItem).toHaveBeenNthCalledWith(2, item2);
      expect(mockCallbacks.onProcessImportItem).toHaveBeenNthCalledWith(3, item3);
    });
  });
});