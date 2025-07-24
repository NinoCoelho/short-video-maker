#!/usr/bin/env node

/**
 * Performance Monitoring CLI Script
 * Provides command-line interface for performance monitoring and optimization tools
 */

const { createPerformanceSuite } = require('../index.ts');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// CLI argument parsing
const args = process.argv.slice(2);
const command = args[0];
const options = parseOptions(args.slice(1));

// Available commands
const commands = {
  start: startMonitoring,
  stop: stopMonitoring,
  status: showStatus,
  report: generateReport,
  baseline: createBaseline,
  regression: runRegression,
  optimize: showOptimizations,
  health: showHealth,
  help: showHelp
};

// Main execution
main();

function main() {
  if (!command || !commands[command]) {
    console.error('Invalid command. Use "help" for available commands.');
    process.exit(1);
  }

  try {
    commands[command](options);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

function parseOptions(args) {
  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    
    if (key) {
      if (value && !value.startsWith('--')) {
        // Parse different value types
        if (value === 'true' || value === 'false') {
          options[key] = value === 'true';
        } else if (!isNaN(Number(value))) {
          options[key] = Number(value);
        } else {
          options[key] = value;
        }
      } else {
        options[key] = true;
      }
    }
  }
  
  return options;
}

async function startMonitoring(options) {
  console.log('🚀 Starting Performance Monitoring Suite...');
  
  const suiteOptions = {
    enabledModules: {
      memory: options.memory !== false,
      cpu: options.cpu !== false,
      io: options.io !== false,
      network: options.network !== false,
      cache: options.cache !== false,
      database: options.database !== false,
      resources: options.resources !== false
    },
    intervals: {
      memory: options.memoryInterval || 5000,
      cpu: options.cpuInterval || 2000,
      io: options.ioInterval || 10000,
      network: options.networkInterval || 15000,
      cache: options.cacheInterval || 10000,
      resources: options.resourceInterval || 5000
    },
    outputPath: options.output || 'performance/reports'
  };

  const suite = createPerformanceSuite(suiteOptions);
  
  // Setup event handlers
  suite.on('critical_alert', (alert) => {
    console.log('🚨 CRITICAL ALERT:', alert.type);
    console.log('   Details:', alert.data);
    
    // Optionally send notifications
    if (options.notify) {
      sendNotification('Critical Performance Alert', alert);
    }
  });

  suite.on('optimization_needed', (optimization) => {
    console.log('💡 OPTIMIZATION OPPORTUNITY:', optimization.type);
    console.log('   Suggestions:', optimization.data.length, 'recommendations');
  });

  suite.on('report_generated', (report) => {
    console.log('📊 Report generated:', report.path);
  });

  // Start monitoring
  suite.start();
  
  // Save PID for stopping later
  const pidFile = path.join(process.cwd(), '.performance-monitor.pid');
  fs.writeFileSync(pidFile, process.pid.toString());
  
  console.log('✅ Performance monitoring started successfully');
  console.log('📁 Reports will be saved to:', suiteOptions.outputPath);
  console.log('🛑 Use "npm run performance:stop" to stop monitoring');
  
  // Generate initial report
  if (options.initialReport !== false) {
    setTimeout(async () => {
      console.log('📋 Generating initial performance report...');
      await suite.generateComprehensiveReport();
    }, 10000); // Wait 10 seconds for initial data
  }

  // Keep process running
  process.on('SIGTERM', () => {
    console.log('🛑 Stopping performance monitoring...');
    suite.stop();
    cleanup();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('🛑 Stopping performance monitoring...');
    suite.stop();
    cleanup();
    process.exit(0);
  });

  // Prevent process from exiting
  setInterval(() => {}, 1000);
}

function stopMonitoring(options) {
  const pidFile = path.join(process.cwd(), '.performance-monitor.pid');
  
  if (!fs.existsSync(pidFile)) {
    console.log('❌ No running performance monitor found');
    return;
  }
  
  try {
    const pid = fs.readFileSync(pidFile, 'utf8').trim();
    process.kill(parseInt(pid), 'SIGTERM');
    
    // Wait a moment then cleanup
    setTimeout(() => {
      cleanup();
      console.log('✅ Performance monitoring stopped');
    }, 2000);
    
  } catch (error) {
    console.log('❌ Failed to stop monitoring:', error.message);
    cleanup(); // Cleanup anyway
  }
}

function cleanup() {
  const pidFile = path.join(process.cwd(), '.performance-monitor.pid');
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

async function showStatus(options) {
  // Try to get status from running instance
  console.log('📊 Performance Monitor Status');
  console.log('================================');
  
  const pidFile = path.join(process.cwd(), '.performance-monitor.pid');
  
  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, 'utf8').trim();
    
    try {
      process.kill(parseInt(pid), 0); // Check if process exists
      console.log('Status: ✅ RUNNING');
      console.log('PID:', pid);
      
      // Show recent reports
      const reportsDir = path.join(process.cwd(), 'performance/reports');
      if (fs.existsSync(reportsDir)) {
        const files = fs.readdirSync(reportsDir)
          .filter(f => f.endsWith('.json'))
          .sort()
          .slice(-3);
        
        console.log('\nRecent Reports:');
        files.forEach(file => {
          const stats = fs.statSync(path.join(reportsDir, file));
          console.log(`  📄 ${file} (${stats.mtime.toISOString()})`);
        });
      }
      
    } catch (error) {
      console.log('Status: ❌ NOT RUNNING (stale PID file)');
      cleanup();
    }
  } else {
    console.log('Status: ❌ NOT RUNNING');
  }
  
  // Show system capabilities
  console.log('\nSystem Information:');
  console.log('OS:', process.platform, process.arch);
  console.log('Node.js:', process.version);
  console.log('Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
}

async function generateReport(options) {
  console.log('📊 Generating Performance Report...');
  
  const suite = createPerformanceSuite({
    outputPath: options.output || 'performance/reports'
  });
  
  try {
    const reportPath = await suite.generateComprehensiveReport();
    console.log('✅ Report generated:', reportPath);
    
    // If --open flag is provided, try to open the report
    if (options.open) {
      try {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        console.log('\n📈 Performance Summary:');
        console.log(`Overall Health: ${report.summary.overallHealth} (${report.summary.overallScore}/100)`);
        console.log(`Critical Issues: ${report.summary.criticalIssues}`);
        console.log(`Optimization Opportunities: ${report.summary.optimizationOpportunities}`);
      } catch (error) {
        console.log('Could not display report summary:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to generate report:', error.message);
  }
}

async function createBaseline(options) {
  console.log('📊 Creating Performance Baseline...');
  
  const name = options.name || `baseline_${new Date().toISOString().split('T')[0]}`;
  const version = options.version || '1.0.0';
  
  const suite = createPerformanceSuite();
  
  try {
    const baselineId = await suite.createPerformanceBaseline(name, version);
    console.log('✅ Baseline created:', baselineId);
    console.log('📝 Name:', name);
    console.log('🏷️ Version:', version);
  } catch (error) {
    console.error('❌ Failed to create baseline:', error.message);
  }
}

async function runRegression(options) {
  console.log('🧪 Running Regression Tests...');
  
  const suite = createPerformanceSuite();
  
  try {
    const results = await suite.runRegressionTests();
    
    console.log('✅ Regression tests completed');
    console.log('📊 Results:');
    
    results.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌';
      console.log(`  ${status} Test ${index + 1}: ${result.testId}`);
      console.log(`     Score: ${result.summary.overallScore}/100`);
      console.log(`     Regressions: ${result.summary.totalRegressions}`);
      console.log(`     Critical: ${result.summary.criticalRegressions}`);
      
      if (!result.passed) {
        console.log('     Issues:');
        result.regressions.slice(0, 3).forEach(reg => {
          console.log(`       - ${reg.metric}: ${reg.change.toFixed(1)}% ${reg.severity}`);
        });
      }
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Failed to run regression tests:', error.message);
  }
}

async function showOptimizations(options) {
  console.log('💡 Performance Optimization Recommendations');
  console.log('===========================================');
  
  const suite = createPerformanceSuite();
  
  try {
    // Start analyzers briefly to get current data
    suite.start();
    
    // Wait a moment for data collection
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const recommender = suite.getOptimizationRecommender();
    const suggestions = recommender.getTopSuggestions(10);
    
    suite.stop();
    
    if (suggestions.length === 0) {
      console.log('✅ No optimization recommendations at this time');
      return;
    }
    
    suggestions.forEach((suggestion, index) => {
      console.log(`\n${index + 1}. ${suggestion.rule.title}`);
      console.log(`   Priority: ${'⭐'.repeat(Math.floor(suggestion.priority / 2))}`);
      console.log(`   Category: ${suggestion.rule.category}`);
      console.log(`   Impact: ${suggestion.rule.impact}`);
      console.log(`   Recommendation: ${suggestion.rule.recommendation}`);
      
      if (suggestion.projectedImprovement.length > 0) {
        console.log('   Expected Improvements:');
        suggestion.projectedImprovement.forEach(imp => {
          console.log(`     - ${imp.metric}: ${imp.improvementPercentage}% improvement`);
        });
      }
      
      console.log(`   Implementation: ${suggestion.rule.implementation.difficulty} (${suggestion.rule.implementation.estimatedTime})`);
    });
    
  } catch (error) {
    console.error('❌ Failed to get optimization recommendations:', error.message);
  }
}

async function showHealth(options) {
  console.log('🏥 System Health Check');
  console.log('=====================');
  
  const suite = createPerformanceSuite();
  
  try {
    // Start monitoring briefly
    suite.start();
    
    // Wait for data collection
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const health = suite.getHealthStatus();
    
    suite.stop();
    
    // Overall status
    const statusIcon = health.status === 'healthy' ? '✅' : 
                      health.status === 'warning' ? '⚠️' : '🚨';
    
    console.log(`Overall Status: ${statusIcon} ${health.status.toUpperCase()}`);
    console.log(`Health Score: ${health.score}/100`);
    
    console.log('\nComponent Status:');
    Object.entries(health.details).forEach(([component, status]) => {
      const icon = status === 'good' ? '✅' : status === 'warning' ? '⚠️' : '🚨';
      console.log(`  ${icon} ${component}: ${status}`);
    });
    
    // Get current snapshot
    const snapshot = await suite.getCurrentSnapshot();
    
    if (snapshot.overall.issues.length > 0) {
      console.log('\n🚨 Active Issues:');
      snapshot.overall.issues.forEach(issue => {
        console.log(`  - ${issue}`);
      });
    }
    
    console.log('\n📊 Key Metrics:');
    if (snapshot.memory) {
      console.log(`  Memory: ${(snapshot.memory.averageUtilization * 100).toFixed(1)}%`);
    }
    if (snapshot.cpu) {
      console.log(`  CPU: ${snapshot.cpu.averageCPU?.toFixed(1) || 'N/A'}%`);
    }
    if (snapshot.network) {
      console.log(`  Response Time: ${snapshot.network.averageResponseTime?.toFixed(0) || 'N/A'}ms`);
    }
    
  } catch (error) {
    console.error('❌ Failed to get health status:', error.message);
  }
}

function showHelp() {
  console.log(`
Performance Monitoring CLI

Usage: node performance/scripts/performanceMonitoring.js <command> [options]

Commands:
  start       Start performance monitoring
  stop        Stop performance monitoring  
  status      Show monitoring status
  report      Generate performance report
  baseline    Create performance baseline
  regression  Run regression tests
  optimize    Show optimization recommendations
  health      Show system health status
  help        Show this help

Start Options:
  --memory <boolean>         Enable memory monitoring (default: true)
  --cpu <boolean>           Enable CPU monitoring (default: true) 
  --network <boolean>       Enable network monitoring (default: true)
  --cache <boolean>         Enable cache monitoring (default: true)
  --output <path>          Output directory for reports (default: performance/reports)
  --notify <boolean>       Enable notifications for critical alerts
  --initialReport <boolean> Generate initial report (default: true)

Report Options:
  --output <path>          Output directory (default: performance/reports)
  --open                   Show report summary

Baseline Options:
  --name <string>          Baseline name (default: baseline_YYYY-MM-DD)
  --version <string>       Version identifier (default: 1.0.0)

Examples:
  # Start monitoring with custom intervals
  node performance/scripts/performanceMonitoring.js start --memoryInterval 10000 --output ./reports

  # Generate report and show summary  
  node performance/scripts/performanceMonitoring.js report --open

  # Create baseline for version 2.1.0
  node performance/scripts/performanceMonitoring.js baseline --name "v2.1.0-baseline" --version "2.1.0"

  # Quick health check
  node performance/scripts/performanceMonitoring.js health
`);
}

function sendNotification(title, alert) {
  // Simple notification - could be enhanced with email, Slack, etc.
  console.log(`\n🔔 NOTIFICATION: ${title}`);
  console.log(`   Type: ${alert.type}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  
  // Could integrate with notification services here
  // - Email via nodemailer
  // - Slack webhook
  // - System notifications
  // - PagerDuty, etc.
}