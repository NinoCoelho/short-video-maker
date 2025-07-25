import { logger } from '../../../logger';
import { OrientationEnum, Video } from '../../../types/shorts';
import { VideoProviderBase } from './providers/VideoProviderBase';
import { SearchFallbackStrategy } from './SearchFallbackStrategy';
import { VideoSearchError } from '../VideoProvider';

export interface ProviderSearchResult {
  videos: Video[];
  provider: string;
  searchTerms: string[];
  success: boolean;
  error?: string;
}

export class VideoProviderManager {
  private providers: Map<string, VideoProviderBase>;
  private searchFallback: SearchFallbackStrategy;
  private providerIndex: number = 0; // For round-robin selection
  private providerPerformance: Map<string, {
    totalRequests: number;
    successfulRequests: number;
    averageResponseTime: number;
    lastUsed: number;
  }> = new Map();

  constructor(providers: Map<string, VideoProviderBase>) {
    this.providers = providers;
    this.searchFallback = new SearchFallbackStrategy();
    this.initializeProviderPerformance();
  }

  private initializeProviderPerformance(): void {
    for (const [providerName] of this.providers) {
      this.providerPerformance.set(providerName, {
        totalRequests: 0,
        successfulRequests: 0,
        averageResponseTime: 0,
        lastUsed: 0
      });
    }
  }

  /**
   * Search for videos using round-robin provider selection with progressive fallbacks
   */
  async searchWithRoundRobinFallback(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    count: number = 1,
    timeout: number = 30000
  ): Promise<Video[]> {
    const results: Video[] = [];
    const availableProviders = this.getAvailableProviders();
    
    if (availableProviders.length === 0) {
      throw new VideoSearchError("No providers available");
    }

    logger.info({ 
      searchTerms, 
      providersCount: availableProviders.length,
      count,
      minDurationSeconds
    }, "Starting round-robin video search with fallbacks");

    // Generate all possible fallback strategies
    const fallbackStrategies = this.searchFallback.generateProgressiveFallbacks(searchTerms);
    const searchStrategies = [searchTerms, ...fallbackStrategies];

    logger.info({ 
      originalTerms: searchTerms,
      totalStrategies: searchStrategies.length,
      strategySample: searchStrategies.slice(0, 3)
    }, "Generated search strategies");

    // Try each search strategy until we have enough videos
    for (let strategyIndex = 0; strategyIndex < searchStrategies.length && results.length < count; strategyIndex++) {
      const currentTerms = searchStrategies[strategyIndex];
      
      logger.debug({ 
        strategy: strategyIndex + 1,
        totalStrategies: searchStrategies.length,
        currentTerms,
        resultsFound: results.length,
        targetCount: count
      }, "Trying search strategy");

      // Try each provider in round-robin fashion for this strategy
      const providerAttempts = Math.min(availableProviders.length, 3); // Limit to 3 providers per strategy
      
      for (let attempt = 0; attempt < providerAttempts && results.length < count; attempt++) {
        const providerName = this.getNextProvider(availableProviders);
        const videosNeeded = count - results.length;
        
        try {
          const searchResult = await this.searchWithProvider(
            providerName,
            currentTerms,
            minDurationSeconds,
            excludeIds.concat(results.map(v => v.id)), // Exclude already found videos
            orientation,
            videosNeeded,
            timeout
          );

          if (searchResult.success && searchResult.videos.length > 0) {
            // Filter out duplicates
            const newVideos = searchResult.videos.filter(video => 
              !results.some(existing => existing.id === video.id) &&
              !excludeIds.includes(video.id)
            );
            
            results.push(...newVideos.slice(0, videosNeeded));
            
            logger.info({ 
              provider: providerName,
              strategy: strategyIndex + 1,
              searchTerms: currentTerms,
              foundVideos: newVideos.length,
              totalResults: results.length,
              targetCount: count
            }, "Found videos with provider");

            // If we have enough videos, break early
            if (results.length >= count) {
              break;
            }
          } else {
            logger.debug({ 
              provider: providerName,
              searchTerms: currentTerms,
              error: searchResult.error
            }, "Provider search failed");
          }
        } catch (error) {
          logger.warn({ 
            provider: providerName,
            searchTerms: currentTerms,
            error: error.message
          }, "Provider search threw error");
        }
      }

      // If we found videos with this strategy, log progress
      if (results.length > 0) {
        logger.info({ 
          strategy: strategyIndex + 1,
          searchTerms: currentTerms,
          resultsFound: results.length,
          targetCount: count
        }, "Strategy yielded results");
      }
    }

    if (results.length === 0) {
      logger.error({ 
        originalSearchTerms: searchTerms,
        strategiesTried: searchStrategies.length,
        providersAvailable: availableProviders.length
      }, "All search strategies and providers failed");
      throw new VideoSearchError(`No videos found for search terms: ${searchTerms.join(' ')} after trying all fallback strategies`);
    }

    logger.info({ 
      originalSearchTerms: searchTerms,
      finalResults: results.length,
      targetCount: count,
      strategiesUsed: Math.min(searchStrategies.findIndex(strategy => results.length > 0) + 1, searchStrategies.length)
    }, "Round-robin search completed");

    return results.slice(0, count);
  }

  /**
   * Search with a specific provider
   */
  private async searchWithProvider(
    providerName: string,
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[],
    orientation: OrientationEnum,
    count: number,
    timeout: number
  ): Promise<ProviderSearchResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return {
        videos: [],
        provider: providerName,
        searchTerms,
        success: false,
        error: `Provider ${providerName} not found`
      };
    }

    const startTime = Date.now();
    const performance = this.providerPerformance.get(providerName)!;
    performance.totalRequests++;
    performance.lastUsed = startTime;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Provider ${providerName} timeout`)), timeout)
      );

      const searchPromise = provider.findVideos(
        searchTerms,
        minDurationSeconds,
        excludeIds,
        orientation,
        count
      );

      const videos = await Promise.race([searchPromise, timeoutPromise]);
      
      // Update performance metrics
      const responseTime = Date.now() - startTime;
      performance.successfulRequests++;
      performance.averageResponseTime = 
        (performance.averageResponseTime * (performance.successfulRequests - 1) + responseTime) / 
        performance.successfulRequests;

      logger.debug({ 
        provider: providerName,
        searchTerms,
        videosFound: videos.length,
        responseTime,
        count 
      }, "Provider search successful");

      return {
        videos,
        provider: providerName,
        searchTerms,
        success: true
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.debug({ 
        provider: providerName,
        searchTerms,
        error: error instanceof Error ? error.message : String(error),
        responseTime
      }, "Provider search failed");

      return {
        videos: [],
        provider: providerName,
        searchTerms,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get next provider using round-robin with performance weighting
   */
  private getNextProvider(availableProviders: string[]): string {
    if (availableProviders.length === 0) {
      throw new Error("No providers available");
    }

    // Sort providers by performance score (success rate + recency)
    const sortedProviders = availableProviders.sort((a, b) => {
      const perfA = this.providerPerformance.get(a)!;
      const perfB = this.providerPerformance.get(b)!;
      
      const scoreA = this.calculateProviderScore(perfA);
      const scoreB = this.calculateProviderScore(perfB);
      
      return scoreB - scoreA; // Higher score first
    });

    // Use round-robin among top performers (top 50% or at least 1)
    const topPerformers = sortedProviders.slice(0, Math.max(1, Math.ceil(sortedProviders.length * 0.5)));
    const selectedProvider = topPerformers[this.providerIndex % topPerformers.length];
    
    this.providerIndex++;
    
    logger.debug({ 
      selectedProvider,
      availableProviders: topPerformers,
      providerIndex: this.providerIndex
    }, "Selected provider using round-robin");

    return selectedProvider;
  }

  /**
   * Calculate provider performance score
   */
  private calculateProviderScore(performance: {
    totalRequests: number;
    successfulRequests: number;
    averageResponseTime: number;
    lastUsed: number;
  }): number {
    if (performance.totalRequests === 0) {
      return 1.0; // New providers get benefit of doubt
    }

    const successRate = performance.successfulRequests / performance.totalRequests;
    const recencyFactor = Math.max(0.1, 1 - (Date.now() - performance.lastUsed) / (60000 * 10)); // Decay over 10 minutes
    const speedFactor = performance.averageResponseTime > 0 ? Math.max(0.1, 1 - performance.averageResponseTime / 10000) : 1;

    return (successRate * 0.6) + (recencyFactor * 0.2) + (speedFactor * 0.2);
  }

  /**
   * Get list of available providers
   */
  private getAvailableProviders(): string[] {
    const available: string[] = [];
    
    for (const [providerName, provider] of this.providers.entries()) {
      if (provider.isHealthy()) {
        available.push(providerName);
      }
    }

    return available;
  }

  /**
   * Get provider performance statistics
   */
  getProviderStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [providerName, performance] of this.providerPerformance.entries()) {
      const score = this.calculateProviderScore(performance);
      stats[providerName] = {
        ...performance,
        successRate: performance.totalRequests > 0 ? 
          performance.successfulRequests / performance.totalRequests : 0,
        performanceScore: score
      };
    }
    
    return stats;
  }

  /**
   * Reset provider performance metrics
   */
  resetProviderStats(): void {
    this.initializeProviderPerformance();
    this.providerIndex = 0;
    logger.info("Provider performance statistics reset");
  }
}