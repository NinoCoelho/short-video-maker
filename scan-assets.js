#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function scanAndCreateAssets() {
  console.log('🔍 Scanning existing music and overlay files...\n');
  
  const projectRoot = process.cwd();
  const musicDir = path.join(projectRoot, 'static', 'music');
  const overlayDir = path.join(projectRoot, 'static', 'overlays');
  const metadataDir = path.join(projectRoot, 'data', 'library');
  
  const assets = [];
  let assetIdCounter = 1;
  
  try {
    // Scan music files
    console.log('🎵 Scanning music files...');
    const musicFiles = await fs.readdir(musicDir);
    const musicFileExts = ['.mp3', '.wav', '.ogg', '.m4a'];
    
    for (const filename of musicFiles) {
      const ext = path.extname(filename).toLowerCase();
      if (musicFileExts.includes(ext)) {
        const filePath = path.join(musicDir, filename);
        const stats = await fs.stat(filePath);
        
        // Simple mood assignment based on filename
        let mood = 'happy'; // default
        const name = filename.toLowerCase();
        if (name.includes('worship') || name.includes('jesus') || name.includes('adorar')) mood = 'worship';
        else if (name.includes('epic') || name.includes('cinematic')) mood = 'epic';
        else if (name.includes('inspirational') || name.includes('rise') || name.includes('soar')) mood = 'inspirational';
        else if (name.includes('dark') || name.includes('sinister') || name.includes('curse')) mood = 'dark';
        else if (name.includes('sad') || name.includes('melancholic') || name.includes('heart')) mood = 'sad';
        else if (name.includes('happy') || name.includes('aurora') || name.includes('cafecito')) mood = 'happy';
        else if (name.includes('chill') || name.includes('champion')) mood = 'chill';
        else if (name.includes('angry') || name.includes('buckle') || name.includes('twin')) mood = 'angry';
        else if (name.includes('hopeful') || name.includes('freedom')) mood = 'hopeful';
        else if (name.includes('contemplative') || name.includes('crystaline') || name.includes('soliloquy')) mood = 'contemplative';
        else if (name.includes('funny') || name.includes('banjo') || name.includes('baby') || name.includes('seagull')) mood = 'funny';
        
        const asset = {
          id: `asset_${Date.now()}_${assetIdCounter++}`,
          filename,
          title: path.parse(filename).name,
          duration: 0, // Would need FFprobe to get real duration
          mood,
          tags: [],
          fileSize: stats.size,
          format: ext.substring(1),
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString()
        };
        
        assets.push(asset);
        console.log(`   ✅ ${filename} -> ${mood}`);
      }
    }
    
    // Scan overlay files
    console.log('\n🖼️  Scanning overlay files...');
    const overlayFiles = await fs.readdir(overlayDir);
    const overlayFileExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    
    for (const filename of overlayFiles) {
      const ext = path.extname(filename).toLowerCase();
      if (overlayFileExts.includes(ext)) {
        const filePath = path.join(overlayDir, filename);
        const stats = await fs.stat(filePath);
        
        const asset = {
          id: `asset_${Date.now()}_${assetIdCounter++}`,
          filename,
          title: path.parse(filename).name,
          dimensions: { width: 0, height: 0 }, // Would need image processing to get real dimensions
          tags: [],
          fileSize: stats.size,
          format: ext.substring(1),
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString()
        };
        
        assets.push(asset);
        console.log(`   ✅ ${filename}`);
      }
    }
    
    // Save assets to metadata
    console.log(`\n💾 Saving ${assets.length} assets to metadata...`);
    const assetsFile = path.join(metadataDir, 'assets.json');
    await fs.writeJson(assetsFile, assets, { spaces: 2 });
    
    console.log('✅ Asset scanning complete!');
    console.log(`📊 Created metadata for ${assets.length} assets`);
    
    // Summary
    const musicCount = assets.filter(a => 'mood' in a).length;
    const overlayCount = assets.filter(a => 'dimensions' in a).length;
    console.log(`   - ${musicCount} music files`);
    console.log(`   - ${overlayCount} overlay files`);
    
  } catch (error) {
    console.error('❌ Error scanning assets:', error.message);
  }
}

scanAndCreateAssets();