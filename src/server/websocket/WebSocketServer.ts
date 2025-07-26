import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { eventBus } from '../events/EventBus';
import { logger } from '../../logger';

export class WebSocketServer {
  private io: SocketIOServer;
  private videoSubscribers: Map<string, Set<string>> = new Map();
  private connectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private eventListeners: Map<string, Function[]> = new Map();

  constructor(httpServer: HTTPServer) {
    // Configure CORS with allowed origins from environment or defaults
    const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
      process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : 
      ['http://localhost:3232', 'http://localhost:3233', 'http://localhost:3000'];
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps or server-to-server)
          if (!origin) return callback(null, true);
          
          // Check if origin is in allowed list
          if (allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            logger.warn(`Rejected WebSocket connection from unauthorized origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
          }
        },
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupSocketHandlers();
    this.setupEventListeners();
    this.setupPeriodicCleanup();
    
    logger.info('WebSocket server initialized');
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Handle video subscription
      socket.on('subscribe:video', (videoId: string) => {
        logger.info(`[WebSocket] Subscribe request - videoId: ${videoId}, socketId: ${socket.id}`);
        
        if (!this.videoSubscribers.has(videoId)) {
          this.videoSubscribers.set(videoId, new Set());
        }
        this.videoSubscribers.get(videoId)!.add(socket.id);
        socket.join(`video-${videoId}`);
        socket.emit('subscribed:video', { videoId });
        logger.info(`[WebSocket] Client ${socket.id} subscribed to video ${videoId}`);
      });

      // Handle video unsubscription
      socket.on('unsubscribe:video', (videoId: string) => {
        const subscribers = this.videoSubscribers.get(videoId);
        if (subscribers) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            this.videoSubscribers.delete(videoId);
          }
        }
        socket.leave(`video-${videoId}`);
        logger.debug(`Client ${socket.id} unsubscribed from video ${videoId}`);
      });

      // Handle subscribe to all videos
      socket.on('subscribe:all', () => {
        socket.join('all-videos');
        socket.emit('subscribed:all');
        logger.debug(`Client ${socket.id} subscribed to all videos`);
      });

      // Handle unsubscribe from all videos
      socket.on('unsubscribe:all', () => {
        socket.leave('all-videos');
        logger.debug(`Client ${socket.id} unsubscribed from all videos`);
      });

      // Handle import job subscription
      socket.on('subscribe-import', (jobId: string) => {
        socket.join(`import-${jobId}`);
        logger.debug(`Client ${socket.id} subscribed to import job ${jobId}`);
      });

      // Handle import job unsubscription
      socket.on('unsubscribe-import', (jobId: string) => {
        socket.leave(`import-${jobId}`);
        logger.debug(`Client ${socket.id} unsubscribed from import job ${jobId}`);
      });

      // Handle download job subscription
      socket.on('subscribe-download', (jobId: string) => {
        socket.join(`download-${jobId}`);
        logger.debug(`Client ${socket.id} subscribed to download job ${jobId}`);
      });

      // Handle download job unsubscription
      socket.on('unsubscribe-download', (jobId: string) => {
        socket.leave(`download-${jobId}`);
        logger.debug(`Client ${socket.id} unsubscribed from download job ${jobId}`);
      });

      // Handle ping/pong for connection health check
      socket.on('ping', () => {
        socket.emit('pong');
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
        // Clean up video subscriptions
        for (const [videoId, subscribers] of this.videoSubscribers.entries()) {
          if (subscribers.has(socket.id)) {
            subscribers.delete(socket.id);
            if (subscribers.size === 0) {
              this.videoSubscribers.delete(videoId);
            }
          }
        }
      });
    });
  }

  private setupEventListeners() {
    // Listen for video status updates
    eventBus.on('video-status-updated', ({ videoId, status, progress, message, stage }) => {
      logger.info(`[WebSocket] Broadcasting status update - videoId: ${videoId}, status: ${status}, progress: ${progress}`);
      
      this.broadcastToVideoSubscribers(videoId, 'video:status:update', {
        videoId,
        status,
        progress,
        message,
        stage,
        timestamp: new Date().toISOString()
      });
      
      // Also emit processing progress event for compatibility
      if (status === 'processing') {
        this.broadcastToVideoSubscribers(videoId, 'video:processing:progress', {
          videoId,
          status,
          progress,
          message,
          stage,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Listen for video completed events
    eventBus.on('video-completed', ({ videoId, outputPath }) => {
      this.broadcastToVideoSubscribers(videoId, 'video:completed', {
        videoId,
        outputPath,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for video error events
    eventBus.on('video-error', ({ videoId, error }) => {
      this.broadcastToVideoSubscribers(videoId, 'video:error', {
        videoId,
        error: error.message || error,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for import progress events
    eventBus.on('import-progress', ({ jobId, stage, progress, message }) => {
      this.io.to(`import-${jobId}`).emit('import-progress', {
        jobId,
        stage,
        progress,
        message,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for import complete events
    eventBus.on('import-complete', ({ jobId, videoId }) => {
      this.io.to(`import-${jobId}`).emit('import-complete', {
        jobId,
        videoId,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for import error events
    eventBus.on('import-error', ({ jobId, error }) => {
      this.io.to(`import-${jobId}`).emit('import-error', {
        jobId,
        error: error.message || error,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for import handoff events
    eventBus.on('import:handoff-complete', (data) => {
      const { videoId, originalVideoId } = data;
      
      // Notify import subscribers of completion
      this.io.to(`import-${originalVideoId}`).emit('import-handoff-complete', data);
      
      // Bridge subscription from import room to video room
      this.bridgeSubscriptions(originalVideoId, videoId);
    });

    // Listen for video render start events
    eventBus.on('video:render:start', (data) => {
      this.broadcastToVideoSubscribers(data.videoId, 'video-render-start', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for scene processing events
    eventBus.on('scene-processing', ({ videoId, sceneIndex, totalScenes, stage, progress }) => {
      this.broadcastToVideoSubscribers(videoId, 'scene:processing', {
        videoId,
        sceneIndex,
        totalScenes,
        stage,
        progress,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for download progress events
    eventBus.on('download:progress', (event) => {
      const eventData = {
        jobId: event.jobId,
        videoId: event.videoId,
        progress: event.progress,
        downloadedBytes: event.downloadedBytes,
        totalBytes: event.totalBytes,
        speed: event.speed,
        eta: event.eta,
        timestamp: event.timestamp
      };
      
      // Send to both download and import rooms
      this.io.to(`download-${event.jobId}`).emit('download-progress', eventData);
      this.io.to(`import-${event.jobId}`).emit('download-progress', eventData);
    });

    // Listen for download status events
    eventBus.on('download:status', (event) => {
      const eventData = {
        jobId: event.jobId,
        videoId: event.videoId,
        status: event.status,
        message: event.message,
        timestamp: event.timestamp
      };
      
      // Send to both download and import rooms
      this.io.to(`download-${event.jobId}`).emit('download-status', eventData);
      this.io.to(`import-${event.jobId}`).emit('download-status', eventData);
    });

    // Listen for download complete events
    eventBus.on('download:complete', (event) => {
      const eventData = {
        jobId: event.jobId,
        videoId: event.videoId,
        filePath: event.filePath,
        fileSize: event.fileSize,
        duration: event.duration,
        timestamp: event.timestamp
      };
      
      // Send to both download and import rooms
      this.io.to(`download-${event.jobId}`).emit('download-complete', eventData);
      this.io.to(`import-${event.jobId}`).emit('download-complete', eventData);
    });

    // Listen for download error events
    eventBus.on('download:error', (event) => {
      const eventData = {
        jobId: event.jobId,
        videoId: event.videoId,
        error: event.error,
        retries: event.retries,
        willRetry: event.willRetry,
        timestamp: event.timestamp
      };
      
      // Send to both download and import rooms
      this.io.to(`download-${event.jobId}`).emit('download-error', eventData);
      this.io.to(`import-${event.jobId}`).emit('download-error', eventData);
    });
  }

  broadcastGlobal(event: string, data: any) {
    this.io.emit(event, data);
    logger.debug({ event, data }, 'WebSocket global broadcast');
  }

  broadcastToVideoSubscribers(videoId: string, event: string, data: any) {
    const subscribers = this.videoSubscribers.get(videoId);
    const subscriberCount = subscribers ? subscribers.size : 0;
    
    logger.info(`[WebSocket] Broadcasting ${event} to ${subscriberCount} subscribers for video ${videoId}`);
    this.io.to(`video-${videoId}`).emit(event, data);
    logger.debug({ videoId, event, data, subscriberCount }, 'WebSocket video broadcast');
  }

  broadcastToImportSubscribers(jobId: string, event: string, data: any) {
    this.io.to(`import-${jobId}`).emit(event, data);
    logger.debug({ jobId, event, data }, 'WebSocket import broadcast');
  }

  broadcastToDownloadSubscribers(jobId: string, event: string, data: any) {
    this.io.to(`download-${jobId}`).emit(event, data);
    logger.debug({ jobId, event, data }, 'WebSocket download broadcast');
  }

  // Bridge method for subscription transfer
  private bridgeSubscriptions(importJobId: string, videoId: string): void {
    const importRoom = `import-${importJobId}`;
    const videoRoom = `video-${videoId}`;
    
    // Get all sockets in import room
    const importSockets = this.io.sockets.adapter.rooms.get(importRoom);
    
    if (importSockets) {
      importSockets.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          // Subscribe to video room
          socket.join(videoRoom);
          // Keep import room for final cleanup
        }
      });
    }
    
    logger.info({ importJobId, videoId, subscriberCount: importSockets?.size || 0 }, 
      'Bridged WebSocket subscriptions from import to video room');
  }

  // Cleanup methods
  private cleanupClientResources(socketId: string): void {
    // Clear connection timer
    const timer = this.connectionTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.connectionTimers.delete(socketId);
    }

    // Clean up video subscriptions
    for (const [videoId, subscribers] of this.videoSubscribers.entries()) {
      if (subscribers.has(socketId)) {
        subscribers.delete(socketId);
        if (subscribers.size === 0) {
          this.videoSubscribers.delete(videoId);
          // Clean up EventBus listeners for this video
          eventBus.removeAllListenersForVideo(videoId);
        }
      }
    }

    // Clean up any tracked event listeners
    this.eventListeners.delete(socketId);
  }

  private setupPeriodicCleanup(): void {
    // Run cleanup every 5 minutes
    setInterval(() => {
      eventBus.cleanupStaleListeners();
      
      // Clean up empty video subscriber entries
      for (const [videoId, subscribers] of this.videoSubscribers.entries()) {
        if (subscribers.size === 0) {
          this.videoSubscribers.delete(videoId);
        }
      }
      
      logger.debug('Performed periodic WebSocket cleanup');
    }, 5 * 60 * 1000); // 5 minutes
  }

  private trackEventListener(eventName: string, listener: Function): void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName)!.push(listener);
  }

  // Graceful shutdown
  public shutdown(): void {
    logger.info('Shutting down WebSocket server');
    
    // Clear all timers
    for (const timer of this.connectionTimers.values()) {
      clearTimeout(timer);
    }
    this.connectionTimers.clear();
    
    // Clean up EventBus
    eventBus.cleanup();
    
    // Close all connections
    this.io.close();
    
    logger.info('WebSocket server shutdown complete');
  }
}