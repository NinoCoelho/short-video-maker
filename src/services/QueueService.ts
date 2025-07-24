import { EventEmitter } from 'events';
import { logger } from '../logger';
import { eventBus } from '../server/events/EventBus';

// Types and interfaces
export enum QueuePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3
}

export enum QueueItemStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface QueueItem<T = any> {
  id: string;
  type: string;
  priority: QueuePriority;
  status: QueueItemStatus;
  data: T;
  retries: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  progress?: number;
}

export interface DownloadQueueData {
  url: string;
  videoId: string;
  jobId: string;
  filename?: string;
  headers?: Record<string, string>;
  metadata?: any;
}

export interface QueueOptions {
  maxConcurrent: number;
  retryDelay: number;
  defaultMaxRetries: number;
}

// Event definitions
export interface DownloadProgressEvent {
  jobId: string;
  videoId: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  timestamp: string;
}

export interface DownloadStatusEvent {
  jobId: string;
  videoId: string;
  status: QueueItemStatus;
  message?: string;
  timestamp: string;
}

export interface DownloadCompleteEvent {
  jobId: string;
  videoId: string;
  filePath: string;
  fileSize: number;
  duration: number;
  timestamp: string;
}

export interface DownloadErrorEvent {
  jobId: string;
  videoId: string;
  error: string;
  retries: number;
  willRetry: boolean;
  timestamp: string;
}

// Main QueueService class
export class QueueService extends EventEmitter {
  private static instance: QueueService;
  private queues: Map<string, QueueItem[]> = new Map();
  private activeItems: Map<string, Set<string>> = new Map();
  private options: QueueOptions;
  private processors: Map<string, (item: QueueItem) => Promise<any>> = new Map();

  private constructor(options?: Partial<QueueOptions>) {
    super();
    this.options = {
      maxConcurrent: options?.maxConcurrent || 3,
      retryDelay: options?.retryDelay || 5000,
      defaultMaxRetries: options?.defaultMaxRetries || 3
    };
    
    // Initialize download queue
    this.createQueue('download');
    this.setupEventListeners();
  }

  public static getInstance(options?: Partial<QueueOptions>): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService(options);
    }
    return QueueService.instance;
  }

  // Queue management methods
  public createQueue(name: string): void {
    if (!this.queues.has(name)) {
      this.queues.set(name, []);
      this.activeItems.set(name, new Set());
      logger.info(`Queue created: ${name}`);
    }
  }

  public registerProcessor(queueName: string, processor: (item: QueueItem) => Promise<any>): void {
    this.processors.set(queueName, processor);
    logger.info(`Processor registered for queue: ${queueName}`);
  }

  // Add item to queue with priority
  public async addToQueue<T = any>(
    queueName: string,
    data: T,
    priority: QueuePriority = QueuePriority.NORMAL,
    maxRetries?: number
  ): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} does not exist`);
    }

    const item: QueueItem<T> = {
      id: this.generateId(),
      type: queueName,
      priority,
      status: QueueItemStatus.PENDING,
      data,
      retries: 0,
      maxRetries: maxRetries || this.options.defaultMaxRetries,
      createdAt: new Date()
    };

    // Insert item based on priority
    const insertIndex = this.findInsertIndex(queue, priority);
    queue.splice(insertIndex, 0, item);

    logger.info(`Item ${item.id} added to ${queueName} queue with priority ${priority}`);
    
    // Process queue
    this.processQueue(queueName);

    return item.id;
  }

  // Download-specific methods
  public async addDownload(
    data: DownloadQueueData,
    priority: QueuePriority = QueuePriority.NORMAL
  ): Promise<string> {
    const jobId = await this.addToQueue('download', data, priority);
    
    // Emit initial status
    this.emitDownloadStatus({
      jobId: data.jobId,
      videoId: data.videoId,
      status: QueueItemStatus.PENDING,
      message: 'Download queued',
      timestamp: new Date().toISOString()
    });

    return jobId;
  }

  public setDownloadConcurrency(limit: number): void {
    this.options.maxConcurrent = limit;
    logger.info(`Download concurrency limit set to ${limit}`);
  }

  public getQueueStatus(queueName: string): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const queue = this.queues.get(queueName) || [];
    const active = this.activeItems.get(queueName)?.size || 0;

    return {
      pending: queue.filter(item => item.status === QueueItemStatus.PENDING).length,
      processing: active,
      completed: queue.filter(item => item.status === QueueItemStatus.COMPLETED).length,
      failed: queue.filter(item => item.status === QueueItemStatus.FAILED).length
    };
  }

  public getDownloadProgress(jobId: string): QueueItem<DownloadQueueData> | undefined {
    const queue = this.queues.get('download') || [];
    return queue.find(item => item.data.jobId === jobId) as QueueItem<DownloadQueueData>;
  }

  public async cancelDownload(jobId: string): Promise<boolean> {
    const queue = this.queues.get('download') || [];
    const itemIndex = queue.findIndex(item => 
      (item.data as DownloadQueueData).jobId === jobId
    );

    if (itemIndex === -1) {
      return false;
    }

    const item = queue[itemIndex];
    if (item.status === QueueItemStatus.PROCESSING) {
      // Emit cancellation event for the processor to handle
      this.emit(`cancel:${item.id}`);
    }

    item.status = QueueItemStatus.CANCELLED;
    queue.splice(itemIndex, 1);

    this.emitDownloadStatus({
      jobId,
      videoId: (item.data as DownloadQueueData).videoId,
      status: QueueItemStatus.CANCELLED,
      message: 'Download cancelled',
      timestamp: new Date().toISOString()
    });

    return true;
  }

  // Private methods
  private async processQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    const activeItems = this.activeItems.get(queueName);
    const processor = this.processors.get(queueName);

    if (!queue || !activeItems || !processor) {
      return;
    }

    // Check if we can process more items
    if (activeItems.size >= this.options.maxConcurrent) {
      return;
    }

    // Find next pending item
    const nextItem = queue.find(item => item.status === QueueItemStatus.PENDING);
    if (!nextItem) {
      return;
    }

    // Mark as processing
    nextItem.status = QueueItemStatus.PROCESSING;
    nextItem.startedAt = new Date();
    activeItems.add(nextItem.id);

    // Process item
    try {
      await processor(nextItem);
      nextItem.status = QueueItemStatus.COMPLETED;
      nextItem.completedAt = new Date();
      
      // Remove from queue if completed
      const index = queue.indexOf(nextItem);
      if (index > -1) {
        queue.splice(index, 1);
      }
    } catch (error) {
      nextItem.retries++;
      nextItem.error = error instanceof Error ? error.message : String(error);

      if (nextItem.retries < nextItem.maxRetries) {
        // Retry after delay
        nextItem.status = QueueItemStatus.PENDING;
        setTimeout(() => this.processQueue(queueName), this.options.retryDelay);
        
        logger.warn(`Item ${nextItem.id} failed, will retry (${nextItem.retries}/${nextItem.maxRetries})`);
      } else {
        // Max retries reached
        nextItem.status = QueueItemStatus.FAILED;
        logger.error(`Item ${nextItem.id} failed after ${nextItem.retries} retries`);
      }
    } finally {
      activeItems.delete(nextItem.id);
      // Process next item
      this.processQueue(queueName);
    }
  }

  private findInsertIndex(queue: QueueItem[], priority: QueuePriority): number {
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].priority < priority) {
        return i;
      }
    }
    return queue.length;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Event emission methods
  public emitDownloadProgress(event: DownloadProgressEvent): void {
    eventBus.emit('download:progress', event);
    this.emit('download:progress', event);
  }

  public emitDownloadStatus(event: DownloadStatusEvent): void {
    eventBus.emit('download:status', event);
    this.emit('download:status', event);
  }

  public emitDownloadComplete(event: DownloadCompleteEvent): void {
    eventBus.emit('download:complete', event);
    this.emit('download:complete', event);
  }

  public emitDownloadError(event: DownloadErrorEvent): void {
    eventBus.emit('download:error', event);
    this.emit('download:error', event);
  }

  // Setup event listeners
  private setupEventListeners(): void {
    // Listen for download progress updates from processors
    this.on('download:progress:update', (data: {
      itemId: string;
      progress: number;
      downloadedBytes: number;
      totalBytes: number;
      speed: number;
      eta: number;
    }) => {
      const queue = this.queues.get('download') || [];
      const item = queue.find(i => i.id === data.itemId);
      if (item) {
        item.progress = data.progress;
        const downloadData = item.data as DownloadQueueData;
        
        this.emitDownloadProgress({
          jobId: downloadData.jobId,
          videoId: downloadData.videoId,
          progress: data.progress,
          downloadedBytes: data.downloadedBytes,
          totalBytes: data.totalBytes,
          speed: data.speed,
          eta: data.eta,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  // Cleanup methods
  public clearCompletedItems(queueName: string): number {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return 0;
    }

    const completed = queue.filter(item => 
      item.status === QueueItemStatus.COMPLETED || 
      item.status === QueueItemStatus.FAILED
    );

    completed.forEach(item => {
      const index = queue.indexOf(item);
      if (index > -1) {
        queue.splice(index, 1);
      }
    });

    return completed.length;
  }
}

// Export singleton instance
export const queueService = QueueService.getInstance();