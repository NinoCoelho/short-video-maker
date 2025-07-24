// API Request and Response Types
// This file contains all TypeScript interfaces for API communication

import { SceneInput, RenderConfig, VideoStatusObject, VideoData } from './shorts';

// === Request Types ===

export interface ApiRequest<T = unknown> {
  body: T;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
}

export interface RenderVideoRequest {
  id?: string; // For re-rendering existing videos
  scenes: SceneInput[];
  config: RenderConfig;
}

export interface SaveVideoDataRequest {
  processEdition?: boolean;
  reRender?: boolean;
  videoData: VideoData;
}

export interface ReRenderRequest {
  editedData?: Partial<VideoData>;
}

export interface ProcessEditionRequest {
  videoData: VideoData;
}

export interface GetLogsRequest {
  limit?: number;
}

// === Response Types ===

export interface ApiResponse<T = unknown> {
  message?: string;
  error?: string;
  details?: string;
  data?: T;
}

export interface ApiError {
  error: string;
  details?: string;
  statusCode: number;
}

export interface RenderVideoResponse {
  message: string;
  videoId: string;
}

export interface VideoStatusResponse extends VideoStatusObject {}

export interface VideoListResponse {
  videos: VideoData[];
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  videoId: string;
}

export interface GetLogsResponse {
  logs: LogEntry[];
  total: number;
}

export interface DeleteVideoResponse {
  success?: boolean;
  message?: string;
}

export interface SaveVideoDataResponse {
  message: string;
  reRenderStarted?: boolean;
  videoId?: string;
}

export interface ReRenderResponse {
  message: string;
  videoId: string;
}

export interface ScriptResponse {
  scenes: SceneInput[];
  config: RenderConfig;
}

export interface WebhookRequest {
  type: string;
  payload: unknown;
  timestamp: string;
}

export interface WebhookResponse {
  message: string;
  received: boolean;
}

// === File Serving Types ===

export interface VideoStreamHeaders {
  'Content-Range'?: string;
  'Accept-Ranges': string;
  'Content-Length': number;
  'Content-Type': 'video/mp4';
}

export interface AudioStreamHeaders {
  'Content-Length': number;
  'Content-Type': 'audio/wav';
}

export interface RangeRequest {
  start: number;
  end: number;
  total: number;
}

// === Background Video Search ===

export interface SearchBackgroundVideosRequest {
  query: string;
  duration?: number;
  quality?: 'best' | 'good' | 'medium';
}

export interface BackgroundVideo {
  id: string;
  url: string;
  preview_url: string;
  title: string;
  duration: number;
  quality: string;
  provider: string;
}

export interface SearchBackgroundVideosResponse {
  videos: BackgroundVideo[];
  total: number;
  query: string;
}

// === TTS Generation ===

export interface GenerateTTSRequest {
  text: string;
  voice: string;
  language?: string;
  speed?: number;
}

export interface GenerateTTSResponse {
  audioUrl: string;
  audioPath: string;
  duration: number;
}

// === Scene Management ===

export interface ReplaceSceneVideoRequest {
  sceneIndex: number;
  newVideoUrl: string;
  newVideoId?: string;
}

export interface ReplaceSceneVideoResponse {
  message: string;
  sceneIndex: number;
  newVideoUrl: string;
}

export interface RegenerateSceneAudioRequest {
  sceneIndex: number;
  newText?: string;
  voice?: string;
}

export interface RegenerateSceneAudioResponse {
  message: string;
  sceneIndex: number;
  audioUrl: string;
}

// === Health Check ===

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  version?: string;
  services: {
    database: 'connected' | 'disconnected';
    storage: 'available' | 'unavailable';
    queue: 'active' | 'inactive';
  };
}

// === Type Guards ===

export function isApiError(response: unknown): response is ApiError {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as ApiError).error === 'string'
  );
}

export function isRenderVideoRequest(body: unknown): body is RenderVideoRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    'scenes' in body &&
    'config' in body &&
    Array.isArray((body as RenderVideoRequest).scenes)
  );
}

// === HTTP Status Codes ===

export enum ApiStatusCode {
  // Success
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  
  // Redirection
  MOVED_PERMANENTLY = 301,
  FOUND = 302,
  
  // Client Errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  
  // Server Errors
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504
}

// === API Endpoint Paths ===

export enum ApiEndpoint {
  // Video operations
  RENDER_VIDEO = '/api/render',
  SHORT_VIDEO = '/api/short-video',
  VIDEO_STATUS = '/api/status/:id',
  SHORT_VIDEO_STATUS = '/api/short-video/:id/status',
  VIDEO_DOWNLOAD = '/api/short-video/:id',
  VIDEO_LIST = '/api/short-videos',
  DELETE_VIDEO = '/api/short-video/:id',
  
  // Video data management
  SAVE_VIDEO_DATA = '/api/video-data/:id',
  GET_VIDEO_DATA = '/api/video-data/:id',
  RERENDER_VIDEO = '/api/video-data/:id/rerender',
  PROCESS_EDITION = '/api/video-data/:id/process-edition',
  
  // File serving
  VIDEO_STREAM = '/api/video/:id',
  TEMP_FILE = '/api/tmp/:filename',
  TEMP_FILE_ALT = '/api/temp/:filename',
  CACHED_VIDEO = '/api/cached-video/:filename',
  
  // Scripts and metadata
  GET_SCRIPT = '/api/script/:id',
  GET_LOGS = '/api/logs/:id',
  
  // Webhooks
  REMOTION_WEBHOOK = '/api/remotion-webhook',
  
  // General
  VIDEOS = '/api/videos',
  DELETE_VIDEO_ALT = '/api/videos/:id'
}