import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

interface MemorySnapshot {
  timestamp: number;
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  heapUtilization: number;
}

interface MemoryLeak {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  trend: number[];
  recommendation: string;
}

export class MemoryAnalyzer extends EventEmitter {
  private snapshots: MemorySnapshot[] = [];
  private intervalId?: NodeJS.Timeout;
  private isAnalyzing = false;
  private readonly maxSnapshots = 1000;

  constructor(
    private options = {
      interval: 5000, // 5 seconds
      alertThreshold: 0.85, // 85% heap utilization
      leakDetectionWindow: 20, // 20 snapshots for trend analysis
      outputPath: 'performance/reports'
    }
  ) {
    super();
  }

  start(): void {
    if (this.isAnalyzing) return;

    this.isAnalyzing = true;
    this.intervalId = setInterval(() => {
      this.takeSnapshot();
    }, this.options.interval);

    console.log('Memory analyzer started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isAnalyzing) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isAnalyzing = false;
    console.log('Memory analyzer stopped');
    this.emit('stopped');
  }

  private takeSnapshot(): void {
    const memUsage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      heapUtilization: memUsage.heapUsed / memUsage.heapTotal
    };

    this.snapshots.push(snapshot);

    // Keep only recent snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    this.emit('snapshot', snapshot);

    // Check for alerts
    if (snapshot.heapUtilization > this.options.alertThreshold) {
      this.emit('alert', {
        type: 'high_memory_usage',
        severity: snapshot.heapUtilization > 0.95 ? 'critical' : 'high',
        message: `High memory usage: ${(snapshot.heapUtilization * 100).toFixed(2)}%`,
        snapshot
      });
    }

    // Analyze for memory leaks
    this.analyzeMemoryLeaks();
  }

  private analyzeMemoryLeaks(): void {
    if (this.snapshots.length < this.options.leakDetectionWindow) return;

    const recentSnapshots = this.snapshots.slice(-this.options.leakDetectionWindow);
    const leaks = this.detectLeaks(recentSnapshots);

    leaks.forEach(leak => {
      this.emit('leak_detected', leak);
    });
  }

  private detectLeaks(snapshots: MemorySnapshot[]): MemoryLeak[] {
    const leaks: MemoryLeak[] = [];

    // Detect steadily increasing heap usage
    const heapTrend = snapshots.map(s => s.heapUsed);
    const heapGrowthRate = this.calculateGrowthRate(heapTrend);

    if (heapGrowthRate > 0.1) { // 10% consistent growth
      leaks.push({
        type: 'heap_leak',
        severity: heapGrowthRate > 0.5 ? 'critical' : heapGrowthRate > 0.3 ? 'high' : 'medium',
        description: `Consistent heap growth detected: ${(heapGrowthRate * 100).toFixed(2)}% per interval`,
        trend: heapTrend,
        recommendation: 'Check for unclosed resources, circular references, or growing caches'
      });
    }

    // Detect external memory leaks
    const externalTrend = snapshots.map(s => s.external);
    const externalGrowthRate = this.calculateGrowthRate(externalTrend);

    if (externalGrowthRate > 0.15) { // 15% consistent growth
      leaks.push({
        type: 'external_leak',
        severity: externalGrowthRate > 0.5 ? 'critical' : 'high',
        description: `External memory growth detected: ${(externalGrowthRate * 100).toFixed(2)}% per interval`,
        trend: externalTrend,
        recommendation: 'Check for buffer leaks, file handles, or native module memory issues'
      });
    }

    return leaks;
  }

  private calculateGrowthRate(values: number[]): number {
    if (values.length < 2) return 0;

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    return (secondAvg - firstAvg) / firstAvg;
  }

  getStats() {
    if (this.snapshots.length === 0) return null;

    const latest = this.snapshots[this.snapshots.length - 1];
    const oldest = this.snapshots[0];

    return {
      current: latest,
      duration: latest.timestamp - oldest.timestamp,
      averageHeapUsage: this.snapshots.reduce((sum, s) => sum + s.heapUsed, 0) / this.snapshots.length,
      peakHeapUsage: Math.max(...this.snapshots.map(s => s.heapUsed)),
      averageUtilization: this.snapshots.reduce((sum, s) => sum + s.heapUtilization, 0) / this.snapshots.length,
      snapshotCount: this.snapshots.length
    };
  }

  async generateReport(): Promise<string> {
    const stats = this.getStats();
    if (!stats) throw new Error('No memory data available');

    const report = {
      timestamp: new Date().toISOString(),
      duration: `${Math.round(stats.duration / 1000)}s`,
      summary: {
        currentHeapUsage: `${(stats.current.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        currentUtilization: `${(stats.current.heapUtilization * 100).toFixed(2)}%`,
        peakHeapUsage: `${(stats.peakHeapUsage / 1024 / 1024).toFixed(2)} MB`,
        averageUtilization: `${(stats.averageUtilization * 100).toFixed(2)}%`
      },
      snapshots: this.snapshots,
      recommendations: this.generateRecommendations(stats)
    };

    const reportPath = path.join(this.options.outputPath, `memory-report-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }

  private generateRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.averageUtilization > 0.8) {
      recommendations.push('Consider increasing heap size or optimizing memory usage');
    }

    if (stats.peakHeapUsage > stats.averageHeapUsage * 2) {
      recommendations.push('Large memory spikes detected - investigate temporary allocations');
    }

    if (this.snapshots.length > 10) {
      const recentTrend = this.snapshots.slice(-10).map(s => s.heapUsed);
      const growthRate = this.calculateGrowthRate(recentTrend);
      
      if (growthRate > 0.05) {
        recommendations.push('Memory usage is trending upward - check for memory leaks');
      }
    }

    return recommendations;
  }

  // Force garbage collection (for testing/debugging)
  forceGC(): void {
    if (global.gc) {
      global.gc();
      console.log('Garbage collection forced');
      // Take immediate snapshot after GC
      setTimeout(() => this.takeSnapshot(), 100);
    } else {
      console.warn('Garbage collection not available. Run with --expose-gc flag');
    }
  }
}