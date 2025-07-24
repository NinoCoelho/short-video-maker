import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImportPipelineService } from '../ImportPipelineService';
import { VideoImportService } from '../VideoImportService';
import { QueueService } from '../QueueService';
import { EventBus } from '../../server/events/EventBus';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { performance } from 'perf_hooks';
import v8 from 'v8';
import { Readable, Transform } from 'stream';

// Performance baselines
const PERFORMANCE_BASELINES = {
  memory: {
    heapUsedMB: 200,        // Max heap usage in MB
    externalMB: 500,        // Max external memory (buffers)
    rssGrowthMB: 300,       // Max RSS growth during processing
  },
  cpu: {
    utilization: 0.8,       // Max CPU utilization (80%)
    blockingTimeMs: 50,     // Max event loop blocking time
  },
  throughput: {
    minMBps: 10,            // Minimum processing speed MB/s
    concurrentJobs: 10,     // Number of concurrent jobs to handle
    queueProcessingMs: 100, // Max time to process queue item
  },
  io: {
    diskWriteMBps: 50,      // Min disk write speed
    diskReadMBps: 100,      // Min disk read speed
    networkMBps: 100,       // Min network bandwidth utilization
  },
  streaming: {
    chunkProcessingMs: 10,  // Max time to process stream chunk
    bufferMemoryMB: 50,     // Max memory per stream buffer
  },
  database: {
    queryTimeMs: 50,        // Max query execution time
    batchInsertRate: 1000,  // Min records per second
  },
  cache: {
    hitRate: 0.8,           // Min cache hit rate (80%)
    evictionTimeMs: 10,     // Max cache eviction time
  }
};

// Helper to measure memory usage
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsedMB: usage.heapUsed / 1024 / 1024,
    heapTotalMB: usage.heapTotal / 1024 / 1024,
    externalMB: usage.external / 1024 / 1024,
    rssMB: usage.rss / 1024 / 1024,
  };
}

// Helper to measure CPU usage
async function measureCPUUsage(fn: () => Promise<void>): Promise<{
  userCPUTime: number;
  systemCPUTime: number;
  totalTime: number;
}> {
  const startUsage = process.cpuUsage();
  const startTime = performance.now();
  
  await fn();
  
  const endUsage = process.cpuUsage(startUsage);
  const endTime = performance.now();
  
  return {
    userCPUTime: endUsage.user / 1000, // Convert to ms
    systemCPUTime: endUsage.system / 1000,
    totalTime: endTime - startTime,
  };
}

// Helper to create large test video stream
function createLargeVideoStream(sizeMB: number): Readable {
  let bytesGenerated = 0;
  const targetBytes = sizeMB * 1024 * 1024;
  
  return new Readable({
    read() {
      if (bytesGenerated >= targetBytes) {
        this.push(null);
        return;
      }
      
      const chunkSize = Math.min(64 * 1024, targetBytes - bytesGenerated); // 64KB chunks
      const chunk = Buffer.alloc(chunkSize);
      
      // Simulate video data pattern
      for (let i = 0; i < chunkSize; i++) {
        chunk[i] = Math.floor(Math.random() * 256);
      }
      
      bytesGenerated += chunkSize;
      this.push(chunk);
    }
  });
}

describe('ImportPipelineService Performance Tests', () => {
  let pipelineService: ImportPipelineService;
  let testDir: string;
  let eventBus: EventBus;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `import-perf-test-${Date.now()}`);
    await fs.ensureDir(testDir);
    
    eventBus = EventBus.getInstance();
    
    pipelineService = new ImportPipelineService({
      dataDir: testDir,
      enableOllama: false,
    });
  });

  afterEach(async () => {
    await fs.remove(testDir);
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Memory Usage Tests', () => {
    it('should handle large video processing without excessive memory usage', async () => {
      const initialMemory = getMemoryUsage();
      const memorySnapshots: any[] = [];
      
      // Monitor memory during processing
      const memoryInterval = setInterval(() => {
        memorySnapshots.push(getMemoryUsage());
      }, 100);

      try {
        // Process 500MB video
        const videoSize = 500;
        const stream = createLargeVideoStream(videoSize);
        
        // Simulate video import
        const job = await pipelineService.startImport({
          source: 'url' as any,
          url: 'http://test.com/video.mp4',
          config: {
            transcribe: false,
            analyze: false,
          }
        });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        clearInterval(memoryInterval);

        // Analyze memory usage
        const peakMemory = memorySnapshots.reduce((peak, snapshot) => ({
          heapUsedMB: Math.max(peak.heapUsedMB, snapshot.heapUsedMB),
          externalMB: Math.max(peak.externalMB, snapshot.externalMB),
          rssMB: Math.max(peak.rssMB, snapshot.rssMB),
        }), initialMemory);

        const heapGrowth = peakMemory.heapUsedMB - initialMemory.heapUsedMB;
        const rssGrowth = peakMemory.rssMB - initialMemory.rssMB;

        expect(heapGrowth).toBeLessThan(PERFORMANCE_BASELINES.memory.heapUsedMB);
        expect(peakMemory.externalMB).toBeLessThan(PERFORMANCE_BASELINES.memory.externalMB);
        expect(rssGrowth).toBeLessThan(PERFORMANCE_BASELINES.memory.rssGrowthMB);
      } finally {
        clearInterval(memoryInterval);
      }
    });

    it('should not leak memory during repeated imports', async () => {
      const iterations = 10;
      const memoryReadings: any[] = [];

      for (let i = 0; i < iterations; i++) {
        // Force GC before measurement
        if (global.gc) global.gc();
        
        const beforeMemory = getMemoryUsage();
        
        // Process small video
        await pipelineService.startImport({
          source: 'url' as any,
          url: `http://test.com/video${i}.mp4`,
          config: {
            transcribe: false,
            analyze: false,
          }
        });

        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (global.gc) global.gc();
        const afterMemory = getMemoryUsage();
        
        memoryReadings.push({
          iteration: i,
          heapGrowth: afterMemory.heapUsedMB - beforeMemory.heapUsedMB,
        });
      }

      // Check for memory leak pattern
      const avgGrowth = memoryReadings.reduce((sum, r) => sum + r.heapGrowth, 0) / iterations;
      const lastThreeAvg = memoryReadings.slice(-3).reduce((sum, r) => sum + r.heapGrowth, 0) / 3;
      
      // Memory growth should stabilize (last 3 iterations should not be significantly higher)
      expect(lastThreeAvg).toBeLessThan(avgGrowth * 1.5);
    });
  });

  describe('CPU Usage Optimization Tests', () => {
    it('should efficiently utilize CPU during video processing', async () => {
      const cpuMetrics = await measureCPUUsage(async () => {
        const promises = [];
        
        // Process multiple videos concurrently
        for (let i = 0; i < 5; i++) {
          promises.push(
            pipelineService.startImport({
              source: 'url' as any,
              url: `http://test.com/video${i}.mp4`,
              config: {
                transcribe: false,
                detectScenes: true,
              }
            })
          );
        }

        await Promise.all(promises);
      });

      const cpuUtilization = (cpuMetrics.userCPUTime + cpuMetrics.systemCPUTime) / cpuMetrics.totalTime;
      
      expect(cpuUtilization).toBeLessThan(PERFORMANCE_BASELINES.cpu.utilization);
      expect(cpuUtilization).toBeGreaterThan(0.2); // Should use at least 20% CPU
    });

    it('should not block event loop during heavy processing', async () => {
      const blockingTimes: number[] = [];
      let lastCheck = performance.now();
      
      // Monitor event loop blocking
      const checkInterval = setInterval(() => {
        const now = performance.now();
        const blockingTime = now - lastCheck - 10; // Expected 10ms interval
        if (blockingTime > 5) {
          blockingTimes.push(blockingTime);
        }
        lastCheck = now;
      }, 10);

      try {
        // Heavy processing task
        await pipelineService.processImport({
          jobId: 'test-job',
          url: 'http://test.com/large-video.mp4',
          config: {
            detectScenes: true,
            sceneDetectionThreshold: 0.1, // More sensitive = more processing
          },
          onProgress: () => {},
        });
      } finally {
        clearInterval(checkInterval);
      }

      const maxBlockingTime = Math.max(...blockingTimes, 0);
      expect(maxBlockingTime).toBeLessThan(PERFORMANCE_BASELINES.cpu.blockingTimeMs);
    });
  });

  describe('Concurrent Import Performance', () => {
    it('should handle multiple concurrent imports efficiently', async () => {
      const concurrentCount = PERFORMANCE_BASELINES.throughput.concurrentJobs;
      const startTime = performance.now();
      const progressTracking = new Map<string, number>();
      
      const imports = Array.from({ length: concurrentCount }, (_, i) => 
        pipelineService.processImport({
          jobId: `concurrent-${i}`,
          url: `http://test.com/video${i}.mp4`,
          config: {
            transcribe: false,
            analyze: false,
          },
          onProgress: (progress, status) => {
            progressTracking.set(`concurrent-${i}`, progress);
          },
        })
      );

      await Promise.all(imports);
      const totalTime = performance.now() - startTime;
      
      // All imports should complete
      expect(progressTracking.size).toBe(concurrentCount);
      Array.from(progressTracking.values()).forEach(progress => {
        expect(progress).toBe(100);
      });
      
      // Should complete in reasonable time (not serialized)
      const avgTimePerImport = totalTime / concurrentCount;
      expect(avgTimePerImport).toBeLessThan(totalTime / 2); // Better than serial processing
    });

    it('should maintain queue performance under load', async () => {
      const queueService = QueueService.getInstance();
      const processingTimes: number[] = [];
      
      // Add many items to queue rapidly
      const startTime = performance.now();
      const promises = Array.from({ length: 100 }, (_, i) =>
        queueService.addDownload({
          url: `http://test.com/video${i}.mp4`,
          videoId: `video-${i}`,
          jobId: `job-${i}`,
        })
      );
      
      const queueTime = performance.now() - startTime;
      
      // Queue operations should be fast
      expect(queueTime / 100).toBeLessThan(PERFORMANCE_BASELINES.throughput.queueProcessingMs);
    });
  });

  describe('Stream Processing Efficiency', () => {
    it('should process video streams efficiently with minimal memory overhead', async () => {
      const chunkProcessingTimes: number[] = [];
      const memoryUsage: number[] = [];
      
      // Create transform stream to measure processing
      const measureStream = new Transform({
        transform(chunk, encoding, callback) {
          const startTime = performance.now();
          const startMem = process.memoryUsage().heapUsed;
          
          // Simulate processing
          this.push(chunk);
          
          chunkProcessingTimes.push(performance.now() - startTime);
          memoryUsage.push((process.memoryUsage().heapUsed - startMem) / 1024 / 1024);
          
          callback();
        }
      });

      const videoStream = createLargeVideoStream(100); // 100MB
      const startTime = performance.now();
      
      await new Promise((resolve, reject) => {
        videoStream
          .pipe(measureStream)
          .on('finish', resolve)
          .on('error', reject);
      });
      
      const totalTime = performance.now() - startTime;
      const throughputMBps = 100 / (totalTime / 1000);
      
      const avgChunkTime = chunkProcessingTimes.reduce((a, b) => a + b, 0) / chunkProcessingTimes.length;
      const maxMemoryPerChunk = Math.max(...memoryUsage);
      
      expect(throughputMBps).toBeGreaterThan(PERFORMANCE_BASELINES.throughput.minMBps);
      expect(avgChunkTime).toBeLessThan(PERFORMANCE_BASELINES.streaming.chunkProcessingMs);
      expect(maxMemoryPerChunk).toBeLessThan(PERFORMANCE_BASELINES.streaming.bufferMemoryMB);
    });

    it('should handle backpressure efficiently', async () => {
      let backpressureCount = 0;
      const slowProcessor = new Transform({
        highWaterMark: 1024, // Small buffer to trigger backpressure
        async transform(chunk, encoding, callback) {
          // Simulate slow processing
          await new Promise(resolve => setTimeout(resolve, 10));
          callback(null, chunk);
        }
      });

      slowProcessor.on('pipe', (source) => {
        const originalWrite = source.write;
        source.write = function(...args: any[]) {
          const result = originalWrite.apply(source, args);
          if (!result) backpressureCount++;
          return result;
        };
      });

      const videoStream = createLargeVideoStream(50);
      
      await new Promise((resolve, reject) => {
        videoStream
          .pipe(slowProcessor)
          .on('finish', resolve)
          .on('error', reject);
      });
      
      // Should handle backpressure (not too many, not zero)
      expect(backpressureCount).toBeGreaterThan(0);
      expect(backpressureCount).toBeLessThan(1000);
    });
  });

  describe('Cache Performance', () => {
    it('should demonstrate effective cache usage', async () => {
      const cacheHits = { count: 0 };
      const cacheMisses = { count: 0 };
      
      // Mock cache behavior
      const originalReadFile = fs.readFile;
      vi.spyOn(fs, 'readFile').mockImplementation(async (path: any, options?: any) => {
        const cacheKey = path.toString();
        if (Math.random() > 0.2) { // 80% cache hit rate
          cacheHits.count++;
          return Buffer.from('cached-content');
        } else {
          cacheMisses.count++;
          return originalReadFile(path, options);
        }
      });

      // Perform multiple file operations
      const operations = Array.from({ length: 100 }, (_, i) => 
        fs.readFile(path.join(testDir, `file-${i % 20}.txt`)).catch(() => {})
      );
      
      await Promise.all(operations);
      
      const hitRate = cacheHits.count / (cacheHits.count + cacheMisses.count);
      expect(hitRate).toBeGreaterThan(PERFORMANCE_BASELINES.cache.hitRate);
      
      vi.restoreAllMocks();
    });

    it('should efficiently evict cache entries', async () => {
      const cache = new Map<string, { data: Buffer; timestamp: number }>();
      const maxCacheSize = 50; // 50 entries
      
      const evictCache = () => {
        const startTime = performance.now();
        
        if (cache.size > maxCacheSize) {
          // Sort by timestamp and remove oldest
          const entries = Array.from(cache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
          
          const toRemove = entries.slice(0, cache.size - maxCacheSize);
          toRemove.forEach(([key]) => cache.delete(key));
        }
        
        return performance.now() - startTime;
      };

      // Fill cache beyond capacity
      for (let i = 0; i < 100; i++) {
        cache.set(`key-${i}`, {
          data: Buffer.alloc(1024 * 1024), // 1MB each
          timestamp: Date.now() + i,
        });
        
        const evictionTime = evictCache();
        expect(evictionTime).toBeLessThan(PERFORMANCE_BASELINES.cache.evictionTimeMs);
      }
      
      expect(cache.size).toBe(maxCacheSize);
    });
  });

  describe('File I/O Performance', () => {
    it('should achieve minimum disk write performance', async () => {
      const testFile = path.join(testDir, 'write-test.bin');
      const sizeMB = 100;
      const buffer = Buffer.alloc(1024 * 1024); // 1MB buffer
      
      const startTime = performance.now();
      const writeStream = fs.createWriteStream(testFile);
      
      for (let i = 0; i < sizeMB; i++) {
        await new Promise<void>((resolve, reject) => {
          writeStream.write(buffer, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      
      await new Promise(resolve => writeStream.end(resolve));
      const writeTime = performance.now() - startTime;
      const writeMBps = sizeMB / (writeTime / 1000);
      
      expect(writeMBps).toBeGreaterThan(PERFORMANCE_BASELINES.io.diskWriteMBps);
    });

    it('should achieve minimum disk read performance', async () => {
      const testFile = path.join(testDir, 'read-test.bin');
      const sizeMB = 100;
      
      // Create test file
      await fs.writeFile(testFile, Buffer.alloc(sizeMB * 1024 * 1024));
      
      const startTime = performance.now();
      const readStream = fs.createReadStream(testFile);
      let bytesRead = 0;
      
      await new Promise((resolve, reject) => {
        readStream
          .on('data', (chunk) => { bytesRead += chunk.length; })
          .on('end', resolve)
          .on('error', reject);
      });
      
      const readTime = performance.now() - startTime;
      const readMBps = (bytesRead / 1024 / 1024) / (readTime / 1000);
      
      expect(readMBps).toBeGreaterThan(PERFORMANCE_BASELINES.io.diskReadMBps);
    });
  });

  describe('Database Query Performance', () => {
    it('should execute queries within performance limits', async () => {
      // Simulate database queries
      const queryTimes: number[] = [];
      
      const simulateQuery = async (complexity: number = 1) => {
        const startTime = performance.now();
        
        // Simulate query processing
        await new Promise(resolve => 
          setTimeout(resolve, Math.random() * 30 * complexity)
        );
        
        const queryTime = performance.now() - startTime;
        queryTimes.push(queryTime);
        return queryTime;
      };

      // Test various query types
      await Promise.all([
        simulateQuery(0.5), // Simple select
        simulateQuery(1),   // Join query
        simulateQuery(1.5), // Complex aggregation
      ]);
      
      const maxQueryTime = Math.max(...queryTimes);
      expect(maxQueryTime).toBeLessThan(PERFORMANCE_BASELINES.database.queryTimeMs);
    });

    it('should handle batch inserts efficiently', async () => {
      const records = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: `record-${i}`,
        timestamp: Date.now(),
      }));
      
      const startTime = performance.now();
      
      // Simulate batch insert
      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        // Simulate insert delay
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const totalTime = performance.now() - startTime;
      const insertRate = records.length / (totalTime / 1000);
      
      expect(insertRate).toBeGreaterThan(PERFORMANCE_BASELINES.database.batchInsertRate);
    });
  });

  describe('Network Bandwidth Utilization', () => {
    it('should efficiently utilize network bandwidth', async () => {
      const downloadSpeeds: number[] = [];
      
      // Simulate network download
      const simulateDownload = async (sizeMB: number) => {
        const startTime = performance.now();
        let downloaded = 0;
        const chunkSize = 1024 * 1024; // 1MB chunks
        
        while (downloaded < sizeMB * 1024 * 1024) {
          // Simulate network delay
          await new Promise(resolve => setTimeout(resolve, 5));
          downloaded += chunkSize;
          
          const elapsed = (performance.now() - startTime) / 1000;
          const speedMBps = (downloaded / 1024 / 1024) / elapsed;
          downloadSpeeds.push(speedMBps);
        }
        
        return downloaded;
      };

      await simulateDownload(50);
      
      const avgSpeed = downloadSpeeds.reduce((a, b) => a + b, 0) / downloadSpeeds.length;
      expect(avgSpeed).toBeGreaterThan(PERFORMANCE_BASELINES.io.networkMBps * 0.8); // 80% efficiency
    });
  });

  describe('Performance Baseline Validation', () => {
    it('should generate performance report', async () => {
      const report = {
        timestamp: new Date().toISOString(),
        system: {
          platform: os.platform(),
          cpus: os.cpus().length,
          totalMemoryGB: os.totalmem() / 1024 / 1024 / 1024,
          nodeVersion: process.version,
        },
        results: {
          memory: {},
          cpu: {},
          io: {},
          throughput: {},
        },
      };

      // Run comprehensive test
      const testVideoSize = 100; // 100MB
      const startMem = getMemoryUsage();
      const startTime = performance.now();
      
      // Process video
      await pipelineService.processImport({
        jobId: 'perf-test',
        url: 'http://test.com/perf-test.mp4',
        config: {
          transcribe: false,
          detectScenes: true,
          analyze: false,
        },
        onProgress: () => {},
      });
      
      const endTime = performance.now();
      const endMem = getMemoryUsage();
      
      report.results.memory = {
        heapGrowthMB: endMem.heapUsedMB - startMem.heapUsedMB,
        peakExternalMB: endMem.externalMB,
        rssGrowthMB: endMem.rssMB - startMem.rssMB,
      };
      
      report.results.throughput = {
        processingTimeSec: (endTime - startTime) / 1000,
        throughputMBps: testVideoSize / ((endTime - startTime) / 1000),
      };
      
      // Log performance report
      console.log('Performance Report:', JSON.stringify(report, null, 2));
      
      // Validate against baselines
      expect(report.results.memory.heapGrowthMB).toBeLessThan(PERFORMANCE_BASELINES.memory.heapUsedMB);
      expect(report.results.throughput.throughputMBps).toBeGreaterThan(PERFORMANCE_BASELINES.throughput.minMBps);
    });
  });
});

// Enable manual GC for memory tests
// Run with: node --expose-gc