import { EventEmitter } from 'events';
import { logger } from '../../logger';

export interface DownloadOptions {
  outputPath: string;
  quality?: 'best' | 'high' | 'medium' | 'low';
  format?: 'mp4' | 'webm' | 'original';
  maxDuration?: number; // Maximum duration in seconds
  userAgent?: string;
  cookies?: string;
  headers?: Record<string, string>;
  timeout?: number; // Download timeout in milliseconds
  maxRetries?: number;
}

export interface VideoMetadata {
  title?: string;
  description?: string;
  duration: number;
  width: number;
  height: number;
  fps?: number;
  fileSize?: number;
  format: string;
  thumbnailUrl?: string;
  author?: string;
  uploadDate?: Date;
  viewCount?: number;
  platform: string;
  originalUrl: string;
}

export interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
  speed?: number; // bytes per second
  eta?: number; // seconds
}

export interface DownloadResult {
  success: boolean;
  outputPath?: string;
  metadata?: VideoMetadata;
  error?: Error;
}

export abstract class BaseDownloader extends EventEmitter {
  protected abstract platformName: string;
  protected abstract urlPattern: RegExp;
  
  constructor() {
    super();
  }

  /**
   * Validate if URL is supported by this downloader
   */
  public validateUrl(url: string): boolean {
    try {
      const normalizedUrl = this.normalizeUrl(url);
      return this.urlPattern.test(normalizedUrl);
    } catch (error) {
      logger.error({ error, url }, `Failed to validate URL for ${this.platformName}`);
      return false;
    }
  }

  /**
   * Extract video ID from URL
   */
  protected abstract extractVideoId(url: string): string | null;

  /**
   * Fetch video metadata without downloading
   */
  public abstract fetchMetadata(url: string): Promise<VideoMetadata>;

  /**
   * Download video from URL
   */
  public abstract download(url: string, options: DownloadOptions): Promise<DownloadResult>;

  /**
   * Cancel ongoing download
   */
  public abstract cancelDownload(): void;

  /**
   * Normalize URL for consistent processing
   */
  protected normalizeUrl(url: string): string {
    // Remove trailing slashes and query parameters if needed
    let normalized = url.trim();
    
    // Ensure HTTPS
    if (normalized.startsWith('http://')) {
      normalized = normalized.replace('http://', 'https://');
    }
    
    // Add protocol if missing
    if (!normalized.startsWith('http')) {
      normalized = `https://${normalized}`;
    }
    
    return normalized;
  }

  /**
   * Emit download progress event
   */
  protected emitProgress(progress: DownloadProgress): void {
    this.emit('progress', progress);
  }

  /**
   * Emit download started event
   */
  protected emitStart(url: string, metadata?: VideoMetadata): void {
    this.emit('start', { url, metadata });
  }

  /**
   * Emit download completed event
   */
  protected emitComplete(result: DownloadResult): void {
    this.emit('complete', result);
  }

  /**
   * Emit download error event
   */
  protected emitError(error: Error): void {
    this.emit('error', error);
  }

  /**
   * Build user agent string
   */
  protected getUserAgent(custom?: string): string {
    return custom || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  }

  /**
   * Parse duration string to seconds
   */
  protected parseDuration(duration: string): number {
    // Handle various duration formats (e.g., "1:23:45", "23:45", "PT1H23M45S")
    if (duration.startsWith('PT')) {
      // ISO 8601 duration format
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (match) {
        const hours = parseInt(match[1] || '0');
        const minutes = parseInt(match[2] || '0');
        const seconds = parseInt(match[3] || '0');
        return hours * 3600 + minutes * 60 + seconds;
      }
    } else {
      // HH:MM:SS or MM:SS format
      const parts = duration.split(':').map(p => parseInt(p));
      // Check if all parts are valid numbers
      if (parts.some(p => isNaN(p))) {
        return 0;
      }
      if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      } else if (parts.length === 1) {
        return parts[0];
      }
    }
    
    return 0;
  }

  /**
   * Format file size for logging
   */
  protected formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Create platform-specific headers
   */
  protected createHeaders(options?: DownloadOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': this.getUserAgent(options?.userAgent),
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      ...options?.headers
    };

    if (options?.cookies) {
      headers['Cookie'] = options.cookies;
    }

    return headers;
  }

  /**
   * Get quality mapping for the platform
   */
  protected abstract getQualityMapping(quality: DownloadOptions['quality']): string;
}