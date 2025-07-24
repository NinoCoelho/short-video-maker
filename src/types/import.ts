import { z } from 'zod';
import { SceneInput, RenderConfig } from './shorts';

// Video import source types
export enum VideoSourceType {
  YOUTUBE = 'youtube',
  URL = 'url',
  FILE = 'file'
}

// Video metadata from import
export interface ImportedVideoMetadata {
  id: string;
  source: VideoSourceType;
  sourceUrl?: string;
  title?: string;
  description?: string;
  duration: number;
  width: number;
  height: number;
  fps?: number;
  fileSize?: number;
  originalFormat?: string;
  thumbnailUrl?: string;
  importedAt: Date;
  processedAt?: Date;
}

// Transcript segment
export interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
  speaker?: string;
}

// Scene detection result
export interface DetectedScene {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  keyFrames: string[]; // URLs or paths to keyframe images
  dominantColors?: string[];
  activity?: string; // Description of what's happening
  objects?: string[]; // Detected objects
  confidence?: number;
}

// AI analysis result
export interface VideoAnalysis {
  transcript: TranscriptSegment[];
  detectedScenes: DetectedScene[];
  suggestedClips: SuggestedClip[];
  topics: string[];
  keywords: string[];
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
  summary?: string;
  language?: string;
}

// Suggested clip from AI analysis
export interface SuggestedClip {
  id: string;
  startTime: number;
  endTime: number;
  reason: string;
  score: number;
  title?: string;
  description?: string;
  keywords: string[];
  sceneIds: string[]; // References to detected scenes
  transcriptSegmentIds?: string[]; // References to transcript segments
}

// Import pipeline configuration
export interface ImportPipelineConfig {
  // Transcription settings
  transcribe: boolean;
  transcriptionModel?: string;
  transcriptionLanguage?: string;
  
  // Scene detection settings
  detectScenes: boolean;
  sceneDetectionThreshold?: number;
  
  // AI analysis settings
  analyze: boolean;
  analysisModel?: string;
  generateSuggestions: boolean;
  maxSuggestions?: number;
  
  // Processing settings
  extractKeyframes: boolean;
  keyframeInterval?: number; // seconds
  generateThumbnails: boolean;
  
  // Output settings
  outputFormat?: 'mp4' | 'webm' | 'original';
  maxDuration?: number; // Maximum duration in seconds
  targetResolution?: '1080p' | '720p' | '480p' | 'original';
}

// Import job status
export enum ImportJobStatus {
  QUEUED = 'queued',
  DOWNLOADING = 'downloading',
  TRANSCRIBING = 'transcribing',
  ANALYZING = 'analyzing',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// Import job
export interface ImportJob {
  id: string;
  source: VideoSourceType;
  sourceUrl?: string;
  sourceFile?: File;
  status: ImportJobStatus;
  progress: number; // 0-100
  currentStep?: string;
  error?: string;
  config: ImportPipelineConfig;
  metadata?: ImportedVideoMetadata;
  analysis?: VideoAnalysis;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Ollama integration types
export interface OllamaModel {
  name: string;
  size: string;
  digest: string;
  modified: Date;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_k?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
  eval_count?: number;
}

// Video import request schema
export const videoImportRequestSchema = z.object({
  source: z.nativeEnum(VideoSourceType),
  url: z.string().url().optional(),
  config: z.object({
    transcribe: z.boolean().default(true),
    detectScenes: z.boolean().default(true),
    analyze: z.boolean().default(true),
    generateSuggestions: z.boolean().default(true),
    extractKeyframes: z.boolean().default(true),
    generateThumbnails: z.boolean().default(true),
  }).optional(),
});

export type VideoImportRequest = z.infer<typeof videoImportRequestSchema>;

// Transform imported video to short format
export interface ImportToShortTransform {
  importJob: ImportJob;
  selectedClips: SuggestedClip[];
  renderConfig: Partial<RenderConfig>;
  customScenes?: Partial<SceneInput>[];
}