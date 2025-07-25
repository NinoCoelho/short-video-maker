import { logger } from "../../logger";
import { Remotion } from "../libraries/Remotion";
import { VideoStatusManager } from "../VideoStatusManager";
import { Config } from "../../config";
import path from "path";
import fs from "fs-extra";

export class RemotionRenderer {
  private remotion: Remotion;
  private statusManager: VideoStatusManager;
  private globalConfig: Config;
  
  // Progress tracking
  private lastProgressUpdate: Map<string, number> = new Map();
  private renderStartTimes = new Map<string, number>();

  constructor(
    remotion: Remotion,
    statusManager: VideoStatusManager,
    globalConfig: Config
  ) {
    this.remotion = remotion;
    this.statusManager = statusManager;
    this.globalConfig = globalConfig;
  }

  public async renderVideo(
    videoId: string,
    videoData: any,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    logger.info({ videoId }, "Starting Remotion render");
    
    // Register render start time
    this.renderStartTimes.set(videoId, Date.now());
    
    try {
      await this.remotion.renderMedia(videoId, videoData, (progress) => {
        const progressPercent = Math.round(progress * 100);
        const stage = this.getProgressStage(progress);
        
        this.throttledProgressUpdate(videoId, progressPercent, stage);
        
        if (onProgress) {
          onProgress(progress);
        }
      });
      
      await this.statusManager.setStatus(videoId, "ready", "Video rendered successfully", 100, "Completed");
      
      // Clean up tracking data
      this.renderStartTimes.delete(videoId);
      this.lastProgressUpdate.delete(videoId);
    } catch (error: any) {
      await this.statusManager.setError(videoId, error.message);
      
      // Clean up tracking data on error
      this.renderStartTimes.delete(videoId);
      this.lastProgressUpdate.delete(videoId);
      
      throw error;
    }
  }

  public async renderFromRenderJson(videoId: string): Promise<void> {
    logger.info({ videoId }, "Starting pure render from .render.json");
    
    // Register render start time
    this.renderStartTimes.set(videoId, Date.now());
    
    await this.statusManager.setStatus(videoId, "processing", "Rendering video...", 0, "Initializing");
    
    const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
    if (!fs.existsSync(renderJsonPath)) {
      throw new Error(`.render.json not found for ${videoId}`);
    }
    
    const rawRenderData = fs.readJsonSync(renderJsonPath);

    // Validate required assets
    await this.validateRenderAssets(videoId, rawRenderData);

    // Pre-process data for Remotion
    const renderData = this.preprocessVideoDataForRemotionRendering(rawRenderData);

    try {
      await this.renderVideo(videoId, renderData);
    } catch (error) {
      logger.error({ videoId, error }, "Error rendering from render.json");
      throw error;
    }
  }

  private async validateRenderAssets(videoId: string, renderData: any): Promise<void> {
    await this.statusManager.setProgress(videoId, 5, "Validating assets...");
    
    if (!renderData.scenes) return;

    for (let i = 0; i < renderData.scenes.length; i++) {
      const scene = renderData.scenes[i];
      
      // Validate audio files
      if (scene.audio && scene.audio.url) {
        const audioUrl = scene.audio.url;
        if (audioUrl.startsWith('/temp/')) {
          const audioFilename = path.basename(audioUrl);
          const audioPath = path.join(this.globalConfig.tempDirPath, audioFilename);
          
          try {
            await fs.access(audioPath);
          } catch {
            logger.error({ 
              videoId, 
              sceneIndex: i, 
              audioUrl, 
              audioPath 
            }, "Audio file not found before rendering");
            throw new Error(`Audio file not found for scene ${i}: ${audioPath}`);
          }
          
          // Check file size
          const audioStats = await fs.stat(audioPath);
          if (audioStats.size === 0) {
            logger.error({ 
              videoId, 
              sceneIndex: i, 
              audioPath, 
              fileSize: audioStats.size 
            }, "Audio file is empty");
            throw new Error(`Audio file is empty for scene ${i}: ${audioPath}`);
          }
          
          logger.debug({ 
            videoId, 
            sceneIndex: i, 
            audioPath, 
            fileSize: audioStats.size 
          }, "Audio file validated successfully");
        }
      }
    }
  }

  public preprocessVideoDataForRemotionRendering(videoData: any): any {
    const processedData = JSON.parse(JSON.stringify(videoData)); // Deep clone
    
    logger.debug({ videoId: 'preprocessing' }, "Starting video data preprocessing for Remotion");
    
    // Process audio URLs in scenes
    if (processedData.scenes) {
      processedData.scenes.forEach((scene: any, sceneIndex: number) => {
        if (scene.audio && scene.audio.url) {
          const originalUrl = scene.audio.url;
          
          // Validate local audio files
          if (originalUrl.startsWith('/temp/')) {
            const localPath = path.join(this.globalConfig.tempDirPath, path.basename(originalUrl));
            if (!fs.existsSync(localPath)) {
              logger.error({ 
                sceneIndex, 
                originalUrl, 
                localPath,
                exists: false
              }, "Audio file not found during preprocessing");
              throw new Error(`Audio file not found: ${localPath}`);
            }
          }
          
          // Convert relative URLs to absolute
          if (!originalUrl.startsWith('http')) {
            scene.audio.url = this.resolveUrlForRemotionContext(originalUrl);
            logger.debug({ 
              sceneIndex,
              originalUrl, 
              processedUrl: scene.audio.url 
            }, "Preprocessed audio URL for Remotion");
          }
          
          // Validate audio duration
          if (!scene.audio.duration || scene.audio.duration <= 0 || isNaN(scene.audio.duration)) {
            logger.error({ 
              sceneIndex, 
              audioDuration: scene.audio.duration 
            }, "Invalid audio duration during preprocessing");
            throw new Error(`Invalid audio duration for scene ${sceneIndex}: ${scene.audio.duration}`);
          }
        }
        
        // Process video URLs
        if (scene.videos) {
          // Filter out null/undefined values
          scene.videos = scene.videos.filter((videoUrl: string) => videoUrl !== null && videoUrl !== undefined);
          
          if (scene.videos.length === 0) {
            logger.warn({ sceneIndex }, "Scene has no valid videos after filtering nulls");
          } else {
            scene.videos = scene.videos.map((videoUrl: string, videoIndex: number) => {
              if (!videoUrl) {
                logger.error({ sceneIndex, videoIndex }, "Empty video URL during preprocessing");
                throw new Error(`Empty video URL for scene ${sceneIndex}, video ${videoIndex}`);
              }
              
              if (!videoUrl.startsWith('http') && videoUrl.startsWith('/')) {
                const processedUrl = this.resolveUrlForRemotionContext(videoUrl);
                logger.debug({ 
                  sceneIndex,
                  videoIndex,
                  originalUrl: videoUrl, 
                  processedUrl 
                }, "Preprocessed video URL for Remotion");
                return processedUrl;
              }
              return videoUrl;
            });
          }
        }
      });
    }
    
    // Process music URL
    if (processedData.music && processedData.music.url) {
      const originalMusicUrl = processedData.music.url;
      processedData.music.url = `http://localhost:${this.globalConfig.port}${originalMusicUrl}`;
      logger.debug({ 
        originalUrl: originalMusicUrl, 
        processedUrl: processedData.music.url 
      }, "Preprocessed music URL for Remotion");
    }
    
    // Validate final data structure
    if (!processedData.scenes || processedData.scenes.length === 0) {
      throw new Error("No scenes found in video data");
    }
    
    if (!processedData.config) {
      throw new Error("No config found in video data");
    }
    
    logger.info({ 
      sceneCount: processedData.scenes.length,
      orientation: processedData.config.orientation,
      duration: processedData.config.durationInSec,
      overlay: processedData.config.overlay,
      configKeys: Object.keys(processedData.config)
    }, "Video data preprocessing completed successfully");
    
    return processedData;
  }

  private resolveUrlForRemotionContext(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `http://localhost:${this.globalConfig.port}${normalizedPath}`;
  }

  private async throttledProgressUpdate(videoId: string, progress: number, stage: string): Promise<void> {
    const lastUpdate = this.lastProgressUpdate.get(videoId) || 0;
    const now = Date.now();
    
    // Smart progress update logic
    if (this.shouldUpdateProgress(progress, lastUpdate, now)) {
      const timeRemaining = this.estimateTimeRemaining(progress, videoId);
      const message = timeRemaining > 0 
        ? `${stage} (${Math.floor(timeRemaining / 60)}m ${Math.floor(timeRemaining % 60)}s remaining)`
        : stage;
      
      await this.statusManager.setProgress(videoId, progress, message);
      this.lastProgressUpdate.set(videoId, now);
      
      logger.debug({ 
        videoId, 
        progress, 
        stage,
        timeRemaining
      }, "Progress update");
    }
  }

  private shouldUpdateProgress(currentProgress: number, lastUpdateTime: number, currentTime: number): boolean {
    const timeSinceLastUpdate = currentTime - lastUpdateTime;
    
    // Always update for key milestones
    if (currentProgress % 10 === 0 || currentProgress === 1 || currentProgress >= 99) {
      return true;
    }
    
    // Dynamic throttling based on progress
    if (currentProgress < 20) {
      return timeSinceLastUpdate >= 1000; // Update every second at start
    } else if (currentProgress < 80) {
      return timeSinceLastUpdate >= 3000; // Update every 3 seconds in middle
    } else {
      return timeSinceLastUpdate >= 2000; // Update every 2 seconds near end
    }
  }

  private estimateTimeRemaining(currentProgress: number, videoId: string): number {
    const startTime = this.renderStartTimes.get(videoId);
    if (!startTime || currentProgress === 0) return -1;
    
    const elapsedTime = (Date.now() - startTime) / 1000; // seconds
    const estimatedTotalTime = elapsedTime / (currentProgress / 100);
    const remainingTime = estimatedTotalTime - elapsedTime;
    
    return Math.max(0, Math.round(remainingTime));
  }

  private getProgressStage(progress: number): string {
    if (progress < 0.2) return "Initializing";
    if (progress < 0.5) return "Processing frames";
    if (progress < 0.8) return "Encoding video";
    return "Finalizing";
  }

  public async getMediaDuration(mediaPath: string): Promise<number> {
    return await this.remotion.getMediaDuration(mediaPath);
  }
}