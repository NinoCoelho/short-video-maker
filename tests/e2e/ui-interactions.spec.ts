import { test, expect } from '@playwright/test';
import { VideoImportTestHelper, MockDataHelper } from './utils/test-helpers';
import { MockServerHelper } from './utils/mock-server';

/**
 * E2E tests for UI interactions during video import
 * 
 * These tests focus on:
 * - URL input validation and user feedback
 * - Settings form interactions and validation
 * - Progress monitoring and user experience
 * - Navigation between steps
 * - Form state management
 * - Responsive design and mobile interaction
 */

test.describe('Video Import UI Interactions', () => {
  let videoHelper: VideoImportTestHelper;
  let mockServer: MockServerHelper;

  test.beforeEach(async ({ page }) => {
    videoHelper = new VideoImportTestHelper(page);
    mockServer = new MockServerHelper(page);
    
    // Setup basic mocking
    await mockServer.setupVideoImportMocks('success');
    await mockServer.mockExternalServices();
  });

  test.afterEach(async ({ page }) => {
    await mockServer.clearAllMocks();
  });

  test('should provide real-time URL validation feedback', async ({ page }) => {
    await videoHelper.navigateToImporter();

    const urlInput = page.getByLabel(/video url/i);
    
    // Test invalid URL feedback
    await urlInput.fill('not-a-valid-url');
    
    // Should show error state
    await expect(page.locator('svg[color="error"]')).toBeVisible({ timeout: 3000 });
    
    // Continue button should be disabled
    const continueButton = page.getByRole('button', { name: /continue/i });
    await expect(continueButton).toBeDisabled();

    // Clear and enter valid YouTube URL
    await urlInput.clear();
    await urlInput.fill('https://www.youtube.com/watch?v=test123');
    
    // Should show success state
    await expect(page.locator('svg[color="success"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/valid youtube url detected/i)).toBeVisible();
    
    // Continue button should be enabled
    await expect(continueButton).toBeEnabled();

    // Test direct video URL
    await urlInput.clear();
    await urlInput.fill('https://example.com/video.mp4');
    
    await expect(page.locator('svg[color="success"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/valid.*url detected/i)).toBeVisible();

    // Take screenshot of validation states
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/url-validation-feedback.png' 
    });
  });

  test('should handle clipboard paste functionality', async ({ page }) => {
    await videoHelper.navigateToImporter();

    // Mock clipboard API
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          readText: async () => 'https://www.youtube.com/watch?v=clipboard-test'
        },
        writable: false
      });
    });

    // Click paste from clipboard button
    const pasteButton = page.getByRole('button', { name: /paste from clipboard/i });
    await pasteButton.click();

    // Should fill the input with clipboard content
    const urlInput = page.getByLabel(/video url/i);
    await expect(urlInput).toHaveValue('https://www.youtube.com/watch?v=clipboard-test');

    // Should trigger validation
    await expect(page.locator('svg[color="success"]')).toBeVisible({ timeout: 5000 });
  });

  test('should display platform-specific information and examples', async ({ page }) => {
    await videoHelper.navigateToImporter();

    // Verify supported platforms section is visible
    await expect(page.getByText(/supported platforms/i)).toBeVisible();
    
    // Check for platform examples
    await expect(page.getByText(/youtube/i)).toBeVisible();
    await expect(page.getByText(/youtube shorts/i)).toBeVisible();
    await expect(page.getByText(/direct video url/i)).toBeVisible();
    
    // Verify example URLs are shown
    await expect(page.getByText(/https:\/\/www\.youtube\.com\/watch\?v=/)).toBeVisible();
    await expect(page.getByText(/https:\/\/youtube\.com\/shorts\//)).toBeVisible();
    await expect(page.getByText(/\.mp4/)).toBeVisible();

    // Verify tips section
    await expect(page.getByText(/tips:/i)).toBeVisible();
    await expect(page.getByText(/best available quality/i)).toBeVisible();
    await expect(page.getByText(/publicly accessible/i)).toBeVisible();
  });

  test('should provide comprehensive settings form interactions', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.waitForSettingsPage();

    // Test language selection
    const languageSelect = page.locator('[data-testid="target-language-select"], select, .MuiSelect-root').first();
    await languageSelect.click();
    
    // Should show language options
    await expect(page.getByRole('option', { name: /english/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /portuguese/i })).toBeVisible();
    
    // Select Portuguese
    await page.getByRole('option', { name: /portuguese/i }).click();
    
    // Test music mood selection
    const musicSelect = page.locator('[data-testid="music-mood-select"], .MuiSelect-root').nth(1);
    if (await musicSelect.isVisible()) {
      await musicSelect.click();
      
      // Should show music options
      await expect(page.getByRole('option', { name: /upbeat/i })).toBeVisible();
      await expect(page.getByRole('option', { name: /chill/i })).toBeVisible();
      
      await page.getByRole('option', { name: /chill/i }).click();
    }

    // Test orientation radio buttons
    const portraitRadio = page.getByRole('radio', { name: /portrait/i });
    const landscapeRadio = page.getByRole('radio', { name: /landscape/i });
    
    await expect(portraitRadio).toBeVisible();
    await expect(landscapeRadio).toBeVisible();
    
    // Should be able to select orientation
    await landscapeRadio.click();
    await expect(landscapeRadio).toBeChecked();
    
    await portraitRadio.click();
    await expect(portraitRadio).toBeChecked();

    // Test auto highlights toggle
    const autoHighlightsToggle = page.getByRole('checkbox', { name: /auto highlights/i });
    if (await autoHighlightsToggle.isVisible()) {
      const initialState = await autoHighlightsToggle.isChecked();
      
      await autoHighlightsToggle.click();
      await expect(autoHighlightsToggle).toBeChecked({ checked: !initialState });
      
      await autoHighlightsToggle.click();
      await expect(autoHighlightsToggle).toBeChecked({ checked: initialState });
    }

    // Test duration sliders/inputs
    const maxDurationInput = page.locator('input[type="number"], .MuiSlider-input').first();
    if (await maxDurationInput.isVisible()) {
      await maxDurationInput.fill('90');
      await expect(maxDurationInput).toHaveValue('90');
    }

    // Take screenshot of settings form
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/settings-form-interactions.png' 
    });
  });

  test('should validate settings form inputs', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.waitForSettingsPage();

    // Test invalid duration values
    const maxDurationInput = page.locator('input[aria-label*="max"], input[name*="max"], input[type="number"]').first();
    if (await maxDurationInput.isVisible()) {
      // Test negative value
      await maxDurationInput.fill('-10');
      
      const startButton = page.getByRole('button', { name: /start import/i });
      await startButton.click();
      
      // Should show validation error
      await expect(page.getByText(/invalid.*duration/i)).toBeVisible({ timeout: 3000 });
      
      // Fix the value
      await maxDurationInput.fill('60');
    }

    // Test required field validation
    // (Assuming target language is required)
    const languageSelect = page.locator('.MuiSelect-root').first();
    if (await languageSelect.isVisible()) {
      // Clear selection if possible
      const clearButton = page.locator('[aria-label="Clear"]');
      if (await clearButton.isVisible()) {
        await clearButton.click();
      }
    }

    // Take screenshot of validation state
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/settings-validation.png' 
    });
  });

  test('should show progress with detailed step information', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    const testSettings = MockDataHelper.getTestSettings()[0];

    // Setup WebSocket mocking
    await mockServer.setupWebSocketMocks(testVideo.expectedJobId, 'success');

    await videoHelper.navigateToImporter();
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    await videoHelper.configureImportSettings(testSettings);
    await videoHelper.submitSettings();

    // Verify progress page elements
    await expect(page.getByText(/import progress/i)).toBeVisible();
    await expect(page.locator('[role="progressbar"]')).toBeVisible();
    
    // Should show current step
    await expect(page.locator('[data-testid*="step"], .import-step, .progress-step')).toBeVisible();
    
    // Should show progress percentage
    await expect(page.locator('[aria-valuenow]')).toBeVisible();

    // Wait for progress updates and verify they're displayed
    let lastStep = '';
    let lastProgress = -1;
    
    const checkProgress = async () => {
      try {
        const currentStep = await videoHelper.getCurrentStep();
        const currentProgress = await videoHelper.getCurrentProgress();
        
        if (currentStep && currentStep !== lastStep) {
          console.log(`Step changed: ${lastStep} -> ${currentStep}`);
          lastStep = currentStep;
          
          // Take screenshot of each step
          await page.screenshot({ 
            path: `test-results/e2e-artifacts/progress-step-${currentStep.replace(/[^a-zA-Z0-9]/g, '-')}.png` 
          });
        }
        
        if (currentProgress > lastProgress) {
          console.log(`Progress: ${lastProgress}% -> ${currentProgress}%`);
          lastProgress = currentProgress;
        }
      } catch (error) {
        // Progress elements might not be available anymore
      }
    };

    // Monitor progress for up to 30 seconds
    const progressMonitor = setInterval(checkProgress, 1000);
    
    try {
      await videoHelper.waitForImportCompletion(30000);
    } finally {
      clearInterval(progressMonitor);
    }
  });

  test('should handle step navigation correctly', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    await videoHelper.navigateToImporter();

    // Verify initial step (URL input)
    await expect(page.getByText(/enter video url/i)).toBeVisible();
    
    // Navigate to settings
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    
    // Verify settings step
    await expect(page.getByText(/configure settings/i)).toBeVisible();
    
    // Test back navigation
    const backButton = page.getByRole('button', { name: /back/i }).first();
    await backButton.click();
    
    // Should be back to URL step
    await expect(page.getByText(/enter video url/i)).toBeVisible();
    
    // URL should be preserved
    const urlInput = page.getByLabel(/video url/i);
    await expect(urlInput).toHaveValue(testVideo.url);
    
    // Navigate forward again
    await videoHelper.submitURL();
    await expect(page.getByText(/configure settings/i)).toBeVisible();

    // Take screenshot of navigation flow
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/step-navigation.png' 
    });
  });

  test('should display stepper component with correct states', async ({ page }) => {
    const testVideo = MockDataHelper.getTestVideoData()[0];
    
    await videoHelper.navigateToImporter();

    // Verify stepper is visible
    const stepper = page.locator('.MuiStepper-root, [data-testid="stepper"]');
    await expect(stepper).toBeVisible();
    
    // Should show all steps
    await expect(page.getByText(/enter video url/i)).toBeVisible();
    await expect(page.getByText(/configure settings/i)).toBeVisible();
    await expect(page.getByText(/import progress/i)).toBeVisible();
    
    // First step should be active
    const firstStep = page.locator('.MuiStep-root').first();
    await expect(firstStep).toHaveClass(/active/);

    // Navigate to next step
    await videoHelper.enterVideoURL(testVideo.url);
    await videoHelper.submitURL();
    
    // Second step should now be active
    const secondStep = page.locator('.MuiStep-root').nth(1);
    await expect(secondStep).toHaveClass(/active/);
    
    // First step should be completed
    await expect(firstStep).toHaveClass(/completed/);

    // Take screenshot of stepper states
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/stepper-states.png' 
    });
  });

  test('should provide appropriate loading states and feedback', async ({ page }) => {
    await videoHelper.navigateToImporter();

    // Test URL validation loading
    const urlInput = page.getByLabel(/video url/i);
    await urlInput.fill('https://www.youtube.com/watch?v=test123');
    
    // Should show validation loading
    const validationLoader = page.locator('.MuiCircularProgress-root, [data-testid="validation-loading"]');
    await expect(validationLoader).toBeVisible({ timeout: 3000 });
    
    // Wait for validation to complete
    await videoHelper.waitForURLValidation();
    
    // Proceed to settings
    await videoHelper.submitURL();
    await videoHelper.waitForSettingsPage();
    
    // Configure minimal settings
    await videoHelper.configureImportSettings();
    
    // Test import start loading
    const startButton = page.getByRole('button', { name: /start import/i });
    await startButton.click();
    
    // Should show loading state (either spinner or progress bar)
    const importLoader = page.locator('.MuiCircularProgress-root, .MuiLinearProgress-root, [role="progressbar"]');
    await expect(importLoader).toBeVisible({ timeout: 5000 });

    // Take screenshot of loading states
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/loading-states-ui.png' 
    });
  });

  test('should maintain responsive design on different screen sizes', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await videoHelper.navigateToImporter();
    
    // Verify mobile layout
    await expect(page.getByRole('heading', { name: /import video/i })).toBeVisible();
    
    // URL input should be full width on mobile
    const urlInput = page.getByLabel(/video url/i);
    const inputBox = await urlInput.boundingBox();
    const viewportWidth = page.viewportSize()?.width || 375;
    
    if (inputBox) {
      // Input should take most of the width on mobile
      expect(inputBox.width).toBeGreaterThan(viewportWidth * 0.8);
    }

    // Take mobile screenshot
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/mobile-layout.png' 
    });

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/tablet-layout.png' 
    });

    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/desktop-layout.png' 
    });
  });

  test('should handle keyboard navigation and accessibility', async ({ page }) => {
    await videoHelper.navigateToImporter();

    // Test tab navigation
    await page.keyboard.press('Tab');
    
    // Should focus on URL input
    const urlInput = page.getByLabel(/video url/i);
    await expect(urlInput).toBeFocused();
    
    // Type URL using keyboard
    await page.keyboard.type('https://www.youtube.com/watch?v=test123');
    
    // Tab to continue button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Might need multiple tabs depending on layout
    
    const continueButton = page.getByRole('button', { name: /continue/i });
    
    // Wait for validation
    await videoHelper.waitForURLValidation();
    
    // Press Enter to continue
    await page.keyboard.press('Enter');
    
    // Should navigate to settings page
    await videoHelper.waitForSettingsPage();

    // Test keyboard navigation in settings
    await page.keyboard.press('Tab');
    
    // Take screenshot of keyboard focus
    await page.screenshot({ 
      path: 'test-results/e2e-artifacts/keyboard-navigation.png' 
    });
  });
});