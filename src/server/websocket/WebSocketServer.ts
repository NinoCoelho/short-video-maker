import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { eventBus } from '../events/EventBus';
import { logger } from '../../logger';
import type { 
  VideoStatusUpdateEvent, 
  VideoProcessingProgressEvent, 
  VideoCompletedEvent, 
  VideoErrorEvent,
  SceneProcessingEvent
} from '../events/EventBus';

export class WebSocketServer {
  private io: SocketIOServer;
  private videoSubscriptions: Map<string, Set<string>> = new Map(); // videoId -> Set of socket IDs

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? false 
          : ['http://localhost:3121', 'http://localhost:3123'],
        methods: ['GET', 'POST']
      }
    });

    this.setupEventListeners();
    this.setupSocketHandlers();
  }

  private setupEventListeners() {
    // Listen to event bus and forward to WebSocket clients
    eventBus.onVideoStatusUpdate((event) => {
      this.broadcastToVideoSubscribers(event.videoId, 'video:status:update', event);
    });

    eventBus.onVideoProcessingProgress((event) => {
      this.broadcastToVideoSubscribers(event.videoId, 'video:processing:progress', event);
    });

    eventBus.onVideoCompleted((event) => {
      this.broadcastToVideoSubscribers(event.videoId, 'video:completed', event);
    });

    eventBus.onVideoError((event) => {
      this.broadcastToVideoSubscribers(event.videoId, 'video:error', event);
    });

    eventBus.onSceneProcessing((event) => {
      this.broadcastToVideoSubscribers(event.videoId, 'scene:processing', event);
    });
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Handle video subscription
      socket.on('subscribe:video', (videoId: string) => {
        this.subscribeToVideo(socket, videoId);
      });

      // Handle video unsubscription
      socket.on('unsubscribe:video', (videoId: string) => {
        this.unsubscribeFromVideo(socket, videoId);
      });

      // Handle global subscription (for list views)
      socket.on('subscribe:all', () => {
        socket.join('global');
        socket.emit('subscribed:all');
      });

      // Handle global unsubscription
      socket.on('unsubscribe:all', () => {
        socket.leave('global');
        socket.emit('unsubscribed:all');
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
        this.cleanupSocketSubscriptions(socket.id);
      });

      // Ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong');
      });
    });
  }

  private subscribeToVideo(socket: Socket, videoId: string) {
    if (!this.videoSubscriptions.has(videoId)) {
      this.videoSubscriptions.set(videoId, new Set());
    }
    
    this.videoSubscriptions.get(videoId)!.add(socket.id);
    socket.join(`video:${videoId}`);
    socket.emit('subscribed:video', { videoId });
    
    logger.info(`Socket ${socket.id} subscribed to video ${videoId}`);
  }

  private unsubscribeFromVideo(socket: Socket, videoId: string) {
    const subscribers = this.videoSubscriptions.get(videoId);
    if (subscribers) {
      subscribers.delete(socket.id);
      if (subscribers.size === 0) {
        this.videoSubscriptions.delete(videoId);
      }
    }
    
    socket.leave(`video:${videoId}`);
    socket.emit('unsubscribed:video', { videoId });
    
    logger.info(`Socket ${socket.id} unsubscribed from video ${videoId}`);
  }

  private cleanupSocketSubscriptions(socketId: string) {
    // Remove socket from all video subscriptions
    for (const [videoId, subscribers] of this.videoSubscriptions.entries()) {
      subscribers.delete(socketId);
      if (subscribers.size === 0) {
        this.videoSubscriptions.delete(videoId);
      }
    }
  }

  private broadcastToVideoSubscribers(videoId: string, event: string, data: any) {
    // Broadcast to specific video room
    this.io.to(`video:${videoId}`).emit(event, data);
    
    // Also broadcast to global room for list updates
    this.io.to('global').emit(event, data);
  }

  // Public methods for direct broadcasting
  public broadcastVideoUpdate(videoId: string, update: VideoStatusUpdateEvent) {
    this.broadcastToVideoSubscribers(videoId, 'video:status:update', update);
  }

  public broadcastGlobalUpdate(event: string, data: any) {
    this.io.to('global').emit(event, data);
  }

  public getConnectedClients(): number {
    return this.io.engine.clientsCount;
  }

  public getVideoSubscribers(videoId: string): number {
    return this.videoSubscriptions.get(videoId)?.size || 0;
  }
}