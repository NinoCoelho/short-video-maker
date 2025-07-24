import path from 'path';
import fs from 'fs-extra';
import { BaseDownloader, DownloadOptions, VideoMetadata, DownloadResult, DownloadProgress } from './BaseDownloader';
import { logger } from '../../logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class InstagramDownloader extends BaseDownloader {
  protected platformName = 'Instagram';
  protected urlPattern = /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/(p|reel|tv|stories)\/[\w\-]+/i;
  
  private currentDownloadStream: any = null;
  private isDownloadCancelled = false;

  /**
   * Extract post ID from Instagram URL
   */
  protected extractVideoId(url: string): string | null {
    const patterns = [
      /\/(p|reel|tv)\/([A-Za-z0-9_\-]+)/,
      /\/stories\/[\w\-]+\/(\d+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[2] || match[1];
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
      logger.info({ url, videoId }, 'Fetching Instagram video metadata');

      // Try using yt-dlp first as it handles Instagram well with proper cookies
      try {
        const cookiesArg = this.getInstagramCookies() ? `--cookies "${this.getInstagramCookies()}"` : '';
        const { stdout } = await execAsync(`yt-dlp --dump-json --no-warnings ${cookiesArg} "${url}"`);
        const info = JSON.parse(stdout);

        const metadata: VideoMetadata = {
          title: info.title || info.description?.substring(0, 50) || 'Instagram Video',
          description: info.description,
          duration: info.duration || 0,
          width: info.width || 1080,
          height: info.height || 1920,
          fps: info.fps,
          fileSize: info.filesize || info.filesize_approx,
          format: info.ext || 'mp4',
          thumbnailUrl: info.thumbnail,
          author: info.uploader || info.channel || info.creator,
          uploadDate: info.timestamp ? new Date(info.timestamp * 1000) : undefined,
          viewCount: info.view_count,
          platform: this.platformName,
          originalUrl: url
        };

        logger.info({ videoId, title: metadata.title }, 'Successfully fetched Instagram metadata via yt-dlp');
        return metadata;
      } catch (ytdlpError) {
        logger.warn({ error: ytdlpError }, 'Failed to fetch metadata via yt-dlp, falling back to API method');
        
        // Fallback: use Instagram's public API
        return await this.fetchMetadataFromApi(url);
      }
    } catch (error) {
      logger.error({ error, url }, 'Failed to fetch Instagram metadata');
      throw new Error(`Failed to fetch metadata: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch metadata using Instagram's public API
   */
  private async fetchMetadataFromApi(url: string): Promise<VideoMetadata> {
    try {
      // Add ?__a=1&__d=dis to get JSON response
      const apiUrl = url.includes('?') ? `${url}&__a=1&__d=dis` : `${url}?__a=1&__d=dis`;
      
      const headers = {
        ...this.createHeaders(),
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-IG-App-ID': '936619743392459', // Instagram web app ID
        'X-ASBD-ID': '198387',
        'X-IG-WWW-Claim': '0'
      };

      const got = (await import('got')).default;
      const response = await got(apiUrl, {
        headers,
        timeout: { request: 30000 },
        followRedirect: true
      });

      const data = JSON.parse(response.body);
      const media = data.items?.[0] || data.graphql?.shortcode_media;

      if (!media) {
        throw new Error('Could not find media data in API response');
      }

      const isVideo = media.is_video || media.media_type === 2;
      if (!isVideo) {
        throw new Error('URL does not point to a video');
      }

      const metadata: VideoMetadata = {
        title: media.caption?.text?.substring(0, 50) || 'Instagram Video',
        description: media.caption?.text,
        duration: media.video_duration || media.duration || 0,
        width: media.original_width || media.dimensions?.width || 1080,
        height: media.original_height || media.dimensions?.height || 1920,
        format: 'mp4',
        thumbnailUrl: media.thumbnail_url || media.display_url || media.image_versions2?.candidates?.[0]?.url,
        author: media.user?.username || media.owner?.username,
        uploadDate: media.taken_at ? new Date(media.taken_at * 1000) : undefined,
        viewCount: media.view_count || media.video_view_count,
        platform: this.platformName,
        originalUrl: url
      };

      return metadata;
    } catch (error) {
      // If API method fails, try scraping
      return await this.scrapeMetadata(url);
    }
  }

  /**
   * Scrape metadata from Instagram page
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
      
      // Extract metadata from various sources
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      const descriptionMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
      const videoMatch = html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i);
      const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
      
      // Try to extract JSON data
      const jsonMatch = html.match(/<script[^>]*>window\._sharedData\s*=\s*({.+?});<\/script>/);
      
      if (jsonMatch) {
        try {
          const sharedData = JSON.parse(jsonMatch[1]);
          const media = sharedData.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
          
          if (media && media.is_video) {
            return {
              title: media.edge_media_to_caption?.edges?.[0]?.node?.text?.substring(0, 50) || 'Instagram Video',
              description: media.edge_media_to_caption?.edges?.[0]?.node?.text,
              duration: media.video_duration || 0,
              width: media.dimensions?.width || 1080,
              height: media.dimensions?.height || 1920,
              format: 'mp4',
              thumbnailUrl: media.thumbnail_src || media.display_url,
              author: media.owner?.username,
              uploadDate: media.taken_at_timestamp ? new Date(media.taken_at_timestamp * 1000) : undefined,
              viewCount: media.video_view_count,
              platform: this.platformName,
              originalUrl: url
            };
          }
        } catch (e) {
          logger.warn({ error: e }, 'Failed to parse Instagram shared data');
        }
      }

      // Fallback to Open Graph data
      const metadata: VideoMetadata = {
        title: titleMatch ? this.decodeHtmlEntities(titleMatch[1]) : 'Instagram Video',
        description: descriptionMatch ? this.decodeHtmlEntities(descriptionMatch[1]) : undefined,
        duration: 0,
        width: 1080,
        height: 1920,
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
   * Download video from Instagram
   */
  public async download(url: string, options: DownloadOptions): Promise<DownloadResult> {
    this.isDownloadCancelled = false;
    
    try {
      const videoId = this.extractVideoId(url);
      logger.info({ url, videoId, outputPath: options.outputPath }, 'Starting Instagram download');

      // Ensure output directory exists
      await fs.ensureDir(path.dirname(options.outputPath));

      // Instagram often requires authentication, so try yt-dlp first
      try {
        return await this.downloadWithYtdlp(url, options);
      } catch (ytdlpError) {
        logger.warn({ error: ytdlpError }, 'yt-dlp download failed, trying direct download');
        
        // Fallback to direct download
        return await this.downloadDirect(url, options);
      }
    } catch (error) {
      const downloadError = new Error(`Instagram download failed: ${(error as Error).message}`);
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
    const cookiesArg = options.cookies || this.getInstagramCookies() ? `--cookies "${options.cookies || this.getInstagramCookies()}"` : '';
    const command = `yt-dlp -f "${quality}" -o "${options.outputPath}" --no-warnings --retries ${options.maxRetries || 3} ${cookiesArg} "${url}"`;
    
    logger.info({ command: command.replace(/--cookies "[^"]+"/g, '--cookies "***"') }, 'Downloading Instagram video with yt-dlp');

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
   * Direct download fallback
   */
  private async downloadDirect(url: string, options: DownloadOptions): Promise<DownloadResult> {
    // Get video URL from page
    const videoUrl = await this.extractVideoUrl(url);
    if (!videoUrl) {
      throw new Error('Could not extract video URL from Instagram page');
    }

    // Fetch metadata
    const metadata = await this.fetchMetadata(url);
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
   * Extract direct video URL from Instagram page
   */
  private async extractVideoUrl(url: string): Promise<string | null> {
    const headers = this.createHeaders();
    
    try {
      const got = (await import('got')).default;
      const response = await got(url, {
        headers,
        timeout: { request: 30000 },
        followRedirect: true
      });

      const html = response.body;
      
      // Try to find video URL in various places
      const patterns = [
        /<meta\s+property="og:video"\s+content="([^"]+)"/i,
        /<meta\s+property="og:video:secure_url"\s+content="([^"]+)"/i,
        /"video_url":\s*"([^"]+)"/,
        /"contentUrl":\s*"([^"]+)"/
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

      // Try to extract from JSON data
      const jsonMatch = html.match(/<script[^>]*>window\._sharedData\s*=\s*({.+?});<\/script>/);
      if (jsonMatch) {
        try {
          const sharedData = JSON.parse(jsonMatch[1]);
          const media = sharedData.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
          
          if (media?.video_url) {
            return media.video_url;
          }
        } catch (e) {
          logger.warn({ error: e }, 'Failed to parse Instagram shared data for video URL');
        }
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Failed to extract video URL from Instagram');
      return null;
    }
  }

  /**
   * Get Instagram cookies path (if configured)
   */
  private getInstagramCookies(): string | null {
    // Check for Instagram cookies in common locations
    const possiblePaths = [
      path.join(process.env.HOME || '', '.instagram-cookies.txt'),
      path.join(process.cwd(), 'instagram-cookies.txt'),
      process.env.INSTAGRAM_COOKIES_PATH
    ];

    for (const cookiePath of possiblePaths) {
      if (cookiePath && fs.existsSync(cookiePath)) {
        return cookiePath;
      }
    }

    return null;
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
        width: videoStream?.width || 1080,
        height: videoStream?.height || 1920,
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
        logger.info('Instagram download cancelled');
      } catch (error) {
        logger.error({ error }, 'Failed to cancel Instagram download');
      }
    }
  }

  /**
   * Get quality mapping for Instagram
   */
  protected getQualityMapping(quality: DownloadOptions['quality']): string {
    // Instagram videos are usually already optimized, so we just select the best available
    const qualityMap: Record<string, string> = {
      'best': 'best[ext=mp4]/best',
      'high': 'best[ext=mp4]/best',
      'medium': 'worst[ext=mp4]/worst',
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