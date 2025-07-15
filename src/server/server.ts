import http from "http";
import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import path from "path";
import { exec, execSync } from "child_process";
import { ShortCreator } from "../short-creator/ShortCreator";
import { APIRouter } from "./routers/rest";
import { MCPRouter } from "./routers/mcp";
import { logger } from "../logger";
import { Config } from "../config";
import referenceAudioRouter from "./routes/referenceAudio";
import { VideoStatusManager } from "../short-creator/VideoStatusManager";

export class Server {
  private app: express.Application;
  private config: Config;
  private shortCreator: ShortCreator;
  private videoStatusManager: VideoStatusManager;

  constructor(config: Config, shortCreator: ShortCreator) {
    this.config = config;
    this.shortCreator = shortCreator;
    this.app = express();

    // add healthcheck endpoint
    this.app.get("/health", (req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json({ status: "ok" });
    });

    this.videoStatusManager = new VideoStatusManager(config);
    const apiRouter = new APIRouter(config, this.shortCreator, this.videoStatusManager);
    const mcpRouter = new MCPRouter(shortCreator);
    this.app.use("/api", apiRouter.router);
    this.app.use("/mcp", mcpRouter.router);
    this.app.use("/api/reference-audio", referenceAudioRouter);

    // Serve a pasta de arquivos temporários
    this.app.use('/temp', express.static(this.config.tempDirPath));
  }

  private async cancelOngoingRenders(): Promise<void> {
    logger.info("Verificando vídeos com status 'processing' na inicialização...");
    try {
      const videos = await this.shortCreator.getAllVideos();
      for (const video of videos) {
        const status = await this.videoStatusManager.getStatus(video.id);
        if (status?.status === 'processing') {
          logger.warn(`Vídeo ${video.id} estava com status 'processing'. Alterando para 'failed'.`);
          await this.videoStatusManager.setStatus(video.id, 'failed',
            "A renderização foi interrompida por uma reinicialização do servidor."
          );
        }
      }
    } catch (error) {
      logger.error("Erro ao verificar e cancelar renders em andamento:", error);
    }
  }

  private async killProcessOnPort(port: number): Promise<void> {
    try {
      if (process.platform === 'win32') {
        // Windows
        execSync(`netstat -ano | findstr :${port}`, { stdio: 'pipe' });
        const output = execSync(`netstat -ano | findstr :${port}`).toString();
        const lines = output.split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length > 4) {
            const pid = parts[parts.length - 1];
            if (pid) {
              execSync(`taskkill /F /PID ${pid}`);
            }
          }
        }
      } else {
        // Unix-like systems (Linux, macOS)
        const output = execSync(`lsof -i :${port} -t`).toString();
        const pids = output.split('\n').filter(Boolean);
        for (const pid of pids) {
          execSync(`kill -9 ${pid}`);
        }
      }
      logger.info(`Killed process using port ${port}`);
    } catch (error) {
      logger.warn(`No process found using port ${port}`);
    }
  }

  public async start(): Promise<void> {
    const port = Number(process.env.PORT) || 3233;
    
    await this.cancelOngoingRenders();

    try {
      // Tenta matar qualquer processo usando a porta antes de iniciar
      await this.killProcessOnPort(port);
      
      // Tenta iniciar o servidor
      let retries = 3;
      while (retries > 0) {
        try {
          await new Promise<void>((resolve, reject) => {
            const server = this.app.listen(port, "0.0.0.0", () => {
              logger.info(`🚀 Server running on http://0.0.0.0:${port}`);
              // Envia sinal de ready para o PM2
              if (process.send) {
                process.send('ready');
              }
              resolve();
            }).on('error', (err: NodeJS.ErrnoException) => {
              if (err.code === 'EADDRINUSE') {
                logger.warn(`Port ${port} is in use, retrying...`);
                reject(err);
              } else {
                logger.error("Error starting server:", err);
                reject(err);
              }
            });

            // Configurar timeouts mais longos para o servidor
            server.timeout = 1800000; // 30 minutos
            server.keepAliveTimeout = 1800000; // 30 minutos
            server.headersTimeout = 1800000; // 30 minutos
          });
          // Se chegou aqui, o servidor iniciou com sucesso
          break;
        } catch (err) {
          retries--;
          if (retries === 0) {
            throw err;
          }
          // Espera um pouco antes de tentar novamente
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (err) {
      logger.error("Error starting server:", err);
      throw err;
    }
  }

  public getApp() {
    return this.app;
  }
}
