# WebSocket API Documentation

This document describes the WebSocket API for real-time communication in the Short Video Maker application.

## Connection

The WebSocket server is available at the same host and port as the main HTTP server.

```javascript
const socket = io(window.location.origin);
```

## Connection Events

### Client to Server

#### `ping`
Health check ping to verify connection status.
```javascript
socket.emit('ping');
```

#### `subscribe:video`
Subscribe to updates for a specific video.
```javascript
socket.emit('subscribe:video', videoId);
```

#### `unsubscribe:video`
Unsubscribe from updates for a specific video.
```javascript
socket.emit('unsubscribe:video', videoId);
```

#### `subscribe:all`
Subscribe to all video updates (useful for list views).
```javascript
socket.emit('subscribe:all');
```

#### `unsubscribe:all`
Unsubscribe from all video updates.
```javascript
socket.emit('unsubscribe:all');
```

### Server to Client

#### `connect`
Emitted when the client successfully connects to the server.
```javascript
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
});
```

#### `disconnect`
Emitted when the client disconnects from the server.
```javascript
socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket server');
});
```

#### `pong`
Response to ping for health check.
```javascript
socket.on('pong', () => {
  console.log('Server is alive');
});
```

#### `subscribed:video`
Confirmation of video subscription.
```javascript
socket.on('subscribed:video', ({ videoId }) => {
  console.log(`Subscribed to video ${videoId}`);
});
```

#### `unsubscribed:video`
Confirmation of video unsubscription.
```javascript
socket.on('unsubscribed:video', ({ videoId }) => {
  console.log(`Unsubscribed from video ${videoId}`);
});
```

#### `subscribed:all`
Confirmation of global subscription.
```javascript
socket.on('subscribed:all', () => {
  console.log('Subscribed to all video updates');
});
```

#### `unsubscribed:all`
Confirmation of global unsubscription.
```javascript
socket.on('unsubscribed:all', () => {
  console.log('Unsubscribed from all video updates');
});
```

## Video Status Events

### `video:status:update`
Emitted when a video's status changes.

**Payload:**
```typescript
interface VideoStatusUpdate {
  videoId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  progress?: number;      // 0-100
  message?: string;       // Human-readable status message
}
```

**Example:**
```javascript
socket.on('video:status:update', (update) => {
  console.log(`Video ${update.videoId} status: ${update.status}`);
  if (update.progress !== undefined) {
    console.log(`Progress: ${update.progress}%`);
  }
});
```

### `video:processing:progress`
Emitted during video processing with detailed progress information.

**Payload:**
```typescript
interface VideoProcessingProgress {
  videoId: string;
  stage: string;          // Current processing stage
  progress: number;       // 0-100
  total?: number;         // Total items to process (optional)
  message?: string;       // Additional progress details
}
```

**Example:**
```javascript
socket.on('video:processing:progress', (progress) => {
  console.log(`Video ${progress.videoId}: ${progress.stage} - ${progress.progress}%`);
});
```

### `scene:processing`
Emitted when processing individual scenes within a video.

**Payload:**
```typescript
interface SceneProcessing {
  videoId: string;
  sceneIndex: number;     // Current scene being processed (0-based)
  totalScenes: number;    // Total number of scenes
  stage: string;          // Current processing stage for this scene
  progress?: number;      // Optional progress within the scene
}
```

**Example:**
```javascript
socket.on('scene:processing', (sceneProgress) => {
  console.log(`Video ${sceneProgress.videoId}: Processing scene ${sceneProgress.sceneIndex + 1}/${sceneProgress.totalScenes}`);
  console.log(`Stage: ${sceneProgress.stage}`);
});
```

### `video:completed`
Emitted when a video has been successfully processed and is ready.

**Payload:**
```typescript
interface VideoCompleted {
  videoId: string;
  outputPath: string;     // Path to the completed video file
  duration?: number;      // Video duration in seconds (optional)
}
```

**Example:**
```javascript
socket.on('video:completed', (completion) => {
  console.log(`Video ${completion.videoId} completed! Available at: ${completion.outputPath}`);
});
```

### `video:error`
Emitted when a video processing error occurs.

**Payload:**
```typescript
interface VideoError {
  videoId: string;
  error: string;          // Error message
  stage?: string;         // Stage where the error occurred (optional)
}
```

**Example:**
```javascript
socket.on('video:error', (error) => {
  console.error(`Video ${error.videoId} failed: ${error.error}`);
  if (error.stage) {
    console.error(`Failed during: ${error.stage}`);
  }
});
```

## Usage Patterns

### Single Video Monitoring
Use this pattern when displaying a single video's details page:

```javascript
const { useVideoStatus } = require('./hooks/useVideoStatus');

function VideoDetailsPage({ videoId }) {
  const { status, isConnected } = useVideoStatus(videoId);
  
  return (
    <div>
      <h1>Video {videoId}</h1>
      <p>Status: {status?.status}</p>
      <p>Progress: {status?.progress}%</p>
      <p>Connection: {isConnected ? 'Connected' : 'Disconnected'}</p>
    </div>
  );
}
```

### Video List Monitoring
Use this pattern when displaying a list of videos:

```javascript
const { useVideoStatus } = require('./hooks/useVideoStatus');

function VideoListPage() {
  const { status, isConnected } = useVideoStatus(); // No specific videoId
  
  // Listen for all video updates and update your list accordingly
  
  return (
    <div>
      <h1>All Videos</h1>
      <p>Real-time updates: {isConnected ? 'ON' : 'OFF'}</p>
      {/* Render video list */}
    </div>
  );
}
```

## Error Handling

The WebSocket connection includes automatic reconnection logic. If the connection is lost:

1. The client will attempt to reconnect automatically
2. The UI should fall back to HTTP polling
3. Once reconnected, real-time updates will resume

```javascript
socket.on('connect_error', (error) => {
  console.error('WebSocket connection error:', error);
  // Implement fallback logic here
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
  // Re-subscribe to necessary channels
});
```

## Connection Lifecycle

1. **Initial Connection**: Client connects and receives `connect` event
2. **Subscription**: Client subscribes to specific videos or all updates
3. **Real-time Updates**: Server sends relevant events based on subscriptions
4. **Disconnection**: Connection lost, client attempts automatic reconnection
5. **Reconnection**: Upon successful reconnection, client should re-subscribe

## Performance Considerations

- The server automatically manages subscriptions and only sends relevant updates
- Connections are cleaned up automatically when clients disconnect
- The server uses rooms to efficiently broadcast to relevant subscribers only
- Ping/pong mechanism ensures connection health and enables quick failure detection

## Security

- WebSocket connections inherit the same CORS policies as the HTTP server
- In production, connections are restricted to the same origin
- In development, localhost connections are allowed for testing

## Testing

You can test the WebSocket API using the browser's developer console:

```javascript
// Connect
const socket = io();

// Subscribe to a video
socket.emit('subscribe:video', 'your-video-id');

// Listen for updates
socket.on('video:status:update', console.log);
socket.on('video:processing:progress', console.log);
socket.on('scene:processing', console.log);

// Health check
socket.emit('ping');
socket.on('pong', () => console.log('Server responded to ping'));
```