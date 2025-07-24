import puppeteer from 'puppeteer';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Video Import Functionality E2E Test', () => {
  let browser: puppeteer.Browser;
  let page: puppeteer.Page;
  const TEST_URL = 'http://localhost:3232'; // UI dev server
  const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=FEAVWy1ILWo';
  
  beforeAll(async () => {
    // Launch browser with necessary options
    browser = await puppeteer.launch({
      headless: false, // Set to true for CI
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });
    
    // Set longer timeouts for video import operations
    page.setDefaultTimeout(60000); // 60 seconds
  }, 120000); // 2 minute timeout for browser launch

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should successfully import a YouTube video', async () => {
    // Navigate to the application
    await page.goto(TEST_URL, { waitUntil: 'networkidle2' });
    
    // Wait for app to load
    await page.waitForSelector('body', { visible: true });
    
    // Navigate to Import Video page using the sidebar menu
    await page.evaluate(() => {
      const menuItems = document.querySelectorAll('.MuiListItemButton-root');
      for (const item of menuItems) {
        if (item.textContent?.includes('Import Video')) {
          (item as HTMLElement).click();
          break;
        }
      }
    });
    
    // Wait for navigation to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 1: Enter Video URL
    const urlInputSelector = 'input[type="text"]';
    await page.waitForSelector(urlInputSelector, { visible: true });
    await page.type(urlInputSelector, TEST_VIDEO_URL);
    
    // Click Continue button
    await page.click('button.MuiButton-containedPrimary');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 2: Configure Settings (we'll use defaults)
    // Find and click Start Import button
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.includes('Start Import')) {
          btn.click();
          break;
        }
      }
    });
    
    // Step 3: Wait for import to complete
    // Look for progress indicators
    await page.waitForSelector('[data-testid="import-progress"], .MuiCircularProgress-root, .progress', 
      { visible: true, timeout: 10000 }
    ).catch(() => {
      // Progress indicator might appear briefly
    });
    
    // Wait for completion - this could take a while depending on video length
    try {
      // Wait for success message or completion indicator
      await page.waitForFunction(
        () => {
          const pageText = document.body.textContent || '';
          return pageText.includes('successfully') || 
                 pageText.includes('complete') || 
                 pageText.includes('finished') ||
                 pageText.includes('Import completed');
        },
        { timeout: 120000 } // 2 minutes for import
      );
      
      // Verify import was successful
      const pageContent = await page.evaluate(() => document.body.textContent);
      expect(pageContent).toMatch(/success|complete|finished/i);
      
    } catch (error) {
      // Take a screenshot for debugging
      await page.screenshot({ path: 'import-error-screenshot.png', fullPage: true });
      throw error;
    }
  }, 180000); // 3 minute timeout for the entire test

  it('should display video details after successful import', async () => {
    // After import, verify that we're on a success page or video details page
    await new Promise(resolve => setTimeout(resolve, 2000)); // Give the UI time to update
    
    try {
      // Check for video information in the page
      const pageContent = await page.evaluate(() => document.body.textContent);
      
      // The page should contain video-related information
      const hasVideoInfo = pageContent?.includes('video') || 
                          pageContent?.includes('import') ||
                          pageContent?.includes('FEAVWy1ILWo') || // Video ID
                          pageContent?.includes('segments') ||
                          pageContent?.includes('duration');
      
      expect(hasVideoInfo).toBe(true);
    } catch (error) {
      // Log the page content for debugging
      console.error('Page content:', await page.evaluate(() => document.body.textContent));
      await page.screenshot({ path: 'video-details-error.png', fullPage: true });
      throw error;
    }
  }, 30000);

  it('should handle invalid URLs gracefully', async () => {
    // Navigate to import page
    await page.goto(TEST_URL, { waitUntil: 'networkidle2' });
    
    // Navigate to Import Video page
    await page.evaluate(() => {
      const menuItems = document.querySelectorAll('.MuiListItemButton-root');
      for (const item of menuItems) {
        if (item.textContent?.includes('Import Video')) {
          (item as HTMLElement).click();
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Wait for the URL input
    const urlInputSelector = 'input[type="text"]';
    await page.waitForSelector(urlInputSelector, { visible: true });
    
    // Clear and enter an invalid URL
    await page.click(urlInputSelector, { clickCount: 3 });
    await page.type(urlInputSelector, 'not-a-valid-url');
    
    // Click Continue button
    await page.click('button.MuiButton-containedPrimary');
    
    // Wait for error message
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      // Check for error indicators
      const pageContent = await page.evaluate(() => document.body.textContent);
      const hasError = pageContent?.includes('Invalid') || 
                      pageContent?.includes('Error') || 
                      pageContent?.includes('valid URL') ||
                      pageContent?.includes('error');
      
      expect(hasError).toBe(true);
    } catch (error) {
      // Take screenshot for debugging
      await page.screenshot({ path: 'invalid-url-screenshot.png', fullPage: true });
      throw error;
    }
  }, 30000);
});