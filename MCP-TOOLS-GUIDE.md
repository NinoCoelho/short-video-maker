# Short Video Maker - MCP Tools Guide

This guide covers how to use the Short Video Maker through Claude using the Model Context Protocol (MCP).

## Available Tools

### 1. `get-video-status`
**Purpose**: Check the current status of a video by ID

**Parameters**:
- `videoId` (string, required): The unique ID of the video to check

**Usage**:
```
Please check the status of video "abc123"
```

**Returns**:
- Status (ready, processing, failed, pending)
- Progress percentage (if available)
- Current processing stage
- Error messages (if any)

### 2. `create-short-video`
**Purpose**: Create a short video from scenes with text and search terms

**Parameters**:
- `scenes` (array, required): Array of scenes with text and search terms
- `config` (object, required): Video configuration including voice, orientation, music

**Example Scene Structure**:
```json
{
  "text": "Welcome to our amazing tutorial",
  "searchTerms": "technology tutorial introduction"
}
```

**Example Config Structure**:
```json
{
  "voice": "Paulo",
  "language": "en",
  "orientation": "portrait",
  "music": "upbeat",
  "captionPosition": "bottom"
}
```

**Usage**:
```
Create a short video with these scenes:
1. "Welcome to our cooking channel" (search: cooking kitchen)
2. "Today we'll make pasta" (search: pasta cooking)
With Portuguese voice and portrait orientation.
```

### 3. `list-videos`
**Purpose**: List all videos with their current status

**Parameters**: None

**Usage**:
```
Show me all my videos
```

**Returns**:
- Video ID
- Current status
- Progress percentage
- Creation date
- Preview of first scene text

### 4. `delete-video`
**Purpose**: Delete a video by ID

**Parameters**:
- `videoId` (string, required): The ID of the video to delete

**Usage**:
```
Delete video with ID "abc123"
```

### 5. `search-videos`
**Purpose**: Search for background videos using keywords

**Parameters**:
- `query` (string, required): Search query for finding background videos
- `count` (number, optional): Number of videos to return (default: 5)

**Usage**:
```
Search for 10 background videos about "ocean waves"
```

**Returns**:
- Video ID
- Video URL
- Duration in seconds
- Dimensions (width x height)

### 6. `generate-tts`
**Purpose**: Generate text-to-speech audio from text

**Parameters**:
- `text` (string, required): Text to convert to speech
- `voice` (string, optional): Voice to use (default: Paulo)
- `language` (string, optional): Language - "pt" for Portuguese, "en" for English

**Usage**:
```
Generate TTS audio for "Hello, welcome to our channel" using English voice
```

**Returns**:
- Duration in seconds
- Audio URL
- Original text

### 7. `get-system-info`
**Purpose**: Get system information including available voices, music tags, and cache stats

**Parameters**: None

**Usage**:
```
Show me system information and available voices
```

**Returns**:
- Available voices list
- Available music tags
- Cache statistics (video count, total size)

## Common Usage Patterns

### Creating a Simple Video
```
Create a short video with these scenes:
1. "Hello everyone, welcome back to my channel" (search: "person talking")
2. "Today I'll show you an amazing life hack" (search: "life hack tips")
3. "Don't forget to like and subscribe" (search: "thumbs up subscribe")

Use English voice, portrait orientation, and upbeat music.
```

### Checking Video Progress
```
What's the status of my latest video?
```

### Finding Background Content
```
Find me 5 background videos about "city nightlife" for my next video
```

### Voice Testing
```
Generate a test audio saying "This is a test of the voice quality" in English
```

## Best Practices

1. **Descriptive Search Terms**: Use specific, descriptive search terms for better background video results
2. **Scene Length**: Keep individual scenes concise (1-2 sentences) for better pacing
3. **Voice Consistency**: Stick to one voice throughout a video for consistency
4. **Status Monitoring**: Check video status regularly during processing
5. **Resource Management**: Delete old videos to free up storage space

## Available Voices

Use the `get-system-info` tool to see all available voices. Common options include:
- Paulo (Portuguese)
- Various English voices
- Multiple language options

## Available Music Tags

Background music options include:
- upbeat
- calm
- energetic
- dramatic
- ambient
- And many more (check system info for complete list)

## Troubleshooting

### Video Processing Stuck
1. Check video status with `get-video-status`
2. Look at the error messages in the status response
3. Try deleting and recreating if needed

### Poor Background Video Results
1. Use more specific search terms
2. Try different keyword combinations
3. Search for alternative terms before creating the video

### TTS Issues
1. Check available voices with `get-system-info`
2. Ensure language parameter matches voice language
3. Keep text length reasonable for better quality