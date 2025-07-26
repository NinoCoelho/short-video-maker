import { Router, Request, Response } from 'express';
import multer from 'multer';
import { Pool } from 'pg';
import { SQLitePool } from '../../database/SQLiteAdapter';
import cuid from 'cuid';
import { z } from 'zod';
import { IAScriptService } from '../../services/IAScriptService';
import { ShortCreator } from '../../short-creator/ShortCreator';
import { logger } from '../../logger';
import { 
  PathTraversalGuard, 
  createRateLimiter
} from '../middleware/security';
import { asyncHandler } from '../middleware/errorHandler';
import { ResponseFormatter } from '../utils/ResponseFormatter';
import { ValidationError, NotFoundError, ProcessingError } from '../errors/AppError';
import {
  CreateTemplateRequest,
  CreateSessionRequest,
  SendChatMessageRequest,
  ExtractContentRequest,
  ChatMessage,
  GeneratedScript
} from '../../types/iaScript';
import { SceneInput } from '../../types/shorts';

// Zod validation middleware
const validateZodSchema = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: Function) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          value: err.code
        }));
        return ResponseFormatter.error(res, new ValidationError('Invalid request data', details));
      }
      next(error);
    }
  };
};

// Validation schemas
const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  promptTemplate: z.string().min(1),
  placeholders: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['full_file', 'partial_file', 'random_lines', 'custom']),
    fileId: z.string().optional(),
    config: z.object({
      lineStart: z.number().optional(),
      lineEnd: z.number().optional(),
      randomCount: z.number().optional(),
      customPattern: z.string().optional()
    }).optional()
  })).default([]),
  defaultConfig: z.object({}).passthrough().default({}),
  fileIds: z.array(z.string()).default([]),
  isPublic: z.boolean().optional()
});

const sendChatMessageSchema = z.object({
  content: z.string().min(1),
  fileIds: z.array(z.string()).optional(),
  placeholderValues: z.record(z.string()).optional()
});

const extractContentSchema = z.object({
  type: z.enum(['full_file', 'partial_file', 'random_lines', 'custom']),
  config: z.object({
    lineStart: z.number().optional(),
    lineEnd: z.number().optional(),
    randomCount: z.number().optional(),
    customPattern: z.string().optional()
  }).optional()
});

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only text files are allowed.'));
    }
  }
});

// Rate limiting for resource-intensive operations
const strictRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10,
  message: 'Too many requests, please try again later.'
});

export function createIAScriptRouter(
  pool: Pool | SQLitePool,
  shortCreator: ShortCreator
): Router {
  const router = Router();
  const iaScriptService = new IAScriptService(pool);

  // Template endpoints
  router.post('/templates',
    validateZodSchema(createTemplateSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const template = await iaScriptService.createTemplate(
        req.body as CreateTemplateRequest,
        req.user?.id // Assuming user auth middleware sets req.user
      );
      ResponseFormatter.success(res, { template }, 201);
    })
  );

  router.get('/templates',
    asyncHandler(async (req: Request, res: Response) => {
      const { isPublic, createdBy, search } = req.query;
      const templates = await iaScriptService.listTemplates({
        isPublic: isPublic === 'true',
        createdBy: createdBy as string,
        search: search as string
      });
      ResponseFormatter.success(res, { templates });
    })
  );

  router.get('/templates/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const template = await iaScriptService.getTemplate(req.params.id);
      if (!template) {
        throw new NotFoundError('Template', req.params.id);
      }
      ResponseFormatter.success(res, { template });
    })
  );

  router.put('/templates/:id',
    validateZodSchema(createTemplateSchema.partial()),
    asyncHandler(async (req: Request, res: Response) => {
      const template = await iaScriptService.updateTemplate(req.params.id, req.body);
      if (!template) {
        throw new NotFoundError('Template', req.params.id);
      }
      ResponseFormatter.success(res, { template });
    })
  );

  router.delete('/templates/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const deleted = await iaScriptService.deleteTemplate(req.params.id);
      if (!deleted) {
        throw new NotFoundError('Template', req.params.id);
      }
      ResponseFormatter.success(res, { message: 'Template deleted successfully' });
    })
  );

  router.post('/templates/:id/use',
    asyncHandler(async (req: Request, res: Response) => {
      const template = await iaScriptService.getTemplate(req.params.id);
      if (!template) {
        throw new NotFoundError('Template', req.params.id);
      }

      // Increment usage count
      await iaScriptService.incrementTemplateUsage(req.params.id);

      // Create new session from template
      const session = await iaScriptService.createSession({
        templateId: req.params.id,
        config: req.body.config
      }, req.user?.id);

      ResponseFormatter.success(res, { session }, 201);
    })
  );

  // Session endpoints
  router.post('/sessions',
    asyncHandler(async (req: Request, res: Response) => {
      const session = await iaScriptService.createSession(
        req.body as CreateSessionRequest,
        req.user?.id
      );
      ResponseFormatter.success(res, { session }, 201);
    })
  );

  router.get('/sessions/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const session = await iaScriptService.getSession(req.params.id);
      if (!session) {
        throw new NotFoundError('Session', req.params.id);
      }
      ResponseFormatter.success(res, { session });
    })
  );

  router.post('/sessions/:id/chat',
    strictRateLimiter,
    validateZodSchema(sendChatMessageSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = req.params.id;
      const { content, fileIds, placeholderValues } = req.body as SendChatMessageRequest;

      // Get session
      const session = await iaScriptService.getSession(sessionId);
      if (!session) {
        throw new NotFoundError('Session', sessionId);
      }

      // Update session status
      await iaScriptService.updateSessionStatus(sessionId, 'generating');

      // Create user message
      const userMessage: ChatMessage = {
        id: cuid(),
        role: 'user',
        content,
        timestamp: new Date(),
        metadata: {
          filesUsed: fileIds
        }
      };
      await iaScriptService.addChatMessage(sessionId, userMessage);

      try {
        // Resolve placeholders if needed
        let processedPrompt = content;
        if (placeholderValues && Object.keys(placeholderValues).length > 0) {
          const files = fileIds ? 
            await Promise.all(fileIds.map(id => iaScriptService.getFile(id))) :
            [];
          
          processedPrompt = await iaScriptService.resolvePlaceholders(
            content,
            placeholderValues,
            files.filter(f => f !== null) as any[]
          );
        }

        // Generate script using AI
        const script = await iaScriptService.generateScript(
          processedPrompt,
          session.config
        );

        // Update session with generated script
        await iaScriptService.updateSessionScript(sessionId, script);

        // Create assistant message with simple confirmation and review button
        const assistantMessage: ChatMessage = {
          id: cuid(),
          role: 'assistant',
          content: `✅ **Script "${script.title}" gerado com sucesso!**\n\n` +
                  `📊 **${script.metadata.totalScenes} cenas** • **~${script.metadata.estimatedDuration}s** • **${script.metadata.aiProvider}**\n\n` +
                  `💡 Use o botão abaixo para revisar e analisar o script completo.`,
          timestamp: new Date(),
          metadata: {
            generationTime: Date.now() - userMessage.timestamp.getTime(),
            hasScript: true,
            scriptData: script
          }
        };
        await iaScriptService.addChatMessage(sessionId, assistantMessage);

        ResponseFormatter.success(res, { 
          script,
          message: assistantMessage
        });
      } catch (error: any) {
        await iaScriptService.updateSessionStatus(sessionId, 'draft');
        
        // Provide more specific error messages
        let userFriendlyMessage = 'Não foi possível gerar o script.';
        
        if (error.message?.includes('API key')) {
          userFriendlyMessage = 'Erro de configuração: API key não encontrada ou inválida.';
        } else if (error.message?.includes('rate limit')) {
          userFriendlyMessage = 'Limite de requisições excedido. Por favor, aguarde alguns segundos e tente novamente.';
        } else if (error.message?.includes('timeout')) {
          userFriendlyMessage = 'A geração do script demorou muito. Por favor, tente novamente com um prompt mais simples.';
        } else if (error.message?.includes('network')) {
          userFriendlyMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
        } else if (error.message?.includes('Ollama')) {
          userFriendlyMessage = 'Serviço de IA local não está disponível. Verifique se o Ollama está rodando.';
        }
        
        logger.error('Script generation failed:', error);
        
        throw new ProcessingError(userFriendlyMessage, sessionId, 'generation');
      }
    })
  );

  router.post('/sessions/:id/render',
    strictRateLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = req.params.id;
      const { immediate, config: uiConfig } = req.body;

      const session = await iaScriptService.getSession(sessionId);
      if (!session) {
        throw new NotFoundError('Session', sessionId);
      }

      if (!session.currentScript) {
        throw new ValidationError('No script generated yet');
      }

      // Convert generated script to SceneInput format
      const scenes: SceneInput[] = session.currentScript.scenes.map(scene => ({
        text: scene.text,
        searchTerms: scene.searchKeywords || []
      }));

      // Use UI config if provided, otherwise fall back to session config
      const baseConfig = uiConfig || session.config;
      
      // Ensure config has proper format for video rendering
      const renderConfig = {
        ...baseConfig,
        // Map IA Script config properties to video rendering format
        captionsEnabled: true, // Always enable captions for IA Script videos
        captionPosition: baseConfig.captionPosition || 'bottom',
        captionBackgroundColor: baseConfig.captionBackgroundColor || '#000000',
        captionTextColor: baseConfig.captionTextColor || '#ffffff',
        // Ensure hook is properly set for captions display
        hook: baseConfig.hook || session.currentScript.title,
        // Enable overlays if configured
        overlay: baseConfig.overlay,
        // Pass through all other config
        voice: baseConfig.voice,
        orientation: baseConfig.orientation,
        language: baseConfig.language,
        music: baseConfig.music,
        musicVolume: baseConfig.musicVolume,
        paddingBack: baseConfig.paddingBack || 3000
      };

      logger.info({ sessionId, renderConfig }, 'Creating video with IA Script config');

      // Create video using ShortCreator
      const videoId = await shortCreator.addToQueue(scenes, renderConfig);

      // Update session with video ID
      await pool.query(
        'UPDATE script_sessions SET video_id = $1, status = $2 WHERE id = $3',
        [videoId, 'rendered', sessionId]
      );

      logger.info(`Video ${videoId} created from IA Script session ${sessionId}`);

      ResponseFormatter.success(res, {
        videoId,
        message: immediate ? 
          'Video rendering started' : 
          'Video added to queue for review',
        redirectUrl: immediate ? 
          `/dashboard` : 
          `/video-studio?id=${videoId}`
      }, 202);
    })
  );

  router.delete('/sessions/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const result = await pool.query(
        'DELETE FROM script_sessions WHERE id = $1',
        [req.params.id]
      );
      
      if (result.rowCount === 0) {
        throw new NotFoundError('Session', req.params.id);
      }
      
      ResponseFormatter.success(res, { message: 'Session deleted successfully' });
    })
  );

  // File endpoints
  router.post('/files/upload',
    upload.single('file'),
    PathTraversalGuard.middleware(['filename']),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.file) {
        throw new ValidationError('No file provided');
      }

      const uploadedFile = await iaScriptService.uploadFile(
        req.file,
        req.user?.id
      );

      // Get preview (first 10 lines)
      const lines = uploadedFile.content.split('\n').slice(0, 10);
      const preview = lines.join('\n');

      ResponseFormatter.success(res, {
        file: uploadedFile,
        preview
      }, 201);
    })
  );

  router.get('/files',
    asyncHandler(async (req: Request, res: Response) => {
      const files = await iaScriptService.listFiles(req.user?.id);
      ResponseFormatter.success(res, { files });
    })
  );

  router.get('/files/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const file = await iaScriptService.getFile(req.params.id);
      if (!file) {
        throw new NotFoundError('File', req.params.id);
      }
      ResponseFormatter.success(res, { file });
    })
  );

  router.delete('/files/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const deleted = await iaScriptService.deleteFile(req.params.id);
      if (!deleted) {
        throw new NotFoundError('File', req.params.id);
      }
      ResponseFormatter.success(res, { message: 'File deleted successfully' });
    })
  );

  router.post('/files/:id/extract',
    validateZodSchema(extractContentSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await iaScriptService.extractContent(
        req.params.id,
        req.body as ExtractContentRequest
      );
      ResponseFormatter.success(res, result);
    })
  );

  // Helper function to generate script summary
  function generateScriptSummary(script: GeneratedScript): string {
    const { title, description, scenes, metadata } = script;
    
    let summary = `✅ **Script gerado com sucesso!**\n\n`;
    
    // Basic info
    summary += `📝 **${title || 'Script'}**\n`;
    if (description) {
      summary += `📋 ${description}\n\n`;
    }
    
    // Metadata
    summary += `📊 **Informações:**\n`;
    summary += `• ${metadata.totalScenes} cenas\n`;
    summary += `• ~${metadata.estimatedDuration}s de duração\n`;
    summary += `• Gerado com ${metadata.aiProvider}\n\n`;
    
    // Scene breakdown
    summary += `🎬 **Resumo das Cenas:**\n`;
    scenes.forEach((scene, index) => {
      const sceneNum = scene.sceneNumber || index + 1;
      const duration = scene.duration || '5s';
      const text = scene.text.length > 60 ? scene.text.substring(0, 57) + '...' : scene.text;
      summary += `${sceneNum}. (${duration}) ${text}\n`;
    });
    
    summary += `\n💡 **Próximos passos:**\n`;
    summary += `• Revise o script e faça ajustes se necessário\n`;
    summary += `• Clique em "Renderizar" para criar o vídeo\n`;
    summary += `• Ou continue a conversa para fazer modificações`;
    
    return summary;
  }

  return router;
}