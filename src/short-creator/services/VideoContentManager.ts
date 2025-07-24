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
    
    for (const term of searchTerms) {
      try {
        const searchResults = await this.videoProviderFacade.findVideos([term], 5, [], orientation);
        videos.push(...searchResults.slice(0, count));
        if (videos.length >= count) break;
      } catch (error) {
        logger.warn({ searchTerm: term, error }, "Failed to search videos for term");
      }
    }

    const videoUrls: string[] = [];
    const urlsToCache = videos.slice(0, count).map(v => v.url);
    
    try {
      const cacheResults = await this.videoCacheManager.preloadVideos(urlsToCache);
      for (const video of videos.slice(0, count)) {
        const cachedVideo = cacheResults.get(video.url);
        if (cachedVideo) {
          videoUrls.push(cachedVideo.proxyUrl);
        } else {
          logger.error({ videoUrl: video.url }, "Failed to cache video");
        }
      }
    } catch (error) {
      logger.error({ urlsToCache, error }, "Failed to cache videos");
    }

    return videoUrls;
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