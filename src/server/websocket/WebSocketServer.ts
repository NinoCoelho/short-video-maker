import { Server as HTTPServer } from 'http';
import { eventBus } from '../events/EventBus';
import { logger } from '../../logger';

export class WebSocketServer {
  constructor(httpServer: HTTPServer) {
    // Stub implementation - socket.io functionality disabled for now
    logger.info('WebSocket server disabled - socket.io not available');
  }

  broadcastGlobal(event: string, data: any) {
    // Stub method
    logger.debug({ event, data }, 'WebSocket broadcast (disabled)');
  }

  broadcastToVideoSubscribers(videoId: string, event: string, data: any) {
    // Stub method
    logger.debug({ videoId, event, data }, 'WebSocket video broadcast (disabled)');
  }
}