import { Video, OrientationEnum } from "../../../../types/shorts";
import { VideoProviderBase } from "./VideoProviderBase";
import { VideoProviderResponse, RateLimitInfo, VideoProviderConfig } from "../types";
import { logger } from "../../../../logger";

interface VidevoVideo {
  id: string;
  title: string;
  description: string;
  duration: number;
  width: number;
  height: number;
  download_url: string;
  preview_url: string;
  thumbnail_url: string;
  tags: string[];
  attribution_required: boolean;
  license: string;
}

interface VidevoSearchResponse {
  results: VidevoVideo[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export class FreepikProvider extends VideoProviderBase {
  protected providerName = 'Freepik';
  protected baseUrl = 'https://api.freepik.com/v1';
  private apiKey?: string;
  private requestCount = 0;
  private requestResetTime = Date.now() + 3600000;

  constructor(config: VideoProviderConfig, apiKey?: string) {
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
      q: query,
      page: page.toString(),
      limit: Math.min(count, 100).toString(),
      filters: JSON.stringify({
        content_type: 'video',
        license: 'free',
        duration: {
          min: Math.max(5, minDuration - 5),
          max: Math.min(60, minDuration + 20)
        }
      })
    });

    if (orientation === OrientationEnum.portrait) {
      params.append('aspect_ratio', '9:16');
    } else {
      params.append('aspect_ratio', '16:9');
    }

    const url = `${this.baseUrl}/videos/search?${params.toString()}`;

    try {
      const response = await this.makeRequest<VidevoSearchResponse>(url, {
        headers: {
          'x-freepik-api-key': this.apiKey || '',
        },
      });
      
      this.incrementRequestCount();

      const videos: Video[] = response.results
        .filter(video => video.download_url || video.preview_url) // Only include videos with valid URLs
        .map(video => ({
          id: `freepik_${video.id}`,
          url: video.download_url || video.preview_url,
          duration: video.duration,
          width: video.width,
          height: video.height,
        }));

      return {
        videos,
        provider: this.providerName,
        searchTime: Date.now() - startTime,
        totalResults: response.total,
      };
    } catch (error) {
      logger.error({ provider: this.providerName, query, error }, "Search failed");
      
      if (error instanceof Error && error.message.includes('401')) {
        logger.warn({ provider: this.providerName }, "API key might be invalid or missing");
        return {
          videos: [],
          provider: this.providerName,
          searchTime: Date.now() - startTime,
          totalResults: 0,
        };
      }
      
      throw error;
    }
  }

  async getVideoById(id: string): Promise<Video> {
    const freepikId = id.replace('freepik_', '');
    
    const url = `${this.baseUrl}/videos/${freepikId}`;

    try {
      const response = await this.makeRequest<{ data: VidevoVideo }>(url, {
        headers: {
          'x-freepik-api-key': this.apiKey || '',
        },
      });
      const video = response.data;

      return {
        id: `freepik_${video.id}`,
        url: video.download_url || video.preview_url,
        duration: video.duration,
        width: video.width,
        height: video.height,
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

    const limit = this.apiKey ? 1000 : 50;
    
    return {
      remaining: Math.max(0, limit - this.requestCount),
      reset: this.requestResetTime,
      limit: limit,
    };
  }

  protected extractIdFromUrl(url: string): string | null {
    const match = url.match(/freepik\.com\/.*\/(\d+)/);
    if (match) return `freepik_${match[1]}`;
    
    const match2 = url.match(/video-(\d+)/);
    return match2 ? `freepik_${match2[1]}` : null;
  }

  private incrementRequestCount(): void {
    this.requestCount++;
  }

  async findVideos(
    searchTerms: string[],
    duration: number,
    excludeIds: string[],
    orientation: OrientationEnum,
    count: number
  ): Promise<Video[]> {
    const diversityKeywords = ['unique', 'creative', 'unusual', 'artistic'];
    const hasDiversityKeyword = searchTerms.some(term => 
      diversityKeywords.some(keyword => term.toLowerCase().includes(keyword))
    );

    if (hasDiversityKeyword) {
      const enhancedTerms = [...searchTerms, 'creative', 'unique'];
      try {
        return await super.findVideos(enhancedTerms, duration, excludeIds, orientation, count);
      } catch (error) {
        logger.warn({ provider: this.providerName, error }, "Enhanced search failed, falling back to original terms");
      }
    }

    return super.findVideos(searchTerms, duration, excludeIds, orientation, count);
  }
}