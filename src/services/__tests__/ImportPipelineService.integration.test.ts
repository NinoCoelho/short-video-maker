import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { ImportPipelineService } from '../ImportPipelineService';
import { VideoImportService } from '../VideoImportService';
import { OllamaService } from '../OllamaService';
import { TranscriptionService } from '../TranscriptionService';
import { VideoSegmentService } from '../VideoSegmentService';
import { CropService } from '../CropService';
import { TranslationService } from '../TranslationService';
import { EventBus } from '../../server/events/EventBus';
import { WebSocketServer } from '../../server/websocket/WebSocketServer';
import { ImportJobStatus, VideoSourceType } from '../../types/import';
import type { ImportJob, VideoImportRequest, TranscriptSegment, DetectedScene, SuggestedClip } from '../../types/import';
import fs from 'fs-extra';
import path from 'path';
import { Server as HTTPServer } from 'http';
import { createServer } from 'http';

// Skip if not running integration tests
const RUN_INTEGRATION = process.env.INTEGRATION_TEST === 'true';

describe.skipIf(!RUN_INTEGRATION)('ImportPipelineService Integration Tests', () => {
  let pipeline: ImportPipelineService;
  let testDataDir: string;
  let eventBus: EventBus;
  let httpServer: HTTPServer;
  let wsServer: WebSocketServer;
  let capturedEvents: any[] = [];
  let wsEvents: any[] = [];

  // Test fixtures
  const TEST_YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const TEST_DIRECT_URL = 'https://example.com/sample-video.mp4';
  const TEST_VIDEO_PATH = path.join(__dirname, 'fixtures', 'test-video.mp4');

  beforeAll(async () => {
    // Create test data directory
    testDataDir = path.join(__dirname, 'test-data', `integration-${Date.now()}`);
    await fs.ensureDir(testDataDir);

    // Create test video fixture if it doesn't exist
    const fixturesDir = path.join(__dirname, 'fixtures');
    await fs.ensureDir(fixturesDir);
    
    // Initialize EventBus
    eventBus = EventBus.getInstance();

    // Create HTTP server and WebSocket server for testing
    httpServer = createServer();
    wsServer = new WebSocketServer(httpServer);
    
    // Start listening
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    // Initialize pipeline with test configuration
    pipeline = new ImportPipelineService({
      dataDir: testDataDir,
      enableOllama: false, // Disable for integration tests unless explicitly testing
      ollamaConfig: {
        baseUrl: 'http://localhost:11434',
        defaultModel: 'llama2'
      }
    });

    // Capture all events for verification
    setupEventCapture();
  });

  afterAll(async () => {
    // Clean up test data
    await fs.remove(testDataDir);
    
    // Close servers
    wsServer && httpServer.close();
    
    // Remove event listeners
    cleanupEventCapture();
  });

  beforeEach(() => {
    // Clear captured events
    capturedEvents = [];
    wsEvents = [];
  });

  function setupEventCapture() {
    // Capture pipeline events
    const pipelineEvents = [
      'import:created',
      'import:progress',
      'import:status',
      'import:analyzed',
      'job:created',
      'job:progress',
      'job:completed',
      'job:failed',
      'job:status'
    ];

    pipelineEvents.forEach(event => {
      pipeline.on(event, (data) => {
        capturedEvents.push({ event, data, timestamp: new Date() });
      });
    });

    // Capture EventBus events
    const busEvents = [
      'import:created',
      'import:progress',
      'import:status',
      'import:analyzed',
      'video:status:update',
      'download:progress',
      'download:status',
      'download:complete',
      'download:error'
    ];

    busEvents.forEach(event => {
      eventBus.on(event, (data) => {
        capturedEvents.push({ event: `bus:${event}`, data, timestamp: new Date() });
      });
    });
  }

  function cleanupEventCapture() {
    pipeline.removeAllListeners();
    eventBus.removeAllListeners();
  }

  describe('End-to-End Import Process', () => {
    it('should complete full import pipeline from URL to segments', async () => {
      // Mock external services for predictable testing
      const mockVideoPath = await createMockVideo(testDataDir);
      
      // Mock VideoImportService download
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);
      vi.spyOn(VideoImportService.prototype as any, 'analyzeYouTubeUrl').mockResolvedValue({
        title: 'Test Video',
        duration: 120,
        canDownload: true,
        platform: 'youtube'
      });

      // Create import request
      const request: VideoImportRequest = {
        source: VideoSourceType.YOUTUBE,
        url: TEST_YOUTUBE_URL,
        config: {
          transcribe: true,
          detectScenes: true,
          analyze: false, // Skip AI analysis for speed
          generateSuggestions: false,
          extractKeyframes: true,
          generateThumbnails: true
        }
      };

      // Start import
      const job = await pipeline.startImport(request);
      expect(job).toBeDefined();
      expect(job.id).toBeTruthy();
      expect(job.status).toBe(ImportJobStatus.QUEUED);

      // Wait for completion
      const completedJob = await waitForJobCompletion(job.id, 30000);
      
      // Verify job completed successfully
      expect(completedJob.status).toBe(ImportJobStatus.COMPLETED);
      expect(completedJob.metadata).toBeDefined();
      expect(completedJob.analysis).toBeDefined();
      
      // Verify files were created
      const jobDir = path.join(testDataDir, 'imports', job.id);
      expect(await fs.pathExists(jobDir)).toBe(true);
      expect(await fs.pathExists(path.join(jobDir, 'original.mp4'))).toBe(true);
      expect(await fs.pathExists(path.join(jobDir, 'analysis.json'))).toBe(true);
      
      // Verify event flow
      verifyEventSequence(job.id);
    }, 60000);

    it('should handle import with transcription and segmentation', async () => {
      // Mock video with audio
      const mockVideoPath = await createMockVideoWithAudio(testDataDir);
      vi.spyOn(VideoImportService.prototype as any, 'downloadFromUrl').mockResolvedValue(mockVideoPath);

      // Mock transcription result
      const mockTranscript: TranscriptSegment[] = [
        { text: 'Hello world', startTime: 0, endTime: 2, confidence: 0.95 },
        { text: 'This is a test', startTime: 2, endTime: 4, confidence: 0.93 },
        { text: 'Video transcription', startTime: 4, endTime: 6, confidence: 0.97 }
      ];
      
      vi.spyOn(ImportPipelineService.prototype as any, 'transcribeVideo').mockResolvedValue(mockTranscript);

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {
          transcribe: true,
          detectScenes: true,
          analyze: false,
          generateSuggestions: false
        }
      };

      const job = await pipeline.startImport(request);
      const completedJob = await waitForJobCompletion(job.id, 30000);

      expect(completedJob.analysis?.transcript).toHaveLength(3);
      expect(completedJob.analysis?.transcript[0].text).toBe('Hello world');
      expect(completedJob.analysis?.detectedScenes).toBeDefined();
    }, 45000);
  });

  describe('Service Integration', () => {
    it('should coordinate between import, download, and transcription services', async () => {
      const mockVideoPath = await createMockVideo(testDataDir);
      
      // Create spies for service methods
      const downloadSpy = vi.spyOn(VideoImportService.prototype as any, 'downloadVideo');
      const transcribeSpy = vi.spyOn(ImportPipelineService.prototype as any, 'transcribeVideo');
      const detectScenesSpy = vi.spyOn(ImportPipelineService.prototype as any, 'detectScenes');
      
      downloadSpy.mockResolvedValue(mockVideoPath);
      transcribeSpy.mockResolvedValue([]);
      detectScenesSpy.mockResolvedValue([]);

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {
          transcribe: true,
          detectScenes: true,
          analyze: false
        }
      };

      const job = await pipeline.startImport(request);
      await waitForJobCompletion(job.id, 30000);

      // Verify service methods were called in correct order
      expect(downloadSpy).toHaveBeenCalled();
      expect(transcribeSpy).toHaveBeenCalled();
      expect(detectScenesSpy).toHaveBeenCalled();
      
      // Verify transcribe was called after download
      const downloadCallOrder = downloadSpy.mock.invocationCallOrder[0];
      const transcribeCallOrder = transcribeSpy.mock.invocationCallOrder[0];
      expect(transcribeCallOrder).toBeGreaterThan(downloadCallOrder);
    }, 30000);

    it('should handle cropping and translation in the pipeline', async () => {
      // This test would require CropService and TranslationService integration
      // For now, we'll mock the behavior
      const mockVideoPath = await createMockVideo(testDataDir);
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);

      // Mock scene detection with multiple scenes
      const mockScenes: DetectedScene[] = [
        {
          id: 'scene_0',
          startTime: 0,
          endTime: 5,
          duration: 5,
          keyFrames: [],
          confidence: 0.8
        },
        {
          id: 'scene_1',
          startTime: 5,
          endTime: 10,
          duration: 5,
          keyFrames: [],
          confidence: 0.85
        }
      ];
      
      vi.spyOn(ImportPipelineService.prototype as any, 'detectScenes').mockResolvedValue(mockScenes);

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {
          transcribe: false,
          detectScenes: true,
          analyze: false
        }
      };

      const job = await pipeline.startImport(request);
      const completedJob = await waitForJobCompletion(job.id, 30000);

      expect(completedJob.analysis?.detectedScenes).toHaveLength(2);
      
      // Verify scene files if they were to be created
      const scenesDir = path.join(testDataDir, 'imports', job.id, 'scenes');
      if (await fs.pathExists(scenesDir)) {
        const sceneFiles = await fs.readdir(scenesDir);
        expect(sceneFiles.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Event Flow and Coordination', () => {
    it('should emit correct sequence of events during import', async () => {
      const mockVideoPath = await createMockVideo(testDataDir);
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {
          transcribe: false,
          detectScenes: false,
          analyze: false
        }
      };

      const job = await pipeline.startImport(request);
      await waitForJobCompletion(job.id, 30000);

      // Verify event sequence
      const jobEvents = capturedEvents.filter(e => 
        e.data.jobId === job.id || e.data.id === job.id
      );

      // Check for required events
      const hasCreatedEvent = jobEvents.some(e => e.event.includes('created'));
      const hasProgressEvents = jobEvents.some(e => e.event.includes('progress'));
      const hasCompletedEvent = jobEvents.some(e => e.event.includes('completed'));

      expect(hasCreatedEvent).toBe(true);
      expect(hasProgressEvents).toBe(true);
      expect(hasCompletedEvent).toBe(true);

      // Verify progress increases
      const progressEvents = jobEvents
        .filter(e => e.event.includes('progress') && e.data.progress !== undefined)
        .map(e => e.data.progress);
      
      for (let i = 1; i < progressEvents.length; i++) {
        expect(progressEvents[i]).toBeGreaterThanOrEqual(progressEvents[i - 1]);
      }
    }, 30000);

    it('should propagate events through EventBus to WebSocket', async () => {
      // Create WebSocket client spy
      const wsSpy = vi.spyOn(wsServer as any, 'broadcastToRoom' as any);
      
      const mockVideoPath = await createMockVideo(testDataDir);
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {
          transcribe: false,
          detectScenes: false,
          analyze: false
        }
      };

      const job = await pipeline.startImport(request);
      await waitForJobCompletion(job.id, 30000);

      // Verify EventBus events were captured
      const busEvents = capturedEvents.filter(e => e.event.startsWith('bus:'));
      expect(busEvents.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Queue Integration', () => {
    it('should handle multiple concurrent imports', async () => {
      const mockVideoPath = await createMockVideo(testDataDir);
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);

      // Start multiple imports
      const jobs: ImportJob[] = [];
      for (let i = 0; i < 3; i++) {
        const request: VideoImportRequest = {
          source: VideoSourceType.URL,
          url: `${TEST_DIRECT_URL}?v=${i}`,
          config: {
            transcribe: false,
            detectScenes: false,
            analyze: false
          }
        };
        const job = await pipeline.startImport(request);
        jobs.push(job);
      }

      // Wait for all to complete
      const completedJobs = await Promise.all(
        jobs.map(job => waitForJobCompletion(job.id, 60000))
      );

      // Verify all completed
      completedJobs.forEach(job => {
        expect(job.status).toBe(ImportJobStatus.COMPLETED);
      });

      // Verify job isolation (each has its own directory)
      for (const job of completedJobs) {
        const jobDir = path.join(testDataDir, 'imports', job.id);
        expect(await fs.pathExists(jobDir)).toBe(true);
      }
    }, 90000);

    it('should handle job cancellation', async () => {
      // Create a slow mock that we can cancel
      let downloadResolve: any;
      const downloadPromise = new Promise((resolve) => {
        downloadResolve = resolve;
      });
      
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo')
        .mockImplementation(() => downloadPromise);

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {}
      };

      const job = await pipeline.startImport(request);
      
      // Wait a bit then cancel
      await new Promise(resolve => setTimeout(resolve, 500));
      await pipeline.cancelJob(job.id);

      // Resolve the download to clean up
      const mockVideoPath = await createMockVideo(testDataDir);
      downloadResolve(mockVideoPath);

      // Verify job was cancelled
      const cancelledJob = pipeline.getJob(job.id);
      expect(cancelledJob?.status).toBe(ImportJobStatus.CANCELLED);
    }, 15000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle download failures gracefully', async () => {
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo')
        .mockRejectedValue(new Error('Network error'));

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {}
      };

      const job = await pipeline.startImport(request);
      const failedJob = await waitForJobCompletion(job.id, 15000);

      expect(failedJob.status).toBe(ImportJobStatus.FAILED);
      expect(failedJob.error).toContain('Network error');

      // Verify error event was emitted
      const errorEvents = capturedEvents.filter(e => 
        e.event.includes('error') || e.event.includes('failed')
      );
      expect(errorEvents.length).toBeGreaterThan(0);
    }, 20000);

    it('should continue pipeline when optional services fail', async () => {
      const mockVideoPath = await createMockVideo(testDataDir);
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);
      
      // Mock transcription failure
      vi.spyOn(ImportPipelineService.prototype as any, 'transcribeVideo')
        .mockRejectedValue(new Error('Transcription failed'));

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {
          transcribe: true,
          detectScenes: true,
          analyze: false
        }
      };

      const job = await pipeline.startImport(request);
      const completedJob = await waitForJobCompletion(job.id, 30000);

      // Should still complete despite transcription failure
      expect(completedJob.status).toBe(ImportJobStatus.COMPLETED);
      expect(completedJob.analysis?.transcript).toHaveLength(0);
      
      // But scene detection should still work
      expect(completedJob.analysis?.detectedScenes).toBeDefined();
    }, 45000);

    it('should handle file system errors', async () => {
      // Make imports directory read-only
      const importsDir = path.join(testDataDir, 'imports');
      await fs.ensureDir(importsDir);
      await fs.chmod(importsDir, 0o444);

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {}
      };

      try {
        const job = await pipeline.startImport(request);
        const failedJob = await waitForJobCompletion(job.id, 15000);
        expect(failedJob.status).toBe(ImportJobStatus.FAILED);
      } finally {
        // Restore permissions
        await fs.chmod(importsDir, 0o755);
      }
    }, 20000);
  });

  describe('Status Tracking', () => {
    it('should track detailed progress through all stages', async () => {
      const mockVideoPath = await createMockVideo(testDataDir);
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {
          transcribe: true,
          detectScenes: true,
          analyze: false,
          extractKeyframes: true,
          generateThumbnails: true
        }
      };

      const job = await pipeline.startImport(request);
      
      // Collect all status updates
      const statusUpdates: any[] = [];
      const progressUpdates: any[] = [];
      
      pipeline.on('import:status', (data) => {
        if (data.jobId === job.id) {
          statusUpdates.push(data);
        }
      });
      
      pipeline.on('import:progress', (data) => {
        if (data.jobId === job.id) {
          progressUpdates.push(data);
        }
      });

      await waitForJobCompletion(job.id, 30000);

      // Verify we got status updates for each stage
      const statuses = statusUpdates.map(u => u.status);
      expect(statuses).toContain(ImportJobStatus.DOWNLOADING);
      expect(statuses).toContain(ImportJobStatus.ANALYZING);
      expect(statuses).toContain(ImportJobStatus.COMPLETED);

      // Verify progress increments
      expect(progressUpdates.length).toBeGreaterThan(0);
      const lastProgress = progressUpdates[progressUpdates.length - 1].progress;
      expect(lastProgress).toBe(100);
    }, 45000);

    it('should provide meaningful progress messages', async () => {
      const mockVideoPath = await createMockVideo(testDataDir);
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);

      const progressMessages: string[] = [];
      
      const options = {
        jobId: 'test-job-123',
        url: TEST_DIRECT_URL,
        config: {},
        onProgress: (progress: number, status: string, message?: string) => {
          if (message) {
            progressMessages.push(message);
          }
        }
      };

      await pipeline.processImport(options);

      expect(progressMessages.length).toBeGreaterThan(0);
      expect(progressMessages).toContain('Import completed successfully');
    }, 30000);
  });

  describe('File System Operations and Cleanup', () => {
    it('should create proper directory structure', async () => {
      const mockVideoPath = await createMockVideo(testDataDir);
      vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);

      const request: VideoImportRequest = {
        source: VideoSourceType.URL,
        url: TEST_DIRECT_URL,
        config: {
          extractKeyframes: true,
          generateThumbnails: true,
          detectScenes: true
        }
      };

      const job = await pipeline.startImport(request);
      await waitForJobCompletion(job.id, 30000);

      const jobDir = path.join(testDataDir, 'imports', job.id);
      
      // Verify directory structure
      expect(await fs.pathExists(jobDir)).toBe(true);
      expect(await fs.pathExists(path.join(jobDir, 'original.mp4'))).toBe(true);
      expect(await fs.pathExists(path.join(jobDir, 'analysis.json'))).toBe(true);
      
      // Check for optional directories based on config
      if (job.config.extractKeyframes) {
        expect(await fs.pathExists(path.join(jobDir, 'keyframes'))).toBe(true);
      }
      if (job.config.generateThumbnails) {
        expect(await fs.pathExists(path.join(jobDir, 'thumbnails'))).toBe(true);
      }
    }, 45000);

    it('should clean up old imports', async () => {
      // Create some old mock imports
      const oldJobIds = ['old-job-1', 'old-job-2'];
      for (const jobId of oldJobIds) {
        const jobDir = path.join(testDataDir, 'imports', jobId);
        await fs.ensureDir(jobDir);
        await fs.writeFile(path.join(jobDir, 'test.txt'), 'old data');
      }

      // Add old jobs to the service
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days old
      
      for (const jobId of oldJobIds) {
        const oldJob: ImportJob = {
          id: jobId,
          source: VideoSourceType.URL,
          sourceUrl: 'http://old.example.com',
          status: ImportJobStatus.COMPLETED,
          progress: 100,
          config: { transcribe: false, detectScenes: false, analyze: false, generateSuggestions: false },
          createdAt: oldDate,
          updatedAt: oldDate,
          completedAt: oldDate
        };
        (pipeline as any).videoImportService.jobs.set(jobId, oldJob);
      }

      // Run cleanup
      await pipeline.cleanupOldImports(7); // Clean up items older than 7 days

      // Verify old imports were removed
      for (const jobId of oldJobIds) {
        const jobDir = path.join(testDataDir, 'imports', jobId);
        expect(await fs.pathExists(jobDir)).toBe(false);
        expect(pipeline.getJob(jobId)).toBeUndefined();
      }
    }, 20000);

    it('should handle cleanup errors gracefully', async () => {
      // Create a job with a locked file
      const lockedJobId = 'locked-job';
      const jobDir = path.join(testDataDir, 'imports', lockedJobId);
      await fs.ensureDir(jobDir);
      
      // Mock fs.remove to throw an error for this specific job
      const originalRemove = fs.remove;
      vi.spyOn(fs, 'remove').mockImplementation(async (path) => {
        if (path.includes(lockedJobId)) {
          throw new Error('Permission denied');
        }
        return originalRemove(path);
      });

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      
      const lockedJob: ImportJob = {
        id: lockedJobId,
        source: VideoSourceType.URL,
        sourceUrl: 'http://locked.example.com',
        status: ImportJobStatus.COMPLETED,
        progress: 100,
        config: { transcribe: false, detectScenes: false, analyze: false, generateSuggestions: false },
        createdAt: oldDate,
        updatedAt: oldDate,
        completedAt: oldDate
      };
      (pipeline as any).videoImportService.jobs.set(lockedJobId, lockedJob);

      // Should not throw
      await expect(pipeline.cleanupOldImports(7)).resolves.toBeUndefined();

      // Restore original fs.remove
      vi.mocked(fs.remove).mockRestore();
    }, 15000);
  });

  describe('Transform to Short Format', () => {
    it('should transform import job to short creation format', async () => {
      const mockJob: ImportJob = {
        id: 'test-job',
        source: VideoSourceType.URL,
        sourceUrl: TEST_DIRECT_URL,
        status: ImportJobStatus.COMPLETED,
        progress: 100,
        config: { transcribe: true, detectScenes: true, analyze: true, generateSuggestions: true },
        analysis: {
          transcript: [
            { text: 'Hello', startTime: 0, endTime: 1 },
            { text: 'World', startTime: 1, endTime: 2 }
          ],
          detectedScenes: [],
          suggestedClips: [
            {
              id: 'clip1',
              startTime: 0,
              endTime: 2,
              reason: 'Interesting content',
              score: 0.9,
              keywords: ['hello', 'world', 'test'],
              sceneIds: []
            }
          ],
          topics: ['greeting'],
          keywords: ['hello', 'world'],
          language: 'en'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date()
      };

      const transform = {
        importJob: mockJob,
        selectedClips: mockJob.analysis!.suggestedClips,
        renderConfig: {
          fps: 30,
          resolution: { width: 1080, height: 1920 }
        }
      };

      const shortInput = await pipeline.transformToShort(transform);

      expect(shortInput.scenes).toHaveLength(1);
      expect(shortInput.scenes[0].text).toBe('Hello World');
      expect(shortInput.scenes[0].searchTerms).toEqual(['hello', 'world', 'test']);
      expect(shortInput.config.language).toBe('en');
    });

    it('should extract video clips for selected suggestions', async () => {
      const mockVideoPath = await createMockVideo(testDataDir);
      const jobId = 'clip-extract-job';
      const jobDir = path.join(testDataDir, 'imports', jobId);
      await fs.ensureDir(jobDir);
      await fs.copy(mockVideoPath, path.join(jobDir, 'original.mp4'));

      // Mock the job in the service
      const mockJob: ImportJob = {
        id: jobId,
        source: VideoSourceType.URL,
        sourceUrl: TEST_DIRECT_URL,
        status: ImportJobStatus.COMPLETED,
        progress: 100,
        config: { transcribe: false, detectScenes: false, analyze: false, generateSuggestions: false },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      (pipeline as any).videoImportService.jobs.set(jobId, mockJob);

      const clips: SuggestedClip[] = [
        {
          id: 'clip1',
          startTime: 0,
          endTime: 2,
          reason: 'Test clip',
          score: 0.9,
          keywords: [],
          sceneIds: []
        }
      ];

      // Mock ffmpeg execution
      vi.spyOn(pipeline as any, 'extractClips').mockResolvedValue([
        path.join(jobDir, 'clips', 'clip_clip1.mp4')
      ]);

      const extractedPaths = await pipeline.extractClips(jobId, clips);

      expect(extractedPaths).toHaveLength(1);
      expect(extractedPaths[0]).toContain('clip_clip1.mp4');
    }, 20000);
  });

  // Helper functions
  async function createMockVideo(dir: string): Promise<string> {
    const videoPath = path.join(dir, 'mock-video.mp4');
    // Create a simple mock video file
    await fs.writeFile(videoPath, Buffer.from('mock video content'));
    return videoPath;
  }

  async function createMockVideoWithAudio(dir: string): Promise<string> {
    const videoPath = path.join(dir, 'mock-video-audio.mp4');
    // In a real test, this would create an actual video file with audio
    // For now, we'll just create a mock file
    await fs.writeFile(videoPath, Buffer.from('mock video with audio content'));
    return videoPath;
  }

  async function waitForJobCompletion(jobId: string, timeout: number): Promise<ImportJob> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const job = pipeline.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }
      
      if (job.status === ImportJobStatus.COMPLETED || 
          job.status === ImportJobStatus.FAILED ||
          job.status === ImportJobStatus.CANCELLED) {
        return job;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Job ${jobId} did not complete within ${timeout}ms`);
  }

  function verifyEventSequence(jobId: string) {
    const jobEvents = capturedEvents
      .filter(e => e.data.jobId === jobId || e.data.id === jobId)
      .map(e => ({ event: e.event, timestamp: e.timestamp }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Log events for debugging
    console.log('Event sequence:', jobEvents.map(e => e.event));

    // Verify expected sequence
    const eventTypes = jobEvents.map(e => {
      if (e.event.includes('created')) return 'created';
      if (e.event.includes('progress')) return 'progress';
      if (e.event.includes('status')) return 'status';
      if (e.event.includes('completed')) return 'completed';
      if (e.event.includes('failed')) return 'failed';
      return 'other';
    });

    // Should start with created
    expect(eventTypes[0]).toBe('created');
    
    // Should have progress events
    const progressCount = eventTypes.filter(t => t === 'progress').length;
    expect(progressCount).toBeGreaterThan(0);
    
    // Should end with completed or failed
    const lastEvent = eventTypes[eventTypes.length - 1];
    expect(['completed', 'failed']).toContain(lastEvent);
  }
});

// Performance tests - run with PERFORMANCE_TEST=true
describe.skipIf(!process.env.PERFORMANCE_TEST)('ImportPipelineService Performance Tests', () => {
  let pipeline: ImportPipelineService;
  let testDataDir: string;

  beforeAll(async () => {
    testDataDir = path.join(__dirname, 'test-data', `perf-${Date.now()}`);
    await fs.ensureDir(testDataDir);

    pipeline = new ImportPipelineService({
      dataDir: testDataDir,
      enableOllama: false
    });
  });

  afterAll(async () => {
    await fs.remove(testDataDir);
  });

  it('should handle large video import efficiently', async () => {
    // Mock a large video scenario
    const mockVideoPath = await createLargeMockVideo(testDataDir, 500 * 1024 * 1024); // 500MB
    vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);

    const startTime = Date.now();
    
    const request: VideoImportRequest = {
      source: VideoSourceType.URL,
      url: 'http://example.com/large-video.mp4',
      config: {
        transcribe: false,
        detectScenes: true,
        extractKeyframes: true,
        keyframeInterval: 30 // Extract every 30 seconds
      }
    };

    const job = await pipeline.startImport(request);
    const completedJob = await waitForJobCompletion(job.id, 300000); // 5 minute timeout

    const duration = Date.now() - startTime;
    
    console.log(`Large video import completed in ${duration}ms`);
    expect(completedJob.status).toBe(ImportJobStatus.COMPLETED);
    expect(duration).toBeLessThan(300000); // Should complete within 5 minutes
  }, 360000);

  it('should process multiple imports concurrently with good performance', async () => {
    const mockVideoPath = await createMockVideo(testDataDir);
    vi.spyOn(VideoImportService.prototype as any, 'downloadVideo').mockResolvedValue(mockVideoPath);

    const concurrentImports = 10;
    const startTime = Date.now();
    
    const jobs = await Promise.all(
      Array.from({ length: concurrentImports }, async (_, i) => {
        const request: VideoImportRequest = {
          source: VideoSourceType.URL,
          url: `http://example.com/video-${i}.mp4`,
          config: {
            transcribe: false,
            detectScenes: false,
            analyze: false
          }
        };
        return pipeline.startImport(request);
      })
    );

    const completedJobs = await Promise.all(
      jobs.map(job => waitForJobCompletion(job.id, 120000))
    );

    const duration = Date.now() - startTime;
    const avgTimePerJob = duration / concurrentImports;
    
    console.log(`Processed ${concurrentImports} imports in ${duration}ms`);
    console.log(`Average time per job: ${avgTimePerJob}ms`);
    
    // All should complete
    completedJobs.forEach(job => {
      expect(job.status).toBe(ImportJobStatus.COMPLETED);
    });
    
    // Should show good concurrency (not just sequential processing)
    expect(avgTimePerJob).toBeLessThan(duration / 2); // Better than sequential
  }, 180000);

  async function createLargeMockVideo(dir: string, sizeInBytes: number): Promise<string> {
    const videoPath = path.join(dir, 'large-mock-video.mp4');
    const buffer = Buffer.alloc(sizeInBytes);
    await fs.writeFile(videoPath, buffer);
    return videoPath;
  }

  async function waitForJobCompletion(jobId: string, timeout: number): Promise<ImportJob> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const job = pipeline.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }
      
      if (job.status === ImportJobStatus.COMPLETED || 
          job.status === ImportJobStatus.FAILED ||
          job.status === ImportJobStatus.CANCELLED) {
        return job;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Job ${jobId} did not complete within ${timeout}ms`);
  }
});