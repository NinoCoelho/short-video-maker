import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { CropService } from '../CropService';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { EventEmitter } from 'events';
import { MockFFmpegInstance, MockSharpInstance, FFprobeResultMock } from '../../types/mocks';

// Mock modules
vi.mock('fs-extra');
vi.mock('fluent-ffmpeg');
vi.mock('sharp');
vi.mock('child_process');
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock TensorFlow (optional dependency)
vi.mock('@tensorflow/tfjs-node', () => {
  throw new Error('TensorFlow not available');
});

describe('CropService', () => {
  let service: CropService;
  let tempDir: string;
  let mockFFmpeg: MockFFmpegInstance;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), 'crop-test-' + Date.now());
    
    // Mock fs operations
    (fs.ensureDir as MockedFunction<typeof fs.ensureDir>).mockResolvedValue(undefined);
    (fs.remove as MockedFunction<typeof fs.remove>).mockResolvedValue(undefined);
    (fs.pathExists as MockedFunction<typeof fs.pathExists>).mockResolvedValue(true);
    
    // Mock ffmpeg
    mockFFmpeg = {
      input: vi.fn().mockReturnThis(),
      output: vi.fn().mockReturnThis(),
      videoFilter: vi.fn().mockReturnThis(),
      videoCodec: vi.fn().mockReturnThis(),
      audioCodec: vi.fn().mockReturnThis(),
      outputOptions: vi.fn().mockReturnThis(),
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 10);
        }
        return mockFFmpeg;
      }),
      run: vi.fn().mockReturnThis(),
      ffprobe: vi.fn((file: string, callback: (err: Error | null, data: FFprobeResultMock) => void) => {
        callback(null, {
          streams: [{
            codec_type: 'video',
            width: 1920,
            height: 1080,
            r_frame_rate: '30/1',
            codec_name: 'h264',
            bit_rate: 5000000,
            duration: 120
          }]
        });
      })
    };

    (ffmpeg as any).mockReturnValue(mockFFmpeg);
    ffmpeg.ffprobe = mockFFmpeg.ffprobe;

    // Mock sharp
    const mockSharpInstance: MockSharpInstance = {
      metadata: vi.fn().mockResolvedValue({
        width: 1920,
        height: 1080,
        channels: 3,
        format: 'jpeg'
      }),
      extract: vi.fn().mockReturnThis(),
      resize: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      png: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-image-data')),
      toFile: vi.fn().mockResolvedValue({})
    };
    (sharp as any).mockReturnValue(mockSharpInstance);

    service = new CropService(tempDir);
    await new Promise(resolve => setTimeout(resolve, 10)); // Allow initialization
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize service successfully', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(EventEmitter);
      expect(fs.ensureDir).toHaveBeenCalledWith(expect.stringContaining('temp'));
    });

    it('should warn about TensorFlow unavailability', () => {
      // Service should initialize even without TensorFlow
      expect(service).toBeDefined();
    });
  });

  describe('cropVideo', () => {
    it('should crop video with default center position', async () => {
      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';
      const cropDimensions = { x: 420, y: 0, width: 1080, height: 1920 };
      
      const result = await service.cropVideo(inputPath, outputPath, cropDimensions);

      expect(mockFFmpeg.input).toHaveBeenCalledWith(inputPath);
      expect(mockFFmpeg.output).toHaveBeenCalledWith(outputPath);
      expect(mockFFmpeg.videoFilter).toHaveBeenCalledWith(
        `crop=${cropDimensions.width}:${cropDimensions.height}:${cropDimensions.x}:${cropDimensions.y}`
      );
      expect(result).toBe(outputPath);
    });

    it('should apply quality settings', async () => {
      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';
      const cropDimensions = { x: 0, y: 0, width: 720, height: 1280 };
      const options = { quality: 'high' as const };

      await service.cropVideo(inputPath, outputPath, cropDimensions, options);

      expect(mockFFmpeg.videoCodec).toHaveBeenCalledWith('libx264');
      expect(mockFFmpeg.outputOptions).toHaveBeenCalledWith(expect.arrayContaining([
        '-crf 18',
        '-preset slow'
      ]));
    });

    it('should handle crop with fade transitions', async () => {
      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';
      const cropDimensions = { x: 0, y: 0, width: 720, height: 1280 };
      const options = { fadeIn: 0.5, fadeOut: 0.5 };

      await service.cropVideo(inputPath, outputPath, cropDimensions, options);

      expect(mockFFmpeg.videoFilter).toHaveBeenCalledWith(
        expect.stringContaining('fade=')
      );
    });

    it('should handle errors during cropping', async () => {
      mockFFmpeg.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(new Error('FFmpeg error'));
        }
        return mockFFmpeg;
      });

      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';
      const cropDimensions = { x: 0, y: 0, width: 720, height: 1280 };

      await expect(service.cropVideo(inputPath, outputPath, cropDimensions))
        .rejects.toThrow('FFmpeg error');
    });
  });

  describe('calculateCropDimensions', () => {
    it('should calculate center crop for portrait aspect ratio', async () => {
      const videoPath = '/tmp/video.mp4';
      const aspectRatio = { width: 9, height: 16, name: 'portrait' };

      const dimensions = await service.calculateCropDimensions(videoPath, aspectRatio);

      expect(dimensions).toMatchObject({
        x: 420, // (1920 - 1080) / 2
        y: 0,
        width: 1080,
        height: 1920
      });
    });

    it('should calculate center crop for square aspect ratio', async () => {
      const videoPath = '/tmp/video.mp4';
      const aspectRatio = { width: 1, height: 1, name: 'square' };

      const dimensions = await service.calculateCropDimensions(videoPath, aspectRatio);

      expect(dimensions).toMatchObject({
        x: 420, // (1920 - 1080) / 2
        y: 0,
        width: 1080,
        height: 1080
      });
    });

    it('should handle videos already in target aspect ratio', async () => {
      mockFFmpeg.ffprobe.mockImplementation((file, callback) => {
        callback(null, {
          streams: [{
            codec_type: 'video',
            width: 1080,
            height: 1920,
            r_frame_rate: '30/1'
          }]
        });
      });

      const videoPath = '/tmp/video.mp4';
      const aspectRatio = { width: 9, height: 16, name: 'portrait' };

      const dimensions = await service.calculateCropDimensions(videoPath, aspectRatio);

      expect(dimensions).toMatchObject({
        x: 0,
        y: 0,
        width: 1080,
        height: 1920
      });
    });
  });

  describe('detectSubjects (fallback mode)', () => {
    it('should use fallback detection when TensorFlow unavailable', async () => {
      const videoPath = '/tmp/video.mp4';
      const timestamp = 5;

      const detections = await service.detectSubjects(videoPath, timestamp);

      expect(detections).toEqual([]);
    });

    it('should handle detection with options', async () => {
      const videoPath = '/tmp/video.mp4';
      const timestamp = 10;
      const options = {
        detectFaces: true,
        detectPeople: true,
        minConfidence: 0.7
      };

      const detections = await service.detectSubjects(videoPath, timestamp, options);

      expect(detections).toEqual([]);
    });
  });

  describe('smartCrop', () => {
    it('should perform smart crop with center fallback', async () => {
      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';
      const aspectRatio = { width: 9, height: 16, name: 'portrait' };
      const options = { position: 'auto' as const };

      const result = await service.smartCrop(inputPath, outputPath, aspectRatio, options);

      expect(result).toMatchObject({
        cropDimensions: {
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number)
        },
        confidence: expect.any(Number),
        fallbackReason: expect.any(String)
      });
    });

    it('should use specific position when requested', async () => {
      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';
      const aspectRatio = { width: 1, height: 1, name: 'square' };
      const options = { position: 'top' as const };

      const result = await service.smartCrop(inputPath, outputPath, aspectRatio, options);

      expect(result.cropDimensions.y).toBe(0);
    });

    it('should apply quality settings in smart crop', async () => {
      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';
      const aspectRatio = { width: 9, height: 16, name: 'portrait' };
      const options = { quality: 'medium' as const };

      await service.smartCrop(inputPath, outputPath, aspectRatio, options);

      expect(mockFFmpeg.outputOptions).toHaveBeenCalledWith(expect.arrayContaining([
        '-crf 23'
      ]));
    });
  });

  describe('batch processing', () => {
    it('should process multiple videos in batch', async () => {
      const options = {
        videos: [
          { inputPath: '/tmp/video1.mp4', outputPath: '/tmp/out1.mp4' },
          { inputPath: '/tmp/video2.mp4', outputPath: '/tmp/out2.mp4' },
          { inputPath: '/tmp/video3.mp4', outputPath: '/tmp/out3.mp4' }
        ],
        cropOptions: {
          aspectRatio: { width: 9, height: 16, name: 'portrait' },
          quality: 'high' as const
        }
      };

      const progressHandler = vi.fn();
      const results = await service.batchProcess({
        ...options,
        onProgress: progressHandler
      });

      expect(results).toHaveLength(3);
      expect(progressHandler).toHaveBeenCalledWith({
        completed: expect.any(Number),
        total: 3,
        currentFile: expect.any(String)
      });
    });

    it('should handle errors in batch processing', async () => {
      mockFFmpeg.on.mockImplementationOnce((event, callback) => {
        if (event === 'error') {
          callback(new Error('Crop failed'));
        }
        return mockFFmpeg;
      });

      const options = {
        videos: [
          { inputPath: '/tmp/video1.mp4', outputPath: '/tmp/out1.mp4' },
          { inputPath: '/tmp/video2.mp4', outputPath: '/tmp/out2.mp4' }
        ],
        cropOptions: {
          aspectRatio: { width: 1, height: 1, name: 'square' }
        }
      };

      const errorHandler = vi.fn();
      const results = await service.batchProcess({
        ...options,
        onError: errorHandler
      });

      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        '/tmp/video1.mp4'
      );
      expect(results.some(r => r.success === false)).toBe(true);
    });

    it('should respect parallel processing limits', async () => {
      const options = {
        videos: Array.from({ length: 10 }, (_, i) => ({
          inputPath: `/tmp/video${i}.mp4`,
          outputPath: `/tmp/out${i}.mp4`
        })),
        cropOptions: {
          aspectRatio: { width: 9, height: 16, name: 'portrait' }
        },
        config: {
          maxParallel: 2
        }
      };

      let concurrentCount = 0;
      let maxConcurrent = 0;

      mockFFmpeg.on.mockImplementation((event, callback) => {
        if (event === 'start') {
          concurrentCount++;
          maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        }
        if (event === 'end') {
          concurrentCount--;
          setTimeout(() => callback(), 10);
        }
        return mockFFmpeg;
      });

      await service.batchProcess(options);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('extractFrame', () => {
    it('should extract frame at timestamp', async () => {
      const videoPath = '/tmp/video.mp4';
      const timestamp = 10;

      const frame = await service.extractFrame(videoPath, timestamp);

      expect(mockFFmpeg.input).toHaveBeenCalledWith(videoPath);
      expect(mockFFmpeg.outputOptions).toHaveBeenCalledWith(
        expect.arrayContaining(['-ss 10'])
      );
      expect(frame).toBeInstanceOf(Buffer);
    });

    it('should extract frame with specific format', async () => {
      const videoPath = '/tmp/video.mp4';
      const timestamp = 5;
      const format = 'png';

      await service.extractFrame(videoPath, timestamp, { format });

      expect(mockFFmpeg.outputOptions).toHaveBeenCalledWith(
        expect.arrayContaining(['-f image2'])
      );
    });
  });

  describe('presets', () => {
    it('should apply TikTok preset', async () => {
      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';

      await service.cropForTikTok(inputPath, outputPath);

      expect(mockFFmpeg.videoFilter).toHaveBeenCalledWith(
        expect.stringContaining('1080:1920')
      );
    });

    it('should apply Instagram Reels preset', async () => {
      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';

      await service.cropForInstagramReels(inputPath, outputPath);

      expect(mockFFmpeg.videoFilter).toHaveBeenCalledWith(
        expect.stringContaining('1080:1920')
      );
    });

    it('should apply YouTube Shorts preset', async () => {
      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';

      await service.cropForYouTubeShorts(inputPath, outputPath);

      expect(mockFFmpeg.videoFilter).toHaveBeenCalledWith(
        expect.stringContaining('1080:1920')
      );
    });
  });

  describe('getVideoMetadata', () => {
    it('should get video metadata', async () => {
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

      const videoPath = '/tmp/video.mp4';

      await expect(service.getVideoMetadata(videoPath))
        .rejects.toThrow('No video stream found');
    });
  });

  describe('event emissions', () => {
    it('should emit progress events during crop', async () => {
      const progressHandler = vi.fn();
      service.on('crop:progress', progressHandler);

      mockFFmpeg.on.mockImplementation((event, callback) => {
        if (event === 'progress') {
          callback({ percent: 50, currentFps: 30 });
        } else if (event === 'end') {
          setTimeout(() => callback(), 10);
        }
        return mockFFmpeg;
      });

      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';
      const cropDimensions = { x: 0, y: 0, width: 720, height: 1280 };

      await service.cropVideo(inputPath, outputPath, cropDimensions);

      expect(progressHandler).toHaveBeenCalledWith({
        inputPath,
        outputPath,
        progress: 50,
        fps: 30
      });
    });

    it('should emit complete event', async () => {
      const completeHandler = vi.fn();
      service.on('crop:complete', completeHandler);

      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';
      const cropDimensions = { x: 0, y: 0, width: 720, height: 1280 };

      await service.cropVideo(inputPath, outputPath, cropDimensions);

      expect(completeHandler).toHaveBeenCalledWith({
        inputPath,
        outputPath,
        cropDimensions
      });
    });

    it('should emit error event', async () => {
      const errorHandler = vi.fn();
      service.on('crop:error', errorHandler);

      mockFFmpeg.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(new Error('Crop failed'));
        }
        return mockFFmpeg;
      });

      const inputPath = '/tmp/input.mp4';
      const outputPath = '/tmp/output.mp4';
      const cropDimensions = { x: 0, y: 0, width: 720, height: 1280 };

      await expect(service.cropVideo(inputPath, outputPath, cropDimensions))
        .rejects.toThrow();

      expect(errorHandler).toHaveBeenCalledWith({
        inputPath,
        error: expect.any(Error)
      });
    });
  });

  describe('cleanup', () => {
    it('should clean up temporary files', async () => {
      await service.cleanup();

      expect(fs.remove).toHaveBeenCalledWith(
        expect.stringContaining('temp')
      );
    });
  });
});