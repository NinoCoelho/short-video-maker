import { OrientationEnum, MusicMood, VoiceEnum, Video, ShortResult, AudioResult, SceneInput, RenderConfig, Scene, MusicTag, MusicForVideo, Caption, ShortQueue, VideoData, EditedVideoData, VideoChange, RegenerateOptions, VideoChanges, ImportedVideo, ImportVideoSegment, ImportSettings } from "../types/shorts";
import * as fs from "fs-extra";
import { promises as fsPromises } from "fs";
import cuid from "cuid";
import * as path from "path";
import { spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import * as crypto from 'crypto';

import { Remotion } from "./libraries/Remotion";
import { FFmpeg } from "./libraries/FFmpeg";
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";
import { type Music } from "../types/shorts";
import { LocalTTS } from "./libraries/LocalTTS";
import { VideoSearch } from "./libraries/VideoSearch";
import { ThreadPool } from './libraries/ThreadPool';
import { cleanSceneText, splitTextByPunctuation } from "./utils/textCleaner";
import { VideoProviderFacade } from "./libraries/VideoProviderFacade";
import { VideoStatus, VideoStatusManager, VideoStatusObject } from "./VideoStatusManager";
import { QueueItem, ImportQueueItem } from "./types/QueueItem";
import { VideoCacheManager } from "./libraries/VideoCacheManager";
import { ImportConverter } from "./utils/ImportConverter";
import { ImportStage } from "./VideoStatusManager";

// Import new services
import { QueueManager } from "./services/QueueManager";
import { VideoContentManager } from "./services/VideoContentManager";
import { TTSManager } from "./services/TTSManager";
import { SceneManager } from "./services/SceneManager";
import { RemotionRenderer } from "./services/RemotionRenderer";

export class ShortCreator {
  private bundled: string;
  private globalConfig: Config;
  private videoProviderFacade: VideoProviderFacade;
  private localTTS: LocalTTS;
  private remotion: Remotion;
  private statusManager: VideoStatusManager;
  private ffmpeg: FFmpeg;
  private outputDir: string;
  private musicManager: MusicManager;
  
  // New service instances
  private queueManager: QueueManager;
  private videoProcessor: VideoContentManager;
  private ttsManager: TTSManager;
  private sceneManager: SceneManager;
  private remotionRenderer: RemotionRenderer;

  constructor(
    bundled: string,
    globalConfig: Config,
    remotion: Remotion,
    ffmpeg: FFmpeg,
    videoProviderFacade: VideoProviderFacade,
    localTTS: LocalTTS,
    statusManager: VideoStatusManager
  ) {
    this.bundled = bundled;
    this.globalConfig = globalConfig;
    this.remotion = remotion;
    this.ffmpeg = ffmpeg;
    this.localTTS = localTTS;
    this.statusManager = statusManager;
    this.videoProviderFacade = videoProviderFacade;
    this.musicManager = new MusicManager(globalConfig);
    this.outputDir = path.join(this.globalConfig.dataDirPath, "temp");
    fs.ensureDirSync(this.outputDir);

    // Initialize services
    this.videoProcessor = new VideoContentManager(videoProviderFacade, globalConfig);
    this.ttsManager = new TTSManager(localTTS, globalConfig, remotion);
    this.sceneManager = new SceneManager(
      this.videoProcessor,
      this.ttsManager,
      statusManager,
      globalConfig
    );
    this.remotionRenderer = new RemotionRenderer(remotion, statusManager, globalConfig);
    
    // Initialize queue manager with callbacks
    this.queueManager = new QueueManager({
      onProcessCreationItem: this.prepareAndRender.bind(this),
      onProcessRenderItem: this.renderFromRenderJson.bind(this),
      onProcessImportItem: this.processImportedVideo.bind(this)
    });
  }

  // ===================================================================
  // PUBLIC API METHODS
  // ===================================================================

  public processTextForTTS(text: string): string[] {
    return this.ttsManager.processTextForTTS(text);
  }

  public async status(id: string): Promise<VideoStatusObject> {
    const status = await this.statusManager.getStatus(id);
    
    // If video file exists, update status to "ready" if needed
    if (fs.existsSync(this.getVideoPath(id))) {
      if (status.status !== 'ready') {
        await this.statusManager.setStatus(id, "ready");
        return { status: "ready" };
      }
      return status;
    }
    
    // If status is not pending, return current status
    if (status.status !== 'pending') {
      return status;
    }
    
    return { status: "failed", error: "Video file not found and no status was recorded." };
  }

  public addToQueue(
    sceneInput: SceneInput[],
    config: RenderConfig,
  ): string {
    const videoId = this.queueManager.addToCreationQueue(sceneInput, config);
    
    // Set initial status
    this.statusManager.setStatus(videoId, "pending", "Video added to queue", 0, "Queued").catch(error => {
      logger.error({ videoId, error }, "Failed to set initial status");
    });

    return videoId;
  }

  public async searchVideos(query: string): Promise<any> {
    return this.videoProcessor.searchVideos(query);
  }

  public async reRenderVideo(
    videoId: string,
    sceneInput: SceneInput[],
    config: RenderConfig
  ): Promise<void> {
    logger.info({ 
      videoId, 
      sceneCount: sceneInput?.length,
      configReceived: !!config,
      configKeys: config ? Object.keys(config) : []
    }, "Starting re-render process");
    
    // Validate input parameters
    if (!videoId) {
      throw new Error("Video ID is required for re-rendering");
    }
    if (!sceneInput || !Array.isArray(sceneInput)) {
      throw new Error("Scene input array is required for re-rendering");
    }
    if (!config) {
      throw new Error("Configuration is required for re-rendering");
    }
    
    try {
      await this.statusManager.setStatus(videoId, "processing", "Starting re-render...", 0, "Initializing");
      
      // Process scenes for re-render
      const { remotionData, updatedScriptScenes } = await this.sceneManager.processReRenderScenes(
        videoId,
        sceneInput,
        config
      );

      // Find and add music
      const totalDuration = remotionData.scenes.reduce((acc: number, s: Scene) => acc + s.duration, 0);
      remotionData.music = this.findMusic(totalDuration, config.music);

      // Save updated data
      await this.saveVideoData(videoId, remotionData);
      
      // Save updated script
      const scriptPath = path.join(this.globalConfig.videosDirPath, `${videoId}.script.json`);
      const scriptData = {
        scenes: updatedScriptScenes,
        config,
        createdAt: new Date().toISOString()
      };
      fs.writeJsonSync(scriptPath, scriptData, { spaces: 2 });

      // Add to render queue
      this.queueManager.addToRenderQueue(videoId);
      
    } catch (error) {
      logger.error({ videoId, error }, "Error in re-render process");
      await this.statusManager.setError(videoId, error instanceof Error ? error.message : "Re-render failed");
      throw error;
    }
  }

  // Alias for backward compatibility
  public async reRenderEditedVideo(
    videoId: string,
    sceneInput: SceneInput[],
    config: RenderConfig
  ): Promise<void> {
    return this.reRenderVideo(videoId, sceneInput, config);
  }

  public async renderVideoFromData(videoId: string, videoData: VideoData): Promise<void> {
    logger.info({ videoId }, "Rendering video from data");
    
    // Save render data
    const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
    fs.writeJsonSync(renderJsonPath, videoData, { spaces: 2 });
    
    // Add to render queue
    this.queueManager.addToRenderQueue(videoId);
  }

  public async generateSingleTTSAndUpdate(
    videoId: string, 
    sceneId: string, 
    text: string, 
    config: RenderConfig, 
    forceRegenerate: boolean = false
  ) {
    return this.sceneManager.generateSingleTTSAndUpdate(
      videoId,
      sceneId,
      text,
      config,
      forceRegenerate
    );
  }

  public async processVideoEdition(
    videoId: string,
    newData: EditedVideoData,
    regenerateOptions?: RegenerateOptions & {
      regenerateAllAudio?: boolean;
      specificScenes?: string[];
    }
  ): Promise<void> {
    logger.info({ videoId }, "Processing video edition");
    
    const originalData = this.getVideoById(videoId);
    if (!originalData) {
      throw new Error(`Video ${videoId} not found`);
    }

    // Detect changes
    const changes = this.sceneManager.detectChanges(originalData, newData) as unknown as VideoChanges;
    
    if (!changes.hasChanges && !regenerateOptions?.regenerateAllAudio) {
      logger.info({ videoId }, "No changes detected, skipping re-render");
      return;
    }

    // Process changes
    await this.processEditChanges(
      videoId,
      originalData,
      newData,
      changes,
      regenerateOptions
    );

    // Save and trigger render
    await this.saveAndProcessVideoEdition(videoId, newData);
  }

  public async saveAndProcessVideoEdition(videoId: string, newData: EditedVideoData): Promise<void> {
    // Save the updated data
    const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
    fs.writeJsonSync(renderJsonPath, newData, { spaces: 2 });
    
    // Add to render queue
    this.queueManager.addToRenderQueue(videoId);
  }

  // ===================================================================
  // FILE MANAGEMENT METHODS
  // ===================================================================

  public getVideoPath(videoId: string): string {
    return path.join(this.globalConfig.videosDirPath, `${videoId}.mp4`);
  }

  public getCachedVideoPath(filename: string): string | null {
    return this.videoProcessor.getCachedVideoPath(filename);
  }

  public getCacheStats(): { count: number; totalSize: number; totalSizeFormatted: string } {
    return this.videoProcessor.getCacheStats();
  }

  public async cleanupVideoCache(maxAgeHours: number = 24): Promise<void> {
    await this.videoProcessor.cleanupVideoCache(maxAgeHours);
  }

  public async deleteVideo(videoId: string): Promise<void> {
    logger.info({ videoId }, "Deleting video and associated files");
    
    const filesToDelete = [
      this.getVideoPath(videoId),
      path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`),
      path.join(this.globalConfig.videosDirPath, `${videoId}.script.json`),
      // Legacy paths
      path.join(this.globalConfig.dataDirPath, `${videoId}.json`),
      path.join(this.globalConfig.dataDirPath, `${videoId}.script.json`)
    ];

    for (const file of filesToDelete) {
      try {
        if (fs.existsSync(file)) {
          fs.removeSync(file);
          logger.debug({ file }, "Deleted file");
        }
      } catch (error) {
        logger.error({ file, error }, "Failed to delete file");
      }
    }

    // Clear status
    await this.statusManager.deleteStatus(videoId);
  }

  public clearAllVideos(): void {
    logger.warn("Clearing all videos");
    fs.emptyDirSync(this.globalConfig.videosDirPath);
    this.queueManager.clearAllQueues();
  }

  public getVideoData(videoId: string): VideoData | null {
    const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
    try {
      return fs.readJsonSync(renderJsonPath);
    } catch (error) {
      logger.error({ videoId, error }, "Failed to read video data");
      return null;
    }
  }

  public saveVideoData(videoId: string, data: VideoData): void {
    const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
    try {
      fs.writeJsonSync(renderJsonPath, data, { spaces: 2 });
      logger.debug({ videoId }, "Saved video data to .render.json");
    } catch (error) {
      logger.error({ videoId, error }, "Failed to save video data");
      throw error;
    }
  }

  public async getAllVideos(): Promise<any[]> {
    const videosDir = this.globalConfig.videosDirPath;
    
    if (!fs.existsSync(videosDir)) {
      return [];
    }

    const files = await fsPromises.readdir(videosDir);
    const scriptFiles = files.filter(f => f.endsWith('.script.json'));
    
    const videos = await Promise.all(
      scriptFiles.map(async (file) => {
        try {
          const videoId = file.replace('.script.json', '');
          const scriptPath = path.join(videosDir, file);
          const videoPath = path.join(videosDir, `${videoId}.mp4`);
          const renderJsonPath = path.join(videosDir, `${videoId}.render.json`);
          
          const scriptData = await fsPromises.readFile(scriptPath, 'utf-8');
          const script = JSON.parse(scriptData);
          
          const stats = await fsPromises.stat(scriptPath);
          const videoExists = fs.existsSync(videoPath);
          const renderJsonExists = fs.existsSync(renderJsonPath);
          
          let renderData = null;
          if (renderJsonExists) {
            try {
              renderData = fs.readJsonSync(renderJsonPath);
            } catch (e) {
              logger.warn({ videoId }, "Failed to read render.json");
            }
          }
          
          const status = await this.statusManager.getStatus(videoId);
          
          return {
            id: videoId,
            ...script,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            exists: videoExists,
            hasRenderData: renderJsonExists,
            status: status.status,
            progress: status.progress,
            message: status.message,
            duration: renderData?.config?.durationInSec || null
          };
        } catch (error) {
          logger.error({ file, error }, "Failed to process video script file");
          return null;
        }
      })
    );

    // Filter nulls and sort by most recent
    return videos
      .filter(v => v !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getVideoById(id: string): VideoData | null {
    const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${id}.render.json`);
    const scriptPath = path.join(this.globalConfig.videosDirPath, `${id}.script.json`);
    const legacyJsonPath = path.join(this.globalConfig.dataDirPath, `${id}.json`);
    const legacyScriptPath = path.join(this.globalConfig.dataDirPath, `${id}.script.json`);

    // Prioritize render.json
    if (fs.existsSync(renderJsonPath)) {
      logger.debug({ videoId: id }, "Serving .render.json for editor.");
      return fs.readJsonSync(renderJsonPath);
    }
    
    // Fallback to script.json
    if (fs.existsSync(scriptPath)) {
      logger.debug({ videoId: id }, "Serving .script.json as fallback for editor.");
      return fs.readJsonSync(scriptPath);
    }

    // Legacy paths
    if (fs.existsSync(legacyJsonPath)) {
      logger.warn({ id }, "Serving legacy .json file from data directory");
      return fs.readJsonSync(legacyJsonPath);
    }
    
    if (fs.existsSync(legacyScriptPath)) {
      logger.warn({ id }, "Serving legacy .script.json file from data directory");
      return fs.readJsonSync(legacyScriptPath);
    }

    logger.warn({ videoId: id }, "No data file found for video.");
    return null;
  }

  public getScriptById(id: string) {
    const scriptPath = path.join(this.globalConfig.videosDirPath, `${id}.script.json`);
    const legacyScriptPath = path.join(this.globalConfig.dataDirPath, `${id}.script.json`);

    if (fs.existsSync(scriptPath)) {
      const data = fs.readFileSync(scriptPath, "utf-8");
      return JSON.parse(data);
    }

    if (fs.existsSync(legacyScriptPath)) {
      logger.warn({ id }, "Serving legacy .script.json file from data directory for getScriptById");
      const data = fs.readFileSync(legacyScriptPath, "utf-8");
      return JSON.parse(data);
    }

    return null;
  }

  // ===================================================================
  // MUSIC AND VOICE METHODS
  // ===================================================================

  public ListAvailableMusicTags(): MusicMoodEnum[] {
    return Object.values(MusicMoodEnum);
  }

  public ListAvailableVoices(): VoiceEnum[] {
    return Object.values(VoiceEnum);
  }

  private findMusic(duration: number, mood?: MusicTag): MusicForVideo {
    const allMusic = this.musicManager.musicList();
    
    // Filter by mood if provided
    const filteredMusic = mood ? 
      allMusic.filter(m => m.mood === mood) : 
      allMusic;
    
    // Find music with duration closest to the video duration
    let bestMusic = filteredMusic[0];
    if (filteredMusic.length > 1) {
      bestMusic = filteredMusic.reduce((prev, curr) => {
        const prevDiff = Math.abs((prev.end - prev.start) - duration);
        const currDiff = Math.abs((curr.end - curr.start) - duration);
        return currDiff < prevDiff ? curr : prev;
      });
    }
    
    // If no music matches the mood, fallback to any music
    if (!bestMusic && mood) {
      bestMusic = allMusic[0];
    }
    
    return {
      ...bestMusic,
      url: bestMusic.url
    };
  }

  // ===================================================================
  // IMPORT METHODS
  // ===================================================================

  // Method overload for processed import data (from ImportService)
  public addImportToQueue(
    importedVideo: ImportedVideo,
    videoSegments: ImportVideoSegment[],
    importSettings: ImportSettings,
    renderConfig: RenderConfig
  ): string;
  // Method overload for legacy video path import
  public addImportToQueue(
    videoPath: string,
    config: {
      title?: string;
      description?: string;
      language?: string;
      voice?: VoiceEnum;
      music?: MusicTag;
      orientation?: OrientationEnum;
    }
  ): string;
  public addImportToQueue(
    importedVideoOrPath: ImportedVideo | string,
    videoSegmentsOrConfig?: ImportVideoSegment[] | {
      title?: string;
      description?: string;
      language?: string;
      voice?: VoiceEnum;
      music?: MusicTag;
      orientation?: OrientationEnum;
    },
    importSettings?: ImportSettings,
    renderConfig?: RenderConfig
  ): string {
    // Handle the new overload (processed import data)
    if (typeof importedVideoOrPath === 'object' && 'sourceUrl' in importedVideoOrPath) {
      const importedVideo = importedVideoOrPath;
      const videoSegments = videoSegmentsOrConfig as ImportVideoSegment[];
      
      const videoId = importedVideo.id;
      logger.info({ videoId, segmentCount: videoSegments.length }, "Adding processed import to queue");

      // Convert VideoSegments to SceneInput using ImportConverter
      const sceneInput = ImportConverter.convertSegmentsToSceneInputs(
        videoSegments, 
        importedVideo, 
        renderConfig!
      );

      // Create proper ImportQueueItem with all required fields
      const importItem: ImportQueueItem = {
        id: videoId,
        type: "import",
        sceneInput,
        config: renderConfig!,
        status: "pending",
        priority: "high",
        importedVideo,
        videoSegments,
        importSettings: importSettings!,
        originalScenes: sceneInput // Backup for recovery
      };

      // Set initial video status to bridge import→render tracking
      this.statusManager.setStatus(
        videoId, 
        "processing", 
        "Import queued for rendering", 
        0, 
        "queued"
      ).catch(error => {
        logger.error({ videoId, error }, "Failed to set initial status for processed import");
      });

      this.queueManager.addToImportQueue(importItem);
      return videoId;
    }
    
    // Handle the legacy overload (video path)
    const videoPath = importedVideoOrPath as string;
    const config = (videoSegmentsOrConfig || {}) as {
      title?: string;
      description?: string;
      language?: string;
      voice?: VoiceEnum;
      music?: MusicTag;
      orientation?: OrientationEnum;
    };
    
    const videoId = cuid();
    logger.info({ videoId, videoPath, config }, "Adding imported video to queue");

    // Set initial import status
    this.statusManager.setImportStage(
      videoId, 
      ImportStage.DOWNLOADING, 
      0, 
      "Video added to import queue"
    ).catch(error => {
      logger.error({ videoId, error }, "Failed to set initial import status");
    });

    const importItem = {
      id: videoId,
      sceneInput: [], // Empty for imports, will be filled during processing
      config: {
        ...config,
        voice: config.voice || VoiceEnum.Paulo,
        language: config.language || "en",
        orientation: config.orientation || OrientationEnum.portrait
      } as RenderConfig,
      priority: "high", // Import jobs get higher priority
      status: "pending",
      importPath: videoPath // Store video path separately for imports
    } as unknown as ImportQueueItem;

    this.queueManager.addToImportQueue(importItem);
    return videoId;
  }

  public async cleanupImportFiles(videoId: string): Promise<void> {
    const importDir = path.join(this.globalConfig.tempDirPath, 'imports', videoId);
    if (fs.existsSync(importDir)) {
      logger.info({ videoId, importDir }, "Cleaning up import files");
      await fs.remove(importDir);
    }
  }

  public async archiveOriginalImport(videoId: string, importedVideo: VideoData): Promise<void> {
    const archiveDir = path.join(this.globalConfig.dataDirPath, 'imports', 'archive');
    await fs.ensureDir(archiveDir);
    
    const archivePath = path.join(archiveDir, `${videoId}_import.json`);
    await fs.writeJson(archivePath, {
      videoId,
      importedAt: new Date().toISOString(),
      metadata: importedVideo
    }, { spaces: 2 });
    
    logger.info({ videoId, archivePath }, "Archived import metadata");
  }

  // ===================================================================
  // PROVIDER ACCESS
  // ===================================================================

  public getVideoProviderFacade(): VideoProviderFacade {
    return this.videoProviderFacade;
  }

  // ===================================================================
  // PRIVATE METHODS - Core Processing
  // ===================================================================

  private async prepareAndRender(queueItem: QueueItem): Promise<void> {
    const { id: videoId, sceneInput, config } = queueItem;
    
    logger.info({ videoId }, "Starting video creation pipeline");
    
    try {
      await this.statusManager.setStatus(videoId, "processing", "Starting creation...", 0, "Initializing");
      
      // Process scenes
      const { remotionData, updatedScriptScenes } = await this.sceneManager.processScenes(
        videoId,
        sceneInput,
        config
      );

      // Find and add music
      const totalDuration = remotionData.scenes.reduce((acc: number, s: Scene) => acc + s.duration, 0);
      remotionData.music = this.findMusic(totalDuration, config.music);

      // Save video data
      await this.saveVideoData(videoId, remotionData);
      
      // Save script data
      const scriptPath = path.join(this.globalConfig.videosDirPath, `${videoId}.script.json`);
      const scriptData = {
        scenes: updatedScriptScenes,
        config,
        createdAt: new Date().toISOString()
      };
      fs.writeJsonSync(scriptPath, scriptData, { spaces: 2 });

      // Add to render queue
      this.queueManager.addToRenderQueue(videoId);
      
    } catch (error) {
      logger.error({ videoId, error }, "Error in creation pipeline");
      await this.statusManager.setError(videoId, error instanceof Error ? error.message : "Creation failed");
      throw error;
    }
  }

  private async renderFromRenderJson(videoId: string): Promise<void> {
    await this.remotionRenderer.renderFromRenderJson(videoId);
  }

  private async processImportedVideo(importItem: ImportQueueItem): Promise<void> {
    const { id: videoId, importedVideo, videoSegments, importSettings, config } = importItem;
    
    logger.info({ videoId }, "Processing imported video for rendering");
    
    try {
      // Update status to indicate render phase started
      await this.statusManager.transitionToRenderPipeline(videoId);
      
      // Use existing scene processing logic with converted scenes
      await this.sceneManager.processScenes(videoId, importItem.sceneInput, config);
      
      // Continue with normal video rendering pipeline
      await this.remotionRenderer.renderFromRenderJson(videoId);
      
    } catch (error) {
      logger.error({ videoId, error }, "Failed to process imported video");
      await this.statusManager.setError(videoId, `Import processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async processEditChanges(
    videoId: string,
    originalData: VideoData,
    newData: EditedVideoData,
    changes: VideoChanges,
    regenerateOptions?: RegenerateOptions
  ): Promise<void> {
    logger.info({ videoId, changes }, "Processing edit changes");

    // Process text changes
    for (const change of changes.textChanges) {
      const scene = newData.scenes?.find((s: Scene) => s.id === change.sceneId);
      if (scene) {
        const config = newData.config || originalData.config;
        const audioResult = await this.sceneManager.generateSingleTTSAndUpdate(
          videoId,
          change.sceneId,
          change.newText,
          config,
          true // Force regenerate
        );
        
        // Update scene with new audio data
        scene.audio = {
          url: (audioResult as any).url,
          duration: (audioResult as any).duration
        };
        scene.duration = (audioResult as any).duration;
        scene.captions = (audioResult as any).captions;
      }
    }

    // Process video changes
    for (const change of (changes as any).videoChanges) {
      const scene = newData.scenes?.find((s: Scene) => s.id === change.sceneId);
      if (scene) {
        // Validate new video URLs
        const validatedUrls = [];
        const newVideos = change.newVideos || [change.newVideoUrl];
        for (const url of newVideos) {
          if (url && newData.scenes && newData.config?.orientation) {
            const processedUrl = await this.videoProcessor.processVideoForScene(
              url,
              newData.scenes.indexOf(scene),
              newData.config.orientation
            );
            validatedUrls.push(processedUrl);
          }
        }
        scene.videos = validatedUrls;
      }
    }

    // Handle regenerate all audio option
    if ((regenerateOptions as any)?.regenerateAllAudio && newData.scenes) {
      for (const scene of newData.scenes) {
        const config = newData.config || originalData.config;
        const audioResult = await this.sceneManager.generateSingleTTSAndUpdate(
          videoId,
          scene.id,
          scene.text,
          config,
          true // Force regenerate
        );
        
        scene.audio = {
          url: (audioResult as any).url,
          duration: (audioResult as any).duration
        };
        scene.duration = (audioResult as any).duration;
        scene.captions = (audioResult as any).captions;
      }
    }
  }
}