import { OrientationEnum, MusicMoodEnum, VoiceEnum, Video, ShortResult, AudioResult, SceneInput, RenderConfig, Scene, MusicTag, MusicForVideo, Caption, ShortQueue } from "../types/shorts";
import fs from "fs-extra";
import { promises as fsPromises } from "fs";
import cuid from "cuid";
import path from "path";
import { execSync, spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import * as crypto from 'crypto';

import { Remotion } from "./libraries/Remotion";
import { FFMpeg } from "./libraries/FFmpeg";
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";
import { type Music } from "../types/shorts";
import { LocalTTS } from "./libraries/LocalTTS";
import { VideoSearch } from "./libraries/VideoSearch";
import { ThreadPool } from './libraries/ThreadPool';
import { VideoProcessor } from './libraries/VideoProcessor';
import { cleanSceneText, splitTextByPunctuation } from "./utils/textCleaner";
import { VideoProviderFacade } from "./libraries/VideoProviderFacade";
import { VideoStatus, VideoStatusManager, VideoStatusObject } from "./VideoStatusManager";
import { QueueItem } from "./types/QueueItem";
import { VideoCacheManager } from "./libraries/VideoCacheManager";

export class ShortCreator {
  private bundled: string;
  private globalConfig: Config;
  private videoSearch: VideoSearch;
  private videoProviderFacade: VideoProviderFacade;
  private localTTS: LocalTTS;
  private remotion: Remotion;
  private statusManager: VideoStatusManager;
  private ffmpeg: FFMpeg;
  private outputDir: string;
  private musicManager: MusicManager;
  private videoCacheManager: VideoCacheManager;

  // Progress throttling
  private lastProgressUpdate: Map<string, number> = new Map();

  // Filas de processamento
  private creationQueue: QueueItem[] = [];
  private renderQueue: string[] = [];
  private isProcessingCreation = false;
  private isProcessingRender = false;

  // Adicionar mapas para tracking de tempo
  private progressUpdateTimes = new Map<string, number>();
  private renderStartTimes = new Map<string, number>();

  constructor(
    bundled: string,
    globalConfig: Config,
    remotion: Remotion,
    ffmpeg: FFMpeg,
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
    this.videoSearch = new VideoSearch(videoProviderFacade);
    this.musicManager = new MusicManager(globalConfig);
    this.outputDir = path.join(this.globalConfig.dataDirPath, "temp");
    fs.ensureDirSync(this.outputDir);
    this.videoCacheManager = new VideoCacheManager(globalConfig);
  }

  /**
   * Garante que a URL seja absoluta para o contexto do Remotion
   * Usa o sistema de resolução agnóstico à porta
   */
  private ensureAbsoluteUrl(url: string | undefined | null): string {
    if (!url) {
      throw new Error("URL cannot be undefined or null");
    }
    if (url.startsWith('http')) {
      return url;
    }
    
    // Use o sistema de resolução agnóstico à porta
    // Para o contexto do Remotion, precisamos de URLs absolutas
    const resolvedUrl = this.resolveUrlForRemotionContext(url);
    
    logger.debug({ originalUrl: url, resolvedUrl, port: this.globalConfig.port }, "URL resolved for Remotion context");
    return resolvedUrl;
  }

  /**
   * Resolve URLs especificamente para o contexto do Remotion
   */
  private resolveUrlForRemotionContext(path: string): string {
    // Normalizar o path
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    // Para o Remotion, sempre usar URLs absolutas com a porta configurada
    return `http://localhost:${this.globalConfig.port}${normalizedPath}`;
  }

  /**
   * Pré-processa os dados do vídeo para converter URLs relativas em absolutas
   * Isso garante que o Remotion sempre tenha URLs corretas independente da porta
   */
  private preprocessVideoDataForRemotionRendering(videoData: any): any {
    const processedData = JSON.parse(JSON.stringify(videoData)); // Deep clone
    
    logger.debug({ videoId: 'preprocessing' }, "Starting video data preprocessing for Remotion");
    
    // Processar URLs de áudio nas cenas
    if (processedData.scenes) {
      processedData.scenes.forEach((scene: any, sceneIndex: number) => {
        if (scene.audio && scene.audio.url) {
          const originalUrl = scene.audio.url;
          
          // Validar se o arquivo de áudio existe para URLs locais
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
            } else {
              logger.debug({ 
                sceneIndex, 
                originalUrl, 
                localPath,
                exists: true,
                fileSize: fs.statSync(localPath).size
              }, "Audio file validated during preprocessing");
            }
          }
          
          // Se a URL não é absoluta, convertê-la
          if (!originalUrl.startsWith('http')) {
            scene.audio.url = this.resolveUrlForRemotionContext(originalUrl);
            logger.debug({ 
              sceneIndex,
              originalUrl, 
              processedUrl: scene.audio.url 
            }, "Preprocessed audio URL for Remotion");
          }
          
          // Validar duração do áudio
          if (!scene.audio.duration || scene.audio.duration <= 0 || isNaN(scene.audio.duration)) {
            logger.error({ 
              sceneIndex, 
              audioDuration: scene.audio.duration 
            }, "Invalid audio duration during preprocessing");
            throw new Error(`Invalid audio duration for scene ${sceneIndex}: ${scene.audio.duration}`);
          }
        } else {
          logger.warn({ sceneIndex }, "Scene missing audio data during preprocessing");
        }
        
        // Processar URLs de vídeo nas cenas
        if (scene.videos) {
          // Filter out null/undefined values first
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
        } else {
          logger.warn({ sceneIndex }, "Scene missing videos during preprocessing");
        }
      });
    }
    
    // Processar URL da música
    if (processedData.music && processedData.music.url) {
      const originalMusicUrl = processedData.music.url;
      if (!originalMusicUrl.startsWith('http')) {
        processedData.music.url = this.resolveUrlForRemotionContext(originalMusicUrl);
        logger.debug({ 
          originalUrl: originalMusicUrl, 
          processedUrl: processedData.music.url 
        }, "Preprocessed music URL for Remotion");
      }
    }
    
    // Validar estrutura final dos dados
    if (!processedData.scenes || processedData.scenes.length === 0) {
      throw new Error("No scenes found in video data");
    }
    
    if (!processedData.config) {
      throw new Error("No config found in video data");
    }
    
    logger.info({ 
      sceneCount: processedData.scenes.length,
      orientation: processedData.config.orientation,
      duration: processedData.config.durationInSec
    }, "Video data preprocessing completed successfully");
    
    return processedData;
  }

  public processTextForTTS(text: string): string[] {
    const cleanedText = cleanSceneText(text);
    return this.splitTextIntoScenes(cleanedText);
  }

  public async status(id: string): Promise<VideoStatusObject> {
    const status = await this.statusManager.getStatus(id);
    
    // Se o vídeo já existe, atualiza o status para "ready" independentemente do status atual
    if (fs.existsSync(this.getVideoPath(id))) {
      if (status.status !== 'ready') {
        await this.statusManager.setStatus(id, "ready");
        return { status: "ready" };
      }
      return status;
    }
    
    // Se o status não é pending, retorna o status atual
    if (status.status !== 'pending') {
      return status;
    }
    
    return { status: "failed", error: "Video file not found and no status was recorded." };
  }

  public addToQueue(
    sceneInput: SceneInput[],
    config: RenderConfig,
  ): string {
    const videoId = cuid();
    logger.info({ videoId, sceneCount: sceneInput.length }, "Adding video to creation queue");

    // Define o status inicial como "pending" imediatamente
    this.statusManager.setStatus(videoId, "pending", "Video added to queue", 0, "Queued").catch(error => {
      logger.error({ videoId, error }, "Failed to set initial status");
    });

    this.creationQueue.push({
      id: videoId,
      sceneInput: sceneInput,
      config,
      status: "pending"
    });

    this.processCreationQueue();
    return videoId;
  }

  private async processCreationQueue(): Promise<void> {
    if (this.isProcessingCreation || this.creationQueue.length === 0) return;
    this.isProcessingCreation = true;

    const item = this.creationQueue.shift();
    if (!item) {
      this.isProcessingCreation = false;
      return;
    }
    
    try {
      await this.prepareAndRender(item);
    } catch (error) {
      logger.error({ videoId: item.id, error }, "Error in creation pipeline");
      } finally {
      this.isProcessingCreation = false;
      this.processCreationQueue();
    }
  }

  private async prepareAndRender(queueItem: QueueItem): Promise<void> {
    const videoId = queueItem.id;

    try {
      // Define o status como "processing" no início
      await this.statusManager.setStatus(videoId, "processing", "Starting video preparation...", 0, "Initializing");
      
      // Salva o script do vídeo
      const scriptData = {
        id: videoId,
        scenes: queueItem.sceneInput,
        config: queueItem.config,
        createdAt: new Date().toISOString(),
        status: "processing"
      };
      
      const scriptPath = path.join(this.globalConfig.videosDirPath, `${videoId}.script.json`);
      try {
        fs.ensureDirSync(path.dirname(scriptPath));
        fs.writeJsonSync(scriptPath, scriptData, { spaces: 2 });
        logger.info({ videoId }, "Saved video script");
      } catch (error) {
        logger.error({ videoId, error }, "Error saving video script");
      }

      // Processa as cenas e gera os dados para renderização
      await this.statusManager.setProgress(videoId, 10, "Processing scenes...");
      const { remotionData, updatedScriptScenes } = await this.processScenes(videoId, queueItem.sceneInput, queueItem.config);

      // Salva os dados processados no .render.json
      const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
      fs.writeJsonSync(renderJsonPath, remotionData, { spaces: 2 });
      
      // Atualiza o script com as cenas processadas
      scriptData.scenes = updatedScriptScenes;
      fs.writeJsonSync(scriptPath, scriptData, { spaces: 2 });
      
      logger.info({ videoId }, "Video data prepared, adding to render queue");
      
      // Adiciona à fila de renderização
      if (!this.renderQueue.includes(videoId)) {
        this.renderQueue.push(videoId);
      }
      
      // Inicia o processamento da fila de renderização
      this.processRenderQueue();
      
    } catch (error: any) {
      logger.error({ videoId, error }, "Error in prepareAndRender");
      await this.statusManager.setError(videoId, error.message || "Failed to prepare video");
    }
  }

  private async processScenes(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig
  ): Promise<{ remotionData: any, updatedScriptScenes: SceneInput[] }> {
    const orientation: OrientationEnum = config.orientation || OrientationEnum.portrait;
    const excludeVideoIds: string[] = [];
    const remotionDataNested: Scene[][] = [];
    const newScriptScenes: SceneInput[] = [];
    const allVideoUrls: string[] = [];

    await this.statusManager.setProgress(videoId, 15, "Finding videos for scenes...");

    // FASE 1: Encontrar todos os vídeos primeiro (sem processar áudio ainda)
    const scenesWithVideos: { scene: SceneInput; videos: Video[] }[] = [];
    
    for (const originalScene of inputScenes) {
      const scene: SceneInput = JSON.parse(JSON.stringify(originalScene));
      let finalVideos: Video[];

      if (scene.videos && scene.videos.length > 0 && scene.videos.every(v => v)) {
        logger.debug({ videoId, sceneIndex: inputScenes.indexOf(originalScene) }, "Re-render: Using pre-defined videos.");
        
        // Tenta usar vídeos pré-definidos, mas faz fallback para busca nova se não encontrar
        try {
          const videoResults = await Promise.all(
            scene.videos.map(async (videoUrl) => {
              try {
                return await this.videoSearch.getVideoByUrl(videoUrl);
              } catch (error) {
                logger.warn({ 
                  videoId, 
                  sceneIndex: inputScenes.indexOf(originalScene), 
                  videoUrl, 
                  error 
                }, "Pre-defined video not found, will search for new video.");
                return null; // Retorna null para indicar que precisa buscar novo vídeo
              }
            })
          );
          
          // Se algum vídeo não foi encontrado, remove os nulls e busca novos vídeos
          const validVideos = videoResults.filter((v): v is Video => v !== null);
          const missingCount = videoResults.length - validVideos.length;
          
          if (missingCount > 0) {
            logger.info({ 
              videoId, 
              sceneIndex: inputScenes.indexOf(originalScene),
              validVideos: validVideos.length,
              missingCount 
            }, "Some pre-defined videos not found, searching for replacements.");
            
            // Busca vídeos para substituir os que não foram encontrados
            const searchTerms = scene.searchTerms.filter(term => term.length >= 4).join(" ") || scene.searchTerms.join(" ");
            const replacementVideos = await this.videoSearch.findVideos(
              searchTerms,
              10,
              excludeVideoIds,
              orientation,
              missingCount,
              videoId
            );
            
            // Combina vídeos válidos com os de substituição
            finalVideos = [...validVideos, ...replacementVideos];
            
            // Atualiza as URLs dos vídeos na cena, filtrando URLs vazias
            const validVideosForScene = finalVideos.filter(v => v && v.url);
            if (validVideosForScene.length === 0) {
              throw new Error(`No valid videos found for scene ${inputScenes.indexOf(originalScene)} after filtering. Original count: ${finalVideos.length}`);
            }
            scene.videos = validVideosForScene.map(v => v.url);
            finalVideos.forEach(video => video && excludeVideoIds.push(video.id));
          } else {
            // Todos os vídeos foram encontrados
            finalVideos = validVideos;
          }
        } catch (error) {
          logger.error({ 
            videoId, 
            sceneIndex: inputScenes.indexOf(originalScene), 
            error 
          }, "Error processing pre-defined videos, falling back to new search.");
          
          // Fallback completo para busca nova
          const searchTerms = scene.searchTerms.filter(term => term.length >= 4).join(" ") || scene.searchTerms.join(" ");
          finalVideos = await this.videoSearch.findVideos(
            searchTerms,
            10,
            excludeVideoIds,
            orientation,
            this.processTextForTTS(scene.text).length,
            videoId
          );
          const validVideosForScene = finalVideos.filter(v => v && v.url);
          if (validVideosForScene.length === 0) {
            throw new Error(`No valid videos found for scene ${inputScenes.indexOf(originalScene)} after filtering. Original count: ${finalVideos.length}`);
          }
          scene.videos = validVideosForScene.map(v => v.url);
          finalVideos.forEach(video => video && excludeVideoIds.push(video.id));
        }
      } else {
        logger.debug({ videoId, sceneIndex: inputScenes.indexOf(originalScene) }, "Creation: Searching for new videos.");
        const searchTerms =
          scene.searchTerms.filter(term => term.length >= 4).join(" ") || scene.searchTerms.join(" ");
        finalVideos = await this.videoSearch.findVideos(
          searchTerms,
          10,
          excludeVideoIds,
          orientation,
          this.processTextForTTS(scene.text).length,
          videoId
        );
        const validVideosForScene = finalVideos.filter(v => v && v.url);
        if (validVideosForScene.length === 0) {
          throw new Error(`No valid videos found for scene ${inputScenes.indexOf(originalScene)} after filtering. Original count: ${finalVideos.length}`);
        }
        scene.videos = validVideosForScene.map(v => v.url);
        finalVideos.forEach(video => video && excludeVideoIds.push(video.id));
      }

      const textParts = this.processTextForTTS(scene.text);
      if (finalVideos.length < textParts.length) {
        throw new Error(
          `Could not find enough videos for scene ${inputScenes.indexOf(originalScene)}. Found ${finalVideos.length}, needed ${textParts.length}.`,
        );
      }

      scenesWithVideos.push({ scene, videos: finalVideos });
      
      // Coletar todas as URLs de vídeo para pré-download
      finalVideos.forEach(video => {
        if (video.url && !allVideoUrls.includes(video.url)) {
          allVideoUrls.push(video.url);
        }
      });
    }

    await this.statusManager.setProgress(videoId, 25, "Starting video downloads and TTS generation...");

    // FASE 2: Iniciar downloads de vídeos em paralelo com geração de TTS
    logger.info({ videoId, videoCount: allVideoUrls.length }, "Starting parallel video preload");
    const videoDownloadPromise = this.videoCacheManager.preloadVideos(allVideoUrls);

    // FASE 3: Processar áudio para cada cena (em paralelo com downloads)
    const audioProcessingPromises = scenesWithVideos.map(async ({ scene }) => {
      const textParts = this.processTextForTTS(scene.text);
      return {
        scene,
        audioData: await this.generateAudioForScene(videoId, scene, textParts, config)
      };
    });

    // Aguardar tanto os downloads quanto o processamento de áudio
    const [cachedVideos, audioResults] = await Promise.all([
      videoDownloadPromise,
      Promise.all(audioProcessingPromises)
    ]);

    await this.statusManager.setProgress(videoId, 70, "Finalizing scene data...");

    // FASE 4: Combinar tudo e substituir URLs pelos proxies locais
    for (let sceneIndex = 0; sceneIndex < scenesWithVideos.length; sceneIndex++) {
      const { scene, videos: finalVideos } = scenesWithVideos[sceneIndex];
      const { audioData: sceneAudioData } = audioResults[sceneIndex];
      const textParts = this.processTextForTTS(scene.text);

      const sceneParts: Scene[] = [];
      for(let i = 0; i < textParts.length; i++) {
        const video = finalVideos[i];
        
        // Validação melhorada para detectar vídeos null
        if (!video || !video.url) {
          logger.error({ 
            videoId, 
            sceneIndex, 
            partIndex: i,
            textPart: textParts[i],
            finalVideosLength: finalVideos.length,
            textPartsLength: textParts.length,
            availableVideos: finalVideos.map((v, idx) => `${idx}: ${v?.url || 'NULL'}`).join(', ')
          }, "Empty video URL detected during scene processing");
          
          // Tentar usar outro vídeo da mesma cena como fallback
          const fallbackVideo = finalVideos.find(v => v && v.url);
          if (fallbackVideo) {
            logger.warn({ 
              videoId, 
              sceneIndex, 
              partIndex: i,
              fallbackUrl: fallbackVideo.url 
            }, "Using fallback video for null video URL");
            finalVideos[i] = fallbackVideo;
          } else {
            throw new Error(`No video available for part ${i} of scene ${sceneIndex}. Available videos: ${finalVideos.length}, text parts: ${textParts.length}`);
          }
        }
        
        // Continue with validation after fix
        const validatedVideo = finalVideos[i];
        if (!validatedVideo || !validatedVideo.url) {
          throw new Error(`No video for part ${i} of scene ${sceneIndex}`);
        }
        
        // Validate audio duration
        const audioDuration = sceneAudioData[i].duration;
        if (!audioDuration || audioDuration <= 0 || isNaN(audioDuration)) {
          logger.error({ 
        videoId, 
        sceneIndex, 
            partIndex: i, 
            audioDuration,
            text: textParts[i]
          }, "Invalid audio duration detected");
          throw new Error(`Invalid audio duration for part ${i} of scene ${sceneIndex}: ${audioDuration}`);
        }

        // Substituir URL do vídeo pelo proxy local se disponível
        const originalVideoUrl = validatedVideo.url;
        const cachedVideo = cachedVideos.get(originalVideoUrl);
        
        let finalVideoUrl = originalVideoUrl;
        if (cachedVideo) {
          finalVideoUrl = cachedVideo.proxyUrl || originalVideoUrl; // Fallback to original URL if proxyUrl is missing
          logger.debug({ 
            originalUrl: originalVideoUrl, 
            proxyUrl: cachedVideo.proxyUrl,
            finalVideoUrl: finalVideoUrl,
            size: cachedVideo.size 
          }, "Using cached video");
        } else {
          // Check if it's a localhost URL that failed
          const isLocalhostUrl = originalVideoUrl.includes('localhost');
          if (isLocalhostUrl) {
            logger.warn({ 
              originalUrl: originalVideoUrl 
            }, "Video not cached (localhost server not running), using original URL - rendering may fail");
          } else {
            logger.warn({ 
              originalUrl: originalVideoUrl 
            }, "Video not cached, using original URL");
          }
        }
        
        // Ensure finalVideoUrl is valid before adding to videos array
        if (!finalVideoUrl) {
          logger.error({
            videoId,
            sceneIndex,
            partIndex: i,
            validatedVideo,
            originalVideoUrl
          }, "Final video URL is null/undefined, this should not happen");
          throw new Error(`Final video URL is null for scene ${sceneIndex}, part ${i}`);
        }
        
        sceneParts.push({
          id: cuid(),
          text: textParts[i],
          searchTerms: scene.searchTerms,
          duration: audioDuration,
          orientation,
          captions: sceneAudioData[i].captions,
          videos: [finalVideoUrl], // Usar URL do proxy local se disponível
          audio: { url: sceneAudioData[i].url, duration: audioDuration }
        });
      }
      
      remotionDataNested.push(sceneParts);
      newScriptScenes.push(scene);
    }

    // Calcula a duração total e encontra a música
    const totalDuration = remotionDataNested.flat().reduce((acc: number, s: any) => acc + s.duration, 0);
    const music = this.findMusic(totalDuration, config.music);

    // Log estatísticas do cache
    const cacheStats = this.videoCacheManager.getCacheStats();
    logger.info({ 
      videoId, 
      totalVideos: allVideoUrls.length,
      cachedVideos: cachedVideos.size,
      cacheStats 
    }, "Video processing completed with cache statistics");

    // Cria o objeto remotionData com a estrutura correta desde o início
    const remotionData = {
      scenes: remotionDataNested.flat(),
      music,
      config: {
        ...config,
        durationMs: totalDuration * 1000,
        port: this.globalConfig.port,
      },
    };

    return {
      remotionData,
      updatedScriptScenes: newScriptScenes
    };
  }

    private async processReRenderScenes(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig
  ): Promise<{ remotionData: any, updatedScriptScenes: SceneInput[] }> {
    logger.info({ videoId }, "[RE-RENDER] Processing scenes with existing assets preservation.");
    
    const orientation: OrientationEnum = config.orientation || OrientationEnum.portrait;
    const remotionDataNested: Scene[][] = [];
    const newScriptScenes: SceneInput[] = [];

    await this.statusManager.setProgress(videoId, 15, "Processing scenes for re-render...");

    // Processar cada cena sem tentar revalidar vídeos
    for (let sceneIndex = 0; sceneIndex < inputScenes.length; sceneIndex++) {
      const scene: SceneInput = JSON.parse(JSON.stringify(inputScenes[sceneIndex]));
      
      logger.debug({ videoId, sceneIndex }, "Re-render: Processing scene with existing videos");

      // Para re-render, assumimos que os vídeos já estão válidos
      const videoUrls = scene.videos || [];

      await this.statusManager.setProgress(videoId, 20 + (sceneIndex * 40 / inputScenes.length), "Processing audio for re-render...");

      // Para re-render, verificar se há áudio pré-existente
      let audioData: { url: string; duration: number; captions: any[] }[];
      
      if (scene.audio && scene.audio.url && scene.audio.duration) {
        // Usar áudio existente diretamente
        logger.debug({ videoId, sceneIndex }, "Re-render: Using existing audio");
        const sceneAudio = scene.audio as any;
        audioData = [{
          url: sceneAudio.url,
          duration: sceneAudio.duration,
          captions: sceneAudio.captions || []
        }];
      } else {
        // Gerar novo áudio se não existir
        logger.debug({ videoId, sceneIndex }, "Re-render: Generating new audio");
        const textParts = [scene.text]; // Não dividir o texto no re-render
        audioData = await this.generateAudioForScene(videoId, scene, textParts, config);
      }

      // Criar as partes da cena - sempre uma única parte no re-render
      const sceneParts: Scene[] = [];
      const videoUrl = videoUrls[0]; // Usar apenas o primeiro vídeo
      if (!videoUrl) {
        throw new Error(`Missing video URL for scene ${sceneIndex} in re-render`);
      }
      
      // Validar duração do áudio
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

      // Para re-render, usar a URL do vídeo diretamente sem tentar revalidar
      let finalVideoUrl = videoUrl;
      
      // Ensure finalVideoUrl is valid
      if (!finalVideoUrl) {
        logger.error({
          videoId,
          sceneIndex,
          videoUrl,
          scene
        }, "Final video URL is null/undefined in re-render");
        throw new Error(`Final video URL is null for re-render scene ${sceneIndex}`);
      }
      
      // Log para debug
      if (videoUrl.startsWith('/api/cached-video/')) {
        logger.debug({ 
          videoId, 
          sceneIndex, 
          videoUrl 
        }, "Re-render: Using existing cached video");
      } else if (videoUrl.startsWith('http')) {
        logger.debug({ 
          videoId, 
          sceneIndex, 
          videoUrl 
        }, "Re-render: Using external video URL");
      } else {
        logger.debug({ 
          videoId, 
          sceneIndex, 
          videoUrl 
        }, "Re-render: Using local video URL");
      }
      
      sceneParts.push({
        id: cuid(),
        text: scene.text,
        searchTerms: scene.searchTerms,
        duration: audioDuration,
        orientation,
        captions: audioData[0].captions,
        videos: [finalVideoUrl],
        audio: { url: audioData[0].url, duration: audioDuration }
      });
      
      remotionDataNested.push(sceneParts);
      newScriptScenes.push(scene);
    }

    await this.statusManager.setProgress(videoId, 70, "Finalizing re-render data...");

    // Calcular duração total e encontrar música
    const totalDuration = remotionDataNested.flat().reduce((acc: number, s: any) => acc + s.duration, 0);
    const music = this.findMusic(totalDuration, config.music);

    // Criar objeto remotionData
    const remotionData = {
      scenes: remotionDataNested.flat(),
      music,
      config: {
        ...config,
        durationMs: totalDuration * 1000,
        port: this.globalConfig.port,
      },
    };

    logger.info({ 
      videoId, 
      totalScenes: remotionDataNested.flat().length,
      totalDuration 
    }, "Re-render scenes processed successfully");

    return {
      remotionData,
      updatedScriptScenes: newScriptScenes
    };
  }

  private async getCachedOrGenerateTTS(
    text: string,
    config: RenderConfig,
    forceRegenerate: boolean = false
  ): Promise<{ audioPath: string, duration: number, subtitles: any[] }> {
    const configHash = crypto.createHash('md5')
      .update(`${text}_${config.voice}_${config.language}_${config.referenceAudioPath}`)
      .digest('hex');
    
    const cachedAudioPath = path.join(this.globalConfig.tempDirPath, `${configHash}.wav`);

    if (!forceRegenerate && fs.existsSync(cachedAudioPath)) {
      try {
        // Check if file is not empty
        const stats = fs.statSync(cachedAudioPath);
        if (stats.size === 0) {
          logger.warn({ text, path: cachedAudioPath }, "Cached TTS file is empty, regenerating");
          fs.removeSync(cachedAudioPath);
        } else {
          // Aguarda o arquivo estar completamente pronto antes de calcular duração
          await this.waitForFileReady(cachedAudioPath);
          const duration = await this.remotion.getMediaDuration(cachedAudioPath);
          if (duration > 0) {
            logger.debug({ text, hash: configHash }, "TTS audio found in cache, generating fallback subtitles.");
            
            // Gerar legendas simples baseadas no texto quando usando cache
            const words = text.split(/\s+/);
            const durationMs = duration * 1000;
            const durationPerWord = words.length > 0 ? durationMs / words.length : 0;
            
            const fallbackSubtitles = words.map((word, index) => ({
              text: word,
              start: index * durationPerWord,
              end: (index + 1) * durationPerWord
            }));
            
            return { audioPath: cachedAudioPath, duration, subtitles: fallbackSubtitles };
          }
        }
      } catch(e) {
        logger.warn({ text, path: cachedAudioPath, error: e }, "Found cached TTS file, but failed to get duration. Regenerating.");
        // Remove the corrupted file
        try {
          fs.removeSync(cachedAudioPath);
        } catch (removeError) {
          logger.warn({ text, path: cachedAudioPath, error: removeError }, "Failed to remove corrupted cache file");
        }
      }
    }
    
    logger.debug({ text, hash: configHash }, "TTS audio not in cache. Generating...");
    const tempId = cuid();
    const tempWavPath = path.join(this.globalConfig.tempDirPath, `${tempId}.wav`);

    const result = await this.localTTS.generateSpeech(text, tempWavPath, config.voice, config.language, config.referenceAudioPath);
    
    // Aguarda o arquivo estar completamente pronto para uso
    await this.waitForFileReady(result.audioPath);
    
    // Validate the generated file before caching
    if (!fs.existsSync(result.audioPath)) {
      throw new Error(`Generated TTS file not found: ${result.audioPath}`);
    }
    
    const stats = fs.statSync(result.audioPath);
    if (stats.size === 0) {
      throw new Error(`Generated TTS file is empty: ${result.audioPath}`);
    }
    
    // Recalcular duração usando nosso método robusto que aguarda o arquivo estar pronto
    let finalDuration: number;
    try {
      finalDuration = await this.remotion.getMediaDuration(result.audioPath);
    } catch (durationError) {
      logger.error({ audioPath: result.audioPath, error: durationError }, "Failed to calculate duration for generated TTS");
      throw new Error(`Failed to calculate duration for generated TTS: ${durationError instanceof Error ? durationError.message : 'Unknown error'}`);
    }
    
    // Verify duration is valid
    if (!finalDuration || finalDuration <= 0 || isNaN(finalDuration)) {
      throw new Error(`Generated TTS has invalid duration: ${finalDuration}`);
    }
    
    logger.debug("TTS generation completed successfully", {
      audioPath: result.audioPath,
      originalDuration: result.duration,
      recalculatedDuration: finalDuration,
      fileSize: stats.size,
      subtitlesCount: result.subtitles.length
    });
    
    // Use a duração recalculada que foi validada
    const finalResult = { ...result, duration: finalDuration };
    
    fs.copyFileSync(result.audioPath, cachedAudioPath);

    return { ...finalResult, audioPath: cachedAudioPath };
  }

  private async generateAudioForScene(
    videoId: string,
    scene: SceneInput,
    textParts: string[],
    config: RenderConfig
  ): Promise<{ url: string; duration: number; captions: Caption[] }[]> {
    const audioResults = [];
    const sceneAudio = scene.audio as any;

    if (sceneAudio && sceneAudio.url && sceneAudio.duration && sceneAudio.duration > 0) {
        logger.debug({ videoId }, "Using pre-existing single audio for entire scene.");
        
        // Validate pre-existing audio duration
        if (isNaN(sceneAudio.duration) || sceneAudio.duration <= 0) {
          logger.error({ videoId, sceneAudio }, "Pre-existing audio has invalid duration");
          throw new Error(`Pre-existing audio has invalid duration: ${sceneAudio.duration}`);
        }

        // Use existing captions if available, otherwise generate empty captions
        const existingCaptions = sceneAudio.captions || [];
        
        // Ajusta as legendas para começar no frame correto de cada cena
        // Para a primeira cena, legendas começam no frame 2 (após o hook)
        // Para demais cenas, legendas começam no frame 1 da cena
        const adjustedCaptions = existingCaptions.map((caption: any) => ({
          text: caption.text,
          startMs: caption.startMs || caption.start || 0,
          endMs: caption.endMs || caption.end || 0
        }));

        audioResults.push({
          url: this.ensureAbsoluteUrl(sceneAudio.url),
          duration: sceneAudio.duration,
          captions: adjustedCaptions,
        });
    } else {
        // Generate new audio for each text part
        for (let j = 0; j < textParts.length; j++) {
          const text = textParts[j];
          logger.debug({ videoId, sceneIndex: j, partIndex: j, text }, "Generating TTS for text part");
          
          const audioResult = await this.generateSingleAudioPart(text, config);
          audioResults.push(audioResult);
        }
    }

    return audioResults;
  }

  private async generateSingleAudioPart(
    text: string,
    config: RenderConfig
  ): Promise<{ url: string, duration: number, captions: Caption[] }> {
    const audioResult = await this.getCachedOrGenerateTTS(text, config);
    const audioPath = audioResult.audioPath;
    const audioUrl = this.ensureAbsoluteUrl(`/temp/${path.basename(audioPath)}`);

    // Converte as legendas para o formato esperado, sem ajustar timing aqui
    // O timing será ajustado nos componentes de vídeo baseado na cena
    const captions = audioResult.subtitles.map((s: any) => ({
      text: s.text,
      startMs: s.start,
      endMs: s.end
    }));
    
    if (audioResult.duration <= 0) throw new Error(`Invalid audio duration for text: "${text}".`);

    return { url: audioUrl, duration: audioResult.duration, captions };
  }

  private splitTextIntoScenes(text: string): string[] {
    // Lógica simples e direta: quebra o texto pela pontuação.
    return text
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter(s => s);
  }

  public getVideoPath(videoId: string): string {
    return path.join(this.globalConfig.videosDirPath, `${videoId}.mp4`);
  }

  public getCachedVideoPath(filename: string): string | null {
    return this.videoCacheManager.getCachedVideoPath(filename);
  }

  public getCacheStats(): { count: number; totalSize: number; totalSizeFormatted: string } {
    return this.videoCacheManager.getCacheStats();
  }

  public async cleanupVideoCache(maxAgeHours: number = 24): Promise<void> {
    return this.videoCacheManager.cleanupOldCache(maxAgeHours);
  }

  public async deleteVideo(videoId: string): Promise<void> {
    const videosDir = path.join(this.globalConfig.videosDirPath);
    
    // Lista de todos os arquivos relacionados ao vídeo que devem ser apagados
    const filesToDelete = [
      // Arquivos principais no diretório de vídeos
      path.join(videosDir, `${videoId}.mp4`),
      path.join(videosDir, `${videoId}.script.json`),
      path.join(videosDir, `${videoId}.json`),
      path.join(videosDir, `${videoId}.render.json`),
      // Arquivos legados no diretório data (se existirem)
      path.join(this.globalConfig.dataDirPath, `${videoId}.json`),
      path.join(this.globalConfig.dataDirPath, `${videoId}.script.json`)
    ];

    let deletedCount = 0;
    for (const filePath of filesToDelete) {
      if (fs.existsSync(filePath)) {
        try {
          fs.removeSync(filePath);
          deletedCount++;
          logger.info({ videoId, filePath }, "Deleted video file and metadata");
        } catch (error) {
          logger.error({ videoId, filePath, error }, "Error deleting video file or metadata");
        }
      }
    }

    // Remove o arquivo de status usando o VideoStatusManager
    try {
      await this.statusManager.deleteStatus(videoId);
    } catch (error) {
      logger.error({ videoId, error }, "Error deleting video status");
    }

    // Remove da memória também
    this.creationQueue = this.creationQueue.filter(item => item.id !== videoId);
    
    // Remove da fila de renderização se estiver lá
    const renderIndex = this.renderQueue.indexOf(videoId);
    if (renderIndex > -1) {
      this.renderQueue.splice(renderIndex, 1);
      logger.info({ videoId }, "Removed video from render queue");
    }
    
    logger.info({ videoId, deletedCount }, "Video deletion completed - all files and metadata removed");
  }

  public clearAllVideos(): void {
    const videosDir = this.globalConfig.videosDirPath;
    if (fs.existsSync(videosDir)) {
      const files = fs.readdirSync(videosDir);
      for (const file of files) {
        fs.removeSync(path.join(videosDir, file));
      }
      logger.info("All video files have been cleared.");
    }
  }

  public getVideoData(videoId: string): any {
    const scriptPath = path.join(this.globalConfig.videosDirPath, `${videoId}.script.json`);
    if (!fs.existsSync(scriptPath)) {
      return null;
    }
    return fs.readJsonSync(scriptPath);
  }

  public saveVideoData(videoId: string, data: any): void {
    const scriptPath = path.join(this.globalConfig.videosDirPath, `${videoId}.script.json`);
    try {
      fs.writeJsonSync(scriptPath, data, { spaces: 2 });
      logger.info({ videoId }, "Successfully saved video data.");
    } catch (error) {
      logger.error({ videoId, error }, "Failed to save video data.");
      throw error;
    }
  }

  public async searchVideos(query: string): Promise<any> {
    logger.debug({ query }, "Searching videos");
    const searchResults = await this.videoSearch.findVideos(query, 25, [], OrientationEnum.portrait, 25, 'search');
    logger.debug({ query, count: searchResults.length }, "Found videos");
    return searchResults.map(v => ({
      ...v,
      // Garante que a URL do vídeo seja absoluta
      url: this.ensureAbsoluteUrl(v.url)
    }));
  }

  public async reRenderVideo(
    videoId: string,
    scenes: SceneInput[],
    config: RenderConfig,
  ): Promise<void> {
    logger.info({ videoId }, "[RE-RENDER] Starting re-render with existing assets.");

    try {
      // 1. Apaga o vídeo existente para garantir um processo limpo
      const existingVideoPath = this.getVideoPath(videoId);
      if (fs.existsSync(existingVideoPath)) {
        fs.removeSync(existingVideoPath);
        logger.info({ videoId }, "Deleted existing video file for clean re-render.");
      }

      // 2. Limpar cache de vídeos antigos (arquivos com mais de 1 hora)
      try {
        await this.videoCacheManager.cleanupOldCache(1); // Remove arquivos com mais de 1 hora
        logger.info({ videoId }, "Cleaned up old video cache entries");
      } catch (error) {
        logger.warn({ videoId, error }, "Failed to cleanup video cache, continuing...");
      }

      // 3. Verificar e limpar arquivos temporários órfãos
      try {
        const tempDir = this.globalConfig.tempDirPath;
        if (fs.existsSync(tempDir)) {
          const tempFiles = fs.readdirSync(tempDir);
          const oldFiles = tempFiles.filter(file => {
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
            return ageHours > 2; // Arquivos com mais de 2 horas
          });
          
          for (const file of oldFiles) {
            try {
              fs.removeSync(path.join(tempDir, file));
            } catch (cleanupError) {
              logger.warn({ videoId, file, error: cleanupError }, "Failed to cleanup temp file");
            }
          }
          
          if (oldFiles.length > 0) {
            logger.info({ videoId, cleanedFiles: oldFiles.length }, "Cleaned up old temporary files");
          }
        }
      } catch (error) {
        logger.warn({ videoId, error }, "Failed to cleanup temp files, continuing...");
      }

      // 4. Reseta o status para "processing"
      await this.statusManager.setStatus(videoId, "processing", "Starting re-render...");

      // 5. Usa pipeline específico para re-render que preserva assets existentes
      const { remotionData, updatedScriptScenes } = await this.processReRenderScenes(videoId, scenes, config);

      // 6. Salva os dados reprocessados e seguros no .render.json para a renderização.
      const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
      fs.writeJsonSync(renderJsonPath, remotionData, { spaces: 2 });
      logger.info({ videoId }, ".render.json updated with reprocessed data.");

      // 7. Salva as edições de texto do usuário no .script.json para persistência.
      const scriptPath = path.join(this.globalConfig.videosDirPath, `${videoId}.script.json`);
      if (fs.existsSync(scriptPath)) {
        const scriptData = fs.readJsonSync(scriptPath);
        scriptData.scenes = updatedScriptScenes;
        scriptData.config = config;
        fs.writeJsonSync(scriptPath, scriptData, { spaces: 2 });
      }

      // 8. Adiciona o vídeo à fila de renderização pura.
      if (!this.renderQueue.includes(videoId)) {
        this.renderQueue.push(videoId);
      }
      this.processRenderQueue();
      
    } catch (error: any) {
      logger.error({ videoId, error }, "Error in reRenderVideo process");
      await this.statusManager.setError(videoId, error.message || "Failed to re-render video");
      throw error; // Re-propaga o erro para o endpoint
    }
  }

  // Este método agora só renderiza. A preparação dos dados é feita antes.
  public async renderVideoFromData(videoId: string, videoData: any): Promise<void> {
    const { scenes, music, config } = videoData;

    try {
      const totalDurationSecs = scenes.reduce((acc: number, scene: any) => acc + scene.duration, 0);
      
      await this.remotion.renderMedia(
      videoId,
        { ...videoData, config: { ...config, durationInSec: totalDurationSecs } },
        (progress: number) => {
          logger.info(`Rendering progress: ${Math.round(progress * 100)}%`);
        },
      );
    } catch (error: any) {
      const duration = scenes.reduce((acc: number, s: any) => acc + s.duration, 0);
      logger.error({ error, videoId, scenes, duration }, "Error during video rendering");
      throw new Error(`Failed to render video: ${error.message || 'Unknown error'}`);
    }
  }

  public ListAvailableMusicTags(): MusicMoodEnum[] {
    return Object.values(MusicMoodEnum);
  }

  public ListAvailableVoices(): VoiceEnum[] {
    return Object.values(VoiceEnum);
  }

  public async getAllVideos(): Promise<any[]> {
    const videoDir = this.globalConfig.videosDirPath;
    if (!fs.existsSync(videoDir)) {
      return [];
    }

    const files = fs.readdirSync(videoDir);
    const videoScripts = files.filter(file => file.endsWith('.script.json'));

    const videos = await Promise.all(
      videoScripts.map(async (file) => {
        try {
          const filePath = path.join(videoDir, file);
          const data = fs.readJsonSync(filePath);
          
          // O ID está no nome do arquivo ou no JSON.
          const id = data.id || file.replace('.script.json', '');

          // Pega o status mais recente do gerenciador de status.
          const statusInfo = await this.statusManager.getStatus(id);

          // Verifica se o vídeo MP4 existe
          const videoPath = this.getVideoPath(id);
          const videoExists = fs.existsSync(videoPath);

          // Determina o status correto baseado no estado atual
          let finalStatus = statusInfo.status;
          
          // Se o vídeo existe mas o status não é 'ready', corrige o status
          if (videoExists && statusInfo.status !== 'ready') {
            finalStatus = 'ready';
            // Atualiza o status no arquivo para futuras consultas
            await this.statusManager.setStatus(id, 'ready', 'Video rendered successfully', 100, 'Completed');
          }
          
          // Se o vídeo não existe e o status é 'ready', corrige o status
          if (!videoExists && statusInfo.status === 'ready') {
            finalStatus = 'failed';
            await this.statusManager.setError(id, 'Video file not found');
          }

          // Se não há status definido, define um status padrão baseado na existência do arquivo
          if (!statusInfo.status) {
            if (videoExists) {
              finalStatus = 'ready';
              await this.statusManager.setStatus(id, 'ready', 'Video rendered successfully', 100, 'Completed');
            } else {
              // Se não há vídeo e não há status, provavelmente falhou ou foi deletado
              finalStatus = 'failed';
              await this.statusManager.setError(id, 'Video file not found');
            }
          }
    
    return {
            id: id,
            createdAt: data.createdAt,
            status: finalStatus,
            error: statusInfo.error,
            progress: statusInfo.progress,
            stage: statusInfo.stage,
            message: statusInfo.message,
            scenes: data.scenes, // Incluir dados das cenas para o frontend
            // Adiciona um thumbnail se o vídeo estiver pronto.
            thumbnail: finalStatus === 'ready' ? `/videos/${id}.mp4` : null,
          };
        } catch (error) {
          logger.error({ file, error }, "Failed to process video script file");
          return null;
        }
      })
    );

    // Filtra nulos e ordena pelos mais recentes
    return videos
      .filter(v => v !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getVideoById(id: string): any | null {
    const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${id}.render.json`);
    const scriptPath = path.join(this.globalConfig.videosDirPath, `${id}.script.json`);
    const legacyJsonPath = path.join(this.globalConfig.dataDirPath, `${id}.json`);
    const legacyScriptPath = path.join(this.globalConfig.dataDirPath, `${id}.script.json`);

    // Prioriza o render.json, que tem os dados mais completos para edição.
    if (fs.existsSync(renderJsonPath)) {
      logger.debug({ videoId: id }, "Serving .render.json for editor.");
      return fs.readJsonSync(renderJsonPath);
    }
    
    // Se não houver render.json, usa o script.json como fallback.
    if (fs.existsSync(scriptPath)) {
      logger.debug({ videoId: id }, "Serving .script.json as fallback for editor.");
      return fs.readJsonSync(scriptPath);
    }

    // Fallback para os caminhos antigos
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

  // =================================================================
  // == FLUXO DE RENDERIZAÇÃO PURO (Render.json -> Render)
  // =================================================================

  private async processRenderQueue(): Promise<void> {
    if (this.isProcessingRender || this.renderQueue.length === 0) return;
    this.isProcessingRender = true;

    const videoId = this.renderQueue.shift();
    if (!videoId) {
      this.isProcessingRender = false;
      return;
    }

    try {
      await this.renderFromRenderJson(videoId);
    } catch (error) {
      logger.error({ videoId, error }, "Error in render queue");
    } finally {
      this.isProcessingRender = false;
      this.processRenderQueue();
    }
  }

  private async renderFromRenderJson(videoId: string): Promise<void> {
    logger.info({ videoId }, "Starting pure render from .render.json");
    
    // Registrar tempo de início da renderização
    this.renderStartTimes.set(videoId, Date.now());
    
    await this.statusManager.setStatus(videoId, "processing", "Rendering video...", 0, "Initializing");
    
    const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
    if (!fs.existsSync(renderJsonPath)) {
      throw new Error(`.render.json not found for ${videoId}`);
    }
    
    const rawRenderData = fs.readJsonSync(renderJsonPath);

    // Validar arquivos necessários antes de preprocessar
    await this.statusManager.setProgress(videoId, 5, "Validating assets...");
    if (rawRenderData.scenes) {
      for (let i = 0; i < rawRenderData.scenes.length; i++) {
        const scene = rawRenderData.scenes[i];
        
        // Validar arquivo de áudio
        if (scene.audio && scene.audio.url) {
          const audioUrl = scene.audio.url;
          if (audioUrl.startsWith('/temp/')) {
            const audioFilename = path.basename(audioUrl);
            const audioPath = path.join(this.globalConfig.tempDirPath, audioFilename);
            
            if (!fs.existsSync(audioPath)) {
              logger.error({ 
                videoId, 
                sceneIndex: i, 
                audioUrl, 
                audioPath 
              }, "Audio file not found before rendering");
              throw new Error(`Audio file not found for scene ${i}: ${audioPath}`);
            }
            
            // Verificar se o arquivo tem tamanho válido
            const audioStats = fs.statSync(audioPath);
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

    // Pré-processar os dados para garantir URLs absolutas
    await this.statusManager.setProgress(videoId, 10, "Processing data...");
    const renderData = this.preprocessVideoDataForRemotionRendering(rawRenderData);

    // Debug logs para verificar os dados
    logger.debug({ videoId, renderData }, "Render data loaded and preprocessed from .render.json");
    
    // Verificar durações das cenas
    if (renderData.scenes) {
      renderData.scenes.forEach((scene: any, index: number) => {
        logger.debug({ 
          videoId, 
          sceneIndex: index, 
          sceneId: scene.id,
          audioDuration: scene.audio?.duration,
          audioUrl: scene.audio?.url 
        }, "Scene audio data after preprocessing");
      });
    }

    try {
      await this.remotion.renderMedia(videoId, renderData, (progress) => {
        const progressPercent = Math.round(progress * 100);
        const stage = progress < 0.2 ? "Initializing" : 
                     progress < 0.5 ? "Processing frames" :
                     progress < 0.8 ? "Encoding video" : "Finalizing";
        
        this.throttledProgressUpdate(videoId, progressPercent, stage);
      });
      
      await this.statusManager.setStatus(videoId, "ready", "Video rendered successfully", 100, "Completed");
      
      // Limpar dados de tracking
      this.renderStartTimes.delete(videoId);
      this.lastProgressUpdate.delete(videoId);
    } catch (error: any) {
      await this.statusManager.setError(videoId, error.message);
      
      // Limpar dados de tracking mesmo em caso de erro
      this.renderStartTimes.delete(videoId);
      this.lastProgressUpdate.delete(videoId);
      
      throw error;
    }
  }

  private async throttledProgressUpdate(videoId: string, progress: number, stage: string): Promise<void> {
    const lastUpdate = this.lastProgressUpdate.get(videoId) || 0;
    const now = Date.now();
    
    // Lógica mais inteligente para updates de progresso
    const shouldUpdate = this.shouldUpdateProgress(progress, lastUpdate, now);
    
    if (shouldUpdate || progress === 100) {
      this.lastProgressUpdate.set(videoId, progress);
      await this.statusManager.setProgress(videoId, progress, stage);
      
      // Adicionar estimativa de tempo restante
      const estimatedTimeRemaining = this.estimateTimeRemaining(progress, videoId);
      if (estimatedTimeRemaining > 0) {
        await this.statusManager.setProgress(videoId, progress, stage, estimatedTimeRemaining);
      }
    }
  }

  private shouldUpdateProgress(currentProgress: number, lastReportedProgress: number, currentTime: number): boolean {
    const progressDiff = Math.abs(currentProgress - lastReportedProgress);
    const lastUpdateTime = this.progressUpdateTimes.get(`${currentProgress}`) || 0;
    const timeSinceLastUpdate = currentTime - lastUpdateTime;
    
    // Nos estágios finais (90%+), seja mais responsivo
    if (currentProgress >= 90) {
      const shouldUpdate = progressDiff >= 1 || timeSinceLastUpdate > 500; // Update a cada 1% ou 500ms
      if (shouldUpdate) {
        this.progressUpdateTimes.set(`${currentProgress}`, currentTime);
      }
      return shouldUpdate;
    }
    
    // Entre 80-90%, update a cada 2% ou 1 segundo
    if (currentProgress >= 80) {
      const shouldUpdate = progressDiff >= 2 || timeSinceLastUpdate > 1000;
      if (shouldUpdate) {
        this.progressUpdateTimes.set(`${currentProgress}`, currentTime);
      }
      return shouldUpdate;
    }
    
    // Antes de 80%, update a cada 5% ou 2 segundos
    const shouldUpdate = progressDiff >= 5 || timeSinceLastUpdate > 2000;
    if (shouldUpdate) {
      this.progressUpdateTimes.set(`${currentProgress}`, currentTime);
    }
    return shouldUpdate;
  }

  private estimateTimeRemaining(currentProgress: number, videoId: string): number {
    const startTime = this.renderStartTimes.get(videoId);
    if (!startTime || currentProgress <= 0) return 0;
    
    const elapsed = (Date.now() - startTime) / 1000; // em segundos
    const progressRatio = currentProgress / 100;
    
    if (progressRatio > 0) {
      const estimatedTotal = elapsed / progressRatio;
      return Math.max(0, estimatedTotal - elapsed);
    }
    
    return 0;
  }

  // =================================================================
  // == MÉTODOS AUXILIARES E PONTOS DE ENTRADA
  // =================================================================

  public async generateSingleTTSAndUpdate(videoId: string, sceneId: string, text: string, config: RenderConfig, forceRegenerate: boolean = false) {
      const audioResult = await this.getCachedOrGenerateTTS(text, config, forceRegenerate);
      const audioUrl = this.ensureAbsoluteUrl(`/temp/${path.basename(audioResult.audioPath)}`);

      // Ajusta apenas as legendas que conflitariam com o hook (primeiros 1000ms)
      const adjustedSubtitles = audioResult.subtitles.map((s: any) => {
        // Se a legenda começa antes de 1 segundo, empurra para depois do hook
        if (s.start < 1000) {
      return {
            text: s.text,
            start: Math.max(1000, s.start + 1000), // Move para depois do hook
            end: Math.max(1100, s.end + 1000)      // Mantém a duração relativa
          };
        }
        
        // Se não conflita com o hook, mantém o timing original
      return {
          text: s.text,
          start: s.start,
          end: s.end
        };
      });

      const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
      if(fs.existsSync(renderJsonPath)) {
          const renderData = fs.readJsonSync(renderJsonPath);
          const scene = renderData.scenes.find((s: any) => s.id === sceneId);
          if (scene) {
              scene.audio = { url: audioUrl, duration: audioResult.duration };
              scene.captions = adjustedSubtitles;
              fs.writeJsonSync(renderJsonPath, renderData, { spaces: 2 });
          }
      }
      return { audioUrl, duration: audioResult.duration, subtitles: adjustedSubtitles };
  }

  private findMusic(duration: number, mood?: MusicTag): MusicForVideo {
    logger.debug({ duration, mood }, "Finding suitable music.");
    
    // Obtém a lista de músicas do MusicManager
    const availableMusic = this.musicManager.musicList();
    
    // Filtra músicas pelo mood especificado
    const musicForMood = mood 
      ? availableMusic.filter(m => m.mood === mood)
      : availableMusic;
    
    if (musicForMood.length === 0) {
      logger.warn({ mood }, "No music found for mood, using any available music");
      return availableMusic[0];
    }
    
    // Seleciona uma música aleatória do mood apropriado
    const randomIndex = Math.floor(Math.random() * musicForMood.length);
    const selectedMusic = musicForMood[randomIndex];
    
    // Ajusta o end time para a duração do vídeo se necessário
    const adjustedMusic = {
      ...selectedMusic,
      end: Math.min(selectedMusic.end, duration)
    };
    
    logger.debug({ 
      selectedFile: selectedMusic.file, 
      mood: selectedMusic.mood, 
      duration: adjustedMusic.end 
    }, "Music selected successfully");
    
    return adjustedMusic;
  }

  private async waitForFileReady(filePath: string): Promise<void> {
    const maxWaitTime = 10000; // 10 segundos máximo
    const checkInterval = 50; // Verifica a cada 50ms
    const startTime = Date.now();
    let lastSize = 0;
    let stableSizeCount = 0;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Verifica se o arquivo existe e tem tamanho
        const stats = fs.statSync(filePath);
        
        if (stats.size === 0) {
          // Arquivo vazio, continua esperando
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          continue;
        }

        // Verifica se o tamanho do arquivo está estável
        if (stats.size === lastSize) {
          stableSizeCount++;
          // Se o tamanho ficou estável por pelo menos 3 verificações (150ms)
          if (stableSizeCount >= 3) {
            // Tenta ler o arquivo para verificar se está acessível
            try {
              const fd = fs.openSync(filePath, 'r');
              fs.closeSync(fd);
              
              logger.debug("File is ready and accessible", { 
                filePath, 
                fileSize: stats.size,
                waitTime: Date.now() - startTime 
              });
              return;
            } catch (readError) {
              // Arquivo ainda não está totalmente acessível
              await new Promise(resolve => setTimeout(resolve, checkInterval));
              continue;
            }
          }
        } else {
          // Tamanho mudou, resetar contador
          lastSize = stats.size;
          stableSizeCount = 0;
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
    } catch (error) {
        // Arquivo ainda não existe ou não está acessível
        await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
}

    throw new Error(`Timeout waiting for file to be ready: ${filePath}`);
  }

  /**
   * Pipeline específico para edições de vídeo do editor.
   * Detecta mudanças e processa apenas o que foi alterado.
   */
  public async processVideoEdition(
    videoId: string, 
    newData: any, 
    originalData?: any
  ): Promise<void> {
    logger.info({ videoId }, "[EDIT] Starting video edition processing");
    
    try {
      // 1. Obter dados originais se não fornecidos
      if (!originalData) {
        originalData = this.getVideoById(videoId);
      }
      
      // 2. Detectar mudanças
      const changes = this.detectChanges(originalData, newData);
      logger.info({ videoId, changes }, "[EDIT] Detected changes in video data");
      
      // 3. Processar mudanças específicas
      const updatedData = await this.processEditChanges(videoId, newData, changes);
      
      // 4. Salvar dados atualizados no script.json
      const scriptData = {
        id: videoId,
        scenes: updatedData.scenes,
        config: updatedData.config,
        createdAt: originalData?.createdAt || new Date().toISOString(),
        status: "processing", // Será atualizado durante re-render
        editedAt: new Date().toISOString()
      };
      
      const scriptPath = path.join(this.globalConfig.videosDirPath, `${videoId}.script.json`);
      fs.writeJsonSync(scriptPath, scriptData, { spaces: 2 });
      logger.info({ videoId }, "[EDIT] Saved updated script data");
      
      // 5. Atualizar dados de renderização
      const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
      fs.writeJsonSync(renderJsonPath, updatedData, { spaces: 2 });
      logger.info({ videoId }, "[EDIT] Saved updated render data");
      
    } catch (error: any) {
      logger.error({ videoId, error }, "[EDIT] Error processing video edition");
      throw error;
    }
  }

  /**
   * Detecta que tipo de mudanças foram feitas no vídeo
   */
  private detectChanges(originalData: any, newData: any): {
    textChanges: Array<{ sceneIndex: number, oldText: string, newText: string }>;
    videoChanges: Array<{ sceneIndex: number, videoIndex: number, oldUrl: string, newUrl: string }>;
    configChanges: boolean;
  } {
    const changes = {
      textChanges: [] as Array<{ sceneIndex: number, oldText: string, newText: string }>,
      videoChanges: [] as Array<{ sceneIndex: number, videoIndex: number, oldUrl: string, newUrl: string }>,
      configChanges: false
    };

    // Detectar mudanças de texto
    if (originalData?.scenes && newData?.scenes) {
      for (let i = 0; i < Math.max(originalData.scenes.length, newData.scenes.length); i++) {
        const oldScene = originalData.scenes[i];
        const newScene = newData.scenes[i];
        
        if (oldScene && newScene && oldScene.text !== newScene.text) {
          changes.textChanges.push({
            sceneIndex: i,
            oldText: oldScene.text || '',
            newText: newScene.text || ''
          });
        }
      }
    }

    // Detectar mudanças de vídeos
    if (originalData?.scenes && newData?.scenes) {
      for (let i = 0; i < Math.max(originalData.scenes.length, newData.scenes.length); i++) {
        const oldScene = originalData.scenes[i];
        const newScene = newData.scenes[i];
        
        if (oldScene?.videos && newScene?.videos) {
          for (let j = 0; j < Math.max(oldScene.videos.length, newScene.videos.length); j++) {
            const oldVideo = oldScene.videos[j];
            const newVideo = newScene.videos[j];
            
            if (oldVideo !== newVideo) {
              changes.videoChanges.push({
                sceneIndex: i,
                videoIndex: j,
                oldUrl: oldVideo || '',
                newUrl: newVideo || ''
              });
            }
          }
        }
      }
    }

    // Detectar mudanças de configuração
    if (JSON.stringify(originalData?.config) !== JSON.stringify(newData?.config)) {
      changes.configChanges = true;
    }

    return changes;
  }

  /**
   * Processa as mudanças específicas detectadas
   */
  private async processEditChanges(
    videoId: string, 
    newData: any, 
    changes: any
  ): Promise<any> {
    const processedData = JSON.parse(JSON.stringify(newData)); // Deep clone
    
    // Garantir estrutura básica para todas as cenas
    if (processedData.scenes) {
      processedData.scenes.forEach((scene: any, index: number) => {
        // Garantir propriedades básicas
        if (!scene.id) {
          scene.id = `scene_${index}_${Date.now()}`;
        }
        if (!scene.text) {
          scene.text = "";
        }
        if (!scene.videos || !Array.isArray(scene.videos)) {
          scene.videos = [];
        }
        if (!scene.audio) {
          scene.audio = { url: "", duration: 0 };
        }
        if (!scene.captions || !Array.isArray(scene.captions)) {
          scene.captions = [];
        }
        if (!scene.duration) {
          scene.duration = scene.audio?.duration || 0;
        }
      });
    }
    
    // Processar mudanças de texto (regerar áudio e legendas)
    for (const textChange of changes.textChanges) {
      if (textChange.newText.trim()) {
        logger.info({ 
          videoId, 
          sceneIndex: textChange.sceneIndex, 
          newText: textChange.newText 
        }, "[EDIT] Regenerating audio for text change");
        
        const scene = processedData.scenes[textChange.sceneIndex];
        if (scene) {
          // Regenerar áudio com o novo texto
          const audioResult = await this.getCachedOrGenerateTTS(
            textChange.newText.trim(), 
            processedData.config || {},
            true // Force regenerate
          );
          
          const audioUrl = this.ensureAbsoluteUrl(`/temp/${path.basename(audioResult.audioPath)}`);
          
          // Aplicar ajuste de timing nas legendas (1 segundo de avanço)
          const adjustedSubtitles = audioResult.subtitles.map((s: any) => ({
            text: s.text,
            start: Math.max(0, s.start - 1000), // Adianta 1 segundo
            end: Math.max(100, s.end - 1000)   // Mantém duração mínima
          }));
          
          // Atualizar dados da cena
          scene.audio = { 
            url: audioUrl, 
            duration: audioResult.duration 
          };
          scene.captions = adjustedSubtitles;
          scene.duration = audioResult.duration; // Atualizar duração da cena
          
          logger.info({ 
            videoId, 
            sceneIndex: textChange.sceneIndex, 
            newDuration: audioResult.duration 
          }, "[EDIT] Audio regenerated for scene");
        }
      }
    }
    
    // Processar mudanças de vídeos (adicionar ao cache)
    for (const videoChange of changes.videoChanges) {
      if (videoChange.newUrl && videoChange.newUrl !== videoChange.oldUrl) {
        logger.info({ 
          videoId, 
          sceneIndex: videoChange.sceneIndex, 
          videoIndex: videoChange.videoIndex, 
          newUrl: videoChange.newUrl 
        }, "[EDIT] Caching new video");
        
        try {
          // Adicionar vídeo ao cache se for uma URL externa
          if (videoChange.newUrl.startsWith('http')) {
            const cacheResults = await this.videoCacheManager.preloadVideos([videoChange.newUrl]);
            const cachedVideo = cacheResults.get(videoChange.newUrl);
            
            if (cachedVideo) {
              // Atualizar URL para usar a versão em cache
              processedData.scenes[videoChange.sceneIndex].videos[videoChange.videoIndex] = cachedVideo.proxyUrl;
              
              logger.info({ 
                videoId, 
                originalUrl: videoChange.newUrl, 
                cachedUrl: cachedVideo.proxyUrl 
              }, "[EDIT] Video cached successfully");
            } else {
              // Se não conseguiu fazer cache, usar URL original
              processedData.scenes[videoChange.sceneIndex].videos[videoChange.videoIndex] = videoChange.newUrl;
              logger.warn({ 
                videoId, 
                videoUrl: videoChange.newUrl 
              }, "[EDIT] Failed to cache video, using original URL");
            }
          } else {
            // URL local, usar diretamente
            processedData.scenes[videoChange.sceneIndex].videos[videoChange.videoIndex] = videoChange.newUrl;
          }
        } catch (error) {
          logger.warn({ 
            videoId, 
            videoUrl: videoChange.newUrl, 
            error 
          }, "[EDIT] Failed to cache video, using original URL");
          
          // Em caso de erro, manter a URL original
          processedData.scenes[videoChange.sceneIndex].videos[videoChange.videoIndex] = videoChange.newUrl;
        }
      }
    }
    
    // Garantir configuração básica
    if (!processedData.config) {
      processedData.config = {};
    }
    
    // Garantir propriedades essenciais do config
    processedData.config = {
      orientation: processedData.config.orientation || "portrait",
              voice: processedData.config.voice || "Paulo",
      language: processedData.config.language || "pt",
      ...processedData.config
    };
    
    // Recalcular duração total
    let totalDuration = 0;
    if (processedData.scenes) {
      for (const scene of processedData.scenes) {
        if (scene.audio?.duration) {
          totalDuration += scene.audio.duration;
        }
      }
    }
    
    // Atualizar configuração com nova duração
    processedData.config.durationInSec = totalDuration;
    
    logger.info({ 
      videoId, 
      totalDuration, 
      sceneCount: processedData.scenes?.length || 0,
      textChanges: changes.textChanges.length,
      videoChanges: changes.videoChanges.length
    }, "[EDIT] Finished processing edit changes");
    
    return processedData;
  }

  /**
   * Endpoint específico para salvar e processar edições do editor
   */
  public async saveAndProcessVideoEdition(videoId: string, newData: any): Promise<void> {
    logger.info({ videoId }, "[EDIT] Starting save and process video edition");
    
    try {
      // 1. Obter dados originais
      const originalData = this.getVideoById(videoId);
      
      // 2. Processar edições
      await this.processVideoEdition(videoId, newData, originalData);
      
      logger.info({ videoId }, "[EDIT] Video edition processed successfully");
    } catch (error: any) {
      logger.error({ videoId, error }, "[EDIT] Error in save and process video edition");
      throw error;
    }
  }

  /**
   * Re-renderiza um vídeo após edições
   */
  public async reRenderEditedVideo(
    videoId: string,
    editedData?: any
  ): Promise<void> {
    logger.info({ videoId }, "[EDIT-RENDER] Starting re-render of edited video");

    try {
      // 1. Obter dados editados se não fornecidos
      if (!editedData) {
        editedData = this.getVideoById(videoId);
        if (!editedData) {
          throw new Error(`No edited data found for video ${videoId}`);
        }
        logger.debug({ videoId, dataKeys: Object.keys(editedData) }, "[EDIT-RENDER] Loaded data from getVideoById");
      } else {
        logger.debug({ videoId, dataKeys: Object.keys(editedData) }, "[EDIT-RENDER] Using provided edited data");
      }

      // 2. Validar dados básicos e garantir estrutura mínima
      if (!editedData.scenes || !Array.isArray(editedData.scenes)) {
        logger.error({ 
          videoId, 
          editedData: editedData ? Object.keys(editedData) : null,
          scenesType: typeof editedData?.scenes,
          scenesValue: editedData?.scenes 
        }, "[EDIT-RENDER] Invalid scenes data");
        throw new Error(`Invalid scenes data for video ${videoId}`);
      }

      if (editedData.scenes.length === 0) {
        logger.warn({ videoId }, "[EDIT-RENDER] No scenes found in video data");
        throw new Error(`No scenes found for video ${videoId}`);
      }

      if (!editedData.config) {
        logger.warn({ videoId }, "[EDIT-RENDER] No config found, using defaults");
        editedData.config = {
          orientation: "portrait",
          voice: "Paulo",
          language: "pt"
        };
      }

      // Garantir que config tem propriedades essenciais
      editedData.config = {
        orientation: editedData.config.orientation || "portrait",
        voice: editedData.config.voice || "Paulo", 
        language: editedData.config.language || "pt",
        ...editedData.config
      };

      logger.debug({ videoId, config: editedData.config, sceneCount: editedData.scenes.length }, "[EDIT-RENDER] Validated edited data");

      // 3. Apagar vídeo existente
      const existingVideoPath = this.getVideoPath(videoId);
      if (fs.existsSync(existingVideoPath)) {
        fs.removeSync(existingVideoPath);
        logger.info({ videoId }, "[EDIT-RENDER] Deleted existing video file");
      }

      // 4. Resetar status
      await this.statusManager.setStatus(videoId, "processing", "Starting re-render after edit...");

      // 5. Calcular duração total
      let totalDuration = 0;
      for (const scene of editedData.scenes) {
        if (scene.audio?.duration) {
          totalDuration += scene.audio.duration;
        } else if (scene.duration) {
          totalDuration += scene.duration;
        }
      }

      // 6. Adicionar música se não existir
      if (!editedData.music && totalDuration > 0) {
        const music = this.findMusic(totalDuration);
        editedData.music = music;
        logger.debug({ videoId, music: music.file }, "[EDIT-RENDER] Added music to edited data");
      }

      // 7. Atualizar config com duração
      editedData.config.durationInSec = totalDuration;

      // 8. Garantir que os dados estão no formato correto para renderização
      const renderData = this.preprocessVideoDataForRemotionRendering(editedData);

      logger.debug({ 
        videoId, 
        hasScenes: !!renderData.scenes,
        sceneCount: renderData.scenes?.length || 0,
        hasConfig: !!renderData.config,
        hasMusic: !!renderData.music,
        totalDuration 
      }, "[EDIT-RENDER] Preprocessed render data");

      // 9. Salvar dados finais de renderização
      const renderJsonPath = path.join(this.globalConfig.videosDirPath, `${videoId}.render.json`);
      fs.writeJsonSync(renderJsonPath, renderData, { spaces: 2 });
      logger.info({ videoId }, "[EDIT-RENDER] Render data updated");

      // 10. Adicionar à fila de renderização
      if (!this.renderQueue.includes(videoId)) {
        this.renderQueue.push(videoId);
      }
      this.processRenderQueue();
      
    } catch (error: any) {
      logger.error({ videoId, error }, "[EDIT-RENDER] Error in re-render edited video");
      await this.statusManager.setError(videoId, error.message || "Failed to re-render edited video");
      throw error;
    }
  }

  public getVideoProviderFacade(): VideoProviderFacade {
    return this.videoProviderFacade;
  }
}