import express, { Router, Request, Response } from "express";
import { z } from 'zod';
import { logger } from '../../logger';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { VideoImportService } from '../../services/VideoImportService';
import { OllamaService } from '../../services/OllamaService';
import { TranslationService } from '../../services/TranslationService';
import { ImportPipelineService } from '../../services/ImportPipelineService';
import { EventBus } from '../events/EventBus';
import path from 'path';

// Validation schemas
const AnalyzeUrlSchema = z.object({
  url: z.string().url(),
  options: z.object({
    includeTranscript: z.boolean().optional(),
    detectSegments: z.boolean().optional(),
    analyzeContent: z.boolean().optional()
  }).optional()
});

const ProcessImportSchema = z.object({
  url: z.string().url(),
  config: z.object({
    segmentDetection: z.object({
      method: z.enum(['scene-change', 'transcript', 'ai-analysis', 'fixed-duration']),
      threshold: z.number().optional(),
      duration: z.number().optional()
    }).optional(),
    contentAnalysis: z.object({
      extractKeywords: z.boolean().optional(),
      generateSummary: z.boolean().optional(),
      detectHighlights: z.boolean().optional()
    }).optional(),
    translation: z.object({
      enabled: z.boolean().optional(),
      targetLanguage: z.string().optional(),
      preserveOriginal: z.boolean().optional()
    }).optional()
  }).optional()
});

const UpdateSegmentsSchema = z.object({
  segments: z.array(z.object({
    id: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    title: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional()
  }))
});

const HighlightsSchema = z.object({
  prompt: z.string().optional(),
  maxHighlights: z.number().optional(),
  minDuration: z.number().optional(),
  criteria: z.array(z.string()).optional()
});

const OllamaAnalysisSchema = z.object({
  content: z.string(),
  prompt: z.string(),
  model: z.string().optional().default('llama2'),
  options: z.object({
    temperature: z.number().optional(),
    maxTokens: z.number().optional()
  }).optional()
});

const TranslateSchema = z.object({
  text: z.string().min(1, "Text cannot be empty"),
  targetLanguage: z.string().min(2, "Target language must be specified"),
  sourceLanguage: z.string().optional()
});

// Enhanced request/response type definitions
export interface AnalyzeUrlResponse {
  success: boolean;
  metadata: {
    title: string;
    duration: number;
    format: string;
    resolution: string;
    fileSize: number;
    fps: number;
    codec: string;
    audioCodec: string;
    thumbnail: string;
    canDownload: boolean;
    estimatedProcessingTime: number;
    platform: string;
    sourceUrl: string;
    transcript?: string;
    language?: string;
    hasClosedCaptions?: boolean;
    suggestedSegments?: Array<{
      startTime: number;
      endTime: number;
      confidence: number;
    }>;
  };
  url: string;
  analyzedAt: string;
}

export interface ProcessImportResponse {
  success: boolean;
  jobId: string;
  message: string;
  statusUrl: string;
}

export interface ImportStatusResponse {
  id: string;
  url: string;
  status: ImportJob['status'];
  progress: number;
  metadata?: any;
  segmentCount: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SegmentsResponse {
  segments: Array<{
    id: string;
    startTime: number;
    endTime: number;
    title?: string;
    description?: string;
    keywords?: string[];
  }>;
  metadata: {
    totalDuration: number;
    segmentCount: number;
  };
}

export interface HighlightsResponse {
  highlights: Array<{
    segmentId: string;
    startTime: number;
    endTime: number;
    score: number;
    reason: string;
    suggestedTitle: string;
  }>;
  criteria: string[];
  totalAnalyzed: number;
}

export interface OllamaAnalysisResponse {
  success: boolean;
  analysis: string;
  model: string;
  totalDuration?: number;
  promptEvalCount?: number;
  analyzedAt: string;
  error?: string;
  fallback?: boolean;
}

export interface TranslationLanguagesResponse {
  languages: Array<{
    code: string;
    name: string;
    nativeName: string;
  }>;
  defaultSource: string;
  defaultTarget: string;
}

export interface TranslateTextResponse {
  success: boolean;
  translation: {
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
    confidence: number;
    alternatives: string[];
    provider?: string;
  };
  translatedAt: string;
}

// Mock storage for import jobs (in production, use a database)
interface ImportJob {
  id: string;
  url: string;
  status: 'pending' | 'analyzing' | 'downloading' | 'processing' | 'segmenting' | 'completed' | 'failed';
  progress: number;
  metadata?: {
    title?: string;
    duration?: number;
    format?: string;
    resolution?: string;
    fileSize?: number;
    transcript?: string;
  };
  segments?: Array<{
    id: string;
    startTime: number;
    endTime: number;
    title?: string;
    description?: string;
    keywords?: string[];
  }>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const importJobs = new Map<string, ImportJob>();

export class ImportRouter {
  router: Router;
  private videoImportService: VideoImportService;
  private ollamaService: OllamaService;
  private translationService: TranslationService;
  private importPipelineService: ImportPipelineService;
  private eventBus: EventBus;

  constructor() {
    this.router = Router();
    this.router.use(express.json());
    
    // Initialize services
    this.eventBus = EventBus.getInstance();
    this.videoImportService = new VideoImportService(process.cwd() + '/data');
    this.ollamaService = new OllamaService();
    this.translationService = new TranslationService(process.cwd() + '/data', {
      openai: process.env.OPENAI_API_KEY,
      google: process.env.GEMINI_API_KEY,
      deepl: process.env.DEEPL_API_KEY
    });
    this.importPipelineService = new ImportPipelineService({
      dataDir: process.cwd() + '/data',
      enableOllama: process.env.OLLAMA_HOST !== undefined,
      ollamaConfig: {
        baseUrl: (() => {
          const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
          return host.startsWith('http') ? host : `http://${host}:11434`;
        })(),
        defaultModel: process.env.OLLAMA_MODEL || 'llama2'
      }
    });
    
    this.setupRoutes();
  }

  private setupRoutes() {
    // POST /api/import/analyze - Analyze URL and get video metadata
    this.router.post("/analyze", async (req: Request, res: Response) => {
      try {
        const validatedData = AnalyzeUrlSchema.parse(req.body);
        const { url, options } = validatedData;

        logger.info({ url, options }, "Analyzing video URL");

        // Use VideoImportService for actual analysis
        const analysisResult = await this.videoImportService.analyzeUrl(url, {
          includeMetadata: true,
          validateSource: true,
          checkDownloadability: true,
          extractBasicInfo: true
        });

        const metadata = {
          title: analysisResult.title || "Unknown Video",
          duration: analysisResult.duration || 0,
          format: analysisResult.format || "unknown",
          resolution: analysisResult.resolution || "unknown",
          fileSize: analysisResult.fileSize || 0,
          fps: analysisResult.fps || 30,
          codec: analysisResult.videoCodec || "unknown",
          audioCodec: analysisResult.audioCodec || "unknown",
          thumbnail: analysisResult.thumbnail || `/api/thumbnail/placeholder.jpg`,
          canDownload: analysisResult.canDownload || false,
          estimatedProcessingTime: Math.ceil((analysisResult.duration || 0) / 5), // Rough estimate
          platform: analysisResult.platform || 'unknown',
          sourceUrl: url
        };

        // If transcript requested, check if available
        if (options?.includeTranscript && analysisResult.hasSubtitles) {
          Object.assign(metadata, {
            transcript: analysisResult.subtitles || "Transcript extraction will be performed during full import",
            language: analysisResult.language || "auto-detect",
            hasClosedCaptions: analysisResult.hasSubtitles || false
          });
        }

        // If segment detection requested, provide basic segmentation hints
        if (options?.detectSegments) {
          const duration = analysisResult.duration || 300;
          const segmentCount = Math.min(6, Math.max(3, Math.ceil(duration / 60)));
          const segmentDuration = duration / segmentCount;
          
          const suggestedSegments = Array.from({ length: segmentCount }, (_, i) => ({
            startTime: i * segmentDuration,
            endTime: Math.min((i + 1) * segmentDuration, duration),
            confidence: 0.8 - (i * 0.05) // Decreasing confidence
          }));
          
          Object.assign(metadata, { suggestedSegments });
        }

        res.status(200).json({
          success: true,
          metadata,
          url,
          analyzedAt: new Date().toISOString()
        });
      } catch (error) {
        logger.error({ error }, "Error analyzing video URL");
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid request data",
            details: error.errors
          });
        }
        res.status(500).json({
          error: "Failed to analyze video",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    // POST /api/import/process - Start full import and processing
    this.router.post("/process", async (req: Request, res: Response) => {
      try {
        logger.info('Received import process request', { body: req.body });
        const validatedData = ProcessImportSchema.parse(req.body);
        const { url, config } = validatedData;

        const jobId = crypto.randomUUID();
        const job: ImportJob = {
          id: jobId,
          url,
          status: 'pending',
          progress: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        importJobs.set(jobId, job);

        // Start actual import processing
        this.startImportProcess(jobId, url, config);

        logger.info({ jobId, url }, "Import job created");

        res.status(202).json({
          success: true,
          jobId,
          message: "Import process started",
          statusUrl: `/api/import/${jobId}/status`
        });
      } catch (error) {
        logger.error({ error, requestBody: req.body }, "Error starting import process");
        if (error instanceof z.ZodError) {
          logger.error({ zodErrors: error.errors, requestBody: req.body }, "Validation failed");
          return res.status(400).json({
            error: "Invalid request data",
            details: error.errors
          });
        }
        res.status(500).json({
          error: "Failed to start import process",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    // GET /api/import/:id/status - Get import job status with progress
    this.router.get("/:id/status", async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const job = importJobs.get(id);

        if (!job) {
          return res.status(404).json({
            error: "Import job not found"
          });
        }

        res.status(200).json({
          id: job.id,
          url: job.url,
          status: job.status,
          progress: job.progress,
          metadata: job.metadata,
          segmentCount: job.segments?.length || 0,
          error: job.error,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt
        });
      } catch (error) {
        logger.error({ error }, "Error getting import status");
        res.status(500).json({
          error: "Failed to get import status",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    // GET /api/import/:id/segments - Get detected segments
    this.router.get("/:id/segments", async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const job = importJobs.get(id);

        if (!job) {
          return res.status(404).json({
            error: "Import job not found"
          });
        }

        if (!job.segments || job.status !== 'completed') {
          return res.status(400).json({
            error: "Segments not available",
            status: job.status
          });
        }

        res.status(200).json({
          segments: job.segments,
          metadata: {
            totalDuration: job.metadata?.duration || 0,
            segmentCount: job.segments.length
          }
        });
      } catch (error) {
        logger.error({ error }, "Error getting segments");
        res.status(500).json({
          error: "Failed to get segments",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    // PUT /api/import/:id/segments - Update segment boundaries
    this.router.put("/:id/segments", async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const validatedData = UpdateSegmentsSchema.parse(req.body);
        
        const job = importJobs.get(id);
        if (!job) {
          return res.status(404).json({
            error: "Import job not found"
          });
        }

        // Update segments
        job.segments = validatedData.segments;
        job.updatedAt = new Date();

        logger.info({ jobId: id, segmentCount: job.segments.length }, "Segments updated");

        res.status(200).json({
          success: true,
          message: "Segments updated successfully",
          segments: job.segments
        });
      } catch (error) {
        logger.error({ error }, "Error updating segments");
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid segment data",
            details: error.errors
          });
        }
        res.status(500).json({
          error: "Failed to update segments",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    // POST /api/import/:id/highlights - Get AI-detected highlights
    this.router.post("/:id/highlights", async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const validatedData = HighlightsSchema.parse(req.body);
        
        const job = importJobs.get(id);
        if (!job) {
          return res.status(404).json({
            error: "Import job not found"
          });
        }

        if (!job.segments || job.status !== 'completed') {
          return res.status(400).json({
            error: "Cannot detect highlights before import is completed"
          });
        }

        // Mock highlight detection (in production, use AI service)
        const highlights = job.segments
          .filter((_, index) => index % 2 === 0) // Mock: every other segment is a highlight
          .slice(0, validatedData.maxHighlights || 5)
          .map(segment => ({
            segmentId: segment.id,
            startTime: segment.startTime,
            endTime: segment.endTime,
            score: Math.random() * 0.5 + 0.5, // Random score between 0.5 and 1
            reason: "High engagement potential",
            suggestedTitle: segment.title || "Highlight " + segment.id.substring(0, 8)
          }));

        res.status(200).json({
          highlights,
          criteria: validatedData.criteria || ["engagement", "visual-quality", "audio-clarity"],
          totalAnalyzed: job.segments.length
        });
      } catch (error) {
        logger.error({ error }, "Error detecting highlights");
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid highlight parameters",
            details: error.errors
          });
        }
        res.status(500).json({
          error: "Failed to detect highlights",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

  }

  // Create a separate method to set up Ollama routes that will be mounted at /api/ollama
  public getOllamaRouter(): Router {
    const ollamaRouter = Router();
    ollamaRouter.use(express.json());

    // POST /api/ollama/analyze - Direct Ollama analysis endpoint
    ollamaRouter.post("/analyze", async (req: Request, res: Response) => {
      try {
        const validatedData = OllamaAnalysisSchema.parse(req.body);
        const { content, prompt, model, options } = validatedData;

        logger.info({ model, prompt: prompt.substring(0, 50) }, "Ollama analysis requested");

        // Check if Ollama is configured
        const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
        
        try {
          // Use OllamaService for analysis
          const result = await this.ollamaService.analyzeContent(content, {
            prompt,
            model,
            temperature: options?.temperature || 0.7,
            maxTokens: options?.maxTokens || 500
          });

          res.status(200).json({
            success: true,
            analysis: result.response,
            model: result.model || model,
            totalDuration: result.totalDuration,
            promptEvalCount: result.promptEvalCount,
            analyzedAt: new Date().toISOString()
          });
        } catch (ollamaError) {
          logger.warn({ error: ollamaError }, "Ollama not available, using fallback response");
          
          // Fallback response when Ollama is not available
          res.status(200).json({
            success: false,
            error: "Ollama service not available",
            analysis: "Please ensure Ollama is running and the specified model is available",
            model: "unavailable",
            details: ollamaError instanceof Error ? ollamaError.message : "Unknown error",
            fallback: true
          });
        }
      } catch (error) {
        logger.error({ error }, "Error in Ollama analysis");
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid analysis request",
            details: error.errors
          });
        }
        res.status(500).json({
          error: "Failed to analyze content",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    return ollamaRouter;
  }

  // Create a separate method to set up Translation routes that will be mounted at /api/translation
  public getTranslationRouter(): Router {
    const translationRouter = Router();
    translationRouter.use(express.json());

    // GET /api/translation/languages - Get supported translation languages
    translationRouter.get("/languages", async (req: Request, res: Response) => {
      try {
        // Get supported languages from translation service
        const languages = await this.translationService.getSupportedLanguages();

        res.status(200).json({
          languages,
          defaultSource: 'auto',
          defaultTarget: 'en'
        });
      } catch (error) {
        logger.error({ error }, "Error getting supported languages");
        res.status(500).json({
          error: "Failed to get supported languages",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    // POST /api/translation/translate - Translate text
    translationRouter.post("/translate", async (req: Request, res: Response) => {
      try {
        const validatedData = TranslateSchema.parse(req.body);
        const { text, targetLanguage, sourceLanguage } = validatedData;

        logger.info({ 
          sourceLanguage: sourceLanguage || 'auto', 
          targetLanguage,
          textLength: text.length 
        }, "Translation requested");

        // Use TranslationService for actual translation
        const translationResult = await this.translationService.translateText({
          text,
          sourceLanguage,
          targetLanguage,
          includeAlternatives: true
        });

        res.status(200).json({
          success: true,
          translation: {
            translatedText: translationResult.translatedText,
            sourceLanguage: translationResult.detectedSourceLanguage || sourceLanguage || 'auto',
            targetLanguage,
            confidence: translationResult.confidence || 0.95,
            alternatives: translationResult.alternatives || [],
            provider: translationResult.provider
          },
          translatedAt: new Date().toISOString()
        });
      } catch (error) {
        logger.error({ error }, "Error translating text");
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: "Invalid translation request",
            details: error.errors
          });
        }
        res.status(500).json({
          error: "Failed to translate text",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    return translationRouter;
  }

  // Start actual import process
  private async startImportProcess(jobId: string, url: string, config: any) {
    const job = importJobs.get(jobId);
    if (!job) return;

    try {
      // Use ImportPipelineService for actual processing
      await this.importPipelineService.processImport({
        jobId,
        url,
        config: {
          transcribe: config?.contentAnalysis?.extractKeywords || true,
          detectScenes: config?.segmentDetection?.method !== undefined,
          analyze: config?.contentAnalysis?.detectHighlights || true,
          generateSuggestions: true,
          extractKeyframes: true,
          generateThumbnails: true,
          ...config
        },
        onProgress: (progress, status, message) => {
          job.status = status as ImportJob['status'];
          job.progress = progress;
          job.updatedAt = new Date();
          importJobs.set(jobId, job);

          // Emit WebSocket event for real-time updates
          this.eventBus.emit('import-progress', {
            jobId,
            progress,
            status,
            message,
            updatedAt: new Date().toISOString()
          });
        }
      });
    } catch (error) {
      logger.error({ error, jobId }, "Import process failed");
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.updatedAt = new Date();
      importJobs.set(jobId, job);

      this.eventBus.emit('import-error', {
        jobId,
        error: job.error,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Legacy simulate method for fallback
  private async simulateImportProcess(jobId: string) {
    const job = importJobs.get(jobId);
    if (!job) return;

    // Simulate different stages of import
    const stages = [
      { status: 'analyzing', progress: 10, duration: 1000 },
      { status: 'downloading', progress: 30, duration: 2000 },
      { status: 'processing', progress: 50, duration: 2000 },
      { status: 'segmenting', progress: 80, duration: 1500 },
      { status: 'completed', progress: 100, duration: 500 }
    ];

    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, stage.duration));
      
      job.status = stage.status as ImportJob['status'];
      job.progress = stage.progress;
      job.updatedAt = new Date();

      // Add metadata when analyzing
      if (stage.status === 'analyzing') {
        job.metadata = {
          title: "Imported Video",
          duration: 300,
          format: "mp4",
          resolution: "1920x1080",
          fileSize: 52428800
        };
      }

      // Add segments when segmenting
      if (stage.status === 'segmenting') {
        job.segments = [
          {
            id: crypto.randomUUID(),
            startTime: 0,
            endTime: 60,
            title: "Introduction",
            keywords: ["intro", "welcome"]
          },
          {
            id: crypto.randomUUID(),
            startTime: 60,
            endTime: 150,
            title: "Main Content",
            keywords: ["main", "content", "core"]
          },
          {
            id: crypto.randomUUID(),
            startTime: 150,
            endTime: 240,
            title: "Examples",
            keywords: ["examples", "demonstration"]
          },
          {
            id: crypto.randomUUID(),
            startTime: 240,
            endTime: 300,
            title: "Conclusion",
            keywords: ["conclusion", "summary", "end"]
          }
        ];
      }

      importJobs.set(jobId, job);
    }
  }

  // Add new endpoints that were missing from the specification

  // Enhanced WebSocket integration methods
  private emitProgressUpdate(jobId: string, progress: number, status: string, message?: string) {
    this.eventBus.emit('import-progress', {
      jobId,
      progress,
      status,
      message,
      timestamp: new Date().toISOString()
    });
  }

  private emitStatusChange(jobId: string, status: string, data?: any) {
    this.eventBus.emit('import-status-change', {
      jobId,
      status,
      data,
      timestamp: new Date().toISOString()
    });
  }
}

// Create and export router instances
const importRouterInstance = new ImportRouter();
export const importRouter = importRouterInstance.router;
export const ollamaRouter = importRouterInstance.getOllamaRouter();
export const translationRouter = importRouterInstance.getTranslationRouter();