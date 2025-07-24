import path from 'path';
import fs from 'fs-extra';
import { BaseDownloader, DownloadOptions, VideoMetadata, DownloadResult, DownloadProgress } from './BaseDownloader';
import { logger } from '../../logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import { parse as parseUrl } from 'url';

const execAsync = promisify(exec);

export class GenericDownloader extends BaseDownloader {
  protected platformName = 'Generic';
  protected urlPattern = /^https?:\/\/.+\.(mp4|webm|mov|avi|mkv|flv|wmv|m4v|3gp|mpg|mpeg)(\?.*)?$/i;
  
  private currentDownloadStream: any = null;
  private isDownloadCancelled = false;

  /**
   * Extract filename from URL
   */
  protected extractVideoId(url: string): string | null {
    try {
      const parsedUrl = parseUrl(url);
      const pathname = parsedUrl.pathname || '';
      const filename = path.basename(pathname);
      return filename || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate if URL points to a video file
   */
  public validateUrl(url: string): boolean {
    // First check if it matches direct video file pattern
    if (this.urlPattern.test(url)) {
      return true;
    }

    // For generic URLs, we'll try to handle any URL and check content-type
    try {
      const parsedUrl = parseUrl(url);
      return !!(parsedUrl.protocol && parsedUrl.host);
    } catch (error) {
      return false;
    }
  }

  /**
   * Fetch video metadata without downloading
   */
  public async fetchMetadata(url: string): Promise<VideoMetadata> {
    try {
      logger.info({ url }, 'Fetching generic video metadata');

      // First, try to get headers to check if it's a video
      const got = (await import('got')).default;
      const headResponse = await got.head(url, {
        headers: this.createHeaders(),
        timeout: { request: 10000 },
        followRedirect: true
      });

      const contentType = headResponse.headers['content-type'];
      const contentLength = headResponse.headers['content-length'];
      
      // Check if content type is video
      if (!contentType || !contentType.startsWith('video/')) {
        // Try yt-dlp as fallback for non-direct video URLs
        return await this.fetchMetadataWithYtdlp(url);
      }

      // Extract basic metadata from headers
      const filename = this.extractFilenameFromHeaders(headResponse.headers) || 
                      this.extractVideoId(url) || 
                      'video.mp4';

      const metadata: VideoMetadata = {
        title: filename.replace(/\.[^/.]+$/, ''), // Remove extension
        format: this.extractFormatFromContentType(contentType) || 'mp4',
        fileSize: contentLength ? parseInt(contentLength) : undefined,
        platform: this.platformName,
        originalUrl: url,
        // These will be filled after downloading a sample
        duration: 0,
        width: 1920,
        height: 1080
      };

      // Try to download a small sample to get video properties
      try {
        const sampleMetadata = await this.fetchSampleMetadata(url);
        Object.assign(metadata, sampleMetadata);
      } catch (error) {
        logger.warn({ error }, 'Failed to fetch sample metadata');
      }

      logger.info({ url, title: metadata.title }, 'Successfully fetched generic video metadata');
      return metadata;
    } catch (error) {
      logger.error({ error, url }, 'Failed to fetch generic video metadata');
      
      // Last resort: try yt-dlp
      try {
        return await this.fetchMetadataWithYtdlp(url);
      } catch (ytdlpError) {
        throw new Error(`Failed to fetch metadata: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Fetch metadata using yt-dlp as fallback
   */
  private async fetchMetadataWithYtdlp(url: string): Promise<VideoMetadata> {
    try {
      const { stdout } = await execAsync(`yt-dlp --dump-json --no-warnings "${url}"`);
      const info = JSON.parse(stdout);

      return {
        title: info.title || info.webpage_url_basename || 'Generic Video',
        description: info.description,
        duration: info.duration || 0,
        width: info.width || 1920,
        height: info.height || 1080,
        fps: info.fps,
        fileSize: info.filesize || info.filesize_approx,
        format: info.ext || 'mp4',
        thumbnailUrl: info.thumbnail,
        author: info.uploader || info.channel,
        uploadDate: info.timestamp ? new Date(info.timestamp * 1000) : undefined,
        viewCount: info.view_count,
        platform: info.extractor || this.platformName,
        originalUrl: url
      };
    } catch (error) {
      throw new Error(`yt-dlp failed: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch sample metadata by downloading a small portion
   */
  private async fetchSampleMetadata(url: string): Promise<Partial<VideoMetadata>> {
    const tempFile = path.join(process.cwd(), `temp_sample_${Date.now()}.mp4`);
    
    try {
      // Download first 1MB of the video
      const got = (await import('got')).default;
      const downloadStream = got.stream(url, {
        headers: {
          ...this.createHeaders(),
          'Range': 'bytes=0-1048576' // 1MB
        },
        timeout: { request: 30000 }
      });

      const writeStream = fs.createWriteStream(tempFile);
      
      await new Promise((resolve, reject) => {
        downloadStream
          .pipe(writeStream)
          .on('finish', () => resolve(undefined))
          .on('error', reject);
        
        downloadStream.on('error', reject);
      });

      // Analyze the sample with ffprobe
      const videoInfo = await this.getVideoInfo(tempFile);
      return videoInfo;
    } catch (error) {
      logger.warn({ error }, 'Failed to analyze video sample');
      return {};
    } finally {
      // Clean up temp file
      try {
        await fs.remove(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Download video from generic URL
   */
  public async download(url: string, options: DownloadOptions): Promise<DownloadResult> {
    this.isDownloadCancelled = false;
    
    try {
      logger.info({ url, outputPath: options.outputPath }, 'Starting generic video download');

      // Ensure output directory exists
      await fs.ensureDir(path.dirname(options.outputPath));

      // Check if it's a direct video URL
      const got = (await import('got')).default;
      const headResponse = await got.head(url, {
        headers: this.createHeaders(options),
        timeout: { request: 10000 },
        followRedirect: true
      });

      const contentType = headResponse.headers['content-type'];
      
      if (contentType && contentType.startsWith('video/')) {
        // Direct video download
        return await this.downloadDirect(url, options);
      } else {
        // Try yt-dlp for complex video pages
        return await this.downloadWithYtdlp(url, options);
      }
    } catch (error) {
      const downloadError = new Error(`Generic download failed: ${(error as Error).message}`);
      this.emitError(downloadError);
      
      return {
        success: false,
        error: downloadError
      };
    } finally {
      this.currentDownloadStream = null;
    }
  }

  /**
   * Direct download for video files
   */
  private async downloadDirect(url: string, options: DownloadOptions): Promise<DownloadResult> {
    // Fetch metadata first
    const metadata = await this.fetchMetadata(url);
    this.emitStart(url, metadata);

    // Check duration limit if we have duration
    if (options.maxDuration && metadata.duration > options.maxDuration) {
      throw new Error(`Video duration (${metadata.duration}s) exceeds maximum allowed duration (${options.maxDuration}s)`);
    }

    // Download the video
    const headers = this.createHeaders(options);
    const got = (await import('got')).default;
    const downloadStream = got.stream(url, {
      headers,
      timeout: { request: options.timeout || 600000 }, // 10 minutes default
      retry: { limit: options.maxRetries || 3 }
    });

    this.currentDownloadStream = downloadStream;
    const writeStream = fs.createWriteStream(options.outputPath);

    let downloadedBytes = 0;
    let totalBytes = metadata.fileSize || 0;
    let lastProgressTime = Date.now();

    downloadStream.on('downloadProgress', (progress: any) => {
      if (this.isDownloadCancelled) {
        downloadStream.destroy();
        return;
      }

      downloadedBytes = progress.transferred;
      totalBytes = progress.total || totalBytes;

      // Calculate speed
      const currentTime = Date.now();
      const timeDiff = (currentTime - lastProgressTime) / 1000;
      const bytesDiff = progress.transferred - downloadedBytes;
      const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;

      const progressData: DownloadProgress = {
        percent: progress.percent ? progress.percent * 100 : (totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0),
        downloaded: downloadedBytes,
        total: totalBytes,
        speed: speed
      };

      // Calculate ETA
      if (speed > 0 && totalBytes > 0) {
        progressData.eta = (totalBytes - downloadedBytes) / speed;
      }

      this.emitProgress(progressData);
      lastProgressTime = currentTime;
    });

    return new Promise((resolve, reject) => {
      downloadStream
        .pipe(writeStream)
        .on('finish', async () => {
          if (this.isDownloadCancelled) {
            await fs.remove(options.outputPath);
            reject(new Error('Download cancelled'));
            return;
          }

          // Get actual video info from downloaded file
          const videoInfo = await this.getVideoInfo(options.outputPath);
          Object.assign(metadata, videoInfo);

          const stats = await fs.stat(options.outputPath);
          metadata.fileSize = stats.size;

          // Convert to desired format if needed
          if (options.format && options.format !== metadata.format) {
            const convertedPath = await this.convertVideo(options.outputPath, options.format);
            await fs.remove(options.outputPath);
            options.outputPath = convertedPath;
          }

          const result: DownloadResult = {
            success: true,
            outputPath: options.outputPath,
            metadata
          };

          this.emitComplete(result);
          resolve(result);
        })
        .on('error', (error: any) => {
          reject(error);
        });

      downloadStream.on('error', (error: any) => {
        writeStream.destroy();
        reject(error);
      });
    });
  }

  /**
   * Download using yt-dlp
   */
  private async downloadWithYtdlp(url: string, options: DownloadOptions): Promise<DownloadResult> {
    // Fetch metadata first
    const metadata = await this.fetchMetadataWithYtdlp(url);
    this.emitStart(url, metadata);

    // Check duration limit
    if (options.maxDuration && metadata.duration > options.maxDuration) {
      throw new Error(`Video duration (${metadata.duration}s) exceeds maximum allowed duration (${options.maxDuration}s)`);
    }

    // Build yt-dlp command
    const quality = this.getQualityMapping(options.quality);
    const formatArg = options.format ? `--merge-output-format ${options.format}` : '';
    const command = `yt-dlp -f "${quality}" ${formatArg} -o "${options.outputPath}" --no-warnings --retries ${options.maxRetries || 3} "${url}"`;
    
    logger.info({ command }, 'Downloading video with yt-dlp');

    // Execute download
    const { stderr } = await execAsync(command);
    
    if (stderr && !stderr.includes('WARNING')) {
      logger.warn({ stderr }, 'yt-dlp warnings');
    }

    // Verify file exists
    const exists = await fs.pathExists(options.outputPath);
    if (!exists) {
      throw new Error('Download completed but output file not found');
    }

    const stats = await fs.stat(options.outputPath);
    metadata.fileSize = stats.size;

    // Get actual video info from downloaded file
    const videoInfo = await this.getVideoInfo(options.outputPath);
    Object.assign(metadata, videoInfo);

    const result: DownloadResult = {
      success: true,
      outputPath: options.outputPath,
      metadata
    };

    this.emitComplete(result);
    return result;
  }

  /**
   * Convert video to different format
   */
  private async convertVideo(inputPath: string, format: string): Promise<string> {
    const outputPath = inputPath.replace(/\.[^/.]+$/, `.${format}`);
    const command = `ffmpeg -i "${inputPath}" -c:v libx264 -c:a aac -movflags +faststart "${outputPath}"`;
    
    logger.info({ command }, 'Converting video format');
    
    const { stderr } = await execAsync(command);
    if (stderr && !stderr.includes('frame=')) {
      logger.warn({ stderr }, 'ffmpeg conversion warnings');
    }

    return outputPath;
  }

  /**
   * Get video info using ffprobe
   */
  private async getVideoInfo(filePath: string): Promise<Partial<VideoMetadata>> {
    try {
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
      const { stdout } = await execAsync(command);
      const info = JSON.parse(stdout);

      const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
      
      return {
        duration: parseFloat(info.format.duration) || 0,
        width: videoStream?.width || 1920,
        height: videoStream?.height || 1080,
        fps: videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : undefined,
        format: path.extname(filePath).slice(1) || info.format.format_name?.split(',')[0] || 'mp4'
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to get video info with ffprobe');
      return {};
    }
  }

  /**
   * Extract filename from Content-Disposition header
   */
  private extractFilenameFromHeaders(headers: any): string | null {
    const contentDisposition = headers['content-disposition'];
    if (!contentDisposition) return null;

    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (filenameMatch) {
      let filename = filenameMatch[1];
      if (filename.startsWith('"') && filename.endsWith('"')) {
        filename = filename.slice(1, -1);
      }
      return filename;
    }

    return null;
  }

  /**
   * Extract format from content-type header
   */
  private extractFormatFromContentType(contentType: string): string | null {
    const typeMap: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/x-matroska': 'mkv',
      'video/x-flv': 'flv',
      'video/x-ms-wmv': 'wmv',
      'video/3gpp': '3gp',
      'video/mpeg': 'mpeg'
    };

    return typeMap[contentType.toLowerCase()] || null;
  }

  /**
   * Cancel ongoing download
   */
  public cancelDownload(): void {
    this.isDownloadCancelled = true;
    if (this.currentDownloadStream) {
      try {
        this.currentDownloadStream.destroy();
        logger.info('Generic download cancelled');
      } catch (error) {
        logger.error({ error }, 'Failed to cancel generic download');
      }
    }
  }

  /**
   * Get quality mapping for generic videos
   */
  protected getQualityMapping(quality: DownloadOptions['quality']): string {
    // For generic videos, we can't control quality during download
    // Quality conversion would need to be done post-download with ffmpeg
    const qualityMap: Record<string, string> = {
      'best': 'best',
      'high': 'best',
      'medium': 'best',
      'low': 'best'
    };

    return qualityMap[quality || 'best'] || qualityMap.best;
  }
}