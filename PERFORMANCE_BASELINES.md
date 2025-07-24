# Video Import Feature - Performance Baselines

This document defines the performance baselines and benchmarks for the video import feature. These baselines are used to ensure the system maintains acceptable performance under various workloads.

## Table of Contents
- [Overview](#overview)
- [Performance Baselines](#performance-baselines)
- [Testing Methodology](#testing-methodology)
- [Running Performance Tests](#running-performance-tests)
- [Interpreting Results](#interpreting-results)
- [Optimization Guidelines](#optimization-guidelines)

## Overview

The video import feature is designed to handle large-scale video processing with the following performance characteristics:

- **Concurrent Processing**: Handle 10+ simultaneous imports
- **Memory Efficiency**: Process videos larger than available RAM using streaming
- **CPU Optimization**: Utilize multi-core processing without blocking
- **Network Bandwidth**: Maximize available bandwidth for downloads
- **Cache Effectiveness**: 80%+ cache hit rate for repeated operations

## Performance Baselines

### Memory Usage

| Metric | Baseline | Critical Threshold | Description |
|--------|----------|-------------------|-------------|
| Heap Usage | < 200MB | 500MB | Maximum heap memory growth during processing |
| External Memory | < 500MB | 1GB | Buffer memory for video streams |
| RSS Growth | < 300MB | 600MB | Total memory growth per import |
| Per-Job Memory | < 10MB | 20MB | Memory overhead per import job |
| Stream Buffer | < 50MB | 100MB | Maximum buffer size per stream |

### CPU Usage

| Metric | Baseline | Critical Threshold | Description |
|--------|----------|-------------------|-------------|
| CPU Utilization | < 80% | 95% | Maximum sustained CPU usage |
| Event Loop Blocking | < 50ms | 100ms | Maximum blocking time |
| Processing Efficiency | > 20% | 10% | Minimum CPU utilization |

### Throughput

| Metric | Baseline | Critical Threshold | Description |
|--------|----------|-------------------|-------------|
| Processing Speed | > 10MB/s | 5MB/s | Minimum video processing throughput |
| Concurrent Jobs | 10 | 5 | Number of simultaneous imports |
| Queue Processing | < 100ms | 200ms | Time to process queue item |
| Items per Second | > 1000 | 500 | Queue throughput rate |

### I/O Performance

| Metric | Baseline | Critical Threshold | Description |
|--------|----------|-------------------|-------------|
| Disk Write | > 50MB/s | 25MB/s | Minimum disk write speed |
| Disk Read | > 100MB/s | 50MB/s | Minimum disk read speed |
| Network Bandwidth | > 100MB/s | 50MB/s | Minimum download speed |
| Chunk Processing | < 10ms | 20ms | Time to process stream chunk |

### Database Performance

| Metric | Baseline | Critical Threshold | Description |
|--------|----------|-------------------|-------------|
| Query Time | < 50ms | 100ms | Maximum query execution time |
| Batch Insert Rate | > 1000/s | 500/s | Records inserted per second |
| Connection Pool | < 80% | 95% | Maximum pool utilization |

### Cache Performance

| Metric | Baseline | Critical Threshold | Description |
|--------|----------|-------------------|-------------|
| Hit Rate | > 80% | 60% | Cache hit percentage |
| Eviction Time | < 10ms | 20ms | Time to evict cache entries |
| Memory Usage | < 500MB | 1GB | Total cache memory |

## Testing Methodology

### Test Environment

```yaml
Recommended Test Environment:
  - CPU: 4+ cores
  - RAM: 8GB+ available
  - Disk: SSD with 100GB+ free space
  - Network: 100Mbps+ connection
  - Node.js: v18+ with --expose-gc flag
```

### Test Scenarios

1. **Memory Leak Detection**
   - Run 100+ import cycles
   - Monitor heap growth between cycles
   - Verify memory returns to baseline

2. **Concurrent Load Testing**
   - Process 10-20 simultaneous imports
   - Verify CPU and memory stay within limits
   - Ensure no deadlocks or race conditions

3. **Large File Processing**
   - Process 1GB+ video files
   - Verify streaming without loading entire file
   - Monitor memory usage remains constant

4. **Sustained Load Testing**
   - Run continuous imports for 1+ hours
   - Monitor for performance degradation
   - Verify system stability

## Running Performance Tests

### Quick Test
```bash
# Run all performance tests
npm run test:performance

# Run specific test suite
npm run test -- src/services/__tests__/ImportPipelineService.performance.test.ts

# Run with memory profiling
node --expose-gc ./node_modules/.bin/vitest run **/**.performance.test.ts
```

### Full Benchmark
```bash
# Run comprehensive benchmark
node --expose-gc src/services/__tests__/performance-runner.ts

# Generate detailed report
npm run benchmark:full
```

### Continuous Monitoring
```bash
# Start performance monitoring
npm run monitor:performance

# View real-time metrics
npm run metrics:dashboard
```

## Interpreting Results

### Performance Report Structure

```json
{
  "timestamp": "2024-01-20T10:00:00Z",
  "system": {
    "platform": "darwin",
    "cpus": 8,
    "totalMemoryGB": 16,
    "nodeVersion": "v18.17.0"
  },
  "results": {
    "memory": {
      "heapGrowthMB": 150,
      "peakExternalMB": 400,
      "rssGrowthMB": 250
    },
    "throughput": {
      "processingTimeSec": 10,
      "throughputMBps": 15
    }
  }
}
```

### Red Flags

- **Memory Growth**: Consistent growth without plateauing
- **CPU Spikes**: Sustained 100% CPU usage
- **Throughput Drop**: Progressive decrease in processing speed
- **Error Rate**: > 1% failure rate

### Green Flags

- **Stable Memory**: Memory usage plateaus after initial growth
- **Efficient CPU**: 40-70% utilization with good throughput
- **Consistent Speed**: Throughput remains stable over time
- **Low Errors**: < 0.1% error rate

## Optimization Guidelines

### Memory Optimization

1. **Use Streaming APIs**
   ```typescript
   // Good: Stream processing
   const stream = fs.createReadStream(videoPath);
   stream.pipe(processor).pipe(output);
   
   // Bad: Loading entire file
   const data = fs.readFileSync(videoPath);
   ```

2. **Implement Backpressure**
   ```typescript
   readable.on('data', (chunk) => {
     if (!writable.write(chunk)) {
       readable.pause();
     }
   });
   ```

3. **Clear References**
   ```typescript
   // Clear large objects when done
   largeObject = null;
   if (global.gc) global.gc();
   ```

### CPU Optimization

1. **Use Worker Threads**
   ```typescript
   const { Worker } = require('worker_threads');
   const worker = new Worker('./video-processor.js');
   ```

2. **Batch Operations**
   ```typescript
   // Process in batches to avoid blocking
   for (const batch of chunks(items, 100)) {
     await processBatch(batch);
     await new Promise(resolve => setImmediate(resolve));
   }
   ```

3. **Optimize Algorithms**
   - Use efficient data structures (Map vs Object)
   - Minimize nested loops
   - Cache computed values

### I/O Optimization

1. **Parallel I/O Operations**
   ```typescript
   await Promise.all([
     fs.readFile(file1),
     fs.readFile(file2),
     fs.readFile(file3)
   ]);
   ```

2. **Use Buffer Pools**
   ```typescript
   const bufferPool = Buffer.allocUnsafe(1024 * 1024);
   // Reuse buffer instead of allocating new ones
   ```

3. **Implement Caching**
   ```typescript
   const cache = new LRUCache({ max: 500 });
   if (cache.has(key)) return cache.get(key);
   ```

### Network Optimization

1. **Connection Pooling**
   ```typescript
   const agent = new http.Agent({
     keepAlive: true,
     maxSockets: 10
   });
   ```

2. **Compression**
   ```typescript
   app.use(compression({
     threshold: 1024,
     level: 6
   }));
   ```

3. **Retry Logic**
   ```typescript
   async function downloadWithRetry(url, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await download(url);
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await sleep(Math.pow(2, i) * 1000);
       }
     }
   }
   ```

## Monitoring in Production

### Key Metrics to Track

1. **Application Metrics**
   - Import job success rate
   - Average processing time
   - Queue depth and latency
   - Error rates by type

2. **System Metrics**
   - CPU usage per core
   - Memory usage and GC frequency
   - Disk I/O and space
   - Network throughput

3. **Business Metrics**
   - Videos processed per hour
   - Average video size
   - User wait times
   - Storage costs

### Alerting Thresholds

```yaml
alerts:
  - name: high_memory_usage
    condition: memory_usage > 80%
    duration: 5m
    
  - name: slow_processing
    condition: processing_time > 2x baseline
    duration: 10m
    
  - name: high_error_rate
    condition: error_rate > 5%
    duration: 5m
```

## Continuous Improvement

1. **Regular Benchmarking**: Run performance tests weekly
2. **Trend Analysis**: Track metrics over time
3. **A/B Testing**: Test optimizations in production
4. **User Feedback**: Monitor user-reported performance issues

## Appendix

### Performance Test Commands

```bash
# Memory profiling
node --inspect --expose-gc app.js
chrome://inspect

# CPU profiling
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# Heap snapshots
node --heapsnapshot-signal=SIGUSR2 app.js
kill -USR2 <pid>

# Flame graphs
0x -o app.js
```

### Useful Tools

- **Clinic.js**: Performance profiling toolkit
- **0x**: Flame graph profiler
- **autocannon**: HTTP benchmarking
- **artillery**: Load testing
- **pprof**: Google's profiling tools

---

*Last Updated: January 2024*
*Version: 1.0.0*