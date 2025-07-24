import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { ImportPipelineService } from '../ImportPipelineService';
import { VideoImportService } from '../VideoImportService';
import { OllamaService } from '../OllamaService';
import { TranscriptionService } from '../TranscriptionService';
import { TranslationService } from '../TranslationService';
import { EventBus } from '../../server/events/EventBus';
import {
  ImportJob,
  ImportJobStatus,
  VideoSourceType,
  VideoImportRequest
} from '../../types/import';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import { exec } from 'child_process';
import path from 'path';
import os from 'os';

// Mock modules
vi.mock('../VideoImportService');
vi.mock('../OllamaService');
vi.mock('../TranscriptionService');
vi.mock('../TranslationService');
vi.mock('../../server/events/EventBus');
vi.mock('fs-extra');
vi.mock('child_process');
vi.mock('os');
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('ImportPipelineService - Error Scenarios', () => {
  let service: ImportPipelineService;
  let mockVideoImportService: any;
  let mockOllamaService: any;
  let mockTranscriptionService: any;
  let mockTranslationService: any;
  let mockEventBus: any;
  const config = {
    dataDir: '/tmp/test',
    enableOllama: true,
    ollamaConfig: {
      baseUrl: 'http://localhost:11434',
      defaultModel: 'gemma3:12b'
    }
  };

  beforeEach(async () => {
    // Mock EventBus singleton
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    };
    (EventBus.getInstance as any).mockReturnValue(mockEventBus);

    // Mock VideoImportService
    mockVideoImportService = new EventEmitter();
    mockVideoImportService.createImportJob = vi.fn();
    mockVideoImportService.getJob = vi.fn();
    mockVideoImportService.getAllJobs = vi.fn();
    mockVideoImportService.cancelJob = vi.fn();
    mockVideoImportService.analyzeUrl = vi.fn();
    mockVideoImportService.updateJobStatus = vi.fn();
    mockVideoImportService.updateJobError = vi.fn();
    (VideoImportService as any).mockImplementation(() => mockVideoImportService);

    // Mock OllamaService
    mockOllamaService = {
      detectHighlights: vi.fn(),
      detectSceneBoundaries: vi.fn(),
      analyzeTranscript: vi.fn(),
      getAvailability: vi.fn().mockReturnValue(true),
      cleanup: vi.fn()
    };
    (OllamaService as any).mockImplementation(() => mockOllamaService);

    // Mock TranscriptionService
    mockTranscriptionService = {
      transcribe: vi.fn(),
      getAvailableProviders: vi.fn().mockReturnValue(['whisper', 'openai']),
      isProviderAvailable: vi.fn().mockReturnValue(true)
    };
    (TranscriptionService as any).mockImplementation(() => mockTranscriptionService);

    // Mock TranslationService
    mockTranslationService = {
      translate: vi.fn(),
      detectLanguage: vi.fn(),
      isLanguageSupported: vi.fn().mockReturnValue(true)
    };
    (TranslationService as any).mockImplementation(() => mockTranslationService);

    // Mock fs operations
    (fs.ensureDir as MockedFunction<typeof fs.ensureDir>).mockResolvedValue(undefined);
    (fs.readJson as MockedFunction<typeof fs.readJson>).mockResolvedValue({});
    (fs.writeJson as MockedFunction<typeof fs.writeJson>).mockResolvedValue(undefined);
    (fs.statSync as MockedFunction<typeof fs.statSync>).mockReturnValue({
      size: 1024 * 1024 * 100 // 100MB
    } as any);
    (fs.existsSync as MockedFunction<typeof fs.existsSync>).mockReturnValue(true);

    // Mock os
    (os.freemem as MockedFunction<typeof os.freemem>).mockReturnValue(4 * 1024 * 1024 * 1024); // 4GB

    service = new ImportPipelineService(config);
    await new Promise(resolve => setTimeout(resolve, 10)); // Allow initialization
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Network Failures', () => {
    it('should handle network timeout during download', async () => {
      const request: VideoImportRequest = {
        url: 'https://example.com/video.mp4',
        source: VideoSourceType.URL,
        config: {
          enableTranscription: true
        }
      };

      // Simulate network timeout
      mockVideoImportService.createImportJob.mockRejectedValue(
        Object.assign(new Error('ETIMEDOUT: Connection timed out'), {
          code: 'ETIMEDOUT',
          syscall: 'connect'
        })
      );

      await expect(service.startImport(request)).rejects.toThrow('ETIMEDOUT');
      expect(mockEventBus.emit).toHaveBeenCalledWith('import:error', expect.objectContaining({
        error: expect.stringContaining('ETIMEDOUT'),
        phase: 'initialization'
      }));
    });

    it('should handle DNS resolution failures', async () => {
      const request: VideoImportRequest = {
        url: 'https://nonexistent-domain-12345.com/video.mp4',
        source: VideoSourceType.URL
      };

      mockVideoImportService.createImportJob.mockRejectedValue(
        Object.assign(new Error('ENOTFOUND: getaddrinfo ENOTFOUND'), {
          code: 'ENOTFOUND',
          hostname: 'nonexistent-domain-12345.com'
        })
      );

      await expect(service.startImport(request)).rejects.toThrow('ENOTFOUND');
    });

    it('should handle connection refused errors', async () => {
      const request: VideoImportRequest = {
        url: 'http://localhost:9999/video.mp4',
        source: VideoSourceType.URL
      };

      mockVideoImportService.createImportJob.mockRejectedValue(
        Object.assign(new Error('ECONNREFUSED: Connection refused'), {
          code: 'ECONNREFUSED',
          port: 9999
        })
      );

      await expect(service.startImport(request)).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle network interruption during processing', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.YOUTUBE,
        sourceUrl: 'https://youtube.com/watch?v=test',
        status: ImportJobStatus.PROCESSING,
        progress: 50,
        config: { enableTranscription: true } as any,
        videoPath: '/tmp/video.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Simulate network interruption during transcription API call
      mockTranscriptionService.transcribe.mockRejectedValue(
        Object.assign(new Error('Network connection lost'), {
          code: 'ENETUNREACH'
        })
      );

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).continueProcessing(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Network connection lost'),
        phase: 'transcription'
      }));
    });
  });

  describe('Invalid Video Formats', () => {
    it('should handle unsupported video codec', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.av1',
        status: ImportJobStatus.PROCESSING,
        progress: 25,
        config: {} as any,
        videoPath: '/tmp/video.av1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock ffprobe to return unsupported codec
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffprobe')) {
          callback(
            new Error('Unsupported codec: av01.0.08M.08'),
            '',
            'Stream #0:0: Video: av1 (Main) (av01 / 0x31307661)'
          );
        }
      });

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).validateVideoFormat(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Unsupported codec'),
        phase: 'validation'
      }));
    });

    it('should handle invalid container format', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.xyz',
        status: ImportJobStatus.PROCESSING,
        progress: 25,
        config: {} as any,
        videoPath: '/tmp/video.xyz',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock file validation
      (fs.readFile as MockedFunction<typeof fs.readFile>).mockRejectedValue(
        new Error('Invalid data found when processing input')
      );

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).validateVideoFormat(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Invalid data'),
        phase: 'validation'
      }));
    });
  });

  describe('Corrupted Video Files', () => {
    it('should handle corrupted video header', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/corrupted.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 30,
        config: {} as any,
        videoPath: '/tmp/corrupted.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock ffmpeg to detect corrupted file
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffmpeg')) {
          callback(
            new Error('moov atom not found'),
            '',
            '[mov,mp4,m4a,3gp,3g2,mj2 @ 0x7f8b3c004200] moov atom not found'
          );
        }
      });

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).processVideo(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('moov atom not found'),
        phase: 'processing'
      }));
    });

    it('should handle incomplete video download', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/incomplete.mp4',
        status: ImportJobStatus.DOWNLOADING,
        progress: 85,
        config: {} as any,
        videoPath: '/tmp/incomplete.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock file size check showing incomplete download
      (fs.statSync as MockedFunction<typeof fs.statSync>).mockReturnValue({
        size: 1024 * 500 // 500KB (too small for a video)
      } as any);

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).validateDownloadedFile(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('incomplete download'),
        phase: 'validation'
      }));
    });
  });

  describe('Transcription Service Failures', () => {
    it('should handle transcription service unavailable', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 60,
        config: { enableTranscription: true } as any,
        videoPath: '/tmp/video.mp4',
        audioPath: '/tmp/audio.wav',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockTranscriptionService.isProviderAvailable.mockReturnValue(false);
      mockTranscriptionService.getAvailableProviders.mockReturnValue([]);

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).transcribeAudio(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('No transcription providers available'),
        phase: 'transcription'
      }));
    });

    it('should handle transcription API rate limit', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 60,
        config: { enableTranscription: true } as any,
        videoPath: '/tmp/video.mp4',
        audioPath: '/tmp/audio.wav',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockTranscriptionService.transcribe.mockRejectedValue(
        Object.assign(new Error('Rate limit exceeded'), {
          statusCode: 429,
          retryAfter: 60
        })
      );

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).transcribeAudio(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Rate limit exceeded'),
        phase: 'transcription',
        retryable: true
      }));
    });

    it('should handle transcription timeout', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/long-video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 60,
        config: { enableTranscription: true } as any,
        videoPath: '/tmp/long-video.mp4',
        audioPath: '/tmp/long-audio.wav',
        metadata: { duration: 7200 }, // 2 hours
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Simulate timeout
      mockTranscriptionService.transcribe.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Transcription timeout after 300000ms'));
          }, 100);
        });
      });

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).transcribeAudio(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Transcription timeout'),
        phase: 'transcription'
      }));
    });
  });

  describe('Translation API Errors', () => {
    it('should handle translation service authentication failure', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 70,
        config: { targetLanguage: 'es' } as any,
        videoPath: '/tmp/video.mp4',
        transcript: [
          { startTime: 0, endTime: 10, text: 'Hello world', confidence: 0.95 }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockTranslationService.translate.mockRejectedValue(
        Object.assign(new Error('Invalid API key'), {
          statusCode: 401
        })
      );

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).translateTranscript(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Invalid API key'),
        phase: 'translation'
      }));
    });

    it('should handle unsupported language pair', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 70,
        config: { targetLanguage: 'xyz' } as any,
        videoPath: '/tmp/video.mp4',
        transcript: [
          { startTime: 0, endTime: 10, text: 'Hello world', confidence: 0.95 }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockTranslationService.isLanguageSupported.mockReturnValue(false);

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).translateTranscript(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Unsupported language'),
        phase: 'translation'
      }));
    });
  });

  describe('Disk Space Issues', () => {
    it('should handle insufficient disk space before download', async () => {
      const request: VideoImportRequest = {
        url: 'https://example.com/large-video.mp4',
        source: VideoSourceType.URL
      };

      // Mock disk space check
      (fs.statfs as any) = vi.fn().mockResolvedValue({
        available: 1024 * 1024 * 100 // 100MB available
      });

      // Mock video size estimation
      mockVideoImportService.analyzeUrl.mockResolvedValue({
        estimatedSize: 1024 * 1024 * 1024 * 5 // 5GB video
      });

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await expect(service.startImport(request)).rejects.toThrow('Insufficient disk space');
    });

    it('should handle disk full during processing', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 40,
        config: {} as any,
        videoPath: '/tmp/video.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock ffmpeg failing due to disk space
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffmpeg')) {
          callback(
            Object.assign(new Error('No space left on device'), {
              code: 'ENOSPC'
            }),
            '',
            'Error writing output file: No space left on device'
          );
        }
      });

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).processVideo(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('No space left on device'),
        phase: 'processing',
        code: 'ENOSPC'
      }));
    });

    it('should cleanup temporary files on disk space error', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 40,
        config: {} as any,
        videoPath: '/tmp/video.mp4',
        audioPath: '/tmp/audio.wav',
        tempFiles: ['/tmp/segment1.mp4', '/tmp/segment2.mp4'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock disk space error
      (fs.writeFile as MockedFunction<typeof fs.writeFile>).mockRejectedValue(
        Object.assign(new Error('ENOSPC: no space left on device'), {
          code: 'ENOSPC'
        })
      );

      const unlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      await (service as any).handleDiskSpaceError(job);

      // Verify cleanup was attempted
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/segment1.mp4');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/segment2.mp4');
    });
  });

  describe('Memory Exhaustion Scenarios', () => {
    it('should handle out of memory during video processing', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/4k-video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 45,
        config: {} as any,
        videoPath: '/tmp/4k-video.mp4',
        metadata: { width: 3840, height: 2160 }, // 4K video
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock low memory
      (os.freemem as MockedFunction<typeof os.freemem>).mockReturnValue(
        1024 * 1024 * 50 // Only 50MB free
      );

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).checkMemoryBeforeProcessing(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Insufficient memory'),
        phase: 'pre-processing',
        requiredMemory: expect.any(Number),
        availableMemory: expect.any(Number)
      }));
    });

    it('should handle memory allocation failure', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 50,
        config: {} as any,
        videoPath: '/tmp/video.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock buffer allocation failure
      const originalBuffer = global.Buffer;
      global.Buffer.allocUnsafe = vi.fn().mockImplementation(() => {
        throw new Error('Cannot allocate memory');
      });

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).allocateProcessingBuffer(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Cannot allocate memory'),
        phase: 'memory-allocation'
      }));

      // Restore original Buffer
      global.Buffer = originalBuffer;
    });
  });

  describe('Concurrent Job Failures', () => {
    it('should handle resource contention between concurrent jobs', async () => {
      const jobs = Array.from({ length: 5 }, (_, i) => ({
        id: `job-${i}`,
        source: VideoSourceType.URL,
        sourceUrl: `https://example.com/video${i}.mp4`,
        status: ImportJobStatus.PROCESSING,
        progress: 30 + i * 10,
        config: {} as any,
        videoPath: `/tmp/video${i}.mp4`,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      // Simulate resource lock failure
      const lockAcquired = new Set<string>();
      const processWithLock = async (job: ImportJob) => {
        if (lockAcquired.size >= 2) {
          throw new Error('Resource lock timeout: Too many concurrent operations');
        }
        lockAcquired.add(job.id);
        await new Promise(resolve => setTimeout(resolve, 100));
        lockAcquired.delete(job.id);
      };

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      // Process all jobs concurrently
      await Promise.allSettled(
        jobs.map(job => processWithLock(job).catch(err => {
          errorHandler({
            jobId: job.id,
            error: err.message,
            phase: 'concurrent-processing'
          });
        }))
      );

      // At least some jobs should fail due to resource contention
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('Resource lock timeout'),
        phase: 'concurrent-processing'
      }));
    });

    it('should handle port conflicts for parallel ffmpeg instances', async () => {
      const jobs = Array.from({ length: 3 }, (_, i) => ({
        id: `job-${i}`,
        source: VideoSourceType.URL,
        sourceUrl: `https://example.com/video${i}.mp4`,
        status: ImportJobStatus.PROCESSING,
        progress: 40,
        config: { enableTranscription: true } as any,
        videoPath: `/tmp/video${i}.mp4`,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const usedPorts = new Set<number>();
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffmpeg') && command.includes('-listen 1')) {
          const portMatch = command.match(/-listen 1 -f mpegts tcp:\/\/0\.0\.0\.0:(\d+)/);
          if (portMatch) {
            const port = parseInt(portMatch[1]);
            if (usedPorts.has(port)) {
              callback(
                new Error(`bind: Address already in use (port ${port})`),
                '',
                `[tcp @ 0x7f8b3c004200] bind: Address already in use`
              );
            } else {
              usedPorts.add(port);
              setTimeout(() => {
                usedPorts.delete(port);
                callback(null, 'Success', '');
              }, 100);
            }
          }
        } else {
          callback(null, '', '');
        }
      });

      const results = await Promise.allSettled(
        jobs.map(job => (service as any).processVideoWithFFmpeg(job))
      );

      const failures = results.filter(r => r.status === 'rejected');
      expect(failures.length).toBeGreaterThan(0);
    });
  });

  describe('Timeout Handling', () => {
    it('should handle download timeout', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://slow-server.com/large-video.mp4',
        status: ImportJobStatus.DOWNLOADING,
        progress: 15,
        config: { downloadTimeout: 30000 } as any, // 30 second timeout
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Simulate slow download that exceeds timeout
      const downloadPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Download timeout exceeded: 30000ms'));
        }, 100);
      });

      mockVideoImportService.downloadVideo = vi.fn().mockReturnValue(downloadPromise);

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await expect((service as any).downloadVideo(job)).rejects.toThrow('Download timeout exceeded');

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('Download timeout exceeded'),
        phase: 'download',
        timeout: 30000
      }));
    });

    it('should handle processing timeout with cleanup', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 60,
        config: { processingTimeout: 60000 } as any, // 60 second timeout
        videoPath: '/tmp/video.mp4',
        audioPath: '/tmp/audio.wav',
        tempFiles: ['/tmp/temp1.mp4', '/tmp/temp2.mp4'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Create a processing function that times out
      const processWithTimeout = async () => {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Processing timeout: Operation exceeded 60000ms'));
          }, 100);
        });

        const processingPromise = new Promise(resolve => {
          setTimeout(resolve, 200); // Simulates long processing
        });

        return Promise.race([processingPromise, timeoutPromise]);
      };

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      const unlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      await expect(processWithTimeout()).rejects.toThrow('Processing timeout');

      // Simulate cleanup after timeout
      await (service as any).cleanupAfterTimeout(job);

      // Verify temporary files were cleaned up
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/temp1.mp4');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/temp2.mp4');
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should implement retry logic for transient failures', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 50,
        config: { maxRetries: 3, retryDelay: 1000 } as any,
        videoPath: '/tmp/video.mp4',
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      let attemptCount = 0;
      mockTranscriptionService.transcribe.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Temporary service unavailable'));
        }
        return Promise.resolve({
          segments: [
            { startTime: 0, endTime: 10, text: 'Success after retry', confidence: 0.95 }
          ]
        });
      });

      const result = await (service as any).transcribeWithRetry(job);

      expect(attemptCount).toBe(3);
      expect(result.segments).toHaveLength(1);
      expect(mockVideoImportService.updateJobStatus).toHaveBeenCalledWith(
        job.id,
        expect.objectContaining({ retryCount: 2 })
      );
    });

    it('should implement exponential backoff for retries', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 50,
        config: { 
          maxRetries: 4,
          retryDelay: 1000,
          backoffMultiplier: 2
        } as any,
        videoPath: '/tmp/video.mp4',
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const delays: number[] = [];
      let lastAttemptTime = Date.now();

      mockTranslationService.translate.mockImplementation(() => {
        const now = Date.now();
        delays.push(now - lastAttemptTime);
        lastAttemptTime = now;
        
        if (delays.length < 4) {
          return Promise.reject(new Error('Service temporarily unavailable'));
        }
        return Promise.resolve({ translatedText: 'Success' });
      });

      await (service as any).translateWithExponentialBackoff(job);

      // Verify exponential backoff pattern (accounting for timing variations)
      expect(delays[1]).toBeGreaterThanOrEqual(900); // ~1000ms
      expect(delays[2]).toBeGreaterThanOrEqual(1800); // ~2000ms
      expect(delays[3]).toBeGreaterThanOrEqual(3600); // ~4000ms
    });

    it('should save job state for recovery after crash', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 65,
        config: {} as any,
        videoPath: '/tmp/video.mp4',
        audioPath: '/tmp/audio.wav',
        transcript: [
          { startTime: 0, endTime: 10, text: 'Partial transcript', confidence: 0.95 }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const stateFile = path.join(config.dataDir, 'jobs', `${job.id}.state.json`);
      const writeJsonSpy = vi.spyOn(fs, 'writeJson');

      await (service as any).saveJobState(job);

      expect(writeJsonSpy).toHaveBeenCalledWith(
        stateFile,
        expect.objectContaining({
          job,
          checkpoint: expect.any(String),
          timestamp: expect.any(Number)
        }),
        { spaces: 2 }
      );
    });

    it('should recover from saved state after restart', async () => {
      const savedState = {
        job: {
          id: 'job-123',
          source: VideoSourceType.URL,
          sourceUrl: 'https://example.com/video.mp4',
          status: ImportJobStatus.PROCESSING,
          progress: 65,
          config: {} as any,
          videoPath: '/tmp/video.mp4',
          audioPath: '/tmp/audio.wav',
          transcript: [
            { startTime: 0, endTime: 10, text: 'Partial transcript', confidence: 0.95 }
          ],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:10:00Z'
        },
        checkpoint: 'transcription_complete',
        timestamp: Date.now() - 5000 // 5 seconds ago
      };

      const stateFile = path.join(config.dataDir, 'jobs', 'job-123.state.json');
      (fs.readJson as MockedFunction<typeof fs.readJson>).mockResolvedValue(savedState);

      const recovered = await (service as any).recoverJobFromState('job-123');

      expect(recovered).toMatchObject({
        job: expect.objectContaining({
          id: 'job-123',
          progress: 65
        }),
        checkpoint: 'transcription_complete'
      });
    });
  });

  describe('Partial Failure Handling', () => {
    it('should handle partial transcription failure', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 60,
        config: { enableTranscription: true } as any,
        videoPath: '/tmp/video.mp4',
        audioPath: '/tmp/audio.wav',
        metadata: { duration: 300 }, // 5 minutes
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock partial transcription success
      mockTranscriptionService.transcribe.mockResolvedValue({
        segments: [
          { startTime: 0, endTime: 60, text: 'First minute transcribed', confidence: 0.95 },
          { startTime: 60, endTime: 120, text: 'Second minute transcribed', confidence: 0.93 }
          // Missing segments from 120-300 seconds
        ],
        warnings: ['Transcription incomplete: Audio corrupted after 120s']
      });

      const warnHandler = vi.fn();
      service.on('import:warning', warnHandler);

      const result = await (service as any).transcribeAudio(job);

      expect(result.segments).toHaveLength(2);
      expect(warnHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        warning: expect.stringContaining('Transcription incomplete'),
        phase: 'transcription',
        partialResult: true
      }));
    });

    it('should handle partial highlight detection failure', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 75,
        config: { enableHighlightDetection: true } as any,
        videoPath: '/tmp/video.mp4',
        transcript: [
          { startTime: 0, endTime: 60, text: 'First segment', confidence: 0.95 },
          { startTime: 60, endTime: 120, text: 'Second segment', confidence: 0.95 },
          { startTime: 120, endTime: 180, text: 'Third segment', confidence: 0.95 }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock Ollama partially failing
      mockOllamaService.detectHighlights.mockImplementation((segments) => {
        if (segments.length > 2) {
          throw new Error('Context length exceeded');
        }
        return Promise.resolve([
          {
            startTime: 0,
            endTime: 60,
            score: 0.85,
            title: 'Highlight 1',
            description: 'First highlight'
          }
        ]);
      });

      const warnHandler = vi.fn();
      service.on('import:warning', warnHandler);

      const result = await (service as any).detectHighlightsWithFallback(job);

      expect(result.highlights).toHaveLength(1);
      expect(warnHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        warning: expect.stringContaining('Partial highlight detection'),
        phase: 'analysis'
      }));
    });
  });

  describe('Cleanup After Failures', () => {
    it('should cleanup all temporary files on job failure', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.FAILED,
        progress: 45,
        config: {} as any,
        videoPath: '/tmp/video.mp4',
        audioPath: '/tmp/audio.wav',
        tempFiles: [
          '/tmp/segment1.mp4',
          '/tmp/segment2.mp4',
          '/tmp/thumbnail.jpg'
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        error: 'Processing failed'
      };

      const unlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);
      const rmdirSpy = vi.spyOn(fs, 'rmdir').mockResolvedValue(undefined);

      await (service as any).cleanupFailedJob(job);

      // Verify all files were attempted to be deleted
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/video.mp4');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/audio.wav');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/segment1.mp4');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/segment2.mp4');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/thumbnail.jpg');

      // Verify job directory cleanup
      expect(rmdirSpy).toHaveBeenCalledWith(
        path.join(config.dataDir, 'jobs', job.id),
        { recursive: true }
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.FAILED,
        progress: 45,
        config: {} as any,
        videoPath: '/tmp/video.mp4',
        audioPath: '/tmp/audio.wav',
        tempFiles: ['/tmp/locked-file.mp4'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock file deletion failure
      const unlinkSpy = vi.spyOn(fs, 'unlink').mockImplementation((path) => {
        if (path === '/tmp/locked-file.mp4') {
          return Promise.reject(new Error('EBUSY: resource busy'));
        }
        return Promise.resolve(undefined);
      });

      const warnHandler = vi.fn();
      service.on('import:warning', warnHandler);

      await (service as any).cleanupFailedJob(job);

      expect(warnHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        warning: expect.stringContaining('Failed to delete'),
        file: '/tmp/locked-file.mp4'
      }));

      // Other files should still be attempted
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/video.mp4');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/audio.wav');
    });

    it('should cleanup orphaned files on service shutdown', async () => {
      // Mock finding orphaned files
      const globSpy = vi.fn().mockResolvedValue([
        '/tmp/orphaned-video-1.mp4',
        '/tmp/orphaned-audio-2.wav',
        '/tmp/orphaned-segment-3.mp4'
      ]);
      (service as any).findOrphanedFiles = globSpy;

      const unlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      await service.cleanup();

      // Verify orphaned files were cleaned up
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/orphaned-video-1.mp4');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/orphaned-audio-2.wav');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/orphaned-segment-3.mp4');
    });
  });

  describe('Complex Error Scenarios', () => {
    it('should handle cascading failures across services', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 50,
        config: {
          enableTranscription: true,
          enableTranslation: true,
          targetLanguage: 'es',
          enableHighlightDetection: true
        } as any,
        videoPath: '/tmp/video.mp4',
        audioPath: '/tmp/audio.wav',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // First service fails
      mockTranscriptionService.transcribe.mockRejectedValue(
        new Error('Transcription service down')
      );

      // This causes translation to fail (no transcript)
      mockTranslationService.translate.mockRejectedValue(
        new Error('No transcript to translate')
      );

      // This causes highlight detection to fail (no transcript)
      mockOllamaService.detectHighlights.mockRejectedValue(
        new Error('No transcript for analysis')
      );

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).processImportPipeline(job);

      // Should have multiple error events
      expect(errorHandler).toHaveBeenCalledTimes(3);
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'transcription'
      }));
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'translation'
      }));
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'analysis'
      }));
    });

    it('should handle race condition in concurrent file access', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 70,
        config: {} as any,
        videoPath: '/tmp/shared-video.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Simulate file being deleted by another process
      let fileExists = true;
      (fs.existsSync as MockedFunction<typeof fs.existsSync>).mockImplementation((path) => {
        if (path === '/tmp/shared-video.mp4') {
          const exists = fileExists;
          fileExists = false; // File gets deleted after first check
          return exists;
        }
        return true;
      });

      (fs.readFile as MockedFunction<typeof fs.readFile>).mockRejectedValue(
        Object.assign(new Error('ENOENT: no such file or directory'), {
          code: 'ENOENT',
          path: '/tmp/shared-video.mp4'
        })
      );

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).processVideoFile(job);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining('ENOENT'),
        phase: 'file-access',
        recoverable: false
      }));
    });
  });
});