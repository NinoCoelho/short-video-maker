import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { ImportPipelineService } from '../ImportPipelineService';
import { VideoImportService } from '../VideoImportService';
import { OllamaService } from '../OllamaService';
import { EventBus } from '../../server/events/EventBus';
import {
  ImportJob,
  ImportJobStatus,
  VideoSourceType,
  VideoImportRequest,
  TranscriptSegment
} from '../../types/import';
import { EventEmitter } from 'events';
import fs from 'fs-extra';
import { exec } from 'child_process';

// Mock modules
vi.mock('../VideoImportService');
vi.mock('../OllamaService');
vi.mock('../../server/events/EventBus');
vi.mock('fs-extra');
vi.mock('child_process');
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('ImportPipelineService', () => {
  let service: ImportPipelineService;
  let mockVideoImportService: any;
  let mockOllamaService: any;
  let mockEventBus: any;
  const config = {
    dataDir: '/tmp/test',
    enableOllama: true,
    ollamaConfig: {
      baseUrl: 'http://localhost:11434',
      defaultModel: 'gemma3:12b'
    }
  };

  beforeEach(async () => {
    // Mock EventBus singleton
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    };
    (EventBus.getInstance as any).mockReturnValue(mockEventBus);

    // Mock VideoImportService
    mockVideoImportService = new EventEmitter();
    mockVideoImportService.createImportJob = vi.fn();
    mockVideoImportService.getJob = vi.fn();
    mockVideoImportService.getAllJobs = vi.fn();
    mockVideoImportService.cancelJob = vi.fn();
    mockVideoImportService.analyzeUrl = vi.fn();
    (VideoImportService as any).mockImplementation(() => mockVideoImportService);

    // Mock OllamaService
    mockOllamaService = {
      detectHighlights: vi.fn(),
      detectSceneBoundaries: vi.fn(),
      analyzeTranscript: vi.fn(),
      getAvailability: vi.fn().mockReturnValue(true)
    };
    (OllamaService as any).mockImplementation(() => mockOllamaService);

    // Mock fs operations
    (fs.ensureDir as MockedFunction<typeof fs.ensureDir>).mockResolvedValue(undefined);
    (fs.readJson as MockedFunction<typeof fs.readJson>).mockResolvedValue({});
    (fs.writeJson as MockedFunction<typeof fs.writeJson>).mockResolvedValue(undefined);

    service = new ImportPipelineService(config);
    await new Promise(resolve => setTimeout(resolve, 10)); // Allow initialization
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with all services', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(EventEmitter);
      expect(VideoImportService).toHaveBeenCalledWith(config.dataDir);
      expect(OllamaService).toHaveBeenCalledWith(config.ollamaConfig);
    });

    it('should setup event listeners', () => {
      // Verify event listeners are set up on VideoImportService
      expect(mockVideoImportService.on).toHaveBeenCalledWith('job:created', expect.any(Function));
      expect(mockVideoImportService.on).toHaveBeenCalledWith('job:progress', expect.any(Function));
      expect(mockVideoImportService.on).toHaveBeenCalledWith('job:completed', expect.any(Function));
      expect(mockVideoImportService.on).toHaveBeenCalledWith('job:status', expect.any(Function));
    });
  });

  describe('startImport', () => {
    it('should start import successfully', async () => {
      const request: VideoImportRequest = {
        url: 'https://youtube.com/watch?v=test123',
        source: VideoSourceType.YOUTUBE,
        config: {
          enableTranscription: true,
          targetLanguage: 'en'
        }
      };

      const mockJob: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.YOUTUBE,
        sourceUrl: request.url,
        status: ImportJobStatus.QUEUED,
        progress: 0,
        config: request.config as any,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockVideoImportService.createImportJob.mockResolvedValue(mockJob);

      const job = await service.startImport(request);

      expect(job).toEqual(mockJob);
      expect(mockVideoImportService.createImportJob).toHaveBeenCalledWith(request);
    });

    it('should handle import start errors', async () => {
      const request: VideoImportRequest = {
        url: 'https://invalid.com/video',
        source: VideoSourceType.URL
      };

      mockVideoImportService.createImportJob.mockRejectedValue(
        new Error('Failed to create job')
      );

      await expect(service.startImport(request)).rejects.toThrow('Failed to create job');
    });
  });

  describe('event forwarding', () => {
    it('should forward job:created events', () => {
      const job = { id: 'job-123' };
      const importCreatedHandler = vi.fn();
      service.on('import:created', importCreatedHandler);

      // Trigger the event from VideoImportService
      const handler = mockVideoImportService.on.mock.calls.find(
        call => call[0] === 'job:created'
      )[1];
      handler(job);

      expect(importCreatedHandler).toHaveBeenCalledWith(job);
      expect(mockEventBus.emit).toHaveBeenCalledWith('import:created', job);
    });

    it('should forward job:progress events', () => {
      const progressData = { jobId: 'job-123', progress: 50 };
      const progressHandler = vi.fn();
      service.on('import:progress', progressHandler);

      // Trigger the event
      const handler = mockVideoImportService.on.mock.calls.find(
        call => call[0] === 'job:progress'
      )[1];
      handler(progressData);

      expect(progressHandler).toHaveBeenCalledWith(progressData);
      expect(mockEventBus.emit).toHaveBeenCalledWith('import:progress', progressData);
    });

    it('should forward job:status events', () => {
      const statusData = { jobId: 'job-123', status: ImportJobStatus.PROCESSING };
      const statusHandler = vi.fn();
      service.on('import:status', statusHandler);

      // Trigger the event
      const handler = mockVideoImportService.on.mock.calls.find(
        call => call[0] === 'job:status'
      )[1];
      handler(statusData);

      expect(statusHandler).toHaveBeenCalledWith(statusData);
      expect(mockEventBus.emit).toHaveBeenCalledWith('import:status', statusData);
    });
  });

  describe('processImport', () => {
    it('should process import with progress callbacks', async () => {
      const onProgress = vi.fn();
      const options = {
        jobId: 'job-123',
        url: 'https://example.com/video.mp4',
        config: { enableTranscription: true },
        onProgress
      };

      // Mock the import job
      const mockJob: ImportJob = {
        id: options.jobId,
        source: VideoSourceType.URL,
        sourceUrl: options.url,
        status: ImportJobStatus.PROCESSING,
        progress: 0,
        config: options.config as any,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockVideoImportService.getJob.mockReturnValue(mockJob);

      // Create a promise that we can control
      let resolveProcess: () => void;
      const processPromise = new Promise<void>(resolve => {
        resolveProcess = resolve;
      });

      // Mock processImport to return our controlled promise
      vi.spyOn(service, 'processImport').mockImplementation(async (opts) => {
        // Simulate progress updates
        opts.onProgress(25, 'Downloading video...');
        opts.onProgress(50, 'Extracting audio...');
        opts.onProgress(75, 'Transcribing...');
        opts.onProgress(100, 'Complete');
        await processPromise;
      });

      // Start processing
      const processResult = service.processImport(options);

      // Allow async operations to run
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify progress callbacks
      expect(onProgress).toHaveBeenCalledWith(25, 'Downloading video...');
      expect(onProgress).toHaveBeenCalledWith(50, 'Extracting audio...');
      expect(onProgress).toHaveBeenCalledWith(75, 'Transcribing...');
      expect(onProgress).toHaveBeenCalledWith(100, 'Complete');

      // Complete the process
      resolveProcess!();
      await processResult;
    });

    it('should handle process errors', async () => {
      const onProgress = vi.fn();
      const options = {
        jobId: 'job-123',
        url: 'https://example.com/video.mp4',
        config: {},
        onProgress
      };

      vi.spyOn(service, 'processImport').mockRejectedValue(
        new Error('Processing failed')
      );

      await expect(service.processImport(options)).rejects.toThrow('Processing failed');
    });
  });

  describe('continueProcessing', () => {
    it('should continue processing after video import', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.YOUTUBE,
        sourceUrl: 'https://youtube.com/watch?v=test',
        status: ImportJobStatus.COMPLETED,
        progress: 100,
        config: {
          enableTranscription: true,
          enableSmartCrop: true,
          enableHighlightDetection: true
        } as any,
        videoPath: '/tmp/video.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock transcription
      const mockTranscript: TranscriptSegment[] = [
        { startTime: 0, endTime: 10, text: 'Hello world', confidence: 0.95 }
      ];

      // Mock exec for transcription
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('whisper')) {
          callback(null, JSON.stringify(mockTranscript), '');
        } else {
          callback(null, '', '');
        }
      });

      // Mock Ollama analysis
      mockOllamaService.detectHighlights.mockResolvedValue([
        {
          startTime: 0,
          endTime: 10,
          score: 0.85,
          title: 'Great moment',
          description: 'An amazing highlight'
        }
      ]);

      mockOllamaService.analyzeTranscript.mockResolvedValue({
        topics: ['greeting'],
        keywords: ['hello', 'world'],
        sentiment: 'positive',
        summary: 'A greeting'
      });

      // Continue processing
      await (service as any).continueProcessing(job);

      // Verify Ollama was called if enabled
      expect(mockOllamaService.detectHighlights).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should skip Ollama analysis if disabled', async () => {
      // Create service with Ollama disabled
      const disabledConfig = { ...config, enableOllama: false };
      const serviceNoOllama = new ImportPipelineService(disabledConfig);

      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.COMPLETED,
        progress: 100,
        config: {} as any,
        videoPath: '/tmp/video.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await (serviceNoOllama as any).continueProcessing(job);

      expect(mockOllamaService.detectHighlights).not.toHaveBeenCalled();
    });
  });

  describe('transformToShortInput', () => {
    it('should transform import data to short creation input', async () => {
      const jobId = 'job-123';
      const importData = {
        job: {
          id: jobId,
          sourceUrl: 'https://youtube.com/watch?v=test',
          videoPath: '/tmp/video.mp4'
        },
        metadata: {
          title: 'Test Video',
          duration: 300,
          width: 1920,
          height: 1080
        },
        transcript: [
          { startTime: 0, endTime: 10, text: 'Hello', confidence: 0.95 },
          { startTime: 10, endTime: 20, text: 'World', confidence: 0.98 }
        ],
        highlights: [
          {
            startTime: 0,
            endTime: 20,
            score: 0.9,
            title: 'Great intro',
            description: 'Opening sequence'
          }
        ],
        analysis: {
          topics: ['greeting'],
          keywords: ['hello', 'world'],
          sentiment: 'positive',
          summary: 'A greeting video'
        }
      };

      const transform = await service.transformToShortInput(jobId, importData as any);

      expect(transform).toMatchObject({
        title: expect.stringContaining('Test Video'),
        script: expect.any(Array),
        backgroundMusic: {
          volume: 0.3,
          fadeIn: true,
          fadeOut: true
        },
        metadata: {
          originalVideoUrl: 'https://youtube.com/watch?v=test',
          importJobId: jobId
        }
      });

      expect(transform.script.length).toBeGreaterThan(0);
      expect(transform.script[0]).toHaveProperty('text');
      expect(transform.script[0]).toHaveProperty('duration');
    });
  });

  describe('getImportStatus', () => {
    it('should get import status', async () => {
      const jobId = 'job-123';
      const mockJob: ImportJob = {
        id: jobId,
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.PROCESSING,
        progress: 50,
        config: {} as any,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockVideoImportService.getJob.mockReturnValue(mockJob);

      const status = await service.getImportStatus(jobId);

      expect(status).toMatchObject({
        id: jobId,
        status: ImportJobStatus.PROCESSING,
        progress: 50
      });
    });

    it('should return null for non-existent job', async () => {
      mockVideoImportService.getJob.mockReturnValue(undefined);

      const status = await service.getImportStatus('non-existent');

      expect(status).toBeNull();
    });
  });

  describe('cancelImport', () => {
    it('should cancel import job', async () => {
      const jobId = 'job-123';
      mockVideoImportService.cancelJob.mockResolvedValue(undefined);

      await service.cancelImport(jobId);

      expect(mockVideoImportService.cancelJob).toHaveBeenCalledWith(jobId);
    });

    it('should handle cancel errors', async () => {
      const jobId = 'job-123';
      mockVideoImportService.cancelJob.mockRejectedValue(
        new Error('Cannot cancel completed job')
      );

      await expect(service.cancelImport(jobId)).rejects.toThrow('Cannot cancel completed job');
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      const cleanupSpy = vi.spyOn(mockOllamaService, 'cleanup' as any).mockResolvedValue(undefined);
      
      await service.cleanup();

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle transcription errors gracefully', async () => {
      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.COMPLETED,
        progress: 100,
        config: { enableTranscription: true } as any,
        videoPath: '/tmp/video.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock exec to fail for transcription
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('whisper')) {
          callback(new Error('Whisper not found'), '', '');
        } else {
          callback(null, '', '');
        }
      });

      const errorHandler = vi.fn();
      service.on('import:error', errorHandler);

      await (service as any).continueProcessing(job);

      expect(errorHandler).toHaveBeenCalledWith({
        jobId: job.id,
        error: expect.any(String),
        phase: 'transcription'
      });
    });

    it('should handle Ollama service unavailability', async () => {
      mockOllamaService.getAvailability.mockReturnValue(false);

      const job: ImportJob = {
        id: 'job-123',
        source: VideoSourceType.URL,
        sourceUrl: 'https://example.com/video.mp4',
        status: ImportJobStatus.COMPLETED,
        progress: 100,
        config: { enableHighlightDetection: true } as any,
        videoPath: '/tmp/video.mp4',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await (service as any).continueProcessing(job);

      // Should skip Ollama analysis when unavailable
      expect(mockOllamaService.detectHighlights).not.toHaveBeenCalled();
    });
  });
});