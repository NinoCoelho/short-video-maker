import { OrientationEnum, Video } from "../../types/shorts";
import { VideoSearchError, VideoProvider } from "./VideoProvider";
import { logger } from "../../logger";
import { Config } from "../../config";

import { PexelsProvider } from "./Videos/providers/PexelsProvider";
import { PixabayProvider } from "./Videos/providers/PixabayProvider";
import { CoverrProvider } from "./Videos/providers/CoverrProvider";
import { FreepikProvider } from "./Videos/providers/FreepikProvider";
import { VideoProviderBase } from "./Videos/providers/VideoProviderBase";

import { VideoUsageTracker } from "./Videos/VideoUsageTracker";
import { VideoKeywordFilter } from "./Videos/VideoKeywordFilter";
import { VideoRateLimiter } from "./Videos/VideoRateLimiter";
import { ImageCacheService } from "../../services/ImageCacheService";
import { SearchFallbackStrategy } from "./Videos/SearchFallbackStrategy";
import { VideoProviderManager } from "./Videos/VideoProviderManager";

import { 
  ProvidersConfig, 
  VideoSearchContext, 
  VideoProviderResponse,
  ProviderHealth 
} from "./Videos/types";

import fs from 'fs-extra';
import path from 'path';

export class VideoProviderFacade implements VideoProvider {
  private providers: Map<string, VideoProviderBase> = new Map();
  private config: ProvidersConfig;
  private usageTracker: VideoUsageTracker;
  private keywordFilter: VideoKeywordFilter;
  private rateLimiter: VideoRateLimiter;
  private imageCacheService: ImageCacheService;
  private searchFallback: SearchFallbackStrategy;
  private providerManager: VideoProviderManager;
  private providerHealth: Map<string, ProviderHealth> = new Map();

  constructor(private globalConfig: Config, private port: number = 3123) {
    this.config = this.loadConfig();
    this.initializeProviders();
    this.usageTracker = new VideoUsageTracker(
      path.join(this.globalConfig.dataDirPath, 'video-usage-history.json'),
      this.config.usageTracking.maxHistoryDays,
      this.config.usageTracking.preventRepeatsWithinDays
    );
    this.keywordFilter = new VideoKeywordFilter(this.config.negativeKeywords);
    this.rateLimiter = new VideoRateLimiter();
    this.imageCacheService = new ImageCacheService(this.globalConfig.dataDirPath);
    this.searchFallback = new SearchFallbackStrategy();
    this.providerManager = new VideoProviderManager(this.providers);
    this.initializeRateLimiter();
  }

  private loadConfig(): ProvidersConfig {
    const configPath = path.join(__dirname, 'Videos', 'config.json');
    try {
      return fs.readJsonSync(configPath);
    } catch (error) {
      logger.error({ error }, "Failed to load video providers config, using defaults");
      return this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): ProvidersConfig {
    return {
      providers: {
        pexels: { enabled: true, weight: 0.5, rateLimit: { requests: 200, window: 'hour' } },
        pixabay: { enabled: true, weight: 0.5, rateLimit: { requests: 5000, window: 'hour' } },
        coverr: { enabled: false, weight: 0.3 },
        freepik: { enabled: false, weight: 0.3 }
      },
      negativeKeywords: ['violence', 'gore', 'explicit', 'nsfw'],
      usageTracking: { enabled: true, maxHistoryDays: 30, preventRepeatsWithinDays: 7 },
      search: { parallelTimeout: 5000, minDuration: 5, maxDuration: 30, preferredAspectRatio: "9:16" }
    };
  }

  private initializeProviders(): void {
    if (this.config.providers.pexels?.enabled && this.globalConfig.pexelsApiKey) {
      const pexelsProvider = new PexelsProvider(this.config.providers.pexels, this.globalConfig.pexelsApiKey);
      this.providers.set('pexels', pexelsProvider);
      this.initializeProviderHealth('pexels');
    }

    if (this.config.providers.pixabay?.enabled && this.globalConfig.pixabayApiKey) {
      const pixabayProvider = new PixabayProvider(this.config.providers.pixabay, this.globalConfig.pixabayApiKey);
      this.providers.set('pixabay', pixabayProvider);
      this.initializeProviderHealth('pixabay');
    }

    if (this.config.providers.coverr?.enabled && this.globalConfig.coverrApiKey) {
      const coverrProvider = new CoverrProvider(this.config.providers.coverr, this.globalConfig.coverrApiKey);
      this.providers.set('coverr', coverrProvider);
      this.initializeProviderHealth('coverr');
    }

    if (this.config.providers.freepik?.enabled && this.globalConfig.freepikApiKey) {
      const freepikProvider = new FreepikProvider(this.config.providers.freepik, this.globalConfig.freepikApiKey);
      this.providers.set('freepik', freepikProvider);
      this.initializeProviderHealth('freepik');
    }

    logger.info({ 
      enabledProviders: Array.from(this.providers.keys()),
      totalProviders: this.providers.size
    }, "Video providers initialized");
  }

  private initializeProviderHealth(providerName: string): void {
    this.providerHealth.set(providerName, {
      provider: providerName,
      healthy: true,
      successRate: 1.0,
      totalRequests: 0,
      failedRequests: 0,
    });
  }

  private initializeRateLimiter(): void {
    for (const [providerName, config] of Object.entries(this.config.providers)) {
      if (config.enabled) {
        this.rateLimiter.setProviderConfig(providerName, config);
      }
    }
  }

  async findVideo(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    timeout: number = 30000,
    retryCounter: number = 0,
    projectId?: string
  ): Promise<Video> {
    const videos = await this.findVideos(searchTerms, minDurationSeconds, excludeIds, orientation, 1, timeout, retryCounter, projectId);
    if (!videos || videos.length === 0 || !videos[0] || !videos[0].url) {
      throw new VideoSearchError(`No valid video found for search: ${searchTerms.join(' ')}`);
    }
    return videos[0];
  }

  async findVideos(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    count: number = 1,
    timeout: number = 30000,
    retryCounter: number = 0,
    projectId?: string
  ): Promise<Video[]> {
    logger.info({ 
      originalSearchTerms: searchTerms,
      minDurationSeconds,
      orientation,
      count 
    }, "VideoProviderFacade.findVideos called");
    
    const sanitizedTerms = this.keywordFilter.filterSearchTerms(searchTerms);
    
    if (sanitizedTerms.length === 0) {
      logger.warn({ 
        originalSearchTerms: searchTerms,
        fallbackTerms: ['nature', 'landscape']
      }, "All search terms were filtered out by negative keywords, using fallback terms");
      
      sanitizedTerms.push('nature', 'landscape');
    } else {
      logger.info({ 
        originalSearchTerms: searchTerms,
        sanitizedTerms,
        filteredOutCount: searchTerms.length - sanitizedTerms.length
      }, "Search terms processed by negative keyword filter");
    }

    const recentlyUsedIds = this.config.usageTracking.enabled 
      ? this.usageTracker.getRecentlyUsedIds(projectId)
      : new Set<string>();
    
    const allExcludeIds = [...excludeIds, ...Array.from(recentlyUsedIds)];

    const searchContext: VideoSearchContext = {
      projectId,
      excludeIds: allExcludeIds,
      orientation,
      duration: minDurationSeconds,
      searchTerms: sanitizedTerms,
    };

    try {
      // Use the new VideoProviderManager with round-robin and progressive fallbacks
      const results = await this.providerManager.searchWithRoundRobinFallback(
        sanitizedTerms,
        minDurationSeconds,
        allExcludeIds,
        orientation,
        count,
        timeout
      );

      // If we got fewer videos than requested, log a warning
      if (results.length < count) {
        logger.warn({ 
          requested: count, 
          found: results.length, 
          searchTerms,
          excludeIds: excludeIds?.length || 0
        }, 'Found fewer videos than requested with new search system');
      }

      if (this.config.usageTracking.enabled && projectId) {
        results.forEach(video => {
          const provider = video.id.split('_')[0];
          this.usageTracker.trackUsage(video.id, provider, projectId, sanitizedTerms);
        });
      }

      logger.info({ 
        searchTerms,
        sanitizedTerms,
        resultsFound: results.length,
        targetCount: count
      }, 'Video search completed with new round-robin system');

      return results;
    } catch (error) {
      logger.error({ searchTerms, sanitizedTerms, error }, "Video search failed with new round-robin system");
      
      // Fallback to old system if new system fails completely
      logger.warn({ searchTerms }, "Falling back to legacy search system");
      try {
        let legacyResults = await this.legacySearchAcrossProviders(searchContext, count, timeout);
        
        // If no results with legacy system, try old fallback methods
        if (legacyResults.length === 0) {
          logger.info({ originalTerms: sanitizedTerms }, 'Legacy: No results found, trying fallback search');
          
          const fallbackTerms = this.searchFallback.generateFallbackTerms(sanitizedTerms);
          const fallbackContext: VideoSearchContext = {
            ...searchContext,
            searchTerms: fallbackTerms
          };
          
          legacyResults = await this.legacySearchAcrossProviders(fallbackContext, count, timeout);
          
          // If still no results, try category fallback
          if (legacyResults.length === 0) {
            logger.info('Legacy: Trying category-based fallback search');
            const categoryTerms = this.searchFallback.getCategoryFallback(sanitizedTerms);
            const categoryContext: VideoSearchContext = {
              ...searchContext,
              searchTerms: categoryTerms
            };
            
            legacyResults = await this.legacySearchAcrossProviders(categoryContext, count, timeout);
          }
        }
        
        if (this.config.usageTracking.enabled && projectId) {
          legacyResults.forEach(video => {
            const provider = video.id.split('_')[0];
            this.usageTracker.trackUsage(video.id, provider, projectId, sanitizedTerms);
          });
        }
        
        logger.info({ searchTerms, resultsFound: legacyResults.length }, 'Legacy search system provided fallback results');
        return legacyResults;
      } catch (legacyError) {
        logger.error({ searchTerms, error: legacyError }, "Legacy search system also failed");
        throw error; // Throw original error
      }
    }
  }

  private async legacySearchAcrossProviders(
    context: VideoSearchContext,
    count: number,
    timeout: number
  ): Promise<Video[]> {
    const availableProviders = this.getAvailableProviders(context.searchTerms);
    
    if (availableProviders.length === 0) {
      throw new VideoSearchError("No providers available");
    }

    // Request more videos from each provider to account for filtering
    // Ensure we get at least 'count' videos after filtering
    const videosPerProvider = Math.max(3, Math.ceil(count / availableProviders.length) + 2);
    const searchPromises = availableProviders.map(providerName => 
      this.searchWithProvider(providerName, context, videosPerProvider, timeout)
    );

    const results = await Promise.allSettled(searchPromises);
    
    const allVideos: Video[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const providerName = availableProviders[i];
      
      if (result.status === 'fulfilled') {
        // Take all videos returned by the provider (already limited by videosPerProvider in the request)
        const providerVideos = result.value.videos;
        allVideos.push(...providerVideos);
        this.updateProviderHealth(providerName, true);
        logger.info({ 
          provider: providerName, 
          videosFound: providerVideos.length,
          requested: videosPerProvider
        }, "Provider returned videos");
      } else {
        logger.error({ provider: providerName, error: result.reason }, "Provider search failed");
        this.updateProviderHealth(providerName, false, result.reason?.message);
      }
    }

    // Shuffle all videos
    const shuffledVideos = this.shuffleArray(allVideos);
    
    // Return requested count or all available videos
    return shuffledVideos.slice(0, count);
  }

  private async searchWithProvider(
    providerName: string,
    context: VideoSearchContext,
    count: number,
    timeout: number
  ): Promise<VideoProviderResponse> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    const canProceed = await this.rateLimiter.consumeRequest(providerName);
    if (!canProceed) {
      throw new Error(`Rate limit exceeded for ${providerName}`);
    }

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout for ${providerName}`)), timeout)
    );

    const searchPromise = async () => {
      const videos = await provider.findVideos(
        context.searchTerms, 
        context.duration, 
        context.excludeIds, 
        context.orientation, 
        count
      );
      return {
        videos,
        provider: providerName,
        searchTerms: context.searchTerms,
        searchTime: Date.now()
      };
    };

    return Promise.race([searchPromise(), timeoutPromise]);
  }

  private getAvailableProviders(searchTerms: string[]): string[] {
    const availableProviders: string[] = [];
    
    for (const [providerName, provider] of this.providers.entries()) {
      if (!provider.isHealthy() || !this.rateLimiter.isProviderAvailable(providerName)) {
        continue;
      }

      const config = this.config.providers[providerName];
      if (config?.specialization) {
        const hasSpecialKeyword = searchTerms.some(term => 
          config.specialization!.some(spec => term.toLowerCase().includes(spec))
        );
        if (hasSpecialKeyword) {
          availableProviders.unshift(providerName);
          continue;
        }
      }
      
      availableProviders.push(providerName);
    }

    return this.shuffleByWeight(availableProviders);
  }

  private shuffleByWeight(providers: string[]): string[] {
    const weighted: Array<{ provider: string; weight: number }> = [];
    
    for (const provider of providers) {
      const config = this.config.providers[provider];
      const weight = config?.weight || 0.25;
      weighted.push({ provider, weight });
    }
    
    weighted.sort((a, b) => b.weight - a.weight);
    return weighted.map(w => w.provider);
  }

  private selectBestVideos(videos: Video[], context: VideoSearchContext, count: number): Video[] {
    const filteredVideos = videos.filter(video => !context.excludeIds.includes(video.id));
    
    const scoredVideos = filteredVideos.map(video => ({
      video,
      score: this.calculateVideoScore(video, context),
    }));

    scoredVideos.sort((a, b) => b.score - a.score);

    const selectedVideos: Video[] = [];
    const usedIndices = new Set<number>();

    while (selectedVideos.length < count && usedIndices.size < scoredVideos.length) {
      const randomIndex = Math.floor(Math.random() * Math.min(5, scoredVideos.length));
      if (!usedIndices.has(randomIndex)) {
        usedIndices.add(randomIndex);
        selectedVideos.push(scoredVideos[randomIndex].video);
      }
    }

    return selectedVideos;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private calculateVideoScore(video: Video, context: VideoSearchContext): number {
    let score = 0;
    
    const durationDiff = Math.abs(video.duration - context.duration);
    score += Math.max(0, 100 - durationDiff * 5);
    
    const isCorrectOrientation = context.orientation === OrientationEnum.portrait 
      ? video.height > video.width 
      : video.width > video.height;
    if (isCorrectOrientation) score += 50;
    
    const provider = video.id.split('_')[0];
    const health = this.providerHealth.get(provider);
    if (health) {
      score += health.successRate * 25;
    }
    
    return score;
  }

  private updateProviderHealth(providerName: string, success: boolean, error?: string): void {
    const health = this.providerHealth.get(providerName);
    if (!health) return;

    health.totalRequests++;
    if (!success) {
      health.failedRequests++;
      health.lastError = error;
      health.lastErrorTime = Date.now();
    }
    
    health.successRate = (health.totalRequests - health.failedRequests) / health.totalRequests;
    health.healthy = health.successRate > 0.5;
  }

  async findRandomVideo(
    excludeIds: string[],
    orientation: OrientationEnum = OrientationEnum.portrait
  ): Promise<Video> {
    const randomSearches = ['nature', 'city', 'abstract', 'technology', 'people', 'landscape'];
    const randomSearch = randomSearches[Math.floor(Math.random() * randomSearches.length)];
    
    return this.findVideo([randomSearch], 10, excludeIds, orientation);
  }

  async getVideoByUrl(url: string): Promise<Video> {
    for (const [providerName, provider] of this.providers.entries()) {
      try {
        const video = await provider.getVideoByUrl(url);
        return video;
      } catch (error) {
        logger.debug({ provider: providerName, url, error }, "Provider could not handle URL");
      }
    }

    logger.warn({ url }, "No provider could handle URL, using fallback");
    
    const urlParts = url.split('/');
    const id = urlParts[urlParts.length - 1];
    
    return {
      id: id,
      url: url,
      duration: 10.0,
      width: 1920,
      height: 1080,
    };
  }

  async getVideoById(id: string): Promise<Video> {
    const providerName = id.split('_')[0];
    const provider = this.providers.get(providerName);
    
    if (!provider) {
      throw new VideoSearchError(`Provider ${providerName} not found for video ${id}`);
    }

    return provider.getVideoById(id);
  }

  getProviderStats(): Record<string, ProviderHealth> {
    const legacyStats: Record<string, ProviderHealth> = {};
    
    for (const [providerName, health] of this.providerHealth.entries()) {
      legacyStats[providerName] = { ...health };
    }
    
    // Merge with new provider manager stats
    const newProviderStats = this.providerManager.getProviderStats();
    const mergedStats: Record<string, any> = {};
    
    for (const [providerName, legacyHealth] of Object.entries(legacyStats)) {
      const newStats = newProviderStats[providerName] || {};
      mergedStats[providerName] = {
        ...legacyHealth,
        // Add new stats from VideoProviderManager
        roundRobinStats: {
          totalRequests: newStats.totalRequests || 0,
          successfulRequests: newStats.successfulRequests || 0,
          successRate: newStats.successRate || 0,
          averageResponseTime: newStats.averageResponseTime || 0,
          performanceScore: newStats.performanceScore || 0,
          lastUsed: newStats.lastUsed || 0
        }
      };
    }
    
    return mergedStats;
  }

  /**
   * Get detailed round-robin provider statistics
   */
  getRoundRobinProviderStats(): Record<string, any> {
    return this.providerManager.getProviderStats();
  }

  /**
   * Reset round-robin provider performance metrics
   */
  resetRoundRobinStats(): void {
    this.providerManager.resetProviderStats();
  }

  getUsageStats(projectId?: string) {
    return this.usageTracker.getUsageStats(projectId);
  }

  getRateLimitStats() {
    return this.rateLimiter.getAllRateLimits();
  }

  addNegativeKeywords(keywords: string[]): void {
    this.keywordFilter.addNegativeKeywords(keywords);
    this.updateConfigNegativeKeywords();
  }

  removeNegativeKeywords(keywords: string[]): void {
    this.keywordFilter.removeNegativeKeywords(keywords);
    this.updateConfigNegativeKeywords();
  }

  getNegativeKeywords(): string[] {
    return this.keywordFilter.getNegativeKeywords();
  }

  private async updateConfigNegativeKeywords(): Promise<void> {
    try {
      this.config.negativeKeywords = this.keywordFilter.getNegativeKeywords();
      const configPath = path.join(__dirname, 'Videos', 'config.json');
      await fs.writeJson(configPath, this.config, { spaces: 2 });
      logger.info('Updated negative keywords in config file');
    } catch (error) {
      logger.error({ error }, 'Failed to update config file with negative keywords');
    }
  }

  // Image cache methods
  getImageCacheService(): ImageCacheService {
    return this.imageCacheService;
  }

  async getCachedImagePath(url: string): Promise<string | null> {
    return await this.imageCacheService.getCachedImage(url);
  }

  async cacheImageFromUrl(url: string, projectId?: string): Promise<string> {
    try {
      const cachedPath = await this.imageCacheService.getCachedImage(url);
      if (cachedPath) {
        return cachedPath;
      }

      // Fetch image and cache it
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      return await this.imageCacheService.cacheImage(url, imageBuffer, projectId);
    } catch (error) {
      logger.error({ error, url }, 'Failed to cache image');
      throw error;
    }
  }

  async clearImageCache(): Promise<void> {
    await this.imageCacheService.clearCache();
  }

  getImageCacheStats(): { entries: number; size: number; oldestEntry?: number; newestEntry?: number } {
    return this.imageCacheService.getStats();
  }

  getUsageHistory(projectId?: string, limit: number = 100) {
    return this.usageTracker.getHistory(projectId, limit);
  }
}