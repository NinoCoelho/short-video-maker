# WebSocket Events Reference

The Short Video Maker Import API provides real-time updates through WebSocket connections for monitoring import progress, download status, and other asynchronous operations.

## Connection Information

**WebSocket URL**: `ws://localhost:3233`  
**Protocol**: Socket.IO  
**Transport**: WebSocket with polling fallback

## Client Setup

### JavaScript/Node.js

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3233', {
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

### Python

```python
import socketio

sio = socketio.Client()

@sio.event
def connect():
    print('Connected to server')

@sio.event
def disconnect():
    print('Disconnected from server')

sio.connect('http://localhost:3233')
```

## Client-to-Server Events

### Import Job Subscription

#### subscribe-import
Subscribe to updates for a specific import job.

**Event**: `subscribe-import`  
**Payload**: `string` (jobId)

```javascript
socket.emit('subscribe-import', 'job-550e8400-e29b-41d4-a716-446655440000');
```

#### unsubscribe-import
Unsubscribe from import job updates.

**Event**: `unsubscribe-import`  
**Payload**: `string` (jobId)

```javascript
socket.emit('unsubscribe-import', 'job-550e8400-e29b-41d4-a716-446655440000');
```

### Video Rendering Subscription

#### subscribe-video
Subscribe to updates for video rendering operations.

**Event**: `subscribe-video`  
**Payload**: `string` (videoId)

```javascript
socket.emit('subscribe-video', 'video-abc123');
```

#### unsubscribe-video
Unsubscribe from video rendering updates.

**Event**: `unsubscribe-video`  
**Payload**: `string` (videoId)

```javascript
socket.emit('unsubscribe-video', 'video-abc123');
```

### Download Job Subscription

#### subscribe-download
Subscribe to download progress updates.

**Event**: `subscribe-download`  
**Payload**: `string` (jobId)

```javascript
socket.emit('subscribe-download', 'download-job-123');
```

#### unsubscribe-download
Unsubscribe from download updates.

**Event**: `unsubscribe-download`  
**Payload**: `string` (jobId)

```javascript
socket.emit('unsubscribe-download', 'download-job-123');
```

### Health Check

#### ping
Send a health check ping to the server.

**Event**: `ping`  
**Payload**: None

```javascript
socket.emit('ping');
```

## Server-to-Client Events

### Import Progress Events

#### import-progress
Real-time updates during import processing.

**Event**: `import-progress`

**Payload Structure**:
```typescript
{
  jobId: string;
  progress: number;     // 0-100
  status: 'pending' | 'analyzing' | 'downloading' | 'processing' | 'segmenting' | 'completed' | 'failed';
  message?: string;     // Human-readable status message
  timestamp: string;    // ISO 8601 timestamp
}
```

**Example**:
```javascript
socket.on('import-progress', (data) => {
  console.log(`Job ${data.jobId}: ${data.progress}% - ${data.status}`);
  if (data.message) {
    console.log(`Status: ${data.message}`);
  }
});
```

**Sample Data**:
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 45,
  "status": "processing", 
  "message": "Extracting audio and analyzing content...",
  "timestamp": "2024-07-22T10:32:15.000Z"
}
```

#### import-complete
Notification when import job completes successfully.

**Event**: `import-complete`

**Payload Structure**:
```typescript
{
  jobId: string;
  videoId?: string;     // Generated video ID if applicable
  timestamp: string;
}
```

**Example**:
```javascript
socket.on('import-complete', (data) => {
  console.log(`Import job ${data.jobId} completed successfully!`);
  if (data.videoId) {
    console.log(`Generated video ID: ${data.videoId}`);
  }
});
```

#### import-error
Notification when import job fails.

**Event**: `import-error`

**Payload Structure**:
```typescript
{
  jobId: string;
  error: string;        // Error message
  timestamp: string;
}
```

**Example**:
```javascript
socket.on('import-error', (data) => {
  console.error(`Import job ${data.jobId} failed: ${data.error}`);
});
```

### Download Progress Events

#### download-progress
Real-time download progress updates.

**Event**: `download-progress`

**Payload Structure**:
```typescript
{
  jobId: string;
  videoId: string;
  progress: number;           // 0-100
  downloadedBytes: number;    // Bytes downloaded
  totalBytes: number;         // Total file size
  speed: string;              // Download speed (e.g., "1.2 MB/s")
  eta: string;                // Estimated time remaining (e.g., "00:02:30")
  timestamp: string;
}
```

**Example**:
```javascript
socket.on('download-progress', (data) => {
  const percent = ((data.downloadedBytes / data.totalBytes) * 100).toFixed(1);
  console.log(`Download ${percent}% complete - ${data.speed} - ETA: ${data.eta}`);
});
```

#### download-status
Download status updates.

**Event**: `download-status`

**Payload Structure**:
```typescript
{
  jobId: string;
  videoId: string;
  status: 'starting' | 'downloading' | 'completed' | 'failed';
  message?: string;
  timestamp: string;
}
```

#### download-complete
Notification when download completes.

**Event**: `download-complete`

**Payload Structure**:
```typescript
{
  jobId: string;
  videoId: string;
  filePath: string;     // Local file path
  fileSize: number;     // Final file size in bytes
  duration?: number;    // Video duration in seconds
  timestamp: string;
}
```

#### download-error
Notification when download fails.

**Event**: `download-error`

**Payload Structure**:
```typescript
{
  jobId: string;
  videoId: string;
  error: string;
  retries: number;      // Number of retry attempts made
  willRetry: boolean;   // Whether another retry will be attempted
  timestamp: string;
}
```

### Video Rendering Events

#### video-status
Video rendering status updates.

**Event**: `video-status`

**Payload Structure**:
```typescript
{
  videoId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;     // 0-100
  message?: string;
  timestamp: string;
}
```

#### video-complete
Video rendering completion notification.

**Event**: `video-complete`

**Payload Structure**:
```typescript
{
  videoId: string;
  outputPath: string;   // Path to rendered video file
  timestamp: string;
}
```

#### video-error
Video rendering error notification.

**Event**: `video-error`

**Payload Structure**:
```typescript
{
  videoId: string;
  error: string;
  timestamp: string;
}
```

### Health Check Response

#### pong
Response to ping health check.

**Event**: `pong`  
**Payload**: None

```javascript
socket.on('pong', () => {
  console.log('Server is responsive');
});
```

## Usage Examples

### Complete Import Monitoring

```javascript
import { io } from 'socket.io-client';

class ImportMonitor {
  constructor(serverUrl = 'http://localhost:3233') {
    this.socket = io(serverUrl);
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('Connected to import server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    // Import events
    this.socket.on('import-progress', this.handleImportProgress.bind(this));
    this.socket.on('import-complete', this.handleImportComplete.bind(this));
    this.socket.on('import-error', this.handleImportError.bind(this));

    // Download events
    this.socket.on('download-progress', this.handleDownloadProgress.bind(this));
    this.socket.on('download-complete', this.handleDownloadComplete.bind(this));
    this.socket.on('download-error', this.handleDownloadError.bind(this));
  }

  subscribeToImport(jobId) {
    console.log(`Subscribing to import job: ${jobId}`);
    this.socket.emit('subscribe-import', jobId);
    this.socket.emit('subscribe-download', jobId); // Also monitor downloads
  }

  unsubscribeFromImport(jobId) {
    console.log(`Unsubscribing from import job: ${jobId}`);
    this.socket.emit('unsubscribe-import', jobId);
    this.socket.emit('unsubscribe-download', jobId);
  }

  handleImportProgress(data) {
    console.log(`Import Progress - Job: ${data.jobId}, Progress: ${data.progress}%, Status: ${data.status}`);
    if (data.message) {
      console.log(`  Message: ${data.message}`);
    }
  }

  handleImportComplete(data) {
    console.log(`✅ Import completed successfully - Job: ${data.jobId}`);
    if (data.videoId) {
      console.log(`  Generated Video ID: ${data.videoId}`);
    }
    this.unsubscribeFromImport(data.jobId);
  }

  handleImportError(data) {
    console.error(`❌ Import failed - Job: ${data.jobId}, Error: ${data.error}`);
    this.unsubscribeFromImport(data.jobId);
  }

  handleDownloadProgress(data) {
    const progressBar = '█'.repeat(Math.floor(data.progress / 10)) + '░'.repeat(10 - Math.floor(data.progress / 10));
    console.log(`Download [${progressBar}] ${data.progress}% - ${data.speed} - ETA: ${data.eta}`);
  }

  handleDownloadComplete(data) {
    const fileSizeMB = (data.fileSize / (1024 * 1024)).toFixed(2);
    console.log(`✅ Download completed - ${fileSizeMB} MB saved to ${data.filePath}`);
  }

  handleDownloadError(data) {
    console.error(`❌ Download failed - ${data.error}`);
    if (data.willRetry) {
      console.log(`  Will retry (attempt ${data.retries + 1})`);
    }
  }

  checkHealth() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);
      
      this.socket.once('pong', () => {
        clearTimeout(timeout);
        resolve(true);
      });
      
      this.socket.emit('ping');
    });
  }

  disconnect() {
    this.socket.disconnect();
  }
}

// Usage
const monitor = new ImportMonitor();

// Start an import and monitor it
async function startImportWithMonitoring(url) {
  try {
    // Start import via REST API
    const response = await fetch('/api/import/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    const { jobId } = await response.json();
    
    // Monitor via WebSocket
    monitor.subscribeToImport(jobId);
    
    return jobId;
  } catch (error) {
    console.error('Failed to start import:', error);
  }
}
```

### React Hook for Import Monitoring

```javascript
import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useImportMonitor() {
  const [socket, setSocket] = useState(null);
  const [importProgress, setImportProgress] = useState({});
  const [downloadProgress, setDownloadProgress] = useState({});

  useEffect(() => {
    const socketInstance = io('http://localhost:3233');
    
    socketInstance.on('connect', () => {
      console.log('Connected to import server');
    });

    // Import events
    socketInstance.on('import-progress', (data) => {
      setImportProgress(prev => ({
        ...prev,
        [data.jobId]: data
      }));
    });

    socketInstance.on('import-complete', (data) => {
      setImportProgress(prev => ({
        ...prev,
        [data.jobId]: { ...prev[data.jobId], status: 'completed', progress: 100 }
      }));
    });

    socketInstance.on('import-error', (data) => {
      setImportProgress(prev => ({
        ...prev,
        [data.jobId]: { ...prev[data.jobId], status: 'failed', error: data.error }
      }));
    });

    // Download events
    socketInstance.on('download-progress', (data) => {
      setDownloadProgress(prev => ({
        ...prev,
        [data.jobId]: data
      }));
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const subscribeToJob = useCallback((jobId) => {
    if (socket) {
      socket.emit('subscribe-import', jobId);
      socket.emit('subscribe-download', jobId);
    }
  }, [socket]);

  const unsubscribeFromJob = useCallback((jobId) => {
    if (socket) {
      socket.emit('unsubscribe-import', jobId);
      socket.emit('unsubscribe-download', jobId);
    }
  }, [socket]);

  return {
    socket,
    importProgress,
    downloadProgress,
    subscribeToJob,
    unsubscribeFromJob
  };
}
```

### Vue.js Composable

```javascript
import { ref, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';

export function useWebSocket() {
  const socket = ref(null);
  const connected = ref(false);
  const importJobs = ref(new Map());

  onMounted(() => {
    socket.value = io('http://localhost:3233');

    socket.value.on('connect', () => {
      connected.value = true;
    });

    socket.value.on('disconnect', () => {
      connected.value = false;
    });

    socket.value.on('import-progress', (data) => {
      importJobs.value.set(data.jobId, data);
    });

    socket.value.on('import-complete', (data) => {
      const job = importJobs.value.get(data.jobId);
      if (job) {
        job.status = 'completed';
        job.progress = 100;
      }
    });

    socket.value.on('import-error', (data) => {
      const job = importJobs.value.get(data.jobId);
      if (job) {
        job.status = 'failed';
        job.error = data.error;
      }
    });
  });

  onUnmounted(() => {
    if (socket.value) {
      socket.value.disconnect();
    }
  });

  const subscribeToImport = (jobId) => {
    socket.value?.emit('subscribe-import', jobId);
  };

  const unsubscribeFromImport = (jobId) => {
    socket.value?.emit('unsubscribe-import', jobId);
    importJobs.value.delete(jobId);
  };

  return {
    socket,
    connected,
    importJobs,
    subscribeToImport,
    unsubscribeFromImport
  };
}
```

## Error Handling

### Connection Issues

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
  // Implement exponential backoff retry logic
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log(`Reconnection attempt #${attemptNumber}`);
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect to server');
  // Notify user of connection issues
});
```

### Event Error Handling

```javascript
// Wrap event handlers with error boundaries
function safeEventHandler(handler) {
  return (data) => {
    try {
      handler(data);
    } catch (error) {
      console.error('Event handler error:', error);
    }
  };
}

socket.on('import-progress', safeEventHandler((data) => {
  // Your event handling logic here
  updateProgressBar(data.progress);
}));
```

## Best Practices

### 1. Clean Up Subscriptions
Always unsubscribe from events when they're no longer needed to prevent memory leaks.

```javascript
// Keep track of active subscriptions
const activeSubscriptions = new Set();

function subscribeToImport(jobId) {
  socket.emit('subscribe-import', jobId);
  activeSubscriptions.add(jobId);
}

function unsubscribeAll() {
  activeSubscriptions.forEach(jobId => {
    socket.emit('unsubscribe-import', jobId);
  });
  activeSubscriptions.clear();
}

// Clean up on page unload
window.addEventListener('beforeunload', unsubscribeAll);
```

### 2. Handle Reconnections

```javascript
socket.on('reconnect', () => {
  // Re-subscribe to all active jobs after reconnection
  activeSubscriptions.forEach(jobId => {
    socket.emit('subscribe-import', jobId);
  });
});
```

### 3. Implement Timeouts

```javascript
function waitForImportCompletion(jobId, timeout = 300000) { // 5 minutes
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.emit('unsubscribe-import', jobId);
      reject(new Error('Import timeout'));
    }, timeout);

    socket.on('import-complete', (data) => {
      if (data.jobId === jobId) {
        clearTimeout(timer);
        resolve(data);
      }
    });

    socket.on('import-error', (data) => {
      if (data.jobId === jobId) {
        clearTimeout(timer);
        reject(new Error(data.error));
      }
    });

    socket.emit('subscribe-import', jobId);
  });
}
```

### 4. Rate Limit Event Processing

```javascript
import { debounce } from 'lodash';

// Debounce rapid progress updates
const debouncedProgressUpdate = debounce((data) => {
  updateProgressBar(data.progress);
}, 100);

socket.on('import-progress', debouncedProgressUpdate);
```

This WebSocket events documentation provides comprehensive coverage of all real-time communication patterns in the Short Video Maker Import API, complete with practical examples and best practices for different frameworks and use cases.