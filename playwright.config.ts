import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright configuration for end-to-end tests of the video import flow
 * 
 * This configuration sets up comprehensive E2E testing including:
 * - UI interaction tests
 * - WebSocket communication tests  
 * - Video import workflow tests
 * - Error handling and recovery tests
 * - Multi-browser support
 */
export default defineConfig({
  // Test directory
  testDir: './tests/e2e',
  
  // Global setup and teardown
  globalSetup: require.resolve('./tests/e2e/setup/global-setup.ts'),
  globalTeardown: require.resolve('./tests/e2e/setup/global-teardown.ts'),
  
  // Run tests in files in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'test-results/e2e-html-report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
    ['line'],
    ['junit', { outputFile: 'test-results/e2e-junit.xml' }]
  ],
  
  // Global test settings
  use: {
    // Base URL for all tests
    baseURL: 'http://localhost:3232',
    
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    
    // Record video on failure
    video: 'retain-on-failure',
    
    // Take screenshot on failure
    screenshot: 'only-on-failure',
    
    // Global timeout for each test
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },

  // Test output directories
  outputDir: 'test-results/e2e-artifacts',
  
  // Expect configuration
  expect: {
    // Global timeout for expect() calls
    timeout: 10000,
  },
  
  // Configure projects for major browsers
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Enable WebSocket debugging
        launchOptions: {
          args: ['--enable-logging', '--log-level=0']
        }
      },
      dependencies: ['setup'],
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },

    // Mobile testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },

    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
      dependencies: ['setup'],
    },
  ],

  // Local dev server configuration
  webServer: [
    {
      // Backend server
      command: 'npm run dev:server',
      port: 3233,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        NODE_ENV: 'test',
        PORT: '3233',
        REMOTION_HOST: '0.0.0.0',
        // Test-specific environment variables
        LOG_LEVEL: 'debug',
        WEBSOCKET_ENABLED: 'true',
        // Mock external services in test mode
        MOCK_EXTERNAL_SERVICES: 'true',
        MOCK_VIDEO_DOWNLOADS: 'true',
      }
    },
    {
      // Frontend dev server
      command: 'npm run dev:ui',
      port: 3232,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    }
  ],
  
  // Timeout configuration
  timeout: 120000, // 2 minutes per test (video processing can be slow)
  
  // Global test patterns
  testMatch: [
    '**/tests/e2e/**/*.spec.ts',
    '**/tests/e2e/**/*.test.ts'
  ],
  
  // Files to ignore
  testIgnore: [
    '**/tests/e2e/setup/**',
    '**/tests/e2e/utils/**',
    '**/tests/e2e/fixtures/**'
  ]
});