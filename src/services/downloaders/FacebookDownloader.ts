import path from 'path';
import fs from 'fs-extra';
import { BaseDownloader, DownloadOptions, VideoMetadata, DownloadResult, DownloadProgress } from './BaseDownloader';
import { logger } from '../../logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class FacebookDownloader extends BaseDownloader {
  protected platformName = 'Facebook';
  protected urlPattern = /^https?:\/\/(www\.)?(facebook\.com|fb\.com|fb\.watch)\/(watch\/?\?v=|video\.php\?v=|[\w\-]+\/videos\/|reel\/|stories\/|[\w\-]+\/posts\/)[\w\-]+/i;
  
  private currentDownloadStream: any = null;
  private isDownloadCancelled = false;

  /**
   * Extract video ID from Facebook URL
   */
  protected extractVideoId(url: string): string | null {
    // Facebook video IDs can be in various formats
    const patterns = [
      /\/videos\/(\d+)/,
      /[?&]v=(\d+)/,
      /\/reel\/(\d+)/,
      /\/posts\/(\d+)/,
      /\/(\d+)\/?$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Try to extract from fb.watch short URLs
    if (url.includes('fb.watch')) {
      const segments = url.split('/');
      return segments[segments.length - 1] || null;
    }

    return null;
  }

  /**
   * Fetch video metadata without downloading
   */
  public async fetchMetadata(url: string): Promise<VideoMetadata> {
    try {
      const videoId = this.extractVideoId(url);
      logger.info({ url, videoId }, 'Fetching Facebook video metadata');

      // Try using yt-dlp first as it handles Facebook videos well
      try {
        const { stdout } = await execAsync(`yt-dlp --dump-json --no-warnings "${url}"`);
        const info = JSON.parse(stdout);

        const metadata: VideoMetadata = {
          title: info.title || 'Facebook Video',
          description: info.description,
          duration: info.duration || 0,
          width: info.width || 1280,
          height: info.height || 720,
          fps: info.fps,
          fileSize: info.filesize || info.filesize_approx,
          format: info.ext || 'mp4',
          thumbnailUrl: info.thumbnail,
          author: info.uploader || info.channel,
          uploadDate: info.timestamp ? new Date(info.timestamp * 1000) : undefined,
          viewCount: info.view_count,
          platform: this.platformName,
          originalUrl: url
        };

        logger.info({ videoId, title: metadata.title }, 'Successfully fetched Facebook metadata via yt-dlp');
        return metadata;
      } catch (ytdlpError) {
        logger.warn({ error: ytdlpError }, 'Failed to fetch metadata via yt-dlp, falling back to scraping');
        
        // Fallback: scrape metadata from page
        return await this.scrapeMetadata(url);
      }
    } catch (error) {
      logger.error({ error, url }, 'Failed to fetch Facebook metadata');
      throw new Error(`Failed to fetch metadata: ${(error as Error).message}`);
    }
  }

  /**
   * Scrape metadata from Facebook page
   */
  private async scrapeMetadata(url: string): Promise<VideoMetadata> {
    const headers = this.createHeaders();
    
    try {
      const got = (await import('got')).default;
      const response = await got(url, {
        headers,
        timeout: { request: 30000 },
        followRedirect: true
      });

      const html = response.body;
      
      // Extract metadata from Open Graph tags and other sources
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      const descriptionMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
      const thumbnailMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
      
      // Try to extract video URL from various sources
      const videoUrlMatch = html.match(/"contentUrl":\s*"([^"]+)"/i) ||
                           html.match(/"video_url":\s*"([^"]+)"/i) ||
                           html.match(/"hd_src":\s*"([^"]+)"/i) ||
                           html.match(/"sd_src":\s*"([^"]+)"/i);

      if (!videoUrlMatch) {
        throw new Error('Could not find video URL in page');
      }

      const metadata: VideoMetadata = {
        title: titleMatch ? this.decodeHtmlEntities(titleMatch[1]) : 'Facebook Video',
        description: descriptionMatch ? this.decodeHtmlEntities(descriptionMatch[1]) : undefined,
        duration: 0, // Will be determined after download
        width: 1280,
        height: 720,
        format: 'mp4',
        thumbnailUrl: thumbnailMatch ? thumbnailMatch[1] : undefined,
        platform: this.platformName,
        originalUrl: url
      };

      return metadata;
    } catch (error) {
      throw new Error(`Failed to scrape metadata: ${(error as Error).message}`);
    }
  }

  /**
   * Download video from Facebook
   */
  public async download(url: string, options: DownloadOptions): Promise<DownloadResult> {
    this.isDownloadCancelled = false;
    
    try {
      const videoId = this.extractVideoId(url);
      logger.info({ url, videoId, outputPath: options.outputPath }, 'Starting Facebook download');

      // Ensure output directory exists
      await fs.ensureDir(path.dirname(options.outputPath));

      // Try yt-dlp first as it's more reliable for Facebook
      try {
        return await this.downloadWithYtdlp(url, options);
      } catch (ytdlpError) {
        logger.warn({ error: ytdlpError }, 'yt-dlp download failed, trying direct download');
        
        // Fallback to direct download
        return await this.downloadDirect(url, options);
      }
    } catch (error) {
      const downloadError = new Error(`Facebook download failed: ${(error as Error).message}`);
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
   * Download using yt-dlp
   */
  private async downloadWithYtdlp(url: string, options: DownloadOptions): Promise<DownloadResult> {
    // Fetch metadata first
    const metadata = await this.fetchMetadata(url);
    this.emitStart(url, metadata);

    // Check duration limit
    if (options.maxDuration && metadata.duration > options.maxDuration) {
      throw new Error(`Video duration (${metadata.duration}s) exceeds maximum allowed duration (${options.maxDuration}s)`);
    }

    // Build yt-dlp command
    const quality = this.getQualityMapping(options.quality);
    const command = `yt-dlp -f "${quality}" -o "${options.outputPath}" --no-warnings --retries ${options.maxRetries || 3} "${url}"`;
    
    logger.info({ command }, 'Downloading Facebook video with yt-dlp');

    // Execute download with progress tracking
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
   * Direct download fallback
   */
  private async downloadDirect(url: string, options: DownloadOptions): Promise<DownloadResult> {
    // First, get the direct video URL
    const videoUrl = await this.extractDirectVideoUrl(url);
    if (!videoUrl) {
      throw new Error('Could not extract direct video URL');
    }

    // Fetch basic metadata
    const metadata = await this.scrapeMetadata(url);
    this.emitStart(url, metadata);

    // Download the video
    const headers = this.createHeaders(options);
    const got = (await import('got')).default;
    const downloadStream = got.stream(videoUrl, {
      headers,
      timeout: { request: options.timeout || 300000 },
      retry: { limit: options.maxRetries || 3 }
    });

    this.currentDownloadStream = downloadStream;
    const writeStream = fs.createWriteStream(options.outputPath);

    let downloadedBytes = 0;
    let totalBytes = 0;

    downloadStream.on('downloadProgress', (progress: any) => {
      if (this.isDownloadCancelled) {
        downloadStream.destroy();
        return;
      }

      downloadedBytes = progress.transferred;
      totalBytes = progress.total || 0;

      const progressData: DownloadProgress = {
        percent: progress.percent ? progress.percent * 100 : 0,
        downloaded: downloadedBytes,
        total: totalBytes
      };

      this.emitProgress(progressData);
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
   * Extract direct video URL from Facebook page
   */
  private async extractDirectVideoUrl(url: string): Promise<string | null> {
    const headers = this.createHeaders();
    
    try {
      const got = (await import('got')).default;
      const response = await got(url, {
        headers,
        timeout: { request: 30000 },
        followRedirect: true
      });

      const html = response.body;
      
      // Try various patterns to find video URL
      const patterns = [
        /"contentUrl":\s*"([^"]+)"/i,
        /"video_url":\s*"([^"]+)"/i,
        /"hd_src":\s*"([^"]+)"/i,
        /"sd_src":\s*"([^"]+)"/i,
        /"playable_url":\s*"([^"]+)"/i,
        /"playable_url_quality_hd":\s*"([^"]+)"/i
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          // Decode Unicode escapes
          const videoUrl = match[1].replace(/\\u[\dA-F]{4}/gi, (match: string) => {
            return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
          });
          
          return videoUrl;
        }
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Failed to extract direct video URL');
      return null;
    }
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
        width: videoStream?.width || 1280,
        height: videoStream?.height || 720,
        fps: videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : undefined,
        format: info.format.format_name?.split(',')[0] || 'mp4'
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to get video info with ffprobe');
      return {};
    }
  }

  /**
   * Cancel ongoing download
   */
  public cancelDownload(): void {
    this.isDownloadCancelled = true;
    if (this.currentDownloadStream) {
      try {
        this.currentDownloadStream.destroy();
        logger.info('Facebook download cancelled');
      } catch (error) {
        logger.error({ error }, 'Failed to cancel Facebook download');
      }
    }
  }

  /**
   * Get quality mapping for Facebook
   */
  protected getQualityMapping(quality: DownloadOptions['quality']): string {
    const qualityMap: Record<string, string> = {
      'best': 'best[ext=mp4]/best',
      'high': 'best[height<=1080][ext=mp4]/best[height<=1080]/best',
      'medium': 'best[height<=720][ext=mp4]/best[height<=720]/best',
      'low': 'best[height<=480][ext=mp4]/best[height<=480]/best'
    };

    return qualityMap[quality || 'best'] || qualityMap.best;
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
      '&#x60;': '`',
      '&#x3D;': '='
    };

    return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  }
}