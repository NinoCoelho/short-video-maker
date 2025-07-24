import { test, expect } from '@playwright/test';
import { VideoImportTestHelper, WebSocketTestHelper, MockDataHelper } from './utils/test-helpers';
import { MockServerHelper } from './utils/mock-server';

/**
 * E2E tests for WebSocket updates during video import
 * 
 * These tests verify:
 * - WebSocket connection establishment and maintenance
 * - Real-time progress updates are received and displayed
 * - Import status changes are communicated via WebSocket
 * - Connection recovery and error handling
 * - UI updates in response to WebSocket messages
 */

test.describe('WebSocket Real-time Updates', () => {
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

  test('should establish WebSocket connection on import page load', async ({ page }) => {
    await videoHelper.navigateToImporter();
    
    // Wait a moment for WebSocket connection
    await page.waitForTimeout(2000);
    
    // Check WebSocket events
    const events = await wsHelper.getEvents();
    
    // Should have connection open event
    const openEvent = events.find(e => e.type === 'open');
    expect(openEvent).toBeTruthy();
    
    console.log(`WebSocket events captured: ${events.length}`);
    console.log('Events:', events.map(e => ({ type: e.type, timestamp: e.timestamp })));
    
    // Verify no connection warnings are shown
    const connectionWarning = page.locator('[role="alert"]:has-text("WebSocket connection lost")');
    await expect(connectionWarning).not.toBeVisible();
  });

  test('should receive and display import progress events', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    const testSettings = MockDataHelper.getTestSettings()[0];

    // Setup WebSocket mocking with specific progress events
    await mockServer.setupWebSocketMocks(testVideo.expectedJobId, 'success');

    // Start the import workflow
    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.configureImportSettings(testSettings);
    await videoHelper.submitSettings();

    // Wait for progress page
    await videoHelper.waitForProgressPage();

    // Clear existing events to focus on import events
    await wsHelper.clearEvents();

    // Monitor WebSocket events for import progress
    const progressEvents: any[] = [];
    let lastProgress = -1;
    let lastStep = '';
    
    // Poll for progress updates
    const progressMonitor = setInterval(async () => {
      try {
        const events = await wsHelper.getEvents();
        const newProgressEvents = events.filter(e => 
          e.type === 'message' && 
          e.data?.jobId === testVideo.expectedJobId &&
          (e.data?.event === 'import-progress' || e.data?.event === 'import-complete')
        );
        
        // Add new events
        newProgressEvents.forEach(event => {
          if (!progressEvents.find(existing => existing.timestamp === event.timestamp)) {
            progressEvents.push(event);
            console.log(`WebSocket event: ${event.data?.event} - ${event.data?.progress}% - ${event.data?.currentStep}`);
          }
        });

        // Check UI updates
        const currentProgress = await videoHelper.getCurrentProgress();
        const currentStep = await videoHelper.getCurrentStep();
        
        if (currentProgress > lastProgress) {
          console.log(`UI Progress updated: ${lastProgress}% -> ${currentProgress}%`);
          lastProgress = currentProgress;
        }
        
        if (currentStep && currentStep !== lastStep) {
          console.log(`UI Step updated: "${lastStep}" -> "${currentStep}"`);
          lastStep = currentStep;
        }
        
      } catch (error) {
        console.log('Progress monitoring error:', error);
      }
    }, 500);

    try {
      // Wait for import completion or timeout
      await videoHelper.waitForImportCompletion(60000);
    } finally {
      clearInterval(progressMonitor);
    }

    // Verify we received progress events
    expect(progressEvents.length).toBeGreaterThan(0);
    
    // Verify progress events are in correct order
    for (let i = 1; i < progressEvents.length; i++) {
      const prevProgress = progressEvents[i - 1].data?.progress || 0;
      const currentProgress = progressEvents[i].data?.progress || 0;
      expect(currentProgress).toBeGreaterThanOrEqual(prevProgress);
    }

    // Verify final completion event
    const completionEvent = progressEvents.find(e => 
      e.data?.event === 'import-complete' || e.data?.status === 'completed'
    );
    expect(completionEvent).toBeTruthy();
    
    // Take screenshot of final state
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/websocket-progress-complete.png',
      fullPage: true 
    });
  });

  test('should handle WebSocket connection errors gracefully', async ({ page }) => {
    // Override WebSocket to simulate connection failure
    await page.addInitScript(() => {
      const OriginalWebSocket = window.WebSocket;
      
      (window as any).WebSocket = function(url: string, protocols?: string | string[]) {
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
          
          removeEventListener: function(type: string, listener: any) {}
        };

        // Simulate connection error
        setTimeout(() => {
          if (mockWS.onerror) {
            mockWS.onerror({ type: 'error', message: 'Connection failed' });
          }
          if (mockWS.onclose) {
            mockWS.onclose({ code: 1006, reason: 'Connection failed', wasClean: false });
          }
        }, 100);

        return mockWS as any;
      };
    });

    const testVideo = MockDataHelper.getTestVideoData()[0];
    await mockServer.setupVideoImportMocks('success');

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.configureImportSettings();
    await videoHelper.submitSettings();

    // Should show WebSocket connection warning
    const connectionWarning = page.locator('[role="alert"]:has-text("WebSocket connection lost")');
    await expect(connectionWarning).toBeVisible({ timeout: 10000 });
    
    // UI should still be functional despite WebSocket failure
    await expect(page.getByText(/import progress/i)).toBeVisible();
    
    // Take screenshot of error state
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/websocket-connection-error.png' 
    });
  });

  test('should handle WebSocket reconnection', async ({ page }) => {
    let connectionAttempts = 0;
    
    // Mock WebSocket with reconnection logic
    await page.addInitScript(() => {
      const OriginalWebSocket = window.WebSocket;
      let isFirstConnection = true;
      
      (window as any).WebSocket = function(url: string, protocols?: string | string[]) {
        const mockWS = {
          readyState: isFirstConnection ? 3 : 1, // First fails, second succeeds
          url,
          onopen: null as any,
          onmessage: null as any,
          onclose: null as any,
          onerror: null as any,
          
          send: function() {
            if (isFirstConnection) {
              throw new Error('Initial connection failed');
            }
          },
          
          close: function() {},
          
          addEventListener: function(type: string, listener: any) {
            this[`on${type}`] = listener;
          },
          
          removeEventListener: function() {}
        };

        if (isFirstConnection) {
          // Fail first connection
          setTimeout(() => {
            if (mockWS.onerror) {
              mockWS.onerror({ type: 'error' });
            }
            if (mockWS.onclose) {
              mockWS.onclose({ code: 1006, reason: 'Initial failure', wasClean: false });
            }
          }, 100);
          
          isFirstConnection = false;
        } else {
          // Succeed on reconnection
          setTimeout(() => {
            if (mockWS.onopen) {
              mockWS.onopen({ type: 'open' });
            }
          }, 500);
        }

        return mockWS as any;
      };
    });

    await videoHelper.navigateToImporter();
    
    // Should initially show connection warning
    const connectionWarning = page.locator('[role="alert"]:has-text("WebSocket connection lost")');
    await expect(connectionWarning).toBeVisible({ timeout: 5000 });
    
    // Wait for reconnection (simulated)
    await page.waitForTimeout(2000);
    
    // Warning should disappear after reconnection
    await expect(connectionWarning).not.toBeVisible({ timeout: 5000 });
  });

  test('should show real-time status updates during import', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    const testSettings = MockDataHelper.getTestSettings()[0];

    // Custom WebSocket mock with detailed status updates
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

        // Open connection
        setTimeout(() => {
          if (mockWS.onopen) {
            mockWS.onopen({ type: 'open' });
          }
        }, 100);

        // Send detailed progress updates
        const statusUpdates = [
          { step: 'Validating URL', progress: 5, details: 'Checking video accessibility' },
          { step: 'Downloading video', progress: 15, details: 'Fetching video from source' },
          { step: 'Extracting audio', progress: 25, details: 'Converting video to audio format' },
          { step: 'Transcribing speech', progress: 40, details: 'Processing audio with AI' },
          { step: 'Detecting scenes', progress: 60, details: 'Analyzing video content' },
          { step: 'Generating highlights', progress: 80, details: 'Creating short clips' },
          { step: 'Finalizing import', progress: 95, details: 'Preparing for editor' },
          { step: 'Complete', progress: 100, details: 'Import successful' }
        ];

        statusUpdates.forEach((update, index) => {
          setTimeout(() => {
            if (mockWS.onmessage) {
              mockWS.onmessage({
                data: JSON.stringify({
                  event: index < statusUpdates.length - 1 ? 'import-progress' : 'import-complete',
                  jobId,
                  status: index < statusUpdates.length - 1 ? 'processing' : 'completed',
                  progress: update.progress,
                  currentStep: update.step,
                  details: update.details,
                  videoId: index === statusUpdates.length - 1 ? 'test-video-123' : undefined
                })
              });
            }
          }, (index + 1) * 2000);
        });

        return mockWS as any;
      };
    }, testVideo.expectedJobId);

    await mockServer.setupVideoImportMocks('success');

    // Execute import workflow
    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.configureImportSettings(testSettings);
    await videoHelper.submitSettings();

    await videoHelper.waitForProgressPage();

    // Monitor detailed status updates
    const statusUpdates: string[] = [];
    const progressValues: number[] = [];

    const monitor = setInterval(async () => {
      try {
        const currentStep = await videoHelper.getCurrentStep();
        const currentProgress = await videoHelper.getCurrentProgress();
        
        if (currentStep && !statusUpdates.includes(currentStep)) {
          statusUpdates.push(currentStep);
          console.log(`Status: ${currentStep}`);
          
          // Take screenshot of each major step
          await page.screenshot({ 
            path: `test-results/e2e-artifacts/status-${currentStep.replace(/[^a-zA-Z0-9]/g, '-')}.png` 
          });
        }
        
        if (currentProgress > 0 && !progressValues.includes(currentProgress)) {
          progressValues.push(currentProgress);
          console.log(`Progress: ${currentProgress}%`);
        }
      } catch (error) {
        // Status elements might not be available
      }
    }, 500);

    try {
      await videoHelper.waitForImportCompletion(30000);
    } finally {
      clearInterval(monitor);
    }

    // Verify we received multiple status updates
    expect(statusUpdates.length).toBeGreaterThan(3);
    expect(progressValues.length).toBeGreaterThan(5);
    
    // Verify progress values increased
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }

    console.log('Status updates received:', statusUpdates);
    console.log('Progress values:', progressValues);
  });

  test('should handle multiple concurrent WebSocket connections', async ({ page, context }) => {
    const testVideos = MockDataHelper.getTestVideoData().slice(0, 2);
    
    // Create additional page for concurrent test
    const page2 = await context.newPage();
    
    const helpers = [
      { page, helper: new VideoImportTestHelper(page), ws: new WebSocketTestHelper(page) },
      { page: page2, helper: new VideoImportTestHelper(page2), ws: new WebSocketTestHelper(page2) }
    ];

    try {
      // Setup mocks for both pages
      for (let i = 0; i < helpers.length; i++) {
        const { page: currentPage } = helpers[i];
        const mockServer = new MockServerHelper(currentPage);
        await mockServer.setupVideoImportMocks('success');
        await mockServer.setupWebSocketMocks(testVideos[i].expectedJobId, 'success');
        await mockServer.mockExternalServices();
      }

      // Start imports concurrently
      const importPromises = helpers.map(async ({ helper }, index) => {
        await helper.navigateToImporter();
        await helper.enterVideoURL(testVideos[index].url);
        await helper.submitURL();
        await helper.configureImportSettings();
        await helper.submitSettings();
        await helper.waitForProgressPage();
        
        return helper.waitForImportCompletion(45000);
      });

      // Wait for both imports
      const results = await Promise.all(importPromises);
      
      // Verify both completed successfully
      results.forEach(result => {
        expect(result).toBe('completed');
      });

      // Verify both pages ended up in editor
      for (const { page: currentPage } of helpers) {
        expect(currentPage.url()).toContain('/edit/');
      }

      // Check WebSocket events for both pages
      for (let i = 0; i < helpers.length; i++) {
        const { ws } = helpers[i];
        const events = await ws.getEvents();
        const relevantEvents = events.filter(e => 
          e.type === 'message' && e.data?.jobId === testVideos[i].expectedJobId
        );
        
        expect(relevantEvents.length).toBeGreaterThan(0);
        console.log(`Page ${i + 1} received ${relevantEvents.length} WebSocket events`);
      }

    } finally {
      await page2.close();
    }
  });

  test('should maintain WebSocket connection during page interactions', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];

    await videoHelper.navigateToImporter();
    
    // Let WebSocket connection establish
    await page.waitForTimeout(1000);
    
    // Navigate through the form while monitoring connection
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.waitForSettingsPage();
    
    // Check connection is still active
    let events = await wsHelper.getEvents();
    const openEvents = events.filter(e => e.type === 'open');
    expect(openEvents.length).toBeGreaterThan(0);
    
    // No close events should have occurred
    const closeEvents = events.filter(e => e.type === 'close');
    expect(closeEvents.length).toBe(0);
    
    // Continue with settings
    await videoHelper.configureImportSettings();
    
    // Connection should still be active
    events = await wsHelper.getEvents();
    const newCloseEvents = events.filter(e => e.type === 'close');
    expect(newCloseEvents.length).toBe(0);
    
    console.log(`WebSocket remained connected through ${events.length} total events`);
  });

  test('should handle WebSocket message parsing errors', async ({ page }) => {
    // Mock WebSocket with malformed messages
    await page.addInitScript(() => {
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

        // Send malformed JSON messages
        setTimeout(() => {
          if (mockWS.onmessage) {
            mockWS.onmessage({ data: 'invalid-json-{' });
            mockWS.onmessage({ data: '{"incomplete": json' });
            mockWS.onmessage({ data: 'null' });
            // Finally send valid message
            mockWS.onmessage({ 
              data: JSON.stringify({ 
                event: 'import-progress', 
                jobId: 'test-123', 
                progress: 50 
              }) 
            });
          }
        }, 1000);

        return mockWS as any;
      };
    });

    await videoHelper.navigateToImporter();
    
    // Wait for WebSocket messages
    await page.waitForTimeout(2000);
    
    // Application should handle malformed messages gracefully
    // No JavaScript errors should crash the page
    const events = await wsHelper.getEvents();
    
    // Should have received at least the open event and some messages
    expect(events.length).toBeGreaterThan(0);
    
    // Page should still be functional
    await expect(page.getByRole('heading', { name: /import video/i })).toBeVisible();
    
    console.log('WebSocket handled malformed messages gracefully');
  });
});