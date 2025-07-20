import { Video, OrientationEnum } from "../../../../types/shorts";
import { VideoProviderBase } from "./VideoProviderBase";
import { VideoProviderResponse, RateLimitInfo, VideoProviderConfig } from "../types";
import { logger } from "../../../../logger";

interface PixabayVideo {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  duration: number;
  videos: {
    large?: {
      url: string;
      width: number;
      height: number;
      size: number;
    };
    medium?: {
      url: string;
      width: number;
      height: number;
      size: number;
    };
    small?: {
      url: string;
      width: number;
      height: number;
      size: number;
    };
    tiny?: {
      url: string;
      width: number;
      height: number;
      size: number;
    };
  };
  views: number;
  downloads: number;
  likes: number;
  user: string;
  userImageURL: string;
}

interface PixabaySearchResponse {
  total: number;
  totalHits: number;
  hits: PixabayVideo[];
}

export class PixabayProvider extends VideoProviderBase {
  protected providerName = 'Pixabay';
  protected baseUrl = 'https://pixabay.com/api/videos';
  private apiKey: string;
  private requestCount = 0;
  private requestResetTime = Date.now() + 3600000;

  constructor(config: VideoProviderConfig, apiKey: string) {
    super(config);
    this.apiKey = apiKey;
  }

  async searchVideos(
    searchTerms: string[],
    minDuration: number,
    orientation: OrientationEnum,
    count: number,
    page: number = 1
  ): Promise<VideoProviderResponse> {
    const startTime = Date.now();
    const query = this.normalizeQuery(searchTerms);
    
    logger.info({ provider: this.providerName, query, orientation }, "Searching videos");

    const params = new URLSearchParams({
      key: this.apiKey,
      q: query,
      video_type: 'all',
      per_page: Math.min(count, 200).toString(),
      page: page.toString(),
      safesearch: 'true',
      min_duration: Math.max(5, minDuration - 5).toString(),
      max_duration: Math.min(60, minDuration + 20).toString(),
    });

    const url = `${this.baseUrl}/?${params.toString()}`;

    try {
      const response = await this.makeRequest<PixabaySearchResponse>(url);
      
      this.incrementRequestCount();

      const videos: Video[] = response.hits
        .filter(video => this.isOrientationMatch(video, orientation))
        .map(video => {
          const videoFile = this.selectBestVideoFile(video.videos);
          
          return {
            id: `pixabay_${video.id}`,
            url: videoFile.url,
            duration: video.duration,
            width: videoFile.width,
            height: videoFile.height,
          };
        });

      return {
        videos,
        provider: this.providerName,
        searchTime: Date.now() - startTime,
        totalResults: response.totalHits,
      };
    } catch (error) {
      logger.error({ provider: this.providerName, query, error }, "Search failed");
      throw error;
    }
  }

  async getVideoById(id: string): Promise<Video> {
    const pixabayId = id.replace('pixabay_', '');
    
    const params = new URLSearchParams({
      key: this.apiKey,
      id: pixabayId,
    });

    const url = `${this.baseUrl}/?${params.toString()}`;

    try {
      const response = await this.makeRequest<PixabaySearchResponse>(url);
      
      if (response.hits.length === 0) {
        throw new Error(`Video with ID ${id} not found`);
      }

      const video = response.hits[0];
      const videoFile = this.selectBestVideoFile(video.videos);

      return {
        id: `pixabay_${video.id}`,
        url: videoFile.url,
        duration: video.duration,
        width: videoFile.width,
        height: videoFile.height,
      };
    } catch (error) {
      logger.error({ provider: this.providerName, id, error }, "Failed to get video by ID");
      throw error;
    }
  }

  async checkRateLimit(): Promise<RateLimitInfo> {
    if (Date.now() > this.requestResetTime) {
      this.requestCount = 0;
      this.requestResetTime = Date.now() + 3600000;
    }

    return {
      remaining: Math.max(0, 5000 - this.requestCount),
      reset: this.requestResetTime,
      limit: 5000,
    };
  }

  protected extractIdFromUrl(url: string): string | null {
    const match = url.match(/pixabay\.com\/videos\/[\w-]+-(\d+)/);
    return match ? `pixabay_${match[1]}` : null;
  }

  private isOrientationMatch(video: PixabayVideo, orientation: OrientationEnum): boolean {
    const videoFile = this.selectBestVideoFile(video.videos);
    const isPortrait = videoFile.height > videoFile.width;
    
    return orientation === OrientationEnum.portrait ? isPortrait : !isPortrait;
  }

  private selectBestVideoFile(videos: PixabayVideo['videos']): {
    url: string;
    width: number;
    height: number;
  } {
    const qualityPreference = ['large', 'medium', 'small', 'tiny'] as const;
    
    for (const quality of qualityPreference) {
      const file = videos[quality];
      if (file) {
        return {
          url: file.url,
          width: file.width,
          height: file.height,
        };
      }
    }

    throw new Error('No video files available');
  }

  private incrementRequestCount(): void {
    this.requestCount++;
  }
}