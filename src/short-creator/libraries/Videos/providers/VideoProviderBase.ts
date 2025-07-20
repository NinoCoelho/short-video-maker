import { Video, OrientationEnum } from "../../../../types/shorts";
import { VideoProvider, VideoSearchError } from "../../VideoProvider";
import { logger } from "../../../../logger";
import { VideoProviderConfig, VideoProviderResponse, RateLimitInfo, VideoProviderError, RateLimitError } from "../types";

export abstract class VideoProviderBase implements VideoProvider {
  protected config: VideoProviderConfig;
  protected abstract providerName: string;
  protected abstract baseUrl: string;
  
  constructor(config: VideoProviderConfig) {
    this.config = config;
  }

  abstract searchVideos(
    searchTerms: string[],
    minDuration: number,
    orientation: OrientationEnum,
    count: number,
    page?: number
  ): Promise<VideoProviderResponse>;

  abstract getVideoById(id: string): Promise<Video>;

  abstract checkRateLimit(): Promise<RateLimitInfo>;

  async findVideo(
    searchTerms: string[],
    duration: number,
    excludeIds: string[],
    orientation: OrientationEnum
  ): Promise<Video> {
    const response = await this.searchVideos(searchTerms, duration, orientation, 20);
    
    const filteredVideos = response.videos
      .filter(video => !excludeIds.includes(video.id))
      .sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
    
    if (filteredVideos.length === 0) {
      throw new VideoSearchError(`No videos found for search: ${searchTerms.join(' ')}`);
    }
    
    const randomIndex = Math.floor(Math.random() * Math.min(5, filteredVideos.length));
    return filteredVideos[randomIndex];
  }

  async findVideos(
    searchTerms: string[],
    duration: number,
    excludeIds: string[],
    orientation: OrientationEnum,
    count: number
  ): Promise<Video[]> {
    let allVideos: Video[] = [];
    let page = 1;
    const maxPages = 3; // Limit to prevent API abuse
    
    while (allVideos.length < count && page <= maxPages) {
      // Request more videos when there are excludeIds to ensure we have enough after filtering
      const multiplier = excludeIds.length > 0 ? 5 : 3;
      const requestCount = Math.min(count * multiplier, 60);
      
      logger.info({
        provider: this.providerName,
        searchTerms,
        page,
        requestCount,
        excludeIdsCount: excludeIds.length,
        videosFoundSoFar: allVideos.length,
        targetCount: count
      }, "Fetching page");
      
      try {
        const response = await this.searchVideos(searchTerms, duration, orientation, requestCount, page);
        
        const filteredVideos = response.videos
          .filter(video => !excludeIds.includes(video.id))
          .sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
        
        allVideos.push(...filteredVideos);
        
        logger.info({
          provider: this.providerName,
          searchTerms,
          page,
          totalVideosReturned: response.videos.length,
          videosAfterFiltering: filteredVideos.length,
          totalVideosNow: allVideos.length
        }, "Page processed");
        
        // If we got fewer videos than requested, we might be at the last page
        if (response.videos.length < requestCount) {
          logger.info({
            provider: this.providerName,
            searchTerms,
            page,
            videosReturned: response.videos.length,
            requestedCount: requestCount
          }, "Reached end of results");
          break;
        }
        
        page++;
      } catch (error) {
        logger.error({ 
          provider: this.providerName, 
          searchTerms, 
          page,
          error: error instanceof Error ? error.message : String(error)
        }, "Failed to fetch page");
        
        // If this is a rate limit error, break immediately
        if ((error instanceof Error && error.message?.includes('rate limit')) || 
            (error instanceof Error && error.message?.includes('429'))) {
          logger.warn({
            provider: this.providerName,
            searchTerms,
            page
          }, "Rate limit reached, stopping pagination");
          break;
        }
        
        // For other errors, continue to next page after short delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        page++;
      }
    }
    
    // Remove duplicates based on video ID
    const uniqueVideos = Array.from(
      new Map(allVideos.map(video => [video.id, video])).values()
    );
    
    const selectedVideos: Video[] = [];
    const usedIndices = new Set<number>();
    
    while (selectedVideos.length < count && usedIndices.size < uniqueVideos.length) {
      const randomIndex = Math.floor(Math.random() * uniqueVideos.length);
      if (!usedIndices.has(randomIndex)) {
        usedIndices.add(randomIndex);
        selectedVideos.push(uniqueVideos[randomIndex]);
      }
    }
    
    if (selectedVideos.length === 0) {
      throw new VideoSearchError(`No videos found for search: ${searchTerms.join(' ')}`);
    }
    
    logger.info({
      provider: this.providerName,
      searchTerms,
      pagesSearched: page - 1,
      totalVideosFound: allVideos.length,
      uniqueVideosFound: uniqueVideos.length,
      selectedVideos: selectedVideos.length,
      requestedCount: count
    }, "Video search completed with pagination");
    
    return selectedVideos;
  }

  async findRandomVideo(
    excludeIds: string[],
    orientation: OrientationEnum
  ): Promise<Video> {
    const popularSearches = ['nature', 'city', 'abstract', 'technology', 'people', 'landscape'];
    const randomSearch = popularSearches[Math.floor(Math.random() * popularSearches.length)];
    
    return this.findVideo([randomSearch], 10, excludeIds, orientation);
  }

  async getVideoByUrl(url: string): Promise<Video> {
    const idMatch = this.extractIdFromUrl(url);
    if (!idMatch) {
      throw new VideoSearchError(`Cannot extract video ID from URL: ${url}`);
    }
    
    try {
      return await this.getVideoById(idMatch);
    } catch (error) {
      logger.error({ provider: this.providerName, url, error }, "Failed to get video by URL");
      
      return {
        id: idMatch,
        url: url,
        duration: 10,
        width: 1920,
        height: 1080,
      };
    }
  }

  protected abstract extractIdFromUrl(url: string): string | null;

  protected async handleRateLimit(): Promise<void> {
    const rateLimitInfo = await this.checkRateLimit();
    if (rateLimitInfo.remaining <= 0) {
      throw new RateLimitError(this.providerName, rateLimitInfo.reset);
    }
  }

  protected async makeRequest<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    try {
      await this.handleRateLimit();
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'ShortVideoMaker/1.0',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No response body');
        const errorDetail = `HTTP ${response.status}: ${response.statusText} - ${errorBody}`;
        logger.error({ 
          provider: this.providerName, 
          url, 
          status: response.status, 
          statusText: response.statusText,
          body: errorBody 
        }, "HTTP error response");
        throw new Error(errorDetail);
      }

      return await response.json();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ 
        provider: this.providerName, 
        url, 
        error: errorMessage,
        errorType: error?.constructor?.name 
      }, "Provider request failed");
      throw new VideoProviderError(
        `Request failed for ${this.providerName}: ${errorMessage}`,
        this.providerName,
        error as Error
      );
    }
  }

  protected normalizeQuery(searchTerms: string[]): string {
    return searchTerms
      .map(term => term.trim())
      .filter(term => term.length > 0)
      .join(' ');
  }

  isHealthy(): boolean {
    return this.config.enabled;
  }

  getProviderName(): string {
    return this.providerName;
  }
}