import { Router } from 'express';
import { logger } from '../../logger';
import { ImageCacheService } from '../../services/ImageCacheService';
import { Config } from '../../config';
import fs from 'fs-extra';
import path from 'path';

const router: Router = Router();

// Initialize services
const config = new Config();
const imageCacheService = new ImageCacheService(config.dataDirPath);

// Video providers config path
const videoConfigPath = path.join(process.cwd(), 'src/short-creator/libraries/Videos/config.json');

// Get negative terms
router.get('/negative-terms', async (req, res) => {
  try {
    logger.info('GET /api/video-search/negative-terms called');
    const videoConfig = await fs.readJson(videoConfigPath);
    const terms = videoConfig.negativeKeywords || [];
    logger.info({ termsCount: terms.length }, 'Returning negative terms');
    res.json(terms);
  } catch (error) {
    logger.error({ error }, 'Failed to load negative terms');
    res.status(500).json({ error: 'Failed to load negative terms' });
  }
});

// Update negative terms
router.post('/negative-terms', async (req, res) => {
  try {
    logger.info({ body: req.body }, 'POST /api/video-search/negative-terms called');
    const { terms } = req.body;
    
    if (!Array.isArray(terms)) {
      logger.warn('Terms is not an array', { terms });
      return res.status(400).json({ error: 'Terms must be an array' });
    }

    // Validate terms
    const validTerms = terms.filter(term => 
      typeof term === 'string' && 
      term.trim().length > 0 && 
      term.trim().length <= 50
    );

    logger.info({ validTerms, originalCount: terms.length }, 'Validated terms');

    // Load current config
    const videoConfig = await fs.readJson(videoConfigPath);
    videoConfig.negativeKeywords = validTerms;
    
    // Save updated config
    await fs.writeJson(videoConfigPath, videoConfig, { spaces: 2 });
    
    logger.info({ terms: validTerms, configPath: videoConfigPath }, 'Updated negative terms in config file');
    res.json({ success: true, terms: validTerms });
  } catch (error) {
    logger.error({ error, videoConfigPath }, 'Failed to update negative terms');
    res.status(500).json({ error: 'Failed to update negative terms' });
  }
});

// Get cache statistics (now returns video cache stats)
router.get('/cache-stats', async (req, res) => {
  try {
    // Import VideoCacheManager and get stats
    const { VideoCacheManager } = await import('../../short-creator/libraries/VideoCacheManager');
    const videoCacheManager = new VideoCacheManager(config);
    const stats = videoCacheManager.getCacheStats();
    
    // Return in the format expected by the UI
    res.json({
      entries: stats.count,
      size: stats.totalSize
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get cache stats');
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// Clear video cache
router.post('/clear-cache', async (req, res) => {
  try {
    // Clear the video cache directory
    const videoCacheDir = path.join(config.dataDirPath, 'video-cache');
    
    // Get all files in the cache directory
    const files = await fs.readdir(videoCacheDir);
    
    // Delete all files
    for (const file of files) {
      await fs.remove(path.join(videoCacheDir, file));
    }
    
    logger.info({ filesRemoved: files.length }, 'Video cache cleared via API');
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to clear cache');
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Get cache entries by project
router.get('/cache/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const entries = await imageCacheService.getCacheByProject(projectId);
    res.json(entries);
  } catch (error) {
    logger.error({ error }, 'Failed to get project cache');
    res.status(500).json({ error: 'Failed to get project cache' });
  }
});

// Clear cache for specific project
router.delete('/cache/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    await imageCacheService.removeCacheByProject(projectId);
    logger.info({ projectId }, 'Project cache cleared');
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to clear project cache');
    res.status(500).json({ error: 'Failed to clear project cache' });
  }
});

// Get cached image
router.get('/cache/image/:imageKey', async (req, res) => {
  try {
    const { imageKey } = req.params;
    const url = req.query.url as string;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    const imageBuffer = await imageCacheService.getImageFromCache(url);
    
    if (!imageBuffer) {
      return res.status(404).json({ error: 'Image not found in cache' });
    }

    // Set appropriate headers
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
    res.send(imageBuffer);
  } catch (error) {
    logger.error({ error }, 'Failed to serve cached image');
    res.status(500).json({ error: 'Failed to serve cached image' });
  }
});

export { router as videoSearchConfigRouter, imageCacheService };