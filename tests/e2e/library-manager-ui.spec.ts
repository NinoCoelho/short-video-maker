import { test, expect } from '@playwright/test';

/**
 * UI-focused tests for Library Manager that don't require backend API
 */
test.describe('Library Manager UI', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3232/library-manager');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display page structure correctly', async ({ page }) => {
    // Check main title
    await expect(page.locator('h4:has-text("Library Manager")')).toBeVisible();
    
    // Check tabs
    await expect(page.locator('button[role="tab"]:has-text("Assets")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Collections")')).toBeVisible();
    
    // Check upload button
    await expect(page.locator('button:has-text("Upload Asset")')).toBeVisible();
  });

  test('should open and close upload dialog', async ({ page }) => {
    // Click upload button
    await page.click('button:has-text("Upload Asset")');
    
    // Check dialog opened
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('h2:has-text("Upload Asset")')).toBeVisible();
    
    // Check form elements
    await expect(page.locator('input[type="file"]')).toBeVisible();
    await expect(page.getByLabel('Title')).toBeVisible();
    await expect(page.getByLabel('Tags (comma separated)')).toBeVisible();
    
    // Close dialog
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Initially on Assets tab
    await expect(page.locator('button[role="tab"][aria-selected="true"]:has-text("Assets")')).toBeVisible();
    
    // Switch to Collections tab
    await page.click('button[role="tab"]:has-text("Collections")');
    await expect(page.locator('button[role="tab"][aria-selected="true"]:has-text("Collections")')).toBeVisible();
    
    // Check collections content
    await expect(page.locator('text=Create and manage asset collections')).toBeVisible();
    
    // Switch back to Assets
    await page.click('button[role="tab"]:has-text("Assets")');
    await expect(page.locator('button[role="tab"][aria-selected="true"]:has-text("Assets")')).toBeVisible();
  });

  test('should display search and filter controls', async ({ page }) => {
    // Check search field
    await expect(page.getByPlaceholder('Search assets...')).toBeVisible();
    
    // Type in search
    await page.getByPlaceholder('Search assets...').fill('test search');
    await expect(page.getByPlaceholder('Search assets...')).toHaveValue('test search');
    
    // Clear search
    await page.getByPlaceholder('Search assets...').clear();
    await expect(page.getByPlaceholder('Search assets...')).toHaveValue('');
  });

  test('should validate upload form', async ({ page }) => {
    // Open upload dialog
    await page.click('button:has-text("Upload Asset")');
    
    // Try to upload without file
    const uploadButton = page.getByRole('button', { name: 'Upload' });
    
    // Upload button should be disabled initially
    await expect(uploadButton).toBeDisabled();
    
    // Select a file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.mp3',
      mimeType: 'audio/mp3',
      buffer: Buffer.from('test audio content')
    });
    
    // Fill required fields
    await page.getByLabel('Title').fill('Test Audio');
    await page.getByLabel('Tags (comma separated)').fill('test, audio');
    
    // For audio files, mood select should appear
    const moodSelect = page.getByLabel('Mood');
    if (await moodSelect.isVisible({ timeout: 1000 })) {
      await moodSelect.click();
      const firstOption = page.getByRole('option').first();
      if (await firstOption.isVisible({ timeout: 1000 })) {
        await firstOption.click();
      }
    }
    
    // Close dialog
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should display empty state when no assets', async ({ page }) => {
    // Check if empty state is shown (might not be if assets are loaded)
    const emptyStateText = page.locator('text=No assets found');
    const uploadFirstAssetButton = page.locator('button:has-text("Upload Your First Asset")');
    
    // If no assets, these should be visible
    const hasEmptyState = await emptyStateText.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasEmptyState) {
      await expect(uploadFirstAssetButton).toBeVisible();
      
      // Clicking should open upload dialog
      await uploadFirstAssetButton.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Cancel' }).click();
    }
  });

  test('should handle keyboard navigation', async ({ page }) => {
    // Tab through interactive elements
    await page.keyboard.press('Tab'); // Focus first interactive element
    
    // Check focused element (should be visible)
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Press Enter on upload button if focused
    const uploadButton = page.locator('button:has-text("Upload Asset")');
    await uploadButton.focus();
    await page.keyboard.press('Enter');
    
    // Dialog should open
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Escape should close dialog
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should maintain state when switching tabs', async ({ page }) => {
    // Type in search
    await page.getByPlaceholder('Search assets...').fill('test search');
    
    // Switch to Collections
    await page.click('button[role="tab"]:has-text("Collections")');
    
    // Switch back to Assets
    await page.click('button[role="tab"]:has-text("Assets")');
    
    // Search should still have value
    await expect(page.getByPlaceholder('Search assets...')).toHaveValue('test search');
  });
});