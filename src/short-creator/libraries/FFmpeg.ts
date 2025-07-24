import ffmpeg from "fluent-ffmpeg";
import { Readable } from "node:stream";
import { logger } from "../../logger";
import { Config } from "../../config";
import path from "path";
import fs from "fs-extra";

export class FFmpeg {
  private config: Config;

  static async init(): Promise<FFmpeg> {
    const ffmpegInstaller = await import("@ffmpeg-installer/ffmpeg");
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    logger.info({ ffmpegPath: ffmpegInstaller.path }, "FFmpeg path set");
    return new FFmpeg(new Config());
  }

  constructor(config: Config) {
    this.config = config;
  }

  async saveNormalizedAudio(
    audio: ArrayBuffer,
    outputPath: string,
  ): Promise<string> {
    logger.debug("Normalizing audio for Whisper");
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec("pcm_s16le")
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat("wav")
        .on("end", () => {
          logger.debug("Audio normalization complete");
          resolve(outputPath);
        })
        .on("error", (error: unknown) => {
          logger.error(error, "Error normalizing audio:");
          reject(error);
        })
        .save(outputPath);
    });
  }

  async createMp3DataUri(audio: ArrayBuffer): Promise<string> {
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);
    return new Promise((resolve, reject) => {
      const chunk: Buffer[] = [];

      ffmpeg()
        .input(inputStream)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .on("error", (err) => {
          reject(err);
        })
        .pipe()
        .on("data", (data: Buffer) => {
          chunk.push(data);
        })
        .on("end", () => {
          const buffer = Buffer.concat(chunk);
          resolve(`data:audio/mp3;base64,${buffer.toString("base64")}`);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  async saveToMp3(audio: ArrayBuffer, filePath: string): Promise<string> {
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .save(filePath)
        .on("end", () => {
          logger.debug("Audio conversion complete");
          resolve(filePath);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  async getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        const duration = metadata.format.duration;
        if (typeof duration !== 'number') {
          reject(new Error('Could not get audio duration'));
          return;
        }
        resolve(duration);
      });
    });
  }

  /**
   * Une múltiplos arquivos de áudio em sequência
   * @param inputFiles Array de caminhos dos arquivos de áudio a serem unidos
   * @param outputPath Caminho do arquivo de saída
   */
  async concatAudioFiles(inputFiles: string[], outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      
      // Adiciona cada arquivo de entrada
      inputFiles.forEach(file => {
        command.input(file);
      });

      command
        .on('error', (err) => {
          logger.error(err, "Error concatenating audio files");
          reject(err);
        })
        .on('end', () => {
          logger.debug("Audio concatenation complete");
          resolve(outputPath);
        })
        .mergeToFile(outputPath, path.dirname(outputPath));
    });
  }

  public async concatenateWithSilence(filePaths: string[], outputPath: string, silenceDuration: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (filePaths.length === 0) {
        return reject(new Error("No files to concatenate."));
      }

      const command = ffmpeg();
      const complexFilter: string[] = [];
      let inputStreamIndex = 0;

      // Adiciona cada arquivo de áudio como uma entrada
      filePaths.forEach((filePath, index) => {
        command.input(filePath);
        complexFilter.push(`[${inputStreamIndex}:a]`);
        inputStreamIndex++;

        // Adiciona um atraso de silêncio entre os arquivos
        if (index < filePaths.length - 1) {
          const silenceInput = `aevalsrc=0:d=${silenceDuration}`;
          command.input(silenceInput).inputOptions('-f lavfi');
          complexFilter.push(`[${inputStreamIndex}:a]`);
          inputStreamIndex++;
        }
      });

      // Concatena todas as entradas de áudio
      command
        .complexFilter(complexFilter.join('') + `concat=n=${complexFilter.length}:v=0:a=1[outa]`)
        .outputOptions('-map', '[outa]')
        .on('error', (err) => {
          logger.error('Error concatenating audio files:', err);
          reject(err);
        })
        .on('end', () => {
          logger.info('Audio files concatenated successfully.');
          resolve();
        })
        .save(outputPath);
    });
  }

  /**
   * Extract audio track from video file
   * @param videoPath Path to the input video file
   * @param outputPath Path for the output audio file
   * @param trackIndex Specific audio track index to extract (default: all tracks mixed)
   */
  async extractAudioFromVideo(videoPath: string, outputPath: string, trackIndex?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath);
      
      if (trackIndex !== undefined) {
        // Extract specific audio track
        command.outputOptions('-map', `0:a:${trackIndex}`);
      } else {
        // Mix all audio tracks
        command.outputOptions('-map', '0:a');
      }
      
      command
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat('wav')
        .on('start', (cmd) => {
          logger.debug({ cmd }, 'Extracting audio from video');
        })
        .on('end', () => {
          logger.debug('Audio extraction complete');
          resolve(outputPath);
        })
        .on('error', (error: unknown) => {
          logger.error(error, 'Error extracting audio from video');
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * Extract and merge multiple audio tracks from video
   * @param videoPath Path to the input video file
   * @param outputPath Path for the output audio file
   * @param trackIndices Array of track indices to merge
   */
  async extractAndMergeAudioTracks(videoPath: string, outputPath: string, trackIndices: number[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath);
      
      // Build complex filter for merging tracks
      const inputs = trackIndices.map(index => `[0:a:${index}]`).join('');
      const filter = `${inputs}amerge=inputs=${trackIndices.length}[aout]`;
      
      command
        .complexFilter(filter)
        .outputOptions('-map', '[aout]')
        .audioCodec('pcm_s16le')
        .audioChannels(1) // Convert to mono after merge
        .audioFrequency(16000)
        .toFormat('wav')
        .on('start', (cmd) => {
          logger.debug({ cmd, trackIndices }, 'Extracting and merging audio tracks');
        })
        .on('end', () => {
          logger.debug('Audio track merging complete');
          resolve(outputPath);
        })
        .on('error', (error: unknown) => {
          logger.error(error, 'Error merging audio tracks');
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * Extract all audio tracks separately
   * @param videoPath Path to the input video file
   * @param outputDir Directory to save individual tracks
   */
  async extractAllAudioTracksSeparately(videoPath: string, outputDir: string): Promise<string[]> {
    const tracks = await this.getAudioTracks(videoPath);
    const extractedPaths: string[] = [];
    
    await fs.ensureDir(outputDir);
    
    for (const track of tracks) {
      const outputPath = path.join(outputDir, `track_${track.index}_${track.language || 'unknown'}.wav`);
      await this.extractAudioFromVideo(videoPath, outputPath, track.index);
      extractedPaths.push(outputPath);
    }
    
    return extractedPaths;
  }

  /**
   * Get audio track information from video
   */
  async getAudioTracks(videoPath: string): Promise<Array<{index: number, codec: string, channels: number, language?: string}>> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        
        const audioTracks = metadata.streams
          .filter(stream => stream.codec_type === 'audio')
          .map((stream, index) => ({
            index,
            codec: stream.codec_name || 'unknown',
            channels: stream.channels || 0,
            language: stream.tags?.language
          }));
          
        resolve(audioTracks);
      });
    });
  }

  /**
   * Apply noise reduction to audio
   */
  async reduceNoise(inputPath: string, outputPath: string, noiseLevel: number = 0.21): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters([
          `highpass=f=200`,  // Remove low frequency noise
          `lowpass=f=3000`,  // Remove high frequency noise
          `afftdn=nf=${noiseLevel}` // FFT denoiser
        ])
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat('wav')
        .on('end', () => {
          logger.debug('Noise reduction complete');
          resolve(outputPath);
        })
        .on('error', (error: unknown) => {
          logger.error(error, 'Error reducing noise');
          reject(error);
        })
        .save(outputPath);
    });
  }

  /**
   * Normalize audio levels
   */
  async normalizeAudioLevels(inputPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // First pass: analyze audio
      ffmpeg(inputPath)
        .audioFilters('volumedetect')
        .outputOptions('-f', 'null')
        .on('stderr', (stderrLine) => {
          // Parse volume detection results
          const maxVolumeMatch = stderrLine.match(/max_volume: (-?\d+\.\d+) dB/);
          const meanVolumeMatch = stderrLine.match(/mean_volume: (-?\d+\.\d+) dB/);
          
          if (maxVolumeMatch && meanVolumeMatch) {
            const maxVolume = parseFloat(maxVolumeMatch[1]);
            const targetNormalization = -3.0; // Target -3dB peak
            const volumeAdjustment = targetNormalization - maxVolume;
            
            // Second pass: apply normalization
            ffmpeg(inputPath)
              .audioFilters([
                `volume=${volumeAdjustment}dB`,
                'loudnorm=I=-16:TP=-1.5:LRA=11' // EBU R128 loudness normalization
              ])
              .audioCodec('pcm_s16le')
              .audioChannels(1)
              .audioFrequency(16000)
              .toFormat('wav')
              .on('end', () => {
                logger.debug('Audio normalization complete');
                resolve(outputPath);
              })
              .on('error', (error: unknown) => {
                logger.error(error, 'Error normalizing audio');
                reject(error);
              })
              .save(outputPath);
          }
        })
        .on('error', (error: unknown) => {
          logger.error(error, 'Error analyzing audio volume');
          reject(error);
        })
        .save('/dev/null');
    });
  }

  /**
   * Detect silence periods in audio
   */
  async detectSilence(audioPath: string, silenceThreshold: number = -30, minSilenceDuration: number = 0.5): Promise<Array<{start: number, end: number}>> {
    return new Promise((resolve, reject) => {
      const silencePeriods: Array<{start: number, end: number}> = [];
      let currentSilenceStart: number | null = null;
      
      ffmpeg(audioPath)
        .audioFilters(`silencedetect=n=${silenceThreshold}dB:d=${minSilenceDuration}`)
        .outputOptions('-f', 'null')
        .on('stderr', (stderrLine) => {
          // Parse silence detection output
          const silenceStartMatch = stderrLine.match(/silence_start: (\d+\.\d+)/);
          const silenceEndMatch = stderrLine.match(/silence_end: (\d+\.\d+)/);
          
          if (silenceStartMatch) {
            currentSilenceStart = parseFloat(silenceStartMatch[1]);
          } else if (silenceEndMatch && currentSilenceStart !== null) {
            silencePeriods.push({
              start: currentSilenceStart,
              end: parseFloat(silenceEndMatch[1])
            });
            currentSilenceStart = null;
          }
        })
        .on('end', () => {
          logger.debug({ silencePeriods }, 'Silence detection complete');
          resolve(silencePeriods);
        })
        .on('error', (error: unknown) => {
          logger.error(error, 'Error detecting silence');
          reject(error);
        })
        .save('/dev/null');
    });
  }

  /**
   * Split audio file into chunks
   */
  async splitAudioFile(inputPath: string, outputDir: string, maxDurationSeconds: number = 300): Promise<string[]> {
    const duration = await this.getAudioDuration(inputPath);
    const chunks: string[] = [];
    const numChunks = Math.ceil(duration / maxDurationSeconds);
    
    await fs.ensureDir(outputDir);
    
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * maxDurationSeconds;
      const chunkDuration = Math.min(maxDurationSeconds, duration - startTime);
      const outputPath = path.join(outputDir, `chunk_${i.toString().padStart(3, '0')}.wav`);
      
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .setStartTime(startTime)
          .setDuration(chunkDuration)
          .audioCodec('pcm_s16le')
          .audioChannels(1)
          .audioFrequency(16000)
          .toFormat('wav')
          .on('end', () => {
            chunks.push(outputPath);
            resolve();
          })
          .on('error', (error: unknown) => {
            logger.error(error, `Error splitting audio chunk ${i}`);
            reject(error);
          })
          .save(outputPath);
      });
    }
    
    logger.debug({ chunks: chunks.length, duration }, 'Audio splitting complete');
    return chunks;
  }

  /**
   * Apply complete audio preprocessing pipeline for transcription
   */
  async preprocessAudioForTranscription(
    inputPath: string, 
    outputPath: string,
    options: {
      reduceNoise?: boolean;
      normalizeAudio?: boolean;
      removeSilence?: boolean;
      targetFormat?: 'wav' | 'mp3';
    } = {}
  ): Promise<string> {
    const {
      reduceNoise = true,
      normalizeAudio = true,
      removeSilence = false,
      targetFormat = 'wav'
    } = options;
    
    const tempDir = path.join(path.dirname(outputPath), '.temp_audio_processing');
    await fs.ensureDir(tempDir);
    
    try {
      let currentPath = inputPath;
      let step = 0;
      
      // Step 1: Reduce noise if requested
      if (reduceNoise) {
        const denoised = path.join(tempDir, `step${++step}_denoised.wav`);
        await this.reduceNoise(currentPath, denoised);
        currentPath = denoised;
      }
      
      // Step 2: Normalize audio levels if requested
      if (normalizeAudio) {
        const normalized = path.join(tempDir, `step${++step}_normalized.wav`);
        await this.normalizeAudioLevels(currentPath, normalized);
        currentPath = normalized;
      }
      
      // Step 3: Remove silence if requested
      if (removeSilence) {
        const silencePeriods = await this.detectSilence(currentPath);
        if (silencePeriods.length > 0) {
          // Create complex filter to remove silence periods
          const filters: string[] = [];
          let lastEnd = 0;
          
          for (const period of silencePeriods) {
            if (period.start > lastEnd) {
              filters.push(`between(t,${lastEnd},${period.start})`);
            }
            lastEnd = period.end;
          }
          
          // Add final segment if needed
          const duration = await this.getAudioDuration(currentPath);
          if (lastEnd < duration) {
            filters.push(`between(t,${lastEnd},${duration})`);
          }
          
          if (filters.length > 0) {
            const silenceRemoved = path.join(tempDir, `step${++step}_silence_removed.wav`);
            await new Promise<void>((resolve, reject) => {
              ffmpeg(currentPath)
                .audioFilters(`aselect='${filters.join("+")}',asetpts=N/SR/TB`)
                .audioCodec('pcm_s16le')
                .audioChannels(1)
                .audioFrequency(16000)
                .toFormat('wav')
                .on('end', () => resolve())
                .on('error', reject)
                .save(silenceRemoved);
            });
            currentPath = silenceRemoved;
          }
        }
      }
      
      // Final step: Convert to target format
      if (targetFormat === 'mp3') {
        await this.saveToMp3(await fs.readFile(currentPath), outputPath);
      } else {
        await fs.copy(currentPath, outputPath);
      }
      
      // Clean up temp directory
      await fs.remove(tempDir);
      
      logger.info({ inputPath, outputPath, options }, 'Audio preprocessing complete');
      return outputPath;
    } catch (error) {
      // Clean up on error
      await fs.remove(tempDir).catch(() => {});
      throw error;
    }
  }

  /**
   * Extract a segment of audio for processing
   */
  async extractAudioSegment(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat('wav')
        .on('end', () => {
          logger.debug({ startTime, duration }, 'Audio segment extraction complete');
          resolve(outputPath);
        })
        .on('error', (error: unknown) => {
          logger.error(error, 'Error extracting audio segment');
          reject(error);
        })
        .save(outputPath);
    });
  }
}
