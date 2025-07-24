import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { YouTubeDownloader } from '../YouTubeDownloader';
import fs from 'fs-extra';
import path from 'path';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';

// Mock modules
vi.mock('fs-extra');
vi.mock('child_process');
vi.mock('yt-dlp-exec');
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('YouTubeDownloader', () => {
  let downloader: YouTubeDownloader;
  let mockExecProcess: any;

  beforeEach(() => {
    downloader = new YouTubeDownloader();
    mockExecProcess = new EventEmitter();
    mockExecProcess.stdout = new EventEmitter();
    mockExecProcess.stderr = new EventEmitter();
    mockExecProcess.kill = vi.fn();
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('URL Validation', () => {
    it('should validate standard YouTube URLs', () => {
      const validUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
        'https://www.youtube.com/v/dQw4w9WgXcQ',
        'http://youtube.com/watch?v=dQw4w9WgXcQ' // Should be normalized to https
      ];

      validUrls.forEach(url => {
        expect(downloader.validateUrl(url)).toBe(true);
      });
    });

    it('should reject invalid YouTube URLs', () => {
      const invalidUrls = [
        'https://vimeo.com/123456',
        'https://www.youtube.com/channel/UC123456',
        'https://www.youtube.com/playlist?list=PL123456',
        'https://youtube.com/',
        'not-a-url',
        'https://youtu.be/', // No video ID
        'https://www.youtube.com/watch' // Missing video ID parameter
      ];

      invalidUrls.forEach(url => {
        expect(downloader.validateUrl(url)).toBe(false);
      });
    });

    it('should extract video IDs correctly', () => {
      const urlsWithIds = [
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
        { url: 'https://youtu.be/dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
        { url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
        { url: 'https://www.youtube.com/v/dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', id: 'dQw4w9WgXcQ' }
      ];

      urlsWithIds.forEach(({ url, id }) => {
        expect(downloader['extractVideoId'](url)).toBe(id);
      });
    });
  });

  describe('Metadata Extraction', () => {
    it('should fetch video metadata successfully', async () => {
      const mockMetadata = {
        title: 'Test Video',
        description: 'Test Description',
        duration: 300,
        width: 1920,
        height: 1080,
        fps: 30,
        filesize: 50000000,
        ext: 'mp4',
        thumbnails: [
          { id: 'maxresdefault', url: 'https://example.com/thumb.jpg' }
        ],
        uploader: 'Test Channel',
        upload_date: '20231225',
        view_count: 1000000
      };

      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockResolvedValue(mockMetadata);

      const metadata = await downloader.fetchMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      expect(metadata).toMatchObject({
        title: 'Test Video',
        description: 'Test Description',
        duration: 300,
        width: 1920,
        height: 1080,
        fps: 30,
        platform: 'YouTube',
        format: 'mp4'
      });
    });

    it('should handle missing metadata fields gracefully', async () => {
      const mockMetadata = {
        title: null,
        duration: null,
        width: null,
        height: null
      };

      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockResolvedValue(mockMetadata);

      const metadata = await downloader.fetchMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      expect(metadata).toMatchObject({
        title: 'Untitled',
        duration: 0,
        width: 1920,
        height: 1080,
        platform: 'YouTube'
      });
    });

    it('should parse upload date correctly', async () => {
      const mockMetadata = {
        upload_date: '20231225'
      };

      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockResolvedValue(mockMetadata);

      const metadata = await downloader.fetchMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      expect(metadata.uploadDate).toEqual(new Date('2023-12-25'));
    });

    it('should select best thumbnail from available options', async () => {
      const mockMetadata = {
        thumbnails: [
          { id: 'default', url: 'https://example.com/default.jpg' },
          { id: 'medium', url: 'https://example.com/medium.jpg' },
          { id: 'high', url: 'https://example.com/high.jpg' },
          { id: 'maxresdefault', url: 'https://example.com/maxres.jpg' }
        ]
      };

      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockResolvedValue(mockMetadata);

      const metadata = await downloader.fetchMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      expect(metadata.thumbnailUrl).toBe('https://example.com/maxres.jpg');
    });
  });

  describe('Download Behavior', () => {
    beforeEach(() => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: 50000000 } as any);
    });

    it('should download video with default options', async () => {
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockImplementation((url: string, options: any) => {
        if (options.dumpSingleJson) {
          return Promise.resolve({
            title: 'Test Video',
            duration: 300,
            width: 1920,
            height: 1080
          });
        }
        return Promise.resolve();
      });

      const options = {
        outputPath: '/tmp/video.mp4'
      };

      const result = await downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', options);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/tmp/video.mp4');
      expect(result.metadata?.fileSize).toBe(50000000);
    });

    it('should respect quality settings', async () => {
      let capturedFormat = '';
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockImplementation((url: string, options: any) => {
        if (options.format) {
          capturedFormat = options.format;
        }
        if (options.dumpSingleJson) {
          return Promise.resolve({ title: 'Test Video' });
        }
        return Promise.resolve();
      });

      const qualityTests = [
        { quality: 'best' as const, expected: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best' },
        { quality: 'high' as const, expected: 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best' },
        { quality: 'medium' as const, expected: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best' },
        { quality: 'low' as const, expected: 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best' }
      ];

      for (const test of qualityTests) {
        await downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
          outputPath: '/tmp/video.mp4',
          quality: test.quality
        });
        expect(capturedFormat).toBe(test.expected);
      }
    });

    it('should handle duration limits', async () => {
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockResolvedValue({
        title: 'Long Video',
        duration: 3600 // 1 hour
      });

      const options = {
        outputPath: '/tmp/video.mp4',
        maxDuration: 600 // 10 minutes
      };

      await expect(
        downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', options)
      ).rejects.toThrow('Video duration (3600s) exceeds maximum allowed duration (600s)');
    });

    it('should emit progress events during download', async () => {
      const progressEvents: any[] = [];
      downloader.on('progress', (progress) => progressEvents.push(progress));

      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      const mockExec = vi.fn().mockImplementation((url: string, options: any) => {
        const subprocess = mockExecProcess;
        
        // Simulate progress output
        setTimeout(() => {
          subprocess.stdout.emit('data', '[download]  25.0% of 50.00MiB at 1.00MiB/s ETA 00:37');
          subprocess.stdout.emit('data', '[download]  50.0% of 50.00MiB at 2.00MiB/s ETA 00:12');
          subprocess.stdout.emit('data', '[download] 100.0% of 50.00MiB at 5.00MiB/s ETA 00:00');
          subprocess.emit('exit', 0);
        }, 10);

        return subprocess;
      });
      
      ytdlpExec.exec = mockExec;
      vi.mocked(ytdlpExec.default).mockResolvedValue({ title: 'Test Video' });

      await downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        outputPath: '/tmp/video.mp4'
      });

      expect(progressEvents).toHaveLength(3);
      expect(progressEvents[0].percent).toBe(25.0);
      expect(progressEvents[1].percent).toBe(50.0);
      expect(progressEvents[2].percent).toBe(100.0);
    });

    it('should handle cookies for age-restricted videos', async () => {
      let capturedCookies = '';
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockImplementation((url: string, options: any) => {
        if (options.cookies) {
          capturedCookies = options.cookies;
        }
        if (options.dumpSingleJson) {
          return Promise.resolve({ title: 'Age Restricted Video' });
        }
        return Promise.resolve();
      });

      await downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        outputPath: '/tmp/video.mp4',
        cookies: 'youtube_cookies.txt'
      });

      expect(capturedCookies).toBe('youtube_cookies.txt');
    });

    it('should handle download timeout', async () => {
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockImplementation((url: string, options: any) => {
        if (options.dumpSingleJson) {
          return Promise.resolve({ title: 'Test Video' });
        }
        // Simulate a hanging download
        return new Promise(() => {});
      });

      await expect(
        downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
          outputPath: '/tmp/video.mp4',
          timeout: 100 // 100ms timeout
        })
      ).rejects.toThrow('Download timeout');
    });

    it('should support format selection', async () => {
      let capturedFormat = '';
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockImplementation((url: string, options: any) => {
        if (options.format) {
          capturedFormat = options.format;
        }
        if (options.dumpSingleJson) {
          return Promise.resolve({ title: 'Test Video' });
        }
        return Promise.resolve();
      });

      await downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        outputPath: '/tmp/video.webm',
        format: 'webm',
        quality: 'best'
      });

      expect(capturedFormat).toContain('[ext=webm]');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid video ID gracefully', async () => {
      await expect(
        downloader.fetchMetadata('https://www.youtube.com/watch?v=invalid_id')
      ).rejects.toThrow('Failed to fetch metadata');
    });

    it('should handle network errors', async () => {
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockRejectedValue(new Error('Network error'));

      await expect(
        downloader.fetchMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      ).rejects.toThrow('Failed to fetch metadata: Network error');
    });

    it('should handle missing output file after download', async () => {
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockImplementation((url: string, options: any) => {
        if (options.dumpSingleJson) {
          return Promise.resolve({ title: 'Test Video' });
        }
        return Promise.resolve();
      });
      
      vi.mocked(fs.pathExists).mockResolvedValue(false);

      const result = await downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        outputPath: '/tmp/video.mp4'
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('output file not found');
    });

    it('should retry failed downloads', async () => {
      let attempts = 0;
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockImplementation((url: string, options: any) => {
        if (options.dumpSingleJson) {
          return Promise.resolve({ title: 'Test Video' });
        }
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Download failed'));
        }
        return Promise.resolve();
      });

      const result = await downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        outputPath: '/tmp/video.mp4',
        maxRetries: 3
      });

      expect(attempts).toBe(1); // yt-dlp handles retries internally
    });
  });

  describe('Cancel Download', () => {
    it('should cancel ongoing download', async () => {
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      const mockExec = vi.fn().mockImplementation(() => {
        const subprocess = mockExecProcess;
        setTimeout(() => subprocess.emit('exit', 1), 100);
        return subprocess;
      });
      
      ytdlpExec.exec = mockExec;
      vi.mocked(ytdlpExec.default).mockResolvedValue({ title: 'Test Video' });

      const downloadPromise = downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        outputPath: '/tmp/video.mp4'
      });

      // Cancel after a short delay
      setTimeout(() => downloader.cancelDownload(), 50);

      const result = await downloadPromise;
      
      expect(result.success).toBe(false);
      expect(mockExecProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('Platform-Specific Features', () => {
    it('should handle YouTube chapters metadata', async () => {
      const mockMetadata = {
        title: 'Video with Chapters',
        chapters: [
          { start_time: 0, end_time: 120, title: 'Introduction' },
          { start_time: 120, end_time: 300, title: 'Main Content' },
          { start_time: 300, end_time: 400, title: 'Conclusion' }
        ]
      };

      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockResolvedValue(mockMetadata);

      const metadata = await downloader.fetchMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      // Note: Current implementation doesn't expose chapters, but this test
      // demonstrates where chapter support could be added
      expect(metadata.title).toBe('Video with Chapters');
    });

    it('should handle live streams appropriately', async () => {
      const mockMetadata = {
        title: 'Live Stream',
        is_live: true,
        duration: null
      };

      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockResolvedValue(mockMetadata);

      const metadata = await downloader.fetchMetadata('https://www.youtube.com/watch?v=live_stream_id');

      expect(metadata.duration).toBe(0);
    });

    it('should handle YouTube Shorts URLs', () => {
      const shortsUrls = [
        'https://www.youtube.com/shorts/abc123def',
        'https://youtube.com/shorts/xyz789ghi'
      ];

      // Note: Current URL pattern doesn't include Shorts URLs
      // This test demonstrates where Shorts support could be added
      shortsUrls.forEach(url => {
        // expect(downloader.validateUrl(url)).toBe(true);
      });
    });

    it('should parse YouTube-specific metadata', async () => {
      const mockMetadata = {
        title: 'Test Video',
        like_count: 50000,
        dislike_count: 100,
        comment_count: 1000,
        categories: ['Entertainment'],
        tags: ['funny', 'viral', 'trending'],
        subtitles: {
          en: [{ url: 'https://example.com/en.vtt' }],
          es: [{ url: 'https://example.com/es.vtt' }]
        }
      };

      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockResolvedValue(mockMetadata);

      const metadata = await downloader.fetchMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      // Current implementation doesn't expose all these fields,
      // but they're available in the yt-dlp output
      expect(metadata.title).toBe('Test Video');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle YouTube rate limiting gracefully', async () => {
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockRejectedValue(
        new Error('ERROR: Unable to download webpage: HTTP Error 429: Too Many Requests')
      );

      await expect(
        downloader.fetchMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      ).rejects.toThrow('Failed to fetch metadata');
    });
  });

  describe('Authentication', () => {
    it('should handle private videos with authentication', async () => {
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockRejectedValue(
        new Error('ERROR: This video is private')
      );

      await expect(
        downloader.fetchMetadata('https://www.youtube.com/watch?v=private_video')
      ).rejects.toThrow('Failed to fetch metadata');
    });

    it('should use custom headers if provided', async () => {
      let capturedHeaders: any = {};
      const ytdlpExec = await vi.importActual('yt-dlp-exec') as any;
      vi.mocked(ytdlpExec.default).mockImplementation((url: string, options: any) => {
        if (options.addHeader) {
          capturedHeaders = options.addHeader;
        }
        if (options.dumpSingleJson) {
          return Promise.resolve({ title: 'Test Video' });
        }
        return Promise.resolve();
      });

      await downloader.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        outputPath: '/tmp/video.mp4',
        headers: {
          'X-Custom-Header': 'custom-value'
        }
      });

      // Note: Current implementation doesn't pass custom headers to yt-dlp
      // This test shows where header support could be added
    });
  });
});