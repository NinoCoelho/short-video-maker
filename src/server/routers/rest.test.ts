import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';
import { Mock } from 'vitest';
import { APIRouter } from './rest';
import { Config } from '../../config';
import { ShortCreator } from '../../short-creator/ShortCreator';
import { VideoStatusManager } from '../../short-creator/VideoStatusManager';
import { TranslationService } from '../../services/TranslationService';
import { TranscriptionService } from '../../services/TranscriptionService';
import { VoiceEnum, OrientationEnum, MusicMoodEnum, SceneInput, RenderConfig } from '../../types/shorts';
import fs from 'fs';
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

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  createReadStream: vi.fn(),
}));

vi.mock('../../services/TranslationService', () => ({
  TranslationService: vi.fn().mockImplementation(() => ({
    translate: vi.fn(),
    detectLanguage: vi.fn(),
  })),
}));

vi.mock('../../services/TranscriptionService', () => ({
  TranscriptionService: vi.fn().mockImplementation(() => ({
    transcribe: vi.fn(),
  })),
}));

vi.mock('../middleware/security', () => ({
  PathTraversalGuard: {
    middleware: vi.fn(() => (req: any, res: any, next: any) => next()),
  },
  URLValidator: {
    middleware: vi.fn(() => (req: any, res: any, next: any) => next()),
  },
  APIKeyValidator: {
    requireApiKeys: vi.fn(() => (req: any, res: any, next: any) => next()),
  },
  validateRequest: vi.fn(() => (req: any, res: any, next: any) => next()),
  validationSchemas: {
    renderRequest: {},
    ttsRequest: {},
    searchQuery: {},
  },
  secureFileUpload: {
    array: vi.fn(() => (req: any, res: any, next: any) => next()),
  },
}));

vi.mock('../routes/translationRoutes', () => ({
  default: vi.fn(),
  initializeTranslationRoutes: vi.fn(),
}));

vi.mock('../routes/videoSearchConfig', () => ({
  videoSearchConfigRouter: express.Router(),
}));

vi.mock('../routes/videoProxy', () => ({
  videoProxy: vi.fn((req: any, res: any) => res.json({ proxied: true })),
}));

vi.mock('../utils/ResponseFormatter', () => ({
  ResponseFormatter: {
    success: vi.fn((res: Response, data: any, status: number = 200) => {
      res.status(status).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    }),
    successPaginated: vi.fn((res: Response, data: any, pagination: any) => {
      res.json({
        success: true,
        data,
        pagination,
        timestamp: new Date().toISOString(),
      });
    }),
  },
}));

vi.mock('../middleware/errorHandler', () => ({
  asyncHandler: vi.fn((fn: any) => fn),
}));

vi.mock('../errors/AppError', () => ({
  NotFoundError: class extends Error {
    constructor(resource: string, id?: string) {
      super(`${resource}${id ? ` ${id}` : ''} not found`);
    }
  },
  ValidationError: class extends Error {
    constructor(message: string) {
      super(message);
    }
  },
  ProcessingError: class extends Error {
    constructor(message: string, id?: string, type?: string) {
      super(message);
    }
  },
}));

describe('APIRouter', () => {
  let app: express.Application;
  let apiRouter: APIRouter;
  let mockConfig: Config;
  let mockShortCreator: any;
  let mockVideoStatusManager: any;
  let mockTranslationService: any;
  let mockTranscriptionService: any;

  beforeEach(() => {
    // Create mock config
    mockConfig = {
      tempDirPath: '/tmp/test',
      remotion: {
        rendering: {
          serveUrl: 'http://localhost:3122',
        },
      },
    } as Config;

    // Create mock services
    mockShortCreator = {
      status: vi.fn(),
      addToQueue: vi.fn(),
      reRenderVideo: vi.fn(),
      getScriptById: vi.fn(),
      getVideoPath: vi.fn(),
      getAllVideos: vi.fn(),
      deleteVideo: vi.fn(),
      getVideoById: vi.fn(),
      saveVideoData: vi.fn(),
      saveAndProcessVideoEdition: vi.fn(),
      reRenderEditedVideo: vi.fn(),
      clearAllVideos: vi.fn(),
      searchVideos: vi.fn(),
      generateSingleTTSAndUpdate: vi.fn(),
      getCachedVideoPath: vi.fn(),
      getCacheStats: vi.fn(),
      cleanupVideoCache: vi.fn(),
      ListAvailableVoices: vi.fn(),
      ListAvailableMusicTags: vi.fn(),
      getVideoProviderFacade: vi.fn(),
    } as any;

    mockVideoStatusManager = {
      setStatus: vi.fn(),
      setError: vi.fn(),
      getStatus: vi.fn(),
    } as any;

    mockTranslationService = {
      translate: vi.fn(),
      detectLanguage: vi.fn(),
    };
    mockTranscriptionService = {
      transcribe: vi.fn(),
    };

    // Create API router
    apiRouter = new APIRouter(
      mockConfig,
      mockShortCreator,
      mockVideoStatusManager,
      mockTranslationService,
      mockTranscriptionService
    );

    // Create Express app
    app = express();
    app.use('/api', apiRouter.router);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/status/:id', () => {
    it('should return video status when video exists', async () => {
      const mockStatus = {
        id: 'test-video-123',
        status: 'processing',
        progress: 50,
        message: 'Processing video',
      };

      mockShortCreator.status.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/status/test-video-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStatus);
      expect(mockShortCreator.status).toHaveBeenCalledWith('test-video-123');
    });

    it('should return 404 when video does not exist', async () => {
      mockShortCreator.status.mockResolvedValue(null);

      await request(app)
        .get('/api/status/nonexistent-video')
        .expect(404);
    });

    it('should return validation error for missing ID', async () => {
      await request(app)
        .get('/api/status/')
        .expect(404); // Express returns 404 for missing params
    });
  });

  describe('GET /api/logs/:id', () => {
    it('should return logs for video with default limit', async () => {
      const response = await request(app)
        .get('/api/logs/test-video-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.logs).toBeInstanceOf(Array);
      expect(response.body.data.total).toBe(1);
    });

    it('should respect custom limit parameter', async () => {
      const response = await request(app)
        .get('/api/logs/test-video-123?limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.logs).toBeInstanceOf(Array);
    });

    it('should reject invalid limit values', async () => {
      await request(app)
        .get('/api/logs/test-video-123?limit=invalid')
        .expect(500); // Should be handled by validation middleware
    });
  });

  describe('POST /api/render', () => {
    it('should create new video with scenes and config', async () => {
      const renderRequest = {
        scenes: [
          { text: 'Scene 1 text', searchTerms: ['test'] },
          { text: 'Scene 2 text', searchTerms: ['video'] },
        ] as SceneInput[],
        config: {
          voice: VoiceEnum.Paulo,
          language: 'pt' as const,
          orientation: OrientationEnum.portrait,
          music: MusicMoodEnum.happy,
        } as RenderConfig,
      };

      const mockVideoId = 'new-video-123';
      mockShortCreator.addToQueue.mockResolvedValue(mockVideoId);

      const response = await request(app)
        .post('/api/render')
        .send(renderRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.videoId).toBe(mockVideoId);
      expect(response.body.data.message).toBe('Video rendering started');
      expect(mockShortCreator.addToQueue).toHaveBeenCalledWith(
        renderRequest.scenes,
        renderRequest.config
      );
    });

    it('should re-render existing video', async () => {
      const renderRequest = {
        id: 'existing-video-123',
        scenes: [{ text: 'Updated scene', searchTerms: ['test'] }] as SceneInput[],
        config: {
          voice: VoiceEnum.Paulo,
          language: 'pt' as const,
        } as RenderConfig,
      };

      mockShortCreator.reRenderVideo.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/render')
        .send(renderRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.videoId).toBe('existing-video-123');
      expect(mockShortCreator.reRenderVideo).toHaveBeenCalledWith(
        'existing-video-123',
        renderRequest.scenes,
        renderRequest.config
      );
    });

    it('should load existing data for re-render when not provided', async () => {
      const renderRequest = {
        id: 'existing-video-123',
      };

      const existingData = {
        scenes: [{ text: 'Existing scene', searchTerms: ['test'] }] as SceneInput[],
        config: {
          voice: VoiceEnum.Paulo,
          language: 'pt' as const,
          orientation: OrientationEnum.portrait,
        } as RenderConfig,
      };

      mockShortCreator.getScriptById.mockReturnValue(existingData);
      mockShortCreator.reRenderVideo.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/render')
        .send(renderRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(mockShortCreator.getScriptById).toHaveBeenCalledWith('existing-video-123');
      expect(mockShortCreator.reRenderVideo).toHaveBeenCalledWith(
        'existing-video-123',
        existingData.scenes,
        existingData.config
      );
    });

    it('should return validation error for missing required fields', async () => {
      await request(app)
        .post('/api/render')
        .send({})
        .expect(500); // Validation error
    });
  });

  describe('GET /api/short-videos', () => {
    it('should return paginated list of videos', async () => {
      const mockVideos = Array.from({ length: 25 }, (_, i) => ({
        id: `video-${i}`,
        title: `Video ${i}`,
        status: 'ready',
      }));

      mockShortCreator.getAllVideos.mockResolvedValue(mockVideos);

      const response = await request(app)
        .get('/api/short-videos?page=2&limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(10);
      expect(response.body.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true,
      });
    });

    it('should use default pagination values', async () => {
      mockShortCreator.getAllVideos.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/short-videos')
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });

    it('should validate pagination parameters', async () => {
      await request(app)
        .get('/api/short-videos?page=0&limit=150')
        .expect(500);
    });
  });

  describe('GET /api/video/:id', () => {
    it('should serve video file with correct headers', async () => {
      const mockVideoPath = '/path/to/video.mp4';
      const mockStats = { size: 1024000 };
      
      mockShortCreator.getVideoPath.mockReturnValue(mockVideoPath);
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.statSync as Mock).mockReturnValue(mockStats);
      
      const mockStream = {
        pipe: vi.fn(),
      };
      (fs.createReadStream as Mock).mockReturnValue(mockStream);

      const response = await request(app)
        .get('/api/video/test-video-123')
        .expect(200);

      expect(mockShortCreator.getVideoPath).toHaveBeenCalledWith('test-video-123');
      expect(fs.existsSync).toHaveBeenCalledWith(mockVideoPath);
    });

    it('should handle range requests for video streaming', async () => {
      const mockVideoPath = '/path/to/video.mp4';
      const mockStats = { size: 1024000 };
      
      mockShortCreator.getVideoPath.mockReturnValue(mockVideoPath);
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.statSync as Mock).mockReturnValue(mockStats);
      
      const mockStream = {
        pipe: vi.fn(),
      };
      (fs.createReadStream as Mock).mockReturnValue(mockStream);

      await request(app)
        .get('/api/video/test-video-123')
        .set('Range', 'bytes=0-1023')
        .expect(206);
    });

    it('should return 404 for non-existent video', async () => {
      mockShortCreator.getVideoPath.mockReturnValue(null);

      await request(app)
        .get('/api/video/nonexistent-video')
        .expect(404);
    });
  });

  describe('DELETE /api/short-video/:id', () => {
    it('should delete video successfully', async () => {
      mockShortCreator.deleteVideo.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/short-video/test-video-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.videoId).toBe('test-video-123');
      expect(mockShortCreator.deleteVideo).toHaveBeenCalledWith('test-video-123');
    });

    it('should handle deletion errors', async () => {
      mockShortCreator.deleteVideo.mockRejectedValue(new Error('Delete failed'));

      await request(app)
        .delete('/api/short-video/test-video-123')
        .expect(500);
    });
  });

  describe('POST /api/generate-tts', () => {
    it('should generate TTS audio successfully', async () => {
      const ttsRequest = {
        text: 'Hello world',
        voice: VoiceEnum.Paulo,
        language: 'pt',
      };

      const mockAudioResult = {
        audioUrl: '/tmp/audio-123.wav',
        duration: 2.5,
      };

      mockShortCreator.generateSingleTTSAndUpdate.mockResolvedValue(mockAudioResult);

      const response = await request(app)
        .post('/api/generate-tts')
        .send(ttsRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filename).toBe('audio-123.wav');
      expect(response.body.data.duration).toBe(2.5);
      expect(response.body.data.text).toBe('Hello world');
    });

    it('should validate text length', async () => {
      const longText = 'a'.repeat(1001);

      await request(app)
        .post('/api/generate-tts')
        .send({ text: longText })
        .expect(500);
    });

    it('should handle TTS generation failure', async () => {
      mockShortCreator.generateSingleTTSAndUpdate.mockResolvedValue(null);

      await request(app)
        .post('/api/generate-tts')
        .send({ text: 'Hello world' })
        .expect(500);
    });
  });

  describe('POST /api/search-background-videos', () => {
    it('should search for background videos', async () => {
      const mockVideos = [
        { id: 'video-1', url: 'https://example.com/video1.mp4', title: 'Video 1' },
        { id: 'video-2', url: 'https://example.com/video2.mp4', title: 'Video 2' },
      ];

      mockShortCreator.searchVideos.mockResolvedValue(mockVideos);

      const response = await request(app)
        .post('/api/search-background-videos')
        .send({
          query: 'nature',
          count: 5,
          orientation: 'portrait',
          excludeIds: [],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.videos).toEqual(mockVideos);
      expect(response.body.data.query).toBe('nature');
      expect(response.body.data.count).toBe(2);
    });

    it('should filter out excluded IDs', async () => {
      const mockVideos = [
        { id: 'video-1', url: 'https://example.com/video1.mp4' },
        { id: 'video-2', url: 'https://example.com/video2.mp4' },
        { id: 'video-3', url: 'https://example.com/video3.mp4' },
      ];

      mockShortCreator.searchVideos.mockResolvedValue(mockVideos);

      const response = await request(app)
        .post('/api/search-background-videos')
        .send({
          query: 'nature',
          excludeIds: ['video-2'],
        })
        .expect(200);

      expect(response.body.data.videos).toHaveLength(2);
      expect(response.body.data.videos.find((v: any) => v.id === 'video-2')).toBeUndefined();
    });

    it('should validate search query', async () => {
      await request(app)
        .post('/api/search-background-videos')
        .send({ query: '' })
        .expect(500);
    });
  });

  describe('GET /api/dashboard/stats', () => {
    it('should return dashboard statistics', async () => {
      const mockVideos = [
        { status: 'ready', createdAt: new Date().toISOString(), duration: 30 },
        { status: 'processing', createdAt: new Date().toISOString(), duration: 45 },
        { status: 'failed', createdAt: new Date().toISOString(), duration: 0 },
        { status: 'pending', createdAt: new Date().toISOString(), duration: 60 },
      ];

      mockShortCreator.getAllVideos.mockResolvedValue(mockVideos);

      const response = await request(app)
        .get('/api/dashboard/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        totalVideos: 4,
        completedVideos: 1,
        processingVideos: 1,
        failedVideos: 1,
        pendingVideos: 1,
        todayVideos: 4,
        totalDuration: 135,
      });
    });
  });

  describe('GET /api/voices', () => {
    it('should return available voices', async () => {
      const mockVoices = [
        { id: 'paulo', name: 'Paulo', language: 'pt' },
        { id: 'ana', name: 'Ana', language: 'pt' },
      ];

      mockShortCreator.ListAvailableVoices.mockReturnValue(mockVoices);

      const response = await request(app)
        .get('/api/voices')
        .expect(200);

      expect(response.body).toEqual(mockVoices);
    });

    it('should handle errors gracefully', async () => {
      mockShortCreator.ListAvailableVoices.mockImplementation(() => {
        throw new Error('Voices not available');
      });

      const response = await request(app)
        .get('/api/voices')
        .expect(500);

      expect(response.body.error).toBe('Failed to list voices');
    });
  });

  describe('GET /api/cache/stats', () => {
    it('should return cache statistics', async () => {
      const mockStats = {
        size: 1024000,
        files: 50,
        hitRate: 0.85,
      };

      mockShortCreator.getCacheStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/api/cache/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStats);
    });
  });

  describe('POST /api/cache/cleanup', () => {
    it('should cleanup cache with default age', async () => {
      const mockNewStats = {
        size: 512000,
        files: 25,
        hitRate: 0.90,
      };

      mockShortCreator.cleanupVideoCache.mockResolvedValue(undefined);
      mockShortCreator.getCacheStats.mockReturnValue(mockNewStats);

      const response = await request(app)
        .post('/api/cache/cleanup')
        .send({})
        .expect(200);

      expect(response.body.message).toBe('Cache cleanup completed');
      expect(response.body.stats).toEqual(mockNewStats);
      expect(mockShortCreator.cleanupVideoCache).toHaveBeenCalledWith(24);
    });

    it('should cleanup cache with custom age', async () => {
      mockShortCreator.cleanupVideoCache.mockResolvedValue(undefined);
      mockShortCreator.getCacheStats.mockReturnValue({});

      await request(app)
        .post('/api/cache/cleanup')
        .send({ maxAgeHours: 48 })
        .expect(200);

      expect(mockShortCreator.cleanupVideoCache).toHaveBeenCalledWith(48);
    });
  });

  describe('Error Handling', () => {
    it('should handle internal server errors gracefully', async () => {
      mockShortCreator.status.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/status/test-video-123')
        .expect(500);

      // The error should be caught and handled by the error middleware
      expect(response.body.error).toBeDefined();
    });

    it('should handle validation errors with proper status codes', async () => {
      // This tests the validation middleware integration
      await request(app)
        .post('/api/render')
        .send({ invalid: 'data' })
        .expect(500); // Validation error should be thrown
    });
  });

  describe('File Serving Endpoints', () => {
    it('should serve temp files with security checks', async () => {
      const filename = 'audio-123.wav';
      const filePath = path.join('/tmp/test', filename);
      const mockStats = { size: 50000 };

      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.statSync as Mock).mockReturnValue(mockStats);
      
      const mockStream = { pipe: vi.fn() };
      (fs.createReadStream as Mock).mockReturnValue(mockStream);

      await request(app)
        .get(`/api/temp/${filename}`)
        .expect(200);

      expect(fs.existsSync).toHaveBeenCalledWith(filePath);
    });

    it('should reject files with path traversal attempts', async () => {
      await request(app)
        .get('/api/temp/../../../etc/passwd')
        .expect(500);
    });
  });
});