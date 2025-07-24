import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseDownloader, DownloadOptions, VideoMetadata, DownloadResult } from '../BaseDownloader';
import { EventEmitter } from 'events';

// Mock logger
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Create a concrete implementation for testing
class TestDownloader extends BaseDownloader {
  protected platformName = 'TestPlatform';
  protected urlPattern = /^https?:\/\/(www\.)?test\.com\/video\/\d+/;

  protected extractVideoId(url: string): string | null {
    const match = url.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  }

  public async fetchMetadata(url: string): Promise<VideoMetadata> {
    return {
      title: 'Test Video',
      duration: 60,
      width: 1920,
      height: 1080,
      format: 'mp4',
      platform: this.platformName,
      originalUrl: url
    };
  }

  public async download(url: string, options: DownloadOptions): Promise<DownloadResult> {
    return {
      success: true,
      outputPath: options.outputPath,
      metadata: await this.fetchMetadata(url)
    };
  }

  public cancelDownload(): void {
    // Test implementation
  }

  protected getQualityMapping(quality: DownloadOptions['quality']): string {
    return quality || 'best';
  }
}

describe('BaseDownloader', () => {
  let downloader: TestDownloader;

  beforeEach(() => {
    downloader = new TestDownloader();
    vi.clearAllMocks();
  });

  describe('URL Validation', () => {
    it('should validate URLs matching the pattern', () => {
      const validUrls = [
        'https://www.test.com/video/123456',
        'https://test.com/video/789012',
        'http://www.test.com/video/345678'
      ];

      validUrls.forEach(url => {
        expect(downloader.validateUrl(url)).toBe(true);
      });
    });

    it('should reject URLs not matching the pattern', () => {
      const invalidUrls = [
        'https://other.com/video/123456',
        'https://test.com/image/123456',
        'https://test.com/video/',
        'not-a-url'
      ];

      invalidUrls.forEach(url => {
        expect(downloader.validateUrl(url)).toBe(false);
      });
    });

    it('should normalize URLs before validation', () => {
      // HTTP should be normalized to HTTPS
      expect(downloader.validateUrl('http://test.com/video/123456')).toBe(true);
      
      // Missing protocol should be added
      expect(downloader.validateUrl('test.com/video/123456')).toBe(true);
      
      // Already HTTPS should remain unchanged
      expect(downloader.validateUrl('https://test.com/video/123456')).toBe(true);
    });

    it('should handle validation errors gracefully', () => {
      // Override urlPattern to cause an error
      (downloader as any).urlPattern = null;
      
      expect(downloader.validateUrl('https://test.com/video/123456')).toBe(false);
    });
  });

  describe('URL Normalization', () => {
    it('should normalize HTTP to HTTPS', () => {
      const normalized = downloader['normalizeUrl']('http://test.com/video/123');
      expect(normalized).toBe('https://test.com/video/123');
    });

    it('should add protocol if missing', () => {
      const normalized = downloader['normalizeUrl']('test.com/video/123');
      expect(normalized).toBe('https://test.com/video/123');
    });

    it('should trim whitespace', () => {
      const normalized = downloader['normalizeUrl']('  https://test.com/video/123  ');
      expect(normalized).toBe('https://test.com/video/123');
    });

    it('should handle already normalized URLs', () => {
      const url = 'https://test.com/video/123';
      const normalized = downloader['normalizeUrl'](url);
      expect(normalized).toBe(url);
    });
  });

  describe('Event Emitter', () => {
    it('should emit progress events', async () => {
      const progressData = {
        percent: 50,
        downloaded: 5000000,
        total: 10000000,
        speed: 1000000,
        eta: 5
      };

      const promise = new Promise((resolve) => {
        downloader.on('progress', (data) => {
          expect(data).toEqual(progressData);
          resolve(undefined);
        });
      });

      downloader['emitProgress'](progressData);
      await promise;
    });

    it('should emit start events', async () => {
      const url = 'https://test.com/video/123';
      const metadata = {
        title: 'Test Video',
        duration: 60,
        width: 1920,
        height: 1080,
        format: 'mp4',
        platform: 'TestPlatform',
        originalUrl: url
      };

      const promise = new Promise((resolve) => {
        downloader.on('start', (data) => {
          expect(data.url).toBe(url);
          expect(data.metadata).toEqual(metadata);
          resolve(undefined);
        });
      });

      downloader['emitStart'](url, metadata);
      await promise;
    });

    it('should emit complete events', async () => {
      const result = {
        success: true,
        outputPath: '/tmp/video.mp4',
        metadata: {
          title: 'Test Video',
          duration: 60,
          width: 1920,
          height: 1080,
          format: 'mp4',
          platform: 'TestPlatform',
          originalUrl: 'https://test.com/video/123'
        }
      };

      const promise = new Promise((resolve) => {
        downloader.on('complete', (data) => {
          expect(data).toEqual(result);
          resolve(undefined);
        });
      });

      downloader['emitComplete'](result);
      await promise;
    });

    it('should emit error events', async () => {
      const error = new Error('Download failed');

      const promise = new Promise((resolve) => {
        downloader.on('error', (err) => {
          expect(err).toBe(error);
          resolve(undefined);
        });
      });

      downloader['emitError'](error);
      await promise;
    });
  });

  describe('Utility Methods', () => {
    describe('getUserAgent', () => {
      it('should return default user agent', () => {
        const ua = downloader['getUserAgent']();
        expect(ua).toContain('Mozilla');
        expect(ua).toContain('Chrome');
      });

      it('should return custom user agent if provided', () => {
        const customUA = 'CustomBot/1.0';
        const ua = downloader['getUserAgent'](customUA);
        expect(ua).toBe(customUA);
      });
    });

    describe('parseDuration', () => {
      it('should parse ISO 8601 duration format', () => {
        expect(downloader['parseDuration']('PT15S')).toBe(15);
        expect(downloader['parseDuration']('PT1M30S')).toBe(90);
        expect(downloader['parseDuration']('PT1H23M45S')).toBe(5025);
        expect(downloader['parseDuration']('PT2H')).toBe(7200);
        expect(downloader['parseDuration']('PT45M')).toBe(2700);
      });

      it('should parse HH:MM:SS format', () => {
        expect(downloader['parseDuration']('1:23:45')).toBe(5025);
        expect(downloader['parseDuration']('23:45')).toBe(1425);
        expect(downloader['parseDuration']('45')).toBe(45);
      });

      it('should return 0 for invalid formats', () => {
        expect(downloader['parseDuration']('invalid')).toBe(0);
        expect(downloader['parseDuration']('')).toBe(0);
        expect(downloader['parseDuration']('abc:def')).toBe(0);
      });
    });

    describe('formatFileSize', () => {
      it('should format file sizes correctly', () => {
        expect(downloader['formatFileSize'](512)).toBe('512.00 B');
        expect(downloader['formatFileSize'](1024)).toBe('1.00 KB');
        expect(downloader['formatFileSize'](1536)).toBe('1.50 KB');
        expect(downloader['formatFileSize'](1048576)).toBe('1.00 MB');
        expect(downloader['formatFileSize'](1572864)).toBe('1.50 MB');
        expect(downloader['formatFileSize'](1073741824)).toBe('1.00 GB');
      });

      it('should handle edge cases', () => {
        expect(downloader['formatFileSize'](0)).toBe('0.00 B');
        expect(downloader['formatFileSize'](1023)).toBe('1023.00 B');
        expect(downloader['formatFileSize'](1024 * 1024 * 1024 * 1024)).toBe('1024.00 GB');
      });
    });

    describe('createHeaders', () => {
      it('should create default headers', () => {
        const headers = downloader['createHeaders']();
        
        expect(headers['User-Agent']).toContain('Mozilla');
        expect(headers['Accept']).toBe('*/*');
        expect(headers['Accept-Language']).toBe('en-US,en;q=0.9');
        expect(headers['Accept-Encoding']).toBe('gzip, deflate');
        expect(headers['Connection']).toBe('keep-alive');
      });

      it('should include custom headers', () => {
        const options: DownloadOptions = {
          outputPath: '/tmp/video.mp4',
          headers: {
            'X-Custom-Header': 'custom-value',
            'Authorization': 'Bearer token123'
          }
        };

        const headers = downloader['createHeaders'](options);
        
        expect(headers['X-Custom-Header']).toBe('custom-value');
        expect(headers['Authorization']).toBe('Bearer token123');
      });

      it('should include cookies if provided', () => {
        const options: DownloadOptions = {
          outputPath: '/tmp/video.mp4',
          cookies: 'session=abc123; user=john'
        };

        const headers = downloader['createHeaders'](options);
        
        expect(headers['Cookie']).toBe('session=abc123; user=john');
      });

      it('should use custom user agent if provided', () => {
        const options: DownloadOptions = {
          outputPath: '/tmp/video.mp4',
          userAgent: 'CustomBot/2.0'
        };

        const headers = downloader['createHeaders'](options);
        
        expect(headers['User-Agent']).toBe('CustomBot/2.0');
      });

      it('should merge headers properly with custom headers taking precedence', () => {
        const options: DownloadOptions = {
          outputPath: '/tmp/video.mp4',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'OverriddenUA/1.0'
          },
          userAgent: 'ThisShouldBeIgnored/1.0'
        };

        const headers = downloader['createHeaders'](options);
        
        expect(headers['Accept']).toBe('application/json');
        expect(headers['User-Agent']).toBe('OverriddenUA/1.0');
      });
    });
  });

  describe('Abstract Methods', () => {
    it('should implement extractVideoId', () => {
      expect(downloader['extractVideoId']('https://test.com/video/123456')).toBe('123456');
      expect(downloader['extractVideoId']('https://test.com/other/path')).toBe(null);
    });

    it('should implement fetchMetadata', async () => {
      const metadata = await downloader.fetchMetadata('https://test.com/video/123');
      
      expect(metadata).toMatchObject({
        title: 'Test Video',
        duration: 60,
        platform: 'TestPlatform'
      });
    });

    it('should implement download', async () => {
      const result = await downloader.download('https://test.com/video/123', {
        outputPath: '/tmp/video.mp4'
      });
      
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/tmp/video.mp4');
    });

    it('should implement cancelDownload', () => {
      expect(() => downloader.cancelDownload()).not.toThrow();
    });

    it('should implement getQualityMapping', () => {
      expect(downloader['getQualityMapping']('best')).toBe('best');
      expect(downloader['getQualityMapping']('high')).toBe('high');
      expect(downloader['getQualityMapping']('medium')).toBe('medium');
      expect(downloader['getQualityMapping']('low')).toBe('low');
      expect(downloader['getQualityMapping'](undefined)).toBe('best');
    });
  });

  describe('EventEmitter inheritance', () => {
    it('should be an instance of EventEmitter', () => {
      expect(downloader).toBeInstanceOf(EventEmitter);
    });

    it('should support multiple listeners', () => {
      let count = 0;
      const listener1 = () => count++;
      const listener2 = () => count++;

      downloader.on('test', listener1);
      downloader.on('test', listener2);
      downloader.emit('test');

      expect(count).toBe(2);
    });

    it('should support removing listeners', () => {
      let called = false;
      const listener = () => called = true;

      downloader.on('test', listener);
      downloader.off('test', listener);
      downloader.emit('test');

      expect(called).toBe(false);
    });
  });
});