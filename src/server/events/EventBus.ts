import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

export interface VideoStatusUpdateEvent {
  videoId: string;
  status: string;
  progress?: number;
  message?: string;
  error?: string;
}

export interface VideoProcessingProgressEvent {
  videoId: string;
  stage: string;
  progress: number;
  total?: number;
  message?: string;
}

export interface VideoCompletedEvent {
  videoId: string;
  outputPath: string;
  duration?: number;
}

export interface VideoErrorEvent {
  videoId: string;
  error: string;
  stage?: string;
}

export interface SceneProcessingEvent {
  videoId: string;
  sceneIndex: number;
  totalScenes: number;
  stage: string;
  progress?: number;
}

class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(0); // Unlimited listeners
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  // Video status updates
  emitVideoStatusUpdate(event: VideoStatusUpdateEvent) {
    this.emit('video:status:update', event);
  }

  onVideoStatusUpdate(listener: (event: VideoStatusUpdateEvent) => void) {
    this.on('video:status:update', listener);
    return () => this.off('video:status:update', listener);
  }

  // Video processing progress
  emitVideoProcessingProgress(event: VideoProcessingProgressEvent) {
    this.emit('video:processing:progress', event);
  }

  onVideoProcessingProgress(listener: (event: VideoProcessingProgressEvent) => void) {
    this.on('video:processing:progress', listener);
    return () => this.off('video:processing:progress', listener);
  }

  // Video completed
  emitVideoCompleted(event: VideoCompletedEvent) {
    this.emit('video:completed', event);
  }

  onVideoCompleted(listener: (event: VideoCompletedEvent) => void) {
    this.on('video:completed', listener);
    return () => this.off('video:completed', listener);
  }

  // Video error
  emitVideoError(event: VideoErrorEvent) {
    this.emit('video:error', event);
  }

  onVideoError(listener: (event: VideoErrorEvent) => void) {
    this.on('video:error', listener);
    return () => this.off('video:error', listener);
  }

  // Scene processing
  emitSceneProcessing(event: SceneProcessingEvent) {
    this.emit('scene:processing', event);
  }

  onSceneProcessing(listener: (event: SceneProcessingEvent) => void) {
    this.on('scene:processing', listener);
    return () => this.off('scene:processing', listener);
  }

  // Generic event emitters for extensibility
  emitCustomEvent(eventName: string, data: any) {
    this.emit(eventName, data);
  }

  onCustomEvent(eventName: string, listener: (data: any) => void) {
    this.on(eventName, listener);
    return () => this.off(eventName, listener);
  }

  // Cleanup
  removeAllListenersForVideo(videoId: string) {
    // This is a pattern-based cleanup - remove all listeners that might be video-specific
    // In practice, you might want to track listeners per video ID
    logger.debug(`Cleaning up listeners for video ${videoId}`);
  }
}

export const eventBus = EventBus.getInstance();