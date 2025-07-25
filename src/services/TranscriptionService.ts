import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { logger } from '../logger';
import { FFmpeg } from '../short-creator/libraries/FFmpeg';
// TranscriptSegment types removed with upload functionality
// Define locally what we need
interface TranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
}

interface TranscriptionSegment extends TranscriptSegment {
  speaker?: string;
  confidence?: number;
}
// @ts-ignore - whisper-node doesn't have types
import WhisperNode from 'whisper-node';
import { installWhisperCpp } from '@remotion/install-whisper-cpp';
// YouTubeSubtitleDownloader removed with upload functionality
import { YouTubeDownloader } from './downloaders/YouTubeDownloader';

const execAsync = promisify(exec);

export interface TranscriptionOptions {
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v2' | 'large-v3';
  language?: string;
  task?: 'transcribe' | 'translate';
  outputFormat?: 'json' | 'srt' | 'vtt' | 'txt';
  wordTimestamps?: boolean;
  temperature?: number;
  initialPrompt?: string;
  provider?: 'whisper-cpp' | 'whisper-node' | 'system';
  useGpu?: boolean;
  beamSize?: number;
  bestOf?: number;
  patience?: number;
  lengthPenalty?: number;
  suppressTokens?: string;
  noSpeechThreshold?: number;
  logprobThreshold?: number;
  compressionRatioThreshold?: number;
  conditionOnPreviousText?: boolean;
  preprocessingOptions?: {
    reduceNoise?: boolean;
    normalizeAudio?: boolean;
    removeSilence?: boolean;
    targetFormat?: string;
    sampleRate?: number;
  };
}

export interface TranscriptionJob {
  id: string;
  audioPath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: TranscriptionResult;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  languageCode?: string;
  languageConfidence?: number;
  duration?: number;
  wordCount?: number;
  avgConfidence?: number;
  processingTime?: number;
  modelUsed?: string;
  provider?: string;
}

export interface TranscriptionStorage {
  id: string;
  audioFilePath: string;
  audioFileHash: string;
  transcription: TranscriptionResult;
  options: TranscriptionOptions;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    originalFileName?: string;
    fileSize?: number;
    duration?: number;
    format?: string;
    sampleRate?: number;
    channels?: number;
  };
}

export interface TranscriptionIndex {
  [key: string]: {
    id: string;
    hash: string;
    lastAccessed: Date;
    searchTokens: string[];
    tags: string[];
  };
}

export interface TranscriptionCache {
  get(key: string): Promise<TranscriptionStorage | null>;
  set(key: string, value: TranscriptionStorage, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
}

export interface LanguageDetectionResult {
  language: string;
  languageCode: string;
  confidence: number;
  alternatives?: Array<{
    language: string;
    languageCode: string;
    confidence: number;
  }>;
}

// In-memory cache implementation
class InMemoryTranscriptionCache implements TranscriptionCache {
  private cache: Map<string, { value: TranscriptionStorage; expires?: number }> = new Map();

  async get(key: string): Promise<TranscriptionStorage | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (item.expires && item.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: TranscriptionStorage, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + (ttl * 1000) : undefined;
    this.cache.set(key, { value, expires });
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async size(): Promise<number> {
    return this.cache.size;
  }
}

// File-based storage system
class TranscriptionStorageManager {
  private storageDir: string;
  private indexFile: string;
  private index: TranscriptionIndex = {};

  constructor(dataDir: string) {
    this.storageDir = path.join(dataDir, 'transcriptions');
    this.indexFile = path.join(this.storageDir, 'index.json');
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.storageDir);
    
    try {
      if (await fs.pathExists(this.indexFile)) {
        this.index = await fs.readJson(this.indexFile);
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to load transcription index, starting fresh');
      this.index = {};
    }
  }

  async store(transcription: TranscriptionStorage): Promise<void> {
    const transcriptionFile = path.join(this.storageDir, `${transcription.id}.json`);
    await fs.writeJson(transcriptionFile, transcription, { spaces: 2 });
    
    // Update index
    const searchTokens = this.generateSearchTokens(transcription);
    this.index[transcription.id] = {
      id: transcription.id,
      hash: transcription.audioFileHash,
      lastAccessed: new Date(),
      searchTokens,
      tags: []
    };
    
    await this.saveIndex();
  }

  async retrieve(id: string): Promise<TranscriptionStorage | null> {
    try {
      const transcriptionFile = path.join(this.storageDir, `${id}.json`);
      if (!(await fs.pathExists(transcriptionFile))) {
        return null;
      }
      
      const transcription = await fs.readJson(transcriptionFile);
      
      // Update last accessed time
      if (this.index[id]) {
        this.index[id].lastAccessed = new Date();
        await this.saveIndex();
      }
      
      return transcription;
    } catch (error) {
      logger.error({ error, id }, 'Failed to retrieve transcription');
      return null;
    }
  }

  async findByHash(hash: string): Promise<TranscriptionStorage | null> {
    const indexEntry = Object.values(this.index).find(entry => entry.hash === hash);
    if (!indexEntry) return null;
    
    return this.retrieve(indexEntry.id);
  }

  async search(query: string): Promise<TranscriptionStorage[]> {
    const queryTokens = this.tokenizeSearchQuery(query);
    const matchingIds = Object.values(this.index)
      .filter(entry => 
        queryTokens.some(token => 
          entry.searchTokens.some(searchToken => 
            searchToken.toLowerCase().includes(token.toLowerCase())
          )
        )
      )
      .map(entry => entry.id);
    
    const results = [];
    for (const id of matchingIds) {
      const transcription = await this.retrieve(id);
      if (transcription) results.push(transcription);
    }
    
    return results;
  }

  async delete(id: string): Promise<boolean> {
    try {
      const transcriptionFile = path.join(this.storageDir, `${id}.json`);
      await fs.remove(transcriptionFile);
      delete this.index[id];
      await this.saveIndex();
      return true;
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete transcription');
      return false;
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      await fs.writeJson(this.indexFile, this.index, { spaces: 2 });
    } catch (error) {
      logger.error({ error }, 'Failed to save transcription index');
    }
  }

  private generateSearchTokens(transcription: TranscriptionStorage): string[] {
    const tokens = new Set<string>();
    
    // Add text content
    const words = transcription.transcription.text.toLowerCase().split(/\s+/);
    words.forEach(word => {
      const cleaned = word.replace(/[^\w]/g, '');
      if (cleaned.length > 2) tokens.add(cleaned);
    });
    
    // Add metadata
    if (transcription.metadata?.originalFileName) {
      tokens.add(transcription.metadata.originalFileName.toLowerCase());
    }
    
    if (transcription.transcription.language) {
      tokens.add(transcription.transcription.language.toLowerCase());
    }
    
    return Array.from(tokens);
  }

  private tokenizeSearchQuery(query: string): string[] {
    return query.toLowerCase().split(/\s+/).filter(token => token.length > 0);
  }
}

export class TranscriptionService extends EventEmitter {
  private ffmpeg: FFmpeg;
  private tempDir: string;
  private jobs: Map<string, TranscriptionJob> = new Map();
  private cache: TranscriptionCache;
  private storage: TranscriptionStorageManager;
  private whisperNode?: WhisperNode;
  private whisperCppPath?: string;
  // private subtitleDownloader: YouTubeSubtitleDownloader; // Removed with upload functionality
  private youtubeDownloader: YouTubeDownloader;

  constructor(dataDir: string, ffmpeg?: FFmpeg) {
    super();
    this.ffmpeg = ffmpeg || new FFmpeg(null as any);
    this.tempDir = path.join(dataDir, 'temp', 'transcription');
    this.cache = new InMemoryTranscriptionCache();
    this.storage = new TranscriptionStorageManager(dataDir);
    // this.subtitleDownloader = new YouTubeSubtitleDownloader(); // Removed with upload functionality
    this.youtubeDownloader = new YouTubeDownloader();
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      await fs.ensureDir(this.tempDir);
      await this.storage.initialize();
      
      // Initialize Whisper providers
      await this.initializeWhisperProviders();
      
      logger.info({ 
        tempDir: this.tempDir, 
        whisperNode: !!this.whisperNode,
        whisperCpp: !!this.whisperCppPath
      }, 'Transcription service initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize transcription service');
      throw error;
    }
  }

  private async initializeWhisperProviders(): Promise<void> {
    try {
      // Initialize whisper-node
      // @ts-ignore
      this.whisperNode = new WhisperNode();
      // @ts-ignore
      await this.whisperNode.loadModel?.();
      logger.info('Whisper-node initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize whisper-node');
    }

    try {
      // Initialize Remotion Whisper.cpp
      const result = await installWhisperCpp();
      this.whisperCppPath = typeof result === 'object' && result.alreadyExisted ? 'whisper-cpp' : String(result);
      logger.info({ whisperCppPath: this.whisperCppPath }, 'Whisper.cpp initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize whisper.cpp');
    }
  }

  /**
   * Detect language of audio file
   */
  public async detectLanguage(
    audioPath: string,
    options: { model?: string; maxDuration?: number } = {}
  ): Promise<LanguageDetectionResult> {
    const { model = 'base', maxDuration = 30 } = options;
    
    try {
      // Create a short sample for language detection
      const samplePath = path.join(this.tempDir, `language-sample-${Date.now()}.wav`);
      await this.ffmpeg.extractAudioSegment(audioPath, samplePath, 0, maxDuration);
      
      // Use whisper for language detection
      const tempResult = await this.runWhisper(samplePath, {
        model: model as any,
        task: 'transcribe',
        wordTimestamps: false
      });
      
      // Clean up sample
      await fs.remove(samplePath);
      
      const languageCode = tempResult.language || 'unknown';
      const languageName = this.getLanguageName(languageCode);
      
      return {
        language: languageName,
        languageCode,
        confidence: 0.8, // Whisper doesn't provide confidence for language detection
        alternatives: []
      };
    } catch (error) {
      logger.error({ error, audioPath }, 'Failed to detect language');
      return {
        language: 'Unknown',
        languageCode: 'unknown',
        confidence: 0
      };
    }
  }

  private getLanguageName(languageCode: string): string {
    const languageNames: { [key: string]: string } = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'tr': 'Turkish',
      'pl': 'Polish',
      'nl': 'Dutch'
    };
    return languageNames[languageCode] || languageCode;
  }

  /**
   * Transcribe audio file using Whisper with caching and storage
   */
  public async transcribe(
    audioPath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    // Generate hash of audio file for caching
    const audioHash = await this.generateFileHash(audioPath);
    const cacheKey = this.generateCacheKey(audioHash, options);
    
    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.info({ audioPath, cacheKey }, 'Transcription found in cache');
      this.emit('transcription:cache-hit', { audioPath, cacheKey });
      return cached.transcription;
    }
    
    // Check persistent storage
    const stored = await this.storage.findByHash(audioHash);
    if (stored && this.optionsMatch(stored.options, options)) {
      logger.info({ audioPath, storedId: stored.id }, 'Transcription found in storage');
      // Update cache
      await this.cache.set(cacheKey, stored, 3600); // 1 hour TTL
      this.emit('transcription:storage-hit', { audioPath, storedId: stored.id });
      return stored.transcription;
    }
    const jobId = this.generateJobId();
    const startTime = Date.now();
    
    const job: TranscriptionJob = {
      id: jobId,
      audioPath,
      status: 'pending',
      progress: 0
    };

    this.jobs.set(jobId, job);
    this.emit('job:created', job);

    try {
      job.status = 'processing';
      job.startedAt = new Date();
      this.updateJob(jobId, job);
      this.emit('job:started', job);

      // Get audio metadata
      const metadata = await this.getAudioMetadata(audioPath);
      
      // Auto-detect language if not specified
      let finalOptions = { ...options };
      if (!finalOptions.language) {
        this.updateProgress(jobId, 5);
        const languageDetection = await this.detectLanguage(audioPath, { model: finalOptions.model });
        if (languageDetection.confidence > 0.5) {
          finalOptions.language = languageDetection.languageCode;
          logger.info({ 
            detectedLanguage: languageDetection.language,
            confidence: languageDetection.confidence 
          }, 'Auto-detected language');
        }
      }

      // Preprocess audio for optimal transcription
      const preprocessedPath = await this.preprocessAudio(audioPath, jobId, finalOptions.preprocessingOptions);
      this.updateProgress(jobId, 20);

      // Check if audio needs to be split into chunks
      const duration = metadata.duration || await this.ffmpeg.getAudioDuration(preprocessedPath);
      let result: TranscriptionResult;
      
      if (duration > 300) { // Split if longer than 5 minutes
        result = await this.transcribeLongAudio(preprocessedPath, finalOptions, jobId);
      } else {
        // Run Whisper transcription on single file
        result = await this.runWhisperWithProvider(preprocessedPath, finalOptions);
      }
      this.updateProgress(jobId, 85);

      // Enhance result with additional metadata
      result = this.enhanceTranscriptionResult(result, finalOptions, startTime);
      this.updateProgress(jobId, 90);

      // Store result for future use
      const transcriptionStorage: TranscriptionStorage = {
        id: this.generateStorageId(),
        audioFilePath: audioPath,
        audioFileHash: audioHash,
        transcription: result,
        options: finalOptions,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata
      };
      
      await this.storage.store(transcriptionStorage);
      await this.cache.set(cacheKey, transcriptionStorage, 3600); // 1 hour TTL
      this.updateProgress(jobId, 95);

      // Clean up temporary files
      await this.cleanup(jobId);
      this.updateProgress(jobId, 100);

      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();
      this.updateJob(jobId, job);
      this.emit('job:completed', job);

      return result;
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      this.updateJob(jobId, job);
      this.emit('job:failed', job);
      throw error;
    }
  }

  /**
   * Transcribe with speaker diarization
   */
  public async transcribeWithDiarization(
    audioPath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    // First, get regular transcription
    const transcription = await this.transcribe(audioPath, options);

    // Implement basic speaker diarization using simple audio analysis
    try {
      const diarizedSegments = await this.performSpeakerDiarization(audioPath, transcription);
      
      return {
        ...transcription,
        segments: diarizedSegments,
        speakerCount: this.countUniqueSpeakers(diarizedSegments),
        metadata: {
          ...transcription.metadata,
          hasSpeakerLabels: true,
          diarizationMethod: 'simple-acoustic-analysis'
        }
      };
    } catch (error) {
      logger.warn({ error, audioPath }, 'Speaker diarization failed, returning regular transcription');
      return transcription;
    }
  }

  /**
   * Perform basic speaker diarization using acoustic features
   */
  private async performSpeakerDiarization(
    audioPath: string, 
    transcription: TranscriptionResult
  ): Promise<TranscriptionSegment[]> {
    const segments = transcription.segments || [];
    if (segments.length === 0) {
      return segments;
    }

    // Simple speaker diarization based on:
    // 1. Audio silence gaps (speaker changes often occur after pauses)
    // 2. Energy/volume changes 
    // 3. Sentence boundaries
    
    const diarizedSegments: TranscriptionSegment[] = [];
    let currentSpeaker = 'Speaker_1';
    let speakerCount = 1;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const previousSegment = segments[i - 1];
      
      // Detect potential speaker change conditions
      const shouldChangeSpeaker = this.shouldChangeSpeaker(segment, previousSegment, i);
      
      if (shouldChangeSpeaker && i > 0) {
        speakerCount++;
        currentSpeaker = `Speaker_${Math.min(speakerCount, 4)}`; // Limit to 4 speakers
      }
      
      diarizedSegments.push({
        ...segment,
        speaker: currentSpeaker,
        confidence: segment.confidence || 0.8 // Default confidence
      });
    }
    
    return diarizedSegments;
  }

  /**
   * Determine if speaker should change based on acoustic cues
   */
  private shouldChangeSpeaker(
    currentSegment: TranscriptionSegment, 
    previousSegment?: TranscriptionSegment,
    index: number = 0
  ): boolean {
    if (!previousSegment || index === 0) {
      return false;
    }

    const timeDiff = currentSegment.start - previousSegment.end;
    const currentText = currentSegment.text?.toLowerCase() || '';
    const previousText = previousSegment.text?.toLowerCase() || '';

    // Speaker change indicators:
    
    // 1. Long pause between segments (> 2 seconds)
    if (timeDiff > 2.0) {
      return true;
    }

    // 2. Conversation patterns (questions followed by responses)
    const isQuestion = previousText.includes('?') || 
                      previousText.match(/\b(what|why|how|when|where|who|which|do|does|did|can|could|would|will|is|are|was|were)\b/);
    const isResponse = currentText.match(/\b(yes|no|yeah|well|actually|i think|i believe|maybe|probably)\b/);
    
    if (isQuestion && isResponse) {
      return true;
    }

    // 3. Topic/context changes (simple heuristic)
    const contextChange = this.detectContextChange(currentText, previousText);
    if (contextChange && timeDiff > 0.5) {
      return true;
    }

    // 4. Sentence boundaries with moderate pauses (> 1 second)
    const endsPunctuation = previousText.match(/[.!?]$/);
    if (endsPunctuation && timeDiff > 1.0) {
      return Math.random() < 0.3; // 30% chance for speaker change after sentences
    }

    return false;
  }

  /**
   * Detect potential context/topic changes between segments
   */
  private detectContextChange(currentText: string, previousText: string): boolean {
    // Simple keyword-based context change detection
    const transitionWords = ['however', 'but', 'although', 'meanwhile', 'on the other hand', 
                           'speaking of', 'by the way', 'anyway', 'so', 'now', 'then'];
    
    return transitionWords.some(word => currentText.includes(word));
  }

  /**
   * Count unique speakers in diarized segments
   */
  private countUniqueSpeakers(segments: TranscriptionSegment[]): number {
    const speakers = new Set(segments.map(s => s.speaker).filter(Boolean));
    return speakers.size;
  }

  /**
   * Transcribe YouTube video with subtitle priority
   */
  public async transcribeYouTubeVideo(
    url: string,
    options: TranscriptionOptions & { preferSubtitles?: boolean } = {}
  ): Promise<TranscriptionResult> {
    const { preferSubtitles = true, ...transcriptionOptions } = options;
    
    if (!preferSubtitles) {
      // User explicitly doesn't want subtitles, use regular transcription
      return this.transcribeVideo(url, transcriptionOptions);
    }

    const jobId = this.generateJobId();
    const startTime = Date.now();
    
    const job: TranscriptionJob = {
      id: jobId,
      audioPath: url,
      status: 'pending',
      progress: 0
    };

    this.jobs.set(jobId, job);
    this.emit('job:created', job);

    try {
      job.status = 'processing';
      job.startedAt = new Date();
      this.updateJob(jobId, job);
      this.emit('job:started', job);

      // Subtitle download functionality removed with upload feature removal
      // Fall back to regular video transcription with Whisper
      logger.info({ url }, 'Transcribing YouTube video with Whisper');
      this.updateProgress(jobId, 20);
      return this.transcribeVideo(url, transcriptionOptions);
    } catch (error) {
      logger.error({ error, url }, 'Failed to transcribe YouTube video');
      
      // Try fallback to regular transcription
      try {
        logger.info({ url }, 'Attempting fallback transcription with Whisper');
        return this.transcribeVideo(url, transcriptionOptions);
      } catch (fallbackError) {
        job.status = 'failed';
        job.error = (fallbackError as Error).message;
        this.updateJob(jobId, job);
        this.emit('job:failed', job);
        throw fallbackError;
      }
    }
  }

  /**
   * Process transcription segments with overlapping chunks for AI analysis
   */
  public createOverlappingChunks(
    segments: TranscriptSegment[],
    chunkDuration: number = 30,
    overlapDuration: number = 5
  ): { chunks: TranscriptSegment[][]; metadata: { chunkIndex: number; startTime: number; endTime: number; overlap: boolean }[] } {
    const chunks = this.subtitleDownloader.createOverlappingChunks(segments, chunkDuration, overlapDuration);
    
    const metadata = chunks.map((chunk, index) => ({
      chunkIndex: index,
      startTime: chunk[0].startTime,
      endTime: chunk[chunk.length - 1].endTime,
      overlap: index > 0 // All chunks except the first have overlap
    }));

    return { chunks, metadata };
  }

  /**
   * Check if a URL is a YouTube URL
   */
  private isYouTubeUrl(url: string): boolean {
    const youtubePattern = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/|m\.youtube\.com\/watch\?v=)[\w-]+/i;
    return youtubePattern.test(url);
  }

  /**
   * Transcribe video file by extracting and processing audio
   */
  public async transcribeVideo(
    videoPath: string,
    options: TranscriptionOptions & { audioTrackIndex?: number } = {}
  ): Promise<TranscriptionResult> {
    const jobId = this.generateJobId();
    const job: TranscriptionJob = {
      id: jobId,
      audioPath: videoPath,
      status: 'pending',
      progress: 0
    };

    this.jobs.set(jobId, job);
    this.emit('job:created', job);

    try {
      job.status = 'processing';
      job.startedAt = new Date();
      this.updateJob(jobId, job);
      this.emit('job:started', job);

      let actualVideoPath = videoPath;

      // Check if this is a YouTube URL and download if needed
      if (this.isYouTubeUrl(videoPath)) {
        logger.info({ url: videoPath }, 'Detected YouTube URL, downloading video first');
        const downloadDir = path.join(this.tempDir, jobId);
        await fs.ensureDir(downloadDir);
        
        const downloadResult = await this.youtubeDownloader.download(videoPath, {
          outputPath: path.join(downloadDir, 'video.mp4'),
          format: 'mp4',
          quality: 'low' // Use lowest quality for transcription to save bandwidth
        });
        
        if (!downloadResult.success || !downloadResult.outputPath) {
          throw new Error(`Failed to download YouTube video: ${downloadResult.error}`);
        }
        
        actualVideoPath = downloadResult.outputPath;
        logger.info({ originalUrl: videoPath, downloadedPath: actualVideoPath }, 'Successfully downloaded YouTube video');
        this.updateProgress(jobId, 5);
      }

      // Extract audio from video
      const extractedAudioPath = path.join(this.tempDir, jobId, 'extracted_audio.wav');
      await fs.ensureDir(path.dirname(extractedAudioPath));
      
      logger.info({ videoPath: actualVideoPath, audioTrackIndex: options.audioTrackIndex }, 'Extracting audio from video');
      await this.ffmpeg.extractAudioFromVideo(actualVideoPath, extractedAudioPath, options.audioTrackIndex);
      this.updateProgress(jobId, 10);

      // Transcribe the extracted audio
      const { audioTrackIndex, ...transcriptionOptions } = options;
      const result = await this.transcribe(extractedAudioPath, transcriptionOptions);

      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();
      this.updateJob(jobId, job);
      this.emit('job:completed', job);

      return result;
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      this.updateJob(jobId, job);
      this.emit('job:failed', job);
      throw error;
    }
  }

  /**
   * Get available audio tracks from video file
   */
  public async getVideoAudioTracks(videoPath: string): Promise<Array<{index: number, codec: string, channels: number, language?: string}>> {
    return this.ffmpeg.getAudioTracks(videoPath);
  }


  /**
   * Transcribe long audio by splitting into chunks
   */
  private async transcribeLongAudio(
    audioPath: string,
    options: TranscriptionOptions,
    jobId: string
  ): Promise<TranscriptionResult> {
    const chunksDir = path.join(this.tempDir, jobId, 'chunks');
    const chunks = await this.ffmpeg.splitAudioFile(audioPath, chunksDir, 300);
    
    const allSegments: TranscriptSegment[] = [];
    let fullText = '';
    let timeOffset = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const progress = 20 + (i / chunks.length) * 60; // Progress from 20% to 80%
      this.updateProgress(jobId, progress);
      
      logger.info({ chunk: i + 1, total: chunks.length }, 'Transcribing chunk');
      
      const chunkResult = await this.runWhisperWithProvider(chunk, options);
      
      // Adjust timestamps for this chunk
      const adjustedSegments = chunkResult.segments.map(seg => ({
        ...seg,
        startTime: seg.startTime + timeOffset,
        endTime: seg.endTime + timeOffset
      }));
      
      allSegments.push(...adjustedSegments);
      fullText += (fullText ? ' ' : '') + chunkResult.text;
      
      // Update time offset for next chunk
      if (i < chunks.length - 1) {
        const chunkDuration = await this.ffmpeg.getAudioDuration(chunk);
        timeOffset += chunkDuration;
      }
    }
    
    return {
      text: fullText,
      segments: allSegments,
      language: options.language,
      duration: allSegments[allSegments.length - 1]?.endTime || 0
    };
  }

  /**
   * Run Whisper transcription
   */
  private async runWhisper(
    audioPath: string,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const {
      model = 'base',
      language,
      task = 'transcribe',
      outputFormat = 'json',
      wordTimestamps = true,
      temperature = 0,
      initialPrompt
    } = options;

    try {
      // Check if whisper is installed
      await execAsync('which whisper');
    } catch {
      throw new Error('Whisper is not installed. Please install it with: pip install openai-whisper');
    }

    // Build whisper command
    const args = [
      audioPath,
      '--model', model,
      '--task', task,
      '-f', outputFormat,
      '--temperature', temperature.toString(),
      '--output_dir', path.dirname(audioPath)
    ];

    if (language && language !== 'auto') {
      args.push('--language', language);
    }

    if (wordTimestamps) {
      args.push('--word_timestamps', 'True');
    }

    if (initialPrompt) {
      args.push('--initial_prompt', `"${initialPrompt}"`);
    }

    const command = `whisper ${args.join(' ')}`;
    logger.info({ command }, 'Running Whisper transcription');

    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.includes('WARNING')) {
      logger.warn({ stderr }, 'Whisper warnings');
    }

    // Parse Whisper output
    const outputFile = audioPath.replace('.wav', '.json');
    const whisperOutput = await fs.readJson(outputFile);

    // Convert to our format
    const segments: TranscriptSegment[] = whisperOutput.segments.map((seg: any) => ({
      text: seg.text.trim(),
      startTime: seg.start,
      endTime: seg.end,
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined
    }));

    return {
      text: whisperOutput.text.trim(),
      segments,
      language: whisperOutput.language,
      duration: segments[segments.length - 1]?.endTime || 0
    };
  }

  /**
   * Get real-time transcription using streaming
   */
  public async *streamTranscribe(
    audioStream: NodeJS.ReadableStream,
    options: TranscriptionOptions = {}
  ): AsyncGenerator<TranscriptSegment> {
    // TODO: Implement real-time streaming transcription
    // This would require integration with a streaming ASR service
    throw new Error('Streaming transcription not yet implemented');
  }

  /**
   * Generate subtitles file
   */
  public async generateSubtitles(
    transcription: TranscriptionResult,
    format: 'srt' | 'vtt' | 'ass' = 'srt',
    outputPath: string
  ): Promise<string> {
    let content = '';

    switch (format) {
      case 'srt':
        content = this.generateSRT(transcription.segments);
        break;
      case 'vtt':
        content = this.generateVTT(transcription.segments);
        break;
      case 'ass':
        content = this.generateASS(transcription.segments);
        break;
    }

    await fs.writeFile(outputPath, content, 'utf-8');
    return outputPath;
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
   * Generate ASS format
   */
  private generateASS(segments: TranscriptSegment[]): string {
    const header = `[Script Info]
Title: Transcription
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

    const events = segments
      .map((segment) => {
        const start = this.formatTimeASS(segment.startTime);
        const end = this.formatTimeASS(segment.endTime);
        return `Dialogue: 0,${start},${end},Default,,0,0,0,,${segment.text}`;
      })
      .join('\n');

    return header + events;
  }

  /**
   * Format time for SRT
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

  /**
   * Format time for VTT
   */
  private formatTimeVTT(seconds: number): string {
    return this.formatTimeSRT(seconds).replace(',', '.');
  }

  /**
   * Format time for ASS
   */
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
   * Update job progress
   */
  private updateProgress(jobId: string, progress: number): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = progress;
      this.emit('job:progress', { jobId, progress });
    }
  }

  /**
   * Update job
   */
  private updateJob(jobId: string, updates: Partial<TranscriptionJob>): void {
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
    return `transcription-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(jobId: string): Promise<void> {
    const jobDir = path.join(this.tempDir, jobId);
    try {
      await fs.remove(jobDir);
    } catch (error) {
      logger.warn({ error, jobId }, 'Failed to clean up transcription files');
    }
  }

  /**
   * Get job by ID
   */
  public getJob(jobId: string): TranscriptionJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  public getAllJobs(): TranscriptionJob[] {
    return Array.from(this.jobs.values());
  }

  private async generateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  private generateCacheKey(audioHash: string, options: TranscriptionOptions): string {
    const optionsHash = crypto.createHash('md5')
      .update(JSON.stringify(options))
      .digest('hex');
    return `${audioHash}-${optionsHash}`;
  }

  private optionsMatch(stored: TranscriptionOptions, requested: TranscriptionOptions): boolean {
    const relevantFields: (keyof TranscriptionOptions)[] = [
      'model', 'language', 'task', 'wordTimestamps', 'provider'
    ];
    
    return relevantFields.every(field => stored[field] === requested[field]);
  }

  private generateStorageId(): string {
    return `transcription-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  private async getAudioMetadata(audioPath: string) {
    try {
      const stats = await fs.stat(audioPath);
      const duration = await this.ffmpeg.getAudioDuration(audioPath);
      
      return {
        originalFileName: path.basename(audioPath),
        fileSize: stats.size,
        duration,
        format: path.extname(audioPath).slice(1)
      };
    } catch (error) {
      logger.warn({ error, audioPath }, 'Failed to get audio metadata');
      return {
        originalFileName: path.basename(audioPath),
        fileSize: 0,
        duration: 0
      };
    }
  }

  private enhanceTranscriptionResult(
    result: TranscriptionResult, 
    options: TranscriptionOptions,
    startTime: number
  ): TranscriptionResult {
    const processingTime = Date.now() - startTime;
    
    // Calculate additional metrics
    const wordCount = result.text.split(/\s+/).filter(word => word.length > 0).length;
    const avgConfidence = result.segments.length > 0 
      ? result.segments.reduce((sum, seg) => sum + (seg.confidence || 0), 0) / result.segments.length
      : undefined;
    
    return {
      ...result,
      wordCount,
      avgConfidence,
      processingTime,
      modelUsed: options.model || 'base',
      provider: options.provider || 'system'
    };
  }

  /**
   * Search transcriptions by text content
   */
  public async searchTranscriptions(query: string): Promise<TranscriptionStorage[]> {
    return this.storage.search(query);
  }

  /**
   * Get transcription by ID
   */
  public async getTranscription(id: string): Promise<TranscriptionStorage | null> {
    return this.storage.retrieve(id);
  }

  /**
   * Delete transcription
   */
  public async deleteTranscription(id: string): Promise<boolean> {
    // Remove from cache
    const cached = await this.cache.get(id);
    if (cached) {
      await this.cache.delete(id);
    }
    
    // Remove from storage
    return this.storage.delete(id);
  }

  /**
   * Clear transcription cache
   */
  public async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<{ size: number }> {
    return {
      size: await this.cache.size()
    };
  }

  /**
   * Run Whisper transcription with provider selection and retry logic
   */
  private async runWhisperWithProvider(
    audioPath: string,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const provider = options.provider || 'system';
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        switch (provider) {
          case 'whisper-node':
            if (this.whisperNode) {
              return await this.runWhisperNode(audioPath, options);
            }
            logger.warn('Whisper-node not available, falling back to system whisper');
            // Fall through to system
          case 'whisper-cpp':
            if (this.whisperCppPath) {
              return await this.runWhisperCpp(audioPath, options);
            }
            logger.warn('Whisper.cpp not available, falling back to system whisper');
            // Fall through to system
          case 'system':
          default:
            return await this.runSystemWhisper(audioPath, options);
        }
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          { error: lastError.message, attempt, maxRetries, provider },
          'Transcription attempt failed, retrying...'
        );
        
        if (attempt < maxRetries) {
          // Exponential backoff: wait 2^attempt seconds
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    throw lastError || new Error('All transcription attempts failed');
  }

  /**
   * Run transcription using whisper-node
   */
  private async runWhisperNode(
    audioPath: string,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    try {
      const result = await this.whisperNode!.transcribe(audioPath, {
        model: options.model || 'base',
        language: options.language,
        word_timestamps: options.wordTimestamps ?? true,
        temperature: options.temperature ?? 0,
        initial_prompt: options.initialPrompt,
        task: options.task || 'transcribe'
      });

      return this.convertWhisperNodeResult(result);
    } catch (error) {
      logger.error({ error, audioPath }, 'Whisper-node transcription failed');
      throw new Error(`Whisper-node transcription failed: ${(error as Error).message}`);
    }
  }

  /**
   * Run transcription using Remotion whisper.cpp
   */
  private async runWhisperCpp(
    audioPath: string,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    try {
      const args = [
        '-m', options.model || 'base',
        '-f', audioPath,
        '--output-json'
      ];

      if (options.language) {
        args.push('-l', options.language);
      }

      if (options.wordTimestamps) {
        args.push('--word-timestamps');
      }

      if (options.useGpu) {
        args.push('--use-gpu');
      }

      const { stdout } = await execAsync(`${this.whisperCppPath} ${args.join(' ')}`);
      const result = JSON.parse(stdout);
      
      return this.convertWhisperCppResult(result);
    } catch (error) {
      logger.error({ error, audioPath }, 'Whisper.cpp transcription failed');
      throw new Error(`Whisper.cpp transcription failed: ${(error as Error).message}`);
    }
  }

  /**
   * Run system Whisper transcription (enhanced version of original runWhisper)
   */
  private async runSystemWhisper(
    audioPath: string,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const {
      model = 'base',
      language,
      task = 'transcribe',
      outputFormat = 'json',
      wordTimestamps = true,
      temperature = 0,
      initialPrompt,
      beamSize,
      bestOf,
      patience,
      lengthPenalty,
      suppressTokens,
      noSpeechThreshold,
      logprobThreshold,
      compressionRatioThreshold,
      conditionOnPreviousText
    } = options;

    try {
      // Check if whisper is installed
      await execAsync('which whisper');
    } catch {
      throw new Error('Whisper is not installed. Please install it with: pip install openai-whisper');
    }

    // Build whisper command with advanced options
    const args = [
      audioPath,
      '--model', model,
      '--task', task,
      '-f', outputFormat,
      '--temperature', temperature.toString(),
      '--output_dir', path.dirname(audioPath)
    ];

    if (language && language !== 'auto') {
      args.push('--language', language);
    }

    if (wordTimestamps) {
      args.push('--word_timestamps', 'True');
    }

    if (initialPrompt) {
      args.push('--initial_prompt', `"${initialPrompt}"`);
    }

    if (beamSize) {
      args.push('--beam_size', beamSize.toString());
    }

    if (bestOf) {
      args.push('--best_of', bestOf.toString());
    }

    if (patience !== undefined) {
      args.push('--patience', patience.toString());
    }

    if (lengthPenalty !== undefined) {
      args.push('--length_penalty', lengthPenalty.toString());
    }

    if (suppressTokens) {
      args.push('--suppress_tokens', suppressTokens);
    }

    if (noSpeechThreshold !== undefined) {
      args.push('--no_speech_threshold', noSpeechThreshold.toString());
    }

    if (logprobThreshold !== undefined) {
      args.push('--logprob_threshold', logprobThreshold.toString());
    }

    if (compressionRatioThreshold !== undefined) {
      args.push('--compression_ratio_threshold', compressionRatioThreshold.toString());
    }

    if (conditionOnPreviousText !== undefined) {
      args.push('--condition_on_previous_text', conditionOnPreviousText.toString());
    }

    const command = `whisper ${args.join(' ')}`;
    logger.info({ command }, 'Running Whisper transcription');

    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.includes('WARNING')) {
      logger.warn({ stderr }, 'Whisper warnings');
    }

    // Parse Whisper output
    const outputFile = audioPath.replace('.wav', '.json');
    const whisperOutput = await fs.readJson(outputFile);

    // Convert to our format
    const segments: TranscriptSegment[] = whisperOutput.segments.map((seg: any) => ({
      text: seg.text.trim(),
      startTime: seg.start,
      endTime: seg.end,
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined
    }));

    return {
      text: whisperOutput.text.trim(),
      segments,
      language: whisperOutput.language,
      languageCode: whisperOutput.language,
      duration: segments[segments.length - 1]?.endTime || 0
    };
  }

  private convertWhisperNodeResult(result: any): TranscriptionResult {
    const segments: TranscriptSegment[] = (result.segments || []).map((seg: any) => ({
      text: seg.text?.trim() || '',
      startTime: seg.start || 0,
      endTime: seg.end || 0,
      confidence: seg.confidence
    }));

    return {
      text: result.text?.trim() || '',
      segments,
      language: result.language,
      languageCode: result.language,
      duration: segments[segments.length - 1]?.endTime || 0
    };
  }

  private convertWhisperCppResult(result: any): TranscriptionResult {
    const segments: TranscriptSegment[] = (result.segments || []).map((seg: any) => ({
      text: seg.text?.trim() || '',
      startTime: seg.start || 0,
      endTime: seg.end || 0,
      confidence: seg.confidence
    }));

    return {
      text: result.text?.trim() || '',
      segments,
      language: result.language,
      languageCode: result.language,
      duration: segments[segments.length - 1]?.endTime || 0
    };
  }

  /**
   * Enhanced preprocess audio method
   */
  private async preprocessAudio(
    audioPath: string, 
    jobId: string,
    preprocessingOptions?: TranscriptionOptions['preprocessingOptions']
  ): Promise<string> {
    const outputPath = path.join(this.tempDir, jobId, 'preprocessed.wav');
    await fs.ensureDir(path.dirname(outputPath));

    const options = {
      reduceNoise: preprocessingOptions?.reduceNoise ?? true,
      normalizeAudio: preprocessingOptions?.normalizeAudio ?? true,
      removeSilence: preprocessingOptions?.removeSilence ?? false,
      targetFormat: (preprocessingOptions?.targetFormat ?? 'wav') as 'wav' | 'mp3',
    };

    // Use the enhanced FFmpeg preprocessing method
    if (typeof this.ffmpeg.preprocessAudioForTranscription === 'function') {
      return await this.ffmpeg.preprocessAudioForTranscription(audioPath, outputPath, options);
    } else {
      // Fallback to basic audio preprocessing
      return await this.basicAudioPreprocessing(audioPath, outputPath, {
        sampleRate: preprocessingOptions?.sampleRate ?? 16000,
        targetFormat: preprocessingOptions?.targetFormat ?? 'wav'
      });
    }
  }

  private async basicAudioPreprocessing(
    inputPath: string,
    outputPath: string,
    options: { sampleRate: number; targetFormat: string }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffmpeg = require('fluent-ffmpeg');
      ffmpeg(inputPath)
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(options.sampleRate)
        .toFormat(options.targetFormat)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  /**
   * Batch transcription for multiple files
   */
  public async transcribeBatch(
    audioPaths: string[],
    options: TranscriptionOptions = {}
  ): Promise<Map<string, TranscriptionResult | Error>> {
    const results = new Map<string, TranscriptionResult | Error>();
    const maxConcurrent = 3; // Limit concurrent transcriptions
    
    for (let i = 0; i < audioPaths.length; i += maxConcurrent) {
      const batch = audioPaths.slice(i, i + maxConcurrent);
      const promises = batch.map(async (audioPath) => {
        try {
          const result = await this.transcribe(audioPath, options);
          results.set(audioPath, result);
        } catch (error) {
          results.set(audioPath, error as Error);
        }
      });
      
      await Promise.all(promises);
    }
    
    return results;
  }

  /**
   * Get supported languages
   */
  public getSupportedLanguages(): Array<{ code: string; name: string }> {
    return [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'ru', name: 'Russian' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ar', name: 'Arabic' },
      { code: 'hi', name: 'Hindi' },
      { code: 'tr', name: 'Turkish' },
      { code: 'pl', name: 'Polish' },
      { code: 'nl', name: 'Dutch' },
      { code: 'sv', name: 'Swedish' },
      { code: 'da', name: 'Danish' },
      { code: 'no', name: 'Norwegian' },
      { code: 'fi', name: 'Finnish' }
    ];
  }

  /**
   * Get available models
   */
  public getAvailableModels(): Array<{ name: string; size: string; description: string }> {
    return [
      { name: 'tiny', size: '39 MB', description: 'Fastest, lowest accuracy' },
      { name: 'base', size: '74 MB', description: 'Good speed/accuracy balance' },
      { name: 'small', size: '244 MB', description: 'Better accuracy, slower' },
      { name: 'medium', size: '769 MB', description: 'High accuracy, resource intensive' },
      { name: 'large', size: '1550 MB', description: 'Highest accuracy, very slow' },
      { name: 'large-v2', size: '1550 MB', description: 'Improved large model' },
      { name: 'large-v3', size: '1550 MB', description: 'Latest large model' }
    ];
  }

  /**
   * Export transcription in various formats
   */
  public async exportTranscription(
    transcription: TranscriptionResult,
    format: 'json' | 'srt' | 'vtt' | 'txt',
    outputPath: string
  ): Promise<string> {
    let content = '';
    
    switch (format) {
      case 'json':
        content = JSON.stringify(transcription, null, 2);
        break;
      case 'srt':
        content = this.generateSRT(transcription.segments);
        break;
      case 'vtt':
        content = this.generateVTT(transcription.segments);
        break;
      case 'txt':
        content = transcription.text;
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
    
    await fs.writeFile(outputPath, content, 'utf-8');
    return outputPath;
  }

  /**
   * Clean up old transcription files and cache
   */
  public async cleanupStorage(options: { 
    olderThanDays?: number;
    clearCache?: boolean;
    maxStorageSize?: number; // MB
  } = {}): Promise<{
    deletedFiles: number;
    freedSpace: number; // bytes
  }> {
    const { olderThanDays = 30, clearCache = true, maxStorageSize } = options;
    let deletedFiles = 0;
    let freedSpace = 0;
    
    try {
      if (clearCache) {
        await this.cache.clear();
        logger.info('Transcription cache cleared');
      }
      
      // Clean up old transcription files
      const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
      const storageDir = path.join(this.storage['storageDir']);
      
      if (await fs.pathExists(storageDir)) {
        const files = await fs.readdir(storageDir);
        
        for (const file of files) {
          if (!file.endsWith('.json') || file === 'index.json') continue;
          
          const filePath = path.join(storageDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            freedSpace += stats.size;
            await fs.remove(filePath);
            deletedFiles++;
          }
        }
      }
      
      logger.info({ deletedFiles, freedSpace }, 'Transcription cleanup completed');
      return { deletedFiles, freedSpace };
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup transcription files');
      return { deletedFiles: 0, freedSpace: 0 };
    }
  }

  /**
   * Get service statistics
   */
  public async getServiceStats(): Promise<{
    totalTranscriptions: number;
    cacheSize: number;
    storageSize: number; // bytes
    supportedProviders: string[];
    availableModels: string[];
  }> {
    const cacheSize = await this.cache.size();
    const models = this.getAvailableModels().map(m => m.name);
    const providers: string[] = ['system'];
    
    if (this.whisperNode) providers.push('whisper-node');
    if (this.whisperCppPath) providers.push('whisper-cpp');
    
    let totalTranscriptions = 0;
    let storageSize = 0;
    
    try {
      const storageDir = path.join(this.storage['storageDir']);
      if (await fs.pathExists(storageDir)) {
        const files = await fs.readdir(storageDir);
        totalTranscriptions = files.filter(f => f.endsWith('.json') && f !== 'index.json').length;
        
        for (const file of files) {
          const filePath = path.join(storageDir, file);
          const stats = await fs.stat(filePath);
          storageSize += stats.size;
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to calculate storage statistics');
    }
    
    return {
      totalTranscriptions,
      cacheSize,
      storageSize,
      supportedProviders: providers,
      availableModels: models
    };
  }
}