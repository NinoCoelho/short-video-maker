# Batch Import Guide

Process multiple videos simultaneously with the Batch Import feature. This powerful tool allows you to import and process dozens of videos with consistent settings, saving time and ensuring uniform output quality.

## What is Batch Import?

Batch Import lets you:
- **Process multiple videos simultaneously** - Up to 50 videos per batch
- **Apply consistent settings** - Same configuration across all videos
- **Monitor progress in real-time** - Track each video individually
- **Handle errors gracefully** - Retry failed imports automatically
- **Save time** - Set up once, process many videos

## Accessing Batch Import

### From the Main Interface
1. Navigate to the **Import Video** page
2. Look for the **"Batch Import"** tab or button
3. Click to switch to the batch import interface

### Direct URL
- Access directly at `/import/batch` in your browser
- Bookmark for quick access to batch processing

## Adding Videos to Your Batch

### Method 1: Single URL Entry

**Step by step:**
1. **Find the URL input field** at the top of the batch interface
2. **Paste a video URL** from any supported platform
3. **Press Enter or click "Add"** to add to your batch
4. **Repeat** for each video you want to process

**Supported formats:**
- YouTube: `https://youtube.com/watch?v=...`
- Instagram: `https://instagram.com/p/...`
- TikTok: `https://tiktok.com/@user/video/...`
- Facebook: `https://facebook.com/watch/...`
- Direct URLs: `https://example.com/video.mp4`

### Method 2: CSV File Upload

**Preparing your CSV file:**
1. **Create a CSV file** with video information
2. **Include required columns**: URL (required), Title (optional)
3. **Save as .csv format** from Excel, Google Sheets, or text editor

**CSV Format Example:**
```csv
URL,Title
https://youtube.com/watch?v=dQw4w9WgXcQ,Tutorial 1
https://youtube.com/watch?v=abc123def456,Tutorial 2  
https://instagram.com/p/ABC123/,Instagram Post
https://tiktok.com/@user/video/123456,TikTok Video
```

**Uploading CSV:**
1. **Drag and drop** your CSV file into the upload area
2. **Or click** the upload area to browse for files
3. **System validates** URLs and shows preview
4. **Confirm** to add all videos to batch

### Method 3: Text File Upload

**Preparing text file:**
1. **One URL per line** in a plain text file
2. **No headers needed** - just URLs
3. **Save with .txt extension**

**Text File Example:**
```
https://youtube.com/watch?v=dQw4w9WgXcQ
https://youtube.com/watch?v=abc123def456
https://instagram.com/p/ABC123/
https://tiktok.com/@user/video/123456
```

**Uploading text file:**
1. **Drag and drop** or click to browse
2. **System parses** each line as a URL
3. **Invalid URLs** are highlighted for correction
4. **Valid URLs** are added to batch

### Method 4: Playlist/Channel Import (YouTube)

**Importing from YouTube playlists:**
1. **Copy playlist URL**: `https://youtube.com/playlist?list=...`
2. **Paste into batch importer** 
3. **System extracts** all videos from playlist
4. **Review and confirm** video list

**Note**: Only public playlists are supported

## Batch Settings Configuration

### Global Settings vs Individual Settings

**Global Settings (Recommended)**
- **One configuration** applied to all videos
- **Faster setup** and consistent results
- **Ideal for similar content** from same creator/topic
- **Easy to manage** and replicate

**Individual Settings**
- **Customize each video** separately
- **Maximum flexibility** for varied content
- **More time consuming** to configure
- **Best for mixed content types**

### Configuring Global Settings

**Access Settings:**
1. Click **"Batch Settings"** button
2. Configure all options as you would for single import
3. Settings apply to all videos in batch

**Recommended Global Settings by Use Case:**

**Educational Content Batch:**
```
Target Language: Match your audience
Music: Calm or None
Orientation: Landscape or Portrait (consistent)
AI Highlights: Enabled
Segment Duration: 60-120 seconds
Content Type: Educational
```

**Social Media Content Batch:**
```
Target Language: Auto-detect
Music: Upbeat or Trendy
Orientation: Portrait (9:16)
AI Highlights: Enabled  
Segment Duration: 15-45 seconds
Content Type: Entertainment
```

**Professional/Business Batch:**
```
Target Language: English or target audience
Music: Inspirational or None
Orientation: Square (1:1) for versatility
AI Highlights: Enabled
Segment Duration: 45-90 seconds
Overlay: Professional logo
```

### Individual Video Customization

**When to use individual settings:**
- Mixed content types (tutorials + entertainment)
- Different source languages in same batch
- Varying target platforms
- Special requirements per video

**Configuring individual settings:**
1. **Disable "Use Global Settings"** toggle
2. **Click edit icon** on any video card
3. **Configure settings** for that specific video
4. **Repeat** for videos needing custom settings

## Batch Processing Interface

### Video Cards Overview

Each video in your batch displays:

**Video Information:**
- **Thumbnail** (when available)
- **Title** extracted from platform
- **URL** source location
- **Platform** automatically detected
- **Duration** (when available)

**Status Indicators:**
- **🟢 Pending** - Waiting to process
- **🔵 Processing** - Currently being imported
- **✅ Completed** - Successfully processed
- **🔴 Error** - Failed with error message
- **⏸️ Paused** - Temporarily halted

**Progress Information:**
- **Progress bar** showing completion percentage
- **Current step** (Downloading, Transcribing, etc.)
- **Estimated time remaining**
- **File size information**

### Batch Statistics Dashboard

**Real-time Overview:**
- **Total Videos**: Number of videos in batch
- **Completed**: Successfully processed count
- **Processing**: Currently active imports  
- **Errors**: Failed imports requiring attention
- **Pending**: Waiting in queue

**Progress Tracking:**
- **Overall Progress Bar**: Batch completion percentage
- **Estimated Completion**: When all videos will be done
- **Processing Speed**: Videos per hour rate
- **Resource Usage**: System load information

### Queue Management

**Processing Order:**
- Videos process in **first-added, first-processed** order
- **Failed videos** automatically retry up to 3 times
- **High-priority videos** can be moved to front of queue
- **Pause/resume** individual videos or entire batch

**Concurrent Processing:**
- **Default**: 3 videos process simultaneously
- **System automatically** adjusts based on resource availability
- **Large files** may reduce concurrent processing
- **Network conditions** affect processing speed

## Monitoring Batch Progress

### Real-Time Updates

**WebSocket Connection Status:**
- **🟢 Connected** - Real-time updates active
- **🟡 Reconnecting** - Temporary connection issue
- **🔴 Offline** - Manual refresh required for updates

**Update Frequency:**
- **Progress updates** every 3-5 seconds
- **Status changes** immediately
- **Error notifications** in real-time
- **Completion alerts** when videos finish

### Progress Details

**Per-Video Progress:**
Each video shows detailed progress through stages:

1. **Analyzing URL** (5%) - Validating and extracting metadata
2. **Downloading** (10-30%) - Fetching video from source
3. **Transcribing** (20-40%) - Converting speech to text  
4. **AI Analysis** (20-30%) - Detecting highlights and scenes
5. **Processing** (20-40%) - Creating segments and applying settings
6. **Finalizing** (5-10%) - Quality checks and file optimization

**Batch-Level Progress:**
- **Aggregate completion** across all videos
- **Average processing time** per video
- **Bottleneck identification** (which stage is slowest)
- **Resource utilization** monitoring

### Error Handling in Batches

**Automatic Error Recovery:**
- **Retry Logic**: Failed videos automatically retry 3 times
- **Exponential Backoff**: Increasing delays between retries
- **Error Classification**: Different handling for different error types
- **Partial Success**: Continue processing successful videos

**Error Types and Responses:**

**Network Errors:**
```
Symptoms: Download failures, timeouts
Response: Automatic retry with delay
User Action: Usually none required
Recovery Rate: ~85% successful on retry
```

**Platform Restrictions:**
```
Symptoms: "Video unavailable" errors
Response: Clear error message, no retry
User Action: Check video accessibility
Recovery: Manual intervention required
```

**Processing Errors:**
```
Symptoms: Transcription or AI analysis failures
Response: Skip failed step, continue processing
User Action: Review results, manual correction
Recovery: Partial processing completed
```

**Resource Constraints:**
```
Symptoms: System overload, slow processing
Response: Reduce concurrent processing
User Action: Wait or try during off-peak hours
Recovery: Automatic when resources available
```

### Manual Batch Management

**Pause/Resume Operations:**
- **Pause Batch**: Stops all processing, maintains queue
- **Resume Batch**: Continues from where paused
- **Pause Individual**: Stop specific video without affecting others
- **Priority Adjustment**: Move videos up/down in queue

**Quality Control:**
- **Preview Results**: Check completed videos before full batch finishes
- **Cancel Processing**: Stop and remove videos from batch  
- **Retry Failed**: Manual retry for videos that failed
- **Modify Settings**: Adjust settings for remaining videos

## Batch Configuration Management

### Saving Batch Configurations

**Why Save Configurations:**
- **Reuse successful settings** for similar content
- **Share with team members** for consistent output
- **Quick setup** for regular batch processing
- **Version control** for different content types

**How to Save:**
1. **Configure your perfect settings** for a content type
2. **Click "Save Configuration"** 
3. **Name your configuration** descriptively
4. **Add description/notes** for future reference
5. **Configuration saved** for future use

**Configuration Examples:**
```
"Weekly Tutorial Batch"
- Language: English
- Music: Calm
- Orientation: Landscape
- Duration: 60-120 seconds
- Notes: For educational YouTube content

"TikTok Trend Batch"  
- Language: Auto-detect
- Music: Upbeat
- Orientation: Portrait
- Duration: 15-30 seconds
- Notes: Short-form entertainment content

"Product Review Series"
- Language: English  
- Music: None (preserve original)
- Orientation: Square
- Duration: 45-75 seconds
- Notes: Professional product content
```

### Loading Saved Configurations

**Access Saved Configs:**
1. **Click "Options" menu** in batch interface
2. **Select "Load Configuration"**
3. **Choose from saved configurations**
4. **Settings automatically applied** to batch

**Configuration Management:**
- **Edit existing** configurations as needs change
- **Delete unused** configurations to stay organized
- **Duplicate configurations** for variations
- **Import/Export** configurations for backup

## Advanced Batch Features

### Batch Analytics

**Processing Statistics:**
- **Average processing time** per video
- **Success rate** percentage
- **Most common errors** and frequencies
- **Peak processing hours** for optimization

**Content Analysis:**
- **Platform distribution** (YouTube vs TikTok vs others)
- **Content length patterns**
- **Language distribution**
- **Quality metrics** across batch

**Performance Insights:**
- **Optimal batch sizes** for your content
- **Best processing times** based on system load
- **Settings effectiveness** for different content types
- **Error patterns** to avoid in future batches

### Integration with Existing Workflows

**Library Integration:**
- **Processed videos** automatically appear in main library
- **Organized by batch** for easy identification
- **Searchable metadata** from batch processing
- **Consistent naming** based on batch settings

**Export Options:**
- **Bulk download** all processed videos
- **Platform-specific exports** (TikTok, YouTube, etc.)
- **Quality variants** (different resolutions)
- **Metadata exports** (CSV with video information)

### Team Collaboration Features

**Shared Batch Processing:**
- **Multiple team members** can monitor same batch
- **Real-time collaboration** on batch management
- **Role-based permissions** for batch operations
- **Activity logging** for team accountability

**Batch Templates:**
- **Share successful configurations** with team
- **Standardize processing** across team members
- **Version control** for batch configurations
- **Best practices documentation**

## Batch Import Best Practices

### Content Selection

**✅ Good Batch Candidates:**
- Similar content type (all tutorials, all entertainment)
- Consistent audio quality across videos
- Same source platform (all YouTube, all Instagram)
- Similar length videos (processing time consistency)
- Same target audience/language

**❌ Avoid in Same Batch:**
- Mixed languages requiring different processing
- Vastly different content types (tutorial + comedy)
- Mixed quality levels (HD + low-res)
- Different target platforms requiring different orientations
- Copyright-sensitive content mixed with safe content

### Batch Size Optimization

**Small Batches (5-10 videos):**
```
Advantages:
- Faster completion time
- Easier error management
- Good for testing settings
- Quick iteration

Best for:
- Testing new content types
- Time-sensitive projects
- Learning optimal settings
- High-priority content
```

**Medium Batches (15-25 videos):**
```
Advantages:
- Good efficiency balance
- Manageable error rates  
- Reasonable completion times
- Suitable for most use cases

Best for:
- Regular content processing
- Weekly batch processing
- Mixed but similar content
- Standard workflows
```

**Large Batches (30-50 videos):**
```
Advantages:
- Maximum efficiency
- Bulk processing power
- Consistent settings application
- Good for large projects

Best for:
- Archive processing
- Large content libraries
- Consistent content types
- Overnight processing
```

### Timing Your Batches

**Optimal Processing Times:**
- **Off-peak hours** (late evening, early morning)
- **Weekends** when server load is lower
- **After testing** settings with single imports
- **When you can monitor** initial progress

**Avoid Processing During:**
- Peak usage hours (business hours in your timezone)
- When you need immediate results
- Before testing settings on similar content
- During known platform maintenance windows

### Error Prevention

**Pre-Batch Checklist:**
- [ ] **Test settings** with 1-2 similar videos first
- [ ] **Verify all URLs** are publicly accessible
- [ ] **Check content consistency** across batch
- [ ] **Ensure sufficient system resources**
- [ ] **Set realistic expectations** for completion time

**During Processing:**
- [ ] **Monitor first few videos** for early error detection
- [ ] **Check WebSocket connection** status
- [ ] **Watch for recurring errors** that indicate settings issues
- [ ] **Be available for intervention** if needed

## Troubleshooting Batch Import

### Common Batch Issues

**Problem: "Batch processing very slow"**
```
Possible Causes:
- Large video files in batch
- Peak server usage times
- Network connectivity issues
- Too many concurrent batches

Solutions:
- Process during off-peak hours
- Reduce batch size
- Check internet connection  
- Wait for better system availability
```

**Problem: "Multiple videos failing with same error"**
```
Possible Causes:
- Incorrect global settings
- Platform-wide restrictions
- System resource constraints
- Network issues

Solutions:
- Check settings with single import first
- Try different content to isolate issue
- Reduce concurrent processing
- Contact support with error details
```

**Problem: "Batch stuck on one video"**
```
Possible Causes:
- Very large video file
- Complex content requiring more processing
- Network timeout issues
- System resource bottleneck

Solutions:
- Wait (some videos take longer)
- Check video specifications
- Cancel and retry problematic video
- Process large videos individually
```

**Problem: "WebSocket connection keeps dropping"**
```
Possible Causes:
- Network connectivity issues
- Firewall blocking WebSocket
- Browser/security software interference
- Server connectivity problems

Solutions:
- Check network connection
- Try different browser
- Disable ad blockers temporarily
- Refresh page to reconnect
```

### Recovery Strategies

**Partial Batch Failure:**
1. **Identify pattern** in failed videos
2. **Correct underlying issue** (settings, URLs, etc.)
3. **Retry failed videos** individually or as new batch
4. **Adjust settings** based on failures
5. **Continue with successful videos**

**Complete Batch Failure:**
1. **Check system status** and connectivity
2. **Verify batch settings** with single test import
3. **Reduce batch size** significantly
4. **Try during different time** when system is less loaded
5. **Contact support** if issues persist

### Getting Help with Batches

**Self-Diagnosis:**
- Review **error messages** for specific details
- Check **individual video accessibility** in browser
- Test **settings with single import** before batch
- Monitor **system resources** during processing

**Community Support:**
- Share **successful batch configurations**
- Ask for **troubleshooting help** with specific errors
- Learn from **others' batch strategies**
- Contribute to **best practices documentation**

**Technical Support:**
- Provide **batch configuration details**
- Include **specific error messages**
- Share **example URLs** that are failing
- Describe **steps taken** before encountering issues

## Batch Import Success Stories

### Case Study 1: Educational Content Creator
**Challenge**: Process 40 tutorial videos for multiple platforms
**Solution**: 
- Used educational content preset
- Processed in 2 batches of 20 videos each
- Applied consistent branding across all videos
**Results**: 
- 95% success rate
- 8 hours total processing time
- Consistent quality across all outputs
- 200% increase in cross-platform engagement

### Case Study 2: Social Media Agency
**Challenge**: Client needed 100 Instagram posts converted to TikTok
**Solution**:
- CSV upload with all client URLs
- Portrait orientation with upbeat music
- Processed in 4 batches of 25 videos
**Results**:
- 92% success rate  
- 12 hours total processing
- Client gained 50K new TikTok followers
- Established efficient workflow for future clients

### Case Study 3: Corporate Training
**Challenge**: Convert 25 webinar recordings to microlearning content
**Solution**:
- Long-form educational content settings
- AI highlights to identify key teaching moments
- Consistent professional branding
**Results**:
- 200+ short training videos generated
- 85% improvement in employee engagement
- Reduced training time by 60%
- Standardized format across all departments

## Next Steps

After mastering batch import:

1. **Experiment with different batch sizes** to find your optimal workflow
2. **Create and refine configuration presets** for different content types
3. **Integrate batch processing** into your regular content workflow
4. **Share successful configurations** with your team or community
5. **Monitor analytics** to continuously improve your batch processing strategy

**Expand your skills:**
- [Advanced Import Settings](./settings.md) - Fine-tune for perfect results
- [Platform Optimization](./platforms/) - Platform-specific batch strategies
- [Tips & Best Practices](./tips.md) - Advanced techniques and optimizations
- [Troubleshooting Guide](./troubleshooting.md) - Solve complex batch issues

Ready to process your first batch? Start with 3-5 similar videos to learn the system, then scale up as you gain confidence!