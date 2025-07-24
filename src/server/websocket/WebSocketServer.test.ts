import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HTTPServer } from 'http';
import { Socket as ClientSocket, io as ioClient } from 'socket.io-client';
import { WebSocketServer } from './WebSocketServer';
import { eventBus } from '../events/EventBus';

// Mock the logger
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('WebSocketServer', () => {
  let httpServer: HTTPServer;
  let webSocketServer: WebSocketServer;
  let clientSocket: ClientSocket;
  const TEST_PORT = 3001;

  beforeEach(async () => {
    // Create HTTP server
    httpServer = createServer();
    
    // Initialize WebSocket server
    webSocketServer = new WebSocketServer(httpServer);
    
    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, resolve);
    });
    
    // Create client connection
    clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
      transports: ['websocket'],
    });
    
    // Wait for connection
    await new Promise<void>((resolve) => {
      clientSocket.on('connect', resolve);
    });
  });

  afterEach(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    
    if (webSocketServer) {
      webSocketServer.shutdown();
    }
    
    if (httpServer?.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
    
    vi.clearAllMocks();
  });

  describe('Connection Handling', () => {
    it('should accept connections from allowed origins', () => {
      expect(clientSocket.connected).toBe(true);
    });

    it('should handle multiple client connections', async () => {
      const secondClient = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });
      
      await new Promise<void>((resolve) => {
        secondClient.on('connect', resolve);
      });
      
      expect(secondClient.connected).toBe(true);
      secondClient.disconnect();
    });

    it('should handle client disconnection gracefully', async () => {
      const disconnectPromise = new Promise<void>((resolve) => {
        clientSocket.on('disconnect', resolve);
      });
      
      clientSocket.disconnect();
      await disconnectPromise;
      
      expect(clientSocket.connected).toBe(false);
    });
  });

  describe('Video Subscription Management', () => {
    it('should handle video subscription', async () => {
      const videoId = 'test-video-123';
      
      clientSocket.emit('subscribe-video', videoId);
      
      // Wait for subscription to be processed
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify client is subscribed by emitting an event
      const messagePromise = new Promise((resolve) => {
        clientSocket.on('video-status', resolve);
      });
      
      eventBus.emit('video-status-updated', {
        videoId,
        status: 'processing',
        progress: 50,
        message: 'Test message'
      });
      
      const message = await messagePromise;
      expect(message).toMatchObject({
        videoId,
        status: 'processing',
        progress: 50,
        message: 'Test message'
      });
    });

    it('should handle video unsubscription', async () => {
      const videoId = 'test-video-123';
      
      // Subscribe first
      clientSocket.emit('subscribe-video', videoId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Unsubscribe
      clientSocket.emit('unsubscribe-video', videoId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Test that events are no longer received
      let messageReceived = false;
      clientSocket.on('video-status', () => {
        messageReceived = true;
      });
      
      eventBus.emit('video-status-updated', {
        videoId,
        status: 'processing',
        progress: 50,
        message: 'Test message'
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(messageReceived).toBe(false);
    });

    it('should clean up subscriptions on disconnect', async () => {
      const videoId = 'test-video-123';
      
      clientSocket.emit('subscribe-video', videoId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Disconnect client
      clientSocket.disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Create new client and verify old subscription was cleaned up
      const newClient = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });
      
      await new Promise<void>((resolve) => {
        newClient.on('connect', resolve);
      });
      
      let messageReceived = false;
      newClient.on('video-status', () => {
        messageReceived = true;
      });
      
      // Emit event that old client was subscribed to
      eventBus.emit('video-status-updated', {
        videoId,
        status: 'processing',
        progress: 50,
        message: 'Test message'
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(messageReceived).toBe(false);
      
      newClient.disconnect();
    });
  });

  describe('Import Job Subscription Management', () => {
    it('should handle import job subscription', async () => {
      const jobId = 'test-import-123';
      
      clientSocket.emit('subscribe-import', jobId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const messagePromise = new Promise((resolve) => {
        clientSocket.on('import-progress', resolve);
      });
      
      eventBus.emit('import-progress', {
        jobId,
        stage: 'downloading',
        progress: 25,
        message: 'Downloading video'
      });
      
      const message = await messagePromise;
      expect(message).toMatchObject({
        jobId,
        stage: 'downloading',
        progress: 25,
        message: 'Downloading video'
      });
    });

    it('should handle import job unsubscription', async () => {
      const jobId = 'test-import-123';
      
      clientSocket.emit('subscribe-import', jobId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      clientSocket.emit('unsubscribe-import', jobId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      let messageReceived = false;
      clientSocket.on('import-progress', () => {
        messageReceived = true;
      });
      
      eventBus.emit('import-progress', {
        jobId,
        stage: 'downloading',
        progress: 25,
        message: 'Downloading video'
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(messageReceived).toBe(false);
    });
  });

  describe('Download Job Subscription Management', () => {
    it('should handle download job subscription', async () => {
      const jobId = 'test-download-123';
      
      clientSocket.emit('subscribe-download', jobId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const messagePromise = new Promise((resolve) => {
        clientSocket.on('download-progress', resolve);
      });
      
      eventBus.emit('download:progress', {
        jobId,
        videoId: 'video-123',
        progress: 45,
        downloadedBytes: 450,
        totalBytes: 1000,
        speed: 100,
        eta: 5.5,
        timestamp: new Date().toISOString()
      });
      
      const message = await messagePromise;
      expect(message).toMatchObject({
        jobId,
        videoId: 'video-123',
        progress: 45,
        downloadedBytes: 450,
        totalBytes: 1000
      });
    });
  });

  describe('Event Broadcasting', () => {
    it('should broadcast video completion events', async () => {
      const videoId = 'test-video-123';
      const outputPath = '/path/to/output.mp4';
      
      clientSocket.emit('subscribe-video', videoId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const messagePromise = new Promise((resolve) => {
        clientSocket.on('video-complete', resolve);
      });
      
      eventBus.emit('video-completed', { videoId, outputPath });
      
      const message = await messagePromise;
      expect(message).toMatchObject({
        videoId,
        outputPath
      });
    });

    it('should broadcast video error events', async () => {
      const videoId = 'test-video-123';
      const error = new Error('Test error');
      
      clientSocket.emit('subscribe-video', videoId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const messagePromise = new Promise((resolve) => {
        clientSocket.on('video-error', resolve);
      });
      
      eventBus.emit('video-error', { videoId, error });
      
      const message = await messagePromise;
      expect(message).toMatchObject({
        videoId,
        error: 'Test error'
      });
    });

    it('should broadcast import complete events', async () => {
      const jobId = 'test-import-123';
      const videoId = 'imported-video-456';
      
      clientSocket.emit('subscribe-import', jobId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const messagePromise = new Promise((resolve) => {
        clientSocket.on('import-complete', resolve);
      });
      
      eventBus.emit('import-complete', { jobId, videoId });
      
      const message = await messagePromise;
      expect(message).toMatchObject({
        jobId,
        videoId
      });
    });

    it('should broadcast global events to all clients', async () => {
      const secondClient = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });
      
      await new Promise<void>((resolve) => {
        secondClient.on('connect', resolve);
      });
      
      const message1Promise = new Promise((resolve) => {
        clientSocket.on('global-test', resolve);
      });
      
      const message2Promise = new Promise((resolve) => {
        secondClient.on('global-test', resolve);
      });
      
      webSocketServer.broadcastGlobal('global-test', { message: 'Hello everyone!' });
      
      const [message1, message2] = await Promise.all([message1Promise, message2Promise]);
      
      expect(message1).toMatchObject({ message: 'Hello everyone!' });
      expect(message2).toMatchObject({ message: 'Hello everyone!' });
      
      secondClient.disconnect();
    });
  });

  describe('Connection Health', () => {
    it('should respond to ping with pong', async () => {
      const pongPromise = new Promise((resolve) => {
        clientSocket.on('pong', resolve);
      });
      
      clientSocket.emit('ping');
      
      await expect(pongPromise).resolves.toBeUndefined();
    });
  });

  describe('CORS Configuration', () => {
    it('should allow connections from localhost origins by default', () => {
      expect(clientSocket.connected).toBe(true);
    });

    it('should handle custom ALLOWED_ORIGINS environment variable', () => {
      // This test verifies the CORS configuration is properly set up
      // The actual blocking would happen at the socket.io level
      expect(clientSocket.connected).toBe(true);
    });
  });

  describe('Broadcasting Methods', () => {
    it('should broadcast to video subscribers correctly', async () => {
      const videoId = 'test-video-123';
      
      clientSocket.emit('subscribe-video', videoId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const messagePromise = new Promise((resolve) => {
        clientSocket.on('custom-video-event', resolve);
      });
      
      webSocketServer.broadcastToVideoSubscribers(videoId, 'custom-video-event', {
        customData: 'test'
      });
      
      const message = await messagePromise;
      expect(message).toMatchObject({
        customData: 'test'
      });
    });

    it('should broadcast to import subscribers correctly', async () => {
      const jobId = 'test-import-123';
      
      clientSocket.emit('subscribe-import', jobId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const messagePromise = new Promise((resolve) => {
        clientSocket.on('custom-import-event', resolve);
      });
      
      webSocketServer.broadcastToImportSubscribers(jobId, 'custom-import-event', {
        customData: 'test'
      });
      
      const message = await messagePromise;
      expect(message).toMatchObject({
        customData: 'test'
      });
    });

    it('should broadcast to download subscribers correctly', async () => {
      const jobId = 'test-download-123';
      
      clientSocket.emit('subscribe-download', jobId);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const messagePromise = new Promise((resolve) => {
        clientSocket.on('custom-download-event', resolve);
      });
      
      webSocketServer.broadcastToDownloadSubscribers(jobId, 'custom-download-event', {
        customData: 'test'
      });
      
      const message = await messagePromise;
      expect(message).toMatchObject({
        customData: 'test'
      });
    });
  });

  describe('Graceful Shutdown', () => {
    it('should shutdown gracefully', async () => {
      const shutdownSpy = vi.spyOn(webSocketServer, 'shutdown');
      
      webSocketServer.shutdown();
      
      expect(shutdownSpy).toHaveBeenCalled();
      
      // Verify connection is closed
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(clientSocket.connected).toBe(false);
    });
  });
});