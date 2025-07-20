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
    this.concurrency = 1; // Forçar processamento sequencial
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

    // Create directories
    fs.ensureDirSync(this.dataDirPath);
    fs.ensureDirSync(this.libsDirPath);
    fs.ensureDirSync(this.videosDirPath);
    fs.ensureDirSync(this.tempDirPath);

    logger.info({ DATA_DIR_PATH: this.dataDirPath }, "DATA_DIR_PATH");
  }
}
