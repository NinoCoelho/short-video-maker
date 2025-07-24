import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { VideoImportService } from '../VideoImportService';
import { DownloadProcessor } from '../DownloadProcessor';
import { QueueService } from '../QueueService';
import { StatusService } from '../StatusService';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import axios from 'axios';
import os from 'os';
import {
  ImportJob,
  ImportJobStatus,
  VideoSourceType,
  VideoImportRequest,
  DownloadItemType,
  DownloadItemStatus
} from '../../types/import';

// Mock modules
vi.mock('../DownloadProcessor');
vi.mock('../QueueService');
vi.mock('../StatusService');
vi.mock('fs-extra');
vi.mock('child_process');
vi.mock('axios');
vi.mock('os');
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('VideoImportService - Error Scenarios', () => {
  let service: VideoImportService;
  let mockDownloadProcessor: any;
  let mockQueueService: any;
  let mockStatusService: any;
  const dataDir = '/data/imports';

  beforeEach(async () => {
    // Mock services
    mockQueueService = new QueueService();
    mockStatusService = new StatusService();
    
    mockDownloadProcessor = new EventEmitter();
    mockDownloadProcessor.start = vi.fn();
    mockDownloadProcessor.stop = vi.fn();
    mockDownloadProcessor.shutdown = vi.fn();
    (DownloadProcessor as any).mockImplementation(() => mockDownloadProcessor);

    // Mock fs operations
    (fs.ensureDir as MockedFunction<typeof fs.ensureDir>).mockResolvedValue(undefined);
    (fs.existsSync as MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
    (fs.readJson as MockedFunction<typeof fs.readJson>).mockResolvedValue({});
    (fs.writeJson as MockedFunction<typeof fs.writeJson>).mockResolvedValue(undefined);

    // Mock os
    (os.freemem as MockedFunction<typeof os.freemem>).mockReturnValue(4 * 1024 * 1024 * 1024); // 4GB

    service = new VideoImportService(dataDir);
    await new Promise(resolve => setTimeout(resolve, 10)); // Allow initialization
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('URL Analysis Failures', () => {
    it('should handle invalid URL format', async () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://example.com/video.mp4', // Unsupported protocol
        'javascript:alert("xss")', // Security issue
        'data:text/html,<script>alert("xss")</script>', // Data URL
        'file:///etc/passwd' // Local file access
      ];

      for (const url of invalidUrls) {
        await expect(service.analyzeUrl(url)).rejects.toThrow(/Invalid URL|Unsupported protocol/);
      }
    });

    it('should handle YouTube API failures', async () => {
      const url = 'https://youtube.com/watch?v=test123';

      // Mock yt-dlp failure
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('yt-dlp')) {
          callback(
            new Error('ERROR: Video unavailable'),
            '',
            'ERROR: Video unavailable. This video is not available.'
          );
        }
      });

      await expect(service.analyzeUrl(url)).rejects.toThrow('Video unavailable');
    });

    it('should handle age-restricted content', async () => {
      const url = 'https://youtube.com/watch?v=restricted123';

      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('yt-dlp')) {
          callback(
            new Error('ERROR: Sign in to confirm your age'),
            '',
            'ERROR: Sign in to confirm your age. This video may be inappropriate for some users.'
          );
        }
      });

      await expect(service.analyzeUrl(url)).rejects.toThrow('Sign in to confirm your age');
    });

    it('should handle private/deleted videos', async () => {
      const url = 'https://youtube.com/watch?v=private123';

      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('yt-dlp')) {
          callback(
            new Error('ERROR: Private video'),
            '',
            'ERROR: Private video. Sign in if you\'ve been granted access to this video.'
          );
        }
      });

      await expect(service.analyzeUrl(url)).rejects.toThrow('Private video');
    });

    it('should handle rate limiting', async () => {
      const url = 'https://youtube.com/watch?v=ratelimit123';

      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('yt-dlp')) {
          callback(
            new Error('ERROR: HTTP Error 429: Too Many Requests'),
            '',
            'ERROR: HTTP Error 429: Too Many Requests'
          );
        }
      });

      const errorHandler = vi.fn();
      service.on('job:error', errorHandler);

      await expect(service.analyzeUrl(url)).rejects.toThrow('429');

      // Verify rate limit info is captured
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('429'),
        retryable: true,
        httpStatus: 429
      }));
    });
  });

  describe('Download Processing Failures', () => {
    it('should handle download processor crash', async () => {
      const request: VideoImportRequest = {
        url: 'https://example.com/video.mp4',
        source: VideoSourceType.URL,
        config: {}
      };

      const job = await service.createImportJob(request);

      // Simulate processor crash
      mockDownloadProcessor.emit('error', {
        error: 'Fatal: Download processor crashed',
        code: 'PROCESSOR_CRASH'
      });

      const errorHandler = vi.fn();
      service.on('job:error', errorHandler);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('processor crashed'),
        fatal: true
      }));
    });

    it('should handle download queue overflow', async () => {
      // Create many jobs to overflow queue
      const jobs = await Promise.all(
        Array.from({ length: 100 }, (_, i) => 
          service.createImportJob({
            url: `https://example.com/video${i}.mp4`,
            source: VideoSourceType.URL,
            config: {}
          })
        )
      );

      // Mock queue full error
      mockQueueService.addItem = vi.fn().mockRejectedValue(
        new Error('Queue capacity exceeded: Maximum 50 items')
      );

      const errorHandler = vi.fn();
      service.on('job:error', errorHandler);

      // Try to add one more
      await expect(service.createImportJob({
        url: 'https://example.com/overflow.mp4',
        source: VideoSourceType.URL,
        config: {}
      })).rejects.toThrow('Queue capacity exceeded');
    });
  });

  describe('Metadata Extraction Failures', () => {
    it('should handle ffprobe failures', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 30,
        config: {},
        videoPath: '/tmp/video.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock ffprobe failure
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffprobe')) {
          callback(
            new Error('ffprobe: command not found'),
            '',
            '/bin/sh: ffprobe: command not found'
          );
        }
      });

      await expect((service as any).extractMetadata(job)).rejects.toThrow('ffprobe: command not found');
    });

    it('should handle corrupted metadata', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/corrupted.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 30,
        config: {},
        videoPath: '/tmp/corrupted.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock ffprobe returning invalid JSON
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffprobe')) {
          callback(null, '{ invalid json', '');
        }
      });

      const errorHandler = vi.fn();
      service.on('job:error', errorHandler);

      await (service as any).extractMetadata(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Invalid metadata'),
        phase: 'metadata-extraction'
      }));
    });
  });

  describe('Audio Extraction Failures', () => {
    it('should handle videos without audio track', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/silent-video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 40,
        config: { enableTranscription: true },
        videoPath: '/tmp/silent-video.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock ffmpeg detecting no audio
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffmpeg') && command.includes('-acodec')) {
          callback(
            new Error('Stream map \'0:a\' matches no streams'),
            '',
            'Stream map \'0:a\' matches no streams. To ignore this, add a trailing \'?\' to the map.'
          );
        }
      });

      const warningHandler = vi.fn();
      service.on('job:warning', warningHandler);

      await (service as any).extractAudio(job);

      expect(warningHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        warning: expect.stringContaining('No audio track found'),
        phase: 'audio-extraction',
        skipTranscription: true
      }));
    });

    it('should handle audio codec conversion failures', async () => {
      const job: ImportJob = {
        id: 'job-124',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/exotic-audio.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 40,
        config: { enableTranscription: true },
        videoPath: '/tmp/exotic-audio.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock ffmpeg codec error
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffmpeg')) {
          callback(
            new Error('Unknown encoder \'pcm_s16le\''),
            '',
            'Unknown encoder \'pcm_s16le\''
          );
        }
      });

      await expect((service as any).extractAudio(job)).rejects.toThrow('Unknown encoder');
    });
  });

  describe('Concurrent Job Management', () => {
    it('should handle job collision with same URL', async () => {
      const url = 'https://example.com/duplicate.mp4';

      // Create first job
      const job1 = await service.createImportJob({
        url,
        source: VideoSourceType.URL,
        config: {}
      });

      // Mock job already processing
      vi.spyOn(service as any, 'findExistingJob').mockReturnValue(job1);

      // Try to create duplicate
      const errorHandler = vi.fn();
      service.on('job:error', errorHandler);

      await expect(service.createImportJob({
        url,
        source: VideoSourceType.URL,
        config: {}
      })).rejects.toThrow('Job already exists for this URL');
    });

    it('should handle concurrent job limit exceeded', async () => {
      // Create multiple processing jobs
      const jobs = Array.from({ length: 10 }, (_, i) => ({
        id: `job-${i}`,
        source: VideoSourceType.URL,
        sourceUrl: `https://example.com/video${i}.mp4`,
        status: ImportJobStatus.PROCESSING,
        progress: 20 + i * 5,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      vi.spyOn(service, 'getAllJobs').mockReturnValue(jobs);
      vi.spyOn(service as any, 'getProcessingJobCount').mockReturnValue(10);

      await expect(service.createImportJob({
        url: 'https://example.com/another.mp4',
        source: VideoSourceType.URL,
        config: {}
      })).rejects.toThrow('Too many concurrent import jobs');
    });
  });

  describe('Storage and Persistence Failures', () => {
    it('should handle job state save failures', async () => {
      const job: ImportJob = {
        id: 'job-125',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 50,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock write failure
      (fs.writeJson as MockedFunction<typeof fs.writeJson>).mockRejectedValue(
        Object.assign(new Error('EACCES: permission denied'), {
          code: 'EACCES'
        })
      );

      const errorHandler = vi.fn();
      service.on('job:error', errorHandler);

      await (service as any).saveJobState(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('EACCES'),
        phase: 'state-persistence',
        critical: true
      }));
    });

    it('should handle corrupted job state recovery', async () => {
      const jobId = 'job-corrupted';

      // Mock corrupted state file
      (fs.readJson as MockedFunction<typeof fs.readJson>).mockResolvedValue({
        id: jobId,
        // Missing required fields
        status: 'invalid-status',
        progress: 'not-a-number'
      });

      const warningHandler = vi.fn();
      service.on('job:warning', warningHandler);

      const recovered = await (service as any).loadJobState(jobId);

      expect(recovered).toBeNull();
      expect(warningHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId,
        warning: expect.stringContaining('Invalid job state'),
        action: 'creating-new-job'
      }));
    });
  });

  describe('Cleanup and Recovery', () => {
    it('should cleanup failed job artifacts', async () => {
      const job: ImportJob = {
        id: 'job-failed',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/failed.mp4',
        status: ImportJobStatus.FAILED,
        progress: 65,
        config: {},
        videoPath: '/tmp/failed.mp4',
        audioPath: '/tmp/failed.wav',
        tempFiles: ['/tmp/failed-thumb.jpg'],
        error: 'Processing failed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const unlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);
      const rmdirSpy = vi.spyOn(fs, 'rmdir').mockResolvedValue(undefined);

      await (service as any).cleanupJob(job);

      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/failed.mp4');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/failed.wav');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/failed-thumb.jpg');
    });

    it('should recover jobs after service restart', async () => {
      const persistedJobs = [
        {
          id: 'job-recover-1',
          status: ImportJobStatus.PROCESSING,
          progress: 45,
          lastHeartbeat: Date.now() - 300000 // 5 minutes ago
        },
        {
          id: 'job-recover-2',
          status: ImportJobStatus.DOWNLOADING,
          progress: 80,
          lastHeartbeat: Date.now() - 60000 // 1 minute ago
        }
      ];

      (fs.readdir as MockedFunction<typeof fs.readdir>).mockResolvedValue(
        ['job-recover-1.json', 'job-recover-2.json'] as any
      );

      (fs.readJson as MockedFunction<typeof fs.readJson>).mockImplementation((path) => {
        const filename = path.split('/').pop();
        if (filename === 'job-recover-1.json') return Promise.resolve(persistedJobs[0]);
        if (filename === 'job-recover-2.json') return Promise.resolve(persistedJobs[1]);
        return Promise.reject(new Error('File not found'));
      });

      const recoveredJobs = await (service as any).recoverJobs();

      expect(recoveredJobs).toHaveLength(2);
      expect(recoveredJobs[0].status).toBe(ImportJobStatus.QUEUED); // Stale job reset
      expect(recoveredJobs[1].status).toBe(ImportJobStatus.DOWNLOADING); // Recent job continues
    });
  });

  describe('Complex Error Chains', () => {
    it('should handle cascading service failures', async () => {
      const job: ImportJob = {
        id: 'job-cascade',
        source: VideoSourceType.YOUTUBE,
        sourceUrl: 'https://youtube.com/watch?v=cascade123',
        status: ImportJobStatus.PROCESSING,
        progress: 30,
        config: {
          enableTranscription: true,
          enableTranslation: true,
          targetLanguage: 'es'
        },
        videoPath: '/tmp/cascade.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // First: Audio extraction fails
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffmpeg')) {
          callback(new Error('Audio extraction failed'), '', '');
        }
      });

      // This should cascade to transcription failure
      const errorHandler = vi.fn();
      service.on('job:error', errorHandler);

      await (service as any).processJob(job);

      // Should have multiple errors in chain
      const errors = errorHandler.mock.calls.map(call => call[0]);
      expect(errors).toContainEqual(expect.objectContaining({
        phase: 'audio-extraction'
      }));
      expect(errors).toContainEqual(expect.objectContaining({
        phase: 'transcription',
        reason: 'no-audio-file'
      }));
    });

    it('should handle partial success with warnings', async () => {
      const job: ImportJob = {
        id: 'job-partial',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/partial.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 70,
        config: {
          enableTranscription: true,
          enableSmartCrop: true,
          enableHighlightDetection: true
        },
        videoPath: '/tmp/partial.mp4',
        audioPath: '/tmp/partial.wav',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock partial failures
      const warningHandler = vi.fn();
      const completionHandler = vi.fn();
      service.on('job:warning', warningHandler);
      service.on('job:completed', completionHandler);

      // Transcription works but highlight detection fails
      vi.spyOn(service as any, 'performTranscription').mockResolvedValue({
        transcript: [{ startTime: 0, endTime: 10, text: 'Test', confidence: 0.9 }]
      });

      vi.spyOn(service as any, 'detectHighlights').mockRejectedValue(
        new Error('Highlight detection service unavailable')
      );

      await (service as any).processJob(job);

      // Job should complete with warnings
      expect(completionHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        status: ImportJobStatus.COMPLETED,
        warnings: expect.arrayContaining([
          expect.stringContaining('Highlight detection failed')
        ])
      }));
    });
  });

  describe('Resource Exhaustion', () => {
    it('should handle system resource limits', async () => {
      // Mock system at capacity
      (os.freemem as MockedFunction<typeof os.freemem>).mockReturnValue(
        100 * 1024 * 1024 // Only 100MB free
      );

      (os.loadavg as MockedFunction<typeof os.loadavg>).mockReturnValue([
        15.5, 14.2, 13.8 // Very high load
      ]);

      const request: VideoImportRequest = {
        url: 'https://example.com/large-video.mp4',
        source: VideoSourceType.URL,
        config: {}
      };

      await expect(service.createImportJob(request)).rejects.toThrow(
        'System resources exhausted'
      );
    });

    it('should implement backpressure when overwhelmed', async () => {
      // Create many jobs rapidly
      const jobPromises = Array.from({ length: 50 }, (_, i) => 
        service.createImportJob({
          url: `https://example.com/video${i}.mp4`,
          source: VideoSourceType.URL,
          config: {}
        }).catch(err => ({ error: err.message }))
      );

      const results = await Promise.all(jobPromises);
      const failures = results.filter(r => 'error' in r);

      // Some jobs should be rejected due to backpressure
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[0]).toHaveProperty('error');
      expect(failures[0].error).toMatch(/backpressure|rate limit|capacity/i);
    });
  });
});