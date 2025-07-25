import z from "zod";

// Dynamic music mood system - moods are now managed by LibraryManagerService
export type MusicMood = string;

// Common mood values for reference (not exhaustive)
export const COMMON_MUSIC_MOODS = [
  "sad",
  "melancholic", 
  "happy",
  "euphoric",
  "excited",
  "chill",
  "uneasy",
  "angry",
  "dark",
  "hopeful",
  "contemplative",
  "funny",
  "inspirational",
  "cinematic",
  "worship",
  "epic",
  "ambient",
  "energetic",
  "calm",
  "dramatic"
] as const;

export enum CaptionPositionEnum {
  top = "top",
  center = "center",
  bottom = "bottom",
}

export interface Scene {
  id: string;
  text: string;
  searchTerms: string[];
  duration: number;
  orientation: OrientationEnum;
  captions: Caption[];
  videos: string[];
  audio: {
    url: string;
    duration: number;
  };
}

export const sceneInput = z.object({
  text: z.string().describe("Text to be spoken in the video"),
  searchTerms: z
    .array(z.string())
    .describe(
      "Search term for video, 1 word, and at least 2-3 search terms should be provided for each scene. Make sure to match the overall context with the word - regardless what the video search result would be.",
    ),
  videos: z.array(z.string()).optional().describe("Pre-defined video URLs to be used for the scene, bypassing search."),
  audio: z.object({ url: z.string(), duration: z.number() }).optional().describe("Pre-defined audio to be used for the scene, bypassing TTS."),
  captions: z.array(z.any()).optional().describe("Pre-defined captions for the scene."),
  forceRegenerate: z.boolean().optional().describe("Force regeneration of audio for this scene."),
});
export type SceneInput = z.infer<typeof sceneInput>;

export enum VoiceEnum {
  Paulo = "Paulo",
  Noel = "Noel", 
  Scarlett = "Scarlett",
  NinoCoelho = "NinoCoelho",
}

export enum OrientationEnum {
  portrait = "portrait",
  landscape = "landscape",
  square = "square"
}

export enum MusicVolumeEnum {
  muted = "muted",
  low = "low",
  medium = "medium",
  high = "high",
}

export const renderConfig = z.object({
  paddingBack: z
    .number()
    .optional()
    .describe(
      "For how long the video should be playing after the speech is done, in milliseconds. 1500 is a good value.",
    ),
  music: z
    .string()
    .optional()
    .describe("Music mood/tag to be used to find the right music for the video"),
  captionPosition: z
    .nativeEnum(CaptionPositionEnum)
    .optional()
    .describe("Position of the caption in the video"),
  captionBackgroundColor: z
    .string()
    .optional()
    .describe(
      "Background color of the caption, a valid css color, default is blue",
    ),
  captionTextColor: z
    .string()
    .optional()
    .describe(
      "Text color of the caption, a valid css color, default is white",
    ),
  voice: z
    .nativeEnum(VoiceEnum)
    .optional()
    .describe("Voice to be used for the speech, default is Paulo"),
  orientation: z
    .nativeEnum(OrientationEnum)
    .optional()
    .describe("Orientation of the video, default is portrait"),
  musicVolume: z
    .nativeEnum(MusicVolumeEnum)
    .optional()
    .describe("Volume of the music, default is high"),
  language: z.enum(["pt", "en"]).default("pt").describe("Language for text-to-speech"),
  referenceAudioPath: z.string().optional().describe("Path to reference audio file for TTS"),
  overlay: z.string().optional().describe("Name of the overlay image file (without extension) from static/overlays directory"),
  port: z.number().optional().describe("Port number for the server"),
  hook: z.string().optional().describe("Text to be displayed in the first frame of the video"),
});
export type RenderConfig = z.infer<typeof renderConfig>;

export type Voices = `${VoiceEnum}`;

export interface Video {
  id: string;
  url: string;
  width: number;
  height: number;
  duration: number;
  status?: "pending" | "processing" | "completed" | "failed";
  sceneInput?: SceneInput[];
  config?: RenderConfig;
}

export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  emotion?: "question" | "exclamation" | "neutral";
};

export type CaptionLine = {
  texts: Caption[];
};
export type CaptionPage = {
  startMs: number;
  endMs: number;
  lines: CaptionLine[];
};

export const createShortInput = z.object({
  scenes: z.array(sceneInput).describe("Each scene to be created"),
  config: renderConfig.describe("Configuration for rendering the video"),
});
export type CreateShortInput = z.infer<typeof createShortInput>;

export type RenderRequest = CreateShortInput & {
  id?: string; // Para edição de vídeos existentes
};

export type Music = {
  file: string;
  start: number;
  end: number;
  mood: string;
};
export type MusicForVideo = Music & {
  url: string;
  fadeOut?: boolean;
  fadeOutDuration?: number;
  loop?: boolean;
};

export type MusicTag = string;

export type kokoroModelPrecision = "fp32" | "fp16" | "q8" | "q4" | "q4f16";

export interface AudioResult {
  audioPath: string;
  subtitles: Subtitle[];
}

export interface Subtitle {
  text: string;
  start: number;
  end: number;
}

export interface ShortResult {
  id: string;
  videoPath: string;
  scenes: Scene[];
  audioResults: AudioResult[];
}

export interface ShortQueue {
  items: {
    id: string;
    scenes: Scene[];
  }[];
}

export enum AvailableComponentsEnum {
  PortraitVideo = "ShortVideo",
  LandscapeVideo = "LandscapeVideo",
}

export type OrientationConfig = {
  width: number;
  height: number;
  component: AvailableComponentsEnum;
};

export type VideoConfig = {
  durationMs: number;
  paddingBack: number;
  captionBackgroundColor: string;
  captionTextColor: string;
  captionPosition: string;
  musicVolume: number;
  overlay?: string;
  hook?: string;
  port?: number;
}

export type MusicData = {
  file: string;
  duration: number;
};

export type ShortVideoData = {
  scenes: Scene[];
  music: {
    file: string;
    url: string;
    start: number;
    end: number;
    mood?: string;
    loop?: boolean;
  };
  config: VideoConfig;
}

// Import-related types from video-import-feature.md
export interface ImportedVideo extends Video {
  sourceUrl: string;
  sourcePlatform: 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'other';
  originalDuration: number;
  originalResolution: { width: number; height: number };
  transcription?: Transcription;
  highlights?: Highlight[];
  segments?: ImportVideoSegment[];
}

export interface Transcription {
  text: string;
  language: string;
  timestamps: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface Highlight {
  id: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  tags: string[];
}

export interface ImportVideoSegment {
  id: string;
  parentVideoId: string;
  start: number;
  end: number;
  title?: string;
  orientation: OrientationEnum;
  cropConfig?: CropConfig;
  transcription?: TranscriptionSegment[];
}

export interface CropConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  trackSubject: boolean;
  subjectBounds?: { x: number; y: number; width: number; height: number }[];
}

export interface ImportSettings {
  targetLanguage: string;
  music?: MusicMood;
  overlay?: string;
  orientation: OrientationEnum;
  autoHighlights: boolean;
  maxSegmentDuration: number; // in seconds
  minSegmentDuration: number; // in seconds
}

// Additional types for video processing

export interface VideoData extends ShortVideoData {
  id?: string;
  status?: VideoStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface EditedVideoData {
  scenes?: Scene[];
  config?: RenderConfig;
  changes?: VideoChange[];
}

export interface VideoChange {
  type: 'scene-edit' | 'scene-audio' | 'scene-video' | 'config-change';
  sceneId?: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  timestamp: string;
}

export interface VideoChanges {
  hasChanges: boolean;
  textChanges: Array<{
    sceneId: string;
    oldText: string;
    newText: string;
  }>;
  videoChanges: Array<{
    sceneId: string;
    oldVideoUrl: string;
    newVideoUrl: string;
  }>;
  configChanges: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
}

export interface RegenerateOptions {
  forceRegenerate?: boolean;
  preserveTimings?: boolean;
  updateOnlyChanged?: boolean;
}

export interface ProcessingOptions {
  skipValidation?: boolean;
  forceReprocess?: boolean;
  preserveCache?: boolean;
}

export interface UrlAnalysis {
  type: 'youtube' | 'generic';
  title: string;
  duration: number;
  resolution: string | { width: number; height: number };
  thumbnail?: string;
  format: string;
  videoCodec: string;
  audioCodec: string;
  fileSize?: number;
  fps?: number;
  canDownload: boolean;
  platform: string;
  hasSubtitles?: boolean;
  language?: string;
}

export interface FFprobeStream {
  codec_type: 'video' | 'audio';
  codec_name: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
}

export interface FFprobeFormat {
  duration?: string;
  format_name?: string;
  size?: string;
  tags?: {
    title?: string;
    [key: string]: string | undefined;
  };
}

export interface FFprobeInfo {
  streams: FFprobeStream[];
  format: FFprobeFormat;
}

// Re-export existing types for convenience
export type { VideoStatusObject, ImportStage, SubJobStatus } from '../short-creator/VideoStatusManager';
export type { VideoSegment, VideoMetadata as VideoFileMetadata, SegmentOptions } from '../services/VideoSegmentService';

// Legacy compatibility - keeping old type name
export type VideoStatus = "pending" | "processing" | "ready" | "failed";

// Add VideoMetadata as alias for VideoData for compatibility
export type VideoMetadata = VideoData;
