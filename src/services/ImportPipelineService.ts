import { EventEmitter } from 'events';
import path from 'path';
import { logger } from '../logger';
import { VideoImportService } from './VideoImportService';
import { OllamaService } from './OllamaService';
import { TranscriptionService } from './TranscriptionService';
import {
  ImportJob,
  ImportJobStatus,
  VideoAnalysis,
  TranscriptSegment,
  DetectedScene,
  SuggestedClip,
  ImportToShortTransform,
  VideoImportRequest
} from '../types/import';
import { CreateShortInput, SceneInput } from '../types/shorts';
import { EventBus } from '../server/events/EventBus';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';

const execAsync = promisify(exec);

interface PipelineConfig {
  dataDir: string;
  enableOllama: boolean;
  ollamaConfig?: {
    baseUrl: string;
    defaultModel: string;
  };
}

export class ImportPipelineService extends EventEmitter {
  private videoImportService: VideoImportService;
  private ollamaService: OllamaService;
  private transcriptionService: TranscriptionService;
  private eventBus: EventBus;
  private config: PipelineConfig;

  constructor(config: PipelineConfig) {
    super();
    this.config = config;
    this.videoImportService = new VideoImportService(config.dataDir);
    this.ollamaService = new OllamaService(config.ollamaConfig);
    this.transcriptionService = new TranscriptionService(config.dataDir);
    this.eventBus = EventBus.getInstance();
    
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for pipeline coordination
   */
  private setupEventListeners(): void {
    // Forward video import events
    this.videoImportService.on('job:created', (job) => {
      this.emit('import:created', job);
      this.eventBus.emit('import:created', job);
    });

    this.videoImportService.on('job:progress', (data) => {
      this.emit('import:progress', data);
      this.eventBus.emit('import:progress', data);
    });

    this.videoImportService.on('job:completed', async (job) => {
      // Continue with transcription and analysis
      await this.continueProcessing(job);
    });

    this.videoImportService.on('job:status', (data) => {
      this.emit('import:status', data);
      this.eventBus.emit('import:status', data);
    });
  }

  /**
   * Start video import pipeline
   */
  public async startImport(request: VideoImportRequest): Promise<ImportJob> {
    try {
      // Create import job
      const job = await this.videoImportService.createImportJob(request);
      
      logger.info({ jobId: job.id, source: job.source }, 'Started video import pipeline');
      
      return job;
    } catch (error) {
      logger.error({ error }, 'Failed to start import pipeline');
      throw error;
    }
  }

  /**
   * Process import with progress callbacks
   */
  public async processImport(options: {
    jobId: string;
    url: string;
    config: any;
    onProgress: (progress: number, status: string, message?: string) => void;
  }): Promise<void> {
    const { jobId, url, config, onProgress } = options;
    
    try {
      logger.info({ jobId, url }, 'Starting import processing');
      
      // Create a video import request
      const request: VideoImportRequest = {
        source: url.includes('youtube') ? 'youtube' as any : 'url' as any,
        url: url,
        config: config
      };

      // Start the import
      const job = await this.videoImportService.createImportJob(request);
      
      // Set up progress tracking
      const progressListener = (data: any) => {
        if (data.jobId === jobId || data.jobId === job.id) {
          onProgress(data.progress || 0, data.status || 'processing', data.message);
        }
      };

      this.videoImportService.on('job:progress', progressListener);
      this.videoImportService.on('job:status', progressListener);

      // Wait for completion
      return new Promise((resolve, reject) => {
        const completionListener = (completedJob: ImportJob) => {
          if (completedJob.id === job.id) {
            this.videoImportService.removeListener('job:progress', progressListener);
            this.videoImportService.removeListener('job:status', progressListener);
            this.videoImportService.removeListener('job:completed', completionListener);
            this.videoImportService.removeListener('job:failed', failureListener);
            
            onProgress(100, 'completed', 'Import completed successfully');
            resolve();
          }
        };

        const failureListener = (failedJob: ImportJob) => {
          if (failedJob.id === job.id) {
            this.videoImportService.removeListener('job:progress', progressListener);
            this.videoImportService.removeListener('job:status', progressListener);
            this.videoImportService.removeListener('job:completed', completionListener);
            this.videoImportService.removeListener('job:failed', failureListener);
            
            onProgress(0, 'failed', failedJob.error || 'Import failed');
            reject(new Error(failedJob.error || 'Import failed'));
          }
        };

        this.videoImportService.on('job:completed', completionListener);
        this.videoImportService.on('job:failed', failureListener);
      });
      
    } catch (error) {
      logger.error({ error, jobId }, 'Failed to process import');
      onProgress(0, 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Continue processing after video import
   */
  private async continueProcessing(job: ImportJob): Promise<void> {
    try {
      const videoPath = path.join(this.config.dataDir, 'imports', job.id, 'original.mp4');
      let analysis: VideoAnalysis = {
        transcript: [],
        detectedScenes: [],
        suggestedClips: [],
        topics: [],
        keywords: []
      };

      // Update status to analyzing
      this.updateJobStatus(job.id, ImportJobStatus.ANALYZING);

      // Transcribe if configured
      if (job.config.transcribe) {
        analysis.transcript = await this.transcribeVideo(videoPath, job);
        this.updateJobProgress(job.id, 70);
      }

      // Detect scenes if configured
      if (job.config.detectScenes) {
        analysis.detectedScenes = await this.detectScenes(videoPath, job);
        this.updateJobProgress(job.id, 80);
      }

      // Analyze with AI if configured and Ollama is available
      if (job.config.analyze && this.config.enableOllama && this.ollamaService.getAvailability()) {
        // Analyze transcript
        if (analysis.transcript.length > 0) {
          const transcriptAnalysis = await this.ollamaService.analyzeTranscript(analysis.transcript);
          analysis = { ...analysis, ...transcriptAnalysis };
        }

        // Analyze scenes
        if (analysis.detectedScenes.length > 0) {
          analysis.detectedScenes = await this.ollamaService.analyzeScenes(analysis.detectedScenes);
        }

        // Generate suggestions using overlapping chunks for better highlight detection
        if (job.config.generateSuggestions) {
          // Create overlapping chunks of transcript for AI analysis
          const { chunks, metadata } = this.transcriptionService.createOverlappingChunks(
            analysis.transcript,
            30, // 30 second chunks
            5   // 5 second overlap
          );
          
          logger.info({ 
            chunkCount: chunks.length,
            totalSegments: analysis.transcript.length 
          }, 'Processing transcript chunks for highlight detection');
          
          // Analyze each chunk for potential highlights
          const chunkSuggestions: SuggestedClip[] = [];
          for (let i = 0; i < chunks.length; i++) {
            const chunkMeta = metadata[i];
            const chunkScenes = analysis.detectedScenes.filter(scene => 
              (scene.startTime >= chunkMeta.startTime && scene.startTime <= chunkMeta.endTime) ||
              (scene.endTime >= chunkMeta.startTime && scene.endTime <= chunkMeta.endTime)
            );
            
            const suggestions = await this.ollamaService.generateClipSuggestions(
              chunks[i],
              chunkScenes,
              Math.ceil(job.config.maxSuggestions || 10 / chunks.length) // Distribute suggestions across chunks
            );
            
            // Add chunk context to suggestions
            suggestions.forEach(suggestion => {
              suggestion.metadata = {
                ...suggestion.metadata,
                chunkIndex: i,
                chunkOverlap: chunkMeta.overlap
              };
            });
            
            chunkSuggestions.push(...suggestions);
          }
          
          // Deduplicate overlapping suggestions and select best ones
          analysis.suggestedClips = this.deduplicateAndRankSuggestions(
            chunkSuggestions, 
            job.config.maxSuggestions || 10
          );
        }
        
        this.updateJobProgress(job.id, 95);
      }

      // Save analysis results
      const analysisPath = path.join(this.config.dataDir, 'imports', job.id, 'analysis.json');
      await fs.writeJson(analysisPath, analysis, { spaces: 2 });

      // Update job with analysis
      job.analysis = analysis;
      job.completedAt = new Date();
      
      this.updateJobProgress(job.id, 100);
      this.updateJobStatus(job.id, ImportJobStatus.COMPLETED);
      
      this.emit('import:analyzed', { jobId: job.id, analysis });
      this.eventBus.emit('import:analyzed', { jobId: job.id, analysis });
      
    } catch (error) {
      logger.error({ error, jobId: job.id }, 'Failed to process import');
      this.updateJobStatus(job.id, ImportJobStatus.FAILED, (error as Error).message);
    }
  }

  /**
   * Transcribe video using TranscriptionService
   */
  private async transcribeVideo(videoPath: string, job: ImportJob): Promise<TranscriptSegment[]> {
    try {
      logger.info({ videoPath, jobId: job.id }, 'Starting video transcription');
      
      // Check if this is a YouTube URL
      const isYouTubeUrl = /youtube\.com|youtu\.be/.test(job.sourceUrl || '');
      
      let result;
      if (isYouTubeUrl && job.sourceUrl) {
        // Use YouTube subtitle downloader with Whisper fallback
        logger.info({ url: job.sourceUrl }, 'Attempting YouTube subtitle download');
        result = await this.transcriptionService.transcribeYouTubeVideo(job.sourceUrl, {
          language: job.config.transcriptionLanguage,
          model: job.config.transcriptionModel as any || 'base',
          preferSubtitles: true
        });
      } else {
        // Use regular transcription for non-YouTube videos
        result = await this.transcriptionService.transcribeVideo(videoPath, {
          language: job.config.transcriptionLanguage,
          model: job.config.transcriptionModel as any || 'base'
        });
      }
      
      // Save language if detected
      if (result.language) {
        job.analysis = { ...job.analysis, language: result.language } as VideoAnalysis;
      }
      
      logger.info({ 
        segmentCount: result.segments.length,
        provider: result.provider,
        modelUsed: result.modelUsed
      }, 'Transcription completed');
      
      return result.segments;
    } catch (error) {
      logger.error({ error }, 'Failed to transcribe video');
      return [];
    }
  }

  /**
   * Detect scenes using ffmpeg scene detection
   */
  private async detectScenes(videoPath: string, job: ImportJob): Promise<DetectedScene[]> {
    const threshold = job.config.sceneDetectionThreshold || 0.4;
    const scenesDir = path.join(this.config.dataDir, 'imports', job.id, 'scenes');
    await fs.ensureDir(scenesDir);
    
    // Use ffmpeg to detect scene changes
    const command = `ffmpeg -i "${videoPath}" -filter_complex "select='gt(scene,${threshold})',showinfo" -f null - 2>&1 | grep showinfo`;
    
    try {
      const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 * 5 });
      
      // Parse scene timestamps from ffmpeg output
      const scenes: DetectedScene[] = [];
      const lines = stdout.split('\n');
      let lastTime = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/pts_time:(\d+\.?\d*)/);
        if (match) {
          const time = parseFloat(match[1]);
          
          if (i > 0) {
            scenes.push({
              id: `scene_${scenes.length}`,
              startTime: lastTime,
              endTime: time,
              duration: time - lastTime,
              keyFrames: [],
              confidence: threshold
            });
          }
          
          lastTime = time;
        }
      }
      
      // Add final scene
      if (job.metadata && lastTime < job.metadata.duration) {
        scenes.push({
          id: `scene_${scenes.length}`,
          startTime: lastTime,
          endTime: job.metadata.duration,
          duration: job.metadata.duration - lastTime,
          keyFrames: [],
          confidence: threshold
        });
      }
      
      // Extract keyFrames for each scene
      for (const scene of scenes) {
        const keyframePath = path.join(scenesDir, `scene_${scene.id}_keyframe.jpg`);
        const midTime = (scene.startTime + scene.endTime) / 2;
        
        try {
          await execAsync(`ffmpeg -ss ${midTime} -i "${videoPath}" -vframes 1 -q:v 2 "${keyframePath}"`);
          scene.keyFrames.push(keyframePath);
        } catch (error) {
          logger.warn({ error, sceneId: scene.id }, 'Failed to extract scene keyframe');
        }
      }
      
      return scenes;
    } catch (error) {
      logger.error({ error }, 'Failed to detect scenes');
      return [];
    }
  }

  /**
   * Transform imported video to short format
   */
  public async transformToShort(transform: ImportToShortTransform): Promise<CreateShortInput> {
    const { importJob, selectedClips, renderConfig, customScenes } = transform;
    
    if (!importJob.analysis) {
      throw new Error('Import job has no analysis data');
    }

    const scenes: SceneInput[] = [];
    
    // Create scenes from selected clips
    for (const clip of selectedClips) {
      // Find relevant transcript segments
      const transcriptSegments = importJob.analysis.transcript
        .filter(seg => seg.startTime >= clip.startTime && seg.endTime <= clip.endTime);
      
      const text = transcriptSegments.map(seg => seg.text).join(' ');
      
      scenes.push({
        text: text || clip.description || '',
        searchTerms: clip.keywords.slice(0, 3), // Use first 3 keywords
        videos: [], // Will be filled with extracted clips
        audio: undefined, // Will use TTS
        captions: undefined // Will be auto-generated
      });
    }

    // Override with custom scenes if provided
    if (customScenes) {
      customScenes.forEach((customScene, idx) => {
        if (scenes[idx]) {
          Object.assign(scenes[idx], customScene);
        }
      });
    }

    return {
      scenes,
      config: {
        ...renderConfig,
        language: importJob.analysis.language as 'pt' | 'en' || 'en'
      }
    };
  }

  /**
   * Extract video clips for selected suggestions
   */
  public async extractClips(jobId: string, clips: SuggestedClip[]): Promise<string[]> {
    const job = this.videoImportService.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const videoPath = path.join(this.config.dataDir, 'imports', jobId, 'original.mp4');
    const clipsDir = path.join(this.config.dataDir, 'imports', jobId, 'clips');
    await fs.ensureDir(clipsDir);

    const extractedPaths: string[] = [];

    for (const clip of clips) {
      const outputPath = path.join(clipsDir, `clip_${clip.id}.mp4`);
      const duration = clip.endTime - clip.startTime;
      
      const command = `ffmpeg -ss ${clip.startTime} -i "${videoPath}" -t ${duration} -c copy "${outputPath}"`;
      
      try {
        await execAsync(command);
        extractedPaths.push(outputPath);
        logger.info({ clipId: clip.id, outputPath }, 'Extracted video clip');
      } catch (error) {
        logger.error({ error, clipId: clip.id }, 'Failed to extract clip');
      }
    }

    return extractedPaths;
  }

  /**
   * Get import job
   */
  public getJob(jobId: string): ImportJob | undefined {
    return this.videoImportService.getJob(jobId);
  }

  /**
   * Get all import jobs
   */
  public getAllJobs(): ImportJob[] {
    return this.videoImportService.getAllJobs();
  }

  /**
   * Cancel import job
   */
  public async cancelJob(jobId: string): Promise<void> {
    await this.videoImportService.cancelJob(jobId);
  }

  /**
   * Update job status (internal)
   */
  private updateJobStatus(jobId: string, status: ImportJobStatus, error?: string): void {
    const job = this.videoImportService.getJob(jobId);
    if (job) {
      job.status = status;
      job.updatedAt = new Date();
      if (error) job.error = error;
      
      this.emit('import:status', { jobId, status, error });
      this.eventBus.emit('import:status', { jobId, status, error });
    }
  }

  /**
   * Update job progress (internal)
   */
  private updateJobProgress(jobId: string, progress: number): void {
    const job = this.videoImportService.getJob(jobId);
    if (job) {
      job.progress = progress;
      job.updatedAt = new Date();
      
      this.emit('import:progress', { jobId, progress });
      this.eventBus.emit('import:progress', { jobId, progress });
    }
  }

  /**
   * Deduplicate and rank clip suggestions from overlapping chunks
   */
  private deduplicateAndRankSuggestions(
    suggestions: SuggestedClip[], 
    maxSuggestions: number
  ): SuggestedClip[] {
    // Group suggestions by time overlap
    const groups: SuggestedClip[][] = [];
    
    for (const suggestion of suggestions) {
      let addedToGroup = false;
      
      for (const group of groups) {
        // Check if this suggestion overlaps with any in the group
        const overlaps = group.some(s => 
          (suggestion.startTime >= s.startTime && suggestion.startTime <= s.endTime) ||
          (suggestion.endTime >= s.startTime && suggestion.endTime <= s.endTime) ||
          (s.startTime >= suggestion.startTime && s.startTime <= suggestion.endTime)
        );
        
        if (overlaps) {
          group.push(suggestion);
          addedToGroup = true;
          break;
        }
      }
      
      if (!addedToGroup) {
        groups.push([suggestion]);
      }
    }
    
    // Select best suggestion from each group
    const deduplicated = groups.map(group => {
      // Sort by score and overlap status (non-overlapping chunks preferred)
      return group.sort((a, b) => {
        const aOverlap = (a as any).metadata?.chunkOverlap || false;
        const bOverlap = (b as any).metadata?.chunkOverlap || false;
        
        // Prefer non-overlapping chunks
        if (aOverlap !== bOverlap) {
          return aOverlap ? 1 : -1;
        }
        
        // Then sort by score
        return b.score - a.score;
      })[0];
    });
    
    // Sort all suggestions by score and return top N
    return deduplicated
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSuggestions);
  }

  /**
   * Clean up old imports
   */
  public async cleanupOldImports(daysOld: number = 7): Promise<void> {
    await this.videoImportService.cleanupOldImports(daysOld);
  }
}