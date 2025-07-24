import { EventEmitter } from 'events';
import { BaseDownloader, DownloadOptions, VideoMetadata, DownloadResult } from './BaseDownloader';
import { YouTubeDownloader } from './YouTubeDownloader';
import { FacebookDownloader } from './FacebookDownloader';
import { InstagramDownloader } from './InstagramDownloader';
import { TikTokDownloader } from './TikTokDownloader';
import { GenericDownloader } from './GenericDownloader';
import { logger } from '../../logger';

export interface DownloaderConfig {
  defaultQuality?: DownloadOptions['quality'];
  defaultFormat?: DownloadOptions['format'];
  maxDuration?: number;
  timeout?: number;
  maxRetries?: number;
  userAgent?: string;
}

export class DownloaderManager extends EventEmitter {
  private downloaders!: Map<string, BaseDownloader>;
  private activeDownloader: BaseDownloader | null = null;
  private config: DownloaderConfig;

  constructor(config?: DownloaderConfig) {
    super();
    this.config = config || {};
    this.initializeDownloaders();
  }

  /**
   * Initialize all platform downloaders
   */
  private initializeDownloaders(): void {
    this.downloaders = new Map<string, BaseDownloader>([
      ['youtube', new YouTubeDownloader()],
      ['facebook', new FacebookDownloader()],
      ['instagram', new InstagramDownloader()],
      ['tiktok', new TikTokDownloader()],
      ['generic', new GenericDownloader()]
    ]);

    // Set up event forwarding for each downloader
    this.downloaders.forEach((downloader, platform) => {
      downloader.on('start', (data) => this.emit('start', { ...data, platform }));
      downloader.on('progress', (data) => this.emit('progress', { ...data, platform }));
      downloader.on('complete', (data) => this.emit('complete', { ...data, platform }));
      downloader.on('error', (error) => this.emit('error', { error, platform }));
    });
  }

  /**
   * Detect platform from URL
   */
  public detectPlatform(url: string): string | null {
    for (const [platform, downloader] of this.downloaders) {
      if (downloader.validateUrl(url)) {
        logger.info({ url, platform }, 'Detected platform for URL');
        return platform;
      }
    }

    logger.warn({ url }, 'No specific platform detected, will use generic downloader');
    return 'generic';
  }

  /**
   * Get downloader for a specific platform
   */
  public getDownloader(platform: string): BaseDownloader | null {
    return this.downloaders.get(platform.toLowerCase()) || null;
  }

  /**
   * Fetch video metadata without downloading
   */
  public async fetchMetadata(url: string): Promise<VideoMetadata> {
    const platform = this.detectPlatform(url);
    if (!platform) {
      throw new Error('Unsupported URL');
    }

    const downloader = this.getDownloader(platform);
    if (!downloader) {
      throw new Error(`No downloader available for platform: ${platform}`);
    }

    try {
      logger.info({ url, platform }, 'Fetching video metadata');
      const metadata = await downloader.fetchMetadata(url);
      return { ...metadata, platform };
    } catch (error) {
      logger.error({ error, url, platform }, 'Failed to fetch metadata');
      throw new Error(`Failed to fetch metadata from ${platform}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Download video from URL
   */
  public async download(url: string, outputPath: string, options?: Partial<DownloadOptions>): Promise<DownloadResult> {
    const platform = this.detectPlatform(url);
    if (!platform) {
      throw new Error('Unsupported URL');
    }

    const downloader = this.getDownloader(platform);
    if (!downloader) {
      throw new Error(`No downloader available for platform: ${platform}`);
    }

    // Merge options with defaults
    const downloadOptions: DownloadOptions = {
      outputPath,
      quality: options?.quality || this.config.defaultQuality || 'best',
      format: options?.format || this.config.defaultFormat || 'mp4',
      maxDuration: options?.maxDuration || this.config.maxDuration,
      timeout: options?.timeout || this.config.timeout,
      maxRetries: options?.maxRetries || this.config.maxRetries || 3,
      userAgent: options?.userAgent || this.config.userAgent,
      cookies: options?.cookies,
      headers: options?.headers
    };

    try {
      logger.info({ url, platform, outputPath }, 'Starting video download');
      this.activeDownloader = downloader;
      
      const result = await downloader.download(url, downloadOptions);
      
      if (result.success && result.metadata) {
        result.metadata.platform = platform;
      }
      
      this.activeDownloader = null;
      return result;
    } catch (error) {
      this.activeDownloader = null;
      logger.error({ error, url, platform }, 'Failed to download video');
      throw new Error(`Failed to download from ${platform}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Cancel active download
   */
  public cancelDownload(): void {
    if (this.activeDownloader) {
      logger.info('Cancelling active download');
      this.activeDownloader.cancelDownload();
      this.activeDownloader = null;
    }
  }

  /**
   * Get supported platforms
   */
  public getSupportedPlatforms(): string[] {
    return Array.from(this.downloaders.keys());
  }

  /**
   * Check if URL is supported
   */
  public isUrlSupported(url: string): boolean {
    return this.detectPlatform(url) !== null;
  }

  /**
   * Get platform-specific features
   */
  public getPlatformFeatures(platform: string): {
    supportsQuality: boolean;
    supportsMetadata: boolean;
    requiresCookies: boolean;
    supportedFormats: string[];
  } {
    const features = {
      youtube: {
        supportsQuality: true,
        supportsMetadata: true,
        requiresCookies: false,
        supportedFormats: ['mp4', 'webm']
      },
      facebook: {
        supportsQuality: true,
        supportsMetadata: true,
        requiresCookies: false,
        supportedFormats: ['mp4']
      },
      instagram: {
        supportsQuality: false,
        supportsMetadata: true,
        requiresCookies: true,
        supportedFormats: ['mp4']
      },
      tiktok: {
        supportsQuality: false,
        supportsMetadata: true,
        requiresCookies: false,
        supportedFormats: ['mp4']
      },
      generic: {
        supportsQuality: false,
        supportsMetadata: true,
        requiresCookies: false,
        supportedFormats: ['mp4', 'webm', 'mov', 'avi', 'mkv']
      }
    };

    return features[platform.toLowerCase() as keyof typeof features] || features.generic;
  }

  /**
   * Batch download videos
   */
  public async batchDownload(
    urls: string[], 
    outputDir: string, 
    options?: Partial<DownloadOptions>
  ): Promise<DownloadResult[]> {
    const results: DownloadResult[] = [];
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const platform = this.detectPlatform(url);
      const filename = `video_${i + 1}_${Date.now()}.mp4`;
      const outputPath = `${outputDir}/${filename}`;
      
      try {
        logger.info({ url, index: i + 1, total: urls.length }, 'Processing batch download');
        
        const result = await this.download(url, outputPath, options);
        results.push(result);
        
        this.emit('batch:progress', {
          current: i + 1,
          total: urls.length,
          url,
          platform,
          result
        });
      } catch (error) {
        logger.error({ error, url }, 'Failed in batch download');
        
        results.push({
          success: false,
          error: error as Error
        });
        
        this.emit('batch:error', {
          current: i + 1,
          total: urls.length,
          url,
          platform,
          error
        });
      }
    }
    
    this.emit('batch:complete', { results });
    return results;
  }

  /**
   * Estimate download size
   */
  public async estimateDownloadSize(url: string): Promise<number | null> {
    try {
      const metadata = await this.fetchMetadata(url);
      return metadata.fileSize || null;
    } catch (error) {
      logger.warn({ error, url }, 'Failed to estimate download size');
      return null;
    }
  }

  /**
   * Validate URLs before download
   */
  public validateUrls(urls: string[]): { valid: string[], invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];
    
    for (const url of urls) {
      if (this.isUrlSupported(url)) {
        valid.push(url);
      } else {
        invalid.push(url);
      }
    }
    
    return { valid, invalid };
  }
}