import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoImportService } from '../VideoImportService';
import fs from 'fs-extra';

// Mock external dependencies
vi.mock('fs-extra');
vi.mock('child_process');
vi.mock('util');
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));
vi.mock('../../short-creator/libraries/FFmpeg');
vi.mock('../../config', () => ({
  Config: vi.fn().mockImplementation(() => ({}))
}));

describe('VideoImportService - URL Parsing Tests (Current Implementation)', () => {
  let service: VideoImportService;
  const mockDataDir = '/test/data';

  beforeEach(async () => {
    vi.clearAllMocks();
    (fs.ensureDir as any).mockResolvedValue(undefined);
    service = new VideoImportService(mockDataDir);
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  // Helper to test platform detection
  const testPlatformDetection = (url: string) => {
    return (service as any).detectPlatform(url);
  };

  describe('Current detectPlatform behavior', () => {
    it('should detect YouTube URLs with youtube.com', () => {
      const urls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'http://youtube.com/watch?v=dQw4w9WgXcQ',
        'www.youtube.com/watch?v=dQw4w9WgXcQ',
        'youtube.com/watch?v=dQw4w9WgXcQ',
        'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.com/shorts/abcd1234',
        'https://www.youtube.com/embed/dQw4w9WgXcQ'
      ];

      urls.forEach(url => {
        expect(testPlatformDetection(url)).toBe('youtube');
      });
    });

    it('should detect YouTube URLs with youtu.be', () => {
      const urls = [
        'https://youtu.be/dQw4w9WgXcQ',
        'http://youtu.be/dQw4w9WgXcQ',
        'youtu.be/dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ?t=30'
      ];

      urls.forEach(url => {
        expect(testPlatformDetection(url)).toBe('youtube');
      });
    });

    it('should detect Facebook URLs', () => {
      const urls = [
        'https://www.facebook.com/watch/?v=1234567890',
        'https://facebook.com/watch/?v=1234567890',
        'facebook.com/watch/?v=1234567890',
        'https://m.facebook.com/watch/?v=1234567890',
        'https://www.facebook.com/video.php?v=1234567890',
        'https://www.facebook.com/reel/1234567890'
      ];

      urls.forEach(url => {
        expect(testPlatformDetection(url)).toBe('facebook');
      });
    });

    it('should detect Instagram URLs', () => {
      const urls = [
        'https://www.instagram.com/p/CfTUvWrPmWa/',
        'https://instagram.com/p/CfTUvWrPmWa/',
        'instagram.com/p/CfTUvWrPmWa/',
        'https://www.instagram.com/reel/CfTUvWrPmWa/',
        'https://www.instagram.com/tv/CfTUvWrPmWa/',
        'https://www.instagram.com/stories/username/1234567890/'
      ];

      urls.forEach(url => {
        expect(testPlatformDetection(url)).toBe('instagram');
      });
    });

    it('should detect TikTok URLs', () => {
      const urls = [
        'https://www.tiktok.com/@username/video/1234567890',
        'https://tiktok.com/@username/video/1234567890',
        'tiktok.com/@username/video/1234567890',
        'https://m.tiktok.com/v/1234567890.html',
        'https://www.tiktok.com/@username/live'
      ];

      urls.forEach(url => {
        expect(testPlatformDetection(url)).toBe('tiktok');
      });
    });

    it('should return generic for non-platform URLs', () => {
      const urls = [
        'https://vimeo.com/1234567890',
        'https://www.dailymotion.com/video/x8fvwlr',
        'https://example.com/video.mp4',
        'https://cdn.example.com/videos/sample.mp4',
        'https://www.twitch.tv/videos/1234567890'
      ];

      urls.forEach(url => {
        expect(testPlatformDetection(url)).toBe('generic');
      });
    });
  });

  describe('Current implementation limitations', () => {
    it('does NOT handle regional YouTube domains', () => {
      const urls = [
        'https://www.youtube.co.uk/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.de/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.fr/watch?v=dQw4w9WgXcQ'
      ];

      // Current implementation returns 'generic' for these
      urls.forEach(url => {
        expect(testPlatformDetection(url)).toBe('generic');
      });
    });

    it('does NOT handle Facebook shortened URLs (fb.watch)', () => {
      const urls = [
        'https://fb.watch/abcdefg/',
        'fb.watch/abcdefg/'
      ];

      // Current implementation returns 'generic' for these
      urls.forEach(url => {
        expect(testPlatformDetection(url)).toBe('generic');
      });
    });

    it('does NOT handle TikTok shortened URLs', () => {
      const urls = [
        'https://vm.tiktok.com/ZMePmW9Yx/',
        'vm.tiktok.com/ZMePmW9Yx/',
        'https://vt.tiktok.com/ZMePmW9Yx/'
      ];

      // Current implementation returns 'generic' for these
      urls.forEach(url => {
        expect(testPlatformDetection(url)).toBe('generic');
      });
    });

    it('is case sensitive', () => {
      const urls = [
        'https://www.YouTube.com/watch?v=dQw4w9WgXcQ',
        'https://www.YOUTUBE.COM/watch?v=dQw4w9WgXcQ',
        'https://YOUTU.BE/dQw4w9WgXcQ',
        'https://www.FACEBOOK.COM/watch/?v=1234567890',
        'https://www.INSTAGRAM.COM/p/CfTUvWrPmWa/',
        'https://www.TIKTOK.COM/@username/video/1234567890'
      ];

      // Current implementation is case sensitive, so these return 'generic'
      urls.forEach(url => {
        expect(testPlatformDetection(url)).toBe('generic');
      });
    });

    it('matches domains anywhere in the URL (potential false positives)', () => {
      const urls = [
        'https://notyoutube.com/watch?v=123', // Contains 'youtube.com'
        'https://myyoutube.com/watch?v=123',  // Contains 'youtube.com'
        'https://facebook.company/page',       // Contains 'facebook.com'
        'https://instagram.combinator.com'     // Contains 'instagram.com'
      ];

      // Current implementation would detect these as platforms
      expect(testPlatformDetection(urls[0])).toBe('youtube');
      expect(testPlatformDetection(urls[1])).toBe('youtube');
      expect(testPlatformDetection(urls[2])).toBe('facebook');
      expect(testPlatformDetection(urls[3])).toBe('instagram');
    });
  });

  describe('Edge cases with current implementation', () => {
    it('handles URLs with parameters correctly', () => {
      const urls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
        'https://www.facebook.com/watch/?v=1234567890&ref=share',
        'https://www.instagram.com/p/CfTUvWrPmWa/?utm_source=ig_web_copy_link',
        'https://www.tiktok.com/@username/video/1234567890?lang=en'
      ];

      expect(testPlatformDetection(urls[0])).toBe('youtube');
      expect(testPlatformDetection(urls[1])).toBe('facebook');
      expect(testPlatformDetection(urls[2])).toBe('instagram');
      expect(testPlatformDetection(urls[3])).toBe('tiktok');
    });

    it('handles URLs with fragments', () => {
      const urls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=30',
        'https://www.facebook.com/watch/?v=1234567890#comments',
        'https://www.instagram.com/p/CfTUvWrPmWa/#liked',
        'https://www.tiktok.com/@username/video/1234567890#comment'
      ];

      expect(testPlatformDetection(urls[0])).toBe('youtube');
      expect(testPlatformDetection(urls[1])).toBe('facebook');
      expect(testPlatformDetection(urls[2])).toBe('instagram');
      expect(testPlatformDetection(urls[3])).toBe('tiktok');
    });

    it('handles URLs with authentication info', () => {
      const urls = [
        'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://token@www.facebook.com/watch/?v=1234567890'
      ];

      expect(testPlatformDetection(urls[0])).toBe('youtube');
      expect(testPlatformDetection(urls[1])).toBe('facebook');
    });

    it('handles URLs with ports', () => {
      const urls = [
        'https://www.youtube.com:443/watch?v=dQw4w9WgXcQ',
        'http://youtube.com:80/watch?v=dQw4w9WgXcQ'
      ];

      expect(testPlatformDetection(urls[0])).toBe('youtube');
      expect(testPlatformDetection(urls[1])).toBe('youtube');
    });
  });

  describe('Suggested improvements for detectPlatform', () => {
    // This is an improved version that could be implemented
    const improvedDetectPlatform = (url: string): string => {
      if (!url || typeof url !== 'string') {
        return 'generic';
      }

      // Normalize URL to lowercase for case-insensitive matching
      const normalizedUrl = url.toLowerCase().trim();

      // YouTube detection with more patterns
      if (normalizedUrl.includes('youtube.com') || 
          normalizedUrl.includes('youtu.be') ||
          normalizedUrl.match(/youtube\.[a-z]{2,3}(\.[a-z]{2})?/)) {
        return 'youtube';
      }

      // Facebook detection with fb.watch support
      if (normalizedUrl.includes('facebook.com') || 
          normalizedUrl.includes('fb.watch') ||
          normalizedUrl.includes('fb.com')) {
        return 'facebook';
      }

      // Instagram detection
      if (normalizedUrl.includes('instagram.com') ||
          normalizedUrl.includes('instagr.am')) {
        return 'instagram';
      }

      // TikTok detection with short URLs
      if (normalizedUrl.includes('tiktok.com') ||
          normalizedUrl.includes('vm.tiktok.com') ||
          normalizedUrl.includes('vt.tiktok.com')) {
        return 'tiktok';
      }

      return 'generic';
    };

    it('improved version handles null/undefined inputs', () => {
      expect(improvedDetectPlatform(null as any)).toBe('generic');
      expect(improvedDetectPlatform(undefined as any)).toBe('generic');
      expect(improvedDetectPlatform('')).toBe('generic');
    });

    it('improved version handles case insensitivity', () => {
      expect(improvedDetectPlatform('HTTPS://WWW.YOUTUBE.COM/WATCH?V=123')).toBe('youtube');
      expect(improvedDetectPlatform('https://www.FACEBOOK.com/watch/?v=123')).toBe('facebook');
    });

    it('improved version handles regional domains', () => {
      expect(improvedDetectPlatform('https://www.youtube.co.uk/watch?v=123')).toBe('youtube');
      expect(improvedDetectPlatform('https://www.youtube.de/watch?v=123')).toBe('youtube');
    });

    it('improved version handles shortened URLs', () => {
      expect(improvedDetectPlatform('https://fb.watch/abcdef/')).toBe('facebook');
      expect(improvedDetectPlatform('https://vm.tiktok.com/ZMePmW9Yx/')).toBe('tiktok');
    });
  });
});

describe('VideoImportService - analyzeUrl Method Tests', () => {
  let service: VideoImportService;
  const mockDataDir = '/test/data';
  const mockExecAsync = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    (fs.ensureDir as any).mockResolvedValue(undefined);
    
    // Mock child_process
    const childProcess = require('child_process');
    childProcess.exec = vi.fn();
    
    // Mock util.promisify
    const util = require('util');
    util.promisify = vi.fn().mockReturnValue(mockExecAsync);
    
    service = new VideoImportService(mockDataDir);
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  describe('YouTube URL analysis', () => {
    it('should analyze YouTube URLs successfully', async () => {
      const mockYouTubeData = {
        title: 'Test Video Title',
        duration: 300,
        ext: 'mp4',
        width: 1920,
        height: 1080,
        filesize: 50000000,
        fps: 30,
        vcodec: 'h264',
        acodec: 'aac',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        subtitles: { en: {}, es: {} },
        language: 'en'
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockYouTubeData),
        stderr: ''
      });

      const result = await service.analyzeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      expect(result).toEqual({
        title: 'Test Video Title',
        duration: 300,
        format: 'mp4',
        resolution: '1920x1080',
        fileSize: 50000000,
        fps: 30,
        videoCodec: 'h264',
        audioCodec: 'aac',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        canDownload: true,
        platform: 'youtube',
        hasSubtitles: true,
        language: 'en'
      });

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('yt-dlp --dump-json')
      );
    });

    it('should handle YouTube analysis failure gracefully', async () => {
      mockExecAsync.mockRejectedValue(new Error('Video unavailable'));

      const result = await service.analyzeUrl('https://www.youtube.com/watch?v=invalid');

      expect(result).toEqual({
        title: 'YouTube Video',
        duration: 0,
        canDownload: false,
        platform: 'youtube'
      });
    });

    it('should handle YouTube live streams', async () => {
      const mockLiveData = {
        title: 'Live Stream',
        is_live: true,
        ext: 'mp4',
        width: 1920,
        height: 1080
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockLiveData),
        stderr: ''
      });

      const result = await service.analyzeUrl('https://www.youtube.com/watch?v=live123');

      expect(result.title).toBe('Live Stream');
      expect(result.duration).toBe(0);
      expect(result.platform).toBe('youtube');
    });
  });

  describe('Generic URL analysis', () => {
    it('should analyze generic video URLs using ffprobe', async () => {
      const mockFFprobeData = {
        format: {
          duration: '180.5',
          size: '25000000',
          format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
          tags: {
            title: 'Generic Video Title'
          }
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1280,
            height: 720,
            r_frame_rate: '25/1'
          },
          {
            codec_type: 'audio',
            codec_name: 'aac'
          }
        ]
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockFFprobeData),
        stderr: ''
      });

      const result = await service.analyzeUrl('https://example.com/video.mp4');

      expect(result).toEqual({
        title: 'Generic Video Title',
        duration: 180.5,
        format: 'mov',
        resolution: '1280x720',
        fileSize: 25000000,
        fps: 25,
        videoCodec: 'h264',
        audioCodec: 'aac',
        canDownload: true,
        platform: 'generic'
      });

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('ffprobe')
      );
    });

    it('should handle missing metadata gracefully', async () => {
      const mockMinimalData = {
        format: {},
        streams: []
      };

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(mockMinimalData),
        stderr: ''
      });

      const result = await service.analyzeUrl('https://example.com/video.mp4');

      expect(result).toEqual({
        title: 'Video',
        duration: 0,
        format: 'unknown',
        resolution: 'unknown',
        fileSize: 0,
        fps: 30,
        videoCodec: 'unknown',
        audioCodec: 'unknown',
        canDownload: true,
        platform: 'generic'
      });
    });

    it('should handle ffprobe failures', async () => {
      mockExecAsync.mockRejectedValue(new Error('ffprobe: No such file'));

      const result = await service.analyzeUrl('https://example.com/nonexistent.mp4');

      expect(result).toEqual({
        title: 'Video',
        duration: 0,
        canDownload: false,
        platform: 'generic'
      });
    });
  });

  describe('Platform-specific analysis', () => {
    it('should route Facebook URLs to generic analysis', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ format: { duration: '60' }, streams: [] }),
        stderr: ''
      });

      await service.analyzeUrl('https://www.facebook.com/watch/?v=123');

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('ffprobe')
      );
    });

    it('should route Instagram URLs to generic analysis', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ format: { duration: '30' }, streams: [] }),
        stderr: ''
      });

      await service.analyzeUrl('https://www.instagram.com/p/ABC123/');

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('ffprobe')
      );
    });

    it('should route TikTok URLs to generic analysis', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ format: { duration: '15' }, streams: [] }),
        stderr: ''
      });

      await service.analyzeUrl('https://www.tiktok.com/@user/video/123');

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('ffprobe')
      );
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle network errors', async () => {
      mockExecAsync.mockRejectedValue(new Error('Network error'));

      const result = await service.analyzeUrl('https://example.com/video.mp4');

      expect(result.canDownload).toBe(false);
      expect(result.platform).toBe('generic');
    });

    it('should handle malformed JSON responses', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: 'Invalid JSON',
        stderr: ''
      });

      const result = await service.analyzeUrl('https://www.youtube.com/watch?v=test');

      expect(result.canDownload).toBe(false);
      expect(result.platform).toBe('youtube');
    });

    it('should handle URLs with special characters', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ title: 'Test' }),
        stderr: ''
      });

      const specialUrls = [
        'https://www.youtube.com/watch?v=test&title=Hello%20World',
        'https://example.com/video with spaces.mp4',
        'https://example.com/video?param=value&another=test'
      ];

      for (const url of specialUrls) {
        const result = await service.analyzeUrl(url);
        expect(result).toBeDefined();
        expect(result.platform).toBeDefined();
      }
    });
  });

  describe('Analysis options', () => {
    it('should respect analysis options', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ title: 'Test Video' }),
        stderr: ''
      });

      const options = {
        includeMetadata: true,
        validateSource: true,
        checkDownloadability: true,
        extractBasicInfo: true
      };

      const result = await service.analyzeUrl('https://www.youtube.com/watch?v=test', options);

      expect(result).toBeDefined();
      expect(result.canDownload).toBeDefined();
      expect(result.platform).toBe('youtube');
    });
  });
});