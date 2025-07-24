# Instagram Video Import Guide

Instagram offers diverse video content across posts, Reels, and IGTV. This guide covers importing from all Instagram video formats with optimal settings and best practices.

## Supported Instagram Content

### Video Types
- ✅ **Instagram Posts** - Square and portrait videos in feed
- ✅ **Instagram Reels** - Short-form vertical videos
- ✅ **IGTV** - Longer-form vertical videos
- ✅ **Instagram Stories** - If publicly accessible
- ❌ **Private Account Posts** - Not accessible without login
- ❌ **Story Highlights** - Limited access
- ❌ **Live Videos** - Only after they end

### Content Specifications
- **Maximum Duration**: 60 minutes (IGTV), 90 seconds (Reels), 60 seconds (Posts)
- **Minimum Duration**: No limit
- **Resolution**: Up to 1080x1920 (portrait) or 1080x1080 (square)
- **Formats**: MP4 (primary), MOV (converted)

## URL Formats

### Instagram Post URLs
```
https://www.instagram.com/p/ABC123/
https://instagram.com/p/ABC123/
https://www.instagram.com/p/ABC123/?utm_source=ig_web_copy_link
```

### Instagram Reel URLs
```
https://www.instagram.com/reel/ABC123/
https://instagram.com/reel/ABC123/
https://www.instagram.com/p/ABC123/ (some reels use /p/ format)
```

### IGTV URLs
```
https://www.instagram.com/tv/ABC123/
https://instagram.com/tv/ABC123/
https://www.instagram.com/p/ABC123/ (newer IGTV may use /p/)
```

### Mobile Share URLs
```
https://www.instagram.com/share/ABC123/
https://instagram.com/share/ABC123/
```

## Instagram-Specific Features

### Automatic Content Detection

The system identifies Instagram content types:

**Instagram Posts:**
- Square (1:1) or portrait (4:5) aspect ratio
- Usually 15-60 seconds duration
- Often lifestyle or brand content
- May include carousel media (video + images)

**Instagram Reels:**
- Portrait (9:16) aspect ratio
- 15-90 seconds duration
- Trend-based content with music
- Often includes effects and text overlays

**IGTV:**
- Portrait (9:16) or square (1:1) aspect ratio
- Up to 60 minutes duration
- Longer-form content
- Often educational or storytelling

### Instagram Metadata Extraction

**Available Information:**
- Caption text (if accessible)
- Hashtags and mentions
- Upload timestamp
- Author username
- Like and comment counts (when public)
- Video duration and dimensions

**Content Analysis:**
- Music detection (if present)
- Text overlay recognition
- Scene transition points
- Audio-visual sync quality

## Instagram-Specific Challenges

### Access Limitations

**Public vs Private Content:**
- Only public posts can be imported
- Private accounts require login (not supported)
- Some public posts may have restricted embedding

**Platform Restrictions:**
- Instagram actively blocks automated access
- Rate limiting may cause temporary failures
- Quality may be limited by Instagram's delivery

### Technical Considerations

**Video Quality:**
- Instagram compresses all uploads significantly
- Source quality may be lower than other platforms  
- Audio quality often reduced
- Aspect ratios may be altered from original

**Content Protection:**
- Some creators disable embedding
- Copyright detection may block access
- Stories expire and become inaccessible
- Content may be deleted by users

## Optimal Settings for Instagram Content

### Instagram Post Import Settings

**Lifestyle/Brand Content:**
```
Target Language: Auto-detect or English
Music: Upbeat or Calm (depending on mood)
Orientation: Keep original (Square) or Portrait
AI Highlights: Enabled
Segment Duration: 15-45 seconds
Overlay: Brand watermark recommended
```

**Product Showcase:**
```
Target Language: Match target audience
Music: Upbeat or None
Orientation: Square for Instagram, Portrait for TikTok
AI Highlights: Enabled
Segment Duration: 30-60 seconds
Overlay: Subscribe button or logo
```

### Instagram Reels Import Settings

**Trending/Entertainment Content:**
```
Target Language: Auto-detect
Music: Keep original or Upbeat
Orientation: Portrait (maintain native format)
AI Highlights: Enabled (but may be less effective)
Segment Duration: 15-30 seconds
Overlay: Minimal (content already optimized)
```

**Educational Reels:**
```
Target Language: Target audience language
Music: Calm or Inspirational
Orientation: Portrait
AI Highlights: Enabled
Segment Duration: 30-60 seconds
Overlay: Branding appropriate
```

### IGTV Import Settings

**Long-form Educational:**
```
Target Language: Match content language
Music: Calm or None (preserve original)
Orientation: Portrait or Square
AI Highlights: Enabled (very useful here)
Segment Duration: 45-90 seconds
Overlay: Educational branding
```

**Interview/Documentary Style:**
```
Target Language: Original language or translate
Music: None (preserve interview audio)
Orientation: Portrait
AI Highlights: Enabled
Segment Duration: 60-120 seconds
Overlay: Minimal
```

## Best Practices for Instagram Import

### Content Selection

**✅ Choose Instagram videos with:**
- Clear, audible speech
- High engagement metrics
- Original or royalty-free music
- Good lighting and stable footage
- Meaningful captions or text overlays

**❌ Avoid Instagram videos with:**
- Heavy compression artifacts
- Copyrighted popular music
- Rapid transitions or effects
- Poor lighting or shaky camera work
- Private or restricted access

### Quality Optimization

**Pre-Import Checklist:**
1. **Verify public access** - Open URL in incognito browser
2. **Check video quality** - Look for compression artifacts
3. **Test audio clarity** - Ensure speech is audible
4. **Note original format** - Square, portrait, or landscape
5. **Review content appropriateness** - Suitable for your audience

**Processing Recommendations:**
- **Use "High Quality" setting** for better output
- **Match original orientation** when possible
- **Preserve original audio** if music is good
- **Enable AI highlights** for longer IGTV content
- **Keep segments short** for maximum engagement

### Platform-Specific Adaptations

**Converting Instagram Posts to Other Platforms:**

**To TikTok:**
- Convert square to portrait
- Add trending background music
- Increase text size for readability
- Extend duration if too short

**To YouTube Shorts:**
- Maintain portrait orientation
- Add educational value in description
- Consider adding intro/outro
- Optimize for search keywords

**To Facebook/LinkedIn:**
- Convert to square format
- Add professional overlay
- Include descriptive captions
- Consider audience appropriateness

## Common Instagram Import Issues

### Access and Download Issues

**Problem: "Unable to access Instagram content"**
```
Possible causes:
- Content from private account
- Instagram blocking automated access
- Rate limiting or temporary restrictions
- Content was deleted or made private

Solutions:
- Verify content is publicly accessible
- Wait 10-15 minutes before retrying
- Try different Instagram content
- Use direct video URLs when available
```

**Problem: "Video quality is too low"**
```
Possible causes:
- Instagram's compression algorithms
- Mobile upload with low resolution
- Network issues during Instagram upload
- Multiple re-uploads reducing quality

Solutions:
- Source higher quality original content
- Use "High Quality" processing option
- Consider alternative content sources
- Apply AI enhancement during processing
```

### Content Processing Issues

**Problem: "No audio detected"**
```
Possible causes:
- Instagram Reels with only visual effects
- Muted original video
- Audio copyright restrictions
- Technical audio extraction failure

Solutions:
- Check original video has audio
- Use background music from our library
- Try different Instagram content
- Report technical issues
```

**Problem: "AI highlights not working well"**
```
Possible causes:
- Very short source video (under 30 seconds)
- Rapid scene changes typical of Reels
- Heavy music drowning out speech
- Visual effects interfering with analysis

Solutions:
- Disable AI highlights for short Reels
- Use manual segment timing
- Choose content with clearer speech
- Try educational or interview-style content
```

### Platform Compliance Issues

**Problem: "Copyright music detected"**
```
Instagram often features popular copyrighted music
- System may warn about potential issues
- Consider replacing with royalty-free alternatives
- Original music may cause issues on target platforms
- Always respect copyright and fair use guidelines

Solutions:
- Use "No Music" setting and add your own
- Choose content with original or royalty-free audio
- Add significant commentary or transformation
- Credit original creators appropriately
```

## Instagram Content Strategy

### Repurposing Instagram Content

**Cross-Platform Distribution:**
1. **Instagram → TikTok**: Focus on trends, add effects
2. **Instagram → YouTube Shorts**: Add educational value
3. **Instagram → LinkedIn**: Professional adaptation
4. **Instagram → Twitter**: Add discussion prompts

**Content Transformation:**
- **Add Commentary**: Your unique perspective
- **Create Series**: Connect related posts
- **Educational Angle**: Explain trends or techniques
- **Behind-the-Scenes**: Show process or creation

### Respecting Original Creators

**Attribution Best Practices:**
- Always credit the original Instagram creator
- Include their handle in your content
- Link back to original posts when possible
- Ask permission for significant repurposing

**Fair Use Considerations:**
- Add substantial original commentary
- Transform content meaningfully
- Use for educational or review purposes
- Keep usage proportional to original

## Advanced Instagram Features

### Working with Instagram Stories

**Story Highlights (Limited Access):**
- Only publicly accessible highlights work
- Often expire or become inaccessible
- Quality typically lower than posts
- May require special handling

**Story Import Process:**
1. Verify story is still accessible
2. Check for any expiration dates
3. Note typically shorter duration (15 seconds max)
4. Prepare for potential access failures

### Instagram Shopping Videos

**Product-Focused Content:**
- Often includes product tags (not extracted)
- Shopping links won't transfer
- Focus on product demonstration value
- Good for creating product highlight reels

### Instagram Live Archive

**Completed Live Videos:**
- May be available as IGTV after live session
- Often longer format with natural conversation
- Good candidates for highlight detection
- May include viewer comments (not extracted)

## Instagram Import Success Stories

### Case Study 1: Fitness Content
**Original**: Instagram Reels workout demonstrations
**Strategy**: Compiled into educational series with added tips
**Results**: 200% engagement increase on YouTube Shorts
**Key**: Added educational commentary and proper attribution

### Case Study 2: Recipe Content
**Original**: Instagram cooking posts
**Strategy**: Converted to portrait format with ingredient lists
**Results**: Viral success on TikTok
**Key**: Enhanced original with step-by-step text overlays

### Case Study 3: Brand Showcase
**Original**: Instagram product posts
**Strategy**: Created comparison series across multiple posts
**Results**: Effective LinkedIn marketing campaign
**Key**: Professional adaptation with business context

## Technical Specifications

### Instagram Video Specs

**Instagram Posts:**
- Aspect Ratios: 1:1 (square), 4:5 (portrait)
- Resolution: Up to 1080x1080 or 1080x1350
- Duration: Up to 60 seconds
- Format: MP4, MOV

**Instagram Reels:**
- Aspect Ratio: 9:16 (portrait)
- Resolution: Up to 1080x1920
- Duration: 15-90 seconds
- Format: MP4

**IGTV:**
- Aspect Ratios: 9:16 (portrait), 1:1 (square)
- Resolution: Up to 1080x1920 or 1080x1080
- Duration: 1 second to 60 minutes
- Format: MP4, MOV

### Processing Adaptations

Our system adapts to Instagram's unique characteristics:
- **Enhances compressed video** where possible
- **Maintains aspect ratios** unless conversion needed
- **Preserves text overlays** in visual analysis
- **Handles music detection** despite Instagram's audio processing
- **Optimizes for mobile viewing** given Instagram's mobile-first nature

## Troubleshooting Quick Reference

| Issue | Quick Fix |
|-------|-----------|
| Can't access video | Check if account/post is public |
| Low quality output | Use "High Quality" processing option |
| No audio extracted | Verify original has audio, try different content |
| Copyright music warning | Use "No Music" setting, add royalty-free alternative |
| Very short segments | Disable AI highlights, use manual timing |
| Processing fails | Wait 15 minutes, try different Instagram content |

## Next Steps

**After successful Instagram import:**
1. **Review segment quality** - Instagram compression affects output
2. **Verify audio quality** - May need enhancement or replacement
3. **Test on target platform** - Cross-platform compatibility
4. **Respect original creators** - Proper attribution and fair use
5. **Document successful settings** - Reuse for similar content

**Explore other platforms:**
- [YouTube Import Guide](./youtube.md) - Highest quality imports
- [TikTok Import Guide](./tiktok.md) - Similar short-form content
- [Facebook Import Guide](./facebook.md) - Social media content
- [Generic URL Guide](./generic.md) - Direct video files