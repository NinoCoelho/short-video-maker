#!/usr/bin/env node

/**
 * Example usage of the Download Queue Management System
 * 
 * This file demonstrates how to use the download system for queuing,
 * processing, and monitoring video downloads with real-time updates.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDownloadSystem } from './initializeDownloadSystem';
import { QueuePriority } from './QueueService';
import { StatusType } from './StatusService';

// For ES modules compatibility
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🚀 Initializing Download Queue Management System...\n');

  // Initialize the download system
  const downloadSystem = initializeDownloadSystem({
    outputDir: path.join(__dirname, '../../downloads'),
    maxConcurrentDownloads: 2, // Limit to 2 concurrent downloads
    defaultQuality: 'best',
    defaultFormat: 'mp4',
    retryDelay: 3000,
    maxRetries: 2,
    enableCleanupTask: false, // Disable for this example
    cleanupIntervalHours: 1
  });

  console.log('✅ Download system initialized successfully\n');

  // Example video URLs (replace with real URLs for testing)
  const testUrls = [
    {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      priority: QueuePriority.HIGH,
      filename: 'rick-roll.mp4'
    },
    {
      url: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
      priority: QueuePriority.NORMAL,
      filename: 'gangnam-style.mp4'
    },
    {
      url: 'https://www.tiktok.com/@example/video/123456789',
      priority: QueuePriority.LOW,
      filename: 'tiktok-video.mp4'
    }
  ];

  // Set up event listeners for real-time monitoring
  setupEventListeners(downloadSystem);

  console.log('📋 Adding videos to download queue...\n');

  const jobIds: string[] = [];

  // Add downloads to queue
  for (const [index, video] of testUrls.entries()) {
    try {
      const jobId = await downloadSystem.processor.addDownload({
        url: video.url,
        videoId: `video-${index + 1}`,
        jobId: `job-${Date.now()}-${index}`,
        filename: video.filename,
        priority: video.priority
      });

      jobIds.push(jobId);
      
      console.log(`✅ Added to queue: ${video.filename}`);
      console.log(`   Job ID: ${jobId}`);
      console.log(`   Priority: ${QueuePriority[video.priority]}`);
      console.log(`   URL: ${video.url}\n`);

    } catch (error) {
      console.error(`❌ Failed to queue ${video.filename}: ${error}\n`);
    }
  }

  // Monitor system status
  console.log('📊 Initial system status:');
  await printSystemStatus(downloadSystem);

  // Wait for downloads to process
  console.log('⏳ Monitoring downloads for 30 seconds...\n');
  
  const statusInterval = setInterval(async () => {
    await printSystemStatus(downloadSystem);
  }, 5000); // Print status every 5 seconds

  // Stop monitoring after 30 seconds
  setTimeout(() => {
    clearInterval(statusInterval);
    console.log('\n🏁 Example completed. Check the downloads folder for results.');
    
    // Optional: Perform cleanup
    performCleanup(downloadSystem);
  }, 30000);
}

function setupEventListeners(downloadSystem: any) {
  console.log('🎧 Setting up event listeners...\n');

  // Listen to download progress
  downloadSystem.processor.on('download:progress', (event: any) => {
    const progressPercent = Math.round(event.progress || 0);
    const downloadedMB = (event.downloadedBytes / 1024 / 1024).toFixed(1);
    const totalMB = (event.totalBytes / 1024 / 1024).toFixed(1);
    const speedKB = (event.speed / 1024).toFixed(1);

    console.log(`📥 Download Progress - Job ${event.jobId}`);
    console.log(`   Progress: ${progressPercent}% (${downloadedMB}MB / ${totalMB}MB)`);
    console.log(`   Speed: ${speedKB} KB/s, ETA: ${event.eta}s\n`);
  });

  // Listen to status changes
  downloadSystem.status.on('status:updated', (status: any) => {
    if (status.type === StatusType.DOWNLOAD) {
      console.log(`📋 Status Update - ${status.id}: ${status.status.toUpperCase()}`);
      if (status.message) {
        console.log(`   Message: ${status.message}`);
      }
      console.log();
    }
  });

  // Listen to completions
  downloadSystem.processor.on('download:complete', (event: any) => {
    const sizeMB = (event.fileSize / 1024 / 1024).toFixed(1);
    console.log(`✅ Download Completed - Job ${event.jobId}`);
    console.log(`   File: ${event.filePath}`);
    console.log(`   Size: ${sizeMB}MB`);
    console.log(`   Duration: ${(event.duration / 1000).toFixed(1)}s\n`);
  });

  // Listen to errors
  downloadSystem.processor.on('download:error', (event: any) => {
    console.log(`❌ Download Error - Job ${event.jobId}`);
    console.log(`   Error: ${event.error}`);
    console.log(`   Retries: ${event.retries}${event.willRetry ? ' (will retry)' : ' (max reached)'}\n`);
  });
}

async function printSystemStatus(downloadSystem: any) {
  try {
    const status = await downloadSystem.getSystemStatus();
    const activeDownloads = downloadSystem.status.getActiveDownloads();

    console.log('┌─────────────────────────────────────────┐');
    console.log('│            SYSTEM STATUS                │');
    console.log('├─────────────────────────────────────────┤');
    console.log(`│ Queue Status:                           │`);
    console.log(`│   Pending: ${status.queue.pending.toString().padEnd(28)} │`);
    console.log(`│   Processing: ${status.queue.processing.toString().padEnd(25)} │`);
    console.log(`│   Completed: ${status.queue.completed.toString().padEnd(26)} │`);
    console.log(`│   Failed: ${status.queue.failed.toString().padEnd(29)} │`);
    console.log('│                                         │');
    console.log(`│ Active Downloads: ${status.activeDownloads.toString().padEnd(21)} │`);
    console.log('│                                         │');
    console.log(`│ Storage:                                │`);
    console.log(`│   Files: ${status.storage.totalFiles.toString().padEnd(30)} │`);
    console.log(`│   Size: ${(status.storage.totalSize / 1024 / 1024).toFixed(1)}MB${' '.repeat(23)} │`);
    console.log('└─────────────────────────────────────────┘\n');

    // Show active download details
    if (activeDownloads.length > 0) {
      console.log('📊 Active Downloads:');
      activeDownloads.forEach((download: any) => {
        console.log(`   ${download.id}: ${download.status} (${download.progress || 0}%)`);
        console.log(`   URL: ${download.metadata.url}`);
      });
      console.log();
    }
  } catch (error) {
    console.error(`❌ Failed to get system status: ${error}\n`);
  }
}

async function performCleanup(downloadSystem: any) {
  try {
    console.log('🧹 Performing cleanup...');
    
    const results = await downloadSystem.performManualCleanup(0); // Clean everything
    
    console.log(`   Cleaned statuses: ${results.cleanedStatuses}`);
    console.log(`   Cleaned files: ${results.cleanedFiles}`);
    console.log(`   Cleaned queue items: ${results.cleanedQueue}`);
    console.log('✅ Cleanup completed\n');
  } catch (error) {
    console.error(`❌ Cleanup failed: ${error}\n`);
  }
}

// Advanced usage examples
function advancedUsageExamples(downloadSystem: any) {
  console.log('🔧 Advanced Usage Examples:\n');

  // Example 1: Cancel a download
  async function cancelDownloadExample() {
    console.log('1. Cancel Download:');
    
    const jobId = await downloadSystem.processor.addDownload({
      url: 'https://example.com/large-video.mp4',
      videoId: 'cancelable-video',
      jobId: 'cancelable-job',
      priority: QueuePriority.LOW
    });

    // Cancel after 5 seconds
    setTimeout(async () => {
      const cancelled = await downloadSystem.processor.cancelDownload(jobId);
      console.log(`   Download cancelled: ${cancelled}`);
    }, 5000);
  }

  // Example 2: Update concurrency limit
  function updateConcurrencyExample() {
    console.log('2. Update Concurrency Limit:');
    downloadSystem.processor.setMaxConcurrentDownloads(5);
    console.log('   Concurrency limit set to 5');
  }

  // Example 3: Get metadata without downloading
  async function getMetadataExample() {
    console.log('3. Get Metadata Only:');
    
    try {
      const metadata = await downloadSystem.processor.fetchMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      console.log('   Metadata:', {
        title: metadata.title,
        duration: metadata.duration,
        fileSize: metadata.fileSize
      });
    } catch (error) {
      console.log(`   Failed to get metadata: ${error}`);
    }
  }

  // Example 4: Check URL support
  function checkUrlSupportExample() {
    console.log('4. Check URL Support:');
    
    const urls = [
      'https://www.youtube.com/watch?v=123',
      'https://www.tiktok.com/@user/video/123',
      'https://www.instagram.com/p/123/',
      'https://example.com/video.mp4',
      'https://unsupported-platform.com/video'
    ];

    urls.forEach(url => {
      const supported = downloadSystem.processor.isUrlSupported(url);
      console.log(`   ${url}: ${supported ? '✅' : '❌'}`);
    });

    console.log(`   Supported platforms: ${downloadSystem.processor.getSupportedPlatforms().join(', ')}`);
  }

  // Run examples (commented out to avoid execution in main)
  // cancelDownloadExample();
  // updateConcurrencyExample();
  // getMetadataExample();
  // checkUrlSupportExample();
}

// Error handling example
function setupErrorHandling() {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\n👋 Gracefully shutting down...');
    process.exit(0);
  });
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  setupErrorHandling();
  main().catch(console.error);
}

export { main as runDownloadExample };