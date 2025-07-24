import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusService, StatusType, DownloadStatus } from '../StatusService';

describe('StatusService', () => {
  let statusService: StatusService;

  beforeEach(() => {
    // Reset singleton for each test
    (StatusService as any).instance = null;
    statusService = StatusService.getInstance();
  });

  afterEach(() => {
    // Clean up
    statusService.removeAllListeners();
    statusService.stopCleanupTask();
  });

  describe('Status Management', () => {
    it('should create a status entry', () => {
      const status = statusService.createStatus(StatusType.VIDEO, 'test-123', {
        status: 'pending',
        message: 'Test message'
      });

      expect(status.id).toBe('test-123');
      expect(status.type).toBe(StatusType.VIDEO);
      expect(status.status).toBe('pending');
      expect(status.message).toBe('Test message');
      expect(status.createdAt).toBeInstanceOf(Date);
      expect(status.updatedAt).toBeInstanceOf(Date);
    });

    it('should update a status entry', () => {
      statusService.createStatus(StatusType.VIDEO, 'test-123');
      
      const updated = statusService.updateStatus('test-123', {
        status: 'completed',
        progress: 100,
        message: 'Done'
      });

      expect(updated).toBeTruthy();
      expect(updated?.status).toBe('completed');
      expect(updated?.progress).toBe(100);
      expect(updated?.message).toBe('Done');
      expect(updated?.completedAt).toBeInstanceOf(Date);
    });

    it('should return null when updating non-existent status', () => {
      const result = statusService.updateStatus('non-existent', {
        status: 'completed'
      });

      expect(result).toBeNull();
    });
  });

  describe('Download Status Management', () => {
    it('should create download status', () => {
      const downloadStatus = statusService.createDownloadStatus('job-123', {
        url: 'https://example.com/video.mp4',
        videoId: 'video-123',
        filename: 'test.mp4'
      });

      expect(downloadStatus.type).toBe(StatusType.DOWNLOAD);
      expect(downloadStatus.metadata.jobId).toBe('job-123');
      expect(downloadStatus.metadata.url).toBe('https://example.com/video.mp4');
      expect(downloadStatus.metadata.videoId).toBe('video-123');
      expect(downloadStatus.metadata.filename).toBe('test.mp4');
    });

    it('should update download progress', () => {
      statusService.createDownloadStatus('job-123', {
        url: 'https://example.com/video.mp4',
        videoId: 'video-123'
      });

      statusService.updateDownloadProgress('job-123', {
        downloadedBytes: 500,
        totalBytes: 1000,
        speed: 100,
        eta: 5,
        progress: 50
      });

      const status = statusService.getStatus('job-123') as DownloadStatus;
      expect(status.progress).toBe(50);
      expect(status.metadata.downloadedBytes).toBe(500);
      expect(status.metadata.totalBytes).toBe(1000);
      expect(status.metadata.speed).toBe(100);
      expect(status.metadata.eta).toBe(5);
    });

    it('should complete download', () => {
      statusService.createDownloadStatus('job-123', {
        url: 'https://example.com/video.mp4',
        videoId: 'video-123'
      });

      statusService.completeDownload('job-123', {
        filePath: '/path/to/file.mp4',
        fileSize: 1024
      });

      const status = statusService.getStatus('job-123') as DownloadStatus;
      expect(status.status).toBe('completed');
      expect(status.metadata.filePath).toBe('/path/to/file.mp4');
      expect(status.metadata.fileSize).toBe(1024);
      expect(status.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('Query Methods', () => {
    beforeEach(() => {
      // Create test data
      statusService.createStatus(StatusType.VIDEO, 'video-1');
      statusService.createStatus(StatusType.VIDEO, 'video-2');
      statusService.createDownloadStatus('download-1', {
        url: 'https://example.com/video1.mp4',
        videoId: 'video-1'
      });
      statusService.createDownloadStatus('download-2', {
        url: 'https://example.com/video2.mp4',
        videoId: 'video-2'
      });
    });

    it('should get status by id', () => {
      const status = statusService.getStatus('video-1');
      expect(status).toBeTruthy();
      expect(status?.id).toBe('video-1');
      expect(status?.type).toBe(StatusType.VIDEO);
    });

    it('should get statuses by type', () => {
      const videoStatuses = statusService.getStatusesByType(StatusType.VIDEO);
      const downloadStatuses = statusService.getStatusesByType(StatusType.DOWNLOAD);

      expect(videoStatuses).toHaveLength(2);
      expect(downloadStatuses).toHaveLength(2);
    });

    it('should get active downloads', () => {
      // Update one download to processing
      statusService.updateStatus('download-1', { status: 'processing' });
      
      const activeDownloads = statusService.getActiveDownloads();
      expect(activeDownloads).toHaveLength(2); // pending + processing
    });

    it('should get downloads by video id', () => {
      const downloads = statusService.getDownloadsByVideoId('video-1');
      expect(downloads).toHaveLength(1);
      expect(downloads[0].metadata.videoId).toBe('video-1');
    });
  });

  describe('Cleanup', () => {
    it('should delete status', () => {
      statusService.createStatus(StatusType.VIDEO, 'test-delete');
      
      const deleted = statusService.deleteStatus('test-delete');
      expect(deleted).toBe(true);
      
      const status = statusService.getStatus('test-delete');
      expect(status).toBeNull();
    });

    it('should not delete non-existent status', () => {
      const deleted = statusService.deleteStatus('non-existent');
      expect(deleted).toBe(false);
    });

    it('should cleanup old statuses', () => {
      // Create a completed status
      const status = statusService.createStatus(StatusType.VIDEO, 'old-test');
      statusService.updateStatus('old-test', { status: 'completed' });
      
      // Mock old completion time
      const oldStatus = statusService.getStatus('old-test');
      if (oldStatus) {
        oldStatus.completedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      }
      
      const cleaned = statusService.cleanupOldStatuses(24);
      expect(cleaned).toBe(1);
      
      const status2 = statusService.getStatus('old-test');
      expect(status2).toBeNull();
    });
  });

  describe('Event Handling', () => {
    it('should emit status created event', async () => {
      const promise = new Promise<void>((resolve) => {
        statusService.on('status:created', (status) => {
          expect(status.id).toBe('test-event');
          expect(status.type).toBe(StatusType.VIDEO);
          resolve();
        });
      });

      statusService.createStatus(StatusType.VIDEO, 'test-event');
      await promise;
    });

    it('should emit status updated event', async () => {
      statusService.createStatus(StatusType.VIDEO, 'test-update');
      
      const promise = new Promise<void>((resolve) => {
        statusService.on('status:updated', (status) => {
          expect(status.id).toBe('test-update');
          expect(status.status).toBe('completed');
          resolve();
        });
      });

      statusService.updateStatus('test-update', { status: 'completed' });
      await promise;
    });

    it('should emit status deleted event', async () => {
      statusService.createStatus(StatusType.VIDEO, 'test-delete-event');
      
      const promise = new Promise<void>((resolve) => {
        statusService.on('status:deleted', (data) => {
          expect(data.id).toBe('test-delete-event');
          expect(data.type).toBe(StatusType.VIDEO);
          resolve();
        });
      });

      statusService.deleteStatus('test-delete-event');
      await promise;
    });
  });

  describe('Export/Import', () => {
    it('should export statuses', () => {
      statusService.createStatus(StatusType.VIDEO, 'export-test', {
        status: 'completed',
        message: 'Test export'
      });

      const exported = statusService.exportStatuses();
      expect(exported['export-test']).toBeTruthy();
      expect(exported['export-test'].status).toBe('completed');
      expect(exported['export-test'].message).toBe('Test export');
    });

    it('should import statuses', () => {
      const testData = {
        'import-test': {
          id: 'import-test',
          type: StatusType.VIDEO as StatusType,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
          message: 'Imported status'
        }
      };

      statusService.importStatuses(testData);
      
      const status = statusService.getStatus('import-test');
      expect(status).toBeTruthy();
      expect(status?.message).toBe('Imported status');
    });
  });
});