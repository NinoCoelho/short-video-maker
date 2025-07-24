import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Server } from 'http';
import express from 'express';
import { createServer } from '../../../src/server/server';
import fs from 'fs-extra';
import path from 'path';

describe('API Integration Tests', () => {
  let app: express.Application;
  let server: Server;
  let testDataDir: string;

  beforeAll(async () => {
    // Create test data directory
    testDataDir = path.join(process.cwd(), 'test-data-api-integration');
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
  });

  afterAll(async () => {
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
    // Cleanup any test files created during tests
    const tempFiles = await fs.readdir(testDataDir).catch(() => []);
    await Promise.all(
      tempFiles
        .filter(file => file.startsWith('test-'))
        .map(file => fs.remove(path.join(testDataDir, file)).catch(() => {}))
    );
  });

  describe('Video Creation Workflow Integration', () => {
    it('should handle complete video creation workflow via API', async () => {
      const videoData = {
        title: 'Integration Test Video',
        description: 'Test video for API integration',
        scenes: [
          {
            text: 'This is a test scene for integration testing',
            duration: 3,
            backgroundVideo: null,
            ttsAudio: null
          }
        ],
        format: 'vertical'
      };

      // Step 1: Submit video creation request
      const createResponse = await request(app)
        .post('/api/render')
        .send(videoData)
        .expect(200);

      expect(createResponse.body).toHaveProperty('videoId');
      expect(createResponse.body.status).toBe('queued');
      
      const videoId = createResponse.body.videoId;

      // Step 2: Check initial status
      const statusResponse = await request(app)
        .get(`/api/status/${videoId}`)
        .expect(200);

      expect(statusResponse.body).toHaveProperty('videoId', videoId);
      expect(['queued', 'processing']).toContain(statusResponse.body.status);

      // Step 3: Wait briefly and check status again
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const statusResponse2 = await request(app)
        .get(`/api/status/${videoId}`)
        .expect(200);

      expect(statusResponse2.body).toHaveProperty('videoId', videoId);
    });

    it('should handle video replacement workflow', async () => {
      const videoId = 'test-video-123';
      
      // Mock video exists in system
      const videoPath = path.join(testDataDir, 'videos', `${videoId}.mp4`);
      await fs.ensureDir(path.dirname(videoPath));
      await fs.writeFile(videoPath, Buffer.from('fake video content'));

      const replacementData = {
        sceneIndex: 0,
        videoQuery: 'nature landscape'
      };

      const response = await request(app)
        .post(`/api/replace-scene-video`)
        .send({
          videoId,
          ...replacementData
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('TTS Integration Workflow', () => {
    it('should handle TTS generation and caching', async () => {
      const ttsData = {
        text: 'This is a test for TTS integration',
        voice: 'en-US-Standard-A',
        provider: 'google'
      };

      // Step 1: Generate TTS audio
      const ttsResponse = await request(app)
        .post('/api/generate-tts')
        .send(ttsData)
        .expect(200);

      expect(ttsResponse.body).toHaveProperty('audioPath');
      expect(ttsResponse.body).toHaveProperty('duration');

      const audioPath = ttsResponse.body.audioPath;

      // Step 2: Verify audio file can be accessed
      const audioResponse = await request(app)
        .get(audioPath.replace(testDataDir, ''))
        .expect(200);

      expect(audioResponse.headers['content-type']).toMatch(/audio/);
    });
  });

  describe('Background Video Search Integration', () => {
    it('should integrate with external video providers', async () => {
      const searchQuery = {
        query: 'ocean waves',
        format: 'vertical',
        duration: 5
      };

      const response = await request(app)
        .post('/api/search-background-videos')
        .send(searchQuery)
        .expect(200);

      expect(response.body).toHaveProperty('videos');
      expect(Array.isArray(response.body.videos)).toBe(true);
      
      if (response.body.videos.length > 0) {
        const video = response.body.videos[0];
        expect(video).toHaveProperty('id');
        expect(video).toHaveProperty('url');
        expect(video).toHaveProperty('thumbnail');
      }
    });
  });

  describe('Cache System Integration', () => {
    it('should handle cache operations correctly', async () => {
      // Get initial cache stats
      const initialStats = await request(app)
        .get('/api/cache/stats')
        .expect(200);

      expect(initialStats.body).toHaveProperty('video');
      expect(initialStats.body).toHaveProperty('audio');

      // Clear cache
      const clearResponse = await request(app)
        .post('/api/cache/clear')
        .send({ type: 'all' })
        .expect(200);

      expect(clearResponse.body).toHaveProperty('success', true);
      expect(clearResponse.body).toHaveProperty('message');
    });

    it('should track cache usage across requests', async () => {
      // Make several TTS requests to populate cache
      const ttsRequests = [
        { text: 'Cache test 1', voice: 'en-US-Standard-A', provider: 'google' },
        { text: 'Cache test 2', voice: 'en-US-Standard-A', provider: 'google' },
        { text: 'Cache test 3', voice: 'en-US-Standard-A', provider: 'google' }
      ];

      for (const ttsData of ttsRequests) {
        await request(app)
          .post('/api/generate-tts')
          .send(ttsData);
      }

      // Check cache stats
      const stats = await request(app)
        .get('/api/cache/stats')
        .expect(200);

      expect(stats.body.audio).toHaveProperty('size');
      expect(stats.body.audio).toHaveProperty('count');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid video ID gracefully', async () => {
      const response = await request(app)
        .get('/api/status/invalid-video-id-that-does-not-exist')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/not found/i);
    });

    it('should handle malformed requests properly', async () => {
      const response = await request(app)
        .post('/api/render')
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing API keys for external services', async () => {
      // Temporarily remove API key
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const response = await request(app)
        .post('/api/generate-tts')
        .send({
          text: 'Test text',
          provider: 'openai',
          voice: 'alloy'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/api key/i);

      // Restore API key
      process.env.OPENAI_API_KEY = originalKey;
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should enforce rate limits on endpoints', async () => {
      const requests = [];
      const maxRequests = 15; // Exceed the typical rate limit

      // Make many requests rapidly
      for (let i = 0; i < maxRequests; i++) {
        requests.push(
          request(app)
            .get('/api/cache/stats')
        );
      }

      const responses = await Promise.all(requests);
      
      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('File Upload Integration', () => {
    it('should handle file upload workflow', async () => {
      // Create a test file
      const testFile = Buffer.from('test file content');
      
      const response = await request(app)
        .post('/api/upload')
        .attach('file', testFile, 'test.txt')
        .expect(200);

      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('path');
      expect(response.body).toHaveProperty('size');
    });

    it('should reject oversized files', async () => {
      // Create a large test file (larger than 50MB limit)
      const largeFile = Buffer.alloc(51 * 1024 * 1024, 'x'); // 51MB
      
      const response = await request(app)
        .post('/api/upload')
        .attach('file', largeFile, 'large-test.txt')
        .expect(413);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/file too large/i);
    });
  });

  describe('MCP Integration', () => {
    it('should serve MCP SSE endpoint', async () => {
      const response = await request(app)
        .get('/mcp/sse')
        .set('Accept', 'text/event-stream')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
      expect(response.headers['cache-control']).toBe('no-cache');
    });

    it('should respond to MCP health check', async () => {
      const response = await request(app)
        .get('/mcp/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('tools');
      expect(Array.isArray(response.body.tools)).toBe(true);
    });
  });

  describe('Static File Serving', () => {
    it('should serve temporary files securely', async () => {
      // Create a test file in temp directory
      const tempDir = path.join(testDataDir, 'temp');
      await fs.ensureDir(tempDir);
      
      const testContent = 'temporary test content';
      const testFile = 'test-temp-file.txt';
      await fs.writeFile(path.join(tempDir, testFile), testContent);

      const response = await request(app)
        .get(`/temp/${testFile}`)
        .expect(200);

      expect(response.text).toBe(testContent);
    });

    it('should prevent path traversal attacks', async () => {
      const response = await request(app)
        .get('/temp/../../../etc/passwd')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/invalid/i);
    });
  });

  describe('CORS Integration', () => {
    it('should handle CORS for allowed origins', async () => {
      const response = await request(app)
        .get('/api/cache/stats')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});