import { EventEmitter } from 'events';

// Event type definitions
export interface VideoStatusUpdateEvent {
  videoId: string;
  status: string;
  progress?: number;
  message?: string;
  timestamp: string;
}

export interface VideoProcessingProgressEvent {
  videoId: string;
  progress: number;
  stage: string;
  message?: string;
  timestamp: string;
}

export interface VideoCompletedEvent {
  videoId: string;
  result: any;
  timestamp: string;
}

export interface VideoErrorEvent {
  videoId: string;
  error: string;
  timestamp: string;
}

export interface SceneProcessingEvent {
  videoId: string;
  sceneIndex: number;
  totalScenes: number;
  stage: string;
  progress: number;
  timestamp: string;
}

// Download event type definitions
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
  status: string;
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

// Event Bus class using singleton pattern
export class EventBus extends EventEmitter {
  private static instance: EventBus;
  private listenerTracker: WeakMap<any, Set<string>> = new WeakMap();
  private videoListeners: Map<string, Set<Function>> = new Map();

  private constructor() {
    super();
    this.setMaxListeners(100); // Increase max listeners for high-throughput scenarios
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  // Video status update events
  public emitVideoStatusUpdate(event: VideoStatusUpdateEvent): void {
    this.emit('video:status:update', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onVideoStatusUpdate(listener: (event: VideoStatusUpdateEvent) => void, videoId?: string): void {
    this.on('video:status:update', listener);
    if (videoId) {
      this.trackListener(videoId, listener);
    }
  }

  // Video processing progress events
  public emitVideoProcessingProgress(event: VideoProcessingProgressEvent): void {
    this.emit('video:processing:progress', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onVideoProcessingProgress(listener: (event: VideoProcessingProgressEvent) => void, videoId?: string): void {
    this.on('video:processing:progress', listener);
    if (videoId) {
      this.trackListener(videoId, listener);
    }
  }

  // Video completion events
  public emitVideoCompleted(event: VideoCompletedEvent): void {
    this.emit('video:completed', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onVideoCompleted(listener: (event: VideoCompletedEvent) => void, videoId?: string): void {
    this.on('video:completed', listener);
    if (videoId) {
      this.trackListener(videoId, listener);
    }
  }

  // Video error events
  public emitVideoError(event: VideoErrorEvent): void {
    this.emit('video:error', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onVideoError(listener: (event: VideoErrorEvent) => void, videoId?: string): void {
    this.on('video:error', listener);
    if (videoId) {
      this.trackListener(videoId, listener);
    }
  }

  // Scene processing events
  public emitSceneProcessing(event: SceneProcessingEvent): void {
    this.emit('scene:processing', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onSceneProcessing(listener: (event: SceneProcessingEvent) => void): void {
    this.on('scene:processing', listener);
  }

  // Download progress events
  public emitDownloadProgress(event: DownloadProgressEvent): void {
    this.emit('download:progress', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onDownloadProgress(listener: (event: DownloadProgressEvent) => void): void {
    this.on('download:progress', listener);
  }

  // Download status events
  public emitDownloadStatus(event: DownloadStatusEvent): void {
    this.emit('download:status', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onDownloadStatus(listener: (event: DownloadStatusEvent) => void): void {
    this.on('download:status', listener);
  }

  // Download complete events
  public emitDownloadComplete(event: DownloadCompleteEvent): void {
    this.emit('download:complete', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onDownloadComplete(listener: (event: DownloadCompleteEvent) => void): void {
    this.on('download:complete', listener);
  }

  // Download error events
  public emitDownloadError(event: DownloadErrorEvent): void {
    this.emit('download:error', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onDownloadError(listener: (event: DownloadErrorEvent) => void): void {
    this.on('download:error', listener);
  }

  // Generic event methods
  public removeAllListenersForVideo(videoId: string): void {
    // Remove all listeners for a specific video
    const listeners = this.videoListeners.get(videoId);
    if (listeners) {
      const events = ['video:status:update', 'video:processing:progress', 'video:completed', 'video:error', 'scene:processing'];
      events.forEach(eventName => {
        listeners.forEach(listener => {
          this.removeListener(eventName, listener);
        });
      });
      this.videoListeners.delete(videoId);
    }
  }

  // Track listeners for proper cleanup
  private trackListener(videoId: string, listener: Function): void {
    if (!this.videoListeners.has(videoId)) {
      this.videoListeners.set(videoId, new Set());
    }
    this.videoListeners.get(videoId)!.add(listener);
  }

  // Enhanced cleanup methods
  public cleanup(): void {
    this.removeAllListeners();
    this.videoListeners.clear();
  }

  // Cleanup listeners older than specified time
  public cleanupStaleListeners(maxAgeMs: number = 30 * 60 * 1000): void { // 30 minutes default
    const now = Date.now();
    for (const [videoId, listeners] of this.videoListeners.entries()) {
      // Clean up listeners for videos that haven't been active recently
      // This is a simple heuristic - in practice you might track timestamps
      if (listeners.size === 0) {
        this.videoListeners.delete(videoId);
      }
    }
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();