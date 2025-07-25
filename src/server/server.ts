import http from "http";
import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import path from "path";
import { spawnSync } from "child_process";
import { ShortCreator } from "../short-creator/ShortCreator";
import { APIRouter } from "./routers/rest";
import { MCPRouter } from "./routers/mcp";
import { logger } from "../logger";
import { Config } from "../config";
import referenceAudioRouter from "./routes/referenceAudio";
import { VideoStatusManager } from "../short-creator/VideoStatusManager";
import { WebSocketServer } from "./websocket/WebSocketServer";
// import { setupDownloadRoutes } from "../services/downloadSystemIntegration";
import { TranslationService } from "../services/TranslationService";
import { TranscriptionService } from "../services/TranscriptionService";
import { LibraryManagerService } from "../services/LibraryManagerService";
import { createLibraryRouter } from "./routes/libraryRoutes";
import { createIAScriptRouter } from "./routes/iaScriptRoutes";
import { ServiceContainer } from "../services/ServiceContainer";
import type { DownloadSystem } from "../services/initializeDownloadSystem";
import { Pool } from 'pg';
import { SQLiteAdapter, SQLitePool } from '../database/SQLiteAdapter';
import { 
  createRateLimiter,
  sanitizeRequest,
  PathTraversalGuard,
  URLValidator,
} from "./middleware/security";
import { 
  globalErrorHandler, 
  notFoundHandler,
  uncaughtExceptionHandler,
  unhandledRejectionHandler,
  gracefulShutdownHandler 
} from "./middleware/errorHandler";

export class Server {
  private app: express.Application;
  private httpServer: http.Server | null = null;
  private wsServer: WebSocketServer | null = null;
  private config: Config;
  private shortCreator: ShortCreator;
  private videoStatusManager: VideoStatusManager;
  private downloadSystem?: DownloadSystem;
  private translationService?: TranslationService;
  private transcriptionService?: TranscriptionService;
  private libraryManager?: LibraryManagerService;
  private databasePool?: Pool | SQLitePool;
  private readonly projectRoot: string;

  constructor(config: Config, shortCreator: ShortCreator, downloadSystem?: DownloadSystem, projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd(); // Use provided projectRoot or fallback to cwd
    this.config = config;
    this.shortCreator = shortCreator;
    this.downloadSystem = downloadSystem;
    this.app = express();

    // Apply security middleware first
    this.setupSecurityMiddleware();

    // add healthcheck endpoint
    this.app.get("/health", (req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json({ status: "ok" });
    });

    // Initialize services will be called in start() method
    // Routes will be setup after services are initialized

    // Set up global error handlers
    this.setupGlobalErrorHandlers();
  }

  private setupRoutes(): void {
    this.videoStatusManager = new VideoStatusManager(this.config);
    
    // Register videoStatusManager in service container and create ImportService
    const container = ServiceContainer.getInstance();
    container.register('statusManager', this.videoStatusManager);
    
    const apiRouter = new APIRouter(
      this.config, 
      this.shortCreator, 
      this.videoStatusManager,
      this.translationService,
      this.transcriptionService
    );
    const mcpRouter = new MCPRouter(this.shortCreator);
    this.app.use("/api", apiRouter.router);
    this.app.use("/mcp", mcpRouter.router);
    this.app.use("/api/reference-audio", referenceAudioRouter);
    
    // Setup library routes if library manager is available
    if (this.libraryManager) {
      this.app.use("/api/library", createLibraryRouter(this.libraryManager, this.projectRoot));
      logger.info("Library manager routes initialized");
    }

    // Setup IA Script routes if database pool is available
    if (this.databasePool) {
      this.app.use("/api/ia-script", createIAScriptRouter(this.databasePool, this.shortCreator));
      logger.info("IA Script routes initialized");
    } else {
      logger.warn("Database pool not available, IA Script routes disabled");
    }

    // Setup download routes if download system is available
    if (this.downloadSystem) {
      // setupDownloadRoutes(apiRouter.router);
      logger.info("Download system routes disabled temporarily");
    }

    // Serve temporary files with path validation
    this.app.use('/temp', 
      PathTraversalGuard.middleware(['filename']), 
      express.static(this.config.tempDirPath)
    );

    // Serve static music and overlay files with CORS for Remotion
    const corsMiddleware = (req: ExpressRequest, res: ExpressResponse, next: express.NextFunction) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      res.setHeader('Access-Control-Max-Age', '3600');
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
      } else {
        next();
      }
    };

    // Get project root directory (2 levels up from src/server/server.ts)
    const projectRoot = path.resolve(__dirname, '../..');
    
    // Static files are now properly served from the correct project root
    this.app.use('/music', corsMiddleware, express.static(path.join(projectRoot, 'static/music')));
    this.app.use('/overlays', corsMiddleware, express.static(path.join(projectRoot, 'static/overlays')));
    this.app.use('/fonts', corsMiddleware, express.static(path.join(projectRoot, 'fonts')));

    // Error handling middleware (must be last)
    this.app.use(notFoundHandler);
    this.app.use(globalErrorHandler);
  }

  private setupSecurityMiddleware(): void {
    // CORS configuration - must be before other middleware
    this.app.use((req: ExpressRequest, res: ExpressResponse, next: express.NextFunction) => {
      const origin = req.headers.origin;
      
      // Allow requests from localhost:3232 (frontend dev server)
      if (origin && (origin.includes('localhost:3232') || origin.includes('127.0.0.1:3232'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '3600');
      }
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      
      next();
    });
    
    // Request sanitization - must be after CORS
    this.app.use(sanitizeRequest);
    
    // Body parsing with size limits
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Rate limiting - different limits for different endpoints
    // More lenient in development mode
    const isDev = process.env.NODE_ENV === 'development';
    
    const generalLimiter = createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: isDev ? 1000 : 100, // More requests in dev mode
      message: 'Too many requests from this IP, please try again later.'
    });
    
    const strictLimiter = createRateLimiter({
      windowMs: 5 * 60 * 1000, // 5 minutes
      maxRequests: isDev ? 100 : 10, // More requests in dev mode
      message: 'Too many resource-intensive requests, please try again later.'
    });
    
    
    // Apply general rate limiting to all routes
    this.app.use(generalLimiter);
    
    // Apply strict rate limiting to resource-intensive endpoints
    this.app.use('/api/render', strictLimiter);
    this.app.use('/api/short-video', strictLimiter);
    this.app.use('/api/generate-tts', strictLimiter);
    this.app.use('/api/search-background-videos', strictLimiter);
    this.app.use('/api/create-video-from-script', strictLimiter);
    
    
    // CORS security headers
    this.app.use((req: ExpressRequest, res: ExpressResponse, next: express.NextFunction) => {
      // Security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      // Content Security Policy
      res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Remotion needs eval
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "media-src 'self' data: https:",
        "connect-src 'self' ws: wss: https:",
        "font-src 'self' https:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; '));
      
      next();
    });
    
    logger.info('Security middleware configured successfully');
  }

  private setupGlobalErrorHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', uncaughtExceptionHandler);

    // Handle unhandled promise rejections
    process.on('unhandledRejection', unhandledRejectionHandler);

    // Graceful shutdown handlers will be set up after server is created
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize service container with all dependencies
      const container = ServiceContainer.getInstance();
      container.register('shortCreator', this.shortCreator);
      container.register('globalConfig', this.config);
      
      // Initialize Translation Service with API keys from environment
      const apiKeys = {
        openai: process.env.OPENAI_API_KEY,
        google: process.env.GOOGLE_AI_API_KEY,
        googleCloud: process.env.GOOGLE_CLOUD_API_KEY,
        deepl: process.env.DEEPL_API_KEY
      };

      // Only initialize if at least one API key is available
      if (Object.values(apiKeys).some(key => key)) {
        this.translationService = new TranslationService(
          this.config.dataDirPath,
          apiKeys
        );
        container.register('translationService', this.translationService);
        logger.info('Translation service initialized');
      } else {
        logger.warn('No translation API keys found, translation service disabled');
      }

      // Initialize Transcription Service
      this.transcriptionService = new TranscriptionService(this.config.dataDirPath);
      container.register('transcriptionService', this.transcriptionService);
      logger.info('Transcription service initialized');

      // Initialize Library Manager Service
      this.libraryManager = new LibraryManagerService(this.projectRoot);
      await this.libraryManager.initialize();
      container.register('libraryManager', this.libraryManager);
      logger.info('Library manager service initialized');
      
      // Initialize Database - Use SQLite by default, PostgreSQL if configured
      if (process.env.DATABASE_URL || process.env.DB_HOST) {
        // Use PostgreSQL if configured
        try {
          const poolConfig = process.env.DATABASE_URL ? {
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
          } : {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'short_video_maker',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            max: 20, // Maximum number of clients in the pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
          };
          
          this.databasePool = new Pool(poolConfig);
          
          // Test connection
          await this.databasePool.query('SELECT 1');
          container.register('databasePool', this.databasePool);
          logger.info('PostgreSQL database pool initialized successfully');
        } catch (error) {
          logger.error('Failed to initialize PostgreSQL pool:', error);
          logger.warn('Falling back to SQLite database');
          // Fall back to SQLite
          this.databasePool = new SQLiteAdapter(this.config.dataDirPath);
          container.register('databasePool', this.databasePool);
          logger.info('SQLite database initialized as fallback');
        }
      } else {
        // Use SQLite by default
        logger.info('Using SQLite database for IA Script features');
        this.databasePool = new SQLiteAdapter(this.config.dataDirPath);
        container.register('databasePool', this.databasePool);
        logger.info('SQLite database initialized successfully');
      }
      
      logger.info({ registeredServices: container.getRegisteredServices() }, 'Service container initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize translation/transcription services');
      throw error;
    }
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
        // First, find processes using the port
        const netstatResult = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
        if (netstatResult.error) {
          throw netstatResult.error;
        }
        
        const portPattern = new RegExp(`:${port}\\s+`, 'g');
        const lines = netstatResult.stdout.split('\n').filter(line => portPattern.test(line));
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length > 4) {
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid)) {
              // Kill the process
              const killResult = spawnSync('taskkill', ['/F', '/PID', pid], { encoding: 'utf8' });
              if (killResult.error) {
                logger.warn(`Failed to kill process ${pid}: ${killResult.error.message}`);
              }
            }
          }
        }
      } else {
        // Unix-like systems (Linux, macOS)
        const lsofResult = spawnSync('lsof', ['-i', `:${port}`, '-t'], { encoding: 'utf8' });
        if (lsofResult.error) {
          // lsof not found or port not in use
          if (lsofResult.error.code !== 'ENOENT') {
            logger.warn(`lsof error: ${lsofResult.error.message}`);
          }
          return;
        }
        
        const pids = lsofResult.stdout.split('\n').filter(Boolean);
        for (const pid of pids) {
          if (/^\d+$/.test(pid)) {
            const killResult = spawnSync('kill', ['-9', pid], { encoding: 'utf8' });
            if (killResult.error) {
              logger.warn(`Failed to kill process ${pid}: ${killResult.error.message}`);
            }
          }
        }
      }
      logger.info(`Killed process using port ${port}`);
    } catch (error) {
      logger.warn(`No process found using port ${port}`);
    }
  }

  public async start(): Promise<void> {
    const port = Number(process.env.PORT) || 3233;
    
    // Initialize services first
    await this.initializeServices();
    
    // Setup routes after services are initialized
    this.setupRoutes();
    
    await this.cancelOngoingRenders();

    try {
      // Tenta matar qualquer processo usando a porta antes de iniciar
      await this.killProcessOnPort(port);
      
      // Tenta iniciar o servidor
      let retries = 3;
      while (retries > 0) {
        try {
          await new Promise<void>((resolve, reject) => {
            // Create HTTP server
            this.httpServer = http.createServer(this.app);
            
            // Initialize WebSocket server
            this.wsServer = new WebSocketServer(this.httpServer);
            
            this.httpServer.listen(port, "0.0.0.0", () => {
              logger.info(`🚀 Server running on http://0.0.0.0:${port}`);
              logger.info(`🔌 WebSocket server initialized`);
              
              // Set up graceful shutdown handlers now that server is created
              process.on('SIGTERM', gracefulShutdownHandler(this.httpServer));
              process.on('SIGINT', gracefulShutdownHandler(this.httpServer));
              
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
            this.httpServer.timeout = 1800000; // 30 minutos
            this.httpServer.keepAliveTimeout = 1800000; // 30 minutos
            this.httpServer.headersTimeout = 1800000; // 30 minutos
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
