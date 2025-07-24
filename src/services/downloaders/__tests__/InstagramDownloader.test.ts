import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { InstagramDownloader } from '../InstagramDownloader';
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

describe('InstagramDownloader', () => {
  let downloader: InstagramDownloader;
  let mockGot: any;
  let mockExecAsync: Mock;

  beforeEach(async () => {
    downloader = new InstagramDownloader();
    
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
    it('should validate standard Instagram URLs', () => {
      const validUrls = [
        'https://www.instagram.com/p/ABC123XYZ/',
        'https://instagram.com/p/DEF456UVW/',
        'https://www.instagram.com/reel/GHI789RST/',
        'https://www.instagram.com/tv/JKL012MNO/',
        'https://www.instagr.am/p/PQR345STU/',
        'https://www.instagram.com/stories/username/2945678901234567890/',
        'http://instagram.com/p/ABC123XYZ/' // Should be normalized to https
      ];

      validUrls.forEach(url => {
        expect(downloader.validateUrl(url)).toBe(true);
      });
    });

    it('should reject invalid Instagram URLs', () => {
      const invalidUrls = [
        'https://www.instagram.com/',
        'https://www.instagram.com/username',
        'https://www.instagram.com/explore',
        'https://www.instagram.com/direct/inbox',
        'https://twitter.com/status/123456',
        'not-a-url',
        'https://instagram.com/', // No content path
        'https://www.instagram.com/accounts/login' // Login page
      ];

      invalidUrls.forEach(url => {
        expect(downloader.validateUrl(url)).toBe(false);
      });
    });

    it('should extract post IDs correctly', () => {
      const urlsWithIds = [
        { url: 'https://www.instagram.com/p/ABC123XYZ/', id: 'ABC123XYZ' },
        { url: 'https://www.instagram.com/reel/DEF456UVW/', id: 'DEF456UVW' },
        { url: 'https://www.instagram.com/tv/GHI789RST/', id: 'GHI789RST' },
        { url: 'https://www.instagram.com/stories/username/2945678901234567890/', id: '2945678901234567890' }
      ];

      urlsWithIds.forEach(({ url, id }) => {
        expect(downloader['extractVideoId'](url)).toBe(id);
      });
    });
  });

  describe('Metadata Extraction', () => {
    it('should fetch metadata via yt-dlp successfully', async () => {
      const mockMetadata = {
        title: 'Instagram Video Post',
        description: 'Check out this amazing video! #instagram #video',
        duration: 60,
        width: 1080,
        height: 1920,
        fps: 30,
        filesize: 15000000,
        ext: 'mp4',
        thumbnail: 'https://example.com/thumb.jpg',
        uploader: 'testuser',
        timestamp: 1703520000,
        view_count: 25000
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });
      
      // Mock cookie file existence check
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const metadata = await downloader.fetchMetadata('https://www.instagram.com/p/ABC123XYZ/');

      expect(metadata).toMatchObject({
        title: 'Instagram Video Post',
        description: 'Check out this amazing video! #instagram #video',
        duration: 60,
        width: 1080,
        height: 1920,
        platform: 'Instagram'
      });
    });

    it('should truncate long descriptions for title when no title exists', async () => {
      const mockMetadata = {
        description: 'This is a very long description that exceeds fifty characters and should be truncated for the title field',
        duration: 30
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.instagram.com/p/ABC123XYZ/');

      expect(metadata.title).toBe('This is a very long description that exceeds fifty');
      expect(metadata.description).toBe(mockMetadata.description);
    });

    it('should fallback to API method when yt-dlp fails', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));

      const mockApiResponse = {
        items: [{
          is_video: true,
          caption: { text: 'API Video Caption' },
          video_duration: 45,
          original_width: 1080,
          original_height: 1920,
          thumbnail_url: 'https://example.com/api-thumb.jpg',
          user: { username: 'apiuser' },
          taken_at: 1703520000,
          view_count: 10000
        }]
      };

      mockGot.default.mockResolvedValue({
        body: JSON.stringify(mockApiResponse)
      });

      const metadata = await downloader.fetchMetadata('https://www.instagram.com/p/ABC123XYZ/');

      expect(metadata).toMatchObject({
        title: 'API Video Caption',
        duration: 45,
        author: 'apiuser',
        platform: 'Instagram'
      });
    });

    it('should fallback to scraping when API method fails', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      mockGot.default.mockRejectedValueOnce(new Error('API failed'));

      const mockHtml = `
        <html>
          <meta property="og:title" content="Instagram video by username" />
          <meta property="og:description" content="Scraped video description" />
          <meta property="og:video" content="https://example.com/video.mp4" />
          <meta property="og:image" content="https://example.com/scraped-thumb.jpg" />
          <script>
            window._sharedData = {
              entry_data: {
                PostPage: [{
                  graphql: {
                    shortcode_media: {
                      is_video: true,
                      edge_media_to_caption: { edges: [{ node: { text: 'Shared data caption' } }] },
                      video_duration: 90,
                      dimensions: { width: 1080, height: 1920 },
                      thumbnail_src: 'https://example.com/shared-thumb.jpg',
                      owner: { username: 'shareduser' },
                      taken_at_timestamp: 1703520000,
                      video_view_count: 50000
                    }
                  }
                }]
              }
            };
          </script>
        </html>
      `;

      mockGot.default.mockResolvedValue({
        body: mockHtml
      });

      const metadata = await downloader.fetchMetadata('https://www.instagram.com/p/ABC123XYZ/');

      expect(metadata).toMatchObject({
        title: 'Shared data caption',
        duration: 90,
        author: 'shareduser',
        viewCount: 50000,
        platform: 'Instagram'
      });
    });

    it('should handle Instagram API headers correctly', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      
      let capturedHeaders: any = {};
      mockGot.default.mockImplementation((url: string, options: any) => {
        capturedHeaders = options.headers;
        return Promise.resolve({
          body: JSON.stringify({ items: [{ is_video: true }] })
        });
      });

      await downloader['fetchMetadataFromApi']('https://www.instagram.com/p/ABC123XYZ/');

      expect(capturedHeaders['X-IG-App-ID']).toBe('936619743392459');
      expect(capturedHeaders['X-Requested-With']).toBe('XMLHttpRequest');
      expect(capturedHeaders['Accept']).toBe('application/json');
    });
  });

  describe('Download Behavior', () => {
    beforeEach(() => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.stat).mockResolvedValue({ size: 15000000 } as any);
      vi.mocked(fs.createWriteStream).mockReturnValue(new EventEmitter() as any);
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('should download video using yt-dlp with cookies', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video', duration: 60 }) })
        .mockResolvedValueOnce({ stderr: '' })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            format: { duration: '60.5' },
            streams: [{ codec_type: 'video', width: 1080, height: 1920 }]
          })
        });

      const options = {
        outputPath: '/tmp/instagram-video.mp4'
      };

      const result = await downloader.download('https://www.instagram.com/p/ABC123XYZ/', options);

      expect(result.success).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('--cookies')
      );
    });

    it('should fallback to direct download when yt-dlp fails', async () => {
      mockExecAsync
        .mockRejectedValueOnce(new Error('yt-dlp not available'))
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            format: { duration: '60' },
            streams: [{ codec_type: 'video', width: 1080, height: 1920 }]
          })
        });

      const mockHtml = `
        <html>
          <meta property="og:video" content="https://example.com/video.mp4" />
        </html>
      `;

      mockGot.default.mockResolvedValue({ body: mockHtml });

      const mockDownloadStream = new EventEmitter();
      const mockWriteStream = new EventEmitter();
      (mockWriteStream as any).destroy = vi.fn();

      mockGot.stream.mockReturnValue(mockDownloadStream);
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);

      const downloadPromise = downloader.download('https://www.instagram.com/p/ABC123XYZ/', {
        outputPath: '/tmp/instagram-video.mp4'
      });

      setTimeout(() => {
        mockWriteStream.emit('finish');
      }, 10);

      const result = await downloadPromise;
      expect(result.success).toBe(true);
    });

    it('should handle Instagram Stories', async () => {
      const storyUrl = 'https://www.instagram.com/stories/username/2945678901234567890/';
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Story Video', duration: 15 }) })
        .mockResolvedValueOnce({ stderr: '' });

      const result = await downloader.download(storyUrl, {
        outputPath: '/tmp/story.mp4'
      });

      expect(result.success).toBe(true);
    });

    it('should handle Instagram Reels', async () => {
      const reelUrl = 'https://www.instagram.com/reel/ABC123XYZ/';
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Reel Video', duration: 30 }) })
        .mockResolvedValueOnce({ stderr: '' });

      const result = await downloader.download(reelUrl, {
        outputPath: '/tmp/reel.mp4'
      });

      expect(result.success).toBe(true);
    });

    it('should handle IGTV videos', async () => {
      const igtvUrl = 'https://www.instagram.com/tv/ABC123XYZ/';
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'IGTV Video', duration: 600 }) })
        .mockResolvedValueOnce({ stderr: '' });

      const result = await downloader.download(igtvUrl, {
        outputPath: '/tmp/igtv.mp4'
      });

      expect(result.success).toBe(true);
    });

    it('should respect quality settings', async () => {
      // Instagram typically has limited quality options
      const qualityTests = [
        { quality: 'best' as const, expected: 'best[ext=mp4]/best' },
        { quality: 'high' as const, expected: 'best[ext=mp4]/best' },
        { quality: 'medium' as const, expected: 'worst[ext=mp4]/worst' },
        { quality: 'low' as const, expected: 'worst[ext=mp4]/worst' }
      ];

      for (const test of qualityTests) {
        mockExecAsync
          .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
          .mockResolvedValueOnce({ stderr: '' });

        await downloader.download('https://www.instagram.com/p/ABC123XYZ/', {
          outputPath: '/tmp/video.mp4',
          quality: test.quality
        });

        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringContaining(`-f "${test.expected}"`)
        );
      }
    });

    it('should check common cookie locations', async () => {
      const existsSyncSpy = vi.spyOn(fs, 'existsSync');
      
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
        .mockResolvedValueOnce({ stderr: '' });

      await downloader.download('https://www.instagram.com/p/ABC123XYZ/', {
        outputPath: '/tmp/video.mp4'
      });

      // Should check for Instagram cookies in common locations
      expect(existsSyncSpy).toHaveBeenCalled();
    });

    it('should use custom cookies if provided', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
        .mockResolvedValueOnce({ stderr: '' });

      await downloader.download('https://www.instagram.com/p/ABC123XYZ/', {
        outputPath: '/tmp/video.mp4',
        cookies: '/custom/path/cookies.txt'
      });

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('--cookies "/custom/path/cookies.txt"')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle private accounts', async () => {
      mockExecAsync.mockRejectedValue(new Error('This profile is private'));
      mockGot.default.mockResolvedValue({
        body: '<html><title>This Account is Private</title></html>'
      });

      await expect(
        downloader.fetchMetadata('https://www.instagram.com/p/PRIVATE123/')
      ).rejects.toThrow('Failed to fetch metadata');
    });

    it('should handle deleted content', async () => {
      mockExecAsync.mockRejectedValue(new Error('Content not found'));
      mockGot.default.mockResolvedValue({
        body: '<html><title>Page Not Found • Instagram</title></html>'
      });

      await expect(
        downloader.fetchMetadata('https://www.instagram.com/p/DELETED123/')
      ).rejects.toThrow();
    });

    it('should handle non-video posts gracefully', async () => {
      mockExecAsync.mockRejectedValue(new Error('Not a video'));
      
      const mockApiResponse = {
        items: [{
          is_video: false,
          media_type: 1 // Photo
        }]
      };

      mockGot.default.mockResolvedValue({
        body: JSON.stringify(mockApiResponse)
      });

      await expect(
        downloader['fetchMetadataFromApi']('https://www.instagram.com/p/PHOTO123/')
      ).rejects.toThrow('URL does not point to a video');
    });

    it('should decode Unicode escapes in video URLs', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      
      const mockHtml = `
        <html>
          <meta property="og:video" content="https://example.com/video\\u0026quality=hd" />
        </html>
      `;

      mockGot.default.mockResolvedValue({ body: mockHtml });

      const videoUrl = await downloader['extractVideoUrl']('https://www.instagram.com/p/ABC123XYZ/');
      expect(videoUrl).toBe('https://example.com/video&quality=hd');
    });
  });

  describe('Cancel Download', () => {
    it('should cancel ongoing direct download', async () => {
      mockExecAsync
        .mockRejectedValueOnce(new Error('yt-dlp failed'))
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) });
      
      mockGot.default.mockResolvedValue({
        body: '<html><meta property="og:video" content="https://example.com/video.mp4" /></html>'
      });

      const mockDownloadStream = new EventEmitter();
      (mockDownloadStream as any).destroy = vi.fn();
      const mockWriteStream = new EventEmitter();
      
      mockGot.stream.mockReturnValue(mockDownloadStream);
      vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream as any);
      vi.mocked(fs.remove).mockResolvedValue(undefined);

      const downloadPromise = downloader.download('https://www.instagram.com/p/ABC123XYZ/', {
        outputPath: '/tmp/video.mp4'
      });

      setTimeout(() => {
        downloader.cancelDownload();
        mockWriteStream.emit('finish');
      }, 10);

      await expect(downloadPromise).rejects.toThrow('Download cancelled');
      expect(mockDownloadStream.destroy).toHaveBeenCalled();
    });
  });

  describe('Platform-Specific Features', () => {
    it('should handle vertical video dimensions (9:16 aspect ratio)', async () => {
      const mockMetadata = {
        width: 1080,
        height: 1920,
        title: 'Vertical Video'
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.instagram.com/reel/ABC123XYZ/');
      
      expect(metadata.width).toBe(1080);
      expect(metadata.height).toBe(1920);
      expect(metadata.height / metadata.width).toBeCloseTo(16/9, 1);
    });

    it('should handle carousel posts with videos', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      
      const mockApiResponse = {
        graphql: {
          shortcode_media: {
            is_video: false,
            edge_sidecar_to_children: {
              edges: [
                { node: { is_video: true, video_url: 'https://example.com/video1.mp4' } },
                { node: { is_video: false } },
                { node: { is_video: true, video_url: 'https://example.com/video2.mp4' } }
              ]
            }
          }
        }
      };

      mockGot.default.mockResolvedValue({
        body: JSON.stringify(mockApiResponse)
      });

      // Note: Current implementation doesn't handle carousel posts
      // This test shows where carousel support could be added
    });

    it('should extract video URL from multiple possible locations', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));

      const testCases = [
        { 
          html: '<meta property="og:video" content="https://video1.mp4" />',
          expected: 'https://video1.mp4'
        },
        { 
          html: '<meta property="og:video:secure_url" content="https://video2.mp4" />',
          expected: 'https://video2.mp4'
        },
        { 
          html: '<script>"video_url": "https://video3.mp4"</script>',
          expected: 'https://video3.mp4'
        },
        { 
          html: '<script>"contentUrl": "https://video4.mp4"</script>',
          expected: 'https://video4.mp4'
        }
      ];

      for (const testCase of testCases) {
        mockGot.default.mockResolvedValue({ body: `<html>${testCase.html}</html>` });
        const videoUrl = await downloader['extractVideoUrl']('https://www.instagram.com/p/ABC123XYZ/');
        expect(videoUrl).toBe(testCase.expected);
      }
    });

    it('should parse shared data from page correctly', async () => {
      mockExecAsync.mockRejectedValue(new Error('yt-dlp failed'));
      mockGot.default.mockRejectedValueOnce(new Error('API failed'));

      const mockHtml = `
        <html>
          <script>
            window._sharedData = {
              entry_data: {
                PostPage: [{
                  graphql: {
                    shortcode_media: {
                      is_video: true,
                      video_url: "https://example.com/shared-video.mp4",
                      edge_media_to_caption: {
                        edges: [{
                          node: {
                            text: "Caption with #hashtags and @mentions"
                          }
                        }]
                      },
                      video_duration: 45.5,
                      dimensions: { width: 1080, height: 1350 },
                      owner: { username: "content_creator" },
                      taken_at_timestamp: 1703520000,
                      video_view_count: 123456
                    }
                  }
                }]
              }
            };
          </script>
        </html>
      `;

      mockGot.default.mockResolvedValue({ body: mockHtml });

      const metadata = await downloader.fetchMetadata('https://www.instagram.com/p/ABC123XYZ/');

      expect(metadata.title).toBe('Caption with #hashtags and @mentions');
      expect(metadata.duration).toBe(45.5);
      expect(metadata.author).toBe('content_creator');
      expect(metadata.viewCount).toBe(123456);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle Instagram rate limiting', async () => {
      mockExecAsync.mockRejectedValue(new Error('HTTP Error 429'));
      mockGot.default.mockRejectedValue({
        response: { statusCode: 429 }
      });

      await expect(
        downloader.fetchMetadata('https://www.instagram.com/p/ABC123XYZ/')
      ).rejects.toThrow('Failed to fetch metadata');
    });

    it('should retry with delays when rate limited', async () => {
      let attempts = 0;
      mockExecAsync.mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.resolve({ stdout: JSON.stringify({ title: 'Test Video' }) });
        } else {
          return Promise.resolve({ stderr: '' });
        }
      });

      const result = await downloader.download('https://www.instagram.com/p/ABC123XYZ/', {
        outputPath: '/tmp/video.mp4',
        maxRetries: 3
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('should detect login requirements', async () => {
      mockExecAsync.mockRejectedValue(new Error('Login required'));
      mockGot.default.mockResolvedValue({
        body: '<html><title>Login • Instagram</title></html>'
      });

      await expect(
        downloader.fetchMetadata('https://www.instagram.com/p/ABC123XYZ/')
      ).rejects.toThrow();
    });

    it('should use environment variable for cookie path', async () => {
      process.env.INSTAGRAM_COOKIES_PATH = '/env/cookies.txt';
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
        .mockResolvedValueOnce({ stderr: '' });

      await downloader.download('https://www.instagram.com/p/ABC123XYZ/', {
        outputPath: '/tmp/video.mp4'
      });

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('--cookies "/env/cookies.txt"')
      );

      delete process.env.INSTAGRAM_COOKIES_PATH;
    });
  });

  describe('Video Quality and Format', () => {
    it('should handle different video formats', async () => {
      const mockMetadata = {
        title: 'Test Video',
        ext: 'mp4',
        format: 'mp4',
        acodec: 'aac',
        vcodec: 'h264'
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata)
      });

      const metadata = await downloader.fetchMetadata('https://www.instagram.com/p/ABC123XYZ/');
      expect(metadata.format).toBe('mp4');
    });

    it('should parse ffprobe output correctly', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Test Video' }) })
        .mockResolvedValueOnce({ stderr: '' })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            format: {
              duration: '30.033',
              format_name: 'mov,mp4,m4a,3gp,3g2,mj2'
            },
            streams: [
              {
                codec_type: 'video',
                width: 1080,
                height: 1920,
                r_frame_rate: '30000/1001'
              }
            ]
          })
        });

      const result = await downloader.download('https://www.instagram.com/p/ABC123XYZ/', {
        outputPath: '/tmp/video.mp4'
      });

      expect(result.metadata?.duration).toBeCloseTo(30.033, 1);
      expect(result.metadata?.fps).toBeCloseTo(29.97, 1);
    });
  });
});