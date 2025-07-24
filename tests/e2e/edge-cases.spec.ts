import { test, expect } from '@playwright/test';
import { VideoImportTestHelper, WebSocketTestHelper, MockDataHelper } from './utils/test-helpers';
import { MockServerHelper } from './utils/mock-server';

/**
 * E2E tests for edge cases and unusual scenarios in video import
 * 
 * These tests verify:
 * - Large video files and long processing times
 * - Unusual video formats and codecs
 * - Network failures and interruptions
 * - Invalid URLs and malformed data
 * - Timeout scenarios
 * - Memory and resource constraints
 * - Platform-specific edge cases
 */

test.describe('Video Import Edge Cases', () => {
  let videoHelper: VideoImportTestHelper;
  let wsHelper: WebSocketTestHelper;
  let mockServer: MockServerHelper;

  test.beforeEach(async ({ page }) => {
    videoHelper = new VideoImportTestHelper(page);
    wsHelper = new WebSocketTestHelper(page);
    mockServer = new MockServerHelper(page);
    
    // Setup basic mocking
    await mockServer.mockExternalServices();
  });

  test.afterEach(async ({ page }) => {
    await mockServer.clearAllMocks();
  });

  test('should handle very large video files gracefully', async ({ page }) => {
    const largeVideoData = {
      url: 'https://www.youtube.com/watch?v=large-4k-video-test',
      title: 'Large 4K Video - 2 Hours',
      duration: 7200, // 2 hours
      platform: 'YouTube',
      expectedJobId: 'large-job-test',
      expectedVideoId: 'large-video-test'
    };

    // Mock slow processing for large files
    await mockServer.setupVideoImportMocks('slow-import');
    
    // Custom WebSocket mock with extended processing time
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

        // Extended progress updates for large file
        const progressSteps = [
          { step: 'Analyzing large video file', progress: 2, delay: 1000 },
          { step: 'Downloading video segments', progress: 10, delay: 3000 },
          { step: 'Processing 4K content', progress: 25, delay: 5000 },
          { step: 'Extracting high-quality audio', progress: 40, delay: 4000 },
          { step: 'Transcribing long content', progress: 60, delay: 6000 },
          { step: 'Detecting scenes in large file', progress: 80, delay: 4000 },
          { step: 'Optimizing for short-form content', progress: 95, delay: 2000 },
          { step: 'Finalizing large import', progress: 100, delay: 1000 }
        ];

        let cumulativeDelay = 0;
        progressSteps.forEach((step, index) => {
          cumulativeDelay += step.delay;
          setTimeout(() => {
            if (mockWS.onmessage) {
              mockWS.onmessage({
                data: JSON.stringify({
                  event: index === progressSteps.length - 1 ? 'import-complete' : 'import-progress',
                  jobId,
                  status: index === progressSteps.length - 1 ? 'completed' : 'processing',
                  progress: step.progress,
                  currentStep: step.step,
                  estimatedTimeRemaining: Math.max(0, (progressSteps.length - index) * 3000),
                  fileSize: '2.4GB',
                  videoId: index === progressSteps.length - 1 ? 'large-video-test' : undefined
                })
              });
            }
          }, cumulativeDelay);
        });

        return mockWS as any;
      };
    }, largeVideoData.expectedJobId);

    console.log('Testing large video import...');
    
    // Execute import with extended timeout
    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(largeVideoData.url);
    await videoHelper.submitURL();
    
    // Configure settings optimized for large files
    await videoHelper.configureImportSettings({
      maxSegmentDuration: 120, // Longer segments for large files
      minSegmentDuration: 60,
      autoHighlights: true // Let AI find best parts of long content
    });
    
    await videoHelper.submitSettings();
    await videoHelper.waitForProgressPage();

    // Monitor extended progress
    let lastProgress = 0;
    const progressHistory: Array<{progress: number, step: string, timestamp: number}> = [];
    
    const progressMonitor = setInterval(async () => {
      try {
        const currentProgress = await videoHelper.getCurrentProgress();
        const currentStep = await videoHelper.getCurrentStep();
        
        if (currentProgress > lastProgress) {
          progressHistory.push({
            progress: currentProgress,
            step: currentStep,
            timestamp: Date.now()
          });
          console.log(`Large video processing: ${currentProgress}% - ${currentStep}`);
          lastProgress = currentProgress;
          
          // Take screenshot at major milestones
          if ([25, 50, 75, 95].includes(currentProgress)) {
            await page.screenshot({ 
              path: `test-results/e2e-artifacts/large-video-${currentProgress}percent.png` 
            });
          }
        }
      } catch (error) {
        // Progress monitoring might fail
      }
    }, 2000);

    try {
      // Extended timeout for large video processing
      const result = await videoHelper.waitForImportCompletion(180000); // 3 minutes
      expect(result).toBe('completed');
      
      console.log('Large video import completed successfully');
      console.log('Progress history:', progressHistory);
      
      // Verify we have reasonable progress tracking
      expect(progressHistory.length).toBeGreaterThan(5);
      
    } finally {
      clearInterval(progressMonitor);
    }

    // Take final screenshot
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/large-video-final.png',
      fullPage: true 
    });
  });

  test('should handle unusual video formats and platforms', async ({ page }) => {
    const unusualFormats = [
      {
        url: 'https://vimeo.com/123456789',
        platform: 'Vimeo',
        expectedError: false
      },
      {
        url: 'https://www.twitch.tv/videos/123456789',
        platform: 'Twitch',
        expectedError: false
      },
      {
        url: 'https://example.com/video.webm',
        platform: 'Direct WebM',
        expectedError: false
      },
      {
        url: 'https://example.com/video.mkv',
        platform: 'Direct MKV',
        expectedError: false
      },
      {
        url: 'https://example.com/video.flv',
        platform: 'Direct FLV',
        expectedError: true // FLV might not be supported
      }
    ];

    for (const format of unusualFormats) {
      console.log(`Testing format: ${format.platform} - ${format.url}`);
      
      // Setup validation mock based on expected outcome
      if (format.expectedError) {
        await mockServer.mockRoute('**/api/import/validate-url', {
          status: 400,
          body: {
            isValid: false,
            error: `Unsupported format: ${format.platform}`
          }
        });
      } else {
        await mockServer.mockRoute('**/api/import/validate-url', {
          status: 200,
          body: {
            isValid: true,
            platform: format.platform,
            metadata: {
              title: `Test ${format.platform} Video`,
              duration: 180
            }
          }
        });
      }

      await page.goto('/import');
      await videoHelper.enterVideoURL(format.url);
      
      if (format.expectedError) {
        // Should show error for unsupported format
        await expect(page.locator('svg[color="error"]')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/unsupported|invalid/i)).toBeVisible();
        
        const continueButton = page.getByRole('button', { name: /continue/i });
        await expect(continueButton).toBeDisabled();
        
        console.log(`✓ Correctly rejected unsupported format: ${format.platform}`);
      } else {
        // Should validate successfully
        await expect(page.locator('svg[color="success"]')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(new RegExp(`valid.*${format.platform}.*url`, 'i'))).toBeVisible();
        
        const continueButton = page.getByRole('button', { name: /continue/i });
        await expect(continueButton).toBeEnabled();
        
        console.log(`✓ Successfully validated format: ${format.platform}`);
      }
      
      // Take screenshot of validation result
      await page.screenshot({ 
        path: `test-results/e2e-artifacts/format-${format.platform.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png` 
      });
    }
  });

  test('should handle network failures and interruptions', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];

    // Test intermittent network failures
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      
      // Simulate 30% failure rate
      if (Math.random() < 0.3) {
        console.log(`Simulating network failure for: ${url}`);
        await route.abort('internetdisconnected');
      } else {
        // Let successful requests through with default mock
        if (url.includes('validate-url')) {
          await route.fulfill({
            status: 200,
            body: JSON.stringify({
              isValid: true,
              platform: 'YouTube',
              metadata: { title: 'Test Video', duration: 120 }
            })
          });
        } else if (url.includes('import/video')) {
          await route.fulfill({
            status: 200,
            body: JSON.stringify({
              success: true,
              jobId: 'network-test-job',
              message: 'Import started successfully'
            })
          });
        } else {
          await route.continue();
        }
      }
    });

    await videoHelper.navigateToImporter();

    // URL validation should eventually succeed despite intermittent failures
    let validationAttempts = 0;
    let validationSucceeded = false;
    
    while (!validationSucceeded && validationAttempts < 5) {
      validationAttempts++;
      console.log(`URL validation attempt ${validationAttempts}`);
      
      const urlInput = page.getByLabel(/video url/i);
      await urlInput.clear();
      await urlInput.fill(`${testVideo.url}?attempt=${validationAttempts}`);
      
      try {
        // Wait for validation with timeout
        await page.waitForSelector('svg[color="success"], svg[color="error"]', { timeout: 10000 });
        
        const successIcon = page.locator('svg[color="success"]');
        if (await successIcon.isVisible()) {
          validationSucceeded = true;
          console.log(`✓ URL validation succeeded on attempt ${validationAttempts}`);
        } else {
          console.log(`✗ URL validation failed on attempt ${validationAttempts}, retrying...`);
          await page.waitForTimeout(2000); // Wait before retry
        }
      } catch (error) {
        console.log(`URL validation timeout on attempt ${validationAttempts}`);
        await page.waitForTimeout(2000);
      }
    }

    expect(validationSucceeded).toBeTruthy();

    // Take screenshot of successful validation despite network issues
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/network-recovery-validation.png' 
    });

    // Test import start with network issues
    await videoHelper.submitURL();
    await videoHelper.waitForSettingsPage();
    await videoHelper.configureImportSettings();

    let importStarted = false;
    let startAttempts = 0;
    
    while (!importStarted && startAttempts < 3) {
      startAttempts++;
      console.log(`Import start attempt ${startAttempts}`);
      
      try {
        const startButton = page.getByRole('button', { name: /start import/i });
        await startButton.click();
        
        // Check for either progress page or error
        await Promise.race([
          page.waitForSelector('[role="progressbar"]', { timeout: 15000 }),
          page.waitForSelector('[role="alert"]', { timeout: 15000 })
        ]);
        
        if (await page.locator('[role="progressbar"]').isVisible()) {
          importStarted = true;
          console.log(`✓ Import started successfully on attempt ${startAttempts}`);
        } else {
          console.log(`✗ Import failed on attempt ${startAttempts}, retrying...`);
          await page.waitForTimeout(3000);
        }
      } catch (error) {
        console.log(`Import start timeout on attempt ${startAttempts}`);
        await page.waitForTimeout(3000);
      }
    }

    expect(importStarted).toBeTruthy();

    // Take screenshot of successful import start despite network issues
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/network-recovery-import.png' 
    });
  });

  test('should handle malformed URLs and invalid input', async ({ page }) => {
    const invalidInputs = [
      {
        input: '',
        description: 'empty input',
        shouldShowError: false // Empty input should just show no validation
      },
      {
        input: 'not-a-url',
        description: 'plain text',
        shouldShowError: true
      },
      {
        input: 'http://invalid-domain-that-does-not-exist.com/video',
        description: 'non-existent domain',
        shouldShowError: true
      },
      {
        input: 'https://www.youtube.com/watch?v=',
        description: 'YouTube URL without video ID',
        shouldShowError: true
      },
      {
        input: 'ftp://example.com/video.mp4',
        description: 'unsupported protocol',
        shouldShowError: true
      },
      {
        input: 'https://youtube.com/watch?v=' + 'x'.repeat(1000),
        description: 'extremely long video ID',
        shouldShowError: true
      },
      {
        input: 'javascript:alert("xss")',
        description: 'javascript injection attempt',
        shouldShowError: true
      },
      {
        input: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmRdnEQy6GKEZ9z2HQ8Pl3G2vgF8K&malicious=<script>alert(1)</script>',
        description: 'URL with potential XSS in parameters',
        shouldShowError: false // Should be valid YouTube URL, XSS should be sanitized
      }
    ];

    // Setup validation mock to handle various invalid cases
    await page.route('**/api/import/validate-url', async (route) => {
      const postData = route.request().postDataJSON();
      const url = postData?.url || '';
      
      // Determine response based on URL pattern
      let response;
      
      if (url.includes('not-a-url') || 
          url.includes('invalid-domain') || 
          url.startsWith('ftp://') ||
          url.startsWith('javascript:') ||
          url.includes('watch?v=' + 'x'.repeat(100))) {
        response = {
          status: 400,
          body: {
            isValid: false,
            error: 'Invalid URL format or unsupported source'
          }
        };
      } else if (url.includes('youtube.com/watch?v=') && !url.includes('watch?v=&')) {
        // Valid YouTube URL (even with potential XSS parameters)
        response = {
          status: 200,
          body: {
            isValid: true,
            platform: 'YouTube',
            metadata: { title: 'Valid Video', duration: 120 }
          }
        };
      } else {
        response = {
          status: 400,
          body: {
            isValid: false,
            error: 'Unable to validate URL'
          }
        };
      }
      
      await route.fulfill(response);
    });

    await videoHelper.navigateToImporter();

    for (const testCase of invalidInputs) {
      console.log(`Testing invalid input: ${testCase.description}`);
      
      const urlInput = page.getByLabel(/video url/i);
      await urlInput.clear();
      
      if (testCase.input) {
        await urlInput.fill(testCase.input);
        
        // Wait for validation
        try {
          await page.waitForSelector('svg[color="success"], svg[color="error"]', { timeout: 8000 });
        } catch (error) {
          // Timeout is acceptable for some inputs
          console.log(`Validation timeout for: ${testCase.description}`);
        }
        
        if (testCase.shouldShowError) {
          // Should show error state
          const errorIcon = page.locator('svg[color="error"]');
          await expect(errorIcon).toBeVisible();
          
          // Continue button should be disabled
          const continueButton = page.getByRole('button', { name: /continue/i });
          await expect(continueButton).toBeDisabled();
          
          console.log(`✓ Correctly rejected: ${testCase.description}`);
        } else if (testCase.input.includes('youtube.com/watch?v=dQw4w9WgXcQ')) {
          // Should be valid despite parameters
          const successIcon = page.locator('svg[color="success"]');
          await expect(successIcon).toBeVisible();
          
          console.log(`✓ Correctly accepted valid URL with parameters: ${testCase.description}`);
        }
      }
      
      // Take screenshot of each validation result
      await page.screenshot({ 
        path: `test-results/e2e-artifacts/invalid-input-${testCase.description.replace(/[^a-z0-9]/g, '-')}.png` 
      });
    }
  });

  test('should handle timeout scenarios gracefully', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];

    // Mock very slow responses to trigger timeouts
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      console.log(`Slow response for: ${url}`);
      
      // Add significant delay to all API calls
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      if (url.includes('validate-url')) {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            isValid: true,
            platform: 'YouTube'
          })
        });
      } else {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({
            error: 'Request timeout'
          })
        });
      }
    });

    await videoHelper.navigateToImporter();
    const urlInput = page.getByLabel(/video url/i);
    await urlInput.fill(testVideo.url);

    // Should handle validation timeout gracefully
    console.log('Testing validation timeout handling...');
    
    const validationStartTime = Date.now();
    let timeoutHandled = false;
    
    try {
      // Wait for validation with a reasonable timeout
      await page.waitForSelector('svg[color="success"], svg[color="error"]', { timeout: 20000 });
      console.log(`Validation completed in ${Date.now() - validationStartTime}ms`);
    } catch (error) {
      console.log('Validation timeout occurred, checking error handling...');
      timeoutHandled = true;
      
      // Should show some kind of error or loading state
      const loadingIndicator = page.locator('.MuiCircularProgress-root, [data-testid="validation-loading"]');
      const errorIndicator = page.locator('svg[color="error"], [role="alert"]');
      
      const hasLoadingState = await loadingIndicator.isVisible();
      const hasErrorState = await errorIndicator.isVisible();
      
      expect(hasLoadingState || hasErrorState).toBeTruthy();
      console.log(`✓ Timeout handled gracefully (loading: ${hasLoadingState}, error: ${hasErrorState})`);
    }

    // Take screenshot of timeout handling
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/timeout-handling.png' 
    });

    // Test user recovery from timeout
    if (timeoutHandled) {
      console.log('Testing recovery from timeout...');
      
      // Clear the problematic route
      await page.unroute('**/api/**');
      
      // Setup working mock
      await mockServer.setupVideoImportMocks('success');
      
      // User should be able to retry
      await urlInput.clear();
      await urlInput.fill(testVideo.url);
      
      // Should now work
      await expect(page.locator('svg[color="success"]')).toBeVisible({ timeout: 10000 });
      console.log('✓ Successfully recovered from timeout');
      
      await page.screenshot({ 
        path: 'test-results/e2e-artifacts/timeout-recovery.png' 
      });
    }
  });

  test('should handle browser resource constraints', async ({ page }) => {
    // Simulate low memory conditions
    const client = await page.context().newCDPSession(page);
    
    // Limit memory (this may not work in all browsers)
    try {
      await client.send('Runtime.enable');
      await client.send('HeapProfiler.enable');
    } catch (error) {
      console.log('CDP memory profiling not available, skipping memory constraint test');
      return;
    }

    const testVideo = MockDataHelper.getTestVideoData()[0];
    await mockServer.setupVideoImportMocks('success');

    // Create memory pressure by opening many tabs
    const context = page.context();
    const memoryPressurePages = [];
    
    try {
      // Create additional pages to consume memory
      for (let i = 0; i < 10; i++) {
        const newPage = await context.newPage();
        
        // Load content to consume memory
        await newPage.goto('data:text/html,<html><body><div id="content"></div><script>var arr = []; for(var i = 0; i < 100000; i++) arr.push("memory pressure test " + i);</script></body></html>');
        memoryPressurePages.push(newPage);
      }

      console.log('Created memory pressure, testing import under constraints...');

      // Test import functionality under memory pressure
      await videoHelper.navigateToImporter();
      await videoHelper.enterVideoURL(testVideo.url);
      
      // Should still validate despite memory pressure
      await videoHelper.waitForURLValidation();
      await expect(page.locator('svg[color="success"]')).toBeVisible();
      
      await videoHelper.submitURL();
      await videoHelper.waitForSettingsPage();
      
      // Should still be able to configure settings
      await videoHelper.configureImportSettings();
      
      // Take screenshot under memory pressure
      await page.screenshot({ 
        path: 'test-results/e2e-artifacts/memory-pressure-test.png' 
      });

      console.log('✓ Application remained functional under memory pressure');

    } finally {
      // Clean up memory pressure pages
      for (const memoryPage of memoryPressurePages) {
        await memoryPage.close();
      }
    }
  });

  test('should handle extremely long processing times', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    // Mock extremely slow processing
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

        // Very slow progress updates
        const slowSteps = [
          { progress: 1, step: 'Starting processing...', delay: 5000 },
          { progress: 5, step: 'Processing complex video...', delay: 10000 },
          { progress: 15, step: 'Still processing...', delay: 15000 },
          { progress: 30, step: 'This is taking longer than expected...', delay: 20000 },
          { progress: 50, step: 'Almost halfway there...', delay: 10000 }
          // Intentionally stop here to test very long processing
        ];

        let cumulativeDelay = 0;
        slowSteps.forEach((step, index) => {
          cumulativeDelay += step.delay;
          setTimeout(() => {
            if (mockWS.onmessage) {
              mockWS.onmessage({
                data: JSON.stringify({
                  event: 'import-progress',
                  jobId,
                  status: 'processing',
                  progress: step.progress,
                  currentStep: step.step,
                  estimatedTimeRemaining: (slowSteps.length - index) * 15000 // Long estimate
                })
              });
            }
          }, cumulativeDelay);
        });

        return mockWS as any;
      };
    }, testVideo.expectedJobId);

    await mockServer.setupVideoImportMocks('success');

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.configureImportSettings();
    await videoHelper.submitSettings();
    await videoHelper.waitForProgressPage();

    console.log('Testing behavior with extremely long processing times...');

    // Monitor progress for extended period
    let maxProgress = 0;
    let lastStep = '';
    const progressMonitor = setInterval(async () => {
      try {
        const currentProgress = await videoHelper.getCurrentProgress();
        const currentStep = await videoHelper.getCurrentStep();
        
        if (currentProgress > maxProgress) {
          maxProgress = currentProgress;
          console.log(`Progress update: ${currentProgress}% - ${currentStep}`);
        }
        
        if (currentStep !== lastStep) {
          lastStep = currentStep;
          console.log(`Step update: ${currentStep}`);
        }
        
        // Verify UI remains responsive
        const progressBar = page.locator('[role="progressbar"]');
        await expect(progressBar).toBeVisible();
        
      } catch (error) {
        console.log('Progress monitoring error (expected for long processing)');
      }
    }, 5000);

    // Wait for a reasonable amount of time, then verify system is still responsive
    await page.waitForTimeout(30000); // 30 seconds
    clearInterval(progressMonitor);

    // Verify we made some progress
    expect(maxProgress).toBeGreaterThan(0);
    
    // UI should still be functional despite long processing
    await expect(page.getByText(/import progress/i)).toBeVisible();
    await expect(page.locator('[role="progressbar"]')).toBeVisible();
    
    // Should show that processing is ongoing
    const currentStep = await videoHelper.getCurrentStep();
    expect(currentStep).toBeTruthy();
    
    console.log(`✓ UI remained responsive during long processing (max progress: ${maxProgress}%)`);

    // Take screenshot of long processing state
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/long-processing-state.png',
      fullPage: true 
    });
  });

  test('should handle special characters and unicode in URLs', async ({ page }) => {
    const unicodeTestCases = [
      {
        url: 'https://www.youtube.com/watch?v=test_중국어',
        description: 'URL with Chinese characters'
      },
      {
        url: 'https://www.youtube.com/watch?v=test_русский',
        description: 'URL with Cyrillic characters'
      },
      {
        url: 'https://www.youtube.com/watch?v=test_العربية',
        description: 'URL with Arabic characters'
      },
      {
        url: 'https://www.youtube.com/watch?v=test_🚀',
        description: 'URL with emoji'
      },
      {
        url: 'https://www.youtube.com/watch?v=test with spaces',
        description: 'URL with unencoded spaces'
      },
      {
        url: 'https://www.youtube.com/watch?v=test%20encoded%20spaces',
        description: 'URL with encoded spaces'
      }
    ];

    // Mock validation to handle unicode URLs
    await page.route('**/api/import/validate-url', async (route) => {
      const postData = route.request().postDataJSON();
      const url = postData?.url || '';
      
      console.log(`Validating unicode URL: ${url}`);
      
      try {
        // Attempt to parse URL
        new URL(url);
        
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            isValid: true,
            platform: 'YouTube',
            metadata: {
              title: 'Unicode Test Video',
              duration: 120
            }
          })
        });
      } catch (error) {
        await route.fulfill({
          status: 400,
          body: JSON.stringify({
            isValid: false,
            error: 'Invalid URL format'
          })
        });
      }
    });

    await videoHelper.navigateToImporter();

    for (const testCase of unicodeTestCases) {
      console.log(`Testing: ${testCase.description}`);
      
      const urlInput = page.getByLabel(/video url/i);
      await urlInput.clear();
      await urlInput.fill(testCase.url);
      
      // Wait for validation
      try {
        await page.waitForSelector('svg[color="success"], svg[color="error"]', { timeout: 8000 });
        
        const successIcon = page.locator('svg[color="success"]');
        if (await successIcon.isVisible()) {
          console.log(`✓ Successfully handled: ${testCase.description}`);
          
          // Verify URL is preserved correctly
          await expect(urlInput).toHaveValue(testCase.url);
          
        } else {
          console.log(`✗ Failed to handle: ${testCase.description}`);
        }
      } catch (error) {
        console.log(`Timeout for: ${testCase.description}`);
      }
      
      // Take screenshot
      await page.screenshot({ 
        path: `test-results/e2e-artifacts/unicode-url-test-${testCase.description.replace(/[^a-zA-Z0-9]/g, '-')}.png` 
      });
    }
  });
});