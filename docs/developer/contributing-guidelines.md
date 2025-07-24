# Contributing Guidelines - Video Import Feature

Welcome to the video import feature development! This guide outlines the standards, processes, and best practices for contributing to the codebase.

## Table of Contents

1. [Code Standards](#code-standards)
2. [Development Workflow](#development-workflow)
3. [Testing Requirements](#testing-requirements)
4. [Documentation Standards](#documentation-standards)
5. [Pull Request Process](#pull-request-process)
6. [Code Review Guidelines](#code-review-guidelines)
7. [Performance Standards](#performance-standards)
8. [Security Guidelines](#security-guidelines)

## Code Standards

### TypeScript Guidelines

We use strict TypeScript with comprehensive type checking:

```typescript
// ✅ Good - Explicit types and interfaces
interface VideoImportRequest {
  source: VideoSourceType;
  url?: string;
  config: ImportPipelineConfig;
}

class VideoImportService {
  async downloadVideo(url: string, options: DownloadOptions): Promise<DownloadResult> {
    // Implementation with proper error handling
    try {
      const result = await this.performDownload(url, options);
      return result;
    } catch (error) {
      this.handleError('downloadVideo', error);
      throw error;
    }
  }
}

// ❌ Bad - Any types and missing error handling
class BadService {
  async download(url: any): Promise<any> {
    return await someFunction(url);
  }
}
```

### Naming Conventions

Follow consistent naming patterns throughout the codebase:

```typescript
// Classes: PascalCase
class VideoImportService {}
class TranscriptionProvider {}

// Interfaces: PascalCase with descriptive names
interface ImportJob {}
interface DownloadOptions {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_CONCURRENT_DOWNLOADS = 3;
const DEFAULT_RETRY_DELAY = 5000;

// Functions and variables: camelCase
const videoImportService = new VideoImportService();
const processImportJob = async (jobId: string) => {};

// File names: kebab-case
// video-import-service.ts
// transcription-provider.ts
```

### Error Handling Patterns

Implement consistent error handling across all services:

```typescript
// ✅ Good - Comprehensive error handling
class ServiceWithErrorHandling {
  private async performOperation(param: string): Promise<Result> {
    try {
      // Validate input
      if (!param || param.trim().length === 0) {
        throw new ValidationError('Parameter cannot be empty');
      }

      // Perform operation
      const result = await this.executeOperation(param);
      
      // Log success
      logger.info('Operation completed successfully', {
        operation: 'performOperation',
        param,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      // Log error with context
      logger.error('Operation failed', {
        operation: 'performOperation',
        param,
        error: error.message,
        stack: error.stack
      });

      // Emit error event for real-time updates
      eventBus.emitVideoError({
        videoId: this.currentVideoId,
        error: `Operation failed: ${error.message}`,
        timestamp: new Date().toISOString()
      });

      // Re-throw with additional context
      throw new ServiceError(
        `Failed to perform operation: ${error.message}`,
        { originalError: error, param }
      );
    }
  }
}
```

### Async/Await Best Practices

Always use async/await over promises and handle errors properly:

```typescript
// ✅ Good
async function processVideo(videoId: string): Promise<ProcessingResult> {
  try {
    const video = await videoService.getVideo(videoId);
    const transcript = await transcriptionService.transcribe(video.audioPath);
    const analysis = await aiService.analyze(transcript);
    
    return {
      video,
      transcript,
      analysis,
      processedAt: new Date()
    };
  } catch (error) {
    logger.error('Video processing failed', { videoId, error });
    throw error;
  }
}

// ❌ Bad - Mixed promise/async patterns
function badProcessVideo(videoId: string) {
  return videoService.getVideo(videoId)
    .then(video => {
      return transcriptionService.transcribe(video.audioPath);
    })
    .then(async transcript => {
      const analysis = await aiService.analyze(transcript);
      return analysis;
    });
}
```

## Development Workflow

### Branch Strategy

We follow a feature-branch workflow:

```bash
# Create feature branch from main
git checkout main
git pull origin main
git checkout -b feature/add-new-platform-support

# Work on your feature
git add .
git commit -m "feat: add support for NewPlatform video downloads"

# Push and create PR
git push origin feature/add-new-platform-support
```

### Commit Message Format

Follow conventional commit format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(import): add support for Vimeo platform downloads
fix(transcription): handle empty audio files gracefully
docs(api): update video import endpoint documentation
test(services): add comprehensive tests for OllamaService
refactor(pipeline): simplify import job processing logic
```

### Environment Setup

Ensure your development environment meets these requirements:

```bash
# Node.js and package manager
node --version  # >= 18.0.0
npm --version   # >= 9.0.0

# Required system dependencies
ffmpeg -version  # For video processing
ollama --version # For AI integration (optional)

# Install project dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Run development server
npm run dev
```

## Testing Requirements

### Test Coverage Standards

Maintain minimum 80% test coverage for all new code:

```typescript
// Example comprehensive test suite
import { VideoImportService } from '../VideoImportService';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('VideoImportService', () => {
  let service: VideoImportService;
  let mockDownloaderManager: jest.Mocked<DownloaderManager>;

  beforeEach(() => {
    mockDownloaderManager = createMockDownloaderManager();
    service = new VideoImportService(mockDownloaderManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('downloadVideo', () => {
    it('should download video successfully', async () => {
      const url = 'https://example.com/video';
      const options = { quality: 'best' };
      const expectedResult = createMockDownloadResult();

      mockDownloaderManager.download.mockResolvedValue(expectedResult);

      const result = await service.downloadVideo(url, options);

      expect(mockDownloaderManager.download).toHaveBeenCalledWith(url, options);
      expect(result).toEqual(expectedResult);
    });

    it('should handle download failures', async () => {
      const url = 'https://example.com/video';
      const error = new Error('Download failed');

      mockDownloaderManager.download.mockRejectedValue(error);

      await expect(service.downloadVideo(url)).rejects.toThrow('Download failed');
    });

    it('should validate URL format', async () => {
      const invalidUrl = 'not-a-url';

      await expect(service.downloadVideo(invalidUrl)).rejects.toThrow('Invalid URL format');
    });
  });

  describe('detectPlatform', () => {
    it('should detect YouTube URLs correctly', () => {
      const youtubeUrls = [
        'https://www.youtube.com/watch?v=abc123',
        'https://youtu.be/abc123',
        'https://m.youtube.com/watch?v=abc123'
      ];

      youtubeUrls.forEach(url => {
        expect(service.detectPlatform(url)).toBe(VideoSourceType.YOUTUBE);
      });
    });

    it('should handle malformed URLs gracefully', () => {
      const malformedUrls = ['', null, undefined, 'not-a-url'];

      malformedUrls.forEach(url => {
        expect(service.detectPlatform(url as any)).toBe(VideoSourceType.URL);
      });
    });
  });
});
```

### Integration Tests

Write integration tests for complex workflows:

```typescript
// integration/import-pipeline.test.ts
describe('Import Pipeline Integration', () => {
  let pipeline: ImportPipelineService;
  
  beforeAll(async () => {
    // Setup test environment
    await setupTestDatabase();
    await startTestServices();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  it('should process complete import workflow', async () => {
    const importRequest: VideoImportRequest = {
      source: VideoSourceType.YOUTUBE,
      url: 'https://www.youtube.com/watch?v=test123',
      config: {
        transcribe: true,
        analyze: true,
        generateSuggestions: true
      }
    };

    const job = await pipeline.createImportJob(importRequest);
    
    // Wait for processing to complete
    await waitForJobCompletion(job.id);
    
    const completedJob = await pipeline.getImportJob(job.id);
    
    expect(completedJob.status).toBe(ImportJobStatus.COMPLETED);
    expect(completedJob.metadata).toBeDefined();
    expect(completedJob.analysis).toBeDefined();
    expect(completedJob.analysis.suggestedClips.length).toBeGreaterThan(0);
  }, 60000); // 60 second timeout for integration test
});
```

### Performance Tests

Include performance tests for critical operations:

```typescript
// performance/download-performance.test.ts
describe('Download Performance', () => {
  it('should download video within acceptable time limits', async () => {
    const startTime = Date.now();
    const url = 'https://example.com/test-video.mp4';
    
    const result = await videoImportService.downloadVideo(url);
    
    const duration = Date.now() - startTime;
    
    expect(result).toBeDefined();
    expect(duration).toBeLessThan(30000); // 30 second limit
  });

  it('should handle concurrent downloads efficiently', async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://example.com/video${i}.mp4`);
    
    const startTime = Date.now();
    
    const downloads = urls.map(url => videoImportService.downloadVideo(url));
    const results = await Promise.all(downloads);
    
    const duration = Date.now() - startTime;
    
    expect(results).toHaveLength(5);
    expect(duration).toBeLessThan(60000); // Should complete within 60 seconds
  });
});
```

## Documentation Standards

### Code Documentation

Use comprehensive JSDoc comments:

```typescript
/**
 * Downloads a video from a supported platform
 * 
 * @param url - The video URL to download
 * @param options - Download configuration options
 * @returns Promise resolving to download result with metadata
 * 
 * @throws {ValidationError} When URL format is invalid
 * @throws {DownloadError} When download fails
 * @throws {UnsupportedPlatformError} When platform is not supported
 * 
 * @example
 * ```typescript
 * const result = await videoImportService.downloadVideo(
 *   'https://www.youtube.com/watch?v=abc123',
 *   { quality: 'best', format: 'mp4' }
 * );
 * 
 * console.log(`Downloaded: ${result.filePath}`);
 * console.log(`Duration: ${result.metadata.duration}s`);
 * ```
 * 
 * @since 1.0.0
 */
async downloadVideo(url: string, options: DownloadOptions = {}): Promise<DownloadResult> {
  // Implementation...
}
```

### README Documentation

Each service should have a comprehensive README:

```markdown
# VideoImportService

## Overview
Handles video downloads and metadata extraction from multiple platforms.

## Features
- Multi-platform support (YouTube, TikTok, Instagram, Facebook)
- Automatic platform detection
- Video caching and deduplication
- Progress tracking and real-time updates
- Comprehensive error handling

## Usage

### Basic Download
```typescript
const service = new VideoImportService();
const result = await service.downloadVideo('https://youtube.com/watch?v=abc123');
```

### With Options
```typescript
const result = await service.downloadVideo(url, {
  quality: 'best',
  format: 'mp4',
  onProgress: (progress) => console.log(`${progress}%`)
});
```

## Configuration
Required environment variables:
- `YOUTUBE_API_KEY` - YouTube Data API key (optional)
- `MAX_CONCURRENT_DOWNLOADS` - Maximum concurrent downloads (default: 3)

## Error Handling
The service throws specific error types:
- `ValidationError` - Invalid input parameters
- `UnsupportedPlatformError` - Platform not supported
- `DownloadError` - Download operation failed

## Performance
- Supports concurrent downloads with configurable limits
- Implements intelligent caching to avoid duplicate downloads
- Memory-efficient streaming for large files
```

## Pull Request Process

### PR Requirements

Before submitting a pull request:

1. **Code Quality**
   - All tests pass
   - Code coverage ≥ 80%
   - No TypeScript errors
   - Follows code standards

2. **Documentation**
   - Update relevant documentation
   - Add JSDoc comments
   - Update CHANGELOG.md

3. **Testing**
   - Add unit tests
   - Include integration tests for complex features
   - Test error scenarios

### PR Template

```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Performance improvement

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] Performance impact assessed

## Documentation
- [ ] Code comments updated
- [ ] API documentation updated
- [ ] User documentation updated
- [ ] CHANGELOG.md updated

## Checklist
- [ ] Code follows project conventions
- [ ] Self-review completed
- [ ] Tests pass locally
- [ ] No new TypeScript errors
- [ ] Breaking changes documented
```

## Code Review Guidelines

### What to Look For

**Functionality**
- Does the code do what it's supposed to do?
- Are edge cases handled appropriately?
- Is error handling comprehensive?

**Code Quality**
- Is the code readable and maintainable?
- Are functions and classes appropriately sized?
- Is there unnecessary complexity?

**Performance**
- Are there any obvious performance issues?
- Is memory usage reasonable?
- Are expensive operations optimized?

**Security**
- Are inputs properly validated?
- Are there any security vulnerabilities?
- Is sensitive data handled appropriately?

### Review Process

1. **Automated Checks**
   - CI/CD pipeline passes
   - Code coverage meets requirements
   - No security vulnerabilities detected

2. **Code Review**
   - At least one approval from code owner
   - All comments addressed or discussed
   - Documentation updated as needed

3. **Testing**
   - Manual testing for complex features
   - Performance testing for critical paths
   - Security testing for new endpoints

## Performance Standards

### Response Time Requirements

- **API Endpoints**: < 2 seconds for standard operations
- **Video Downloads**: Progress updates every 1 second
- **Transcription**: < 30 seconds per minute of audio
- **AI Analysis**: < 60 seconds for standard video

### Resource Usage Limits

- **Memory**: Maximum 1GB per import job
- **CPU**: Efficient use of available cores
- **Storage**: Automatic cleanup of temporary files
- **Network**: Respect rate limits and implement backoff

### Monitoring and Metrics

```typescript
// Add performance monitoring to critical operations
import { performance } from 'perf_hooks';

class PerformanceMonitor {
  static async measureOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      
      logger.info('Operation completed', {
        operation: operationName,
        duration: `${duration.toFixed(2)}ms`,
        success: true
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      logger.error('Operation failed', {
        operation: operationName,
        duration: `${duration.toFixed(2)}ms`,
        error: error.message,
        success: false
      });
      
      throw error;
    }
  }
}

// Usage
const result = await PerformanceMonitor.measureOperation(
  () => videoService.downloadVideo(url),
  'downloadVideo'
);
```

## Security Guidelines

### Input Validation

Always validate and sanitize inputs:

```typescript
import { z } from 'zod';

// Define validation schemas
const videoImportSchema = z.object({
  url: z.string().url().max(2048),
  source: z.nativeEnum(VideoSourceType),
  config: z.object({
    maxDuration: z.number().min(1).max(3600).optional(),
    quality: z.enum(['best', 'worst', '720p', '1080p']).optional()
  }).optional()
});

// Validate in service methods
async createImportJob(request: unknown): Promise<ImportJob> {
  const validatedRequest = videoImportSchema.parse(request);
  // Process validated request...
}
```

### File System Security

Prevent path traversal and ensure safe file operations:

```typescript
import path from 'path';
import fs from 'fs/promises';

class SecureFileHandler {
  private readonly allowedDir: string;

  constructor(allowedDir: string) {
    this.allowedDir = path.resolve(allowedDir);
  }

  async saveFile(filename: string, data: Buffer): Promise<string> {
    // Sanitize filename
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    // Ensure file is within allowed directory
    const filePath = path.resolve(this.allowedDir, sanitizedName);
    if (!filePath.startsWith(this.allowedDir)) {
      throw new Error('Invalid file path');
    }

    await fs.writeFile(filePath, data);
    return filePath;
  }
}
```

### API Security

Implement proper authentication and rate limiting:

```typescript
// Rate limiting middleware
import rateLimit from 'express-rate-limit';

const importRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many import requests from this IP',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply to import endpoints
app.use('/api/import', importRateLimit);
```

### Environment Variables

Never commit secrets and use secure defaults:

```typescript
// ✅ Good - Secure configuration
const config = {
  apiKey: process.env.THIRD_PARTY_API_KEY || '',
  dbUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || (() => {
    throw new Error('JWT_SECRET environment variable is required');
  })()
};

// ❌ Bad - Hardcoded secrets
const config = {
  apiKey: 'sk-1234567890abcdef',
  dbPassword: 'password123'
};
```

## Continuous Integration

### Required Checks

All PRs must pass:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test
      - run: npm run test:integration
      - run: npm run build
```

### Quality Gates

- Test coverage ≥ 80%
- No high-severity security issues
- TypeScript compilation passes
- ESLint passes with no errors
- Performance benchmarks within acceptable range

By following these contributing guidelines, we maintain a high-quality, secure, and maintainable codebase that enables effective collaboration and rapid development of the video import feature.