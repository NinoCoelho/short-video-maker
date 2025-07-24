# Video Downloaders

This directory contains platform-specific video downloaders for importing videos from various sources.

## Supported Platforms

- **YouTube** - Full support with quality selection
- **Facebook** - Video posts and reels
- **Instagram** - Posts, reels, and IGTV (may require cookies)
- **TikTok** - Standard videos and stories
- **Generic** - Direct video URLs and any other supported by yt-dlp

## Usage

### Basic Usage

```typescript
import { DownloaderManager } from './services/downloaders';

// Create a downloader manager
const manager = new DownloaderManager({
  defaultQuality: 'high',
  defaultFormat: 'mp4',
  maxDuration: 600, // 10 minutes
  timeout: 300000,  // 5 minutes
  maxRetries: 3
});

// Download a video
const result = await manager.download(
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  '/path/to/output.mp4'
);

if (result.success) {
  console.log('Download successful:', result.metadata);
} else {
  console.error('Download failed:', result.error);
}
```

### Event Handling

```typescript
// Listen to download events
manager.on('start', (event) => {
  console.log(`Starting download from ${event.platform}:`, event.url);
});

manager.on('progress', (event) => {
  console.log(`Progress: ${event.percent.toFixed(2)}%`);
});

manager.on('complete', (event) => {
  console.log('Download completed:', event);
});

manager.on('error', (event) => {
  console.error('Download error:', event.error);
});
```

### Platform-Specific Usage

```typescript
import { YouTubeDownloader } from './services/downloaders';

const ytDownloader = new YouTubeDownloader();

// Fetch metadata without downloading
const metadata = await ytDownloader.fetchMetadata('https://www.youtube.com/watch?v=...');

// Download with options
const result = await ytDownloader.download(url, {
  outputPath: '/path/to/video.mp4',
  quality: 'high',  // best, high, medium, low
  format: 'mp4',    // mp4, webm
  maxDuration: 300  // 5 minutes max
});
```

### Instagram with Cookies

For Instagram (and sometimes Facebook), you may need to provide cookies:

```typescript
// Option 1: Cookies file path
const result = await manager.download(instagramUrl, outputPath, {
  cookies: '/path/to/instagram-cookies.txt'
});

// Option 2: Set environment variable
process.env.INSTAGRAM_COOKIES_PATH = '/path/to/instagram-cookies.txt';
```

### Batch Downloads

```typescript
const urls = [
  'https://www.youtube.com/watch?v=...',
  'https://www.tiktok.com/@user/video/...',
  'https://www.instagram.com/reel/...'
];

const results = await manager.batchDownload(urls, '/output/directory', {
  quality: 'medium',
  maxDuration: 180
});

// Check results
results.forEach((result, index) => {
  if (result.success) {
    console.log(`Video ${index + 1} downloaded successfully`);
  } else {
    console.error(`Video ${index + 1} failed:`, result.error);
  }
});
```

## Integration with VideoImportService

The downloaders can be integrated with the existing VideoImportService:

```typescript
import { VideoImportService } from '../VideoImportService';
import { DownloaderManager } from './downloaders';

class EnhancedVideoImportService extends VideoImportService {
  private downloaderManager: DownloaderManager;

  constructor(dataDir: string) {
    super(dataDir);
    this.downloaderManager = new DownloaderManager();
    
    // Forward events
    this.downloaderManager.on('progress', (event) => {
      this.emit('download:progress', event);
    });
  }

  protected async downloadVideo(job: ImportJob): Promise<string> {
    const outputPath = path.join(this.importDir, job.id, 'original.mp4');
    
    const result = await this.downloaderManager.download(
      job.sourceUrl!,
      outputPath,
      {
        maxDuration: job.config.maxDuration,
        quality: 'high'
      }
    );

    if (!result.success) {
      throw result.error;
    }

    return outputPath;
  }
}
```

## Error Handling

All downloaders implement consistent error handling:

```typescript
try {
  const result = await manager.download(url, outputPath);
  if (!result.success) {
    // Handle download error
    console.error('Download failed:', result.error);
  }
} catch (error) {
  // Handle unexpected errors
  console.error('Unexpected error:', error);
}

// Cancel ongoing download
manager.cancelDownload();
```

## Platform Features

Check platform-specific features:

```typescript
const features = manager.getPlatformFeatures('instagram');
console.log(features);
// {
//   supportsQuality: false,
//   supportsMetadata: true,
//   requiresCookies: true,
//   supportedFormats: ['mp4']
// }
```

## Requirements

- **yt-dlp** must be installed on the system for most downloaders
- **ffmpeg** and **ffprobe** for video analysis and conversion
- For Instagram: May require cookies from a logged-in session
- For TikTok: Works best with yt-dlp due to anti-bot measures

## Notes

- All downloaders emit progress events during download
- Metadata is fetched before download when possible
- Failed downloads can be retried with the `maxRetries` option
- The GenericDownloader handles direct video URLs and serves as a fallback