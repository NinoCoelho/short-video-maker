import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface SystemResources {
  timestamp: number;
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    utilization: number;
    swap: {
      total: number;
      used: number;
      free: number;
    };
  };
  disk: {
    usage: DiskUsage[];
    io: DiskIO;
  };
  network: {
    interfaces: NetworkInterface[];
    connections: number;
  };
  process: {
    pid: number;
    memory: NodeJS.MemoryUsage;
    cpu: number;
    uptime: number;
    handles: number;
  };
}

interface DiskUsage {
  mount: string;
  total: number;
  used: number;
  available: number;
  utilization: number;
}

interface DiskIO {
  readBytes: number;
  writeBytes: number;
  readOps: number;
  writeOps: number;
}

interface NetworkInterface {
  name: string;
  address: string;
  family: string;
  internal: boolean;
  mac: string;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
}

interface ResourceAlert {
  id: string;
  timestamp: number;
  type: 'cpu' | 'memory' | 'disk' | 'network' | 'process';
  severity: 'warning' | 'critical';
  message: string;
  currentValue: number;
  threshold: number;
  recommendations: string[];
}

interface PerformanceThresholds {
  cpu: {
    warning: number;
    critical: number;
  };
  memory: {
    warning: number;
    critical: number;
  };
  disk: {
    usage: {
      warning: number;
      critical: number;
    };
    io: {
      warning: number;
      critical: number;
    };
  };
  process: {
    memory: {
      warning: number;
      critical: number;
    };
    handles: {
      warning: number;
      critical: number;
    };
  };
}

export class ResourceMonitor extends EventEmitter {
  private resources: SystemResources[] = [];
  private alerts: ResourceAlert[] = [];
  private isMonitoring = false;
  private intervalId?: NodeJS.Timeout;
  private previousCpuInfo: os.CpuInfo[] = [];
  private previousNetworkStats = new Map<string, any>();
  private previousDiskIO: DiskIO = { readBytes: 0, writeBytes: 0, readOps: 0, writeOps: 0 };
  
  constructor(
    private options = {
      interval: 5000, // 5 seconds
      maxHistory: 1000,
      outputPath: 'performance/reports',
      thresholds: {
        cpu: { warning: 70, critical: 90 },
        memory: { warning: 80, critical: 95 },
        disk: {
          usage: { warning: 80, critical: 95 },
          io: { warning: 100, critical: 200 } // MB/s
        },
        process: {
          memory: { warning: 1024, critical: 2048 }, // MB
          handles: { warning: 10000, critical: 50000 }
        }
      } as PerformanceThresholds
    }
  ) {
    super();
    this.previousCpuInfo = os.cpus();
  }

  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.intervalId = setInterval(() => {
      this.collectResources();
    }, this.options.interval);

    // Initial collection
    this.collectResources();

    console.log('Resource monitor started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isMonitoring) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isMonitoring = false;
    console.log('Resource monitor stopped');
    this.emit('stopped');
  }

  private async collectResources(): Promise<void> {
    try {
      const timestamp = Date.now();
      
      const cpuUsage = this.calculateCPUUsage();
      const memoryStats = this.getMemoryStats();
      const diskStats = await this.getDiskStats();
      const networkStats = this.getNetworkStats();
      const processStats = this.getProcessStats();

      const resources: SystemResources = {
        timestamp,
        cpu: {
          usage: cpuUsage,
          loadAverage: os.loadavg(),
          cores: os.cpus().length
        },
        memory: memoryStats,
        disk: diskStats,
        network: networkStats,
        process: processStats
      };

      this.resources.push(resources);

      // Keep only recent history
      if (this.resources.length > this.options.maxHistory) {
        this.resources.shift();
      }

      this.emit('resources_collected', resources);

      // Check for alerts
      this.checkAlerts(resources);

    } catch (error) {
      console.error('Error collecting resources:', error);
      this.emit('collection_error', error);
    }
  }

  private calculateCPUUsage(): number {
    const currentCpuInfo = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (let i = 0; i < currentCpuInfo.length; i++) {
      const current = currentCpuInfo[i];
      const previous = this.previousCpuInfo[i] || { times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } };

      const currentTick = Object.values(current.times).reduce((acc, time) => acc + time, 0);
      const previousTick = Object.values(previous.times).reduce((acc, time) => acc + time, 0);

      const currentIdle = current.times.idle;
      const previousIdle = previous.times.idle;

      const totalDiff = currentTick - previousTick;
      const idleDiff = currentIdle - previousIdle;

      totalTick += totalDiff;
      totalIdle += idleDiff;
    }

    this.previousCpuInfo = currentCpuInfo;

    if (totalTick === 0) return 0;
    return Math.max(0, 100 - (100 * totalIdle / totalTick));
  }

  private getMemoryStats() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      utilization: (usedMem / totalMem) * 100,
      swap: this.getSwapStats()
    };
  }

  private getSwapStats() {
    // Note: os module doesn't provide swap info directly
    // This would need platform-specific implementation
    return {
      total: 0,
      used: 0,
      free: 0
    };
  }

  private async getDiskStats(): Promise<{ usage: DiskUsage[]; io: DiskIO }> {
    const diskUsage: DiskUsage[] = [];
    const diskIO = this.getDiskIO();

    try {
      // This is a simplified implementation
      // Real implementation would use platform-specific APIs
      const stats = await fs.stat('.');
      
      diskUsage.push({
        mount: '/',
        total: 1000000000000, // 1TB placeholder
        used: 500000000000,   // 500GB placeholder
        available: 500000000000,
        utilization: 50
      });
    } catch (error) {
      // Fallback if fs.stat fails
    }

    return {
      usage: diskUsage,
      io: diskIO
    };
  }

  private getDiskIO(): DiskIO {
    // This would need platform-specific implementation
    // For now, return incremental mock data
    const io: DiskIO = {
      readBytes: this.previousDiskIO.readBytes + Math.random() * 1000000,
      writeBytes: this.previousDiskIO.writeBytes + Math.random() * 1000000,
      readOps: this.previousDiskIO.readOps + Math.floor(Math.random() * 100),
      writeOps: this.previousDiskIO.writeOps + Math.floor(Math.random() * 100)
    };

    this.previousDiskIO = io;
    return io;
  }

  private getNetworkStats(): { interfaces: NetworkInterface[]; connections: number } {
    const networkInterfaces = os.networkInterfaces();
    const interfaces: NetworkInterface[] = [];

    for (const [name, addresses] of Object.entries(networkInterfaces)) {
      if (!addresses) continue;

      for (const addr of addresses) {
        const prevStats = this.previousNetworkStats.get(`${name}_${addr.address}`) || {
          bytesReceived: 0,
          bytesSent: 0,
          packetsReceived: 0,
          packetsSent: 0
        };

        const currentStats = {
          bytesReceived: prevStats.bytesReceived + Math.floor(Math.random() * 10000),
          bytesSent: prevStats.bytesSent + Math.floor(Math.random() * 10000),
          packetsReceived: prevStats.packetsReceived + Math.floor(Math.random() * 100),
          packetsSent: prevStats.packetsSent + Math.floor(Math.random() * 100)
        };

        this.previousNetworkStats.set(`${name}_${addr.address}`, currentStats);

        interfaces.push({
          name,
          address: addr.address,
          family: addr.family,
          internal: addr.internal,
          mac: addr.mac,
          ...currentStats
        });
      }
    }

    return {
      interfaces,
      connections: Math.floor(Math.random() * 1000) // Placeholder
    };
  }

  private getProcessStats() {
    const memUsage = process.memoryUsage();
    
    return {
      pid: process.pid,
      memory: memUsage,
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      handles: (process as any)._getActiveHandles?.()?.length || 0
    };
  }

  private checkAlerts(resources: SystemResources): void {
    const alerts: ResourceAlert[] = [];

    // CPU alerts
    if (resources.cpu.usage > this.options.thresholds.cpu.critical) {
      alerts.push(this.createAlert('cpu', 'critical', 
        `Critical CPU usage: ${resources.cpu.usage.toFixed(2)}%`,
        resources.cpu.usage, this.options.thresholds.cpu.critical,
        [
          'Identify CPU-intensive processes',
          'Consider scaling horizontally',
          'Optimize application code',
          'Check for infinite loops or blocking operations'
        ]
      ));
    } else if (resources.cpu.usage > this.options.thresholds.cpu.warning) {
      alerts.push(this.createAlert('cpu', 'warning',
        `High CPU usage: ${resources.cpu.usage.toFixed(2)}%`,
        resources.cpu.usage, this.options.thresholds.cpu.warning,
        [
          'Monitor CPU usage trends',
          'Review recent code changes',
          'Consider optimization opportunities'
        ]
      ));
    }

    // Memory alerts
    if (resources.memory.utilization > this.options.thresholds.memory.critical) {
      alerts.push(this.createAlert('memory', 'critical',
        `Critical memory usage: ${resources.memory.utilization.toFixed(2)}%`,
        resources.memory.utilization, this.options.thresholds.memory.critical,
        [
          'Investigate memory leaks',
          'Restart services if necessary',
          'Add more RAM',
          'Optimize memory usage patterns'
        ]
      ));
    } else if (resources.memory.utilization > this.options.thresholds.memory.warning) {
      alerts.push(this.createAlert('memory', 'warning',
        `High memory usage: ${resources.memory.utilization.toFixed(2)}%`,
        resources.memory.utilization, this.options.thresholds.memory.warning,
        [
          'Monitor memory growth trends',
          'Review caching strategies',
          'Check for memory leaks'
        ]
      ));
    }

    // Disk alerts
    for (const disk of resources.disk.usage) {
      if (disk.utilization > this.options.thresholds.disk.usage.critical) {
        alerts.push(this.createAlert('disk', 'critical',
          `Critical disk usage on ${disk.mount}: ${disk.utilization.toFixed(2)}%`,
          disk.utilization, this.options.thresholds.disk.usage.critical,
          [
            'Free up disk space immediately',
            'Clean up log files and temporary files',
            'Move data to other storage',
            'Add more disk space'
          ]
        ));
      } else if (disk.utilization > this.options.thresholds.disk.usage.warning) {
        alerts.push(this.createAlert('disk', 'warning',
          `High disk usage on ${disk.mount}: ${disk.utilization.toFixed(2)}%`,
          disk.utilization, this.options.thresholds.disk.usage.warning,
          [
            'Plan for disk space cleanup',
            'Monitor disk usage growth',
            'Consider log rotation policies'
          ]
        ));
      }
    }

    // Process-specific alerts
    const processMemoryMB = resources.process.memory.heapUsed / 1024 / 1024;
    if (processMemoryMB > this.options.thresholds.process.memory.critical) {
      alerts.push(this.createAlert('process', 'critical',
        `Critical process memory usage: ${processMemoryMB.toFixed(2)} MB`,
        processMemoryMB, this.options.thresholds.process.memory.critical,
        [
          'Investigate application memory leaks',
          'Restart the process if necessary',
          'Review memory allocation patterns',
          'Consider garbage collection tuning'
        ]
      ));
    }

    // Emit alerts
    alerts.forEach(alert => {
      this.alerts.push(alert);
      this.emit('alert', alert);
    });

    // Keep only recent alerts
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }
  }

  private createAlert(
    type: ResourceAlert['type'],
    severity: ResourceAlert['severity'],
    message: string,
    currentValue: number,
    threshold: number,
    recommendations: string[]
  ): ResourceAlert {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      severity,
      message,
      currentValue,
      threshold,
      recommendations
    };
  }

  getCurrentResources(): SystemResources | null {
    return this.resources.length > 0 ? this.resources[this.resources.length - 1] : null;
  }

  getResourceHistory(minutes: number = 60): SystemResources[] {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    return this.resources.filter(r => r.timestamp >= cutoffTime);
  }

  getActiveAlerts(): ResourceAlert[] {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return this.alerts.filter(alert => alert.timestamp >= fiveMinutesAgo);
  }

  getResourceTrends(hours: number = 1): {
    cpu: { average: number; trend: number };
    memory: { average: number; trend: number };
    disk: { average: number; trend: number };
  } {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    const recentResources = this.resources.filter(r => r.timestamp >= cutoffTime);

    if (recentResources.length < 2) {
      return {
        cpu: { average: 0, trend: 0 },
        memory: { average: 0, trend: 0 },
        disk: { average: 0, trend: 0 }
      };
    }

    const cpuValues = recentResources.map(r => r.cpu.usage);
    const memoryValues = recentResources.map(r => r.memory.utilization);
    const diskValues = recentResources.flatMap(r => r.disk.usage.map(d => d.utilization));

    return {
      cpu: {
        average: cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length,
        trend: this.calculateTrend(cpuValues)
      },
      memory: {
        average: memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length,
        trend: this.calculateTrend(memoryValues)
      },
      disk: {
        average: diskValues.reduce((a, b) => a + b, 0) / diskValues.length,
        trend: this.calculateTrend(diskValues)
      }
    };
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  async generateResourceReport(): Promise<string> {
    const currentResources = this.getCurrentResources();
    const trends = this.getResourceTrends(24); // 24 hours
    const activeAlerts = this.getActiveAlerts();
    const recentHistory = this.getResourceHistory(60); // 1 hour

    const report = {
      timestamp: new Date().toISOString(),
      systemInfo: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: os.uptime(),
        hostname: os.hostname()
      },
      currentResources,
      trends,
      performance: {
        averageCPU: trends.cpu.average.toFixed(2),
        averageMemory: trends.memory.average.toFixed(2),
        averageDisk: trends.disk.average.toFixed(2),
        cpuTrend: trends.cpu.trend > 0 ? 'increasing' : 'decreasing',
        memoryTrend: trends.memory.trend > 0 ? 'increasing' : 'decreasing',
        diskTrend: trends.disk.trend > 0 ? 'increasing' : 'decreasing'
      },
      alerts: {
        active: activeAlerts,
        summary: {
          critical: activeAlerts.filter(a => a.severity === 'critical').length,
          warnings: activeAlerts.filter(a => a.severity === 'warning').length,
          byType: this.groupAlertsByType(activeAlerts)
        }
      },
      recommendations: this.generateResourceRecommendations(currentResources, trends, activeAlerts),
      historicalData: {
        samples: recentHistory.length,
        timespan: '1 hour',
        cpuRange: {
          min: Math.min(...recentHistory.map(r => r.cpu.usage)),
          max: Math.max(...recentHistory.map(r => r.cpu.usage))
        },
        memoryRange: {
          min: Math.min(...recentHistory.map(r => r.memory.utilization)),
          max: Math.max(...recentHistory.map(r => r.memory.utilization))
        }
      }
    };

    const reportPath = path.join(this.options.outputPath, `resource-report-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }

  private groupAlertsByType(alerts: ResourceAlert[]): Record<string, number> {
    const groups: Record<string, number> = {};
    
    alerts.forEach(alert => {
      groups[alert.type] = (groups[alert.type] || 0) + 1;
    });
    
    return groups;
  }

  private generateResourceRecommendations(
    current: SystemResources | null,
    trends: any,
    alerts: ResourceAlert[]
  ): string[] {
    const recommendations: string[] = [];

    if (!current) return recommendations;

    // CPU recommendations
    if (trends.cpu.average > 60) {
      recommendations.push('High average CPU usage detected - consider optimizing application performance');
    }

    if (trends.cpu.trend > 5) {
      recommendations.push('CPU usage is trending upward - monitor for performance degradation');
    }

    // Memory recommendations
    if (trends.memory.average > 70) {
      recommendations.push('High memory usage - investigate potential memory leaks');
    }

    if (trends.memory.trend > 3) {
      recommendations.push('Memory usage is increasing - implement memory monitoring and cleanup');
    }

    // Alert-based recommendations
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      recommendations.push('Critical alerts detected - immediate action required');
    }

    // System-specific recommendations
    if (current.cpu.cores < 4 && current.cpu.usage > 80) {
      recommendations.push('Consider upgrading to a system with more CPU cores');
    }

    if (current.memory.total < 8 * 1024 * 1024 * 1024 && current.memory.utilization > 80) { // 8GB
      recommendations.push('Consider adding more RAM to the system');
    }

    return recommendations;
  }

  // Method to get system capabilities and limits
  getSystemCapabilities(): {
    cpu: { cores: number; model: string; speed: number };
    memory: { total: string; available: string };
    platform: { type: string; version: string; arch: string };
    limits: {
      maxFileDescriptors: number;
      maxProcesses: number;
      maxMemory: number;
    };
  } {
    const cpus = os.cpus();
    
    return {
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        speed: cpus[0]?.speed || 0
      },
      memory: {
        total: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
        available: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`
      },
      platform: {
        type: os.type(),
        version: os.release(),
        arch: os.arch()
      },
      limits: {
        maxFileDescriptors: 65536, // This would need to be detected
        maxProcesses: 32768,       // Platform-specific
        maxMemory: os.totalmem()
      }
    };
  }

  // Method to check if system is under stress
  isSystemUnderStress(): {
    stressed: boolean;
    reasons: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
  } {
    const current = this.getCurrentResources();
    const reasons: string[] = [];
    let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';

    if (!current) {
      return { stressed: false, reasons: ['No current resource data'], severity: 'low' };
    }

    // Check CPU stress
    if (current.cpu.usage > 90) {
      reasons.push('Critical CPU usage');
      maxSeverity = 'critical';
    } else if (current.cpu.usage > 80) {
      reasons.push('High CPU usage');
      maxSeverity = maxSeverity === 'critical' ? 'critical' : 'high';
    }

    // Check memory stress
    if (current.memory.utilization > 95) {
      reasons.push('Critical memory usage');
      maxSeverity = 'critical';
    } else if (current.memory.utilization > 85) {
      reasons.push('High memory usage');
      maxSeverity = maxSeverity === 'critical' ? 'critical' : 'high';
    }

    // Check load average (Unix-like systems)
    const loadAvg = current.cpu.loadAverage[0]; // 1-minute load average
    if (loadAvg > current.cpu.cores * 2) {
      reasons.push('High system load');
      maxSeverity = maxSeverity === 'critical' ? 'critical' : 'high';
    }

    return {
      stressed: reasons.length > 0,
      reasons,
      severity: maxSeverity
    };
  }
}