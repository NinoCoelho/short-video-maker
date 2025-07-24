import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueueService, QueuePriority, QueueItemStatus, QueueItem } from '../QueueService';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  queueOperations: {
    addToQueueMs: 1,           // Max time to add item to queue
    processQueueMs: 10,        // Max time to start processing
    prioritySortMs: 5,         // Max time for priority sorting
  },
  throughput: {
    itemsPerSecond: 1000,      // Min items processed per second
    concurrentItems: 100,      // Concurrent items to handle
  },
  memory: {
    perItemKB: 10,             // Max memory per queue item
    totalQueueMB: 100,         // Max total queue memory
  },
  eventSystem: {
    eventEmissionMs: 0.1,      // Max time to emit event
    listenerCallMs: 0.5,       // Max time for listener execution
  }
};

// Helper class for performance measurement
class QueuePerformanceAnalyzer {
  private metrics: Map<string, number[]> = new Map();
  
  record(metric: string, value: number) {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    this.metrics.get(metric)!.push(value);
  }
  
  getStats(metric: string) {
    const values = this.metrics.get(metric) || [];
    if (values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      p50: sorted[Math.floor(values.length * 0.5)],
      p95: sorted[Math.floor(values.length * 0.95)],
      p99: sorted[Math.floor(values.length * 0.99)],
    };
  }
  
  getAllStats() {
    const stats: any = {};
    for (const [metric, _] of this.metrics) {
      stats[metric] = this.getStats(metric);
    }
    return stats;
  }
}

describe('QueueService Performance Tests', () => {
  let queueService: QueueService;
  let analyzer: QueuePerformanceAnalyzer;

  beforeEach(() => {
    // Create new instance for each test to avoid interference
    QueueService['instance'] = undefined as any;
    queueService = QueueService.getInstance({
      maxConcurrent: 10,
      retryDelay: 100,
      defaultMaxRetries: 3,
    });
    analyzer = new QueuePerformanceAnalyzer();
  });

  afterEach(() => {
    if (global.gc) global.gc();
  });

  describe('Queue Operations Performance', () => {
    it('should add items to queue with minimal overhead', async () => {
      const itemCount = 10000;
      queueService.createQueue('perf-test');
      
      const startTime = performance.now();
      const addTimes: number[] = [];
      
      for (let i = 0; i < itemCount; i++) {
        const itemStart = performance.now();
        await queueService.addToQueue('perf-test', { id: i, data: `item-${i}` });
        addTimes.push(performance.now() - itemStart);
      }
      
      const totalTime = performance.now() - startTime;
      
      // Calculate statistics
      const avgAddTime = addTimes.reduce((a, b) => a + b, 0) / addTimes.length;
      const maxAddTime = Math.max(...addTimes);
      
      expect(avgAddTime).toBeLessThan(PERFORMANCE_THRESHOLDS.queueOperations.addToQueueMs);
      expect(maxAddTime).toBeLessThan(PERFORMANCE_THRESHOLDS.queueOperations.addToQueueMs * 10);
      expect(totalTime).toBeLessThan(itemCount * 2); // Should be much faster than 2ms per item
    });

    it('should maintain performance with priority sorting', async () => {
      queueService.createQueue('priority-test');
      
      // Add items with random priorities
      const priorities = [QueuePriority.LOW, QueuePriority.NORMAL, QueuePriority.HIGH, QueuePriority.URGENT];
      const itemCount = 1000;
      
      for (let i = 0; i < itemCount; i++) {
        const priority = priorities[Math.floor(Math.random() * priorities.length)];
        const startTime = performance.now();
        
        await queueService.addToQueue('priority-test', { id: i }, priority);
        
        analyzer.record('priorityInsert', performance.now() - startTime);
      }
      
      const stats = analyzer.getStats('priorityInsert');
      expect(stats!.avg).toBeLessThan(PERFORMANCE_THRESHOLDS.queueOperations.prioritySortMs);
      expect(stats!.p99).toBeLessThan(PERFORMANCE_THRESHOLDS.queueOperations.prioritySortMs * 2);
    });
  });

  describe('Throughput Performance', () => {
    it('should process high volume of items efficiently', async () => {
      queueService.createQueue('throughput-test');
      
      let processedCount = 0;
      const processedItems: number[] = [];
      
      // Register fast processor
      queueService.registerProcessor('throughput-test', async (item: QueueItem) => {
        const startTime = performance.now();
        processedCount++;
        processedItems.push(item.data.id);
        
        // Simulate minimal processing
        await new Promise(resolve => setImmediate(resolve));
        
        analyzer.record('processingTime', performance.now() - startTime);
      });
      
      const itemCount = 1000;
      const startTime = performance.now();
      
      // Add all items
      const promises = Array.from({ length: itemCount }, (_, i) =>
        queueService.addToQueue('throughput-test', { id: i })
      );
      
      await Promise.all(promises);
      
      // Wait for processing to complete
      while (processedCount < itemCount) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const totalTime = performance.now() - startTime;
      const throughput = itemCount / (totalTime / 1000); // items per second
      
      expect(throughput).toBeGreaterThan(PERFORMANCE_THRESHOLDS.throughput.itemsPerSecond);
      expect(processedItems).toHaveLength(itemCount);
      
      const processingStats = analyzer.getStats('processingTime');
      expect(processingStats!.avg).toBeLessThan(5); // Average processing under 5ms
    });

    it('should handle concurrent processing efficiently', async () => {
      const concurrentLimit = 10;
      queueService.setDownloadConcurrency(concurrentLimit);
      
      let activeCount = 0;
      let maxActive = 0;
      const concurrencyHistory: number[] = [];
      
      // Register processor that tracks concurrency
      queueService.registerProcessor('download', async (item: QueueItem) => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        concurrencyHistory.push(activeCount);
        
        // Simulate download
        await new Promise(resolve => setTimeout(resolve, 50));
        
        activeCount--;
      });
      
      // Add many download tasks
      const downloads = Array.from({ length: 100 }, (_, i) =>
        queueService.addDownload({
          url: `http://test.com/file${i}.mp4`,
          videoId: `video-${i}`,
          jobId: `job-${i}`,
        })
      );
      
      const startTime = performance.now();
      await Promise.all(downloads);
      
      // Wait for all to complete
      while (activeCount > 0 || queueService.getQueueStatus('download').pending > 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const totalTime = performance.now() - startTime;
      
      // Should respect concurrency limit
      expect(maxActive).toBeLessThanOrEqual(concurrentLimit);
      expect(maxActive).toBeGreaterThan(1); // Should use concurrency
      
      // Should complete in reasonable time
      const expectedMinTime = (100 / concurrentLimit) * 50; // Ideal parallel time
      expect(totalTime).toBeLessThan(expectedMinTime * 1.5); // Allow 50% overhead
    });
  });

  describe('Memory Efficiency', () => {
    it('should maintain low memory footprint with large queues', async () => {
      const queues = ['queue1', 'queue2', 'queue3'];
      queues.forEach(q => queueService.createQueue(q));
      
      const initialMemory = process.memoryUsage().heapUsed;
      const itemsPerQueue = 10000;
      
      // Fill queues
      for (const queueName of queues) {
        for (let i = 0; i < itemsPerQueue; i++) {
          await queueService.addToQueue(queueName, {
            id: i,
            smallData: `item-${i}`, // Small payload
          });
        }
      }
      
      const afterFillMemory = process.memoryUsage().heapUsed;
      const memoryUsedBytes = afterFillMemory - initialMemory;
      const memoryPerItemKB = (memoryUsedBytes / (queues.length * itemsPerQueue)) / 1024;
      
      expect(memoryPerItemKB).toBeLessThan(PERFORMANCE_THRESHOLDS.memory.perItemKB);
      
      // Total memory should be reasonable
      const totalMemoryMB = memoryUsedBytes / 1024 / 1024;
      expect(totalMemoryMB).toBeLessThan(PERFORMANCE_THRESHOLDS.memory.totalQueueMB);
    });

    it('should properly clean up completed items', async () => {
      queueService.createQueue('cleanup-test');
      
      // Register instant processor
      queueService.registerProcessor('cleanup-test', async (item: QueueItem) => {
        // Instant completion
      });
      
      // Process many items
      const itemCount = 1000;
      for (let i = 0; i < itemCount; i++) {
        await queueService.addToQueue('cleanup-test', { id: i });
      }
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const beforeCleanup = process.memoryUsage().heapUsed;
      
      // Clean up completed items
      const cleanedCount = queueService.clearCompletedItems('cleanup-test');
      
      if (global.gc) global.gc();
      
      const afterCleanup = process.memoryUsage().heapUsed;
      const memoryFreed = beforeCleanup - afterCleanup;
      
      expect(cleanedCount).toBeGreaterThan(0);
      expect(memoryFreed).toBeGreaterThan(0); // Should free some memory
    });
  });

  describe('Event System Performance', () => {
    it('should emit events with minimal overhead', async () => {
      const eventCount = 10000;
      const emissionTimes: number[] = [];
      
      // Add listener
      let receivedCount = 0;
      queueService.on('download:progress', () => {
        receivedCount++;
      });
      
      // Emit many events
      for (let i = 0; i < eventCount; i++) {
        const startTime = performance.now();
        
        queueService.emitDownloadProgress({
          jobId: 'test-job',
          videoId: 'test-video',
          progress: i / eventCount * 100,
          downloadedBytes: i * 1024,
          totalBytes: eventCount * 1024,
          speed: 1024 * 1024,
          eta: 60,
          timestamp: new Date().toISOString(),
        });
        
        emissionTimes.push(performance.now() - startTime);
      }
      
      const avgEmissionTime = emissionTimes.reduce((a, b) => a + b, 0) / emissionTimes.length;
      const maxEmissionTime = Math.max(...emissionTimes);
      
      expect(receivedCount).toBe(eventCount);
      expect(avgEmissionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.eventSystem.eventEmissionMs);
      expect(maxEmissionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.eventSystem.eventEmissionMs * 10);
    });

    it('should handle many listeners efficiently', async () => {
      const listenerCount = 100;
      const listeners: any[] = [];
      const executionTimes: number[] = [];
      
      // Add many listeners
      for (let i = 0; i < listenerCount; i++) {
        const listener = () => {
          const start = performance.now();
          // Simulate some work
          Math.sqrt(Math.random());
          executionTimes.push(performance.now() - start);
        };
        listeners.push(listener);
        queueService.on('download:complete', listener);
      }
      
      // Emit event
      const emitStart = performance.now();
      queueService.emitDownloadComplete({
        jobId: 'test-job',
        videoId: 'test-video',
        filePath: '/path/to/file.mp4',
        fileSize: 1024 * 1024,
        duration: 120,
        timestamp: new Date().toISOString(),
      });
      const emitTime = performance.now() - emitStart;
      
      // All listeners should execute quickly
      expect(executionTimes).toHaveLength(listenerCount);
      expect(emitTime).toBeLessThan(listenerCount * PERFORMANCE_THRESHOLDS.eventSystem.listenerCallMs);
      
      // Cleanup
      listeners.forEach(l => queueService.removeListener('download:complete', l));
    });
  });

  describe('Download Queue Specific Performance', () => {
    it('should track download progress efficiently', async () => {
      const progressUpdates = 1000;
      const updateTimes: number[] = [];
      
      // Add download item
      const jobId = await queueService.addDownload({
        url: 'http://test.com/large-file.mp4',
        videoId: 'test-video',
        jobId: 'test-job',
      });
      
      // Simulate many progress updates
      for (let i = 0; i <= progressUpdates; i++) {
        const progress = (i / progressUpdates) * 100;
        const startTime = performance.now();
        
        queueService.emit('download:progress:update', {
          itemId: jobId,
          progress,
          downloadedBytes: i * 1024 * 1024,
          totalBytes: progressUpdates * 1024 * 1024,
          speed: 10 * 1024 * 1024, // 10MB/s
          eta: (progressUpdates - i) / 10,
        });
        
        updateTimes.push(performance.now() - startTime);
      }
      
      const avgUpdateTime = updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length;
      expect(avgUpdateTime).toBeLessThan(1); // Less than 1ms per update
      
      // Get final progress
      const item = queueService.getDownloadProgress('test-job');
      expect(item?.progress).toBe(100);
    });

    it('should handle download cancellation quickly', async () => {
      // Add many downloads
      const downloads = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          queueService.addDownload({
            url: `http://test.com/file${i}.mp4`,
            videoId: `video-${i}`,
            jobId: `job-${i}`,
          })
        )
      );
      
      // Cancel them all
      const cancelTimes: number[] = [];
      for (let i = 0; i < downloads.length; i++) {
        const startTime = performance.now();
        await queueService.cancelDownload(`job-${i}`);
        cancelTimes.push(performance.now() - startTime);
      }
      
      const avgCancelTime = cancelTimes.reduce((a, b) => a + b, 0) / cancelTimes.length;
      expect(avgCancelTime).toBeLessThan(1); // Less than 1ms per cancellation
      
      // Queue should be empty
      const status = queueService.getQueueStatus('download');
      expect(status.pending).toBe(0);
      expect(status.processing).toBe(0);
    });
  });

  describe('Performance Under Stress', () => {
    it('should maintain stability under sustained load', async () => {
      const duration = 2000; // 2 seconds
      const queues = ['stress1', 'stress2', 'stress3'];
      queues.forEach(q => queueService.createQueue(q));
      
      let operations = 0;
      const errors: any[] = [];
      const startTime = performance.now();
      
      // Continuous operations for duration
      const stressTest = async () => {
        while (performance.now() - startTime < duration) {
          try {
            const queue = queues[Math.floor(Math.random() * queues.length)];
            const operation = Math.random();
            
            if (operation < 0.6) {
              // Add item (60%)
              await queueService.addToQueue(queue, { id: operations++ });
            } else if (operation < 0.8) {
              // Get status (20%)
              queueService.getQueueStatus(queue);
            } else {
              // Clear completed (20%)
              queueService.clearCompletedItems(queue);
            }
          } catch (error) {
            errors.push(error);
          }
          
          // Small delay to prevent CPU saturation
          if (operations % 100 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
      };
      
      // Run multiple concurrent stress testers
      await Promise.all([
        stressTest(),
        stressTest(),
        stressTest(),
      ]);
      
      expect(errors).toHaveLength(0); // No errors during stress
      expect(operations).toBeGreaterThan(1000); // Should handle many operations
    });
  });

  describe('Performance Benchmarks', () => {
    it('should generate comprehensive performance report', async () => {
      const report = {
        timestamp: new Date().toISOString(),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          cpus: require('os').cpus().length,
        },
        benchmarks: {} as any,
      };
      
      // Benchmark 1: Queue operations
      const queueOps = await (async () => {
        queueService.createQueue('benchmark');
        const count = 1000;
        const start = performance.now();
        
        for (let i = 0; i < count; i++) {
          await queueService.addToQueue('benchmark', { id: i });
        }
        
        return {
          operationCount: count,
          totalTimeMs: performance.now() - start,
          opsPerSecond: count / ((performance.now() - start) / 1000),
        };
      })();
      
      report.benchmarks.queueOperations = queueOps;
      
      // Benchmark 2: Event system
      const eventBench = await (async () => {
        let eventCount = 0;
        const listener = () => eventCount++;
        queueService.on('test-event', listener);
        
        const count = 10000;
        const start = performance.now();
        
        for (let i = 0; i < count; i++) {
          queueService.emit('test-event');
        }
        
        queueService.removeListener('test-event', listener);
        
        return {
          eventCount: count,
          totalTimeMs: performance.now() - start,
          eventsPerSecond: count / ((performance.now() - start) / 1000),
        };
      })();
      
      report.benchmarks.eventSystem = eventBench;
      
      // Log report
      console.log('Queue Service Performance Report:', JSON.stringify(report, null, 2));
      
      // Validate benchmarks
      expect(report.benchmarks.queueOperations.opsPerSecond).toBeGreaterThan(500);
      expect(report.benchmarks.eventSystem.eventsPerSecond).toBeGreaterThan(10000);
    });
  });
});