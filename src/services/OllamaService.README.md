# OllamaService

A comprehensive service for integrating with Ollama to analyze video transcripts and detect highlights for short-form content creation.

## Features

- **Highlight Detection**: AI-powered detection of engaging moments in video content
- **Scene Analysis**: Automatic scene boundary detection and content analysis
- **Context Window Management**: Handles long videos by processing in manageable chunks
- **Scoring System**: Sophisticated scoring based on engagement, narrative, emotional impact, visual interest, and viral potential
- **Performance Optimizations**: Batch processing, caching, retry logic, and timeout handling
- **Health Monitoring**: Automatic health checks with connection pooling

## Setup

### Prerequisites

1. **Install Ollama**: Download and install Ollama from [https://ollama.ai](https://ollama.ai)

2. **Pull the required model**:
   ```bash
   ollama pull gemma3:12b-it-qat
   ```

3. **Start Ollama server**:
   ```bash
   ollama serve
   ```
   This will start the server on `http://localhost:11434`

### Configuration

```typescript
import { OllamaService } from './services/OllamaService';

const service = new OllamaService({
  baseUrl: 'http://localhost:11434',
  defaultModel: 'gemma3:12b-it-qat',
  timeout: 60000,        // 60 seconds
  maxRetries: 3,         // Retry failed requests
  contextWindowSize: 8192,
  batchSize: 5,          // Process 5 items at once
  cacheEnabled: true,
  cacheTTL: 3600000      // 1 hour cache
});
```

## Core Methods

### 1. Highlight Detection

Detect the most engaging moments in video content:

```typescript
const highlights = await service.detectHighlights(transcript, {
  minScore: 70,        // Minimum engagement score (0-100)
  maxResults: 10,      // Maximum highlights to return
  contextWindow: 60    // Analyze in 60-second windows
});

highlights.forEach(highlight => {
  console.log(`${highlight.title} (${highlight.startTime}s-${highlight.endTime}s)`);
  console.log(`Score: ${highlight.highlightScore.score}/100`);
  console.log(`Factors:`, highlight.highlightScore.factors);
});
```

### 2. Scene Boundary Detection

Identify natural breakpoints in video content:

```typescript
const boundaries = await service.detectSceneBoundaries(transcript);

boundaries.forEach(boundary => {
  console.log(`Scene change at ${boundary.timestamp}s: ${boundary.type}`);
});
```

### 3. Video Analysis

Get comprehensive analysis of video content:

```typescript
const analysis = await service.analyzeTranscript(transcript);

console.log('Topics:', analysis.topics);
console.log('Keywords:', analysis.keywords);
console.log('Sentiment:', analysis.sentiment);
console.log('Summary:', analysis.summary);
```

### 4. Batch Processing

Process multiple operations efficiently:

```typescript
const operations = [
  { type: 'highlight', data: { transcript, options: { minScore: 70 } } },
  { type: 'scene', data: { transcript } },
  { type: 'topic', data: { transcript } }
];

const results = await service.batchAnalyze(operations);
```

## Scoring System

The highlight detection uses a sophisticated scoring system with five key factors:

- **Engagement** (0-100): Hooks, surprises, reveals that capture attention
- **Narrative** (0-100): Complete story arcs, climactic moments
- **Emotional** (0-100): Humor, drama, inspiration, emotional impact
- **Visual** (0-100): Action sequences, demonstrations, visual interest
- **Viral** (0-100): Relatability, shareability, meme potential

Each highlight receives:
- Overall score (weighted average)
- Individual factor scores
- Confidence level
- Detailed reasoning
- Suggested clip boundaries

## Performance Features

### Context Window Management

Long videos are automatically split into manageable chunks:

```typescript
// Automatically handles long content
const highlights = await service.detectHighlights(longTranscript, {
  contextWindow: 120  // 2-minute analysis windows
});
```

### Caching

Results are cached to avoid redundant processing:

```typescript
// First call hits the API
const result1 = await service.detectHighlights(transcript);

// Second call uses cache (much faster)
const result2 = await service.detectHighlights(transcript);
```

### Retry Logic

Failed requests are automatically retried with exponential backoff:

```typescript
// Automatically retries up to maxRetries times
const analysis = await service.analyzeTranscript(transcript);
```

## Error Handling

The service gracefully handles various error conditions:

```typescript
try {
  const highlights = await service.detectHighlights(transcript);
} catch (error) {
  console.error('Highlight detection failed:', error);
  // Service will still return default values when possible
}
```

## Health Monitoring

Monitor service health and performance:

```typescript
// Check if service is available
const isAvailable = service.getAvailability();

// Listen for service events
service.on('service:unavailable', () => {
  console.log('Ollama service is down');
});

// Get token usage statistics
const stats = service.getTokenUsageStats();
console.log('Average tokens per request:', stats.averagePerRequest);
```

## Testing

### Unit Tests

```bash
npm test -- src/services/__tests__/OllamaService.test.ts
```

### Integration Tests

Requires a running Ollama instance:

```bash
OLLAMA_INTEGRATION_TEST=true npm test -- src/services/__tests__/OllamaService.integration.test.ts
```

### Performance Tests

```bash
PERFORMANCE_TEST=true npm test -- src/services/__tests__/OllamaService.integration.test.ts
```

## Example Usage

See `OllamaService.example.ts` for comprehensive usage examples including:

- Basic video analysis workflow
- Long video processing with progress tracking
- Error handling patterns
- Performance monitoring
- Real-world cooking video example

## Prompt Templates

The service includes optimized prompt templates for:

- **Highlight Detection**: Identifies viral moments with detailed scoring
- **Scene Boundaries**: Detects topic, speaker, and setting changes
- **Key Moments**: Extracts peak emotional and narrative moments
- **Topic Extraction**: Analyzes themes, keywords, and audience

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `baseUrl` | `http://localhost:11434` | Ollama server URL |
| `defaultModel` | `gemma3:12b-it-qat` | AI model to use |
| `timeout` | `30000` | Request timeout (ms) |
| `maxRetries` | `3` | Retry attempts for failed requests |
| `contextWindowSize` | `8192` | Max tokens per request |
| `batchSize` | `5` | Items to process simultaneously |
| `cacheEnabled` | `true` | Enable result caching |
| `cacheTTL` | `3600000` | Cache lifetime (ms) |

## Best Practices

1. **Model Selection**: Use `gemma3:12b-it-qat` for best results with video content
2. **Context Windows**: Use 45-120 second windows for highlight detection
3. **Scoring Thresholds**: Set minScore to 70+ for high-quality highlights
4. **Batch Processing**: Process multiple videos in batches for efficiency
5. **Error Handling**: Always handle service unavailability gracefully
6. **Caching**: Enable caching for production use to reduce API calls

## Troubleshooting

### Common Issues

1. **Service Unavailable**: Ensure Ollama is running on `localhost:11434`
2. **Model Not Found**: Pull the required model with `ollama pull gemma3:12b-it-qat`
3. **Timeout Errors**: Increase timeout for long videos or complex analysis
4. **Memory Issues**: Reduce batch size or context window size

### Debug Mode

Enable detailed logging:

```typescript
import { logger } from '../logger';
logger.level = 'debug';
```

## Contributing

When extending the service:

1. Add new prompt templates in `initializePromptTemplates()`
2. Update type definitions in `src/types/import.ts`
3. Add comprehensive tests for new features
4. Update this documentation

## License

Part of the short-video-maker project.