import path from 'path';
import fs from 'fs-extra';
import { BaseDownloader, DownloadOptions, VideoMetadata, DownloadResult } from './BaseDownloader';
import { logger } from '../../logger';
import ytdl from 'yt-dlp-exec';

export class YouTubeDownloader extends BaseDownloader {
  protected platformName = 'YouTube';
  protected urlPattern = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/|m\.youtube\.com\/watch\?v=)[\w-]+/i;
  
  private currentDownloadProcess: any = null;
  private isDownloadCancelled = false;

  /**
   * Extract video ID from YouTube URL
   */
  protected extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([\w-]+)/,
      /youtube\.com\/watch\?.*v=([\w-]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Fetch video metadata without downloading
   */
  public async fetchMetadata(url: string): Promise<VideoMetadata> {
    try {
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      logger.info({ url, videoId }, 'Fetching YouTube video metadata');

      // Use yt-dlp to get video info
      const info = await ytdl(url, {
        dumpSingleJson: true,
        noCheckCertificate: true,
        noWarnings: true,
        preferFreeFormats: true,
        quiet: true,
        noPlaylist: true
      });

      const metadata: VideoMetadata = {
        title: info.title || 'Untitled',
        description: info.description,
        duration: info.duration || 0,
        width: info.width || 1920,
        height: info.height || 1080,
        fps: info.fps,
        fileSize: info.filesize || (info as any).filesize_approx,
        format: info.ext || 'mp4',
        thumbnailUrl: this.getBestThumbnail(info.thumbnails),
        author: info.uploader || info.channel,
        uploadDate: info.upload_date ? this.parseYtdlDate(info.upload_date) : undefined,
        viewCount: info.view_count,
        platform: this.platformName,
        originalUrl: url
      };

      logger.info({ videoId, title: metadata.title }, 'Successfully fetched YouTube metadata');
      return metadata;
    } catch (error) {
      logger.error({ error, url }, 'Failed to fetch YouTube metadata');
      throw new Error(`Failed to fetch metadata: ${(error as Error).message}`);
    }
  }

  /**
   * Download video from YouTube
   */
  public async download(url: string, options: DownloadOptions): Promise<DownloadResult> {
    this.isDownloadCancelled = false;
    
    try {
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      // Ensure output directory exists
      await fs.ensureDir(path.dirname(options.outputPath));

      // Fetch metadata first
      const metadata = await this.fetchMetadata(url);
      this.emitStart(url, metadata);

      // Check duration limit
      if (options.maxDuration && metadata.duration > options.maxDuration) {
        throw new Error(`Video duration (${metadata.duration}s) exceeds maximum allowed duration (${options.maxDuration}s)`);
      }

      logger.info({ url, videoId, outputPath: options.outputPath }, 'Starting YouTube download');

      // Prepare yt-dlp options
      const ytdlOptions: any = {
        output: options.outputPath,
        format: this.getFormatString(options),
        noCheckCertificate: true,
        noWarnings: true,
        preferFreeFormats: true,
        addMetadata: true,
        noPlaylist: true,
        quiet: true,
        progress: true,
        retries: options.maxRetries || 3,
        fragmentRetries: 3,
        fileAccessRetries: 3
      };

      // Add cookies if provided
      if (options.cookies) {
        ytdlOptions.cookies = options.cookies;
      }

      // Handle timeout
      const downloadPromise = this.executeDownload(url, ytdlOptions);
      const timeoutPromise = options.timeout 
        ? new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Download timeout')), options.timeout)
          )
        : null;

      const promises = [downloadPromise];
      if (timeoutPromise) {
        promises.push(timeoutPromise);
      }

      await Promise.race(promises);

      // Find the actual downloaded file (yt-dlp might change the filename)
      const outputDir = path.dirname(options.outputPath);
      const originalBasename = path.basename(options.outputPath, path.extname(options.outputPath));
      
      let actualOutputPath = options.outputPath;
      
      // Check if the exact path exists first
      if (!await fs.pathExists(options.outputPath)) {
        // If not, look for files with similar names in the output directory
        try {
          const files = await fs.readdir(outputDir);
          
          // Look for files that start with our basename or contain the video ID
          const possibleFiles = files.filter(file => {
            const fileBasename = path.basename(file, path.extname(file));
            return fileBasename.includes(originalBasename) || 
                   fileBasename.includes(videoId!) ||
                   file.includes(videoId!);
          });
          
          if (possibleFiles.length > 0) {
            // Use the first matching file
            actualOutputPath = path.join(outputDir, possibleFiles[0]);
            logger.info({ 
              expectedPath: options.outputPath, 
              actualPath: actualOutputPath 
            }, 'Found downloaded file with different name');
          } else {
            throw new Error('Download completed but output file not found');
          }
        } catch {
          throw new Error('Download completed but output file not found');
        }
      }

      const stats = await fs.stat(actualOutputPath);
      metadata.fileSize = stats.size;

      const result: DownloadResult = {
        success: true,
        outputPath: actualOutputPath,
        metadata
      };

      this.emitComplete(result);
      logger.info({ videoId, outputPath: actualOutputPath }, 'YouTube download completed');
      
      return result;
    } catch (error) {
      const downloadError = new Error(`YouTube download failed: ${(error as Error).message}`);
      this.emitError(downloadError);
      
      return {
        success: false,
        error: downloadError
      };
    } finally {
      this.currentDownloadProcess = null;
    }
  }

  /**
   * Execute the actual download with progress tracking
   */
  private async executeDownload(url: string, options: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const subprocess = (ytdl as any).exec(url, options);
      this.currentDownloadProcess = subprocess;

      let lastProgress = 0;

      subprocess.stdout?.on('data', (data: any) => {
        const output = data.toString();
        
        // Parse progress from yt-dlp output
        const progressMatch = output.match(/\[download\]\s+(\d+(?:\.\d+)?)\%/);
        if (progressMatch) {
          const percent = parseFloat(progressMatch[1]);
          if (percent > lastProgress) {
            lastProgress = percent;
            this.emitProgress({
              percent,
              downloaded: 0,
              total: 0
            });
          }
        }

        // Parse download speed and ETA
        const speedMatch = output.match(/at\s+(\d+(?:\.\d+)?[KMG]?B\/s)/);
        const etaMatch = output.match(/ETA\s+(\d+):(\d+)/);
        
        if (speedMatch || etaMatch) {
          const speed = speedMatch ? this.parseSpeed(speedMatch[1]) : undefined;
          const eta = etaMatch ? parseInt(etaMatch[1]) * 60 + parseInt(etaMatch[2]) : undefined;
          
          this.emitProgress({
            percent: lastProgress,
            downloaded: 0,
            total: 0,
            speed,
            eta
          });
        }
      });

      subprocess.stderr?.on('data', (data: any) => {
        const error = data.toString();
        if (error && !error.includes('WARNING')) {
          logger.warn({ error }, 'yt-dlp stderr output');
        }
      });

      subprocess.on('error', (error: any) => {
        if (!this.isDownloadCancelled) {
          reject(error);
        }
      });

      subprocess.on('exit', (code: any) => {
        if (this.isDownloadCancelled) {
          reject(new Error('Download cancelled'));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Cancel ongoing download
   */
  public cancelDownload(): void {
    this.isDownloadCancelled = true;
    if (this.currentDownloadProcess) {
      try {
        this.currentDownloadProcess.kill('SIGTERM');
        logger.info('YouTube download cancelled');
      } catch (error) {
        logger.error({ error }, 'Failed to cancel YouTube download');
      }
    }
  }

  /**
   * Get quality mapping for YouTube
   */
  protected getQualityMapping(quality: DownloadOptions['quality']): string {
    const qualityMap: Record<string, string> = {
      'best': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      'high': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best',
      'medium': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
      'low': 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best'
    };

    return qualityMap[quality || 'best'] || qualityMap.best;
  }

  /**
   * Build format string based on options
   */
  private getFormatString(options: DownloadOptions): string {
    const quality = this.getQualityMapping(options.quality);
    
    if (options.format === 'webm') {
      return quality.replace(/\[ext=mp4\]/g, '[ext=webm]').replace(/\[ext=m4a\]/g, '[ext=webm]');
    }
    
    return quality;
  }

  /**
   * Get best thumbnail from available options
   */
  private getBestThumbnail(thumbnails?: any[]): string | undefined {
    if (!thumbnails || thumbnails.length === 0) {
      return undefined;
    }

    // Sort by preference: maxresdefault > standard > high > medium > default
    const preferenceOrder = ['maxresdefault', 'standard', 'high', 'medium', 'default'];
    
    for (const preference of preferenceOrder) {
      const thumbnail = thumbnails.find(t => t.id === preference || t.url?.includes(preference));
      if (thumbnail) {
        return thumbnail.url;
      }
    }

    // Return the last thumbnail (usually highest quality)
    return thumbnails[thumbnails.length - 1].url;
  }

  /**
   * Parse yt-dlp date format (YYYYMMDD) to Date
   */
  private parseYtdlDate(dateStr: string): Date {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return new Date(`${year}-${month}-${day}`);
  }

  /**
   * Parse speed string to bytes per second
   */
  private parseSpeed(speedStr: string): number {
    const match = speedStr.match(/(\d+(?:\.\d+)?)\s*([KMG]?)B\/s/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: Record<string, number> = {
      '': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024
    };

    return value * (multipliers[unit] || 1);
  }
}