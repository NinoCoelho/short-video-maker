# Testing Guide - Video Import Feature

This guide covers the testing strategy, tools, and best practices for the video import feature. We use a comprehensive testing approach with multiple test types to ensure reliability and maintainability.

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Test Types](#test-types)
3. [Testing Tools](#testing-tools)
4. [Writing Tests](#writing-tests)
5. [Running Tests](#running-tests)
6. [Test Environment Setup](#test-environment-setup)
7. [Mocking and Stubbing](#mocking-and-stubbing)
8. [Performance Testing](#performance-testing)
9. [E2E Testing](#e2e-testing)
10. [CI/CD Integration](#ci-cd-integration)

## Testing Strategy

### Test Pyramid

We follow the testing pyramid approach:

```
       /\
      /  \     E2E Tests (Few)
     /____\    - Complete user workflows
    /      \   - Real browser testing
   /        \  - System integration
  /__________\ 
 /            \ Integration Tests (Some)
/              \ - Service integration
\______________/  - Database operations
 \            /   - External API mocking
  \          /
   \________/     Unit Tests (Many)
    \      /      - Individual functions
     \____/       - Service methods
      \  /        - Component logic
       \/         - Edge cases
```

### Testing Principles

1. **Fast Feedback**: Unit tests run quickly and provide immediate feedback
2. **Isolation**: Each test is independent and doesn't affect others
3. **Deterministic**: Tests produce consistent results across environments
4. **Comprehensive**: Critical paths have multiple levels of testing
5. **Maintainable**: Tests are easy to understand and update

## Test Types

### 1. Unit Tests

Test individual functions, methods, and components in isolation.

**Coverage**: 80%+ for all service classes and utilities
**Location**: `src/**/*.test.ts`
**Purpose**: Verify business logic, error handling, and edge cases

```typescript
// Example: VideoImportService unit test
describe('VideoImportService', () => {
  it('should detect YouTube platform correctly', () => {
    const service = new VideoImportService();
    const url = 'https://www.youtube.com/watch?v=abc123';
    
    expect(service.detectPlatform(url)).toBe(VideoSourceType.YOUTUBE);
  });

  it('should throw error for invalid URL', async () => {
    const service = new VideoImportService();
    
    await expect(service.downloadVideo('invalid-url'))
      .rejects.toThrow('Invalid URL format');
  });
});
```

### 2. Integration Tests

Test interactions between services and external dependencies.

**Coverage**: Critical service interactions
**Location**: `src/**/*.integration.test.ts`
**Purpose**: Verify service cooperation and data flow

```typescript
// Example: Import pipeline integration test
describe('ImportPipeline Integration', () => {
  it('should complete full import workflow', async () => {
    const pipeline = new ImportPipelineService();
    
    const job = await pipeline.createImportJob({
      source: VideoSourceType.YOUTUBE,
      url: testVideoUrl,
      config: { transcribe: true, analyze: true }
    });
    
    await pipeline.processImportJob(job.id);
    
    const completedJob = await pipeline.getImportJob(job.id);
    expect(completedJob.status).toBe(ImportJobStatus.COMPLETED);
    expect(completedJob.analysis).toBeDefined();
  });
});
```

### 3. Component Tests (React)

Test React components with user interactions.

**Coverage**: All UI components
**Location**: `src/ui/**/*.test.tsx`
**Purpose**: Verify component behavior and user interactions

```typescript
// Example: VideoImporter component test
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VideoImporter } from './VideoImporter';

describe('VideoImporter', () => {
  it('should submit import request on form submission', async () => {
    const mockOnSubmit = vi.fn();
    
    render(<VideoImporter onSubmit={mockOnSubmit} />);
    
    const urlInput = screen.getByLabelText('Video URL');
    const submitButton = screen.getByText('Import Video');
    
    fireEvent.change(urlInput, { 
      target: { value: 'https://youtube.com/watch?v=test' } 
    });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        url: 'https://youtube.com/watch?v=test',
        source: 'youtube'
      });
    });
  });
});
```

### 4. API Tests

Test REST endpoints and WebSocket connections.

**Coverage**: All API endpoints
**Location**: `tests/api/*.test.ts`
**Purpose**: Verify API contracts and error handling

```typescript
// Example: Import API test
describe('Import API', () => {
  it('POST /api/import should create import job', async () => {
    const response = await request(app)
      .post('/api/import')
      .send({
        source: 'youtube',
        url: 'https://youtube.com/watch?v=test',
        config: { transcribe: true }
      })
      .expect(201);
    
    expect(response.body).toHaveProperty('jobId');
    expect(response.body.status).toBe('queued');
  });

  it('should return 400 for invalid URL', async () => {
    await request(app)
      .post('/api/import')
      .send({ source: 'youtube', url: 'invalid-url' })
      .expect(400);
  });
});
```

### 5. E2E Tests

Test complete user workflows in a real browser environment.

**Coverage**: Critical user journeys
**Location**: `tests/e2e/*.spec.ts`
**Purpose**: Verify end-to-end functionality

```typescript
// Example: E2E import workflow test
import { test, expect } from '@playwright/test';

test('complete video import workflow', async ({ page }) => {
  await page.goto('/video-importer');
  
  // Fill in video URL
  await page.fill('[data-testid="video-url-input"]', testVideoUrl);
  
  // Configure import settings
  await page.check('[data-testid="transcribe-checkbox"]');
  await page.check('[data-testid="analyze-checkbox"]');
  
  // Start import
  await page.click('[data-testid="start-import-button"]');
  
  // Wait for completion
  await expect(page.locator('[data-testid="import-status"]'))
    .toHaveText('Import completed', { timeout: 60000 });
  
  // Verify results
  await expect(page.locator('[data-testid="suggested-clips"]'))
    .toBeVisible();
});
```

## Testing Tools

### Primary Testing Stack

```json
{
  "devDependencies": {
    "vitest": "^1.0.0",           // Test runner
    "@testing-library/react": "^13.4.0",  // React testing
    "@testing-library/jest-dom": "^6.0.0", // DOM matchers
    "@testing-library/user-event": "^14.4.0", // User interactions
    "playwright": "^1.40.0",      // E2E testing
    "supertest": "^6.3.0",        // API testing
    "msw": "^2.0.0",              // API mocking
    "@vitest/coverage-c8": "^0.33.0" // Coverage reporting
  }
}
```

### Configuration

#### Vitest Config (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  }
});
```

#### Test Setup (`tests/setup.ts`)

```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { server } from './mocks/server';

// Mock console methods to reduce noise
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock environment variables
vi.mock('../src/config', () => ({
  config: {
    ollama: { baseUrl: 'http://localhost:11434' },
    openai: { apiKey: 'test-key' },
    // ... other test config
  }
}));

// Setup MSW
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock external dependencies
vi.mock('yt-dlp-exec', () => ({
  default: vi.fn(() => Promise.resolve({
    title: 'Test Video',
    duration: 120,
    formats: []
  }))
}));

vi.mock('fluent-ffmpeg', () => ({
  default: vi.fn(() => ({
    input: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    run: vi.fn((callback) => callback())
  }))
}));
```

## Writing Tests

### Test Structure

Follow the **Arrange, Act, Assert** pattern:

```typescript
describe('ServiceClass', () => {
  describe('methodName', () => {
    it('should do something when condition is met', async () => {
      // Arrange - Setup test data and mocks
      const service = new ServiceClass();
      const testData = { prop: 'value' };
      const mockDependency = vi.fn().mockResolvedValue('result');
      
      // Act - Execute the code under test
      const result = await service.methodName(testData);
      
      // Assert - Verify the results
      expect(result).toBe('expected');
      expect(mockDependency).toHaveBeenCalledWith(testData);
    });
  });
});
```

### Test Naming Conventions

Use descriptive test names that explain the scenario:

```typescript
// ✅ Good - Clear and descriptive
it('should return cached video when URL exists in cache')
it('should throw ValidationError when URL format is invalid')
it('should emit progress events during video download')
it('should retry failed downloads up to 3 times')

// ❌ Bad - Vague or unclear
it('should work')
it('test download')
it('handles errors')
```

### Testing Async Operations

Handle promises and async operations properly:

```typescript
// ✅ Good - Proper async testing
it('should complete video download', async () => {
  const service = new VideoImportService();
  
  const result = await service.downloadVideo(testUrl);
  
  expect(result.status).toBe('completed');
});

// ✅ Good - Testing promise rejection
it('should reject with error for invalid URL', async () => {
  const service = new VideoImportService();
  
  await expect(service.downloadVideo('invalid'))
    .rejects.toThrow('Invalid URL');
});

// ✅ Good - Testing with timeout
it('should timeout long operations', async () => {
  const service = new VideoImportService();
  
  await expect(service.downloadVideo(testUrl))
    .rejects.toThrow('Timeout');
}, 10000);
```

### Testing Event Emitters

Test event-driven code properly:

```typescript
it('should emit progress events during processing', (done) => {
  const service = new VideoImportService();
  let progressEventCount = 0;
  
  service.on('progress', (event) => {
    progressEventCount++;
    expect(event.progress).toBeGreaterThan(0);
    
    if (event.progress === 100) {
      expect(progressEventCount).toBeGreaterThan(1);
      done();
    }
  });
  
  service.downloadVideo(testUrl);
});

// Or using promises
it('should emit completion event', async () => {
  const service = new VideoImportService();
  
  const completionPromise = new Promise((resolve) => {
    service.on('complete', resolve);
  });
  
  service.downloadVideo(testUrl);
  
  const result = await completionPromise;
  expect(result).toBeDefined();
});
```

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test VideoImportService.test.ts

# Run tests matching pattern
npm test -- --grep "download"

# Run tests with coverage
npm run test:coverage
```

### Advanced Test Running

```bash
# Run tests in specific directory
npm test src/services

# Run tests with custom reporter
npm test -- --reporter=verbose

# Run tests with debugging
npm test -- --inspect-brk

# Run tests in parallel
npm test -- --parallel

# Run tests with custom timeout
npm test -- --timeout=60000
```

### Continuous Testing

Set up continuous testing during development:

```bash
# Watch mode with coverage
npm run test:watch -- --coverage

# Watch specific files
npm run test:watch src/services/VideoImportService.test.ts

# Run tests on file changes
npm run test:watch -- --changed
```

## Test Environment Setup

### Mock External Services

Use MSW (Mock Service Worker) to mock external APIs:

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Mock YouTube API
  http.get('https://www.googleapis.com/youtube/v3/videos', () => {
    return HttpResponse.json({
      items: [{
        id: 'test123',
        snippet: {
          title: 'Test Video',
          description: 'Test Description'
        }
      }]
    });
  }),

  // Mock Ollama API
  http.post('http://localhost:11434/api/generate', () => {
    return HttpResponse.json({
      response: 'This is a test video about technology.',
      done: true
    });
  }),

  // Mock file downloads
  http.get('https://example.com/video.mp4', () => {
    return new HttpResponse(new ArrayBuffer(1024), {
      headers: { 'Content-Type': 'video/mp4' }
    });
  })
];
```

### Database Testing

For tests that require database operations:

```typescript
// tests/helpers/database.ts
import { createConnection } from 'typeorm';

export const setupTestDatabase = async () => {
  const connection = await createConnection({
    type: 'sqlite',
    database: ':memory:',
    entities: [/* your entities */],
    synchronize: true
  });
  
  return connection;
};

export const cleanupTestDatabase = async (connection) => {
  await connection.close();
};

// In test file
describe('DatabaseService', () => {
  let connection;

  beforeAll(async () => {
    connection = await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase(connection);
  });

  beforeEach(async () => {
    // Clear tables before each test
    await connection.synchronize(true);
  });
});
```

### File System Testing

Test file operations with temporary directories:

```typescript
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('FileService', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('should save file to directory', async () => {
    const service = new FileService(tempDir);
    const content = Buffer.from('test content');
    
    const filePath = await service.saveFile('test.txt', content);
    
    expect(filePath).toContain(tempDir);
    expect(await fs.readFile(filePath, 'utf8')).toBe('test content');
  });
});
```

## Mocking and Stubbing

### Service Mocking

Mock dependencies to isolate units under test:

```typescript
// Create mock implementations
const mockDownloaderManager = {
  download: vi.fn(),
  getMetadata: vi.fn(),
  canHandle: vi.fn()
} as jest.Mocked<DownloaderManager>;

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
} as jest.Mocked<EventBus>;

// Use mocks in tests
describe('ImportPipelineService', () => {
  let service: ImportPipelineService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ImportPipelineService(
      mockDownloaderManager,
      mockEventBus
    );
  });

  it('should delegate download to manager', async () => {
    const url = 'https://example.com/video';
    const expectedResult = { filePath: '/path/to/video.mp4' };
    
    mockDownloaderManager.download.mockResolvedValue(expectedResult);

    const result = await service.downloadVideo(url);

    expect(mockDownloaderManager.download).toHaveBeenCalledWith(url);
    expect(result).toBe(expectedResult);
  });
});
```

### Partial Mocking

Mock only specific methods while keeping others:

```typescript
import * as VideoImportService from '../VideoImportService';

// Mock specific methods
vi.spyOn(VideoImportService, 'detectPlatform')
  .mockReturnValue(VideoSourceType.YOUTUBE);

// Keep original implementation for other methods
const service = new VideoImportService.VideoImportService();

// Original method works normally
await service.validateUrl(url);

// Mocked method returns mock value
const platform = service.detectPlatform(url); // Returns YOUTUBE
```

### Time-based Testing

Mock timers for time-dependent code:

```typescript
describe('RetryService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should retry after delay', async () => {
    const mockOperation = vi.fn()
      .mockRejectedValueOnce(new Error('First attempt'))
      .mockResolvedValueOnce('Success');

    const retryService = new RetryService();
    const promise = retryService.retry(mockOperation, { delay: 1000 });

    // Fast-forward time
    vi.advanceTimersByTime(1000);

    const result = await promise;
    expect(result).toBe('Success');
    expect(mockOperation).toHaveBeenCalledTimes(2);
  });
});
```

## Performance Testing

### Load Testing

Test service performance under load:

```typescript
describe('VideoImportService Performance', () => {
  it('should handle concurrent downloads efficiently', async () => {
    const service = new VideoImportService();
    const urls = Array.from({ length: 10 }, (_, i) => 
      `https://example.com/video${i}.mp4`
    );

    const startTime = Date.now();
    
    const downloads = urls.map(url => service.downloadVideo(url));
    const results = await Promise.all(downloads);
    
    const duration = Date.now() - startTime;
    
    expect(results).toHaveLength(10);
    expect(duration).toBeLessThan(30000); // 30 seconds max
    
    // Check all downloads succeeded
    results.forEach(result => {
      expect(result.status).toBe('completed');
    });
  });

  it('should not exceed memory limits', async () => {
    const service = new VideoImportService();
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Process multiple large files
    for (let i = 0; i < 5; i++) {
      await service.downloadVideo(`https://example.com/large-video${i}.mp4`);
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be reasonable (< 100MB)
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
  });
});
```

### Benchmark Testing

Create benchmarks for critical operations:

```typescript
// tests/benchmarks/import-performance.test.ts
import { performance } from 'perf_hooks';

describe('Import Performance Benchmarks', () => {
  const benchmark = async (operation: () => Promise<any>, name: string) => {
    const iterations = 100;
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const end = performance.now();
      times.push(end - start);
    }
    
    const average = times.reduce((a, b) => a + b) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    console.log(`${name} Benchmark Results:`);
    console.log(`  Average: ${average.toFixed(2)}ms`);
    console.log(`  Min: ${min.toFixed(2)}ms`);
    console.log(`  Max: ${max.toFixed(2)}ms`);
    
    return { average, min, max };
  };

  it('should benchmark URL validation', async () => {
    const service = new VideoImportService();
    
    const results = await benchmark(
      () => service.validateUrl('https://youtube.com/watch?v=test'),
      'URL Validation'
    );
    
    expect(results.average).toBeLessThan(5); // Should be under 5ms
  });
});
```

## E2E Testing

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3232',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    port: 3232,
    reuseExistingServer: !process.env.CI,
  },
});
```

### E2E Test Examples

```typescript
// tests/e2e/video-import.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Video Import Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/video-importer');
  });

  test('should import YouTube video successfully', async ({ page }) => {
    // Fill in video URL
    await page.fill('[data-testid="url-input"]', 
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    
    // Configure import settings
    await page.check('[data-testid="transcribe-option"]');
    await page.check('[data-testid="analyze-option"]');
    
    // Start import
    await page.click('[data-testid="start-import"]');
    
    // Wait for processing to complete
    await expect(page.locator('[data-testid="import-status"]'))
      .toContainText('Import completed', { timeout: 60000 });
    
    // Verify results are displayed
    await expect(page.locator('[data-testid="video-metadata"]'))
      .toBeVisible();
    await expect(page.locator('[data-testid="transcript-viewer"]'))
      .toBeVisible();
    await expect(page.locator('[data-testid="suggested-clips"]'))
      .toBeVisible();
  });

  test('should show error for invalid URL', async ({ page }) => {
    await page.fill('[data-testid="url-input"]', 'invalid-url');
    await page.click('[data-testid="start-import"]');
    
    await expect(page.locator('[data-testid="error-message"]'))
      .toContainText('Invalid URL format');
  });

  test('should show progress during import', async ({ page }) => {
    await page.fill('[data-testid="url-input"]', testVideoUrl);
    await page.click('[data-testid="start-import"]');
    
    // Check progress indicators appear
    await expect(page.locator('[data-testid="progress-bar"]'))
      .toBeVisible();
    await expect(page.locator('[data-testid="current-step"]'))
      .toContainText('Downloading video...');
  });
});
```

## CI/CD Integration

### GitHub Actions Configuration

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run type checking
      run: npm run type-check

    - name: Run linting
      run: npm run lint

    - name: Run unit tests
      run: npm run test:coverage

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/coverage-final.json

    - name: Run integration tests
      run: npm run test:integration
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

  e2e:
    runs-on: ubuntu-latest
    needs: test
    
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Install Playwright browsers
      run: npx playwright install --with-deps

    - name: Run E2E tests
      run: npm run test:e2e

    - name: Upload Playwright report
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
```

### Quality Gates

Set up quality gates to prevent merging failing tests:

```yaml
# .github/workflows/quality-gate.yml
name: Quality Gate

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3

    - name: Install dependencies
      run: npm ci

    - name: Check test coverage
      run: |
        npm run test:coverage
        npm run coverage:check-threshold

    - name: Performance tests
      run: npm run test:performance

    - name: Security audit
      run: npm audit --audit-level=high

    - name: Bundle size check
      run: npm run build:analyze
```

This comprehensive testing guide provides the foundation for maintaining high code quality and reliability in the video import feature. Regular testing ensures the system remains robust as it evolves and scales.