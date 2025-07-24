import express, { Request, Response } from 'express';
import { TranslationService, TranslationOptions } from '../../services/TranslationService';
import { TranscriptionService } from '../../services/TranscriptionService';
import { logger } from '../../logger';
import { TranscriptSegment } from '../../types/import';
import path from 'path';
import fs from 'fs-extra';

const router = express.Router();

// Initialize services (these should be injected in a real application)
let translationService: TranslationService;
let transcriptionService: TranscriptionService;

export const initializeTranslationRoutes = (
  translationSvc: TranslationService,
  transcriptionSvc: TranscriptionService
) => {
  translationService = translationSvc;
  transcriptionService = transcriptionSvc;
};

/**
 * POST /api/translation/translate
 * Translate transcript segments to target language
 */
router.post('/translate', async (req: Request, res: Response) => {
  try {
    const {
      segments,
      targetLanguage,
      sourceLanguage,
      provider = 'google-cloud',
      style = 'formal',
      enableCache = true,
      culturalAdaptation = false,
      lengthOptimization = false,
      glossary
    } = req.body;

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'Segments array is required' });
    }

    if (!targetLanguage) {
      return res.status(400).json({ error: 'Target language is required' });
    }

    const options: TranslationOptions = {
      provider,
      targetLanguage,
      sourceLanguage,
      style,
      enableCache,
      culturalAdaptation,
      lengthOptimization,
      glossary,
      fallbackProviders: ['deepl', 'openai', 'google-ai']
    };

    logger.info({ 
      segmentCount: segments.length,
      targetLanguage,
      provider 
    }, 'Starting translation request');

    const result = await translationService.translateSegments(segments, options);

    res.json({
      success: true,
      result: {
        segments: result.segments,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        confidence: result.confidence,
        provider: result.provider,
        processingTime: result.processingTime,
        cached: result.cached
      }
    });
  } catch (error) {
    logger.error({ error }, 'Translation request failed');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Translation failed'
    });
  }
});

/**
 * POST /api/translation/batch
 * Batch translate multiple video segments
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { videos, options } = req.body;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({ error: 'Videos array is required' });
    }

    if (!options || !options.targetLanguage) {
      return res.status(400).json({ error: 'Translation options with target language required' });
    }

    logger.info({ videoCount: videos.length }, 'Starting batch translation');

    const results = await translationService.batchTranslate(videos, options);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    logger.error({ error }, 'Batch translation failed');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Batch translation failed'
    });
  }
});

/**
 * GET /api/translation/languages
 * Get supported languages
 */
router.get('/languages', async (req: Request, res: Response) => {
  try {
    const languages = translationService.getSupportedLanguages();
    
    res.json({
      success: true,
      languages
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get supported languages');
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get supported languages'
    });
  }
});

/**
 * GET /api/translation/providers
 * Get available translation providers
 */
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const providers = translationService.getAvailableProviders();
    
    res.json({
      success: true,
      providers
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get available providers');
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get available providers'
    });
  }
});

/**
 * POST /api/translation/extract-subtitles
 * Extract subtitles from video file
 */
router.post('/extract-subtitles', async (req: Request, res: Response) => {
  try {
    const { videoPath } = req.body;

    if (!videoPath) {
      return res.status(400).json({ error: 'Video path is required' });
    }

    if (!await fs.pathExists(videoPath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    logger.info({ videoPath }, 'Extracting subtitles from video');

    const result = await translationService.extractSubtitles(videoPath);

    res.json({
      success: true,
      subtitles: result
    });
  } catch (error) {
    logger.error({ error }, 'Subtitle extraction failed');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Subtitle extraction failed'
    });
  }
});

/**
 * POST /api/translation/create-subtitles
 * Create subtitle file from segments
 */
router.post('/create-subtitles', async (req: Request, res: Response) => {
  try {
    const {
      segments,
      format = 'srt',
      outputPath,
      options = {}
    } = req.body;

    if (!segments || !Array.isArray(segments)) {
      return res.status(400).json({ error: 'Segments array is required' });
    }

    if (!outputPath) {
      return res.status(400).json({ error: 'Output path is required' });
    }

    logger.info({ 
      segmentCount: segments.length,
      format,
      outputPath 
    }, 'Creating subtitle file');

    const filePath = await translationService.createSubtitlesFromTranscription(
      segments,
      format,
      outputPath,
      options
    );

    res.json({
      success: true,
      filePath
    });
  } catch (error) {
    logger.error({ error }, 'Subtitle creation failed');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Subtitle creation failed'
    });
  }
});

/**
 * POST /api/translation/bilingual-subtitles
 * Generate bilingual subtitle file
 */
router.post('/bilingual-subtitles', async (req: Request, res: Response) => {
  try {
    const {
      originalSegments,
      translatedSegments,
      format = 'srt',
      outputPath,
      options = {}
    } = req.body;

    if (!originalSegments || !translatedSegments) {
      return res.status(400).json({ error: 'Both original and translated segments are required' });
    }

    if (!outputPath) {
      return res.status(400).json({ error: 'Output path is required' });
    }

    logger.info({ 
      originalCount: originalSegments.length,
      translatedCount: translatedSegments.length,
      format 
    }, 'Creating bilingual subtitles');

    const filePath = await translationService.generateBilingualSubtitles(
      originalSegments,
      translatedSegments,
      format,
      outputPath,
      options
    );

    res.json({
      success: true,
      filePath
    });
  } catch (error) {
    logger.error({ error }, 'Bilingual subtitle creation failed');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Bilingual subtitle creation failed'
    });
  }
});

/**
 * GET /api/translation/job/:jobId
 * Get translation job status and result
 */
router.get('/job/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = translationService.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Translation job not found' });
    }

    res.json({
      success: true,
      job
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get translation job');
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get translation job'
    });
  }
});

/**
 * GET /api/translation/jobs
 * Get all translation jobs
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const jobs = translationService.getAllJobs();

    res.json({
      success: true,
      jobs
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get translation jobs');
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get translation jobs'
    });
  }
});

/**
 * GET /api/translation/metrics/:jobId
 * Get translation metrics for a specific job
 */
router.get('/metrics/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const metrics = translationService.getTranslationMetrics(jobId);

    if (!metrics) {
      return res.status(404).json({ error: 'Translation metrics not found' });
    }

    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get translation metrics');
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get translation metrics'
    });
  }
});

/**
 * POST /api/translation/save
 * Save translation to persistent storage
 */
router.post('/save', async (req: Request, res: Response) => {
  try {
    const {
      videoId,
      sourceLanguage,
      targetLanguage,
      segments,
      metadata
    } = req.body;

    if (!videoId || !sourceLanguage || !targetLanguage || !segments) {
      return res.status(400).json({ 
        error: 'videoId, sourceLanguage, targetLanguage, and segments are required'
      });
    }

    logger.info({ videoId, sourceLanguage, targetLanguage }, 'Saving translation');

    const translationId = await translationService.saveTranslation(
      videoId,
      sourceLanguage,
      targetLanguage,
      segments,
      metadata
    );

    res.json({
      success: true,
      translationId
    });
  } catch (error) {
    logger.error({ error }, 'Failed to save translation');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to save translation'
    });
  }
});

/**
 * GET /api/translation/load/:translationId
 * Load translation from persistent storage
 */
router.get('/load/:translationId', async (req: Request, res: Response) => {
  try {
    const { translationId } = req.params;

    const translation = await translationService.loadTranslation(translationId);

    if (!translation) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    res.json({
      success: true,
      translation
    });
  } catch (error) {
    logger.error({ error }, 'Failed to load translation');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to load translation'
    });
  }
});

/**
 * GET /api/translation/list/:videoId
 * List all translations for a video
 */
router.get('/list/:videoId', async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;

    const translations = await translationService.listTranslations(videoId);

    res.json({
      success: true,
      translations
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list translations');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to list translations'
    });
  }
});

/**
 * DELETE /api/translation/cache
 * Clear translation cache
 */
router.delete('/cache', async (req: Request, res: Response) => {
  try {
    translationService.clearCache();

    res.json({
      success: true,
      message: 'Translation cache cleared'
    });
  } catch (error) {
    logger.error({ error }, 'Failed to clear cache');
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear cache'
    });
  }
});

/**
 * POST /api/translation/detect-language
 * Detect language of text
 */
router.post('/detect-language', async (req: Request, res: Response) => {
  try {
    const { text, provider } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Use the private method via a public wrapper if needed
    // For now, we'll create a simple detection endpoint
    const segments: TranscriptSegment[] = [{ startTime: 0, endTime: 1, text }];
    
    const options: TranslationOptions = {
      targetLanguage: 'en', // dummy target for detection
      provider: provider || 'google-cloud'
    };

    // This will trigger language detection internally
    const result = await translationService.translateSegments(segments, options);

    res.json({
      success: true,
      detectedLanguage: result.sourceLanguage
    });
  } catch (error) {
    logger.error({ error }, 'Language detection failed');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Language detection failed'
    });
  }
});

export default router;