import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoContentManager } from '../VideoContentManager';
import { OrientationEnum } from '../../../types/shorts';
import { VideoSearchError } from '../../libraries/VideoProvider';

// Mock dependencies
const mockVideoProviderFacade = {
  findVideos: vi.fn()
};

const mockGlobalConfig = {
  dataDirPath: '/tmp/test'
};

// Mock the VideoCacheManager and VideoSearch
vi.mock('../../libraries/VideoCacheManager', () => ({
  VideoCacheManager: vi.fn().mockImplementation(() => ({
    preloadVideos: vi.fn(),
    getCachedVideoPath: vi.fn()
  }))
}));

vi.mock('../../libraries/VideoSearch', () => ({
  VideoSearch: vi.fn().mockImplementation(() => ({}))
}));

describe('VideoContentManager Error Handling', () => {
  let videoContentManager: VideoContentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    videoContentManager = new VideoContentManager(
      mockVideoProviderFacade as any,
      mockGlobalConfig as any
    );
    
    // Set up default mock for videoCacheManager
    (videoContentManager as any).videoCacheManager = {
      preloadVideos: vi.fn().mockResolvedValue(new Map()),
      getCachedVideoPath: vi.fn()
    };
  });

  describe('downloadAndProcessVideos', () => {
    it('should handle no videos found scenario with fallback terms', async () => {
      // Mock initial search to fail
      mockVideoProviderFacade.findVideos
        .mockRejectedValueOnce(new VideoSearchError('No videos found for search: broken'))
        .mockResolvedValueOnce([
          {
            id: 'fallback_1',
            url: 'https://example.com/nature1.mp4',
            duration: 30,
            width: 1920,
            height: 1080
          }
        ]);

      // Mock cache manager to succeed
      (videoContentManager as any).videoCacheManager.preloadVideos.mockResolvedValue(
        new Map([
          ['https://example.com/nature1.mp4', { proxyUrl: 'http://localhost:3122/cached/nature1.mp4' }]
        ])
      );

      const result = await videoContentManager.downloadAndProcessVideos(
        ['broken'],
        OrientationEnum.landscape,
        1
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('http://localhost:3122/cached/nature1.mp4');
      
      // Should have tried original term and then fallback
      expect(mockVideoProviderFacade.findVideos).toHaveBeenCalledTimes(2);
      expect(mockVideoProviderFacade.findVideos).toHaveBeenCalledWith(
        ['broken'], 30, [], OrientationEnum.landscape, 1
      );
      expect(mockVideoProviderFacade.findVideos).toHaveBeenCalledWith(
        ['nature'], 30, [], OrientationEnum.landscape, 1
      );
    });

    it('should use original URLs when caching fails', async () => {
      // Mock video search to succeed
      mockVideoProviderFacade.findVideos.mockResolvedValue([
        {
          id: 'test_1',
          url: 'https://example.com/video1.mp4',
          duration: 30,
          width: 1920,
          height: 1080
        }
      ]);

      // Mock cache manager to fail
      (videoContentManager as any).videoCacheManager.preloadVideos.mockRejectedValue(new Error('Cache failure'));

      const result = await videoContentManager.downloadAndProcessVideos(
        ['test'],
        OrientationEnum.landscape,
        1
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('https://example.com/video1.mp4');
    });

    it('should use original URL when individual video caching fails', async () => {
      // Mock video search to succeed
      mockVideoProviderFacade.findVideos.mockResolvedValue([
        {
          id: 'test_1',
          url: 'https://example.com/video1.mp4',
          duration: 30,
          width: 1920,
          height: 1080
        }
      ]);

      // Mock cache manager to return empty result (partial failure)
      (videoContentManager as any).videoCacheManager.preloadVideos.mockResolvedValue(new Map());

      const result = await videoContentManager.downloadAndProcessVideos(
        ['test'],
        OrientationEnum.landscape,
        1
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('https://example.com/video1.mp4');
    });

    it('should throw error when no videos found even with fallbacks', async () => {
      // Mock all searches to fail
      mockVideoProviderFacade.findVideos.mockRejectedValue(
        new VideoSearchError('No videos found')
      );

      await expect(
        videoContentManager.downloadAndProcessVideos(
          ['impossible_term'],
          OrientationEnum.landscape,
          1
        )
      ).rejects.toThrow('No videos found for search terms: impossible_term');

      // Should have tried original term and all fallback terms
      expect(mockVideoProviderFacade.findVideos).toHaveBeenCalledTimes(5); // 1 original + 4 fallbacks
    });

    it('should handle successful video search and caching', async () => {
      // Mock video search to succeed
      mockVideoProviderFacade.findVideos.mockResolvedValue([
        {
          id: 'test_1',
          url: 'https://example.com/video1.mp4',
          duration: 30,
          width: 1920,
          height: 1080
        },
        {
          id: 'test_2',
          url: 'https://example.com/video2.mp4',
          duration: 25,
          width: 1920,
          height: 1080
        }
      ]);

      // Mock cache manager to succeed
      (videoContentManager as any).videoCacheManager.preloadVideos.mockResolvedValue(
        new Map([
          ['https://example.com/video1.mp4', { proxyUrl: 'http://localhost:3122/cached/video1.mp4' }],
          ['https://example.com/video2.mp4', { proxyUrl: 'http://localhost:3122/cached/video2.mp4' }]
        ])
      );

      const result = await videoContentManager.downloadAndProcessVideos(
        ['nature'],
        OrientationEnum.landscape,
        2
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toBe('http://localhost:3122/cached/video1.mp4');
      expect(result[1]).toBe('http://localhost:3122/cached/video2.mp4');
      
      expect(mockVideoProviderFacade.findVideos).toHaveBeenCalledTimes(1);
      expect((videoContentManager as any).videoCacheManager.preloadVideos).toHaveBeenCalledWith([
        'https://example.com/video1.mp4',
        'https://example.com/video2.mp4'
      ]);
    });
  });
});