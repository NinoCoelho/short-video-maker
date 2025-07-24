import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

interface CacheOperation {
  timestamp: number;
  operation: 'get' | 'set' | 'delete' | 'clear';
  key: string;
  hit: boolean;
  size?: number;
  ttl?: number;
  executionTime: number;
}

interface CacheMetrics {
  timestamp: number;
  totalOperations: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  averageAccessTime: number;
  totalCacheSize: number;
  keyCount: number;
  evictions: number;
}

interface CacheBottleneck {
  type: 'low_hit_rate' | 'slow_access' | 'cache_bloat' | 'frequent_evictions';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metrics: Partial<CacheMetrics>;
  recommendations: string[];
}

interface CachePattern {
  key: string;
  accessCount: number;
  hitRate: number;
  averageSize: number;
  lastAccessed: number;
  pattern: 'hot' | 'cold' | 'sporadic';
}

export class CacheAnalyzer extends EventEmitter {
  private operations: CacheOperation[] = [];
  private metrics: CacheMetrics[] = [];
  private keyStats = new Map<string, {
    hits: number;
    misses: number;
    totalSize: number;
    accessCount: number;
    lastAccessed: number;
    sizes: number[];
  }>();
  private isAnalyzing = false;
  private intervalId?: NodeJS.Timeout;
  private readonly maxOperations = 10000;

  constructor(
    private options = {
      metricsInterval: 10000, // 10 seconds
      slowAccessThreshold: 10, // 10ms
      lowHitRateThreshold: 0.7, // 70%
      outputPath: 'performance/reports'
    }
  ) {
    super();
  }

  start(): void {
    if (this.isAnalyzing) return;

    this.isAnalyzing = true;
    
    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, this.options.metricsInterval);

    console.log('Cache analyzer started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isAnalyzing) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isAnalyzing = false;
    console.log('Cache analyzer stopped');
    this.emit('stopped');
  }

  recordOperation(operation: CacheOperation): void {
    this.operations.push(operation);

    // Keep only recent operations
    if (this.operations.length > this.maxOperations) {
      this.operations.shift();
    }

    // Update key statistics
    this.updateKeyStats(operation);

    this.emit('operation', operation);

    // Check for immediate issues
    if (operation.executionTime > this.options.slowAccessThreshold) {
      this.emit('slow_cache_access', operation);
    }
  }

  private updateKeyStats(operation: CacheOperation): void {
    const { key, hit, size = 0, timestamp } = operation;
    
    if (!this.keyStats.has(key)) {
      this.keyStats.set(key, {
        hits: 0,
        misses: 0,
        totalSize: 0,
        accessCount: 0,
        lastAccessed: timestamp,
        sizes: []
      });
    }

    const stats = this.keyStats.get(key)!;
    stats.accessCount++;
    stats.lastAccessed = timestamp;

    if (operation.operation === 'get') {
      if (hit) {
        stats.hits++;
      } else {
        stats.misses++;
      }
    } else if (operation.operation === 'set' && size > 0) {
      stats.totalSize += size;
      stats.sizes.push(size);
    }
  }

  private collectMetrics(): void {
    const now = Date.now();
    const recentOps = this.operations.filter(op => 
      now - op.timestamp < this.options.metricsInterval
    );

    if (recentOps.length === 0) return;

    const getOps = recentOps.filter(op => op.operation === 'get');
    const hitCount = getOps.filter(op => op.hit).length;
    const missCount = getOps.filter(op => !op.hit).length;
    const hitRate = getOps.length > 0 ? hitCount / getOps.length : 0;

    const averageAccessTime = recentOps.length > 0
      ? recentOps.reduce((sum, op) => sum + op.executionTime, 0) / recentOps.length
      : 0;

    // Calculate current cache size and key count
    const { totalCacheSize, keyCount } = this.calculateCacheSize();

    // Count evictions (deletes not initiated by user)
    const evictions = recentOps.filter(op => 
      op.operation === 'delete' && !op.key.includes('user_')
    ).length;

    const metrics: CacheMetrics = {
      timestamp: now,
      totalOperations: recentOps.length,
      hitCount,
      missCount,
      hitRate,
      averageAccessTime,
      totalCacheSize,
      keyCount,
      evictions
    };

    this.metrics.push(metrics);
    this.emit('metrics', metrics);

    // Analyze bottlenecks
    this.analyzeBottlenecks(recentOps, metrics);
  }

  private calculateCacheSize(): { totalCacheSize: number; keyCount: number } {
    let totalSize = 0;
    let activeKeys = 0;

    this.keyStats.forEach((stats, key) => {
      if (stats.sizes.length > 0) {
        // Use the average size for this key
        const avgSize = stats.totalSize / stats.sizes.length;
        totalSize += avgSize;
        activeKeys++;
      }
    });

    return { totalCacheSize: totalSize, keyCount: activeKeys };
  }

  private analyzeBottlenecks(operations: CacheOperation[], metrics: CacheMetrics): void {
    const bottlenecks: CacheBottleneck[] = [];

    // Low hit rate analysis
    if (metrics.hitRate < this.options.lowHitRateThreshold) {
      bottlenecks.push({
        type: 'low_hit_rate',
        severity: this.getHitRateSeverity(metrics.hitRate),
        description: `Low cache hit rate: ${(metrics.hitRate * 100).toFixed(2)}%`,
        metrics: { hitRate: metrics.hitRate, hitCount: metrics.hitCount, missCount: metrics.missCount },
        recommendations: [
          'Review cache key patterns and ensure consistency',
          'Increase cache TTL for frequently accessed data',
          'Implement cache warming strategies',
          'Optimize cache size and eviction policies',
          'Consider pre-loading common data patterns'
        ]
      });
    }

    // Slow access analysis
    const slowOps = operations.filter(op => op.executionTime > this.options.slowAccessThreshold);
    if (slowOps.length > operations.length * 0.1) {
      bottlenecks.push({
        type: 'slow_access',
        severity: this.getSeverityByPercentage(slowOps.length / operations.length),
        description: `${slowOps.length} slow cache operations detected (>${this.options.slowAccessThreshold}ms)`,
        metrics: { averageAccessTime: metrics.averageAccessTime },
        recommendations: [
          'Optimize cache storage backend performance',
          'Consider in-memory caching for hot data',
          'Reduce serialization overhead',
          'Check network latency for distributed caches',
          'Implement cache partitioning or sharding'
        ]
      });
    }

    // Cache bloat analysis
    const avgKeySize = metrics.keyCount > 0 ? metrics.totalCacheSize / metrics.keyCount : 0;
    if (avgKeySize > 100 * 1024 || metrics.totalCacheSize > 100 * 1024 * 1024) { // 100KB per key or 100MB total
      bottlenecks.push({
        type: 'cache_bloat',
        severity: avgKeySize > 1024 * 1024 ? 'high' : 'medium', // 1MB per key
        description: `Large cache detected - Total: ${(metrics.totalCacheSize / 1024 / 1024).toFixed(2)}MB, Avg per key: ${(avgKeySize / 1024).toFixed(2)}KB`,
        metrics: { totalCacheSize: metrics.totalCacheSize, keyCount: metrics.keyCount },
        recommendations: [
          'Implement data compression for cached values',
          'Review what data is being cached and optimize payload size',
          'Use more aggressive TTL for large objects',
          'Consider storing references instead of full objects',
          'Implement cache size limits with LRU eviction'
        ]
      });
    }

    // Frequent evictions analysis
    const evictionRate = metrics.evictions / metrics.totalOperations;
    if (evictionRate > 0.1) { // More than 10% evictions
      bottlenecks.push({
        type: 'frequent_evictions',
        severity: evictionRate > 0.3 ? 'critical' : evictionRate > 0.2 ? 'high' : 'medium',
        description: `High eviction rate: ${(evictionRate * 100).toFixed(2)}% of operations`,
        metrics: { evictions: metrics.evictions },
        recommendations: [
          'Increase cache size limits',
          'Review TTL settings for better retention',
          'Optimize eviction policies (LRU vs LFU)',
          'Consider cache warming for evicted hot data',
          'Monitor memory usage and adjust cache allocation'
        ]
      });
    }

    bottlenecks.forEach(bottleneck => {
      this.emit('bottleneck_detected', bottleneck);
    });
  }

  private getHitRateSeverity(hitRate: number): 'low' | 'medium' | 'high' | 'critical' {
    if (hitRate < 0.3) return 'critical';
    if (hitRate < 0.5) return 'high';
    if (hitRate < 0.7) return 'medium';
    return 'low';
  }

  private getSeverityByPercentage(percentage: number): 'low' | 'medium' | 'high' | 'critical' {
    if (percentage > 0.5) return 'critical';
    if (percentage > 0.3) return 'high';
    if (percentage > 0.15) return 'medium';
    return 'low';
  }

  analyzeCachePatterns(): CachePattern[] {
    const patterns: CachePattern[] = [];
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    this.keyStats.forEach((stats, key) => {
      const hitRate = stats.accessCount > 0 ? stats.hits / (stats.hits + stats.misses) : 0;
      const averageSize = stats.sizes.length > 0 ? stats.totalSize / stats.sizes.length : 0;
      const timeSinceLastAccess = now - stats.lastAccessed;

      let pattern: 'hot' | 'cold' | 'sporadic' = 'cold';
      
      if (stats.accessCount > 100 && timeSinceLastAccess < oneHour) {
        pattern = 'hot';
      } else if (stats.accessCount > 10 && hitRate > 0.5) {
        pattern = 'sporadic';
      }

      patterns.push({
        key,
        accessCount: stats.accessCount,
        hitRate,
        averageSize,
        lastAccessed: stats.lastAccessed,
        pattern
      });
    });

    return patterns.sort((a, b) => b.accessCount - a.accessCount);
  }

  getStats() {
    if (this.operations.length === 0) return null;

    const latest = this.operations[this.operations.length - 1];
    const oldest = this.operations[0];
    
    const getOps = this.operations.filter(op => op.operation === 'get');
    const setOps = this.operations.filter(op => op.operation === 'set');
    const deleteOps = this.operations.filter(op => op.operation === 'delete');
    
    const totalHits = getOps.filter(op => op.hit).length;
    const totalMisses = getOps.filter(op => !op.hit).length;
    const overallHitRate = getOps.length > 0 ? totalHits / getOps.length : 0;

    const slowOps = this.operations.filter(op => op.executionTime > this.options.slowAccessThreshold);

    const { totalCacheSize, keyCount } = this.calculateCacheSize();

    return {
      duration: latest.timestamp - oldest.timestamp,
      totalOperations: this.operations.length,
      operationBreakdown: {
        get: getOps.length,
        set: setOps.length,
        delete: deleteOps.length
      },
      overallHitRate,
      totalHits,
      totalMisses,
      averageAccessTime: this.operations.reduce((sum, op) => sum + op.executionTime, 0) / this.operations.length,
      slowOperations: slowOps.length,
      currentCacheSize: totalCacheSize,
      currentKeyCount: keyCount,
      cachePatterns: this.analyzeCachePatterns().slice(0, 20) // Top 20 patterns
    };
  }

  async generateReport(): Promise<string> {
    const stats = this.getStats();
    if (!stats) throw new Error('No cache data available');

    const keyAnalysis = this.analyzeKeyUsagePatterns();
    const performanceTrends = this.analyzePerformanceTrends();

    const report = {
      timestamp: new Date().toISOString(),
      duration: `${Math.round(stats.duration / 1000)}s`,
      summary: {
        totalOperations: stats.totalOperations,
        overallHitRate: `${(stats.overallHitRate * 100).toFixed(2)}%`,
        averageAccessTime: `${stats.averageAccessTime.toFixed(2)}ms`,
        currentCacheSize: `${(stats.currentCacheSize / 1024 / 1024).toFixed(2)} MB`,
        currentKeyCount: stats.currentKeyCount
      },
      operationBreakdown: stats.operationBreakdown,
      keyAnalysis,
      performanceTrends,
      cachePatterns: stats.cachePatterns,
      recommendations: this.generateRecommendations(stats)
    };

    const reportPath = path.join(this.options.outputPath, `cache-report-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }

  private analyzeKeyUsagePatterns() {
    const patterns = this.analyzeCachePatterns();
    
    const hotKeys = patterns.filter(p => p.pattern === 'hot');
    const coldKeys = patterns.filter(p => p.pattern === 'cold');
    const sporadicKeys = patterns.filter(p => p.pattern === 'sporadic');

    return {
      hotKeys: hotKeys.length,
      coldKeys: coldKeys.length,
      sporadicKeys: sporadicKeys.length,
      topHotKeys: hotKeys.slice(0, 10),
      topColdKeys: coldKeys.slice(0, 5),
      keyDistribution: {
        hot: `${((hotKeys.length / patterns.length) * 100).toFixed(1)}%`,
        cold: `${((coldKeys.length / patterns.length) * 100).toFixed(1)}%`,
        sporadic: `${((sporadicKeys.length / patterns.length) * 100).toFixed(1)}%`
      }
    };
  }

  private analyzePerformanceTrends() {
    if (this.metrics.length < 2) return { trends: [] };

    const latest = this.metrics[this.metrics.length - 1];
    const previous = this.metrics[this.metrics.length - 2];

    const trends = [];

    const hitRateChange = ((latest.hitRate - previous.hitRate) / (previous.hitRate || 0.01)) * 100;
    if (Math.abs(hitRateChange) > 10) {
      trends.push({
        metric: 'Hit Rate',
        change: `${hitRateChange > 0 ? '+' : ''}${hitRateChange.toFixed(1)}%`,
        significance: Math.abs(hitRateChange) > 30 ? 'high' : 'medium'
      });
    }

    const accessTimeChange = ((latest.averageAccessTime - previous.averageAccessTime) / previous.averageAccessTime) * 100;
    if (Math.abs(accessTimeChange) > 20) {
      trends.push({
        metric: 'Access Time',
        change: `${accessTimeChange > 0 ? '+' : ''}${accessTimeChange.toFixed(1)}%`,
        significance: Math.abs(accessTimeChange) > 50 ? 'high' : 'medium'
      });
    }

    const sizeChange = ((latest.totalCacheSize - previous.totalCacheSize) / previous.totalCacheSize) * 100;
    if (Math.abs(sizeChange) > 25) {
      trends.push({
        metric: 'Cache Size',
        change: `${sizeChange > 0 ? '+' : ''}${sizeChange.toFixed(1)}%`,
        significance: Math.abs(sizeChange) > 75 ? 'high' : 'medium'
      });
    }

    return { trends };
  }

  private generateRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.overallHitRate < 0.7) {
      recommendations.push('Low cache hit rate - review caching strategy and key patterns');
    }

    if (stats.averageAccessTime > 5) {
      recommendations.push('Slow cache access times - consider optimizing storage backend');
    }

    if (stats.slowOperations > stats.totalOperations * 0.1) {
      recommendations.push('High number of slow cache operations - investigate performance bottlenecks');
    }

    if (stats.currentCacheSize > 50 * 1024 * 1024) { // 50MB
      recommendations.push('Large cache size - consider implementing compression or size limits');
    }

    const hotKeys = stats.cachePatterns.filter((p: CachePattern) => p.pattern === 'hot').length;
    const coldKeys = stats.cachePatterns.filter((p: CachePattern) => p.pattern === 'cold').length;
    
    if (coldKeys > hotKeys * 2) {
      recommendations.push('Many cold keys detected - implement TTL cleanup for unused data');
    }

    return recommendations;
  }

  // Helper method to create a cache instrumentation wrapper
  createInstrumentedCache<T = any>(cache: any): any {
    const self = this;
    
    return new Proxy(cache, {
      get(target, prop) {
        const originalMethod = target[prop];
        
        if (typeof originalMethod === 'function') {
          return function(...args: any[]) {
            const start = Date.now();
            const key = args[0];
            
            let operation: CacheOperation['operation'];
            let hit = false;
            let size: number | undefined;
            
            if (prop === 'get') {
              operation = 'get';
            } else if (prop === 'set') {
              operation = 'set';
              size = args[1] ? JSON.stringify(args[1]).length : undefined;
            } else if (prop === 'delete' || prop === 'del') {
              operation = 'delete';
            } else if (prop === 'clear') {
              operation = 'clear';
            } else {
              return originalMethod.apply(target, args);
            }

            const result = originalMethod.apply(target, args);
            const executionTime = Date.now() - start;
            
            // Determine if it was a hit for get operations
            if (operation === 'get') {
              hit = result !== undefined && result !== null;
            }

            self.recordOperation({
              timestamp: start,
              operation,
              key: key || 'unknown',
              hit,
              size,
              executionTime
            });

            return result;
          };
        }
        
        return originalMethod;
      }
    });
  }
}