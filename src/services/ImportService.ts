import { ImportedVideo, VideoSegment, ImportSettings, RenderConfig, OrientationEnum } from "../types/shorts";
import { ShortCreator } from "../short-creator/ShortCreator";
import { ImportStage, VideoStatusManager } from "../short-creator/VideoStatusManager";
import { logger } from "../logger";
import { Config } from "../config";
import path from "path";
import fs from "fs-extra";

export class ImportService {
  private shortCreator: ShortCreator;
  private statusManager: VideoStatusManager;
  private globalConfig: Config;

  constructor(
    shortCreator: ShortCreator,
    statusManager: VideoStatusManager,
    globalConfig: Config
  ) {
    this.shortCreator = shortCreator;
    this.statusManager = statusManager;
    this.globalConfig = globalConfig;
  }

  /**
   * Main entry point for video import processing
   * Orchestrates the complete import-to-render pipeline
   */
  async processVideoImport(
    importedVideo: ImportedVideo,
    videoSegments: VideoSegment[],
    importSettings: ImportSettings
  ): Promise<string> {
    const videoId = await this.initializeImport(importedVideo, videoSegments, importSettings);

    try {
      // Stage 1: Validate and prepare import data
      await this.validateImportData(videoId, importedVideo, videoSegments);

      // Stage 2: Process video segments and convert to scenes
      const renderConfig = this.createRenderConfig(importSettings);
      
      // Stage 3: Add to ShortCreator pipeline for processing
      const processedVideoId = this.shortCreator.addImportToQueue(
        importedVideo,
        videoSegments,
        importSettings,
        renderConfig
      );

      // Note: The videoId from ShortCreator might be different from our initialization
      // We should handle this by updating our tracking
      if (processedVideoId !== videoId) {
        await this.transferVideoStatus(videoId, processedVideoId);
        return processedVideoId;
      }

      return videoId;

    } catch (error: any) {
      logger.error({ videoId, error }, "Error in video import processing");
      await this.statusManager.setError(videoId, `Import processing failed: ${error.message}`);
      
      // Cleanup on failure
      await this.cleanupFailedImport(videoId);
      throw error;
    }
  }

  /**
   * Initialize import process with initial status tracking
   */
  private async initializeImport(
    importedVideo: ImportedVideo,
    videoSegments: VideoSegment[],
    importSettings: ImportSettings
  ): Promise<string> {
    const videoId = importedVideo.id;

    logger.info({ 
      videoId, 
      sourcePlatform: importedVideo.sourcePlatform,
      segmentCount: videoSegments.length,
      duration: importedVideo.originalDuration
    }, "Initializing video import process");

    // Set initial status
    await this.statusManager.setImportStage(
      videoId,
      ImportStage.ANALYZING,
      5,
      "Initializing import process"
    );

    // Create import directory structure
    const importDir = path.join(this.globalConfig.dataDirPath, 'imports', videoId);
    fs.ensureDirSync(importDir);

    // Store import metadata
    const importMetadata = {
      videoId,
      importedVideo,
      videoSegments,
      importSettings,
      startedAt: new Date().toISOString(),
      status: 'initialized'
    };

    const metadataPath = path.join(importDir, 'metadata.json');
    fs.writeJsonSync(metadataPath, importMetadata, { spaces: 2 });

    return videoId;
  }

  /**
   * Validate import data integrity and compatibility
   */
  private async validateImportData(
    videoId: string,
    importedVideo: ImportedVideo,
    videoSegments: VideoSegment[]
  ): Promise<void> {
    logger.debug({ videoId }, "Validating import data");

    await this.statusManager.setImportStage(
      videoId,
      ImportStage.ANALYZING,
      10,
      "Validating import data"
    );

    // Validate imported video data
    if (!importedVideo.url || !importedVideo.id) {
      throw new Error("Invalid imported video: missing required fields");
    }

    if (!importedVideo.originalResolution || !importedVideo.originalDuration) {
      throw new Error("Invalid imported video: missing resolution or duration");
    }

    // Validate video segments
    if (!videoSegments || videoSegments.length === 0) {
      throw new Error("No video segments provided for import");
    }

    for (let i = 0; i < videoSegments.length; i++) {
      const segment = videoSegments[i];
      
      if (!segment.id || !segment.parentVideoId) {
        throw new Error(`Invalid segment ${i}: missing id or parentVideoId`);
      }

      if (segment.start >= segment.end) {
        throw new Error(`Invalid segment ${i}: start time >= end time`);
      }

      if (segment.end > importedVideo.originalDuration) {
        throw new Error(`Invalid segment ${i}: end time exceeds video duration`);
      }
    }

    // Check for overlapping segments
    const sortedSegments = [...videoSegments].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sortedSegments.length; i++) {
      if (sortedSegments[i].start < sortedSegments[i - 1].end) {
        logger.warn({ videoId, segmentIndex: i }, "Overlapping segments detected");
      }
    }

    logger.info({ videoId, validSegments: videoSegments.length }, "Import data validation completed");
  }

  /**
   * Create render configuration from import settings
   */
  private createRenderConfig(importSettings: ImportSettings): RenderConfig {
    return {
      orientation: importSettings.orientation,
      music: importSettings.music,
      overlay: importSettings.overlay,
      language: importSettings.targetLanguage as "pt" | "en",
      voice: "Paulo", // Default voice, could be configurable
      captionPosition: "bottom",
      musicVolume: "medium",
      paddingBack: 1500
    };
  }

  /**
   * Transfer status from one video ID to another (if ShortCreator assigns new ID)
   */
  private async transferVideoStatus(fromVideoId: string, toVideoId: string): Promise<void> {
    try {
      const fromStatus = await this.statusManager.getStatus(fromVideoId);
      
      if (fromStatus.status !== 'pending') {
        await this.statusManager.setStatus(
          toVideoId,
          fromStatus.status,
          fromStatus.message,
          fromStatus.progress,
          fromStatus.stage
        );
      }

      // Copy import-specific data if available
      const importStatus = await this.statusManager.getImportStatus(fromVideoId);
      if (importStatus.importStage) {
        await this.statusManager.setImportStage(
          toVideoId,
          importStatus.importStage,
          importStatus.aggregatedProgress,
          fromStatus.message
        );
      }

      logger.info({ fromVideoId, toVideoId }, "Status transferred between video IDs");
    } catch (error) {
      logger.warn({ fromVideoId, toVideoId, error }, "Failed to transfer status between video IDs");
    }
  }

  /**
   * Cleanup resources after failed import
   */
  private async cleanupFailedImport(videoId: string): Promise<void> {
    try {
      logger.info({ videoId }, "Cleaning up failed import");

      // Remove import directory and all contents
      const importDir = path.join(this.globalConfig.dataDirPath, 'imports', videoId);
      if (fs.existsSync(importDir)) {
        fs.removeSync(importDir);
        logger.debug({ videoId, path: importDir }, "Import directory cleaned up");
      }

      // Remove any temporary files
      const tempDir = path.join(this.globalConfig.tempDirPath, 'imports', videoId);
      if (fs.existsSync(tempDir)) {
        fs.removeSync(tempDir);
        logger.debug({ videoId, path: tempDir }, "Temporary import files cleaned up");
      }

    } catch (error) {
      logger.error({ videoId, error }, "Error during failed import cleanup");
    }
  }

  /**
   * Synchronize import pipeline status with render pipeline
   */
  async syncImportWithRenderPipeline(videoId: string): Promise<void> {
    try {
      const importStatus = await this.statusManager.getImportStatus(videoId);
      const videoStatus = await this.statusManager.getStatus(videoId);

      // If import is complete but render hasn't started, trigger transition
      if (importStatus.importStage === ImportStage.CONVERTING && 
          importStatus.aggregatedProgress >= 100 &&
          videoStatus.status === 'processing') {
        
        await this.statusManager.transitionToRenderPipeline(videoId);
        logger.info({ videoId }, "Manually synchronized import with render pipeline");
      }

    } catch (error) {
      logger.warn({ videoId, error }, "Failed to synchronize import with render pipeline");
    }
  }

  /**
   * Handle error propagation from import to main status system
   */
  async propagateImportError(videoId: string, error: string, stage: ImportStage): Promise<void> {
    try {
      // Set error in main status
      await this.statusManager.setError(videoId, `Import failed at ${stage}: ${error}`);

      // Also update import-specific status
      await this.statusManager.updateSubJob(
        videoId,
        'import-main',
        'segment',
        0,
        stage,
        error
      );

      logger.error({ videoId, error, stage }, "Import error propagated to status system");

    } catch (statusError) {
      logger.error({ videoId, error, statusError }, "Failed to propagate import error");
    }
  }

  /**
   * Get comprehensive import status including sub-jobs
   */
  async getImportProgress(videoId: string): Promise<{
    overall: any;
    importSpecific: any;
    subJobs: any[];
  }> {
    try {
      const [overallStatus, importStatus] = await Promise.all([
        this.statusManager.getStatus(videoId),
        this.statusManager.getImportStatus(videoId)
      ]);

      return {
        overall: overallStatus,
        importSpecific: importStatus,
        subJobs: importStatus.subJobs
      };

    } catch (error) {
      logger.error({ videoId, error }, "Failed to get import progress");
      throw error;
    }
  }

  /**
   * Resume failed or interrupted import
   */
  async resumeImport(videoId: string): Promise<void> {
    try {
      logger.info({ videoId }, "Attempting to resume import");

      // Load import metadata
      const importDir = path.join(this.globalConfig.dataDirPath, 'imports', videoId);
      const metadataPath = path.join(importDir, 'metadata.json');
      
      if (!fs.existsSync(metadataPath)) {
        throw new Error(`Import metadata not found for video ${videoId}`);
      }

      const metadata = fs.readJsonSync(metadataPath);
      
      // Resume from the last known state
      await this.processVideoImport(
        metadata.importedVideo,
        metadata.videoSegments,
        metadata.importSettings
      );

    } catch (error) {
      logger.error({ videoId, error }, "Failed to resume import");
      throw error;
    }
  }

  /**
   * Archive completed import with full metadata
   */
  async archiveCompletedImport(videoId: string): Promise<void> {
    try {
      await this.shortCreator.archiveOriginalImport(videoId, {} as ImportedVideo);
      
      // Additional archiving logic specific to import service
      const importDir = path.join(this.globalConfig.dataDirPath, 'imports', videoId);
      const archiveDir = path.join(this.globalConfig.dataDirPath, 'imports', 'completed');
      
      fs.ensureDirSync(archiveDir);
      
      if (fs.existsSync(importDir)) {
        const archivePath = path.join(archiveDir, videoId);
        fs.moveSync(importDir, archivePath);
        logger.info({ videoId, archivePath }, "Import archived successfully");
      }

    } catch (error) {
      logger.warn({ videoId, error }, "Failed to archive completed import");
    }
  }
}