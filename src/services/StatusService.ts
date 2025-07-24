import { EventEmitter } from 'events';
import { logger } from '../logger';
import { eventBus } from '../server/events/EventBus';

// Types and interfaces
export enum StatusType {
  VIDEO = 'video',
  DOWNLOAD = 'download',
  IMPORT = 'import',
  PROCESSING = 'processing'
}

export interface StatusEntry {
  id: string;
  type: StatusType;
  status: string;
  progress?: number;
  message?: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface DownloadStatus extends StatusEntry {
  type: StatusType.DOWNLOAD;
  metadata: {
    url: string;
    videoId: string;
    jobId: string;
    filename?: string;
    fileSize?: number;
    downloadedBytes?: number;
    totalBytes?: number;
    speed?: number;
    eta?: number;
    filePath?: string;
  };
}

export interface VideoStatus extends StatusEntry {
  type: StatusType.VIDEO;
  metadata: {
    videoId: string;
    title?: string;
    outputPath?: string;
    duration?: number;
    resolution?: string;
    scenes?: number;
  };
}

// Main StatusService class
export class StatusService extends EventEmitter {
  private static instance: StatusService;
  private statuses: Map<string, StatusEntry> = new Map();
  private statusesByType: Map<StatusType, Set<string>> = new Map();
  private persistenceEnabled: boolean = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  private constructor() {
    super();
    this.initializeTypes();
    this.setupEventListeners();
    this.startCleanupTask();
  }

  public static getInstance(): StatusService {
    if (!StatusService.instance) {
      StatusService.instance = new StatusService();
    }
    return StatusService.instance;
  }

  private initializeTypes(): void {
    Object.values(StatusType).forEach(type => {
      this.statusesByType.set(type as StatusType, new Set());
    });
  }

  // Create and update methods
  public createStatus(type: StatusType, id: string, initialData: Partial<StatusEntry> = {}): StatusEntry {
    const status: StatusEntry = {
      id,
      type,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...initialData
    };

    this.statuses.set(id, status);
    this.statusesByType.get(type)?.add(id);

    logger.info(`Status created: ${type}/${id}`);
    this.emit('status:created', status);

    return status;
  }

  public updateStatus(id: string, updates: Partial<StatusEntry>): StatusEntry | null {
    const status = this.statuses.get(id);
    if (!status) {
      logger.warn(`Status not found: ${id}`);
      return null;
    }

    Object.assign(status, updates, {
      updatedAt: new Date()
    });

    if (updates.status === 'completed' && !status.completedAt) {
      status.completedAt = new Date();
    }

    logger.debug(`Status updated: ${id}`, updates);
    this.emit('status:updated', status);

    return status;
  }

  // Download-specific methods
  public createDownloadStatus(jobId: string, data: {
    url: string;
    videoId: string;
    filename?: string;
  }): DownloadStatus {
    const status = this.createStatus(StatusType.DOWNLOAD, jobId, {
      metadata: {
        jobId,
        ...data
      }
    }) as DownloadStatus;

    return status;
  }

  public updateDownloadProgress(jobId: string, progress: {
    downloadedBytes: number;
    totalBytes: number;
    speed: number;
    eta: number;
    progress: number;
  }): void {
    const status = this.getStatus(jobId) as DownloadStatus;
    if (!status) {
      return;
    }

    this.updateStatus(jobId, {
      progress: progress.progress,
      metadata: {
        ...status.metadata,
        downloadedBytes: progress.downloadedBytes,
        totalBytes: progress.totalBytes,
        speed: progress.speed,
        eta: progress.eta
      }
    });
  }

  public completeDownload(jobId: string, data: {
    filePath: string;
    fileSize: number;
  }): void {
    const status = this.getStatus(jobId) as DownloadStatus;
    if (!status) {
      return;
    }

    this.updateStatus(jobId, {
      status: 'completed',
      metadata: {
        ...status.metadata,
        filePath: data.filePath,
        fileSize: data.fileSize
      }
    });
  }

  // Query methods
  public getStatus(id: string): StatusEntry | null {
    return this.statuses.get(id) || null;
  }

  public getStatusesByType(type: StatusType): StatusEntry[] {
    const ids = this.statusesByType.get(type) || new Set();
    return Array.from(ids)
      .map(id => this.statuses.get(id))
      .filter(Boolean) as StatusEntry[];
  }

  public getActiveDownloads(): DownloadStatus[] {
    return this.getStatusesByType(StatusType.DOWNLOAD)
      .filter(s => s.status === 'processing' || s.status === 'pending') as DownloadStatus[];
  }

  public getDownloadsByVideoId(videoId: string): DownloadStatus[] {
    return this.getStatusesByType(StatusType.DOWNLOAD)
      .filter(s => (s as DownloadStatus).metadata.videoId === videoId) as DownloadStatus[];
  }

  // Cleanup methods
  public deleteStatus(id: string): boolean {
    const status = this.statuses.get(id);
    if (!status) {
      return false;
    }

    this.statuses.delete(id);
    this.statusesByType.get(status.type)?.delete(id);

    logger.info(`Status deleted: ${id}`);
    this.emit('status:deleted', { id, type: status.type });

    return true;
  }

  public cleanupOldStatuses(olderThanHours: number = 24): number {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);

    const toDelete: string[] = [];

    this.statuses.forEach((status, id) => {
      if (status.completedAt && status.completedAt < cutoffTime) {
        toDelete.push(id);
      }
    });

    toDelete.forEach(id => this.deleteStatus(id));

    if (toDelete.length > 0) {
      logger.info(`Cleaned up ${toDelete.length} old statuses`);
    }

    return toDelete.length;
  }

  // Event listeners
  private setupEventListeners(): void {
    // Listen for download events from EventBus
    eventBus.on('download:status', (event: any) => {
      if (event.status === 'pending') {
        this.createDownloadStatus(event.jobId, {
          url: event.url || '',
          videoId: event.videoId,
          filename: event.filename
        });
      } else {
        this.updateStatus(event.jobId, {
          status: event.status,
          message: event.message
        });
      }
    });

    eventBus.on('download:progress', (event: any) => {
      this.updateDownloadProgress(event.jobId, {
        downloadedBytes: event.downloadedBytes,
        totalBytes: event.totalBytes,
        speed: event.speed,
        eta: event.eta,
        progress: event.progress
      });
    });

    eventBus.on('download:complete', (event: any) => {
      this.completeDownload(event.jobId, {
        filePath: event.filePath,
        fileSize: event.fileSize
      });
    });

    eventBus.on('download:error', (event: any) => {
      this.updateStatus(event.jobId, {
        status: 'failed',
        error: event.error
      });
    });
  }

  // Cleanup task
  private startCleanupTask(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldStatuses(24); // Clean up statuses older than 24 hours
    }, 60 * 60 * 1000);
  }

  public stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Export/Import for persistence (if needed)
  public exportStatuses(): Record<string, StatusEntry> {
    const exported: Record<string, StatusEntry> = {};
    this.statuses.forEach((status, id) => {
      exported[id] = { ...status };
    });
    return exported;
  }

  public importStatuses(data: Record<string, StatusEntry>): void {
    Object.entries(data).forEach(([id, status]) => {
      this.statuses.set(id, {
        ...status,
        createdAt: new Date(status.createdAt),
        updatedAt: new Date(status.updatedAt),
        completedAt: status.completedAt ? new Date(status.completedAt) : undefined
      });
      this.statusesByType.get(status.type)?.add(id);
    });
    logger.info(`Imported ${Object.keys(data).length} statuses`);
  }
}

// Export singleton instance
export const statusService = StatusService.getInstance();