import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { TikTokDownloader } from '../TikTokDownloader';
import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';
import { exec } from 'child_process';

// Mock modules
vi.mock('fs-extra');
vi.mock('got');
vi.mock('child_process');
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('TikTokDownloader', () => {
  let downloader: TikTokDownloader;
  let mockGot: any;
  let mockExecAsync: Mock;
  let mockExecProcess: any;

  beforeEach(async () => {
    downloader = new TikTokDownloader();
    
    // Setup got mock
    mockGot = {
      default: vi.fn(),
      stream: vi.fn()
    };
    vi.mocked(await import('got')).default = mockGot.default;
    
    // Setup exec mock
    mockExecProcess = new EventEmitter();
    mockExecProcess.stdout = new EventEmitter();
    mockExecProcess.stderr = new EventEmitter();
    vi.mocked(exec).mockReturnValue(mockExecProcess as any);
    
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
    it('should validate standard TikTok URLs', () => {
      const validUrls = [
        'https://www.tiktok.com/@username/video/1234567890123456789',
        'https://tiktok.com/@user.name/video/9876543210987654321',
        'https://vm.tiktok.com/ZMdwnKB8Q/',
        'https://vt.tiktok.com/ZSdpYGKdx/',
        'https://www.tiktok.com/@test_user/video/7156789012345678901',
        'http://tiktok.com/@username/video/1234567890123456789' // Should be normalized to https
      ];

      validUrls.forEach(url => {
        expect(downloader.validateUrl(url)).toBe(true);
      });
    });

    it('should reject invalid TikTok URLs', () => {
      const invalidUrls = [
        'https://www.tiktok.com/',
        'https://www.tiktok.com/@username',
        'https://www.tiktok.com/trending',
        'https://www.tiktok.com/foryou',
        'https://youtube.com/watch?v=123456',
        'not-a-url',
        'https://tiktok.com/', // No content path
        'https://www.tiktok.com/login' // Login page
      ];

      invalidUrls.forEach(url => {
        expect(downloader.validateUrl(url)).toBe(false);
      });
    });

    it('should extract video IDs correctly', () => {
      const urlsWithIds = [
        { url: 'https://www.tiktok.com/@username/video/1234567890123456789', id: '1234567890123456789' },
        { url: 'https://vm.tiktok.com/ZMdwnKB8Q/', id: 'ZMdwnKB8Q' },
        { url: 'https://vt.tiktok.com/ZSdpYGKdx/', id: 'ZSdpYGKdx' }
      ];

      urlsWithIds.forEach(({ url, id }) => {
        expect(downloader['extractVideoId'](url)).toBe(id);
      });
    });

    it('should resolve short URLs to full URLs', async () => {
      // Test redirect response
      mockGot.default.mockRejectedValue({
        response: {
          headers: {
            location: 'https://www.tiktok.com/@username/video/1234567890123456789'
          }
        }
      });

      const fullUrl = await downloader['resolveShortUrl']('https://vm.tiktok.com/ZMdwnKB8Q/');
      expect(fullUrl).toBe('https://www.tiktok.com/@username/video/1234567890123456789');
    });

    it('should return original URL if already full URL', async () => {
      const fullUrl = 'https://www.tiktok.com/@username/video/1234567890123456789';
      const result = await downloader['resolveShortUrl'](fullUrl);
      expect(result).toBe(fullUrl);
    });
  });

  describe('Metadata Extraction', () => {
    it('should fetch metadata via yt-dlp successfully', async () => {
      const mockMetadata = {
        title: 'Amazing TikTok Video',
        description: 'Check out this viral video! #tiktok #viral #fyp',
        duration: 15,
        width: 576,
        height: 1024,
        fps: 30,
        filesize: 5000000,
        ext: 'mp4',
        thumbnail: 'https://example.com/thumb.jpg',
        uploader: 'coolcreator',
        timestamp: 1703520000,
        view_count: 1000000
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789');

      expect(metadata).toMatchObject({
        title: 'Amazing TikTok Video',
        description: 'Check out this viral video! #tiktok #viral #fyp',
        duration: 15,
        width: 576,
        height: 1024,
        platform: 'TikTok'
      });
    });

    it('should handle short URL resolution before fetching metadata', async () => {
      mockGot.default.mockRejectedValueOnce({
        response: {
          headers: {
            location: 'https://www.tiktok.com/@username/video/1234567890123456789'
          }
        }
      });

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ title: 'Resolved Video' })
      });

      const metadata = await downloader.fetchMetadata('https://vm.tiktok.com/ZMdwnKB8Q/');
      expect(metadata.title).toBe('Resolved Video');
    });

    it('should fallback to scraping when yt-dlp fails', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));

      const mockHtml = `
        <html>
          <meta property="og:title" content="Scraped TikTok Video" />
          <meta property="og:description" content="Scraped description #fyp" />
          <meta property="og:image" content="https://example.com/scraped-thumb.jpg" />
          <script type="application/ld+json">
            {
              "@type": "VideoObject",
              "name": "JSON-LD Video Title",
              "description": "JSON-LD description",
              "duration": "PT15S",
              "width": 576,
              "height": 1024,
              "thumbnailUrl": "https://example.com/jsonld-thumb.jpg",
              "creator": {
                "name": "jsonldcreator"
              },
              "uploadDate": "2023-12-25T00:00:00Z",
              "interactionStatistic": [{
                "interactionType": "WatchAction",
                "userInteractionCount": 500000
              }]
            }
          </script>
        </html>
      `;

      mockGot.default.mockResolvedValue({
        body: mockHtml
      });

      const metadata = await downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789');

      expect(metadata).toMatchObject({
        title: 'JSON-LD Video Title',
        description: 'JSON-LD description',
        duration: 15,
        author: 'jsonldcreator',
        viewCount: 500000,
        platform: 'TikTok'
      });
    });

    it('should parse NEXT_DATA from page', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));

      const mockHtml = `
        <html>
          <script id="__NEXT_DATA__">
            {
              "props": {
                "pageProps": {
                  "itemInfo": {
                    "itemStruct": {
                      "desc": "Next.js Video Description #trending",
                      "video": {
                        "duration": 30,
                        "width": 720,
                        "height": 1280,
                        "format": "mp4",
                        "cover": "https://example.com/nextjs-cover.jpg",
                        "downloadAddr": "https://example.com/video-download.mp4",
                        "playAddr": "https://example.com/video-play.mp4"
                      },
                      "author": {
                        "nickname": "NextJS Creator",
                        "uniqueId": "nextjscreator"
                      },
                      "createTime": "1703520000",
                      "stats": {
                        "playCount": 2500000
                      }
                    }
                  }
                }
              }
            }
          </script>
        </html>
      `;

      mockGot.default.mockResolvedValue({
        body: mockHtml
      });

      const metadata = await downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789');

      expect(metadata).toMatchObject({
        title: 'Next.js Video Description #trending',
        duration: 30,
        width: 720,
        height: 1280,
        author: 'NextJS Creator',
        viewCount: 2500000,
        platform: 'TikTok'
      });
    });

    it('should parse ISO 8601 duration format', () => {
      expect(downloader['parseDuration']('PT15S')).toBe(15);
      expect(downloader['parseDuration']('PT1M30S')).toBe(90);
      expect(downloader['parseDuration']('PT1H23M45S')).toBe(5025);
      expect(downloader['parseDuration']('PT2H')).toBe(7200);
    });
  });

  describe('Download Behavior', () => {
    beforeEach(() => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: 5000000 } as any);
      vi.mocked(fs.createWriteStream).mockReturnValue(new EventEmitter() as any);
    });

    it('should download video using yt-dlp', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video', duration: 15 }) })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            format: { duration: '15' },
            streams: [{ codec_type: 'video', width: 576, height: 1024 }]
          })
        });

      const downloadPromise = downloader.download('https://www.tiktok.com/@username/video/1234567890123456789', {
        outputPath: '/tmp/tiktok-video.mp4'
      });

      // Simulate successful completion
      setTimeout(() => {
        mockExecProcess.emit('exit', 0);
      }, 10);

      const result = await downloadPromise;

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/tmp/tiktok-video.mp4');
    });

    it('should handle download progress', async () => {
      const progressEvents: any[] = [];
      downloader.on('progress', (progress) => progressEvents.push(progress));

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ title: 'Test Video', duration: 15 })
      });

      const downloadPromise = downloader.download('https://www.tiktok.com/@username/video/1234567890123456789', {
        outputPath: '/tmp/tiktok-video.mp4'
      });

      // Simulate progress output
      setTimeout(() => {
        mockExecProcess.stdout.emit('data', '[download]  25.0% of 5.00MiB');
        mockExecProcess.stdout.emit('data', '[download]  50.0% of 5.00MiB');
        mockExecProcess.stdout.emit('data', '[download] 100.0% of 5.00MiB');
        mockExecProcess.emit('exit', 0);
      }, 10);

      await downloadPromise;

      expect(progressEvents).toHaveLength(3);
      expect(progressEvents[0].percent).toBe(25.0);
      expect(progressEvents[1].percent).toBe(50.0);
      expect(progressEvents[2].percent).toBe(100.0);
    });

    it('should fallback to direct download when yt-dlp fails', async () => {
      // First call for metadata, second rejection triggers fallback
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            format: { duration: '15' },
            streams: [{ codec_type: 'video', width: 576, height: 1024 }]
          })
        });

      // Mock exec to fail
      vi.mocked(exec).mockImplementation(() => {
        const process = mockExecProcess;
        setTimeout(() => process.emit('exit', 1), 10);
        return process as any;
      });

      const mockHtml = `
        <html>
          <script id="__NEXT_DATA__">
            {
              "props": {
                "pageProps": {
                  "itemInfo": {
                    "itemStruct": {
                      "video": {
                        "downloadAddr": "https://example.com/video.mp4"
                      }
                    }
                  }
                }
              }
            }
          </script>
        </html>
      `;

      mockGot.default.mockResolvedValue({ body: mockHtml });

      const mockDownloadStream = new EventEmitter();
      const mockWriteStream = new EventEmitter();
      (mockWriteStream as any).destroy = vi.fn();

      mockGot.stream.mockReturnValue(mockDownloadStream);
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

      const downloadPromise = downloader.download('https://www.tiktok.com/@username/video/1234567890123456789', {
        outputPath: '/tmp/tiktok-video.mp4'
      });

      setTimeout(() => {
        mockWriteStream.emit('finish');
      }, 20);

      const result = await downloadPromise;
      expect(result.success).toBe(true);
    });

    it('should handle TikTok watermark removal options', async () => {
      // Note: Current implementation doesn't have watermark removal
      // This test shows where such feature could be added
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) });

      const downloadPromise = downloader.download('https://www.tiktok.com/@username/video/1234567890123456789', {
        outputPath: '/tmp/tiktok-video.mp4',
        // Future feature: removeWatermark: true
      });

      setTimeout(() => {
        mockExecProcess.emit('exit', 0);
      }, 10);

      await downloadPromise;

      // Would check for watermark removal flags in yt-dlp command
    });

    it('should respect quality settings', async () => {
      // TikTok typically has limited quality options
      const qualityTests = [
        { quality: 'best' as const, expected: 'best[ext=mp4]/best' },
        { quality: 'high' as const, expected: 'best[ext=mp4]/best' },
        { quality: 'medium' as const, expected: 'best[ext=mp4]/best' },
        { quality: 'low' as const, expected: 'worst[ext=mp4]/worst' }
      ];

      for (const test of qualityTests) {
        mockExecAsync.mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) });

        const downloadPromise = downloader.download('https://www.tiktok.com/@username/video/1234567890123456789', {
          outputPath: '/tmp/video.mp4',
          quality: test.quality
        });

        setTimeout(() => {
          mockExecProcess.emit('exit', 0);
        }, 10);

        await downloadPromise;

        expect(exec).toHaveBeenCalledWith(
          expect.stringContaining(`-f "${test.expected}"`)
        );
      }
    });

    it('should include referer header for direct downloads', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            format: { duration: '15' },
            streams: [{ codec_type: 'video' }]
          })
        });

      // Mock exec to fail
      vi.mocked(exec).mockImplementation(() => {
        const process = mockExecProcess;
        setTimeout(() => process.emit('exit', 1), 10);
        return process as any;
      });

      mockGot.default.mockResolvedValue({
        body: '<html><script id="__NEXT_DATA__">{"props":{"pageProps":{"itemInfo":{"itemStruct":{"video":{"downloadAddr":"https://example.com/video.mp4"}}}}}}</script></html>'
      });

      let capturedHeaders: any = {};
      mockGot.stream.mockImplementation((url: string, options: any) => {
        capturedHeaders = options.headers;
        const stream = new EventEmitter();
        return stream;
      });

      const mockWriteStream = new EventEmitter();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

      const downloadPromise = downloader.download('https://www.tiktok.com/@username/video/1234567890123456789', {
        outputPath: '/tmp/video.mp4'
      });

      setTimeout(() => {
        mockWriteStream.emit('finish');
      }, 20);

      await downloadPromise;

      expect(capturedHeaders['Referer']).toBe('https://www.tiktok.com/');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockExecAsync.mockRejectedValue(new Error('Network error'));
      mockGot.default.mockRejectedValue(new Error('Connection refused'));

      await expect(
        downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789')
      ).rejects.toThrow('Failed to fetch metadata');
    });

    it('should handle missing video URL in page', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) });

      vi.mocked(exec).mockImplementation(() => {
        const process = mockExecProcess;
        setTimeout(() => process.emit('exit', 1), 10);
        return process as any;
      });

      mockGot.default.mockResolvedValue({
        body: '<html><head><title>TikTok</title></head></html>'
      });

      await expect(
        downloader.download('https://www.tiktok.com/@username/video/1234567890123456789', {
          outputPath: '/tmp/video.mp4'
        })
      ).rejects.toThrow('Could not extract video URL');
    });

    it('should handle yt-dlp exit codes properly', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ title: 'Test Video' })
      });

      const downloadPromise = downloader.download('https://www.tiktok.com/@username/video/1234567890123456789', {
        outputPath: '/tmp/video.mp4'
      });

      setTimeout(() => {
        mockExecProcess.emit('exit', 1);
      }, 10);

      await expect(downloadPromise).rejects.toThrow('yt-dlp exited with code 1');
    });

    it('should handle array of video URLs from NEXT_DATA', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) });

      vi.mocked(exec).mockImplementation(() => {
        const process = mockExecProcess;
        setTimeout(() => process.emit('exit', 1), 10);
        return process as any;
      });

      const mockHtml = `
        <html>
          <script id="__NEXT_DATA__">
            {
              "props": {
                "pageProps": {
                  "itemInfo": {
                    "itemStruct": {
                      "video": {
                        "downloadAddr": ["https://example.com/video1.mp4", "https://example.com/video2.mp4"]
                      }
                    }
                  }
                }
              }
            }
          </script>
        </html>
      `;

      mockGot.default.mockResolvedValue({ body: mockHtml });

      const videoUrl = await downloader['extractVideoUrl']('https://www.tiktok.com/@username/video/1234567890123456789');
      expect(videoUrl).toBe('https://example.com/video1.mp4');
    });
  });

  describe('Cancel Download', () => {
    it('should cancel ongoing direct download', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) });

      vi.mocked(exec).mockImplementation(() => {
        const process = mockExecProcess;
        setTimeout(() => process.emit('exit', 1), 10);
        return process as any;
      });

      mockGot.default.mockResolvedValue({
        body: '<html><script id="__NEXT_DATA__">{"props":{"pageProps":{"itemInfo":{"itemStruct":{"video":{"downloadAddr":"https://example.com/video.mp4"}}}}}}</script></html>'
      });

      const mockDownloadStream = new EventEmitter();
      (mockDownloadStream as any).destroy = vi.fn();
      const mockWriteStream = new EventEmitter();
      
      mockGot.stream.mockReturnValue(mockDownloadStream);
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);
      vi.mocked(fs.remove).mockResolvedValue(undefined);

      const downloadPromise = downloader.download('https://www.tiktok.com/@username/video/1234567890123456789', {
        outputPath: '/tmp/video.mp4'
      });

      setTimeout(() => {
        downloader.cancelDownload();
        mockWriteStream.emit('finish');
      }, 20);

      await expect(downloadPromise).rejects.toThrow('Download cancelled');
      expect(mockDownloadStream.destroy).toHaveBeenCalled();
    });
  });

  describe('Platform-Specific Features', () => {
    it('should handle vertical video dimensions (9:16 aspect ratio)', async () => {
      const mockMetadata = {
        width: 576,
        height: 1024,
        title: 'Vertical TikTok'
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789');
      
      expect(metadata.width).toBe(576);
      expect(metadata.height).toBe(1024);
      expect(metadata.height / metadata.width).toBeCloseTo(16/9, 1);
    });

    it('should handle TikTok Live streams appropriately', async () => {
      const mockMetadata = {
        title: 'LIVE: Stream Title',
        is_live: true,
        duration: 0
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.tiktok.com/@username/live');
      expect(metadata.duration).toBe(0);
    });

    it('should extract video URLs from various patterns', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));

      const testCases = [
        {
          html: '<script>"downloadAddr": "https://v1.tiktok.com/download1.mp4"</script>',
          expected: 'https://v1.tiktok.com/download1.mp4'
        },
        {
          html: '<script>"playAddr": "https://v2.tiktok.com/play2.mp4"</script>',
          expected: 'https://v2.tiktok.com/play2.mp4'
        },
        {
          html: '<script>"video": {"urls": ["https://v3.tiktok.com/video3.mp4"]}</script>',
          expected: 'https://v3.tiktok.com/video3.mp4'
        }
      ];

      for (const testCase of testCases) {
        mockGot.default.mockResolvedValue({ body: `<html>${testCase.html}</html>` });
        const videoUrl = await downloader['extractVideoUrl']('https://www.tiktok.com/@username/video/1234567890123456789');
        expect(videoUrl).toBe(testCase.expected);
      }
    });

    it('should decode Unicode escapes in URLs', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      
      const mockHtml = `
        <html>
          <script>"downloadAddr": "https://example.com/video\\u0026token=abc123"</script>
        </html>
      `;

      mockGot.default.mockResolvedValue({ body: mockHtml });

      const videoUrl = await downloader['extractVideoUrl']('https://www.tiktok.com/@username/video/1234567890123456789');
      expect(videoUrl).toBe('https://example.com/video&token=abc123');
    });

    it('should handle TikTok-specific metadata fields', async () => {
      const mockMetadata = {
        title: 'Viral Dance Challenge',
        description: 'Join the #DanceChallenge #ForYou #FYP',
        creator: 'dancecreator',
        channel: '@dancecreator',
        uploader: 'Dance Creator',
        like_count: 500000,
        comment_count: 25000,
        share_count: 10000,
        music: 'Original Sound - Dance Creator',
        hashtags: ['DanceChallenge', 'ForYou', 'FYP']
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789');

      // Current implementation uses basic fields, but these are available
      expect(metadata.author).toBe('dancecreator');
      expect(metadata.description).toContain('#DanceChallenge');
    });

    it('should handle duet and stitch videos', async () => {
      const mockMetadata = {
        title: 'Duet with @originalcreator',
        description: 'My reaction to this amazing video! #duet',
        is_duet: true,
        original_video_id: '9876543210987654321'
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789');
      expect(metadata.title).toContain('Duet with');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle TikTok rate limiting', async () => {
      mockExecAsync.mockRejectedValue(new Error('HTTP Error 10101'));
      mockGot.default.mockRejectedValue({
        response: { statusCode: 429 }
      });

      await expect(
        downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789')
      ).rejects.toThrow('Failed to fetch metadata');
    });

    it('should use appropriate headers to avoid bot detection', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      
      let capturedHeaders: any = {};
      mockGot.default.mockImplementation((url: string, options: any) => {
        capturedHeaders = options.headers;
        return Promise.resolve({
          body: '<html><script id="__NEXT_DATA__">{"props":{"pageProps":{}}}</script></html>'
        });
      });

      await downloader['scrapeMetadata']('https://www.tiktok.com/@username/video/1234567890123456789');

      expect(capturedHeaders['Accept']).toContain('text/html');
      expect(capturedHeaders['Accept-Language']).toBe('en-US,en;q=0.5');
      expect(capturedHeaders['Cache-Control']).toBe('no-cache');
    });
  });

  describe('Authentication', () => {
    it('should handle age-restricted content', async () => {
      mockExecAsync.mockRejectedValue(new Error('This video is age-restricted'));
      mockGot.default.mockResolvedValue({
        body: '<html><title>Age Verification Required</title></html>'
      });

      await expect(
        downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789')
      ).rejects.toThrow();
    });

    it('should handle private accounts', async () => {
      mockExecAsync.mockRejectedValue(new Error('This account is private'));
      mockGot.default.mockResolvedValue({
        body: '<html><title>This Account is Private</title></html>'
      });

      await expect(
        downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789')
      ).rejects.toThrow();
    });
  });

  describe('Video Quality and Format', () => {
    it('should parse ffprobe output correctly', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            format: {
              duration: '15.033',
              format_name: 'mov,mp4,m4a,3gp,3g2,mj2'
            },
            streams: [
              {
                codec_type: 'video',
                width: 576,
                height: 1024,
                r_frame_rate: '30/1'
              }
            ]
          })
        });

      const downloadPromise = downloader.download('https://www.tiktok.com/@username/video/1234567890123456789', {
        outputPath: '/tmp/video.mp4'
      });

      setTimeout(() => {
        mockExecProcess.emit('exit', 0);
      }, 10);

      const result = await downloadPromise;

      expect(result.metadata?.duration).toBeCloseTo(15.033, 1);
      expect(result.metadata?.fps).toBe(30);
      expect(result.metadata?.format).toBe('mov');
    });

    it('should handle various video codecs', async () => {
      const mockMetadata = {
        title: 'Test Video',
        vcodec: 'h264',
        acodec: 'aac',
        ext: 'mp4'
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.tiktok.com/@username/video/1234567890123456789');
      expect(metadata.format).toBe('mp4');
    });
  });

  describe('Short URL Handling', () => {
    it('should handle vm.tiktok.com URLs', async () => {
      const shortUrl = 'https://vm.tiktok.com/ZMdwnKB8Q/';
      expect(downloader.validateUrl(shortUrl)).toBe(true);
      expect(downloader['extractVideoId'](shortUrl)).toBe('ZMdwnKB8Q');
    });

    it('should handle vt.tiktok.com URLs', async () => {
      const shortUrl = 'https://vt.tiktok.com/ZSdpYGKdx/';
      expect(downloader.validateUrl(shortUrl)).toBe(true);
      expect(downloader['extractVideoId'](shortUrl)).toBe('ZSdpYGKdx');
    });

    it('should follow redirects for short URLs', async () => {
      mockGot.default.mockImplementation((url: string, options: any) => {
        if (options.followRedirect === false) {
          return Promise.reject({
            response: {
              headers: {
                location: 'https://www.tiktok.com/@creator/video/1234567890123456789'
              }
            }
          });
        }
        return Promise.resolve({ body: '<html></html>' });
      });

      const fullUrl = await downloader['resolveShortUrl']('https://vm.tiktok.com/short/');
      expect(fullUrl).toContain('@creator/video/');
    });
  });
});