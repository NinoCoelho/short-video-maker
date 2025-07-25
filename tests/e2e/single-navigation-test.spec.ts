import { test, expect } from '@playwright/test';

test.describe('Single Navigation Test', () => {
  test('Navigate to dashboard without rate limiting', async ({ page }) => {
    // Start fresh - clear cookies and local storage
    await page.context().clearCookies();
    
    // Navigate directly to dashboard
    await page.goto('http://localhost:3232/dashboard');
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Check if error message appears
    const errorElement = await page.locator('text=Erro ao carregar dashboard').count();
    
    if (errorElement > 0) {
      console.log('Dashboard still showing error');
      
      // Check network tab for 429 errors
      const responses: any[] = [];
      page.on('response', response => {
        if (response.status() === 429) {
          responses.push({
            url: response.url(),
            status: response.status()
          });
        }
      });
      
      // Reload the page to capture network activity
      await page.reload();
      await page.waitForTimeout(2000);
      
      console.log('429 responses:', responses);
    } else {
      console.log('Dashboard loaded successfully!');
    }
    
    // Take screenshot
    await page.screenshot({ path: 'tests/e2e/screenshots/dashboard-single-test.png' });
  });
});