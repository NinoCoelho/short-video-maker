/**
 * Integration example: VideoSegmentService with CropService
 * 
 * This file demonstrates how to use the CropService with VideoSegmentService
 * for intelligent video cropping during the video import process.
 */

import { CropService, ASPECT_RATIOS } from './CropService';
import { VideoSegmentService } from './VideoSegmentService';
import { logger } from '../logger';
import path from 'path';
import fs from 'fs-extra';

interface CropIntegrationConfig {
  enableSmartCrop: boolean;
  targetAspectRatio: 'vertical' | 'square' | 'horizontal';
  cropQuality: 'high' | 'medium' | 'low';
  enablePreview: boolean;
  batchProcessing: boolean;
  maxParallel: number;
}

export class VideoSegmentCropIntegration {
  private cropService: CropService;
  private videoSegmentService: VideoSegmentService;
  private config: CropIntegrationConfig;

  constructor(
    dataDir: string,
    config: Partial<CropIntegrationConfig> = {}
  ) {
    this.config = {
      enableSmartCrop: true,
      targetAspectRatio: 'vertical',
      cropQuality: 'high',
      enablePreview: true,
      batchProcessing: true,
      maxParallel: 2,
      ...config
    };

    // Initialize CropService with optimized settings
    this.cropService = new CropService(dataDir, {
      enableFaceDetection: true,
      enablePersonDetection: true,
      enableObjectTracking: false, // Disable for performance
      motionPrediction: true,
      gpuAcceleration: true,
      batchSize: 4,
      maxParallel: this.config.maxParallel,
      qualityThreshold: 0.7,
      memoryLimit: 4096 // Higher limit for video processing
    });

    this.videoSegmentService = new VideoSegmentService();

    logger.info({ config: this.config }, 'VideoSegment-Crop integration initialized');
  }

  /**
   * Process imported video with smart cropping
   */
  public async processImportedVideo(
    videoPath: string,
    outputDir: string,
    options: {
      segmentDuration?: number;
      overlapDuration?: number;
      generateHighlights?: boolean;
    } = {}
  ) {
    try {
      logger.info({ videoPath }, 'Starting integrated video processing');

      // Step 1: Segment the video
      const segments = await this.videoSegmentService.segmentVideo(videoPath, {
        segmentDuration: options.segmentDuration || 30,
        overlapDuration: options.overlapDuration || 2,
        outputDirectory: outputDir
      });

      if (!this.config.enableSmartCrop) {
        logger.info('Smart cropping disabled, returning original segments');
        return { segments, cropResults: [] };
      }

      // Step 2: Analyze video for optimal crop settings
      const aspectRatio = this.getAspectRatio();
      const cropConfig = await this.cropService.generateCropConfig(
        videoPath,
        aspectRatio,
        { 
          quality: this.config.cropQuality,
          detectFaces: true,
          detectMotion: true
        }
      );

      logger.info({ 
        confidence: cropConfig.confidence,
        qualityScore: cropConfig.qualityScore,
        processingTime: cropConfig.metadata.processingTime
      }, 'Crop analysis completed');

      // Step 3: Apply cropping to segments
      const cropResults = await this.applyCroppingToSegments(
        segments,
        cropConfig,
        outputDir
      );

      // Step 4: Generate highlights if requested
      let highlights: any[] = [];
      if (options.generateHighlights) {
        highlights = await this.generateHighlights(segments, cropResults);
      }

      return {
        segments: segments.map((segment, index) => ({
          ...segment,
          croppedPath: cropResults[index]?.outputPath,
          cropConfidence: cropResults[index]?.confidence,
          qualityScore: cropResults[index]?.qualityScore
        })),
        cropResults,
        highlights,
        cropConfig,
        summary: {
          totalSegments: segments.length,
          successfulCrops: cropResults.filter(r => r.confidence > 0.5).length,
          averageConfidence: cropResults.reduce((sum, r) => sum + r.confidence, 0) / cropResults.length,
          processingTime: cropConfig.metadata.processingTime
        }
      };

    } catch (error) {
      logger.error({ error, videoPath }, 'Failed to process imported video');
      throw error;
    }
  }

  /**
   * Apply cropping to video segments in batch
   */
  private async applyCroppingToSegments(
    segments: any[],
    cropConfig: any,
    outputDir: string
  ) {
    const croppedDir = path.join(outputDir, 'cropped');
    await fs.ensureDir(croppedDir);

    if (!this.config.batchProcessing) {
      // Process segments one by one
      const results = [];
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const outputPath = path.join(croppedDir, `segment_${i}_cropped.mp4`);
        
        try {
          const result = await this.cropService.smartCrop(
            segment.path,
            outputPath,
            {
              aspectRatio: this.getAspectRatio(),
              quality: this.config.cropQuality,
              detectFaces: true,
              detectMotion: true
            }
          );
          
          results.push({ ...result, outputPath, originalPath: segment.path });
        } catch (error) {
          logger.error({ error, segmentPath: segment.path }, 'Failed to crop segment');
          results.push({
            outputPath: segment.path, // Use original on failure
            cropDimensions: null,
            confidence: 0,
            error: error.message
          });
        }
      }
      return results;
    }

    // Batch processing
    const batchVideos = segments.map((segment, index) => ({
      inputPath: segment.path,
      outputPath: path.join(croppedDir, `segment_${index}_cropped.mp4`),
      segmentId: segment.id,
      targetAspectRatio: this.getAspectRatio()
    }));

    const batchResults = await this.cropService.batchCrop({
      videos: batchVideos,
      cropOptions: {
        aspectRatio: this.getAspectRatio(),
        quality: this.config.cropQuality,
        detectFaces: true,
        detectMotion: true
      },
      config: {
        enableFaceDetection: true,
        enablePersonDetection: true,
        enableObjectTracking: false,
        motionPrediction: true,
        gpuAcceleration: true,
        batchSize: 4,
        maxParallel: this.config.maxParallel,
        qualityThreshold: 0.6,
        memoryLimit: 4096
      },
      onProgress: (progress) => {
        logger.info({ 
          completed: progress.completed,
          total: progress.total,
          currentFile: path.basename(progress.currentFile)
        }, 'Batch crop progress');
      },
      onError: (error, filePath) => {
        logger.error({ error, filePath }, 'Batch crop error');
      }
    });

    return batchResults.map((result, index) => ({
      ...result,
      outputPath: batchVideos[index].outputPath,
      originalPath: batchVideos[index].inputPath,
      segmentId: batchVideos[index].segmentId
    }));
  }

  /**
   * Generate video highlights based on crop analysis
   */
  private async generateHighlights(segments: any[], cropResults: any[]) {
    const highlights = [];
    
    // Find segments with high confidence and quality
    const topSegments = segments
      .map((segment, index) => ({
        ...segment,
        cropResult: cropResults[index],
        score: cropResults[index] ? 
          (cropResults[index].confidence * 0.7 + cropResults[index].qualityScore * 0.3) : 0
      }))
      .filter(segment => segment.score > 0.7)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5 segments

    for (const segment of topSegments) {
      // Generate preview thumbnails
      if (this.config.enablePreview) {
        try {
          const previewFrames = await this.cropService.generatePreviews(
            segment.cropResult.outputPath || segment.path,
            segment.cropResult.cropDimensions
          );
          
          highlights.push({
            segmentId: segment.id,
            startTime: segment.startTime,
            duration: segment.duration,
            score: segment.score,
            confidence: segment.cropResult.confidence,
            qualityScore: segment.cropResult.qualityScore,
            croppedPath: segment.cropResult.outputPath,
            previewFrames,
            reason: this.getHighlightReason(segment)
          });
        } catch (error) {
          logger.warn({ error, segmentId: segment.id }, 'Failed to generate preview for highlight');
        }
      }
    }

    return highlights;
  }

  /**
   * Get highlight reason based on detection results
   */
  private getHighlightReason(segment: any): string {
    const cropResult = segment.cropResult;
    if (!cropResult.detections || cropResult.detections.length === 0) {
      return 'High quality content';
    }

    const faces = cropResult.detections.filter(d => d.type === 'face').length;
    const persons = cropResult.detections.filter(d => d.type === 'person').length;

    if (faces > 0) {
      return `Contains ${faces} face${faces > 1 ? 's' : ''}`;
    } else if (persons > 0) {
      return `Contains ${persons} person${persons > 1 ? 's' : ''}`;
    } else {
      return 'Optimal composition detected';
    }
  }

  /**
   * Get aspect ratio based on configuration
   */
  private getAspectRatio() {
    switch (this.config.targetAspectRatio) {
      case 'square':
        return ASPECT_RATIOS.SQUARE;
      case 'horizontal':
        return ASPECT_RATIOS.HORIZONTAL;
      case 'vertical':
      default:
        return ASPECT_RATIOS.VERTICAL;
    }
  }

  /**
   * Get integration status
   */
  public getStatus() {
    return {
      cropService: this.cropService.getStatus(),
      config: this.config,
      isReady: this.cropService.getStatus().isReady
    };
  }

  /**
   * Clean up resources
   */
  public async cleanup() {
    await this.cropService.cleanup();
    logger.info('VideoSegment-Crop integration cleanup completed');
  }
}

// Usage example:
export async function exampleUsage() {
  const integration = new VideoSegmentCropIntegration('/path/to/data', {
    enableSmartCrop: true,
    targetAspectRatio: 'vertical',
    cropQuality: 'high',
    enablePreview: true,
    batchProcessing: true,
    maxParallel: 2
  });

  try {
    const result = await integration.processImportedVideo(
      '/path/to/input/video.mp4',
      '/path/to/output/directory',
      {
        segmentDuration: 30,
        overlapDuration: 2,
        generateHighlights: true
      }
    );

    console.log('Processing completed:', {
      totalSegments: result.segments.length,
      successfulCrops: result.summary.successfulCrops,
      averageConfidence: result.summary.averageConfidence,
      highlightsGenerated: result.highlights.length
    });

    return result;
  } finally {
    await integration.cleanup();
  }
}