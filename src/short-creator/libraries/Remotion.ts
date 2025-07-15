import z from "zod";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import { ensureBrowser } from "@remotion/renderer";
import fs from "fs-extra";
import https from "https";
import { URL } from "url";
import http from "http";

import { Config } from "../../config";
import { shortVideoSchema, getOrientationConfig } from "../../shared/utils";
import { logger } from "../../logger";
import { OrientationEnum, ShortVideoData } from "../../types/shorts";

// Configura o Node.js para usar mais memória
process.env.NODE_OPTIONS = '--max-old-space-size=16384'; // 16GB para Node.js

export class Remotion {
  constructor(
    private bundled: string,
    private config: Config,
  ) {}

  private async downloadVideo(url: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      
      // Parse the URL properly to handle query parameters
      const parsedUrl = new URL(url);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || '80',
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        timeout: 300000, // 5 minutos para download individual
        headers: {
          'Accept': 'video/*'
        }
      };

      const req = http.get(options, (response) => {
        if (response.statusCode !== 200) {
          fs.unlink(outputPath, () => {});
          reject(new Error(`Failed to download video: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(outputPath);
        });
      });

      req.on('timeout', () => {
        req.destroy();
        fs.unlink(outputPath, () => {});
        reject(new Error('Download timeout: Request took too long to complete'));
      });

      req.on('error', (err) => {
        fs.unlink(outputPath, () => {});
        reject(new Error(`Failed to download video: ${err.message}`));
      });

      req.setTimeout(300000); // 5 minutos para download individual
    });
  }

  private async preDownloadVideos(scenes: any[]): Promise<string[]> {
    const downloadedVideos: string[] = [];
    for (const scene of scenes) {
      for (const videoUrl of scene.videos) {
        const url = new URL(videoUrl);
        const filename = path.basename(url.pathname);
        const outputPath = path.join(this.config.tempDirPath, filename);
        
        if (!fs.existsSync(outputPath)) {
          logger.debug(`Downloading video: ${videoUrl}`);
          await this.downloadVideo(videoUrl, outputPath);
        }
        downloadedVideos.push(outputPath);
      }
    }
    return downloadedVideos;
  }

  static async init(config: Config): Promise<Remotion> {
    await ensureBrowser();

    const entryPoint = path.join(
      process.cwd(),
      config.devMode ? "src" : "dist",
      "components",
      "root",
      "index.ts"
    );

    logger.debug({ entryPoint }, "Bundling Remotion entry point");

    const bundled = await bundle({
      entryPoint,
    });

    return new Remotion(bundled, config);
  }

  public async getMediaDuration(filePath: string): Promise<number> {
    try {
      // Check if file exists and wait for it to be completely written
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }
      
      // Aguarda o arquivo estar completamente pronto
      await this.waitForFileReady(filePath);
      
      // Use FFmpeg para calcular duração no Node.js em vez do método do Remotion
      const durationInSeconds = await this.getAudioDurationWithFFmpeg(filePath);
      
      // Validate duration
      if (!durationInSeconds || isNaN(durationInSeconds) || durationInSeconds <= 0) {
        throw new Error(`Invalid duration returned: ${durationInSeconds}`);
      }
      
      return durationInSeconds;
    } catch (err: any) {
      logger.error({ filePath, error: err }, "Failed to get media duration.");
      throw new Error(`Could not get duration for ${filePath}: ${err.message || 'Unknown error'}`);
    }
  }

  private async getAudioDurationWithFFmpeg(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffmpeg = require('fluent-ffmpeg');
      
      ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
        if (err) {
          logger.error({ filePath, error: err }, "FFprobe failed to get audio duration");
          reject(err);
          return;
        }
        
        const duration = metadata.format.duration;
        if (typeof duration !== 'number') {
          const error = new Error('Could not get audio duration from metadata');
          logger.error({ filePath, metadata: metadata.format }, "Invalid duration in metadata");
          reject(error);
          return;
        }
        
        logger.debug({ filePath, duration }, "Successfully calculated audio duration with FFmpeg");
        resolve(duration);
      });
    });
  }

  private async waitForFileReady(filePath: string): Promise<void> {
    const maxWaitTime = 10000; // 10 segundos máximo
    const checkInterval = 50; // Verifica a cada 50ms
    const startTime = Date.now();
    let lastSize = 0;
    let stableSizeCount = 0;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Verifica se o arquivo existe e tem tamanho
        const stats = fs.statSync(filePath);
        
        if (stats.size === 0) {
          // Arquivo vazio, continua esperando
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          continue;
        }

        // Verifica se o tamanho do arquivo está estável
        if (stats.size === lastSize) {
          stableSizeCount++;
          // Se o tamanho ficou estável por pelo menos 3 verificações (150ms)
          if (stableSizeCount >= 3) {
            // Tenta ler o arquivo para verificar se está acessível
            try {
              const fd = fs.openSync(filePath, 'r');
              fs.closeSync(fd);
              
              logger.debug("Audio file is ready for duration calculation", { 
                filePath, 
                fileSize: stats.size,
                waitTime: Date.now() - startTime 
              });
              return;
            } catch (readError) {
              // Arquivo ainda não está totalmente acessível
              await new Promise(resolve => setTimeout(resolve, checkInterval));
              continue;
            }
          }
        } else {
          // Tamanho mudou, resetar contador
          lastSize = stats.size;
          stableSizeCount = 0;
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        // Arquivo ainda não existe ou não está acessível
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }

    throw new Error(`Timeout waiting for audio file to be ready: ${filePath}`);
  }

  async renderMedia(videoId: string, data: any, onProgress?: (progress: number, stage?: string) => void): Promise<void> {
    logger.info({ videoId }, "Starting Remotion render");
    
    const outputPath = path.join(this.config.videosDirPath, `${videoId}.mp4`);
    
    // Ensure output directory exists
    await fs.ensureDir(path.dirname(outputPath));

    const compositionId = data.config.orientation === "landscape" ? "LandscapeVideo" : "PortraitVideo";
    const fps = 30;
    const durationInFrames = Math.ceil(data.config.durationInSec * fps);

    logger.info({
      videoId,
      composition: compositionId,
      durationInFrames,
      durationInSec: data.config.durationInSec,
      outputPath
    }, "Render configuration");

    try {
      const composition = await selectComposition({
        serveUrl: this.bundled,
        id: compositionId,
        inputProps: data,
      });

      await renderMedia({
        composition,
        serveUrl: this.bundled,
        codec: "h264",
        outputLocation: outputPath,
        inputProps: data,
        imageFormat: "jpeg",
        concurrency: 1, // Forçar processamento sequencial para evitar conflitos
        offthreadVideoCacheSizeInBytes: this.config.videoCacheSizeInBytes, // Usar valor da configuração
        chromiumOptions: {
          disableWebSecurity: true,
          ignoreCertificateErrors: true
        },
        timeoutInMilliseconds: 1800000, // 30 minutos para o processo todo
        envVariables: {
          PORT: String(this.config.port),
        },
        onProgress: ({ progress, renderedFrames, encodedFrames, encodedDoneIn, renderedDoneIn }) => {
          // Calcular estágio mais preciso baseado nos dados do Remotion
          let stage = "Initializing";
          let detailedProgress = progress;
          
          if (renderedDoneIn !== null && encodedDoneIn === null) {
            // Frames renderizados, mas ainda não codificados
            stage = "Processing frames";
            detailedProgress = Math.min(progress, 0.7); // Máximo 70% durante renderização
          } else if (renderedDoneIn !== null && encodedDoneIn === null && progress > 0.7) {
            // Começando codificação
            stage = "Encoding video";
            detailedProgress = 0.7 + (progress - 0.7) * 0.25; // 70-95% para encoding
          } else if (encodedDoneIn !== null || progress > 0.95) {
            // Finalizando
            stage = "Finalizing";
            detailedProgress = Math.max(0.95, progress); // Mínimo 95% na finalização
          }
          
          // Adicionar informações mais detalhadas baseadas no progresso
          if (progress < 0.1) {
            stage = "Initializing";
          } else if (progress < 0.2) {
            stage = "Processing frames";
          } else if (progress < 0.8) {
            stage = renderedFrames && encodedFrames 
              ? `Processing frames (${renderedFrames}/${durationInFrames})`
              : "Processing frames";
          } else if (progress < 0.95) {
            stage = "Encoding video";
          } else {
            stage = "Finalizing";
          }
          
          if (onProgress) {
            onProgress(detailedProgress, stage);
          }
          
          logger.debug({
            videoId,
            progress: Math.round(detailedProgress * 100),
            stage,
            renderedFrames,
            encodedFrames,
            durationInFrames
          }, "Render progress update");
        },
      });

      logger.info({ videoId, outputPath }, "Video rendered successfully with Remotion");
      
      // Verificar se o arquivo foi criado e tem tamanho válido
      const stats = await fs.stat(outputPath);
      logger.info({ 
        videoID: videoId,
        outputLocation: outputPath,
        fileSize: stats.size 
      }, "Video rendered successfully with Remotion");
      
    } catch (error) {
      logger.error({ videoId, error }, "Remotion render failed");
      throw error;
    }
  }

  async render(
    data: z.infer<typeof shortVideoSchema>,
    id: string,
    orientation: OrientationEnum,
  ) {
    const { component } = getOrientationConfig(orientation);

    const composition = await selectComposition({
      serveUrl: this.bundled,
      id: component,
      inputProps: data,
    });

    logger.debug({ component, videoID: id }, "Rendering video with Remotion");

    const outputLocation = path.join(this.config.videosDirPath, `${id}.mp4`);

    try {
      await renderMedia({
        codec: "h264",
        composition,
        serveUrl: this.bundled,
        outputLocation,
        inputProps: data,
        onProgress: ({ progress }) => {
          logger.debug(`Rendering ${id} ${Math.floor(progress * 100)}% complete`);
        },
        concurrency: 1, // Forçar processamento sequencial para evitar conflitos
        offthreadVideoCacheSizeInBytes: this.config.videoCacheSizeInBytes, // Usar valor da configuração
        chromiumOptions: {
          disableWebSecurity: true,
          ignoreCertificateErrors: true
        },
        timeoutInMilliseconds: 1800000, // 30 minutos para o processo todo
        envVariables: {
          PORT: String(this.config.port),
        }
      });
      
      logger.debug(
        {
          component,
          videoID: id,
        },
        "Video rendered with Remotion",
      );

    } catch (err) {
      logger.error("Remotion render failed");
      throw err;
    }
  }

  async testRender(outputLocation: string) {
    const composition = await selectComposition({
      serveUrl: this.bundled,
      id: "TestVideo",
    });

    await renderMedia({
      codec: "h264",
      composition,
      serveUrl: this.bundled,
      outputLocation,
      onProgress: ({ progress }) => {
        logger.debug(
          `Rendering test video: ${Math.floor(progress * 100)}% complete`,
        );
      },
      concurrency: 1, // Forçar processamento sequencial
      offthreadVideoCacheSizeInBytes: this.config.videoCacheSizeInBytes,
      envVariables: {
        PORT: String(this.config.port),
      }
    });
  }
}
