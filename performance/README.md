# Performance Monitoring & Optimization Suite

A comprehensive performance profiling and optimization toolkit for Node.js applications, specifically designed for the short video maker platform.

## 🚀 Features

### Core Analyzers
- **Memory Analysis** - Detect memory leaks, monitor heap usage, and track allocation patterns
- **CPU Profiling** - Identify CPU bottlenecks, event loop lag, and processing inefficiencies  
- **I/O Monitoring** - Track file system operations, detect slow I/O, and optimize disk usage
- **Network Analysis** - Monitor HTTP requests, response times, and network efficiency
- **Cache Performance** - Analyze cache hit rates, access patterns, and optimization opportunities

### Advanced Tools
- **Database Query Optimization** - Analyze slow queries, suggest indexes, and optimize database performance
- **Resource Monitoring** - Track system resources (CPU, memory, disk, network) in real-time
- **Optimization Recommender** - AI-powered suggestions for performance improvements
- **Regression Detection** - Automated performance regression testing and alerting
- **Performance Dashboard** - Real-time visualization of system metrics

## 📦 Installation

The performance suite is already integrated into the project. To use it:

```bash
# Install dependencies (already included in main package.json)
npm install

# Start performance monitoring
npm run performance:start

# Generate performance report  
npm run performance:report

# Check system health
npm run performance:health

# Stop monitoring
npm run performance:stop
```

## 🎯 Quick Start

### 1. Basic Monitoring

```typescript
import { createPerformanceSuite } from './performance';

// Start comprehensive monitoring
const suite = createPerformanceSuite({
  enabledModules: {
    memory: true,
    cpu: true,
    network: true,
    cache: true,
    resources: true
  },
  outputPath: 'performance/reports'
});

suite.start();

// Listen for critical alerts
suite.on('critical_alert', (alert) => {
  console.log('🚨 Critical Performance Issue:', alert);
});
```

### 2. Generate Performance Report

```typescript
// Generate comprehensive report
const reportPath = await suite.generateComprehensiveReport();
console.log(`Report saved to: ${reportPath}`);

// Get current health status
const health = suite.getHealthStatus();
console.log(`System Health: ${health.status} (${health.score}/100)`);
```

### 3. Database Query Optimization

```typescript
import { DatabaseQueryOptimizer } from './performance';

const optimizer = new DatabaseQueryOptimizer();

// Record query performance
optimizer.recordQuery({
  query: 'SELECT * FROM videos WHERE status = ?',
  duration: 250,
  rows: 150,
  cached: false
});

// Generate optimization recommendations
const reportPath = await optimizer.generateOptimizationReport();
```

### 4. Memory Leak Detection

```typescript
import { MemoryAnalyzer } from './performance';

const analyzer = new MemoryAnalyzer();
analyzer.start();

// Listen for memory leaks
analyzer.on('leak_detected', (leak) => {
  console.log(`Memory leak detected: ${leak.description}`);
  console.log(`Recommendations: ${leak.recommendation}`);
});
```

## 🛠️ CLI Usage

The performance suite includes a comprehensive CLI for easy monitoring:

### Start Monitoring
```bash
# Start with default settings
node performance/scripts/performanceMonitoring.js start

# Start with custom configuration
node performance/scripts/performanceMonitoring.js start \
  --memoryInterval 10000 \
  --cpuInterval 5000 \
  --output ./reports \
  --notify true
```

### Generate Reports
```bash
# Generate comprehensive report
node performance/scripts/performanceMonitoring.js report --open

# Create performance baseline
node performance/scripts/performanceMonitoring.js baseline \
  --name "v1.0.0-baseline" \
  --version "1.0.0"

# Run regression tests
node performance/scripts/performanceMonitoring.js regression
```

### System Health
```bash
# Quick health check
node performance/scripts/performanceMonitoring.js health

# Show optimization recommendations  
node performance/scripts/performanceMonitoring.js optimize

# Check monitoring status
node performance/scripts/performanceMonitoring.js status
```

## 📊 Performance Dashboard

The suite includes a React dashboard for real-time monitoring:

```tsx
import { PerformanceDashboard } from './performance/monitors/PerformanceDashboard';

// Add to your React application
<PerformanceDashboard />
```

Features:
- Real-time metrics visualization
- Interactive charts and graphs
- Alert management
- Performance trend analysis
- Optimization recommendations

## 🔧 Configuration

### Environment Variables

```bash
# Performance monitoring settings
PERFORMANCE_ENABLED=true
PERFORMANCE_OUTPUT_PATH=performance/reports
PERFORMANCE_ALERT_WEBHOOKS=https://hooks.slack.com/...

# Memory monitoring
MEMORY_ALERT_THRESHOLD=85
MEMORY_LEAK_DETECTION=true

# CPU monitoring  
CPU_ALERT_THRESHOLD=80
EVENT_LOOP_LAG_THRESHOLD=100

# Network monitoring
SLOW_REQUEST_THRESHOLD=2000
NETWORK_ERROR_THRESHOLD=0.05

# Database monitoring
SLOW_QUERY_THRESHOLD=1000
DB_OPTIMIZATION=true
```

### Custom Configuration

```typescript
const suite = createPerformanceSuite({
  enabledModules: {
    memory: true,
    cpu: true,
    io: true,
    network: true,
    cache: true,
    database: true,
    resources: true
  },
  intervals: {
    memory: 5000,      // 5 seconds
    cpu: 2000,         // 2 seconds
    io: 10000,         // 10 seconds
    network: 15000,    // 15 seconds
    cache: 10000,      // 10 seconds
    resources: 5000    // 5 seconds
  },
  alertThresholds: {
    memory: 85,        // 85% memory usage
    cpu: 80,          // 80% CPU usage
    responseTime: 2000, // 2 second response time
    errorRate: 0.05   // 5% error rate
  },
  outputPath: 'performance/reports'
});
```

## 📈 Metrics Collected

### Memory Metrics
- Heap usage (used, total, utilization)
- Memory leaks detection
- Garbage collection patterns
- External memory usage

### CPU Metrics  
- CPU utilization percentage
- Event loop delay
- Process CPU time (user/system)
- Load averages

### Network Metrics
- Request count and frequency
- Response times (avg, min, max)
- Error rates and status codes  
- Throughput and bandwidth usage

### I/O Metrics
- File operations (read/write/delete)
- Operation latency
- Disk usage patterns
- I/O error rates

### Cache Metrics
- Hit/miss rates
- Cache size and key count
- Access patterns
- Performance trends

### Database Metrics
- Query execution times
- Slow query identification
- Index usage analysis
- Connection pool status

## 🎯 Optimization Recommendations

The suite provides actionable optimization recommendations:

### Memory Optimizations
- Memory leak detection and fixes
- Garbage collection tuning
- Object pooling suggestions
- Memory usage patterns

### CPU Optimizations  
- Event loop optimization
- Worker thread recommendations
- Algorithm improvements
- Blocking operation detection

### Database Optimizations
- Index suggestions with SQL commands
- Query rewriting recommendations
- Connection pool optimization
- Caching strategies

### Network Optimizations
- Request batching suggestions
- Caching recommendations
- Connection pooling
- Payload optimization

## 🚨 Alerting & Notifications

### Alert Types
- **Critical**: Immediate action required (>95% resource usage)
- **High**: Urgent attention needed (>80% resource usage)  
- **Medium**: Monitor closely (>60% resource usage)
- **Low**: Informational (trends and patterns)

### Notification Channels
```typescript
suite.on('critical_alert', (alert) => {
  // Send to Slack
  sendSlackAlert(alert);
  
  // Send email notification
  sendEmailAlert(alert);
  
  // Log to monitoring service
  logToDatadog(alert);
});
```

## 📊 Report Types

### Comprehensive Report
- Overall system health score
- Performance trends and analysis
- Optimization recommendations
- Resource utilization summary

### Memory Report
- Heap usage patterns
- Memory leak detection results
- Garbage collection analysis
- Optimization suggestions

### CPU Report  
- CPU utilization trends
- Event loop performance
- Bottleneck identification
- Processing recommendations

### Database Report
- Slow query analysis
- Index recommendations with SQL
- Query optimization suggestions
- Performance trends

### Network Report
- Request/response analysis
- Error rate trends
- Throughput optimization
- API performance recommendations

## 🔄 Regression Testing

### Create Baseline
```bash
# Create performance baseline
node performance/scripts/performanceMonitoring.js baseline \
  --name "release-v2.0.0" \
  --version "2.0.0"
```

### Run Regression Tests
```bash
# Run all regression tests
node performance/scripts/performanceMonitoring.js regression

# Results show:
# ✅ Memory usage: No regression
# ❌ Response time: 15% slower (regression detected)
# ✅ CPU usage: 5% improvement  
# ⚠️ Error rate: 2% increase (warning threshold)
```

### Custom Regression Tests
```typescript
// Register custom test
regressionDetector.registerTest({
  id: 'video_processing_performance',
  name: 'Video Processing Performance',
  description: 'Tests video rendering and processing speed',
  baseline: 'latest',
  thresholds: {
    memory: { max: 20, acceptable: 10 },
    cpu: { max: 25, acceptable: 10 },
    responseTime: { max: 30, acceptable: 15 }
  },
  testFunction: async () => {
    // Run video processing test
    return await runVideoProcessingBenchmark();
  }
});
```

## 🚀 Integration Examples

### Express.js Integration
```typescript
import express from 'express';
import { createPerformanceSuite } from './performance';

const app = express();
const suite = createPerformanceSuite();

// Start monitoring
suite.start();

// Add performance middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Record network metrics
    suite.getNetworkMonitor().recordRequest({
      query: `${req.method} ${req.path}`,
      duration,
      rows: 1,
      cached: false
    });
  });
  
  next();
});

// Performance API endpoints
app.get('/api/performance/health', (req, res) => {
  res.json(suite.getHealthStatus());
});

app.get('/api/performance/metrics', async (req, res) => {
  const snapshot = await suite.getCurrentSnapshot();
  res.json(snapshot);
});
```

### Database Integration (Sequelize)
```typescript
import { DatabaseQueryOptimizer } from './performance';

const optimizer = new DatabaseQueryOptimizer();
const interceptor = optimizer.createQueryInterceptor();

// Intercept Sequelize queries
interceptor.interceptSequelize(sequelize);

// All database queries are now monitored automatically
const users = await User.findAll({ where: { active: true } });
```

### Cache Integration
```typescript
import { CacheAnalyzer } from './performance';

const cacheAnalyzer = new CacheAnalyzer();
const cache = cacheAnalyzer.createInstrumentedCache(redisClient);

// Cache operations are now monitored
const userData = await cache.get('user:123');
await cache.set('user:123', data, { ttl: 3600 });
```

## 📋 Best Practices

### 1. Monitoring Setup
- Start with basic monitoring on all modules
- Adjust intervals based on application load
- Set up alerting for critical thresholds
- Regular baseline creation for regression testing

### 2. Performance Optimization
- Address critical alerts immediately
- Implement high-impact optimizations first
- Monitor changes with regression testing
- Document performance improvements

### 3. Resource Management
- Monitor memory trends to prevent leaks
- Optimize CPU-intensive operations
- Implement caching strategies
- Regular database query optimization

### 4. Report Analysis
- Review reports weekly for trends
- Act on optimization recommendations
- Track performance improvements over time
- Share insights with development team

## 🛡️ Security Considerations

- Performance data may contain sensitive information
- Secure report storage and access
- Sanitize query logs before sharing
- Configure appropriate access controls

## 🤝 Contributing

To add new performance metrics or analyzers:

1. Create analyzer in `performance/analyzers/`
2. Implement the standard analyzer interface
3. Add configuration options
4. Include in main performance suite
5. Add CLI support
6. Update documentation

## 📚 API Reference

See individual module documentation:
- [Memory Analyzer](./analyzers/MemoryAnalyzer.ts)
- [CPU Analyzer](./analyzers/CPUAnalyzer.ts)
- [I/O Analyzer](./analyzers/IOAnalyzer.ts)
- [Network Monitor](./monitors/NetworkMonitor.ts)
- [Cache Analyzer](./analyzers/CacheAnalyzer.ts)
- [Database Optimizer](./scripts/DatabaseQueryOptimizer.ts)
- [Resource Monitor](./scripts/ResourceMonitor.ts)
- [Optimization Recommender](./scripts/OptimizationRecommender.ts)

## 🐛 Troubleshooting

### Common Issues

**High Memory Usage False Positives**
- Adjust memory thresholds in configuration
- Check for normal garbage collection cycles
- Verify baseline accuracy

**CPU Monitoring Not Working**
- Ensure sufficient permissions for system monitoring
- Check Node.js version compatibility
- Verify process access rights

**Database Monitoring Missing Queries**
- Confirm database driver integration
- Check query interceptor setup
- Verify connection pooling configuration

**Reports Not Generating**
- Check output directory permissions
- Verify disk space availability
- Review error logs for specific issues

### Debug Mode
```bash
# Enable debug logging
DEBUG=performance:* node performance/scripts/performanceMonitoring.js start

# Verbose output
node performance/scripts/performanceMonitoring.js start --verbose
```

---

For more detailed documentation and examples, see the individual module files and inline code documentation.