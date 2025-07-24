import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VideoImportService } from '../VideoImportService';
import { ImportJobStatus, VideoSourceType } from '../../types/import';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { performance } from 'perf_hooks';
import { Readable, Writable } from 'stream';
import { EventEmitter } from 'events';

// Performance metrics collection
interface PerformanceMetrics {
  operationTime: number;
  memoryUsage: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    peak: NodeJS.MemoryUsage;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
}

class PerformanceMonitor {
  private startTime: number = 0;
  private startMemory: NodeJS.MemoryUsage;
  private startCPU: NodeJS.CpuUsage;
  private peakMemory: NodeJS.MemoryUsage;
  private memoryInterval: NodeJS.Timer | null = null;

  start() {
    this.startTime = performance.now();
    this.startMemory = process.memoryUsage();
    this.startCPU = process.cpuUsage();
    this.peakMemory = { ...this.startMemory };
    
    // Monitor peak memory usage
    this.memoryInterval = setInterval(() => {
      const current = process.memoryUsage();
      this.peakMemory = {
        rss: Math.max(this.peakMemory.rss, current.rss),
        heapTotal: Math.max(this.peakMemory.heapTotal, current.heapTotal),
        heapUsed: Math.max(this.peakMemory.heapUsed, current.heapUsed),
        external: Math.max(this.peakMemory.external, current.external),
        arrayBuffers: Math.max(this.peakMemory.arrayBuffers, current.arrayBuffers),
      };
    }, 10);
  }

  stop(): PerformanceMetrics {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
    }
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    const endCPU = process.cpuUsage(this.startCPU);
    
    return {
      operationTime: endTime - this.startTime,
      memoryUsage: {
        before: this.startMemory,
        after: endMemory,
        peak: this.peakMemory,
      },
      cpuUsage: {
        user: endCPU.user / 1000, // Convert to ms
        system: endCPU.system / 1000,
      },
    };
  }
}

// Mock implementations for external dependencies
vi.mock('fluent-ffmpeg', () => ({
  default: vi.fn(() => ({
    ffprobe: vi.fn((path, callback) => {
      callback(null, {
        format: {
          duration: 120,
          size: 100 * 1024 * 1024, // 100MB
        },
        streams: [{
          codec_type: 'video',
          width: 1920,
          height: 1080,
          r_frame_rate: '30/1',
          codec_name: 'h264',
        }],
      });
    }),
  })),
}));

describe('VideoImportService Performance Tests', () => {
  let service: VideoImportService;
  let testDir: string;
  let monitor: PerformanceMonitor;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `video-import-perf-${Date.now()}`);
    await fs.ensureDir(testDir);
    service = new VideoImportService(testDir);
    monitor = new PerformanceMonitor();
  });

  afterEach(async () => {
    await fs.remove(testDir);
    if (global.gc) global.gc();
  });

  describe('Concurrent Import Handling', () => {
    it('should handle multiple concurrent imports without performance degradation', async () => {
      monitor.start();
      
      const importCount = 20;
      const imports = Array.from({ length: importCount }, (_, i) => 
        service.createImportJob({
          source: VideoSourceType.URL,
          url: `http://test.com/video${i}.mp4`,
          config: {
            transcribe: false,
            analyze: false,
          },
        })
      );

      const jobs = await Promise.all(imports);
      const metrics = monitor.stop();
      
      // Performance assertions
      expect(jobs).toHaveLength(importCount);
      expect(metrics.operationTime).toBeLessThan(1000); // Should queue quickly
      
      // Memory should not grow linearly with job count
      const memoryGrowthMB = (metrics.memoryUsage.peak.heapUsed - metrics.memoryUsage.before.heapUsed) / 1024 / 1024;
      const memoryPerJobMB = memoryGrowthMB / importCount;
      expect(memoryPerJobMB).toBeLessThan(1); // Less than 1MB per job
    });

    it('should maintain performance with job queue saturation', async () => {
      const queueSizes = [10, 50, 100, 500];
      const performanceResults: any[] = [];
      
      for (const size of queueSizes) {
        monitor.start();
        
        const jobs = await Promise.all(
          Array.from({ length: size }, (_, i) =>
            service.createImportJob({
              source: VideoSourceType.URL,
              url: `http://test.com/video${i}.mp4`,
              config: {},
            })
          )
        );
        
        const metrics = monitor.stop();
        
        performanceResults.push({
          queueSize: size,
          timePerJob: metrics.operationTime / size,
          memoryPerJob: (metrics.memoryUsage.peak.heapUsed - metrics.memoryUsage.before.heapUsed) / size / 1024,
        });
        
        // Cleanup
        jobs.forEach(job => service.cancelJob(job.id).catch(() => {}));
        
        if (global.gc) global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Performance should not degrade significantly with queue size
      const firstResult = performanceResults[0];
      const lastResult = performanceResults[performanceResults.length - 1];
      
      expect(lastResult.timePerJob).toBeLessThan(firstResult.timePerJob * 2); // Max 2x slower
      expect(lastResult.memoryPerJob).toBeLessThan(firstResult.memoryPerJob * 1.5); // Max 50% more memory
    });
  });

  describe('Memory Efficiency Tests', () => {
    it('should process large video metadata without excessive memory', async () => {
      monitor.start();
      
      // Mock large video file
      const largeVideoPath = path.join(testDir, 'large-video.mp4');
      await fs.writeFile(largeVideoPath, Buffer.alloc(10 * 1024)); // 10KB mock file
      
      const job = await service.createImportJob({
        source: VideoSourceType.FILE,
        filePath: largeVideoPath,
        config: {
          extractKeyframes: true,
          generateThumbnails: true,
        },
      });
      
      // Simulate metadata extraction
      const metadata = await service['extractMetadata'](largeVideoPath, job);
      
      const metrics = monitor.stop();
      
      // Memory usage should be reasonable
      const heapGrowthMB = (metrics.memoryUsage.peak.heapUsed - metrics.memoryUsage.before.heapUsed) / 1024 / 1024;
      expect(heapGrowthMB).toBeLessThan(50); // Less than 50MB for metadata
      
      // Operation should be fast
      expect(metrics.operationTime).toBeLessThan(500); // Less than 500ms
    });

    it('should handle memory pressure during cleanup operations', async () => {
      // Create many completed jobs
      const jobCount = 100;
      const jobs = await Promise.all(
        Array.from({ length: jobCount }, async (_, i) => {
          const job = await service.createImportJob({
            source: VideoSourceType.URL,
            url: `http://test.com/video${i}.mp4`,
            config: {},
          });
          
          // Simulate completion
          service['updateJobStatus'](job.id, ImportJobStatus.COMPLETED);
          job.completedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days old
          
          return job;
        })
      );
      
      monitor.start();
      
      // Run cleanup
      await service.cleanupOldImports(7);
      
      const metrics = monitor.stop();
      
      // Cleanup should be efficient
      expect(metrics.operationTime).toBeLessThan(1000); // Less than 1 second
      expect(metrics.cpuUsage.user + metrics.cpuUsage.system).toBeLessThan(500); // Less than 500ms CPU time
      
      // Should have cleaned up jobs
      const remainingJobs = service.getAllJobs();
      expect(remainingJobs.length).toBe(0);
    });
  });

  describe('Stream Processing Performance', () => {
    it('should efficiently process video streams without buffering entire file', async () => {
      let peakBufferSize = 0;
      const bufferSizes: number[] = [];
      
      // Create a mock video stream
      const createMockVideoStream = (sizeMB: number) => {
        let bytesGenerated = 0;
        const targetBytes = sizeMB * 1024 * 1024;
        
        return new Readable({
          highWaterMark: 64 * 1024, // 64KB chunks
          read() {
            if (bytesGenerated >= targetBytes) {
              this.push(null);
              return;
            }
            
            const chunkSize = Math.min(64 * 1024, targetBytes - bytesGenerated);
            const chunk = Buffer.alloc(chunkSize, 'video');
            bytesGenerated += chunkSize;
            
            // Track buffer usage
            const currentSize = this.readableLength || 0;
            bufferSizes.push(currentSize);
            peakBufferSize = Math.max(peakBufferSize, currentSize);
            
            this.push(chunk);
          }
        });
      };
      
      monitor.start();
      
      const videoStream = createMockVideoStream(100); // 100MB video
      const outputPath = path.join(testDir, 'streamed-video.mp4');
      const writeStream = fs.createWriteStream(outputPath);
      
      await new Promise((resolve, reject) => {
        videoStream
          .pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });
      
      const metrics = monitor.stop();
      
      // Stream processing should be efficient
      const throughputMBps = 100 / (metrics.operationTime / 1000);
      expect(throughputMBps).toBeGreaterThan(50); // At least 50MB/s
      
      // Should not buffer entire file
      const peakBufferMB = peakBufferSize / 1024 / 1024;
      expect(peakBufferMB).toBeLessThan(10); // Less than 10MB buffered at any time
    });
  });

  describe('Event System Performance', () => {
    it('should handle high-frequency progress events efficiently', async () => {
      const eventCounts = {
        progress: 0,
        status: 0,
      };
      
      const listeners = {
        progress: () => eventCounts.progress++,
        status: () => eventCounts.status++,
      };
      
      service.on('job:progress', listeners.progress);
      service.on('job:status', listeners.status);
      
      monitor.start();
      
      // Simulate rapid progress updates
      const job = await service.createImportJob({
        source: VideoSourceType.URL,
        url: 'http://test.com/video.mp4',
        config: {},
      });
      
      // Simulate 1000 progress updates
      for (let i = 0; i <= 100; i += 0.1) {
        service['updateJobProgress'](job.id, i);
      }
      
      const metrics = monitor.stop();
      
      // Event handling should be fast
      expect(metrics.operationTime).toBeLessThan(100); // Less than 100ms for 1000 events
      expect(eventCounts.progress).toBe(1000);
      
      // CPU usage should be minimal
      const cpuTimeMs = metrics.cpuUsage.user + metrics.cpuUsage.system;
      const cpuTimePerEvent = cpuTimeMs / eventCounts.progress;
      expect(cpuTimePerEvent).toBeLessThan(0.1); // Less than 0.1ms per event
      
      service.removeListener('job:progress', listeners.progress);
      service.removeListener('job:status', listeners.status);
    });

    it('should not leak memory with many event listeners', async () => {
      const listenerCounts = [10, 100, 1000];
      const memoryResults: any[] = [];
      
      for (const count of listenerCounts) {
        if (global.gc) global.gc();
        
        monitor.start();
        
        // Add many listeners
        const listeners: any[] = [];
        for (let i = 0; i < count; i++) {
          const listener = () => {};
          listeners.push(listener);
          service.on('job:progress', listener);
        }
        
        // Trigger events
        const job = await service.createImportJob({
          source: VideoSourceType.URL,
          url: 'http://test.com/video.mp4',
          config: {},
        });
        
        service['updateJobProgress'](job.id, 50);
        
        const beforeCleanup = process.memoryUsage();
        
        // Remove listeners
        listeners.forEach(listener => {
          service.removeListener('job:progress', listener);
        });
        
        if (global.gc) global.gc();
        
        const metrics = monitor.stop();
        const afterCleanup = process.memoryUsage();
        
        memoryResults.push({
          listenerCount: count,
          memoryBeforeCleanupMB: beforeCleanup.heapUsed / 1024 / 1024,
          memoryAfterCleanupMB: afterCleanup.heapUsed / 1024 / 1024,
          memoryLeakMB: (afterCleanup.heapUsed - metrics.memoryUsage.before.heapUsed) / 1024 / 1024,
        });
      }
      
      // Memory should be properly cleaned up
      memoryResults.forEach(result => {
        expect(result.memoryLeakMB).toBeLessThan(5); // Less than 5MB leak
      });
    });
  });

  describe('Platform Detection Performance', () => {
    it('should detect video platforms quickly', async () => {
      const testUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://www.facebook.com/video.php?v=123456',
        'https://www.instagram.com/p/ABC123/',
        'https://www.tiktok.com/@user/video/123456',
        'https://example.com/video.mp4',
        'https://vimeo.com/123456789',
        'https://twitter.com/user/status/123456',
      ];
      
      monitor.start();
      
      const results = testUrls.map(url => ({
        url,
        platform: service['detectPlatform'](url),
      }));
      
      const metrics = monitor.stop();
      
      // Platform detection should be instant
      expect(metrics.operationTime).toBeLessThan(1); // Less than 1ms total
      
      // Verify correct detection
      expect(results[0].platform).toBe('youtube');
      expect(results[1].platform).toBe('youtube');
      expect(results[2].platform).toBe('facebook');
      expect(results[3].platform).toBe('instagram');
      expect(results[4].platform).toBe('tiktok');
      expect(results[5].platform).toBe('generic');
    });
  });

  describe('Keyframe Extraction Performance', () => {
    it('should extract keyframes efficiently for long videos', async () => {
      const mockVideoPath = path.join(testDir, 'mock-video.mp4');
      await fs.writeFile(mockVideoPath, Buffer.alloc(1024)); // Mock file
      
      const job = await service.createImportJob({
        source: VideoSourceType.FILE,
        filePath: mockVideoPath,
        config: {
          extractKeyframes: true,
          keyframeInterval: 1, // Extract every second
        },
      });
      
      // Mock long video duration
      job.metadata = {
        id: job.id,
        source: VideoSourceType.FILE,
        duration: 3600, // 1 hour video
        width: 1920,
        height: 1080,
        fps: 30,
        fileSize: 1024 * 1024 * 1024, // 1GB
        originalFormat: 'mp4',
        importedAt: new Date(),
      };
      
      // Mock exec to simulate ffmpeg
      let extractionCount = 0;
      vi.spyOn(require('child_process'), 'exec').mockImplementation((cmd: any, cb: any) => {
        extractionCount++;
        if (cb) cb(null, { stdout: '', stderr: '' });
      });
      
      monitor.start();
      
      await service['extractKeyframes'](mockVideoPath, job);
      
      const metrics = monitor.stop();
      
      // Should have tried to extract many keyframes
      expect(extractionCount).toBe(720); // 3600 seconds / 5 second interval
      
      // But should complete in reasonable time (parallel processing)
      expect(metrics.operationTime).toBeLessThan(5000); // Less than 5 seconds
      
      vi.restoreAllMocks();
    });
  });

  describe('Performance Regression Tests', () => {
    it('should maintain consistent performance across operations', async () => {
      const operations = [
        { name: 'createJob', fn: () => service.createImportJob({ source: VideoSourceType.URL, url: 'http://test.com/video.mp4', config: {} }) },
        { name: 'getJob', fn: () => service.getJob('test-id') },
        { name: 'getAllJobs', fn: () => service.getAllJobs() },
        { name: 'detectPlatform', fn: () => service['detectPlatform']('https://youtube.com/watch?v=123') },
      ];
      
      const benchmarks: any[] = [];
      
      for (const op of operations) {
        const samples: number[] = [];
        
        // Run operation multiple times to get average
        for (let i = 0; i < 1000; i++) {
          const start = performance.now();
          await op.fn();
          samples.push(performance.now() - start);
        }
        
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        const sorted = samples.sort((a, b) => a - b);
        const p95 = sorted[Math.floor(samples.length * 0.95)];
        const p99 = sorted[Math.floor(samples.length * 0.99)];
        
        benchmarks.push({
          operation: op.name,
          avgMs: avg,
          p95Ms: p95,
          p99Ms: p99,
        });
      }
      
      // Log benchmarks for regression tracking
      console.log('Performance Benchmarks:', benchmarks);
      
      // Assert reasonable performance
      benchmarks.forEach(benchmark => {
        expect(benchmark.avgMs).toBeLessThan(10); // Average under 10ms
        expect(benchmark.p99Ms).toBeLessThan(50); // 99th percentile under 50ms
      });
    });
  });
});

// Helper to run with performance monitoring
export async function runPerformanceTest(testName: string, fn: () => Promise<void>) {
  console.log(`\n=== ${testName} ===`);
  
  const monitor = new PerformanceMonitor();
  monitor.start();
  
  try {
    await fn();
    const metrics = monitor.stop();
    
    console.log('Performance Metrics:');
    console.log(`  Time: ${metrics.operationTime.toFixed(2)}ms`);
    console.log(`  Memory Growth: ${((metrics.memoryUsage.after.heapUsed - metrics.memoryUsage.before.heapUsed) / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Peak Memory: ${(metrics.memoryUsage.peak.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  CPU Time: ${(metrics.cpuUsage.user + metrics.cpuUsage.system).toFixed(2)}ms`);
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}