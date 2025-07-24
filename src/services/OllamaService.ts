import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import { logger } from '../logger';
import {
  OllamaModel,
  OllamaGenerateRequest,
  OllamaGenerateResponse,
  VideoAnalysis,
  TranscriptSegment,
  DetectedScene,
  SuggestedClip
} from '../types/import';

interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
  timeout: number;
  maxRetries: number;
  contextWindowSize: number;
  batchSize: number;
  cacheEnabled: boolean;
  cacheTTL: number; // in milliseconds
}

interface PromptTemplate {
  name: string;
  template: string;
  systemPrompt?: string;
  temperature: number;
  maxTokens: number;
}

interface HighlightScore {
  score: number;
  reason: string;
  confidence: number;
  factors: {
    engagement: number;
    narrative: number;
    emotional: number;
    visual: number;
    viral: number;
  };
}

interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  ttl: number;
}

export class OllamaService extends EventEmitter {
  private config: OllamaConfig;
  private isAvailable: boolean = false;
  private cache: Map<string, CacheEntry> = new Map();
  private connectionPool: Set<Promise<any>> = new Set();
  private healthCheckInterval?: NodeJS.Timeout;
  private promptTemplates: Map<string, PromptTemplate>;

  constructor(config?: Partial<OllamaConfig>) {
    super();
    this.config = {
      baseUrl: config?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      defaultModel: config?.defaultModel || process.env.OLLAMA_DEFAULT_MODEL || 'gemma3:4b-it-qat', // Using smaller model by default
      timeout: config?.timeout || parseInt(process.env.OLLAMA_TIMEOUT || '120000'), // 2 minutes default
      maxRetries: config?.maxRetries || parseInt(process.env.OLLAMA_MAX_RETRIES || '3'),
      contextWindowSize: config?.contextWindowSize || parseInt(process.env.OLLAMA_CONTEXT_WINDOW || '8192'),
      batchSize: config?.batchSize || parseInt(process.env.OLLAMA_BATCH_SIZE || '3'), // Smaller batches for stability
      cacheEnabled: config?.cacheEnabled !== false && process.env.OLLAMA_CACHE_ENABLED !== 'false',
      cacheTTL: config?.cacheTTL || parseInt(process.env.OLLAMA_CACHE_TTL || '3600000') // 1 hour
    };
    
    this.promptTemplates = this.initializePromptTemplates();
    this.checkAvailability();
    this.startHealthCheck();
  }

  /**
   * Check if Ollama is available
   */
  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        this.isAvailable = true;
        logger.info({ baseUrl: this.config.baseUrl }, 'Ollama service is available');
      } else {
        this.isAvailable = false;
        logger.warn({ status: response.status }, 'Ollama service returned non-OK status');
      }
    } catch (error) {
      this.isAvailable = false;
      logger.warn({ error }, 'Ollama service is not available');
    }
  }

  /**
   * Get available models
   */
  public async getModels(): Promise<OllamaModel[]> {
    if (!this.isAvailable) {
      throw new Error('Ollama service is not available');
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      logger.error({ error }, 'Failed to get Ollama models');
      throw error;
    }
  }

  /**
   * Generate completion
   */
  public async generate(request: OllamaGenerateRequest & { system?: string }): Promise<OllamaGenerateResponse> {
    if (!this.isAvailable) {
      throw new Error('Ollama service is not available');
    }

    // Use shorter timeout for smaller models
    const modelTimeout = request.model?.includes('4b') ? 60000 : this.config.timeout;
    
    try {
      const response = await this.retryWithBackoff(async () => {
        const res = await fetch(`${this.config.baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...request,
            model: request.model || this.config.defaultModel,
            stream: false,
            system: request.system
          }),
          signal: AbortSignal.timeout(modelTimeout)
        });

        if (!res.ok) {
          throw new Error(`Ollama API error: ${res.status}`);
        }

        return res;
      });

      return await response.json();
    } catch (error: any) {
      logger.error({ error, request }, 'Failed to generate with Ollama');
      
      // If timeout error with large model, suggest smaller alternative
      if (error.name === 'AbortError' && request.model?.includes('12b')) {
        logger.warn('Consider using gemma3:4b-it-qat for faster responses');
      }
      
      throw error;
    }
  }

  /**
   * Analyze content using Ollama
   */
  public async analyzeContent(content: string, options: {
    prompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    response: string;
    model?: string;
    totalDuration?: number;
    promptEvalCount?: number;
  }> {
    try {
      const result = await this.generate({
        model: options.model || this.config.defaultModel,
        prompt: `${options.prompt}\n\nContent to analyze:\n${content}`,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 500
        }
      });

      return {
        response: result.response,
        model: result.model,
        totalDuration: result.total_duration,
        promptEvalCount: result.prompt_eval_duration
      };
    } catch (error) {
      logger.error({ error, content: content.substring(0, 100) }, 'Failed to analyze content');
      throw error;
    }
  }

  /**
   * Analyze video transcript
   */
  public async analyzeTranscript(transcript: TranscriptSegment[]): Promise<{
    topics: string[];
    keywords: string[];
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
    summary: string;
  }> {
    const transcriptText = transcript
      .map(seg => seg.text)
      .join(' ');

    const prompt = `Analyze the following video transcript and provide:
1. Main topics discussed (as a JSON array)
2. Key keywords (as a JSON array)
3. Overall sentiment (positive, negative, neutral, or mixed)
4. A brief summary (2-3 sentences)

Transcript:
${transcriptText}

Respond in JSON format with fields: topics, keywords, sentiment, summary`;

    try {
      const response = await this.generate({
        model: this.config.defaultModel,
        prompt,
        format: 'json',
        options: {
          temperature: 0.7,
          top_p: 0.9
        }
      });

      try {
        return JSON.parse(response.response);
      } catch (parseError: any) {
        logger.error({ parseError, response: response.response.substring(0, 500) }, 'Failed to parse transcript analysis JSON');
        // Return default values on parse error
        return {
          topics: [],
          keywords: [],
          sentiment: 'neutral' as const,
          summary: 'Analysis failed - JSON parse error'
        };
      }
    } catch (error) {
      logger.error({ error }, 'Failed to analyze transcript');
      // Return default values on error
      return {
        topics: [],
        keywords: [],
        sentiment: 'neutral',
        summary: 'Analysis failed'
      };
    }
  }

  /**
   * Generate clip suggestions based on transcript and scenes
   */
  public async generateClipSuggestions(
    transcript: TranscriptSegment[],
    scenes: DetectedScene[],
    maxSuggestions: number = 10
  ): Promise<SuggestedClip[]> {
    const transcriptText = transcript
      .map((seg, idx) => `[${seg.startTime}-${seg.endTime}s] ${seg.text}`)
      .join('\n');

    const sceneDescriptions = scenes
      .map(scene => `Scene ${scene.id}: ${scene.startTime}-${scene.endTime}s, Activity: ${scene.activity || 'Unknown'}`)
      .join('\n');

    const prompt = `Analyze this video content and suggest the ${maxSuggestions} best clips for short-form content.

Transcript:
${transcriptText}

Scenes:
${sceneDescriptions}

IMPORTANT: Respond with ONLY valid JSON in the following exact format:
{
  "clips": [
    {
      "startTime": 10.5,
      "endTime": 35.2,
      "title": "Compelling title here",
      "description": "Brief description",
      "reason": "Why this makes a good short",
      "score": 85,
      "keywords": ["keyword1", "keyword2", "keyword3"]
    }
  ]
}

Do not include any text before or after the JSON. Ensure all JSON strings are properly quoted and escaped.`;

    try {
      const response = await this.generate({
        model: this.config.defaultModel,
        prompt,
        format: 'json',
        options: {
          temperature: 0.8,
          top_p: 0.95,
          num_predict: 2000
        }
      });

      // Log the raw response for debugging
      logger.debug({ response: response.response.substring(0, 500) }, 'Raw Ollama response for clip suggestions');
      
      let suggestions;
      try {
        suggestions = JSON.parse(response.response);
      } catch (parseError: any) {
        logger.error({ 
          parseError, 
          response: response.response.substring(0, 1000),
          responseLength: response.response.length 
        }, 'Failed to parse JSON response from Ollama');
        
        // Try to extract JSON from response if it's wrapped in markdown or text
        const jsonMatch = response.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            suggestions = JSON.parse(jsonMatch[0]);
            logger.info('Successfully extracted JSON from wrapped response');
          } catch (retryError) {
            logger.error({ retryError }, 'Failed to parse extracted JSON');
            return [];
          }
        } else {
          return [];
        }
      }
      
      // Ensure suggestions has clips array
      if (!suggestions || !Array.isArray(suggestions.clips)) {
        logger.warn({ suggestions }, 'Invalid suggestions format - missing clips array');
        return [];
      }
      
      // Map to SuggestedClip format
      return suggestions.clips.slice(0, maxSuggestions).map((clip: any, idx: number) => ({
        id: `clip_${idx}`,
        startTime: clip.startTime,
        endTime: clip.endTime,
        title: clip.title,
        description: clip.description,
        reason: clip.reason,
        score: clip.score / 100, // Normalize to 0-1
        keywords: clip.keywords,
        sceneIds: scenes
          .filter(scene => 
            scene.startTime <= clip.endTime && 
            scene.endTime >= clip.startTime
          )
          .map(scene => scene.id),
        transcriptSegmentIds: transcript
          .filter(seg => 
            seg.startTime <= clip.endTime && 
            seg.endTime >= clip.startTime
          )
          .map((_, idx) => `segment_${idx}`)
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to generate clip suggestions');
      return [];
    }
  }

  /**
   * Analyze video scenes for content
   */
  public async analyzeScenes(scenes: DetectedScene[]): Promise<DetectedScene[]> {
    // Batch analyze scenes for efficiency
    const batchSize = 3; // Reduced batch size for larger models
    const analyzedScenes: DetectedScene[] = [];

    for (let i = 0; i < scenes.length; i += batchSize) {
      const batch = scenes.slice(i, i + batchSize);
      
      const prompt = `Analyze these video scenes and provide descriptions:
${batch.map((scene, idx) => `Scene ${idx + 1}: Duration ${scene.duration}s, Colors: ${scene.dominantColors?.join(', ') || 'Unknown'}`).join('\n')}

For each scene, provide:
1. Activity description (what's happening)
2. Detected objects (main objects visible)
3. Mood/atmosphere

Respond in JSON format with an array matching the input scenes.`;

      try {
        const response = await this.generate({
          model: this.config.defaultModel,
          prompt,
          format: 'json',
          options: {
            temperature: 0.7,
            num_predict: 500 // Limit output for faster response
          }
        });

        let analyses;
        try {
          analyses = JSON.parse(response.response);
        } catch (parseError: any) {
          logger.error({ parseError, response: response.response.substring(0, 500) }, 'Failed to parse scene analysis JSON');
          analyses = []; // Use empty array as fallback
        }
        
        batch.forEach((scene, idx) => {
          if (analyses[idx]) {
            scene.activity = analyses[idx].activity;
            scene.objects = analyses[idx].objects;
          }
          analyzedScenes.push(scene);
        });
      } catch (error) {
        logger.error({ error }, 'Failed to analyze scene batch');
        // Add scenes without analysis on error
        analyzedScenes.push(...batch);
      }
    }

    return analyzedScenes;
  }

  /**
   * Generate video title and description
   */
  public async generateVideoMetadata(analysis: VideoAnalysis): Promise<{
    title: string;
    description: string;
    tags: string[];
  }> {
    const prompt = `Based on this video analysis, generate:
1. An engaging title (max 100 characters)
2. A compelling description (max 500 characters)
3. Relevant tags/hashtags (10-15 tags)

Video Summary: ${analysis.summary}
Topics: ${analysis.topics.join(', ')}
Keywords: ${analysis.keywords.join(', ')}

Respond in JSON format with fields: title, description, tags`;

    try {
      const response = await this.generate({
        model: this.config.defaultModel,
        prompt,
        format: 'json',
        options: {
          temperature: 0.9,
          top_p: 0.95
        }
      });

      try {
        return JSON.parse(response.response);
      } catch (parseError: any) {
        logger.error({ parseError, response: response.response.substring(0, 500) }, 'Failed to parse video metadata JSON');
        return {
          title: 'Untitled Video',
          description: 'No description available - JSON parse error',
          tags: []
        };
      }
    } catch (error) {
      logger.error({ error }, 'Failed to generate video metadata');
      return {
        title: 'Untitled Video',
        description: 'No description available',
        tags: []
      };
    }
  }

  /**
   * Check if service is available
   */
  public getAvailability(): boolean {
    return this.isAvailable;
  }

  /**
   * Refresh availability status
   */
  public async refreshAvailability(): Promise<boolean> {
    await this.checkAvailability();
    return this.isAvailable;
  }

  /**
   * Initialize prompt templates
   */
  private initializePromptTemplates(): Map<string, PromptTemplate> {
    const templates = new Map<string, PromptTemplate>();
    
    // Highlight detection template
    templates.set('highlight_detection', {
      name: 'Highlight Detection',
      template: `Analyze this video transcript segment and identify potential highlights for short-form content.

Segment ({{startTime}}s - {{endTime}}s):
{{transcript}}

Evaluate based on:
1. Engagement potential (hooks, surprises, reveals)
2. Narrative quality (complete story arc, climax)
3. Emotional impact (humor, drama, inspiration)
4. Visual interest (action, demonstrations)
5. Viral potential (relatability, shareability)

Provide:
- Overall score (0-100)
- Detailed reason for the score
- Confidence level (0-1)
- Individual factor scores
- Specific moments that stand out
- Suggested clip boundaries

Respond in JSON format.`,
      systemPrompt: 'You are an expert video editor specializing in creating viral short-form content. Focus on identifying the most engaging and shareable moments.',
      temperature: 0.7,
      maxTokens: 1000
    });
    
    // Scene boundary detection template
    templates.set('scene_boundary', {
      name: 'Scene Boundary Detection',
      template: `Analyze this transcript and identify natural scene boundaries:

{{transcript}}

Identify:
1. Topic changes
2. Speaker changes
3. Location/setting changes
4. Narrative transitions
5. Natural break points

For each boundary, provide:
- Timestamp
- Type of transition
- Confidence score

Respond in JSON format with an array of boundaries.`,
      temperature: 0.5,
      maxTokens: 800
    });
    
    // Key moment extraction template
    templates.set('key_moments', {
      name: 'Key Moment Extraction',
      template: `Identify key moments in this video segment:

Transcript:
{{transcript}}

Scene Context:
{{sceneContext}}

Find:
1. Peak emotional moments
2. Important revelations or insights
3. Funny or memorable quotes
4. Action sequences or demonstrations
5. Call-to-action moments

For each moment:
- Exact timestamp range
- Type of moment
- Impact score (0-100)
- Why it's significant
- Potential hook/title

Respond in JSON format.`,
      temperature: 0.8,
      maxTokens: 1200
    });
    
    // Topic extraction template
    templates.set('topic_extraction', {
      name: 'Topic Extraction',
      template: `Extract main topics and themes from this video content:

{{transcript}}

Provide:
1. Primary topic/theme
2. Secondary topics (up to 5)
3. Keywords and phrases (10-15)
4. Target audience
5. Content category
6. Mood/tone

Also suggest:
- Video title options (3)
- Description
- Hashtags (10-15)

Respond in JSON format.`,
      temperature: 0.6,
      maxTokens: 1000
    });
    
    return templates;
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.checkAvailability();
      if (!this.isAvailable) {
        this.emit('service:unavailable');
      }
    }, 30000);
  }

  /**
   * Stop health check monitoring
   */
  public stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Manage context window for long content
   */
  private splitIntoChunks(text: string, maxTokens: number = 4000): string[] {
    // Rough estimate: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;
    const chunks: string[] = [];
    
    // Try to split at sentence boundaries
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          // Single sentence too long, split it
          const words = sentence.split(' ');
          let wordChunk = '';
          for (const word of words) {
            if ((wordChunk + word).length > maxChars) {
              chunks.push(wordChunk.trim());
              wordChunk = word + ' ';
            } else {
              wordChunk += word + ' ';
            }
          }
          if (wordChunk) {
            currentChunk = wordChunk;
          }
        }
      } else {
        currentChunk += sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  /**
   * Cache management
   */
  private getCacheKey(operation: string, params: any): string {
    return `${operation}:${JSON.stringify(params)}`;
  }

  private getFromCache(key: string): any | null {
    if (!this.config.cacheEnabled) return null;
    
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  private setCache(key: string, value: any, ttl?: number): void {
    if (!this.config.cacheEnabled) return;
    
    this.cache.set(key, {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl || this.config.cacheTTL
    });
    
    // Clean old entries
    if (this.cache.size > 100) {
      const sorted = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      for (let i = 0; i < 20; i++) {
        this.cache.delete(sorted[i][0]);
      }
    }
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.maxRetries
  ): Promise<T> {
    let lastError: any;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (i < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, i), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Detect highlights with scoring
   */
  public async detectHighlights(
    transcript: TranscriptSegment[],
    options: {
      minScore?: number;
      maxResults?: number;
      contextWindow?: number;
    } = {}
  ): Promise<Array<SuggestedClip & { highlightScore: HighlightScore }>> {
    const minScore = options.minScore || 70;
    const maxResults = options.maxResults || 10;
    const contextWindow = options.contextWindow || 60; // seconds
    
    const highlights: Array<SuggestedClip & { highlightScore: HighlightScore }> = [];
    
    // Process transcript in sliding windows
    for (let i = 0; i < transcript.length; i++) {
      const windowStart = transcript[i].startTime;
      const windowEnd = Math.min(
        windowStart + contextWindow,
        transcript[transcript.length - 1].endTime
      );
      
      // Get segments in window
      const windowSegments = transcript.filter(
        seg => seg.startTime >= windowStart && seg.startTime < windowEnd
      );
      
      if (windowSegments.length === 0) continue;
      
      const windowText = windowSegments.map(seg => seg.text).join(' ');
      
      // Check cache
      const cacheKey = this.getCacheKey('highlight', { windowStart, windowEnd });
      let result = this.getFromCache(cacheKey);
      
      if (!result) {
        const template = this.promptTemplates.get('highlight_detection')!;
        const prompt = template.template
          .replace('{{startTime}}', windowStart.toString())
          .replace('{{endTime}}', windowEnd.toString())
          .replace('{{transcript}}', windowText);
        
        try {
          const response = await this.retryWithBackoff(() =>
            this.generate({
              model: this.config.defaultModel,
              prompt,
              system: template.systemPrompt,
              format: 'json',
              options: {
                temperature: template.temperature,
                num_predict: template.maxTokens
              }
            })
          );
          
          try {
            result = JSON.parse(response.response);
          } catch (parseError: any) {
            logger.error({ parseError, response: response.response.substring(0, 500) }, 'Failed to parse highlight detection JSON');
            continue; // Skip this window on parse error
          }
          this.setCache(cacheKey, result);
        } catch (error) {
          logger.error({ error, window: { windowStart, windowEnd } }, 'Failed to detect highlights');
          continue;
        }
      }
      
      if (result.score >= minScore) {
        const clipStart = result.suggestedStart || windowStart;
        const clipEnd = result.suggestedEnd || Math.min(windowStart + 30, windowEnd);
        
        highlights.push({
          id: `highlight_${windowStart}_${windowEnd}`,
          startTime: clipStart,
          endTime: clipEnd,
          title: result.title || `Highlight at ${clipStart}s`,
          description: result.description || windowText.substring(0, 100) + '...',
          reason: result.reason,
          score: result.score / 100,
          keywords: result.keywords || [],
          sceneIds: [],
          transcriptSegmentIds: windowSegments.map((_, idx) => `segment_${i + idx}`),
          highlightScore: {
            score: result.score,
            reason: result.reason,
            confidence: result.confidence || 0.8,
            factors: result.factors || {
              engagement: 0,
              narrative: 0,
              emotional: 0,
              visual: 0,
              viral: 0
            }
          }
        });
      }
      
      // Skip ahead to avoid too much overlap
      i += Math.floor(contextWindow / 20);
    }
    
    // Sort by score and return top results
    return highlights
      .sort((a, b) => b.highlightScore.score - a.highlightScore.score)
      .slice(0, maxResults);
  }

  /**
   * Detect scene boundaries
   */
  public async detectSceneBoundaries(
    transcript: TranscriptSegment[]
  ): Promise<Array<{ timestamp: number; type: string; confidence: number }>> {
    const chunks = this.splitIntoChunks(
      transcript.map(seg => `[${seg.startTime}s] ${seg.text}`).join('\n'),
      3000
    );
    
    const allBoundaries: Array<{ timestamp: number; type: string; confidence: number }> = [];
    
    for (const chunk of chunks) {
      const template = this.promptTemplates.get('scene_boundary')!;
      const prompt = template.template.replace('{{transcript}}', chunk);
      
      try {
        const response = await this.generate({
          model: this.config.defaultModel,
          prompt,
          format: 'json',
          options: {
            temperature: template.temperature,
            num_predict: template.maxTokens
          }
        });
        
        let boundaries = [];
        try {
          const parsed = JSON.parse(response.response);
          boundaries = parsed.boundaries || [];
        } catch (parseError: any) {
          logger.error({ parseError, response: response.response.substring(0, 500) }, 'Failed to parse scene boundaries JSON');
          // Continue with empty boundaries for this chunk
        }
        allBoundaries.push(...boundaries);
      } catch (error) {
        logger.error({ error }, 'Failed to detect scene boundaries in chunk');
      }
    }
    
    // Merge and deduplicate boundaries
    const merged = allBoundaries
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((boundary, index, array) => {
        if (index === 0) return true;
        // Remove boundaries within 2 seconds of each other
        return boundary.timestamp - array[index - 1].timestamp > 2;
      });
    
    return merged;
  }

  /**
   * Batch process multiple operations
   */
  public async batchAnalyze(
    operations: Array<{
      type: 'highlight' | 'scene' | 'topic';
      data: any;
    }>
  ): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    // Group operations by type
    const grouped = operations.reduce((acc, op) => {
      if (!acc[op.type]) acc[op.type] = [];
      acc[op.type].push(op);
      return acc;
    }, {} as Record<string, typeof operations>);
    
    // Process each type in batches
    for (const [type, ops] of Object.entries(grouped)) {
      const batchSize = this.config.batchSize;
      
      for (let i = 0; i < ops.length; i += batchSize) {
        const batch = ops.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (op, idx) => {
            const key = `${type}_${i + idx}`;
            
            try {
              let result;
              
              switch (type) {
                case 'highlight':
                  result = await this.detectHighlights(op.data.transcript, op.data.options);
                  break;
                case 'scene':
                  result = await this.detectSceneBoundaries(op.data.transcript);
                  break;
                case 'topic':
                  result = await this.analyzeTranscript(op.data.transcript);
                  break;
              }
              
              results.set(key, { success: true, data: result });
            } catch (error) {
              results.set(key, { success: false, error });
            }
          })
        );
      }
    }
    
    return results;
  }

  /**
   * Monitor token usage
   */
  public getTokenUsageStats(): {
    totalTokens: number;
    averagePerRequest: number;
    estimatedCost: number;
  } {
    // This would integrate with actual token counting from Ollama
    // For now, return estimates
    return {
      totalTokens: 0,
      averagePerRequest: 500,
      estimatedCost: 0
    };
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    this.stopHealthCheck();
    this.cache.clear();
    this.connectionPool.clear();
  }
}