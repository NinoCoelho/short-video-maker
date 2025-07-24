#!/usr/bin/env node

/**
 * Performance Test Runner
 * 
 * This script runs all performance tests and generates a comprehensive report
 * with baselines and recommendations.
 * 
 * Usage:
 *   npm run test:performance
 *   npm run test:performance -- --watch
 *   npm run test:performance -- --reporter=json
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

interface PerformanceReport {
  timestamp: string;
  system: {
    platform: string;
    arch: string;
    cpus: number;
    totalMemoryGB: number;
    freeMemoryGB: number;
    nodeVersion: string;
  };
  tests: {
    suite: string;
    passed: number;
    failed: number;
    duration: number;
    metrics?: any;
  }[];
  summary: {
    totalTests: number;
    totalPassed: number;
    totalFailed: number;
    totalDuration: number;
  };
  recommendations: string[];
}

async function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemoryGB: os.totalmem() / 1024 / 1024 / 1024,
    freeMemoryGB: os.freemem() / 1024 / 1024 / 1024,
    nodeVersion: process.version,
  };
}

async function runPerformanceTests(): Promise<PerformanceReport> {
  const report: PerformanceReport = {
    timestamp: new Date().toISOString(),
    system: await getSystemInfo(),
    tests: [],
    summary: {
      totalTests: 0,
      totalPassed: 0,
      totalFailed: 0,
      totalDuration: 0,
    },
    recommendations: [],
  };

  console.log('🚀 Running Performance Tests...\n');
  console.log('System Info:');
  console.log(`  Platform: ${report.system.platform} ${report.system.arch}`);
  console.log(`  CPUs: ${report.system.cpus}`);
  console.log(`  Memory: ${report.system.totalMemoryGB.toFixed(2)}GB (${report.system.freeMemoryGB.toFixed(2)}GB free)`);
  console.log(`  Node: ${report.system.nodeVersion}\n`);

  // Performance test files
  const testFiles = [
    'ImportPipelineService.performance.test.ts',
    'VideoImportService.performance.test.ts',
    'QueueService.performance.test.ts',
  ];

  for (const testFile of testFiles) {
    console.log(`📊 Running ${testFile}...`);
    
    try {
      // Run test with memory exposure for GC
      const { stdout, stderr } = await execAsync(
        `node --expose-gc ./node_modules/.bin/vitest run src/services/__tests__/${testFile} --reporter=json`,
        {
          env: {
            ...process.env,
            NODE_ENV: 'test',
          },
        }
      );

      // Parse test results
      const results = JSON.parse(stdout);
      
      report.tests.push({
        suite: testFile,
        passed: results.numPassedTests || 0,
        failed: results.numFailedTests || 0,
        duration: results.testResults?.[0]?.duration || 0,
        metrics: results.testResults?.[0]?.metrics,
      });

      console.log(`  ✅ Passed: ${results.numPassedTests || 0}`);
      console.log(`  ❌ Failed: ${results.numFailedTests || 0}`);
      console.log(`  ⏱️  Duration: ${(results.testResults?.[0]?.duration || 0) / 1000}s\n`);

    } catch (error) {
      console.error(`  ❌ Error running ${testFile}:`, error);
      report.tests.push({
        suite: testFile,
        passed: 0,
        failed: 1,
        duration: 0,
      });
    }
  }

  // Calculate summary
  report.summary = report.tests.reduce(
    (acc, test) => ({
      totalTests: acc.totalTests + test.passed + test.failed,
      totalPassed: acc.totalPassed + test.passed,
      totalFailed: acc.totalFailed + test.failed,
      totalDuration: acc.totalDuration + test.duration,
    }),
    report.summary
  );

  // Generate recommendations
  report.recommendations = generateRecommendations(report);

  return report;
}

function generateRecommendations(report: PerformanceReport): string[] {
  const recommendations: string[] = [];

  // System recommendations
  if (report.system.freeMemoryGB < 2) {
    recommendations.push('⚠️  Low system memory detected. Consider closing other applications before running performance tests.');
  }

  if (report.system.cpus < 4) {
    recommendations.push('⚠️  Limited CPU cores detected. Performance tests may not reflect production performance.');
  }

  // Test recommendations
  const failureRate = report.summary.totalFailed / report.summary.totalTests;
  if (failureRate > 0.1) {
    recommendations.push('🔴 High failure rate detected. Review failed tests for performance regressions.');
  }

  if (report.summary.totalDuration > 60000) {
    recommendations.push('⏱️  Performance tests taking over 1 minute. Consider optimizing test efficiency.');
  }

  // Performance-specific recommendations
  recommendations.push('💡 Run tests with --expose-gc flag for accurate memory measurements.');
  recommendations.push('💡 Run tests in isolation to avoid interference between suites.');
  recommendations.push('💡 Consider running tests on dedicated hardware for consistent baselines.');

  return recommendations;
}

async function saveReport(report: PerformanceReport) {
  const reportDir = path.join(process.cwd(), 'performance-reports');
  await fs.ensureDir(reportDir);

  const filename = `performance-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(reportDir, filename);

  await fs.writeJson(filepath, report, { spaces: 2 });
  
  console.log(`\n📄 Report saved to: ${filepath}`);
}

async function printSummary(report: PerformanceReport) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 PERFORMANCE TEST SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`\nTotal Tests: ${report.summary.totalTests}`);
  console.log(`✅ Passed: ${report.summary.totalPassed}`);
  console.log(`❌ Failed: ${report.summary.totalFailed}`);
  console.log(`⏱️  Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
  
  if (report.summary.totalFailed === 0) {
    console.log('\n🎉 All performance tests passed!');
  } else {
    console.log(`\n⚠️  ${report.summary.totalFailed} performance tests failed.`);
  }

  if (report.recommendations.length > 0) {
    console.log('\n📝 Recommendations:');
    report.recommendations.forEach(rec => console.log(`  ${rec}`));
  }

  console.log('\n' + '='.repeat(60));
}

// Main execution
async function main() {
  try {
    const report = await runPerformanceTests();
    await saveReport(report);
    await printSummary(report);
    
    process.exit(report.summary.totalFailed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error running performance tests:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { runPerformanceTests, PerformanceReport };