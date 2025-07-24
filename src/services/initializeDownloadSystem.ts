import path from 'path';
import { DownloadProcessor } from './DownloadProcessor';
import { QueueService } from './QueueService';
import { StatusService } from './StatusService';
import { logger } from '../logger';

export interface DownloadSystemConfig {
  outputDir?: string;
  maxConcurrentDownloads?: number;
  defaultQuality?: string;
  defaultFormat?: string;
  retryDelay?: number;
  maxRetries?: number;
  cleanupTempFiles?: boolean;
  enableCleanupTask?: boolean;
  cleanupIntervalHours?: number;
}

export class DownloadSystem {
  private static instance: DownloadSystem;
  private downloadProcessor: DownloadProcessor;
  private queueService: QueueService;
  private statusService: StatusService;
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor(config: DownloadSystemConfig) {
    const outputDir = config.outputDir || path.join(process.cwd(), 'downloads');
    
    // Initialize download processor with configuration
    this.downloadProcessor = DownloadProcessor.getInstance({
      outputDir,
      maxConcurrentDownloads: config.maxConcurrentDownloads || 3,
      defaultQuality: config.defaultQuality || 'best',
      defaultFormat: config.defaultFormat || 'mp4',
      retryDelay: config.retryDelay || 5000,
      maxRetries: config.maxRetries || 3,
      cleanupTempFiles: config.cleanupTempFiles !== false
    });

    this.queueService = QueueService.getInstance();
    this.statusService = StatusService.getInstance();

    if (config.enableCleanupTask !== false) {
      this.startCleanupTask(config.cleanupIntervalHours || 6);
    }

    logger.info('Download system initialized', {
      outputDir,
      maxConcurrentDownloads: config.maxConcurrentDownloads || 3,
      enableCleanupTask: config.enableCleanupTask !== false
    });
  }

  public static getInstance(config?: DownloadSystemConfig): DownloadSystem {
    if (!DownloadSystem.instance) {
      if (!config) {
        throw new Error('DownloadSystem config required for first initialization');
      }
      DownloadSystem.instance = new DownloadSystem(config);
    }
    return DownloadSystem.instance;
  }

  private startCleanupTask(intervalHours: number): void {
    // Run cleanup every specified hours
    this.cleanupInterval = setInterval(async () => {
      try {
        logger.info('Running scheduled cleanup task');
        
        // Clean up old status entries
        const cleanedStatuses = this.statusService.cleanupOldStatuses(24);
        
        // Clean up old download files
        const cleanedFiles = await this.downloadProcessor.cleanupOldFiles(24);
        
        // Clean up completed queue items
        const cleanedQueue = this.queueService.clearCompletedItems('download');

        logger.info('Cleanup task completed', {
          cleanedStatuses,
          cleanedFiles,
          cleanedQueue
        });
      } catch (error) {
        logger.error('Cleanup task failed', { error });
      }
    }, intervalHours * 60 * 60 * 1000);
  }

  public stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Cleanup task stopped');
    }
  }

  // Expose the main services
  public get processor(): DownloadProcessor {
    return this.downloadProcessor;
  }

  public get queue(): QueueService {
    return this.queueService;
  }

  public get status(): StatusService {
    return this.statusService;
  }

  // Helper methods
  public async getSystemStatus(): Promise<{
    queue: ReturnType<QueueService['getQueueStatus']>;
    activeDownloads: number;
    storage: Awaited<ReturnType<DownloadProcessor['getStorageInfo']>>;
  }> {
    const queueStatus = this.queueService.getQueueStatus('download');
    const activeDownloads = this.statusService.getActiveDownloads().length;
    const storageInfo = await this.downloadProcessor.getStorageInfo();

    return {
      queue: queueStatus,
      activeDownloads,
      storage: storageInfo
    };
  }

  public async performManualCleanup(olderThanHours: number = 24): Promise<{
    cleanedStatuses: number;
    cleanedFiles: number;
    cleanedQueue: number;
  }> {
    const cleanedStatuses = this.statusService.cleanupOldStatuses(olderThanHours);
    const cleanedFiles = await this.downloadProcessor.cleanupOldFiles(olderThanHours);
    const cleanedQueue = this.queueService.clearCompletedItems('download');

    return {
      cleanedStatuses,
      cleanedFiles,
      cleanedQueue
    };
  }
}

// Factory function for easy initialization
export function initializeDownloadSystem(config?: DownloadSystemConfig): DownloadSystem {
  return DownloadSystem.getInstance(config);
}

export default DownloadSystem;