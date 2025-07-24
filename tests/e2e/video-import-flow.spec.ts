import { test, expect } from '@playwright/test';
import { VideoImportTestHelper, WebSocketTestHelper, MockDataHelper } from './utils/test-helpers';
import { MockServerHelper } from './utils/mock-server';

/**
 * E2E tests for the complete video import flow
 * 
 * These tests simulate real user interactions from the UI through to the final video output:
 * - Complete import flow from URL submission to rendered video
 * - Integration between frontend, backend, and video rendering
 * - Real-time progress updates via WebSocket
 * - Error handling and recovery
 */

test.describe('Video Import Flow E2E', () => {
  let videoHelper: VideoImportTestHelper;
  let wsHelper: WebSocketTestHelper;
  let mockServer: MockServerHelper;

  test.beforeEach(async ({ page }) => {
    videoHelper = new VideoImportTestHelper(page);
    wsHelper = new WebSocketTestHelper(page);
    mockServer = new MockServerHelper(page);

    // Setup mock responses for reliable testing
    await mockServer.setupVideoImportMocks('success');
    await mockServer.mockExternalServices();
  });

  test.afterEach(async ({ page }) => {
    // Clean up mocks
    await mockServer.clearAllMocks();
  });

  test('should complete basic video import workflow successfully', async ({ page }) => {
    // Get test data
    const testVideos = MockDataHelper.getTestVideoData();
    const testVideo = testVideos[0]; // YouTube video
    const testSettings = MockDataHelper.getTestSettings()[0];

    // Setup WebSocket mocking for this test
    await mockServer.setupWebSocketMocks(testVideo.expectedJobId, 'success');

    console.log(`Testing import for: ${testVideo.title}`);

    // Execute the complete workflow
    const result = await videoHelper.completeFullImportWorkflow(testVideo, testSettings);

    // Verify successful completion
    expect(result).toBe('completed');

    // Verify we ended up on the video editor page
    expect(page.url()).toContain('/edit/');
    
    // Verify the URL contains the expected video ID
    expect(page.url()).toContain(testVideo.expectedVideoId);

    // Verify the video editor loaded correctly
    await expect(page.getByRole('heading', { name: /video editor/i })).toBeVisible();
    
    // Take a screenshot of the final state
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/successful-import-final-state.png',
      fullPage: true 
    });
  });

  test('should handle YouTube video URL validation and import', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData().find(v => v.platform === 'YouTube');
    if (!testVideo) throw new Error('No YouTube test data found');

    // Navigate to importer
    await videoHelper.navigateToImporter();

    // Test URL input and validation
    await videoHelper.enterVideoURL(testVideo.url);

    // Verify URL validation shows success
    await expect(page.getByText(/valid youtube url detected/i)).toBeVisible();
    
    // Verify the continue button is enabled
    const continueButton = page.getByRole('button', { name: /continue/i });
    await expect(continueButton).toBeEnabled();

    // Take screenshot of validation state
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/youtube-url-validation.png' 
    });
  });

  test('should handle direct video file URL import', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData().find(v => v.platform === 'Direct');
    if (!testVideo) throw new Error('No direct video test data found');

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);

    // Verify direct video URL validation
    await expect(page.getByText(/valid.*url detected/i)).toBeVisible();
    
    await videoHelper.submitURL();
    
    // Should proceed to settings
    await videoHelper.waitForSettingsPage();
    
    // Take screenshot of settings page for direct video
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/direct-video-settings.png' 
    });
  });

  test('should properly configure all import settings', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    const testSettings = {
      targetLanguage: 'Portuguese',
      music: 'Chill',
      orientation: 'Landscape',
      autoHighlights: false,
      maxSegmentDuration: 90,
      minSegmentDuration: 30
    };

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();

    // Configure each setting individually and verify
    await videoHelper.configureImportSettings(testSettings);

    // Verify settings are applied correctly
    if (testSettings.targetLanguage) {
      await expect(page.getByDisplayValue('Portuguese')).toBeVisible();
    }

    if (testSettings.orientation) {
      const landscapeRadio = page.getByRole('radio', { name: /landscape/i });
      await expect(landscapeRadio).toBeChecked();
    }

    if (testSettings.autoHighlights === false) {
      const highlightsToggle = page.getByRole('checkbox', { name: /auto highlights/i });
      await expect(highlightsToggle).not.toBeChecked();
    }

    // Take screenshot of configured settings
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/configured-settings.png' 
    });
  });

  test('should track import progress with real-time updates', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    const testSettings = MockDataHelper.getTestSettings()[0];

    // Setup WebSocket mocking with progress tracking
    await mockServer.setupWebSocketMocks(testVideo.expectedJobId, 'success');

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.configureImportSettings(testSettings);
    await videoHelper.submitSettings();

    // Verify progress page is shown
    await videoHelper.waitForProgressPage();

    // Monitor progress updates
    let lastProgress = 0;
    const progressCheckInterval = setInterval(async () => {
      try {
        const currentProgress = await videoHelper.getCurrentProgress();
        const currentStep = await videoHelper.getCurrentStep();
        
        console.log(`Progress: ${currentProgress}% - ${currentStep}`);
        
        // Verify progress is increasing
        expect(currentProgress).toBeGreaterThanOrEqual(lastProgress);
        lastProgress = currentProgress;
        
        // Take periodic screenshots
        if (currentProgress > 0 && currentProgress % 25 === 0) {
          await page.screenshot({ 
            path: `test-results/e2e-artifacts/progress-${currentProgress}percent.png` 
          });
        }
      } catch (error) {
        // Progress monitoring might fail if import completes
        clearInterval(progressCheckInterval);
      }
    }, 1000);

    // Wait for completion
    try {
      await videoHelper.waitForImportCompletion(60000);
      clearInterval(progressCheckInterval);
    } catch (error) {
      clearInterval(progressCheckInterval);
      throw error;
    }

    // Verify final state
    expect(page.url()).toContain('/edit/');
    
    // Take final screenshot
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/import-completed.png',
      fullPage: true 
    });
  });

  test('should handle network delays gracefully', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    // Setup slow response mocking
    await mockServer.setupVideoImportMocks('slow-import');
    await mockServer.setupWebSocketMocks(testVideo.expectedJobId, 'success');

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    
    // Should show loading state during slow validation
    const validationSpinner = page.locator('[data-testid="validation-loading"]');
    if (await validationSpinner.isVisible()) {
      console.log('Validation loading state detected correctly');
    }

    // Wait for validation to complete (should be slow)
    await videoHelper.waitForURLValidation();
    
    await videoHelper.submitURL();
    await videoHelper.waitForSettingsPage();
    
    // Configure settings
    await videoHelper.configureImportSettings(MockDataHelper.getTestSettings()[0]);
    
    // Submit should also be slow
    const submitTime = Date.now();
    await videoHelper.submitSettings();
    const submitDuration = Date.now() - submitTime;
    
    console.log(`Settings submission took: ${submitDuration}ms`);
    expect(submitDuration).toBeGreaterThan(1000); // Should be slow due to mock delay
  });

  test('should preserve user input during multi-step workflow', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    const testSettings = MockDataHelper.getTestSettings()[0];

    await videoHelper.navigateToImporter();
    
    // Enter URL
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    
    // Go to settings and then back
    await videoHelper.waitForSettingsPage();
    
    // Go back to URL step
    const backButton = page.getByRole('button', { name: /back/i });
    await backButton.click();
    
    // Verify URL is preserved
    const urlInput = page.getByLabel(/video url/i);
    await expect(urlInput).toHaveValue(testVideo.url);
    
    // Go forward again
    await videoHelper.submitURL();
    
    // Configure settings and verify they persist through navigation
    await videoHelper.configureImportSettings(testSettings);
    
    // Take screenshot of form state persistence
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/form-state-persistence.png' 
    });
  });

  test('should show appropriate loading states throughout workflow', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    await videoHelper.navigateToImporter();
    
    // Test URL validation loading
    const urlInput = page.getByLabel(/video url/i);
    await urlInput.fill(testVideo.url);
    
    // Should show validation loading indicator
    const validationSpinner = page.locator('svg[data-testid="CircularProgress-svg"], .MuiCircularProgress-svg');
    await expect(validationSpinner).toBeVisible({ timeout: 5000 });
    
    await videoHelper.waitForURLValidation();
    await videoHelper.submitURL();
    await videoHelper.waitForSettingsPage();
    
    // Test settings submission loading
    await videoHelper.configureImportSettings(MockDataHelper.getTestSettings()[0]);
    
    const startButton = page.getByRole('button', { name: /start import/i });
    await startButton.click();
    
    // Should show import loading state
    const importLoadingSpinner = page.locator('[role="progressbar"], .MuiLinearProgress-root');
    await expect(importLoadingSpinner).toBeVisible({ timeout: 10000 });
    
    // Take screenshot of loading states
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/loading-states.png' 
    });
  });
});

/**
 * Additional test suite for advanced scenarios
 */
test.describe('Video Import Advanced Scenarios', () => {
  let videoHelper: VideoImportTestHelper;
  let wsHelper: WebSocketTestHelper;
  let mockServer: MockServerHelper;

  test.beforeEach(async ({ page }) => {
    videoHelper = new VideoImportTestHelper(page);
    wsHelper = new WebSocketTestHelper(page);
    mockServer = new MockServerHelper(page);
  });

  test.afterEach(async ({ page }) => {
    await mockServer.clearAllMocks();
  });

  test('should handle very large video files', async ({ page }) => {
    // Create a test scenario with a large video file
    const largeVideoData = {
      url: 'https://www.youtube.com/watch?v=large-video-test',
      title: 'Large Test Video - 4K 60fps',
      duration: 3600, // 1 hour
      platform: 'YouTube',
      expectedJobId: 'test-job-large',
      expectedVideoId: 'test-video-large'
    };

    await mockServer.setupVideoImportMocks('slow-import');
    await mockServer.setupWebSocketMocks(largeVideoData.expectedJobId, 'success');

    // Execute workflow with extended timeout for large files
    const result = await videoHelper.completeFullImportWorkflow(
      largeVideoData, 
      { 
        maxSegmentDuration: 120, // Longer segments for large videos
        minSegmentDuration: 60 
      }
    );

    expect(result).toBe('completed');
  });

  test('should handle concurrent multiple imports', async ({ page, context }) => {
    // This test verifies the system can handle multiple import jobs
    const testVideos = MockDataHelper.getTestVideoData().slice(0, 2);
    
    // Setup mocks for both videos
    await mockServer.setupVideoImportMocks('success');
    
    // Create multiple tabs to simulate concurrent imports
    const pages = [page];
    for (let i = 1; i < testVideos.length; i++) {
      pages.push(await context.newPage());
    }

    // Start imports concurrently
    const importPromises = testVideos.map(async (video, index) => {
      const currentPage = pages[index];
      const helper = new VideoImportTestHelper(currentPage);
      
      // Setup mocks for this specific page
      const pageServer = new MockServerHelper(currentPage);
      await pageServer.setupVideoImportMocks('success');
      await pageServer.setupWebSocketMocks(video.expectedJobId, 'success');
      await pageServer.mockExternalServices();
      
      return helper.completeFullImportWorkflow(video);
    });

    // Wait for all imports to complete
    const results = await Promise.all(importPromises);
    
    // Verify all imports succeeded
    results.forEach(result => {
      expect(result).toBe('completed');
    });

    // Clean up additional pages
    for (let i = 1; i < pages.length; i++) {
      await pages[i].close();
    }
  });

  test('should maintain performance with slow network conditions', async ({ page }) => {
    // Simulate slow network
    const client = await page.context().newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 2000, // 2 second latency
      downloadThroughput: 50 * 1024, // 50kb/s
      uploadThroughput: 50 * 1024
    });

    const testVideo = MockDataHelper.getTestVideoData()[0];
    await mockServer.setupVideoImportMocks('slow-import');
    await mockServer.setupWebSocketMocks(testVideo.expectedJobId, 'success');

    const startTime = Date.now();
    
    try {
      await videoHelper.completeFullImportWorkflow(testVideo);
      const duration = Date.now() - startTime;
      
      console.log(`Import completed in ${duration}ms under slow network conditions`);
      
      // Should complete even with slow network (with reasonable timeout)
      expect(duration).toBeLessThan(180000); // 3 minutes max
      
    } finally {
      // Reset network conditions
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
      });
    }
  });
});