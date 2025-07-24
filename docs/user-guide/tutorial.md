# Complete Video Import Tutorial

This comprehensive tutorial walks you through every aspect of the video import process, from basic imports to advanced features.

## Overview of the Import Process

The video import feature follows a 3-step wizard:
1. **Enter Video URL** - Provide the source video
2. **Configure Settings** - Customize processing options
3. **Import Progress** - Monitor real-time processing

Let's go through each step in detail.

## Step 1: Enter Video URL

### Accessing the Import Feature

1. **Navigate to Import Page**
   - From your dashboard, click "Import Video" in the main navigation
   - Or use the direct URL: `/import`

2. **Understanding the Interface**
   - You'll see a progress stepper showing all 3 steps
   - The current step is highlighted
   - You can navigate back to previous steps if needed

### URL Input Interface

#### Supported URL Formats

The system automatically detects and handles various URL formats:

**YouTube URLs:**
```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/dQw4w9WgXcQ
https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s
```

**Instagram URLs:**
```
https://www.instagram.com/p/ABC123/
https://www.instagram.com/reel/ABC123/
https://www.instagram.com/tv/ABC123/
```

**Facebook URLs:**
```
https://www.facebook.com/watch/?v=123456789
https://fb.watch/abc123/
```

**TikTok URLs:**
```
https://www.tiktok.com/@username/video/1234567890
https://vm.tiktok.com/ABC123/
```

**Direct Video URLs:**
```
https://example.com/video.mp4
https://cdn.example.com/videos/sample.mov
```

#### URL Validation

The system performs several validation checks:

- ✅ **URL Format** - Must be a valid URL structure
- ✅ **Platform Recognition** - Detects supported platforms
- ✅ **Accessibility** - Verifies the video is publicly accessible
- ✅ **File Type** - Ensures it's a video file
- ✅ **Size Limits** - Checks video duration and file size

#### Real-time Feedback

As you type, the system provides immediate feedback:

- **🟢 Green checkmark** - Valid URL detected
- **🟡 Yellow warning** - URL needs verification
- **🔴 Red error** - Invalid or unsupported URL

#### URL Analysis

Once you enter a valid URL, the system shows:

- **Platform Detection** - Which platform was detected
- **Video Preview** - Title, duration, and thumbnail (when available)
- **Estimated Processing Time** - Based on video length
- **Compatibility Status** - Whether the video can be processed

### Troubleshooting URL Issues

**Problem: "URL not recognized"**
- Solution: Ensure you're copying the full URL
- Check that the video is publicly accessible
- Try opening the URL in a new browser tab first

**Problem: "Private video detected"**
- Solution: The video must be public to import
- Check video privacy settings on the platform
- Consider downloading and using direct file upload

**Problem: "Video too long"**
- Solution: Videos must be under 60 minutes
- Consider editing the original to a shorter length
- Use URL parameters to specify start/end times (YouTube only)

## Step 2: Configure Import Settings

### Language & Transcription Settings

#### Target Language Selection

Choose the language for your output content:

- **Automatic Detection** - System detects original language
- **Manual Selection** - Choose from 15+ supported languages
- **Translation Options** - Translate to different target language

**Supported Languages:**
- Portuguese (pt) - Primary language
- English (en) - Most content
- Spanish (es) - Growing content
- French (fr) - European content
- German (de) - European content
- Italian (it) - European content
- Japanese (ja) - Asian content
- Korean (ko) - Asian content
- Chinese (zh) - Asian content

#### How Translation Works

1. **Original Transcription** - Audio is transcribed in original language
2. **Language Detection** - AI detects the source language
3. **Translation** - Content is translated to target language
4. **Subtitle Generation** - Translated text becomes subtitles
5. **Quality Check** - AI verifies translation accuracy

### Background Music Settings

#### Music Mood Options

Select the perfect mood for your content:

**🎵 Upbeat**
- Energetic and positive
- Great for: Tutorials, celebrations, announcements
- BPM: 120-140
- Instruments: Electronic, pop, uplifting melodies

**😌 Calm**
- Relaxing and peaceful
- Great for: Meditation, nature content, explanations
- BPM: 60-90
- Instruments: Acoustic, ambient, soft piano

**🎭 Dramatic**
- Intense and emotional
- Great for: Storytelling, revelations, climactic moments
- BPM: 80-120
- Instruments: Orchestral, cinematic, building tension

**😄 Funny**
- Light and humorous
- Great for: Comedy, memes, lighthearted content
- BPM: 100-130
- Instruments: Quirky, playful, cartoon-like

**💪 Inspirational**
- Motivating and uplifting
- Great for: Success stories, motivation, achievements
- BPM: 90-120
- Instruments: Orchestral builds, triumphant melodies

**🔇 No Music**
- Keep original audio only
- Great for: Interviews, lectures, original content
- Preserves: Original audio quality and ambient sounds

#### Music Volume & Mixing

The system automatically:
- **Balances** music with speech
- **Ducks** music during speech
- **Fades** music in and out
- **Synchronizes** with video cuts

### Video Orientation Settings

#### Understanding Aspect Ratios

Choose the optimal format for your target platform:

**📱 Portrait (9:16)**
- Perfect for: TikTok, Instagram Reels, YouTube Shorts
- Dimensions: 1080x1920 pixels
- Best for: Mobile viewing, vertical content
- Smart cropping: Focuses on main subject

**🖥️ Landscape (16:9)**
- Perfect for: YouTube videos, Facebook, desktop viewing
- Dimensions: 1920x1080 pixels
- Best for: Traditional video content, presentations
- Smart cropping: Maintains original framing when possible

**⬜ Square (1:1)**
- Perfect for: Instagram feed posts, Facebook posts
- Dimensions: 1080x1080 pixels
- Best for: Social media posts, versatile viewing
- Smart cropping: Centers main subject

#### Smart Cropping Technology

Our AI-powered cropping system:

1. **Subject Detection** - Identifies people, faces, and key objects
2. **Motion Tracking** - Follows subjects as they move
3. **Scene Analysis** - Understands context and importance
4. **Smooth Transitions** - Creates natural camera movements
5. **Manual Override** - Allows fine-tuning when needed

### AI Features Settings

#### Auto-Highlight Detection

**What it does:**
- Analyzes video content using local AI
- Identifies engaging moments and key scenes
- Scores segments based on engagement potential
- Creates optimal cut points for short-form content

**AI Analysis includes:**
- **Speech Analysis** - Identifies key phrases and topics
- **Visual Analysis** - Detects scene changes and activity
- **Audio Analysis** - Finds music beats and sound cues
- **Context Understanding** - Maintains story coherence

**Customization Options:**
- **Sensitivity** - How selective the AI should be
- **Minimum Segment Length** - Shortest clips to create (10-30 seconds)
- **Maximum Segment Length** - Longest clips to create (30-180 seconds)
- **Content Type** - Tutorial, entertainment, educational, etc.

### Overlay Settings

#### Available Overlay Types

**None**
- Clean video without overlays
- Best for: Professional content, minimal branding

**Subscribe Button**
- Animated subscribe reminder
- Positions: Corner placement options
- Timing: Appears at optimal moments
- Customizable: Text and styling options

**Channel Logo**
- Your brand logo watermark
- Transparency: Subtle but visible
- Positioning: Corner or custom placement
- Size: Scalable based on video dimensions

**Watermark**
- Text or image watermark
- Copyright protection
- Customizable opacity and position
- Can include website or social handles

**Custom Image**
- Upload your own overlay image
- Supports: PNG, JPG, SVG formats
- Alpha channel supported for transparency
- Positioning: Flexible placement options

#### Overlay Best Practices

- **Keep it subtle** - Don't distract from content
- **Consider mobile viewing** - Ensure readability on small screens
- **Brand consistency** - Use consistent colors and fonts
- **Strategic timing** - Show overlays when most effective

### Advanced Settings (Optional)

#### Processing Quality Options

**Standard Quality**
- Processing time: Faster
- Output quality: Good for most content
- File size: Smaller
- Best for: Quick turnaround, social media

**High Quality**
- Processing time: Slower
- Output quality: Maximum quality
- File size: Larger
- Best for: Professional content, large displays

#### Custom Segment Duration

Fine-tune the length of generated clips:

**Minimum Duration (10-30 seconds)**
- Shorter clips for maximum engagement
- Best for: TikTok, Instagram Reels
- Considerations: May lose context

**Maximum Duration (30-180 seconds)**
- Longer clips for more complete stories
- Best for: YouTube Shorts, detailed content
- Considerations: May reduce engagement

#### Content Type Hints

Help the AI understand your content:

- **Educational** - Tutorials, how-tos, explanations
- **Entertainment** - Comedy, music, viral content
- **News/Documentary** - Informational, factual content
- **Sports** - Action sequences, highlights
- **Lifestyle** - Daily life, vlogs, personal content

## Step 3: Import Progress & Monitoring

### Understanding the Progress Interface

#### Progress Indicators

**Overall Progress Bar**
- Shows completion percentage (0-100%)
- Color codes: Blue (processing), Green (complete), Red (error)
- Estimated time remaining updates in real-time

**Stage Indicators**
1. **Downloading** - Fetching video from source
2. **Transcribing** - Converting speech to text
3. **Analyzing** - AI processing for highlights
4. **Processing** - Creating final video segments
5. **Finalizing** - Preparing files for download

#### Real-time Updates

The interface updates every few seconds with:
- **Current Stage** - What's happening right now
- **Detailed Status** - Specific operations being performed
- **Progress Percentage** - How much of current stage is complete
- **Time Estimates** - Expected completion time
- **File Information** - Sizes, formats, quality metrics

### Monitoring Progress

#### WebSocket Connection Status

**Connected (Green)**
- Real-time updates active
- Progress updates immediately
- Cancel operations available

**Disconnected (Orange)**
- Updates may be delayed
- Manual refresh required
- Limited control options

**Connection Failed (Red)**
- No real-time updates
- Check network connection
- Progress shown on page refresh

#### Processing Stages Explained

**Stage 1: Downloading (10-30% of total time)**
- Fetching video from source platform
- Validating file integrity
- Extracting basic metadata
- Creating local copy

*What you'll see:*
- Download speed in MB/s
- Bytes downloaded / total size
- Video quality being downloaded
- Any platform-specific messages

**Stage 2: Transcribing (20-40% of total time)**
- Extracting audio track
- Running speech recognition
- Generating timestamps
- Language detection

*What you'll see:*
- Audio processing status
- Transcription confidence scores
- Detected language
- Word-by-word progress

**Stage 3: Analyzing (20-30% of total time)**
- AI content analysis
- Highlight detection
- Scene boundary detection
- Topic extraction

*What you'll see:*
- AI model loading status
- Analysis completion percentage
- Number of highlights found
- Confidence scores for segments

**Stage 4: Processing (20-40% of total time)**
- Video segmentation
- Orientation cropping
- Subtitle generation
- Music synchronization

*What you'll see:*
- Number of segments being created
- Cropping analysis progress
- Rendering queue status
- Output file generation

**Stage 5: Finalizing (5-10% of total time)**
- Final quality checks
- File compression
- Metadata writing
- Cleanup operations

*What you'll see:*
- Quality verification
- File optimization
- Thumbnail generation
- Completion confirmation

### Error Handling & Recovery

#### Common Processing Errors

**Download Errors**
- **Network timeout**: Automatically retries 3 times
- **Private video**: Shows clear error message
- **File too large**: Explains size limits
- **Invalid format**: Suggests alternative approaches

**Processing Errors**
- **Transcription failed**: Offers manual subtitle option
- **AI timeout**: Uses fallback highlight detection
- **Insufficient disk space**: Shows storage requirements
- **Memory issues**: Processes in smaller chunks

**Recovery Options**
- **Resume from checkpoint**: Continue where left off
- **Skip failed step**: Proceed with available data
- **Try alternative approach**: Different processing method
- **Manual override**: User can specify parameters

#### When Things Go Wrong

**If processing stops:**
1. Check the error message for specific details
2. Look for retry options (automatic or manual)
3. Check your internet connection
4. Try a different, shorter video to test system
5. Contact support if errors persist

**If progress seems stuck:**
1. Wait 5-10 minutes (some stages take time)
2. Check WebSocket connection status
3. Refresh page to get latest status
4. Large videos naturally take longer

### Completion & Results

#### What Happens When Complete

1. **Notification** - Browser notification and on-screen alert
2. **Automatic Redirect** - Takes you to the results page
3. **Library Update** - Videos appear in your main library
4. **Email Notification** - Optional email when processing complete

#### Reviewing Your Results

**Generated Videos**
- **Segment Count** - Number of short clips created
- **Quality Metrics** - Resolution, bitrate, file sizes
- **Duration Range** - Shortest and longest segments
- **Highlight Scores** - AI confidence in each segment

**Transcription Results**
- **Original Text** - Complete transcription
- **Translated Text** - If translation was requested
- **Confidence Scores** - Accuracy estimates
- **Timeline** - Word-by-word timestamps

**Processing Statistics**
- **Total Processing Time** - How long import took
- **File Sizes** - Original vs. processed sizes
- **Quality Metrics** - Technical specifications
- **Resource Usage** - System resources consumed

## Advanced Features

### Batch Import Integration

If you're processing multiple videos, the progress interface shows:
- **Batch Progress** - Overall completion across all videos
- **Individual Progress** - Status of each video in the batch
- **Queue Position** - Where each video stands in line
- **Estimated Completion** - When all videos will be done

### Manual Override Options

During processing, you can:
- **Adjust Segments** - Modify AI-detected boundaries
- **Edit Transcription** - Correct transcription errors
- **Modify Highlights** - Add or remove key moments
- **Change Settings** - Update music, overlays, or orientation

### Quality Control

The system automatically:
- **Validates Output** - Ensures all files are properly created
- **Checks Quality** - Verifies video and audio integrity
- **Optimizes Files** - Compresses without quality loss
- **Generates Previews** - Creates thumbnails and preview clips

## Next Steps

After completing your first import:

1. **Review Results** - Check the generated segments
2. **Make Adjustments** - Edit if needed using manual tools
3. **Download or Share** - Get your final videos
4. **Try Advanced Features** - Explore batch import and custom settings
5. **Optimize Settings** - Learn from results to improve future imports

## Getting Help

- **Real-time Issues**: Check the [Troubleshooting Guide](./troubleshooting.md)
- **Platform-Specific Help**: See [Platform Guides](./platforms/)
- **Settings Questions**: Review [Import Settings](./settings.md)
- **Best Practices**: Read [Tips & Best Practices](./tips.md)

Ready to try more advanced features? Check out [Batch Import](./batch-import.md) or [Platform-Specific Guides](./platforms/)!