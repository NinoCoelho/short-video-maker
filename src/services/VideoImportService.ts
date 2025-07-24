import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../logger';
import { 
  VideoSourceType, 
  ImportedVideoMetadata, 
  ImportJob, 
  ImportJobStatus,
  ImportPipelineConfig,
  VideoImportRequest
} from '../types/import';
import { UrlAnalysis, FFprobeInfo, FFprobeStream } from '../types/shorts';
import { FFmpeg } from '../short-creator/libraries/FFmpeg';
import { Config } from '../config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class VideoImportService extends EventEmitter {
  private ffmpeg: FFmpeg;
  private importDir: string;
  private jobs: Map<string, ImportJob> = new Map();
  private maxConcurrentImports: number = 3;
  private activeImports: number = 0;

  constructor(dataDir: string) {
    super();
    const config = new Config();
    this.ffmpeg = new FFmpeg(config);
    this.importDir = path.join(dataDir, 'imports');
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      await fs.ensureDir(this.importDir);
      logger.info({ importDir: this.importDir }, 'Video import service initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize video import service');
      throw error;
    }
  }

  /**
   * Analyze a video URL without downloading
   */
  public async analyzeUrl(url: string, options?: {
    includeMetadata?: boolean;
    validateSource?: boolean;
    checkDownloadability?: boolean;
    extractBasicInfo?: boolean;
  }): Promise<{
    title?: string;
    duration?: number;
    format?: string;
    resolution?: string;
    fileSize?: number;
    fps?: number;
    videoCodec?: string;
    audioCodec?: string;
    thumbnail?: string;
    canDownload: boolean;
    platform: string;
    hasSubtitles?: boolean;
    subtitles?: string;
    language?: string;
  }> {
    try {
      logger.info({ url }, 'Analyzing video URL');

      // Detect platform
      const platform = this.detectPlatform(url);
      
      if (platform === 'youtube') {
        return await this.analyzeYouTubeUrl(url, options);
      } else {
        return await this.analyzeGenericUrl(url, options);
      }
    } catch (error) {
      logger.error({ error, url }, 'Failed to analyze video URL');
      return {
        canDownload: false,
        platform: 'unknown'
      };
    }
  }

  /**
   * Create a new import job
   */
  public async createImportJob(request: VideoImportRequest): Promise<ImportJob> {
    const jobId = this.generateJobId();
    const job: ImportJob = {
      id: jobId,
      source: request.source,
      sourceUrl: request.url,
      status: ImportJobStatus.QUEUED,
      progress: 0,
      config: this.buildPipelineConfig(request.config),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.jobs.set(jobId, job);
    this.emit('job:created', job);
    
    // Start processing if under concurrent limit
    this.processNextJob();
    
    return job;
  }

  /**
   * Get import job by ID
   */
  public getJob(jobId: string): ImportJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all import jobs
   */
  public getAllJobs(): ImportJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Cancel an import job
   */
  public async cancelJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status === ImportJobStatus.COMPLETED || job.status === ImportJobStatus.FAILED) {
      throw new Error(`Cannot cancel job in ${job.status} status`);
    }

    this.updateJobStatus(jobId, ImportJobStatus.CANCELLED);
    this.emit('job:cancelled', job);
  }

  /**
   * Download video from URL
   */
  private async downloadVideo(job: ImportJob): Promise<string> {
    this.updateJobStatus(job.id, ImportJobStatus.DOWNLOADING);
    
    const outputPath = path.join(this.importDir, job.id, 'original.mp4');
    await fs.ensureDir(path.dirname(outputPath));

    try {
      if (job.source === VideoSourceType.YOUTUBE) {
        // Use yt-dlp for YouTube videos
        await this.downloadYouTubeVideo(job.sourceUrl!, outputPath);
      } else if (job.source === VideoSourceType.URL) {
        // Use ffmpeg or direct download for other URLs
        await this.downloadFromUrl(job.sourceUrl!, outputPath);
      } else {
        throw new Error(`Unsupported source type: ${job.source}`);
      }

      return outputPath;
    } catch (error) {
      logger.error({ error, jobId: job.id }, 'Failed to download video');
      throw error;
    }
  }

  /**
   * Download YouTube video using yt-dlp
   */
  private async downloadYouTubeVideo(url: string, outputPath: string): Promise<void> {
    try {
      // Check if yt-dlp is installed
      await execAsync('which yt-dlp');
    } catch {
      throw new Error('yt-dlp is not installed. Please install it first.');
    }

    const command = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${outputPath}" "${url}"`;
    
    logger.info({ command }, 'Downloading YouTube video');
    
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.includes('WARNING')) {
      logger.warn({ stderr }, 'yt-dlp warnings');
    }
    
    logger.info({ stdout }, 'YouTube video downloaded successfully');
  }

  /**
   * Download video from direct URL
   */
  private async downloadFromUrl(url: string, outputPath: string): Promise<void> {
    // Use ffmpeg to download and convert if necessary
    const command = `ffmpeg -i "${url}" -c copy "${outputPath}"`;
    
    logger.info({ command }, 'Downloading video from URL');
    
    const { stderr } = await execAsync(command);
    if (stderr && !stderr.includes('frame=')) {
      logger.warn({ stderr }, 'ffmpeg warnings');
    }
  }

  /**
   * Extract video metadata
   */
  private async extractMetadata(videoPath: string, job: ImportJob): Promise<ImportedVideoMetadata> {
    const stats = await fs.stat(videoPath);
    
    // Use ffprobe to get video info
    const ffmpeg = (await import('fluent-ffmpeg')).default;
    const videoInfo = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, data) => {
        if (err) reject(err);
        else {
          const videoStream = data.streams.find(s => s.codec_type === 'video');
          resolve({
            duration: data.format.duration,
            width: videoStream?.width || 1920,
            height: videoStream?.height || 1080,
            fps: this.parseFps(videoStream?.r_frame_rate || '30'),
            codec: videoStream?.codec_name || 'h264',
            fileSize: stats.size
          });
        }
      });
    });
    
    const metadata: ImportedVideoMetadata = {
      id: job.id,
      source: job.source,
      sourceUrl: job.sourceUrl,
      duration: videoInfo.duration,
      width: videoInfo.width,
      height: videoInfo.height,
      fps: videoInfo.fps,
      fileSize: stats.size,
      originalFormat: path.extname(videoPath).slice(1),
      importedAt: new Date()
    };

    // Extract title from YouTube if available
    if (job.source === VideoSourceType.YOUTUBE && job.sourceUrl) {
      try {
        const { stdout } = await execAsync(`yt-dlp --get-title "${job.sourceUrl}"`);
        metadata.title = stdout.trim();
      } catch (error) {
        logger.warn({ error }, 'Failed to extract YouTube title');
      }
    }

    return metadata;
  }

  /**
   * Process next job in queue
   */
  private async processNextJob(): Promise<void> {
    if (this.activeImports >= this.maxConcurrentImports) {
      return;
    }

    const queuedJob = Array.from(this.jobs.values())
      .find(job => job.status === ImportJobStatus.QUEUED);

    if (!queuedJob) {
      return;
    }

    this.activeImports++;
    
    try {
      await this.processJob(queuedJob);
    } catch (error) {
      logger.error({ error, jobId: queuedJob.id }, 'Failed to process import job');
      this.updateJobStatus(queuedJob.id, ImportJobStatus.FAILED, (error as Error).message);
    } finally {
      this.activeImports--;
      // Process next job in queue
      this.processNextJob();
    }
  }

  /**
   * Process a single import job
   */
  private async processJob(job: ImportJob): Promise<void> {
    try {
      // Download video
      const videoPath = await this.downloadVideo(job);
      this.updateJobProgress(job.id, 25);

      // Extract metadata
      const metadata = await this.extractMetadata(videoPath, job);
      job.metadata = metadata;
      this.updateJob(job.id, { metadata });
      this.updateJobProgress(job.id, 40);

      // Extract keyframes if configured
      if (job.config.extractKeyframes) {
        await this.extractKeyframes(videoPath, job);
        this.updateJobProgress(job.id, 50);
      }

      // Generate thumbnails if configured
      if (job.config.generateThumbnails) {
        await this.generateThumbnails(videoPath, job);
        this.updateJobProgress(job.id, 60);
      }

      // Note: Transcription and analysis will be handled by separate services
      // This is just updating the progress for the import phase
      this.updateJobProgress(job.id, 100);
      this.updateJobStatus(job.id, ImportJobStatus.COMPLETED);
      
      job.completedAt = new Date();
      this.emit('job:completed', job);
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Extract keyframes from video
   */
  private async extractKeyframes(videoPath: string, job: ImportJob): Promise<void> {
    const keyframesDir = path.join(this.importDir, job.id, 'keyframes');
    await fs.ensureDir(keyframesDir);

    const interval = job.config.keyframeInterval || 5; // Default 5 seconds
    const duration = job.metadata!.duration;
    
    for (let time = 0; time < duration; time += interval) {
      const outputPath = path.join(keyframesDir, `keyframe_${time}.jpg`);
      const command = `ffmpeg -ss ${time} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}"`;
      
      try {
        await execAsync(command);
      } catch (error) {
        logger.warn({ error, time }, 'Failed to extract keyframe');
      }
    }
  }

  /**
   * Generate video thumbnails
   */
  private async generateThumbnails(videoPath: string, job: ImportJob): Promise<void> {
    const thumbnailsDir = path.join(this.importDir, job.id, 'thumbnails');
    await fs.ensureDir(thumbnailsDir);

    // Generate thumbnail at different points
    const points = [0, job.metadata!.duration * 0.25, job.metadata!.duration * 0.5, job.metadata!.duration * 0.75];
    
    for (let i = 0; i < points.length; i++) {
      const time = points[i];
      const outputPath = path.join(thumbnailsDir, `thumbnail_${i}.jpg`);
      const command = `ffmpeg -ss ${time} -i "${videoPath}" -vframes 1 -vf "scale=320:-1" -q:v 2 "${outputPath}"`;
      
      try {
        await execAsync(command);
        
        // Set the first successful thumbnail as the main one
        if (!job.metadata!.thumbnailUrl) {
          job.metadata!.thumbnailUrl = outputPath;
          this.updateJob(job.id, { metadata: job.metadata });
        }
      } catch (error) {
        logger.warn({ error, time }, 'Failed to generate thumbnail');
      }
    }
  }

  /**
   * Build pipeline configuration with defaults
   */
  private buildPipelineConfig(config?: Partial<ImportPipelineConfig>): ImportPipelineConfig {
    return {
      transcribe: true,
      detectScenes: true,
      analyze: true,
      generateSuggestions: true,
      extractKeyframes: true,
      keyframeInterval: 5,
      generateThumbnails: true,
      maxSuggestions: 10,
      outputFormat: 'mp4',
      targetResolution: 'original',
      ...config
    };
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Update job status
   */
  private updateJobStatus(jobId: string, status: ImportJobStatus, error?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = status;
    job.updatedAt = new Date();
    if (error) {
      job.error = error;
    }

    this.emit('job:status', { jobId, status, error });
  }

  /**
   * Update job progress
   */
  private updateJobProgress(jobId: string, progress: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.progress = progress;
    job.updatedAt = new Date();

    this.emit('job:progress', { jobId, progress });
  }

  /**
   * Update job data
   */
  private updateJob(jobId: string, updates: Partial<ImportJob>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    Object.assign(job, updates);
    job.updatedAt = new Date();
  }

  /**
   * Clean up old import files
   */
  public async cleanupOldImports(daysOld: number = 7): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const jobsToClean = Array.from(this.jobs.values())
      .filter(job => 
        job.status === ImportJobStatus.COMPLETED && 
        job.completedAt && 
        job.completedAt < cutoffDate
      );

    for (const job of jobsToClean) {
      try {
        const jobDir = path.join(this.importDir, job.id);
        await fs.remove(jobDir);
        this.jobs.delete(job.id);
        logger.info({ jobId: job.id }, 'Cleaned up old import');
      } catch (error) {
        logger.error({ error, jobId: job.id }, 'Failed to clean up import');
      }
    }
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): string {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'youtube';
    } else if (url.includes('facebook.com')) {
      return 'facebook';
    } else if (url.includes('instagram.com')) {
      return 'instagram';
    } else if (url.includes('tiktok.com')) {
      return 'tiktok';
    }
    return 'generic';
  }

  /**
   * Analyze YouTube URL
   */
  private async analyzeYouTubeUrl(url: string, options: Record<string, unknown> = {}): Promise<UrlAnalysis> {
    try {
      // Use yt-dlp to get info without downloading
      const command = `yt-dlp --dump-json "${url}"`;
      const { stdout } = await execAsync(command);
      const info = JSON.parse(stdout) as Record<string, unknown>;

      return {
        type: 'youtube',
        title: (info.title as string) || 'Unknown Title',
        duration: (info.duration as number) || 0,
        format: (info.ext as string) || 'mp4',
        resolution: `${(info.width as number) || 1920}x${(info.height as number) || 1080}`,
        fileSize: (info.filesize as number) || (info.filesize_approx as number) || 0,
        fps: (info.fps as number) || 30,
        videoCodec: (info.vcodec as string) || 'h264',
        audioCodec: (info.acodec as string) || 'aac',
        thumbnail: info.thumbnail as string,
        canDownload: true,
        platform: 'youtube',
        hasSubtitles: info.subtitles ? Object.keys(info.subtitles as Record<string, unknown>).length > 0 : false,
        language: (info.language as string) || 'en'
      };
    } catch (error) {
      logger.warn({ error, url }, 'Failed to analyze YouTube URL, using fallback');
      return {
        type: 'youtube',
        title: 'YouTube Video',
        duration: 0,
        format: 'mp4',
        resolution: '1920x1080',
        videoCodec: 'h264',
        audioCodec: 'aac',
        canDownload: false,
        platform: 'youtube'
      };
    }
  }

  /**
   * Analyze generic URL
   */
  private async analyzeGenericUrl(url: string, options: Record<string, unknown> = {}): Promise<UrlAnalysis> {
    try {
      // Use ffprobe to get basic info
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${url}"`;
      const { stdout } = await execAsync(command);
      const info = JSON.parse(stdout) as FFprobeInfo;

      const videoStream = info.streams?.find((s: FFprobeStream) => s.codec_type === 'video');
      
      return {
        type: 'generic',
        title: info.format?.tags?.title || 'Video',
        duration: parseFloat(info.format?.duration || '0') || 0,
        format: info.format?.format_name?.split(',')[0] || 'unknown',
        resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : 'unknown',
        fileSize: parseInt(info.format?.size || '0') || 0,
        fps: videoStream ? eval(videoStream.r_frame_rate || '30') : 30,
        videoCodec: videoStream?.codec_name || 'unknown',
        audioCodec: info.streams?.find((s: FFprobeStream) => s.codec_type === 'audio')?.codec_name || 'unknown',
        canDownload: true,
        platform: this.detectPlatform(url)
      };
    } catch (error) {
      logger.warn({ error, url }, 'Failed to analyze generic URL');
      return {
        type: 'generic',
        title: 'Video',
        duration: 0,
        format: 'unknown',
        resolution: 'unknown',
        videoCodec: 'unknown',
        audioCodec: 'unknown',
        canDownload: false,
        platform: 'generic'
      };
    }
  }

  /**
   * Safely parse FPS from ffprobe output
   * @param fpsString - FPS string from ffprobe (e.g., "30/1" or "30")
   * @returns Parsed FPS value
   */
  private parseFps(fpsString: string): number {
    // Handle fraction format (e.g., "30/1", "24000/1001")
    if (fpsString.includes('/')) {
      const [numerator, denominator] = fpsString.split('/').map(n => parseFloat(n));
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
    
    // Handle simple number format
    const fps = parseFloat(fpsString);
    return isNaN(fps) ? 30 : fps; // Default to 30 FPS if parsing fails
  }
}