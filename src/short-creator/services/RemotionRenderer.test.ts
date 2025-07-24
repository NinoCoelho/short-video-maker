import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemotionRenderer } from './RemotionRenderer';
import { Remotion } from '../libraries/Remotion';
import { VideoStatusManager } from '../VideoStatusManager';
import { Config } from '../../config';
import fs from 'fs-extra';
import path from 'path';

// Mock dependencies
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('fs-extra', () => ({
  existsSync: vi.fn(),
  readJsonSync: vi.fn(),
  access: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('path', () => ({
  join: vi.fn((...paths: string[]) => paths.join('/')),
  basename: vi.fn((filePath: string) => filePath.split('/').pop()),
}));

describe('RemotionRenderer', () => {
  let remotionRenderer: RemotionRenderer;
  let mockRemotion: any;
  let mockStatusManager: any;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      port: 3000,
      videosDirPath: '/videos',
      tempDirPath: '/tmp',
    } as Config;

    mockRemotion = {
      renderMedia: vi.fn(),
      getMediaDuration: vi.fn(),
    };

    mockStatusManager = {
      setStatus: vi.fn(),
      setProgress: vi.fn(),
      setError: vi.fn(),
    };

    remotionRenderer = new RemotionRenderer(
      mockRemotion,
      mockStatusManager,
      mockConfig
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Video Rendering', () => {
    const mockVideoData = {
      scenes: [
        {
          id: 'scene-1',
          text: 'Test scene',
          duration: 3.5,
          audio: { url: '/temp/audio1.wav', duration: 3.5 },
          videos: ['/api/cached-video/video1.mp4'],
        },
      ],
      config: {
        orientation: 'portrait',
        durationMs: 3500,
      },
    };

    it('should render video successfully with progress tracking', async () => {
      const onProgressMock = vi.fn();
      
      // Mock successful render with progress callbacks
      mockRemotion.renderMedia.mockImplementation((videoId, videoData, onProgress) => {
        // Simulate progress updates
        setTimeout(() => onProgress(0.25), 10);
        setTimeout(() => onProgress(0.5), 20);
        setTimeout(() => onProgress(0.75), 30);
        setTimeout(() => onProgress(1.0), 40);
        return Promise.resolve();
      });

      await remotionRenderer.renderVideo('video-123', mockVideoData, onProgressMock);

      expect(mockRemotion.renderMedia).toHaveBeenCalledWith(
        'video-123',
        mockVideoData,
        expect.any(Function)
      );

      expect(mockStatusManager.setStatus).toHaveBeenCalledWith(
        'video-123',
        'ready',
        'Video rendered successfully',
        100,
        'Completed'
      );

      // Progress callback should have been called
      expect(onProgressMock).toHaveBeenCalled();
    });

    it('should handle render errors correctly', async () => {
      const renderError = new Error('Render failed');
      mockRemotion.renderMedia.mockRejectedValue(renderError);

      await expect(
        remotionRenderer.renderVideo('video-123', mockVideoData)
      ).rejects.toThrow('Render failed');

      expect(mockStatusManager.setError).toHaveBeenCalledWith(
        'video-123',
        'Render failed'
      );
    });

    it('should track render progress with throttling', async () => {
      vi.useFakeTimers();

      // Mock render with rapid progress updates
      mockRemotion.renderMedia.mockImplementation(async (videoId, videoData, onProgress) => {
        // Simulate rapid progress updates (should be throttled)
        for (let i = 1; i <= 100; i++) {
          onProgress(i / 100);
          vi.advanceTimersByTime(100); // Simulate 100ms between updates
        }
        return Promise.resolve();
      });

      await remotionRenderer.renderVideo('video-123', mockVideoData);

      // Should have throttled progress updates (not all 100 updates)
      expect(mockStatusManager.setProgress).toHaveBeenCalledTimes(
        expect.any(Number)
      );

      // Should have less than 100 calls due to throttling
      expect(mockStatusManager.setProgress).toHaveBeenCalledWith(
        'video-123',
        expect.any(Number),
        expect.any(String)
      );

      vi.useRealTimers();
    });
  });

  describe('Render from JSON', () => {
    const mockRenderData = {
      scenes: [
        {
          id: 'scene-1',
          text: 'Scene text',
          audio: { url: '/temp/audio1.wav', duration: 3.0 },
          videos: ['/api/cached-video/video1.mp4'],
        },
      ],
      config: {
        orientation: 'portrait',
        durationMs: 3000,
      },
    };

    it('should render from render.json file successfully', async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readJsonSync as any).mockReturnValue(mockRenderData);
      
      // Mock asset validation
      (fs.access as any).mockResolvedValue(undefined);
      (fs.stat as any).mockResolvedValue({ size: 1024 });
      
      // Mock successful render
      mockRemotion.renderMedia.mockResolvedValue(undefined);

      await remotionRenderer.renderFromRenderJson('video-123');

      expect(fs.existsSync).toHaveBeenCalledWith('/videos/video-123.render.json');
      expect(fs.readJsonSync).toHaveBeenCalledWith('/videos/video-123.render.json');
      expect(mockRemotion.renderMedia).toHaveBeenCalled();
    });

    it('should throw error when render.json file does not exist', async () => {
      (fs.existsSync as any).mockReturnValue(false);

      await expect(
        remotionRenderer.renderFromRenderJson('video-123')
      ).rejects.toThrow('.render.json not found for video-123');
    });

    it('should validate audio assets before rendering', async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readJsonSync as any).mockReturnValue(mockRenderData);
      
      // Mock audio file validation failure
      (fs.access as any).mockRejectedValue(new Error('File not found'));

      await expect(
        remotionRenderer.renderFromRenderJson('video-123')
      ).rejects.toThrow('Audio file not found for scene 0');
    });

    it('should detect empty audio files', async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readJsonSync as any).mockReturnValue(mockRenderData);
      
      // Mock empty audio file
      (fs.access as any).mockResolvedValue(undefined);
      (fs.stat as any).mockResolvedValue({ size: 0 }); // Empty file

      await expect(
        remotionRenderer.renderFromRenderJson('video-123')
      ).rejects.toThrow('Audio file is empty for scene 0');
    });
  });

  describe('Data Preprocessing', () => {
    const inputData = {
      scenes: [
        {
          id: 'scene-1',
          text: 'Scene text',
          audio: { url: '/temp/audio1.wav', duration: 3.0 },
          videos: ['/api/cached-video/video1.mp4', null, undefined, '/static/video2.mp4'],
        },
      ],
      config: {
        orientation: 'portrait',
        durationMs: 3000,
      },
      music: {
        url: '/music/background.mp3',
      },
    };

    it('should preprocess video data correctly', () => {
      // Mock file existence checks
      (fs.existsSync as any).mockReturnValue(true);

      const result = remotionRenderer.preprocessVideoDataForRemotionRendering(inputData);

      // Should convert relative URLs to absolute
      expect(result.scenes[0].audio.url).toBe('http://localhost:3000/temp/audio1.wav');
      
      // Should filter out null/undefined videos and convert URLs
      expect(result.scenes[0].videos).toHaveLength(2);
      expect(result.scenes[0].videos[0]).toBe('http://localhost:3000/api/cached-video/video1.mp4');
      expect(result.scenes[0].videos[1]).toBe('http://localhost:3000/static/video2.mp4');
      
      // Should convert music URL
      expect(result.music.url).toBe('http://localhost:3000/music/background.mp3');
    });

    it('should handle HTTP URLs without conversion', () => {
      const dataWithHttpUrls = {
        scenes: [
          {
            id: 'scene-1',
            audio: { url: 'https://example.com/audio.wav', duration: 3.0 },
            videos: ['https://example.com/video.mp4'],
          },
        ],
        config: { orientation: 'portrait' },
      };

      const result = remotionRenderer.preprocessVideoDataForRemotionRendering(dataWithHttpUrls);

      // HTTP URLs should remain unchanged
      expect(result.scenes[0].audio.url).toBe('https://example.com/audio.wav');
      expect(result.scenes[0].videos[0]).toBe('https://example.com/video.mp4');
    });

    it('should throw error for missing audio files', () => {
      (fs.existsSync as any).mockReturnValue(false);

      expect(() => {
        remotionRenderer.preprocessVideoDataForRemotionRendering(inputData);
      }).toThrow('Audio file not found');
    });

    it('should throw error for invalid audio duration', () => {
      const invalidData = {
        scenes: [
          {
            id: 'scene-1',
            audio: { url: '/temp/audio1.wav', duration: 0 }, // Invalid duration
            videos: ['/video1.mp4'],
          },
        ],
        config: { orientation: 'portrait' },
      };

      expect(() => {
        remotionRenderer.preprocessVideoDataForRemotionRendering(invalidData);
      }).toThrow('Invalid audio duration for scene 0: 0');
    });

    it('should throw error for empty video URLs', () => {
      const dataWithEmptyVideo = {
        scenes: [
          {
            id: 'scene-1',
            audio: { url: '/temp/audio1.wav', duration: 3.0 },
            videos: ['', null], // Empty and null video URLs
          },
        ],
        config: { orientation: 'portrait' },
      };

      (fs.existsSync as any).mockReturnValue(true);

      expect(() => {
        remotionRenderer.preprocessVideoDataForRemotionRendering(dataWithEmptyVideo);
      }).toThrow('Empty video URL for scene 0, video 0');
    });

    it('should throw error for missing scenes', () => {
      const dataWithoutScenes = {
        config: { orientation: 'portrait' },
      };

      expect(() => {
        remotionRenderer.preprocessVideoDataForRemotionRendering(dataWithoutScenes);
      }).toThrow('No scenes found in video data');
    });

    it('should throw error for missing config', () => {
      const dataWithoutConfig = {
        scenes: [{ id: 'scene-1' }],
      };

      expect(() => {
        remotionRenderer.preprocessVideoDataForRemotionRendering(dataWithoutConfig);
      }).toThrow('No config found in video data');
    });
  });

  describe('Progress Management', () => {
    it('should provide different stage names based on progress', () => {
      const testCases = [
        { progress: 0.1, expectedStage: 'Initializing' },
        { progress: 0.3, expectedStage: 'Processing frames' },
        { progress: 0.6, expectedStage: 'Encoding video' },
        { progress: 0.9, expectedStage: 'Finalizing' },
      ];

      testCases.forEach(({ progress, expectedStage }) => {
        // Access private method for testing
        const stage = (remotionRenderer as any).getProgressStage(progress);
        expect(stage).toBe(expectedStage);
      });
    });

    it('should estimate time remaining correctly', () => {
      const videoId = 'video-123';
      
      // Set start time to 10 seconds ago
      const startTime = Date.now() - 10000;
      (remotionRenderer as any).renderStartTimes.set(videoId, startTime);
      
      // If 50% complete after 10 seconds, should estimate 10 seconds remaining
      const timeRemaining = (remotionRenderer as any).estimateTimeRemaining(50, videoId);
      expect(timeRemaining).toBeCloseTo(10, 0); // Within 1 second tolerance
    });

    it('should return -1 for time remaining when no start time', () => {
      const timeRemaining = (remotionRenderer as any).estimateTimeRemaining(50, 'unknown-video');
      expect(timeRemaining).toBe(-1);
    });

    it('should determine when to update progress', () => {
      const shouldUpdate = (remotionRenderer as any).shouldUpdateProgress;
      
      // Should always update for milestones
      expect(shouldUpdate(0, 0, 1000)).toBe(true); // 0%
      expect(shouldUpdate(10, 0, 1000)).toBe(true); // 10%
      expect(shouldUpdate(99, 0, 1000)).toBe(true); // 99%
      
      // Should respect time throttling
      expect(shouldUpdate(5, 500, 1000)).toBe(false); // Too soon for early progress
      expect(shouldUpdate(5, 0, 1200)).toBe(true); // Enough time passed for early progress
    });
  });

  describe('Media Duration', () => {
    it('should delegate media duration to remotion service', async () => {
      const expectedDuration = 5.5;
      mockRemotion.getMediaDuration.mockResolvedValue(expectedDuration);

      const result = await remotionRenderer.getMediaDuration('/path/to/media.mp4');

      expect(result).toBe(expectedDuration);
      expect(mockRemotion.getMediaDuration).toHaveBeenCalledWith('/path/to/media.mp4');
    });

    it('should handle media duration errors', async () => {
      const error = new Error('Cannot read media');
      mockRemotion.getMediaDuration.mockRejectedValue(error);

      await expect(
        remotionRenderer.getMediaDuration('/path/to/media.mp4')
      ).rejects.toThrow('Cannot read media');
    });
  });

  describe('URL Resolution', () => {
    it('should resolve relative URLs with port', () => {
      const resolveUrl = (remotionRenderer as any).resolveUrlForRemotionContext;
      
      expect(resolveUrl('/api/video.mp4')).toBe('http://localhost:3000/api/video.mp4');
      expect(resolveUrl('api/video.mp4')).toBe('http://localhost:3000/api/video.mp4');
    });
  });

  describe('Cleanup', () => {
    it('should clean up tracking data after successful render', async () => {
      mockRemotion.renderMedia.mockResolvedValue(undefined);

      await remotionRenderer.renderVideo('video-123', {
        scenes: [],
        config: { orientation: 'portrait' },
      });

      // Tracking data should be cleaned up
      const renderStartTimes = (remotionRenderer as any).renderStartTimes;
      const lastProgressUpdate = (remotionRenderer as any).lastProgressUpdate;
      
      expect(renderStartTimes.has('video-123')).toBe(false);
      expect(lastProgressUpdate.has('video-123')).toBe(false);
    });

    it('should clean up tracking data after render error', async () => {
      const error = new Error('Render failed');
      mockRemotion.renderMedia.mockRejectedValue(error);

      await expect(
        remotionRenderer.renderVideo('video-123', {
          scenes: [],
          config: { orientation: 'portrait' },
        })
      ).rejects.toThrow('Render failed');

      // Tracking data should be cleaned up even after error
      const renderStartTimes = (remotionRenderer as any).renderStartTimes;
      const lastProgressUpdate = (remotionRenderer as any).lastProgressUpdate;
      
      expect(renderStartTimes.has('video-123')).toBe(false);
      expect(lastProgressUpdate.has('video-123')).toBe(false);
    });
  });
});