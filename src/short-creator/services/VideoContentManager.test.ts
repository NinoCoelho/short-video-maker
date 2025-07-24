import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoContentManager } from './VideoContentManager';
import { VideoProviderFacade } from '../libraries/VideoProviderFacade';
import { VideoSearch } from '../libraries/VideoSearch';
import { VideoCacheManager } from '../libraries/VideoCacheManager';
import { Config } from '../../config';
import { OrientationEnum, Scene, Video } from '../../types/shorts';

// Mock dependencies
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../libraries/VideoProviderFacade');
vi.mock('../libraries/VideoSearch');
vi.mock('../libraries/VideoCacheManager');

vi.mock('fs-extra', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  createReadStream: vi.fn(),
}));

vi.mock('path', () => ({
  basename: vi.fn((filePath: string) => filePath.split('/').pop()),
  join: vi.fn((...paths: string[]) => paths.join('/')),
}));

describe('VideoContentManager', () => {
  let videoContentManager: VideoContentManager;
  let mockVideoProviderFacade: any;
  let mockVideoSearch: any;
  let mockVideoCacheManager: any;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      tempDirPath: '/tmp/test',
      cacheDir: '/cache/test',
    } as Config;

    mockVideoProviderFacade = {
      searchVideos: vi.fn(),
      getProviderStats: vi.fn(),
    };

    mockVideoSearch = {
      searchVideos: vi.fn(),
    };

    mockVideoCacheManager = {
      cacheVideo: vi.fn(),
      getCachedVideoPath: vi.fn(),
      getCacheStats: vi.fn(),
      cleanupOldVideos: vi.fn(),
    };

    // Mock constructors
    (VideoSearch as any).mockImplementation(() => mockVideoSearch);
    (VideoCacheManager as any).mockImplementation(() => mockVideoCacheManager);

    videoContentManager = new VideoContentManager(
      mockVideoProviderFacade,
      mockConfig
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Video Search', () => {
    it('should search for videos successfully', async () => {
      const mockResults = [
        { id: 'video-1', url: 'https://example.com/video1.mp4', title: 'Video 1' },
        { id: 'video-2', url: 'https://example.com/video2.mp4', title: 'Video 2' },
      ];

      mockVideoSearch.searchVideos.mockResolvedValue(mockResults);

      const results = await videoContentManager.searchVideos('nature');

      expect(mockVideoSearch.searchVideos).toHaveBeenCalledWith('nature');
      expect(results).toEqual(mockResults);
    });

    it('should handle search errors', async () => {
      const error = new Error('Search failed');
      mockVideoSearch.searchVideos.mockRejectedValue(error);

      await expect(videoContentManager.searchVideos('nature'))
        .rejects.toThrow('Search failed');
    });
  });

  describe('Video Processing for Scene', () => {
    it('should return cached video URL if already cached', async () => {
      const cachedUrl = '/api/cached-video/cached-video.mp4';
      const cachedPath = '/cache/cached-video.mp4';

      mockVideoCacheManager.getCachedVideoPath.mockReturnValue(cachedPath);

      const result = await videoContentManager.processVideoForScene(
        cachedUrl,
        0,
        OrientationEnum.portrait
      );

      expect(result).toBe(cachedUrl);
      expect(mockVideoCacheManager.getCachedVideoPath).toHaveBeenCalledWith('cached-video.mp4');
    });

    it('should download and cache HTTP video URL', async () => {
      const httpUrl = 'https://example.com/video.mp4';
      const cachedUrl = '/api/cached-video/new-cached-video.mp4';

      mockVideoCacheManager.cacheVideo.mockResolvedValue(cachedUrl);

      const result = await videoContentManager.processVideoForScene(
        httpUrl,
        0,
        OrientationEnum.portrait
      );

      expect(result).toBe(cachedUrl);
      expect(mockVideoCacheManager.cacheVideo).toHaveBeenCalledWith(
        httpUrl,
        OrientationEnum.portrait
      );
    });

    it('should return local video URL as-is', async () => {
      const localUrl = '/path/to/local/video.mp4';

      const result = await videoContentManager.processVideoForScene(
        localUrl,
        0,
        OrientationEnum.portrait
      );

      expect(result).toBe(localUrl);
      expect(mockVideoCacheManager.cacheVideo).not.toHaveBeenCalled();
    });

    it('should handle caching errors for HTTP URLs', async () => {
      const httpUrl = 'https://example.com/video.mp4';
      const error = new Error('Caching failed');

      mockVideoCacheManager.cacheVideo.mockRejectedValue(error);

      await expect(
        videoContentManager.processVideoForScene(
          httpUrl,
          0,
          OrientationEnum.portrait
        )
      ).rejects.toThrow('Caching failed');
    });

    it('should handle cached video that no longer exists', async () => {
      const cachedUrl = '/api/cached-video/missing-video.mp4';

      mockVideoCacheManager.getCachedVideoPath.mockReturnValue(null);
      mockVideoCacheManager.cacheVideo.mockResolvedValue('/api/cached-video/new-video.mp4');

      const result = await videoContentManager.processVideoForScene(
        cachedUrl,
        0,
        OrientationEnum.portrait
      );

      // Should not try to cache since it's not an HTTP URL
      expect(result).toBe(cachedUrl);
    });
  });

  describe('Download and Process Videos', () => {
    const mockVideos: Video[] = [
      { id: 'video-1', url: 'https://example.com/video1.mp4', title: 'Video 1' },
      { id: 'video-2', url: 'https://example.com/video2.mp4', title: 'Video 2' },
      { id: 'video-3', url: 'https://example.com/video3.mp4', title: 'Video 3' },
    ];

    it('should download and process videos for multiple search terms', async () => {
      mockVideoProviderFacade.searchVideos.mockResolvedValue(mockVideos);
      mockVideoCacheManager.cacheVideo
        .mockResolvedValueOnce('/api/cached-video/video1.mp4')
        .mockResolvedValueOnce('/api/cached-video/video2.mp4')
        .mockResolvedValueOnce('/api/cached-video/video3.mp4');

      const results = await videoContentManager.downloadAndProcessVideos(
        ['nature', 'landscape'],
        OrientationEnum.portrait,
        3
      );

      expect(results).toHaveLength(3);
      expect(results).toEqual([
        '/api/cached-video/video1.mp4',
        '/api/cached-video/video2.mp4',
        '/api/cached-video/video3.mp4',
      ]);

      expect(mockVideoProviderFacade.searchVideos).toHaveBeenCalledWith('nature', OrientationEnum.portrait);
      expect(mockVideoCacheManager.cacheVideo).toHaveBeenCalledTimes(3);
    });

    it('should limit results to requested count', async () => {
      mockVideoProviderFacade.searchVideos.mockResolvedValue(mockVideos);
      mockVideoCacheManager.cacheVideo
        .mockResolvedValueOnce('/api/cached-video/video1.mp4')
        .mockResolvedValueOnce('/api/cached-video/video2.mp4');

      const results = await videoContentManager.downloadAndProcessVideos(
        ['nature'],
        OrientationEnum.portrait,
        2
      );

      expect(results).toHaveLength(2);
      expect(mockVideoCacheManager.cacheVideo).toHaveBeenCalledTimes(2);
    });

    it('should handle search failures gracefully', async () => {
      mockVideoProviderFacade.searchVideos
        .mockRejectedValueOnce(new Error('Search failed'))
        .mockResolvedValueOnce(mockVideos.slice(0, 2));
      
      mockVideoCacheManager.cacheVideo
        .mockResolvedValueOnce('/api/cached-video/video1.mp4')
        .mockResolvedValueOnce('/api/cached-video/video2.mp4');

      const results = await videoContentManager.downloadAndProcessVideos(
        ['failed-term', 'success-term'],
        OrientationEnum.portrait,
        2
      );

      expect(results).toHaveLength(2);
      expect(mockVideoProviderFacade.searchVideos).toHaveBeenCalledTimes(2);
    });

    it('should handle video download failures gracefully', async () => {
      mockVideoProviderFacade.searchVideos.mockResolvedValue(mockVideos.slice(0, 2));
      mockVideoCacheManager.cacheVideo
        .mockRejectedValueOnce(new Error('Download failed'))
        .mockResolvedValueOnce('/api/cached-video/video2.mp4');

      const results = await videoContentManager.downloadAndProcessVideos(
        ['nature'],
        OrientationEnum.portrait,
        2
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toBe('/api/cached-video/video2.mp4');
    });

    it('should stop searching when enough videos are found', async () => {
      mockVideoProviderFacade.searchVideos.mockResolvedValue(mockVideos);
      mockVideoCacheManager.cacheVideo.mockResolvedValue('/api/cached-video/video.mp4');

      await videoContentManager.downloadAndProcessVideos(
        ['term1', 'term2', 'term3'],
        OrientationEnum.portrait,
        2
      );

      // Should only search the first term since it provides enough videos
      expect(mockVideoProviderFacade.searchVideos).toHaveBeenCalledTimes(1);
      expect(mockVideoProviderFacade.searchVideos).toHaveBeenCalledWith('term1', OrientationEnum.portrait);
    });
  });

  describe('Cache Management', () => {
    it('should get cached video path', () => {
      const filename = 'test-video.mp4';
      const expectedPath = '/cache/test-video.mp4';

      mockVideoCacheManager.getCachedVideoPath.mockReturnValue(expectedPath);

      const result = videoContentManager.getCachedVideoPath(filename);

      expect(result).toBe(expectedPath);
      expect(mockVideoCacheManager.getCachedVideoPath).toHaveBeenCalledWith(filename);
    });

    it('should get cache statistics', () => {
      const mockStats = {
        count: 10,
        totalSize: 1024000,
        totalSizeFormatted: '1.02 MB',
      };

      mockVideoCacheManager.getCacheStats.mockReturnValue(mockStats);

      const result = videoContentManager.getCacheStats();

      expect(result).toEqual(mockStats);
      expect(mockVideoCacheManager.getCacheStats).toHaveBeenCalled();
    });

    it('should cleanup video cache with default age', async () => {
      await videoContentManager.cleanupVideoCache();

      expect(mockVideoCacheManager.cleanupOldVideos).toHaveBeenCalledWith(24);
    });

    it('should cleanup video cache with custom age', async () => {
      await videoContentManager.cleanupVideoCache(48);

      expect(mockVideoCacheManager.cleanupOldVideos).toHaveBeenCalledWith(48);
    });
  });

  describe('URL Resolution', () => {
    it('should return HTTP URLs as-is', () => {
      const httpUrl = 'https://example.com/video.mp4';
      const result = videoContentManager.resolveVideoUrl(httpUrl, 3000);

      expect(result).toBe(httpUrl);
    });

    it('should convert relative URLs to absolute with port', () => {
      const relativeUrl = '/api/video/test.mp4';
      const result = videoContentManager.resolveVideoUrl(relativeUrl, 3000);

      expect(result).toBe('http://localhost:3000/api/video/test.mp4');
    });

    it('should handle URLs without leading slash', () => {
      const relativeUrl = 'api/video/test.mp4';
      const result = videoContentManager.resolveVideoUrl(relativeUrl, 3000);

      expect(result).toBe('http://localhost:3000/api/video/test.mp4');
    });

    it('should throw error for null or undefined URLs', () => {
      expect(() => videoContentManager.resolveVideoUrl(null as any, 3000))
        .toThrow('Video URL cannot be undefined or null');

      expect(() => videoContentManager.resolveVideoUrl(undefined as any, 3000))
        .toThrow('Video URL cannot be undefined or null');
    });
  });

  describe('Video URL Validation', () => {
    it('should filter out null and undefined video URLs', () => {
      const scenes: Scene[] = [
        {
          text: 'Scene 1',
          audioUrl: '/audio1.wav',
          videos: [
            'https://example.com/video1.mp4',
            null as any,
            'https://example.com/video2.mp4',
            undefined as any,
            'https://example.com/video3.mp4',
          ],
        },
        {
          text: 'Scene 2',
          audioUrl: '/audio2.wav',
          videos: [null as any, undefined as any],
        },
        {
          text: 'Scene 3',
          audioUrl: '/audio3.wav',
          videos: ['https://example.com/video4.mp4'],
        },
      ];

      videoContentManager.validateVideoUrls(scenes);

      expect(scenes[0].videos).toEqual([
        'https://example.com/video1.mp4',
        'https://example.com/video2.mp4',
        'https://example.com/video3.mp4',
      ]);

      expect(scenes[1].videos).toEqual([]);
      expect(scenes[2].videos).toEqual(['https://example.com/video4.mp4']);
    });

    it('should handle scenes without videos array', () => {
      const scenes: Scene[] = [
        {
          text: 'Scene 1',
          audioUrl: '/audio1.wav',
        },
      ];

      expect(() => videoContentManager.validateVideoUrls(scenes)).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in cache video operations', async () => {
      const error = new Error('Cache operation failed');
      mockVideoCacheManager.cleanupOldVideos.mockRejectedValue(error);

      await expect(videoContentManager.cleanupVideoCache())
        .rejects.toThrow('Cache operation failed');
    });

    it('should handle provider facade errors', async () => {
      const error = new Error('Provider error');
      mockVideoProviderFacade.searchVideos.mockRejectedValue(error);

      const results = await videoContentManager.downloadAndProcessVideos(
        ['test'],
        OrientationEnum.portrait,
        1
      );

      // Should return empty array when all searches fail
      expect(results).toEqual([]);
    });
  });
});