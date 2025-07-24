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
        videoUrls = await this.videoProcessor.downloadAndProcessVideos(
          scene.searchTerms || [scene.text],
          orientation,
          3
        );
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

      // Create scene parts with audio and video
      for (let i = 0; i < textParts.length; i++) {
        const videoIndex = i % videoUrls.length;
        const videoUrl = videoUrls[videoIndex];
        
        if (!videoUrl) {
          throw new Error(`No video URL available for scene ${sceneIndex}, part ${i}`);
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
    logger.info({ videoId }, "[RE-RENDER] Processing scenes with existing assets preservation.");
    
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
}