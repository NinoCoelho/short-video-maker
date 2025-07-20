/* eslint-disable @typescript-eslint/no-unused-vars */
import path from "path";
import fs from "fs-extra";
import "dotenv/config";
import { bundle } from "@remotion/bundler";

import { Remotion } from "./short-creator/libraries/Remotion";
import { FFMpeg } from "./short-creator/libraries/FFmpeg";
import { Config } from "./config";
import { ShortCreator } from "./short-creator/ShortCreator";
import { logger } from "./logger";
import { Server } from "./server/server";
import { VideoProviderFacade } from "./short-creator/libraries/VideoProviderFacade";
import { VideoStatusManager } from "./short-creator/VideoStatusManager";
import { LocalTTS } from "./short-creator/libraries/LocalTTS";

async function main() {
  try {
    // Carregar configuração
    const config = new Config();

    // Bundle Remotion
    const bundled = await bundle({
      entryPoint: path.join(process.cwd(), "src", "components", "root", "index.ts"),
      // Adicione outras opções de bundle se necessário
    });

    // Inicializar componentes
    const remotion = new Remotion(bundled, config);
    const ffmpeg = new FFMpeg(config);
    const videoProviderFacade = new VideoProviderFacade(config, config.port);
    const localTTS = await LocalTTS.init(config); // Usando LocalTTS real
    const statusManager = new VideoStatusManager(config);

    const shortCreator = new ShortCreator(
      bundled,
      config,
      remotion,
      ffmpeg,
      videoProviderFacade,
      localTTS,
      statusManager
    );

    // Iniciar servidor
    const server = new Server(config, shortCreator);
    await server.start();
    logger.info("Server started successfully");

    // Configurar handlers para sinais do processo
    process.on('SIGINT', () => {
      logger.info('Received SIGINT. Cleaning up...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM. Cleaning up...');
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Manter o processo vivo
    setInterval(() => {
      logger.debug('Process is still alive...');
    }, 60000); // Log a cada minuto

    logger.info('Server is ready to handle requests');
  } catch (error) {
    logger.error("Error in main:", error);
    process.exit(1);
  }
}

// Iniciar o servidor
main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
