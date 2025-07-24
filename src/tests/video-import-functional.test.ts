import puppeteer from 'puppeteer';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Video Import Functional Test', () => {
  let browser: puppeteer.Browser;
  let page: puppeteer.Page;
  const TEST_URL = 'http://localhost:3232'; // UI dev server
  const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=FEAVWy1ILWo';
  
  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: false, // Set to true for CI
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    page.setDefaultTimeout(30000);
  }, 60000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should successfully import a YouTube video', async () => {
    // Navigate to the application
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
    
    // Step 1: Enter Video URL
    const urlInputSelector = 'input[type="text"]';
    await page.waitForSelector(urlInputSelector, { visible: true });
    await page.type(urlInputSelector, TEST_VIDEO_URL);
    
    // Wait for URL validation
    await page.waitForFunction(
      () => document.body.textContent?.includes('Valid YouTube URL detected'),
      { timeout: 5000 }
    );
    
    // Click Continue to proceed past URL validation
    await page.click('button.MuiButton-containedPrimary');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Now we should be on Configure Settings
    // Wait for the page to fully load
    await page.waitForFunction(
      () => {
        const text = document.body.textContent || '';
        return text.includes('Segment Duration') || 
               text.includes('AI Features') || 
               text.includes('Video Orientation');
      },
      { timeout: 10000 }
    );
    
    // Look for Start Import button by scrolling if needed
    await page.evaluate(() => window.scrollBy(0, 300));
    
    // Click Start Import button
    const importStarted = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.includes('Start Import')) {
          btn.click();
          return true;
        }
      }
      // If no Start Import, look for any primary button at the bottom
      const primaryButtons = Array.from(document.querySelectorAll('.MuiButton-containedPrimary'));
      const lastPrimary = primaryButtons[primaryButtons.length - 1] as HTMLElement;
      if (lastPrimary && !lastPrimary.textContent?.includes('Back')) {
        lastPrimary.click();
        return true;
      }
      return false;
    });
    
    expect(importStarted).toBe(true);
    
    // Wait for import to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify we're on the import progress step
    const onImportProgress = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('Import Progress') || 
             text.includes('Initializing') || 
             text.includes('import process');
    });
    
    expect(onImportProgress).toBe(true);
    
    // Take a success screenshot
    await page.screenshot({ path: 'import-success.png' });
    
  }, 60000);

  it('should validate URL format before allowing to continue', async () => {
    // Navigate to import page
    await page.goto(TEST_URL, { waitUntil: 'networkidle2' });
    
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
    
    // Enter invalid URL
    const urlInputSelector = 'input[type="text"]';
    await page.waitForSelector(urlInputSelector, { visible: true });
    await page.type(urlInputSelector, 'not-a-valid-url');
    
    // Try to continue
    await page.click('button.MuiButton-containedPrimary');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Should not see "Valid YouTube URL detected"
    const hasValidation = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return !text.includes('Valid YouTube URL detected');
    });
    
    expect(hasValidation).toBe(true);
    
    // Clear and enter valid URL
    await page.click(urlInputSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(urlInputSelector, TEST_VIDEO_URL);
    
    // Wait for validation
    await page.waitForFunction(
      () => document.body.textContent?.includes('Valid YouTube URL detected'),
      { timeout: 5000 }
    );
    
    // Now should be able to continue
    const canContinue = await page.evaluate(() => {
      const continueBtn = document.querySelector('button.MuiButton-containedPrimary');
      return continueBtn !== null && !continueBtn.hasAttribute('disabled');
    });
    
    expect(canContinue).toBe(true);
  }, 30000);
});