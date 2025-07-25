import { logger } from "../../logger";
import { 
  Scene, 
  SceneInput, 
  RenderConfig, 
  OrientationEnum,
  Caption,
  MusicForVideo
} from "../../types/shorts";
// Local interface for audio results that matches what's expected by Scene
interface LocalAudioResult {
  url: string;
  audioUrl: string; // Alias for REST API compatibility  
  duration: number;
  captions: Caption[];
  subtitles: Caption[]; // Alias for backward compatibility
}
import { VideoContentManager } from "./VideoContentManager";
import { TTSManager } from "./TTSManager";
import { VideoStatusManager } from "../VideoStatusManager";
import cuid from "cuid";
import path from "path";
import fs from "fs-extra";
import { Config } from "../../config";
import { cleanSceneText, splitTextByPunctuation } from "../utils/textCleaner";

export class SceneManager {
  private videoProcessor: VideoContentManager;
  private ttsManager: TTSManager;
  private statusManager: VideoStatusManager;
  private globalConfig: Config;

  constructor(
    videoProcessor: VideoContentManager,
    ttsManager: TTSManager,
    statusManager: VideoStatusManager,
    globalConfig: Config
  ) {
    this.videoProcessor = videoProcessor;
    this.ttsManager = ttsManager;
    this.statusManager = statusManager;
    this.globalConfig = globalConfig;
  }

  public async processScenes(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig
  ): Promise<{ remotionData: any, updatedScriptScenes: SceneInput[] }> {
    logger.info({ videoId, sceneCount: inputScenes.length }, "Processing scenes");
    
    const orientation: OrientationEnum = config.orientation || OrientationEnum.portrait;
    const remotionDataNested: Scene[][] = [];
    const newScriptScenes: SceneInput[] = [];

    await this.statusManager.setProgress(videoId, 15, "Processing scenes...");

    // Process each scene
    for (let sceneIndex = 0; sceneIndex < inputScenes.length; sceneIndex++) {
      const scene: SceneInput = inputScenes[sceneIndex];
      const sceneParts: Scene[] = [];
      
      logger.info({ videoId, sceneIndex, text: scene.text }, "Processing scene");

      // Handle videos for the scene
      let videoUrls: string[] = [];
      if (scene.videos && scene.videos.length > 0) {
        // Use existing videos
        videoUrls = scene.videos;
      } else {
        // Download new videos based on search terms
        try {
          videoUrls = await this.videoProcessor.downloadAndProcessVideos(
            scene.searchTerms || [scene.text],
            orientation,
            3
          );
        } catch (error) {
          logger.error({ 
            sceneIndex, 
            searchTerms: scene.searchTerms || [scene.text], 
            error 
          }, "Failed to download videos for scene, using fallback");
          
          // Try one more time with very generic terms as final fallback
          try {
            logger.warn({ sceneIndex }, "Attempting final fallback with generic terms");
            videoUrls = await this.videoProcessor.downloadAndProcessVideos(
              ['nature', 'landscape'],
              orientation,
              1
            );
          } catch (fallbackError) {
            logger.error({ 
              sceneIndex, 
              fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
              originalError: error instanceof Error ? error.message : String(error)
            }, "All video search attempts failed, using emergency placeholder");
            
            // Emergency fallback: create placeholder video URLs
            // This prevents the entire pipeline from failing
            videoUrls = this.createPlaceholderVideoUrls(1);
            
            logger.warn({ 
              sceneIndex, 
              placeholderUrls: videoUrls 
            }, "Using placeholder video URLs to prevent pipeline failure");
          }
        }
      }

      // Prepare text for TTS
      const textParts = this.prepareTextForTTS(scene.text);
      
      // Generate audio for the scene
      const audioData = await this.generateAudioForScene(
        videoId, 
        scene, 
        textParts, 
        config
      );

      // Final safety check - ensure we have video URLs
      if (!videoUrls || videoUrls.length === 0) {
        logger.error({ 
          sceneIndex, 
          videoUrls, 
          searchTerms: scene.searchTerms || [scene.text] 
        }, "No video URLs available after all fallback attempts");
        throw new Error(`No video URLs available for scene ${sceneIndex} after all fallback attempts`);
      }

      // Filter out any null/undefined URLs and log the state
      const validVideoUrls = videoUrls.filter(url => url && typeof url === 'string' && url.trim() !== '');
      
      logger.info({ 
        sceneIndex, 
        originalVideoUrlsLength: videoUrls.length, 
        validVideoUrlsLength: validVideoUrls.length,
        textPartsLength: textParts.length,
        videoUrls: videoUrls.slice(0, 3), // Log first 3 URLs for debugging
        validVideoUrls: validVideoUrls.slice(0, 3)
      }, "Processing scene parts with video URLs");

      if (validVideoUrls.length === 0) {
        logger.error({ 
          sceneIndex, 
          originalVideoUrls: videoUrls,
          searchTerms: scene.searchTerms || [scene.text] 
        }, "All video URLs are invalid after filtering");
        throw new Error(`All video URLs are invalid for scene ${sceneIndex}`);
      }

      // Create scene parts with audio and video using improved assignment
      const assignedVideoUrls = await this.assignUniqueVideosToSceneParts(
        validVideoUrls,
        textParts,
        scene.searchTerms || [scene.text],
        orientation,
        sceneIndex
      );

      for (let i = 0; i < textParts.length; i++) {
        let videoUrl = assignedVideoUrls[i];
        
        // Handle null/invalid video URLs with fallback
        if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim() === '') {
          logger.warn({ 
            sceneIndex, 
            partIndex: i, 
            originalVideoUrl: videoUrl, 
            assignedVideoUrls,
            textPartsLength: textParts.length
          }, "Invalid video URL detected, applying fallback");
          
          // Fallback 1: Use any available valid video from the assigned list
          const validVideoFromAssigned = assignedVideoUrls.find(url => 
            url && typeof url === 'string' && url.trim() !== ''
          );
          
          if (validVideoFromAssigned) {
            videoUrl = validVideoFromAssigned;
            logger.info({ 
              sceneIndex, 
              partIndex: i, 
              fallbackVideo: videoUrl 
            }, "Using valid video from assigned list as fallback");
          } else {
            // Fallback 2: Use any valid video from the original validVideoUrls
            const fallbackVideo = validVideoUrls.find(url => 
              url && typeof url === 'string' && url.trim() !== ''
            );
            
            if (fallbackVideo) {
              videoUrl = fallbackVideo;
              logger.info({ 
                sceneIndex, 
                partIndex: i, 
                fallbackVideo: videoUrl 
              }, "Using valid video from original list as fallback");
            } else {
              // Fallback 3: Create emergency placeholder
              logger.error({ 
                sceneIndex, 
                partIndex: i, 
                assignedVideoUrls,
                validVideoUrls
              }, "No valid videos available, creating emergency placeholder");
              
              const placeholderUrls = this.createPlaceholderVideoUrls(1);
              videoUrl = placeholderUrls[0];
              
              logger.warn({ 
                sceneIndex, 
                partIndex: i, 
                placeholderUrl: videoUrl 
              }, "Using emergency placeholder video");
            }
          }
        }
        
        // Final validation
        if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim() === '') {
          logger.error({ 
            sceneIndex, 
            partIndex: i, 
            videoUrl, 
            assignedVideoUrls,
            validVideoUrls,
            textPartsLength: textParts.length
          }, "Still no valid video URL after all fallbacks");
          throw new Error(`No valid video URL available for scene ${sceneIndex}, part ${i} after all fallback attempts`);
        }

        sceneParts.push({
          id: cuid(),
          text: textParts[i],
          searchTerms: scene.searchTerms,
          duration: audioData[i].duration,
          orientation,
          captions: audioData[i].captions,
          videos: [videoUrl],
          audio: { 
            url: audioData[i].url, 
            duration: audioData[i].duration 
          }
        });
      }

      remotionDataNested.push(sceneParts);
      
      // Update scene with processed data
      const updatedScene = {
        ...scene,
        videos: videoUrls,
        audio: audioData[0] // Store first audio part reference
      };
      newScriptScenes.push(updatedScene);

      await this.statusManager.setProgress(
        videoId, 
        15 + (sceneIndex + 1) * 50 / inputScenes.length, 
        `Processed scene ${sceneIndex + 1} of ${inputScenes.length}`
      );
    }

    await this.statusManager.setProgress(videoId, 70, "Finalizing scene data...");

    // Calculate total duration
    const totalDuration = remotionDataNested.flat().reduce((acc: number, s: any) => acc + s.duration, 0);

    return {
      remotionData: {
        scenes: remotionDataNested.flat(),
        config: {
          ...config,
          durationMs: totalDuration * 1000,
          port: this.globalConfig.port,
        },
      },
      updatedScriptScenes: newScriptScenes
    };
  }

  public async processReRenderScenes(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig
  ): Promise<{ remotionData: any, updatedScriptScenes: SceneInput[] }> {
    logger.info({ videoId, configReceived: !!config }, "[RE-RENDER] Processing scenes with existing assets preservation.");
    
    // Validate config parameter
    if (!config) {
      logger.error({ videoId, inputScenes: inputScenes?.length }, "Config parameter is undefined in processReRenderScenes");
      throw new Error("Configuration is required for re-rendering scenes");
    }
    
    const orientation: OrientationEnum = config.orientation || OrientationEnum.portrait;
    const remotionDataNested: Scene[][] = [];
    const newScriptScenes: SceneInput[] = [];

    await this.statusManager.setProgress(videoId, 15, "Processing scenes for re-render...");

    // Process each scene without revalidating videos
    for (let sceneIndex = 0; sceneIndex < inputScenes.length; sceneIndex++) {
      const scene: SceneInput = JSON.parse(JSON.stringify(inputScenes[sceneIndex]));
      
      logger.debug({ videoId, sceneIndex }, "Re-render: Processing scene with existing videos");

      // Use existing videos
      const videoUrls = scene.videos || [];

      await this.statusManager.setProgress(
        videoId, 
        20 + (sceneIndex * 40 / inputScenes.length), 
        "Processing audio for re-render..."
      );

      // Check for existing audio or generate new
      let audioData: LocalAudioResult[];
      
      if (scene.audio && scene.audio.url && scene.audio.duration) {
        // Use existing audio
        logger.debug({ videoId, sceneIndex }, "Re-render: Using existing audio");
        const sceneAudio = scene.audio as any;
        const existingCaptions = sceneAudio.captions || [];
        audioData = [{
          url: sceneAudio.url,
          audioUrl: sceneAudio.url,
          duration: sceneAudio.duration,
          captions: existingCaptions,
          subtitles: existingCaptions
        }];
      } else {
        // Generate new audio
        logger.debug({ videoId, sceneIndex }, "Re-render: Generating new audio");
        const textParts = [scene.text]; // Don't split text in re-render
        audioData = await this.generateAudioForScene(videoId, scene, textParts, config);
      }

      // Create scene parts
      const sceneParts: Scene[] = [];
      const videoUrl = videoUrls[0];
      if (!videoUrl) {
        throw new Error(`Missing video URL for scene ${sceneIndex} in re-render`);
      }
      
      // Validate audio duration
      const audioDuration = audioData[0].duration;
      if (!audioDuration || audioDuration <= 0 || isNaN(audioDuration)) {
        logger.error({ 
          videoId, 
          sceneIndex, 
          audioDuration,
          text: scene.text
        }, "Invalid audio duration detected in re-render");
        throw new Error(`Invalid audio duration for scene ${sceneIndex}: ${audioDuration}`);
      }

      sceneParts.push({
        id: cuid(),
        text: scene.text,
        searchTerms: scene.searchTerms,
        duration: audioDuration,
        orientation,
        captions: audioData[0].captions,
        videos: [videoUrl],
        audio: { url: audioData[0].url, duration: audioDuration }
      });
      
      remotionDataNested.push(sceneParts);
      newScriptScenes.push(scene);
    }

    await this.statusManager.setProgress(videoId, 70, "Finalizing re-render data...");

    // Calculate total duration
    const totalDuration = remotionDataNested.flat().reduce((acc: number, s: any) => acc + s.duration, 0);

    return {
      remotionData: {
        scenes: remotionDataNested.flat(),
        config: {
          ...config,
          durationMs: totalDuration * 1000,
          port: this.globalConfig.port,
        },
      },
      updatedScriptScenes: newScriptScenes
    };
  }

  private prepareTextForTTS(text: string): string[] {
    const cleanedText = cleanSceneText(text);
    return splitTextByPunctuation(cleanedText);
  }

  private async generateAudioForScene(
    videoId: string,
    scene: SceneInput,
    textParts: string[],
    config: RenderConfig
  ): Promise<LocalAudioResult[]> {
    const audioData: LocalAudioResult[] = [];

    for (let i = 0; i < textParts.length; i++) {
      const text = textParts[i];
      
      try {
        const result = await this.ttsManager.getCachedOrGenerateTTS(
          text, 
          config, 
          scene.forceRegenerate
        );

        const audioUrl = `/temp/${path.basename(result.audioPath)}`;
        
        const mappedCaptions = (result.subtitles || []).map(sub => ({
          text: sub.text,
          startMs: sub.start * 1000,
          endMs: sub.end * 1000
        }));
        
        audioData.push({
          url: audioUrl,
          audioUrl: audioUrl,
          duration: result.duration,
          captions: mappedCaptions,
          subtitles: mappedCaptions
        });

        logger.debug({ 
          videoId, 
          partIndex: i, 
          text, 
          duration: result.duration 
        }, "Generated audio for text part");

      } catch (error) {
        logger.error({ 
          videoId, 
          text, 
          error 
        }, "Failed to generate audio for scene part");
        throw error;
      }
    }

    return audioData;
  }

  public async generateSingleTTSAndUpdate(
    videoId: string, 
    sceneId: string, 
    text: string, 
    config: RenderConfig, 
    forceRegenerate: boolean = false
  ): Promise<LocalAudioResult> {
    logger.info({ videoId, sceneId, text }, "Generating single TTS for scene");

    const result = await this.ttsManager.getCachedOrGenerateTTS(
      text,
      config,
      forceRegenerate
    );

    const audioUrl = `/temp/${path.basename(result.audioPath)}`;

    // Update the render.json file
    const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
    try {
      await fs.access(renderJsonPath);
      const renderData = await fs.readJson(renderJsonPath);
      const scene = renderData.scenes.find((s: any) => s.id === sceneId);
      
      if (scene) {
        scene.audio = {
          url: audioUrl,
          duration: result.duration
        };
        scene.duration = result.duration;
        scene.captions = result.subtitles;
        
        await fs.writeJson(renderJsonPath, renderData, { spaces: 2 });
        logger.info({ videoId, sceneId }, "Updated render.json with new audio data");
      }
    } catch (error) {
      logger.debug({ videoId, sceneId, error }, "Render.json not found or invalid, skipping update");
    }

    const mappedCaptions = (result.subtitles || []).map(sub => ({
      text: sub.text,
      startMs: sub.start * 1000,
      endMs: sub.end * 1000
    }));
    
    return {
      url: audioUrl,
      audioUrl: audioUrl,
      duration: result.duration,
      captions: mappedCaptions,
      subtitles: mappedCaptions
    };
  }

  public detectChanges(originalData: any, newData: any): {
    textChanges: Array<{ sceneId: string; oldText: string; newText: string }>;
    videoChanges: Array<{ sceneId: string; oldVideos: string[]; newVideos: string[] }>;
    configChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
    hasChanges: boolean;
  } {
    const textChanges: Array<{ sceneId: string; oldText: string; newText: string }> = [];
    const videoChanges: Array<{ sceneId: string; oldVideos: string[]; newVideos: string[] }> = [];

    // Compare scenes
    if (originalData.scenes && newData.scenes) {
      originalData.scenes.forEach((originalScene: any, index: number) => {
        const newScene = newData.scenes[index];
        if (!newScene) return;

        // Check text changes
        if (originalScene.text !== newScene.text) {
          textChanges.push({
            sceneId: originalScene.id,
            oldText: originalScene.text,
            newText: newScene.text
          });
        }

        // Check video changes
        const originalVideos = originalScene.videos || [];
        const newVideos = newScene.videos || [];
        
        if (JSON.stringify(originalVideos) !== JSON.stringify(newVideos)) {
          videoChanges.push({
            sceneId: originalScene.id,
            oldVideos: originalVideos,
            newVideos: newVideos
          });
        }
      });
    }

    const configChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
    
    return {
      textChanges,
      videoChanges,
      configChanges,
      hasChanges: textChanges.length > 0 || videoChanges.length > 0 || configChanges.length > 0
    };
  }

  /**
   * Assign unique videos to scene parts, avoiding repetition when possible
   */
  private async assignUniqueVideosToSceneParts(
    availableVideoUrls: string[],
    textParts: string[],
    searchTerms: string[],
    orientation: OrientationEnum,
    sceneIndex: number
  ): Promise<string[]> {
    const assignedUrls: string[] = [];
    const usedUrls = new Set<string>();

    logger.info({ 
      sceneIndex,
      availableVideos: availableVideoUrls.length,
      textParts: textParts.length,
      searchTerms
    }, "Starting video assignment for scene parts");

    // Strategy 1: If we have enough videos, assign unique ones
    if (availableVideoUrls.length >= textParts.length) {
      for (let i = 0; i < textParts.length; i++) {
        // Find the first unused video
        const availableVideo = availableVideoUrls.find(url => 
          url && typeof url === 'string' && url.trim() !== '' && !usedUrls.has(url)
        );
        if (availableVideo) {
          assignedUrls.push(availableVideo);
          usedUrls.add(availableVideo);
        } else {
          // Fallback if something goes wrong - ensure we don't assign null/undefined
          const fallbackVideo = availableVideoUrls.find(url => 
            url && typeof url === 'string' && url.trim() !== ''
          );
          if (fallbackVideo) {
            assignedUrls.push(fallbackVideo);
          } else {
            logger.error({ 
              sceneIndex,
              availableVideoUrls,
              i,
              textPartsLength: textParts.length 
            }, "No valid video available even for fallback in unique assignment");
            // Create emergency placeholder
            const placeholderUrls = this.createPlaceholderVideoUrls(1);
            assignedUrls.push(placeholderUrls[0]);
          }
        }
      }

      logger.info({ 
        sceneIndex,
        strategy: 'unique_assignment',
        assignedCount: assignedUrls.length,
        uniqueCount: usedUrls.size,
        assignedUrls: assignedUrls.slice(0, 3) // Log first 3 for debugging
      }, "Assigned unique videos to all parts");

      return assignedUrls;
    }

    // Strategy 2: Try to get more videos to fill the gap
    const neededVideos = textParts.length - availableVideoUrls.length;
    logger.info({ 
      sceneIndex,
      availableVideos: availableVideoUrls.length,
      neededVideos,
      textParts: textParts.length
    }, "Need more videos, attempting to fetch additional ones");

    try {
      // Try to get additional videos with the same search terms
      const additionalVideos = await this.videoProcessor.downloadAndProcessVideos(
        searchTerms,
        orientation,
        neededVideos
      );

      // Filter out videos we already have
      const newUniqueVideos = additionalVideos.filter(url => 
        !availableVideoUrls.includes(url) && !usedUrls.has(url)
      );

      const allAvailableVideos = [...availableVideoUrls, ...newUniqueVideos];

      logger.info({ 
        sceneIndex,
        additionalVideosFound: additionalVideos.length,
        newUniqueVideos: newUniqueVideos.length,
        totalAvailableNow: allAvailableVideos.length
      }, "Successfully fetched additional videos");

      // Now assign videos with the expanded pool
      for (let i = 0; i < textParts.length; i++) {
        const availableVideo = allAvailableVideos.find(url => 
          url && typeof url === 'string' && url.trim() !== '' && !usedUrls.has(url)
        );
        if (availableVideo) {
          assignedUrls.push(availableVideo);
          usedUrls.add(availableVideo);
        } else {
          // Fallback to cycling through available videos - ensure valid URL
          const fallbackVideo = allAvailableVideos.find(url => 
            url && typeof url === 'string' && url.trim() !== ''
          );
          if (fallbackVideo) {
            assignedUrls.push(fallbackVideo);
          } else {
            logger.error({ 
              sceneIndex,
              allAvailableVideos,
              i,
              textPartsLength: textParts.length 
            }, "No valid video available in expanded pool");
            // Create emergency placeholder
            const placeholderUrls = this.createPlaceholderVideoUrls(1);
            assignedUrls.push(placeholderUrls[0]);
          }
        }
      }

      logger.info({ 
        sceneIndex,
        strategy: 'expanded_unique_assignment',
        assignedCount: assignedUrls.length,
        uniqueCount: usedUrls.size,
        totalAvailable: allAvailableVideos.length
      }, "Assigned videos with expanded pool");

      return assignedUrls;

    } catch (error) {
      logger.warn({ 
        sceneIndex,
        error: error instanceof Error ? error.message : String(error),
        searchTerms
      }, "Failed to fetch additional videos, using smart fallback strategy");

      // Strategy 3: Smart fallback - distribute existing videos optimally
      return this.distributeVideosOptimally(availableVideoUrls, textParts.length, sceneIndex);
    }
  }

  /**
   * Distribute available videos optimally across text parts to minimize repetition
   */
  private distributeVideosOptimally(
    availableVideoUrls: string[],
    textPartsCount: number,
    sceneIndex: number
  ): string[] {
    const assignedUrls: string[] = [];

    logger.info({ 
      sceneIndex,
      availableVideos: availableVideoUrls.length,
      textParts: textPartsCount
    }, "Using optimal distribution strategy");

    // Calculate optimal distribution
    const videosPerPart = Math.floor(textPartsCount / availableVideoUrls.length);
    const extraParts = textPartsCount % availableVideoUrls.length;

    // Create a distribution plan
    const distributionPlan: string[] = [];
    
    for (let videoIndex = 0; videoIndex < availableVideoUrls.length; videoIndex++) {
      const videoUrl = availableVideoUrls[videoIndex];
      const repetitions = videosPerPart + (videoIndex < extraParts ? 1 : 0);
      
      for (let rep = 0; rep < repetitions; rep++) {
        distributionPlan.push(videoUrl);
      }
    }

    // Shuffle the distribution to avoid consecutive repetitions
    const shuffledPlan = this.shuffleArray(distributionPlan);

    // Assign to text parts with null checking
    for (let i = 0; i < textPartsCount; i++) {
      let videoUrl = shuffledPlan[i];
      
      // If shuffled plan doesn't have a valid URL, use fallback
      if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim() === '') {
        const fallbackVideo = availableVideoUrls.find(url => 
          url && typeof url === 'string' && url.trim() !== ''
        );
        if (fallbackVideo) {
          videoUrl = fallbackVideo;
        } else {
          logger.error({ 
            sceneIndex,
            availableVideoUrls,
            shuffledPlan,
            i
          }, "No valid video available in optimal distribution");
          // Create emergency placeholder
          const placeholderUrls = this.createPlaceholderVideoUrls(1);
          videoUrl = placeholderUrls[0];
        }
      }
      
      assignedUrls.push(videoUrl);
    }

    // Log the distribution for debugging
    const distributionStats = this.calculateDistributionStats(assignedUrls);
    logger.info({ 
      sceneIndex,
      strategy: 'optimal_distribution',
      distributionStats,
      assignedCount: assignedUrls.length
    }, "Applied optimal video distribution");

    return assignedUrls;
  }

  /**
   * Calculate distribution statistics for logging
   */
  private calculateDistributionStats(assignedUrls: string[]): Record<string, number> {
    const stats: Record<string, number> = {};
    
    assignedUrls.forEach(url => {
      const shortUrl = url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('/') + 20);
      stats[shortUrl] = (stats[shortUrl] || 0) + 1;
    });

    return stats;
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Creates placeholder video URLs as emergency fallback
   * This prevents the entire pipeline from failing when no videos can be found
   */
  private createPlaceholderVideoUrls(count: number): string[] {
    const placeholderUrls: string[] = [];
    
    // Try to use local placeholder video if available
    const placeholderVideoPath = path.join(process.cwd(), 'static', 'placeholder', 'default-video.mp4');
    
    if (fs.existsSync(placeholderVideoPath)) {
      const placeholderUrl = `/static/placeholder/default-video.mp4`;
      for (let i = 0; i < count; i++) {
        placeholderUrls.push(placeholderUrl);
      }
      logger.info({ placeholderUrl, count }, "Using local placeholder video");
    } else {
      // Generate solid color video URLs as absolute fallback
      const colors = ['#000000', '#333333', '#666666', '#999999', '#CCCCCC'];
      for (let i = 0; i < count; i++) {
        const color = colors[i % colors.length];
        // This creates a reference to a solid color background that can be handled by the renderer
        const solidColorUrl = `data:color/${color.substring(1)}`;
        placeholderUrls.push(solidColorUrl);
      }
      logger.info({ colors: colors.slice(0, count), count }, "Using solid color placeholders");
    }
    
    return placeholderUrls;
  }
}