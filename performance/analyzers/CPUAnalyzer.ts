import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { cpuUsage } from 'process';

interface CPUSnapshot {
  timestamp: number;
  user: number; // microseconds
  system: number; // microseconds
  total: number;
  utilization: number; // percentage
  eventLoopDelay?: number;
}

interface CPUBottleneck {
  type: 'high_cpu' | 'event_loop_lag' | 'system_bottleneck';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metrics: {
    cpuUsage?: number;
    eventLoopDelay?: number;
    duration: number;
  };
  recommendations: string[];
}

export class CPUAnalyzer extends EventEmitter {
  private snapshots: CPUSnapshot[] = [];
  private intervalId?: NodeJS.Timeout;
  private isAnalyzing = false;
  private previousCPUUsage = cpuUsage();
  private eventLoopMonitor?: any;
  private readonly maxSnapshots = 1000;

  constructor(
    private options = {
      interval: 2000, // 2 seconds
      highCPUThreshold: 80, // 80% CPU usage
      eventLoopThreshold: 100, // 100ms event loop delay
      outputPath: 'performance/reports'
    }
  ) {
    super();
    this.initEventLoopMonitor();
  }

  private initEventLoopMonitor(): void {
    // Simple event loop delay measurement
    this.eventLoopMonitor = {
      delay: 0,
      measuring: false,
      startMeasurement: () => {
        if (this.eventLoopMonitor.measuring) return;
        this.eventLoopMonitor.measuring = true;
        const start = process.hrtime.bigint();
        
        setImmediate(() => {
          const end = process.hrtime.bigint();
          this.eventLoopMonitor.delay = Number(end - start) / 1000000; // Convert to milliseconds
          this.eventLoopMonitor.measuring = false;
        });
      }
    };
  }

  start(): void {
    if (this.isAnalyzing) return;

    this.isAnalyzing = true;
    this.previousCPUUsage = cpuUsage();

    this.intervalId = setInterval(() => {
      this.takeSnapshot();
    }, this.options.interval);

    console.log('CPU analyzer started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isAnalyzing) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isAnalyzing = false;
    console.log('CPU analyzer stopped');
    this.emit('stopped');
  }

  private takeSnapshot(): void {
    const currentCPU = cpuUsage(this.previousCPUUsage);
    this.eventLoopMonitor.startMeasurement();

    const totalMicroseconds = currentCPU.user + currentCPU.system;
    const intervalMicroseconds = this.options.interval * 1000; // Convert to microseconds
    const utilization = Math.min((totalMicroseconds / intervalMicroseconds) * 100, 100);

    const snapshot: CPUSnapshot = {
      timestamp: Date.now(),
      user: currentCPU.user,
      system: currentCPU.system,
      total: totalMicroseconds,
      utilization: utilization,
      eventLoopDelay: this.eventLoopMonitor.delay
    };

    this.snapshots.push(snapshot);
    this.previousCPUUsage = cpuUsage();

    // Keep only recent snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    this.emit('snapshot', snapshot);

    // Check for bottlenecks
    this.detectBottlenecks(snapshot);
  }

  private detectBottlenecks(snapshot: CPUSnapshot): void {
    const bottlenecks: CPUBottleneck[] = [];

    // High CPU usage detection
    if (snapshot.utilization > this.options.highCPUThreshold) {
      bottlenecks.push({
        type: 'high_cpu',
        severity: this.getCPUSeverity(snapshot.utilization),
        description: `High CPU usage detected: ${snapshot.utilization.toFixed(2)}%`,
        metrics: {
          cpuUsage: snapshot.utilization,
          duration: this.options.interval
        },
        recommendations: this.getCPURecommendations(snapshot)
      });
    }

    // Event loop lag detection
    if (snapshot.eventLoopDelay && snapshot.eventLoopDelay > this.options.eventLoopThreshold) {
      bottlenecks.push({
        type: 'event_loop_lag',
        severity: this.getEventLoopSeverity(snapshot.eventLoopDelay),
        description: `Event loop delay detected: ${snapshot.eventLoopDelay.toFixed(2)}ms`,
        metrics: {
          eventLoopDelay: snapshot.eventLoopDelay,
          duration: this.options.interval
        },
        recommendations: this.getEventLoopRecommendations(snapshot)
      });
    }

    // System vs User CPU analysis
    const systemRatio = snapshot.system / snapshot.total;
    if (systemRatio > 0.7) { // More than 70% system CPU
      bottlenecks.push({
        type: 'system_bottleneck',
        severity: 'high',
        description: `High system CPU usage: ${(systemRatio * 100).toFixed(2)}%`,
        metrics: {
          cpuUsage: snapshot.utilization,
          duration: this.options.interval
        },
        recommendations: [
          'Check for excessive I/O operations',
          'Monitor system calls and file operations',
          'Review network operations',
          'Check for memory swapping'
        ]
      });
    }

    bottlenecks.forEach(bottleneck => {
      this.emit('bottleneck_detected', bottleneck);
    });
  }

  private getCPUSeverity(utilization: number): 'low' | 'medium' | 'high' | 'critical' {
    if (utilization > 95) return 'critical';
    if (utilization > 90) return 'high';
    if (utilization > 85) return 'medium';
    return 'low';
  }

  private getEventLoopSeverity(delay: number): 'low' | 'medium' | 'high' | 'critical' {
    if (delay > 1000) return 'critical';
    if (delay > 500) return 'high';
    if (delay > 200) return 'medium';
    return 'low';
  }

  private getCPURecommendations(snapshot: CPUSnapshot): string[] {
    const recommendations: string[] = [];
    const userRatio = snapshot.user / snapshot.total;
    const systemRatio = snapshot.system / snapshot.total;

    if (userRatio > 0.8) {
      recommendations.push(
        'High user CPU - optimize application logic',
        'Consider async operations for CPU-intensive tasks',
        'Profile code to identify hot spots'
      );
    }

    if (systemRatio > 0.8) {
      recommendations.push(
        'High system CPU - optimize I/O operations',
        'Reduce file system operations',
        'Optimize network requests'
      );
    }

    recommendations.push(
      'Consider load balancing or scaling',
      'Monitor specific functions causing high CPU'
    );

    return recommendations;
  }

  private getEventLoopRecommendations(snapshot: CPUSnapshot): string[] {
    return [
      'Break up large synchronous operations',
      'Use setImmediate() or process.nextTick() for heavy tasks',
      'Consider worker threads for CPU-intensive operations',
      'Profile event loop blocking operations',
      'Optimize database queries and external API calls'
    ];
  }

  getStats() {
    if (this.snapshots.length === 0) return null;

    const latest = this.snapshots[this.snapshots.length - 1];
    const oldest = this.snapshots[0];

    const avgCPU = this.snapshots.reduce((sum, s) => sum + s.utilization, 0) / this.snapshots.length;
    const peakCPU = Math.max(...this.snapshots.map(s => s.utilization));
    const avgEventLoopDelay = this.snapshots
      .filter(s => s.eventLoopDelay !== undefined)
      .reduce((sum, s) => sum + (s.eventLoopDelay || 0), 0) / this.snapshots.length;

    return {
      current: latest,
      duration: latest.timestamp - oldest.timestamp,
      averageCPU: avgCPU,
      peakCPU: peakCPU,
      averageEventLoopDelay: avgEventLoopDelay,
      snapshotCount: this.snapshots.length,
      userSystemRatio: {
        avgUser: this.snapshots.reduce((sum, s) => sum + (s.user / s.total), 0) / this.snapshots.length,
        avgSystem: this.snapshots.reduce((sum, s) => sum + (s.system / s.total), 0) / this.snapshots.length
      }
    };
  }

  async generateReport(): Promise<string> {
    const stats = this.getStats();
    if (!stats) throw new Error('No CPU data available');

    const report = {
      timestamp: new Date().toISOString(),
      duration: `${Math.round(stats.duration / 1000)}s`,
      summary: {
        currentCPU: `${stats.current.utilization.toFixed(2)}%`,
        averageCPU: `${stats.averageCPU.toFixed(2)}%`,
        peakCPU: `${stats.peakCPU.toFixed(2)}%`,
        averageEventLoopDelay: `${stats.averageEventLoopDelay.toFixed(2)}ms`,
        userSystemRatio: `${(stats.userSystemRatio.avgUser * 100).toFixed(1)}% user / ${(stats.userSystemRatio.avgSystem * 100).toFixed(1)}% system`
      },
      snapshots: this.snapshots,
      analysis: this.analyzePerformancePatterns(),
      recommendations: this.generateRecommendations(stats)
    };

    const reportPath = path.join(this.options.outputPath, `cpu-report-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }

  private analyzePerformancePatterns() {
    if (this.snapshots.length < 10) return { patterns: [] };

    const patterns = [];

    // Detect sustained high CPU periods
    const highCPUPeriods = this.findSustainedHighUsage();
    if (highCPUPeriods.length > 0) {
      patterns.push({
        type: 'sustained_high_cpu',
        count: highCPUPeriods.length,
        description: `Found ${highCPUPeriods.length} periods of sustained high CPU usage`
      });
    }

    // Detect CPU spikes
    const spikes = this.detectCPUSpikes();
    if (spikes.length > 0) {
      patterns.push({
        type: 'cpu_spikes',
        count: spikes.length,
        description: `Detected ${spikes.length} CPU usage spikes`
      });
    }

    return { patterns };
  }

  private findSustainedHighUsage(): Array<{ start: number; end: number; avgCPU: number }> {
    const periods = [];
    let currentPeriod: { start: number; end: number; samples: number; totalCPU: number } | null = null;
    const threshold = 80; // 80% CPU
    const minDuration = 5; // At least 5 samples

    for (const snapshot of this.snapshots) {
      if (snapshot.utilization > threshold) {
        if (!currentPeriod) {
          currentPeriod = {
            start: snapshot.timestamp,
            end: snapshot.timestamp,
            samples: 1,
            totalCPU: snapshot.utilization
          };
        } else {
          currentPeriod.end = snapshot.timestamp;
          currentPeriod.samples++;
          currentPeriod.totalCPU += snapshot.utilization;
        }
      } else {
        if (currentPeriod && currentPeriod.samples >= minDuration) {
          periods.push({
            start: currentPeriod.start,
            end: currentPeriod.end,
            avgCPU: currentPeriod.totalCPU / currentPeriod.samples
          });
        }
        currentPeriod = null;
      }
    }

    return periods;
  }

  private detectCPUSpikes(): Array<{ timestamp: number; cpu: number; increase: number }> {
    const spikes = [];
    const spikeThreshold = 30; // 30% sudden increase

    for (let i = 1; i < this.snapshots.length; i++) {
      const current = this.snapshots[i];
      const previous = this.snapshots[i - 1];
      const increase = current.utilization - previous.utilization;

      if (increase > spikeThreshold) {
        spikes.push({
          timestamp: current.timestamp,
          cpu: current.utilization,
          increase: increase
        });
      }
    }

    return spikes;
  }

  private generateRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.averageCPU > 60) {
      recommendations.push('High average CPU usage - consider optimization or scaling');
    }

    if (stats.peakCPU > 90) {
      recommendations.push('CPU spikes detected - investigate and optimize peak usage scenarios');
    }

    if (stats.averageEventLoopDelay > 50) {
      recommendations.push('Event loop delays detected - optimize asynchronous operations');
    }

    if (stats.userSystemRatio.avgSystem > 0.6) {
      recommendations.push('High system CPU usage - optimize I/O operations');
    }

    return recommendations;
  }
}