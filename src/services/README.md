# Download Queue Management System

This directory contains the implementation of a comprehensive download queue management system for the video import feature. The system provides concurrent download management, priority queuing, real-time progress tracking, and robust error handling.

## Architecture Overview

The download queue system consists of several interconnected components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  QueueService   │    │  StatusService  │    │ DownloadProcessor│
│                 │    │                 │    │                 │
│ • Priority queue│    │ • Status tracking│   │ • Integration   │
│ • Concurrency   │    │ • Progress mgmt │    │ • File handling │
│ • Retry logic   │    │ • Cleanup       │    │ • Error recovery│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │    EventBus     │
                    │                 │
                    │ • Event routing │
                    │ • WebSocket     │
                    │ • Real-time     │
                    └─────────────────┘
```

## Core Components

### 1. QueueService (`QueueService.ts`)

The main queue management service that handles:

- **Priority-based queuing** with 4 levels (LOW, NORMAL, HIGH, URGENT)
- **Concurrent download limits** (configurable, default: 3)
- **Retry mechanism** with exponential backoff
- **Download-specific queue operations**
- **Event emission** for real-time updates

```typescript
// Usage example
const queueService = QueueService.getInstance();

// Add download with high priority
await queueService.addDownload({
  url: 'https://example.com/video.mp4',
  videoId: 'video-123',
  jobId: 'job-456',
  filename: 'my-video.mp4'
}, QueuePriority.HIGH);

// Cancel download
await queueService.cancelDownload('job-456');

// Get queue status
const status = queueService.getQueueStatus('download');
```

### 2. StatusService (`StatusService.ts`)

Manages status and progress tracking:

- **Status lifecycle management** (pending → processing → completed/failed)
- **Download progress tracking** (bytes, speed, ETA)
- **Query operations** by type, video ID, etc.
- **Automatic cleanup** of old statuses
- **Event-driven updates**

```typescript
// Usage example
const statusService = StatusService.getInstance();

// Create download status
statusService.createDownloadStatus('job-123', {
  url: 'https://example.com/video.mp4',
  videoId: 'video-456'
});

// Update progress
statusService.updateDownloadProgress('job-123', {
  downloadedBytes: 500000,
  totalBytes: 1000000,
  speed: 50000,
  eta: 10,
  progress: 50
});
```

### 3. DownloadProcessor (`DownloadProcessor.ts`)

Orchestrates the entire download process:

- **Integration** with existing DownloaderManager
- **File management** and storage
- **Error handling** and recovery
- **Progress reporting** to EventBus
- **Cleanup utilities**

```typescript
// Usage example
const processor = DownloadProcessor.getInstance({
  outputDir: './downloads',
  maxConcurrentDownloads: 3
});

// Start download
const queueId = await processor.addDownload({
  url: 'https://example.com/video.mp4',
  videoId: 'video-123',
  jobId: 'job-456'
});
```

### 4. EventBus Extensions (`EventBus.ts`)

Extended with download-specific events:

- **Download Progress Events** - Real-time progress updates
- **Download Status Events** - Status changes
- **Download Complete Events** - Completion notifications
- **Download Error Events** - Error reporting with retry info

### 5. WebSocket Integration (`WebSocketServer.ts`)

Real-time client updates:

- **Download room subscriptions** - `subscribe-download` / `unsubscribe-download`
- **Progress broadcasts** - Live progress updates
- **Status notifications** - Real-time status changes
- **Error alerts** - Immediate error notifications

## System Integration

### Complete Setup (`initializeDownloadSystem.ts`)

```typescript
import { initializeDownloadSystem } from './initializeDownloadSystem';

// Initialize the complete system
const downloadSystem = initializeDownloadSystem({
  outputDir: './downloads',
  maxConcurrentDownloads: 3,
  defaultQuality: 'best',
  retryDelay: 5000,
  maxRetries: 3,
  enableCleanupTask: true,
  cleanupIntervalHours: 6
});

// Access components
const processor = downloadSystem.processor;
const queue = downloadSystem.queue;
const status = downloadSystem.status;
```

### API Integration (`downloadSystemIntegration.ts`)

Complete REST API endpoints:

```typescript
import { setupDownloadRoutes } from './downloadSystemIntegration';

// Add to your Express router
setupDownloadRoutes(router);
```

Available endpoints:
- `POST /api/download` - Start new download
- `GET /api/download/:jobId/status` - Get download status
- `POST /api/download/:jobId/cancel` - Cancel download
- `POST /api/download/metadata` - Fetch video metadata
- `GET /api/download/system/status` - System status
- `GET /api/download/active` - Active downloads
- `POST /api/download/system/concurrency` - Update limits
- `POST /api/download/system/cleanup` - Manual cleanup

## Key Features

### 1. Priority System

Downloads are processed based on priority:
```typescript
enum QueuePriority {
  LOW = 0,      // Background downloads
  NORMAL = 1,   // Regular downloads (default)
  HIGH = 2,     // Important downloads
  URGENT = 3    // Critical downloads
}
```

### 2. Concurrency Control

- Configurable maximum concurrent downloads
- Respects system resources
- Dynamic adjustment at runtime

### 3. Progress Tracking

Real-time progress information:
```typescript
interface DownloadProgressEvent {
  jobId: string;
  videoId: string;
  progress: number;        // 0-100
  downloadedBytes: number;
  totalBytes: number;
  speed: number;          // bytes/second
  eta: number;            // seconds
  timestamp: string;
}
```

### 4. Error Handling

- **Retry mechanism** with configurable attempts
- **Exponential backoff** for failed downloads
- **Error categorization** and reporting
- **Graceful degradation**

### 5. Resource Management

- **Automatic cleanup** of old downloads
- **Storage monitoring**
- **File organization**
- **Memory optimization**

## WebSocket Events

### Client Subscription

```javascript
// Subscribe to download updates
socket.emit('subscribe-download', jobId);

// Listen for events
socket.on('download-progress', (data) => {
  console.log(`Download ${data.jobId}: ${data.progress}%`);
});

socket.on('download-status', (data) => {
  console.log(`Status: ${data.status}`);
});

socket.on('download-complete', (data) => {
  console.log(`Download completed: ${data.filePath}`);
});

socket.on('download-error', (data) => {
  console.log(`Download failed: ${data.error}`);
});
```

## Configuration Options

### QueueService Options

```typescript
interface QueueOptions {
  maxConcurrent: number;     // Max concurrent downloads (default: 3)
  retryDelay: number;        // Delay between retries (default: 5000ms)
  defaultMaxRetries: number; // Max retry attempts (default: 3)
}
```

### DownloadProcessor Options

```typescript
interface DownloadProcessorConfig {
  outputDir: string;               // Download directory
  maxConcurrentDownloads: number;  // Concurrent limit
  defaultQuality: string;          // Video quality preference
  defaultFormat: string;           // Video format preference
  retryDelay: number;             // Retry delay
  maxRetries: number;             // Max retry attempts
  cleanupTempFiles: boolean;      // Auto cleanup temp files
}
```

### System Options

```typescript
interface DownloadSystemConfig {
  outputDir: string;
  maxConcurrentDownloads: number;
  enableCleanupTask: boolean;     // Enable automatic cleanup
  cleanupIntervalHours: number;   // Cleanup frequency
  // ... other options
}
```

## Testing

Comprehensive test suites are provided:

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- QueueService.test.ts
npm test -- StatusService.test.ts
```

Test coverage includes:
- Queue management operations
- Priority handling
- Concurrency control
- Status tracking
- Event emission
- Error handling
- Cleanup operations

## Performance Considerations

### Memory Usage

- **Lazy loading** of queue items
- **Automatic cleanup** of completed items
- **Bounded queue sizes**
- **Efficient event handling**

### Network Efficiency

- **Connection pooling** in downloaders
- **Resume capability** for interrupted downloads
- **Bandwidth throttling** support
- **Retry with backoff**

### Storage Optimization

- **Deduplication** of identical downloads
- **Compression** support
- **Cleanup automation**
- **Space monitoring**

## Monitoring & Debugging

### Logging

The system uses structured logging:

```typescript
import { logger } from '../logger';

// Logs include contextual information
logger.info('Download started', { 
  url, 
  jobId, 
  priority,
  queuePosition 
});
```

### Metrics

Access system metrics:

```typescript
// Get comprehensive system status
const status = await downloadSystem.getSystemStatus();
console.log(status);
// {
//   queue: { pending: 2, processing: 1, completed: 10, failed: 0 },
//   activeDownloads: 1,
//   storage: { totalFiles: 15, totalSize: 1073741824, ... }
// }
```

## Error Recovery

The system implements multiple layers of error recovery:

1. **Automatic retries** with exponential backoff
2. **Partial download resume** (where supported)
3. **Queue persistence** across restarts
4. **Graceful degradation** on system limits

## Future Enhancements

Planned improvements:
- **Download bandwidth limiting**
- **Schedule-based downloads**
- **Download resume from breakpoints**
- **Multi-source downloading**
- **Advanced prioritization algorithms**
- **Download analytics and reporting**