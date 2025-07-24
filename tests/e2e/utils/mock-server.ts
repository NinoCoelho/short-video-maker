import { Page, Route } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

/**
 * Mock server helper for E2E tests
 * 
 * This helper intercepts network requests and provides mock responses
 * to ensure tests are reliable and don't depend on external services.
 */

export interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: any;
  delay?: number;
}

export interface MockScenario {
  name: string;
  routes: Record<string, MockResponse>;
}

export class MockServerHelper {
  private page: Page;
  private activeRoutes: Map<string, Route> = new Map();

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Setup mock responses for video import API endpoints
   */
  async setupVideoImportMocks(scenario: 'success' | 'validation-error' | 'import-error' | 'slow-import' = 'success') {
    const scenarios = await this.loadMockScenarios();
    const mockScenario = scenarios[scenario];

    if (!mockScenario) {
      throw new Error(`Mock scenario '${scenario}' not found`);
    }

    // Apply all route mocks for this scenario
    for (const [pattern, response] of Object.entries(mockScenario.routes)) {
      await this.mockRoute(pattern, response);
    }
  }

  /**
   * Mock a specific API route
   */
  async mockRoute(pattern: string, response: MockResponse) {
    await this.page.route(pattern, async (route) => {
      // Store route for cleanup
      this.activeRoutes.set(pattern, route);

      // Add artificial delay if specified
      if (response.delay) {
        await new Promise(resolve => setTimeout(resolve, response.delay));
      }

      // Fulfill with mock response
      await route.fulfill({
        status: response.status || 200,
        headers: response.headers || { 'Content-Type': 'application/json' },
        body: typeof response.body === 'string' ? response.body : JSON.stringify(response.body)
      });
    });
  }

  /**
   * Setup WebSocket mocking for real-time updates
   */
  async setupWebSocketMocks(jobId: string, scenario: 'success' | 'failure' | 'timeout' = 'success') {
    // Inject WebSocket mock into the page
    await this.page.addInitScript((mockData) => {
      // Store the original WebSocket
      const OriginalWebSocket = window.WebSocket;
      
      // Override WebSocket constructor
      (window as any).WebSocket = function(url: string, protocols?: string | string[]) {
        // Create mock WebSocket-like object
        const mockWS = {
          readyState: 1, // OPEN
          url,
          protocol: '',
          extensions: '',
          onopen: null as any,
          onmessage: null as any,
          onclose: null as any,
          onerror: null as any,
          
          send: function(data: string) {
            console.log('Mock WebSocket send:', data);
          },
          
          close: function(code?: number, reason?: string) {
            if (this.onclose) {
              this.onclose({ code: code || 1000, reason: reason || '', wasClean: true });
            }
          },
          
          addEventListener: function(type: string, listener: any) {
            this[`on${type}`] = listener;
          },
          
          removeEventListener: function(type: string, listener: any) {
            if (this[`on${type}`] === listener) {
              this[`on${type}`] = null;
            }
          }
        };

        // Simulate connection opening
        setTimeout(() => {
          if (mockWS.onopen) {
            mockWS.onopen({ type: 'open' });
          }
        }, 100);

        // Send mock progress events based on scenario
        const events = mockData.events[mockData.scenario] || mockData.events.success;
        events.forEach((event: any, index: number) => {
          setTimeout(() => {
            if (mockWS.onmessage) {
              mockWS.onmessage({
                data: JSON.stringify({
                  ...event,
                  jobId: mockData.jobId
                }),
                type: 'message'
              });
            }
          }, (index + 1) * 2000); // Send events every 2 seconds
        });

        return mockWS as any;
      };

      // Copy static properties
      (window as any).WebSocket.CONNECTING = 0;
      (window as any).WebSocket.OPEN = 1;
      (window as any).WebSocket.CLOSING = 2;
      (window as any).WebSocket.CLOSED = 3;
    }, {
      jobId,
      scenario,
      events: await this.loadWebSocketEvents()
    });
  }

  /**
   * Mock file upload endpoints
   */
  async mockFileUploads() {
    await this.page.route('**/api/upload/**', async (route) => {
      const request = route.request();
      const postData = request.postDataBuffer();
      
      // Mock successful file upload
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          fileId: 'mock-file-123',
          url: '/mock-uploads/test-file.mp4',
          size: postData?.length || 1000,
          type: 'video/mp4'
        })
      });
    });
  }

  /**
   * Mock external video service APIs
   */
  async mockExternalServices() {
    // Mock YouTube API
    await this.page.route('**/youtube.com/**', async (route) => {
      const url = route.request().url();
      
      if (url.includes('oembed')) {
        // Mock YouTube oEmbed response
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Mock YouTube Video',
            author_name: 'Mock Channel',
            thumbnail_url: 'https://img.youtube.com/vi/mock123/maxresdefault.jpg',
            html: '<iframe src="mock-embed"></iframe>'
          })
        });
      } else {
        // Mock video download
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'video/mp4' },
          body: Buffer.from('mock-video-data')
        });
      }
    });

    // Mock direct video URLs
    await this.page.route('**/*.mp4', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 
          'Content-Type': 'video/mp4',
          'Content-Length': '1000000'
        },
        body: Buffer.from('mock-video-content')
      });
    });
  }

  /**
   * Clear all active route mocks
   */
  async clearAllMocks() {
    for (const [pattern] of this.activeRoutes) {
      await this.page.unroute(pattern);
    }
    this.activeRoutes.clear();
  }

  /**
   * Load mock scenarios from fixtures
   */
  private async loadMockScenarios(): Promise<Record<string, { routes: Record<string, MockResponse> }>> {
    return {
      'success': {
        routes: {
          '**/api/import/validate-url': {
            status: 200,
            body: {
              isValid: true,
              platform: 'YouTube',
              metadata: {
                title: 'Test Video',
                duration: 120
              }
            }
          },
          '**/api/import/video': {
            status: 200,
            body: {
              success: true,
              jobId: 'test-job-123',
              message: 'Import started successfully'
            }
          },
          '**/api/import/status/**': {
            status: 200,
            body: {
              jobId: 'test-job-123',
              status: 'processing',
              progress: 50,
              currentStep: 'Processing video'
            }
          }
        }
      },
      'validation-error': {
        routes: {
          '**/api/import/validate-url': {
            status: 400,
            body: {
              isValid: false,
              error: 'Invalid URL format'
            }
          }
        }
      },
      'import-error': {
        routes: {
          '**/api/import/validate-url': {
            status: 200,
            body: {
              isValid: true,
              platform: 'YouTube'
            }
          },
          '**/api/import/video': {
            status: 500,
            body: {
              error: 'Failed to start import process'
            }
          }
        }
      },
      'slow-import': {
        routes: {
          '**/api/import/validate-url': {
            status: 200,
            delay: 3000,
            body: {
              isValid: true,
              platform: 'YouTube'
            }
          },
          '**/api/import/video': {
            status: 200,
            delay: 5000,
            body: {
              success: true,
              jobId: 'test-job-slow',
              message: 'Import started successfully'
            }
          }
        }
      }
    };
  }

  /**
   * Load WebSocket mock events
   */
  private async loadWebSocketEvents(): Promise<Record<string, any[]>> {
    return {
      'success': [
        {
          event: 'import-progress',
          status: 'processing',
          progress: 25,
          currentStep: 'Downloading video'
        },
        {
          event: 'import-progress',
          status: 'processing', 
          progress: 50,
          currentStep: 'Transcribing audio'
        },
        {
          event: 'import-progress',
          status: 'processing',
          progress: 75,
          currentStep: 'Detecting scenes'
        },
        {
          event: 'import-complete',
          status: 'completed',
          progress: 100,
          videoId: 'test-video-123'
        }
      ],
      'failure': [
        {
          event: 'import-progress',
          status: 'processing',
          progress: 25,
          currentStep: 'Downloading video'
        },
        {
          event: 'import-error',
          status: 'failed',
          progress: 25,
          error: 'Failed to download video'
        }
      ],
      'timeout': [
        {
          event: 'import-progress',
          status: 'processing',
          progress: 10,
          currentStep: 'Starting import'
        }
        // No further events to simulate timeout
      ]
    };
  }

  /**
   * Enable request logging for debugging
   */
  async enableRequestLogging() {
    this.page.on('request', request => {
      console.log('Request:', request.method(), request.url());
    });
    
    this.page.on('response', response => {
      console.log('Response:', response.status(), response.url());
    });
  }
}