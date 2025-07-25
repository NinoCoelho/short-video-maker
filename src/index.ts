import path from "path";
import fs from "fs-extra";
import "dotenv/config";
import { bundle } from "@remotion/bundler";

import { Remotion } from "./short-creator/libraries/Remotion";
import { FFmpeg } from "./short-creator/libraries/FFmpeg";
import { Config } from "./config";
import { ShortCreator } from "./short-creator/ShortCreator";
import { logger } from "./logger";
import { Server } from "./server/server";
import { VideoProviderFacade } from "./short-creator/libraries/VideoProviderFacade";
import { VideoStatusManager } from "./short-creator/VideoStatusManager";
import { LocalTTS } from "./short-creator/libraries/LocalTTS";
import { initializeDownloadSystem } from "./services/initializeDownloadSystem";

async function main() {
  try {
    // Find project root by looking for package.json
    let projectRoot = __dirname;
    while (projectRoot !== path.dirname(projectRoot)) {
      if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
        break;
      }
      projectRoot = path.dirname(projectRoot);
    }
    
    // Fallback if package.json not found
    if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
      projectRoot = process.env.PROJECT_ROOT || process.cwd();
      logger.warn({ projectRoot }, "Could not find package.json, using PROJECT_ROOT env var or current working directory");
    }
    
    // Only log if the working directory is unexpected
    if (!process.cwd().includes(projectRoot)) {
      logger.warn({ projectRoot, currentCwd: process.cwd() }, "Working directory was changed by a dependency, using absolute paths");
    }
    
    // Load configuration
    const config = new Config();

    // Bundle Remotion
    const entryPoint = path.resolve(projectRoot, "src", "components", "root", "index.ts");
    logger.info({ entryPoint }, "Bundling Remotion components");
    
    // Check if entry point exists
    if (!fs.existsSync(entryPoint)) {
      logger.error({ entryPoint }, "Entry point does not exist");
      throw new Error(`Entry point does not exist: ${entryPoint}`);
    }
    
    const bundled = await bundle({
      entryPoint: entryPoint,
      // Add other bundle options if necessary
    });

    // Initialize components
    const remotion = new Remotion(bundled, config);
    const ffmpeg = new FFmpeg(config);
    const videoProviderFacade = new VideoProviderFacade(config, config.port);
    const localTTS = await LocalTTS.init(config); // Usando LocalTTS real
    const statusManager = new VideoStatusManager(config);

    // Initialize download system
    logger.info("Initializing download queue management system...");
    const downloadSystem = initializeDownloadSystem({
      outputDir: path.join(projectRoot, "downloads"),
      maxConcurrentDownloads: 3,
      defaultQuality: 'best',
      defaultFormat: 'mp4',
      retryDelay: 5000,
      maxRetries: 3,
      enableCleanupTask: true,
      cleanupIntervalHours: 6
    });
    logger.info("Download system initialized successfully");

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
    const server = new Server(config, shortCreator, downloadSystem, projectRoot);
    await server.start();
    logger.info("Server started successfully");

    // Configurar handlers para sinais do processo
    process.on('SIGINT', () => {
      logger.info('Received SIGINT. Cleaning up...');
      downloadSystem.stopCleanupTask();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM. Cleaning up...');
      downloadSystem.stopCleanupTask();
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise: String(promise) }, 'Unhandled Rejection at:');
    });

    // Keep process alive
    setInterval(() => {
      logger.debug('Process is still alive...');
    }, 60000); // Log every minute

    logger.info('Server is ready to handle requests');
  } catch (error) {
    logger.error({ error }, "Error in main:");
    process.exit(1);
  }
}

// Iniciar o servidor
main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
