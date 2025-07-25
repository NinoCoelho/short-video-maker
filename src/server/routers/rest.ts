import { createProxyMiddleware, Options } from "http-proxy-middleware";
import express, { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import fs from "fs";
import path from "path";
import { z } from 'zod';
import { logger } from '../../logger';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { 
  PathTraversalGuard, 
  URLValidator, 
  APIKeyValidator, 
  validateRequest,
  validationSchemas
} from '../middleware/security';
import { DynamicValidation } from '../middleware/dynamicValidation';

import { ShortCreator } from "../../short-creator/ShortCreator";
import { Config } from "../../config";
import { RenderRequest, VoiceEnum, OrientationEnum, MusicMood, SceneInput, RenderConfig } from "../../types/shorts";
import { VideoStatusManager } from "../../short-creator/VideoStatusManager";
import { TranslationService } from '../../services/TranslationService';
import { TranscriptionService } from '../../services/TranscriptionService';
import translationRoutes, { initializeTranslationRoutes } from '../routes/translationRoutes';
import { ResponseFormatter } from '../utils/ResponseFormatter';
import { NotFoundError, ProcessingError, ValidationError } from '../errors/AppError';
import { asyncHandler } from '../middleware/errorHandler';

export class APIRouter {
  router: Router;
  private shortCreator: ShortCreator;
  private config: Config;
  private videoStatusManager: VideoStatusManager;
  private translationService?: TranslationService;
  private transcriptionService?: TranscriptionService;

  constructor(
    config: Config, 
    shortCreator: ShortCreator, 
    videoStatusManager: VideoStatusManager,
    translationService?: TranslationService,
    transcriptionService?: TranscriptionService
  ) {
    this.router = Router();
    this.config = config;
    this.shortCreator = shortCreator;
    this.videoStatusManager = videoStatusManager;
    this.translationService = translationService;
    this.transcriptionService = transcriptionService;
    this.router.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    this.router.get("/status/:id", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError("Video ID is required");
      }

      const statusObject = await this.shortCreator.status(id);
      
      if (!statusObject) {
        throw new NotFoundError("Video", id);
      }

      ResponseFormatter.success(res, statusObject);
    }));

    this.router.get("/logs/:id", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { id } = req.params;
      const { limit = 50 } = req.query;
      
      if (!id) {
        throw new ValidationError("Video ID is required");
      }

      const parsedLimit = parseInt(limit as string, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
        throw new ValidationError("Limit must be a number between 1 and 1000");
      }
      
      // Aqui você pode implementar um sistema de logs em tempo real
      // Por enquanto, vamos retornar logs básicos do sistema
      const logs = [
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: `Video ${id} processing started`,
          videoId: id
        }
      ];
      
      ResponseFormatter.success(res, {
        logs: logs.slice(-parsedLimit),
        total: logs.length
      });
    }));

    this.router.post("/render", 
      validateRequest(validationSchemas.renderRequest),
      DynamicValidation.validateMusicMood(),
      URLValidator.middleware(['newVideoUrl']),
      asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const renderRequest = req.body as RenderRequest;
      
      // Validate required fields
      if (!renderRequest.scenes && !renderRequest.id) {
        throw new ValidationError("Either scenes or video ID is required");
      }
      
      if (!renderRequest.config && !renderRequest.id) {
        throw new ValidationError("Configuration is required for new videos");
      }

      let videoId: string;
      if (renderRequest.id) {
        // Re-renderiza um vídeo existente
        videoId = renderRequest.id;
        
        // Se não há scenes ou config no request, carrega do arquivo existente
        let scenes = renderRequest.scenes;
        let config = renderRequest.config;
        
        if (!scenes || !config) {
          const existingData = this.shortCreator.getScriptById(videoId);
          if (!existingData) {
            throw new NotFoundError("Video", videoId);
          }
          
          logger.debug({ videoId, existingData: !!existingData, hasScenes: !!existingData.scenes, hasConfig: !!existingData.config }, "Loading existing data for re-render");
          
          scenes = scenes || existingData.scenes;
          config = config || existingData.config;
          
          if (!scenes || !config) {
            throw new ProcessingError("Missing scenes or config data", videoId, "validation");
          }
          
          logger.debug({ videoId, config, overlay: config?.overlay }, "Config before defaults");
          
          // Garante que o config tenha valores padrão necessários
          config = {
            ...config,
            orientation: config.orientation || OrientationEnum.portrait,
            voice: config.voice || VoiceEnum.Paulo,
            language: config.language || "pt"
          };
          
          logger.debug({ videoId, config, overlay: config?.overlay }, "Config after defaults");
        }
        
        await this.shortCreator.reRenderVideo(videoId, scenes, config);
      } else {
        // Cria um novo vídeo
        logger.debug({ 
          scenes: renderRequest.scenes?.length, 
          config: renderRequest.config,
          overlay: renderRequest.config?.overlay 
        }, "Creating new video with config");
        
        videoId = await this.shortCreator.addToQueue(
          renderRequest.scenes,
          renderRequest.config
        );
      }
      
      ResponseFormatter.success(res, {
        message: "Video rendering started",
        videoId,
      }, 202);
    }));

    // Alias para /api/short-video (mantém compatibilidade)
    this.router.post("/short-video", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const renderRequest = req.body as RenderRequest;
      
      // Validate required fields
      if (!renderRequest.scenes && !renderRequest.id) {
        throw new ValidationError("Either scenes or video ID is required");
      }
      
      if (!renderRequest.config && !renderRequest.id) {
        throw new ValidationError("Configuration is required for new videos");
      }

      let videoId: string;
      if (renderRequest.id) {
        // Re-renderiza um vídeo existente
        videoId = renderRequest.id;
        
        if (!renderRequest.scenes || !renderRequest.config) {
          throw new ValidationError("Scenes and config are required for re-rendering");
        }
        
        await this.shortCreator.reRenderVideo(
          videoId,
          renderRequest.scenes,
          renderRequest.config
        );
      } else {
        // Cria um novo vídeo
        videoId = await this.shortCreator.addToQueue(
          renderRequest.scenes,
          renderRequest.config
        );
      }
      
      ResponseFormatter.success(res, {
        message: "Video rendering started",
        videoId,
      }, 202);
    }));

    // Endpoint para status do vídeo (/api/short-video/:id/status)
    this.router.get("/short-video/:id/status", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError("Video ID is required");
      }

      const statusObject = await this.shortCreator.status(id);
      
      if (!statusObject) {
        throw new NotFoundError("Video", id);
      }

      ResponseFormatter.success(res, statusObject);
    }));

    // Endpoint para download do vídeo (/api/short-video/:id)
    this.router.get("/short-video/:id", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError("Video ID is required");
      }
      
      const videoPath = this.shortCreator.getVideoPath(id);

      if (!videoPath || !fs.existsSync(videoPath)) {
        throw new NotFoundError("Video", id);
      }

      try {
        const stat = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;
          const file = fs.createReadStream(videoPath, { start, end });
          const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
          };
          res.writeHead(206, head);
          file.pipe(res);
        } else {
          const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
          };
          res.writeHead(200, head);
          fs.createReadStream(videoPath).pipe(res);
        }
      } catch (error) {
        throw new ProcessingError(`Failed to serve video file: ${error.message}`, id, "file_serving");
      }
    }));

    // Endpoint para listar vídeos (/api/short-videos)
    this.router.get("/short-videos", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { page = 1, limit = 10 } = req.query;
      
      const parsedPage = parseInt(page as string, 10);
      const parsedLimit = parseInt(limit as string, 10);
      
      if (isNaN(parsedPage) || parsedPage < 1) {
        throw new ValidationError("Page must be a positive number");
      }
      
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        throw new ValidationError("Limit must be a number between 1 and 100");
      }
      
      const videos = await this.shortCreator.getAllVideos();
      
      // Simple pagination implementation
      const startIndex = (parsedPage - 1) * parsedLimit;
      const endIndex = startIndex + parsedLimit;
      const paginatedVideos = videos.slice(startIndex, endIndex);
      
      const pagination = {
        page: parsedPage,
        limit: parsedLimit,
        total: videos.length,
        totalPages: Math.ceil(videos.length / parsedLimit),
        hasNext: endIndex < videos.length,
        hasPrevious: parsedPage > 1
      };
      
      ResponseFormatter.successPaginated(res, paginatedVideos, pagination);
    }));

    // Endpoint para deletar vídeo (/api/short-video/:id)
    this.router.delete("/short-video/:id", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError("Video ID is required");
      }
      
      await this.shortCreator.deleteVideo(id);
      
      ResponseFormatter.success(res, { 
        message: "Video deleted successfully",
        videoId: id 
      });
    }));

    this.router.post("/remotion-webhook", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      logger.info({ webhook: req.body }, "Received remotion webhook");
      ResponseFormatter.success(res, { message: "Webhook received" });
    }));

    this.router.get("/videos", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const videos = await this.shortCreator.getAllVideos();
      ResponseFormatter.success(res, videos);
    }));

    this.router.get("/video/:id", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { id } = req.params;
      
      if (!id) {
        throw new ValidationError("Video ID is required");
      }
      
      const videoPath = this.shortCreator.getVideoPath(id);

      if (!videoPath || !fs.existsSync(videoPath)) {
        throw new NotFoundError("Video", id);
      }

      try {
        const stat = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;
          const file = fs.createReadStream(videoPath, { start, end });
          const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
          };
          res.writeHead(206, head);
          file.pipe(res);
        } else {
          const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
          };
          res.writeHead(200, head);
          fs.createReadStream(videoPath).pipe(res);
        }
      } catch (error) {
        throw new ProcessingError(`Failed to serve video file: ${error.message}`, id, "file_serving");
      }
    }));

    this.router.get("/tmp/:filename", 
      PathTraversalGuard.middleware(['filename']),
      asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { filename } = req.params;
      
      if (!filename) {
        throw new ValidationError("Filename is required");
      }
      
      // Security: prevent path traversal attacks
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new ValidationError("Invalid filename format");
      }
      
      const audioPath = path.join(this.config.tempDirPath, filename);

      if (!fs.existsSync(audioPath)) {
        throw new NotFoundError("Audio file", filename);
      }

      try {
        const stat = fs.statSync(audioPath);
        const fileSize = stat.size;

        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'audio/wav',
        };
        res.writeHead(200, head);
        fs.createReadStream(audioPath).pipe(res);
      } catch (error) {
        throw new ProcessingError(`Failed to serve audio file: ${error.message}`, undefined, "file_serving");
      }
    }));

    this.router.get("/temp/:filename", 
      asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { filename } = req.params;
      
      if (!filename) {
        throw new ValidationError("Filename is required");
      }
      
      // Security: prevent path traversal attacks
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new ValidationError("Invalid filename format");
      }
      
      const audioPath = path.join(this.config.tempDirPath, filename);

      if (!fs.existsSync(audioPath)) {
        throw new NotFoundError("Audio file", filename);
      }

      try {
        const stat = fs.statSync(audioPath);
        const fileSize = stat.size;

        const isDownload = req.query.download === 'true';
        const head: any = {
          'Content-Length': fileSize,
          'Content-Type': 'audio/wav',
          'Cache-Control': 'public, max-age=3600'
        };
        
        if (isDownload) {
          head['Content-Disposition'] = `attachment; filename="${filename}"`;
        }
        
        res.writeHead(200, head);
        fs.createReadStream(audioPath).pipe(res);
      } catch (error) {
        throw new ProcessingError(`Failed to serve audio file: ${error.message}`, undefined, "file_serving");
      }
    }));

    this.router.get("/cached-video/:filename", (req, res) => {
      const { filename } = req.params;
      const videoPath = this.shortCreator.getCachedVideoPath(filename);

      if (!videoPath || !fs.existsSync(videoPath)) {
        logger.error({ filename, videoPath }, "Cached video file not found");
        return res.status(404).json({ error: "Cached video file not found" });
      }

      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
      }
    });

    this.router.post("/video-data/:id", async (req, res) => {
      const { id } = req.params;
      const videoData = req.body;
      const { processEdition = false, reRender = false } = req.query;
      
      try {
        if (processEdition === 'true') {
          // Pipeline de edição completo
          await this.shortCreator.saveAndProcessVideoEdition(id, videoData);
          
          if (reRender === 'true') {
            // Também inicia re-renderização após processamento
            await this.shortCreator.reRenderEditedVideo(id);
          }
          
          res.status(200).json({ 
            message: "Video edition processed successfully",
            reRenderStarted: reRender === 'true'
          });
        } else {
          // Pipeline simples - apenas salva
          this.shortCreator.saveVideoData(id, videoData);
          res.status(200).json({ message: "Video data saved successfully" });
        }
      } catch (error) {
        logger.error({ error, id }, "Error saving/processing video data");
        res.status(500).json({
          error: "Failed to save/process video data",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.get("/video-data/:id", (req, res) => {
      const { id } = req.params;
      const video = this.shortCreator.getVideoById(id);
      if (video) {
        res.status(200).json(video);
      } else {
        res.status(404).json({ error: "Video data not found" });
      }
    });

    this.router.post("/video-data/:id/rerender", async (req, res) => {
      const { id } = req.params;
      const editedData = req.body; // Dados editados opcionais
      
      try {
        // Extract scenes and config from editedData
        const scenes = editedData.scenes || [];
        const config = editedData.config || {};
        
        // Validate required data
        if (!scenes || scenes.length === 0) {
          logger.warn({ id, editedData }, "No scenes provided for re-render, attempting to load existing data");
          
          // Try to load existing video data
          const existingData = this.shortCreator.getScriptById(id);
          if (existingData && existingData.scenes) {
            await this.shortCreator.reRenderEditedVideo(id, existingData.scenes, existingData.config || {});
          } else {
            return res.status(400).json({
              error: "No scenes provided and no existing video data found",
              details: "Please provide scenes in the request body or ensure video data exists"
            });
          }
        } else {
          // Use provided scenes and config
          await this.shortCreator.reRenderEditedVideo(id, scenes, config);
        }
        
        res.status(202).json({ 
          message: "Video re-render started", 
          videoId: id 
        });
      } catch (error) {
        logger.error({ error, id, editedData }, "Error starting video re-render");
        res.status(500).json({
          error: "Failed to start video re-render",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.post("/video-data/:id/process-edition", async (req, res) => {
      const { id } = req.params;
      const videoData = req.body;
      
      try {
        await this.shortCreator.saveAndProcessVideoEdition(id, videoData);
        res.status(200).json({ 
          message: "Video edition processed successfully",
          videoId: id 
        });
      } catch (error) {
        logger.error({ error, id }, "Error processing video edition");
        res.status(500).json({
          error: "Failed to process video edition",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.get("/script/:id", (req, res) => {
      const { id } = req.params;
      try {
        const script = this.shortCreator.getScriptById(id);
        if (script) {
          res.status(200).json(script);
        } else {
          res.status(404).json({ error: "Script not found" });
        }
      } catch (error) {
        logger.error({ error, id }, "Error getting script");
          res.status(500).json({
          error: "Failed to get script",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.delete("/videos/:id", async (req, res) => {
      const { id } = req.params;
      try {
        await this.shortCreator.deleteVideo(id);
        res.status(200).json({ message: "Video deleted successfully" });
      } catch (error) {
        logger.error({ error, id }, "Error deleting video");
        res.status(500).json({
          error: "Failed to delete video",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    this.router.delete("/videos", (req, res) => {
      try {
        this.shortCreator.clearAllVideos();
        res.status(200).json({ message: "All videos deleted successfully" });
      } catch (error) {
        logger.error({ error }, "Error clearing all videos");
        res.status(500).json({
          error: "Failed to clear all videos",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    this.router.get("/search-videos", async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const query = req.query.query as string;
        if (!query) {
          return res.status(400).json({ error: "Query parameter is required" });
        }
        const videos = await this.shortCreator.searchVideos(query);
        res.status(200).json({ videos });
      } catch (error) {
        logger.error({ error }, "Error searching videos");
          res.status(500).json({
          error: "Failed to search videos",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.post("/generate-tts",
      validateRequest(validationSchemas.ttsRequest),
      APIKeyValidator.requireApiKeys(['openai']),
      asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { text, voice = "Paulo", language = "pt", referenceAudioPath } = req.body;
      
      logger.info({ text, voice, language }, "TTS request received");
      
      if (!text || typeof text !== 'string' || !text.trim()) {
        throw new ValidationError("Text is required and must be a non-empty string");
      }
      
      if (text.trim().length > 1000) {
        throw new ValidationError("Text must be 1000 characters or less");
      }

      // Criar um ID temporário para a geração do TTS
      const tempId = `tts_${Date.now()}`;
      const sceneId = `scene_${Date.now()}`;
      
      // Configuração para o TTS
      const config: RenderConfig = {
        voice: voice as VoiceEnum,
        language: language as "pt" | "en",
        referenceAudioPath: referenceAudioPath || undefined
      };

      const audioResult = await this.shortCreator.generateSingleTTSAndUpdate(
        tempId,
        sceneId,
        text.trim(),
        config,
        false
      );

      if (!audioResult || !audioResult.audioUrl) {
        throw new ProcessingError("Failed to generate TTS audio", tempId, "tts_generation");
      }

      // Extrair o nome do arquivo do caminho
      const filename = path.basename(audioResult.audioUrl);

      ResponseFormatter.success(res, {
        filename,
        duration: audioResult.duration,
        url: `/api/temp/${filename}`,
        text: text.trim()
      });
    }));

    // Static routes moved to main server.ts to avoid conflicts with error handling

    const proxyOptions: Options = {
      target: this.config.remotion.rendering.serveUrl,
      changeOrigin: true,
      pathRewrite: {
        '^/proxy': ''
      }
    };
    this.router.use("/proxy", createProxyMiddleware(proxyOptions));

    this.router.post("/force-refresh/:id", async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { id } = req.params;
        
        // Força uma atualização do status baseado no estado real dos arquivos
        const videoPath = this.shortCreator.getVideoPath(id);
        const videoExists = fs.existsSync(videoPath);
        
        if (videoExists) {
          await this.videoStatusManager.setStatus(id, "ready", "Video file exists", 100, "Completed");
        } else {
          await this.videoStatusManager.setError(id, "Video file not found");
        }
        
        // Retorna o status atualizado
        const updatedStatus = await this.shortCreator.status(id);
        res.status(200).json({
          message: "Status refreshed",
          videoId: id,
          status: updatedStatus
        });
      } catch (error) {
        logger.error({ error }, "Error refreshing video status");
            res.status(500).json({
          error: "Failed to refresh video status",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.get("/cache/stats", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const stats = this.shortCreator.getCacheStats();
      ResponseFormatter.success(res, stats);
    }));

    this.router.post("/cache/cleanup", async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { maxAgeHours = 24 } = req.body;
        await this.shortCreator.cleanupVideoCache(maxAgeHours);
        const newStats = this.shortCreator.getCacheStats();
        res.status(200).json({
          message: "Cache cleanup completed",
          stats: newStats
        });
      } catch (error) {
        logger.error({ error }, "Error cleaning up cache");
          res.status(500).json({
          error: "Failed to cleanup cache",
          details: error instanceof Error ? error.message : "Unknown error",
          });
        }
    });

    // Endpoint para buscar vídeos de fundo
    this.router.post("/search-background-videos",
      validateRequest(validationSchemas.searchQuery),
      asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const { query, count = 5, orientation = "portrait", excludeIds = [] } = req.body;
      
      if (!query || typeof query !== 'string' || !query.trim()) {
        throw new ValidationError("Search query is required and must be a non-empty string");
      }
      
      const parsedCount = parseInt(count, 10);
      if (isNaN(parsedCount) || parsedCount < 1 || parsedCount > 50) {
        throw new ValidationError("Count must be a number between 1 and 50");
      }
      
      if (!Array.isArray(excludeIds)) {
        throw new ValidationError("excludeIds must be an array");
      }

      const videos = await this.shortCreator.searchVideos(query.trim());
      
      // Filtrar e limitar resultados
      const filteredVideos = videos
        .filter((video: any) => !excludeIds.includes(video.id))
        .slice(0, parsedCount);

      ResponseFormatter.success(res, {
        videos: filteredVideos,
        query: query.trim(),
        count: filteredVideos.length,
        orientation,
        excludeIds: excludeIds.length
      });
    }));

    // Endpoint para substituir vídeo em uma cena específica
    this.router.post("/replace-scene-video", async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { videoId, sceneIndex, videoIndex, newVideoUrl, searchQuery } = req.body;
        
        if (!videoId || sceneIndex === undefined || videoIndex === undefined) {
          return res.status(400).json({ error: "videoId, sceneIndex, and videoIndex are required" });
        }

        // Se não há newVideoUrl, buscar um novo vídeo baseado na query
        let finalVideoUrl = newVideoUrl;
        if (!finalVideoUrl && searchQuery) {
          const searchResults = await this.shortCreator.searchVideos(searchQuery);
          if (searchResults.length > 0) {
            finalVideoUrl = searchResults[0].url;
          }
        }

        if (!finalVideoUrl) {
          return res.status(400).json({ error: "Either newVideoUrl or searchQuery must be provided" });
        }

        // Atualizar o vídeo da cena
        const videoData = this.shortCreator.getVideoById(videoId);
        if (!videoData || !videoData.scenes || !videoData.scenes[sceneIndex]) {
          return res.status(404).json({ error: "Video or scene not found" });
        }

        if (!videoData.scenes[sceneIndex].videos) {
          videoData.scenes[sceneIndex].videos = [];
        }

        videoData.scenes[sceneIndex].videos[videoIndex] = finalVideoUrl;
        
        // Salvar os dados atualizados
        this.shortCreator.saveVideoData(videoId, videoData);

        res.status(200).json({
          message: "Scene video replaced successfully",
          videoId,
          sceneIndex,
          videoIndex,
          newVideoUrl: finalVideoUrl
        });
      } catch (error) {
        logger.error({ error }, "Error replacing scene video");
        res.status(500).json({
          error: "Failed to replace scene video",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Endpoint para listar vozes disponíveis
    this.router.get("/voices", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const voices = this.shortCreator.ListAvailableVoices();
        res.status(200).json(voices);
      } catch (error) {
        logger.error({ error }, "Error listing voices");
        res.status(500).json({
          error: "Failed to list voices",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Endpoint para listar tags de música
    this.router.get("/music-tags", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const tags = this.shortCreator.ListAvailableMusicTags();
        res.status(200).json(tags);
      } catch (error) {
        logger.error({ error }, "Error listing music tags");
        res.status(500).json({
          error: "Failed to list music tags",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Endpoint para regenerar áudio de uma cena específica
    this.router.post("/regenerate-scene-audio", async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { videoId, sceneId, text, voice, language } = req.body;
        
        if (!videoId || !sceneId || !text) {
          return res.status(400).json({ error: "videoId, sceneId, and text are required" });
        }

        const config: RenderConfig = {
          voice: voice || VoiceEnum.Paulo,
          language: language || "pt"
        };

        const audioResult = await this.shortCreator.generateSingleTTSAndUpdate(
          videoId,
          sceneId,
          text,
          config,
          true // forceRegenerate
        );

        res.status(200).json({
          message: "Scene audio regenerated successfully",
          audioUrl: audioResult.audioUrl,
          duration: audioResult.duration,
          subtitles: audioResult.subtitles
        });
      } catch (error) {
        logger.error({ error }, "Error regenerating scene audio");
        res.status(500).json({
          error: "Failed to regenerate scene audio",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Endpoint para estatísticas do dashboard
    this.router.get("/dashboard/stats", asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
      const videos = await this.shortCreator.getAllVideos();
      
      const stats = {
        totalVideos: videos.length,
        completedVideos: videos.filter((v: any) => v.status === 'ready').length,
        processingVideos: videos.filter((v: any) => v.status === 'processing').length,
        failedVideos: videos.filter((v: any) => v.status === 'failed').length,
        pendingVideos: videos.filter((v: any) => v.status === 'pending').length,
        todayVideos: videos.filter((v: any) => {
          const today = new Date().toDateString();
          return new Date(v.createdAt || Date.now()).toDateString() === today;
        }).length,
        totalDuration: videos.reduce((total: number, video: any) => {
          return total + (video.duration || 0);
        }, 0)
      };

      ResponseFormatter.success(res, stats);
    }));

    // AI Service Configuration
    const geminiClient = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
    const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

    interface AIProvider {
      name: string;
      generateText: (prompt: string) => Promise<string>;
    }

    class GeminiProvider implements AIProvider {
      name = 'Gemini';
      private model = geminiClient?.getGenerativeModel({ model: 'gemini-1.5-flash' });

      async generateText(prompt: string): Promise<string> {
        if (!this.model) throw new Error('Gemini API key not configured');
        
        try {
          logger.info('Attempting to generate content with Gemini...');
          const result = await this.model.generateContent(prompt);
          const response = await result.response;
          const text = response.text();
          logger.info(`Gemini response received: ${text.length} characters`);
          return text;
        } catch (error) {
          logger.error('Gemini API error:', error);
          throw new Error(`Gemini API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    class OpenAIProvider implements AIProvider {
      name = 'OpenAI';

      async generateText(prompt: string): Promise<string> {
        if (!openaiClient) throw new Error('OpenAI API key not configured');
        
        try {
          logger.info('Attempting to generate content with OpenAI...');
          const completion = await openaiClient.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1500,
            temperature: 0.7,
          });
          
          const content = completion.choices[0]?.message?.content || 'No response generated';
          logger.info(`OpenAI response received: ${content.length} characters`);
          return content;
        } catch (error) {
          logger.error('OpenAI API error:', error);
          throw new Error(`OpenAI API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    const aiProviders: AIProvider[] = [
      ...(geminiClient ? [new GeminiProvider()] : []),
      ...(openaiClient ? [new OpenAIProvider()] : []),
    ];

    const getAvailableProvider = (): AIProvider => {
      if (aiProviders.length === 0) {
        throw new Error('No AI providers configured. Please set GEMINI_API_KEY and/or OPENAI_API_KEY in environment variables.');
      }
      // Use Gemini by default, fallback to OpenAI
      return aiProviders.find(p => p.name === 'Gemini') || aiProviders[0];
    };

    // AI Script Generation endpoint
    this.router.post('/generate-ai-script', async (req, res) => {
      try {
        const { type, topic, style, duration, customPrompt } = req.body;
        
        if (!type || !topic) {
          return res.status(400).json({ 
            error: 'Type and topic are required' 
          });
        }

        const provider = getAvailableProvider();
        logger.info(`Using AI provider: ${provider.name} for script generation`);

        // Build comprehensive prompt
        let prompt = '';
        
        if (customPrompt) {
          prompt = `${customPrompt}\n\nTopic: ${topic}`;
        } else {
          const templates = {
            marketing: `Create a compelling marketing script for: ${topic}
            
Style: ${style || 'Professional and engaging'}
Duration: ${duration || '30-60 seconds'}

Structure the script with:
1. Hook (attention-grabbing opening)
2. Problem/Need identification
3. Solution presentation
4. Benefits and value proposition
5. Call to action

Make it conversational, persuasive, and optimized for social media consumption.`,

            productivity: `Create a productivity-focused script about: ${topic}

Style: ${style || 'Educational and actionable'}
Duration: ${duration || '30-60 seconds'}

Structure:
1. Quick problem statement
2. 3-5 actionable tips or strategies
3. Expected outcomes/benefits
4. Encouragement to implement

Keep it practical, concise, and immediately applicable.`,

            health: `Create a health and wellness script about: ${topic}

Style: ${style || 'Informative and motivational'}
Duration: ${duration || '30-60 seconds'}

Include:
1. Health concern or goal
2. Evidence-based information
3. Practical steps or recommendations
4. Benefits and motivation
5. Disclaimer about consulting professionals

Make it accurate, encouraging, and easy to understand.`,

            finance: `Create a financial education script about: ${topic}

Style: ${style || 'Educational and trustworthy'}
Duration: ${duration || '30-60 seconds'}

Cover:
1. Financial concept or problem
2. Clear explanation with examples
3. Practical steps or strategies
4. Potential benefits/outcomes
5. Risk awareness where applicable

Make it accessible to beginners while being informative.`,

            general: `Create an engaging video script about: ${topic}

Style: ${style || 'Engaging and informative'}
Duration: ${duration || '30-60 seconds'}

Structure:
1. Compelling hook
2. Main content (key points)
3. Supporting details or examples
4. Conclusion with impact
5. Call to action if appropriate

Make it suitable for short-form video content.`
          };

          prompt = templates[type as keyof typeof templates] || templates.general;
        }

        // Add specific instructions for structured video format
        prompt += `\n\nIMPORTANT: Return a valid JSON object with the following structure:
{
  "title": "Short title for the video (max 60 chars)",
  "description": "Brief description of the video content",
  "scenes": [
    {
      "sceneNumber": 1,
      "text": "The actual script text for this scene (15-25 words max)",
      "duration": "estimated duration in seconds (3-8 seconds)",
      "searchKeywords": ["keyword1", "keyword2", "keyword3"],
      "visualSuggestion": "Description of what should be shown visually"
    }
  ]
}

Guidelines:
- Create 4-6 scenes total
- Each scene should be 15-25 words (3-8 seconds when spoken)
- searchKeywords should be 3-5 relevant terms for finding background videos
- Keep it engaging and well-paced
- Ensure smooth transitions between scenes
- Make it suitable for ${duration} total duration`;

        const generatedText = await provider.generateText(prompt);

        // Try to parse JSON response
        let structuredScript;
        try {
          // Clean up the response to extract JSON
          const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            structuredScript = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } catch (parseError) {
          // Fallback: create structured data from text response
          logger.warn('Failed to parse AI JSON response, creating fallback structure');
          const sentences = generatedText.split(/[.!?]+/).filter(s => s.trim().length > 10);
          structuredScript = {
            title: `${topic} - Video Script`,
            description: `Engaging video about ${topic}`,
            scenes: sentences.slice(0, 5).map((sentence, index) => ({
              sceneNumber: index + 1,
              text: sentence.trim().substring(0, 100),
              duration: "5-7 seconds",
              searchKeywords: topic.split(' ').concat(['video', 'background']).slice(0, 4),
              visualSuggestion: `Visual content related to: ${sentence.trim().substring(0, 50)}...`
            }))
          };
        }

        // Parse and structure the response
        const response = {
          script: structuredScript,
          rawText: generatedText,
          metadata: {
            type,
            topic,
            style: style || 'default',
            duration: duration || '30-60 seconds',
            aiProvider: provider.name,
            generatedAt: new Date().toISOString(),
            totalScenes: structuredScript.scenes?.length || 0,
            estimatedDuration: structuredScript.scenes?.reduce((total: number, scene: any) => {
              const sceneDuration = parseInt(scene.duration) || 5;
              return total + sceneDuration;
            }, 0) || 30
          }
        };

        logger.info(`Generated script using ${provider.name}: ${response.metadata.totalScenes} scenes, ~${response.metadata.estimatedDuration}s duration`);
        res.json(response);

      } catch (error) {
        logger.error('Error in /api/generate-ai-script:', error);
        
        // Determine the specific error message
        let errorMessage = 'AI service unavailable - using fallback template';
        if (error instanceof Error) {
          if (error.message.includes('Gemini API failed')) {
            errorMessage = 'Gemini API error - check your GEMINI_API_KEY';
          } else if (error.message.includes('OpenAI API failed')) {
            errorMessage = 'OpenAI API error - check your OPENAI_API_KEY';
          } else if (error.message.includes('No AI providers configured')) {
            errorMessage = 'No AI API keys configured - add GEMINI_API_KEY or OPENAI_API_KEY to .env';
          }
        }
        
        // Fallback response if AI fails
        const fallbackScript = `Script for ${req.body.topic || 'your topic'}:

[Attention-grabbing opening]
Did you know that ${req.body.topic} can completely transform your results?

[Main content]
Here's what most people don't realize...
${req.body.topic} is actually simpler than you think when you follow these key principles.

[Key points - adapt based on your specific topic]
First, understand the fundamentals.
Second, take consistent action.
Third, measure and adjust your approach.

[Conclusion]
The bottom line is this: ${req.body.topic} works when you commit to the process.

[Call to action]
Try this approach and let me know your results in the comments!

(Visual note: Use engaging visuals that support each key point)`;

        // Create fallback structured script
        const fallbackStructured = {
          title: `${req.body.topic || 'Video'} - Script Gerado`,
          description: `Script automático sobre ${req.body.topic || 'o tópico selecionado'}`,
          scenes: [
            {
              sceneNumber: 1,
              text: `Você sabia que ${req.body.topic || 'este tópico'} pode transformar completamente seus resultados?`,
              duration: "6 seconds",
              searchKeywords: [req.body.topic || 'topic', 'motivation', 'success'],
              visualSuggestion: "Close-up of a person looking surprised or amazed"
            },
            {
              sceneNumber: 2,
              text: `A maioria das pessoas não percebe o verdadeiro potencial de ${req.body.topic || 'esta área'}.`,
              duration: "7 seconds", 
              searchKeywords: [req.body.topic || 'topic', 'potential', 'discovery'],
              visualSuggestion: "Wide shot showing contrast or before/after scenarios"
            },
            {
              sceneNumber: 3,
              text: `Na verdade, quando você domina os fundamentos, tudo fica mais simples.`,
              duration: "6 seconds",
              searchKeywords: ['fundamentals', 'learning', 'simple'],
              visualSuggestion: "Person confidently working or demonstrating mastery"
            },
            {
              sceneNumber: 4,
              text: `Comece aplicando essas estratégias hoje e veja a diferença na sua vida!`,
              duration: "7 seconds",
              searchKeywords: ['action', 'change', 'success', 'motivation'],
              visualSuggestion: "Energetic montage of successful outcomes"
            }
          ]
        };

        res.json({
          script: fallbackStructured,
          metadata: {
            type: req.body.type || 'general',
            topic: req.body.topic || 'Unknown',
            style: 'fallback',
            duration: req.body.duration || '30-60 seconds',
            aiProvider: 'Fallback',
            generatedAt: new Date().toISOString(),
            totalScenes: fallbackStructured.scenes.length,
            estimatedDuration: fallbackStructured.scenes.reduce((total, scene) => total + parseInt(scene.duration), 0),
            warning: errorMessage,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    // Endpoint para criar vídeo a partir de script de IA
    this.router.post('/create-video-from-script', async (req, res) => {
      try {
        const { script, metadata, voiceConfig } = req.body;
        
        if (!script || !script.scenes || !Array.isArray(script.scenes)) {
          return res.status(400).json({ error: 'Invalid script structure' });
        }

        logger.info(`Creating video from AI script: ${script.title}`);

        // Configurações padrão
        const config: RenderConfig = {
          voice: voiceConfig?.voice || VoiceEnum.Paulo,
          language: voiceConfig?.language || "pt",
          orientation: voiceConfig?.orientation || OrientationEnum.portrait,
          music: voiceConfig?.music || MusicMoodEnum.happy,
          ...voiceConfig
        };

        // Converter cenas do AI para o formato SceneInput
        const scenes: SceneInput[] = script.scenes.map((scene: any) => ({
          text: scene.text,
          searchTerms: scene.searchKeywords || [],
        }));

        // Criar o vídeo usando o sistema de filas do ShortCreator
        const videoId = this.shortCreator.addToQueue(scenes, config);
        
        logger.info(`Video ${videoId} added to creation queue with ${scenes.length} scenes`);

        res.status(201).json({
          success: true,
          videoId,
          message: 'Video creation started from AI script',
          scenes: scenes.length,
          editUrl: `/edit/${videoId}`,
          status: 'pending'
        });

      } catch (error) {
        logger.error('Error creating video from script:', error);
        res.status(500).json({
          error: 'Failed to create video from script',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Video Provider Management Endpoints
    this.router.get("/video-providers/stats", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const facade = this.shortCreator.getVideoProviderFacade?.();
        if (!facade) {
          return res.status(503).json({ error: "Video provider facade not available" });
        }
        
        const providerStats = facade.getProviderStats();
        const usageStats = facade.getUsageStats();
        const rateLimitStats = facade.getRateLimitStats();
        
        res.status(200).json({
          providers: providerStats,
          usage: usageStats,
          rateLimits: rateLimitStats,
        });
      } catch (error) {
        logger.error({ error }, "Error getting video provider stats");
        res.status(500).json({
          error: "Failed to get video provider stats",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.get("/video-providers/negative-keywords", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const facade = this.shortCreator.getVideoProviderFacade?.();
        if (!facade) {
          return res.status(503).json({ error: "Video provider facade not available" });
        }
        
        const keywords = facade.getNegativeKeywords();
        res.status(200).json({ keywords });
      } catch (error) {
        logger.error({ error }, "Error getting negative keywords");
        res.status(500).json({
          error: "Failed to get negative keywords",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.post("/video-providers/negative-keywords", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { keywords } = req.body;
        
        if (!Array.isArray(keywords)) {
          return res.status(400).json({ error: "Keywords must be an array" });
        }

        const facade = this.shortCreator.getVideoProviderFacade?.();
        if (!facade) {
          return res.status(503).json({ error: "Video provider facade not available" });
        }
        
        facade.addNegativeKeywords(keywords);
        res.status(200).json({ 
          message: "Negative keywords added successfully",
          addedCount: keywords.length
        });
      } catch (error) {
        logger.error({ error }, "Error adding negative keywords");
        res.status(500).json({
          error: "Failed to add negative keywords",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.delete("/video-providers/negative-keywords", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { keywords } = req.body;
        
        if (!Array.isArray(keywords)) {
          return res.status(400).json({ error: "Keywords must be an array" });
        }

        const facade = this.shortCreator.getVideoProviderFacade?.();
        if (!facade) {
          return res.status(503).json({ error: "Video provider facade not available" });
        }
        
        facade.removeNegativeKeywords(keywords);
        res.status(200).json({ 
          message: "Negative keywords removed successfully",
          removedCount: keywords.length
        });
      } catch (error) {
        logger.error({ error }, "Error removing negative keywords");
        res.status(500).json({
          error: "Failed to remove negative keywords",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.get("/video-providers/usage-history", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { projectId, limit = 100 } = req.query;

        const facade = this.shortCreator.getVideoProviderFacade?.();
        if (!facade) {
          return res.status(503).json({ error: "Video provider facade not available" });
        }
        
        const history = facade.getUsageHistory?.(projectId as string, Number(limit));
        
        if (!history) {
          return res.status(200).json({ history: [], message: "Usage history not available" });
        }
        
        res.status(200).json({ 
          history,
          projectId: projectId || 'all',
          totalEntries: history.length
        });
      } catch (error) {
        logger.error({ error }, "Error getting usage history");
        res.status(500).json({
          error: "Failed to get usage history",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Video proxy endpoint to handle CORS issues
    this.router.options("/video-proxy", (req: ExpressRequest, res: ExpressResponse) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      res.setHeader('Access-Control-Max-Age', '3600');
      res.sendStatus(204);
    });
    
    this.router.get("/video-proxy", async (req: ExpressRequest, res: ExpressResponse) => {
      const videoProxy = require("../routes/videoProxy").videoProxy;
      await videoProxy(req, res);
    });


    // Video search configuration routes
    const { videoSearchConfigRouter } = require("../routes/videoSearchConfig");
    this.router.use("/video-search", videoSearchConfigRouter);

    // Translation routes
    if (this.translationService && this.transcriptionService) {
      initializeTranslationRoutes(this.translationService, this.transcriptionService);
      this.router.use("/translation", translationRoutes);
      logger.info('Translation routes initialized');
    } else {
      logger.warn('Translation service not available, skipping translation routes');
    }
  }
}
