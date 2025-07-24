# Performance Optimization - Video Import Feature

This guide covers performance optimization strategies, techniques, and best practices for the video import feature to ensure efficient operation under various load conditions.

## Table of Contents

1. [Performance Overview](#performance-overview)
2. [Backend Performance](#backend-performance)
3. [Frontend Performance](#frontend-performance)
4. [Video Processing Optimization](#video-processing-optimization)
5. [Database Optimization](#database-optimization)
6. [Caching Strategies](#caching-strategies)
7. [Memory Management](#memory-management)
8. [Monitoring and Metrics](#monitoring-and-metrics)
9. [Load Testing](#load-testing)
10. [Deployment Optimization](#deployment-optimization)

## Performance Overview

### Performance Goals

- **API Response Time**: < 2 seconds for standard operations
- **Video Download**: Progress updates every 1 second
- **Transcription**: < 30 seconds per minute of audio
- **AI Analysis**: < 60 seconds for standard video
- **Memory Usage**: < 1GB per import job
- **Concurrent Users**: Support 50+ simultaneous imports

### Key Metrics

```typescript
// Performance metrics we track
export interface PerformanceMetrics {
  // Response times (milliseconds)
  apiResponseTime: number;
  downloadSpeed: number;      // bytes/second
  transcriptionRate: number;  // audio seconds/processing seconds
  analysisTime: number;       // milliseconds per video minute
  
  // Resource usage
  memoryUsage: number;        // bytes
  cpuUsage: number;          // percentage
  diskUsage: number;         // bytes
  
  // Throughput
  requestsPerSecond: number;
  concurrentJobs: number;
  queueLength: number;
}
```

## Backend Performance

### Service-Level Optimizations

#### 1. Async Processing Patterns

Use non-blocking operations and proper async patterns:

```typescript
// ✅ Good - Efficient async processing
class VideoImportService {
  async downloadVideo(url: string): Promise<DownloadResult> {
    // Use streaming for large files
    const downloadStream = await this.createDownloadStream(url);
    const writeStream = fs.createWriteStream(outputPath);
    
    return new Promise((resolve, reject) => {
      downloadStream.pipe(writeStream);
      
      downloadStream.on('data', (chunk) => {
        this.updateProgress(chunk.length);
      });
      
      downloadStream.on('end', () => {
        resolve({ filePath: outputPath });
      });
      
      downloadStream.on('error', reject);
    });
  }
  
  // Process multiple operations concurrently
  async processBatch(urls: string[]): Promise<DownloadResult[]> {
    const semaphore = new Semaphore(MAX_CONCURRENT_DOWNLOADS);
    
    return Promise.all(urls.map(async (url) => {
      return semaphore.acquire(async () => {
        return this.downloadVideo(url);
      });
    }));
  }
}

// ❌ Bad - Blocking operations
class IneffientService {
  async downloadVideo(url: string): Promise<DownloadResult> {
    // Don't do this - loads entire file into memory
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, buffer);
    
    return { filePath: outputPath };
  }
}
```

#### 2. Connection Pooling

Optimize HTTP connections for external APIs:

```typescript
// HTTP agent with connection pooling
import { Agent } from 'https';

const httpAgent = new Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
  freeSocketTimeout: 30000
});

class APIClient {
  private client = axios.create({
    httpsAgent: httpAgent,
    timeout: 30000,
    // Reuse connections
    maxRedirects: 5
  });
  
  async makeRequest(url: string): Promise<any> {
    try {
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      // Implement retry with exponential backoff
      return this.retryRequest(url, 0);
    }
  }
  
  private async retryRequest(url: string, attempt: number): Promise<any> {
    if (attempt >= MAX_RETRIES) throw new Error('Max retries exceeded');
    
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    await this.sleep(delay);
    
    try {
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      return this.retryRequest(url, attempt + 1);
    }
  }
}
```

#### 3. Queue Optimization

Optimize queue processing for better throughput:

```typescript
class OptimizedQueueService {
  private queues = new Map<QueuePriority, Queue<QueueItem>>();
  private processing = new Set<string>();
  
  constructor(private maxConcurrent = 5) {
    // Initialize priority queues
    Object.values(QueuePriority).forEach(priority => {
      this.queues.set(priority, new Queue());
    });
    
    // Start processing loop
    this.startProcessingLoop();
  }
  
  private startProcessingLoop(): void {
    setInterval(() => {
      if (this.processing.size < this.maxConcurrent) {
        const item = this.getNextItem();
        if (item) {
          this.processItem(item);
        }
      }
    }, 100); // Check every 100ms
  }
  
  private getNextItem(): QueueItem | null {
    // Process higher priority items first
    const priorities = [
      QueuePriority.URGENT,
      QueuePriority.HIGH,
      QueuePriority.NORMAL,
      QueuePriority.LOW
    ];
    
    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue && !queue.isEmpty()) {
        return queue.dequeue();
      }
    }
    
    return null;
  }
  
  private async processItem(item: QueueItem): Promise<void> {
    this.processing.add(item.id);
    
    try {
      await this.executeItem(item);
    } finally {
      this.processing.delete(item.id);
    }
  }
  
  // Batch processing for efficiency
  async processBatch(items: QueueItem[]): Promise<void> {
    const batches = this.chunkArray(items, 10);
    
    for (const batch of batches) {
      await Promise.all(batch.map(item => this.processItem(item)));
    }
  }
}
```

### API Optimization

#### 1. Response Caching

Implement intelligent caching for API responses:

```typescript
import NodeCache from 'node-cache';

class CacheService {
  private cache = new NodeCache({
    stdTTL: 3600, // 1 hour default
    checkperiod: 600, // Check for expired keys every 10 minutes
    useClones: false // Better performance, but be careful with mutations
  });
  
  async getWithCache<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try cache first
    const cached = this.cache.get<T>(key);
    if (cached) return cached;
    
    // Fetch and cache
    const data = await fetchFn();
    this.cache.set(key, data, ttl);
    
    return data;
  }
  
  // Cache video metadata
  async getVideoMetadata(url: string): Promise<VideoMetadata> {
    const cacheKey = `metadata:${this.hashUrl(url)}`;
    
    return this.getWithCache(
      cacheKey,
      () => this.fetchMetadata(url),
      7200 // Cache for 2 hours
    );
  }
  
  // Cache transcription results
  async getTranscription(audioHash: string): Promise<TranscriptSegment[]> {
    const cacheKey = `transcription:${audioHash}`;
    
    return this.getWithCache(
      cacheKey,
      () => this.performTranscription(audioHash),
      86400 // Cache for 24 hours
    );
  }
}
```

#### 2. Request Batching

Batch multiple requests to reduce overhead:

```typescript
class BatchProcessor {
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    data: any;
  }[]>();
  
  private batchTimeout: NodeJS.Timeout | null = null;
  
  async batchedAnalysis(videoId: string, data: any): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      // Add to batch
      if (!this.pendingRequests.has('analysis')) {
        this.pendingRequests.set('analysis', []);
      }
      
      this.pendingRequests.get('analysis')!.push({
        resolve,
        reject,
        data: { videoId, ...data }
      });
      
      // Schedule batch processing
      this.scheduleBatchProcess();
    });
  }
  
  private scheduleBatchProcess(): void {
    if (this.batchTimeout) return;
    
    this.batchTimeout = setTimeout(() => {
      this.processBatches();
      this.batchTimeout = null;
    }, 100); // 100ms batch window
  }
  
  private async processBatches(): Promise<void> {
    for (const [batchType, requests] of this.pendingRequests) {
      if (requests.length === 0) continue;
      
      try {
        const results = await this.processBatch(batchType, requests);
        
        requests.forEach((request, index) => {
          request.resolve(results[index]);
        });
      } catch (error) {
        requests.forEach(request => {
          request.reject(error);
        });
      }
      
      // Clear processed requests
      this.pendingRequests.set(batchType, []);
    }
  }
}
```

## Frontend Performance

### React Component Optimization

#### 1. Memoization and Callbacks

Optimize React components with proper memoization:

```tsx
import React, { memo, useMemo, useCallback } from 'react';

// Memoize expensive components
const VideoListItem = memo<VideoListItemProps>(({ 
  video, 
  onSelect, 
  isSelected 
}) => {
  // Memoize expensive calculations
  const formattedDuration = useMemo(() => {
    return formatDuration(video.duration);
  }, [video.duration]);
  
  // Stable callback reference
  const handleSelect = useCallback(() => {
    onSelect(video.id);
  }, [video.id, onSelect]);
  
  return (
    <div className={`video-item ${isSelected ? 'selected' : ''}`}>
      <img src={video.thumbnail} alt={video.title} loading="lazy" />
      <h3>{video.title}</h3>
      <span>{formattedDuration}</span>
      <button onClick={handleSelect}>Select</button>
    </div>
  );
});

// Optimize parent component
const VideoList: React.FC<VideoListProps> = ({ videos, selectedId }) => {
  // Memoize handler to prevent child re-renders
  const handleVideoSelect = useCallback((videoId: string) => {
    setSelectedVideo(videoId);
  }, []);
  
  // Virtual scrolling for large lists
  const virtualizedItems = useMemo(() => {
    return videos.slice(visibleStart, visibleEnd);
  }, [videos, visibleStart, visibleEnd]);
  
  return (
    <div className="video-list">
      {virtualizedItems.map(video => (
        <VideoListItem
          key={video.id}
          video={video}
          onSelect={handleVideoSelect}
          isSelected={selectedId === video.id}
        />
      ))}
    </div>
  );
};
```

#### 2. Virtual Scrolling

Implement virtual scrolling for large data sets:

```tsx
import { FixedSizeList as List } from 'react-window';

const VirtualizedVideoList: React.FC<Props> = ({ videos }) => {
  const Row = useCallback(({ index, style }) => {
    const video = videos[index];
    
    return (
      <div style={style}>
        <VideoListItem video={video} />
      </div>
    );
  }, [videos]);
  
  return (
    <List
      height={600} // Visible height
      itemCount={videos.length}
      itemSize={120} // Row height
      itemData={videos}
      overscanCount={5} // Render extra items for smooth scrolling
    >
      {Row}
    </List>
  );
};
```

#### 3. Code Splitting and Lazy Loading

Split code for better loading performance:

```tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

// Lazy load components
const VideoImporter = lazy(() => import('./pages/VideoImporter'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const VideoEditor = lazy(() => import('./pages/VideoEditor'));

const App: React.FC = () => {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/import" element={<VideoImporter />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/editor" element={<VideoEditor />} />
      </Routes>
    </Suspense>
  );
};

// Preload critical components
const preloadComponents = () => {
  import('./pages/VideoImporter');
  import('./pages/Dashboard');
};

// Preload on user interaction
document.addEventListener('mouseover', preloadComponents, { once: true });
```

### State Management Optimization

```typescript
// Optimized Redux/Zustand store
interface AppState {
  videos: {
    items: VideoItem[];
    loading: boolean;
    error: string | null;
    pagination: {
      page: number;
      total: number;
      hasMore: boolean;
    };
  };
  ui: {
    selectedVideoId: string | null;
    viewMode: 'grid' | 'list';
  };
}

// Use selectors to prevent unnecessary re-renders
const selectVideoItems = createSelector(
  (state: AppState) => state.videos.items,
  (items) => items
);

const selectVisibleVideos = createSelector(
  selectVideoItems,
  (state: AppState) => state.ui.viewMode,
  (items, viewMode) => {
    // Expensive filtering/sorting logic
    return items.filter(/* ... */).sort(/* ... */);
  }
);
```

## Video Processing Optimization

### FFmpeg Optimization

Optimize video processing with efficient FFmpeg usage:

```typescript
class OptimizedFFmpegService {
  private static readonly PRESET_CONFIGS = {
    fast: ['-preset', 'ultrafast', '-crf', '28'],
    balanced: ['-preset', 'medium', '-crf', '23'],
    quality: ['-preset', 'slow', '-crf', '18']
  };
  
  async processVideo(
    inputPath: string,
    outputPath: string,
    options: ProcessingOptions
  ): Promise<void> {
    const preset = this.PRESET_CONFIGS[options.preset || 'balanced'];
    
    const command = ffmpeg(inputPath)
      .addOptions(preset)
      // Hardware acceleration (if available)
      .addOptions(['-hwaccel', 'auto'])
      // Optimize for web streaming
      .addOptions(['-movflags', '+faststart'])
      // Multi-threading
      .addOptions(['-threads', '0']);
    
    // Resolution scaling
    if (options.scale) {
      command.size(options.scale);
    }
    
    // Audio processing
    if (options.audioCodec) {
      command.audioCodec(options.audioCodec);
    } else {
      command.audioCodec('aac').audioBitrate('128k');
    }
    
    return new Promise((resolve, reject) => {
      command
        .on('progress', (progress) => {
          this.emitProgress(progress.percent || 0);
        })
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });
  }
  
  // Batch processing for multiple operations
  async processVideoBatch(jobs: ProcessingJob[]): Promise<void> {
    const semaphore = new Semaphore(Math.min(4, os.cpus().length));
    
    await Promise.all(jobs.map(job =>
      semaphore.acquire(() => this.processVideo(
        job.inputPath,
        job.outputPath,
        job.options
      ))
    ));
  }
  
  // Stream processing for large files
  async streamProcess(
    inputStream: Readable,
    outputStream: Writable,
    options: ProcessingOptions
  ): Promise<void> {
    const command = ffmpeg(inputStream)
      .format('mp4')
      .addOptions(this.PRESET_CONFIGS[options.preset || 'fast']);
    
    return new Promise((resolve, reject) => {
      command
        .on('end', resolve)
        .on('error', reject)
        .pipe(outputStream);
    });
  }
}
```

### Parallel Processing

Use worker threads for CPU-intensive tasks:

```typescript
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

// Main thread
class ParallelVideoProcessor {
  private workers: Worker[] = [];
  private taskQueue: ProcessingTask[] = [];
  
  constructor(private workerCount = os.cpus().length) {
    this.initializeWorkers();
  }
  
  private initializeWorkers(): void {
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(__filename);
      
      worker.on('message', (result) => {
        this.handleWorkerResult(result);
      });
      
      worker.on('error', (error) => {
        console.error('Worker error:', error);
        this.restartWorker(i);
      });
      
      this.workers.push(worker);
    }
  }
  
  async processVideo(task: ProcessingTask): Promise<ProcessingResult> {
    return new Promise((resolve, reject) => {
      const availableWorker = this.getAvailableWorker();
      
      if (availableWorker) {
        availableWorker.postMessage({
          ...task,
          resolve: resolve.toString(),
          reject: reject.toString()
        });
      } else {
        this.taskQueue.push({ ...task, resolve, reject });
      }
    });
  }
  
  private getAvailableWorker(): Worker | null {
    // Simple round-robin assignment
    return this.workers.find(worker => !worker.threadId);
  }
}

// Worker thread
if (!isMainThread) {
  parentPort?.on('message', async (task) => {
    try {
      const result = await processVideoTask(task);
      parentPort?.postMessage({ success: true, result });
    } catch (error) {
      parentPort?.postMessage({ success: false, error: error.message });
    }
  });
}
```

## Caching Strategies

### Multi-Level Caching

Implement comprehensive caching strategy:

```typescript
class MultiLevelCache {
  private memoryCache = new Map<string, CacheEntry>();
  private redisClient: Redis;
  private fileCache: FileCacheService;
  
  constructor() {
    this.redisClient = new Redis(process.env.REDIS_URL);
    this.fileCache = new FileCacheService('./cache');
  }
  
  async get<T>(key: string): Promise<T | null> {
    // Level 1: Memory cache (fastest)
    const memoryResult = this.memoryCache.get(key);
    if (memoryResult && !this.isExpired(memoryResult)) {
      return memoryResult.data;
    }
    
    // Level 2: Redis cache
    try {
      const redisResult = await this.redisClient.get(key);
      if (redisResult) {
        const data = JSON.parse(redisResult);
        // Populate memory cache
        this.setMemoryCache(key, data);
        return data;
      }
    } catch (error) {
      console.warn('Redis cache error:', error);
    }
    
    // Level 3: File cache (slowest but persistent)
    try {
      const fileResult = await this.fileCache.get(key);
      if (fileResult) {
        // Populate higher level caches
        this.setMemoryCache(key, fileResult);
        this.setRedisCache(key, fileResult);
        return fileResult;
      }
    } catch (error) {
      console.warn('File cache error:', error);
    }
    
    return null;
  }
  
  async set<T>(key: string, data: T, ttl = 3600): Promise<void> {
    // Set in all cache levels
    this.setMemoryCache(key, data, ttl);
    this.setRedisCache(key, data, ttl);
    this.setFileCache(key, data, ttl);
  }
  
  // Smart cache eviction
  private evictExpiredEntries(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry)) {
        this.memoryCache.delete(key);
      }
    }
  }
  
  // Cache warming for frequently accessed data
  async warmCache(urls: string[]): Promise<void> {
    const promises = urls.map(async (url) => {
      try {
        const metadata = await this.fetchVideoMetadata(url);
        await this.set(`metadata:${url}`, metadata);
      } catch (error) {
        console.warn(`Failed to warm cache for ${url}:`, error);
      }
    });
    
    await Promise.allSettled(promises);
  }
}
```

### Intelligent Video Caching

```typescript
class VideoCache {
  private static readonly MAX_CACHE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
  private static readonly MAX_FILE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  async getCachedVideo(url: string): Promise<string | null> {
    const hash = this.generateHash(url);
    const cacheFile = path.join(this.cacheDir, `${hash}.mp4`);
    const metaFile = path.join(this.cacheDir, `${hash}.json`);
    
    try {
      const stats = await fs.stat(cacheFile);
      const metadata = JSON.parse(await fs.readFile(metaFile, 'utf8'));
      
      // Check if file is still fresh
      if (Date.now() - stats.mtime.getTime() < this.MAX_FILE_AGE) {
        // Update access time for LRU eviction
        await fs.utimes(cacheFile, new Date(), new Date());
        return cacheFile;
      }
    } catch (error) {
      // File doesn't exist or is corrupted
    }
    
    return null;
  }
  
  async cacheVideo(url: string, tempPath: string): Promise<string> {
    const hash = this.generateHash(url);
    const cacheFile = path.join(this.cacheDir, `${hash}.mp4`);
    
    // Move file to cache
    await fs.rename(tempPath, cacheFile);
    
    // Store metadata
    const metadata = {
      url,
      cachedAt: new Date().toISOString(),
      fileSize: (await fs.stat(cacheFile)).size
    };
    
    await fs.writeFile(
      path.join(this.cacheDir, `${hash}.json`),
      JSON.stringify(metadata)
    );
    
    // Trigger cache cleanup if needed
    this.scheduleCleanup();
    
    return cacheFile;
  }
  
  private async cleanup(): Promise<void> {
    const files = await this.getCacheFiles();
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    
    if (totalSize > this.MAX_CACHE_SIZE) {
      // Sort by last access time (LRU)
      files.sort((a, b) => a.accessTime - b.accessTime);
      
      let sizeToRemove = totalSize - this.MAX_CACHE_SIZE;
      
      for (const file of files) {
        if (sizeToRemove <= 0) break;
        
        await fs.unlink(file.path);
        await fs.unlink(file.metaPath);
        
        sizeToRemove -= file.size;
      }
    }
  }
}
```

## Memory Management

### Memory Usage Monitoring

```typescript
class MemoryMonitor {
  private static readonly WARNING_THRESHOLD = 0.8; // 80% of max memory
  private static readonly CRITICAL_THRESHOLD = 0.9; // 90% of max memory
  
  private maxMemory: number;
  private monitoringInterval: NodeJS.Timeout;
  
  constructor() {
    this.maxMemory = this.getMaxMemory();
    this.startMonitoring();
  }
  
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const usage = process.memoryUsage();
      const usageRatio = usage.heapUsed / this.maxMemory;
      
      if (usageRatio > this.CRITICAL_THRESHOLD) {
        this.handleCriticalMemory();
      } else if (usageRatio > this.WARNING_THRESHOLD) {
        this.handleWarningMemory();
      }
    }, 5000); // Check every 5 seconds
  }
  
  private handleWarningMemory(): void {
    logger.warn('High memory usage detected', {
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      threshold: this.WARNING_THRESHOLD
    });
    
    // Trigger gentle cleanup
    this.requestGarbageCollection();
    this.clearCaches();
  }
  
  private handleCriticalMemory(): void {
    logger.error('Critical memory usage detected', {
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      threshold: this.CRITICAL_THRESHOLD
    });
    
    // Aggressive cleanup
    this.forceGarbageCollection();
    this.clearAllCaches();
    this.pauseNewJobs();
  }
  
  private clearCaches(): void {
    // Clear various caches
    cacheService.clear();
    videoCache.cleanup();
  }
  
  private forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
    }
  }
}
```

### Stream Processing

Use streams to handle large files without loading them into memory:

```typescript
class StreamProcessor {
  async processLargeVideo(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const inputStream = fs.createReadStream(inputPath);
      const outputStream = fs.createWriteStream(outputPath);
      
      const processor = ffmpeg(inputStream)
        .format('mp4')
        .addOptions(['-preset', 'fast'])
        .on('progress', (progress) => {
          this.emitProgress(progress);
        })
        .on('error', reject)
        .on('end', resolve);
      
      processor.pipe(outputStream);
    });
  }
  
  async transcribeAudioStream(audioStream: Readable): Promise<TranscriptSegment[]> {
    const chunks: Buffer[] = [];
    let totalLength = 0;
    
    // Process audio in chunks to avoid memory issues
    return new Promise((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalLength += chunk.length;
        
        // Process chunk immediately if it's large enough
        if (totalLength > CHUNK_SIZE) {
          this.processAudioChunk(Buffer.concat(chunks));
          chunks.length = 0;
          totalLength = 0;
        }
      });
      
      audioStream.on('end', () => {
        // Process remaining data
        if (chunks.length > 0) {
          this.processAudioChunk(Buffer.concat(chunks));
        }
        resolve(this.getTranscriptSegments());
      });
      
      audioStream.on('error', reject);
    });
  }
}
```

## Monitoring and Metrics

### Performance Metrics Collection

```typescript
class MetricsCollector {
  private metrics = new Map<string, PerformanceEntry[]>();
  
  startTimer(operationName: string): () => void {
    const start = performance.now();
    
    return () => {
      const end = performance.now();
      const duration = end - start;
      
      this.recordMetric(operationName, {
        duration,
        timestamp: Date.now(),
        operation: operationName
      });
    };
  }
  
  // Middleware for Express routes
  performanceMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = performance.now();
      
      res.on('finish', () => {
        const duration = performance.now() - startTime;
        
        this.recordMetric('api_request', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          timestamp: Date.now()
        });
      });
      
      next();
    };
  }
  
  // Export metrics for monitoring systems
  exportMetrics(): MetricsReport {
    const report: MetricsReport = {
      timestamp: Date.now(),
      metrics: {}
    };
    
    for (const [operation, entries] of this.metrics.entries()) {
      const durations = entries.map(e => e.duration);
      
      report.metrics[operation] = {
        count: entries.length,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99)
      };
    }
    
    return report;
  }
}

// Usage in services
class VideoImportService {
  private metrics = new MetricsCollector();
  
  async downloadVideo(url: string): Promise<DownloadResult> {
    const stopTimer = this.metrics.startTimer('video_download');
    
    try {
      const result = await this.performDownload(url);
      return result;
    } finally {
      stopTimer();
    }
  }
}
```

### Health Checks

```typescript
class HealthCheckService {
  private checks = new Map<string, HealthCheck>();
  
  registerCheck(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }
  
  async runHealthChecks(): Promise<HealthReport> {
    const results = new Map<string, HealthCheckResult>();
    
    for (const [name, check] of this.checks.entries()) {
      try {
        const start = performance.now();
        const status = await Promise.race([
          check.execute(),
          this.timeout(5000) // 5 second timeout
        ]);
        
        results.set(name, {
          status: status ? 'healthy' : 'unhealthy',
          responseTime: performance.now() - start,
          timestamp: Date.now()
        });
      } catch (error) {
        results.set(name, {
          status: 'unhealthy',
          error: error.message,
          timestamp: Date.now()
        });
      }
    }
    
    const overallStatus = Array.from(results.values())
      .every(result => result.status === 'healthy') ? 'healthy' : 'unhealthy';
    
    return {
      status: overallStatus,
      checks: Object.fromEntries(results),
      timestamp: Date.now()
    };
  }
}

// Register health checks
const healthCheck = new HealthCheckService();

healthCheck.registerCheck('database', {
  execute: async () => {
    // Check database connectivity
    return await database.ping();
  }
});

healthCheck.registerCheck('ollama', {
  execute: async () => {
    // Check Ollama service
    const response = await fetch('http://localhost:11434/api/tags');
    return response.ok;
  }
});

healthCheck.registerCheck('memory', {
  execute: async () => {
    const usage = process.memoryUsage();
    return usage.heapUsed < MAX_MEMORY_THRESHOLD;
  }
});
```

## Load Testing

### Performance Testing Setup

```typescript
// Load testing with k6 or similar
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up to 10 users
    { duration: '5m', target: 10 },  // Stay at 10 users
    { duration: '2m', target: 20 },  // Ramp up to 20 users
    { duration: '5m', target: 20 },  // Stay at 20 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.1'],     // Error rate under 10%
  },
};

export default function() {
  // Test video import endpoint
  const importResponse = http.post('http://localhost:3000/api/import', {
    source: 'youtube',
    url: 'https://www.youtube.com/watch?v=test123',
    config: {
      transcribe: true,
      analyze: false
    }
  });
  
  check(importResponse, {
    'import request successful': (r) => r.status === 201,
    'import response time OK': (r) => r.timings.duration < 2000,
  });
  
  if (importResponse.status === 201) {
    const jobId = importResponse.json().jobId;
    
    // Poll for completion
    let completed = false;
    let attempts = 0;
    
    while (!completed && attempts < 60) {
      sleep(1);
      
      const statusResponse = http.get(`http://localhost:3000/api/import/${jobId}/status`);
      
      check(statusResponse, {
        'status request successful': (r) => r.status === 200,
      });
      
      if (statusResponse.status === 200) {
        const status = statusResponse.json().status;
        completed = status === 'completed' || status === 'failed';
      }
      
      attempts++;
    }
  }
  
  sleep(1);
}
```

## Deployment Optimization

### Production Configuration

```typescript
// Production optimizations
const productionConfig = {
  // Node.js optimizations
  nodeOptions: [
    '--max-old-space-size=4096',  // Increase memory limit
    '--optimize-for-size',         // Optimize for memory usage
    '--gc-interval=100'            // Garbage collection interval
  ],
  
  // Clustering for CPU utilization
  cluster: {
    enabled: true,
    workers: process.env.WEB_CONCURRENCY || os.cpus().length,
    maxMemory: '1GB'
  },
  
  // Connection limits
  server: {
    maxConnections: 1000,
    keepAliveTimeout: 5000,
    headersTimeout: 60000
  },
  
  // Cache configuration
  cache: {
    redis: {
      maxMemoryPolicy: 'allkeys-lru',
      maxMemory: '256mb'
    },
    fileCache: {
      maxSize: '10GB',
      cleanupInterval: '1h'
    }
  }
};

// Process clustering
if (cluster.isMaster && productionConfig.cluster.enabled) {
  for (let i = 0; i < productionConfig.cluster.workers; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  startServer();
}
```

### CDN and Asset Optimization

```typescript
// Asset optimization for production
const assetOptimization = {
  // Compress responses
  compression: {
    threshold: 1024,
    level: 6,
    memLevel: 8
  },
  
  // Static asset serving
  static: {
    maxAge: '1y',
    etag: true,
    lastModified: true
  },
  
  // Video streaming optimization
  videoStreaming: {
    segmentSize: 10, // 10 second segments
    adaptiveBitrate: true,
    formats: ['480p', '720p', '1080p']
  }
};
```

This comprehensive performance optimization guide provides the foundation for building a high-performance video import system that can handle significant load while maintaining responsiveness and resource efficiency.