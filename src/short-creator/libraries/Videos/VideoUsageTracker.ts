import fs from 'fs-extra';
import path from 'path';
import { VideoUsageEntry } from './types';
import { logger } from '../../../logger';

export class VideoUsageTracker {
  private historyPath: string;
  private maxHistoryDays: number;
  private preventRepeatsWithinDays: number;
  private cache: Map<string, VideoUsageEntry[]> = new Map();

  constructor(
    historyPath: string = path.join(process.cwd(), 'data', 'video-usage-history.json'),
    maxHistoryDays: number = 30,
    preventRepeatsWithinDays: number = 7
  ) {
    this.historyPath = historyPath;
    this.maxHistoryDays = maxHistoryDays;
    this.preventRepeatsWithinDays = preventRepeatsWithinDays;
    this.loadHistory();
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyPath)) {
        const data = fs.readJsonSync(this.historyPath);
        for (const [key, entries] of Object.entries(data)) {
          this.cache.set(key, entries as VideoUsageEntry[]);
        }
        this.cleanupOldEntries();
      }
    } catch (error) {
      logger.error({ error, path: this.historyPath }, "Failed to load video usage history");
    }
  }

  private saveHistory(): void {
    try {
      const data: Record<string, VideoUsageEntry[]> = {};
      for (const [key, entries] of this.cache.entries()) {
        data[key] = entries;
      }
      fs.ensureDirSync(path.dirname(this.historyPath));
      fs.writeJsonSync(this.historyPath, data, { spaces: 2 });
    } catch (error) {
      logger.error({ error, path: this.historyPath }, "Failed to save video usage history");
    }
  }

  private cleanupOldEntries(): void {
    const cutoffTime = Date.now() - (this.maxHistoryDays * 24 * 60 * 60 * 1000);
    let hasChanges = false;

    for (const [key, entries] of this.cache.entries()) {
      const filteredEntries = entries.filter(entry => entry.timestamp > cutoffTime);
      if (filteredEntries.length !== entries.length) {
        this.cache.set(key, filteredEntries);
        hasChanges = true;
      }
      if (filteredEntries.length === 0) {
        this.cache.delete(key);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.saveHistory();
    }
  }

  trackUsage(videoId: string, provider: string, projectId: string | undefined, searchTerms: string[]): void {
    const entry: VideoUsageEntry = {
      videoId,
      provider,
      timestamp: Date.now(),
      projectId,
      searchTerms,
    };

    const key = projectId || 'global';
    const entries = this.cache.get(key) || [];
    entries.push(entry);
    this.cache.set(key, entries);

    this.saveHistory();
    
    logger.info({ videoId, provider, projectId }, "Tracked video usage");
  }

  getRecentlyUsedIds(projectId?: string, withinDays?: number): Set<string> {
    const daysToCheck = withinDays ?? this.preventRepeatsWithinDays;
    const cutoffTime = Date.now() - (daysToCheck * 24 * 60 * 60 * 1000);
    const usedIds = new Set<string>();

    const checkEntries = (entries: VideoUsageEntry[]) => {
      for (const entry of entries) {
        if (entry.timestamp > cutoffTime) {
          usedIds.add(entry.videoId);
        }
      }
    };

    if (projectId) {
      const projectEntries = this.cache.get(projectId) || [];
      checkEntries(projectEntries);
    }

    const globalEntries = this.cache.get('global') || [];
    checkEntries(globalEntries);

    return usedIds;
  }

  isVideoRecentlyUsed(videoId: string, projectId?: string, withinDays?: number): boolean {
    const recentIds = this.getRecentlyUsedIds(projectId, withinDays);
    return recentIds.has(videoId);
  }

  getUsageStats(projectId?: string): {
    totalVideos: number;
    uniqueVideos: number;
    providerBreakdown: Record<string, number>;
    recentUsage: number;
  } {
    const entries: VideoUsageEntry[] = [];
    
    if (projectId) {
      entries.push(...(this.cache.get(projectId) || []));
    } else {
      for (const projectEntries of this.cache.values()) {
        entries.push(...projectEntries);
      }
    }

    const uniqueVideos = new Set(entries.map(e => e.videoId));
    const providerBreakdown: Record<string, number> = {};
    const recentCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let recentUsage = 0;

    for (const entry of entries) {
      providerBreakdown[entry.provider] = (providerBreakdown[entry.provider] || 0) + 1;
      if (entry.timestamp > recentCutoff) {
        recentUsage++;
      }
    }

    return {
      totalVideos: entries.length,
      uniqueVideos: uniqueVideos.size,
      providerBreakdown,
      recentUsage,
    };
  }

  clearHistory(projectId?: string): void {
    if (projectId) {
      this.cache.delete(projectId);
    } else {
      this.cache.clear();
    }
    this.saveHistory();
    
    logger.info({ projectId }, "Cleared video usage history");
  }

  getHistory(projectId?: string, limit: number = 100): VideoUsageEntry[] {
    const entries: VideoUsageEntry[] = [];
    
    if (projectId) {
      entries.push(...(this.cache.get(projectId) || []));
    } else {
      for (const projectEntries of this.cache.values()) {
        entries.push(...projectEntries);
      }
    }

    return entries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}