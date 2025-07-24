# Frequently Asked Questions (FAQ)

This FAQ covers the most common questions about the video import feature. Questions are organized by category for easy navigation.

## Getting Started

### Q: What platforms are supported for video import?
**A:** We support:
- **YouTube** - Full videos, shorts, live streams (completed)
- **Instagram** - Posts, Reels, IGTV
- **Facebook** - Public videos and watch content
- **TikTok** - Public videos (all formats)
- **Direct URLs** - Any publicly accessible video file (.mp4, .mov, .avi, etc.)

### Q: Is there a limit on video length?
**A:** Yes, videos must be:
- **Maximum**: 60 minutes duration
- **Minimum**: No minimum length requirement
- **Recommended**: 5-30 minutes for best results and faster processing

### Q: How long does processing take?
**A:** Processing time depends on video length:
- **Short videos (< 5 min)**: 2-5 minutes
- **Medium videos (5-20 min)**: 5-15 minutes
- **Long videos (20-60 min)**: 15-30 minutes

Times vary based on video complexity, quality, and current system load.

### Q: Can I import private videos?
**A:** No, only publicly accessible videos can be imported. The video must be viewable without login or special permissions.

### Q: Do I need to create an account?
**A:** This depends on your deployment. Some instances require account creation, while others allow guest usage. Check with your system administrator.

## Technical Requirements

### Q: What internet speed do I need?
**A:** Recommended internet speeds:
- **Minimum**: 10 Mbps download speed
- **Recommended**: 25+ Mbps for best experience
- **Upload**: Not critical (only for settings/configuration)

### Q: Which browsers are supported?
**A:** Supported browsers:
- **Chrome** 90+ (recommended)
- **Firefox** 88+
- **Safari** 14+
- **Edge** 90+

### Q: Can I use this on mobile?
**A:** Yes, the interface is mobile-friendly, but:
- **Best experience**: Desktop/laptop computers
- **Mobile support**: Works on tablets and phones
- **Limitations**: Some features may be limited on small screens

### Q: Are there file size limits?
**A:** File size limits:
- **Maximum**: 10GB per video
- **Recommended**: Under 2GB for best performance
- **Note**: Larger files take longer to process

## Import Process

### Q: Why did my video import fail?
**A:** Common reasons for import failure:
- **Private or restricted video** - Must be publicly accessible
- **Geographic restrictions** - Video blocked in your region
- **Video too long** - Must be under 60 minutes
- **Network issues** - Check your internet connection
- **Invalid URL** - Ensure you're using the correct video URL

### Q: Can I cancel an import in progress?
**A:** Yes, you can cancel imports:
- **During any stage** of processing
- **Click the cancel button** in the progress interface
- **Note**: Partially processed data will be discarded
- **No charges** for cancelled imports

### Q: What happens if my internet disconnects during import?
**A:** The system handles connection issues gracefully:
- **Processing continues** on the server
- **Resume monitoring** when connection is restored
- **Check progress** by refreshing the page
- **WebSocket reconnects** automatically

### Q: Can I import multiple videos at once?
**A:** Yes, using **Batch Import**:
- **Up to 50 videos** per batch
- **CSV/text file upload** supported
- **Individual or global settings** for each batch
- **Real-time monitoring** of all videos

## Quality & Settings

### Q: Why is my output quality poor?
**A:** Quality issues can be caused by:
- **Source video quality** - Output cannot exceed source quality
- **Processing settings** - Try "High Quality" option
- **Network limitations** - Better connection may improve download quality
- **Platform compression** - Some platforms compress videos heavily

### Q: How do I choose the best orientation?
**A:** Choose based on your target platform:
- **Portrait (9:16)** - TikTok, Instagram Reels, YouTube Shorts
- **Landscape (16:9)** - YouTube, Facebook, desktop viewing
- **Square (1:1)** - Instagram feed, versatile for all platforms

### Q: Which music mood should I choose?
**A:** Music selection guide:
- **Upbeat** - Product demos, celebrations, energetic content
- **Calm** - Tutorials, educational content, explanations
- **Dramatic** - Storytelling, emotional content, reveals
- **Funny** - Comedy, memes, lighthearted content
- **Inspirational** - Success stories, motivation, achievements
- **None** - Interviews, original music content, ASMR

### Q: Why aren't AI highlights working well for my content?
**A:** AI highlight detection works best with:
- **Clear speech** - Background music shouldn't drown out dialogue
- **Natural pauses** - Good for creating segment boundaries
- **Varied content** - Monotone content is harder to highlight
- **Sufficient length** - Very short videos (< 2 minutes) may not generate highlights

Try adjusting the **content type** setting or **AI sensitivity** for better results.

## Transcription & Translation

### Q: How accurate is the transcription?
**A:** Transcription accuracy varies:
- **English content**: 90-95% accuracy typically
- **Clear speech**: Higher accuracy rates
- **Heavy accents**: May reduce accuracy
- **Background noise**: Can interfere with transcription
- **Multiple speakers**: May cause confusion

### Q: Can I edit the transcription?
**A:** Currently, transcription editing is limited:
- **Basic corrections** can be made in some interfaces
- **Manual review** is recommended for important content
- **Future updates** will include full editing capabilities
- **Contact support** for critical transcription corrections

### Q: Which languages are supported for translation?
**A:** Supported languages include:
- **Primary**: Portuguese, English, Spanish
- **Additional**: French, German, Italian, Japanese, Korean, Chinese
- **Translation quality** varies by language pair
- **English** typically has the best translation accuracy

### Q: Can I translate from any language to any other?
**A:** Translation capabilities:
- **Auto-detection** of source language
- **Best pairs**: English ↔ Portuguese, English ↔ Spanish
- **Quality varies** for less common language pairs
- **Manual review recommended** for important translations

## Batch Processing

### Q: How many videos can I process in a batch?
**A:** Batch processing limits:
- **Maximum**: 50 videos per batch
- **Recommended**: 10-25 videos for optimal performance
- **Processing time**: Scales with batch size and video lengths
- **Error handling**: Easier to manage with smaller batches

### Q: Can I use different settings for each video in a batch?
**A:** Yes, you have two options:
- **Global settings** - Same settings for all videos (faster setup)
- **Individual settings** - Customize each video separately (more flexible)

### Q: What happens if some videos fail in a batch?
**A:** Batch processing handles failures gracefully:
- **Other videos continue** processing normally
- **Failed videos retry** automatically (up to 3 times)
- **Error messages** show why specific videos failed
- **Partial success** - You get results for videos that succeeded

### Q: Can I add more videos to a batch that's already processing?
**A:** Currently, no:
- **Create a new batch** for additional videos
- **Wait for current batch** to complete
- **Plan your batches** in advance for efficiency
- **Future updates** may support dynamic batch modification

## Pricing & Usage

### Q: How much does video import cost?
**A:** Pricing varies by deployment:
- **Free tier** - Usually includes basic features with limits
- **Paid plans** - Often based on processing time or video count
- **Enterprise** - Custom pricing for high-volume usage
- **Check with your administrator** for specific pricing details

### Q: Are there usage limits?
**A:** Common limits include:
- **Video duration** - 60 minutes maximum
- **File size** - 10GB maximum
- **Monthly processing** - Varies by plan
- **Concurrent imports** - Usually 3-5 at once

### Q: What happens if I exceed my limits?
**A:** When limits are exceeded:
- **Processing stops** or is queued
- **Clear notification** of limit reached
- **Upgrade prompts** for higher limits
- **Contact support** for emergency processing needs

## Copyright & Legal

### Q: Can I import any video I find online?
**A:** Legal considerations:
- **Only public videos** can be technically imported
- **Copyright laws** still apply to imported content
- **Fair use guidelines** should be followed
- **Original creator rights** must be respected
- **Commercial use** may require additional permissions

### Q: What about copyrighted music in videos?
**A:** Copyright music handling:
- **System detects** some copyrighted content
- **Warnings provided** for potential issues
- **Replace with royalty-free** music when possible
- **Risk of takedowns** on target platforms
- **Always respect** copyright laws

### Q: How do I properly credit original creators?
**A:** Attribution best practices:
- **Always credit** the original creator
- **Include links** to original content when possible
- **Add value** through commentary or transformation
- **Follow platform** attribution requirements
- **When in doubt, ask permission** from original creators

## Troubleshooting

### Q: The video URL isn't being recognized. What should I do?
**A:** URL recognition troubleshooting:
1. **Verify the URL** is complete and correct
2. **Check if video is public** by opening in incognito browser
3. **Try copying URL again** from the platform
4. **Remove extra parameters** (everything after "&" or "?")
5. **Contact support** with the specific URL if issues persist

### Q: Processing seems stuck. How long should I wait?
**A:** When processing seems stuck:
- **Wait 10-15 minutes** - Some stages naturally take time
- **Check WebSocket connection** - Red indicator means no real-time updates
- **Refresh the page** - Get latest status update
- **Very long videos** can take 30+ minutes
- **Contact support** if stuck for over an hour

### Q: My video segments are too short/long. How do I fix this?
**A:** Segment length adjustment:
- **Adjust duration settings** - Increase min/max segment duration
- **Change AI sensitivity** - Higher sensitivity = more segments
- **Try different content type** - Educational vs Entertainment settings
- **Manual editing** - Some interfaces allow segment boundary adjustment

### Q: The transcription has many errors. What can I do?
**A:** Improving transcription quality:
- **Verify source language** is correctly set
- **Try videos with clearer audio** to test system
- **Use "High Accuracy" transcription** if available
- **Check for heavy background music** - Can interfere with speech recognition
- **Consider manual transcription** for critical content

### Q: Why can't I import Instagram/TikTok videos?
**A:** Platform-specific issues:
- **Private accounts** - Content must be public
- **Rate limiting** - Platform may temporarily block requests
- **Regional restrictions** - Content blocked in your location
- **Recently deleted** - Content may no longer exist
- **Try different content** from same platform to test

## Performance & Optimization

### Q: How can I make processing faster?
**A:** Speed optimization tips:
- **Process during off-peak hours** - Less system load
- **Use smaller batches** - 10-15 videos process faster than 50
- **Choose shorter videos** - Under 15 minutes process much faster
- **Good internet connection** - Faster downloads
- **Standard quality** - Faster than high-quality processing

### Q: Can I improve the quality of AI highlights?
**A:** AI highlight optimization:
- **Choose content type** - Educational, Entertainment, Interview, etc.
- **Adjust AI sensitivity** - Higher for more highlights, lower for fewer
- **Select videos with clear speech** - Better for content analysis
- **Avoid heavily music-dominated content** - Speech should be prominent
- **Try longer videos** - More content gives AI more to work with

### Q: What's the best batch size for my use case?
**A:** Batch size recommendations:
- **Testing new settings**: 3-5 videos
- **Regular processing**: 10-20 videos
- **Large projects**: 25-50 videos
- **Time-sensitive**: Smaller batches (5-10)
- **Overnight processing**: Larger batches acceptable

## Integration & Export

### Q: Where do my processed videos go?
**A:** After processing:
- **Video library** - Main storage area in the application
- **Download options** - Direct download to your computer
- **Cloud storage** - May integrate with cloud providers
- **Platform export** - Direct sharing to social media (if supported)

### Q: Can I download the original imported video?
**A:** Original video access:
- **Usually not stored** - Only processed segments kept
- **Storage limitations** - Originals take significant space
- **Re-import if needed** - Use original URL to import again
- **Contact support** for specific requirements

### Q: How do I export to different platforms?
**A:** Platform export options:
- **Download in target format** - Choose appropriate orientation/quality
- **Direct sharing** - Some deployments offer direct platform integration
- **Multiple formats** - Generate versions for different platforms
- **Batch export** - Download all processed videos at once

## Account & Data

### Q: How long are my videos stored?
**A:** Storage retention:
- **Varies by deployment** - Check with your administrator
- **Typically 30-90 days** for processed videos
- **Account settings** may allow longer retention
- **Download important videos** soon after processing

### Q: Can I delete my imported videos?
**A:** Video management:
- **Delete individual videos** - Usually available in video library
- **Batch deletion** - Select multiple videos to delete
- **Storage management** - Free up space by removing old videos
- **Irreversible deletion** - Make sure you have copies if needed

### Q: Is my data secure?
**A:** Data security measures:
- **Encrypted transmission** - All uploads/downloads encrypted
- **Secure storage** - Videos stored with appropriate security
- **Access controls** - Only you can access your videos
- **Regular backups** - System-level data protection
- **Privacy compliance** - Follows relevant data protection laws

## Future Features

### Q: What new features are planned?
**A:** Upcoming features may include:
- **Advanced editing tools** - More control over segments
- **Additional platforms** - LinkedIn, Vimeo, Twitch support
- **Better AI models** - Improved highlight detection
- **Real-time collaboration** - Team editing capabilities
- **API access** - Integration with other tools

### Q: Can I request a specific feature?
**A:** Feature requests:
- **User feedback** is valuable for development priorities
- **Submit suggestions** through support channels
- **Community voting** may influence feature development
- **Enterprise customers** may get priority feature consideration

### Q: How often are updates released?
**A:** Update frequency:
- **Regular updates** - Usually monthly or quarterly
- **Bug fixes** - As needed for critical issues
- **Major features** - Every few months
- **Platform updates** - When supported platforms change

## Getting Help

### Q: Where can I get more help?
**A:** Support resources:
- **Documentation** - Comprehensive guides and tutorials
- **Community forums** - User discussions and tips
- **Support tickets** - Direct technical support
- **Video tutorials** - Visual guides for common tasks
- **FAQ updates** - This page is regularly updated

### Q: How do I report a bug or issue?
**A:** Issue reporting:
- **Detailed description** - What happened and when
- **Steps to reproduce** - How to recreate the issue
- **Browser and system info** - Technical environment details
- **Screenshots/videos** - Visual evidence helps diagnosis
- **Sample URLs** - If specific videos are causing issues

### Q: Can I get training on using the system?
**A:** Training options:
- **Self-paced tutorials** - Work through at your own speed
- **Documentation** - Comprehensive written guides
- **Video tutorials** - Visual learning materials
- **Group training** - May be available for teams
- **One-on-one support** - For complex use cases

---

## Still Have Questions?

If your question isn't answered here:

1. **Check other documentation** - [Tutorial](./tutorial.md), [Settings Guide](./settings.md), [Troubleshooting](./troubleshooting.md)
2. **Search the community** - Other users may have similar questions
3. **Contact support** - Provide specific details about your question
4. **Suggest FAQ additions** - Help improve this resource for others

*This FAQ is regularly updated based on user questions. Last updated: January 2025*