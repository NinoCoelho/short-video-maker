import z from "zod";

export enum MusicMoodEnum {
  sad = "sad",
  melancholic = "melancholic",
  happy = "happy",
  euphoric = "euphoric/high",
  excited = "excited",
  chill = "chill",
  uneasy = "uneasy",
  angry = "angry",
  dark = "dark",
  hopeful = "hopeful",
  contemplative = "contemplative",
  funny = "funny/quirky",
  inspirational = "inspirational",
  cinematic = "cinematic",
  worship = "worship",
}

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
});
export type SceneInput = z.infer<typeof sceneInput>;

export enum VoiceEnum {
  af_heart = "af_heart",
  af_alloy = "af_alloy",
  af_aoede = "af_aoede",
  af_bella = "af_bella",
  af_jessica = "af_jessica",
  af_kore = "af_kore",
  af_nicole = "af_nicole",
  af_nova = "af_nova",
  af_river = "af_river",
  af_sarah = "af_sarah",
  af_sky = "af_sky",
  am_adam = "am_adam",
  am_echo = "am_echo",
  am_eric = "am_eric",
  am_fenrir = "am_fenrir",
  am_liam = "am_liam",
  am_michael = "am_michael",
  am_onyx = "am_onyx",
  am_puck = "am_puck",
  am_santa = "am_santa",
  bf_emma = "bf_emma",
  bf_isabella = "bf_isabella",
  bm_george = "bm_george",
  bm_lewis = "bm_lewis",
  bf_alice = "bf_alice",
  bf_lily = "bf_lily",
  bm_daniel = "bm_daniel",
  bm_fable = "bm_fable",
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
    .nativeEnum(MusicMoodEnum)
    .optional()
    .describe("Music tag to be used to find the right music for the video"),
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
    .describe("Voice to be used for the speech, default is af_heart"),
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

export type VideoStatus = "processing" | "ready" | "failed";

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

export type MusicTag = `${MusicMoodEnum}`;

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
