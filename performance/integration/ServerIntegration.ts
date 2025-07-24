// Integration example for adding performance monitoring to the existing server

import { Express, Request, Response, NextFunction } from 'express';
import { createPerformanceSuite, PerformanceSuite } from '../index';

export class PerformanceIntegration {
  private performanceSuite: PerformanceSuite;
  
  constructor(private options = {
    enabledModules: {
      memory: true,
      cpu: true,
      network: true,
      cache: true,
      resources: true
    },
    outputPath: 'performance/reports',
    enableWebSocketReporting: true
  }) {
    this.performanceSuite = createPerformanceSuite(options);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Log critical alerts
    this.performanceSuite.on('critical_alert', (alert) => {
      console.error('🚨 CRITICAL PERFORMANCE ALERT:', {
        type: alert.type,
        message: alert.data.message || alert.data.description,
        timestamp: new Date().toISOString()
      });
      
      // Here you could integrate with your existing logging system
      // logger.error('Critical performance alert', alert);
    });

    // Log optimization opportunities
    this.performanceSuite.on('optimization_needed', (optimization) => {
      console.info('💡 Performance optimization opportunity:', {
        type: optimization.type,
        suggestions: optimization.data.length,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Add performance monitoring middleware to Express app
  addExpressMiddleware(app: Express): void {
    // Request tracking middleware
    app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const originalSend = res.send;

      // Override res.send to capture response data
      res.send = function(data: any) {
        const duration = Date.now() - startTime;
        const size = Buffer.byteLength(JSON.stringify(data || ''), 'utf8');

        // Record network metrics
        const networkMonitor = this.performanceSuite.getNetworkMonitor();
        networkMonitor.recordRequest({
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: startTime,
          method: req.method,
          url: req.originalUrl,
          headers: req.headers as Record<string, string>,
          requestSize: parseInt(req.get('content-length') || '0'),
          responseSize: size,
          statusCode: res.statusCode,
          duration,
          protocol: req.protocol as 'http' | 'https'
        });

        return originalSend.call(this, data);
      }.bind(this);

      next();
    });

    // Add performance API endpoints
    this.addPerformanceEndpoints(app);
  }

  private addPerformanceEndpoints(app: Express): void {
    // Health check endpoint
    app.get('/api/performance/health', async (req: Request, res: Response) => {
      try {
        const health = this.performanceSuite.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get health status' });
      }
    });

    // Current metrics endpoint
    app.get('/api/performance/metrics', async (req: Request, res: Response) => {
      try {
        const snapshot = await this.performanceSuite.getCurrentSnapshot();
        res.json(snapshot);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get performance metrics' });
      }
    });

    // Generate comprehensive report
    app.post('/api/performance/report', async (req: Request, res: Response) => {
      try {
        const reportPath = await this.performanceSuite.generateComprehensiveReport();
        res.json({ reportPath, message: 'Report generated successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to generate performance report' });
      }
    });

    // Get optimization recommendations
    app.get('/api/performance/optimizations', (req: Request, res: Response) => {
      try {
        const recommender = this.performanceSuite.getOptimizationRecommender();
        const suggestions = recommender.getTopSuggestions(10);
        res.json(suggestions);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get optimization recommendations' });
      }
    });

    // Create performance baseline
    app.post('/api/performance/baseline', async (req: Request, res: Response) => {
      try {
        const { name, version } = req.body;
        const baselineId = await this.performanceSuite.createPerformanceBaseline(
          name || `baseline_${Date.now()}`,
          version || '1.0.0'
        );
        res.json({ baselineId, message: 'Baseline created successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to create performance baseline' });
      }
    });

    // Run regression tests
    app.post('/api/performance/regression', async (req: Request, res: Response) => {
      try {
        const results = await this.performanceSuite.runRegressionTests();
        res.json({ results, message: 'Regression tests completed' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to run regression tests' });
      }
    });

    // Get active alerts
    app.get('/api/performance/alerts', (req: Request, res: Response) => {
      try {
        const resourceMonitor = this.performanceSuite.getResourceMonitor();
        const alerts = resourceMonitor.getActiveAlerts();
        res.json(alerts);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get performance alerts' });
      }
    });
  }

  // Add WebSocket support for real-time performance data
  addWebSocketSupport(io: any): void {
    const performanceNamespace = io.of('/performance');
    
    performanceNamespace.on('connection', (socket: any) => {
      console.log('Performance monitoring client connected');

      // Send initial data
      this.performanceSuite.getCurrentSnapshot().then(snapshot => {
        socket.emit('initial-metrics', snapshot);
      });

      // Set up real-time updates
      const metricsInterval = setInterval(async () => {
        try {
          const snapshot = await this.performanceSuite.getCurrentSnapshot();
          socket.emit('metrics-update', snapshot);
        } catch (error) {
          console.error('Failed to send metrics update:', error);
        }
      }, 5000); // Update every 5 seconds

      // Forward alerts to connected clients
      const alertHandler = (alert: any) => {
        socket.emit('performance-alert', alert);
      };

      this.performanceSuite.on('critical_alert', alertHandler);
      this.performanceSuite.on('optimization_needed', alertHandler);

      socket.on('disconnect', () => {
        console.log('Performance monitoring client disconnected');
        clearInterval(metricsInterval);
        this.performanceSuite.removeListener('critical_alert', alertHandler);
        this.performanceSuite.removeListener('optimization_needed', alertHandler);
      });

      // Handle client requests
      socket.on('request-health-status', () => {
        const health = this.performanceSuite.getHealthStatus();
        socket.emit('health-status', health);
      });

      socket.on('request-optimizations', () => {
        const recommender = this.performanceSuite.getOptimizationRecommender();
        const suggestions = recommender.getTopSuggestions(5);
        socket.emit('optimization-suggestions', suggestions);
      });
    });
  }

  // Start performance monitoring
  start(): void {
    console.log('🚀 Starting integrated performance monitoring...');
    this.performanceSuite.start();
    
    // Generate initial baseline if none exists
    setTimeout(async () => {
      try {
        const regressionDetector = this.performanceSuite.getRegressionDetector();
        const baselines = regressionDetector.getBaselines();
        
        if (baselines.length === 0) {
          console.log('📊 Creating initial performance baseline...');
          await this.performanceSuite.createPerformanceBaseline(
            'initial-baseline',
            '1.0.0'
          );
        }
      } catch (error) {
        console.error('Failed to create initial baseline:', error);
      }
    }, 30000); // Wait 30 seconds for initial data collection
  }

  // Stop performance monitoring
  stop(): void {
    console.log('🛑 Stopping integrated performance monitoring...');
    this.performanceSuite.stop();
  }

  // Get the performance suite instance for advanced usage
  getPerformanceSuite(): PerformanceSuite {
    return this.performanceSuite;
  }

  // Database integration helper
  instrumentDatabase(db: any, type: 'sequelize' | 'mongoose' | 'custom' = 'custom'): void {
    const optimizer = this.performanceSuite.getDatabaseOptimizer();
    const interceptor = optimizer.createQueryInterceptor();

    switch (type) {
      case 'sequelize':
        interceptor.interceptSequelize(db);
        break;
      case 'mongoose':
        // Implement mongoose integration if needed
        console.warn('Mongoose integration not yet implemented');
        break;
      case 'custom':
        // For custom database implementations, manually record queries
        console.info('Use DatabaseQueryOptimizer.recordQuery() to track custom database operations');
        break;
    }
  }

  // Cache integration helper
  instrumentCache(cache: any): any {
    const cacheAnalyzer = this.performanceSuite.getCacheAnalyzer();
    return cacheAnalyzer.createInstrumentedCache(cache);
  }
}

// Example usage in your existing server setup:
/*
import express from 'express';
import { Server } from 'socket.io';
import { PerformanceIntegration } from './performance/integration/ServerIntegration';

const app = express();
const server = createServer(app);
const io = new Server(server);

// Create performance integration
const performanceIntegration = new PerformanceIntegration({
  enabledModules: {
    memory: true,
    cpu: true,
    network: true,
    cache: true,
    resources: true
  },
  outputPath: 'performance/reports'
});

// Add middleware and endpoints
performanceIntegration.addExpressMiddleware(app);

// Add WebSocket support
performanceIntegration.addWebSocketSupport(io);

// Start performance monitoring
performanceIntegration.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  performanceIntegration.stop();
});

process.on('SIGINT', () => {
  performanceIntegration.stop();
});

server.listen(3000, () => {
  console.log('Server with performance monitoring started on port 3000');
});
*/

export default PerformanceIntegration;