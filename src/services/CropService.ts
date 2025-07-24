import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
// Optional TensorFlow import - fallback to basic detection if not available
let tf: any = null;
try {
  tf = require('@tensorflow/tfjs-node');
} catch (error) {
  console.warn('TensorFlow.js not available, using fallback detection methods');
}
import sharp from 'sharp';
import { logger } from '../logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Worker } from 'worker_threads';

const execAsync = promisify(exec);

export interface CropDimensions {
  x: number;      // X coordinate of top-left corner
  y: number;      // Y coordinate of top-left corner
  width: number;  // Width of crop area
  height: number; // Height of crop area
}

export interface AspectRatio {
  width: number;
  height: number;
  name: string;
}

export interface CropOptions {
  aspectRatio?: AspectRatio;
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'auto';
  scale?: 'none' | 'fill' | 'fit' | 'stretch';
  blur?: boolean; // Blur background for fit mode
  padding?: number; // Padding in pixels for fit mode
  quality?: 'high' | 'medium' | 'low';
  detectFaces?: boolean; // Use face detection for smart cropping
  detectMotion?: boolean; // Track motion for dynamic cropping
}

export interface DetectionResult {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  type: 'face' | 'person' | 'object';
  tracking_id?: string;
}

export interface MotionPrediction {
  velocity_x: number;
  velocity_y: number;
  predicted_x: number;
  predicted_y: number;
  confidence: number;
}

export interface TrackingInfo {
  detection: DetectionResult;
  motion: MotionPrediction;
  history: Array<{ x: number; y: number; timestamp: number }>;
}

export interface SmartCropResult {
  cropDimensions: CropDimensions;
  detections?: DetectionResult[];
  motionArea?: CropDimensions;
  confidence: number;
  qualityScore?: number;
  processingTime?: number;
  fallbackReason?: string;
}

export interface ProcessingConfig {
  enableFaceDetection: boolean;
  enablePersonDetection: boolean;
  enableObjectTracking: boolean;
  motionPrediction: boolean;
  gpuAcceleration: boolean;
  batchSize: number;
  maxParallel: number;
  qualityThreshold: number;
  memoryLimit: number; // MB
}

export interface BatchProcessingOptions {
  videos: Array<{
    inputPath: string;
    outputPath: string;
    segmentId?: string;
    targetAspectRatio?: AspectRatio;
  }>;
  cropOptions: CropOptions;
  config?: ProcessingConfig;
  onProgress?: (progress: { completed: number; total: number; currentFile: string }) => void;
  onError?: (error: Error, filePath: string) => void;
}

// Common aspect ratios
export const ASPECT_RATIOS = {
  VERTICAL: { width: 9, height: 16, name: 'Vertical (9:16)' },
  SQUARE: { width: 1, height: 1, name: 'Square (1:1)' },
  HORIZONTAL: { width: 16, height: 9, name: 'Horizontal (16:9)' },
  STORY: { width: 9, height: 16, name: 'Story (9:16)' },
  TIKTOK: { width: 9, height: 16, name: 'TikTok (9:16)' },
  INSTAGRAM_REEL: { width: 9, height: 16, name: 'Instagram Reel (9:16)' },
  YOUTUBE_SHORT: { width: 9, height: 16, name: 'YouTube Short (9:16)' },
  INSTAGRAM_SQUARE: { width: 1, height: 1, name: 'Instagram Square (1:1)' },
  INSTAGRAM_PORTRAIT: { width: 4, height: 5, name: 'Instagram Portrait (4:5)' },
  INSTAGRAM_LANDSCAPE: { width: 1.91, height: 1, name: 'Instagram Landscape (1.91:1)' }
};

export class CropService extends EventEmitter {
  private tempDir: string;
  private ffmpegPath: string;
  private ffprobePath: string;
  private models: {
    faceDetection?: any;
    objectDetection?: any;
    blazeface?: any;
  } = {};
  private config: ProcessingConfig;
  private trackingData: Map<string, TrackingInfo> = new Map();
  private processingQueue: Array<{ path: string; resolve: Function; reject: Function }> = [];
  private isProcessing = false;
  private memoryMonitor: { used: number; limit: number } = { used: 0, limit: 2048 };

  constructor(dataDir: string, config?: Partial<ProcessingConfig>) {
    super();
    this.tempDir = path.join(dataDir, 'temp', 'crop');
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    this.ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
    
    this.config = {
      enableFaceDetection: true,
      enablePersonDetection: true,
      enableObjectTracking: false,
      motionPrediction: true,
      gpuAcceleration: true,
      batchSize: 4,
      maxParallel: 2,
      qualityThreshold: 0.7,
      memoryLimit: 2048,
      ...config
    };
    
    this.memoryMonitor.limit = this.config.memoryLimit;
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      await fs.ensureDir(this.tempDir);
      ffmpeg.setFfmpegPath(this.ffmpegPath);
      ffmpeg.setFfprobePath(this.ffprobePath);
      
      // Configure TensorFlow backend if available
      if (tf && this.config.gpuAcceleration) {
        try {
          await tf.setBackend('tensorflow');
          logger.info('GPU acceleration enabled for TensorFlow');
        } catch (error) {
          logger.warn('GPU acceleration not available, falling back to CPU');
          await tf.setBackend('cpu');
        }
      } else if (tf) {
        await tf.setBackend('cpu');
      }
      
      await this.loadModels();
      
      logger.info({ 
        tempDir: this.tempDir,
        backend: tf ? tf.getBackend() : 'none',
        config: this.config
      }, 'Smart crop service initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize crop service');
      throw error;
    }
  }
  
  /**
   * Load ML models for detection
   */
  private async loadModels(): Promise<void> {
    try {
      if (tf && this.config.enableFaceDetection) {
        // Load BlazeFace model for face detection
        try {
          const blazefaceUrl = 'https://tfhub.dev/tensorflow/tfjs-model/blazeface/1/default/1';
          this.models.blazeface = await tf.loadGraphModel(blazefaceUrl, { fromTFHub: true });
          logger.info('BlazeFace model loaded successfully');
        } catch (error) {
          logger.warn('Failed to load BlazeFace model, face detection disabled');
          this.config.enableFaceDetection = false;
        }
      }
      
      // Note: For more advanced object detection, you would load COCO-SSD or similar
      // This is a simplified implementation
      
    } catch (error) {
      logger.error({ error }, 'Failed to load ML models');
    }
  }

  /**
   * Get video dimensions and metadata
   */
  public async getVideoDimensions(videoPath: string): Promise<{ 
    width: number; 
    height: number; 
    duration: number;
    fps: number;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream || !videoStream.width || !videoStream.height) {
          reject(new Error('Could not determine video dimensions'));
          return;
        }

        resolve({
          width: videoStream.width,
          height: videoStream.height,
          duration: parseFloat(videoStream.duration || '0'),
          fps: this.parseFPS(videoStream.r_frame_rate)
        });
      });
    });
  }

  /**
   * Parse frame rate from string format
   */
  private parseFPS(fpsString?: string): number {
    if (!fpsString) return 30;
    const parts = fpsString.split('/');
    if (parts.length === 2) {
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    return parseFloat(fpsString) || 30;
  }

  /**
   * Smart crop video with face detection and motion tracking
   */
  public async smartCrop(
    inputPath: string,
    outputPath: string,
    options: CropOptions = {}
  ): Promise<SmartCropResult> {
    const { aspectRatio = ASPECT_RATIOS.VERTICAL, detectFaces = true, detectMotion = false } = options;
    
    this.emit('crop:started', { inputPath, aspectRatio });

    try {
      // Get video dimensions
      const videoDimensions = await this.getVideoDimensions(inputPath);
      
      // Calculate target dimensions
      const targetDimensions = this.calculateTargetDimensions(
        videoDimensions,
        aspectRatio
      );

      let cropResult: SmartCropResult;

      if (detectFaces || detectMotion) {
        // Use AI-powered cropping
        cropResult = await this.detectAndCrop(
          inputPath,
          videoDimensions,
          targetDimensions,
          options
        );
      } else {
        // Use position-based cropping
        cropResult = {
          cropDimensions: this.calculateCropDimensions(
            videoDimensions,
            targetDimensions,
            options.position || 'center'
          ),
          confidence: 1
        };
      }

      // Apply the crop
      await this.applyCrop(inputPath, outputPath, cropResult.cropDimensions, options);
      
      this.emit('crop:completed', { outputPath, cropResult });
      return cropResult;
    } catch (error) {
      this.emit('crop:error', error);
      throw error;
    }
  }

  /**
   * Crop video with specific dimensions
   */
  public async cropVideo(
    inputPath: string,
    outputPath: string,
    cropDimensions: CropDimensions,
    options: CropOptions = {}
  ): Promise<void> {
    await this.applyCrop(inputPath, outputPath, cropDimensions, options);
  }

  /**
   * Change video orientation (rotate)
   */
  public async changeOrientation(
    inputPath: string,
    outputPath: string,
    rotation: 0 | 90 | 180 | 270
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const transpose = {
        90: '1',     // 90 clockwise
        180: '2,2',  // 180 (two 90 degree rotations)
        270: '2'     // 90 counter-clockwise
      };

      const command = ffmpeg(inputPath);

      if (rotation !== 0) {
        command.videoFilters(`transpose=${transpose[rotation]}`);
      }

      command
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'copy'
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Convert horizontal video to vertical with padding/blur
   */
  public async horizontalToVertical(
    inputPath: string,
    outputPath: string,
    options: {
      method?: 'crop' | 'pad' | 'blur';
      backgroundColor?: string;
    } = {}
  ): Promise<void> {
    const { method = 'blur', backgroundColor = 'black' } = options;
    const videoDimensions = await this.getVideoDimensions(inputPath);
    
    const targetWidth = 1080;
    const targetHeight = 1920;
    
    switch (method) {
      case 'crop':
        // Center crop to vertical
        await this.smartCrop(inputPath, outputPath, {
          aspectRatio: ASPECT_RATIOS.VERTICAL,
          position: 'center'
        });
        break;
        
      case 'pad':
        // Add padding
        await this.padVideo(inputPath, outputPath, targetWidth, targetHeight, backgroundColor);
        break;
        
      case 'blur':
        // Scale video to fit and add blurred background
        await this.addBlurredBackground(inputPath, outputPath, targetWidth, targetHeight);
        break;
    }
  }

  /**
   * Detect faces and motion for smart cropping
   */
  private async detectAndCrop(
    videoPath: string,
    videoDimensions: { width: number; height: number },
    targetDimensions: { width: number; height: number },
    options: CropOptions
  ): Promise<SmartCropResult> {
    const result: SmartCropResult = {
      cropDimensions: { x: 0, y: 0, width: targetDimensions.width, height: targetDimensions.height },
      confidence: 0
    };

    if (options.detectFaces) {
      // Face detection using OpenCV or similar
      const faces = await this.detectFaces(videoPath);
      if (faces.length > 0) {
        result.faces = faces;
        result.cropDimensions = this.calculateFaceCenteredCrop(
          faces,
          videoDimensions,
          targetDimensions
        );
        result.confidence = Math.max(...faces.map(f => f.confidence));
      }
    }

    if (options.detectMotion && result.confidence < 0.8) {
      // Motion detection for dynamic scenes
      const motionArea = await this.detectMotionArea(videoPath);
      if (motionArea) {
        result.motionArea = motionArea;
        result.cropDimensions = this.calculateMotionCenteredCrop(
          motionArea,
          videoDimensions,
          targetDimensions
        );
        result.confidence = Math.max(result.confidence, 0.7);
      }
    }

    // Fallback to center crop if no faces or motion detected
    if (result.confidence === 0) {
      result.cropDimensions = this.calculateCropDimensions(
        videoDimensions,
        targetDimensions,
        'center'
      );
      result.confidence = 0.5;
    }

    return result;
  }

  /**
   * Detect faces in video using frame analysis
   */
  private async detectFaces(videoPath: string): Promise<DetectionResult[]> {
    try {
      const tempDir = path.join(__dirname, '..', '..', 'tmp', 'face_detection');
      await fs.ensureDir(tempDir);

      // Extract sample frames for analysis (every 5 seconds)
      const framePattern = path.join(tempDir, `frames_${Date.now()}_%03d.jpg`);
      
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .outputOptions([
            '-vf', 'fps=0.2', // Extract 1 frame every 5 seconds
            '-y'
          ])
          .output(framePattern)
          .on('error', reject)
          .on('end', resolve)
          .run();
      });

      // Get extracted frames
      const frameFiles = await fs.readdir(tempDir);
      const imageFiles = frameFiles
        .filter(f => f.endsWith('.jpg') && f.includes(`frames_${Date.now().toString().slice(0, -3)}`))
        .map(f => path.join(tempDir, f));

      if (imageFiles.length === 0) {
        logger.warn('No frames extracted for face detection');
        return [];
      }

      // Process frames to detect faces
      const allDetections: DetectionResult[] = [];
      
      for (const framePath of imageFiles) {
        try {
          const frameDetections = await this.detectFacesInFrame(framePath);
          allDetections.push(...frameDetections);
        } catch (error) {
          logger.warn({ error, framePath }, 'Failed to detect faces in frame');
        }
      }

      // Cleanup temp frames
      await fs.remove(tempDir);

      // Group and average similar face positions
      const consolidatedFaces = this.consolidateFaceDetections(allDetections);
      
      logger.info({ 
        faceCount: consolidatedFaces.length, 
        framesAnalyzed: imageFiles.length 
      }, 'Face detection completed');

      return consolidatedFaces;

    } catch (error) {
      logger.error({ error, videoPath }, 'Face detection failed');
      return [];
    }
  }

  /**
   * Detect faces in a single frame using multiple methods
   */
  private async detectFacesInFrame(framePath: string): Promise<DetectionResult[]> {
    const detections: DetectionResult[] = [];

    try {
      // Method 1: Use TensorFlow.js face detection model if available
      if (tf) {
        const tfDetections = await this.detectFacesWithTensorFlow(framePath);
        detections.push(...tfDetections);
      }

      // Method 2: OpenCV-style cascade detection (simplified)
      if (detections.length === 0) {
        const cascadeDetections = await this.detectFacesWithImageAnalysis(framePath);
        detections.push(...cascadeDetections);
      }

      // Method 3: Basic facial feature analysis (fallback)
      if (detections.length === 0) {
        const basicDetections = await this.detectFacesBasic(framePath);
        detections.push(...basicDetections);
      }

    } catch (error) {
      logger.warn({ error, framePath }, 'Frame face detection failed');
    }

    return detections;
  }

  /**
   * TensorFlow.js based face detection
   */
  private async detectFacesWithTensorFlow(framePath: string): Promise<DetectionResult[]> {
    if (!tf) return [];
    
    try {
      // This would require a proper TF.js face detection model
      // For now, return empty array as placeholder
      logger.debug('TensorFlow face detection not fully implemented');
      return [];
    } catch (error) {
      logger.warn({ error }, 'TensorFlow face detection failed');
      return [];
    }
  }

  /**
   * Image analysis based face detection using edge/contour detection
   */
  private async detectFacesWithImageAnalysis(framePath: string): Promise<DetectionResult[]> {
    try {
      const image = await sharp(framePath);
      const metadata = await image.metadata();
      const { width, height } = metadata;

      if (!width || !height) return [];

      // Convert to grayscale and detect edges
      const edgeBuffer = await image
        .grayscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Edge detection kernel
        })
        .raw()
        .toBuffer();

      // Analyze edge patterns for face-like features
      const faceRegions = this.findFaceRegionsInEdges(edgeBuffer, width, height);
      
      return faceRegions.map(region => ({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        confidence: region.confidence,
        type: 'face' as const,
        tracking_id: `face_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }));

    } catch (error) {
      logger.warn({ error, framePath }, 'Image analysis face detection failed');
      return [];
    }
  }

  /**
   * Basic face detection using simple heuristics
   */
  private async detectFacesBasic(framePath: string): Promise<DetectionResult[]> {
    try {
      const image = await sharp(framePath);
      const metadata = await image.metadata();
      const { width, height } = metadata;

      if (!width || !height) return [];

      // Assume center region might contain a face (common in videos)
      // This is a very basic fallback
      const faceWidth = Math.min(width * 0.3, 300);
      const faceHeight = Math.min(height * 0.4, 400);
      const centerX = width / 2 - faceWidth / 2;
      const centerY = height / 2 - faceHeight / 2;

      // Only return this if the image seems to have person-like proportions
      if (width > 100 && height > 100) {
        return [{
          x: Math.max(0, centerX),
          y: Math.max(0, centerY),
          width: Math.min(faceWidth, width),
          height: Math.min(faceHeight, height),
          confidence: 0.3, // Low confidence since this is a fallback
          type: 'face' as const,
          tracking_id: `basic_face_${Date.now()}`
        }];
      }

      return [];

    } catch (error) {
      logger.warn({ error, framePath }, 'Basic face detection failed');
      return [];
    }
  }

  /**
   * Find face-like regions in edge-detected image
   */
  private findFaceRegionsInEdges(edgeBuffer: Buffer, width: number, height: number): Array<{
    x: number; y: number; width: number; height: number; confidence: number;
  }> {
    const regions: Array<{x: number; y: number; width: number; height: number; confidence: number}> = [];
    
    // Simple region detection based on edge density
    const blockSize = 32;
    const minFaceSize = 64;
    
    for (let y = 0; y < height - minFaceSize; y += blockSize) {
      for (let x = 0; x < width - minFaceSize; x += blockSize) {
        const edgeDensity = this.calculateEdgeDensity(edgeBuffer, x, y, minFaceSize, minFaceSize, width);
        
        // Face regions typically have moderate edge density (not too high, not too low)
        if (edgeDensity > 0.1 && edgeDensity < 0.4) {
          const aspectRatio = minFaceSize / minFaceSize;
          
          // Face-like aspect ratios
          if (aspectRatio > 0.6 && aspectRatio < 1.4) {
            regions.push({
              x,
              y,
              width: minFaceSize,
              height: minFaceSize,
              confidence: Math.min(0.8, edgeDensity * 2)
            });
          }
        }
      }
    }
    
    return regions.slice(0, 5); // Limit to 5 potential faces
  }

  /**
   * Calculate edge density in a region
   */
  private calculateEdgeDensity(
    buffer: Buffer, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    imageWidth: number
  ): number {
    let edgePixels = 0;
    let totalPixels = 0;
    
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const pixelIndex = ((y + dy) * imageWidth + (x + dx));
        if (pixelIndex < buffer.length) {
          const intensity = buffer[pixelIndex];
          if (intensity > 50) edgePixels++; // Threshold for edge pixels
          totalPixels++;
        }
      }
    }
    
    return totalPixels > 0 ? edgePixels / totalPixels : 0;
  }

  /**
   * Consolidate similar face detections across multiple frames
   */
  private consolidateFaceDetections(detections: DetectionResult[]): DetectionResult[] {
    if (detections.length === 0) return [];
    
    // Group similar positions (within 50px)
    const groups: DetectionResult[][] = [];
    const threshold = 50;
    
    for (const detection of detections) {
      let addedToGroup = false;
      
      for (const group of groups) {
        const representative = group[0];
        const distance = Math.sqrt(
          Math.pow(detection.x - representative.x, 2) + 
          Math.pow(detection.y - representative.y, 2)
        );
        
        if (distance < threshold) {
          group.push(detection);
          addedToGroup = true;
          break;
        }
      }
      
      if (!addedToGroup) {
        groups.push([detection]);
      }
    }
    
    // Return average position for each group
    return groups.map(group => {
      const avgX = group.reduce((sum, d) => sum + d.x, 0) / group.length;
      const avgY = group.reduce((sum, d) => sum + d.y, 0) / group.length;
      const avgWidth = group.reduce((sum, d) => sum + d.width, 0) / group.length;
      const avgHeight = group.reduce((sum, d) => sum + d.height, 0) / group.length;
      const avgConfidence = group.reduce((sum, d) => sum + d.confidence, 0) / group.length;
      
      return {
        x: Math.round(avgX),
        y: Math.round(avgY),
        width: Math.round(avgWidth),
        height: Math.round(avgHeight),
        confidence: avgConfidence,
        type: 'face' as const,
        tracking_id: `consolidated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
    });
  }

  /**
   * Detect motion area in video (placeholder - requires actual implementation)
   */
  private async detectMotionArea(videoPath: string): Promise<CropDimensions | null> {
    // TODO: Implement motion detection
    // This could analyze frame differences to find areas with most movement
    logger.warn('Motion detection not implemented');
    return null;
  }

  /**
   * Calculate crop centered on faces
   */
  private calculateFaceCenteredCrop(
    faces: DetectionResult[],
    videoDimensions: { width: number; height: number },
    targetDimensions: { width: number; height: number }
  ): CropDimensions {
    // Find bounding box containing all faces
    let minX = faces[0].x;
    let minY = faces[0].y;
    let maxX = faces[0].x + faces[0].width;
    let maxY = faces[0].y + faces[0].height;

    for (const face of faces) {
      minX = Math.min(minX, face.x);
      minY = Math.min(minY, face.y);
      maxX = Math.max(maxX, face.x + face.width);
      maxY = Math.max(maxY, face.y + face.height);
    }

    // Center crop around faces
    const faceCenterX = (minX + maxX) / 2;
    const faceCenterY = (minY + maxY) / 2;

    let x = faceCenterX - targetDimensions.width / 2;
    let y = faceCenterY - targetDimensions.height / 2;

    // Ensure crop stays within video bounds
    x = Math.max(0, Math.min(x, videoDimensions.width - targetDimensions.width));
    y = Math.max(0, Math.min(y, videoDimensions.height - targetDimensions.height));

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: targetDimensions.width,
      height: targetDimensions.height
    };
  }

  /**
   * Calculate crop centered on motion
   */
  private calculateMotionCenteredCrop(
    motionArea: CropDimensions,
    videoDimensions: { width: number; height: number },
    targetDimensions: { width: number; height: number }
  ): CropDimensions {
    const centerX = motionArea.x + motionArea.width / 2;
    const centerY = motionArea.y + motionArea.height / 2;

    let x = centerX - targetDimensions.width / 2;
    let y = centerY - targetDimensions.height / 2;

    x = Math.max(0, Math.min(x, videoDimensions.width - targetDimensions.width));
    y = Math.max(0, Math.min(y, videoDimensions.height - targetDimensions.height));

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: targetDimensions.width,
      height: targetDimensions.height
    };
  }

  /**
   * Calculate target dimensions based on aspect ratio
   */
  private calculateTargetDimensions(
    videoDimensions: { width: number; height: number },
    aspectRatio: AspectRatio
  ): { width: number; height: number } {
    const videoAspect = videoDimensions.width / videoDimensions.height;
    const targetAspect = aspectRatio.width / aspectRatio.height;

    let width: number;
    let height: number;

    if (videoAspect > targetAspect) {
      // Video is wider than target - fit by height
      height = videoDimensions.height;
      width = Math.round(height * targetAspect);
    } else {
      // Video is taller than target - fit by width
      width = videoDimensions.width;
      height = Math.round(width / targetAspect);
    }

    // Ensure dimensions don't exceed original
    if (width > videoDimensions.width) {
      width = videoDimensions.width;
      height = Math.round(width / targetAspect);
    }
    if (height > videoDimensions.height) {
      height = videoDimensions.height;
      width = Math.round(height * targetAspect);
    }

    return { width, height };
  }

  /**
   * Calculate crop dimensions based on position
   */
  private calculateCropDimensions(
    videoDimensions: { width: number; height: number },
    targetDimensions: { width: number; height: number },
    position: string
  ): CropDimensions {
    let x = 0;
    let y = 0;

    switch (position) {
      case 'center':
        x = (videoDimensions.width - targetDimensions.width) / 2;
        y = (videoDimensions.height - targetDimensions.height) / 2;
        break;
      case 'top':
        x = (videoDimensions.width - targetDimensions.width) / 2;
        y = 0;
        break;
      case 'bottom':
        x = (videoDimensions.width - targetDimensions.width) / 2;
        y = videoDimensions.height - targetDimensions.height;
        break;
      case 'left':
        x = 0;
        y = (videoDimensions.height - targetDimensions.height) / 2;
        break;
      case 'right':
        x = videoDimensions.width - targetDimensions.width;
        y = (videoDimensions.height - targetDimensions.height) / 2;
        break;
    }

    return {
      x: Math.round(Math.max(0, x)),
      y: Math.round(Math.max(0, y)),
      width: targetDimensions.width,
      height: targetDimensions.height
    };
  }

  /**
   * Apply crop to video
   */
  private async applyCrop(
    inputPath: string,
    outputPath: string,
    cropDimensions: CropDimensions,
    options: CropOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);
      const cropFilter = `crop=${cropDimensions.width}:${cropDimensions.height}:${cropDimensions.x}:${cropDimensions.y}`;
      
      command.videoFilters(cropFilter);

      const quality = options.quality || 'medium';
      let crf: number;
      let preset: string;

      switch (quality) {
        case 'high':
          crf = 18;
          preset = 'slow';
          break;
        case 'low':
          crf = 28;
          preset = 'veryfast';
          break;
        default:
          crf = 23;
          preset = 'medium';
      }

      command
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', preset,
          '-crf', crf.toString(),
          '-c:a', 'copy',
          '-movflags', '+faststart'
        ])
        .output(outputPath)
        .on('progress', (progress) => {
          this.emit('crop:progress', progress);
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Add padding to video
   */
  private async padVideo(
    inputPath: string,
    outputPath: string,
    targetWidth: number,
    targetHeight: number,
    backgroundColor: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const padFilter = `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:${backgroundColor}`;
      
      ffmpeg(inputPath)
        .videoFilters(padFilter)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'copy'
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Add blurred background to video
   */
  private async addBlurredBackground(
    inputPath: string,
    outputPath: string,
    targetWidth: number,
    targetHeight: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Complex filter to create blurred background
      const filterComplex = [
        // Create blurred background
        `[0:v]scale=${targetWidth}:${targetHeight},boxblur=luma_radius=min(h\\,w)/20:luma_power=1:chroma_radius=min(cw\\,ch)/20:chroma_power=1[bg]`,
        // Scale original video to fit
        `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease[fg]`,
        // Overlay scaled video on blurred background
        '[bg][fg]overlay=(W-w)/2:(H-h)/2'
      ].join(';');

      ffmpeg(inputPath)
        .complexFilter(filterComplex)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'copy'
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Batch process multiple videos with parallel support
   */
  public async batchCrop(batchOptions: BatchProcessingOptions): Promise<SmartCropResult[]> {
    const { videos, cropOptions, config, onProgress, onError } = batchOptions;
    const results: SmartCropResult[] = [];
    const errors: Array<{ path: string; error: Error }> = [];
    
    this.emit('batch:started', { total: videos.length });
    
    // Update config if provided
    if (config) {
      Object.assign(this.config, config);
    }
    
    const processingPromises: Promise<void>[] = [];
    const maxParallel = this.config.maxParallel;
    
    // Process videos in parallel batches
    for (let i = 0; i < videos.length; i += maxParallel) {
      const batch = videos.slice(i, i + maxParallel);
      
      const batchPromise = Promise.all(
        batch.map(async (video, batchIndex) => {
          const globalIndex = i + batchIndex;
          
          try {
            // Memory check before processing
            await this.checkMemoryUsage();
            
            const result = await this.smartCrop(
              video.inputPath, 
              video.outputPath, 
              {
                ...cropOptions,
                aspectRatio: video.targetAspectRatio || cropOptions.aspectRatio
              }
            );
            
            results[globalIndex] = result;
            
            // Progress callback
            if (onProgress) {
              onProgress({
                completed: results.filter(r => r).length,
                total: videos.length,
                currentFile: video.inputPath
              });
            }
            
            this.emit('batch:progress', {
              completed: results.filter(r => r).length,
              total: videos.length,
              progress: (results.filter(r => r).length / videos.length) * 100,
              currentFile: video.inputPath
            });
            
          } catch (error) {
            const cropError = error as Error;
            errors.push({ path: video.inputPath, error: cropError });
            
            logger.error({ error: cropError, inputPath: video.inputPath }, 'Failed to crop video in batch');
            
            if (onError) {
              onError(cropError, video.inputPath);
            }
            
            this.emit('batch:error', { error: cropError, inputPath: video.inputPath });
          }
        })
      );
      
      processingPromises.push(batchPromise);
      
      // Wait for batch to complete before starting next batch
      await batchPromise;
      
      // Optional delay between batches to prevent resource exhaustion
      if (i + maxParallel < videos.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    await Promise.all(processingPromises);
    
    const successfulResults = results.filter(r => r);
    
    this.emit('batch:completed', { 
      results: successfulResults,
      errors,
      successCount: successfulResults.length,
      errorCount: errors.length
    });
    
    return successfulResults;
  }

  /**
   * Generate multiple preview frames with crop overlay
   */
  public async generatePreviews(
    videoPath: string,
    cropDimensions: CropDimensions,
    timestamps: number[] = [0, 0.25, 0.5, 0.75, 1.0]
  ): Promise<string[]> {
    const videoMeta = await this.getVideoDimensions(videoPath);
    const previewPaths: string[] = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i] * videoMeta.duration;
      const previewPath = path.join(this.tempDir, `preview_${Date.now()}_${i}.jpg`);
      
      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(videoPath)
            .seekInput(timestamp)
            .videoFilters([
              `crop=${cropDimensions.width}:${cropDimensions.height}:${cropDimensions.x}:${cropDimensions.y}`,
              'scale=400:400' // Standardize preview size
            ])
            .frames(1)
            .output(previewPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });
        
        previewPaths.push(previewPath);
      } catch (error) {
        logger.error({ error, timestamp }, 'Failed to generate preview frame');
      }
    }
    
    return previewPaths;
  }

  /**
   * Generate crop configuration for VideoSegmentService integration
   */
  public async generateCropConfig(
    inputPath: string,
    targetAspectRatio: AspectRatio,
    options: CropOptions = {}
  ): Promise<{
    cropDimensions: CropDimensions;
    confidence: number;
    qualityScore: number;
    previewFrames: string[];
    metadata: {
      originalDimensions: { width: number; height: number };
      targetDimensions: { width: number; height: number };
      detections?: DetectionResult[];
      processingTime: number;
    };
  }> {
    const startTime = Date.now();
    
    // Get video metadata
    const videoMeta = await this.getVideoDimensions(inputPath);
    const originalDimensions = { width: videoMeta.width, height: videoMeta.height };
    
    // Calculate target dimensions
    const targetDimensions = this.calculateTargetDimensions(originalDimensions, targetAspectRatio);
    
    // Perform smart crop analysis
    const cropResult = await this.smartCrop(inputPath, path.join(this.tempDir, 'temp_output.mp4'), {
      ...options,
      aspectRatio: targetAspectRatio
    });
    
    // Generate preview frames
    const previewFrames = await this.generatePreviews(inputPath, cropResult.cropDimensions);
    
    return {
      cropDimensions: cropResult.cropDimensions,
      confidence: cropResult.confidence,
      qualityScore: cropResult.qualityScore || 0.7,
      previewFrames,
      metadata: {
        originalDimensions,
        targetDimensions,
        detections: cropResult.detections,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * Clean up resources and temporary files
   */
  public async cleanup(): Promise<void> {
    try {
      // Dispose TensorFlow models and tensors
      if (this.models.blazeface) {
        this.models.blazeface.dispose();
      }
      if (this.models.faceDetection) {
        this.models.faceDetection.dispose();
      }
      if (this.models.objectDetection) {
        this.models.objectDetection.dispose();
      }
      
      if (tf) {
        tf.disposeVariables();
      }
      
      // Clear processing queue
      this.processingQueue.length = 0;
      
      // Clear tracking data
      this.trackingData.clear();
      
      // Clean up temp directory
      const tempFiles = await fs.readdir(this.tempDir).catch(() => []);
      await Promise.all(
        tempFiles.map(file => 
          fs.unlink(path.join(this.tempDir, file)).catch(() => {})
        )
      );
      
      logger.info('CropService cleanup completed');
    } catch (error) {
      logger.error({ error }, 'Error during CropService cleanup');
    }
  }

  /**
   * Get service status and metrics
   */
  public getStatus(): {
    isReady: boolean;
    modelsLoaded: string[];
    config: ProcessingConfig;
    memoryUsage: { used: number; limit: number };
    queueSize: number;
    trackingCount: number;
  } {
    return {
      isReady: Object.keys(this.models).length > 0,
      modelsLoaded: Object.keys(this.models).filter(key => this.models[key as keyof typeof this.models]),
      config: this.config,
      memoryUsage: this.memoryMonitor,
      queueSize: this.processingQueue.length,
      trackingCount: this.trackingData.size
    };
  }
}