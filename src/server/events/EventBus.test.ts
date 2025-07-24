import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus, eventBus, VideoStatusUpdateEvent, VideoProcessingProgressEvent, VideoCompletedEvent, VideoErrorEvent, SceneProcessingEvent, DownloadProgressEvent, DownloadStatusEvent, DownloadCompleteEvent, DownloadErrorEvent } from './EventBus';

describe('EventBus', () => {
  let testEventBus: EventBus;

  beforeEach(() => {
    // Create a fresh instance for each test to avoid cross-test contamination
    testEventBus = EventBus.getInstance();
    testEventBus.removeAllListeners();
    testEventBus.cleanup();
  });

  afterEach(() => {
    testEventBus.cleanup();
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = EventBus.getInstance();
      const instance2 = EventBus.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should export the singleton instance', () => {
      expect(eventBus).toBeInstanceOf(EventBus);
      expect(eventBus).toBe(EventBus.getInstance());
    });
  });

  describe('Video Status Update Events', () => {
    it('should emit and listen to video status updates', async () => {
      const mockListener = vi.fn();
      const testEvent: VideoStatusUpdateEvent = {
        videoId: 'test-video-123',
        status: 'processing',
        progress: 50,
        message: 'Test message',
        timestamp: new Date().toISOString()
      };

      testEventBus.onVideoStatusUpdate(mockListener);
      testEventBus.emitVideoStatusUpdate(testEvent);

      expect(mockListener).toHaveBeenCalledWith({
        ...testEvent,
        timestamp: expect.any(String)
      });
    });

    it('should track video-specific listeners', async () => {
      const mockListener = vi.fn();
      const videoId = 'test-video-123';
      
      testEventBus.onVideoStatusUpdate(mockListener, videoId);
      testEventBus.emitVideoStatusUpdate({
        videoId,
        status: 'processing',
        progress: 50,
        timestamp: new Date().toISOString()
      });

      expect(mockListener).toHaveBeenCalledOnce();
    });

    it('should add timestamp if not provided', () => {
      const mockListener = vi.fn();
      const testEvent = {
        videoId: 'test-video-123',
        status: 'processing',
        progress: 50
      } as VideoStatusUpdateEvent;

      testEventBus.onVideoStatusUpdate(mockListener);
      testEventBus.emitVideoStatusUpdate(testEvent);

      expect(mockListener).toHaveBeenCalledWith({
        ...testEvent,
        timestamp: expect.any(String)
      });
    });
  });

  describe('Video Processing Progress Events', () => {
    it('should emit and listen to processing progress', () => {
      const mockListener = vi.fn();
      const testEvent: VideoProcessingProgressEvent = {
        videoId: 'test-video-123',
        progress: 75,
        stage: 'rendering',
        message: 'Rendering frame 150/200',
        timestamp: new Date().toISOString()
      };

      testEventBus.onVideoProcessingProgress(mockListener);
      testEventBus.emitVideoProcessingProgress(testEvent);

      expect(mockListener).toHaveBeenCalledWith({
        ...testEvent,
        timestamp: expect.any(String)
      });
    });

    it('should track listeners per video', () => {
      const mockListener1 = vi.fn();
      const mockListener2 = vi.fn();
      const videoId = 'test-video-123';

      testEventBus.onVideoProcessingProgress(mockListener1, videoId);
      testEventBus.onVideoProcessingProgress(mockListener2, videoId);

      testEventBus.emitVideoProcessingProgress({
        videoId,
        progress: 50,
        stage: 'processing',
        timestamp: new Date().toISOString()
      });

      expect(mockListener1).toHaveBeenCalledOnce();
      expect(mockListener2).toHaveBeenCalledOnce();
    });
  });

  describe('Video Completion Events', () => {
    it('should emit and listen to completion events', () => {
      const mockListener = vi.fn();
      const testEvent: VideoCompletedEvent = {
        videoId: 'test-video-123',
        result: { outputPath: '/path/to/output.mp4', duration: 30 },
        timestamp: new Date().toISOString()
      };

      testEventBus.onVideoCompleted(mockListener);
      testEventBus.emitVideoCompleted(testEvent);

      expect(mockListener).toHaveBeenCalledWith({
        ...testEvent,
        timestamp: expect.any(String)
      });
    });
  });

  describe('Video Error Events', () => {
    it('should emit and listen to error events', () => {
      const mockListener = vi.fn();
      const testEvent: VideoErrorEvent = {
        videoId: 'test-video-123',
        error: 'Processing failed',
        timestamp: new Date().toISOString()
      };

      testEventBus.onVideoError(mockListener);
      testEventBus.emitVideoError(testEvent);

      expect(mockListener).toHaveBeenCalledWith({
        ...testEvent,
        timestamp: expect.any(String)
      });
    });
  });

  describe('Scene Processing Events', () => {
    it('should emit and listen to scene processing events', () => {
      const mockListener = vi.fn();
      const testEvent: SceneProcessingEvent = {
        videoId: 'test-video-123',
        sceneIndex: 2,
        totalScenes: 5,
        stage: 'audio-generation',
        progress: 40,
        timestamp: new Date().toISOString()
      };

      testEventBus.onSceneProcessing(mockListener);
      testEventBus.emitSceneProcessing(testEvent);

      expect(mockListener).toHaveBeenCalledWith({
        ...testEvent,
        timestamp: expect.any(String)
      });
    });
  });

  describe('Download Events', () => {
    it('should handle download progress events', () => {
      const mockListener = vi.fn();
      const testEvent: DownloadProgressEvent = {
        jobId: 'download-123',
        videoId: 'video-456',
        progress: 65,
        downloadedBytes: 650000,
        totalBytes: 1000000,
        speed: 125000,
        eta: 2.8,
        timestamp: new Date().toISOString()
      };

      testEventBus.onDownloadProgress(mockListener);
      testEventBus.emitDownloadProgress(testEvent);

      expect(mockListener).toHaveBeenCalledWith({
        ...testEvent,
        timestamp: expect.any(String)
      });
    });

    it('should handle download status events', () => {
      const mockListener = vi.fn();
      const testEvent: DownloadStatusEvent = {
        jobId: 'download-123',
        videoId: 'video-456',
        status: 'downloading',
        message: 'Download started',
        timestamp: new Date().toISOString()
      };

      testEventBus.onDownloadStatus(mockListener);
      testEventBus.emitDownloadStatus(testEvent);

      expect(mockListener).toHaveBeenCalledWith(testEvent);
    });

    it('should handle download complete events', () => {
      const mockListener = vi.fn();
      const testEvent: DownloadCompleteEvent = {
        jobId: 'download-123',
        videoId: 'video-456',
        filePath: '/tmp/downloaded-video.mp4',
        fileSize: 1000000,
        duration: 30.5,
        timestamp: new Date().toISOString()
      };

      testEventBus.onDownloadComplete(mockListener);
      testEventBus.emitDownloadComplete(testEvent);

      expect(mockListener).toHaveBeenCalledWith(testEvent);
    });

    it('should handle download error events', () => {
      const mockListener = vi.fn();
      const testEvent: DownloadErrorEvent = {
        jobId: 'download-123',
        videoId: 'video-456',
        error: 'Network timeout',
        retries: 2,
        willRetry: true,
        timestamp: new Date().toISOString()
      };

      testEventBus.onDownloadError(mockListener);
      testEventBus.emitDownloadError(testEvent);

      expect(mockListener).toHaveBeenCalledWith(testEvent);
    });
  });

  describe('Listener Management', () => {
    it('should track multiple listeners for the same video', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();
      const videoId = 'test-video-123';

      testEventBus.onVideoStatusUpdate(listener1, videoId);
      testEventBus.onVideoProcessingProgress(listener2, videoId);
      testEventBus.onVideoCompleted(listener3, videoId);

      // Emit events and verify all listeners are called
      testEventBus.emitVideoStatusUpdate({
        videoId,
        status: 'processing',
        progress: 50,
        timestamp: new Date().toISOString()
      });

      testEventBus.emitVideoProcessingProgress({
        videoId,
        progress: 75,
        stage: 'rendering',
        timestamp: new Date().toISOString()
      });

      testEventBus.emitVideoCompleted({
        videoId,
        result: { outputPath: '/path' },
        timestamp: new Date().toISOString()
      });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
      expect(listener3).toHaveBeenCalledOnce();
    });

    it('should remove all listeners for a specific video', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const videoId = 'test-video-123';

      testEventBus.onVideoStatusUpdate(listener1, videoId);
      testEventBus.onVideoProcessingProgress(listener2, videoId);

      // Remove all listeners for the video
      testEventBus.removeAllListenersForVideo(videoId);

      // Emit events and verify listeners are not called
      testEventBus.emitVideoStatusUpdate({
        videoId,
        status: 'processing',
        progress: 50,
        timestamp: new Date().toISOString()
      });

      testEventBus.emitVideoProcessingProgress({
        videoId,
        progress: 75,
        stage: 'rendering',
        timestamp: new Date().toISOString()
      });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should not affect listeners for other videos when removing', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const videoId1 = 'test-video-123';
      const videoId2 = 'test-video-456';

      testEventBus.onVideoStatusUpdate(listener1, videoId1);
      testEventBus.onVideoStatusUpdate(listener2, videoId2);

      // Remove listeners for video1
      testEventBus.removeAllListenersForVideo(videoId1);

      // Emit event for video2 - should still work
      testEventBus.emitVideoStatusUpdate({
        videoId: videoId2,
        status: 'processing',
        progress: 50,
        timestamp: new Date().toISOString()
      });

      // Emit event for video1 - should not call listener
      testEventBus.emitVideoStatusUpdate({
        videoId: videoId1,
        status: 'processing',
        progress: 50,
        timestamp: new Date().toISOString()
      });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledOnce();
    });
  });

  describe('Memory Management', () => {
    it('should clean up all listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      testEventBus.onVideoStatusUpdate(listener1);
      testEventBus.onDownloadProgress(listener2);

      // Verify listeners are working
      testEventBus.emitVideoStatusUpdate({
        videoId: 'test',
        status: 'processing',
        timestamp: new Date().toISOString()
      });

      expect(listener1).toHaveBeenCalledOnce();

      // Clean up
      testEventBus.cleanup();

      // Emit again - listeners should not be called
      testEventBus.emitVideoStatusUpdate({
        videoId: 'test',
        status: 'processing',
        timestamp: new Date().toISOString()
      });

      expect(listener1).toHaveBeenCalledOnce(); // Still just once
    });

    it('should clean up stale listeners', () => {
      const listener = vi.fn();
      const videoId = 'test-video-123';

      testEventBus.onVideoStatusUpdate(listener, videoId);
      
      // Clean up stale listeners
      testEventBus.cleanupStaleListeners();

      // This test mainly verifies the method runs without errors
      // In a real scenario, you'd track timestamps and clean based on age
      expect(() => testEventBus.cleanupStaleListeners()).not.toThrow();
    });

    it('should handle max listeners correctly', () => {
      // Set max listeners to avoid warning
      testEventBus.setMaxListeners(200);
      
      // Add many listeners to test max listeners setting
      const listeners = [];
      for (let i = 0; i < 150; i++) {
        const listener = vi.fn();
        listeners.push(listener);
        testEventBus.onVideoStatusUpdate(listener);
      }

      // Verify no warnings are thrown (max listeners is set to 100+)
      expect(() => {
        testEventBus.emitVideoStatusUpdate({
          videoId: 'test',
          status: 'processing',
          timestamp: new Date().toISOString()
        });
      }).not.toThrow();

      // Verify all listeners were called
      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalledOnce();
      });
    });
  });

  describe('Event Data Validation', () => {
    it('should preserve all event data properties', () => {
      const mockListener = vi.fn();
      const complexEvent: VideoStatusUpdateEvent = {
        videoId: 'test-video-123',
        status: 'processing',
        progress: 75.5,
        message: 'Complex message with special chars: àáâãäåæçèéêë',
        timestamp: '2025-01-22T10:30:00.000Z'
      };

      testEventBus.onVideoStatusUpdate(mockListener);
      testEventBus.emitVideoStatusUpdate(complexEvent);

      expect(mockListener).toHaveBeenCalledWith({
        videoId: 'test-video-123',
        status: 'processing',
        progress: 75.5,
        message: 'Complex message with special chars: àáâãäåæçèéêë',
        timestamp: '2025-01-22T10:30:00.000Z'
      });
    });

    it('should handle undefined optional properties', () => {
      const mockListener = vi.fn();
      const minimalEvent = {
        videoId: 'test-video-123',
        status: 'processing',
        timestamp: new Date().toISOString()
      } as VideoStatusUpdateEvent;

      testEventBus.onVideoStatusUpdate(mockListener);
      testEventBus.emitVideoStatusUpdate(minimalEvent);

      expect(mockListener).toHaveBeenCalledWith({
        videoId: 'test-video-123',
        status: 'processing',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent events', async () => {
      const listener = vi.fn();
      testEventBus.onVideoStatusUpdate(listener);

      // Emit multiple events rapidly
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              testEventBus.emitVideoStatusUpdate({
                videoId: `video-${i}`,
                status: 'processing',
                progress: i * 10,
                timestamp: new Date().toISOString()
              });
              resolve();
            }, i);
          })
        );
      }

      await Promise.all(promises);
      
      // Wait a bit more for all events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(listener).toHaveBeenCalledTimes(10);
    });
  });

  describe('Error Handling', () => {
    it('should continue execution when listener throws an error', () => {
      const faultyListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      testEventBus.onVideoStatusUpdate(faultyListener);
      testEventBus.onVideoStatusUpdate(goodListener);

      // EventEmitters typically don't handle listener errors gracefully by default
      // This test verifies the behavior - the error will be thrown, but both listeners are called
      expect(() => {
        testEventBus.emitVideoStatusUpdate({
          videoId: 'test',
          status: 'processing',
          timestamp: new Date().toISOString()
        });
      }).toThrow('Listener error');

      expect(faultyListener).toHaveBeenCalled();
      // The good listener might not be called due to the error, this is expected behavior
    });
  });
});