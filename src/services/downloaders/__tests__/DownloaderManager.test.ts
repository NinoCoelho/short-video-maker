import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DownloaderManager } from '../DownloaderManager';
import { YouTubeDownloader } from '../YouTubeDownloader';
import { FacebookDownloader } from '../FacebookDownloader';
import { InstagramDownloader } from '../InstagramDownloader';
import { TikTokDownloader } from '../TikTokDownloader';
import { GenericDownloader } from '../GenericDownloader';
import { DownloadOptions, VideoMetadata, DownloadResult } from '../BaseDownloader';

// Mock all downloaders
vi.mock('../YouTubeDownloader');
vi.mock('../FacebookDownloader');
vi.mock('../InstagramDownloader');
vi.mock('../TikTokDownloader');
vi.mock('../GenericDownloader');
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('DownloaderManager', () => {
  let manager: DownloaderManager;

  beforeEach(() => {
    manager = new DownloaderManager();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize all downloaders', () => {
      expect(YouTubeDownloader).toHaveBeenCalled();
      expect(FacebookDownloader).toHaveBeenCalled();
      expect(InstagramDownloader).toHaveBeenCalled();
      expect(TikTokDownloader).toHaveBeenCalled();
      expect(GenericDownloader).toHaveBeenCalled();
    });
  });

  describe('detectPlatform', () => {
    it('should detect YouTube platform', () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      
      const platform = manager.detectPlatform('https://www.youtube.com/watch?v=123');
      expect(platform).toBe('youtube');
    });

    it('should detect Facebook platform', () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(FacebookDownloader.prototype.validateUrl).mockReturnValue(true);
      
      const platform = manager.detectPlatform('https://www.facebook.com/watch/?v=123');
      expect(platform).toBe('facebook');
    });

    it('should detect Instagram platform', () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(FacebookDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(InstagramDownloader.prototype.validateUrl).mockReturnValue(true);
      
      const platform = manager.detectPlatform('https://www.instagram.com/p/ABC/');
      expect(platform).toBe('instagram');
    });

    it('should detect TikTok platform', () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(FacebookDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(InstagramDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(TikTokDownloader.prototype.validateUrl).mockReturnValue(true);
      
      const platform = manager.detectPlatform('https://www.tiktok.com/@user/video/123');
      expect(platform).toBe('tiktok');
    });

    it('should return generic for unsupported URLs', () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(FacebookDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(InstagramDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(TikTokDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(GenericDownloader.prototype.validateUrl).mockReturnValue(false);
      
      const platform = manager.detectPlatform('https://unsupported.com/video');
      expect(platform).toBe('generic');
    });
  });

  describe('getDownloader', () => {
    it('should return correct downloader by platform', () => {
      const youtube = manager.getDownloader('youtube');
      expect(youtube).toBeInstanceOf(YouTubeDownloader);

      const facebook = manager.getDownloader('facebook');
      expect(facebook).toBeInstanceOf(FacebookDownloader);

      const instagram = manager.getDownloader('instagram');
      expect(instagram).toBeInstanceOf(InstagramDownloader);

      const tiktok = manager.getDownloader('tiktok');
      expect(tiktok).toBeInstanceOf(TikTokDownloader);

      const generic = manager.getDownloader('generic');
      expect(generic).toBeInstanceOf(GenericDownloader);
    });

    it('should return null for unknown platform', () => {
      const downloader = manager.getDownloader('unknown');
      expect(downloader).toBeNull();
    });

    it('should be case-insensitive', () => {
      const downloader = manager.getDownloader('YOUTUBE');
      expect(downloader).toBeInstanceOf(YouTubeDownloader);
    });
  });

  describe('getSupportedPlatforms', () => {
    it('should return all supported platforms', () => {
      const platforms = manager.getSupportedPlatforms();
      
      expect(platforms).toContain('youtube');
      expect(platforms).toContain('facebook');
      expect(platforms).toContain('instagram');
      expect(platforms).toContain('tiktok');
      expect(platforms).toContain('generic');
      expect(platforms).toHaveLength(5);
    });
  });

  describe('isUrlSupported', () => {
    it('should return true for supported platform URLs', () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      
      const result = manager.isUrlSupported('https://www.youtube.com/watch?v=123');
      expect(result).toBe(true);
    });

    it('should return true even for generic URLs', () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(FacebookDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(InstagramDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(TikTokDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(GenericDownloader.prototype.validateUrl).mockReturnValue(false);

      // detectPlatform returns 'generic' when no specific platform is found
      const result = manager.isUrlSupported('https://unsupported.com/video');
      expect(result).toBe(true);
    });
  });

  describe('fetchMetadata', () => {
    it('should fetch metadata from appropriate downloader', async () => {
      const mockMetadata: VideoMetadata = {
        title: 'Test Video',
        duration: 60,
        width: 1920,
        height: 1080,
        format: 'mp4',
        platform: 'YouTube',
        originalUrl: 'https://www.youtube.com/watch?v=123'
      };

      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(YouTubeDownloader.prototype.fetchMetadata).mockResolvedValue(mockMetadata);

      const metadata = await manager.fetchMetadata('https://www.youtube.com/watch?v=123');
      
      expect(metadata).toMatchObject({
        ...mockMetadata,
        platform: 'youtube' // Manager adds lowercase platform
      });
      expect(YouTubeDownloader.prototype.fetchMetadata).toHaveBeenCalledWith('https://www.youtube.com/watch?v=123');
    });

    it('should handle errors from downloaders', async () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(YouTubeDownloader.prototype.fetchMetadata).mockRejectedValue(
        new Error('Failed to fetch')
      );

      await expect(
        manager.fetchMetadata('https://www.youtube.com/watch?v=123')
      ).rejects.toThrow('Failed to fetch metadata from youtube');
    });
  });

  describe('download', () => {
    it('should download using appropriate downloader', async () => {
      const mockResult: DownloadResult = {
        success: true,
        outputPath: '/tmp/video.mp4',
        metadata: {
          title: 'Facebook Video',
          duration: 120,
          width: 1280,
          height: 720,
          format: 'mp4',
          platform: 'Facebook',
          originalUrl: 'https://www.facebook.com/watch/?v=123'
        }
      };

      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(FacebookDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(FacebookDownloader.prototype.download).mockResolvedValue(mockResult);

      const result = await manager.download(
        'https://www.facebook.com/watch/?v=123',
        '/tmp/video.mp4',
        { quality: 'high' }
      );
      
      expect(result).toMatchObject({
        ...mockResult,
        metadata: {
          ...mockResult.metadata,
          platform: 'facebook' // Manager adds lowercase platform
        }
      });
      
      // Check that download was called with properly merged options
      expect(FacebookDownloader.prototype.download).toHaveBeenCalledWith(
        'https://www.facebook.com/watch/?v=123',
        expect.objectContaining({
          outputPath: '/tmp/video.mp4',
          quality: 'high',
          format: 'mp4',
          maxRetries: 3
        })
      );
    });

    it('should merge options with defaults', async () => {
      vi.mocked(InstagramDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(InstagramDownloader.prototype.download).mockResolvedValue({
        success: true,
        outputPath: '/tmp/video.mp4'
      });

      await manager.download(
        'https://www.instagram.com/p/ABC/',
        '/tmp/video.mp4',
        {
          quality: 'medium',
          format: 'webm',
          maxDuration: 300,
          userAgent: 'CustomBot/1.0',
          cookies: 'session=abc123',
          headers: { 'X-Custom': 'value' },
          timeout: 60000,
          maxRetries: 5
        }
      );
      
      expect(InstagramDownloader.prototype.download).toHaveBeenCalledWith(
        'https://www.instagram.com/p/ABC/',
        {
          outputPath: '/tmp/video.mp4',
          quality: 'medium',
          format: 'webm',
          maxDuration: 300,
          timeout: 60000,
          maxRetries: 5,
          userAgent: 'CustomBot/1.0',
          cookies: 'session=abc123',
          headers: { 'X-Custom': 'value' }
        }
      );
    });

    it('should handle download failures', async () => {
      vi.mocked(TikTokDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(TikTokDownloader.prototype.download).mockRejectedValue(
        new Error('Download failed')
      );

      await expect(
        manager.download('https://www.tiktok.com/@user/video/123', '/tmp/video.mp4')
      ).rejects.toThrow('Failed to download from tiktok');
    });

    it('should set and clear active downloader', async () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(YouTubeDownloader.prototype.download).mockImplementation(async () => {
        // Check that active downloader is set during download
        expect(manager['activeDownloader']).toBeInstanceOf(YouTubeDownloader);
        return { success: true, outputPath: '/tmp/video.mp4' };
      });

      await manager.download('https://www.youtube.com/watch?v=123', '/tmp/video.mp4');
      
      // Check that active downloader is cleared after download
      expect(manager['activeDownloader']).toBeNull();
    });
  });

  describe('cancelDownload', () => {
    it('should cancel active download', async () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(YouTubeDownloader.prototype.cancelDownload).mockImplementation(() => {});
      
      // Start a download that will hang
      vi.mocked(YouTubeDownloader.prototype.download).mockImplementation(() => new Promise(() => {}));
      
      const downloadPromise = manager.download('https://www.youtube.com/watch?v=123', '/tmp/video.mp4');
      
      // Give it a moment to set active downloader
      await new Promise(resolve => setTimeout(resolve, 10));
      
      manager.cancelDownload();
      
      expect(YouTubeDownloader.prototype.cancelDownload).toHaveBeenCalled();
      expect(manager['activeDownloader']).toBeNull();
    });

    it('should do nothing if no active download', () => {
      expect(() => manager.cancelDownload()).not.toThrow();
    });
  });

  describe('getPlatformFeatures', () => {
    it('should return correct features for each platform', () => {
      const youtubeFeatures = manager.getPlatformFeatures('youtube');
      expect(youtubeFeatures).toEqual({
        supportsQuality: true,
        supportsMetadata: true,
        requiresCookies: false,
        supportedFormats: ['mp4', 'webm']
      });

      const instagramFeatures = manager.getPlatformFeatures('instagram');
      expect(instagramFeatures).toEqual({
        supportsQuality: false,
        supportsMetadata: true,
        requiresCookies: true,
        supportedFormats: ['mp4']
      });

      const genericFeatures = manager.getPlatformFeatures('generic');
      expect(genericFeatures).toEqual({
        supportsQuality: false,
        supportsMetadata: true,
        requiresCookies: false,
        supportedFormats: ['mp4', 'webm', 'mov', 'avi', 'mkv']
      });
    });

    it('should return generic features for unknown platform', () => {
      const features = manager.getPlatformFeatures('unknown');
      expect(features).toEqual({
        supportsQuality: false,
        supportsMetadata: true,
        requiresCookies: false,
        supportedFormats: ['mp4', 'webm', 'mov', 'avi', 'mkv']
      });
    });
  });

  describe('batchDownload', () => {
    it('should download multiple videos sequentially', async () => {
      const urls = [
        'https://www.youtube.com/watch?v=123',
        'https://www.facebook.com/watch/?v=456',
        'https://www.instagram.com/p/ABC/'
      ];

      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockImplementation(url => url.includes('youtube'));
      vi.mocked(FacebookDownloader.prototype.validateUrl).mockImplementation(url => url.includes('facebook'));
      vi.mocked(InstagramDownloader.prototype.validateUrl).mockImplementation(url => url.includes('instagram'));

      const mockResults = [
        { success: true, outputPath: '/output/video_1_123.mp4' },
        { success: true, outputPath: '/output/video_2_123.mp4' },
        { success: false, error: new Error('Instagram failed') }
      ];

      vi.mocked(YouTubeDownloader.prototype.download).mockResolvedValue(mockResults[0]);
      vi.mocked(FacebookDownloader.prototype.download).mockResolvedValue(mockResults[1]);
      vi.mocked(InstagramDownloader.prototype.download).mockRejectedValue(new Error('Instagram failed'));

      const batchProgressEvents: any[] = [];
      const batchErrorEvents: any[] = [];
      manager.on('batch:progress', (data) => batchProgressEvents.push(data));
      manager.on('batch:error', (data) => batchErrorEvents.push(data));

      const results = await manager.batchDownload(urls, '/output');

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(false);
      
      expect(batchProgressEvents).toHaveLength(2);
      expect(batchErrorEvents).toHaveLength(1);
    });
  });

  describe('estimateDownloadSize', () => {
    it('should return file size from metadata', async () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(YouTubeDownloader.prototype.fetchMetadata).mockResolvedValue({
        title: 'Test Video',
        duration: 60,
        width: 1920,
        height: 1080,
        format: 'mp4',
        fileSize: 50000000,
        platform: 'YouTube',
        originalUrl: 'https://www.youtube.com/watch?v=123'
      });

      const size = await manager.estimateDownloadSize('https://www.youtube.com/watch?v=123');
      expect(size).toBe(50000000);
    });

    it('should return null if no file size available', async () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(YouTubeDownloader.prototype.fetchMetadata).mockResolvedValue({
        title: 'Test Video',
        duration: 60,
        width: 1920,
        height: 1080,
        format: 'mp4',
        platform: 'YouTube',
        originalUrl: 'https://www.youtube.com/watch?v=123'
      });

      const size = await manager.estimateDownloadSize('https://www.youtube.com/watch?v=123');
      expect(size).toBeNull();
    });

    it('should return null on error', async () => {
      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(YouTubeDownloader.prototype.fetchMetadata).mockRejectedValue(new Error('Failed'));

      const size = await manager.estimateDownloadSize('https://www.youtube.com/watch?v=123');
      expect(size).toBeNull();
    });
  });

  describe('validateUrls', () => {
    it('should separate valid and invalid URLs', () => {
      const urls = [
        'https://www.youtube.com/watch?v=123',
        'https://www.facebook.com/watch/?v=456',
        'https://invalid.com/video',
        'not-a-url'
      ];

      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockImplementation(url => url.includes('youtube'));
      vi.mocked(FacebookDownloader.prototype.validateUrl).mockImplementation(url => url.includes('facebook'));
      vi.mocked(InstagramDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(TikTokDownloader.prototype.validateUrl).mockReturnValue(false);
      vi.mocked(GenericDownloader.prototype.validateUrl).mockReturnValue(false);

      const { valid, invalid } = manager.validateUrls(urls);

      // All URLs are considered valid because detectPlatform returns 'generic' for unsupported URLs
      expect(valid).toHaveLength(4);
      expect(invalid).toHaveLength(0);
    });
  });

  describe('Event Forwarding', () => {
    it('should forward events from downloaders with platform info', async () => {
      const startEvent = vi.fn();
      const progressEvent = vi.fn();
      const completeEvent = vi.fn();
      const errorEvent = vi.fn();

      manager.on('start', startEvent);
      manager.on('progress', progressEvent);
      manager.on('complete', completeEvent);
      manager.on('error', errorEvent);

      // Get YouTube downloader and emit events
      const youtube = manager.getDownloader('youtube');
      youtube?.emit('start', { url: 'test', metadata: {} });
      youtube?.emit('progress', { percent: 50 });
      youtube?.emit('complete', { success: true });
      youtube?.emit('error', new Error('Test error'));

      expect(startEvent).toHaveBeenCalledWith(expect.objectContaining({ platform: 'youtube' }));
      expect(progressEvent).toHaveBeenCalledWith(expect.objectContaining({ platform: 'youtube' }));
      expect(completeEvent).toHaveBeenCalledWith(expect.objectContaining({ platform: 'youtube' }));
      expect(errorEvent).toHaveBeenCalledWith(expect.objectContaining({ platform: 'youtube' }));
    });
  });

  describe('Config Management', () => {
    it('should use config defaults', async () => {
      const configuredManager = new DownloaderManager({
        defaultQuality: 'high',
        defaultFormat: 'webm',
        maxRetries: 5,
        timeout: 30000,
        userAgent: 'TestBot/1.0'
      });

      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(YouTubeDownloader.prototype.download).mockResolvedValue({
        success: true,
        outputPath: '/tmp/video.webm'
      });

      await configuredManager.download('https://www.youtube.com/watch?v=123', '/tmp/video.webm');

      expect(YouTubeDownloader.prototype.download).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=123',
        expect.objectContaining({
          quality: 'high',
          format: 'webm',
          maxRetries: 5,
          timeout: 30000,
          userAgent: 'TestBot/1.0'
        })
      );
    });

    it('should allow overriding config per download', async () => {
      const configuredManager = new DownloaderManager({
        defaultQuality: 'high',
        defaultFormat: 'webm'
      });

      vi.mocked(YouTubeDownloader.prototype.validateUrl).mockReturnValue(true);
      vi.mocked(YouTubeDownloader.prototype.download).mockResolvedValue({
        success: true,
        outputPath: '/tmp/video.mp4'
      });

      await configuredManager.download(
        'https://www.youtube.com/watch?v=123',
        '/tmp/video.mp4',
        { quality: 'low', format: 'mp4' }
      );

      expect(YouTubeDownloader.prototype.download).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=123',
        expect.objectContaining({
          quality: 'low',
          format: 'mp4'
        })
      );
    });
  });
});