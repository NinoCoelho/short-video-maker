# WebSocket API Documentation

## Overview

The Short Video Maker WebSocket API provides real-time communication for video processing updates, eliminating the need for polling and providing instant feedback on video creation progress.

## Connection Details

### Endpoint
- **WebSocket URL**: `ws://localhost:3123` (development)
- **Production**: `wss://your-domain.com`

### Supported Transports
- WebSocket (primary)
- Polling (fallback)

### Connection Options
```javascript
const socket = io('ws://localhost:3123', {
  transports: ['websocket', 'polling'],
  upgrade: true,
  rememberUpgrade: true
});
```

## Authentication

Currently, no authentication is required for WebSocket connections. Future versions may implement token-based authentication.

## Connection Events

### Client → Server Events

#### `subscribe:video`
Subscribe to updates for a specific video.

**Payload:**
```javascript
socket.emit('subscribe:video', videoId);
```

**Parameters:**
- `videoId` (string): The unique identifier of the video

**Response:**
```javascript
socket.on('subscribed:video', (data) => {
  console.log('Subscribed to video:', data.videoId);
});
```

#### `unsubscribe:video`
Unsubscribe from updates for a specific video.

**Payload:**
```javascript
socket.emit('unsubscribe:video', videoId);
```

**Response:**
```javascript
socket.on('unsubscribed:video', (data) => {
  console.log('Unsubscribed from video:', data.videoId);
});
```

#### `subscribe:all`
Subscribe to updates for all videos (useful for list views).

**Payload:**
```javascript
socket.emit('subscribe:all');
```

**Response:**
```javascript
socket.on('subscribed:all', () => {
  console.log('Subscribed to all video updates');
});
```

#### `unsubscribe:all`
Unsubscribe from all video updates.

**Payload:**
```javascript
socket.emit('unsubscribe:all');
```

**Response:**
```javascript
socket.on('unsubscribed:all', () => {
  console.log('Unsubscribed from all video updates');
});
```

#### `ping`
Health check ping.

**Payload:**
```javascript
socket.emit('ping');
```

**Response:**
```javascript
socket.on('pong', () => {
  console.log('Server is responsive');
});
```

### Server → Client Events

#### `video:status:update`
Emitted when a video's status changes.

**Event Data:**
```javascript
{
  videoId: "abc123xyz",
  status: "processing",
  progress: 45,
  message: "Processing audio for scene 1",
  timestamp: "2025-01-12T10:30:00Z"
}
```

**Status Values:**
- `pending`: Video is queued for processing
- `processing`: Video is being processed
- `ready`: Video processing completed successfully
- `failed`: Video processing failed

#### `video:processing:progress`
Emitted during video processing with progress updates.

**Event Data:**
```javascript
{
  videoId: "abc123xyz",
  progress: 75,
  stage: "Rendering video frames",
  message: "Rendering video frames (75%)",
  timestamp: "2025-01-12T10:32:00Z"
}
```

#### `video:completed`
Emitted when video processing completes successfully.

**Event Data:**
```javascript
{
  videoId: "abc123xyz",
  result: {
    // Video processing result data
    outputPath: "/videos/abc123xyz.mp4",
    duration: 30.5,
    scenes: [...]
  },
  timestamp: "2025-01-12T10:35:00Z"
}
```

#### `video:error`
Emitted when video processing encounters an error.

**Event Data:**
```javascript
{
  videoId: "abc123xyz",
  error: "Failed to process scene 2: Audio generation timeout",
  timestamp: "2025-01-12T10:33:00Z"
}
```

#### `scene:processing`
Emitted during individual scene processing.

**Event Data:**
```javascript
{
  videoId: "abc123xyz",
  sceneIndex: 1,
  totalScenes: 3,
  stage: "Finding videos for scene",
  progress: 35,
  timestamp: "2025-01-12T10:31:00Z"
}
```

## Usage Examples

### React Hook Integration

```javascript
import { useVideoStatus } from '../hooks/useVideoStatus';

function VideoList() {
  const { status, isConnected, subscribeToAll } = useVideoStatus();
  
  useEffect(() => {
    if (isConnected) {
      subscribeToAll();
    }
  }, [isConnected]);
  
  useEffect(() => {
    if (status) {
      console.log('Video update:', status);
      // Update UI based on status
    }
  }, [status]);
  
  return (
    <div>
      Connection: {isConnected ? 'Connected' : 'Disconnected'}
      {status && (
        <div>
          Video {status.id}: {status.status} ({status.progress}%)
        </div>
      )}
    </div>
  );
}
```

### Direct Socket.IO Usage

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3123');

// Connection events
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
  
  // Subscribe to all videos
  socket.emit('subscribe:all');
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket server');
});

// Video events
socket.on('video:status:update', (data) => {
  console.log('Video status update:', data);
  updateVideoInUI(data.videoId, data.status, data.progress);
});

socket.on('video:processing:progress', (data) => {
  console.log('Processing progress:', data);
  updateProgressBar(data.videoId, data.progress, data.stage);
});

socket.on('video:completed', (data) => {
  console.log('Video completed:', data);
  markVideoAsComplete(data.videoId);
});

socket.on('video:error', (data) => {
  console.log('Video error:', data);
  showErrorMessage(data.videoId, data.error);
});

socket.on('scene:processing', (data) => {
  console.log('Scene processing:', data);
  updateSceneProgress(data.videoId, data.sceneIndex, data.stage);
});
```

### Node.js Client Example

```javascript
const { io } = require('socket.io-client');

const socket = io('ws://localhost:3123');

socket.on('connect', () => {
  console.log('Connected to video processing server');
  
  // Subscribe to specific video
  socket.emit('subscribe:video', 'video-abc123');
});

socket.on('video:status:update', (data) => {
  console.log(`Video ${data.videoId} status: ${data.status}`);
  if (data.progress) {
    console.log(`Progress: ${data.progress}%`);
  }
});

socket.on('video:completed', (data) => {
  console.log(`Video ${data.videoId} processing completed!`);
  process.exit(0);
});

socket.on('video:error', (data) => {
  console.error(`Video ${data.videoId} failed: ${data.error}`);
  process.exit(1);
});
```

## Error Handling

### Connection Errors

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
  // Implement retry logic or fallback to HTTP polling
});
```

### Reconnection Logic

```javascript
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server initiated disconnect, don't auto-reconnect
    console.log('Server disconnected the client');
  } else {
    // Network issue, will auto-reconnect
    console.log('Connection lost, attempting to reconnect...');
  }
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
});
```

## Best Practices

### 1. Subscription Management
- Subscribe to specific videos when viewing individual video details
- Subscribe to all videos when viewing video lists
- Always unsubscribe when components unmount

### 2. Error Handling
- Implement fallback to HTTP polling when WebSocket connection fails
- Handle network interruptions gracefully
- Show connection status to users

### 3. Performance
- Throttle rapid updates to prevent UI flickering
- Use WebSocket for real-time updates, HTTP for initial data loading
- Implement proper cleanup in React components

### 4. Development vs Production
```javascript
const socketUrl = process.env.NODE_ENV === 'production' 
  ? 'wss://your-domain.com' 
  : 'ws://localhost:3123';
```

## Troubleshooting

### Common Issues

#### Connection Refused
- Ensure the server is running on the correct port
- Check firewall settings
- Verify CORS configuration

#### Events Not Received
- Confirm subscription to the correct video ID
- Check server logs for event emission
- Verify client event listeners are registered

#### Performance Issues
- Monitor the number of concurrent connections
- Implement proper event throttling
- Use rooms for targeted broadcasting

### Debug Mode

Enable debug logging in the browser:
```javascript
localStorage.setItem('debug', 'socket.io-client:*');
```

## Rate Limiting

WebSocket connections are subject to the same rate limiting as HTTP requests:
- 100 requests per minute per IP
- Connection limits may apply

## Security Considerations

- WebSocket connections inherit CORS policies
- Future versions will implement authentication
- SSL/TLS encryption in production environments

## Version Compatibility

- Client version: socket.io-client ^4.8.1
- Server version: socket.io ^4.8.1
- Protocol version: 4

---

**Last Updated**: January 12, 2025  
**Version**: 1.0  
**Protocol**: Socket.IO v4