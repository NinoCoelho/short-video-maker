import path from 'path';
import fs from 'fs-extra';
import { EventEmitter } from 'events';
import { DownloaderManager } from './downloaders/DownloaderManager';
import { QueueService, QueueItem, DownloadQueueData, QueueItemStatus } from './QueueService';
import { StatusService, StatusType } from './StatusService';
import { eventBus } from '../server/events/EventBus';
import { logger } from '../logger';

export interface DownloadProcessorConfig {
  outputDir: string;
  maxConcurrentDownloads?: number;
  defaultQuality?: string;
  defaultFormat?: string;
  retryDelay?: number;
  maxRetries?: number;
  cleanupTempFiles?: boolean;
}

export class DownloadProcessor extends EventEmitter {
  private static instance: DownloadProcessor;
  private downloaderManager: DownloaderManager;
  private queueService: QueueService;
  private statusService: StatusService;
  private config: DownloadProcessorConfig;
  private activeDownloads: Map<string, AbortController> = new Map();

  private constructor(config: DownloadProcessorConfig) {
    super();
    this.config = config;
    this.downloaderManager = new DownloaderManager({
      defaultQuality: config.defaultQuality as any,
      defaultFormat: config.defaultFormat as any,
      maxRetries: config.maxRetries || 3
    });
    this.queueService = QueueService.getInstance({
      maxConcurrent: config.maxConcurrentDownloads || 3,
      retryDelay: config.retryDelay || 5000,
      defaultMaxRetries: config.maxRetries || 3
    });
    this.statusService = StatusService.getInstance();

    this.setupEventListeners();
    this.registerProcessor();
    this.ensureOutputDir();
  }

  public static getInstance(config?: DownloadProcessorConfig): DownloadProcessor {
    if (!DownloadProcessor.instance) {
      if (!config) {
        throw new Error('DownloadProcessor config required for first initialization');
      }
      DownloadProcessor.instance = new DownloadProcessor(config);
    }
    return DownloadProcessor.instance;
  }

  private async ensureOutputDir(): Promise<void> {
    try {
      await fs.ensureDir(this.config.outputDir);
      logger.info(`Download output directory ready: ${this.config.outputDir}`);
    } catch (error) {
      logger.error(`Failed to create output directory: ${error}`);
      throw error;
    }
  }

  private setupEventListeners(): void {
    // Listen for download manager events and forward them
    this.downloaderManager.on('start', (data) => {
      logger.info(`Download started: ${data.url}`);
    });

    this.downloaderManager.on('progress', (data) => {
      const jobId = this.findJobIdByUrl(data.url);
      if (jobId) {
        this.queueService.emit('download:progress:update', {
          itemId: jobId,
          progress: data.progress || 0,
          downloadedBytes: data.downloadedBytes || 0,
          totalBytes: data.totalBytes || 0,
          speed: data.speed || 0,
          eta: data.eta || 0
        });
      }
    });

    this.downloaderManager.on('complete', (data) => {
      logger.info(`Download completed: ${data.url}`);
    });

    this.downloaderManager.on('error', (data) => {
      logger.error(`Download error: ${data.error}`);
    });
  }

  private registerProcessor(): void {
    this.queueService.registerProcessor('download', this.processDownload.bind(this));
  }

  private async processDownload(item: QueueItem<DownloadQueueData>): Promise<void> {
    const { url, videoId, jobId, filename, headers, metadata } = item.data;
    const abortController = new AbortController();
    this.activeDownloads.set(item.id, abortController);

    try {
      // Update status to processing
      this.queueService.emitDownloadStatus({
        jobId,
        videoId,
        status: QueueItemStatus.PROCESSING,
        message: 'Starting download...',
        timestamp: new Date().toISOString()
      });

      // Create status entry
      this.statusService.createDownloadStatus(jobId, {
        url,
        videoId,
        filename
      });

      // Generate output filename if not provided
      const outputFilename = filename || this.generateFilename(url, videoId);
      const outputPath = path.join(this.config.outputDir, outputFilename);

      // Check if file already exists
      if (await fs.pathExists(outputPath)) {
        logger.info(`File already exists, skipping download: ${outputPath}`);
        
        const stats = await fs.stat(outputPath);
        this.completeDownload(item, outputPath, stats.size, 0);
        return;
      }

      logger.info(`Starting download: ${url} -> ${outputPath}`);

      // Start download
      const startTime = Date.now();
      const result = await this.downloaderManager.download(url, outputPath, {
        headers,
        timeout: 300000, // 5 minutes timeout
        maxRetries: item.maxRetries
      });

      if (!result.success) {
        throw new Error(result.error?.message || 'Download failed');
      }

      // Verify file was created
      if (!await fs.pathExists(outputPath)) {
        throw new Error('Download completed but file not found');
      }

      const stats = await fs.stat(outputPath);
      const duration = Date.now() - startTime;

      this.completeDownload(item, outputPath, stats.size, duration);

    } catch (error) {
      this.handleDownloadError(item, error as Error);
    } finally {
      this.activeDownloads.delete(item.id);
    }
  }

  private completeDownload(
    item: QueueItem<DownloadQueueData>, 
    filePath: string, 
    fileSize: number, 
    duration: number
  ): void {
    const { jobId, videoId } = item.data;

    // Update status service
    this.statusService.completeDownload(jobId, {
      filePath,
      fileSize
    });

    // Emit completion events
    this.queueService.emitDownloadComplete({
      jobId,
      videoId,
      filePath,
      fileSize,
      duration,
      timestamp: new Date().toISOString()
    });

    logger.info(`Download completed: ${filePath} (${fileSize} bytes, ${duration}ms)`);
  }

  private handleDownloadError(item: QueueItem<DownloadQueueData>, error: Error): void {
    const { jobId, videoId } = item.data;
    const willRetry = item.retries < item.maxRetries;

    // Update status
    this.statusService.updateStatus(jobId, {
      status: willRetry ? 'pending' : 'failed',
      error: error.message
    });

    // Emit error event
    this.queueService.emitDownloadError({
      jobId,
      videoId,
      error: error.message,
      retries: item.retries,
      willRetry,
      timestamp: new Date().toISOString()
    });

    if (!willRetry) {
      logger.error(`Download failed permanently: ${error.message}`);
    } else {
      logger.warn(`Download failed, will retry: ${error.message}`);
    }
  }

  private generateFilename(url: string, videoId: string): string {
    const platform = this.downloaderManager.detectPlatform(url) || 'unknown';
    const timestamp = Date.now();
    const extension = this.config.defaultFormat || 'mp4';
    return `${platform}_${videoId}_${timestamp}.${extension}`;
  }

  private findJobIdByUrl(url: string): string | null {
    // This is a simplified implementation
    // In a real scenario, you'd need to track URL to jobId mappings
    const downloads = this.statusService.getActiveDownloads();
    const download = downloads.find(d => d.metadata.url === url);
    return download?.id || null;
  }

  // Public API methods
  public async addDownload(data: {
    url: string;
    videoId: string;
    jobId: string;
    filename?: string;
    headers?: Record<string, string>;
    metadata?: any;
    priority?: number;
  }): Promise<string> {
    // Validate URL
    if (!this.downloaderManager.isUrlSupported(data.url)) {
      throw new Error(`Unsupported URL: ${data.url}`);
    }

    // Add to queue
    const queueId = await this.queueService.addDownload(data as DownloadQueueData, data.priority || 1);
    
    logger.info(`Download queued: ${data.url} (jobId: ${data.jobId}, queueId: ${queueId})`);
    
    return queueId;
  }

  public async cancelDownload(jobId: string): Promise<boolean> {
    // Cancel in queue
    const cancelled = await this.queueService.cancelDownload(jobId);
    
    if (cancelled) {
      // Find and abort active download
      for (const [itemId, controller] of this.activeDownloads.entries()) {
        const progress = this.queueService.getDownloadProgress(jobId);
        if (progress && progress.id === itemId) {
          controller.abort();
          this.activeDownloads.delete(itemId);
          break;
        }
      }
    }

    return cancelled;
  }

  public getDownloadStatus(jobId: string) {
    return this.statusService.getStatus(jobId);
  }

  public getActiveDownloads() {
    return this.statusService.getActiveDownloads();
  }

  public getQueueStatus() {
    return this.queueService.getQueueStatus('download');
  }

  public async fetchMetadata(url: string) {
    return await this.downloaderManager.fetchMetadata(url);
  }

  public isUrlSupported(url: string): boolean {
    return this.downloaderManager.isUrlSupported(url);
  }

  public getSupportedPlatforms(): string[] {
    return this.downloaderManager.getSupportedPlatforms();
  }

  public setMaxConcurrentDownloads(limit: number): void {
    this.queueService.setDownloadConcurrency(limit);
  }

  // Cleanup methods
  public async cleanupOldFiles(olderThanHours: number = 24): Promise<number> {
    let cleaned = 0;
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);

    try {
      const files = await fs.readdir(this.config.outputDir);
      
      for (const file of files) {
        const filePath = path.join(this.config.outputDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffTime) {
          await fs.remove(filePath);
          cleaned++;
          logger.info(`Cleaned up old download file: ${file}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to cleanup old files: ${error}`);
    }

    return cleaned;
  }

  public async getStorageInfo(): Promise<{
    totalFiles: number;
    totalSize: number;
    oldestFile: Date | null;
    newestFile: Date | null;
  }> {
    let totalFiles = 0;
    let totalSize = 0;
    let oldestFile: Date | null = null;
    let newestFile: Date | null = null;

    try {
      const files = await fs.readdir(this.config.outputDir);
      
      for (const file of files) {
        const filePath = path.join(this.config.outputDir, file);
        const stats = await fs.stat(filePath);
        
        totalFiles++;
        totalSize += stats.size;
        
        if (!oldestFile || stats.mtime < oldestFile) {
          oldestFile = stats.mtime;
        }
        
        if (!newestFile || stats.mtime > newestFile) {
          newestFile = stats.mtime;
        }
      }
    } catch (error) {
      logger.error(`Failed to get storage info: ${error}`);
    }

    return { totalFiles, totalSize, oldestFile, newestFile };
  }
}

export default DownloadProcessor;