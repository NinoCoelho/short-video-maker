import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';

interface NetworkRequest {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  requestSize: number;
  responseSize?: number;
  statusCode?: number;
  duration?: number;
  error?: string;
  protocol: 'http' | 'https';
}

interface NetworkMetrics {
  timestamp: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalBytesTransferred: number;
  requestsPerSecond: number;
  errorRate: number;
  slowRequests: number; // Requests > threshold
}

interface NetworkBottleneck {
  type: 'slow_requests' | 'high_error_rate' | 'excessive_requests' | 'large_payloads';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  requests: NetworkRequest[];
  recommendations: string[];
}

export class NetworkMonitor extends EventEmitter {
  private requests: NetworkRequest[] = [];
  private metrics: NetworkMetrics[] = [];
  private isMonitoring = false;
  private intervalId?: NodeJS.Timeout;
  private readonly maxRequests = 5000;
  private originalHttp: any = {};
  private originalHttps: any = {};

  constructor(
    private options = {
      slowRequestThreshold: 2000, // 2 seconds
      metricsInterval: 15000, // 15 seconds
      enableRequestHooks: true,
      outputPath: 'performance/reports'
    }
  ) {
    super();
    
    if (this.options.enableRequestHooks) {
      this.installNetworkHooks();
    }
  }

  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    
    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, this.options.metricsInterval);

    console.log('Network monitor started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isMonitoring) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isMonitoring = false;
    this.restoreNetworkHooks();
    
    console.log('Network monitor stopped');
    this.emit('stopped');
  }

  private installNetworkHooks(): void {
    // Hook HTTP requests
    this.originalHttp.request = http.request;
    http.request = this.createHttpHook('http', this.originalHttp.request);

    // Hook HTTPS requests
    this.originalHttps.request = https.request;
    https.request = this.createHttpHook('https', this.originalHttps.request);
  }

  private createHttpHook(protocol: 'http' | 'https', originalRequest: Function) {
    return (...args: any[]) => {
      const requestId = this.generateRequestId();
      const startTime = Date.now();
      
      // Parse request details
      let options: any = {};
      let callback: Function | undefined;
      
      if (typeof args[0] === 'string') {
        options.url = args[0];
        if (typeof args[1] === 'object') {
          options = { ...options, ...args[1] };
        }
        callback = args[args.length - 1];
      } else if (typeof args[0] === 'object') {
        options = args[0];
        callback = args[args.length - 1];
      }

      const url = options.url || `${protocol}://${options.hostname || options.host}${options.path || '/'}`;
      const method = options.method || 'GET';

      // Calculate request size
      const requestSize = this.calculateRequestSize(options);

      const request: NetworkRequest = {
        id: requestId,
        timestamp: startTime,
        method,
        url,
        headers: options.headers || {},
        requestSize,
        protocol
      };

      // Create the original request
      const req = originalRequest.apply(protocol === 'http' ? http : https, args);

      // Hook into the response
      const originalCallback = callback;
      if (typeof originalCallback === 'function') {
        args[args.length - 1] = (res: any) => {
          const responseTime = Date.now() - startTime;
          
          request.duration = responseTime;
          request.statusCode = res.statusCode;
          
          // Track response size
          let responseSize = 0;
          const originalOn = res.on;
          res.on = function(event: string, listener: Function) {
            if (event === 'data') {
              const originalListener = listener;
              listener = function(chunk: Buffer) {
                responseSize += chunk.length;
                return originalListener.call(this, chunk);
              };
            } else if (event === 'end') {
              const originalListener = listener;
              listener = function() {
                request.responseSize = responseSize;
                this.recordRequest(request);
                return originalListener.call(this);
              }.bind(this);
            }
            return originalOn.call(res, event, listener);
          }.bind(this);

          originalCallback(res);
        };
      }

      // Handle request errors
      req.on('error', (error: Error) => {
        request.duration = Date.now() - startTime;
        request.error = error.message;
        this.recordRequest(request);
      });

      return req;
    };
  }

  private restoreNetworkHooks(): void {
    if (this.originalHttp.request) {
      http.request = this.originalHttp.request;
    }
    if (this.originalHttps.request) {
      https.request = this.originalHttps.request;
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateRequestSize(options: any): number {
    let size = 0;
    
    // Estimate header size
    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        size += Buffer.byteLength(`${key}: ${value}\r\n`);
      });
    }
    
    // Add method and path size
    const method = options.method || 'GET';
    const path = options.path || '/';
    size += Buffer.byteLength(`${method} ${path} HTTP/1.1\r\n`);
    
    return size;
  }

  recordRequest(request: NetworkRequest): void {
    this.requests.push(request);

    // Keep only recent requests
    if (this.requests.length > this.maxRequests) {
      this.requests.shift();
    }

    this.emit('request', request);

    // Check for immediate issues
    if (request.duration && request.duration > this.options.slowRequestThreshold) {
      this.emit('slow_request', request);
    }

    if (request.error || (request.statusCode && request.statusCode >= 400)) {
      this.emit('request_error', request);
    }
  }

  private collectMetrics(): void {
    const now = Date.now();
    const recentRequests = this.requests.filter(req => 
      now - req.timestamp < this.options.metricsInterval
    );

    if (recentRequests.length === 0) return;

    const successfulRequests = recentRequests.filter(req => 
      !req.error && req.statusCode && req.statusCode < 400
    );
    const failedRequests = recentRequests.filter(req => 
      req.error || (req.statusCode && req.statusCode >= 400)
    );
    const completedRequests = recentRequests.filter(req => req.duration !== undefined);
    const slowRequests = completedRequests.filter(req => 
      req.duration! > this.options.slowRequestThreshold
    );

    const averageResponseTime = completedRequests.length > 0
      ? completedRequests.reduce((sum, req) => sum + (req.duration || 0), 0) / completedRequests.length
      : 0;

    const totalBytesTransferred = recentRequests.reduce((sum, req) => 
      sum + req.requestSize + (req.responseSize || 0), 0
    );

    const requestsPerSecond = recentRequests.length / (this.options.metricsInterval / 1000);

    const metrics: NetworkMetrics = {
      timestamp: now,
      totalRequests: recentRequests.length,
      successfulRequests: successfulRequests.length,
      failedRequests: failedRequests.length,
      averageResponseTime,
      totalBytesTransferred,
      requestsPerSecond,
      errorRate: failedRequests.length / recentRequests.length,
      slowRequests: slowRequests.length
    };

    this.metrics.push(metrics);
    this.emit('metrics', metrics);

    // Analyze bottlenecks
    this.analyzeBottlenecks(recentRequests, metrics);
  }

  private analyzeBottlenecks(requests: NetworkRequest[], metrics: NetworkMetrics): void {
    const bottlenecks: NetworkBottleneck[] = [];

    // Slow requests analysis
    const slowRequests = requests.filter(req => 
      req.duration && req.duration > this.options.slowRequestThreshold
    );
    if (slowRequests.length > requests.length * 0.1) {
      bottlenecks.push({
        type: 'slow_requests',
        severity: this.getSeverityByPercentage(slowRequests.length / requests.length),
        description: `${slowRequests.length} slow network requests detected (>${this.options.slowRequestThreshold}ms)`,
        requests: slowRequests.slice(0, 10),
        recommendations: [
          'Optimize API endpoints for better response times',
          'Implement request caching where appropriate',
          'Use connection pooling and keep-alive',
          'Consider request batching or pagination',
          'Review network latency and bandwidth'
        ]
      });
    }

    // High error rate analysis
    if (metrics.errorRate > 0.05) {
      const errorRequests = requests.filter(req => 
        req.error || (req.statusCode && req.statusCode >= 400)
      );
      bottlenecks.push({
        type: 'high_error_rate',
        severity: this.getSeverityByPercentage(metrics.errorRate),
        description: `High network error rate: ${(metrics.errorRate * 100).toFixed(2)}%`,
        requests: errorRequests.slice(0, 10),
        recommendations: [
          'Implement retry mechanisms with exponential backoff',
          'Add circuit breaker patterns for failing services',
          'Improve error handling and logging',
          'Monitor third-party service status',
          'Validate request parameters before sending'
        ]
      });
    }

    // Excessive requests analysis
    if (metrics.requestsPerSecond > 50) {
      bottlenecks.push({
        type: 'excessive_requests',
        severity: metrics.requestsPerSecond > 200 ? 'critical' : 
                 metrics.requestsPerSecond > 100 ? 'high' : 'medium',
        description: `High request frequency: ${metrics.requestsPerSecond.toFixed(2)} requests/second`,
        requests: requests.slice(0, 20),
        recommendations: [
          'Implement request throttling or rate limiting',
          'Use caching to reduce redundant requests',
          'Batch multiple operations into single requests',
          'Consider using WebSockets for real-time data',
          'Review request patterns for optimization opportunities'
        ]
      });
    }

    // Large payload analysis
    const averagePayloadSize = metrics.totalBytesTransferred / requests.length;
    const largeRequests = requests.filter(req => 
      (req.requestSize + (req.responseSize || 0)) > 1024 * 1024 // > 1MB
    );
    if (largeRequests.length > 0 || averagePayloadSize > 500 * 1024) {
      bottlenecks.push({
        type: 'large_payloads',
        severity: averagePayloadSize > 5 * 1024 * 1024 ? 'high' : 'medium',
        description: `Large network payloads detected - average: ${(averagePayloadSize / 1024).toFixed(2)} KB`,
        requests: largeRequests.slice(0, 5),
        recommendations: [
          'Implement response compression (gzip/deflate)',
          'Use pagination for large data sets',
          'Optimize JSON payloads by removing unnecessary fields',
          'Consider binary formats for large data transfers',
          'Implement streaming for large file transfers'
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
    if (this.requests.length === 0) return null;

    const latest = this.requests[this.requests.length - 1];
    const oldest = this.requests[0];
    
    const completedRequests = this.requests.filter(req => req.duration !== undefined);
    const errorRequests = this.requests.filter(req => 
      req.error || (req.statusCode && req.statusCode >= 400)
    );
    const slowRequests = this.requests.filter(req => 
      req.duration && req.duration > this.options.slowRequestThreshold
    );

    // Protocol breakdown
    const protocolStats = {
      http: this.requests.filter(req => req.protocol === 'http').length,
      https: this.requests.filter(req => req.protocol === 'https').length
    };

    // Status code breakdown
    const statusCodes = new Map<number, number>();
    this.requests.forEach(req => {
      if (req.statusCode) {
        statusCodes.set(req.statusCode, (statusCodes.get(req.statusCode) || 0) + 1);
      }
    });

    return {
      duration: latest.timestamp - oldest.timestamp,
      totalRequests: this.requests.length,
      completedRequests: completedRequests.length,
      averageResponseTime: completedRequests.length > 0
        ? completedRequests.reduce((sum, req) => sum + (req.duration || 0), 0) / completedRequests.length
        : 0,
      slowRequests: slowRequests.length,
      errorRequests: errorRequests.length,
      errorRate: errorRequests.length / this.requests.length,
      totalBytesTransferred: this.requests.reduce((sum, req) => 
        sum + req.requestSize + (req.responseSize || 0), 0
      ),
      protocolStats,
      statusCodeDistribution: Object.fromEntries(statusCodes),
      topSlowRequests: slowRequests
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, 10)
    };
  }

  async generateReport(): Promise<string> {
    const stats = this.getStats();
    if (!stats) throw new Error('No network data available');

    const urlPatterns = this.analyzeUrlPatterns();
    const performanceTrends = this.analyzePerformanceTrends();

    const report = {
      timestamp: new Date().toISOString(),
      duration: `${Math.round(stats.duration / 1000)}s`,
      summary: {
        totalRequests: stats.totalRequests,
        averageResponseTime: `${stats.averageResponseTime.toFixed(2)}ms`,
        errorRate: `${(stats.errorRate * 100).toFixed(2)}%`,
        slowRequests: stats.slowRequests,
        totalBytesTransferred: `${(stats.totalBytesTransferred / 1024 / 1024).toFixed(2)} MB`
      },
      protocolStats: stats.protocolStats,
      statusCodeDistribution: stats.statusCodeDistribution,
      urlPatterns,
      performanceTrends,
      topSlowRequests: stats.topSlowRequests,
      recommendations: this.generateRecommendations(stats)
    };

    const reportPath = path.join(this.options.outputPath, `network-report-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }

  private analyzeUrlPatterns() {
    const urlCounts = new Map<string, number>();
    const urlErrors = new Map<string, number>();
    const urlResponseTimes = new Map<string, number[]>();

    this.requests.forEach(req => {
      // Extract base URL pattern
      const baseUrl = req.url.split('?')[0]; // Remove query parameters
      urlCounts.set(baseUrl, (urlCounts.get(baseUrl) || 0) + 1);
      
      if (req.error || (req.statusCode && req.statusCode >= 400)) {
        urlErrors.set(baseUrl, (urlErrors.get(baseUrl) || 0) + 1);
      }
      
      if (req.duration) {
        if (!urlResponseTimes.has(baseUrl)) {
          urlResponseTimes.set(baseUrl, []);
        }
        urlResponseTimes.get(baseUrl)!.push(req.duration);
      }
    });

    const sortedUrls = Array.from(urlCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    return {
      mostRequestedUrls: sortedUrls.map(([url, count]) => {
        const errors = urlErrors.get(url) || 0;
        const responseTimes = urlResponseTimes.get(url) || [];
        const avgResponseTime = responseTimes.length > 0
          ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
          : 0;

        return {
          url,
          requestCount: count,
          errorCount: errors,
          errorRate: errors / count,
          averageResponseTime: avgResponseTime
        };
      })
    };
  }

  private analyzePerformanceTrends() {
    if (this.metrics.length < 2) return { trends: [] };

    const latest = this.metrics[this.metrics.length - 1];
    const previous = this.metrics[this.metrics.length - 2];

    const trends = [];

    const responseTimeChange = ((latest.averageResponseTime - previous.averageResponseTime) / previous.averageResponseTime) * 100;
    if (Math.abs(responseTimeChange) > 20) {
      trends.push({
        metric: 'Response Time',
        change: `${responseTimeChange > 0 ? '+' : ''}${responseTimeChange.toFixed(1)}%`,
        significance: Math.abs(responseTimeChange) > 50 ? 'high' : 'medium'
      });
    }

    const errorRateChange = ((latest.errorRate - previous.errorRate) / (previous.errorRate || 0.01)) * 100;
    if (Math.abs(errorRateChange) > 25) {
      trends.push({
        metric: 'Error Rate',
        change: `${errorRateChange > 0 ? '+' : ''}${errorRateChange.toFixed(1)}%`,
        significance: Math.abs(errorRateChange) > 100 ? 'high' : 'medium'
      });
    }

    return { trends };
  }

  private generateRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.averageResponseTime > 1000) {
      recommendations.push('High average response time - optimize API performance and network latency');
    }

    if (stats.errorRate > 0.05) {
      recommendations.push('Elevated error rate - improve error handling and service reliability');
    }

    if (stats.slowRequests > stats.totalRequests * 0.1) {
      recommendations.push('Many slow requests detected - implement caching and optimize endpoints');
    }

    if (stats.totalBytesTransferred > 100 * 1024 * 1024) { // 100MB
      recommendations.push('High data transfer volume - consider compression and payload optimization');
    }

    return recommendations;
  }
}