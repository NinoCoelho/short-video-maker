import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoProviderFacade } from '../VideoProviderFacade';
import { OrientationEnum } from '../../../types/shorts';
import { VideoSearchError } from '../VideoProvider';

// Mock dependencies
vi.mock('fs-extra', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readJsonSync: vi.fn().mockReturnValue({
      providers: {
        pexels: { enabled: false },
        pixabay: { enabled: false },
        coverr: { enabled: false },
        freepik: { enabled: false }
      },
      negativeKeywords: [],
      usageTracking: { enabled: false, maxHistoryDays: 30, preventRepeatsWithinDays: 7 },
      search: { parallelTimeout: 5000, minDuration: 5, maxDuration: 30, preferredAspectRatio: "9:16" }
    })
  };
});

vi.mock('../Videos/VideoUsageTracker', () => ({
  VideoUsageTracker: vi.fn().mockImplementation(() => ({
    markVideoAsUsed: vi.fn(),
    isVideoRecentlyUsed: vi.fn().mockReturnValue(false),
    getVideoUsageStats: vi.fn().mockReturnValue({ total: 0, recent: 0 })
  }))
}));

vi.mock('../Videos/VideoKeywordFilter', () => ({
  VideoKeywordFilter: vi.fn().mockImplementation(() => ({
    filterVideos: vi.fn().mockImplementation((videos) => videos),
    filterSearchTerms: vi.fn().mockImplementation((terms) => terms)
  }))
}));

vi.mock('../Videos/VideoRateLimiter', () => ({
  VideoRateLimiter: vi.fn().mockImplementation(() => ({
    canMakeRequest: vi.fn().mockReturnValue(true),
    recordRequest: vi.fn(),
    setProviderConfig: vi.fn(),
    isProviderAvailable: vi.fn().mockReturnValue(true)
  }))
}));

vi.mock('../../services/ImageCacheService', () => ({
  ImageCacheService: vi.fn().mockImplementation(() => ({
    getCachedImagePath: vi.fn(),
    cacheImage: vi.fn()
  }))
}));

vi.mock('../Videos/SearchFallbackStrategy', () => ({
  SearchFallbackStrategy: vi.fn().mockImplementation(() => ({
    getSuggestedFallbacks: vi.fn().mockReturnValue([])
  }))
}));

describe('VideoProviderFacade', () => {
  let facade: VideoProviderFacade;
  let mockProvider: any;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      dataDirPath: '/tmp/test',
      pexelsApiKey: '',
      pixabayApiKey: ''
    };
    
    facade = new VideoProviderFacade(mockConfig);
    
    mockProvider = {
      searchVideos: vi.fn(),
      getVideoById: vi.fn(),
      checkRateLimit: vi.fn().mockResolvedValue({
        remaining: 100,
        reset: Date.now() + 3600000,
        limit: 1000
      }),
      isHealthy: vi.fn().mockReturnValue(true)
    };

    (facade as any).providers.set('test', mockProvider);
  });

  describe('searchAcrossProviders', () => {
    it('should handle provider search failures gracefully', async () => {
      const searchError = new VideoSearchError('No videos found for search: broken');
      mockProvider.searchVideos.mockRejectedValue(searchError);

      const result = await facade.searchAcrossProviders(
        ['broken'],
        30,
        OrientationEnum.landscape,
        5
      );

      expect(result.videos).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('test: No videos found for search: broken');
    });

    it('should handle multiple provider failures', async () => {
      const mockProvider2 = {
        searchVideos: vi.fn().mockRejectedValue(new Error('API limit exceeded')),
        checkRateLimit: vi.fn().mockResolvedValue({
          remaining: 0,
          reset: Date.now() + 3600000,
          limit: 1000
        })
      };

      (facade as any).providers.set('test2', mockProvider2);
      
      mockProvider.searchVideos.mockRejectedValue(new VideoSearchError('No videos found'));

      const result = await facade.searchAcrossProviders(
        ['broken'],
        30,
        OrientationEnum.landscape,
        5
      );

      expect(result.videos).toHaveLength(0);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.some(e => e.includes('No videos found'))).toBe(true);
      expect(result.errors.some(e => e.includes('API limit exceeded'))).toBe(true);
    });

    it('should succeed with at least one working provider', async () => {
      const mockProvider2 = {
        searchVideos: vi.fn().mockResolvedValue({
          videos: [{
            id: 'test_123',
            url: 'https://example.com/video.mp4',
            duration: 30,
            width: 1920,
            height: 1080
          }],
          provider: 'test2',
          searchTime: 1000,
          totalResults: 1
        }),
        checkRateLimit: vi.fn().mockResolvedValue({
          remaining: 100,
          reset: Date.now() + 3600000,
          limit: 1000
        })
      };

      (facade as any).providers.set('test2', mockProvider2);
      
      mockProvider.searchVideos.mockRejectedValue(new VideoSearchError('No videos found'));

      const result = await facade.searchAcrossProviders(
        ['nature'],
        30,
        OrientationEnum.landscape,
        5
      );

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].id).toBe('test_123');
      expect(result.errors).toHaveLength(1);
    });

    it('should handle empty results from providers', async () => {
      mockProvider.searchVideos.mockResolvedValue({
        videos: [],
        provider: 'test',
        searchTime: 500,
        totalResults: 0
      });

      const result = await facade.searchAcrossProviders(
        ['nonexistent'],
        30,
        OrientationEnum.landscape,
        5
      );

      expect(result.videos).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.searchTime).toBeGreaterThan(0);
    });

    it('should respect timeout parameter', async () => {
      mockProvider.searchVideos.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          videos: [],
          provider: 'test',
          searchTime: 3000,
          totalResults: 0
        }), 2000))
      );

      const startTime = Date.now();
      const result = await facade.searchAcrossProviders(
        ['slow'],
        30,
        OrientationEnum.landscape,
        5,
        1000 // 1 second timeout
      );
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(1500); // Should timeout before 2 seconds
      expect(result.videos).toHaveLength(0);
    });

    it('should handle network errors', async () => {
      mockProvider.searchVideos.mockRejectedValue(new Error('Network timeout'));

      const result = await facade.searchAcrossProviders(
        ['test'],
        30,
        OrientationEnum.landscape,
        5
      );

      expect(result.videos).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Network timeout');
    });

    it('should deduplicate videos across providers', async () => {
      const duplicateVideo = {
        id: 'duplicate_123',
        url: 'https://example.com/same-video.mp4',
        duration: 30,
        width: 1920,
        height: 1080
      };

      const mockProvider2 = {
        searchVideos: vi.fn().mockResolvedValue({
          videos: [duplicateVideo],
          provider: 'test2',
          searchTime: 800,
          totalResults: 1
        }),
        checkRateLimit: vi.fn().mockResolvedValue({
          remaining: 100,
          reset: Date.now() + 3600000,
          limit: 1000
        })
      };

      (facade as any).providers.set('test2', mockProvider2);
      
      mockProvider.searchVideos.mockResolvedValue({
        videos: [duplicateVideo],
        provider: 'test',
        searchTime: 600,
        totalResults: 1
      });

      const result = await facade.searchAcrossProviders(
        ['nature'],
        30,
        OrientationEnum.landscape,
        5
      );

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].id).toBe('duplicate_123');
    });
  });

  describe('findVideos', () => {
    it('should throw VideoSearchError when no videos found across all providers', async () => {
      mockProvider.searchVideos.mockRejectedValue(new VideoSearchError('No videos found'));

      await expect(
        facade.findVideos(['nonexistent'], 30, OrientationEnum.landscape, 5)
      ).rejects.toThrow('No videos found for search: nonexistent');
    });

    it('should return videos when at least one provider succeeds', async () => {
      mockProvider.searchVideos.mockResolvedValue({
        videos: [{
          id: 'test_456',
          url: 'https://example.com/video2.mp4',
          duration: 25,
          width: 1920,
          height: 1080
        }],
        provider: 'test',
        searchTime: 750,
        totalResults: 1
      });

      const result = await facade.findVideos(['nature'], 30, OrientationEnum.landscape, 3);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('test_456');
    });
  });

  describe('error logging', () => {
    it('should log provider failures with structured data', async () => {
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const searchError = new VideoSearchError('No videos found for search: broken');
      mockProvider.searchVideos.mockRejectedValue(searchError);

      await facade.searchAcrossProviders(
        ['broken'],
        30,
        OrientationEnum.landscape,
        5
      );

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('provider availability', () => {
    it('should skip providers with zero rate limit', async () => {
      mockProvider.checkRateLimit.mockResolvedValue({
        remaining: 0,
        reset: Date.now() + 3600000,
        limit: 1000
      });

      const result = await facade.searchAcrossProviders(
        ['test'],
        30,
        OrientationEnum.landscape,
        5
      );

      expect(mockProvider.searchVideos).not.toHaveBeenCalled();
      expect(result.videos).toHaveLength(0);
    });

    it('should use providers with available rate limit', async () => {
      mockProvider.checkRateLimit.mockResolvedValue({
        remaining: 50,
        reset: Date.now() + 3600000,
        limit: 1000
      });

      mockProvider.searchVideos.mockResolvedValue({
        videos: [],
        provider: 'test',
        searchTime: 500,
        totalResults: 0
      });

      await facade.searchAcrossProviders(
        ['test'],
        30,
        OrientationEnum.landscape,
        5
      );

      expect(mockProvider.searchVideos).toHaveBeenCalled();
    });
  });
});