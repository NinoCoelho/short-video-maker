import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../logger';

interface CacheEntry {
  url: string;
  filePath: string;
  timestamp: number;
  size: number;
  hash: string;
  projectId?: string;
}

interface CacheStats {
  entries: number;
  size: number;
  oldestEntry?: number;
  newestEntry?: number;
}

export class ImageCacheService {
  private cacheDir: string;
  private indexFile: string;
  private cache: Map<string, CacheEntry> = new Map();
  private maxCacheSize: number = 500 * 1024 * 1024; // 500MB
  private maxEntries: number = 1000;
  private maxAge: number = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor(dataDirPath: string) {
    this.cacheDir = path.join(dataDirPath, 'image-cache');
    this.indexFile = path.join(this.cacheDir, 'index.json');
    this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    try {
      await fs.ensureDir(this.cacheDir);
      await this.loadIndex();
      await this.cleanupExpiredEntries();
    } catch (error) {
      logger.error({ error }, 'Failed to initialize image cache');
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      if (await fs.pathExists(this.indexFile)) {
        const data = await fs.readJson(this.indexFile);
        this.cache = new Map(Object.entries(data));
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load cache index');
      this.cache = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      const data = Object.fromEntries(this.cache);
      await fs.writeJson(this.indexFile, data, { spaces: 2 });
    } catch (error) {
      logger.error({ error }, 'Failed to save cache index');
    }
  }

  private generateCacheKey(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  private async cleanupExpiredEntries(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      await this.removeEntry(key);
    }

    await this.enforceStorageLimits();
  }

  private async enforceStorageLimits(): Promise<void> {
    const stats = this.getStats();
    
    if (stats.size > this.maxCacheSize || stats.entries > this.maxEntries) {
      const sortedEntries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);

      const entriesToRemove = Math.max(
        stats.entries - this.maxEntries,
        Math.ceil(sortedEntries.length * 0.1)
      );

      for (let i = 0; i < entriesToRemove && i < sortedEntries.length; i++) {
        await this.removeEntry(sortedEntries[i][0]);
      }
    }
  }

  private async removeEntry(key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (entry) {
      try {
        await fs.remove(entry.filePath);
      } catch (error) {
        logger.warn({ error, filePath: entry.filePath }, 'Failed to remove cached file');
      }
      this.cache.delete(key);
    }
  }

  public async getCachedImage(url: string): Promise<string | null> {
    const key = this.generateCacheKey(url);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if file still exists
    if (!(await fs.pathExists(entry.filePath))) {
      this.cache.delete(key);
      await this.saveIndex();
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      await this.removeEntry(key);
      await this.saveIndex();
      return null;
    }

    // Update timestamp for LRU
    entry.timestamp = Date.now();
    await this.saveIndex();

    return entry.filePath;
  }

  public async cacheImage(url: string, imageBuffer: Buffer, projectId?: string): Promise<string> {
    const key = this.generateCacheKey(url);
    const extension = path.extname(url) || '.jpg';
    const fileName = `${key}${extension}`;
    const filePath = path.join(this.cacheDir, fileName);

    try {
      await fs.writeFile(filePath, imageBuffer);
      
      const entry: CacheEntry = {
        url,
        filePath,
        timestamp: Date.now(),
        size: imageBuffer.length,
        hash: crypto.createHash('md5').update(imageBuffer).digest('hex'),
        projectId
      };

      this.cache.set(key, entry);
      await this.saveIndex();
      
      // Cleanup if necessary
      await this.enforceStorageLimits();
      
      logger.info({ url, filePath, size: imageBuffer.length }, 'Image cached successfully');
      return filePath;
    } catch (error) {
      logger.error({ error, url, filePath }, 'Failed to cache image');
      throw error;
    }
  }

  public async clearCache(): Promise<void> {
    try {
      await fs.emptyDir(this.cacheDir);
      this.cache.clear();
      await this.saveIndex();
      logger.info('Image cache cleared successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to clear image cache');
      throw error;
    }
  }

  public getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const timestamps = entries.map(entry => entry.timestamp);

    return {
      entries: entries.length,
      size: totalSize,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : undefined
    };
  }

  public async getCacheByProject(projectId: string): Promise<CacheEntry[]> {
    return Array.from(this.cache.values())
      .filter(entry => entry.projectId === projectId);
  }

  public async removeCacheByProject(projectId: string): Promise<void> {
    const keysToRemove: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.projectId === projectId) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      await this.removeEntry(key);
    }

    await this.saveIndex();
  }

  public async getImageFromCache(url: string): Promise<Buffer | null> {
    const filePath = await this.getCachedImage(url);
    if (!filePath) {
      return null;
    }

    try {
      return await fs.readFile(filePath);
    } catch (error) {
      logger.warn({ error, url, filePath }, 'Failed to read cached image');
      return null;
    }
  }
}