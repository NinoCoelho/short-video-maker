import { test, expect } from '@playwright/test';
import { VideoImportTestHelper, WebSocketTestHelper, MockDataHelper } from './utils/test-helpers';
import { MockServerHelper } from './utils/mock-server';

/**
 * E2E tests for error handling and recovery in video import
 * 
 * These tests verify:
 * - Graceful error handling throughout the import flow
 * - User recovery options after errors
 * - Error message clarity and actionability
 * - System stability after errors
 * - Error boundaries and fallback UI
 * - Retry mechanisms and user guidance
 */

test.describe('Error Recovery and Handling', () => {
  let videoHelper: VideoImportTestHelper;
  let wsHelper: WebSocketTestHelper;
  let mockServer: MockServerHelper;

  test.beforeEach(async ({ page }) => {
    videoHelper = new VideoImportTestHelper(page);
    wsHelper = new WebSocketTestHelper(page);
    mockServer = new MockServerHelper(page);
    
    // Setup basic external service mocking
    await mockServer.mockExternalServices();
  });

  test.afterEach(async ({ page }) => {
    await mockServer.clearAllMocks();
  });

  test('should handle URL validation errors gracefully', async ({ page }) => {
    const invalidUrls = [
      {
        url: 'https://www.youtube.com/watch?v=nonexistent123',
        expectedError: 'Video not found or is private',
        recoverable: true
      },
      {
        url: 'https://www.youtube.com/watch?v=blocked456',
        expectedError: 'Video is blocked in your region',
        recoverable: false
      },
      {
        url: 'https://unsupported-site.com/video/123',
        expectedError: 'Platform not supported',
        recoverable: false
      }
    ];

    // Mock validation errors
    await page.route('**/api/import/validate-url', async (route) => {
      const postData = route.request().postDataJSON();
      const url = postData?.url || '';
      
      const testCase = invalidUrls.find(test => url.includes(test.url.split('/').pop() || ''));
      
      if (testCase) {
        await route.fulfill({
          status: 400,
          body: JSON.stringify({
            isValid: false,
            error: testCase.expectedError,
            recoverable: testCase.recoverable,
            suggestions: testCase.recoverable ? [
              'Try a different video',
              'Check if the video is public',
              'Verify the URL is correct'
            ] : [
              'This platform is not supported',
              'Try uploading from a supported platform'
            ]
          })
        });
      } else {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({
            error: 'Validation service unavailable'
          })
        });
      }
    });

    await videoHelper.navigateToImporter();

    for (const testCase of invalidUrls) {
      console.log(`Testing validation error: ${testCase.expectedError}`);
      
      const urlInput = page.getByLabel(/video url/i);
      await urlInput.clear();
      await urlInput.fill(testCase.url);
      
      // Wait for error state
      await expect(page.locator('svg[color="error"]')).toBeVisible({ timeout: 8000 });
      
      // Should show clear error message
      await expect(page.getByText(new RegExp(testCase.expectedError.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))).toBeVisible();
      
      // Continue button should be disabled
      const continueButton = page.getByRole('button', { name: /continue/i });
      await expect(continueButton).toBeDisabled();
      
      // If recoverable, should show helpful suggestions
      if (testCase.recoverable) {
        await expect(page.getByText(/try.*different|check.*public|verify.*url/i)).toBeVisible();
      }
      
      console.log(`✓ Error handled correctly: ${testCase.expectedError}`);
      
      // Test error recovery - user can try a different URL
      await urlInput.clear();
      await urlInput.fill('https://www.youtube.com/watch?v=valid123');
      
      // Mock successful validation for recovery test
      await page.route('**/api/import/validate-url', async (route) => {
        const postData = route.request().postDataJSON();
        if (postData?.url?.includes('valid123')) {
          await route.fulfill({
            status: 200,
            body: JSON.stringify({
              isValid: true,
              platform: 'YouTube',
              metadata: { title: 'Recovery Test Video', duration: 120 }
            })
          });
        }
      });
      
      // Should recover successfully
      await expect(page.locator('svg[color="success"]')).toBeVisible({ timeout: 5000 });
      await expect(continueButton).toBeEnabled();
      
      console.log(`✓ Successfully recovered from: ${testCase.expectedError}`);
      
      // Take screenshot of error and recovery
      await page.screenshot({ 
        path: `test-results/e2e-artifacts/error-recovery-${testCase.expectedError.replace(/[^a-zA-Z0-9]/g, '-')}.png` 
      });
      
      // Reset for next test
      await page.route('**/api/import/validate-url', async (route) => {
        await route.continue();
      });
    }
  });

  test('should handle import start failures with retry options', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    // Mock validation success but import failure
    await mockServer.setupVideoImportMocks('validation-error');
    await page.route('**/api/import/validate-url', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          isValid: true,
          platform: 'YouTube',
          metadata: { title: testVideo.title, duration: testVideo.duration }
        })
      });
    });

    await page.route('**/api/import/video', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({
          error: 'Server temporarily unavailable. Please try again.',
          code: 'SERVER_ERROR',
          retryable: true
        })
      });
    });

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.waitForSettingsPage();
    await videoHelper.configureImportSettings();

    // Attempt to start import
    const startButton = page.getByRole('button', { name: /start import/i });
    await startButton.click();

    // Should show error message
    await expect(page.getByText(/server temporarily unavailable/i)).toBeVisible({ timeout: 10000 });
    
    // Should offer retry option
    const retryButton = page.getByRole('button', { name: /try again|retry/i });
    await expect(retryButton).toBeVisible();

    console.log('✓ Import failure handled with retry option');

    // Test retry mechanism
    let retryCount = 0;
    await page.route('**/api/import/video', async (route) => {
      retryCount++;
      
      if (retryCount <= 2) {
        // Fail first 2 attempts
        await route.fulfill({
          status: 500,
          body: JSON.stringify({
            error: `Server error (attempt ${retryCount})`,
            retryable: true
          })
        });
      } else {
        // Success on 3rd attempt
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            jobId: 'retry-test-job',
            message: 'Import started successfully after retry'
          })
        });
      }
    });

    // Setup WebSocket for successful retry
    await mockServer.setupWebSocketMocks('retry-test-job', 'success');

    // Click retry
    await retryButton.click();
    
    // Should show loading state
    const loadingSpinner = page.locator('.MuiCircularProgress-root, [data-testid="loading"]');
    await expect(loadingSpinner).toBeVisible();

    // Should eventually succeed and show progress page
    await expect(page.getByText(/import progress/i)).toBeVisible({ timeout: 15000 });
    
    console.log(`✓ Successfully retried import after ${retryCount} attempts`);

    // Take screenshot of successful retry
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/import-retry-success.png',
      fullPage: true 
    });
  });

  test('should handle WebSocket connection errors with fallback', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    // Mock successful API calls but failing WebSocket
    await mockServer.setupVideoImportMocks('success');
    
    // Override WebSocket to always fail
    await page.addInitScript(() => {
      const OriginalWebSocket = window.WebSocket;
      
      (window as any).WebSocket = function(url: string) {
        const mockWS = {
          readyState: 3, // CLOSED
          url,
          onopen: null as any,
          onmessage: null as any,
          onclose: null as any,
          onerror: null as any,
          
          send: function() {
            throw new Error('WebSocket connection failed');
          },
          
          close: function() {},
          
          addEventListener: function(type: string, listener: any) {
            this[`on${type}`] = listener;
          },
          
          removeEventListener: function() {}
        };

        // Immediately fail connection
        setTimeout(() => {
          if (mockWS.onerror) {
            mockWS.onerror({ 
              type: 'error',
              message: 'Connection failed',
              code: 1006
            });
          }
          if (mockWS.onclose) {
            mockWS.onclose({ 
              code: 1006,
              reason: 'Connection failed',
              wasClean: false
            });
          }
        }, 100);

        return mockWS as any;
      };
    });

    // Mock polling fallback API
    await page.route('**/api/import/status/**', async (route) => {
      const url = route.request().url();
      const jobId = url.split('/').pop();
      
      // Simulate progress via polling
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          jobId,
          status: 'completed',
          progress: 100,
          currentStep: 'Import completed (via polling)',
          videoId: 'fallback-video-123',
          completedAt: new Date().toISOString()
        })
      });
    });

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.configureImportSettings();
    await videoHelper.submitSettings();

    // Should show WebSocket connection warning
    const connectionWarning = page.locator('[role="alert"]:has-text("WebSocket connection lost")');
    await expect(connectionWarning).toBeVisible({ timeout: 10000 });
    
    // Should show fallback message
    await expect(page.getByText(/progress updates may be delayed|using fallback/i)).toBeVisible();

    // Should still show import progress page
    await expect(page.getByText(/import progress/i)).toBeVisible();
    
    // Should eventually complete using polling fallback
    await expect(page.locator('text=/import completed|completed via polling/i')).toBeVisible({ timeout: 30000 });
    
    console.log('✓ WebSocket failure handled with polling fallback');

    // Take screenshot of fallback mode
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/websocket-fallback.png',
      fullPage: true 
    });
  });

  test('should handle import processing failures with clear guidance', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    await mockServer.setupVideoImportMocks('success');
    
    // Mock WebSocket with processing failure
    await page.addInitScript((jobId) => {
      const OriginalWebSocket = window.WebSocket;
      
      (window as any).WebSocket = function(url: string) {
        const mockWS = {
          readyState: 1,
          url,
          onopen: null as any,
          onmessage: null as any,
          onclose: null as any,
          onerror: null as any,
          
          send: function() {},
          close: function() {},
          addEventListener: function(type: string, listener: any) {
            this[`on${type}`] = listener;
          },
          removeEventListener: function() {}
        };

        setTimeout(() => {
          if (mockWS.onopen) {
            mockWS.onopen({ type: 'open' });
          }
        }, 100);

        // Simulate progress then failure
        const events = [
          { delay: 2000, event: 'import-progress', status: 'processing', progress: 20, currentStep: 'Downloading video' },
          { delay: 4000, event: 'import-progress', status: 'processing', progress: 45, currentStep: 'Extracting audio' },
          { delay: 6000, event: 'import-error', status: 'failed', progress: 45, error: 'Video format not supported by transcription service', errorCode: 'TRANSCRIPTION_ERROR', recoveryOptions: ['Try a different video', 'Contact support'] }
        ];

        events.forEach((eventData, index) => {
          setTimeout(() => {
            if (mockWS.onmessage) {
              mockWS.onmessage({
                data: JSON.stringify({
                  ...eventData,
                  jobId,
                  timestamp: Date.now()
                })
              });
            }
          }, eventData.delay);
        });

        return mockWS as any;
      };
    }, testVideo.expectedJobId);

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.configureImportSettings();
    await videoHelper.submitSettings();
    await videoHelper.waitForProgressPage();

    // Should show initial progress
    await expect(page.getByText(/downloading video/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/extracting audio/i)).toBeVisible({ timeout: 15000 });

    // Should show error when processing fails
    await expect(page.getByText(/video format not supported by transcription service/i)).toBeVisible({ timeout: 20000 });
    
    // Should show error icon/state
    const errorAlert = page.locator('[role="alert"][severity="error"], .error-alert, .MuiAlert-standardError');
    await expect(errorAlert).toBeVisible();

    // Should provide recovery options
    await expect(page.getByText(/try a different video/i)).toBeVisible();
    await expect(page.getByText(/contact support/i)).toBeVisible();

    // Should show progress where it stopped
    const progressBar = page.locator('[role="progressbar"]');
    if (await progressBar.isVisible()) {
      const progressValue = await progressBar.getAttribute('aria-valuenow');
      expect(parseInt(progressValue || '0')).toBe(45);
    }

    console.log('✓ Processing failure handled with clear error message and recovery options');

    // Test recovery - user can try a new import
    const tryNewImportButton = page.getByRole('button', { name: /try.*new|start.*new/i });
    if (await tryNewImportButton.isVisible()) {
      await tryNewImportButton.click();
      
      // Should navigate back to start of flow
      await expect(page.getByText(/enter video url/i)).toBeVisible({ timeout: 5000 });
      console.log('✓ User can start new import after failure');
    }

    // Take screenshot of error state
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/processing-failure.png',
      fullPage: true 
    });
  });

  test('should handle network connectivity issues during import', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    await mockServer.setupVideoImportMocks('success');

    // Start import successfully
    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.configureImportSettings();
    await videoHelper.submitSettings();
    await videoHelper.waitForProgressPage();

    // Simulate network disconnection after import starts
    console.log('Simulating network disconnection...');
    
    await page.context().setOffline(true);

    // Should detect connectivity issues
    await expect(page.getByText(/connection.*lost|network.*error|offline/i)).toBeVisible({ timeout: 15000 });
    
    // Should show appropriate error/warning state
    const connectivityWarning = page.locator('[role="alert"], .network-error, .connectivity-warning');
    await expect(connectivityWarning).toBeVisible();

    // Take screenshot of offline state
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/network-disconnected.png' 
    });

    // Restore connectivity
    console.log('Restoring network connectivity...');
    await page.context().setOffline(false);

    // Setup reconnection handling
    await mockServer.setupWebSocketMocks(testVideo.expectedJobId, 'success');

    // Should recover from connectivity issues
    await expect(page.getByText(/connection.*restored|reconnected/i)).toBeVisible({ timeout: 15000 });
    
    // Should resume normal operation
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible({ timeout: 10000 });

    console.log('✓ Network connectivity issues handled with graceful recovery');

    // Take screenshot of recovered state
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/network-recovered.png' 
    });
  });

  test('should handle JavaScript errors without breaking the UI', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    // Inject script that will cause JS errors
    await page.addInitScript(() => {
      // Override console.error to track errors
      const originalError = console.error;
      (window as any).jsErrors = [];
      
      console.error = function(...args) {
        (window as any).jsErrors.push(args.join(' '));
        originalError.apply(console, args);
      };

      // Cause some JS errors during execution
      setTimeout(() => {
        try {
          // Null reference error
          (null as any).someProperty.doesNotExist();
        } catch (error) {
          console.error('Intentional null reference error:', error);
        }
        
        try {
          // Undefined function error
          (window as any).nonExistentFunction();
        } catch (error) {
          console.error('Intentional undefined function error:', error);
        }
      }, 2000);
    });

    await mockServer.setupVideoImportMocks('success');

    // UI should remain functional despite JS errors
    await videoHelper.navigateToImporter();
    
    // Check for JS errors
    const jsErrors = await page.evaluate(() => (window as any).jsErrors || []);
    console.log(`Captured ${jsErrors.length} JavaScript errors:`, jsErrors);

    // UI should still work
    await videoHelper.enterVideoURL(testVideo.url);
    await expect(page.locator('svg[color="success"]')).toBeVisible({ timeout: 8000 });
    
    await videoHelper.submitURL();
    await videoHelper.waitForSettingsPage();
    
    // Settings page should load despite errors
    await expect(page.getByText(/configure settings/i)).toBeVisible();

    console.log('✓ UI remained functional despite JavaScript errors');

    // Take screenshot showing functional UI
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/js-errors-handled.png' 
    });
  });

  test('should handle browser crashes and session recovery', async ({ page, context }) => {
    // This test simulates session interruption and recovery
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    await mockServer.setupVideoImportMocks('success');

    // Start import process
    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.configureImportSettings();

    // Simulate session interruption by closing and reopening page
    console.log('Simulating session interruption...');
    
    const url = page.url();
    await page.close();

    // Create new page (simulating browser restart/crash recovery)
    const newPage = await context.newPage();
    const newHelper = new VideoImportTestHelper(newPage);
    const newMockServer = new MockServerHelper(newPage);
    await newMockServer.setupVideoImportMocks('success');
    await newMockServer.mockExternalServices();

    // Navigate back to the application
    await newPage.goto('/import');

    // User should be able to restart the process
    await newHelper.enterVideoURL(testVideo.url);
    await expect(newPage.locator('svg[color="success"]')).toBeVisible({ timeout: 8000 });

    console.log('✓ Application handled session interruption gracefully');

    // If there's session recovery, test it
    const sessionRecoveryNotice = newPage.locator('text=/resume.*import|continue.*where.*left|recover.*session/i');
    if (await sessionRecoveryNotice.isVisible()) {
      console.log('✓ Session recovery feature detected');
      
      const resumeButton = newPage.getByRole('button', { name: /resume|continue/i });
      await resumeButton.click();
      
      // Should resume from previous state
      await expect(newPage.getByText(/configure settings/i)).toBeVisible({ timeout: 5000 });
      
      console.log('✓ Session recovery worked correctly');
    }

    // Take screenshot of recovery
    await newPage.screenshot({ 
      path: 'test-results/e2e-artifacts/session-recovery.png' 
    });

    await newPage.close();
  });

  test('should provide comprehensive error logging and debugging info', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    // Enable error tracking
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    page.on('requestfailed', request => {
      networkErrors.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Mock various error scenarios
    await page.route('**/api/import/**', async (route) => {
      const url = route.request().url();
      
      if (url.includes('validate-url')) {
        await route.fulfill({
          status: 503,
          body: JSON.stringify({
            error: 'Service unavailable',
            errorId: 'ERR_503_001',
            timestamp: new Date().toISOString(),
            debugInfo: {
              service: 'validation',
              version: '1.2.3',
              region: 'us-east-1'
            }
          })
        });
      } else {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({
            error: 'Internal server error',
            errorId: 'ERR_500_002',
            requestId: 'req_12345'
          })
        });
      }
    });

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);

    // Should show error with debugging information
    await expect(page.locator('svg[color="error"]')).toBeVisible({ timeout: 8000 });
    
    // Error should contain helpful debugging info
    await expect(page.getByText(/service unavailable/i)).toBeVisible();
    
    // Check if error ID is displayed (for support)
    const errorIdElement = page.locator('text=/ERR_503_001|error.*id/i');
    if (await errorIdElement.isVisible()) {
      console.log('✓ Error ID displayed for support reference');
    }

    // Verify error logging
    console.log('Console errors captured:', consoleErrors);
    console.log('Network errors captured:', networkErrors);
    
    expect(networkErrors.length).toBeGreaterThan(0); // Should have captured API failures
    
    // Take screenshot of error with debugging info
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/error-debugging-info.png' 
    });

    console.log('✓ Comprehensive error logging and debugging information provided');
  });

  test('should handle concurrent error scenarios without system instability', async ({ page, context }) => {
    // Test system stability under multiple concurrent errors
    const errorScenarios = [
      'validation-error',
      'import-error', 
      'timeout'
    ];

    const pages = [page];
    for (let i = 1; i < errorScenarios.length; i++) {
      pages.push(await context.newPage());
    }

    try {
      // Start concurrent imports with different error scenarios
      const errorPromises = pages.map(async (currentPage, index) => {
        const mockServer = new MockServerHelper(currentPage);
        const scenario = errorScenarios[index];
        
        await mockServer.setupVideoImportMocks(scenario as any);
        await mockServer.mockExternalServices();

        const helper = new VideoImportTestHelper(currentPage);
        const testVideo = MockDataHelper.getTestVideoData()[index];

        try {
          await helper.navigateToImporter();
          await helper.enterVideoURL(testVideo.url);
          
          if (scenario !== 'validation-error') {
            await helper.submitURL();
            await helper.waitForSettingsPage();
            await helper.configureImportSettings();
            
            const startButton = currentPage.getByRole('button', { name: /start import/i });
            await startButton.click();
            
            // Wait for error
            await currentPage.locator('[role="alert"][severity="error"], .error-alert').waitFor({ timeout: 15000 });
          } else {
            // Validation error should appear immediately
            await currentPage.locator('svg[color="error"]').waitFor({ timeout: 8000 });
          }
          
          return { 
            index, 
            scenario, 
            success: false, 
            errorHandled: true 
          };
          
        } catch (error) {
          return { 
            index, 
            scenario, 
            success: false, 
            errorHandled: false, 
            error: error.toString() 
          };
        }
      });

      const results = await Promise.all(errorPromises);
      
      // Verify all errors were handled gracefully
      results.forEach(result => {
        expect(result.errorHandled).toBeTruthy();
        console.log(`✓ Error scenario '${result.scenario}' handled gracefully`);
      });

      // Verify system stability - pages should still be responsive
      for (let i = 0; i < pages.length; i++) {
        const currentPage = pages[i];
        
        // Page should still be responsive to navigation
        await currentPage.goto('/');
        await expect(currentPage.locator('body')).toBeVisible({ timeout: 5000 });
        
        console.log(`✓ Page ${i + 1} remains stable after error scenario`);
      }

      // Take screenshots of all error states
      for (let i = 0; i < pages.length; i++) {
        await pages[i].screenshot({ 
          path: `test-results/e2e-artifacts/concurrent-error-${i + 1}-${errorScenarios[i]}.png` 
        });
      }

    } finally {
      // Close additional pages
      for (let i = 1; i < pages.length; i++) {
        await pages[i].close();
      }
    }

    console.log('✓ System remained stable under concurrent error scenarios');
  });
});