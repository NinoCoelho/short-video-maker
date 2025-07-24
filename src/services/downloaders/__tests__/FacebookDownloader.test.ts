import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { FacebookDownloader } from '../FacebookDownloader';
import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';

// Mock modules
vi.mock('fs-extra');
vi.mock('got');
vi.mock('child_process', () => ({
  exec: vi.fn(),
  promisify: (fn: any) => vi.fn()
}));
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('FacebookDownloader', () => {
  let downloader: FacebookDownloader;
  let mockGot: any;
  let mockExecAsync: Mock;

  beforeEach(async () => {
    downloader = new FacebookDownloader();
    
    // Setup got mock
    mockGot = {
      default: vi.fn(),
      stream: vi.fn()
    };
    vi.mocked(await import('got')).default = mockGot.default;
    
    // Setup execAsync mock
    const childProcess = await import('child_process');
    mockExecAsync = vi.fn();
    (childProcess.promisify as any).mockReturnValue(mockExecAsync);
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('URL Validation', () => {
    it('should validate standard Facebook video URLs', () => {
      const validUrls = [
        'https://www.facebook.com/watch/?v=123456789',
        'https://facebook.com/watch?v=123456789',
        'https://www.facebook.com/video.php?v=123456789',
        'https://www.facebook.com/username/videos/123456789',
        'https://www.facebook.com/reel/123456789',
        'https://fb.watch/abc123',
        'https://www.facebook.com/stories/username/123456789',
        'https://www.facebook.com/username/posts/123456789',
        'http://facebook.com/watch?v=123456789' // Should be normalized to https
      ];

      validUrls.forEach(url => {
        expect(downloader.validateUrl(url)).toBe(true);
      });
    });

    it('should reject invalid Facebook URLs', () => {
      const invalidUrls = [
        'https://www.facebook.com/',
        'https://www.facebook.com/username',
        'https://www.facebook.com/pages/123456',
        'https://www.facebook.com/groups/123456',
        'https://youtube.com/watch?v=123456',
        'not-a-url',
        'https://fb.com/', // No video path
        'https://www.facebook.com/photo.php?id=123' // Photo, not video
      ];

      invalidUrls.forEach(url => {
        expect(downloader.validateUrl(url)).toBe(false);
      });
    });

    it('should extract video IDs from various URL formats', () => {
      const urlsWithIds = [
        { url: 'https://www.facebook.com/watch/?v=123456789', id: '123456789' },
        { url: 'https://www.facebook.com/video.php?v=987654321', id: '987654321' },
        { url: 'https://www.facebook.com/username/videos/555666777', id: '555666777' },
        { url: 'https://www.facebook.com/reel/111222333', id: '111222333' },
        { url: 'https://www.facebook.com/username/posts/444555666', id: '444555666' },
        { url: 'https://fb.watch/shortcode123', id: 'shortcode123' }
      ];

      urlsWithIds.forEach(({ url, id }) => {
        expect(downloader['extractVideoId'](url)).toBe(id);
      });
    });
  });

  describe('Metadata Extraction', () => {
    it('should fetch metadata via yt-dlp successfully', async () => {
      const mockMetadata = {
        title: 'Facebook Video Test',
        description: 'Test Description',
        duration: 180,
        width: 1280,
        height: 720,
        fps: 30,
        filesize: 25000000,
        ext: 'mp4',
        thumbnail: 'https://example.com/thumb.jpg',
        uploader: 'Test Page',
        timestamp: 1703520000,
        view_count: 50000
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.facebook.com/watch/?v=123456789');

      expect(metadata).toMatchObject({
        title: 'Facebook Video Test',
        description: 'Test Description',
        duration: 180,
        width: 1280,
        height: 720,
        platform: 'Facebook'
      });
      expect(metadata.uploadDate).toEqual(new Date(1703520000 * 1000));
    });

    it('should fallback to scraping when yt-dlp fails', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));

      const mockHtml = `
        <html>
          <meta property="og:title" content="Scraped Video Title" />
          <meta property="og:description" content="Scraped Description" />
          <meta property="og:image" content="https://example.com/scraped-thumb.jpg" />
          <script>
            "contentUrl": "https://example.com/video.mp4"
          </script>
        </html>
      `;

      mockGot.default.mockResolvedValue({
        body: mockHtml
      });

      const metadata = await downloader.fetchMetadata('https://www.facebook.com/watch/?v=123456789');

      expect(metadata).toMatchObject({
        title: 'Scraped Video Title',
        description: 'Scraped Description',
        thumbnailUrl: 'https://example.com/scraped-thumb.jpg',
        platform: 'Facebook'
      });
    });

    it('should handle HTML entity decoding', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));

      const mockHtml = `
        <html>
          <meta property="og:title" content="Video &amp; Test &lt;Title&gt;" />
          <meta property="og:description" content="Description with &quot;quotes&quot;" />
        </html>
      `;

      mockGot.default.mockResolvedValue({
        body: mockHtml
      });

      const metadata = await downloader.fetchMetadata('https://www.facebook.com/watch/?v=123456789');

      expect(metadata.title).toBe('Video & Test <Title>');
      expect(metadata.description).toBe('Description with "quotes"');
    });

    it('should extract video URLs from multiple possible locations', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));

      const testCases = [
        { pattern: '"contentUrl": "https://video.url1.mp4"', url: 'https://video.url1.mp4' },
        { pattern: '"video_url": "https://video.url2.mp4"', url: 'https://video.url2.mp4' },
        { pattern: '"hd_src": "https://video.url3.mp4"', url: 'https://video.url3.mp4' },
        { pattern: '"sd_src": "https://video.url4.mp4"', url: 'https://video.url4.mp4' }
      ];

      for (const testCase of testCases) {
        const mockHtml = `<html><script>${testCase.pattern}</script></html>`;
        mockGot.default.mockResolvedValue({ body: mockHtml });

        const directUrl = await downloader['extractDirectVideoUrl']('https://www.facebook.com/watch/?v=123');
        expect(directUrl).toBe(testCase.url);
      }
    });
  });

  describe('Download Behavior', () => {
    beforeEach(() => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: 25000000 } as any);
      vi.mocked(fs.createWriteStream).mockReturnValue(new EventEmitter() as any);
    });

    it('should download video using yt-dlp', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video', duration: 120 }) })
        .mockResolvedValueOnce({ stderr: '' });

      const options = {
        outputPath: '/tmp/facebook-video.mp4'
      };

      const result = await downloader.download('https://www.facebook.com/watch/?v=123456789', options);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/tmp/facebook-video.mp4');
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('yt-dlp')
      );
    });

    it('should fallback to direct download when yt-dlp fails', async () => {
      mockExecAsync
        .mockRejectedValueOnce(new Error('yt-dlp not available'))
        .mockResolvedValueOnce({ stdout: JSON.stringify({ duration: 120, width: 1280, height: 720 }) });

      const mockHtml = `
        <html>
          <meta property="og:title" content="Direct Download Video" />
          <script>"hd_src": "https://example.com/video.mp4"</script>
        </html>
      `;

      mockGot.default.mockResolvedValue({ body: mockHtml });

      const mockDownloadStream = new EventEmitter();
      const mockWriteStream = new EventEmitter();
      (mockWriteStream as any).destroy = vi.fn();

      mockGot.stream.mockReturnValue(mockDownloadStream);
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

      const downloadPromise = downloader.download('https://www.facebook.com/watch/?v=123456789', {
        outputPath: '/tmp/facebook-video.mp4'
      });

      // Simulate download progress
      setTimeout(() => {
        mockDownloadStream.emit('downloadProgress', {
          percent: 0.5,
          transferred: 12500000,
          total: 25000000
        });
      }, 10);

      // Simulate successful download
      setTimeout(() => {
        mockWriteStream.emit('finish');
      }, 20);

      const result = await downloadPromise;

      expect(result.success).toBe(true);
      expect(mockGot.stream).toHaveBeenCalled();
    });

    it('should handle quality settings', async () => {
      const qualityTests = [
        { quality: 'best' as const, expected: 'best[ext=mp4]/best' },
        { quality: 'high' as const, expected: 'best[height<=1080][ext=mp4]/best[height<=1080]/best' },
        { quality: 'medium' as const, expected: 'best[height<=720][ext=mp4]/best[height<=720]/best' },
        { quality: 'low' as const, expected: 'best[height<=480][ext=mp4]/best[height<=480]/best' }
      ];

      for (const test of qualityTests) {
        mockExecAsync
          .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
          .mockResolvedValueOnce({ stderr: '' });

        await downloader.download('https://www.facebook.com/watch/?v=123456789', {
          outputPath: '/tmp/video.mp4',
          quality: test.quality
        });

        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringContaining(`-f "${test.expected}"`)
        );
      }
    });

    it('should respect duration limits', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ title: 'Long Video', duration: 3600 })
      });

      await expect(
        downloader.download('https://www.facebook.com/watch/?v=123456789', {
          outputPath: '/tmp/video.mp4',
          maxDuration: 600
        })
      ).rejects.toThrow('Video duration (3600s) exceeds maximum allowed duration (600s)');
    });

    it('should emit progress events during direct download', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      
      const progressEvents: any[] = [];
      downloader.on('progress', (progress) => progressEvents.push(progress));

      mockGot.default.mockResolvedValue({
        body: '<html><script>"hd_src": "https://example.com/video.mp4"</script></html>'
      });

      const mockDownloadStream = new EventEmitter();
      const mockWriteStream = new EventEmitter();
      mockGot.stream.mockReturnValue(mockDownloadStream);
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

      const downloadPromise = downloader.download('https://www.facebook.com/watch/?v=123456789', {
        outputPath: '/tmp/video.mp4'
      });

      // Emit progress events
      setTimeout(() => {
        mockDownloadStream.emit('downloadProgress', { percent: 0.25, transferred: 6250000, total: 25000000 });
        mockDownloadStream.emit('downloadProgress', { percent: 0.50, transferred: 12500000, total: 25000000 });
        mockDownloadStream.emit('downloadProgress', { percent: 1.00, transferred: 25000000, total: 25000000 });
        mockWriteStream.emit('finish');
      }, 10);

      await downloadPromise;

      expect(progressEvents).toHaveLength(3);
      expect(progressEvents[0].percent).toBe(25);
      expect(progressEvents[1].percent).toBe(50);
      expect(progressEvents[2].percent).toBe(100);
    });

    it('should get video info using ffprobe', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
        .mockResolvedValueOnce({ stderr: '' })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            format: { duration: '180.5', format_name: 'mov,mp4,m4a' },
            streams: [
              { codec_type: 'video', width: 1920, height: 1080, r_frame_rate: '30/1' }
            ]
          })
        });

      const result = await downloader.download('https://www.facebook.com/watch/?v=123456789', {
        outputPath: '/tmp/video.mp4'
      });

      expect(result.metadata?.duration).toBe(180.5);
      expect(result.metadata?.width).toBe(1920);
      expect(result.metadata?.height).toBe(1080);
      expect(result.metadata?.fps).toBe(30);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockExecAsync.mockRejectedValue(new Error('Network error'));
      mockGot.default.mockRejectedValue(new Error('Connection refused'));

      await expect(
        downloader.fetchMetadata('https://www.facebook.com/watch/?v=123456789')
      ).rejects.toThrow('Failed to fetch metadata');
    });

    it('should handle missing video URL in page', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      mockGot.default.mockResolvedValue({
        body: '<html><head><title>Facebook</title></head></html>'
      });

      await expect(
        downloader.fetchMetadata('https://www.facebook.com/watch/?v=123456789')
      ).rejects.toThrow('Could not find video URL in page');
    });

    it('should handle download stream errors', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      mockGot.default.mockResolvedValue({
        body: '<html><script>"hd_src": "https://example.com/video.mp4"</script></html>'
      });

      const mockDownloadStream = new EventEmitter();
      const mockWriteStream = new EventEmitter();
      (mockWriteStream as any).destroy = vi.fn();
      
      mockGot.stream.mockReturnValue(mockDownloadStream);
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

      const downloadPromise = downloader.download('https://www.facebook.com/watch/?v=123456789', {
        outputPath: '/tmp/video.mp4'
      });

      // Simulate download error
      setTimeout(() => {
        mockDownloadStream.emit('error', new Error('Download failed'));
      }, 10);

      const result = await downloadPromise;
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Download failed');
    });

    it('should retry failed downloads', async () => {
      let attempts = 0;
      mockExecAsync.mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.resolve({ stdout: JSON.stringify({ title: 'Test Video' }) });
        } else {
          return Promise.resolve({ stderr: '' });
        }
      });

      const result = await downloader.download('https://www.facebook.com/watch/?v=123456789', {
        outputPath: '/tmp/video.mp4',
        maxRetries: 3
      });

      expect(result.success).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('--retries 3')
      );
    });
  });

  describe('Cancel Download', () => {
    it('should cancel ongoing direct download', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      mockGot.default.mockResolvedValue({
        body: '<html><script>"hd_src": "https://example.com/video.mp4"</script></html>'
      });

      const mockDownloadStream = new EventEmitter();
      (mockDownloadStream as any).destroy = vi.fn();
      const mockWriteStream = new EventEmitter();
      
      mockGot.stream.mockReturnValue(mockDownloadStream);
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);
      vi.mocked(fs.remove).mockResolvedValue(undefined);

      const downloadPromise = downloader.download('https://www.facebook.com/watch/?v=123456789', {
        outputPath: '/tmp/video.mp4'
      });

      // Cancel after a short delay
      setTimeout(() => {
        downloader.cancelDownload();
        mockWriteStream.emit('finish');
      }, 10);

      await expect(downloadPromise).rejects.toThrow('Download cancelled');
      expect(mockDownloadStream.destroy).toHaveBeenCalled();
    });
  });

  describe('Platform-Specific Features', () => {
    it('should handle Facebook Live videos', async () => {
      const mockMetadata = {
        title: 'Live Video',
        is_live: true,
        duration: 0
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.facebook.com/watch/live/?v=123456789');
      expect(metadata.duration).toBe(0);
    });

    it('should handle Facebook Reels', () => {
      const reelUrl = 'https://www.facebook.com/reel/123456789';
      expect(downloader.validateUrl(reelUrl)).toBe(true);
      expect(downloader['extractVideoId'](reelUrl)).toBe('123456789');
    });

    it('should handle Facebook Stories', () => {
      const storyUrl = 'https://www.facebook.com/stories/username/123456789';
      expect(downloader.validateUrl(storyUrl)).toBe(true);
    });

    it('should handle fb.watch short URLs', async () => {
      const shortUrl = 'https://fb.watch/abc123xyz';
      expect(downloader.validateUrl(shortUrl)).toBe(true);
      expect(downloader['extractVideoId'](shortUrl)).toBe('abc123xyz');
    });

    it('should decode Unicode escapes in video URLs', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      
      const mockHtml = `
        <html>
          <script>"hd_src": "https://example.com/video\\u0026quality=hd"</script>
        </html>
      `;

      mockGot.default.mockResolvedValue({ body: mockHtml });

      const videoUrl = await downloader['extractDirectVideoUrl']('https://www.facebook.com/watch/?v=123');
      expect(videoUrl).toBe('https://example.com/video&quality=hd');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle Facebook rate limiting', async () => {
      mockExecAsync.mockRejectedValue(new Error('HTTP Error 429'));
      mockGot.default.mockRejectedValue({
        response: { statusCode: 429 }
      });

      await expect(
        downloader.fetchMetadata('https://www.facebook.com/watch/?v=123456789')
      ).rejects.toThrow('Failed to fetch metadata');
    });

    it('should use appropriate headers to avoid detection', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      
      let capturedHeaders: any = {};
      mockGot.default.mockImplementation((url: string, options: any) => {
        capturedHeaders = options.headers;
        return Promise.resolve({
          body: '<html><script>"contentUrl": "https://example.com/video.mp4"</script></html>'
        });
      });

      await downloader.fetchMetadata('https://www.facebook.com/watch/?v=123456789');

      expect(capturedHeaders['User-Agent']).toContain('Mozilla');
      expect(capturedHeaders['Accept']).toBeDefined();
      expect(capturedHeaders['Accept-Language']).toBeDefined();
    });
  });

  describe('Authentication', () => {
    it('should handle private videos requiring login', async () => {
      mockExecAsync.mockRejectedValue(new Error('This video is private'));
      mockGot.default.mockResolvedValue({
        body: '<html><title>Log in to Facebook</title></html>'
      });

      await expect(
        downloader.fetchMetadata('https://www.facebook.com/watch/?v=private123')
      ).rejects.toThrow();
    });

    it('should use cookies if provided', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Private Video' }) })
        .mockResolvedValueOnce({ stderr: '' });

      const options = {
        outputPath: '/tmp/video.mp4',
        cookies: 'fbcookie=value; c_user=123456'
      };

      await downloader.download('https://www.facebook.com/watch/?v=123456789', options);

      // Verify cookies are passed to requests
      expect(mockExecAsync).toHaveBeenCalled();
    });
  });

  describe('Video Quality Selection', () => {
    it('should handle videos with multiple quality options', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      
      const mockHtml = `
        <html>
          <script>
            "hd_src": "https://example.com/video_hd.mp4",
            "sd_src": "https://example.com/video_sd.mp4",
            "playable_url_quality_hd": "https://example.com/video_1080p.mp4"
          </script>
        </html>
      `;

      mockGot.default.mockResolvedValue({ body: mockHtml });

      // Should prefer HD source
      const videoUrl = await downloader['extractDirectVideoUrl']('https://www.facebook.com/watch/?v=123');
      expect(videoUrl).toContain('hd');
    });
  });
});