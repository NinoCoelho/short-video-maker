# VideoImportService URL Parsing Tests

This directory contains comprehensive unit tests for the URL parsing functionality in the VideoImportService.

## Test Coverage

### VideoImportService.detectPlatform.test.ts
This file contains comprehensive tests for URL parsing and platform detection:

#### Platforms Tested
- **YouTube**: Standard URLs, short URLs (youtu.be), mobile URLs, Shorts, embeds, subdomains
- **Facebook**: Watch URLs, video URLs, mobile URLs, reels
- **Instagram**: Posts, Reels, IGTV, Stories
- **TikTok**: Standard videos, mobile URLs, live streams, shortened URLs

#### URL Format Coverage
- Standard URLs with various protocols (http/https)
- Mobile URLs (m.youtube.com, m.facebook.com, etc.)
- Shortened URLs (youtu.be, fb.watch, vm.tiktok.com)
- Embed URLs
- URLs with query parameters and fragments
- Regional domains (youtube.co.uk, etc.)
- Subdomain variations (music.youtube.com, gaming.youtube.com)

#### Edge Cases Tested
- Case sensitivity (current implementation is case-sensitive)
- Invalid/empty inputs
- URLs with authentication info
- URLs with port numbers
- Unicode characters in URLs
- Encoded characters
- False positive detection (e.g., notyoutube.com)
- Malformed URLs

#### Current Implementation Limitations
The tests document several limitations of the current `detectPlatform` method:
1. **Case Sensitive**: URLs with uppercase domains are not detected
2. **No Regional Domain Support**: youtube.co.uk, youtube.de, etc. return 'generic'
3. **Limited Shortened URL Support**: fb.watch is not recognized
4. **False Positives**: Domains containing platform names are incorrectly detected

#### Suggested Improvements
The test file includes an improved implementation that addresses these limitations:
- Case-insensitive matching
- Support for regional domains
- Support for all shortened URLs
- Better regex patterns to avoid false positives
- Null/undefined input handling

## Running the Tests

```bash
# Run only the URL parsing tests
npm test -- src/services/__tests__/VideoImportService.detectPlatform.test.ts

# Run all service tests
npm test -- src/services/__tests__/
```

## Test Structure

The tests are organized into logical groups:
1. Platform-specific detection tests
2. Edge case handling
3. Current implementation limitations
4. Suggested improvements with example implementation

Each test group thoroughly validates the behavior of URL parsing for different scenarios, ensuring comprehensive coverage of real-world use cases.