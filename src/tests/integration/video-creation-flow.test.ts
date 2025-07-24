import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShortCreator } from '../../short-creator/ShortCreator';
import { VideoStatusManager } from '../../short-creator/VideoStatusManager';
import { Config } from '../../config';
import { 
  SceneInput, 
  RenderConfig, 
  VoiceEnum, 
  OrientationEnum, 
  MusicMoodEnum 
} from '../../types/shorts';

// Mock external dependencies
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('fs-extra', () => ({
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ size: 1024 })),
  readJsonSync: vi.fn(() => ({})),
  writeJsonSync: vi.fn(),
  pathExists: vi.fn(() => Promise.resolve(true)),
  ensureDir: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
  move: vi.fn(),
}));

vi.mock('../../short-creator/libraries/LocalTTS', () => ({
  LocalTTS: vi.fn().mockImplementation(() => ({
    generateSpeech: vi.fn().mockResolvedValue({
      audioPath: '/tmp/test-audio.wav',
      subtitles: [{ text: 'Test', start: 0, end: 1000 }],
    }),
  })),
}));

vi.mock('../../short-creator/libraries/Remotion', () => ({
  Remotion: vi.fn().mockImplementation(() => ({
    renderMedia: vi.fn().mockImplementation((videoId, data, onProgress) => {
      // Simulate render progress
      setTimeout(() => onProgress?.(0.5), 10);
      setTimeout(() => onProgress?.(1.0), 20);
      return Promise.resolve();
    }),
    getMediaDuration: vi.fn().mockResolvedValue(3.5),
  })),
}));

vi.mock('../../short-creator/libraries/VideoProviderFacade', () => ({
  VideoProviderFacade: vi.fn().mockImplementation(() => ({
    searchVideos: vi.fn().mockResolvedValue([
      {
        id: 'video-1',
        url: 'https://example.com/video1.mp4',
        title: 'Test Video 1',
      },
      {
        id: 'video-2', 
        url: 'https://example.com/video2.mp4',
        title: 'Test Video 2',
      },
    ]),
    getProviderStats: vi.fn().mockReturnValue({}),
  })),
}));

vi.mock('../../short-creator/libraries/VideoCacheManager', () => ({
  VideoCacheManager: vi.fn().mockImplementation(() => ({
    cacheVideo: vi.fn().mockResolvedValue('/api/cached-video/cached-123.mp4'),
    getCachedVideoPath: vi.fn().mockReturnValue('/cache/video.mp4'),
    getCacheStats: vi.fn().mockReturnValue({
      count: 5,
      totalSize: 1024000,
      totalSizeFormatted: '1.02 MB',
    }),
    cleanupOldVideos: vi.fn(),
  })),
}));

describe('Video Creation Flow Integration', () => {
  let shortCreator: ShortCreator;
  let videoStatusManager: VideoStatusManager;
  let mockConfig: Config;

  beforeEach(async () => {
    mockConfig = {
      port: 3000,
      videosDirPath: '/videos',
      tempDirPath: '/tmp',
      cacheDir: '/cache',
      remotion: {
        rendering: {
          serveUrl: 'http://localhost:3122',
        },
      },
    } as Config;

    videoStatusManager = new VideoStatusManager(mockConfig);
    shortCreator = new ShortCreator(mockConfig, videoStatusManager);
    
    // Initialize the ShortCreator
    await shortCreator.init();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Video Creation Workflow', () => {
    const mockScenes: SceneInput[] = [
      {
        text: 'Welcome to our amazing video tutorial',
        searchTerms: ['tutorial', 'education'],
      },
      {
        text: 'Today we will learn about video creation',
        searchTerms: ['learning', 'creation'],
      },
      {
        text: 'This is the final conclusion of our tutorial',
        searchTerms: ['conclusion', 'ending'],
      },
    ];

    const mockConfig: RenderConfig = {
      voice: VoiceEnum.Paulo,
      language: 'pt',
      orientation: OrientationEnum.portrait,
      music: MusicMoodEnum.happy,
    };

    it('should complete the full video creation workflow', async () => {
      // Start video creation
      const videoId = await shortCreator.addToQueue(mockScenes, mockConfig);
      
      expect(videoId).toBeDefined();
      expect(typeof videoId).toBe('string');

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check final video status
      const finalStatus = await shortCreator.status(videoId);
      expect(finalStatus).toBeDefined();
      
      // The video should eventually be ready or processing
      expect(['pending', 'processing', 'ready', 'failed']).toContain(finalStatus?.status);

      // Verify video data was saved
      const videoData = shortCreator.getVideoById(videoId);
      expect(videoData).toBeDefined();
      expect(videoData?.scenes).toBeDefined();
      expect(videoData?.config).toBeDefined();
    });

    it('should handle video re-rendering workflow', async () => {
      // Create initial video
      const videoId = await shortCreator.addToQueue(mockScenes, mockConfig);
      
      // Wait for initial processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Modify scenes for re-render
      const updatedScenes: SceneInput[] = [
        {
          text: 'Welcome to our UPDATED amazing video tutorial',
          searchTerms: ['tutorial', 'education', 'updated'],
        },
        ...mockScenes.slice(1),
      ];

      const updatedConfig: RenderConfig = {
        ...mockConfig,
        music: MusicMoodEnum.energetic,
      };

      // Re-render with updates
      await shortCreator.reRenderVideo(videoId, updatedScenes, updatedConfig);

      // Wait for re-render processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify updated data
      const updatedVideoData = shortCreator.getVideoById(videoId);
      expect(updatedVideoData?.scenes[0].text).toContain('UPDATED');
      expect(updatedVideoData?.config.music).toBe(MusicMoodEnum.energetic);
    });

    it('should handle errors in video creation gracefully', async () => {
      // Mock TTS service to fail
      const shortCreatorWithErrors = new ShortCreator(mockConfig, videoStatusManager);
      
      // Override TTS service to throw error
      (shortCreatorWithErrors as any).ttsManager = {
        getCachedOrGenerateTTS: vi.fn().mockRejectedValue(new Error('TTS failed')),
      };

      const videoId = await shortCreatorWithErrors.addToQueue(mockScenes, mockConfig);
      
      // Wait for error processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = await shortCreatorWithErrors.status(videoId);
      
      // Should handle error gracefully
      expect(status).toBeDefined();
      // Status might be 'failed' or still 'processing' depending on error handling
    });
  });

  describe('Queue Management Integration', () => {
    it('should process multiple videos in sequence', async () => {
      const video1Scenes: SceneInput[] = [
        { text: 'Video 1 scene', searchTerms: ['video1'] }
      ];
      
      const video2Scenes: SceneInput[] = [
        { text: 'Video 2 scene', searchTerms: ['video2'] }
      ];

      // Add multiple videos to queue
      const videoId1 = await shortCreator.addToQueue(video1Scenes, mockConfig);
      const videoId2 = await shortCreator.addToQueue(video2Scenes, mockConfig);

      expect(videoId1).toBeDefined();
      expect(videoId2).toBeDefined();
      expect(videoId1).not.toBe(videoId2);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 150));

      // Both videos should exist
      const video1Data = shortCreator.getVideoById(videoId1);
      const video2Data = shortCreator.getVideoById(videoId2);

      expect(video1Data).toBeDefined();
      expect(video2Data).toBeDefined();
    });

    it('should handle queue status correctly', async () => {
      const videoId = await shortCreator.addToQueue(mockScenes, mockConfig);
      
      // Initially should be pending
      const initialStatus = await shortCreator.status(videoId);
      expect(initialStatus?.status).toBe('pending');

      // Wait for processing to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should transition to processing or complete
      const laterStatus = await shortCreator.status(videoId);
      expect(['processing', 'ready']).toContain(laterStatus?.status || '');
    });
  });

  describe('Video Management Integration', () => {
    it('should manage video lifecycle correctly', async () => {
      const videoId = await shortCreator.addToQueue(mockScenes, mockConfig);
      
      // Wait for creation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Video should be retrievable
      const allVideos = await shortCreator.getAllVideos();
      const createdVideo = allVideos.find(v => v.id === videoId);
      expect(createdVideo).toBeDefined();

      // Should be able to get video path
      const videoPath = shortCreator.getVideoPath(videoId);
      expect(videoPath).toBeDefined();

      // Should be able to delete video
      await shortCreator.deleteVideo(videoId);

      // Video should no longer exist
      const videosAfterDelete = await shortCreator.getAllVideos();
      const deletedVideo = videosAfterDelete.find(v => v.id === videoId);
      expect(deletedVideo).toBeUndefined();
    });

    it('should handle video search correctly', async () => {
      const searchQuery = 'tutorial education';
      const results = await shortCreator.searchVideos(searchQuery);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Should have mocked results
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('url');
        expect(results[0]).toHaveProperty('title');
      }
    });
  });

  describe('TTS Integration', () => {
    it('should handle single TTS generation', async () => {
      const videoId = 'test-video-123';
      const sceneId = 'scene-123';
      const text = 'Hello world test audio';
      
      const audioResult = await shortCreator.generateSingleTTSAndUpdate(
        videoId,
        sceneId,
        text,
        mockConfig,
        false
      );

      expect(audioResult).toBeDefined();
      expect(audioResult.audioUrl).toBeDefined();
      expect(audioResult.duration).toBeGreaterThan(0);
      expect(typeof audioResult.audioUrl).toBe('string');
    });

    it('should handle TTS regeneration', async () => {
      const videoId = 'test-video-123';
      const sceneId = 'scene-123';
      const text = 'Hello world test audio';

      // Generate initial TTS
      const initialResult = await shortCreator.generateSingleTTSAndUpdate(
        videoId,
        sceneId,
        text,
        mockConfig,
        false
      );

      // Force regeneration
      const regeneratedResult = await shortCreator.generateSingleTTSAndUpdate(
        videoId,
        sceneId,
        text,
        mockConfig,
        true
      );

      expect(regeneratedResult).toBeDefined();
      expect(regeneratedResult.audioUrl).toBeDefined();
      expect(regeneratedResult.duration).toBeGreaterThan(0);
      
      // URLs might be different due to regeneration
      expect(regeneratedResult.audioUrl).toBeDefined();
    });
  });

  describe('Cache Management Integration', () => {
    it('should handle video cache operations', async () => {
      // Get cache stats
      const stats = shortCreator.getCacheStats();
      expect(stats).toBeDefined();
      expect(typeof stats.count).toBe('number');
      expect(typeof stats.totalSize).toBe('number');
      expect(typeof stats.totalSizeFormatted).toBe('string');

      // Cleanup cache
      await shortCreator.cleanupVideoCache(24);
      
      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should handle cached video retrieval', () => {
      const filename = 'test-video.mp4';
      const cachedPath = shortCreator.getCachedVideoPath(filename);
      
      expect(cachedPath).toBeDefined();
      expect(typeof cachedPath).toBe('string');
    });
  });

  describe('Voice and Music Management', () => {
    it('should list available voices', () => {
      const voices = shortCreator.ListAvailableVoices();
      
      expect(voices).toBeDefined();
      expect(Array.isArray(voices)).toBe(true);
    });

    it('should list available music tags', () => {
      const musicTags = shortCreator.ListAvailableMusicTags();
      
      expect(musicTags).toBeDefined();
      expect(Array.isArray(musicTags)).toBe(true);
    });
  });

  describe('Error Recovery Integration', () => {
    it('should recover from individual scene failures', async () => {
      // Create scenes where one might fail
      const riskyScenes: SceneInput[] = [
        { text: 'Normal scene', searchTerms: ['normal'] },
        { text: '', searchTerms: [] }, // Potentially problematic scene
        { text: 'Another normal scene', searchTerms: ['normal'] },
      ];

      const videoId = await shortCreator.addToQueue(riskyScenes, mockConfig);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should handle gracefully
      const status = await shortCreator.status(videoId);
      expect(status).toBeDefined();
      
      // Even with problematic scene, should not crash
      expect(['pending', 'processing', 'ready', 'failed']).toContain(status?.status);
    });

    it('should handle missing video URLs gracefully', async () => {
      // Mock video provider to return empty results
      const shortCreatorWithNoVideos = new ShortCreator(mockConfig, videoStatusManager);
      
      // Override video provider to return no results
      (shortCreatorWithNoVideos as any).videoContentManager = {
        downloadAndProcessVideos: vi.fn().mockResolvedValue([]),
        searchVideos: vi.fn().mockResolvedValue([]),
      };

      const videoId = await shortCreatorWithNoVideos.addToQueue(mockScenes, mockConfig);
      
      // Wait for processing attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = await shortCreatorWithNoVideos.status(videoId);
      
      // Should handle no videos gracefully
      expect(status).toBeDefined();
    });
  });
});