import { logger } from "../../logger";
import { OrientationEnum, Scene, Video } from "../../types/shorts";
import { VideoProviderFacade } from "../libraries/VideoProviderFacade";
import { VideoSearch } from "../libraries/VideoSearch";
import { VideoCacheManager } from "../libraries/VideoCacheManager";
import path from "path";
import fs from "fs-extra";
import { Config } from "../../config";

export class VideoContentManager {
  private videoProviderFacade: VideoProviderFacade;
  private videoSearch: VideoSearch;
  private videoCacheManager: VideoCacheManager;
  private globalConfig: Config;

  constructor(
    videoProviderFacade: VideoProviderFacade,
    globalConfig: Config
  ) {
    this.videoProviderFacade = videoProviderFacade;
    this.videoSearch = new VideoSearch(videoProviderFacade);
    this.videoCacheManager = new VideoCacheManager(globalConfig);
    this.globalConfig = globalConfig;
  }

  public async searchVideos(query: string): Promise<Video[]> {
    logger.info({ query }, "Searching for videos");
    try {
      const results = await this.videoProviderFacade.findVideos([query], 5);
      return results;
    } catch (error) {
      logger.error({ query, error }, "Error searching videos");
      throw error;
    }
  }

  public async processVideoForScene(
    videoUrl: string,
    sceneIndex: number,
    orientation: OrientationEnum
  ): Promise<string> {
    // Check if video is already cached
    if (videoUrl.startsWith('/api/cached-video/')) {
      const filename = path.basename(videoUrl);
      const cachedPath = this.videoCacheManager.getCachedVideoPath(filename);
      if (cachedPath) {
        logger.debug({ sceneIndex, filename }, "Using cached video");
        return videoUrl;
      }
    }

    // Download and cache new video
    if (videoUrl.startsWith('http')) {
      try {
        const cacheResults = await this.videoCacheManager.preloadVideos([videoUrl]);
        const cachedVideo = cacheResults.get(videoUrl);
        if (cachedVideo) {
          logger.info({ sceneIndex, originalUrl: videoUrl, cachedUrl: cachedVideo.proxyUrl }, "Video cached successfully");
          return cachedVideo.proxyUrl;
        } else {
          throw new Error("Failed to cache video");
        }
      } catch (error) {
        logger.error({ sceneIndex, videoUrl, error }, "Failed to cache video");
        throw error;
      }
    }

    // Local video URL
    return videoUrl;
  }

  public async downloadAndProcessVideos(
    searchTerms: string[],
    orientation: OrientationEnum,
    count: number = 3
  ): Promise<string[]> {
    const videos: Video[] = [];
    
    // Try to find videos for each search term
    logger.info({ 
      searchTerms, 
      orientation, 
      count 
    }, "Starting video search for terms");

    for (const term of searchTerms) {
      try {
        logger.info({ searchTerm: term }, "Searching for videos with term");
        const searchResults = await this.videoProviderFacade.findVideos(
          [term], 
          30, // minDurationSeconds
          [], // excludeIds
          orientation, 
          count // count of videos
        );
        logger.info({ 
          searchTerm: term, 
          resultsCount: searchResults.length,
          totalVideosNow: videos.length + searchResults.length
        }, "Search results received");
        
        videos.push(...searchResults);
        if (videos.length >= count) break;
      } catch (error) {
        logger.warn({ searchTerm: term, error: error.message }, "Failed to search videos for term");
      }
    }

    // If no videos found with specific terms, try fallback terms
    if (videos.length === 0) {
      logger.warn({ searchTerms }, "No videos found for search terms, trying fallback terms");
      const fallbackTerms = ['nature', 'abstract', 'background', 'motion'];
      
      for (const fallbackTerm of fallbackTerms) {
        try {
          logger.info({ fallbackTerm }, "Trying fallback search term");
          const searchResults = await this.videoProviderFacade.findVideos(
            [fallbackTerm], 
            30, 
            [], 
            orientation, 
            count
          );
          logger.info({ 
            fallbackTerm, 
            resultsCount: searchResults.length,
            totalVideosNow: videos.length + searchResults.length
          }, "Fallback search results received");
          
          videos.push(...searchResults);
          if (videos.length >= count) break;
        } catch (error) {
          logger.warn({ fallbackTerm, error: error.message }, "Failed to search videos for fallback term");
        }
      }
    }

    // If still no videos, throw an error to prevent downstream issues
    if (videos.length === 0) {
      throw new Error(`No videos found for search terms: ${searchTerms.join(', ')}`);
    }

    const videoUrls: string[] = [];
    const urlsToCache = videos.slice(0, count).map(v => v.url);
    
    logger.info({ 
      videosFound: videos.length, 
      urlsToCache: urlsToCache.length,
      requestedCount: count,
      urls: urlsToCache.slice(0, 3) 
    }, "Starting video caching process");
    
    try {
      const cacheResults = await this.videoCacheManager.preloadVideos(urlsToCache);
      logger.info({ 
        cacheResultsSize: cacheResults.size,
        urlsToCache: urlsToCache.length 
      }, "Video caching completed");
      
      for (const video of videos.slice(0, count)) {
        // Validate video URL before processing
        if (!video.url || typeof video.url !== 'string' || video.url.trim() === '') {
          logger.warn({ 
            video,
            videoId: video.id || 'unknown'
          }, "Invalid video URL detected, skipping");
          continue;
        }
        
        const cachedVideo = cacheResults.get(video.url);
        if (cachedVideo && cachedVideo.proxyUrl) {
          logger.debug({ videoUrl: video.url, proxyUrl: cachedVideo.proxyUrl }, "Using cached video");
          videoUrls.push(cachedVideo.proxyUrl);
        } else {
          logger.warn({ videoUrl: video.url }, "Failed to cache video, using original URL");
          // Fallback to original URL if caching fails - but validate first
          if (video.url && typeof video.url === 'string' && video.url.trim() !== '') {
            videoUrls.push(video.url);
          }
        }
      }
    } catch (error) {
      logger.error({ urlsToCache, error: error instanceof Error ? error.message : String(error) }, "Failed to cache videos, using original URLs");
      // Fallback to original URLs if caching completely fails - but validate them
      const validOriginalUrls = videos.slice(0, count)
        .map(v => v.url)
        .filter(url => url && typeof url === 'string' && url.trim() !== '');
      
      videoUrls.push(...validOriginalUrls);
      logger.info({ 
        originalUrlsCount: validOriginalUrls.length,
        totalVideosRequested: count 
      }, "Added validated original URLs as fallback");
    }

    // Final safety check and validation
    const validVideoUrls = videoUrls.filter(url => url && typeof url === 'string' && url.trim() !== '');
    
    if (validVideoUrls.length === 0) {
      logger.error({ 
        searchTerms,
        originalVideoUrls: videoUrls,
        videosFound: videos.length 
      }, "No valid video URLs available after processing and validation");
      throw new Error('No valid video URLs available after processing');
    }

    // If we lost some URLs during validation, log a warning
    if (validVideoUrls.length !== videoUrls.length) {
      logger.warn({ 
        searchTerms,
        originalCount: videoUrls.length,
        validCount: validVideoUrls.length,
        invalidUrls: videoUrls.filter(url => !url || typeof url !== 'string' || url.trim() === '')
      }, "Some invalid video URLs were filtered out");
    }

    logger.info({ 
      searchTerms, 
      videosFound: videos.length, 
      urlsReturned: validVideoUrls.length 
    }, "Video download and processing completed");

    return validVideoUrls;
  }

  public getCachedVideoPath(filename: string): string | null {
    return this.videoCacheManager.getCachedVideoPath(filename);
  }

  public getCacheStats(): { count: number; totalSize: number; totalSizeFormatted: string } {
    return this.videoCacheManager.getCacheStats();
  }

  public async cleanupVideoCache(maxAgeHours: number = 24): Promise<void> {
    await this.videoCacheManager.cleanupOldCache(maxAgeHours);
  }

  public resolveVideoUrl(videoUrl: string, port: number): string {
    if (!videoUrl) {
      throw new Error("Video URL cannot be undefined or null");
    }
    
    if (videoUrl.startsWith('http')) {
      return videoUrl;
    }
    
    // Convert relative URLs to absolute
    const normalizedPath = videoUrl.startsWith('/') ? videoUrl : `/${videoUrl}`;
    return `http://localhost:${port}${normalizedPath}`;
  }

  public validateVideoUrls(scenes: Scene[]): void {
    scenes.forEach((scene, index) => {
      if (scene.videos) {
        scene.videos = scene.videos.filter(url => url !== null && url !== undefined);
        if (scene.videos.length === 0) {
          logger.warn({ sceneIndex: index }, "Scene has no valid videos after filtering nulls");
        }
      }
    });
  }
}