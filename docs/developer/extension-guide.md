# Extension Guide - Video Import Feature

This guide covers how to extend the video import feature by adding new platforms, TTS providers, AI services, and processing steps. The system is designed with extensibility in mind using well-defined interfaces and patterns.

## Table of Contents

1. [Adding New Video Platforms](#adding-new-video-platforms)
2. [Adding TTS Providers](#adding-tts-providers)
3. [Adding AI Services](#adding-ai-services)
4. [Adding Processing Steps](#adding-processing-steps)
5. [Adding Translation Providers](#adding-translation-providers)
6. [Extending the Event System](#extending-the-event-system)
7. [Custom UI Components](#custom-ui-components)
8. [Configuration Extensions](#configuration-extensions)

## Adding New Video Platforms

The platform integration system uses the **Strategy Pattern** to support different video sources. Each platform implements the `VideoDownloader` interface.

### 1. Create Platform Downloader

Create a new file `src/services/downloaders/NewPlatformDownloader.ts`:

```typescript
import { BaseDownloader } from './BaseDownloader';
import { VideoDownloader, DownloadOptions, DownloadResult, VideoMetadata } from './types';
import { logger } from '../../logger';

export class NewPlatformDownloader extends BaseDownloader implements VideoDownloader {
  readonly name = 'newplatform';
  readonly supportedDomains = ['newplatform.com', 'np.com'];

  /**
   * Check if this downloader can handle the given URL
   */
  canHandle(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return this.supportedDomains.some(domain => 
        parsedUrl.hostname.includes(domain)
      );
    } catch {
      return false;
    }
  }

  /**
   * Extract video ID from URL
   */
  private extractVideoId(url: string): string {
    const patterns = [
      /newplatform\.com\/video\/([a-zA-Z0-9_-]+)/,
      /newplatform\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
      /np\.com\/([a-zA-Z0-9_-]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    throw new Error('Invalid NewPlatform URL format');
  }

  /**
   * Get video metadata without downloading
   */
  async getMetadata(url: string): Promise<VideoMetadata> {
    const videoId = this.extractVideoId(url);
    
    try {
      // Use platform's API to get metadata
      const response = await fetch(`https://api.newplatform.com/video/${videoId}/info`, {
        headers: {
          'User-Agent': 'VideoImporter/1.0',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        id: videoId,
        title: data.title,
        description: data.description,
        duration: data.duration,
        width: data.dimensions?.width || 1920,
        height: data.dimensions?.height || 1080,
        fps: data.fps || 30,
        fileSize: data.size,
        originalFormat: data.format || 'mp4',
        thumbnailUrl: data.thumbnail,
        uploadDate: new Date(data.upload_date),
        creator: data.creator?.name,
        viewCount: data.view_count
      };
    } catch (error) {
      logger.error(`Failed to get NewPlatform metadata for ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Download video from the platform
   */
  async download(url: string, options: DownloadOptions = {}): Promise<DownloadResult> {
    const videoId = this.extractVideoId(url);
    
    // Get metadata first
    const metadata = await this.getMetadata(url);
    
    // Determine best quality/format
    const quality = options.quality || 'best';
    const format = options.format || 'mp4';
    
    try {
      // Get download URL from platform API
      const downloadUrl = await this.getDownloadUrl(videoId, quality, format);
      
      // Download the file
      const result = await this.downloadFile(downloadUrl, {
        ...options,
        filename: options.filename || `${videoId}.${format}`,
        onProgress: options.onProgress
      });

      return {
        ...result,
        metadata,
        source: 'newplatform',
        originalUrl: url
      };
    } catch (error) {
      logger.error(`Failed to download NewPlatform video ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Get direct download URL for video
   */
  private async getDownloadUrl(videoId: string, quality: string, format: string): Promise<string> {
    const response = await fetch(`https://api.newplatform.com/video/${videoId}/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VideoImporter/1.0'
      },
      body: JSON.stringify({ quality, format })
    });

    if (!response.ok) {
      throw new Error(`Failed to get download URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.download_url;
  }

  /**
   * Get available qualities for a video
   */
  async getAvailableQualities(url: string): Promise<string[]> {
    const videoId = this.extractVideoId(url);
    
    try {
      const response = await fetch(`https://api.newplatform.com/video/${videoId}/qualities`);
      const data = await response.json();
      return data.qualities || ['best', 'worst'];
    } catch {
      return ['best', 'worst'];
    }
  }

  /**
   * Platform-specific validation
   */
  async validate(url: string): Promise<{ valid: boolean; reason?: string }> {
    if (!this.canHandle(url)) {
      return { valid: false, reason: 'URL is not from NewPlatform' };
    }

    try {
      this.extractVideoId(url);
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }
}
```

### 2. Register the Platform

Add your new downloader to the `DownloaderManager` in `src/services/downloaders/DownloaderManager.ts`:

```typescript
import { NewPlatformDownloader } from './NewPlatformDownloader';

export class DownloaderManager {
  private downloaders: VideoDownloader[] = [
    new YouTubeDownloader(),
    new TikTokDownloader(),
    new InstagramDownloader(),
    new FacebookDownloader(),
    new NewPlatformDownloader(), // Add your platform
    new GenericDownloader() // Keep as fallback
  ];
}
```

### 3. Update Types (if needed)

If your platform requires new metadata fields, extend the types in `src/types/import.ts`:

```typescript
export interface VideoMetadata {
  // Existing fields...
  
  // New platform-specific fields
  creator?: string;
  viewCount?: number;
  tags?: string[];
  category?: string;
}

export enum VideoSourceType {
  YOUTUBE = 'youtube',
  TIKTOK = 'tiktok',
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  NEWPLATFORM = 'newplatform', // Add your platform
  URL = 'url',
  FILE = 'file'
}
```

### 4. Add Platform Detection

Update the platform detection logic in `VideoImportService`:

```typescript
export class VideoImportService {
  detectPlatform(url: string): VideoSourceType {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        return VideoSourceType.YOUTUBE;
      }
      if (hostname.includes('tiktok.com')) {
        return VideoSourceType.TIKTOK;
      }
      // ... other platforms
      if (hostname.includes('newplatform.com') || hostname.includes('np.com')) {
        return VideoSourceType.NEWPLATFORM;
      }

      return VideoSourceType.URL;
    } catch {
      return VideoSourceType.URL;
    }
  }
}
```

### 5. Add Tests

Create comprehensive tests in `src/services/downloaders/__tests__/NewPlatformDownloader.test.ts`:

```typescript
import { NewPlatformDownloader } from '../NewPlatformDownloader';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('NewPlatformDownloader', () => {
  let downloader: NewPlatformDownloader;

  beforeEach(() => {
    downloader = new NewPlatformDownloader();
  });

  describe('canHandle', () => {
    it('should handle NewPlatform URLs', () => {
      expect(downloader.canHandle('https://newplatform.com/video/abc123')).toBe(true);
      expect(downloader.canHandle('https://np.com/abc123')).toBe(true);
    });

    it('should reject non-NewPlatform URLs', () => {
      expect(downloader.canHandle('https://youtube.com/watch?v=abc123')).toBe(false);
      expect(downloader.canHandle('https://example.com')).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should extract metadata for valid video', async () => {
      // Mock API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          title: 'Test Video',
          description: 'Test Description',
          duration: 120,
          creator: { name: 'Test Creator' }
        })
      });

      const metadata = await downloader.getMetadata('https://newplatform.com/video/test123');
      
      expect(metadata.title).toBe('Test Video');
      expect(metadata.duration).toBe(120);
      expect(metadata.creator).toBe('Test Creator');
    });
  });

  describe('download', () => {
    it('should download video successfully', async () => {
      // Mock implementation for download test
      // ... test implementation
    });
  });
});
```

## Adding TTS Providers

The TTS system supports multiple providers through a common interface. Here's how to add a new TTS provider:

### 1. Create TTS Provider

Create `src/short-creator/libraries/TTS/NewTTSProvider.ts`:

```typescript
import { TTSProvider, TTSOptions, TTSResult } from './types';
import { logger } from '../../../logger';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

export class NewTTSProvider implements TTSProvider {
  readonly name = 'newtts';
  readonly displayName = 'New TTS Service';
  readonly supportedLanguages = ['en', 'es', 'fr', 'de', 'pt', 'it'];
  readonly supportedVoices = ['voice1', 'voice2', 'voice3'];

  constructor(
    private apiKey: string,
    private baseUrl: string = 'https://api.newtts.com/v1'
  ) {}

  /**
   * Check if the provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available voices for a language
   */
  async getVoices(language?: string): Promise<Voice[]> {
    try {
      const url = language 
        ? `${this.baseUrl}/voices?lang=${language}`
        : `${this.baseUrl}/voices`;
        
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.voices.map(v => ({
        id: v.id,
        name: v.name,
        language: v.language,
        gender: v.gender,
        description: v.description
      }));
    } catch (error) {
      logger.error('Failed to get NewTTS voices:', error);
      return [];
    }
  }

  /**
   * Generate speech from text
   */
  async generateSpeech(text: string, options: TTSOptions = {}): Promise<TTSResult> {
    const startTime = Date.now();
    
    try {
      // Prepare request
      const requestBody = {
        text: text,
        voice: options.voice || 'voice1',
        language: options.language || 'en',
        speed: options.speed || 1.0,
        pitch: options.pitch || 1.0,
        format: options.format || 'wav',
        sample_rate: options.sampleRate || 22050
      };

      // Make API request
      const response = await fetch(`${this.baseUrl}/synthesize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`TTS API request failed: ${response.statusText}`);
      }

      // Save audio file
      const audioBuffer = await response.buffer();
      const filename = `tts_${Date.now()}.${requestBody.format}`;
      const outputPath = path.join(options.outputDir || './temp', filename);
      
      await fs.writeFile(outputPath, audioBuffer);

      // Get duration (you might need to use ffprobe or similar)
      const duration = await this.getAudioDuration(outputPath);

      const result: TTSResult = {
        audioPath: outputPath,
        duration,
        text,
        voice: requestBody.voice,
        language: requestBody.language,
        processingTime: Date.now() - startTime,
        provider: this.name,
        metadata: {
          speed: requestBody.speed,
          pitch: requestBody.pitch,
          format: requestBody.format,
          sampleRate: requestBody.sample_rate
        }
      };

      logger.info(`NewTTS synthesis completed in ${result.processingTime}ms`, {
        text: text.substring(0, 100),
        voice: requestBody.voice,
        duration: result.duration
      });

      return result;
    } catch (error) {
      logger.error('NewTTS synthesis failed:', error);
      throw error;
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return [...this.supportedLanguages];
  }

  /**
   * Estimate cost for synthesis (if applicable)
   */
  async estimateCost(text: string, options: TTSOptions = {}): Promise<number> {
    // Calculate based on character count or API pricing
    const characterCount = text.length;
    const baseRate = 0.000016; // Example: $0.000016 per character
    return characterCount * baseRate;
  }

  /**
   * Validate text before synthesis
   */
  validateText(text: string): { valid: boolean; reason?: string } {
    if (!text || text.trim().length === 0) {
      return { valid: false, reason: 'Text cannot be empty' };
    }

    if (text.length > 5000) {
      return { valid: false, reason: 'Text exceeds maximum length of 5000 characters' };
    }

    return { valid: true };
  }

  /**
   * Get audio duration using ffprobe (helper method)
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    // Implement using ffprobe or similar
    // This is a placeholder implementation
    return 10.0; // Return actual duration in seconds
  }

  /**
   * Cleanup generated files
   */
  async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        logger.warn(`Failed to cleanup TTS file ${filePath}:`, error);
      }
    }
  }
}
```

### 2. Register TTS Provider

Update the TTS service to include your provider in `src/short-creator/libraries/TTS/TTSService.ts`:

```typescript
import { NewTTSProvider } from './NewTTSProvider';

export class TTSService {
  private providers: Map<string, TTSProvider> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Existing providers
    this.providers.set('eleven-labs', new ElevenLabsProvider(process.env.ELEVENLABS_API_KEY));
    this.providers.set('openai', new OpenAITTSProvider(process.env.OPENAI_API_KEY));
    
    // Add your new provider
    if (process.env.NEWTTS_API_KEY) {
      this.providers.set('newtts', new NewTTSProvider(
        process.env.NEWTTS_API_KEY,
        process.env.NEWTTS_BASE_URL
      ));
    }
  }
}
```

### 3. Update Configuration

Add configuration options in `src/config.ts`:

```typescript
export const config = {
  // ... existing config
  
  tts: {
    // ... existing TTS config
    
    newTTS: {
      apiKey: process.env.NEWTTS_API_KEY,
      baseUrl: process.env.NEWTTS_BASE_URL || 'https://api.newtts.com/v1',
      defaultVoice: process.env.NEWTTS_DEFAULT_VOICE || 'voice1',
      maxCharacters: parseInt(process.env.NEWTTS_MAX_CHARS || '5000')
    }
  }
};
```

### 4. Add Environment Variables

Update `.env.example`:

```bash
# New TTS Provider
NEWTTS_API_KEY=your_api_key_here
NEWTTS_BASE_URL=https://api.newtts.com/v1
NEWTTS_DEFAULT_VOICE=voice1
NEWTTS_MAX_CHARS=5000
```

## Adding AI Services

The AI system supports multiple providers through a common interface. Here's how to add a new AI service:

### 1. Create AI Provider

Create `src/services/NewAIService.ts`:

```typescript
import { AIService, AIOptions, VideoAnalysis, SuggestedClip } from '../types/ai';
import { TranscriptSegment, VideoMetadata } from '../types/import';
import { logger } from '../logger';

export class NewAIService implements AIService {
  readonly name = 'newai';
  readonly displayName = 'New AI Service';
  readonly capabilities = ['analysis', 'suggestions', 'summary', 'sentiment'];

  constructor(
    private apiKey: string,
    private baseUrl: string = 'https://api.newai.com/v1'
  ) {}

  /**
   * Check if the service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Analyze video transcript and metadata
   */
  async analyzeVideo(
    transcript: TranscriptSegment[],
    metadata: VideoMetadata,
    options: AIOptions = {}
  ): Promise<VideoAnalysis> {
    try {
      const prompt = this.buildAnalysisPrompt(transcript, metadata, options);
      
      const response = await fetch(`${this.baseUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          model: options.model || 'default',
          max_tokens: options.maxTokens || 2000,
          temperature: options.temperature || 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`AI analysis failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        transcript,
        detectedScenes: [],
        suggestedClips: [],
        topics: result.topics || [],
        keywords: result.keywords || [],
        sentiment: result.sentiment || 'neutral',
        summary: result.summary,
        language: result.language || metadata.language || 'en',
        confidence: result.confidence || 0.8
      };
    } catch (error) {
      logger.error('NewAI analysis failed:', error);
      throw error;
    }
  }

  /**
   * Generate clip suggestions
   */
  async generateSuggestions(
    analysis: VideoAnalysis,
    maxSuggestions: number = 5
  ): Promise<SuggestedClip[]> {
    try {
      const response = await fetch(`${this.baseUrl}/suggestions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transcript: analysis.transcript,
          topics: analysis.topics,
          keywords: analysis.keywords,
          max_suggestions: maxSuggestions
        })
      });

      const result = await response.json();
      
      return result.suggestions.map((suggestion, index) => ({
        id: `clip_${index + 1}`,
        startTime: suggestion.start_time,
        endTime: suggestion.end_time,
        reason: suggestion.reason,
        score: suggestion.score,
        title: suggestion.title,
        description: suggestion.description,
        keywords: suggestion.keywords || [],
        sceneIds: [],
        transcriptSegmentIds: suggestion.segment_ids || []
      }));
    } catch (error) {
      logger.error('NewAI suggestion generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate content summary
   */
  async summarizeContent(transcript: TranscriptSegment[]): Promise<string> {
    try {
      const text = transcript.map(segment => segment.text).join(' ');
      
      const response = await fetch(`${this.baseUrl}/summarize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          max_length: 200
        })
      });

      const result = await response.json();
      return result.summary;
    } catch (error) {
      logger.error('NewAI summarization failed:', error);
      throw error;
    }
  }

  /**
   * Detect sentiment of content
   */
  async detectSentiment(text: string): Promise<'positive' | 'negative' | 'neutral' | 'mixed'> {
    try {
      const response = await fetch(`${this.baseUrl}/sentiment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      });

      const result = await response.json();
      return result.sentiment;
    } catch (error) {
      logger.error('NewAI sentiment detection failed:', error);
      return 'neutral';
    }
  }

  /**
   * Extract keywords from content
   */
  async extractKeywords(text: string, maxKeywords: number = 10): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/keywords`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          max_keywords: maxKeywords
        })
      });

      const result = await response.json();
      return result.keywords;
    } catch (error) {
      logger.error('NewAI keyword extraction failed:', error);
      return [];
    }
  }

  /**
   * Build analysis prompt based on transcript and metadata
   */
  private buildAnalysisPrompt(
    transcript: TranscriptSegment[],
    metadata: VideoMetadata,
    options: AIOptions
  ): string {
    const text = transcript.map(segment => segment.text).join(' ');
    
    return `
Analyze this video content and provide insights:

Title: ${metadata.title || 'Unknown'}
Duration: ${metadata.duration} seconds
Description: ${metadata.description || 'No description'}

Transcript:
${text}

Please analyze and provide:
1. Main topics discussed
2. Key keywords
3. Overall sentiment
4. Brief summary
5. Target audience
6. Engagement potential

Focus on: ${options.focus || 'general analysis'}
`;
  }
}
```

### 2. Register AI Service

Update the AI service registry:

```typescript
// In ImportPipelineService or AI service manager
if (process.env.NEWAI_API_KEY) {
  this.aiServices.set('newai', new NewAIService(
    process.env.NEWAI_API_KEY,
    process.env.NEWAI_BASE_URL
  ));
}
```

## Adding Processing Steps

The pipeline uses a step-based architecture. Here's how to add custom processing steps:

### 1. Create Processing Step

Create `src/services/pipeline/CustomProcessingStep.ts`:

```typescript
import { ProcessingStep, ImportJob, ProcessingStepResult } from '../types/pipeline';
import { logger } from '../../logger';
import { eventBus } from '../../server/events/EventBus';

export class CustomProcessingStep implements ProcessingStep {
  readonly name = 'custom-processing';
  readonly displayName = 'Custom Processing';
  readonly description = 'Performs custom video processing';
  readonly estimatedDuration = 30; // seconds

  /**
   * Check if step should be executed
   */
  isEnabled(job: ImportJob): boolean {
    return job.config.enableCustomProcessing === true;
  }

  /**
   * Get dependencies - steps that must complete before this one
   */
  getDependencies(): string[] {
    return ['download', 'transcription']; // Requires these steps first
  }

  /**
   * Execute the processing step
   */
  async execute(job: ImportJob): Promise<ProcessingStepResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`Starting custom processing for job ${job.id}`);
      
      // Emit start event
      eventBus.emitVideoProcessingProgress({
        videoId: job.id,
        progress: 0,
        stage: this.name,
        message: 'Starting custom processing...',
        timestamp: new Date().toISOString()
      });

      // Your custom processing logic here
      const result = await this.performCustomProcessing(job);
      
      // Update progress
      this.updateProgress(job, 50, 'Processing video...');
      
      // More processing...
      const finalResult = await this.finishProcessing(result, job);
      
      // Complete
      this.updateProgress(job, 100, 'Custom processing complete');
      
      const processingTime = Date.now() - startTime;
      
      logger.info(`Custom processing completed for job ${job.id} in ${processingTime}ms`);
      
      return {
        success: true,
        processingTime,
        outputFiles: finalResult.files,
        metadata: finalResult.metadata,
        message: 'Custom processing completed successfully'
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error(`Custom processing failed for job ${job.id}:`, error);
      
      // Emit error event
      eventBus.emitVideoError({
        videoId: job.id,
        error: `Custom processing failed: ${error.message}`,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        processingTime,
        error: error.message,
        message: 'Custom processing failed'
      };
    }
  }

  /**
   * Estimate processing time based on job
   */
  estimateProcessingTime(job: ImportJob): number {
    // Base estimate on video duration, complexity, etc.
    const baseTime = this.estimatedDuration;
    const durationFactor = (job.metadata?.duration || 60) / 60; // Scale by minutes
    return Math.round(baseTime * durationFactor);
  }

  /**
   * Validate job before processing
   */
  async validate(job: ImportJob): Promise<{ valid: boolean; reason?: string }> {
    if (!job.metadata) {
      return { valid: false, reason: 'No video metadata available' };
    }
    
    if (!job.analysis?.transcript) {
      return { valid: false, reason: 'Transcript required for custom processing' };
    }
    
    return { valid: true };
  }

  /**
   * Cleanup step resources
   */
  async cleanup(job: ImportJob): Promise<void> {
    // Cleanup any temporary files or resources
    logger.info(`Cleaning up custom processing resources for job ${job.id}`);
  }

  /**
   * Perform the actual custom processing
   */
  private async performCustomProcessing(job: ImportJob): Promise<any> {
    // Your custom logic here
    // This could be:
    // - Additional video analysis
    // - Custom effects or filters
    // - Integration with external services
    // - Custom metadata extraction
    
    return {
      processed: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Finish processing and prepare results
   */
  private async finishProcessing(result: any, job: ImportJob): Promise<any> {
    return {
      files: [], // Output file paths
      metadata: result, // Processing metadata
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Update processing progress
   */
  private updateProgress(job: ImportJob, progress: number, message: string): void {
    eventBus.emitVideoProcessingProgress({
      videoId: job.id,
      progress,
      stage: this.name,
      message,
      timestamp: new Date().toISOString()
    });
  }
}
```

### 2. Register Processing Step

Add your step to the pipeline in `ImportPipelineService`:

```typescript
export class ImportPipelineService {
  private readonly steps: ProcessingStep[] = [
    new DownloadStep(),
    new TranscriptionStep(),
    new SceneDetectionStep(),
    new AnalysisStep(),
    new CustomProcessingStep(), // Add your step
    new SuggestionStep(),
    new FinalizationStep()
  ];

  async processImportJob(jobId: string): Promise<void> {
    const job = await this.getImportJob(jobId);
    if (!job) throw new Error('Import job not found');

    // Build execution order based on dependencies
    const executionOrder = this.buildExecutionOrder();
    
    for (const step of executionOrder) {
      if (!step.isEnabled(job)) {
        logger.info(`Skipping step ${step.name} for job ${job.id}`);
        continue;
      }

      // Validate step
      const validation = await step.validate(job);
      if (!validation.valid) {
        logger.warn(`Step ${step.name} validation failed: ${validation.reason}`);
        continue;
      }

      // Execute step
      const result = await step.execute(job);
      
      // Update job with results
      await this.updateJobWithStepResult(job, step.name, result);
      
      if (!result.success) {
        throw new Error(`Step ${step.name} failed: ${result.error}`);
      }
    }
  }
}
```

## Best Practices for Extensions

### 1. Error Handling

Always implement comprehensive error handling:

```typescript
try {
  const result = await this.performOperation();
  return result;
} catch (error) {
  logger.error(`Operation failed:`, error);
  
  // Emit error event for real-time updates
  eventBus.emitVideoError({
    videoId: this.currentJobId,
    error: error.message,
    timestamp: new Date().toISOString()
  });
  
  throw error;
}
```

### 2. Progress Reporting

Keep users informed with progress updates:

```typescript
private async longRunningOperation(job: ImportJob): Promise<void> {
  const steps = ['step1', 'step2', 'step3'];
  
  for (let i = 0; i < steps.length; i++) {
    const progress = Math.round(((i + 1) / steps.length) * 100);
    
    this.updateProgress(job, progress, `Executing ${steps[i]}...`);
    
    await this.executeStep(steps[i]);
  }
}
```

### 3. Configuration Management

Use environment variables for configuration:

```typescript
export class ExtensionService {
  constructor() {
    this.config = {
      apiKey: process.env.EXTENSION_API_KEY,
      baseUrl: process.env.EXTENSION_BASE_URL || 'https://api.example.com',
      timeout: parseInt(process.env.EXTENSION_TIMEOUT || '30000'),
      retries: parseInt(process.env.EXTENSION_RETRIES || '3')
    };
  }
}
```

### 4. Testing

Write comprehensive tests for your extensions:

```typescript
describe('CustomProcessingStep', () => {
  let step: CustomProcessingStep;
  let mockJob: ImportJob;

  beforeEach(() => {
    step = new CustomProcessingStep();
    mockJob = createMockImportJob();
  });

  it('should execute successfully with valid job', async () => {
    const result = await step.execute(mockJob);
    
    expect(result.success).toBe(true);
    expect(result.outputFiles).toBeDefined();
    expect(result.processingTime).toBeGreaterThan(0);
  });

  it('should handle errors gracefully', async () => {
    // Mock error condition
    mockJob.metadata = null;
    
    const result = await step.execute(mockJob);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### 5. Documentation

Document your extensions thoroughly:

```typescript
/**
 * Custom Processing Step
 * 
 * This step performs custom video processing operations including:
 * - Feature extraction
 * - Custom filters
 * - External API integration
 * 
 * @requires Transcription step must be completed
 * @config enableCustomProcessing - Set to true to enable this step
 * @env CUSTOM_PROCESSING_API_KEY - API key for external service
 * 
 * @example
 * ```typescript
 * const step = new CustomProcessingStep();
 * const result = await step.execute(job);
 * ```
 */
export class CustomProcessingStep implements ProcessingStep {
  // Implementation...
}
```

This extension guide provides a comprehensive framework for extending the video import feature with new platforms, services, and processing capabilities while maintaining consistency with the existing architecture.