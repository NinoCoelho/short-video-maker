import path from 'path';
import { Request, Response } from 'express';
import { initializeDownloadSystem, DownloadSystem } from './initializeDownloadSystem';
import { QueuePriority } from './QueueService';
import { logger } from '../logger';
import { randomUUID } from 'crypto';

// Initialize the download system with configuration
const downloadSystem = initializeDownloadSystem({
  outputDir: path.join(process.cwd(), 'downloads'),
  maxConcurrentDownloads: 3,
  defaultQuality: 'best',
  defaultFormat: 'mp4',
  retryDelay: 5000,
  maxRetries: 3,
  cleanupTempFiles: true,
  enableCleanupTask: true,
  cleanupIntervalHours: 6
});

// Export the system for use in other parts of the application
export { downloadSystem };

// API endpoint handlers
export const downloadHandlers = {
  /**
   * Start a new download
   * POST /api/download
   */
  startDownload: async (req: Request, res: Response) => {
    try {
      const { url, priority = 'normal', filename, videoId } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      // Check if URL is supported
      if (!downloadSystem.processor.isUrlSupported(url)) {
        return res.status(400).json({ 
          error: 'Unsupported URL',
          supportedPlatforms: downloadSystem.processor.getSupportedPlatforms()
        });
      }

      // Generate job ID
      const jobId = randomUUID();
      const generatedVideoId = videoId || randomUUID();

      // Map priority string to enum
      const priorityMap: Record<string, QueuePriority> = {
        'low': QueuePriority.LOW,
        'normal': QueuePriority.NORMAL,
        'high': QueuePriority.HIGH,
        'urgent': QueuePriority.URGENT
      };

      // Add download to queue
      const queueId = await downloadSystem.processor.addDownload({
        url,
        videoId: generatedVideoId,
        jobId,
        filename,
        priority: priorityMap[priority] || QueuePriority.NORMAL
      });

      res.status(202).json({
        success: true,
        jobId,
        videoId: generatedVideoId,
        queueId,
        message: 'Download queued successfully',
        websocketRoom: `download-${jobId}` // For client to subscribe to updates
      });

    } catch (error) {
      logger.error('Failed to start download', { error, body: req.body });
      res.status(500).json({
        error: 'Failed to start download',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Get download status
   * GET /api/download/:jobId/status
   */
  getDownloadStatus: async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      
      const status = downloadSystem.status.getStatus(jobId);
      
      if (!status) {
        return res.status(404).json({ error: 'Download not found' });
      }

      res.json({
        success: true,
        status: status.status,
        progress: status.progress,
        message: status.message,
        metadata: status.metadata,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
        completedAt: status.completedAt,
        error: status.error
      });

    } catch (error) {
      logger.error('Failed to get download status', { error, jobId: req.params.jobId });
      res.status(500).json({
        error: 'Failed to get download status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Cancel download
   * POST /api/download/:jobId/cancel
   */
  cancelDownload: async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      
      const cancelled = await downloadSystem.processor.cancelDownload(jobId);
      
      if (!cancelled) {
        return res.status(404).json({ error: 'Download not found or already completed' });
      }

      res.json({
        success: true,
        message: 'Download cancelled successfully'
      });

    } catch (error) {
      logger.error('Failed to cancel download', { error, jobId: req.params.jobId });
      res.status(500).json({
        error: 'Failed to cancel download',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Get video metadata without downloading
   * POST /api/download/metadata
   */
  getMetadata: async (req: Request, res: Response) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      const metadata = await downloadSystem.processor.fetchMetadata(url);

      res.json({
        success: true,
        metadata
      });

    } catch (error) {
      logger.error('Failed to fetch metadata', { error, body: req.body });
      res.status(500).json({
        error: 'Failed to fetch metadata',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Get queue status and system information
   * GET /api/download/system/status
   */
  getSystemStatus: async (req: Request, res: Response) => {
    try {
      const systemStatus = await downloadSystem.getSystemStatus();
      
      res.json({
        success: true,
        ...systemStatus,
        supportedPlatforms: downloadSystem.processor.getSupportedPlatforms()
      });

    } catch (error) {
      logger.error('Failed to get system status', { error });
      res.status(500).json({
        error: 'Failed to get system status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Get active downloads
   * GET /api/download/active
   */
  getActiveDownloads: async (req: Request, res: Response) => {
    try {
      const activeDownloads = downloadSystem.processor.getActiveDownloads();
      
      res.json({
        success: true,
        downloads: activeDownloads.map(download => ({
          jobId: download.id,
          videoId: download.metadata.videoId,
          url: download.metadata.url,
          status: download.status,
          progress: download.progress,
          createdAt: download.createdAt,
          updatedAt: download.updatedAt
        }))
      });

    } catch (error) {
      logger.error('Failed to get active downloads', { error });
      res.status(500).json({
        error: 'Failed to get active downloads',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Update download concurrency limit
   * POST /api/download/system/concurrency
   */
  updateConcurrency: async (req: Request, res: Response) => {
    try {
      const { limit } = req.body;

      if (!limit || typeof limit !== 'number' || limit < 1 || limit > 10) {
        return res.status(400).json({ 
          error: 'Invalid limit. Must be a number between 1 and 10' 
        });
      }

      downloadSystem.processor.setMaxConcurrentDownloads(limit);

      res.json({
        success: true,
        message: `Concurrency limit updated to ${limit}`,
        limit
      });

    } catch (error) {
      logger.error('Failed to update concurrency', { error, body: req.body });
      res.status(500).json({
        error: 'Failed to update concurrency',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Manual cleanup
   * POST /api/download/system/cleanup
   */
  performCleanup: async (req: Request, res: Response) => {
    try {
      const { olderThanHours = 24 } = req.body;

      const results = await downloadSystem.performManualCleanup(olderThanHours);

      res.json({
        success: true,
        message: 'Cleanup completed',
        results
      });

    } catch (error) {
      logger.error('Failed to perform cleanup', { error, body: req.body });
      res.status(500).json({
        error: 'Failed to perform cleanup',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};

// Router setup helper
export function setupDownloadRoutes(router: any): void {
  router.post('/download', downloadHandlers.startDownload);
  router.get('/download/:jobId/status', downloadHandlers.getDownloadStatus);
  router.post('/download/:jobId/cancel', downloadHandlers.cancelDownload);
  router.post('/download/metadata', downloadHandlers.getMetadata);
  router.get('/download/system/status', downloadHandlers.getSystemStatus);
  router.get('/download/active', downloadHandlers.getActiveDownloads);
  router.post('/download/system/concurrency', downloadHandlers.updateConcurrency);
  router.post('/download/system/cleanup', downloadHandlers.performCleanup);
}

// WebSocket integration helper
export function setupDownloadWebSocketListeners(io: any): void {
  // The WebSocket server already listens to the EventBus events
  // This is just a helper to set up any additional custom listeners if needed
  
  downloadSystem.processor.on('download:started', (data) => {
    io.to(`download-${data.jobId}`).emit('download-started', data);
  });

  downloadSystem.processor.on('download:metadata-fetched', (data) => {
    io.to(`download-${data.jobId}`).emit('download-metadata', data);
  });
}

export default downloadSystem;