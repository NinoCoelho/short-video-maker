import { test, expect } from '@playwright/test';

test.describe('Navigation Troubleshooting', () => {
  // Store console errors and backend errors
  let consoleErrors: string[] = [];
  let networkErrors: string[] = [];
  let pageErrors: { page: string; errors: string[]; networkErrors: string[] }[] = [];

  test.beforeEach(async ({ page }) => {
    // Clear errors for each test
    consoleErrors = [];
    networkErrors = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Listen for page crashes
    page.on('pageerror', (error) => {
      consoleErrors.push(`Page error: ${error.message}`);
    });

    // Listen for failed network requests
    page.on('requestfailed', (request) => {
      networkErrors.push(`Failed request: ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Also intercept responses to check for API errors
    page.on('response', (response) => {
      if (response.status() >= 400) {
        networkErrors.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });
  });

  const navigationRoutes = [
    { name: 'Home', path: '/' },
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Library', path: '/library' },
    { name: 'Import', path: '/import' },
    { name: 'Queue', path: '/queue' },
    { name: 'Settings', path: '/settings' }
  ];

  test('Check all navigation routes', async ({ page }) => {
    for (const route of navigationRoutes) {
      console.log(`\n=== Testing ${route.name} (${route.path}) ===`);
      
      // Clear errors before navigating
      consoleErrors = [];
      networkErrors = [];
      
      // Navigate to the route
      await page.goto(`http://localhost:3232${route.path}`);
      
      // Wait for the page to stabilize
      await page.waitForTimeout(2000);
      
      // Check if the page loaded (not showing error page)
      const pageTitle = await page.title();
      console.log(`Page title: ${pageTitle}`);
      
      // Check for common error indicators
      const errorTexts = ['error', 'Error', 'ERROR', '404', '500', 'failed', 'Failed'];
      for (const errorText of errorTexts) {
        const errorElements = await page.locator(`text=${errorText}`).count();
        if (errorElements > 0) {
          console.log(`Found ${errorElements} elements containing "${errorText}"`);
        }
      }
      
      // Take a screenshot for debugging
      await page.screenshot({ 
        path: `tests/e2e/screenshots/${route.name.toLowerCase()}-page.png`,
        fullPage: true 
      });
      
      // Store errors for this page
      if (consoleErrors.length > 0 || networkErrors.length > 0) {
        pageErrors.push({
          page: route.name,
          errors: [...consoleErrors],
          networkErrors: [...networkErrors]
        });
      }
      
      // Log immediate findings
      if (consoleErrors.length > 0) {
        console.log('Console errors found:');
        consoleErrors.forEach(err => console.log(`  - ${err}`));
      }
      
      if (networkErrors.length > 0) {
        console.log('Network errors found:');
        networkErrors.forEach(err => console.log(`  - ${err}`));
      }
    }
    
    // Summary report
    console.log('\n\n=== SUMMARY REPORT ===');
    if (pageErrors.length === 0) {
      console.log('✅ No errors found on any page!');
    } else {
      console.log(`❌ Found errors on ${pageErrors.length} pages:`);
      pageErrors.forEach(({ page, errors, networkErrors }) => {
        console.log(`\n${page}:`);
        if (errors.length > 0) {
          console.log('  Console errors:');
          errors.forEach(err => console.log(`    - ${err}`));
        }
        if (networkErrors.length > 0) {
          console.log('  Network errors:');
          networkErrors.forEach(err => console.log(`    - ${err}`));
        }
      });
    }
  });

  test('Dashboard page detailed check', async ({ page }) => {
    console.log('\n=== Detailed Dashboard Check ===');
    
    await page.goto('http://localhost:3232/dashboard');
    await page.waitForTimeout(3000);
    
    // Check if main content areas are present
    const mainContent = await page.locator('main').count();
    console.log(`Main content areas found: ${mainContent}`);
    
    // Check for loading indicators that might be stuck
    const loadingIndicators = await page.locator('[class*="loading"], [class*="spinner"], [class*="progress"]').count();
    console.log(`Loading indicators found: ${loadingIndicators}`);
    
    // Check if any data is displayed
    const tables = await page.locator('table').count();
    const lists = await page.locator('ul, ol').count();
    const cards = await page.locator('[class*="card"]').count();
    
    console.log(`Tables: ${tables}, Lists: ${lists}, Cards: ${cards}`);
    
    // Get the page content for debugging
    const bodyText = await page.locator('body').innerText();
    console.log(`Page content length: ${bodyText.length} characters`);
    
    if (bodyText.length < 100) {
      console.log('⚠️  Page seems empty or not loaded properly');
      console.log('Body content:', bodyText);
    }
  });

  test('Library page detailed check', async ({ page }) => {
    console.log('\n=== Detailed Library Check ===');
    
    await page.goto('http://localhost:3232/library');
    await page.waitForTimeout(3000);
    
    // Similar checks as dashboard
    const mainContent = await page.locator('main').count();
    console.log(`Main content areas found: ${mainContent}`);
    
    const bodyText = await page.locator('body').innerText();
    console.log(`Page content length: ${bodyText.length} characters`);
    
    if (bodyText.length < 100) {
      console.log('⚠️  Page seems empty or not loaded properly');
      console.log('Body content:', bodyText);
    }
    
    // Check for video grid or list
    const videoItems = await page.locator('[class*="video"], [class*="item"], [class*="grid"]').count();
    console.log(`Video/item elements found: ${videoItems}`);
  });

  test('Check React mounting', async ({ page }) => {
    console.log('\n=== React App Mounting Check ===');
    
    await page.goto('http://localhost:3232');
    
    // Check if React root exists
    const reactRoot = await page.locator('#root').count();
    console.log(`React root element found: ${reactRoot}`);
    
    // Check if React has mounted by looking for React-specific attributes
    const reactElements = await page.locator('[data-reactroot], [data-react-root], ._reactroot').count();
    console.log(`React-specific elements found: ${reactElements}`);
    
    // Check the root element's children
    const rootChildren = await page.locator('#root > *').count();
    console.log(`Root element children: ${rootChildren}`);
    
    if (rootChildren === 0) {
      console.log('⚠️  React app may not be mounting properly');
    }
  });
});