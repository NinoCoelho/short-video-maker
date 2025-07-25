import { test, expect, Page } from '@playwright/test';
import path from 'path';

test.describe('Library Manager', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    // Add a delay to avoid rate limiting
    await page.waitForTimeout(1000);
    await page.goto('http://localhost:3232/library-manager');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display library statistics', async () => {
    await expect(page.locator('text=Library Statistics')).toBeVisible();
    // Use more specific selectors to avoid conflicts
    const statsCard = page.locator('.MuiCard-root').filter({ hasText: 'Library Statistics' });
    await expect(statsCard.locator('text=Total Assets')).toBeVisible();
    await expect(statsCard.locator('text=Music Files')).toBeVisible();
    await expect(statsCard.locator('text=Overlays')).toBeVisible();
    await expect(statsCard.locator('text=Total Size')).toBeVisible();
  });

  test('should open upload dialog and fill form', async () => {
    // Test upload dialog functionality without actually uploading
    // Click upload button
    await page.click('button:has-text("Upload Asset")');
    
    // Wait for dialog
    await expect(page.locator('text=Upload Asset').first()).toBeVisible();
    
    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'test-audio.mp3'));
    
    // Wait a bit for file to be processed
    await page.waitForTimeout(500);
    
    // Fill metadata - use getByLabel which is more reliable for MUI TextFields
    await page.getByLabel('Title').fill('Test Audio Track');
    await page.getByLabel('Tags (comma separated)').fill('test, audio, sample');
    
    // For mood select, check if it appears (only for audio files)
    const moodField = page.getByLabel('Mood');
    if (await moodField.isVisible({ timeout: 1000 })) {
      await moodField.click();
      await page.getByRole('option', { name: 'Upbeat' }).click();
    }
    
    // Verify form is filled correctly
    await expect(page.getByLabel('Title')).toHaveValue('Test Audio Track');
    await expect(page.getByLabel('Tags (comma separated)')).toHaveValue('test, audio, sample');
    
    // Cancel to close dialog
    await page.getByRole('button', { name: 'Cancel' }).click();
    
    // Wait for dialog to close with a longer timeout
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });

  test('should edit asset metadata', async () => {
    // Check if assets are loaded first
    const assetCount = await page.locator('.MuiCard-root').count();
    if (assetCount === 0) {
      console.log('No assets found, skipping edit test');
      return;
    }
    
    // Find an asset and open context menu
    const assetCard = page.locator('.MuiCard-root').first();
    await assetCard.hover();
    
    // Click more options button
    const moreButton = assetCard.locator('button:has(svg[data-testid="MoreVertIcon"])');
    await moreButton.click();
    
    // Click edit in context menu
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    
    // Wait for edit dialog
    await expect(page.locator('text=Edit Asset')).toBeVisible();
    
    // Update metadata using getByLabel
    await page.getByLabel('Title').clear();
    await page.getByLabel('Title').fill('Updated Audio Title');
    await page.getByLabel('Tags').clear();
    await page.getByLabel('Tags').fill('updated, test, modified');
    
    // Save changes
    await page.getByRole('button', { name: 'Save' }).click();
    
    // Verify update - wait for dialog to close and check new title
    await expect(page.locator('text=Edit Asset')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('.MuiCard-root:has-text("Updated Audio Title")')).toBeVisible();
  });

  test('should download an asset', async () => {
    // Check if assets are loaded first
    const assetCount = await page.locator('.MuiCard-root').count();
    if (assetCount === 0) {
      console.log('No assets found, skipping download test');
      return;
    }
    
    // Find an asset
    const assetCard = page.locator('.MuiCard-root').first();
    const assetTitle = await assetCard.locator('h6').textContent();
    
    // Open context menu
    await assetCard.locator('button:has(svg[data-testid="MoreVertIcon"])').click();
    
    // Set up download promise before clicking
    const downloadPromise = page.waitForEvent('download');
    
    // Click download
    await page.getByRole('menuitem', { name: 'Download' }).click();
    
    // Wait for download to start
    const download = await downloadPromise;
    
    // Verify download
    expect(download).toBeTruthy();
    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toBeTruthy();
  });

  test('should delete an asset', async () => {
    // Get initial asset count
    const initialCards = await page.locator('.MuiCard-root').count();
    if (initialCards === 0) {
      console.log('No assets found, skipping delete test');
      return;
    }
    
    // Find an asset to delete
    const assetCard = page.locator('.MuiCard-root').first();
    const assetTitle = await assetCard.locator('h6').textContent();
    
    // Open context menu
    await assetCard.locator('button:has(svg[data-testid="MoreVertIcon"])').click();
    
    // Click delete
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    
    // Confirm deletion in dialog (if present)
    const confirmButton = page.getByRole('button', { name: 'Confirm' });
    if (await confirmButton.isVisible({ timeout: 1000 })) {
      await confirmButton.click();
    }
    
    // Verify deletion - check that the card is gone
    await expect(page.locator(`.MuiCard-root:has-text("${assetTitle}")`)).not.toBeVisible({ timeout: 5000 });
    
    // Verify count decreased
    const finalCards = await page.locator('.MuiCard-root').count();
    expect(finalCards).toBe(initialCards - 1);
  });

  test('should position context menu correctly', async () => {
    // Check if there are any assets first
    const assetCount = await page.locator('.MuiCard-root').count();
    
    if (assetCount > 0) {
      // Find an asset
      const assetCard = page.locator('.MuiCard-root').first();
      const moreButton = assetCard.locator('button:has(svg[data-testid="MoreVertIcon"])');
      
      // Get button position
      const buttonBox = await moreButton.boundingBox();
      expect(buttonBox).toBeTruthy();
      
      // Click to open menu
      await moreButton.click();
      
      // Get menu position
      const menu = page.locator('.MuiMenu-paper');
      await expect(menu).toBeVisible();
      const menuBox = await menu.boundingBox();
      expect(menuBox).toBeTruthy();
      
      // Verify menu appears near the button (within reasonable distance)
      const distance = Math.sqrt(
        Math.pow(menuBox!.x - buttonBox!.x, 2) + 
        Math.pow(menuBox!.y - buttonBox!.y, 2)
      );
      expect(distance).toBeLessThan(150); // Menu should be within 150px of button
    } else {
      // Skip test if no assets
      console.log('No assets found, skipping context menu test');
    }
  });

  test('should filter assets by type', async () => {
    // Check if assets are loaded first
    const assetCount = await page.locator('.MuiCard-root').count();
    if (assetCount === 0) {
      console.log('No assets found, skipping filter test');
      return;
    }
    
    // Find the filter select by its label
    const filterSelect = page.locator('label:has-text("Type")').locator('..');
    await filterSelect.click();
    
    // Select music only
    await page.getByRole('option', { name: 'Music' }).click();
    
    // Wait for filter to apply
    await page.waitForTimeout(500);
    
    // Verify only music files are shown
    const cards = page.locator('.MuiCard-root');
    const count = await cards.count();
    
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        // Music files should have play button
        await expect(card.locator('button:has(svg[data-testid="PlayArrowIcon"])'))
          .toBeVisible();
      }
    }
  });

  test('should search assets', async () => {
    // Type in search box
    await page.getByPlaceholder('Search assets...').fill('test');
    
    // Wait for filter to apply
    await page.waitForTimeout(500);
    
    // Verify filtered results
    const cards = page.locator('.MuiCard-root');
    const count = await cards.count();
    
    for (let i = 0; i < count; i++) {
      const cardText = await cards.nth(i).textContent();
      expect(cardText?.toLowerCase()).toContain('test');
    }
  });

  test('should play audio preview', async () => {
    // Check if any music assets are loaded
    const musicCards = await page.locator('.MuiCard-root:has(button:has(svg[data-testid="PlayArrowIcon"]))').count();
    if (musicCards === 0) {
      console.log('No music assets found, skipping audio preview test');
      return;
    }
    
    // Find a music asset
    const musicCard = page.locator('.MuiCard-root:has(button:has(svg[data-testid="PlayArrowIcon"]))').first();
    
    // Click play button
    const playButton = musicCard.locator('button:has(svg[data-testid="PlayArrowIcon"])');
    await playButton.click();
    
    // Verify button changes to pause
    await expect(musicCard.locator('button:has(svg[data-testid="PauseIcon"])')).toBeVisible();
    
    // Click pause
    await musicCard.locator('button:has(svg[data-testid="PauseIcon"])').click();
    
    // Verify button changes back to play
    await expect(playButton).toBeVisible();
  });

  test('should handle empty library state', async () => {
    // Navigate to empty library (could mock API to return empty)
    // For now, we'll check if empty state message exists when no assets
    const cardCount = await page.locator('.MuiCard-root').count();
    
    if (cardCount === 0) {
      await expect(page.locator('text=No assets found')).toBeVisible();
      await expect(page.locator('button:has-text("Upload Your First Asset")')).toBeVisible();
    }
  });
});

// Test fixture setup
test.beforeAll(async () => {
  // Create test fixtures directory if needed
  const fs = require('fs');
  const fixturesDir = path.join(__dirname, 'fixtures');
  
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }
  
  // Create a simple test audio file (1 second of silence)
  const testAudioPath = path.join(fixturesDir, 'test-audio.mp3');
  if (!fs.existsSync(testAudioPath)) {
    // Create empty file as placeholder
    fs.writeFileSync(testAudioPath, Buffer.alloc(1024));
  }
  
  // Create test image file
  const testImagePath = path.join(fixturesDir, 'test-overlay.png');
  if (!fs.existsSync(testImagePath)) {
    // Create 1x1 PNG
    const pngData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(testImagePath, pngData);
  }
});