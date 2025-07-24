# Troubleshooting Guide

This comprehensive troubleshooting guide helps you resolve common issues with the video import feature. Issues are organized by category with step-by-step solutions.

## Quick Diagnosis Checklist

Before diving into specific issues, run through this quick checklist:

- [ ] **Internet connection** - Stable broadband connection (10+ Mbps)
- [ ] **Browser compatibility** - Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- [ ] **Video accessibility** - Can you play the video in your browser?
- [ ] **URL format** - Complete, unmodified URL from the platform
- [ ] **System resources** - Sufficient RAM and disk space available
- [ ] **Browser cache** - Try clearing cache and cookies if issues persist

## Import Issues

### URL Not Recognized or Invalid

**Error Messages:**
- "Invalid URL format"
- "URL not supported"
- "Unable to parse video URL"
- "Platform not recognized"

**Diagnosis Steps:**
1. **Copy URL again** - Get fresh URL from the original platform
2. **Check URL completeness** - Ensure entire URL was copied
3. **Remove extra parameters** - Delete everything after additional "&" or "?" if present
4. **Test URL accessibility** - Open URL in incognito browser window

**Solutions:**

**For YouTube URLs:**
```
✅ Correct formats:
- https://www.youtube.com/watch?v=dQw4w9WgXcQ
- https://youtu.be/dQw4w9WgXcQ
- https://m.youtube.com/watch?v=dQw4w9WgXcQ

❌ Problematic formats:
- youtube.com/watch?v=dQw4w9WgXcQ (missing protocol)
- https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=... (extra parameters may cause issues)
```

**For Instagram URLs:**
```
✅ Correct formats:
- https://www.instagram.com/p/ABC123/
- https://instagram.com/reel/ABC123/
- https://www.instagram.com/tv/ABC123/

❌ Problematic formats:
- instagram.com/p/ABC123 (missing protocol and trailing slash)
- https://www.instagram.com/p/ABC123/?utm_source=... (remove UTM parameters)
```

**Advanced Solutions:**
- **Try mobile version** - Sometimes mobile URLs work better
- **Check for redirects** - URL may redirect to different format
- **Remove tracking parameters** - Clean URL of UTM and other tracking codes
- **Contact support** - Provide specific URL that's causing issues

### Video Download Failures

**Error Messages:**
- "Failed to download video"
- "Video unavailable"
- "Download timeout"
- "Network error during download"

**Common Causes:**
- Private or restricted video
- Geographic content blocking
- Platform rate limiting
- Network connectivity issues
- Video was deleted after URL was copied

**Step-by-Step Solutions:**

**1. Verify Video Accessibility:**
```
Test steps:
1. Open URL in incognito browser window
2. Try different browser (Chrome vs Firefox)
3. Test from different network (mobile data vs WiFi)
4. Check if video plays without issues
```

**2. Check for Restrictions:**
```
Common restrictions:
- Age-restricted content (requires login)
- Geographic blocking (VPN may help)
- Private account content
- Recently deleted videos
```

**3. Network Troubleshooting:**
```
Network fixes:
1. Test internet speed (need 10+ Mbps)
2. Try wired connection instead of WiFi
3. Restart router/modem
4. Switch to different DNS (8.8.8.8, 1.1.1.1)
5. Temporarily disable VPN/proxy
```

**4. Platform-Specific Solutions:**

**YouTube Issues:**
- **Age restrictions** - Video may require login to view
- **Regional blocking** - Content blocked in your country
- **Copyright strikes** - Video may have been taken down
- **Live streams** - Only completed streams can be imported

**Instagram Issues:**
- **Private accounts** - Cannot import private account content
- **Story expiration** - Stories expire after 24 hours
- **Platform blocking** - Instagram actively blocks automated access

**TikTok Issues:**
- **Account restrictions** - Some creators block downloading
- **Regional variations** - Different content in different regions
- **Rapid deletion** - TikTok videos are often quickly deleted

### Processing Failures

**Error Messages:**
- "Processing failed"
- "Transcription error"
- "AI analysis timeout"
- "File corruption detected"

**Diagnosis Questions:**
- What stage did processing fail at?
- Is this happening with multiple videos or just one?
- What's the source video quality and length?
- Are you using default settings or custom configuration?

**Solutions by Processing Stage:**

**Download Stage Failures:**
```
Symptoms: Fails immediately after starting
Solutions:
1. Check video accessibility (open URL in browser)
2. Verify internet connection stability
3. Try shorter video to test system
4. Wait 10-15 minutes and retry (rate limiting)
```

**Transcription Stage Failures:**
```
Symptoms: Downloads successfully but fails during transcription
Solutions:
1. Check if video has audible speech
2. Try "High Accuracy" transcription setting
3. Specify source language manually
4. Test with different video to isolate issue
```

**AI Analysis Stage Failures:**
```
Symptoms: Transcription works but AI analysis fails
Solutions:
1. Disable AI highlights temporarily
2. Try "Standard" instead of "Advanced" AI model
3. Reduce video length (under 30 minutes)
4. Check system load (try during off-peak hours)
```

**Processing Stage Failures:**
```
Symptoms: Analysis completes but final processing fails
Solutions:
1. Try "Standard Quality" instead of "High Quality"
2. Reduce concurrent processing if in batch
3. Clear browser cache and restart import
4. Check available disk space
```

## Quality Issues

### Poor Video Quality Output

**Symptoms:**
- Blurry or pixelated video
- Audio quality degradation
- Color distortion or compression artifacts
- Synchronization issues

**Diagnostic Questions:**
- How is the quality of the original source video?
- What processing quality setting are you using?
- Is this affecting all your imports or specific videos?
- What's your internet connection speed?

**Solutions:**

**1. Source Quality Check:**
```
Quality verification:
1. Play original video at highest quality setting
2. Check if source video is HD (1080p) or higher
3. Note any existing compression artifacts
4. Remember: Output cannot exceed source quality
```

**2. Processing Settings Optimization:**
```
Quality settings:
- Use "High Quality" processing option
- Enable "Enhanced Processing" if available
- Choose appropriate orientation for your needs
- Avoid excessive compression settings
```

**3. Network Optimization:**
```
Connection improvements:
- Ensure stable 25+ Mbps connection
- Use wired connection for large videos
- Process during off-peak hours
- Avoid other bandwidth-heavy activities
```

**4. Platform-Specific Quality Issues:**

**Instagram Content:**
- Instagram heavily compresses uploads
- Quality may be inherently limited
- Try "High Quality" processing to compensate
- Consider finding original source if available

**TikTok Content:**
- Often already compressed for mobile
- May not benefit from further processing
- Best to keep original resolution and format
- Focus on content optimization over quality enhancement

### Audio Problems

**Symptoms:**
- No audio in processed video
- Audio out of sync with video
- Poor audio quality or distortion
- Background music too loud/quiet

**Step-by-Step Audio Troubleshooting:**

**1. Source Audio Verification:**
```
Check original video:
1. Play original video - does it have audio?
2. Check volume levels - is audio audible?
3. Note audio language and quality
4. Identify background music vs. speech ratio
```

**2. Import Settings Review:**
```
Audio-related settings:
- Music setting: Try "None" to preserve original
- Language settings: Specify correct source language
- Processing quality: Higher quality may preserve audio better
- Content type: Choose appropriate type for content
```

**3. Common Audio Fixes:**
```
Audio synchronization:
- Retry import process (temporary processing glitch)
- Try "Standard Quality" if "High Quality" fails
- Report sync issues with specific video URLs
- Check if original video has sync issues

Audio missing:
- Verify original video has audio track
- Try different browser (audio codec compatibility)
- Check system audio settings and permissions
- Test with different video to isolate issue

Audio quality poor:
- Source may have poor audio quality
- Try "High Quality" processing setting
- Consider adding background music to mask issues
- Use "Audio Enhancement" if available
```

### Smart Cropping Issues

**Symptoms:**
- Subject cut off in cropped video
- Jerky or unnatural camera movements
- Important content outside frame
- Poor framing decisions by AI

**Smart Cropping Troubleshooting:**

**1. Content Assessment:**
```
Evaluate source content:
- Is main subject clearly visible and centered?
- Does subject move significantly during video?
- Are there multiple subjects competing for attention?
- Is lighting consistent throughout video?
```

**2. Orientation Choice:**
```
Optimal orientation selection:
- Portrait (9:16): Best for single subject content
- Square (1:1): Good compromise for varied content
- Landscape (16:9): Preserves original framing when possible
- Consider manual cropping for complex scenes
```

**3. Content Type Optimization:**
```
Content-specific solutions:
- Talking head videos: Portrait usually works well
- Action scenes: May need manual adjustment
- Multiple subjects: Square format often better
- Text-heavy content: Ensure text area is preserved
```

## AI and Transcription Issues

### Transcription Accuracy Problems

**Symptoms:**
- Numerous transcription errors
- Missing words or phrases
- Wrong language detection
- Garbled or nonsensical text

**Accuracy Improvement Steps:**

**1. Language Configuration:**
```
Language settings check:
- Verify correct source language selected
- Try "Auto-detect" vs. manual selection
- Check for mixed languages in content
- Consider regional language variants
```

**2. Audio Quality Factors:**
```
Audio considerations:
- Heavy background music reduces accuracy
- Multiple speakers cause confusion
- Accents and speaking speed affect results
- Ambient noise and echo problems
```

**3. Content Type Adjustments:**
```
Optimize for transcription:
- Choose content with clear, single speaker
- Avoid videos with heavy music overlay
- Technical jargon may reduce accuracy
- Conversational speech usually transcribes better
```

**4. Advanced Transcription Solutions:**
```
Improvement techniques:
- Use "High Accuracy" transcription setting
- Try processing shorter segments
- Manually specify correct language
- Consider videos with existing captions
```

### AI Highlight Detection Issues

**Symptoms:**
- No highlights detected
- Poor quality highlight selection
- Highlights don't make sense
- AI missing obvious key moments

**AI Optimization Solutions:**

**1. Content Suitability Assessment:**
```
AI-friendly content characteristics:
- Clear speech with natural pauses
- Varied emotional inflection
- Topic changes and transitions
- Visual scene variety
- Moderate background music levels
```

**2. Settings Optimization:**
```
AI settings adjustment:
- Try different content type selections
- Adjust AI sensitivity (higher = more highlights)
- Enable "Deep Analysis" if available
- Set appropriate segment duration ranges
```

**3. Content Type Specific Fixes:**
```
Educational content:
- Set content type to "Educational"
- Look for natural lesson boundaries
- Key concepts and summaries work well
- Q&A sections are good highlight candidates

Entertainment content:
- Set content type to "Entertainment"
- Look for punchlines and reactions
- Climatic moments and reveals
- Audience engagement moments

Interview content:
- Set content type to "Interview"
- Best quotes and insights
- Emotional moments and reactions
- Topic transitions and conclusions
```

## Browser and Technical Issues

### WebSocket Connection Problems

**Symptoms:**
- "Connection lost" warnings
- No real-time progress updates
- Import seems stuck but may be progressing
- Manual refresh required to see updates

**WebSocket Troubleshooting:**

**1. Browser Settings:**
```
Browser configuration:
- Disable ad blockers temporarily
- Check if WebSocket is blocked by browser
- Clear browser cache and cookies
- Try different browser to isolate issue
```

**2. Network Configuration:**
```
Network troubleshooting:
- Corporate firewall may block WebSocket
- VPN services sometimes interfere
- Try direct connection without proxy
- Check with network administrator
```

**3. Alternative Monitoring:**
```
If WebSocket fails:
- Refresh page periodically for updates
- Processing continues on server regardless
- Final notification should still work
- Contact support if completely stuck
```

### Browser Performance Issues

**Symptoms:**
- Browser becomes slow or unresponsive
- High CPU usage during import
- Memory warnings or crashes
- Interface becomes laggy

**Performance Optimization:**

**1. Browser Resource Management:**
```
Memory optimization:
- Close unnecessary browser tabs
- Restart browser before large imports
- Clear browser cache regularly
- Disable unnecessary browser extensions
```

**2. System Resource Monitoring:**
```
System optimization:
- Monitor available RAM (need 4GB+ free)
- Check CPU usage (other apps consuming resources?)
- Ensure sufficient disk space
- Close resource-heavy applications
```

**3. Processing Optimization:**
```
Reduce system load:
- Process smaller batches (5-10 videos max)
- Use "Standard Quality" instead of "High Quality"
- Avoid other bandwidth-heavy activities
- Process during off-peak hours
```

## Platform-Specific Issues

### YouTube-Specific Problems

**Common YouTube Issues:**
- Age-restricted content requires login
- Regional blocking prevents access
- Live streams not yet completed
- Very new videos may not be processed yet

**YouTube Solutions:**
```
Age restrictions:
- Cannot import age-restricted content
- Video must be publicly viewable without login
- Check video settings on YouTube

Regional blocking:
- Content blocked in your geographic region
- VPN may help but may violate terms of service
- Try different video from same creator

Live stream issues:
- Only completed live streams can be imported
- Wait for stream to end completely
- Check if VOD (Video on Demand) is available
```

### Instagram-Specific Problems

**Common Instagram Issues:**
- Private account content inaccessible
- Instagram actively blocks automated tools
- Stories expire after 24 hours
- Rate limiting causes temporary failures

**Instagram Solutions:**
```
Access issues:
- Verify account and post are public
- Try accessing content from different network
- Wait 15-30 minutes if rate limited
- Try different Instagram content to test system

Quality limitations:
- Instagram compresses all content significantly
- Original quality may be limited
- Use "High Quality" processing to compensate
- Consider finding original source if possible
```

### TikTok-Specific Problems

**Common TikTok Issues:**
- Creators can disable downloading
- Content quickly deleted or made private
- Regional content variations
- Platform updates breaking compatibility

**TikTok Solutions:**
```
Download restrictions:
- Some creators disable downloads
- Try different content from same creator
- Public content should generally work
- Check if content is still available

Platform changes:
- TikTok frequently updates their platform
- System updates may be needed for compatibility
- Report consistent failures with TikTok URLs
- Try recently posted content vs. older posts
```

## Batch Processing Issues

### Batch Failures

**Symptoms:**
- Multiple videos failing in batch
- Entire batch stops processing
- Individual videos stuck in "pending"
- Inconsistent results across batch

**Batch Troubleshooting:**

**1. Batch Configuration:**
```
Settings verification:
- Test settings with single import first
- Ensure global settings are appropriate
- Check for mixed content types requiring different settings
- Verify all URLs before starting batch
```

**2. Resource Management:**
```
System optimization for batches:
- Reduce batch size (try 10 instead of 50)
- Process during off-peak hours
- Ensure stable internet connection
- Monitor system resources during processing
```

**3. Error Pattern Analysis:**
```
Identify patterns:
- Are failures from specific platform?
- Do failures happen at same processing stage?
- Is error message consistent across failures?
- Try different content to isolate issue
```

### Batch Performance Issues

**Symptoms:**
- Very slow batch processing
- Some videos stuck while others progress
- System seems overloaded
- Inconsistent processing times

**Batch Performance Solutions:**

**1. Batch Size Optimization:**
```
Size recommendations:
- Start with 5-10 videos to test performance
- Increase gradually based on results
- Consider video length in batch planning
- Monitor concurrent processing limits
```

**2. Timing Optimization:**
```
Processing timing:
- Process during off-peak hours (evening/weekend)
- Avoid peak usage times (business hours)
- Schedule large batches overnight
- Monitor system status page if available
```

**3. Content Optimization:**
```
Content selection for batches:
- Group similar content types together
- Batch videos of similar length
- Test problematic URLs individually first
- Remove failed videos and retry as new batch
```

## Error Codes and Messages

### Understanding Error Messages

**Import Error Codes:**
```
ERROR_001: Invalid URL format
- Solution: Check URL format and completeness

ERROR_002: Video not accessible  
- Solution: Verify video is public and available

ERROR_003: Download timeout
- Solution: Check internet connection, try smaller video

ERROR_004: Processing timeout
- Solution: Try during off-peak hours, reduce quality settings

ERROR_005: Insufficient resources
- Solution: Try smaller batch, restart browser, try later

ERROR_006: Transcription failed
- Solution: Check audio quality, specify language

ERROR_007: AI analysis failed
- Solution: Disable AI features temporarily, try different content

ERROR_008: File corruption
- Solution: Retry import, check source video quality

ERROR_009: Platform restriction
- Solution: Try different video, check platform policies

ERROR_010: System overload
- Solution: Try later during off-peak hours
```

### Recovery Procedures

**Automatic Recovery:**
- System automatically retries failed operations 3 times
- Exponential backoff prevents system overload
- Partial progress is preserved when possible
- Error logs help diagnose persistent issues

**Manual Recovery Steps:**
1. **Document the error** - Screenshot error message
2. **Check system status** - Verify service availability
3. **Retry with different settings** - Try simpler configuration
4. **Test with different content** - Isolate content-specific issues
5. **Contact support** - Provide error details and example URLs

## Prevention Strategies

### Avoiding Common Issues

**Pre-Import Checklist:**
- [ ] Test video URL in incognito browser
- [ ] Verify video is public and accessible
- [ ] Check video length (under 60 minutes)
- [ ] Ensure stable internet connection (25+ Mbps)
- [ ] Close unnecessary browser tabs/applications
- [ ] Test settings with short video first

**Quality Assurance:**
- [ ] Choose appropriate processing quality for needs
- [ ] Match orientation to target platform
- [ ] Select content type accurately for AI processing
- [ ] Review music selection for content appropriateness
- [ ] Consider source video quality limitations

**System Optimization:**
- [ ] Use recommended browsers (Chrome, Firefox)
- [ ] Keep browser updated to latest version
- [ ] Clear cache regularly
- [ ] Monitor system resources during processing
- [ ] Process during off-peak hours for best performance

### Best Practices for Reliability

**Content Selection:**
- Choose videos with clear, audible speech
- Prefer content with stable lighting and framing
- Select videos from reliable, established creators
- Avoid very new content (may still be processing on platform)
- Test with shorter videos before processing long content

**Processing Strategy:**
- Start with default settings, adjust based on results
- Process test batches of 3-5 videos before large batches
- Save successful configurations as presets
- Document what works well for your content types
- Build in time for retries and adjustments

## Getting Additional Help

### Self-Service Resources

**Documentation:**
- [Complete Tutorial](./tutorial.md) - Step-by-step guidance
- [Settings Guide](./settings.md) - Detailed configuration help
- [Platform Guides](./platforms/) - Platform-specific optimization
- [FAQ](./faq.md) - Common questions and answers

**Community Resources:**
- User forums and discussion groups
- Shared configurations and best practices  
- Community troubleshooting tips
- Success stories and case studies

### Professional Support

**When to Contact Support:**
- Persistent errors despite troubleshooting
- System-wide issues affecting multiple users
- Data loss or corruption issues
- Account or billing problems
- Feature requests or bug reports

**Information to Provide:**
- Detailed error messages and codes
- Steps taken before encountering issue
- Browser type and version
- Example URLs causing problems
- Screenshots or screen recordings of issues
- System specifications (OS, RAM, etc.)

**Support Response Expectations:**
- **Urgent issues**: 2-4 hours response time
- **Standard issues**: 24-48 hours response time
- **Feature requests**: Acknowledged within 1 week
- **Bug reports**: Investigated within 3-5 business days

---

*This troubleshooting guide is regularly updated based on user reports and system updates. Last updated: January 2025*

**Quick Help Links:**
- [Getting Started Guide](./getting-started.md) - For new users
- [FAQ](./faq.md) - Common questions
- [Settings Guide](./settings.md) - Configuration help
- [Platform Guides](./platforms/) - Platform-specific issues