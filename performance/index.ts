// Performance Monitoring and Optimization Suite
// Main entry point for all performance tools

import { MemoryAnalyzer } from './analyzers/MemoryAnalyzer';
import { CPUAnalyzer } from './analyzers/CPUAnalyzer';
import { IOAnalyzer } from './analyzers/IOAnalyzer';
import { NetworkMonitor } from './monitors/NetworkMonitor';
import { CacheAnalyzer } from './analyzers/CacheAnalyzer';
import { OptimizationRecommender } from './scripts/OptimizationRecommender';
import { PerformanceRegressionDetector } from './scripts/PerformanceRegression';
import { DatabaseQueryOptimizer } from './scripts/DatabaseQueryOptimizer';
import { ResourceMonitor } from './scripts/ResourceMonitor';
import { EventEmitter } from 'events';

export interface PerformanceSuiteOptions {
  enabledModules?: {
    memory?: boolean;
    cpu?: boolean;
    io?: boolean;
    network?: boolean;
    cache?: boolean;
    database?: boolean;
    resources?: boolean;
  };
  intervals?: {
    memory?: number;
    cpu?: number;
    io?: number;
    network?: number;
    cache?: number;
    resources?: number;
  };
  outputPath?: string;
  alertThresholds?: {
    memory?: number;
    cpu?: number;
    responseTime?: number;
    errorRate?: number;
  };
}

export class PerformanceSuite extends EventEmitter {
  private memoryAnalyzer: MemoryAnalyzer;
  private cpuAnalyzer: CPUAnalyzer;
  private ioAnalyzer: IOAnalyzer;
  private networkMonitor: NetworkMonitor;
  private cacheAnalyzer: CacheAnalyzer;
  private optimizationRecommender: OptimizationRecommender;
  private regressionDetector: PerformanceRegressionDetector;
  private databaseOptimizer: DatabaseQueryOptimizer;
  private resourceMonitor: ResourceMonitor;
  
  private isRunning = false;
  private reportInterval?: NodeJS.Timeout;

  constructor(private options: PerformanceSuiteOptions = {}) {
    super();

    // Initialize analyzers with options
    const outputPath = options.outputPath || 'performance/reports';
    
    this.memoryAnalyzer = new MemoryAnalyzer({
      interval: options.intervals?.memory || 5000,
      outputPath
    });

    this.cpuAnalyzer = new CPUAnalyzer({
      interval: options.intervals?.cpu || 2000,
      outputPath
    });

    this.ioAnalyzer = new IOAnalyzer({
      metricsInterval: options.intervals?.io || 10000,
      outputPath
    });

    this.networkMonitor = new NetworkMonitor({
      metricsInterval: options.intervals?.network || 15000,
      outputPath
    });

    this.cacheAnalyzer = new CacheAnalyzer({
      metricsInterval: options.intervals?.cache || 10000,
      outputPath
    });

    this.resourceMonitor = new ResourceMonitor({
      interval: options.intervals?.resources || 5000,
      outputPath
    });

    this.databaseOptimizer = new DatabaseQueryOptimizer({
      outputPath
    });

    // Initialize optimization recommender with all analyzers
    this.optimizationRecommender = new OptimizationRecommender({
      memory: this.memoryAnalyzer,
      cpu: this.cpuAnalyzer,
      io: this.ioAnalyzer,
      network: this.networkMonitor,
      cache: this.cacheAnalyzer
    });

    this.regressionDetector = new PerformanceRegressionDetector({
      reportPath: outputPath
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Forward critical events
    this.memoryAnalyzer.on('leak_detected', (leak) => {
      this.emit('critical_alert', { type: 'memory_leak', data: leak });
    });

    this.cpuAnalyzer.on('bottleneck_detected', (bottleneck) => {
      this.emit('performance_issue', { type: 'cpu_bottleneck', data: bottleneck });
    });

    this.networkMonitor.on('request_error', (error) => {
      this.emit('network_issue', { type: 'request_error', data: error });
    });

    this.resourceMonitor.on('alert', (alert) => {
      if (alert.severity === 'critical') {
        this.emit('critical_alert', { type: 'system_resource', data: alert });
      }
    });

    this.optimizationRecommender.on('critical_issues', (issues) => {
      this.emit('optimization_needed', { type: 'critical_optimization', data: issues });
    });

    this.regressionDetector.on('critical_regression', (regression) => {
      this.emit('critical_alert', { type: 'performance_regression', data: regression });
    });
  }

  start(): void {
    if (this.isRunning) return;

    const enabled = this.options.enabledModules || {};
    
    console.log('Starting Performance Monitoring Suite...');

    // Start enabled modules
    if (enabled.memory !== false) {
      this.memoryAnalyzer.start();
    }

    if (enabled.cpu !== false) {
      this.cpuAnalyzer.start();
    }

    if (enabled.io !== false) {
      this.ioAnalyzer.start();
    }

    if (enabled.network !== false) {
      this.networkMonitor.start();
    }

    if (enabled.cache !== false) {
      this.cacheAnalyzer.start();
    }

    if (enabled.resources !== false) {
      this.resourceMonitor.start();
    }

    // Register default regression tests
    this.regressionDetector.registerDefaultTests();

    // Start periodic reporting
    this.reportInterval = setInterval(() => {
      this.generatePeriodicReport();
    }, 30 * 60 * 1000); // Every 30 minutes

    this.isRunning = true;
    this.emit('suite_started');
    console.log('Performance Monitoring Suite started successfully');
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('Stopping Performance Monitoring Suite...');

    // Stop all analyzers
    this.memoryAnalyzer.stop();
    this.cpuAnalyzer.stop();
    this.ioAnalyzer.stop();
    this.networkMonitor.stop();
    this.cacheAnalyzer.stop();
    this.resourceMonitor.stop();

    // Stop periodic reporting
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = undefined;
    }

    this.isRunning = false;
    this.emit('suite_stopped');
    console.log('Performance Monitoring Suite stopped');
  }

  // Get current system performance snapshot
  async getCurrentSnapshot(): Promise<{
    timestamp: number;
    memory: any;
    cpu: any;
    io: any;
    network: any;
    cache: any;
    resources: any;
    overall: {
      health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
      score: number;
      issues: string[];
    };
  }> {
    const timestamp = Date.now();
    
    const memory = this.memoryAnalyzer.getStats();
    const cpu = this.cpuAnalyzer.getStats();
    const io = this.ioAnalyzer.getStats();
    const network = this.networkMonitor.getStats();
    const cache = this.cacheAnalyzer.getStats();
    const resources = this.resourceMonitor.getCurrentResources();

    // Calculate overall health score
    const { health, score, issues } = this.calculateOverallHealth({
      memory, cpu, io, network, cache, resources
    });

    return {
      timestamp,
      memory,
      cpu,
      io,
      network,
      cache,
      resources,
      overall: { health, score, issues }
    };
  }

  private calculateOverallHealth(metrics: any): {
    health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    score: number;
    issues: string[];
  } {
    let score = 100;
    const issues: string[] = [];

    // Memory health impact
    if (metrics.memory?.averageUtilization > 0.9) {
      score -= 30;
      issues.push('Critical memory usage');
    } else if (metrics.memory?.averageUtilization > 0.8) {
      score -= 15;
      issues.push('High memory usage');
    }

    // CPU health impact
    if (metrics.cpu?.averageCPU > 80) {
      score -= 25;
      issues.push('High CPU usage');
    }

    // Network health impact
    if (metrics.network?.errorRate > 0.1) {
      score -= 20;
      issues.push('High network error rate');
    }

    if (metrics.network?.averageResponseTime > 2000) {
      score -= 15;
      issues.push('Slow network responses');
    }

    // Cache health impact
    if (metrics.cache?.overallHitRate < 0.5) {
      score -= 10;
      issues.push('Low cache hit rate');
    }

    // Resource health impact
    if (metrics.resources) {
      const systemStress = this.resourceMonitor.isSystemUnderStress();
      if (systemStress.stressed) {
        if (systemStress.severity === 'critical') {
          score -= 40;
        } else if (systemStress.severity === 'high') {
          score -= 20;
        }
        issues.push(...systemStress.reasons);
      }
    }

    score = Math.max(0, score);

    let health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    if (score >= 90) health = 'excellent';
    else if (score >= 75) health = 'good';
    else if (score >= 50) health = 'fair';
    else if (score >= 25) health = 'poor';
    else health = 'critical';

    return { health, score, issues };
  }

  // Generate comprehensive performance report
  async generateComprehensiveReport(): Promise<string> {
    console.log('Generating comprehensive performance report...');

    const snapshot = await this.getCurrentSnapshot();
    const optimizations = this.optimizationRecommender.getTopSuggestions(10);
    const regressionResults = this.regressionDetector.getResults().slice(-5);
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        overallHealth: snapshot.overall.health,
        overallScore: snapshot.overall.score,
        criticalIssues: snapshot.overall.issues.length,
        optimizationOpportunities: optimizations.length
      },
      currentMetrics: snapshot,
      optimizationRecommendations: optimizations.map(opt => ({
        priority: opt.priority,
        category: opt.rule.category,
        title: opt.rule.title,
        description: opt.rule.description,
        estimatedImprovement: opt.projectedImprovement
      })),
      regressionAnalysis: {
        recentTests: regressionResults.length,
        passRate: regressionResults.filter(r => r.passed).length / regressionResults.length,
        criticalRegressions: regressionResults.reduce((sum, r) => sum + r.summary.criticalRegressions, 0)
      },
      systemCapabilities: this.resourceMonitor.getSystemCapabilities(),
      recommendations: await this.generateActionableRecommendations(snapshot, optimizations)
    };

    const reportPath = `performance/reports/comprehensive-report-${Date.now()}.json`;
    const fs = require('fs/promises');
    await fs.mkdir('performance/reports', { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    this.emit('report_generated', { path: reportPath, type: 'comprehensive' });
    console.log(`Comprehensive report generated: ${reportPath}`);

    return reportPath;
  }

  private async generateActionableRecommendations(
    snapshot: any, 
    optimizations: any[]
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Immediate actions
    if (snapshot.overall.health === 'critical') {
      recommendations.push('IMMEDIATE ACTION REQUIRED: System is in critical state');
    }

    // Top optimization recommendations
    const highPriorityOpts = optimizations.filter(opt => opt.priority >= 8);
    if (highPriorityOpts.length > 0) {
      recommendations.push(`${highPriorityOpts.length} high-priority optimizations available`);
    }

    // Memory recommendations
    if (snapshot.memory?.averageUtilization > 0.8) {
      recommendations.push('Consider implementing memory optimization strategies');
    }

    // Performance recommendations
    if (snapshot.network?.averageResponseTime > 1000) {
      recommendations.push('API response times need optimization');
    }

    return recommendations;
  }

  private async generatePeriodicReport(): Promise<void> {
    try {
      const reportPath = await this.generateComprehensiveReport();
      console.log(`Periodic performance report generated: ${reportPath}`);
    } catch (error) {
      console.error('Failed to generate periodic report:', error);
    }
  }

  // Create a baseline for regression testing
  async createPerformanceBaseline(name: string, version: string): Promise<string> {
    const snapshot = await this.getCurrentSnapshot();
    
    const baselineId = await this.regressionDetector.createBaseline(
      name,
      version,
      ['api_performance', 'memory_usage', 'cpu_usage'],
      snapshot
    );

    this.emit('baseline_created', { id: baselineId, name, version });
    return baselineId;
  }

  // Run regression tests against baseline
  async runRegressionTests(): Promise<any[]> {
    const snapshot = await this.getCurrentSnapshot();
    const results = await this.regressionDetector.runAllTests(snapshot);
    
    this.emit('regression_tests_completed', results);
    return results;
  }

  // Get current system health status
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    details: {
      memory: 'good' | 'warning' | 'critical';
      cpu: 'good' | 'warning' | 'critical';
      network: 'good' | 'warning' | 'critical';
      system: 'good' | 'warning' | 'critical';
    };
  } {
    const memory = this.memoryAnalyzer.getStats();
    const cpu = this.cpuAnalyzer.getStats();
    const network = this.networkMonitor.getStats();
    const systemStress = this.resourceMonitor.isSystemUnderStress();

    const details = {
      memory: memory?.averageUtilization > 0.9 ? 'critical' : 
              memory?.averageUtilization > 0.8 ? 'warning' : 'good',
      cpu: cpu?.averageCPU > 80 ? 'critical' :
           cpu?.averageCPU > 60 ? 'warning' : 'good',
      network: network?.errorRate > 0.1 ? 'critical' :
               network?.averageResponseTime > 2000 ? 'warning' : 'good',
      system: systemStress.severity === 'critical' ? 'critical' :
              systemStress.severity === 'high' ? 'warning' : 'good'
    } as const;

    const criticalCount = Object.values(details).filter(v => v === 'critical').length;
    const warningCount = Object.values(details).filter(v => v === 'warning').length;

    let status: 'healthy' | 'warning' | 'critical';
    if (criticalCount > 0) status = 'critical';
    else if (warningCount > 0) status = 'warning';
    else status = 'healthy';

    const score = 100 - (criticalCount * 30) - (warningCount * 15);

    return { status, score: Math.max(0, score), details };
  }

  // Utility methods for specific analyzers
  getMemoryAnalyzer() { return this.memoryAnalyzer; }
  getCPUAnalyzer() { return this.cpuAnalyzer; }
  getIOAnalyzer() { return this.ioAnalyzer; }
  getNetworkMonitor() { return this.networkMonitor; }
  getCacheAnalyzer() { return this.cacheAnalyzer; }
  getDatabaseOptimizer() { return this.databaseOptimizer; }
  getResourceMonitor() { return this.resourceMonitor; }
  getOptimizationRecommender() { return this.optimizationRecommender; }
  getRegressionDetector() { return this.regressionDetector; }
}

// Export all individual components
export {
  MemoryAnalyzer,
  CPUAnalyzer,
  IOAnalyzer,
  NetworkMonitor,
  CacheAnalyzer,
  OptimizationRecommender,
  PerformanceRegressionDetector,
  DatabaseQueryOptimizer,
  ResourceMonitor
};

// Default instance for easy usage
export const createPerformanceSuite = (options?: PerformanceSuiteOptions) => {
  return new PerformanceSuite(options);
};

// Quick start function
export const startPerformanceMonitoring = (options?: PerformanceSuiteOptions) => {
  const suite = new PerformanceSuite(options);
  suite.start();
  
  // Handle graceful shutdown
  process.on('SIGTERM', () => suite.stop());
  process.on('SIGINT', () => suite.stop());
  
  return suite;
};