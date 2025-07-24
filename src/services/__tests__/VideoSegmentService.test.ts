import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { VideoSegmentService } from '../VideoSegmentService';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { EventEmitter } from 'events';
import { exec } from 'child_process';

// Mock modules
vi.mock('fs-extra');
vi.mock('fluent-ffmpeg');
vi.mock('child_process');
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('VideoSegmentService', () => {
  let service: VideoSegmentService;
  let tempDir: string;
  let mockFFmpeg: any;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), 'segment-test-' + Date.now());
    
    // Mock fs operations
    (fs.ensureDir as MockedFunction<typeof fs.ensureDir>).mockResolvedValue(undefined);
    (fs.remove as MockedFunction<typeof fs.remove>).mockResolvedValue(undefined);
    (fs.pathExists as MockedFunction<typeof fs.pathExists>).mockResolvedValue(true);
    (fs.readJson as MockedFunction<typeof fs.readJson>).mockResolvedValue({});
    (fs.writeJson as MockedFunction<typeof fs.writeJson>).mockResolvedValue(undefined);
    
    // Mock ffmpeg
    mockFFmpeg = {
      input: vi.fn().mockReturnThis(),
      output: vi.fn().mockReturnThis(),
      seek: vi.fn().mockReturnThis(),
      duration: vi.fn().mockReturnThis(),
      videoCodec: vi.fn().mockReturnThis(),
      audioCodec: vi.fn().mockReturnThis(),
      outputOptions: vi.fn().mockReturnThis(),
      videoFilter: vi.fn().mockReturnThis(),
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 10);
        }
        return mockFFmpeg;
      }),
      run: vi.fn().mockReturnThis(),
      ffprobe: vi.fn((file, callback) => {
        callback(null, {
          streams: [{
            codec_type: 'video',
            width: 1920,
            height: 1080,
            r_frame_rate: '30/1',
            codec_name: 'h264',
            bit_rate: 5000000,
            duration: 120
          }],
          format: {
            duration: 120
          }
        });
      })
    };

    (ffmpeg as any).mockReturnValue(mockFFmpeg);
    ffmpeg.ffprobe = mockFFmpeg.ffprobe;
    ffmpeg.setFfmpegPath = vi.fn();
    ffmpeg.setFfprobePath = vi.fn();

    service = new VideoSegmentService(tempDir);
    await new Promise(resolve => setTimeout(resolve, 10)); // Allow initialization
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize service successfully', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(EventEmitter);
      expect(fs.ensureDir).toHaveBeenCalledWith(expect.stringContaining('segments'));
    });

    it('should set custom ffmpeg paths from environment', () => {
      process.env.FFMPEG_PATH = '/custom/ffmpeg';
      process.env.FFPROBE_PATH = '/custom/ffprobe';
      
      new VideoSegmentService(tempDir);
      
      expect(ffmpeg.setFfmpegPath).toHaveBeenCalledWith('/custom/ffmpeg');
      expect(ffmpeg.setFfprobePath).toHaveBeenCalledWith('/custom/ffprobe');
      
      delete process.env.FFMPEG_PATH;
      delete process.env.FFPROBE_PATH;
    });
  });

  describe('getVideoMetadata', () => {
    it('should get video metadata successfully', async () => {
      const videoPath = '/tmp/video.mp4';
      
      const metadata = await service.getVideoMetadata(videoPath);
      
      expect(metadata).toMatchObject({
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'h264',
        bitrate: 5000000,
        duration: 120
      });
    });

    it('should handle missing video stream', async () => {
      mockFFmpeg.ffprobe.mockImplementation((file, callback) => {
        callback(null, { streams: [] });
      });

      await expect(service.getVideoMetadata('/tmp/video.mp4'))
        .rejects.toThrow('No video stream found');
    });

    it('should handle ffprobe errors', async () => {
      mockFFmpeg.ffprobe.mockImplementation((file, callback) => {
        callback(new Error('FFprobe failed'), null);
      });

      await expect(service.getVideoMetadata('/tmp/video.mp4'))
        .rejects.toThrow('FFprobe failed');
    });
  });

  describe('createSegment', () => {
    it('should create video segment successfully', async () => {
      const videoPath = '/tmp/video.mp4';
      const segment = {
        id: 'seg-123',
        startTime: 10,
        endTime: 20,
        duration: 10
      };
      const outputPath = '/tmp/segment.mp4';

      const result = await service.createSegment(videoPath, segment, outputPath);

      expect(mockFFmpeg.input).toHaveBeenCalledWith(videoPath);
      expect(mockFFmpeg.seek).toHaveBeenCalledWith(10);
      expect(mockFFmpeg.duration).toHaveBeenCalledWith(10);
      expect(mockFFmpeg.output).toHaveBeenCalledWith(outputPath);
      expect(result).toBe(outputPath);
    });

    it('should apply quality settings', async () => {
      const videoPath = '/tmp/video.mp4';
      const segment = {
        id: 'seg-123',
        startTime: 0,
        endTime: 5,
        duration: 5
      };
      const outputPath = '/tmp/segment.mp4';
      const options = { quality: 'high' as const };

      await service.createSegment(videoPath, segment, outputPath, options);

      expect(mockFFmpeg.videoCodec).toHaveBeenCalledWith('libx264');
      expect(mockFFmpeg.outputOptions).toHaveBeenCalledWith(expect.arrayContaining([
        '-crf 18',
        '-preset slow'
      ]));
    });

    it('should handle audio preservation', async () => {
      const videoPath = '/tmp/video.mp4';
      const segment = {
        id: 'seg-123',
        startTime: 0,
        endTime: 10,
        duration: 10
      };
      const outputPath = '/tmp/segment.mp4';
      const options = { preserveAudio: true };

      await service.createSegment(videoPath, segment, outputPath, options);

      expect(mockFFmpeg.audioCodec).toHaveBeenCalledWith('copy');
    });

    it('should apply fade effects', async () => {
      const videoPath = '/tmp/video.mp4';
      const segment = {
        id: 'seg-123',
        startTime: 0,
        endTime: 10,
        duration: 10
      };
      const outputPath = '/tmp/segment.mp4';
      const options = { fadeIn: 0.5, fadeOut: 0.5 };

      await service.createSegment(videoPath, segment, outputPath, options);

      expect(mockFFmpeg.videoFilter).toHaveBeenCalledWith(
        expect.stringContaining('fade=')
      );
    });

    it('should handle speed adjustments', async () => {
      const videoPath = '/tmp/video.mp4';
      const segment = {
        id: 'seg-123',
        startTime: 0,
        endTime: 10,
        duration: 10
      };
      const outputPath = '/tmp/segment.mp4';
      const options = { speed: 2 };

      await service.createSegment(videoPath, segment, outputPath, options);

      expect(mockFFmpeg.videoFilter).toHaveBeenCalledWith(
        expect.stringContaining('setpts=0.5*PTS')
      );
    });

    it('should handle segment creation errors', async () => {
      mockFFmpeg.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(new Error('Segmentation failed'));
        }
        return mockFFmpeg;
      });

      const videoPath = '/tmp/video.mp4';
      const segment = {
        id: 'seg-123',
        startTime: 0,
        endTime: 10,
        duration: 10
      };
      const outputPath = '/tmp/segment.mp4';

      await expect(service.createSegment(videoPath, segment, outputPath))
        .rejects.toThrow('Segmentation failed');
    });
  });

  describe('createSegments', () => {
    it('should create multiple segments', async () => {
      const videoPath = '/tmp/video.mp4';
      const segments = [
        { id: 'seg-1', startTime: 0, endTime: 10, duration: 10 },
        { id: 'seg-2', startTime: 10, endTime: 20, duration: 10 },
        { id: 'seg-3', startTime: 20, endTime: 30, duration: 10 }
      ];

      const results = await service.createSegments(videoPath, segments);

      expect(results).toHaveLength(3);
      expect(mockFFmpeg.input).toHaveBeenCalledTimes(3);
      results.forEach((result, index) => {
        expect(result.id).toBe(segments[index].id);
        expect(result.outputPath).toContain(segments[index].id);
      });
    });

    it('should handle errors in batch processing', async () => {
      let callCount = 0;
      mockFFmpeg.on.mockImplementation((event, callback) => {
        callCount++;
        if (event === 'error' && callCount === 2) {
          callback(new Error('Segment 2 failed'));
        } else if (event === 'end') {
          setTimeout(() => callback(), 10);
        }
        return mockFFmpeg;
      });

      const videoPath = '/tmp/video.mp4';
      const segments = [
        { id: 'seg-1', startTime: 0, endTime: 10, duration: 10 },
        { id: 'seg-2', startTime: 10, endTime: 20, duration: 10 }
      ];

      const results = await service.createSegments(videoPath, segments);

      expect(results[0].outputPath).toBeDefined();
      expect(results[1].outputPath).toBeUndefined();
    });

    it('should apply options to all segments', async () => {
      const videoPath = '/tmp/video.mp4';
      const segments = [
        { id: 'seg-1', startTime: 0, endTime: 10, duration: 10 },
        { id: 'seg-2', startTime: 10, endTime: 20, duration: 10 }
      ];
      const options = { quality: 'medium' as const, preserveAudio: false };

      await service.createSegments(videoPath, segments, options);

      expect(mockFFmpeg.videoCodec).toHaveBeenCalledTimes(2);
      expect(mockFFmpeg.outputOptions).toHaveBeenCalledWith(
        expect.arrayContaining(['-crf 23'])
      );
    });
  });

  describe('splitByDuration', () => {
    it('should split video into equal duration segments', async () => {
      const videoPath = '/tmp/video.mp4';
      const segmentDuration = 30;

      const segments = await service.splitByDuration(videoPath, segmentDuration);

      expect(segments).toHaveLength(4); // 120s video / 30s segments
      expect(segments[0]).toMatchObject({
        startTime: 0,
        endTime: 30,
        duration: 30
      });
      expect(segments[3]).toMatchObject({
        startTime: 90,
        endTime: 120,
        duration: 30
      });
    });

    it('should handle video shorter than segment duration', async () => {
      mockFFmpeg.ffprobe.mockImplementation((file, callback) => {
        callback(null, {
          streams: [{ codec_type: 'video' }],
          format: { duration: 10 }
        });
      });

      const videoPath = '/tmp/video.mp4';
      const segmentDuration = 30;

      const segments = await service.splitByDuration(videoPath, segmentDuration);

      expect(segments).toHaveLength(1);
      expect(segments[0]).toMatchObject({
        startTime: 0,
        endTime: 10,
        duration: 10
      });
    });

    it('should apply min/max duration constraints', async () => {
      const videoPath = '/tmp/video.mp4';
      const segmentDuration = 30;
      const options = { minDuration: 20, maxDuration: 40 };

      const segments = await service.splitByDuration(videoPath, segmentDuration, options);

      segments.forEach(segment => {
        expect(segment.duration).toBeGreaterThanOrEqual(20);
        expect(segment.duration).toBeLessThanOrEqual(40);
      });
    });
  });

  describe('splitByScenes', () => {
    it('should detect scene changes', async () => {
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('ffmpeg') && command.includes('scene')) {
          // Simulate scene detection output
          const sceneData = '10.5\n25.3\n45.7\n78.2\n';
          callback(null, sceneData, '');
        } else {
          callback(null, '', '');
        }
      });

      const videoPath = '/tmp/video.mp4';
      
      const segments = await service.splitByScenes(videoPath);

      expect(segments).toHaveLength(5); // 4 scene changes = 5 segments
      expect(segments[0]).toMatchObject({
        startTime: 0,
        endTime: 10.5
      });
      expect(segments[1]).toMatchObject({
        startTime: 10.5,
        endTime: 25.3
      });
    });

    it('should apply scene detection options', async () => {
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      const execCommands: string[] = [];
      
      mockExec.mockImplementation((command: string, callback: any) => {
        execCommands.push(command);
        callback(null, '10\n30\n', '');
      });

      const videoPath = '/tmp/video.mp4';
      const options = {
        threshold: 0.3,
        minSceneDuration: 5
      };

      await service.splitByScenes(videoPath, options);

      const sceneCommand = execCommands.find(cmd => cmd.includes('scene'));
      expect(sceneCommand).toContain('0.3');
    });

    it('should handle no scene changes detected', async () => {
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(null, '', ''); // No scene changes
      });

      const videoPath = '/tmp/video.mp4';
      
      const segments = await service.splitByScenes(videoPath);

      expect(segments).toHaveLength(1);
      expect(segments[0]).toMatchObject({
        startTime: 0,
        endTime: 120,
        duration: 120
      });
    });
  });

  describe('splitByTranscript', () => {
    it('should split by transcript segments', async () => {
      const videoPath = '/tmp/video.mp4';
      const transcript = [
        { startTime: 0, endTime: 15, text: 'First sentence.' },
        { startTime: 15, endTime: 30, text: 'Second sentence.' },
        { startTime: 30, endTime: 45, text: 'Third sentence.' },
        { startTime: 45, endTime: 60, text: 'Fourth sentence.' }
      ];

      const segments = await service.splitByTranscript(videoPath, transcript);

      expect(segments).toHaveLength(4);
      segments.forEach((segment, index) => {
        expect(segment.transcriptSegments).toContainEqual(transcript[index]);
      });
    });

    it('should merge short segments', async () => {
      const videoPath = '/tmp/video.mp4';
      const transcript = [
        { startTime: 0, endTime: 2, text: 'Hi.' },
        { startTime: 2, endTime: 4, text: 'Hello.' },
        { startTime: 4, endTime: 20, text: 'This is a longer sentence.' },
        { startTime: 20, endTime: 22, text: 'Bye.' }
      ];
      const options = { minDuration: 5 };

      const segments = await service.splitByTranscript(videoPath, transcript, options);

      expect(segments.length).toBeLessThan(transcript.length);
      expect(segments[0].duration).toBeGreaterThanOrEqual(5);
    });

    it('should align to speech boundaries', async () => {
      const videoPath = '/tmp/video.mp4';
      const transcript = [
        { startTime: 0, endTime: 10, text: 'First part of speech.' },
        { startTime: 10.5, endTime: 20, text: 'Second part after pause.' }
      ];
      const options = { alignToSpeech: true };

      const segments = await service.splitByTranscript(videoPath, transcript, options);

      // Should detect pause and create separate segments
      expect(segments).toHaveLength(2);
      expect(segments[0].endTime).toBe(10);
      expect(segments[1].startTime).toBe(10.5);
    });

    it('should add context padding', async () => {
      const videoPath = '/tmp/video.mp4';
      const transcript = [
        { startTime: 10, endTime: 20, text: 'Main content.' }
      ];
      const options = { contextPadding: 2 };

      const segments = await service.splitByTranscript(videoPath, transcript, options);

      expect(segments[0].startTime).toBe(8); // 10 - 2
      expect(segments[0].endTime).toBe(22); // 20 + 2
    });
  });

  describe('mergeSegments', () => {
    it('should merge consecutive segments', async () => {
      const videoPath = '/tmp/video.mp4';
      const segments = [
        { id: 'seg-1', startTime: 0, endTime: 10, duration: 10, outputPath: '/tmp/seg1.mp4' },
        { id: 'seg-2', startTime: 10, endTime: 20, duration: 10, outputPath: '/tmp/seg2.mp4' },
        { id: 'seg-3', startTime: 20, endTime: 30, duration: 10, outputPath: '/tmp/seg3.mp4' }
      ];
      const outputPath = '/tmp/merged.mp4';

      const result = await service.mergeSegments(segments, outputPath);

      expect(mockFFmpeg.input).toHaveBeenCalledTimes(4); // 3 segments + 1 merge
      expect(result).toBe(outputPath);
    });

    it('should handle merge with transitions', async () => {
      const segments = [
        { id: 'seg-1', startTime: 0, endTime: 10, duration: 10, outputPath: '/tmp/seg1.mp4' },
        { id: 'seg-2', startTime: 10, endTime: 20, duration: 10, outputPath: '/tmp/seg2.mp4' }
      ];
      const outputPath = '/tmp/merged.mp4';
      const options = { transition: 'fade' as const, transitionDuration: 0.5 };

      await service.mergeSegments(segments, outputPath, options);

      expect(mockFFmpeg.videoFilter).toHaveBeenCalledWith(
        expect.stringContaining('fade')
      );
    });

    it('should handle merge errors', async () => {
      mockFFmpeg.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(new Error('Merge failed'));
        }
        return mockFFmpeg;
      });

      const segments = [
        { id: 'seg-1', startTime: 0, endTime: 10, duration: 10, outputPath: '/tmp/seg1.mp4' }
      ];
      const outputPath = '/tmp/merged.mp4';

      await expect(service.mergeSegments(segments, outputPath))
        .rejects.toThrow('Merge failed');
    });
  });

  describe('extractKeyframes', () => {
    it('should extract keyframes from video', async () => {
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('showinfo')) {
          // Simulate keyframe detection output
          const keyframeData = 'n:0 pts:0 pts_time:0\nn:30 pts:30 pts_time:1\nn:60 pts:60 pts_time:2\n';
          callback(null, '', keyframeData);
        } else {
          callback(null, '', '');
        }
      });

      const videoPath = '/tmp/video.mp4';
      
      const keyframes = await service.extractKeyframes(videoPath);

      expect(keyframes).toEqual([0, 1, 2]);
    });

    it('should handle no keyframes found', async () => {
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(null, '', '');
      });

      const videoPath = '/tmp/video.mp4';
      
      const keyframes = await service.extractKeyframes(videoPath);

      expect(keyframes).toEqual([]);
    });
  });

  describe('alignToKeyframes', () => {
    it('should align segment to nearest keyframes', async () => {
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('showinfo')) {
          const keyframeData = 'n:0 pts:0 pts_time:0\nn:150 pts:150 pts_time:5\nn:300 pts:300 pts_time:10\nn:450 pts:450 pts_time:15\n';
          callback(null, '', keyframeData);
        } else {
          callback(null, '', '');
        }
      });

      const videoPath = '/tmp/video.mp4';
      const segment = { id: 'seg-1', startTime: 7, endTime: 12, duration: 5 };

      const aligned = await service.alignToKeyframes(videoPath, segment);

      expect(aligned.startTime).toBe(5); // Nearest keyframe before 7
      expect(aligned.endTime).toBe(15); // Nearest keyframe after 12
      expect(aligned.keyframeAligned).toBe(true);
    });

    it('should handle segments already aligned', async () => {
      const mockExec = exec as unknown as MockedFunction<typeof exec>;
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.includes('showinfo')) {
          const keyframeData = 'n:0 pts:0 pts_time:0\nn:300 pts:300 pts_time:10\n';
          callback(null, '', keyframeData);
        } else {
          callback(null, '', '');
        }
      });

      const videoPath = '/tmp/video.mp4';
      const segment = { id: 'seg-1', startTime: 0, endTime: 10, duration: 10 };

      const aligned = await service.alignToKeyframes(videoPath, segment);

      expect(aligned.startTime).toBe(0);
      expect(aligned.endTime).toBe(10);
      expect(aligned.keyframeAligned).toBe(true);
    });
  });

  describe('event emissions', () => {
    it('should emit progress events', async () => {
      const progressHandler = vi.fn();
      service.on('segment:progress', progressHandler);

      mockFFmpeg.on.mockImplementation((event, callback) => {
        if (event === 'progress') {
          callback({ percent: 50 });
        } else if (event === 'end') {
          setTimeout(() => callback(), 10);
        }
        return mockFFmpeg;
      });

      const videoPath = '/tmp/video.mp4';
      const segment = { id: 'seg-1', startTime: 0, endTime: 10, duration: 10 };
      const outputPath = '/tmp/segment.mp4';

      await service.createSegment(videoPath, segment, outputPath);

      expect(progressHandler).toHaveBeenCalledWith({
        segmentId: 'seg-1',
        progress: 50
      });
    });

    it('should emit complete events', async () => {
      const completeHandler = vi.fn();
      service.on('segment:complete', completeHandler);

      const videoPath = '/tmp/video.mp4';
      const segment = { id: 'seg-1', startTime: 0, endTime: 10, duration: 10 };
      const outputPath = '/tmp/segment.mp4';

      await service.createSegment(videoPath, segment, outputPath);

      expect(completeHandler).toHaveBeenCalledWith({
        segmentId: 'seg-1',
        outputPath
      });
    });

    it('should emit error events', async () => {
      const errorHandler = vi.fn();
      service.on('segment:error', errorHandler);

      mockFFmpeg.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(new Error('Segment failed'));
        }
        return mockFFmpeg;
      });

      const videoPath = '/tmp/video.mp4';
      const segment = { id: 'seg-1', startTime: 0, endTime: 10, duration: 10 };
      const outputPath = '/tmp/segment.mp4';

      await expect(service.createSegment(videoPath, segment, outputPath))
        .rejects.toThrow();

      expect(errorHandler).toHaveBeenCalledWith({
        segmentId: 'seg-1',
        error: expect.any(Error)
      });
    });
  });

  describe('cleanup', () => {
    it('should clean up temporary files', async () => {
      await service.cleanup();

      expect(fs.remove).toHaveBeenCalledWith(
        expect.stringContaining('segments')
      );
    });
  });
});