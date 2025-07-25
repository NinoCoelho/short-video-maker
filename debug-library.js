#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function debugLibraryManager() {
  console.log('🔍 Debugging LibraryManagerService metadata loading...\n');
  
  const projectRoot = process.cwd();
  const metadataDir = path.join(projectRoot, 'data', 'library');
  const assetsFile = path.join(metadataDir, 'assets.json');
  
  try {
    // Test 1: Check if file exists
    console.log('1. Checking if assets.json exists...');
    const exists = await fs.pathExists(assetsFile);
    console.log(`   ✅ exists: ${exists}\n`);
    
    if (!exists) return;
    
    // Test 2: Load and parse JSON
    console.log('2. Loading JSON data...');
    const assetsData = await fs.readJson(assetsFile);
    console.log(`   ✅ Loaded ${assetsData.length} assets from JSON\n`);
    
    // Test 3: Test Map conversion (same logic as LibraryManagerService)
    console.log('3. Testing Map conversion...');
    const assets = new Map(assetsData.map((asset) => [asset.id, asset]));
    console.log(`   ✅ Map size: ${assets.size}\n`);
    
    // Test 4: Test asset filtering (same logic as getAssets)
    console.log('4. Testing asset filtering...');
    const assetArray = Array.from(assets.values());
    console.log(`   ✅ Array from Map: ${assetArray.length} items\n`);
    
    // Test 5: Check first few assets
    console.log('5. First 3 assets:');
    assetArray.slice(0, 3).forEach((asset, i) => {
      console.log(`   ${i+1}. ${asset.filename} (${asset.mood || 'no mood'})`);
    });
    
    // Test 6: Check mood distribution
    console.log('\n6. Mood distribution:');
    const moodCounts = {};
    assetArray.forEach(asset => {
      if ('mood' in asset && asset.mood) {
        moodCounts[asset.mood] = (moodCounts[asset.mood] || 0) + 1;
      }
    });
    Object.entries(moodCounts).forEach(([mood, count]) => {
      console.log(`   ${mood}: ${count}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugLibraryManager();