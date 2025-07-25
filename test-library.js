#!/usr/bin/env node

const fetch = require('node-fetch');

async function testLibraryAPI() {
  const baseUrl = 'http://localhost:3233/api/library';
  
  console.log('🧪 Testing Library Manager API...\n');
  
  try {
    // Test getting assets (should trigger file scanning)
    console.log('📁 Getting assets...');
    const assetsRes = await fetch(`${baseUrl}/assets`);
    const assetsData = await assetsRes.json();
    console.log(`✅ Found ${assetsData.data.assets.length} assets\n`);
    
    // Test getting available moods
    console.log('🎵 Getting available moods...');
    const moodsRes = await fetch(`${baseUrl}/moods`);
    const moodsData = await moodsRes.json();
    console.log(`✅ Available moods: ${moodsData.data.moods.join(', ')}\n`);
    
    // Test getting available tags
    console.log('🏷️  Getting available tags...');
    const tagsRes = await fetch(`${baseUrl}/tags`);
    const tagsData = await tagsRes.json();
    console.log(`✅ Available tags: ${tagsData.data.tags.join(', ')}\n`);
    
    // Test getting library stats
    console.log('📊 Getting library stats...');
    const statsRes = await fetch(`${baseUrl}/stats`);
    const statsData = await statsRes.json();
    console.log('✅ Library Stats:');
    console.log(`   - Total Assets: ${statsData.data.totalAssets}`);
    console.log(`   - Music Assets: ${statsData.data.musicAssets}`);
    console.log(`   - Overlay Assets: ${statsData.data.overlayAssets}`);
    console.log(`   - Total Size: ${formatBytes(statsData.data.totalSize)}\n`);
    
    console.log('🎉 Dynamic Library Manager is working successfully!');
    
  } catch (error) {
    console.error('❌ Error testing library API:', error.message);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

testLibraryAPI();