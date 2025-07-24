# Video Formats & Recommendations

This guide covers supported video formats, quality recommendations, and technical specifications to help you achieve the best results with video import.

## Supported Input Formats

### Video Container Formats

**✅ Fully Supported:**
- **MP4** (.mp4) - Most common, best compatibility
- **MOV** (.mov) - Apple format, high quality
- **AVI** (.avi) - Legacy format, widely supported
- **MKV** (.mkv) - High-quality container
- **WebM** (.webm) - Web-optimized format
- **FLV** (.flv) - Flash video format
- **WMV** (.wmv) - Windows Media format

**⚠️ Limited Support:**
- **3GP** (.3gp) - Mobile format, basic quality
- **MPEG** (.mpg, .mpeg) - Legacy format
- **RM** (.rm, .rmvb) - RealMedia format
- **ASF** (.asf) - Advanced Systems Format

**❌ Not Supported:**
- Proprietary formats requiring special codecs
- Encrypted or DRM-protected content
- Raw video formats (uncompressed)
- Extremely old or obsolete formats

### Video Codecs

**✅ Best Performance:**
- **H.264/AVC** - Most common, excellent compression
- **H.265/HEVC** - Better compression, newer standard
- **VP9** - Google's codec, good for web
- **VP8** - Older Google codec

**⚠️ Acceptable:**
- **MPEG-4** - Older standard
- **MPEG-2** - Legacy support
- **DivX/XviD** - Alternative codecs

### Audio Formats

**✅ Fully Supported:**
- **AAC** - Most common, best quality
- **MP3** - Universal compatibility
- **PCM/WAV** - Uncompressed, highest quality
- **Opus** - Modern, efficient codec
- **Vorbis** - Open-source alternative

**⚠️ Basic Support:**
- **WMA** - Windows Media Audio
- **AC3** - Dolby Digital
- **FLAC** - Lossless compression

## Input Quality Recommendations

### Video Resolution Guidelines

**🎯 Optimal Source Resolutions:**

**4K/UHD (3840x2160)**
```
Advantages:
- Maximum detail preservation
- Excellent for cropping to different orientations
- Future-proof quality
- Professional output possible

Considerations:
- Larger file sizes (slower processing)
- Requires more system resources
- May be downscaled for final output
- Best for high-end content
```

**Full HD (1920x1080)**
```
Advantages:
- Excellent quality-to-size ratio
- Fast processing times
- Universal compatibility
- Direct output possible without scaling

Best for:
- Most content types
- Standard social media output
- Good balance of quality and speed
- Recommended for most users
```

**HD (1280x720)**
```
Advantages:
- Smaller file sizes
- Very fast processing
- Good for older content
- Acceptable quality for mobile viewing

Limitations:
- Limited cropping flexibility
- May appear pixelated on larger screens
- Not ideal for detailed visual content
```

**Standard Definition (640x480 or lower)**
```
Generally not recommended:
- Poor quality output
- Limited processing options
- Not suitable for modern platforms
- Better to find higher quality sources
```

### Frame Rate Considerations

**🎬 Optimal Frame Rates:**

**60 FPS (Frames Per Second)**
```
Best for:
- Gaming content
- Sports or action videos
- Smooth motion requirements
- High-end production content

Considerations:
- Larger file sizes
- Longer processing times
- May be downsampled to 30fps for output
- Not necessary for most content types
```

**30 FPS**
```
Recommended standard:
- Perfect for most content types
- Good balance of smoothness and file size
- Universal platform compatibility
- Optimal processing performance

Best for:
- Talking head videos
- Tutorials and educational content
- Most social media content
- Standard video production
```

**24 FPS**
```
Cinematic standard:
- Traditional film look
- Smaller file sizes
- Good for narrative content
- Professional appearance

May not be ideal for:
- Fast-motion content
- Gaming or sports
- Interactive demonstrations
```

### Audio Quality Standards

**🔊 Audio Specifications:**

**Sample Rate:**
- **48 kHz** - Professional standard, recommended
- **44.1 kHz** - CD quality, excellent for most content
- **22 kHz** - Acceptable for speech-only content
- **Below 22 kHz** - Not recommended

**Bit Depth:**
- **24-bit** - Professional quality, best for music content
- **16-bit** - Standard quality, suitable for most content
- **8-bit** - Poor quality, avoid if possible

**Bitrate:**
- **320 kbps** - Maximum quality for MP3
- **192 kbps** - High quality, good for most content
- **128 kbps** - Standard quality, minimum recommended
- **Below 128 kbps** - Poor quality, may affect transcription

## Platform-Specific Recommendations

### YouTube Optimization

**📺 YouTube Source Guidelines:**

**Recommended Settings:**
```
Resolution: 1920x1080 (Full HD) minimum
Frame Rate: 30fps or 60fps
Audio: AAC, 192kbps+, 48kHz
Container: MP4 with H.264 codec
Aspect Ratio: 16:9 for regular videos, 9:16 for Shorts
```

**Quality Tiers:**
- **Premium**: 4K, 60fps, high bitrate
- **Standard**: 1080p, 30fps, medium bitrate
- **Acceptable**: 720p, 30fps, standard bitrate
- **Minimum**: 480p, 24fps (not recommended)

### Instagram Requirements

**📱 Instagram Source Guidelines:**

**Posts (Square/Portrait):**
```
Resolution: 1080x1080 (square) or 1080x1350 (portrait)
Frame Rate: 30fps
Duration: Up to 60 seconds
Audio: AAC, 128kbps+
Container: MP4
```

**Reels:**
```
Resolution: 1080x1920 (9:16 aspect ratio)
Frame Rate: 30fps
Duration: 15-90 seconds
Audio: AAC, high quality for music sync
Container: MP4
```

**IGTV:**
```
Resolution: 1080x1920 or 1080x1080
Frame Rate: 30fps
Duration: 1 second to 60 minutes
Audio: AAC, 192kbps recommended
Container: MP4
```

### TikTok Specifications

**🎵 TikTok Source Guidelines:**

**Optimal Format:**
```
Resolution: 1080x1920 (9:16 aspect ratio)
Frame Rate: 30fps
Duration: 15 seconds to 10 minutes
Audio: AAC, 192kbps+ (important for music sync)
Container: MP4
Bitrate: 1-2 Mbps video, 128+ kbps audio
```

**Quality Considerations:**
- TikTok heavily compresses uploads
- Audio quality is crucial for engagement
- Vertical orientation is mandatory
- Higher source quality compensates for compression

### Facebook Guidelines

**👥 Facebook Source Guidelines:**

**Video Posts:**
```
Resolution: 1920x1080 (landscape) or 1080x1080 (square)
Frame Rate: 30fps
Duration: Up to 240 minutes
Audio: AAC, 128kbps+
Container: MP4
Aspect Ratio: 16:9, 1:1, or 4:5
```

**Stories:**
```
Resolution: 1080x1920 (9:16 aspect ratio)
Frame Rate: 30fps
Duration: Up to 20 seconds per story
Audio: AAC, good quality for narrative
Container: MP4
```

## Output Format Specifications

### Generated Video Formats

**🎬 Standard Output Specifications:**

**High Quality Output:**
```
Video Codec: H.264 (High Profile)
Audio Codec: AAC
Container: MP4
Video Bitrate: 5-8 Mbps (1080p), 15-25 Mbps (4K)
Audio Bitrate: 192-320 kbps
Sample Rate: 48 kHz
Color Space: Rec. 709
```

**Standard Quality Output:**
```
Video Codec: H.264 (Main Profile)
Audio Codec: AAC
Container: MP4
Video Bitrate: 2-4 Mbps (1080p), 8-12 Mbps (4K)
Audio Bitrate: 128-192 kbps
Sample Rate: 48 kHz
Color Space: Rec. 709
```

### Orientation-Specific Outputs

**Portrait (9:16) - 1080x1920:**
```
Optimized for: TikTok, Instagram Reels, YouTube Shorts
Video Bitrate: 3-6 Mbps
Audio: Stereo AAC, 192 kbps
Frame Rate: 30fps
Duration: Optimized for platform limits
```

**Square (1:1) - 1080x1080:**
```
Optimized for: Instagram feed, Facebook posts, LinkedIn
Video Bitrate: 2-4 Mbps
Audio: Stereo AAC, 128-192 kbps
Frame Rate: 30fps
Universal compatibility focus
```

**Landscape (16:9) - 1920x1080:**
```
Optimized for: YouTube, Facebook, desktop viewing
Video Bitrate: 4-8 Mbps
Audio: Stereo AAC, 192-320 kbps
Frame Rate: 30fps
Traditional video format
```

## File Size Guidelines

### Input File Size Limits

**📏 Size Recommendations:**

**Maximum Supported:**
- **File Size**: 10GB per video
- **Duration**: 60 minutes maximum
- **Resolution**: Up to 4K (3840x2160)

**Optimal Performance:**
- **File Size**: Under 2GB per video
- **Duration**: 5-30 minutes
- **Resolution**: 1080p (1920x1080)

**Processing Speed by Size:**
```
< 500MB: Very fast (2-5 minutes processing)
500MB - 1GB: Fast (5-10 minutes processing)
1GB - 2GB: Moderate (10-20 minutes processing)
2GB - 5GB: Slow (20-45 minutes processing)
5GB+: Very slow (45+ minutes processing)
```

### Output File Sizes

**💾 Expected Output Sizes:**

**Per Minute of Output Video:**
```
Standard Quality:
- Portrait (1080x1920): ~15-25MB per minute
- Square (1080x1080): ~12-20MB per minute  
- Landscape (1920x1080): ~18-30MB per minute

High Quality:
- Portrait (1080x1920): ~25-40MB per minute
- Square (1080x1080): ~20-35MB per minute
- Landscape (1920x1080): ~30-50MB per minute
```

**Batch Processing Estimates:**
- 10 videos @ 1 minute each: 150-300MB total
- 20 videos @ 2 minutes each: 600MB-1.2GB total
- 50 videos @ 1.5 minutes each: 1.1-2.3GB total

## Quality Optimization Tips

### Pre-Processing Recommendations

**🔧 Before Import Optimization:**

**Source Video Preparation:**
1. **Use highest quality available** - Download in maximum resolution
2. **Check audio levels** - Ensure speech is clearly audible
3. **Verify codec compatibility** - H.264/AAC is most reliable
4. **Test playback** - Ensure video plays smoothly locally
5. **Note any issues** - Corrupted frames, audio sync problems

**Network Optimization:**
1. **Stable connection** - 25+ Mbps recommended
2. **Wired internet** - More reliable than WiFi for large files
3. **Off-peak processing** - Faster downloads during low-usage hours
4. **Bandwidth management** - Pause other downloads/streaming
5. **Connection monitoring** - Watch for drops during processing

### Post-Processing Quality Control

**✅ Quality Verification Checklist:**

**Visual Quality Check:**
- [ ] No pixelation or compression artifacts
- [ ] Proper colors and contrast
- [ ] Smooth motion without stuttering
- [ ] Correct aspect ratio and orientation
- [ ] No black bars or distortion

**Audio Quality Check:**
- [ ] Clear, audible speech
- [ ] Proper volume levels
- [ ] No audio dropouts or distortion
- [ ] Good synchronization with video
- [ ] Background music at appropriate level

**Technical Verification:**
- [ ] Correct file format and codec
- [ ] Appropriate file size for quality
- [ ] Proper metadata and duration
- [ ] Platform compatibility confirmed
- [ ] No corruption indicators

## Troubleshooting Format Issues

### Common Format Problems

**🔧 Format-Related Issues:**

**"Unsupported Format" Errors:**
```
Symptoms: Import fails immediately with format error
Solutions:
1. Convert to MP4 with H.264/AAC before import
2. Check if file is corrupted (try playing locally)
3. Remove any DRM or encryption
4. Try with different source video to isolate issue
```

**Poor Quality Output:**
```
Symptoms: Output significantly worse than source
Solutions:
1. Verify source quality is adequate
2. Try "High Quality" processing option
3. Check network stability during download
4. Ensure source isn't heavily compressed
```

**Audio Sync Issues:**
```
Symptoms: Audio doesn't match video timing
Solutions:
1. Check if source has sync issues
2. Try different processing quality setting
3. Report issue with specific video details
4. Use videos with constant frame rate
```

**Large File Processing Issues:**
```
Symptoms: Very slow processing or timeouts
Solutions:
1. Use smaller source files (under 2GB)
2. Process during off-peak hours
3. Try standard quality instead of high quality
4. Break large videos into smaller segments
```

### Format Conversion Tools

**🛠️ Recommended Conversion Software:**

**Free Options:**
- **HandBrake** - Excellent for video conversion
- **FFmpeg** - Command-line tool, very powerful
- **VLC Media Player** - Simple conversion features
- **MediaCoder** - Windows-based converter

**Online Options:**
- **CloudConvert** - Web-based conversion
- **Online-Convert** - Multiple format support
- **Convertio** - Simple interface
- **FreeConvert** - No software installation required

**Optimal Conversion Settings:**
```
For Best Import Results:
Container: MP4
Video Codec: H.264
Audio Codec: AAC
Resolution: Keep original (up to 1080p recommended)
Frame Rate: 30fps
Audio Bitrate: 192 kbps
Sample Rate: 48 kHz
```

## Future Format Support

### Emerging Standards

**🔮 Upcoming Format Support:**

**AV1 Codec:**
- Next-generation video codec
- Better compression than H.264/H.265
- Growing platform support
- Future integration planned

**8K Resolution:**
- Ultra-high definition support
- Currently limited by processing power
- Future support as hardware improves
- Mainly for professional content

**HDR (High Dynamic Range):**
- Better color representation
- Growing platform adoption
- Enhanced viewing experience
- Technical implementation in progress

### Platform Evolution

**📱 Platform Format Trends:**

**Mobile-First Optimization:**
- Increasing vertical video support
- Higher quality mobile uploads
- Better mobile compression algorithms
- Enhanced mobile viewing experiences

**Interactive Features:**
- 360-degree video support considerations
- Interactive overlay compatibility
- Live streaming integration potential
- Enhanced metadata support

---

## Format Selection Quick Reference

### By Use Case

**Educational/Tutorial Content:**
- Format: MP4 (H.264/AAC)
- Resolution: 1920x1080, 30fps
- Quality: High (for detail preservation)
- Duration: Optimize for 5-20 minute segments

**Entertainment/Social Content:**
- Format: MP4 (H.264/AAC)
- Resolution: 1080x1920, 30fps
- Quality: Standard (for faster processing)
- Duration: Optimize for 15-60 second segments

**Professional/Business Content:**
- Format: MP4 (H.264/AAC)
- Resolution: 1920x1080, 30fps
- Quality: High (for professional appearance)
- Duration: Optimize for 30-120 second segments

**Need Help with Formats?**
- [Troubleshooting Guide](./troubleshooting.md) - Solve format-related issues
- [Platform Guides](./platforms/) - Platform-specific format requirements
- [FAQ](./faq.md) - Common format questions answered
- [Settings Guide](./settings.md) - Optimize processing for your formats