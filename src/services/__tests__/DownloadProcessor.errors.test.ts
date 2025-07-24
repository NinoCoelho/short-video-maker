import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { DownloadProcessor } from '../DownloadProcessor';
import { QueueService } from '../QueueService';
import { StatusService } from '../StatusService';
import {
  DownloadQueueItem,
  DownloadItemStatus,
  DownloadSourceType,
  DownloadItemType
} from '../../types/import';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { Readable, Transform } from 'stream';
import axios from 'axios';
import os from 'os';

// Mock modules
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

describe('DownloadProcessor - Error Scenarios', () => {
  let processor: DownloadProcessor;
  let queueService: QueueService;
  let statusService: StatusService;
  const tempDir = '/tmp/downloads';
  const outputDir = '/data/videos';

  beforeEach(() => {
    // Initialize services
    queueService = new QueueService();
    statusService = new StatusService();
    processor = new DownloadProcessor(queueService, statusService, {
      tempDir,
      outputDir,
      maxConcurrentDownloads: 2,
      retryAttempts: 3,
      retryDelay: 1000
    });

    // Mock fs operations
    (fs.ensureDir as MockedFunction<typeof fs.ensureDir>).mockResolvedValue(undefined);
    (fs.existsSync as MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
    (fs.statSync as MockedFunction<typeof fs.statSync>).mockReturnValue({
      size: 1024 * 1024 * 100 // 100MB default
    } as any);

    // Mock axios defaults
    (axios.get as MockedFunction<typeof axios.get>).mockResolvedValue({
      data: Buffer.from('mock video data'),
      headers: { 'content-length': '104857600' }, // 100MB
      status: 200
    });

    // Mock os
    (os.freemem as MockedFunction<typeof os.freemem>).mockReturnValue(4 * 1024 * 1024 * 1024); // 4GB
    (os.tmpdir as MockedFunction<typeof os.tmpdir>).mockReturnValue('/tmp');
  });

  afterEach(() => {
    vi.clearAllMocks();
    processor.shutdown();
  });

  describe('Network Failures During Download', () => {
    it('should handle connection timeout', async () => {
      const item: DownloadQueueItem = {
        id: 'download-1',
        url: 'https://slow-server.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.QUEUED,
        progress: 0,
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Mock axios timeout
      (axios.get as MockedFunction<typeof axios.get>).mockRejectedValue(
        Object.assign(new Error('timeout of 30000ms exceeded'), {
          code: 'ECONNABORTED',
          config: { url: item.url }
        })
      );

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('timeout'),
        code: 'ECONNABORTED',
        retryable: true
      }));
    });

    it('should handle connection reset during download', async () => {
      const item: DownloadQueueItem = {
        id: 'download-2',
        url: 'https://unstable-server.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.DOWNLOADING,
        progress: 45,
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Create a mock stream that fails midway
      const mockStream = new Readable({
        read() {
          if (this.readableLength < 50 * 1024 * 1024) {
            this.push(Buffer.alloc(1024 * 1024)); // Push 1MB chunks
          } else {
            this.destroy(new Error('ECONNRESET: Connection reset by peer'));
          }
        }
      });

      (axios.get as MockedFunction<typeof axios.get>).mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '104857600' }, // 100MB
        status: 200
      });

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('ECONNRESET'),
        progress: expect.any(Number),
        retryable: true
      }));
    });

    it('should handle SSL/TLS errors', async () => {
      const item: DownloadQueueItem = {
        id: 'download-3',
        url: 'https://bad-ssl.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.QUEUED,
        progress: 0,
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      (axios.get as MockedFunction<typeof axios.get>).mockRejectedValue(
        Object.assign(new Error('certificate has expired'), {
          code: 'CERT_HAS_EXPIRED',
          host: 'bad-ssl.com'
        })
      );

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('certificate has expired'),
        code: 'CERT_HAS_EXPIRED',
        retryable: false // SSL errors are not retryable
      }));
    });

    it('should handle HTTP error responses', async () => {
      const testCases = [
        { status: 403, text: 'Forbidden', retryable: false },
        { status: 404, text: 'Not Found', retryable: false },
        { status: 429, text: 'Too Many Requests', retryable: true },
        { status: 500, text: 'Internal Server Error', retryable: true },
        { status: 503, text: 'Service Unavailable', retryable: true }
      ];

      for (const testCase of testCases) {
        const item: DownloadQueueItem = {
          id: `download-http-${testCase.status}`,
          url: `https://example.com/video-${testCase.status}.mp4`,
          type: DownloadItemType.VIDEO,
          source: DownloadSourceType.URL,
          status: DownloadItemStatus.QUEUED,
          progress: 0,
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        queueService.addItem(item);

        (axios.get as MockedFunction<typeof axios.get>).mockRejectedValue(
          Object.assign(new Error(`Request failed with status code ${testCase.status}`), {
            response: {
              status: testCase.status,
              statusText: testCase.text,
              headers: testCase.status === 429 ? { 'retry-after': '60' } : {}
            }
          })
        );

        const errorHandler = vi.fn();
        processor.on('download:error', errorHandler);

        processor.start();
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
          itemId: item.id,
          error: expect.stringContaining(`${testCase.status}`),
          httpStatus: testCase.status,
          retryable: testCase.retryable,
          ...(testCase.status === 429 ? { retryAfter: 60 } : {})
        }));

        processor.stop();
        errorHandler.mockClear();
      }
    });
  });

  describe('Invalid Video Formats', () => {
    it('should detect invalid MIME types', async () => {
      const item: DownloadQueueItem = {
        id: 'download-4',
        url: 'https://example.com/not-a-video.html',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.QUEUED,
        progress: 0,
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      (axios.get as MockedFunction<typeof axios.get>).mockResolvedValue({
        data: '<html><body>Not a video</body></html>',
        headers: { 
          'content-type': 'text/html',
          'content-length': '38'
        },
        status: 200
      });

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('Invalid content type'),
        contentType: 'text/html',
        expectedType: 'video/*'
      }));
    });

    it('should validate video file headers', async () => {
      const item: DownloadQueueItem = {
        id: 'download-5',
        url: 'https://example.com/fake-video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.QUEUED,
        progress: 0,
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Mock a file that claims to be video but has wrong magic bytes
      const fakeVideoData = Buffer.from('GIF89a...'); // GIF header instead of MP4

      (axios.get as MockedFunction<typeof axios.get>).mockResolvedValue({
        data: fakeVideoData,
        headers: { 
          'content-type': 'video/mp4',
          'content-length': fakeVideoData.length.toString()
        },
        status: 200
      });

      // Mock file type detection
      const validateFileSpy = vi.spyOn(processor as any, 'validateFileType')
        .mockRejectedValue(new Error('File signature does not match video format'));

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('File signature does not match'),
        phase: 'validation'
      }));
    });
  });

  describe('Corrupted Video Files', () => {
    it('should detect truncated downloads', async () => {
      const item: DownloadQueueItem = {
        id: 'download-6',
        url: 'https://example.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.DOWNLOADING,
        progress: 75,
        expectedSize: 104857600, // 100MB expected
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Mock incomplete download
      const incompleteData = Buffer.alloc(50 * 1024 * 1024); // Only 50MB

      (axios.get as MockedFunction<typeof axios.get>).mockResolvedValue({
        data: incompleteData,
        headers: { 
          'content-length': '104857600',
          'content-type': 'video/mp4'
        },
        status: 200
      });

      (fs.statSync as MockedFunction<typeof fs.statSync>).mockReturnValue({
        size: incompleteData.length
      } as any);

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('Incomplete download'),
        expectedSize: 104857600,
        actualSize: incompleteData.length,
        phase: 'post-download-validation'
      }));
    });

    it('should detect corrupted video streams', async () => {
      const item: DownloadQueueItem = {
        id: 'download-7',
        url: 'https://example.com/corrupted-stream.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.VALIDATING,
        progress: 100,
        tempPath: '/tmp/downloads/corrupted-stream.mp4',
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Mock ffprobe validation failure
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffprobe')) {
          callback(
            new Error('Invalid data found when processing input'),
            '',
            '[mov,mp4,m4a,3gp,3g2,mj2 @ 0x7f8b3c004200] Invalid stream index'
          );
        }
      });

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      await (processor as any).validateVideoIntegrity(item);

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('Invalid data found'),
        phase: 'integrity-check',
        corruption: true
      }));
    });
  });

  describe('Disk Space Issues', () => {
    it('should check disk space before download', async () => {
      const item: DownloadQueueItem = {
        id: 'download-8',
        url: 'https://example.com/huge-video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.QUEUED,
        progress: 0,
        expectedSize: 10 * 1024 * 1024 * 1024, // 10GB
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Mock low disk space
      const checkDiskSpaceSpy = vi.spyOn(processor as any, 'checkDiskSpace')
        .mockResolvedValue({
          available: 1 * 1024 * 1024 * 1024, // Only 1GB available
          required: 10 * 1024 * 1024 * 1024,
          sufficient: false
        });

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('Insufficient disk space'),
        availableSpace: 1 * 1024 * 1024 * 1024,
        requiredSpace: 10 * 1024 * 1024 * 1024,
        phase: 'pre-download'
      }));
    });

    it('should handle disk full during write', async () => {
      const item: DownloadQueueItem = {
        id: 'download-9',
        url: 'https://example.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.DOWNLOADING,
        progress: 60,
        tempPath: '/tmp/downloads/video.mp4',
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Create a mock stream that writes successfully at first, then fails
      const mockWriteStream = new Transform({
        transform(chunk, encoding, callback) {
          if (this.writtenBytes > 50 * 1024 * 1024) {
            callback(Object.assign(new Error('ENOSPC: no space left on device'), {
              code: 'ENOSPC',
              syscall: 'write'
            }));
          } else {
            this.writtenBytes = (this.writtenBytes || 0) + chunk.length;
            callback(null, chunk);
          }
        }
      });

      (fs.createWriteStream as MockedFunction<typeof fs.createWriteStream>)
        .mockReturnValue(mockWriteStream as any);

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('ENOSPC'),
        code: 'ENOSPC',
        phase: 'download-write'
      }));
    });
  });

  describe('Memory Exhaustion', () => {
    it('should prevent memory exhaustion with large downloads', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `download-mem-${i}`,
        url: `https://example.com/huge-video-${i}.mp4`,
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.QUEUED,
        progress: 0,
        expectedSize: 2 * 1024 * 1024 * 1024, // 2GB each
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      items.forEach(item => queueService.addItem(item));

      // Mock low memory
      (os.freemem as MockedFunction<typeof os.freemem>).mockReturnValue(
        500 * 1024 * 1024 // Only 500MB free
      );

      const errorHandler = vi.fn();
      const warningHandler = vi.fn();
      processor.on('download:error', errorHandler);
      processor.on('download:warning', warningHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should pause downloads when memory is low
      expect(warningHandler).toHaveBeenCalledWith(expect.objectContaining({
        warning: expect.stringContaining('Low memory'),
        action: 'pausing-downloads',
        freeMemory: 500 * 1024 * 1024
      }));
    });

    it('should use streaming to prevent memory buffer overflow', async () => {
      const item: DownloadQueueItem = {
        id: 'download-10',
        url: 'https://example.com/stream-video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.DOWNLOADING,
        progress: 0,
        expectedSize: 5 * 1024 * 1024 * 1024, // 5GB
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Verify streaming is used for large files
      const streamingSpy = vi.spyOn(processor as any, 'downloadWithStreaming');

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(streamingSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: item.id,
          expectedSize: 5 * 1024 * 1024 * 1024
        })
      );
    });
  });

  describe('Concurrent Job Failures', () => {
    it('should handle port conflicts for parallel downloads', async () => {
      const items = Array.from({ length: 3 }, (_, i) => ({
        id: `download-concurrent-${i}`,
        url: `https://example.com/video-${i}.mp4`,
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.QUEUED,
        progress: 0,
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      items.forEach(item => queueService.addItem(item));

      // Mock port binding conflicts
      let portsInUse = new Set<number>();
      const bindPortSpy = vi.spyOn(processor as any, 'bindProgressPort')
        .mockImplementation((port: number) => {
          if (portsInUse.has(port)) {
            throw Object.assign(new Error('EADDRINUSE: address already in use'), {
              code: 'EADDRINUSE',
              port
            });
          }
          portsInUse.add(port);
          return { close: () => portsInUse.delete(port) };
        });

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Some downloads should fail due to port conflicts
      const portErrors = errorHandler.mock.calls.filter(call => 
        call[0].error.includes('EADDRINUSE')
      );
      expect(portErrors.length).toBeGreaterThan(0);
    });

    it('should handle resource locks between concurrent downloads', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `download-lock-${i}`,
        url: `https://example.com/video-${i}.mp4`,
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.QUEUED,
        progress: 0,
        outputPath: '/data/videos/same-video.mp4', // All trying to write to same file
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      items.forEach(item => queueService.addItem(item));

      // Mock file locking
      const fileLocks = new Set<string>();
      (fs.open as MockedFunction<typeof fs.open>).mockImplementation(async (path, flags) => {
        if (flags.includes('x') && fileLocks.has(path)) {
          throw Object.assign(new Error('EEXIST: file already exists'), {
            code: 'EEXIST',
            path
          });
        }
        fileLocks.add(path);
        return { close: () => fileLocks.delete(path) };
      });

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Most downloads should fail due to file conflicts
      const fileErrors = errorHandler.mock.calls.filter(call => 
        call[0].error.includes('EEXIST')
      );
      expect(fileErrors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Timeout Handling', () => {
    it('should enforce download timeout', async () => {
      const item: DownloadQueueItem = {
        id: 'download-timeout-1',
        url: 'https://slow-server.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.DOWNLOADING,
        progress: 15,
        config: { downloadTimeout: 5000 }, // 5 second timeout
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Mock slow download that exceeds timeout
      const slowStream = new Readable({
        read() {
          // Emit data very slowly
          setTimeout(() => {
            this.push(Buffer.alloc(1024)); // 1KB per second
          }, 1000);
        }
      });

      (axios.get as MockedFunction<typeof axios.get>).mockResolvedValue({
        data: slowStream,
        headers: { 'content-length': '104857600' }, // 100MB
        status: 200
      });

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 6000));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('Download timeout'),
        timeout: 5000,
        phase: 'download'
      }));
    });

    it('should handle stalled downloads', async () => {
      const item: DownloadQueueItem = {
        id: 'download-stall-1',
        url: 'https://unstable-server.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.DOWNLOADING,
        progress: 30,
        config: { stallTimeout: 10000 }, // 10 second stall timeout
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Mock stream that stalls after initial data
      const stalledStream = new Readable({
        read() {
          if (this.bytesRead < 10 * 1024 * 1024) {
            this.push(Buffer.alloc(1024 * 1024)); // 1MB chunks
            this.bytesRead = (this.bytesRead || 0) + 1024 * 1024;
          }
          // Then stall indefinitely
        }
      });

      (axios.get as MockedFunction<typeof axios.get>).mockResolvedValue({
        data: stalledStream,
        headers: { 'content-length': '104857600' }, // 100MB
        status: 200
      });

      const errorHandler = vi.fn();
      processor.on('download:error', errorHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 12000));

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        error: expect.stringContaining('Download stalled'),
        lastProgress: expect.any(Number),
        stallDuration: expect.any(Number)
      }));
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should implement resume capability for partial downloads', async () => {
      const item: DownloadQueueItem = {
        id: 'download-resume-1',
        url: 'https://example.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.DOWNLOADING,
        progress: 50,
        downloadedBytes: 52428800, // 50MB already downloaded
        expectedSize: 104857600, // 100MB total
        tempPath: '/tmp/downloads/video.mp4.part',
        config: { resumable: true },
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Mock existing partial file
      (fs.existsSync as MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
      (fs.statSync as MockedFunction<typeof fs.statSync>).mockReturnValue({
        size: 52428800 // 50MB
      } as any);

      // Mock range request
      const axiosGetSpy = vi.mocked(axios.get);
      axiosGetSpy.mockImplementation((url, config) => {
        expect(config?.headers?.Range).toBe('bytes=52428800-');
        return Promise.resolve({
          data: Buffer.alloc(52428800), // Remaining 50MB
          headers: { 
            'content-length': '52428800',
            'content-range': 'bytes 52428800-104857599/104857600',
            'accept-ranges': 'bytes'
          },
          status: 206 // Partial content
        });
      });

      const progressHandler = vi.fn();
      processor.on('download:progress', progressHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify resume was attempted
      expect(axiosGetSpy).toHaveBeenCalledWith(
        item.url,
        expect.objectContaining({
          headers: expect.objectContaining({
            Range: 'bytes=52428800-'
          })
        })
      );
    });

    it('should fallback to full download if resume fails', async () => {
      const item: DownloadQueueItem = {
        id: 'download-resume-fail-1',
        url: 'https://example.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.DOWNLOADING,
        progress: 50,
        downloadedBytes: 52428800,
        expectedSize: 104857600,
        tempPath: '/tmp/downloads/video.mp4.part',
        config: { resumable: true },
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Mock server not supporting range requests
      let attemptCount = 0;
      (axios.get as MockedFunction<typeof axios.get>).mockImplementation((url, config) => {
        attemptCount++;
        if (attemptCount === 1 && config?.headers?.Range) {
          // First attempt with range fails
          return Promise.reject(Object.assign(
            new Error('Range not satisfiable'),
            { response: { status: 416 } }
          ));
        }
        // Fallback to full download
        return Promise.resolve({
          data: Buffer.alloc(104857600), // Full 100MB
          headers: { 'content-length': '104857600' },
          status: 200
        });
      });

      const warningHandler = vi.fn();
      processor.on('download:warning', warningHandler);

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(warningHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        warning: expect.stringContaining('Resume not supported'),
        action: 'full-download'
      }));

      expect(attemptCount).toBe(2); // Range attempt + full download
    });

    it('should save download state for recovery', async () => {
      const item: DownloadQueueItem = {
        id: 'download-state-1',
        url: 'https://example.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.DOWNLOADING,
        progress: 35,
        downloadedBytes: 36700160, // 35MB
        expectedSize: 104857600,
        tempPath: '/tmp/downloads/video.mp4.part',
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      const stateSaveSpy = vi.spyOn(processor as any, 'saveDownloadState');

      processor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify state is saved periodically during download
      expect(stateSaveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: item.id,
          progress: expect.any(Number),
          downloadedBytes: expect.any(Number),
          tempPath: item.tempPath
        })
      );
    });
  });

  describe('Cleanup After Failures', () => {
    it('should cleanup temporary files on failure', async () => {
      const item: DownloadQueueItem = {
        id: 'download-cleanup-1',
        url: 'https://example.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.FAILED,
        progress: 65,
        tempPath: '/tmp/downloads/video.mp4.part',
        error: 'Download failed',
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      const unlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);
      const rmdirSpy = vi.spyOn(fs, 'rmdir').mockResolvedValue(undefined);

      await (processor as any).cleanupFailedDownload(item);

      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/downloads/video.mp4.part');
      expect(rmdirSpy).toHaveBeenCalledWith(
        path.dirname('/tmp/downloads/video.mp4.part'),
        { recursive: false }
      );
    });

    it('should cleanup orphaned downloads on startup', async () => {
      // Mock finding orphaned files
      const orphanedFiles = [
        '/tmp/downloads/orphan1.mp4.part',
        '/tmp/downloads/orphan2.mp4.part',
        '/tmp/downloads/orphan3.mp4.part'
      ];

      (fs.readdir as MockedFunction<typeof fs.readdir>).mockResolvedValue(
        orphanedFiles.map(f => path.basename(f)) as any
      );

      const unlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      await (processor as any).cleanupOrphanedFiles();

      orphanedFiles.forEach(file => {
        expect(unlinkSpy).toHaveBeenCalledWith(file);
      });
    });

    it('should handle cleanup errors gracefully', async () => {
      const item: DownloadQueueItem = {
        id: 'download-cleanup-error-1',
        url: 'https://example.com/video.mp4',
        type: DownloadItemType.VIDEO,
        source: DownloadSourceType.URL,
        status: DownloadItemStatus.FAILED,
        progress: 50,
        tempPath: '/tmp/downloads/locked-file.mp4.part',
        error: 'Download failed',
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      queueService.addItem(item);

      // Mock file deletion failure
      (fs.unlink as MockedFunction<typeof fs.unlink>).mockRejectedValue(
        Object.assign(new Error('EBUSY: resource busy'), {
          code: 'EBUSY'
        })
      );

      const warningHandler = vi.fn();
      processor.on('download:warning', warningHandler);

      await (processor as any).cleanupFailedDownload(item);

      expect(warningHandler).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        warning: expect.stringContaining('Failed to cleanup'),
        error: expect.stringContaining('EBUSY')
      }));
    });
  });
});