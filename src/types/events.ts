// WebSocket Events and Event Bus Type Definitions
// This file contains all TypeScript interfaces for real-time communication

// === Base Event Interface ===

export interface BaseEvent {
  timestamp: string;
}

export interface BaseVideoEvent extends BaseEvent {
  videoId: string;
}

export interface BaseJobEvent extends BaseEvent {
  jobId: string;
}

// === Video Processing Events ===

export interface VideoStatusUpdateEvent extends BaseVideoEvent {
  status: string;
  progress?: number;
  message?: string;
}

export interface VideoProcessingProgressEvent extends BaseVideoEvent {
  progress: number;
  stage: string;
  message?: string;
}

export interface VideoCompletedEvent extends BaseVideoEvent {
  outputPath?: string;
  result?: unknown;
}

export interface VideoErrorEvent extends BaseVideoEvent {
  error: string;
}

export interface SceneProcessingEvent extends BaseVideoEvent {
  sceneIndex: number;
  totalScenes: number;
  stage: string;
  progress: number;
}

// === Import Events ===

export interface ImportProgressEvent extends BaseJobEvent {
  stage: string;
  progress: number;
  message?: string;
}

export interface ImportCompleteEvent extends BaseJobEvent {
  videoId: string;
}

export interface ImportErrorEvent extends BaseJobEvent {
  error: string;
}

// === Download Events ===

export interface DownloadProgressEvent extends BaseJobEvent {
  videoId: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
}

export interface DownloadStatusEvent extends BaseJobEvent {
  videoId: string;
  status: string;
  message?: string;
}

export interface DownloadCompleteEvent extends BaseJobEvent {
  videoId: string;
  filePath: string;
  fileSize: number;
  duration: number;
}

export interface DownloadErrorEvent extends BaseJobEvent {
  videoId: string;
  error: string;
  retries: number;
  willRetry: boolean;
}

// === WebSocket Client Events (Outgoing) ===

export interface ClientVideoSubscribeEvent {
  videoId: string;
}

export interface ClientVideoUnsubscribeEvent {
  videoId: string;
}

export interface ClientImportSubscribeEvent {
  jobId: string;
}

export interface ClientImportUnsubscribeEvent {
  jobId: string;
}

export interface ClientDownloadSubscribeEvent {
  jobId: string;
}

export interface ClientDownloadUnsubscribeEvent {
  jobId: string;
}

export interface ClientPingEvent {
  timestamp: string;
}

export interface ClientPongEvent {
  timestamp: string;
}

// === WebSocket Server Events (Incoming/Broadcast) ===

export interface ServerVideoStatusEvent extends VideoStatusUpdateEvent {}

export interface ServerVideoCompleteEvent extends VideoCompletedEvent {}

export interface ServerVideoErrorEvent extends VideoErrorEvent {}

export interface ServerImportProgressEvent extends ImportProgressEvent {}

export interface ServerImportCompleteEvent extends ImportCompleteEvent {}

export interface ServerImportErrorEvent extends ImportErrorEvent {}

export interface ServerDownloadProgressEvent extends DownloadProgressEvent {}

export interface ServerDownloadStatusEvent extends DownloadStatusEvent {}

export interface ServerDownloadCompleteEvent extends DownloadCompleteEvent {}

export interface ServerDownloadErrorEvent extends DownloadErrorEvent {}

// === Event Names (Constants) ===

export enum WebSocketEvent {
  // Connection events
  CONNECTION = 'connection',
  DISCONNECT = 'disconnect',
  PING = 'ping',
  PONG = 'pong',
  
  // Client subscription events
  SUBSCRIBE_VIDEO = 'subscribe-video',
  UNSUBSCRIBE_VIDEO = 'unsubscribe-video',
  SUBSCRIBE_IMPORT = 'subscribe-import',
  UNSUBSCRIBE_IMPORT = 'unsubscribe-import',
  SUBSCRIBE_DOWNLOAD = 'subscribe-download',
  UNSUBSCRIBE_DOWNLOAD = 'unsubscribe-download',
  
  // Server broadcast events
  VIDEO_STATUS = 'video-status',
  VIDEO_COMPLETE = 'video-complete',
  VIDEO_ERROR = 'video-error',
  IMPORT_PROGRESS = 'import-progress',
  IMPORT_COMPLETE = 'import-complete',
  IMPORT_ERROR = 'import-error',
  DOWNLOAD_PROGRESS = 'download-progress',
  DOWNLOAD_STATUS = 'download-status',
  DOWNLOAD_COMPLETE = 'download-complete',
  DOWNLOAD_ERROR = 'download-error'
}

export enum EventBusEvent {
  // Video events
  VIDEO_STATUS_UPDATED = 'video-status-updated',
  VIDEO_PROCESSING_PROGRESS = 'video:processing:progress',
  VIDEO_COMPLETED = 'video-completed',
  VIDEO_ERROR = 'video-error',
  SCENE_PROCESSING = 'scene-processing',
  
  // Import events
  IMPORT_PROGRESS = 'import-progress',
  IMPORT_COMPLETE = 'import-complete',
  IMPORT_ERROR = 'import-error',
  
  // Download events
  DOWNLOAD_PROGRESS = 'download:progress',
  DOWNLOAD_STATUS = 'download:status',
  DOWNLOAD_COMPLETE = 'download:complete',
  DOWNLOAD_ERROR = 'download:error'
}

// === Event Data Type Map for Type Safety ===

export interface WebSocketEventMap {
  // Client to server
  [WebSocketEvent.SUBSCRIBE_VIDEO]: ClientVideoSubscribeEvent;
  [WebSocketEvent.UNSUBSCRIBE_VIDEO]: ClientVideoUnsubscribeEvent;
  [WebSocketEvent.SUBSCRIBE_IMPORT]: ClientImportSubscribeEvent;
  [WebSocketEvent.UNSUBSCRIBE_IMPORT]: ClientImportUnsubscribeEvent;
  [WebSocketEvent.SUBSCRIBE_DOWNLOAD]: ClientDownloadSubscribeEvent;
  [WebSocketEvent.UNSUBSCRIBE_DOWNLOAD]: ClientDownloadUnsubscribeEvent;
  [WebSocketEvent.PING]: ClientPingEvent;
  
  // Server to client
  [WebSocketEvent.PONG]: ClientPongEvent;
  [WebSocketEvent.VIDEO_STATUS]: ServerVideoStatusEvent;
  [WebSocketEvent.VIDEO_COMPLETE]: ServerVideoCompleteEvent;
  [WebSocketEvent.VIDEO_ERROR]: ServerVideoErrorEvent;
  [WebSocketEvent.IMPORT_PROGRESS]: ServerImportProgressEvent;
  [WebSocketEvent.IMPORT_COMPLETE]: ServerImportCompleteEvent;
  [WebSocketEvent.IMPORT_ERROR]: ServerImportErrorEvent;
  [WebSocketEvent.DOWNLOAD_PROGRESS]: ServerDownloadProgressEvent;
  [WebSocketEvent.DOWNLOAD_STATUS]: ServerDownloadStatusEvent;
  [WebSocketEvent.DOWNLOAD_COMPLETE]: ServerDownloadCompleteEvent;
  [WebSocketEvent.DOWNLOAD_ERROR]: ServerDownloadErrorEvent;
}

export interface EventBusEventMap {
  [EventBusEvent.VIDEO_STATUS_UPDATED]: VideoStatusUpdateEvent;
  [EventBusEvent.VIDEO_PROCESSING_PROGRESS]: VideoProcessingProgressEvent;
  [EventBusEvent.VIDEO_COMPLETED]: VideoCompletedEvent;
  [EventBusEvent.VIDEO_ERROR]: VideoErrorEvent;
  [EventBusEvent.SCENE_PROCESSING]: SceneProcessingEvent;
  [EventBusEvent.IMPORT_PROGRESS]: ImportProgressEvent;
  [EventBusEvent.IMPORT_COMPLETE]: ImportCompleteEvent;
  [EventBusEvent.IMPORT_ERROR]: ImportErrorEvent;
  [EventBusEvent.DOWNLOAD_PROGRESS]: DownloadProgressEvent;
  [EventBusEvent.DOWNLOAD_STATUS]: DownloadStatusEvent;
  [EventBusEvent.DOWNLOAD_COMPLETE]: DownloadCompleteEvent;
  [EventBusEvent.DOWNLOAD_ERROR]: DownloadErrorEvent;
}

// === Type Guards ===

export function isVideoEvent(event: BaseEvent): event is BaseVideoEvent {
  return 'videoId' in event && typeof (event as BaseVideoEvent).videoId === 'string';
}

export function isJobEvent(event: BaseEvent): event is BaseJobEvent {
  return 'jobId' in event && typeof (event as BaseJobEvent).jobId === 'string';
}

export function isProgressEvent(event: BaseEvent): event is VideoProcessingProgressEvent | DownloadProgressEvent | ImportProgressEvent {
  return 'progress' in event && typeof (event as any).progress === 'number';
}

export function isErrorEvent(event: BaseEvent): event is VideoErrorEvent | ImportErrorEvent | DownloadErrorEvent {
  return 'error' in event && typeof (event as any).error === 'string';
}

// === Room Names for WebSocket ===

export function getVideoRoom(videoId: string): string {
  return `video-${videoId}`;
}

export function getImportRoom(jobId: string): string {
  return `import-${jobId}`;
}

export function getDownloadRoom(jobId: string): string {
  return `download-${jobId}`;
}

// === Event Creation Helpers ===

export function createVideoStatusEvent(
  videoId: string, 
  status: string, 
  progress?: number, 
  message?: string
): VideoStatusUpdateEvent {
  return {
    videoId,
    status,
    progress,
    message,
    timestamp: new Date().toISOString()
  };
}

export function createVideoCompleteEvent(
  videoId: string, 
  outputPath?: string, 
  result?: unknown
): VideoCompletedEvent {
  return {
    videoId,
    outputPath,
    result,
    timestamp: new Date().toISOString()
  };
}

export function createVideoErrorEvent(videoId: string, error: string): VideoErrorEvent {
  return {
    videoId,
    error,
    timestamp: new Date().toISOString()
  };
}

export function createImportProgressEvent(
  jobId: string, 
  stage: string, 
  progress: number, 
  message?: string
): ImportProgressEvent {
  return {
    jobId,
    stage,
    progress,
    message,
    timestamp: new Date().toISOString()
  };
}

export function createDownloadProgressEvent(
  jobId: string,
  videoId: string,
  progress: number,
  downloadedBytes: number,
  totalBytes: number,
  speed: number,
  eta: number
): DownloadProgressEvent {
  return {
    jobId,
    videoId,
    progress,
    downloadedBytes,
    totalBytes,
    speed,
    eta,
    timestamp: new Date().toISOString()
  };
}