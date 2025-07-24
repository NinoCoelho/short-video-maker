import fs from "fs-extra";
import path from "path";
import http from "http";
import https from "https";
import { URL } from "url";
import { logger } from "../../logger";
import { Config } from "../../config";
import crypto from "crypto";

export interface CachedVideo {
  originalUrl: string;
  localPath: string;
  proxyUrl: string;
  filename: string;
  size: number;
  downloadedAt: Date;
}

export class VideoCacheManager {
  private cacheDir: string;
  private downloadPromises: Map<string, Promise<CachedVideo>> = new Map();
  private cachedVideos: Map<string, CachedVideo> = new Map();

  constructor(private config: Config) {
    this.cacheDir = path.join(config.dataDirPath, "video-cache");
    fs.ensureDirSync(this.cacheDir);
    this.loadExistingCache();
  }

  private loadExistingCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const metadataPath = path.join(this.cacheDir, file);
          const metadata = fs.readJsonSync(metadataPath);
          const videoPath = path.join(this.cacheDir, metadata.filename);
          
          if (fs.existsSync(videoPath)) {
            this.cachedVideos.set(metadata.originalUrl, {
              ...metadata,
              localPath: videoPath,
              downloadedAt: new Date(metadata.downloadedAt)
            });
          }
        }
      }
      logger.info({ count: this.cachedVideos.size }, "Loaded existing video cache");
    } catch (error) {
      logger.warn({ error }, "Failed to load existing cache");
    }
  }

  private generateCacheKey(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  private getLocalFilename(url: string): string {
    const cacheKey = this.generateCacheKey(url);
    const parsedUrl = new URL(url);
    const ext = path.extname(parsedUrl.pathname) || '.mp4';
    return `${cacheKey}${ext}`;
  }

  private async downloadVideo(url: string): Promise<CachedVideo> {
    const filename = this.getLocalFilename(url);
    const localPath = path.join(this.cacheDir, filename);
    const metadataPath = path.join(this.cacheDir, `${filename}.json`);

    logger.info({ url, filename }, "Starting video download");

    return new Promise((resolve, reject) => {
      let file: fs.WriteStream | null = null;
      
      try {
        file = fs.createWriteStream(localPath);
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          timeout: 300000, // 5 minutos para download
          headers: {
            'Accept': 'video/*',
            'User-Agent': 'Mozilla/5.0 (compatible; VideoCacheManager/1.0)',
            'Connection': 'close'
          }
        };

        logger.debug({ url, options: { hostname: options.hostname, port: options.port, path: options.path } }, "Making download request");

        const req = client.get(options, (response) => {
          logger.debug({ url, statusCode: response.statusCode, headers: response.headers }, "Received response");
          
          if (response.statusCode !== 200) {
            const errorMsg = `HTTP ${response.statusCode}: ${response.statusMessage || 'Unknown error'}`;
            logger.error({ url, statusCode: response.statusCode, statusMessage: response.statusMessage }, "HTTP error during download");
            
            if (file) {
              file.destroy();
              file = null;
            }
            fs.unlink(localPath, () => {});
            reject(new Error(errorMsg));
            return;
          }

          let downloadedBytes = 0;
          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          logger.debug({ url, totalBytes }, "Starting download stream");

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              const progress = Math.round((downloadedBytes / totalBytes) * 100);
              if (progress % 25 === 0) { // Log every 25%
                logger.debug({ url, progress, downloadedBytes, totalBytes }, `Download progress: ${progress}%`);
              }
            }
          });

          response.on('error', (err) => {
            logger.error({ url, error: err.message, stack: err.stack }, "Response stream error");
            if (file) {
              file.destroy();
              file = null;
            }
            fs.unlink(localPath, () => {});
            reject(new Error(`Response stream error: ${err.message}`));
          });

          if (file) {
            response.pipe(file);
            
            file.on('finish', () => {
              if (file) {
                file.close();
                file = null;
              }
              
              try {
                const stats = fs.statSync(localPath);
                if (stats.size === 0) {
                  fs.unlink(localPath, () => {});
                  reject(new Error('Downloaded file is empty'));
                  return;
                }

                const cachedVideo: CachedVideo = {
                  originalUrl: url,
                  localPath,
                  proxyUrl: `/api/cached-video/${filename}`,
                  filename,
                  size: stats.size,
                  downloadedAt: new Date()
                };

                // Save metadata
                fs.writeJsonSync(metadataPath, {
                  originalUrl: url,
                  filename,
                  size: stats.size,
                  downloadedAt: cachedVideo.downloadedAt.toISOString()
                });

                this.cachedVideos.set(url, cachedVideo);
                logger.info({ 
                  url, 
                  filename, 
                  size: stats.size,
                  sizeFormatted: `${Math.round(stats.size / 1024 / 1024)}MB`
                }, "Video downloaded and cached successfully");
                
                resolve(cachedVideo);
              } catch (statsError) {
                logger.error({ url, error: statsError }, "Error processing downloaded file");
                fs.unlink(localPath, () => {});
                reject(new Error(`Error processing downloaded file: ${statsError instanceof Error ? statsError.message : 'Unknown error'}`));
              }
            });

            file.on('error', (err) => {
              logger.error({ url, error: err.message, stack: err.stack }, "File write error");
              if (file) {
                file.destroy();
                file = null;
              }
              fs.unlink(localPath, () => {});
              reject(new Error(`File write error: ${err.message}`));
            });
          }
        });

        req.on('timeout', () => {
          logger.error({ url }, "Request timeout");
          req.destroy();
          if (file) {
            file.destroy();
            file = null;
          }
          fs.unlink(localPath, () => {});
          reject(new Error('Download timeout: Request took too long to complete'));
        });

        req.on('error', (err) => {
          logger.error({ url, error: err.message, code: (err as any).code, stack: err.stack }, "Request error");
          if (file) {
            file.destroy();
            file = null;
          }
          fs.unlink(localPath, () => {});
          reject(new Error(`Request error: ${err.message} (${(err as any).code || 'unknown code'})`));
        });

        req.setTimeout(300000); // 5 minutos para download
        
      } catch (error) {
        logger.error({ url, error: error instanceof Error ? error.message : 'Unknown error' }, "Error setting up download");
        if (file) {
          file.destroy();
          file = null;
        }
        fs.unlink(localPath, () => {});
        reject(new Error(`Setup error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  public async preloadVideos(videoUrls: string[]): Promise<Map<string, CachedVideo>> {
    const uniqueUrls = [...new Set(videoUrls)];
    const results = new Map<string, CachedVideo>();

    logger.info({ count: uniqueUrls.length }, "Starting parallel video preload");

    // First, filter out URLs that are clearly problematic
    const validUrls = uniqueUrls.filter(url => {
      try {
        const parsedUrl = new URL(url);
        // Check if it's a localhost URL and if the server might be down
        if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
          logger.warn({ url }, "Localhost URL detected - server may not be running");
          // We'll still try it, but expect it to fail
        }
        return true;
      } catch (urlError) {
        logger.error({ url, error: urlError }, "Invalid URL format, skipping");
        return false;
      }
    });

    if (validUrls.length !== uniqueUrls.length) {
      logger.warn({ 
        total: uniqueUrls.length, 
        valid: validUrls.length, 
        skipped: uniqueUrls.length - validUrls.length 
      }, "Some URLs were skipped due to invalid format");
    }

    // Start all downloads in parallel
    const downloadPromises = validUrls.map(async (url) => {
      try {
        // Check if already cached
        const existingCache = this.cachedVideos.get(url);
        if (existingCache) {
          // Verify file still exists
          if (fs.existsSync(existingCache.localPath)) {
            logger.debug({ url }, "Video already cached");
            results.set(url, existingCache);
            return;
          } else {
            // Remove from cache if file doesn't exist
            logger.warn({ url, cachedPath: existingCache.localPath }, "Cached file no longer exists, removing from cache");
            this.cachedVideos.delete(url);
            this.currentCacheSize -= existingCache.size;
          }
        }

        // Check if download is already in progress
        if (this.downloadPromises.has(url)) {
          logger.debug({ url }, "Download already in progress, waiting for completion");
          const cached = await this.downloadPromises.get(url)!;
          results.set(url, cached);
          return;
        }

        // Start new download
        logger.debug({ url }, "Starting new download");
        const downloadPromise = this.downloadVideo(url);
        this.downloadPromises.set(url, downloadPromise);
        
        const cached = await downloadPromise;
        results.set(url, cached);
        
        // Clean up promise
        this.downloadPromises.delete(url);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        // Check if it's a connection error to localhost
        const isLocalhostError = url.includes('localhost') && (
          errorMessage.includes('ECONNREFUSED') || 
          errorMessage.includes('Failed to connect') ||
          errorMessage.includes('Request error')
        );
        
        if (isLocalhostError) {
          logger.warn({ 
            url, 
            error: errorMessage
          }, "Failed to download from localhost - server may not be running. This is expected if using external video sources.");
        } else {
          logger.error({ 
            url, 
            error: errorMessage,
            stack: errorStack,
            errorType: error instanceof Error ? error.constructor.name : typeof error
          }, "Failed to preload video");
        }
        
        this.downloadPromises.delete(url);
        // Don't throw - continue with other downloads
      }
    });

    const settledResults = await Promise.allSettled(downloadPromises);
    
    // Log summary of results
    const successful = results.size;
    const failed = validUrls.length - successful;
    const localhostUrls = validUrls.filter(url => url.includes('localhost')).length;
    
    if (failed > 0) {
      if (localhostUrls > 0 && failed === localhostUrls) {
        logger.info({ 
          requested: uniqueUrls.length, 
          cached: successful,
          failed: failed,
          localhostUrls: localhostUrls
        }, "Video preload completed - localhost URLs failed as expected (server not running)");
      } else {
        logger.warn({ 
          requested: uniqueUrls.length, 
          cached: successful,
          failed: failed
        }, "Video preload completed with some failures");
      }
    } else {
      logger.info({ 
        requested: uniqueUrls.length, 
        cached: successful
      }, "Video preload completed successfully");
    }

    return results;
  }

  public getCachedVideo(url: string): CachedVideo | null {
    return this.cachedVideos.get(url) || null;
  }

  public getProxyUrl(originalUrl: string): string {
    const cached = this.getCachedVideo(originalUrl);
    if (cached) {
      return cached.proxyUrl;
    }
    // Return original URL as fallback
    return originalUrl;
  }

  public getCachedVideoPath(filename: string): string | null {
    const fullPath = path.join(this.cacheDir, filename);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  public async cleanupOldCache(maxAgeHours: number = 24): Promise<void> {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [url, cached] of this.cachedVideos.entries()) {
      if (cached.downloadedAt < cutoffTime) {
        try {
          fs.removeSync(cached.localPath);
          fs.removeSync(`${cached.localPath}.json`);
          this.cachedVideos.delete(url);
          cleanedCount++;
        } catch (error) {
          logger.warn({ url, error }, "Failed to cleanup cached video");
        }
      }
    }

    logger.info({ cleanedCount, maxAgeHours }, "Cleaned up old cached videos");
  }

  public getCacheStats(): { count: number; totalSize: number; totalSizeFormatted: string } {
    let totalSize = 0;
    for (const cached of this.cachedVideos.values()) {
      totalSize += cached.size;
    }

    return {
      count: this.cachedVideos.size,
      totalSize,
      totalSizeFormatted: `${Math.round(totalSize / 1024 / 1024)}MB`
    };
  }
} 