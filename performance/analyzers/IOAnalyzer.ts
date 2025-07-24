import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

interface IOOperation {
  timestamp: number;
  type: 'read' | 'write' | 'delete' | 'stat' | 'mkdir' | 'rmdir';
  path: string;
  size?: number;
  duration: number;
  error?: string;
}

interface IOMetrics {
  timestamp: number;
  totalOperations: number;
  readOperations: number;
  writeOperations: number;
  totalBytesRead: number;
  totalBytesWritten: number;
  averageOperationTime: number;
  slowOperations: number; // Operations > threshold
  errorRate: number;
}

interface IOBottleneck {
  type: 'slow_operation' | 'high_error_rate' | 'excessive_io' | 'large_file_operations';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  operations: IOOperation[];
  recommendations: string[];
}

export class IOAnalyzer extends EventEmitter {
  private operations: IOOperation[] = [];
  private metrics: IOMetrics[] = [];
  private isMonitoring = false;
  private intervalId?: NodeJS.Timeout;
  private readonly maxOperations = 10000;
  private readonly originalFs: any = {};

  constructor(
    private options = {
      slowOperationThreshold: 100, // 100ms
      metricsInterval: 10000, // 10 seconds
      enableFileSystemHooks: true,
      outputPath: 'performance/reports'
    }
  ) {
    super();
    
    if (this.options.enableFileSystemHooks) {
      this.installFileSystemHooks();
    }
  }

  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    
    // Start metrics collection
    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, this.options.metricsInterval);

    console.log('I/O analyzer started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isMonitoring) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isMonitoring = false;
    this.restoreFileSystemHooks();
    
    console.log('I/O analyzer stopped');
    this.emit('stopped');
  }

  private installFileSystemHooks(): void {
    const fsOperations = ['readFile', 'writeFile', 'stat', 'mkdir', 'rmdir', 'unlink'];

    fsOperations.forEach(operation => {
      // Store original function
      this.originalFs[operation] = (fs as any)[operation];
      
      // Hook the operation
      (fs as any)[operation] = this.createHookedOperation(operation, this.originalFs[operation]);
    });
  }

  private createHookedOperation(operationName: string, originalFn: Function) {
    return async (...args: any[]) => {
      const startTime = Date.now();
      const filePath = args[0];
      
      try {
        const result = await originalFn.apply(fs, args);
        const duration = Date.now() - startTime;
        
        // Extract size information where possible
        let size: number | undefined;
        if (operationName === 'writeFile' && Buffer.isBuffer(args[1])) {
          size = args[1].length;
        } else if (operationName === 'writeFile' && typeof args[1] === 'string') {
          size = Buffer.byteLength(args[1]);
        } else if (operationName === 'stat' && result?.size) {
          size = result.size;
        }

        this.recordOperation({
          timestamp: startTime,
          type: this.mapOperationType(operationName),
          path: filePath,
          size,
          duration
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        this.recordOperation({
          timestamp: startTime,
          type: this.mapOperationType(operationName),
          path: filePath,
          duration,
          error: error instanceof Error ? error.message : String(error)
        });

        throw error;
      }
    };
  }

  private mapOperationType(fsOperation: string): IOOperation['type'] {
    switch (fsOperation) {
      case 'readFile':
      case 'stat':
        return 'read';
      case 'writeFile':
        return 'write';
      case 'unlink':
        return 'delete';
      case 'mkdir':
        return 'mkdir';
      case 'rmdir':
        return 'rmdir';
      default:
        return 'read';
    }
  }

  private restoreFileSystemHooks(): void {
    Object.keys(this.originalFs).forEach(operation => {
      (fs as any)[operation] = this.originalFs[operation];
    });
  }

  recordOperation(operation: IOOperation): void {
    this.operations.push(operation);

    // Keep only recent operations
    if (this.operations.length > this.maxOperations) {
      this.operations.shift();
    }

    this.emit('operation', operation);

    // Check for immediate bottlenecks
    if (operation.duration > this.options.slowOperationThreshold) {
      this.emit('slow_operation', operation);
    }

    if (operation.error) {
      this.emit('io_error', operation);
    }
  }

  private collectMetrics(): void {
    const now = Date.now();
    const recentOps = this.operations.filter(op => 
      now - op.timestamp < this.options.metricsInterval
    );

    if (recentOps.length === 0) return;

    const readOps = recentOps.filter(op => op.type === 'read');
    const writeOps = recentOps.filter(op => op.type === 'write');
    const slowOps = recentOps.filter(op => op.duration > this.options.slowOperationThreshold);
    const errorOps = recentOps.filter(op => op.error);

    const totalBytesRead = readOps
      .filter(op => op.size)
      .reduce((sum, op) => sum + (op.size || 0), 0);

    const totalBytesWritten = writeOps
      .filter(op => op.size)
      .reduce((sum, op) => sum + (op.size || 0), 0);

    const averageOperationTime = recentOps.reduce((sum, op) => sum + op.duration, 0) / recentOps.length;

    const metrics: IOMetrics = {
      timestamp: now,
      totalOperations: recentOps.length,
      readOperations: readOps.length,
      writeOperations: writeOps.length,
      totalBytesRead,
      totalBytesWritten,
      averageOperationTime,
      slowOperations: slowOps.length,
      errorRate: errorOps.length / recentOps.length
    };

    this.metrics.push(metrics);
    this.emit('metrics', metrics);

    // Analyze bottlenecks
    this.analyzeBottlenecks(recentOps, metrics);
  }

  private analyzeBottlenecks(operations: IOOperation[], metrics: IOMetrics): void {
    const bottlenecks: IOBottleneck[] = [];

    // Slow operations analysis
    const slowOps = operations.filter(op => op.duration > this.options.slowOperationThreshold);
    if (slowOps.length > operations.length * 0.1) { // More than 10% slow operations
      bottlenecks.push({
        type: 'slow_operation',
        severity: this.getSeverityByPercentage(slowOps.length / operations.length),
        description: `${slowOps.length} slow I/O operations detected (>${this.options.slowOperationThreshold}ms)`,
        operations: slowOps.slice(0, 10), // Include up to 10 examples
        recommendations: [
          'Optimize file access patterns',
          'Consider caching frequently accessed files',
          'Use asynchronous I/O operations',
          'Check disk performance and fragmentation'
        ]
      });
    }

    // High error rate analysis
    if (metrics.errorRate > 0.05) { // More than 5% error rate
      const errorOps = operations.filter(op => op.error);
      bottlenecks.push({
        type: 'high_error_rate',
        severity: this.getSeverityByPercentage(metrics.errorRate),
        description: `High I/O error rate: ${(metrics.errorRate * 100).toFixed(2)}%`,
        operations: errorOps.slice(0, 10),
        recommendations: [
          'Check file permissions and paths',
          'Verify disk space availability',
          'Handle file locking scenarios',
          'Implement retry mechanisms for transient errors'
        ]
      });
    }

    // Excessive I/O analysis
    const opsPerSecond = metrics.totalOperations / (this.options.metricsInterval / 1000);
    if (opsPerSecond > 100) { // More than 100 operations per second
      bottlenecks.push({
        type: 'excessive_io',
        severity: opsPerSecond > 500 ? 'critical' : opsPerSecond > 300 ? 'high' : 'medium',
        description: `High I/O frequency: ${opsPerSecond.toFixed(2)} operations/second`,
        operations: operations.slice(0, 20),
        recommendations: [
          'Implement batching for multiple operations',
          'Use connection pooling for database operations',
          'Cache frequently accessed data',
          'Consider in-memory storage for temporary data'
        ]
      });
    }

    // Large file operations analysis
    const largeFileOps = operations.filter(op => op.size && op.size > 10 * 1024 * 1024); // > 10MB
    if (largeFileOps.length > 0) {
      bottlenecks.push({
        type: 'large_file_operations',
        severity: largeFileOps.length > 5 ? 'high' : 'medium',
        description: `${largeFileOps.length} large file operations detected (>10MB)`,
        operations: largeFileOps.slice(0, 5),
        recommendations: [
          'Use streaming for large file operations',
          'Implement progress tracking for large transfers',
          'Consider file compression',
          'Use worker threads for large file processing'
        ]
      });
    }

    bottlenecks.forEach(bottleneck => {
      this.emit('bottleneck_detected', bottleneck);
    });
  }

  private getSeverityByPercentage(percentage: number): 'low' | 'medium' | 'high' | 'critical' {
    if (percentage > 0.5) return 'critical';
    if (percentage > 0.3) return 'high';
    if (percentage > 0.15) return 'medium';
    return 'low';
  }

  getStats() {
    if (this.operations.length === 0) return null;

    const latest = this.operations[this.operations.length - 1];
    const oldest = this.operations[0];
    
    const readOps = this.operations.filter(op => op.type === 'read');
    const writeOps = this.operations.filter(op => op.type === 'write');
    const errorOps = this.operations.filter(op => op.error);
    const slowOps = this.operations.filter(op => op.duration > this.options.slowOperationThreshold);

    return {
      duration: latest.timestamp - oldest.timestamp,
      totalOperations: this.operations.length,
      operationBreakdown: {
        read: readOps.length,
        write: writeOps.length,
        other: this.operations.length - readOps.length - writeOps.length
      },
      averageOperationTime: this.operations.reduce((sum, op) => sum + op.duration, 0) / this.operations.length,
      slowOperations: slowOps.length,
      errorOperations: errorOps.length,
      errorRate: errorOps.length / this.operations.length,
      totalBytesProcessed: this.operations
        .filter(op => op.size)
        .reduce((sum, op) => sum + (op.size || 0), 0),
      topSlowOperations: slowOps
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10)
    };
  }

  async generateReport(): Promise<string> {
    const stats = this.getStats();
    if (!stats) throw new Error('No I/O data available');

    // Analyze file access patterns
    const fileAccessPatterns = this.analyzeFileAccessPatterns();
    const operationTrends = this.analyzeOperationTrends();

    const report = {
      timestamp: new Date().toISOString(),
      duration: `${Math.round(stats.duration / 1000)}s`,
      summary: {
        totalOperations: stats.totalOperations,
        averageOperationTime: `${stats.averageOperationTime.toFixed(2)}ms`,
        errorRate: `${(stats.errorRate * 100).toFixed(2)}%`,
        slowOperations: stats.slowOperations,
        totalBytesProcessed: `${(stats.totalBytesProcessed / 1024 / 1024).toFixed(2)} MB`
      },
      operationBreakdown: stats.operationBreakdown,
      fileAccessPatterns,
      operationTrends,
      topSlowOperations: stats.topSlowOperations,
      recommendations: this.generateRecommendations(stats)
    };

    const reportPath = path.join(this.options.outputPath, `io-report-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }

  private analyzeFileAccessPatterns() {
    const pathCounts = new Map<string, number>();
    const pathSizes = new Map<string, number>();

    this.operations.forEach(op => {
      const dir = path.dirname(op.path);
      pathCounts.set(dir, (pathCounts.get(dir) || 0) + 1);
      
      if (op.size) {
        pathSizes.set(dir, (pathSizes.get(dir) || 0) + op.size);
      }
    });

    const sortedPaths = Array.from(pathCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      mostAccessedDirectories: sortedPaths.map(([path, count]) => ({
        path,
        accessCount: count,
        totalBytes: pathSizes.get(path) || 0
      }))
    };
  }

  private analyzeOperationTrends() {
    if (this.metrics.length < 2) return { trends: [] };

    const latest = this.metrics[this.metrics.length - 1];
    const previous = this.metrics[this.metrics.length - 2];

    const trends = [];

    const opsChange = ((latest.totalOperations - previous.totalOperations) / previous.totalOperations) * 100;
    if (Math.abs(opsChange) > 20) {
      trends.push({
        metric: 'Operation Volume',
        change: `${opsChange > 0 ? '+' : ''}${opsChange.toFixed(1)}%`,
        significance: Math.abs(opsChange) > 50 ? 'high' : 'medium'
      });
    }

    const timeChange = ((latest.averageOperationTime - previous.averageOperationTime) / previous.averageOperationTime) * 100;
    if (Math.abs(timeChange) > 15) {
      trends.push({
        metric: 'Operation Speed',
        change: `${timeChange > 0 ? '+' : ''}${timeChange.toFixed(1)}%`,
        significance: Math.abs(timeChange) > 40 ? 'high' : 'medium'
      });
    }

    return { trends };
  }

  private generateRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.averageOperationTime > 50) {
      recommendations.push('Average I/O time is high - consider optimizing file access patterns');
    }

    if (stats.errorRate > 0.02) {
      recommendations.push('I/O error rate is elevated - implement better error handling');
    }

    if (stats.slowOperations > stats.totalOperations * 0.1) {
      recommendations.push('High number of slow operations - consider caching or async patterns');
    }

    if (stats.totalBytesProcessed > 1000 * 1024 * 1024) { // 1GB
      recommendations.push('High volume of data processed - consider streaming or batching');
    }

    return recommendations;
  }
}