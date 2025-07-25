import { test, expect } from '@playwright/test';

test('YouTube video import progress', async ({ page }) => {
  // Navigate to the import page
  await page.goto('http://localhost:3232/import');
  
  // Take initial screenshot
  await page.screenshot({ path: 'screenshots/01-import-page.png', fullPage: true });
  
  // Fill in the YouTube URL
  const youtubeUrl = 'https://www.youtube.com/watch?v=FEAVWy1ILWo';
  await page.fill('input[placeholder*="URL"], input[type="url"], input[name="url"]', youtubeUrl);
  
  // Take screenshot after URL input
  await page.screenshot({ path: 'screenshots/02-url-entered.png', fullPage: true });
  
  // Click continue/next button
  await page.click('button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit")');
  
  // Wait for settings page and click through
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/03-settings-page.png', fullPage: true });
  
  // Try to find and click the start import button
  try {
    await page.click('button:has-text("Start"), button:has-text("Import"), button:has-text("Process")');
  } catch {
    // If no button found, try submitting the form
    await page.keyboard.press('Enter');
  }
  
  // Wait for progress page to load
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/04-progress-initial.png', fullPage: true });
  
  // Monitor progress for up to 2 minutes
  let progressCount = 0;
  for (let i = 0; i < 24; i++) { // 24 * 5s = 2 minutes
    await page.waitForTimeout(5000);
    
    // Take screenshot every 15 seconds
    if (i % 3 === 0) {
      progressCount++;
      await page.screenshot({ 
        path: `screenshots/05-progress-${progressCount.toString().padStart(2, '0')}.png`, 
        fullPage: true 
      });
    }
    
    // Check if import completed
    const completedElement = await page.$('text=completed');
    if (completedElement) {
      await page.screenshot({ path: 'screenshots/06-completed.png', fullPage: true });
      break;
    }
    
    // Check if import failed
    const errorElement = await page.$('text=failed, text=error');
    if (errorElement) {
      await page.screenshot({ path: 'screenshots/06-error.png', fullPage: true });
      break;
    }
  }
  
  // Take final screenshot
  await page.screenshot({ path: 'screenshots/07-final.png', fullPage: true });
  
  // Check console for any errors
  const logs = await page.evaluate(() => {
    return window.console.logs || [];
  });
  
  console.log('Console logs:', logs);
});