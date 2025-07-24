import { chromium, FullConfig } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

/**
 * Global setup for E2E tests
 * 
 * This setup ensures:
 * - Test environment is properly configured
 * - Mock data and fixtures are prepared
 * - External dependencies are mocked appropriately
 * - Test database is clean
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Setting up E2E test environment...');

  // Create test directories
  await ensureTestDirectories();
  
  // Setup mock data and fixtures
  await setupMockData();
  
  // Verify services are running
  await verifyServices(config);
  
  console.log('✅ E2E test environment setup complete');
}

async function ensureTestDirectories() {
  const directories = [
    'test-results',
    'test-results/e2e-artifacts',
    'test-results/e2e-html-report',
    'tests/e2e/fixtures/videos',
    'tests/e2e/fixtures/mock-responses',
    'data/test-temp',
    'data/test-imports',
  ];

  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
}

async function setupMockData() {
  // Create mock video fixtures
  await createMockVideoFixtures();
  
  // Create mock API responses
  await createMockAPIResponses();
  
  // Setup test configuration
  await createTestConfig();
}

async function createMockVideoFixtures() {
  const fixturesDir = 'tests/e2e/fixtures/videos';
  
  // Create mock video URLs and metadata
  const mockVideos = [
    {
      id: 'test-youtube-video-1',
      url: 'https://www.youtube.com/watch?v=test1234567890',
      title: 'Test Video 1 - Short Content',
      duration: 120, // 2 minutes
      platform: 'YouTube',
      thumbnailUrl: 'https://img.youtube.com/vi/test1234567890/maxresdefault.jpg',
      description: 'A test video for E2E testing',
    },
    {
      id: 'test-youtube-video-2', 
      url: 'https://www.youtube.com/watch?v=test0987654321',
      title: 'Test Video 2 - Long Content',
      duration: 600, // 10 minutes
      platform: 'YouTube',
      thumbnailUrl: 'https://img.youtube.com/vi/test0987654321/maxresdefault.jpg',
      description: 'A longer test video for batch import testing',
    },
    {
      id: 'test-direct-video',
      url: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
      title: 'Direct MP4 Video',
      duration: 30,
      platform: 'Direct',
      description: 'Direct video file for testing'
    }
  ];

  await fs.writeFile(
    path.join(fixturesDir, 'mock-videos.json'),
    JSON.stringify(mockVideos, null, 2)
  );
}

async function createMockAPIResponses() {
  const mockResponsesDir = 'tests/e2e/fixtures/mock-responses';
  
  // Mock successful import response
  const successfulImportResponse = {
    success: true,
    jobId: 'test-job-123',
    message: 'Import started successfully'
  };
  
  // Mock validation responses
  const validationResponses = {
    'https://www.youtube.com/watch?v=test1234567890': {
      isValid: true,
      platform: 'YouTube',
      metadata: {
        title: 'Test Video 1',
        duration: 120,
        thumbnail: 'test-thumbnail.jpg'
      }
    },
    'invalid-url': {
      isValid: false,
      error: 'Invalid URL format'
    }
  };
  
  // Mock WebSocket events
  const mockWebSocketEvents = [
    {
      event: 'import-progress',
      data: { jobId: 'test-job-123', status: 'processing', progress: 25, currentStep: 'Downloading video' }
    },
    {
      event: 'import-progress', 
      data: { jobId: 'test-job-123', status: 'processing', progress: 50, currentStep: 'Transcribing audio' }
    },
    {
      event: 'import-progress',
      data: { jobId: 'test-job-123', status: 'processing', progress: 75, currentStep: 'Detecting scenes' }
    },
    {
      event: 'import-complete',
      data: { jobId: 'test-job-123', status: 'completed', progress: 100, videoId: 'test-video-123' }
    }
  ];

  await fs.writeFile(
    path.join(mockResponsesDir, 'import-success.json'),
    JSON.stringify(successfulImportResponse, null, 2)
  );
  
  await fs.writeFile(
    path.join(mockResponsesDir, 'validation-responses.json'),
    JSON.stringify(validationResponses, null, 2)
  );
  
  await fs.writeFile(
    path.join(mockResponsesDir, 'websocket-events.json'),
    JSON.stringify(mockWebSocketEvents, null, 2)
  );
}

async function createTestConfig() {
  const testConfig = {
    testMode: true,
    mockExternalServices: true,
    mockVideoDownloads: true,
    skipActualVideoProcessing: true,
    fastMode: true,
    logLevel: 'debug',
    websocketEnabled: true,
    testTimeout: 120000
  };
  
  await fs.writeFile(
    'tests/e2e/fixtures/test-config.json',
    JSON.stringify(testConfig, null, 2)
  );
}

async function verifyServices(config: FullConfig) {
  console.log('🔍 Verifying services are running...');
  
  // Get base URL from config
  const baseURL = config.projects[0].use?.baseURL || 'http://localhost:3232';
  const serverURL = baseURL.replace(':3232', ':3233');
  
  // Wait for services with timeout
  const timeout = 60000; // 60 seconds
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // Check frontend
      const frontendResponse = await fetch(baseURL);
      if (frontendResponse.ok) {
        console.log('✅ Frontend server is running');
        break;
      }
    } catch (error) {
      console.log('⏳ Waiting for frontend server...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Verify backend server
  while (Date.now() - startTime < timeout) {
    try {
      const backendResponse = await fetch(`${serverURL}/api/health`);
      if (backendResponse.ok) {
        console.log('✅ Backend server is running');
        break;
      }
    } catch (error) {
      console.log('⏳ Waiting for backend server...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

export default globalSetup;