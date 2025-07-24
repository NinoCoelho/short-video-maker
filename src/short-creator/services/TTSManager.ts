import { logger } from "../../logger";
import { LocalTTS } from "../libraries/LocalTTS";
import { RenderConfig, Caption, Subtitle } from "../../types/shorts";
import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import cuid from "cuid";
import { Config } from "../../config";
import { Remotion } from "../libraries/Remotion";

export interface TTSResult {
  audioPath: string;
  duration: number;
  subtitles: Subtitle[];
}

export class TTSManager {
  private localTTS: LocalTTS;
  private globalConfig: Config;
  private remotion: Remotion;

  constructor(localTTS: LocalTTS, globalConfig: Config, remotion: Remotion) {
    this.localTTS = localTTS;
    this.globalConfig = globalConfig;
    this.remotion = remotion;
  }

  public async getCachedOrGenerateTTS(
    text: string,
    config: RenderConfig,
    forceRegenerate: boolean = false
  ): Promise<TTSResult> {
    const configHash = crypto.createHash('md5')
      .update(`${text}_${config.voice}_${config.language}_${config.referenceAudioPath}`)
      .digest('hex');
    
    const cachedAudioPath = path.join(this.globalConfig.tempDirPath, `${configHash}.wav`);

    if (!forceRegenerate) {
      try {
        await fs.access(cachedAudioPath);
        // Check if file is not empty
        const stats = await fs.stat(cachedAudioPath);
        if (stats.size === 0) {
          logger.warn({ text, path: cachedAudioPath }, "Cached TTS file is empty, regenerating");
          fs.removeSync(cachedAudioPath);
        } else {
          // Wait for file to be ready
          await this.waitForFileReady(cachedAudioPath);
          const duration = await this.remotion.getMediaDuration(cachedAudioPath);
          if (duration > 0) {
            logger.debug({ text, hash: configHash }, "TTS audio found in cache, generating fallback subtitles.");
            
            // Generate simple subtitles based on text when using cache
            const subtitles = this.generateFallbackSubtitles(text, duration);
            
            return { audioPath: cachedAudioPath, duration, subtitles };
          }
        }
      } catch(e) {
        logger.warn({ text, path: cachedAudioPath, error: e }, "Found cached TTS file, but failed to get duration. Regenerating.");
        // Remove the corrupted file
        try {
          fs.removeSync(cachedAudioPath);
        } catch (removeError) {
          logger.warn({ text, path: cachedAudioPath, error: removeError }, "Failed to remove corrupted cache file");
        }
      }
    }
    
    return await this.generateNewTTS(text, config, cachedAudioPath);
  }

  private async generateNewTTS(
    text: string,
    config: RenderConfig,
    targetPath: string
  ): Promise<TTSResult> {
    logger.debug({ text }, "TTS audio not in cache. Generating...");
    const tempId = cuid();
    const tempWavPath = path.join(this.globalConfig.tempDirPath, `${tempId}.wav`);

    const result = await this.localTTS.generateSpeech(
      text, 
      tempWavPath, 
      config.voice, 
      config.language, 
      config.referenceAudioPath
    );
    
    // Wait for file to be ready
    await this.waitForFileReady(result.audioPath);
    
    // Validate the generated file before caching
    const stats = fs.statSync(result.audioPath);
    if (stats.size === 0) {
      throw new Error(`Generated TTS file is empty: ${result.audioPath}`);
    }

    // Calculate duration
    const duration = await this.remotion.getMediaDuration(result.audioPath);
    if (duration <= 0) {
      throw new Error(`Invalid audio duration: ${duration}`);
    }

    // Move to cache location
    fs.moveSync(result.audioPath, targetPath, { overwrite: true });
    
    // Wait for the moved file to be ready
    await this.waitForFileReady(targetPath);

    return {
      audioPath: targetPath,
      duration,
      subtitles: result.subtitles || []
    };
  }

  public async generateSingleTTS(
    text: string,
    config: RenderConfig
  ): Promise<TTSResult> {
    const audioId = cuid();
    const audioPath = path.join(this.globalConfig.tempDirPath, `${audioId}.wav`);

    logger.info({ text, audioPath }, "Generating single TTS audio");

    const result = await this.localTTS.generateSpeech(
      text,
      audioPath,
      config.voice,
      config.language,
      config.referenceAudioPath
    );

    // Wait for file to be ready
    await this.waitForFileReady(result.audioPath);

    // Get duration
    const duration = await this.remotion.getMediaDuration(result.audioPath);

    return {
      audioPath: result.audioPath,
      duration,
      subtitles: result.subtitles || []
    };
  }

  private generateFallbackSubtitles(text: string, duration: number): Subtitle[] {
    const words = text.split(/\s+/);
    const durationPerWord = words.length > 0 ? duration / words.length : 0;
    
    return words.map((word, index) => ({
      text: word,
      start: index * durationPerWord,
      end: (index + 1) * durationPerWord
    }));
  }

  private async waitForFileReady(filePath: string): Promise<void> {
    const maxRetries = 30;
    const retryDelay = 100; // ms
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          if (i === maxRetries - 1) {
            throw new Error(`File not found after ${maxRetries} retries: ${filePath}`);
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        // Check if file is not empty
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          if (i === maxRetries - 1) {
            throw new Error(`File is empty after ${maxRetries} retries: ${filePath}`);
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        // Try to open the file to ensure it's not being written
        const fd = fs.openSync(filePath, 'r');
        fs.closeSync(fd);
        
        // File is ready
        logger.debug({ filePath, attempts: i + 1 }, "File is ready for use");
        return;
        
      } catch (error: any) {
        if (i === maxRetries - 1) {
          logger.error({ filePath, error }, "File not ready after maximum retries");
          throw new Error(`File not ready after ${maxRetries} retries: ${filePath}`);
        }
        
        // File might still be writing, wait and retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  public splitTextIntoScenes(text: string): string[] {
    return text.split(/\n+/).filter(s => s.trim().length > 0);
  }

  public processTextForTTS(text: string): string[] {
    // Clean the text first (this should be done by a text cleaner utility)
    const cleanedText = text.trim();
    return this.splitTextIntoScenes(cleanedText);
  }
}