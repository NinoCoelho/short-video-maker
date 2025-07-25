import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PixabayProvider } from '../PixabayProvider';
import { OrientationEnum } from '../../../../../types/shorts';
import { VideoProviderConfig } from '../../types';

const mockConfig: VideoProviderConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 10000,
  userAgent: 'test-agent',
  rateLimit: {
    requestsPerSecond: 10,
    burstLimit: 50
  }
};

const mockApiKey = 'test-api-key';

describe('PixabayProvider', () => {
  let provider: PixabayProvider;
  let fetchSpy: any;

  beforeEach(() => {
    provider = new PixabayProvider(mockConfig, mockApiKey);
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  describe('searchVideos', () => {
    it('should return videos successfully', async () => {
      const mockResponse = {
        total: 1,
        totalHits: 1,
        hits: [{
          id: 123,
          pageURL: 'https://pixabay.com/videos/test-123',
          type: 'film',
          tags: 'test, video',
          duration: 30,
          videos: {
            large: {
              url: 'https://player.vimeo.com/external/test.mp4',
              width: 1920,
              height: 1080,
              size: 1024000
            }
          },
          views: 1000,
          downloads: 100,
          likes: 50,
          user: 'testuser',
          userImageURL: 'https://cdn.pixabay.com/user.jpg'
        }]
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await provider.searchVideos(['test'], 20, OrientationEnum.landscape, 10);

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0]).toEqual({
        id: 'pixabay_123',
        url: 'https://player.vimeo.com/external/test.mp4',
        duration: 30,
        width: 1920,
        height: 1080
      });
      expect(result.provider).toBe('Pixabay');
      expect(result.totalResults).toBe(1);
    });

    it('should handle empty search results gracefully', async () => {
      const mockResponse = {
        total: 0,
        totalHits: 0,
        hits: []
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await provider.searchVideos(['nonexistent'], 20, OrientationEnum.landscape, 10);

      expect(result.videos).toHaveLength(0);
      expect(result.totalResults).toBe(0);
      expect(result.provider).toBe('Pixabay');
    });

    it('should filter by orientation correctly', async () => {
      const mockResponse = {
        total: 2,
        totalHits: 2,
        hits: [
          {
            id: 123,
            pageURL: 'https://pixabay.com/videos/portrait-123',
            type: 'film',
            tags: 'portrait, video',
            duration: 30,
            videos: {
              large: {
                url: 'https://player.vimeo.com/external/portrait.mp4',
                width: 1080,
                height: 1920,
                size: 1024000
              }
            },
            views: 1000,
            downloads: 100,
            likes: 50,
            user: 'testuser',
            userImageURL: 'https://cdn.pixabay.com/user.jpg'
          },
          {
            id: 124,
            pageURL: 'https://pixabay.com/videos/landscape-124',
            type: 'film',
            tags: 'landscape, video',
            duration: 30,
            videos: {
              large: {
                url: 'https://player.vimeo.com/external/landscape.mp4',
                width: 1920,
                height: 1080,
                size: 1024000
              }
            },
            views: 1000,
            downloads: 100,
            likes: 50,
            user: 'testuser',
            userImageURL: 'https://cdn.pixabay.com/user.jpg'
          }
        ]
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await provider.searchVideos(['test'], 20, OrientationEnum.portrait, 10);

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].width).toBe(1080);
      expect(result.videos[0].height).toBe(1920);
    });

    it('should handle API errors gracefully', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        provider.searchVideos(['test'], 20, OrientationEnum.landscape, 10)
      ).rejects.toThrow('Network error');
    });

    it('should handle 404 response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(
        provider.searchVideos(['test'], 20, OrientationEnum.landscape, 10)
      ).rejects.toThrow();
    });

    it('should construct search parameters correctly', async () => {
      const mockResponse = {
        total: 0,
        totalHits: 0,
        hits: []
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await provider.searchVideos(['test', 'video'], 25, OrientationEnum.landscape, 5, 2);

      const actualCall = fetchSpy.mock.calls[0];
      const url = actualCall[0];
      
      expect(url).toContain('key=test-api-key');
      expect(url).toContain('q=test+video');
      expect(url).toContain('per_page=5');
      expect(url).toContain('page=2');
      expect(url).toContain('min_duration=20');
      expect(url).toContain('max_duration=45');
      expect(actualCall[1]).toEqual(expect.any(Object));
    });
  });

  describe('getVideoById', () => {
    it('should return video by ID successfully', async () => {
      const mockResponse = {
        total: 1,
        totalHits: 1,
        hits: [{
          id: 123,
          pageURL: 'https://pixabay.com/videos/test-123',
          type: 'film',
          tags: 'test, video',
          duration: 30,
          videos: {
            medium: {
              url: 'https://player.vimeo.com/external/test.mp4',
              width: 1280,
              height: 720,
              size: 512000
            }
          },
          views: 1000,
          downloads: 100,
          likes: 50,
          user: 'testuser',
          userImageURL: 'https://cdn.pixabay.com/user.jpg'
        }]
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await provider.getVideoById('pixabay_123');

      expect(result).toEqual({
        id: 'pixabay_123',
        url: 'https://player.vimeo.com/external/test.mp4',
        duration: 30,
        width: 1280,
        height: 720
      });
    });

    it('should throw error when video not found', async () => {
      const mockResponse = {
        total: 0,
        totalHits: 0,
        hits: []
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await expect(
        provider.getVideoById('pixabay_999')
      ).rejects.toThrow('Video with ID pixabay_999 not found');
    });
  });

  describe('checkRateLimit', () => {
    it('should return correct rate limit info', async () => {
      const rateLimit = await provider.checkRateLimit();

      expect(rateLimit).toEqual({
        remaining: 5000,
        reset: expect.any(Number),
        limit: 5000
      });
    });

    it('should decrease remaining requests after API calls', async () => {
      const mockResponse = {
        total: 0,
        totalHits: 0,
        hits: []
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await provider.searchVideos(['test'], 20, OrientationEnum.landscape, 10);

      const rateLimit = await provider.checkRateLimit();
      expect(rateLimit.remaining).toBe(4999);
    });
  });

  describe('selectBestVideoFile', () => {
    it('should prefer large quality', () => {
      const provider = new PixabayProvider(mockConfig, mockApiKey);
      const videos = {
        large: { url: 'large.mp4', width: 1920, height: 1080 },
        medium: { url: 'medium.mp4', width: 1280, height: 720 },
        small: { url: 'small.mp4', width: 640, height: 360 }
      };

      const result = (provider as any).selectBestVideoFile(videos);
      expect(result.url).toBe('large.mp4');
    });

    it('should fallback to medium when large not available', () => {
      const provider = new PixabayProvider(mockConfig, mockApiKey);
      const videos = {
        medium: { url: 'medium.mp4', width: 1280, height: 720 },
        small: { url: 'small.mp4', width: 640, height: 360 }
      };

      const result = (provider as any).selectBestVideoFile(videos);
      expect(result.url).toBe('medium.mp4');
    });

    it('should throw error when no video files available', () => {
      const provider = new PixabayProvider(mockConfig, mockApiKey);
      const videos = {};

      expect(() => (provider as any).selectBestVideoFile(videos))
        .toThrow('No video files available');
    });
  });

  describe('extractIdFromUrl', () => {
    it('should extract ID from Pixabay URL', () => {
      const provider = new PixabayProvider(mockConfig, mockApiKey);
      const url = 'https://pixabay.com/videos/nature-forest-123/';
      
      const result = (provider as any).extractIdFromUrl(url);
      expect(result).toBe('pixabay_123');
    });

    it('should return null for invalid URL', () => {
      const provider = new PixabayProvider(mockConfig, mockApiKey);
      const url = 'https://example.com/invalid';
      
      const result = (provider as any).extractIdFromUrl(url);
      expect(result).toBeNull();
    });
  });
});