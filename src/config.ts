import path from "path";
import { z } from "zod";
import dotenv from "dotenv";
import { logger } from "./logger";
import fs from "fs-extra";

// Load environment variables from .env file
const envPath = path.join(process.cwd(), ".env");
dotenv.config({ path: envPath });
logger.info({ envPath }, "ENV file path");

// Define the schema for environment variables
const envSchema = z.object({
  DATA_DIR_PATH: z.string().optional(),
  RUNNING_IN_DOCKER: z.string().optional(),
  TTS_VERBOSE: z.string().optional(),
  TTS_MODEL: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),
  PIXABAY_API_KEY: z.string().optional(),
  COVERR_API_KEY: z.string().optional(),
  FREEPIK_API_KEY: z.string().optional(),
  PORT: z.string().optional(),
  DEV: z.string().optional(),
  CONCURRENCY: z.string().optional(),
  VIDEO_CACHE_SIZE_IN_BYTES: z.string().optional(),
  REFERENCE_AUDIO_PATH: z.string().optional(),
  VIDEO_SERVER_URL: z.string().optional(),
  TTS_SERVER_URL: z.string().optional(),
  // Ollama Configuration
  OLLAMA_HOST: z.string().optional(),
  OLLAMA_MODEL: z.string().optional(),
  OLLAMA_TIMEOUT: z.string().optional(),
  // Translation Service
  TRANSLATION_PROVIDER: z.string().optional(),
  DEEPL_API_KEY: z.string().optional(),
  GOOGLE_TRANSLATE_KEY: z.string().optional(),
  // Import Settings
  IMPORT_TEMP_DIR: z.string().optional(),
  MAX_IMPORT_SIZE_GB: z.string().optional(),
  MAX_CONCURRENT_IMPORTS: z.string().optional(),
  IMPORT_CLEANUP_DAYS: z.string().optional(),
  // Processing Limits
  MAX_VIDEO_DURATION_MINUTES: z.string().optional(),
  DEFAULT_SEGMENT_DURATION: z.string().optional(),
  MIN_SEGMENT_DURATION: z.string().optional(),
  MAX_SEGMENT_DURATION: z.string().optional(),
  // Queue Configuration
  QUEUE_CONCURRENCY: z.string().optional(),
  CREATION_QUEUE_CONCURRENCY: z.string().optional(),
  RENDER_QUEUE_CONCURRENCY: z.string().optional(),
  IMPORT_QUEUE_CONCURRENCY: z.string().optional(),
  // Feature Flags
  ENABLE_IMPORT_FEATURE: z.string().optional(),
  ENABLE_AUTO_TRANSLATE: z.string().optional(),
  ENABLE_SMART_CROP: z.string().optional(),
  // Security Configuration
  ALLOWED_ORIGINS: z.string().optional(),
  PROJECT_ROOT: z.string().optional(),
});

// Parse and validate environment variables
const env = envSchema.parse(process.env);

// Default paths
const defaultDataDirPath = path.join(process.cwd(), "data");
const defaultLibsDirPath = path.join(process.cwd(), "libs");
const defaultPort = 3233;

export interface Config {
  dataDirPath: string;
  libsDirPath: string;
  runningInDocker: boolean;
  ttsVerbose: boolean;
  ttsModel: string;
  pexelsApiKey: string;
  pixabayApiKey: string;
  coverrApiKey: string;
  freepikApiKey: string;
  port: number;
  devMode: boolean;
  concurrency: number;
  videoCacheSizeInBytes: number;
  referenceAudioPath: string;
  videosDirPath: string;
  tempDirPath: string;
  packageDirPath: string;
  musicDirPath: string;
  overlaysDirPath: string;
  installationSuccessfulPath: string;
  remotion: {
    rendering: {
      serveUrl: string;
    };
  };
  videoServerUrl: string;
  ttsServerUrl: string;
  // Ollama Configuration
  ollama: {
    host: string;
    model: string;
    timeout: number;
  };
  // Translation Service
  translation: {
    provider: string;
    deeplApiKey?: string;
    googleTranslateKey?: string;
  };
  // Import Settings
  import: {
    tempDir: string;
    maxSizeGB: number;
    maxConcurrent: number;
    cleanupDays: number;
  };
  // Processing Limits
  processing: {
    maxVideoDurationMinutes: number;
    defaultSegmentDuration: number;
    minSegmentDuration: number;
    maxSegmentDuration: number;
  };
  // Queue Configuration
  queue: {
    concurrency: number;
    creationConcurrency: number;
    renderConcurrency: number;
    importConcurrency: number;
  };
  // Feature Flags
  features: {
    enableImport: boolean;
    enableAutoTranslate: boolean;
    enableSmartCrop: boolean;
  };
}

export class Config {
  public dataDirPath: string;
  public libsDirPath: string;
  public runningInDocker: boolean;
  public ttsVerbose: boolean;
  public ttsModel: string;
  public pexelsApiKey: string;
  public pixabayApiKey: string;
  public coverrApiKey: string;
  public freepikApiKey: string;
  public port: number;
  public devMode: boolean;
  public concurrency: number;
  public videoCacheSizeInBytes: number;
  public referenceAudioPath: string;
  public videosDirPath: string;
  public tempDirPath: string;
  public packageDirPath: string;
  public musicDirPath: string;
  public overlaysDirPath: string;
  public installationSuccessfulPath: string;
  public remotion: {
    rendering: {
      serveUrl: string;
    };
  };
  public videoServerUrl: string;
  public ttsServerUrl: string;
  // Ollama Configuration
  public ollama: {
    host: string;
    model: string;
    timeout: number;
  };
  // Translation Service
  public translation: {
    provider: string;
    deeplApiKey?: string;
    googleTranslateKey?: string;
  };
  // Import Settings
  public import: {
    tempDir: string;
    maxSizeGB: number;
    maxConcurrent: number;
    cleanupDays: number;
  };
  // Processing Limits
  public processing: {
    maxVideoDurationMinutes: number;
    defaultSegmentDuration: number;
    minSegmentDuration: number;
    maxSegmentDuration: number;
  };
  // Queue Configuration
  public queue: {
    concurrency: number;
    creationConcurrency: number;
    renderConcurrency: number;
    importConcurrency: number;
  };
  // Feature Flags
  public features: {
    enableImport: boolean;
    enableAutoTranslate: boolean;
    enableSmartCrop: boolean;
  };

  constructor() {
    this.dataDirPath = env.DATA_DIR_PATH || defaultDataDirPath;
    this.libsDirPath = defaultLibsDirPath;
    this.runningInDocker = env.RUNNING_IN_DOCKER === "true";
    this.ttsVerbose = env.TTS_VERBOSE === "true";
    this.ttsModel = env.TTS_MODEL || "default";
    this.pexelsApiKey = env.PEXELS_API_KEY || "";
    this.pixabayApiKey = env.PIXABAY_API_KEY || "";
    this.coverrApiKey = env.COVERR_API_KEY || "";
    this.freepikApiKey = env.FREEPIK_API_KEY || "";
    this.port = env.PORT ? parseInt(env.PORT) : defaultPort;
    this.devMode = env.DEV === "true";
    this.concurrency = env.CONCURRENCY ? parseInt(env.CONCURRENCY) : 1;
    this.videoCacheSizeInBytes = env.VIDEO_CACHE_SIZE_IN_BYTES 
      ? parseInt(env.VIDEO_CACHE_SIZE_IN_BYTES) 
      : 2_147_483_648; // 2GB em bytes (2 * 1024 * 1024 * 1024) - Reduzido de 32GB para evitar problemas de memória
    this.referenceAudioPath = env.REFERENCE_AUDIO_PATH || path.join(process.cwd(), "NinoSample.wav");

    // Initialize paths
    this.videosDirPath = path.join(this.dataDirPath, "videos");
    this.tempDirPath = path.join(this.dataDirPath, "temp");
    this.packageDirPath = path.join(__dirname, "..");
    this.musicDirPath = path.join(this.packageDirPath, "static", "music");
    this.overlaysDirPath = path.join(this.packageDirPath, "static", "overlays");
    this.installationSuccessfulPath = path.join(this.dataDirPath, "installation-successful");

    // Initialize Remotion config
    this.remotion = {
      rendering: {
        serveUrl: "http://localhost:3122"
      }
    };
    this.videoServerUrl = process.env.VIDEO_SERVER_URL || "http://localhost:8000";
    this.ttsServerUrl = process.env.TTS_SERVER_URL || "http://localhost:5003";

    // Initialize Ollama configuration
    const ollamaHost = env.OLLAMA_HOST || "http://localhost:11434";
    // Ensure proper URL format - if it's just an IP/hostname, add http:// and port
    const ollamaUrl = ollamaHost.startsWith('http') 
      ? ollamaHost 
      : `http://${ollamaHost}:11434`;
    
    this.ollama = {
      host: ollamaUrl,
      model: env.OLLAMA_MODEL || "gemma3:12b-it-qat",
      timeout: env.OLLAMA_TIMEOUT ? parseInt(env.OLLAMA_TIMEOUT) : 30000
    };

    // Initialize translation configuration
    this.translation = {
      provider: env.TRANSLATION_PROVIDER || "deepl",
      deeplApiKey: env.DEEPL_API_KEY,
      googleTranslateKey: env.GOOGLE_TRANSLATE_KEY
    };

    // Initialize import settings
    this.import = {
      tempDir: env.IMPORT_TEMP_DIR || path.join(this.tempDirPath, "imports"),
      maxSizeGB: env.MAX_IMPORT_SIZE_GB ? parseInt(env.MAX_IMPORT_SIZE_GB) : 10,
      maxConcurrent: env.MAX_CONCURRENT_IMPORTS ? parseInt(env.MAX_CONCURRENT_IMPORTS) : 3,
      cleanupDays: env.IMPORT_CLEANUP_DAYS ? parseInt(env.IMPORT_CLEANUP_DAYS) : 7
    };

    // Initialize processing limits
    this.processing = {
      maxVideoDurationMinutes: env.MAX_VIDEO_DURATION_MINUTES ? parseInt(env.MAX_VIDEO_DURATION_MINUTES) : 60,
      defaultSegmentDuration: env.DEFAULT_SEGMENT_DURATION ? parseInt(env.DEFAULT_SEGMENT_DURATION) : 60,
      minSegmentDuration: env.MIN_SEGMENT_DURATION ? parseInt(env.MIN_SEGMENT_DURATION) : 15,
      maxSegmentDuration: env.MAX_SEGMENT_DURATION ? parseInt(env.MAX_SEGMENT_DURATION) : 180
    };

    // Initialize feature flags
    this.features = {
      enableImport: env.ENABLE_IMPORT_FEATURE === "true",
      enableAutoTranslate: env.ENABLE_AUTO_TRANSLATE === "true",
      enableSmartCrop: env.ENABLE_SMART_CROP === "true"
    };

    // Initialize queue configuration
    this.queue = {
      concurrency: env.QUEUE_CONCURRENCY ? parseInt(env.QUEUE_CONCURRENCY) : this.concurrency,
      creationConcurrency: env.CREATION_QUEUE_CONCURRENCY ? parseInt(env.CREATION_QUEUE_CONCURRENCY) : 2,
      renderConcurrency: env.RENDER_QUEUE_CONCURRENCY ? parseInt(env.RENDER_QUEUE_CONCURRENCY) : 1,
      importConcurrency: env.IMPORT_QUEUE_CONCURRENCY ? parseInt(env.IMPORT_QUEUE_CONCURRENCY) : 3
    };

    // Create directories
    fs.ensureDirSync(this.dataDirPath);
    fs.ensureDirSync(this.libsDirPath);
    fs.ensureDirSync(this.videosDirPath);
    fs.ensureDirSync(this.tempDirPath);
    fs.ensureDirSync(this.import.tempDir);

    logger.info({ DATA_DIR_PATH: this.dataDirPath }, "DATA_DIR_PATH");
  }
}
