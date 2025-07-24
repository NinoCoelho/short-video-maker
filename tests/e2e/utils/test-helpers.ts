import { Page, expect, Locator } from '@playwright/test';
import { WebSocketEventType, ImportJobStatus } from '../../../src/types/import';

/**
 * Test helper utilities for E2E video import tests
 * 
 * These helpers provide reusable functionality for:
 * - UI interactions
 * - WebSocket event handling
 * - Mock data management
 * - Test assertions
 */

export interface VideoImportTestData {
  url: string;
  title: string;
  duration: number;
  platform: string;
  expectedJobId: string;
  expectedVideoId: string;
}

export interface ImportSettings {
  targetLanguage?: string;
  music?: string;
  orientation?: string;
  autoHighlights?: boolean;
  maxSegmentDuration?: number;
  minSegmentDuration?: number;
}

export class VideoImportTestHelper {
  constructor(private page: Page) {}

  /**
   * Navigate to the video importer page
   */
  async navigateToImporter() {
    await this.page.goto('/import');
    await this.page.waitForLoadState('networkidle');
    
    // Verify we're on the right page
    await expect(this.page.getByRole('heading', { name: /import video/i })).toBeVisible();
  }

  /**
   * Fill in the URL input field
   */
  async enterVideoURL(url: string) {
    const urlInput = this.page.getByLabel(/video url/i);
    await urlInput.click();
    await urlInput.fill(url);
    
    // Wait for URL validation
    await this.waitForURLValidation();
  }

  /**
   * Wait for URL validation to complete
   */
  async waitForURLValidation() {
    // Wait for either success or error icon to appear
    const validationIndicator = this.page.locator('[data-testid*="validation"], .MuiSvgIcon-root[color="success"], .MuiSvgIcon-root[color="error"]').first();
    await validationIndicator.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Submit the URL form and proceed to settings
   */
  async submitURL() {
    const continueButton = this.page.getByRole('button', { name: /continue/i });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    
    // Wait for settings page to load
    await this.waitForSettingsPage();
  }

  /**
   * Wait for the settings page to load
   */
  async waitForSettingsPage() {
    await expect(this.page.getByText(/configure settings/i)).toBeVisible();
  }

  /**
   * Configure import settings
   */
  async configureImportSettings(settings: ImportSettings = {}) {
    // Set target language
    if (settings.targetLanguage) {
      const languageSelect = this.page.getByLabel(/target language/i);
      await languageSelect.click();
      await this.page.getByRole('option', { name: settings.targetLanguage }).click();
    }

    // Set music mood
    if (settings.music) {
      const musicSelect = this.page.getByLabel(/music mood/i);
      await musicSelect.click();
      await this.page.getByRole('option', { name: settings.music }).click();
    }

    // Set orientation
    if (settings.orientation) {
      const orientationRadio = this.page.getByRole('radio', { name: settings.orientation });
      await orientationRadio.click();
    }

    // Toggle auto highlights
    if (settings.autoHighlights !== undefined) {
      const highlightsToggle = this.page.getByRole('checkbox', { name: /auto highlights/i });
      if (settings.autoHighlights) {
        await highlightsToggle.check();
      } else {
        await highlightsToggle.uncheck();
      }
    }

    // Set duration limits if provided
    if (settings.maxSegmentDuration) {
      const maxDurationInput = this.page.getByLabel(/max.*duration/i);
      await maxDurationInput.fill(settings.maxSegmentDuration.toString());
    }

    if (settings.minSegmentDuration) {
      const minDurationInput = this.page.getByLabel(/min.*duration/i);
      await minDurationInput.fill(settings.minSegmentDuration.toString());
    }
  }

  /**
   * Submit the settings and start the import
   */
  async submitSettings() {
    const startImportButton = this.page.getByRole('button', { name: /start import/i });
    await expect(startImportButton).toBeEnabled();
    await startImportButton.click();
    
    // Wait for progress page to load
    await this.waitForProgressPage();
  }

  /**
   * Wait for the import progress page to load
   */
  async waitForProgressPage() {
    await expect(this.page.getByText(/import progress/i)).toBeVisible();
    
    // Verify progress bar is present
    await expect(this.page.locator('[role="progressbar"]')).toBeVisible();
  }

  /**
   * Monitor import progress and wait for completion
   */
  async waitForImportCompletion(timeoutMs: number = 120000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      // Check if we've been redirected to the video editor (success)
      if (this.page.url().includes('/edit/')) {
        return 'completed';
      }
      
      // Check for error state
      const errorAlert = this.page.locator('[role="alert"][severity="error"]');
      if (await errorAlert.isVisible()) {
        const errorText = await errorAlert.textContent();
        throw new Error(`Import failed: ${errorText}`);
      }
      
      // Wait a bit before checking again
      await this.page.waitForTimeout(1000);
    }
    
    throw new Error(`Import did not complete within ${timeoutMs}ms`);
  }

  /**
   * Get current progress percentage
   */
  async getCurrentProgress(): Promise<number> {
    const progressBar = this.page.locator('[role="progressbar"]');
    const ariaValueNow = await progressBar.getAttribute('aria-valuenow');
    return ariaValueNow ? parseInt(ariaValueNow, 10) : 0;
  }

  /**
   * Get current step text
   */
  async getCurrentStep(): Promise<string> {
    const stepText = this.page.locator('[data-testid="current-step"], .import-current-step');
    return await stepText.textContent() || '';
  }

  /**
   * Verify WebSocket connection status
   */
  async verifyWebSocketConnection() {
    // Check for WebSocket connection indicator
    const connectionIndicator = this.page.locator('[data-testid="websocket-status"], .websocket-connected');
    
    // Should not show disconnection warning
    const disconnectWarning = this.page.locator('[role="alert"]:has-text("WebSocket connection lost")');
    await expect(disconnectWarning).not.toBeVisible();
  }

  /**
   * Complete the full import workflow
   */
  async completeFullImportWorkflow(
    testData: VideoImportTestData, 
    settings: ImportSettings = {}
  ) {
    // Navigate to importer
    await this.navigateToImporter();
    
    // Enter URL
    await this.enterVideoURL(testData.url);
    await this.submitURL();
    
    // Configure settings
    await this.configureImportSettings(settings);
    await this.submitSettings();
    
    // Verify WebSocket connection
    await this.verifyWebSocketConnection();
    
    // Wait for completion
    const result = await this.waitForImportCompletion();
    
    // Verify we ended up in the video editor
    expect(this.page.url()).toContain('/edit/');
    
    return result;
  }
}

/**
 * WebSocket event monitoring helper
 */
export class WebSocketTestHelper {
  private events: any[] = [];
  private page: Page;

  constructor(page: Page) {
    this.page = page;
    this.setupWebSocketMonitoring();
  }

  private async setupWebSocketMonitoring() {
    // Inject WebSocket monitoring script into the page
    await this.page.addInitScript(() => {
      // Store original WebSocket
      const OriginalWebSocket = window.WebSocket;
      const events: any[] = [];
      
      // Override WebSocket constructor
      (window as any).WebSocket = function(url: string, protocols?: string | string[]) {
        const ws = new OriginalWebSocket(url, protocols);
        
        // Monitor WebSocket events
        ws.addEventListener('open', (event) => {
          events.push({ type: 'open', timestamp: Date.now(), data: null });
        });
        
        ws.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            events.push({ type: 'message', timestamp: Date.now(), data });
          } catch (e) {
            events.push({ type: 'message', timestamp: Date.now(), data: event.data });
          }
        });
        
        ws.addEventListener('close', (event) => {
          events.push({ type: 'close', timestamp: Date.now(), data: { code: event.code, reason: event.reason } });
        });
        
        ws.addEventListener('error', (event) => {
          events.push({ type: 'error', timestamp: Date.now(), data: event });
        });
        
        return ws;
      };
      
      // Copy static properties
      (window as any).WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
      (window as any).WebSocket.OPEN = OriginalWebSocket.OPEN;
      (window as any).WebSocket.CLOSING = OriginalWebSocket.CLOSING;
      (window as any).WebSocket.CLOSED = OriginalWebSocket.CLOSED;
      
      // Make events accessible
      (window as any).getWebSocketEvents = () => events;
      (window as any).clearWebSocketEvents = () => { events.length = 0; };
    });
  }

  /**
   * Get all captured WebSocket events
   */
  async getEvents(): Promise<any[]> {
    return await this.page.evaluate(() => (window as any).getWebSocketEvents() || []);
  }

  /**
   * Clear captured events
   */
  async clearEvents() {
    await this.page.evaluate(() => (window as any).clearWebSocketEvents?.());
  }

  /**
   * Wait for a specific WebSocket event
   */
  async waitForEvent(eventType: string, timeout: number = 30000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const events = await this.getEvents();
      const event = events.find(e => 
        e.type === 'message' && 
        e.data && 
        typeof e.data === 'object' && 
        e.data.event === eventType
      );
      
      if (event) {
        return event;
      }
      
      await this.page.waitForTimeout(100);
    }
    
    throw new Error(`WebSocket event '${eventType}' not received within ${timeout}ms`);
  }

  /**
   * Wait for import progress events
   */
  async waitForImportProgress(jobId: string, timeout: number = 60000): Promise<any[]> {
    const progressEvents: any[] = [];
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const events = await this.getEvents();
      const newProgressEvents = events.filter(e => 
        e.type === 'message' && 
        e.data && 
        e.data.jobId === jobId &&
        (e.data.event === 'import-progress' || e.data.event === 'import-complete') &&
        !progressEvents.find(existing => existing.timestamp === e.timestamp)
      );
      
      progressEvents.push(...newProgressEvents);
      
      // Check if we got completion event
      const completionEvent = progressEvents.find(e => 
        e.data.event === 'import-complete' || e.data.status === 'completed'
      );
      
      if (completionEvent) {
        return progressEvents;
      }
      
      await this.page.waitForTimeout(100);
    }
    
    throw new Error(`Import progress events for job '${jobId}' not completed within ${timeout}ms`);
  }
}

/**
 * Mock data helper
 */
export class MockDataHelper {
  static getTestVideoData(): VideoImportTestData[] {
    return [
      {
        url: 'https://www.youtube.com/watch?v=test1234567890',
        title: 'Test Video 1 - Short Content',
        duration: 120,
        platform: 'YouTube',
        expectedJobId: 'test-job-123',
        expectedVideoId: 'test-video-123'
      },
      {
        url: 'https://www.youtube.com/watch?v=test0987654321',
        title: 'Test Video 2 - Long Content', 
        duration: 600,
        platform: 'YouTube',
        expectedJobId: 'test-job-456',
        expectedVideoId: 'test-video-456'
      },
      {
        url: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
        title: 'Direct MP4 Video',
        duration: 30,
        platform: 'Direct',
        expectedJobId: 'test-job-789',
        expectedVideoId: 'test-video-789'
      }
    ];
  }

  static getTestSettings(): ImportSettings[] {
    return [
      {
        targetLanguage: 'en',
        music: 'upbeat',
        orientation: 'portrait',
        autoHighlights: true,
        maxSegmentDuration: 60,
        minSegmentDuration: 15
      },
      {
        targetLanguage: 'pt',
        music: 'chill',
        orientation: 'landscape',
        autoHighlights: false,
        maxSegmentDuration: 90,
        minSegmentDuration: 30
      }
    ];
  }
}