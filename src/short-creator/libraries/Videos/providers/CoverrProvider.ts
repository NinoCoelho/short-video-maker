import { Video, OrientationEnum } from "../../../../types/shorts";
import { VideoProviderBase } from "./VideoProviderBase";
import { VideoProviderResponse, RateLimitInfo, VideoProviderConfig } from "../types";
import { logger } from "../../../../logger";

interface CoverrVideo {
  id: string;
  title: string;
  description: string;
  duration: string;
  max_width: number;
  max_height: number;
  playback_id: string;
  base_filename: string;
  default_variant?: string;
  urls?: {
    mp4?: {
      download: string;
    };
  };
  tags: string[];
  is_vertical: boolean;
}

interface CoverrSearchResponse {
  hits: CoverrVideo[];
  total: number;
  page: number;
  hitsPerPage: number;
}

export class CoverrProvider extends VideoProviderBase {
  protected providerName = 'Coverr';
  protected baseUrl = 'https://api.coverr.co';
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
      query: query,
      page: (page - 1).toString(), // Coverr uses 0-based pagination
      hitsPerPage: Math.min(count, 50).toString(),
    });

    if (orientation === OrientationEnum.portrait) {
      params.append('filters', '(is_vertical:true)');
    }

    const url = `${this.baseUrl}/videos?${params.toString()}`;

    try {
      const response = await this.makeRequest<any>(url, {
        headers: {
          'Authorization': this.apiKey,
        },
      });
      
      this.incrementRequestCount();

      const videos: Video[] = response.hits
        .filter((hit: any) => Math.abs(parseFloat(hit.duration) - minDuration) <= 15)
        .filter((hit: any) => hit.base_filename) // Only include videos with valid base_filename
        .map((hit: any) => {
          // Coverr videos are available via CDN
          const playbackUrl = `https://cdn.coverr.co/videos/${hit.base_filename}/1080p.mp4`;
          
          return {
            id: `coverr_${hit.id}`,
            url: playbackUrl,
            duration: parseFloat(hit.duration),
            width: hit.max_width,
            height: hit.max_height,
          };
        });

      return {
        videos,
        provider: this.providerName,
        searchTime: Date.now() - startTime,
        totalResults: response.total,
      };
    } catch (error) {
      logger.error({ provider: this.providerName, query, error }, "Search failed");
      
      if (error instanceof Error && error.message.includes('404')) {
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
    const coverrId = id.replace('coverr_', '');
    
    const params = new URLSearchParams({
      filters: `(id:${coverrId})`,
      hitsPerPage: '1'
    });
    
    const url = `${this.baseUrl}/videos?${params.toString()}`;

    try {
      const response = await this.makeRequest<CoverrSearchResponse>(url, {
        headers: {
          'Authorization': this.apiKey,
        },
      });
      
      if (!response.hits || response.hits.length === 0) {
        throw new Error(`Video not found: ${id}`);
      }
      
      const hit = response.hits[0];
      // Coverr videos are available via CDN
      const playbackUrl = `https://cdn.coverr.co/videos/${hit.base_filename}/1080p.mp4`;

      return {
        id: `coverr_${hit.id}`,
        url: playbackUrl,
        duration: parseFloat(hit.duration),
        width: hit.max_width,
        height: hit.max_height,
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
      remaining: Math.max(0, 100 - this.requestCount),
      reset: this.requestResetTime,
      limit: 100,
    };
  }

  protected extractIdFromUrl(url: string): string | null {
    const match = url.match(/coverr\.co\/videos\/([^\/]+)/);
    return match ? `coverr_${match[1]}` : null;
  }

  private incrementRequestCount(): void {
    this.requestCount++;
  }

  async findVideo(
    searchTerms: string[],
    duration: number,
    excludeIds: string[],
    orientation: OrientationEnum
  ): Promise<Video> {
    const aestheticKeywords = ['aesthetic', 'cinematic', 'beautiful', 'artistic'];
    const hasAestheticKeyword = searchTerms.some(term => 
      aestheticKeywords.some(keyword => term.toLowerCase().includes(keyword))
    );

    if (hasAestheticKeyword) {
      const enhancedTerms = [...searchTerms, 'cinematic', 'beautiful'];
      try {
        return await super.findVideo(enhancedTerms, duration, excludeIds, orientation);
      } catch (error) {
        logger.warn({ provider: this.providerName, error }, "Enhanced search failed, falling back to original terms");
      }
    }

    return super.findVideo(searchTerms, duration, excludeIds, orientation);
  }
}