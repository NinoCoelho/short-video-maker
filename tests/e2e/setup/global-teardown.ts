import { FullConfig } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

/**
 * Global teardown for E2E tests
 * 
 * This teardown:
 * - Cleans up test data
 * - Generates test reports
 * - Preserves artifacts for failed tests
 * - Logs test execution summary
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Cleaning up E2E test environment...');

  try {
    // Clean up temporary test data
    await cleanupTestData();
    
    // Generate test summary
    await generateTestSummary();
    
    // Archive test artifacts
    await archiveTestArtifacts();
    
    console.log('✅ E2E test cleanup complete');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

async function cleanupTestData() {
  console.log('🗑️  Cleaning up test data...');
  
  const testDirectories = [
    'data/test-temp',
    'data/test-imports'
  ];

  for (const dir of testDirectories) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      console.log(`   Removed: ${dir}`);
    } catch (error) {
      console.log(`   Could not remove ${dir}: ${error}`);
    }
  }
}

async function generateTestSummary() {
  console.log('📊 Generating test summary...');
  
  try {
    // Read test results if they exist
    const resultsPath = 'test-results/e2e-results.json';
    let testResults = null;
    
    try {
      const resultsFile = await fs.readFile(resultsPath, 'utf-8');
      testResults = JSON.parse(resultsFile);
    } catch (error) {
      console.log('   No test results file found');
      return;
    }

    if (!testResults) return;

    // Generate summary
    const summary = {
      timestamp: new Date().toISOString(),
      totalTests: testResults.stats?.expected || 0,
      passed: testResults.stats?.passed || 0,
      failed: testResults.stats?.failed || 0,
      skipped: testResults.stats?.skipped || 0,
      duration: testResults.stats?.duration || 0,
      browser_coverage: extractBrowserCoverage(testResults),
      failed_tests: extractFailedTests(testResults)
    };

    // Write summary
    await fs.writeFile(
      'test-results/e2e-summary.json',
      JSON.stringify(summary, null, 2)
    );

    // Console summary
    console.log('\n📋 Test Execution Summary:');
    console.log(`   Total Tests: ${summary.totalTests}`);
    console.log(`   Passed: ${summary.passed}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log(`   Skipped: ${summary.skipped}`);
    console.log(`   Duration: ${Math.round(summary.duration / 1000)}s`);

    if (summary.failed > 0) {
      console.log('\n❌ Failed Tests:');
      summary.failed_tests.forEach((test: any) => {
        console.log(`   - ${test.title} (${test.project})`);
      });
    }

  } catch (error) {
    console.error('Error generating test summary:', error);
  }
}

function extractBrowserCoverage(testResults: any) {
  const projects = testResults.suites?.[0]?.suites || [];
  const coverage: Record<string, { passed: number; failed: number }> = {};
  
  projects.forEach((project: any) => {
    const projectName = project.title;
    if (!coverage[projectName]) {
      coverage[projectName] = { passed: 0, failed: 0 };
    }
    
    // Count test outcomes for each project
    const tests = getAllTests(project);
    tests.forEach((test: any) => {
      if (test.outcome === 'passed') {
        coverage[projectName].passed++;
      } else if (test.outcome === 'failed') {
        coverage[projectName].failed++;
      }
    });
  });
  
  return coverage;
}

function extractFailedTests(testResults: any) {
  const failedTests: any[] = [];
  const projects = testResults.suites?.[0]?.suites || [];
  
  projects.forEach((project: any) => {
    const tests = getAllTests(project);
    tests.forEach((test: any) => {
      if (test.outcome === 'failed') {
        failedTests.push({
          title: test.title,
          project: project.title,
          error: test.results?.[0]?.error?.message || 'Unknown error'
        });
      }
    });
  });
  
  return failedTests;
}

function getAllTests(suite: any): any[] {
  const tests: any[] = [];
  
  if (suite.tests) {
    tests.push(...suite.tests);
  }
  
  if (suite.suites) {
    suite.suites.forEach((subSuite: any) => {
      tests.push(...getAllTests(subSuite));
    });
  }
  
  return tests;
}

async function archiveTestArtifacts() {
  console.log('📦 Archiving test artifacts...');
  
  try {
    // Check if there are any test artifacts to preserve
    const artifactsDir = 'test-results/e2e-artifacts';
    const htmlReportDir = 'test-results/e2e-html-report';
    
    let hasArtifacts = false;
    
    try {
      const artifacts = await fs.readdir(artifactsDir);
      if (artifacts.length > 0) {
        hasArtifacts = true;
        console.log(`   Preserved ${artifacts.length} test artifacts`);
      }
    } catch (error) {
      // No artifacts directory
    }
    
    try {
      const reportFiles = await fs.readdir(htmlReportDir);
      if (reportFiles.length > 0) {
        hasArtifacts = true;
        console.log(`   HTML report available at: ${htmlReportDir}/index.html`);
      }
    } catch (error) {
      // No HTML report directory
    }
    
    if (!hasArtifacts) {
      console.log('   No artifacts to preserve');
    }
    
  } catch (error) {
    console.error('Error archiving artifacts:', error);
  }
}

export default globalTeardown;