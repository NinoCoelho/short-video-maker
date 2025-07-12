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

// Event Bus class using singleton pattern
export class EventBus extends EventEmitter {
  private static instance: EventBus;

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

  public onVideoStatusUpdate(listener: (event: VideoStatusUpdateEvent) => void): void {
    this.on('video:status:update', listener);
  }

  // Video processing progress events
  public emitVideoProcessingProgress(event: VideoProcessingProgressEvent): void {
    this.emit('video:processing:progress', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onVideoProcessingProgress(listener: (event: VideoProcessingProgressEvent) => void): void {
    this.on('video:processing:progress', listener);
  }

  // Video completion events
  public emitVideoCompleted(event: VideoCompletedEvent): void {
    this.emit('video:completed', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onVideoCompleted(listener: (event: VideoCompletedEvent) => void): void {
    this.on('video:completed', listener);
  }

  // Video error events
  public emitVideoError(event: VideoErrorEvent): void {
    this.emit('video:error', {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  public onVideoError(listener: (event: VideoErrorEvent) => void): void {
    this.on('video:error', listener);
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

  // Generic event methods
  public removeAllListenersForVideo(videoId: string): void {
    // Remove all listeners for a specific video
    const events = ['video:status:update', 'video:processing:progress', 'video:completed', 'video:error', 'scene:processing'];
    events.forEach(eventName => {
      const listeners = this.listeners(eventName);
      listeners.forEach(listener => {
        // Note: This is a simple implementation. In practice, you might want to track listeners by videoId
        // For now, we'll rely on the WebSocket server to manage subscriptions
      });
    });
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();