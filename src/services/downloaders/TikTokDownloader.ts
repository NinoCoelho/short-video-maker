import path from 'path';
import fs from 'fs-extra';
import { BaseDownloader, DownloadOptions, VideoMetadata, DownloadResult, DownloadProgress } from './BaseDownloader';
import { logger } from '../../logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class TikTokDownloader extends BaseDownloader {
  protected platformName = 'TikTok';
  protected urlPattern = /^https?:\/\/(www\.)?(tiktok\.com\/@[\w\-\.]+\/video\/\d+|vm\.tiktok\.com\/[\w\-]+|vt\.tiktok\.com\/[\w\-]+)/i;
  
  private currentDownloadStream: any = null;
  private isDownloadCancelled = false;

  /**
   * Extract video ID from TikTok URL
   */
  protected extractVideoId(url: string): string | null {
    // Handle different TikTok URL formats
    const patterns = [
      /\/video\/(\d+)/,
      /vm\.tiktok\.com\/([\w\-]+)/,
      /vt\.tiktok\.com\/([\w\-]+)/
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
   * Resolve shortened TikTok URL to full URL
   */
  private async resolveShortUrl(url: string): Promise<string> {
    if (url.includes('tiktok.com/@')) {
      return url; // Already a full URL
    }

    try {
      const got = (await import('got')).default;
      const response = await got(url, {
        followRedirect: false,
        headers: this.createHeaders()
      });

      const location = response.headers.location;
      if (location) {
        return location;
      }

      return url;
    } catch (error: any) {
      if (error.response?.headers?.location) {
        return error.response.headers.location;
      }
      return url;
    }
  }

  /**
   * Fetch video metadata without downloading
   */
  public async fetchMetadata(url: string): Promise<VideoMetadata> {
    try {
      // Resolve short URLs first
      const fullUrl = await this.resolveShortUrl(url);
      const videoId = this.extractVideoId(fullUrl);
      
      logger.info({ url, fullUrl, videoId }, 'Fetching TikTok video metadata');

      // Try using yt-dlp first
      try {
        const { stdout } = await execAsync(`yt-dlp --dump-json --no-warnings "${fullUrl}"`);
        const info = JSON.parse(stdout);

        const metadata: VideoMetadata = {
          title: info.title || info.description?.substring(0, 50) || 'TikTok Video',
          description: info.description,
          duration: info.duration || 0,
          width: info.width || 576,
          height: info.height || 1024,
          fps: info.fps,
          fileSize: info.filesize || info.filesize_approx,
          format: info.ext || 'mp4',
          thumbnailUrl: info.thumbnail,
          author: info.uploader || info.creator || info.channel,
          uploadDate: info.timestamp ? new Date(info.timestamp * 1000) : undefined,
          viewCount: info.view_count,
          platform: this.platformName,
          originalUrl: url
        };

        logger.info({ videoId, title: metadata.title }, 'Successfully fetched TikTok metadata via yt-dlp');
        return metadata;
      } catch (ytdlpError) {
        logger.warn({ error: ytdlpError }, 'Failed to fetch metadata via yt-dlp, falling back to scraping');
        
        // Fallback: scrape metadata from page
        return await this.scrapeMetadata(fullUrl);
      }
    } catch (error) {
      logger.error({ error, url }, 'Failed to fetch TikTok metadata');
      throw new Error(`Failed to fetch metadata: ${(error as Error).message}`);
    }
  }

  /**
   * Scrape metadata from TikTok page
   */
  private async scrapeMetadata(url: string): Promise<VideoMetadata> {
    const headers = {
      ...this.createHeaders(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    
    try {
      const got = (await import('got')).default;
      const response = await got(url, {
        headers,
        timeout: { request: 30000 },
        followRedirect: true
      });

      const html = response.body;
      
      // Extract metadata from various sources
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      const descriptionMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
      const videoMatch = html.match(/<meta\s+property="og:video:url"\s+content="([^"]+)"/i);
      const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
      
      // Try to extract JSON-LD data
      const jsonLdMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([^<]+)<\/script>/);
      
      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          const videoObject = Array.isArray(jsonLd) ? jsonLd.find(item => item['@type'] === 'VideoObject') : jsonLd;
          
          if (videoObject && videoObject['@type'] === 'VideoObject') {
            return {
              title: videoObject.name || videoObject.description?.substring(0, 50) || 'TikTok Video',
              description: videoObject.description,
              duration: this.parseDuration(videoObject.duration || '0'),
              width: videoObject.width || 576,
              height: videoObject.height || 1024,
              format: 'mp4',
              thumbnailUrl: videoObject.thumbnailUrl || videoObject.thumbnail,
              author: videoObject.creator?.name || videoObject.author?.name,
              uploadDate: videoObject.uploadDate ? new Date(videoObject.uploadDate) : undefined,
              viewCount: videoObject.interactionStatistic?.find((stat: any) => stat.interactionType === 'WatchAction')?.userInteractionCount,
              platform: this.platformName,
              originalUrl: url
            };
          }
        } catch (e) {
          logger.warn({ error: e }, 'Failed to parse TikTok JSON-LD data');
        }
      }

      // Try to extract from NEXT_DATA
      const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const videoData = nextData.props?.pageProps?.itemInfo?.itemStruct;
          
          if (videoData) {
            return {
              title: videoData.desc || 'TikTok Video',
              description: videoData.desc,
              duration: videoData.video?.duration || 0,
              width: videoData.video?.width || 576,
              height: videoData.video?.height || 1024,
              format: videoData.video?.format || 'mp4',
              thumbnailUrl: videoData.video?.cover || videoData.video?.dynamicCover,
              author: videoData.author?.nickname || videoData.author?.uniqueId,
              uploadDate: videoData.createTime ? new Date(parseInt(videoData.createTime) * 1000) : undefined,
              viewCount: videoData.stats?.playCount,
              platform: this.platformName,
              originalUrl: url
            };
          }
        } catch (e) {
          logger.warn({ error: e }, 'Failed to parse TikTok NEXT_DATA');
        }
      }

      // Fallback to Open Graph data
      const metadata: VideoMetadata = {
        title: titleMatch ? this.decodeHtmlEntities(titleMatch[1]) : 'TikTok Video',
        description: descriptionMatch ? this.decodeHtmlEntities(descriptionMatch[1]) : undefined,
        duration: 0,
        width: 576,
        height: 1024,
        format: 'mp4',
        thumbnailUrl: imageMatch ? imageMatch[1] : undefined,
        platform: this.platformName,
        originalUrl: url
      };

      return metadata;
    } catch (error) {
      throw new Error(`Failed to scrape metadata: ${(error as Error).message}`);
    }
  }

  /**
   * Download video from TikTok
   */
  public async download(url: string, options: DownloadOptions): Promise<DownloadResult> {
    this.isDownloadCancelled = false;
    
    try {
      // Resolve short URLs first
      const fullUrl = await this.resolveShortUrl(url);
      const videoId = this.extractVideoId(fullUrl);
      
      logger.info({ url: fullUrl, videoId, outputPath: options.outputPath }, 'Starting TikTok download');

      // Ensure output directory exists
      await fs.ensureDir(path.dirname(options.outputPath));

      // TikTok has aggressive anti-bot measures, so yt-dlp is usually the best option
      try {
        return await this.downloadWithYtdlp(fullUrl, options);
      } catch (ytdlpError) {
        logger.warn({ error: ytdlpError }, 'yt-dlp download failed, trying direct download');
        
        // Fallback to direct download
        return await this.downloadDirect(fullUrl, options);
      }
    } catch (error) {
      const downloadError = new Error(`TikTok download failed: ${(error as Error).message}`);
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
    
    logger.info({ command }, 'Downloading TikTok video with yt-dlp');

    // Execute download with progress tracking
    const process = exec(command);
    let lastProgress = 0;

    process.stdout?.on('data', (data) => {
      const output = data.toString();
      
      // Parse progress
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
    });

    process.stderr?.on('data', (data) => {
      const error = data.toString();
      if (error && !error.includes('WARNING')) {
        logger.warn({ error }, 'yt-dlp stderr output');
      }
    });

    return new Promise((resolve, reject) => {
      process.on('exit', async (code) => {
        if (code !== 0) {
          reject(new Error(`yt-dlp exited with code ${code}`));
          return;
        }

        // Verify file exists
        const exists = await fs.pathExists(options.outputPath);
        if (!exists) {
          reject(new Error('Download completed but output file not found'));
          return;
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
        resolve(result);
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Direct download fallback
   */
  private async downloadDirect(url: string, options: DownloadOptions): Promise<DownloadResult> {
    // Extract video URL from page
    const videoUrl = await this.extractVideoUrl(url);
    if (!videoUrl) {
      throw new Error('Could not extract video URL from TikTok page');
    }

    // Fetch metadata
    const metadata = await this.fetchMetadata(url);
    this.emitStart(url, metadata);

    // Download the video
    const headers = {
      ...this.createHeaders(options),
      'Referer': 'https://www.tiktok.com/'
    };

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

          // Get actual video info
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
   * Extract direct video URL from TikTok page
   */
  private async extractVideoUrl(url: string): Promise<string | null> {
    const headers = {
      ...this.createHeaders(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    };
    
    try {
      const got = (await import('got')).default;
      const response = await got(url, {
        headers,
        timeout: { request: 30000 },
        followRedirect: true
      });

      const html = response.body;
      
      // Try to extract video URL from NEXT_DATA
      const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const videoData = nextData.props?.pageProps?.itemInfo?.itemStruct;
          
          if (videoData?.video?.downloadAddr || videoData?.video?.playAddr) {
            // TikTok provides multiple video URLs
            const videoUrl = videoData.video.downloadAddr || videoData.video.playAddr;
            
            // Handle array of URLs
            if (Array.isArray(videoUrl) && videoUrl.length > 0) {
              return videoUrl[0];
            } else if (typeof videoUrl === 'string') {
              return videoUrl;
            }
          }
        } catch (e) {
          logger.warn({ error: e }, 'Failed to parse TikTok NEXT_DATA for video URL');
        }
      }

      // Try other patterns
      const patterns = [
        /"downloadAddr":\s*"([^"]+)"/,
        /"playAddr":\s*"([^"]+)"/,
        /"video":\s*{\s*"urls":\s*\[([^\]]+)\]/
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
      logger.error({ error }, 'Failed to extract video URL from TikTok');
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
        width: videoStream?.width || 576,
        height: videoStream?.height || 1024,
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
        logger.info('TikTok download cancelled');
      } catch (error) {
        logger.error({ error }, 'Failed to cancel TikTok download');
      }
    }
  }

  /**
   * Get quality mapping for TikTok
   */
  protected getQualityMapping(quality: DownloadOptions['quality']): string {
    // TikTok videos don't have multiple quality options in most cases
    const qualityMap: Record<string, string> = {
      'best': 'best[ext=mp4]/best',
      'high': 'best[ext=mp4]/best',
      'medium': 'best[ext=mp4]/best',
      'low': 'worst[ext=mp4]/worst'
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