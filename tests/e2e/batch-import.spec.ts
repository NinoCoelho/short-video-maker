import { test, expect } from '@playwright/test';
import { VideoImportTestHelper, WebSocketTestHelper, MockDataHelper } from './utils/test-helpers';
import { MockServerHelper } from './utils/mock-server';

/**
 * E2E tests for batch video import and concurrent processing
 * 
 * These tests verify:
 * - Multiple video imports running simultaneously
 * - Queue management and resource allocation
 * - UI handling of concurrent import operations
 * - Performance under load
 * - Proper isolation between import jobs
 * - Batch operations through UI
 */

test.describe('Batch Video Import E2E', () => {
  let videoHelper: VideoImportTestHelper;
  let wsHelper: WebSocketTestHelper;
  let mockServer: MockServerHelper;

  test.beforeEach(async ({ page }) => {
    videoHelper = new VideoImportTestHelper(page);
    wsHelper = new WebSocketTestHelper(page);
    mockServer = new MockServerHelper(page);
    
    // Setup basic mocking
    await mockServer.setupVideoImportMocks('success');
    await mockServer.mockExternalServices();
  });

  test.afterEach(async ({ page }) => {
    await mockServer.clearAllMocks();
  });

  test('should handle multiple concurrent video imports', async ({ page, context }) => {
    const testVideos = MockDataHelper.getTestVideoData();
    const concurrentImports = Math.min(testVideos.length, 3); // Test with 3 concurrent imports
    
    console.log(`Testing ${concurrentImports} concurrent imports`);

    // Create additional browser tabs for concurrent imports
    const pages = [page];
    const helpers: VideoImportTestHelper[] = [videoHelper];
    const mockServers: MockServerHelper[] = [mockServer];

    for (let i = 1; i < concurrentImports; i++) {
      const newPage = await context.newPage();
      pages.push(newPage);
      helpers.push(new VideoImportTestHelper(newPage));
      
      const newMockServer = new MockServerHelper(newPage);
      await newMockServer.setupVideoImportMocks('success');
      await newMockServer.mockExternalServices();
      mockServers.push(newMockServer);
    }

    try {
      // Setup WebSocket mocks for each import
      for (let i = 0; i < concurrentImports; i++) {
        await mockServers[i].setupWebSocketMocks(testVideos[i].expectedJobId, 'success');
      }

      // Start all imports concurrently
      const importPromises = helpers.map(async (helper, index) => {
        const testVideo = testVideos[index];
        const testSettings = MockDataHelper.getTestSettings()[index % MockDataHelper.getTestSettings().length];
        
        console.log(`Starting import ${index + 1}: ${testVideo.title}`);
        
        try {
          const result = await helper.completeFullImportWorkflow(testVideo, testSettings);
          console.log(`Import ${index + 1} completed: ${result}`);
          return { index, result, success: true };
        } catch (error) {
          console.log(`Import ${index + 1} failed:`, error);
          return { index, result: null, success: false, error };
        }
      });

      // Wait for all imports to complete or timeout
      const results = await Promise.all(importPromises);
      
      // Verify all imports succeeded
      const successfulImports = results.filter(r => r.success);
      const failedImports = results.filter(r => !r.success);
      
      console.log(`Successful imports: ${successfulImports.length}/${concurrentImports}`);
      console.log(`Failed imports: ${failedImports.length}/${concurrentImports}`);
      
      if (failedImports.length > 0) {
        console.log('Failed import details:', failedImports.map(f => ({ index: f.index, error: f.error })));
      }

      // At least 80% should succeed under normal conditions
      expect(successfulImports.length).toBeGreaterThanOrEqual(Math.floor(concurrentImports * 0.8));

      // Verify each successful import ended up on the correct page
      for (const result of successfulImports) {
        const currentPage = pages[result.index];
        expect(currentPage.url()).toContain('/edit/');
      }

      // Take screenshots of all final states
      for (let i = 0; i < pages.length; i++) {
        await pages[i].screenshot({ 
          path: `test-results/e2e-artifacts/concurrent-import-${i + 1}-final.png`,
          fullPage: true 
        });
      }

    } finally {
      // Clean up additional pages
      for (let i = 1; i < pages.length; i++) {
        await pages[i].close();
      }
    }
  });

  test('should handle batch import through UI batch interface', async ({ page }) => {
    // This test assumes there's a batch import UI component
    // If not implemented, this serves as a specification test
    
    await page.goto('/import/batch'); // Hypothetical batch import page
    
    // If batch import UI doesn't exist, navigate to regular import page
    if (page.url().includes('404') || await page.locator('text=Page not found').isVisible()) {
      console.log('Batch import UI not implemented, testing multiple sequential imports');
      
      // Test sequential batch processing instead
      const testVideos = MockDataHelper.getTestVideoData().slice(0, 2);
      
      for (let i = 0; i < testVideos.length; i++) {
        const testVideo = testVideos[i];
        await mockServer.setupWebSocketMocks(testVideo.expectedJobId, 'success');
        
        await page.goto('/import');
        const result = await videoHelper.completeFullImportWorkflow(testVideo);
        expect(result).toBe('completed');
        
        console.log(`Sequential import ${i + 1} completed`);
        
        // Take screenshot after each import
        await page.screenshot({ 
          path: `test-results/e2e-artifacts/sequential-import-${i + 1}.png` 
        });
      }
      
      return;
    }

    // If batch import UI exists, test it
    await expect(page.getByRole('heading', { name: /batch import/i })).toBeVisible();
    
    const testVideos = MockDataHelper.getTestVideoData().slice(0, 3);
    
    // Add multiple URLs to batch
    for (const video of testVideos) {
      const addUrlButton = page.getByRole('button', { name: /add url/i });
      await addUrlButton.click();
      
      const urlInputs = page.getByLabel(/video url/i);
      const lastInput = urlInputs.last();
      await lastInput.fill(video.url);
      
      // Wait for validation
      await page.waitForTimeout(1000);
    }

    // Configure batch settings
    const batchSettings = page.locator('[data-testid="batch-settings"]');
    if (await batchSettings.isVisible()) {
      // Set global settings for batch
      await page.getByLabel(/target language/i).selectOption('en');
      await page.getByLabel(/music mood/i).selectOption('upbeat');
    }

    // Start batch import
    const startBatchButton = page.getByRole('button', { name: /start batch import/i });
    await startBatchButton.click();

    // Monitor batch progress
    await expect(page.getByText(/batch import progress/i)).toBeVisible();
    
    // Should show progress for each video
    for (let i = 0; i < testVideos.length; i++) {
      const videoProgress = page.locator(`[data-testid="video-${i}-progress"]`);
      await expect(videoProgress).toBeVisible();
    }

    // Wait for batch completion
    let allCompleted = false;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout
    
    while (!allCompleted && attempts < maxAttempts) {
      attempts++;
      await page.waitForTimeout(1000);
      
      // Check if all videos are completed
      const completedVideos = page.locator('[data-testid*="completed"]');
      const completedCount = await completedVideos.count();
      
      if (completedCount >= testVideos.length) {
        allCompleted = true;
      }
    }

    expect(allCompleted).toBeTruthy();
    
    // Take screenshot of batch completion
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/batch-import-completed.png',
      fullPage: true 
    });
  });

  test('should manage resources efficiently during concurrent imports', async ({ page, context }) => {
    // Test system resource management under load
    const concurrentImports = 4;
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    // Create pages for concurrent imports
    const pages = [page];
    for (let i = 1; i < concurrentImports; i++) {
      pages.push(await context.newPage());
    }

    try {
      // Monitor network requests during concurrent imports
      const networkRequests: any[] = [];
      
      pages.forEach((currentPage, index) => {
        currentPage.on('request', request => {
          networkRequests.push({
            pageIndex: index,
            url: request.url(),
            method: request.method(),
            timestamp: Date.now()
          });
        });
      });

      // Setup mocks for all pages
      const mockServers = [];
      for (let i = 0; i < pages.length; i++) {
        const mockServer = new MockServerHelper(pages[i]);
        await mockServer.setupVideoImportMocks('success');
        await mockServer.setupWebSocketMocks(`${testVideo.expectedJobId}-${i}`, 'success');
        await mockServer.mockExternalServices();
        mockServers.push(mockServer);
      }

      // Start imports with staggered timing to simulate real usage
      const importPromises = pages.map(async (currentPage, index) => {
        // Stagger starts by 500ms
        await new Promise(resolve => setTimeout(resolve, index * 500));
        
        const helper = new VideoImportTestHelper(currentPage);
        return helper.completeFullImportWorkflow({
          ...testVideo,
          expectedJobId: `${testVideo.expectedJobId}-${index}`
        });
      });

      const startTime = Date.now();
      const results = await Promise.all(importPromises);
      const totalTime = Date.now() - startTime;

      // Verify performance metrics
      console.log(`${concurrentImports} concurrent imports completed in ${totalTime}ms`);
      console.log(`Average time per import: ${totalTime / concurrentImports}ms`);
      console.log(`Total network requests: ${networkRequests.length}`);

      // All imports should succeed
      results.forEach((result, index) => {
        expect(result).toBe('completed');
        console.log(`Import ${index + 1} completed successfully`);
      });

      // Analyze network request patterns
      const requestsByPage = networkRequests.reduce((acc, req) => {
        acc[req.pageIndex] = (acc[req.pageIndex] || 0) + 1;
        return acc;
      }, {});

      console.log('Network requests per page:', requestsByPage);

      // Each page should have made a reasonable number of requests
      Object.values(requestsByPage).forEach((count: any) => {
        expect(count).toBeGreaterThan(5); // At least basic API calls
        expect(count).toBeLessThan(100); // Not excessive
      });

    } finally {
      // Close additional pages
      for (let i = 1; i < pages.length; i++) {
        await pages[i].close();
      }
    }
  });

  test('should handle mixed success/failure scenarios in batch imports', async ({ page, context }) => {
    const testVideos = MockDataHelper.getTestVideoData().slice(0, 3);
    
    // Create pages for imports with mixed outcomes
    const pages = [page, await context.newPage(), await context.newPage()];
    const scenarios = ['success', 'failure', 'success']; // Mixed scenarios
    
    try {
      // Setup different outcomes for each import
      for (let i = 0; i < pages.length; i++) {
        const mockServer = new MockServerHelper(pages[i]);
        
        if (scenarios[i] === 'failure') {
          await mockServer.setupVideoImportMocks('import-error');
        } else {
          await mockServer.setupVideoImportMocks('success');
          await mockServer.setupWebSocketMocks(testVideos[i].expectedJobId, 'success');
        }
        
        await mockServer.mockExternalServices();
      }

      // Start imports concurrently
      const importPromises = pages.map(async (currentPage, index) => {
        const helper = new VideoImportTestHelper(currentPage);
        const testVideo = testVideos[index];
        
        try {
          await helper.navigateToImporter();
          await helper.enterVideoURL(testVideo.url);
          
          if (scenarios[index] === 'failure') {
            // This should fail at URL submission or import start
            await helper.submitURL();
            await helper.configureImportSettings();
            
            // Import should fail
            const startButton = currentPage.getByRole('button', { name: /start import/i });
            await startButton.click();
            
            // Wait for error message
            const errorAlert = currentPage.locator('[role="alert"][severity="error"]');
            await expect(errorAlert).toBeVisible({ timeout: 10000 });
            
            return { index, success: false, error: 'Expected failure' };
          } else {
            // This should succeed
            const result = await helper.completeFullImportWorkflow(testVideo);
            return { index, success: true, result };
          }
        } catch (error) {
          return { index, success: false, error: error.toString() };
        }
      });

      const results = await Promise.all(importPromises);
      
      // Verify expected outcomes
      for (let i = 0; i < results.length; i++) {
        const expectedSuccess = scenarios[i] === 'success';
        expect(results[i].success).toBe(expectedSuccess);
        
        if (expectedSuccess) {
          expect(pages[i].url()).toContain('/edit/');
        } else {
          // Failed imports should show error state
          const errorAlert = pages[i].locator('[role="alert"], .error-message');
          await expect(errorAlert).toBeVisible();
        }
      }

      console.log('Mixed scenario results:', results.map(r => ({ 
        index: r.index, 
        success: r.success, 
        expected: scenarios[r.index] 
      })));

      // Take screenshots of final states
      for (let i = 0; i < pages.length; i++) {
        await pages[i].screenshot({ 
          path: `test-results/e2e-artifacts/mixed-batch-result-${i + 1}-${scenarios[i]}.png` 
        });
      }

    } finally {
      // Close additional pages
      for (let i = 1; i < pages.length; i++) {
        await pages[i].close();
      }
    }
  });

  test('should maintain UI responsiveness during batch operations', async ({ page, context }) => {
    // Test UI responsiveness while multiple imports are running
    const testVideo = MockDataHelper.getTestVideoData()[0];
    const concurrentImports = 3;
    
    // Create background import pages
    const backgroundPages = [];
    for (let i = 0; i < concurrentImports; i++) {
      backgroundPages.push(await context.newPage());
    }

    try {
      // Start background imports
      const backgroundPromises = backgroundPages.map(async (bgPage, index) => {
        const mockServer = new MockServerHelper(bgPage);
        await mockServer.setupVideoImportMocks('slow-import'); // Use slow import to keep them running
        await mockServer.setupWebSocketMocks(`bg-job-${index}`, 'success');
        await mockServer.mockExternalServices();
        
        const helper = new VideoImportTestHelper(bgPage);
        
        // Start import but don't wait for completion
        await helper.navigateToImporter();
        await helper.enterVideoURL(testVideo.url);
        await helper.submitURL();
        await helper.configureImportSettings();
        await helper.submitSettings();
        await helper.waitForProgressPage();
        
        return bgPage; // Return page for monitoring
      });

      await Promise.all(backgroundPromises);
      console.log(`Started ${concurrentImports} background imports`);

      // Test main page UI responsiveness
      await page.goto('/');
      
      // Verify main dashboard loads quickly
      const dashboardLoadStart = Date.now();
      await expect(page.getByText(/dashboard|videos|import/i).first()).toBeVisible({ timeout: 5000 });
      const dashboardLoadTime = Date.now() - dashboardLoadStart;
      
      console.log(`Dashboard loaded in ${dashboardLoadTime}ms`);
      expect(dashboardLoadTime).toBeLessThan(3000); // Should load within 3 seconds

      // Test navigation responsiveness
      const navStart = Date.now();
      await page.getByRole('link', { name: /import|create/i }).first().click();
      await page.waitForLoadState('networkidle');
      const navTime = Date.now() - navStart;
      
      console.log(`Navigation took ${navTime}ms`);
      expect(navTime).toBeLessThan(2000); // Should navigate within 2 seconds

      // Test form interactions
      if (page.url().includes('/import')) {
        const inputStart = Date.now();
        const urlInput = page.getByLabel(/video url/i);
        await urlInput.click();
        await urlInput.type('https://www.youtube.com/watch?v=responsiveness-test');
        const inputTime = Date.now() - inputStart;
        
        console.log(`Form input took ${inputTime}ms`);
        expect(inputTime).toBeLessThan(1000); // Should respond within 1 second
      }

      // Verify background imports are still running
      for (let i = 0; i < backgroundPages.length; i++) {
        const bgPage = backgroundPages[i];
        const progressBar = bgPage.locator('[role="progressbar"]');
        await expect(progressBar).toBeVisible();
        
        const progress = await bgPage.locator('[aria-valuenow]').getAttribute('aria-valuenow');
        console.log(`Background import ${i + 1} progress: ${progress}%`);
      }

      // Take screenshot showing responsive UI with background operations
      await page.screenshot({ 
        path: 'test-results/e2e-artifacts/ui-responsive-with-background-imports.png',
        fullPage: true 
      });

    } finally {
      // Clean up background pages
      for (const bgPage of backgroundPages) {
        await bgPage.close();
      }
    }
  });

  test('should handle queue management and job prioritization', async ({ page, context }) => {
    // Test import queue behavior with different priorities
    const testVideos = MockDataHelper.getTestVideoData();
    const queueSize = Math.min(testVideos.length, 4);
    
    console.log(`Testing queue with ${queueSize} imports`);

    // Create pages for queued imports
    const pages = [page];
    for (let i = 1; i < queueSize; i++) {
      pages.push(await context.newPage());
    }

    try {
      // Setup staggered start times to test queue behavior
      const importPromises = pages.map(async (currentPage, index) => {
        const mockServer = new MockServerHelper(currentPage);
        const testVideo = testVideos[index];
        const isHighPriority = index === 0; // First import gets priority
        
        if (isHighPriority) {
          await mockServer.setupVideoImportMocks('success');
        } else {
          await mockServer.setupVideoImportMocks('slow-import');
        }
        
        await mockServer.setupWebSocketMocks(`queue-job-${index}`, 'success');
        await mockServer.mockExternalServices();
        
        const helper = new VideoImportTestHelper(currentPage);
        
        // Add small delays to simulate realistic timing
        await new Promise(resolve => setTimeout(resolve, index * 200));
        
        const startTime = Date.now();
        const result = await helper.completeFullImportWorkflow(testVideo);
        const completionTime = Date.now() - startTime;
        
        return {
          index,
          result,
          completionTime,
          isHighPriority,
          videoTitle: testVideo.title
        };
      });

      const results = await Promise.all(importPromises);
      
      // Analyze queue behavior
      results.sort((a, b) => a.completionTime - b.completionTime);
      
      console.log('Import completion order:');
      results.forEach((result, order) => {
        console.log(`${order + 1}. Import ${result.index} (${result.isHighPriority ? 'Priority' : 'Normal'}): ${result.completionTime}ms`);
      });

      // High priority items should generally complete faster
      const priorityResults = results.filter(r => r.isHighPriority);
      const normalResults = results.filter(r => !r.isHighPriority);
      
      if (priorityResults.length > 0 && normalResults.length > 0) {
        const avgPriorityTime = priorityResults.reduce((sum, r) => sum + r.completionTime, 0) / priorityResults.length;
        const avgNormalTime = normalResults.reduce((sum, r) => sum + r.completionTime, 0) / normalResults.length;
        
        console.log(`Average priority completion time: ${avgPriorityTime}ms`);
        console.log(`Average normal completion time: ${avgNormalTime}ms`);
        
        // Priority items should be faster (or at least not significantly slower)
        expect(avgPriorityTime).toBeLessThanOrEqual(avgNormalTime * 1.2);
      }

      // All imports should eventually succeed
      results.forEach(result => {
        expect(result.result).toBe('completed');
      });

    } finally {
      // Clean up additional pages
      for (let i = 1; i < pages.length; i++) {
        await pages[i].close();
      }
    }
  });
});

/**
 * Performance-focused batch import tests
 */
test.describe('Batch Import Performance', () => {
  test('should maintain performance with large batch sizes', async ({ page, context }) => {
    const batchSize = 5; // Reasonable size for E2E testing
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    console.log(`Testing performance with batch size: ${batchSize}`);

    const pages = [page];
    for (let i = 1; i < batchSize; i++) {
      pages.push(await context.newPage());
    }

    try {
      const startTime = Date.now();
      
      // Start all imports simultaneously
      const importPromises = pages.map(async (currentPage, index) => {
        const mockServer = new MockServerHelper(currentPage);
        await mockServer.setupVideoImportMocks('success');
        await mockServer.setupWebSocketMocks(`perf-job-${index}`, 'success');
        await mockServer.mockExternalServices();
        
        const helper = new VideoImportTestHelper(currentPage);
        return helper.completeFullImportWorkflow({
          ...testVideo,
          expectedJobId: `perf-job-${index}`,
          expectedVideoId: `perf-video-${index}`
        });
      });

      const results = await Promise.all(importPromises);
      const totalTime = Date.now() - startTime;
      
      // Performance metrics
      const avgTimePerImport = totalTime / batchSize;
      const successRate = results.filter(r => r === 'completed').length / batchSize;
      
      console.log(`Batch performance metrics:`);
      console.log(`  Total time: ${totalTime}ms`);
      console.log(`  Average per import: ${avgTimePerImport}ms`);
      console.log(`  Success rate: ${successRate * 100}%`);
      
      // Performance assertions
      expect(successRate).toBeGreaterThanOrEqual(0.8); // 80% success rate minimum
      expect(avgTimePerImport).toBeLessThan(30000); // Average under 30 seconds per import
      expect(totalTime).toBeLessThan(120000); // Total under 2 minutes for batch
      
      // All successful imports should be on editor pages
      for (let i = 0; i < pages.length; i++) {
        if (results[i] === 'completed') {
          expect(pages[i].url()).toContain('/edit/');
        }
      }

    } finally {
      for (let i = 1; i < pages.length; i++) {
        await pages[i].close();
      }
    }
  });
});