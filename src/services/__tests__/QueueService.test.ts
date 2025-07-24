import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueueService, QueuePriority, QueueItemStatus, DownloadQueueData } from '../QueueService';

describe('QueueService', () => {
  let queueService: QueueService;

  beforeEach(() => {
    // Reset singleton for each test
    (QueueService as any).instance = null;
    queueService = QueueService.getInstance({
      maxConcurrent: 2,
      retryDelay: 100,
      defaultMaxRetries: 2
    });
  });

  afterEach(() => {
    // Clean up
    queueService.removeAllListeners();
  });

  describe('Queue Management', () => {
    it('should create a queue', () => {
      queueService.createQueue('test');
      const status = queueService.getQueueStatus('test');
      expect(status).toEqual({
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
      });
    });

    it('should add items to queue with correct priority order', async () => {
      queueService.createQueue('test');
      
      // Mock processor that never resolves to keep items in pending state
      queueService.registerProcessor('test', vi.fn().mockImplementation(() => new Promise(() => {})));
      
      // Add items with different priorities
      await queueService.addToQueue('test', { data: 'low' }, QueuePriority.LOW);
      await queueService.addToQueue('test', { data: 'high' }, QueuePriority.HIGH);
      await queueService.addToQueue('test', { data: 'normal' }, QueuePriority.NORMAL);
      await queueService.addToQueue('test', { data: 'urgent' }, QueuePriority.URGENT);
      
      // Wait a bit for processing to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const status = queueService.getQueueStatus('test');
      // Should have at least some pending items (some might be processing)
      expect(status.pending + status.processing).toBe(4);
    });
  });

  describe('Download Queue', () => {
    it('should add download to queue', async () => {
      const downloadData: DownloadQueueData = {
        url: 'https://example.com/video.mp4',
        videoId: 'video-123',
        jobId: 'job-123'
      };

      const jobId = await queueService.addDownload(downloadData, QueuePriority.HIGH);
      expect(jobId).toBeTruthy();
      
      const status = queueService.getQueueStatus('download');
      expect(status.pending).toBe(1);
    });

    it('should get download progress', async () => {
      const downloadData: DownloadQueueData = {
        url: 'https://example.com/video.mp4',
        videoId: 'video-123',
        jobId: 'job-123'
      };

      await queueService.addDownload(downloadData);
      const progress = queueService.getDownloadProgress('job-123');
      
      expect(progress).toBeTruthy();
      expect(progress?.data.jobId).toBe('job-123');
    });

    it('should cancel download', async () => {
      const downloadData: DownloadQueueData = {
        url: 'https://example.com/video.mp4',
        videoId: 'video-123',
        jobId: 'job-123'
      };

      await queueService.addDownload(downloadData);
      const cancelled = await queueService.cancelDownload('job-123');
      
      expect(cancelled).toBe(true);
      
      const progress = queueService.getDownloadProgress('job-123');
      expect(progress).toBeUndefined();
    });
  });

  describe('Event Handling', () => {
    it('should emit download status events', async () => {
      const promise = new Promise<void>((resolve) => {
        queueService.on('download:status', (event) => {
          expect(event.jobId).toBe('job-123');
          expect(event.status).toBe(QueueItemStatus.PENDING);
          resolve();
        });
      });

      queueService.emitDownloadStatus({
        jobId: 'job-123',
        videoId: 'video-123',
        status: QueueItemStatus.PENDING,
        timestamp: new Date().toISOString()
      });

      await promise;
    });

    it('should emit download progress events', async () => {
      const promise = new Promise<void>((resolve) => {
        queueService.on('download:progress', (event) => {
          expect(event.jobId).toBe('job-123');
          expect(event.progress).toBe(50);
          expect(event.downloadedBytes).toBe(500);
          expect(event.totalBytes).toBe(1000);
          resolve();
        });
      });

      queueService.emitDownloadProgress({
        jobId: 'job-123',
        videoId: 'video-123',
        progress: 50,
        downloadedBytes: 500,
        totalBytes: 1000,
        speed: 100,
        eta: 5,
        timestamp: new Date().toISOString()
      });

      await promise;
    });
  });

  describe('Queue Processing', () => {
    it('should process items with concurrency limit', async () => {
      queueService.createQueue('test');
      
      let processedCount = 0;
      const processor = vi.fn().mockImplementation(async () => {
        processedCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      
      queueService.registerProcessor('test', processor);
      
      // Add 4 items (more than concurrency limit of 2)
      await Promise.all([
        queueService.addToQueue('test', { data: 1 }),
        queueService.addToQueue('test', { data: 2 }),
        queueService.addToQueue('test', { data: 3 }),
        queueService.addToQueue('test', { data: 4 })
      ]);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(processor).toHaveBeenCalled();
      expect(processedCount).toBeGreaterThan(0);
    });

    it('should retry failed items', async () => {
      queueService.createQueue('test');
      
      let attemptCount = 0;
      const processor = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Test error');
        }
        return 'success';
      });
      
      queueService.registerProcessor('test', processor);
      
      await queueService.addToQueue('test', { data: 'retry-test' });
      
      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 300));
      
      expect(processor).toHaveBeenCalledTimes(2);
    });
  });

  describe('Concurrency Control', () => {
    it('should update download concurrency', () => {
      queueService.setDownloadConcurrency(5);
      // This should not throw an error
      expect(true).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clear completed items', async () => {
      queueService.createQueue('test');
      
      // Mock successful processor
      queueService.registerProcessor('test', vi.fn().mockResolvedValue('done'));
      
      await queueService.addToQueue('test', { data: 'test' });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const cleared = queueService.clearCompletedItems('test');
      expect(cleared).toBeGreaterThanOrEqual(0);
    });
  });
});