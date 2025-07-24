import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

interface PerformanceBaseline {
  id: string;
  name: string;
  timestamp: number;
  version: string;
  metrics: {
    memory: {
      averageUsage: number;
      peakUsage: number;
      utilization: number;
    };
    cpu: {
      averageUsage: number;
      peakUsage: number;
      eventLoopDelay: number;
    };
    network: {
      averageResponseTime: number;
      throughput: number;
      errorRate: number;
    };
    cache: {
      hitRate: number;
      avgAccessTime: number;
    };
    io: {
      avgLatency: number;
      operationsPerSecond: number;
      errorRate: number;
    };
  };
  testScenarios: string[];
  environment: {
    nodeVersion: string;
    platform: string;
    totalMemory: number;
    cpuCores: number;
  };
}

interface RegressionTest {
  id: string;
  name: string;
  description: string;
  baseline: string; // baseline ID
  thresholds: {
    memory: { max: number; acceptable: number }; // percentage increase
    cpu: { max: number; acceptable: number };
    responseTime: { max: number; acceptable: number };
    throughput: { min: number; acceptable: number }; // percentage decrease
    errorRate: { max: number; acceptable: number };
  };
  testFunction: () => Promise<any>;
}

interface RegressionResult {
  testId: string;
  timestamp: number;
  passed: boolean;
  regressions: Array<{
    metric: string;
    baseline: number;
    current: number;
    change: number; // percentage
    severity: 'minor' | 'major' | 'critical';
    threshold: 'acceptable' | 'max';
  }>;
  improvements: Array<{
    metric: string;
    baseline: number;
    current: number;
    improvement: number; // percentage
  }>;
  summary: {
    totalRegressions: number;
    criticalRegressions: number;
    totalImprovements: number;
    overallScore: number; // 0-100
  };
}

export class PerformanceRegressionDetector extends EventEmitter {
  private baselines = new Map<string, PerformanceBaseline>();
  private tests = new Map<string, RegressionTest>();
  private results: RegressionResult[] = [];
  
  constructor(
    private options = {
      baselinePath: 'performance/baselines',
      reportPath: 'performance/reports',
      maxResults: 100,
      alertOnRegression: true
    }
  ) {
    super();
    this.loadBaselines();
  }

  async loadBaselines(): Promise<void> {
    try {
      const baselineDir = this.options.baselinePath;
      const files = await fs.readdir(baselineDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(baselineDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const baseline: PerformanceBaseline = JSON.parse(content);
          this.baselines.set(baseline.id, baseline);
        }
      }
      
      console.log(`Loaded ${this.baselines.size} performance baselines`);
    } catch (error) {
      console.warn('No existing baselines found, will create new ones');
    }
  }

  async createBaseline(
    name: string,
    version: string,
    testScenarios: string[],
    currentMetrics: any
  ): Promise<string> {
    const id = `baseline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const baseline: PerformanceBaseline = {
      id,
      name,
      timestamp: Date.now(),
      version,
      metrics: {
        memory: {
          averageUsage: currentMetrics.memory?.averageHeapUsage || 0,
          peakUsage: currentMetrics.memory?.peakHeapUsage || 0,
          utilization: currentMetrics.memory?.averageUtilization || 0
        },
        cpu: {
          averageUsage: currentMetrics.cpu?.averageCPU || 0,
          peakUsage: currentMetrics.cpu?.peakCPU || 0,
          eventLoopDelay: currentMetrics.cpu?.averageEventLoopDelay || 0
        },
        network: {
          averageResponseTime: currentMetrics.network?.averageResponseTime || 0,
          throughput: currentMetrics.network?.totalBytesTransferred || 0,
          errorRate: currentMetrics.network?.errorRate || 0
        },
        cache: {
          hitRate: currentMetrics.cache?.overallHitRate || 0,
          avgAccessTime: currentMetrics.cache?.averageAccessTime || 0
        },
        io: {
          avgLatency: currentMetrics.io?.averageLatency || 0,
          operationsPerSecond: currentMetrics.io?.operationsPerSecond || 0,
          errorRate: currentMetrics.io?.errorRate || 0
        }
      },
      testScenarios,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        totalMemory: require('os').totalmem(),
        cpuCores: require('os').cpus().length
      }
    };

    this.baselines.set(id, baseline);
    await this.saveBaseline(baseline);
    
    this.emit('baseline_created', baseline);
    return id;
  }

  private async saveBaseline(baseline: PerformanceBaseline): Promise<void> {
    const baselineDir = this.options.baselinePath;
    await fs.mkdir(baselineDir, { recursive: true });
    
    const filePath = path.join(baselineDir, `${baseline.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(baseline, null, 2));
  }

  registerTest(test: RegressionTest): void {
    this.tests.set(test.id, test);
  }

  registerDefaultTests(): void {
    // Memory regression test
    this.registerTest({
      id: 'memory_regression',
      name: 'Memory Usage Regression',
      description: 'Detects increases in memory usage that may indicate memory leaks or inefficiencies',
      baseline: 'latest', // Use latest baseline
      thresholds: {
        memory: { max: 25, acceptable: 10 }, // Max 25% increase, 10% acceptable
        cpu: { max: 20, acceptable: 5 },
        responseTime: { max: 30, acceptable: 10 },
        throughput: { min: 20, acceptable: 5 }, // Min 20% decrease to fail
        errorRate: { max: 50, acceptable: 10 }
      },
      testFunction: async () => {
        // This would run actual performance tests
        return this.runMemoryStressTest();
      }
    });

    // Response time regression test
    this.registerTest({
      id: 'response_time_regression',
      name: 'Response Time Regression',
      description: 'Detects increases in API response times',
      baseline: 'latest',
      thresholds: {
        memory: { max: 15, acceptable: 5 },
        cpu: { max: 20, acceptable: 10 },
        responseTime: { max: 20, acceptable: 5 }, // Strict response time limits
        throughput: { min: 15, acceptable: 5 },
        errorRate: { max: 25, acceptable: 5 }
      },
      testFunction: async () => {
        return this.runResponseTimeTest();
      }
    });

    // Throughput regression test
    this.registerTest({
      id: 'throughput_regression',
      name: 'Throughput Regression',
      description: 'Detects decreases in system throughput',
      baseline: 'latest',
      thresholds: {
        memory: { max: 20, acceptable: 10 },
        cpu: { max: 25, acceptable: 10 },
        responseTime: { max: 15, acceptable: 5 },
        throughput: { min: 10, acceptable: 3 }, // Very sensitive to throughput changes
        errorRate: { max: 20, acceptable: 5 }
      },
      testFunction: async () => {
        return this.runThroughputTest();
      }
    });
  }

  async runTest(testId: string, currentMetrics: any): Promise<RegressionResult> {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    // Get baseline (use latest if 'latest' is specified)
    let baseline: PerformanceBaseline;
    if (test.baseline === 'latest') {
      baseline = this.getLatestBaseline();
    } else {
      baseline = this.baselines.get(test.baseline);
    }

    if (!baseline) {
      throw new Error(`Baseline ${test.baseline} not found`);
    }

    // Run the test
    const testMetrics = await test.testFunction();
    const mergedMetrics = { ...currentMetrics, ...testMetrics };

    // Compare metrics
    const result = this.compareMetrics(test, baseline, mergedMetrics);
    
    this.results.push(result);
    if (this.results.length > this.options.maxResults) {
      this.results.shift();
    }

    this.emit('test_completed', result);

    // Alert on regressions
    if (this.options.alertOnRegression && result.summary.criticalRegressions > 0) {
      this.emit('critical_regression', result);
    }

    return result;
  }

  private getLatestBaseline(): PerformanceBaseline {
    let latest: PerformanceBaseline | null = null;
    
    for (const baseline of this.baselines.values()) {
      if (!latest || baseline.timestamp > latest.timestamp) {
        latest = baseline;
      }
    }

    if (!latest) {
      throw new Error('No baselines available');
    }

    return latest;
  }

  private compareMetrics(
    test: RegressionTest, 
    baseline: PerformanceBaseline, 
    currentMetrics: any
  ): RegressionResult {
    const regressions = [];
    const improvements = [];

    // Memory comparison
    const memoryChange = this.calculatePercentageChange(
      baseline.metrics.memory.averageUsage,
      currentMetrics.memory?.averageHeapUsage || 0
    );
    
    if (memoryChange > test.thresholds.memory.acceptable) {
      regressions.push({
        metric: 'Memory Usage',
        baseline: baseline.metrics.memory.averageUsage,
        current: currentMetrics.memory?.averageHeapUsage || 0,
        change: memoryChange,
        severity: memoryChange > test.thresholds.memory.max ? 'critical' : 'major',
        threshold: memoryChange > test.thresholds.memory.max ? 'max' : 'acceptable'
      });
    } else if (memoryChange < -5) { // 5% improvement threshold
      improvements.push({
        metric: 'Memory Usage',
        baseline: baseline.metrics.memory.averageUsage,
        current: currentMetrics.memory?.averageHeapUsage || 0,
        improvement: Math.abs(memoryChange)
      });
    }

    // CPU comparison
    const cpuChange = this.calculatePercentageChange(
      baseline.metrics.cpu.averageUsage,
      currentMetrics.cpu?.averageCPU || 0
    );
    
    if (cpuChange > test.thresholds.cpu.acceptable) {
      regressions.push({
        metric: 'CPU Usage',
        baseline: baseline.metrics.cpu.averageUsage,
        current: currentMetrics.cpu?.averageCPU || 0,
        change: cpuChange,
        severity: cpuChange > test.thresholds.cpu.max ? 'critical' : 'major',
        threshold: cpuChange > test.thresholds.cpu.max ? 'max' : 'acceptable'
      });
    } else if (cpuChange < -5) {
      improvements.push({
        metric: 'CPU Usage',
        baseline: baseline.metrics.cpu.averageUsage,
        current: currentMetrics.cpu?.averageCPU || 0,
        improvement: Math.abs(cpuChange)
      });
    }

    // Response Time comparison
    const responseTimeChange = this.calculatePercentageChange(
      baseline.metrics.network.averageResponseTime,
      currentMetrics.network?.averageResponseTime || 0
    );
    
    if (responseTimeChange > test.thresholds.responseTime.acceptable) {
      regressions.push({
        metric: 'Response Time',
        baseline: baseline.metrics.network.averageResponseTime,
        current: currentMetrics.network?.averageResponseTime || 0,
        change: responseTimeChange,
        severity: responseTimeChange > test.thresholds.responseTime.max ? 'critical' : 'major',
        threshold: responseTimeChange > test.thresholds.responseTime.max ? 'max' : 'acceptable'
      });
    } else if (responseTimeChange < -10) {
      improvements.push({
        metric: 'Response Time',
        baseline: baseline.metrics.network.averageResponseTime,
        current: currentMetrics.network?.averageResponseTime || 0,
        improvement: Math.abs(responseTimeChange)
      });
    }

    // Throughput comparison (decrease is bad)
    const throughputChange = this.calculatePercentageChange(
      baseline.metrics.network.throughput,
      currentMetrics.network?.totalBytesTransferred || 0
    );
    
    if (throughputChange < -test.thresholds.throughput.acceptable) {
      regressions.push({
        metric: 'Throughput',
        baseline: baseline.metrics.network.throughput,
        current: currentMetrics.network?.totalBytesTransferred || 0,
        change: throughputChange,
        severity: throughputChange < -test.thresholds.throughput.min ? 'critical' : 'major',
        threshold: throughputChange < -test.thresholds.throughput.min ? 'max' : 'acceptable'
      });
    } else if (throughputChange > 10) {
      improvements.push({
        metric: 'Throughput',
        baseline: baseline.metrics.network.throughput,
        current: currentMetrics.network?.totalBytesTransferred || 0,
        improvement: throughputChange
      });
    }

    // Error Rate comparison
    const errorRateChange = this.calculatePercentageChange(
      baseline.metrics.network.errorRate,
      currentMetrics.network?.errorRate || 0
    );
    
    if (errorRateChange > test.thresholds.errorRate.acceptable) {
      regressions.push({
        metric: 'Error Rate',
        baseline: baseline.metrics.network.errorRate,
        current: currentMetrics.network?.errorRate || 0,
        change: errorRateChange,
        severity: errorRateChange > test.thresholds.errorRate.max ? 'critical' : 'major',
        threshold: errorRateChange > test.thresholds.errorRate.max ? 'max' : 'acceptable'
      });
    } else if (errorRateChange < -20) {
      improvements.push({
        metric: 'Error Rate',
        baseline: baseline.metrics.network.errorRate,
        current: currentMetrics.network?.errorRate || 0,
        improvement: Math.abs(errorRateChange)
      });
    }

    // Calculate overall score
    const criticalRegressions = regressions.filter(r => r.severity === 'critical').length;
    const majorRegressions = regressions.filter(r => r.severity === 'major').length;
    const totalImprovements = improvements.length;

    let score = 100;
    score -= criticalRegressions * 30;
    score -= majorRegressions * 15;
    score += totalImprovements * 5;
    score = Math.max(0, Math.min(100, score));

    return {
      testId: test.id,
      timestamp: Date.now(),
      passed: regressions.length === 0,
      regressions,
      improvements,
      summary: {
        totalRegressions: regressions.length,
        criticalRegressions,
        totalImprovements,
        overallScore: score
      }
    };
  }

  private calculatePercentageChange(baseline: number, current: number): number {
    if (baseline === 0) return current > 0 ? 100 : 0;
    return ((current - baseline) / baseline) * 100;
  }

  // Mock test functions (these would be replaced with actual performance tests)
  private async runMemoryStressTest(): Promise<any> {
    // Simulate memory-intensive operations
    const largeArrays = [];
    for (let i = 0; i < 100; i++) {
      largeArrays.push(new Array(10000).fill(Math.random()));
    }
    
    // Return mock metrics
    return {
      memory: {
        averageHeapUsage: process.memoryUsage().heapUsed,
        peakHeapUsage: process.memoryUsage().heapTotal,
        averageUtilization: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal
      }
    };
  }

  private async runResponseTimeTest(): Promise<any> {
    // Simulate API calls and measure response times
    const startTime = Date.now();
    
    // Simulate some async work
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    const endTime = Date.now();
    
    return {
      network: {
        averageResponseTime: endTime - startTime,
        errorRate: Math.random() * 0.01 // 0-1% error rate
      }
    };
  }

  private async runThroughputTest(): Promise<any> {
    // Simulate throughput measurement
    const bytesProcessed = Math.floor(Math.random() * 1000000) + 500000; // 0.5-1.5MB
    
    return {
      network: {
        totalBytesTransferred: bytesProcessed
      }
    };
  }

  async runAllTests(currentMetrics: any): Promise<RegressionResult[]> {
    const results = [];
    
    for (const [testId] of this.tests) {
      try {
        const result = await this.runTest(testId, currentMetrics);
        results.push(result);
      } catch (error) {
        console.error(`Failed to run test ${testId}:`, error);
      }
    }
    
    return results;
  }

  async generateRegressionReport(): Promise<string> {
    const recentResults = this.results.slice(-10); // Last 10 test runs
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.tests.size,
        totalBaselines: this.baselines.size,
        recentTestRuns: recentResults.length,
        passRate: recentResults.filter(r => r.passed).length / recentResults.length * 100,
        averageScore: recentResults.reduce((sum, r) => sum + r.summary.overallScore, 0) / recentResults.length
      },
      recentResults,
      trendAnalysis: this.analyzeTrends(recentResults),
      recommendations: this.generateRegressionRecommendations(recentResults)
    };

    const reportPath = path.join(this.options.reportPath, `regression-report-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }

  private analyzeTrends(results: RegressionResult[]): any {
    if (results.length < 3) return { trends: [] };

    const trends = [];

    // Analyze score trends
    const scores = results.map(r => r.summary.overallScore);
    const scoresTrend = this.calculateTrend(scores);
    
    if (Math.abs(scoresTrend) > 10) {
      trends.push({
        metric: 'Overall Performance Score',
        direction: scoresTrend > 0 ? 'improving' : 'degrading',
        magnitude: Math.abs(scoresTrend),
        significance: Math.abs(scoresTrend) > 25 ? 'high' : 'medium'
      });
    }

    // Analyze regression trends
    const regressionCounts = results.map(r => r.summary.totalRegressions);
    const regressionTrend = this.calculateTrend(regressionCounts);
    
    if (Math.abs(regressionTrend) > 0.5) {
      trends.push({
        metric: 'Regression Count',
        direction: regressionTrend > 0 ? 'increasing' : 'decreasing',
        magnitude: Math.abs(regressionTrend),
        significance: Math.abs(regressionTrend) > 2 ? 'high' : 'medium'
      });
    }

    return { trends };
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

  private generateRegressionRecommendations(results: RegressionResult[]): string[] {
    const recommendations = [];
    
    const recentRegressions = results.flatMap(r => r.regressions);
    const criticalRegressions = recentRegressions.filter(r => r.severity === 'critical');
    
    if (criticalRegressions.length > 0) {
      recommendations.push('Address critical performance regressions immediately');
      
      const memoryRegressions = criticalRegressions.filter(r => r.metric === 'Memory Usage');
      if (memoryRegressions.length > 0) {
        recommendations.push('Investigate memory leaks and optimize memory usage patterns');
      }
      
      const cpuRegressions = criticalRegressions.filter(r => r.metric === 'CPU Usage');
      if (cpuRegressions.length > 0) {
        recommendations.push('Profile and optimize CPU-intensive operations');
      }
      
      const responseTimeRegressions = criticalRegressions.filter(r => r.metric === 'Response Time');
      if (responseTimeRegressions.length > 0) {
        recommendations.push('Optimize API endpoints and database queries');
      }
    }
    
    if (results.some(r => r.summary.overallScore < 70)) {
      recommendations.push('Overall performance score is low - consider comprehensive performance review');
    }
    
    if (results.filter(r => !r.passed).length > results.length * 0.5) {
      recommendations.push('High regression failure rate - review testing thresholds and baseline validity');
    }
    
    return recommendations;
  }

  getBaselines(): PerformanceBaseline[] {
    return Array.from(this.baselines.values());
  }

  getTests(): RegressionTest[] {
    return Array.from(this.tests.values());
  }

  getResults(): RegressionResult[] {
    return this.results;
  }

  async deleteBaseline(id: string): Promise<void> {
    if (this.baselines.has(id)) {
      this.baselines.delete(id);
      
      // Also delete the file
      const filePath = path.join(this.options.baselinePath, `${id}.json`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(`Could not delete baseline file ${filePath}:`, error);
      }
    }
  }
}