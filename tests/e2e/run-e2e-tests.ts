#!/usr/bin/env ts-node

/**
 * E2E Test Runner for Video Import Flow
 * 
 * This script provides a convenient way to run the comprehensive E2E test suite
 * with different configurations and options.
 */

import { spawnSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

interface TestOptions {
  browser?: string;
  headless?: boolean;
  debug?: boolean;
  grep?: string;
  workers?: number;
  timeout?: number;
  retries?: number;
  outputDir?: string;
}

class E2ETestRunner {
  private readonly rootDir: string;
  private readonly playwrightConfig: string;

  constructor() {
    this.rootDir = resolve(__dirname, '../..');
    this.playwrightConfig = resolve(this.rootDir, 'playwright.config.ts');
  }

  /**
   * Run the complete E2E test suite
   */
  async runAllTests(options: TestOptions = {}) {
    console.log('🚀 Starting E2E Test Suite for Video Import Flow\n');
    
    this.validateEnvironment();
    
    const args = this.buildPlaywrightArgs(options);
    
    console.log(`Executing: npx ${args.join(' ')}\n`);
    
    const result = spawnSync('npx', args, {
      cwd: this.rootDir,
      stdio: 'inherit',
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer for large outputs
    });
    
    if (result.error) {
      console.error('\n❌ Failed to execute tests!');
      console.error('Error:', result.error.message);
      process.exit(1);
    }
    
    if (result.status === 0) {
      console.log('\n✅ E2E tests completed successfully!');
      this.printTestSummary();
    } else {
      console.error('\n❌ E2E tests failed!');
      this.printTestSummary();
      this.printTroubleshootingGuide();
      process.exit(1);
    }
  }

  /**
   * Run specific test suites
   */
  async runTestSuite(suiteName: string, options: TestOptions = {}) {
    const suiteFiles = {
      'basic': 'video-import-flow.spec.ts',
      'ui': 'ui-interactions.spec.ts', 
      'websocket': 'websocket-updates.spec.ts',
      'batch': 'batch-import.spec.ts',
      'edge-cases': 'edge-cases.spec.ts',
      'error-recovery': 'error-recovery.spec.ts'
    };

    const testFile = suiteFiles[suiteName as keyof typeof suiteFiles];
    
    if (!testFile) {
      console.error(`❌ Unknown test suite: ${suiteName}`);
      console.log('Available suites:', Object.keys(suiteFiles).join(', '));
      process.exit(1);
    }

    console.log(`🎯 Running ${suiteName} test suite: ${testFile}\n`);
    
    const args = this.buildPlaywrightArgs({
      ...options,
      grep: `tests/e2e/${testFile}`
    });

    const result = spawnSync('npx', args, {
      cwd: this.rootDir,
      stdio: 'inherit'
    });
    
    if (result.error) {
      console.error(`\n❌ Failed to execute ${suiteName} test suite!`);
      console.error('Error:', result.error.message);
      process.exit(1);
    }
    
    if (result.status === 0) {
      console.log(`\n✅ ${suiteName} test suite completed!`);
    } else {
      console.error(`\n❌ ${suiteName} test suite failed!`);
      process.exit(1);
    }
  }

  /**
   * Run tests in debug mode
   */
  async debugTest(testPattern?: string) {
    console.log('🐛 Running E2E tests in debug mode\n');
    
    const args = this.buildPlaywrightArgs({
      headless: false,
      debug: true,
      workers: 1,
      grep: testPattern
    });

    console.log(`Executing: npx ${args.join(' ')}\n`);
    console.log('💡 Debug mode tips:');
    console.log('   - Tests will run in headed mode (visible browser)');
    console.log('   - Use browser dev tools to inspect elements');
    console.log('   - Tests will pause on failures');
    console.log('   - Screenshots and videos will be captured\n');

    const result = spawnSync('npx', args, {
      cwd: this.rootDir,
      stdio: 'inherit'
    });
    
    if (result.error) {
      console.error('\n❌ Failed to execute debug mode!');
      console.error('Error:', result.error.message);
      process.exit(1);
    }
    
    if (result.status !== 0) {
      console.error('\n❌ Debug tests failed!');
      process.exit(1);
    }
  }

  private validateEnvironment() {
    // Check if playwright config exists
    if (!existsSync(this.playwrightConfig)) {
      throw new Error('Playwright config not found. Run setup first.');
    }

    // Check if node_modules exists
    if (!existsSync(resolve(this.rootDir, 'node_modules'))) {
      throw new Error('Node modules not found. Run npm install first.');
    }

    console.log('✅ Environment validation passed');
  }

  private buildPlaywrightArgs(options: TestOptions): string[] {
    const args = ['playwright', 'test'];
    
    if (options.browser) {
      args.push(`--project=${options.browser}`);
    }
    
    if (options.headless === false) {
      args.push('--headed');
    }
    
    if (options.debug) {
      args.push('--debug');
    }
    
    if (options.grep) {
      args.push(options.grep);
    }
    
    if (options.workers) {
      args.push(`--workers=${options.workers}`);
    }
    
    if (options.timeout) {
      args.push(`--timeout=${options.timeout}`);
    }
    
    if (options.retries !== undefined) {
      args.push(`--retries=${options.retries}`);
    }
    
    if (options.outputDir) {
      args.push(`--output-dir=${options.outputDir}`);
    }

    return args;
  }

  private printTestSummary() {
    console.log('\n📊 Test Results Summary:');
    
    // Try to read test results
    const resultsFile = resolve(this.rootDir, 'test-results/e2e-results.json');
    const htmlReportDir = resolve(this.rootDir, 'test-results/e2e-html-report');
    
    if (existsSync(resultsFile)) {
      console.log(`   📄 JSON Results: ${resultsFile}`);
    }
    
    if (existsSync(htmlReportDir)) {
      console.log(`   🌐 HTML Report: ${htmlReportDir}/index.html`);
    }
    
    const artifactsDir = resolve(this.rootDir, 'test-results/e2e-artifacts');
    if (existsSync(artifactsDir)) {
      console.log(`   📸 Screenshots/Videos: ${artifactsDir}`);
    }
  }

  private printTroubleshootingGuide() {
    console.log('\n🔧 Troubleshooting Guide:');
    console.log('   1. Check if backend server is running (npm run dev:server)');
    console.log('   2. Check if frontend server is running (npm run dev:ui)');
    console.log('   3. Verify test environment variables are set');
    console.log('   4. Check browser installation: npx playwright install');
    console.log('   5. Review test artifacts in test-results/ directory');
    console.log('   6. Run tests with --debug flag for detailed inspection');
  }
}

// CLI Interface
async function main() {
  const runner = new E2ETestRunner();
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('📋 Available commands:');
    console.log('   all          - Run all E2E tests');
    console.log('   basic        - Run basic import flow tests');
    console.log('   ui           - Run UI interaction tests');
    console.log('   websocket    - Run WebSocket tests'); 
    console.log('   batch        - Run batch import tests');
    console.log('   edge-cases   - Run edge case tests');
    console.log('   error-recovery - Run error recovery tests');
    console.log('   debug [pattern] - Run tests in debug mode');
    console.log('');
    console.log('📋 Options:');
    console.log('   --browser=chrome|firefox|safari');
    console.log('   --headed     - Run in headed mode');
    console.log('   --workers=N  - Number of parallel workers');
    console.log('   --timeout=MS - Timeout per test in milliseconds');
    console.log('   --retries=N  - Number of retries on failure');
    return;
  }

  const command = args[0];
  const options: TestOptions = {};

  // Parse options
  args.slice(1).forEach(arg => {
    if (arg.startsWith('--browser=')) {
      options.browser = arg.split('=')[1];
    } else if (arg === '--headed') {
      options.headless = false;
    } else if (arg.startsWith('--workers=')) {
      options.workers = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--timeout=')) {
      options.timeout = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--retries=')) {
      options.retries = parseInt(arg.split('=')[1]);
    }
  });

  try {
    switch (command) {
      case 'all':
        await runner.runAllTests(options);
        break;
      case 'debug':
        await runner.debugTest(args[1]);
        break;
      case 'basic':
      case 'ui':
      case 'websocket':
      case 'batch':
      case 'edge-cases':
      case 'error-recovery':
        await runner.runTestSuite(command, options);
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { E2ETestRunner };