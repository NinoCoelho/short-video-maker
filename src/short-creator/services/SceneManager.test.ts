import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SceneManager } from './SceneManager';
import { VideoContentManager } from './VideoContentManager';
import { TTSManager } from './TTSManager';
import { VideoStatusManager } from '../VideoStatusManager';
import { Config } from '../../config';
import {
  SceneInput,
  RenderConfig,
  OrientationEnum,
  VoiceEnum,
  AudioResult,
  Caption,
} from '../../types/shorts';
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
  access: vi.fn(),
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));

vi.mock('path', () => ({
  basename: vi.fn((filePath: string) => filePath.split('/').pop()),
  join: vi.fn((...paths: string[]) => paths.join('/')),
}));

vi.mock('cuid', () => ({
  default: vi.fn(() => 'mock-scene-id'),
}));

vi.mock('../utils/textCleaner', () => ({
  cleanSceneText: vi.fn((text: string) => text.trim()),
  splitTextByPunctuation: vi.fn((text: string) => [text]),
}));

describe('SceneManager', () => {
  let sceneManager: SceneManager;
  let mockVideoContentManager: any;
  let mockTTSManager: any;
  let mockStatusManager: any;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      port: 3000,
      videosDirPath: '/videos',
      tempDirPath: '/tmp',
    } as Config;

    mockVideoContentManager = {
      downloadAndProcessVideos: vi.fn(),
      resolveVideoUrl: vi.fn(),
    };

    mockTTSManager = {
      getCachedOrGenerateTTS: vi.fn(),
    };

    mockStatusManager = {
      setProgress: vi.fn(),
      setStatus: vi.fn(),
    };

    sceneManager = new SceneManager(
      mockVideoContentManager,
      mockTTSManager,
      mockStatusManager,
      mockConfig
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Scene Processing', () => {
    const mockScenes: SceneInput[] = [
      {
        text: 'First scene text',
        searchTerms: ['nature', 'landscape'],
      },
      {
        text: 'Second scene text',
        searchTerms: ['city', 'urban'],
        videos: ['https://example.com/existing-video.mp4'],
      },
    ];

    const mockConfig: RenderConfig = {
      voice: VoiceEnum.Paulo,
      language: 'pt',
      orientation: OrientationEnum.portrait,
    };

    it('should process scenes successfully', async () => {
      // Mock video processing
      mockVideoContentManager.downloadAndProcessVideos
        .mockResolvedValueOnce([
          '/api/cached-video/nature1.mp4',
          '/api/cached-video/nature2.mp4',
        ])
        .mockResolvedValueOnce([
          '/api/cached-video/city1.mp4',
        ]);

      // Mock TTS generation
      const mockTTSResult = {
        audioPath: '/tmp/audio-123.wav',
        duration: 3.5,
        subtitles: [
          { text: 'First', start: 0, end: 1000 },
          { text: 'scene', start: 1000, end: 2000 },
          { text: 'text', start: 2000, end: 3500 },
        ] as Caption[],
      };

      mockTTSManager.getCachedOrGenerateTTS.mockResolvedValue(mockTTSResult);

      const result = await sceneManager.processScenes(
        'video-123',
        mockScenes,
        mockConfig
      );

      expect(result.remotionData.scenes).toHaveLength(2);
      expect(result.updatedScriptScenes).toHaveLength(2);

      // Check first scene processing
      expect(mockVideoContentManager.downloadAndProcessVideos).toHaveBeenNthCalledWith(
        1,
        ['nature', 'landscape'],
        OrientationEnum.portrait,
        3
      );

      // Check second scene uses existing videos
      expect(result.updatedScriptScenes[1].videos).toEqual([
        'https://example.com/existing-video.mp4',
      ]);

      // Check progress updates
      expect(mockStatusManager.setProgress).toHaveBeenCalledWith(
        'video-123',
        15,
        'Processing scenes...'
      );
      expect(mockStatusManager.setProgress).toHaveBeenCalledWith(
        'video-123',
        70,
        'Finalizing scene data...'
      );
    });

    it('should handle scenes with multiple text parts', async () => {
      // Mock text splitting
      const { splitTextByPunctuation } = await import('../utils/textCleaner');
      (splitTextByPunctuation as any).mockReturnValue([
        'First part.',
        'Second part.',
      ]);

      mockVideoContentManager.downloadAndProcessVideos.mockResolvedValue([
        '/api/cached-video/video1.mp4',
      ]);

      const mockTTSResult = {
        audioPath: '/tmp/audio-123.wav',
        duration: 2.0,
        subtitles: [],
      };

      mockTTSManager.getCachedOrGenerateTTS.mockResolvedValue(mockTTSResult);

      const singleScene: SceneInput[] = [
        {
          text: 'First part. Second part.',
          searchTerms: ['test'],
        },
      ];

      const result = await sceneManager.processScenes(
        'video-123',
        singleScene,
        mockConfig
      );

      // Should generate TTS for each text part
      expect(mockTTSManager.getCachedOrGenerateTTS).toHaveBeenCalledTimes(2);
      expect(mockTTSManager.getCachedOrGenerateTTS).toHaveBeenNthCalledWith(
        1,
        'First part.',
        mockConfig,
        undefined
      );
      expect(mockTTSManager.getCachedOrGenerateTTS).toHaveBeenNthCalledWith(
        2,
        'Second part.',
        mockConfig,
        undefined
      );
    });

    it('should throw error when no video URLs are available', async () => {
      mockVideoContentManager.downloadAndProcessVideos.mockResolvedValue([]);

      const mockTTSResult = {
        audioPath: '/tmp/audio-123.wav',
        duration: 2.0,
        subtitles: [],
      };

      mockTTSManager.getCachedOrGenerateTTS.mockResolvedValue(mockTTSResult);

      await expect(
        sceneManager.processScenes('video-123', mockScenes.slice(0, 1), mockConfig)
      ).rejects.toThrow('No video URL available for scene 0, part 0');
    });

    it('should calculate total duration correctly', async () => {
      mockVideoContentManager.downloadAndProcessVideos.mockResolvedValue([
        '/api/cached-video/video1.mp4',
      ]);

      const mockTTSResult = {
        audioPath: '/tmp/audio-123.wav',
        duration: 3.5,
        subtitles: [],
      };

      mockTTSManager.getCachedOrGenerateTTS.mockResolvedValue(mockTTSResult);

      const result = await sceneManager.processScenes(
        'video-123',
        mockScenes,
        mockConfig
      );

      // Each scene should have 3.5 seconds, total 7.0 seconds (7000ms)
      expect(result.remotionData.config.durationMs).toBe(7000);
    });
  });

  describe('Re-render Scene Processing', () => {
    const mockScenesWithAudio: SceneInput[] = [
      {
        text: 'Scene with existing audio',
        searchTerms: ['nature'],
        videos: ['/api/cached-video/existing1.mp4'],
        audio: {
          url: '/temp/existing-audio.wav',
          duration: 4.0,
          captions: [{ text: 'Scene', start: 0, end: 2000 }],
        } as any,
      },
      {
        text: 'Scene without audio',
        searchTerms: ['city'],
        videos: ['/api/cached-video/existing2.mp4'],
      },
    ];

    const mockConfig: RenderConfig = {
      voice: VoiceEnum.Paulo,
      language: 'pt',
      orientation: OrientationEnum.portrait,
    };

    it('should reuse existing audio when available', async () => {
      const result = await sceneManager.processReRenderScenes(
        'video-123',
        mockScenesWithAudio.slice(0, 1),
        mockConfig
      );

      expect(result.remotionData.scenes).toHaveLength(1);
      expect(result.remotionData.scenes[0].audio.url).toBe('/temp/existing-audio.wav');
      expect(result.remotionData.scenes[0].duration).toBe(4.0);

      // Should not call TTS generation for existing audio
      expect(mockTTSManager.getCachedOrGenerateTTS).not.toHaveBeenCalled();
    });

    it('should generate new audio when not available', async () => {
      const mockTTSResult = {
        audioPath: '/tmp/new-audio-123.wav',
        duration: 3.0,
        subtitles: [],
      };

      mockTTSManager.getCachedOrGenerateTTS.mockResolvedValue(mockTTSResult);

      const result = await sceneManager.processReRenderScenes(
        'video-123',
        mockScenesWithAudio.slice(1, 2),
        mockConfig
      );

      expect(mockTTSManager.getCachedOrGenerateTTS).toHaveBeenCalledWith(
        'Scene without audio',
        mockConfig,
        undefined
      );

      expect(result.remotionData.scenes[0].audio.url).toBe('/temp/new-audio-123.wav');
      expect(result.remotionData.scenes[0].duration).toBe(3.0);
    });

    it('should throw error for invalid audio duration', async () => {
      const sceneWithInvalidAudio: SceneInput[] = [
        {
          text: 'Scene with invalid audio',
          videos: ['/api/cached-video/video.mp4'],
          audio: {
            url: '/temp/invalid-audio.wav',
            duration: 0, // Invalid duration
          } as any,
        },
      ];

      await expect(
        sceneManager.processReRenderScenes(
          'video-123',
          sceneWithInvalidAudio,
          mockConfig
        )
      ).rejects.toThrow('Invalid audio duration for scene 0: 0');
    });

    it('should throw error when video URL is missing', async () => {
      const sceneWithoutVideo: SceneInput[] = [
        {
          text: 'Scene without video',
          videos: [],
        },
      ];

      await expect(
        sceneManager.processReRenderScenes(
          'video-123',
          sceneWithoutVideo,
          mockConfig
        )
      ).rejects.toThrow('Missing video URL for scene 0 in re-render');
    });
  });

  describe('Single TTS Generation', () => {
    it('should generate single TTS and update render.json', async () => {
      const mockTTSResult = {
        audioPath: '/tmp/single-audio-123.wav',
        duration: 2.5,
        subtitles: [
          { text: 'Test', start: 0, end: 1000 },
          { text: 'audio', start: 1000, end: 2500 },
        ] as Caption[],
      };

      const mockRenderData = {
        scenes: [
          {
            id: 'scene-123',
            text: 'Test audio',
            audio: { url: '/temp/old-audio.wav', duration: 2.0 },
          },
        ],
      };

      mockTTSManager.getCachedOrGenerateTTS.mockResolvedValue(mockTTSResult);
      (fs.access as any).mockResolvedValue(undefined);
      (fs.readJson as any).mockResolvedValue(mockRenderData);
      (fs.writeJson as any).mockResolvedValue(undefined);

      const result = await sceneManager.generateSingleTTSAndUpdate(
        'video-123',
        'scene-123',
        'Test audio',
        {
          voice: VoiceEnum.Paulo,
          language: 'pt',
        },
        true
      );

      expect(result.url).toBe('/temp/single-audio-123.wav');
      expect(result.duration).toBe(2.5);
      expect(result.captions).toEqual(mockTTSResult.subtitles);

      // Should update render.json
      expect(fs.writeJson).toHaveBeenCalledWith(
        '/videos/video-123.render.json',
        {
          scenes: [
            {
              id: 'scene-123',
              text: 'Test audio',
              audio: { url: '/temp/single-audio-123.wav', duration: 2.5 },
              duration: 2.5,
              captions: mockTTSResult.subtitles,
            },
          ],
        },
        { spaces: 2 }
      );
    });

    it('should handle render.json not found gracefully', async () => {
      const mockTTSResult = {
        audioPath: '/tmp/single-audio-123.wav',
        duration: 2.5,
        subtitles: [],
      };

      mockTTSManager.getCachedOrGenerateTTS.mockResolvedValue(mockTTSResult);
      (fs.access as any).mockRejectedValue(new Error('File not found'));

      const result = await sceneManager.generateSingleTTSAndUpdate(
        'video-123',
        'scene-123',
        'Test audio',
        {
          voice: VoiceEnum.Paulo,
          language: 'pt',
        }
      );

      expect(result.url).toBe('/temp/single-audio-123.wav');
      expect(result.duration).toBe(2.5);

      // Should not write render.json
      expect(fs.writeJson).not.toHaveBeenCalled();
    });
  });

  describe('Change Detection', () => {
    const originalData = {
      scenes: [
        {
          id: 'scene-1',
          text: 'Original text 1',
          videos: ['video1.mp4', 'video2.mp4'],
        },
        {
          id: 'scene-2',
          text: 'Original text 2',
          videos: ['video3.mp4'],
        },
      ],
    };

    it('should detect text changes', () => {
      const newData = {
        scenes: [
          {
            id: 'scene-1',
            text: 'Modified text 1',
            videos: ['video1.mp4', 'video2.mp4'],
          },
          {
            id: 'scene-2',
            text: 'Original text 2',
            videos: ['video3.mp4'],
          },
        ],
      };

      const result = sceneManager.detectChanges(originalData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.textChanges).toHaveLength(1);
      expect(result.textChanges[0]).toEqual({
        sceneId: 'scene-1',
        oldText: 'Original text 1',
        newText: 'Modified text 1',
      });
      expect(result.videoChanges).toHaveLength(0);
    });

    it('should detect video changes', () => {
      const newData = {
        scenes: [
          {
            id: 'scene-1',
            text: 'Original text 1',
            videos: ['video1.mp4'], // Removed video2.mp4
          },
          {
            id: 'scene-2',
            text: 'Original text 2',
            videos: ['video3.mp4', 'video4.mp4'], // Added video4.mp4
          },
        ],
      };

      const result = sceneManager.detectChanges(originalData, newData);

      expect(result.hasChanges).toBe(true);
      expect(result.videoChanges).toHaveLength(2);
      expect(result.videoChanges[0]).toEqual({
        sceneId: 'scene-1',
        oldVideos: ['video1.mp4', 'video2.mp4'],
        newVideos: ['video1.mp4'],
      });
      expect(result.videoChanges[1]).toEqual({
        sceneId: 'scene-2',
        oldVideos: ['video3.mp4'],
        newVideos: ['video3.mp4', 'video4.mp4'],
      });
    });

    it('should detect no changes when data is identical', () => {
      const identicalData = JSON.parse(JSON.stringify(originalData));

      const result = sceneManager.detectChanges(originalData, identicalData);

      expect(result.hasChanges).toBe(false);
      expect(result.textChanges).toHaveLength(0);
      expect(result.videoChanges).toHaveLength(0);
    });

    it('should handle missing scenes gracefully', () => {
      const newData = {
        scenes: [
          {
            id: 'scene-1',
            text: 'Original text 1',
            videos: ['video1.mp4', 'video2.mp4'],
          },
          // Missing scene-2
        ],
      };

      const result = sceneManager.detectChanges(originalData, newData);

      // Should only compare existing scenes
      expect(result.hasChanges).toBe(false);
      expect(result.textChanges).toHaveLength(0);
      expect(result.videoChanges).toHaveLength(0);
    });

    it('should handle missing videos arrays', () => {
      const dataWithoutVideos = {
        scenes: [
          {
            id: 'scene-1',
            text: 'Original text 1',
            // No videos array
          },
        ],
      };

      const result = sceneManager.detectChanges(dataWithoutVideos, originalData);

      expect(result.hasChanges).toBe(true);
      expect(result.videoChanges).toHaveLength(1);
      expect(result.videoChanges[0]).toEqual({
        sceneId: 'scene-1',
        oldVideos: [],
        newVideos: ['video1.mp4', 'video2.mp4'],
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle TTS generation errors', async () => {
      const mockError = new Error('TTS generation failed');
      
      mockVideoContentManager.downloadAndProcessVideos.mockResolvedValue([
        '/api/cached-video/video1.mp4',
      ]);
      mockTTSManager.getCachedOrGenerateTTS.mockRejectedValue(mockError);

      const scenes: SceneInput[] = [
        {
          text: 'Test scene',
          searchTerms: ['test'],
        },
      ];

      await expect(
        sceneManager.processScenes('video-123', scenes, {
          voice: VoiceEnum.Paulo,
          language: 'pt',
        })
      ).rejects.toThrow('TTS generation failed');
    });

    it('should handle video processing errors', async () => {
      const mockError = new Error('Video processing failed');
      
      mockVideoContentManager.downloadAndProcessVideos.mockRejectedValue(mockError);

      const scenes: SceneInput[] = [
        {
          text: 'Test scene',
          searchTerms: ['test'],
        },
      ];

      await expect(
        sceneManager.processScenes('video-123', scenes, {
          voice: VoiceEnum.Paulo,
          language: 'pt',
        })
      ).rejects.toThrow('Video processing failed');
    });

    it('should handle status manager errors gracefully', async () => {
      mockStatusManager.setProgress.mockRejectedValue(new Error('Status update failed'));
      
      mockVideoContentManager.downloadAndProcessVideos.mockResolvedValue([
        '/api/cached-video/video1.mp4',
      ]);
      
      const mockTTSResult = {
        audioPath: '/tmp/audio-123.wav',
        duration: 3.0,
        subtitles: [],
      };
      
      mockTTSManager.getCachedOrGenerateTTS.mockResolvedValue(mockTTSResult);

      const scenes: SceneInput[] = [
        {
          text: 'Test scene',
          searchTerms: ['test'],
        },
      ];

      // Should continue processing despite status update errors
      const result = await sceneManager.processScenes('video-123', scenes, {
        voice: VoiceEnum.Paulo,
        language: 'pt',
      });

      expect(result.remotionData.scenes).toHaveLength(1);
    });
  });
});