import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../logger';
import { TranscriptSegment } from '../types/import';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Translate } from '@google-cloud/translate/build/src/v2';
import * as deepl from 'deepl-node';
import NodeCache from 'node-cache';
import { OllamaService } from './OllamaService';

export interface TranslationOptions {
  provider?: 'google-cloud' | 'deepl' | 'openai' | 'google-ai' | 'ollama';
  model?: string;
  targetLanguage: string;
  sourceLanguage?: string;
  preserveFormatting?: boolean;
  contextWindow?: number; // Number of segments to consider for context
  glossary?: Record<string, string>; // Custom translations for specific terms
  style?: 'formal' | 'casual' | 'technical' | 'creative';
  fallbackProviders?: Array<'google-cloud' | 'deepl' | 'openai' | 'google-ai' | 'ollama'>;
  maxRetries?: number;
  enableCache?: boolean;
  culturalAdaptation?: boolean;
  lengthOptimization?: boolean;
}

export interface TranslationJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  segments: TranscriptSegment[];
  translatedSegments?: TranscriptSegment[];
  targetLanguage: string;
  sourceLanguage?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TranslationResult {
  segments: TranscriptSegment[];
  sourceLanguage: string;
  targetLanguage: string;
  confidence?: number;
  provider?: string;
  processingTime?: number;
  cached?: boolean;
}

export interface SubtitleStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  position?: 'top' | 'bottom' | 'center';
  outline?: boolean;
  shadow?: boolean;
}

// Comprehensive language codes mapping for different providers
const LANGUAGE_CODES: Record<string, { iso: string; googleCloud: string; deepl: string; name: string }> = {
  'english': { iso: 'en', googleCloud: 'en', deepl: 'en-US', name: 'English' },
  'spanish': { iso: 'es', googleCloud: 'es', deepl: 'es', name: 'Spanish' },
  'french': { iso: 'fr', googleCloud: 'fr', deepl: 'fr', name: 'French' },
  'german': { iso: 'de', googleCloud: 'de', deepl: 'de', name: 'German' },
  'italian': { iso: 'it', googleCloud: 'it', deepl: 'it', name: 'Italian' },
  'portuguese': { iso: 'pt', googleCloud: 'pt', deepl: 'pt-PT', name: 'Portuguese' },
  'portuguese-br': { iso: 'pt-BR', googleCloud: 'pt', deepl: 'pt-BR', name: 'Portuguese (Brazil)' },
  'russian': { iso: 'ru', googleCloud: 'ru', deepl: 'ru', name: 'Russian' },
  'japanese': { iso: 'ja', googleCloud: 'ja', deepl: 'ja', name: 'Japanese' },
  'korean': { iso: 'ko', googleCloud: 'ko', deepl: 'ko', name: 'Korean' },
  'chinese': { iso: 'zh', googleCloud: 'zh', deepl: 'zh', name: 'Chinese (Simplified)' },
  'chinese-traditional': { iso: 'zh-TW', googleCloud: 'zh-TW', deepl: 'zh-TW', name: 'Chinese (Traditional)' },
  'arabic': { iso: 'ar', googleCloud: 'ar', deepl: 'ar', name: 'Arabic' },
  'hindi': { iso: 'hi', googleCloud: 'hi', deepl: 'hi', name: 'Hindi' },
  'dutch': { iso: 'nl', googleCloud: 'nl', deepl: 'nl', name: 'Dutch' },
  'swedish': { iso: 'sv', googleCloud: 'sv', deepl: 'sv', name: 'Swedish' },
  'polish': { iso: 'pl', googleCloud: 'pl', deepl: 'pl', name: 'Polish' },
  'turkish': { iso: 'tr', googleCloud: 'tr', deepl: 'tr', name: 'Turkish' },
  'vietnamese': { iso: 'vi', googleCloud: 'vi', deepl: 'vi', name: 'Vietnamese' },
  'thai': { iso: 'th', googleCloud: 'th', deepl: 'th', name: 'Thai' },
  'indonesian': { iso: 'id', googleCloud: 'id', deepl: 'id', name: 'Indonesian' },
  'hebrew': { iso: 'he', googleCloud: 'he', deepl: 'he', name: 'Hebrew' },
  'norwegian': { iso: 'no', googleCloud: 'no', deepl: 'nb', name: 'Norwegian' },
  'danish': { iso: 'da', googleCloud: 'da', deepl: 'da', name: 'Danish' },
  'finnish': { iso: 'fi', googleCloud: 'fi', deepl: 'fi', name: 'Finnish' },
  'czech': { iso: 'cs', googleCloud: 'cs', deepl: 'cs', name: 'Czech' },
  'slovak': { iso: 'sk', googleCloud: 'sk', deepl: 'sk', name: 'Slovak' },
  'ukrainian': { iso: 'uk', googleCloud: 'uk', deepl: 'uk', name: 'Ukrainian' },
  'greek': { iso: 'el', googleCloud: 'el', deepl: 'el', name: 'Greek' },
  'bulgarian': { iso: 'bg', googleCloud: 'bg', deepl: 'bg', name: 'Bulgarian' },
  'romanian': { iso: 'ro', googleCloud: 'ro', deepl: 'ro', name: 'Romanian' },
  'hungarian': { iso: 'hu', googleCloud: 'hu', deepl: 'hu', name: 'Hungarian' },
  'lithuanian': { iso: 'lt', googleCloud: 'lt', deepl: 'lt', name: 'Lithuanian' },
  'latvian': { iso: 'lv', googleCloud: 'lv', deepl: 'lv', name: 'Latvian' },
  'estonian': { iso: 'et', googleCloud: 'et', deepl: 'et', name: 'Estonian' },
  'slovenian': { iso: 'sl', googleCloud: 'sl', deepl: 'sl', name: 'Slovenian' }
};

// Terminology consistency patterns
const TERMINOLOGY_PATTERNS: Record<string, RegExp> = {
  'technical_terms': /\b(API|SDK|AI|ML|UI|UX|HTTP|JSON|XML|SQL|NoSQL|DevOps|CI\/CD)\b/gi,
  'brand_names': /\b(Google|Microsoft|Apple|Amazon|OpenAI|DeepL|GitHub|YouTube|TikTok|Instagram)\b/gi,
  'measurement_units': /\b(\d+(?:\.\d+)?\s*(?:kg|lb|m|ft|cm|in|°C|°F|MB|GB|TB))\b/gi,
  'currency': /\b(\$|€|£|¥|₽)\d+(?:,\d{3})*(?:\.\d{2})?\b/gi
};

// Cultural adaptation rules
const CULTURAL_ADAPTATIONS: Record<string, Record<string, string>> = {
  'en': {
    'temperature': '°F',
    'date_format': 'MM/DD/YYYY',
    'measurement': 'imperial'
  },
  'fr': {
    'temperature': '°C',
    'date_format': 'DD/MM/YYYY',
    'measurement': 'metric'
  },
  'de': {
    'temperature': '°C',
    'date_format': 'DD.MM.YYYY',
    'measurement': 'metric'
  },
  'ja': {
    'temperature': '°C',
    'date_format': 'YYYY/MM/DD',
    'measurement': 'metric'
  }
};

export interface SubtitleExtractionResult {
  format: 'srt' | 'vtt' | 'ass' | 'embedded' | 'none';
  content?: string;
  segments?: TranscriptSegment[];
  language?: string;
  encoding?: string;
}

export interface TranslationMetrics {
  totalSegments: number;
  translatedSegments: number;
  failedSegments: number;
  averageConfidence: number;
  processingTimeMs: number;
  cacheHitRate: number;
  providerUsage: Record<string, number>;
}

export class TranslationService extends EventEmitter {
  private tempDir: string;
  private jobs: Map<string, TranslationJob> = new Map();
  private openai?: OpenAI;
  private googleAI?: GoogleGenerativeAI;
  private googleCloud?: Translate;
  private deepl?: deepl.Translator;
  private ollama?: OllamaService;
  private cache: NodeCache;
  private translationsDir: string;
  private metricsCache: Map<string, TranslationMetrics> = new Map();

  constructor(dataDir: string, apiKeys?: { 
    openai?: string; 
    google?: string;
    googleCloud?: string;
    deepl?: string;
  }) {
    super();
    this.tempDir = path.join(dataDir, 'temp', 'translations');
    this.translationsDir = path.join(dataDir, 'translations');
    
    // Initialize cache with 1 hour TTL
    this.cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
    
    this.initializeService(apiKeys);
  }

  private async initializeService(apiKeys?: {
    openai?: string;
    google?: string;
    googleCloud?: string;
    deepl?: string;
  }): Promise<void> {
    try {
      await fs.ensureDir(this.tempDir);
      await fs.ensureDir(this.translationsDir);
      
      // Initialize translation providers
      if (apiKeys?.openai) {
        this.openai = new OpenAI({ apiKey: apiKeys.openai });
        logger.info('OpenAI translation provider initialized');
      }
      
      if (apiKeys?.google) {
        this.googleAI = new GoogleGenerativeAI(apiKeys.google);
        logger.info('Google AI translation provider initialized');
      }
      
      if (apiKeys?.googleCloud) {
        this.googleCloud = new Translate({ key: apiKeys.googleCloud });
        logger.info('Google Cloud Translate provider initialized');
      }
      
      if (apiKeys?.deepl) {
        this.deepl = new deepl.Translator(apiKeys.deepl);
        logger.info('DeepL translation provider initialized');
      }
      
      // Initialize Ollama service for local translation
      try {
        this.ollama = new OllamaService();
        logger.info('Ollama translation provider initialized');
      } catch (error) {
        logger.warn('Ollama service not available for translation');
      }
      
      logger.info({ 
        tempDir: this.tempDir, 
        translationsDir: this.translationsDir,
        providers: this.getAvailableProviders()
      }, 'Translation service initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize translation service');
      throw error;
    }
  }


  /**
   * Translate a single text string
   */
  public async translateText(options: {
    text: string;
    sourceLanguage?: string;
    targetLanguage: string;
    includeAlternatives?: boolean;
  }): Promise<{
    translatedText: string;
    detectedSourceLanguage?: string;
    confidence?: number;
    alternatives?: string[];
    provider?: string;
  }> {
    try {
      // Create a temporary segment for translation
      const segment: TranscriptSegment = {
        text: options.text,
        startTime: 0,
        endTime: 1
      };

      // Use the existing translation infrastructure
      const result = await this.translateSegments([segment], {
        targetLanguage: options.targetLanguage,
        sourceLanguage: options.sourceLanguage,
        provider: this.getAvailableProviders()[0] as any || 'openai',
        maxRetries: 2,
        enableCache: true
      });

      return {
        translatedText: result.segments[0]?.text || options.text,
        detectedSourceLanguage: result.sourceLanguage,
        confidence: result.confidence,
        alternatives: [], // Could be enhanced to provide alternatives
        provider: result.provider
      };
    } catch (error) {
      logger.error({ error, text: options.text.substring(0, 50) }, 'Failed to translate text');
      throw error;
    }
  }

  /**
   * Translate transcript segments
   */
  public async translateSegments(
    segments: TranscriptSegment[],
    options: TranslationOptions
  ): Promise<TranslationResult> {
    const jobId = this.generateJobId();
    const job: TranslationJob = {
      id: jobId,
      status: 'pending',
      progress: 0,
      segments,
      targetLanguage: options.targetLanguage,
      sourceLanguage: options.sourceLanguage
    };

    this.jobs.set(jobId, job);
    this.emit('translation:started', job);

    try {
      job.status = 'processing';
      job.startedAt = new Date();
      this.updateJob(jobId, job);

      // Detect source language if not provided
      if (!options.sourceLanguage) {
        options.sourceLanguage = await this.detectLanguage(segments[0].text, options.provider);
        job.sourceLanguage = options.sourceLanguage;
      }

      // Translate segments
      const translatedSegments = await this.performTranslation(segments, options, jobId);

      job.status = 'completed';
      job.translatedSegments = translatedSegments;
      job.completedAt = new Date();
      job.progress = 100;
      this.updateJob(jobId, job);
      this.emit('translation:completed', job);

      return {
        segments: translatedSegments,
        sourceLanguage: options.sourceLanguage!,
        targetLanguage: options.targetLanguage,
        confidence: 0.95 // TODO: Calculate actual confidence
      };
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      this.updateJob(jobId, job);
      this.emit('translation:failed', job);
      throw error;
    }
  }

  /**
   * Perform the actual translation with provider fallback
   */
  private async performTranslation(
    segments: TranscriptSegment[],
    options: TranslationOptions,
    jobId: string
  ): Promise<TranscriptSegment[]> {
    const {
      provider = 'google-cloud',
      contextWindow = 3,
      fallbackProviders = ['deepl', 'openai', 'google-ai'],
      maxRetries = 3,
      enableCache = true,
      culturalAdaptation = false,
      lengthOptimization = false
    } = options;
    
    const translatedSegments: TranscriptSegment[] = [];
    const failedSegments: number[] = [];
    const startTime = Date.now();
    let cacheHits = 0;
    const providerUsage: Record<string, number> = {};

    for (let i = 0; i < segments.length; i++) {
      let translatedText = '';
      let success = false;
      let usedProvider = provider;

      try {
        // Check cache first if enabled
        if (enableCache) {
          const cacheKey = this.generateCacheKey(segments[i].text, options);
          const cachedTranslation = this.cache.get<string>(cacheKey);
          if (cachedTranslation) {
            translatedText = cachedTranslation;
            success = true;
            cacheHits++;
            logger.debug(`Cache hit for segment ${i}`);
          }
        }

        if (!success) {
          // Get context from surrounding segments
          const context = this.getContext(segments, i, contextWindow);
          
          // Try primary provider
          try {
            translatedText = await this.translateWithProvider(
              segments[i].text,
              context,
              options,
              provider
            );
            success = true;
            usedProvider = provider;
          } catch (primaryError) {
            logger.warn({ error: primaryError, provider }, `Primary provider failed for segment ${i}`);
            
            // Try fallback providers
            for (const fallbackProvider of fallbackProviders) {
              if (!this.isProviderAvailable(fallbackProvider)) continue;
              
              try {
                translatedText = await this.translateWithProvider(
                  segments[i].text,
                  context,
                  options,
                  fallbackProvider
                );
                success = true;
                usedProvider = fallbackProvider;
                logger.info(`Fallback provider ${fallbackProvider} succeeded for segment ${i}`);
                break;
              } catch (fallbackError) {
                logger.warn({ error: fallbackError, provider: fallbackProvider }, `Fallback provider failed for segment ${i}`);
              }
            }
          }

          // Cache successful translation
          if (success && enableCache) {
            const cacheKey = this.generateCacheKey(segments[i].text, options);
            this.cache.set(cacheKey, translatedText);
          }
        }

        if (success) {
          // Track provider usage
          providerUsage[usedProvider] = (providerUsage[usedProvider] || 0) + 1;
          
          // Apply post-processing
          let finalText = translatedText;
          
          // Apply glossary if provided
          if (options.glossary) {
            finalText = this.applyGlossary(finalText, options.glossary);
          }
          
          // Apply terminology consistency
          finalText = this.applyTerminologyConsistency(finalText, segments[i].text);
          
          // Apply cultural adaptation
          if (culturalAdaptation) {
            finalText = this.applyCulturalAdaptation(finalText, options.targetLanguage);
          }
          
          // Apply length optimization
          if (lengthOptimization) {
            finalText = this.optimizeLength(finalText, segments[i]);
          }

          translatedSegments.push({
            ...segments[i],
            text: finalText
          });
        } else {
          // Translation failed completely, use original text
          failedSegments.push(i);
          translatedSegments.push(segments[i]);
          logger.error(`All translation providers failed for segment ${i}, using original text`);
        }
      } catch (error) {
        failedSegments.push(i);
        translatedSegments.push(segments[i]);
        logger.error({ error, segmentIndex: i }, 'Unexpected error during translation');
      }

      // Update progress
      const progress = ((i + 1) / segments.length) * 100;
      this.updateProgress(jobId, progress);
    }

    // Store metrics
    const metrics: TranslationMetrics = {
      totalSegments: segments.length,
      translatedSegments: segments.length - failedSegments.length,
      failedSegments: failedSegments.length,
      averageConfidence: 0.95, // TODO: Calculate based on provider confidence
      processingTimeMs: Date.now() - startTime,
      cacheHitRate: (cacheHits / segments.length) * 100,
      providerUsage
    };
    
    this.metricsCache.set(jobId, metrics);
    this.emit('translation:metrics', { jobId, metrics });

    return translatedSegments;
  }

  /**
   * Translate with specific provider
   */
  private async translateWithProvider(
    text: string,
    context: string,
    options: TranslationOptions,
    provider: string
  ): Promise<string> {
    const { targetLanguage, sourceLanguage, style = 'formal' } = options;

    switch (provider) {
      case 'google-cloud':
        return this.translateWithGoogleCloud(text, context, targetLanguage, sourceLanguage, style);
      case 'deepl':
        return this.translateWithDeepL(text, context, targetLanguage, sourceLanguage, style);
      case 'openai':
        return this.translateWithOpenAI(text, context, targetLanguage, sourceLanguage, style);
      case 'google-ai':
        return this.translateWithGoogleAI(text, context, targetLanguage, sourceLanguage, style);
      case 'ollama':
        return this.translateWithOllama(text, context, targetLanguage, sourceLanguage, style);
      default:
        throw new Error(`Unsupported translation provider: ${provider}`);
    }
  }

  /**
   * Translate using OpenAI
   */
  private async translateWithOpenAI(
    text: string,
    context: string,
    targetLanguage: string,
    sourceLanguage?: string,
    style: string = 'formal'
  ): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = `You are a professional translator. Translate the following text from ${sourceLanguage || 'auto-detected language'} to ${targetLanguage}. 
    Maintain the ${style} style and preserve the original meaning and tone. 
    Consider the context provided for better accuracy.`;

    const userPrompt = `Context: ${context}\n\nTranslate this: ${text}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      return response.choices[0].message.content?.trim() || text;
    } catch (error) {
      logger.error({ error }, 'OpenAI translation failed');
      throw error;
    }
  }

  /**
   * Translate using Google Cloud Translate API
   */
  private async translateWithGoogleCloud(
    text: string,
    context: string,
    targetLanguage: string,
    sourceLanguage?: string,
    style: string = 'formal'
  ): Promise<string> {
    if (!this.googleCloud) {
      throw new Error('Google Cloud Translate API key not configured');
    }

    try {
      const targetLang = this.getLanguageCode(targetLanguage, 'googleCloud');
      const sourceLang = sourceLanguage ? this.getLanguageCode(sourceLanguage, 'googleCloud') : undefined;

      const [translation] = await this.googleCloud.translate(text, {
        from: sourceLang,
        to: targetLang,
        format: 'text'
      });

      return translation.trim();
    } catch (error) {
      logger.error({ error }, 'Google Cloud Translate failed');
      throw error;
    }
  }

  /**
   * Translate using DeepL API
   */
  private async translateWithDeepL(
    text: string,
    context: string,
    targetLanguage: string,
    sourceLanguage?: string,
    style: string = 'formal'
  ): Promise<string> {
    if (!this.deepl) {
      throw new Error('DeepL API key not configured');
    }

    try {
      const targetLang = this.getLanguageCode(targetLanguage, 'deepl') as deepl.TargetLanguageCode;
      const sourceLang = sourceLanguage ? 
        this.getLanguageCode(sourceLanguage, 'deepl') as deepl.SourceLanguageCode : 
        null;

      const options: deepl.TranslateTextOptions = {
        sourceLang,
        formality: style === 'formal' ? 'more' : style === 'casual' ? 'less' : 'default'
      };

      const result = await this.deepl.translateText(text, sourceLang, targetLang, options);
      return result.text.trim();
    } catch (error) {
      logger.error({ error }, 'DeepL translation failed');
      throw error;
    }
  }

  /**
   * Translate using Google Generative AI
   */
  private async translateWithGoogleAI(
    text: string,
    context: string,
    targetLanguage: string,
    sourceLanguage?: string,
    style: string = 'formal'
  ): Promise<string> {
    if (!this.googleAI) {
      throw new Error('Google AI API key not configured');
    }

    const model = this.googleAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const prompt = `Translate the following text from ${sourceLanguage || 'auto-detected language'} to ${targetLanguage}.
    Style: ${style}
    Context: ${context}
    
    Text to translate: ${text}
    
    Provide only the translation, no explanations.`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      logger.error({ error }, 'Google AI translation failed');
      throw error;
    }
  }

  /**
   * Translate using Ollama (local)
   */
  private async translateWithOllama(
    text: string,
    context: string,
    targetLanguage: string,
    sourceLanguage?: string,
    style: string = 'formal'
  ): Promise<string> {
    if (!this.ollama) {
      throw new Error('Ollama service not configured');
    }

    const targetLangName = this.getLanguageName(targetLanguage);
    const sourceLangName = sourceLanguage ? this.getLanguageName(sourceLanguage) : 'auto-detected language';
    
    const systemPrompt = `You are a professional translator. Translate the following text from ${sourceLangName} to ${targetLangName}. Maintain the ${style} style and preserve the original meaning and tone. Consider the context provided for better accuracy. Provide only the translation without explanations.`;
    
    const userPrompt = `Context: ${context}\n\nTranslate this: ${text}`;

    try {
      const response = await this.ollama.generateResponse(
        userPrompt,
        {
          systemPrompt,
          temperature: 0.3,
          maxTokens: 500
        }
      );

      return response.trim();
    } catch (error) {
      logger.error({ error }, 'Ollama translation failed');
      throw error;
    }
  }

  /**
   * Extract subtitles from video file
   */
  public async extractSubtitles(videoPath: string): Promise<SubtitleExtractionResult> {
    try {
      // First, try to extract embedded subtitles using FFmpeg
      const embeddedResult = await this.extractEmbeddedSubtitles(videoPath);
      if (embeddedResult.segments && embeddedResult.segments.length > 0) {
        return embeddedResult;
      }

      // Check for external subtitle files
      const externalResult = await this.findExternalSubtitles(videoPath);
      if (externalResult.segments && externalResult.segments.length > 0) {
        return externalResult;
      }

      return {
        format: 'none',
        content: '',
        segments: [],
        language: 'unknown'
      };
    } catch (error) {
      logger.error({ error, videoPath }, 'Failed to extract subtitles');
      throw error;
    }
  }

  /**
   * Extract embedded subtitles using FFmpeg
   */
  private async extractEmbeddedSubtitles(videoPath: string): Promise<SubtitleExtractionResult> {
    try {
      const outputPath = path.join(this.tempDir, `${Date.now()}_embedded.srt`);
      
      // Use FFmpeg to extract subtitles
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const command = `ffmpeg -i "${videoPath}" -map 0:s:0? -c:s srt "${outputPath}" -y`;
      
      try {
        await execAsync(command);
        
        if (await fs.pathExists(outputPath)) {
          const content = await fs.readFile(outputPath, 'utf-8');
          const segments = this.parseSRT(content);
          
          // Clean up temp file
          await fs.remove(outputPath);
          
          return {
            format: 'embedded',
            content,
            segments,
            language: 'unknown' // TODO: Detect language from subtitle content
          };
        }
      } catch (ffmpegError) {
        logger.debug('No embedded subtitles found or extraction failed');
      }

      return {
        format: 'none',
        segments: []
      };
    } catch (error) {
      logger.error({ error }, 'Failed to extract embedded subtitles');
      return {
        format: 'none',
        segments: []
      };
    }
  }

  /**
   * Find external subtitle files
   */
  private async findExternalSubtitles(videoPath: string): Promise<SubtitleExtractionResult> {
    try {
      const videoDir = path.dirname(videoPath);
      const videoName = path.basename(videoPath, path.extname(videoPath));
      const extensions = ['.srt', '.vtt', '.ass', '.ssa'];
      
      for (const ext of extensions) {
        const subtitlePath = path.join(videoDir, videoName + ext);
        if (await fs.pathExists(subtitlePath)) {
          const content = await fs.readFile(subtitlePath, 'utf-8');
          const format = ext.substring(1) as 'srt' | 'vtt' | 'ass';
          const segments = this.parseSubtitleFile(content, format);
          
          return {
            format,
            content,
            segments,
            language: 'unknown' // TODO: Detect language
          };
        }
      }

      return {
        format: 'none',
        segments: []
      };
    } catch (error) {
      logger.error({ error }, 'Failed to find external subtitles');
      return {
        format: 'none',
        segments: []
      };
    }
  }

  /**
   * Parse subtitle file based on format
   */
  private parseSubtitleFile(content: string, format: 'srt' | 'vtt' | 'ass'): TranscriptSegment[] {
    switch (format) {
      case 'srt':
        return this.parseSRT(content);
      case 'vtt':
        return this.parseVTT(content);
      case 'ass':
        return this.parseASS(content);
      default:
        return [];
    }
  }

  /**
   * Parse SRT subtitle format
   */
  private parseSRT(content: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    const blocks = content.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;

      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
      if (!timeMatch) continue;

      const startTime = this.parseTimecodeSRT(timeMatch[1]);
      const endTime = this.parseTimecodeSRT(timeMatch[2]);
      const text = lines.slice(2).join('\n').trim();

      segments.push({
        startTime,
        endTime,
        text
      });
    }

    return segments;
  }

  /**
   * Parse VTT subtitle format
   */
  private parseVTT(content: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    const lines = content.split('\n');
    let i = 0;

    // Skip header
    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    while (i < lines.length) {
      const timeLine = lines[i];
      const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);
      
      if (timeMatch) {
        const startTime = this.parseTimecodeVTT(timeMatch[1]);
        const endTime = this.parseTimecodeVTT(timeMatch[2]);
        
        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
          textLines.push(lines[i]);
          i++;
        }
        
        if (textLines.length > 0) {
          segments.push({
            startTime,
            endTime,
            text: textLines.join('\n').trim()
          });
        }
      } else {
        i++;
      }
    }

    return segments;
  }

  /**
   * Parse ASS subtitle format
   */
  private parseASS(content: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('Dialogue:')) {
        const parts = line.split(',');
        if (parts.length >= 10) {
          const startTime = this.parseTimecodeASS(parts[1]);
          const endTime = this.parseTimecodeASS(parts[2]);
          const text = parts.slice(9).join(',').replace(/{[^}]*}/g, '').trim();
          
          if (text) {
            segments.push({
              startTime,
              endTime,
              text
            });
          }
        }
      }
    }

    return segments;
  }

  /**
   * Convert transcription to subtitles
   */
  public async createSubtitlesFromTranscription(
    segments: TranscriptSegment[],
    format: 'srt' | 'vtt' | 'ass',
    outputPath: string,
    options?: {
      maxLength?: number;
      maxDuration?: number;
      style?: SubtitleStyle;
    }
  ): Promise<string> {
    try {
      const { maxLength = 80, maxDuration = 5 } = options || {};
      
      // Optimize segments for subtitle display
      const optimizedSegments = this.optimizeSegmentsForSubtitles(segments, maxLength, maxDuration);
      
      let content = '';
      switch (format) {
        case 'srt':
          content = this.generateSRT(optimizedSegments);
          break;
        case 'vtt':
          content = this.generateVTT(optimizedSegments);
          break;
        case 'ass':
          content = this.generateASS(optimizedSegments, options?.style);
          break;
      }

      await fs.writeFile(outputPath, content, 'utf-8');
      return outputPath;
    } catch (error) {
      logger.error({ error }, 'Failed to create subtitles from transcription');
      throw error;
    }
  }

  /**
   * Optimize segments for subtitle display
   */
  private optimizeSegmentsForSubtitles(
    segments: TranscriptSegment[],
    maxLength: number,
    maxDuration: number
  ): TranscriptSegment[] {
    const optimized: TranscriptSegment[] = [];

    for (const segment of segments) {
      const duration = segment.endTime - segment.startTime;
      const text = segment.text;

      if (text.length <= maxLength && duration <= maxDuration) {
        // Segment is already optimal
        optimized.push(segment);
      } else if (text.length > maxLength) {
        // Split long text into multiple segments
        const words = text.split(' ');
        let currentText = '';
        let currentStart = segment.startTime;
        const wordsPerSecond = words.length / duration;

        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const testText = currentText ? `${currentText} ${word}` : word;
          
          if (testText.length > maxLength && currentText) {
            // Create segment with current text
            const segmentDuration = currentText.split(' ').length / wordsPerSecond;
            optimized.push({
              startTime: currentStart,
              endTime: currentStart + segmentDuration,
              text: currentText
            });
            
            currentStart += segmentDuration;
            currentText = word;
          } else {
            currentText = testText;
          }
        }
        
        // Add remaining text
        if (currentText) {
          optimized.push({
            startTime: currentStart,
            endTime: segment.endTime,
            text: currentText
          });
        }
      } else {
        // Duration is too long but text is fine
        optimized.push(segment);
      }
    }

    return optimized;
  }

  /**
   * Detect language of text
   */
  private async detectLanguage(text: string, provider?: string): Promise<string> {
    try {
      // Try Google Cloud Translate first if available
      if (this.googleCloud && (!provider || provider === 'google-cloud')) {
        try {
          const [detection] = await this.googleCloud.detect(text);
          const detectedLang = Array.isArray(detection) ? detection[0].language : detection.language;
          return detectedLang || 'en';
        } catch (error) {
          logger.debug('Google Cloud language detection failed, trying other methods');
        }
      }

      // Try DeepL if available
      if (this.deepl && (!provider || provider === 'deepl')) {
        try {
          // DeepL doesn't have a dedicated detect endpoint, but we can infer from supported languages
          const usage = await this.deepl.getUsage();
          if (usage) {
            // Use simple heuristics for common languages
            return this.detectLanguageHeuristic(text);
          }
        } catch (error) {
          logger.debug('DeepL language detection failed, trying other methods');
        }
      }

      // Try OpenAI if available
      if (this.openai && (!provider || provider === 'openai')) {
        try {
          const response = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Detect the language of the following text. Respond with only the ISO 639-1 language code (e.g., "en", "es", "fr").' },
              { role: 'user', content: text.substring(0, 200) } // Limit text length
            ],
            temperature: 0,
            max_tokens: 10
          });

          const detectedLanguage = response.choices[0].message.content?.trim().toLowerCase() || 'en';
          return detectedLanguage;
        } catch (error) {
          logger.debug('OpenAI language detection failed');
        }
      }

      // Fallback to heuristic detection
      return this.detectLanguageHeuristic(text);
    } catch (error) {
      logger.error({ error }, 'Language detection failed completely');
      return 'en'; // Default to English
    }
  }

  /**
   * Get context from surrounding segments
   */
  private getContext(segments: TranscriptSegment[], index: number, windowSize: number): string {
    const start = Math.max(0, index - windowSize);
    const end = Math.min(segments.length, index + windowSize + 1);
    
    return segments
      .slice(start, end)
      .map(s => s.text)
      .join(' ');
  }

  /**
   * Apply glossary to translated text
   */
  private applyGlossary(text: string, glossary: Record<string, string>): string {
    let result = text;
    
    for (const [original, translation] of Object.entries(glossary)) {
      // Case-insensitive replacement
      const regex = new RegExp(`\\b${original}\\b`, 'gi');
      result = result.replace(regex, translation);
    }
    
    return result;
  }

  /**
   * Generate bilingual subtitles
   */
  public async generateBilingualSubtitles(
    originalSegments: TranscriptSegment[],
    translatedSegments: TranscriptSegment[],
    format: 'srt' | 'vtt' | 'ass',
    outputPath: string,
    options: {
      layout?: 'stacked' | 'side-by-side';
      originalStyle?: SubtitleStyle;
      translatedStyle?: SubtitleStyle;
    } = {}
  ): Promise<string> {
    const { layout = 'stacked' } = options;
    let content = '';

    switch (format) {
      case 'srt':
        content = this.generateBilingualSRT(originalSegments, translatedSegments, layout);
        break;
      case 'vtt':
        content = this.generateBilingualVTT(originalSegments, translatedSegments, layout);
        break;
      case 'ass':
        content = this.generateBilingualASS(
          originalSegments, 
          translatedSegments, 
          layout,
          options.originalStyle,
          options.translatedStyle
        );
        break;
    }

    await fs.writeFile(outputPath, content, 'utf-8');
    return outputPath;
  }

  /**
   * Generate bilingual SRT
   */
  private generateBilingualSRT(
    original: TranscriptSegment[],
    translated: TranscriptSegment[],
    layout: string
  ): string {
    const segments: string[] = [];

    for (let i = 0; i < original.length; i++) {
      const start = this.formatTimeSRT(original[i].startTime);
      const end = this.formatTimeSRT(original[i].endTime);
      
      let text = '';
      if (layout === 'stacked') {
        text = `${translated[i].text}\n${original[i].text}`;
      } else {
        text = `${original[i].text} | ${translated[i].text}`;
      }

      segments.push(`${i + 1}\n${start} --> ${end}\n${text}\n`);
    }

    return segments.join('\n');
  }

  /**
   * Generate bilingual VTT
   */
  private generateBilingualVTT(
    original: TranscriptSegment[],
    translated: TranscriptSegment[],
    layout: string
  ): string {
    const header = 'WEBVTT\n\n';
    const segments: string[] = [];

    for (let i = 0; i < original.length; i++) {
      const start = this.formatTimeVTT(original[i].startTime);
      const end = this.formatTimeVTT(original[i].endTime);
      
      let text = '';
      if (layout === 'stacked') {
        text = `${translated[i].text}\n${original[i].text}`;
      } else {
        text = `${original[i].text} | ${translated[i].text}`;
      }

      segments.push(`${start} --> ${end}\n${text}\n`);
    }

    return header + segments.join('\n');
  }

  /**
   * Generate bilingual ASS with styling
   */
  private generateBilingualASS(
    original: TranscriptSegment[],
    translated: TranscriptSegment[],
    layout: string,
    originalStyle?: SubtitleStyle,
    translatedStyle?: SubtitleStyle
  ): string {
    const header = this.generateASSHeader(originalStyle, translatedStyle);
    const events: string[] = [];

    for (let i = 0; i < original.length; i++) {
      const start = this.formatTimeASS(original[i].startTime);
      const end = this.formatTimeASS(original[i].endTime);
      
      if (layout === 'stacked') {
        // Translated on top
        events.push(`Dialogue: 0,${start},${end},Translated,,0,0,0,,${translated[i].text}`);
        // Original below
        events.push(`Dialogue: 0,${start},${end},Original,,0,0,0,,${original[i].text}`);
      } else {
        // Side by side
        const combined = `${original[i].text} | ${translated[i].text}`;
        events.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${combined}`);
      }
    }

    return header + events.join('\n');
  }

  /**
   * Generate ASS header with styles
   */
  private generateASSHeader(originalStyle?: SubtitleStyle, translatedStyle?: SubtitleStyle): string {
    const defaultOriginal = {
      fontFamily: 'Arial',
      fontSize: 18,
      color: '&H00FFFFFF',
      position: 'bottom'
    };

    const defaultTranslated = {
      fontFamily: 'Arial',
      fontSize: 20,
      color: '&H00FFFF00',
      position: 'top'
    };

    const origStyle = { ...defaultOriginal, ...originalStyle };
    const transStyle = { ...defaultTranslated, ...translatedStyle };

    return `[Script Info]
Title: Bilingual Subtitles
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Original,${origStyle.fontFamily},${origStyle.fontSize},${origStyle.color},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,50,1
Style: Translated,${transStyle.fontFamily},${transStyle.fontSize},${transStyle.color},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,8,10,10,10,1
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  }

  /**
   * Batch translate multiple videos
   */
  public async batchTranslate(
    videos: Array<{
      segments: TranscriptSegment[];
      outputPath: string;
    }>,
    options: TranslationOptions
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    
    this.emit('batch:started', { total: videos.length });

    for (let i = 0; i < videos.length; i++) {
      try {
        const result = await this.translateSegments(videos[i].segments, options);
        results.push(result);
        
        // Save translated subtitles
        await this.saveTranslatedSubtitles(
          result.segments,
          'srt',
          videos[i].outputPath
        );
        
        this.emit('batch:progress', {
          completed: i + 1,
          total: videos.length,
          progress: ((i + 1) / videos.length) * 100
        });
      } catch (error) {
        logger.error({ error, index: i }, 'Failed to translate video in batch');
        this.emit('batch:error', { error, index: i });
      }
    }

    this.emit('batch:completed', { results });
    return results;
  }

  /**
   * Save translated subtitles
   */
  private async saveTranslatedSubtitles(
    segments: TranscriptSegment[],
    format: 'srt' | 'vtt' | 'ass',
    outputPath: string
  ): Promise<void> {
    let content = '';

    switch (format) {
      case 'srt':
        content = this.generateSRT(segments);
        break;
      case 'vtt':
        content = this.generateVTT(segments);
        break;
      case 'ass':
        content = this.generateASS(segments);
        break;
    }

    await fs.writeFile(outputPath, content, 'utf-8');
  }

  /**
   * Time formatting helpers
   */
  private formatTimeSRT(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis
      .toString()
      .padStart(3, '0')}`;
  }

  private formatTimeVTT(seconds: number): string {
    return this.formatTimeSRT(seconds).replace(',', '.');
  }

  private formatTimeASS(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centisecs = Math.floor((seconds % 1) * 100);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
  }

  /**
   * Generate SRT format
   */
  private generateSRT(segments: TranscriptSegment[]): string {
    return segments
      .map((segment, index) => {
        const start = this.formatTimeSRT(segment.startTime);
        const end = this.formatTimeSRT(segment.endTime);
        return `${index + 1}\n${start} --> ${end}\n${segment.text}\n`;
      })
      .join('\n');
  }

  /**
   * Generate VTT format
   */
  private generateVTT(segments: TranscriptSegment[]): string {
    const header = 'WEBVTT\n\n';
    const content = segments
      .map((segment) => {
        const start = this.formatTimeVTT(segment.startTime);
        const end = this.formatTimeVTT(segment.endTime);
        return `${start} --> ${end}\n${segment.text}\n`;
      })
      .join('\n');
    return header + content;
  }


  /**
   * Update job progress
   */
  private updateProgress(jobId: string, progress: number): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = progress;
      this.emit('translation:progress', { jobId, progress });
    }
  }

  /**
   * Update job
   */
  private updateJob(jobId: string, updates: Partial<TranslationJob>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
      this.jobs.set(jobId, job);
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `translation-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get job by ID
   */
  public getJob(jobId: string): TranslationJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  public getAllJobs(): TranslationJob[] {
    return Array.from(this.jobs.values());
  }

  // === Helper Methods ===

  /**
   * Get available translation providers
   */
  public getAvailableProviders(): string[] {
    const providers: string[] = [];
    if (this.googleCloud) providers.push('google-cloud');
    if (this.deepl) providers.push('deepl');
    if (this.openai) providers.push('openai');
    if (this.googleAI) providers.push('google-ai');
    if (this.ollama) providers.push('ollama');
    return providers;
  }

  /**
   * Check if provider is available
   */
  private isProviderAvailable(provider: string): boolean {
    switch (provider) {
      case 'google-cloud': return !!this.googleCloud;
      case 'deepl': return !!this.deepl;
      case 'openai': return !!this.openai;
      case 'google-ai': return !!this.googleAI;
      case 'ollama': return !!this.ollama;
      default: return false;
    }
  }

  /**
   * Get language code for specific provider
   */
  private getLanguageCode(language: string, provider: 'googleCloud' | 'deepl' | 'iso'): string {
    const langData = LANGUAGE_CODES[language.toLowerCase()];
    if (langData) {
      return langData[provider];
    }
    return language; // Return as-is if not found
  }

  /**
   * Get language name
   */
  private getLanguageName(language: string): string {
    const langData = LANGUAGE_CODES[language.toLowerCase()];
    return langData?.name || language;
  }

  /**
   * Generate cache key for translation
   */
  private generateCacheKey(text: string, options: TranslationOptions): string {
    const keyData = {
      text: text.substring(0, 100), // Use first 100 chars
      target: options.targetLanguage,
      source: options.sourceLanguage || 'auto',
      style: options.style || 'formal'
    };
    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  /**
   * Apply terminology consistency
   */
  private applyTerminologyConsistency(translatedText: string, originalText: string): string {
    let result = translatedText;

    // Preserve technical terms
    const technicalMatches = originalText.match(TERMINOLOGY_PATTERNS.technical_terms);
    if (technicalMatches) {
      for (const term of technicalMatches) {
        // Replace only if the term appears to be translated incorrectly
        const regex = new RegExp(`\\b${term.toLowerCase()}\\b`, 'gi');
        if (!result.match(regex)) {
          // Try to find and replace similar terms
          result = result.replace(/\b(api|sdk|ai|ml|ui|ux)\b/gi, term);
        }
      }
    }

    // Preserve brand names
    const brandMatches = originalText.match(TERMINOLOGY_PATTERNS.brand_names);
    if (brandMatches) {
      for (const brand of brandMatches) {
        const regex = new RegExp(`\\b${brand}\\b`, 'gi');
        result = result.replace(regex, brand);
      }
    }

    // Preserve measurements and currency
    const measurementMatches = originalText.match(TERMINOLOGY_PATTERNS.measurement_units);
    if (measurementMatches) {
      for (const measurement of measurementMatches) {
        if (!result.includes(measurement)) {
          // Find position to insert measurement
          const words = result.split(' ');
          const numberMatch = measurement.match(/(\d+(?:\.\d+)?)/);
          if (numberMatch) {
            const number = numberMatch[1];
            const index = words.findIndex(word => word.includes(number));
            if (index >= 0) {
              words[index] = measurement;
              result = words.join(' ');
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Apply cultural adaptation
   */
  private applyCulturalAdaptation(text: string, targetLanguage: string): string {
    const langCode = this.getLanguageCode(targetLanguage, 'iso');
    const adaptations = CULTURAL_ADAPTATIONS[langCode];
    
    if (!adaptations) return text;

    let result = text;

    // Convert temperature units
    if (adaptations.temperature) {
      if (adaptations.temperature === '°C') {
        // Convert Fahrenheit to Celsius mentions
        result = result.replace(/(\d+)\s*°?F\b/g, (match, temp) => {
          const celsius = Math.round((parseFloat(temp) - 32) * 5 / 9);
          return `${celsius}°C`;
        });
      } else if (adaptations.temperature === '°F') {
        // Convert Celsius to Fahrenheit mentions
        result = result.replace(/(\d+)\s*°?C\b/g, (match, temp) => {
          const fahrenheit = Math.round(parseFloat(temp) * 9 / 5 + 32);
          return `${fahrenheit}°F`;
        });
      }
    }

    // Convert measurement systems
    if (adaptations.measurement === 'metric') {
      // Convert imperial to metric
      result = result.replace(/(\d+(?:\.\d+)?)\s*(?:feet|ft)\b/gi, (match, value) => {
        const meters = (parseFloat(value) * 0.3048).toFixed(1);
        return `${meters}m`;
      });
      result = result.replace(/(\d+(?:\.\d+)?)\s*(?:inches|in)\b/gi, (match, value) => {
        const cm = (parseFloat(value) * 2.54).toFixed(1);
        return `${cm}cm`;
      });
    } else if (adaptations.measurement === 'imperial') {
      // Convert metric to imperial
      result = result.replace(/(\d+(?:\.\d+)?)\s*m\b/g, (match, value) => {
        const feet = (parseFloat(value) * 3.28084).toFixed(1);
        return `${feet}ft`;
      });
      result = result.replace(/(\d+(?:\.\d+)?)\s*cm\b/g, (match, value) => {
        const inches = (parseFloat(value) * 0.393701).toFixed(1);
        return `${inches}in`;
      });
    }

    return result;
  }

  /**
   * Optimize text length for subtitles
   */
  private optimizeLength(text: string, segment: TranscriptSegment): string {
    const duration = segment.endTime - segment.startTime;
    const maxCharsPerSecond = 15; // Reading speed guideline
    const maxLength = Math.floor(duration * maxCharsPerSecond);
    
    if (text.length <= maxLength) return text;
    
    // Smart truncation - try to preserve meaning
    const sentences = text.split(/[.!?]+/);
    let result = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence && (result + trimmedSentence).length <= maxLength) {
        result += (result ? ' ' : '') + trimmedSentence;
      } else {
        break;
      }
    }
    
    if (!result) {
      // If no complete sentences fit, truncate words
      const words = text.split(' ');
      result = '';
      for (const word of words) {
        if ((result + ' ' + word).length <= maxLength) {
          result += (result ? ' ' : '') + word;
        } else {
          break;
        }
      }
    }
    
    return result || text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Simple heuristic language detection
   */
  private detectLanguageHeuristic(text: string): string {
    const sample = text.toLowerCase().substring(0, 200);
    
    // Common words in different languages
    const patterns = {
      'en': /\b(the|and|or|is|are|was|were|have|has|had|will|would|could|should)\b/g,
      'es': /\b(el|la|los|las|y|o|es|son|fue|fueron|tiene|tenía|será|sería)\b/g,
      'fr': /\b(le|la|les|et|ou|est|sont|était|étaient|avoir|avait|sera|serait)\b/g,
      'de': /\b(der|die|das|und|oder|ist|sind|war|waren|haben|hatte|wird|würde)\b/g,
      'it': /\b(il|la|gli|le|e|o|è|sono|era|erano|avere|aveva|sarà|sarebbe)\b/g,
      'pt': /\b(o|a|os|as|e|ou|é|são|era|eram|ter|tinha|será|seria)\b/g,
      'ru': /\b(и|или|это|был|была|были|есть|имеет|будет|может)\b/g,
      'ja': /[ひらがなカタカナ漢字]/g,
      'ko': /[가-힣]/g,
      'zh': /[\u4e00-\u9fff]/g,
      'ar': /[\u0600-\u06ff]/g
    };
    
    let maxCount = 0;
    let detectedLang = 'en';
    
    for (const [lang, pattern] of Object.entries(patterns)) {
      const matches = sample.match(pattern);
      const count = matches ? matches.length : 0;
      if (count > maxCount) {
        maxCount = count;
        detectedLang = lang;
      }
    }
    
    return detectedLang;
  }

  /**
   * Parse timecode utilities
   */
  private parseTimecodeSRT(timecode: string): number {
    const [time, ms] = timecode.split(',');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds + Number(ms) / 1000;
  }

  private parseTimecodeVTT(timecode: string): number {
    const [time, ms] = timecode.split('.');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds + Number(ms) / 1000;
  }

  private parseTimecodeASS(timecode: string): number {
    const [hours, minutes, secondsCentisecs] = timecode.split(':');
    const [seconds, centisecs] = secondsCentisecs.split('.');
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(centisecs) / 100;
  }

  /**
   * Generate ASS format with optional custom styles
   */
  private generateASS(segments: TranscriptSegment[], style?: SubtitleStyle): string {
    if (style) {
      const defaultStyle = {
        fontFamily: 'Arial',
        fontSize: 20,
        color: '&H00FFFFFF',
        backgroundColor: '&H00000000',
        outline: true,
        shadow: false,
        position: 'bottom'
      };

      const finalStyle = { ...defaultStyle, ...style };

      const header = `[Script Info]\nTitle: Translation\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${finalStyle.fontFamily},${finalStyle.fontSize},${finalStyle.color},&H000000FF,&H00000000,${finalStyle.backgroundColor},0,0,0,0,100,100,0,0,1,${finalStyle.outline ? 2 : 0},${finalStyle.shadow ? 1 : 0},2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

      const events = segments
        .map((segment) => {
          const start = this.formatTimeASS(segment.startTime);
          const end = this.formatTimeASS(segment.endTime);
          return `Dialogue: 0,${start},${end},Default,,0,0,0,,${segment.text}`;
        })
        .join('\n');

      return header + events;
    } else {
      // Default ASS format
      const header = `[Script Info]\nTitle: Translation\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

      const events = segments
        .map((segment) => {
          const start = this.formatTimeASS(segment.startTime);
          const end = this.formatTimeASS(segment.endTime);
          return `Dialogue: 0,${start},${end},Default,,0,0,0,,${segment.text}`;
        })
        .join('\n');

      return header + events;
    }
  }

  /**
   * Get translation metrics for a job
   */
  public getTranslationMetrics(jobId: string): TranslationMetrics | undefined {
    return this.metricsCache.get(jobId);
  }

  /**
   * Clear old cache entries
   */
  public clearCache(): void {
    this.cache.flushAll();
    logger.info('Translation cache cleared');
  }

  /**
   * Get supported languages (synchronous version)
   */
  public getSupportedLanguages(): Array<{ code: string; name: string }> {
    return Object.entries(LANGUAGE_CODES).map(([key, value]) => ({
      code: value.iso,
      name: value.name
    }));
  }

  /**
   * Save translation to persistent storage
   */
  public async saveTranslation(
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    segments: TranscriptSegment[],
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const translationId = `${videoId}_${sourceLanguage}_${targetLanguage}_${Date.now()}`;
      const translationPath = path.join(this.translationsDir, `${translationId}.json`);
      
      const translationData = {
        id: translationId,
        videoId,
        sourceLanguage,
        targetLanguage,
        segments,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString(),
          version: '1.0'
        }
      };
      
      await fs.writeJSON(translationPath, translationData, { spaces: 2 });
      logger.info({ translationId, translationPath }, 'Translation saved to persistent storage');
      
      return translationId;
    } catch (error) {
      logger.error({ error, videoId }, 'Failed to save translation');
      throw error;
    }
  }

  /**
   * Load translation from persistent storage
   */
  public async loadTranslation(translationId: string): Promise<any> {
    try {
      const translationPath = path.join(this.translationsDir, `${translationId}.json`);
      
      if (await fs.pathExists(translationPath)) {
        const translationData = await fs.readJSON(translationPath);
        return translationData;
      }
      
      return null;
    } catch (error) {
      logger.error({ error, translationId }, 'Failed to load translation');
      throw error;
    }
  }

  /**
   * List translations for a video
   */
  public async listTranslations(videoId: string): Promise<Array<{
    id: string;
    sourceLanguage: string;
    targetLanguage: string;
    createdAt: string;
  }>> {
    try {
      const files = await fs.readdir(this.translationsDir);
      const translations = [];
      
      for (const file of files) {
        if (file.startsWith(`${videoId}_`) && file.endsWith('.json')) {
          try {
            const filePath = path.join(this.translationsDir, file);
            const data = await fs.readJSON(filePath);
            
            translations.push({
              id: data.id,
              sourceLanguage: data.sourceLanguage,
              targetLanguage: data.targetLanguage,
              createdAt: data.metadata?.createdAt || 'unknown'
            });
          } catch (fileError) {
            logger.warn({ file, error: fileError }, 'Failed to read translation file');
          }
        }
      }
      
      return translations.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      logger.error({ error, videoId }, 'Failed to list translations');
      return [];
    }
  }
}