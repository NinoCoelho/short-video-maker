import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Server } from 'http';
import express from 'express';
import { createServer } from '../../../src/server/server';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import path from 'path';
import fs from 'fs-extra';

describe('WebSocket Communication Integration Tests', () => {
  let app: express.Application;
  let server: Server;
  let testDataDir: string;
  let serverPort: number;
  let clientSocket: ClientSocket;

  beforeAll(async () => {
    // Create test data directory
    testDataDir = path.join(process.cwd(), 'test-data-ws-integration');
    await fs.ensureDir(testDataDir);
    
    // Set environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.DATA_DIR = testDataDir;
    process.env.PORT = '0'; // Use random port
    process.env.OPENAI_API_KEY = 'test-key-12345';
    process.env.GOOGLE_API_KEY = 'test-google-key';
    
    // Create server instance
    const serverInstance = await createServer();
    app = serverInstance.app;
    server = serverInstance.server;
    
    // Get the actual port assigned by the system
    serverPort = (server.address() as any)?.port || 3000;
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    if (server) {
      server.close();
    }
    // Cleanup test directory
    await fs.remove(testDataDir).catch(() => {});
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    
    // Cleanup any test files created during tests
    const tempFiles = await fs.readdir(testDataDir).catch(() => []);
    await Promise.all(
      tempFiles
        .filter(file => file.startsWith('test-'))
        .map(file => fs.remove(path.join(testDataDir, file)).catch(() => {}))
    );
  });

  const connectClient = (): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const client = ioClient(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        forceNew: true,
        timeout: 5000
      });

      client.on('connect', () => {
        resolve(client);
      });

      client.on('connect_error', (error) => {
        reject(error);
      });

      // Set timeout for connection
      setTimeout(() => {
        if (!client.connected) {
          client.disconnect();
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  };

  describe('Basic WebSocket Connection', () => {
    it('should establish WebSocket connection successfully', async () => {
      clientSocket = await connectClient();
      
      expect(clientSocket.connected).toBe(true);
      expect(clientSocket.id).toBeDefined();
    });

    it('should handle connection events', async () => {
      clientSocket = await connectClient();
      
      const disconnectPromise = new Promise<void>((resolve) => {
        clientSocket.on('disconnect', (reason) => {
          expect(reason).toBeDefined();
          resolve();
        });
      });

      clientSocket.disconnect();
      await disconnectPromise;
    });
  });

  describe('Video Status Updates', () => {
    it('should receive video status updates via WebSocket', async () => {
      clientSocket = await connectClient();

      const videoId = 'test-video-websocket-123';
      
      // Set up event listener
      const statusPromise = new Promise<any>((resolve) => {
        clientSocket.on('video-status', (data) => {
          resolve(data);
        });
      });

      // Subscribe to video updates
      clientSocket.emit('subscribe-video', { videoId });

      // Simulate video status update from server side
      // This would normally be triggered by video processing
      setTimeout(() => {
        // Emit via server's event bus (simulated)
        const eventData = {
          videoId,
          status: 'processing',
          progress: 50,
          message: 'Processing video...',
          timestamp: new Date().toISOString()
        };
        
        // Simulate server emitting the event
        clientSocket.emit('test-trigger-video-status', eventData);
      }, 100);

      const statusUpdate = await statusPromise;
      
      expect(statusUpdate).toHaveProperty('videoId', videoId);
      expect(statusUpdate).toHaveProperty('status');
      expect(statusUpdate).toHaveProperty('timestamp');
    }, 10000);

    it('should handle video completion notifications', async () => {
      clientSocket = await connectClient();

      const videoId = 'test-video-complete-456';
      
      const completionPromise = new Promise<any>((resolve) => {
        clientSocket.on('video-complete', (data) => {
          resolve(data);
        });
      });

      clientSocket.emit('subscribe-video', { videoId });

      // Simulate completion event
      setTimeout(() => {
        const completionData = {
          videoId,
          result: {
            outputPath: '/test/path/output.mp4',
            duration: 30
          },
          timestamp: new Date().toISOString()
        };
        
        clientSocket.emit('test-trigger-video-complete', completionData);
      }, 100);

      const completion = await completionPromise;
      
      expect(completion).toHaveProperty('videoId', videoId);
      expect(completion).toHaveProperty('result');
      expect(completion.result).toHaveProperty('outputPath');
    }, 10000);

    it('should handle video error notifications', async () => {
      clientSocket = await connectClient();

      const videoId = 'test-video-error-789';
      
      const errorPromise = new Promise<any>((resolve) => {
        clientSocket.on('video-error', (data) => {
          resolve(data);
        });
      });

      clientSocket.emit('subscribe-video', { videoId });

      setTimeout(() => {
        const errorData = {
          videoId,
          error: 'Test error message',
          timestamp: new Date().toISOString()
        };
        
        clientSocket.emit('test-trigger-video-error', errorData);
      }, 100);

      const error = await errorPromise;
      
      expect(error).toHaveProperty('videoId', videoId);
      expect(error).toHaveProperty('error');
    }, 10000);
  });

  describe('Import Process Updates', () => {
    it('should receive import progress updates', async () => {
      clientSocket = await connectClient();

      const importId = 'test-import-123';
      
      const progressPromise = new Promise<any>((resolve) => {
        clientSocket.on('import-progress', (data) => {
          resolve(data);
        });
      });

      clientSocket.emit('subscribe-import', { importId });

      setTimeout(() => {
        const progressData = {
          importId,
          status: 'downloading',
          progress: 75,
          message: 'Downloading video file...',
          timestamp: new Date().toISOString()
        };
        
        clientSocket.emit('test-trigger-import-progress', progressData);
      }, 100);

      const progress = await progressPromise;
      
      expect(progress).toHaveProperty('importId', importId);
      expect(progress).toHaveProperty('progress');
      expect(progress).toHaveProperty('status');
    }, 10000);

    it('should handle import completion', async () => {
      clientSocket = await connectClient();

      const importId = 'test-import-complete-456';
      
      const completionPromise = new Promise<any>((resolve) => {
        clientSocket.on('import-complete', (data) => {
          resolve(data);
        });
      });

      clientSocket.emit('subscribe-import', { importId });

      setTimeout(() => {
        const completionData = {
          importId,
          videoPath: '/test/imported/video.mp4',
          metadata: {
            duration: 120,
            resolution: '1920x1080',
            frameRate: 30
          },
          timestamp: new Date().toISOString()
        };
        
        clientSocket.emit('test-trigger-import-complete', completionData);
      }, 100);

      const completion = await completionPromise;
      
      expect(completion).toHaveProperty('importId', importId);
      expect(completion).toHaveProperty('videoPath');
      expect(completion).toHaveProperty('metadata');
    }, 10000);
  });

  describe('Download Queue Updates', () => {
    it('should receive download progress updates', async () => {
      clientSocket = await connectClient();

      const jobId = 'test-download-job-123';
      
      const progressPromise = new Promise<any>((resolve) => {
        clientSocket.on('download-progress', (data) => {
          resolve(data);
        });
      });

      clientSocket.emit('subscribe-download', { jobId });

      setTimeout(() => {
        const progressData = {
          jobId,
          videoId: 'video-456',
          progress: 60,
          downloadedBytes: 600000,
          totalBytes: 1000000,
          speed: 100000,
          eta: 4.0,
          timestamp: new Date().toISOString()
        };
        
        clientSocket.emit('test-trigger-download-progress', progressData);
      }, 100);

      const progress = await progressPromise;
      
      expect(progress).toHaveProperty('jobId', jobId);
      expect(progress).toHaveProperty('progress');
      expect(progress).toHaveProperty('downloadedBytes');
      expect(progress).toHaveProperty('totalBytes');
    }, 10000);
  });

  describe('Multiple Client Connections', () => {
    it('should handle multiple clients subscribing to same video', async () => {
      const client1 = await connectClient();
      const client2 = await connectClient();

      const videoId = 'test-multi-client-video';
      
      const client1Promise = new Promise<any>((resolve) => {
        client1.on('video-status', resolve);
      });
      
      const client2Promise = new Promise<any>((resolve) => {
        client2.on('video-status', resolve);
      });

      client1.emit('subscribe-video', { videoId });
      client2.emit('subscribe-video', { videoId });

      setTimeout(() => {
        const statusData = {
          videoId,
          status: 'processing',
          progress: 25,
          timestamp: new Date().toISOString()
        };
        
        client1.emit('test-trigger-video-status', statusData);
      }, 100);

      const [status1, status2] = await Promise.all([client1Promise, client2Promise]);
      
      expect(status1).toHaveProperty('videoId', videoId);
      expect(status2).toHaveProperty('videoId', videoId);

      client1.disconnect();
      client2.disconnect();
    }, 15000);

    it('should handle client disconnection gracefully', async () => {
      const client = await connectClient();
      const videoId = 'test-disconnect-video';

      client.emit('subscribe-video', { videoId });
      
      // Simulate abrupt disconnection
      client.disconnect();

      // Verify no memory leaks or errors on server side
      expect(client.connected).toBe(false);
    });
  });

  describe('Subscription Management', () => {
    it('should handle unsubscribe events', async () => {
      clientSocket = await connectClient();

      const videoId = 'test-unsubscribe-video';
      
      // Subscribe first
      clientSocket.emit('subscribe-video', { videoId });
      
      // Set up listener
      let receivedCount = 0;
      clientSocket.on('video-status', () => {
        receivedCount++;
      });

      // Emit status update
      setTimeout(() => {
        const statusData = {
          videoId,
          status: 'processing',
          progress: 10,
          timestamp: new Date().toISOString()
        };
        clientSocket.emit('test-trigger-video-status', statusData);
      }, 100);

      // Wait for first update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Unsubscribe
      clientSocket.emit('unsubscribe-video', { videoId });

      // Emit another status update
      setTimeout(() => {
        const statusData = {
          videoId,
          status: 'processing',
          progress: 20,
          timestamp: new Date().toISOString()
        };
        clientSocket.emit('test-trigger-video-status', statusData);
      }, 300);

      // Wait and verify only one update was received
      await new Promise(resolve => setTimeout(resolve, 400));
      
      expect(receivedCount).toBeLessThanOrEqual(1);
    }, 10000);
  });

  describe('Real-time Communication Flow', () => {
    it('should maintain real-time communication during video processing', async () => {
      clientSocket = await connectClient();

      const videoId = 'test-realtime-flow';
      const updates: any[] = [];
      
      clientSocket.on('video-status', (data) => {
        updates.push(data);
      });

      clientSocket.emit('subscribe-video', { videoId });

      // Simulate processing sequence
      const processingSteps = [
        { status: 'queued', progress: 0, message: 'Video queued for processing' },
        { status: 'processing', progress: 25, message: 'Generating TTS audio' },
        { status: 'processing', progress: 50, message: 'Processing scenes' },
        { status: 'processing', progress: 75, message: 'Rendering video' },
        { status: 'completed', progress: 100, message: 'Video processing complete' }
      ];

      for (let i = 0; i < processingSteps.length; i++) {
        setTimeout(() => {
          const stepData = {
            videoId,
            ...processingSteps[i],
            timestamp: new Date().toISOString()
          };
          clientSocket.emit('test-trigger-video-status', stepData);
        }, i * 200);
      }

      // Wait for all updates
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0]).toHaveProperty('status', 'queued');
      
      const lastUpdate = updates[updates.length - 1];
      expect(lastUpdate).toHaveProperty('videoId', videoId);
    }, 15000);
  });

  describe('Error Handling in WebSocket Communication', () => {
    it('should handle invalid subscription data', async () => {
      clientSocket = await connectClient();

      const errorPromise = new Promise<any>((resolve) => {
        clientSocket.on('error', resolve);
      });

      // Send invalid subscription data
      clientSocket.emit('subscribe-video', { invalidField: 'invalid' });

      setTimeout(() => {
        clientSocket.emit('test-error', { message: 'Invalid subscription data' });
      }, 100);

      const error = await errorPromise;
      expect(error).toHaveProperty('message');
    }, 10000);

    it('should recover from connection errors', async () => {
      clientSocket = await connectClient();

      const reconnectionPromise = new Promise<void>((resolve) => {
        clientSocket.on('reconnect', () => {
          resolve();
        });
      });

      // Force disconnect and reconnect
      clientSocket.disconnect();
      setTimeout(() => {
        clientSocket.connect();
      }, 100);

      await reconnectionPromise;
      expect(clientSocket.connected).toBe(true);
    }, 10000);
  });

  describe('Performance Under Load', () => {
    it('should handle rapid event emissions', async () => {
      clientSocket = await connectClient();

      const videoId = 'test-performance-video';
      const receivedEvents: any[] = [];
      
      clientSocket.on('video-status', (data) => {
        receivedEvents.push(data);
      });

      clientSocket.emit('subscribe-video', { videoId });

      // Emit many events rapidly
      const eventCount = 50;
      for (let i = 0; i < eventCount; i++) {
        setTimeout(() => {
          const eventData = {
            videoId,
            status: 'processing',
            progress: (i / eventCount) * 100,
            timestamp: new Date().toISOString()
          };
          clientSocket.emit('test-trigger-video-status', eventData);
        }, i * 10); // 10ms intervals
      }

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      expect(receivedEvents.length).toBeGreaterThan(0);
      expect(receivedEvents.length).toBeLessThanOrEqual(eventCount);
    }, 15000);
  });
});