import { Video, OrientationEnum } from "../../../../types/shorts";
import { VideoProviderBase } from "./VideoProviderBase";
import { VideoProviderResponse, RateLimitInfo, VideoProviderConfig } from "../types";
import { logger } from "../../../../logger";

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  duration: number;
  video_files: Array<{
    id: number;
    quality: string | null;
    file_type: string;
    width: number;
    height: number;
    link: string;
  }>;
}

interface PexelsSearchResponse {
  videos: PexelsVideo[];
  page: number;
  per_page: number;
  total_results: number;
  next_page?: string;
}

export class PexelsProvider extends VideoProviderBase {
  protected providerName = 'Pexels';
  protected baseUrl = 'https://api.pexels.com/videos';
  private apiKey: string;
  private rateLimitRemaining = 200;
  private rateLimitReset = Date.now() + 3600000;

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

    const orientationParam = orientation === OrientationEnum.portrait ? 'portrait' : 'landscape';
    const url = `${this.baseUrl}/search?query=${encodeURIComponent(query)}&orientation=${orientationParam}&per_page=${Math.min(count, 80)}&page=${page}`;

    try {
      const response = await this.makeRequest<PexelsSearchResponse>(url, {
        headers: {
          'Authorization': this.apiKey,
        },
      });

      const videos: Video[] = response.videos.map(video => {
        const bestQualityFile = this.selectBestVideoFile(video.video_files, orientation);
        
        return {
          id: `pexels_${video.id}`,
          url: bestQualityFile.link,
          duration: video.duration,
          width: bestQualityFile.width || video.width,
          height: bestQualityFile.height || video.height,
        };
      });

      return {
        videos,
        provider: this.providerName,
        searchTime: Date.now() - startTime,
        totalResults: response.total_results,
      };
    } catch (error) {
      logger.error({ provider: this.providerName, query, error }, "Search failed");
      throw error;
    }
  }

  async getVideoById(id: string): Promise<Video> {
    const pexelsId = id.replace('pexels_', '');
    const url = `${this.baseUrl}/videos/${pexelsId}`;

    try {
      const response = await this.makeRequest<{ video: PexelsVideo }>(url, {
        headers: {
          'Authorization': this.apiKey,
        },
      });

      const video = response.video;
      const bestQualityFile = this.selectBestVideoFile(video.video_files, OrientationEnum.portrait);

      return {
        id: `pexels_${video.id}`,
        url: bestQualityFile.link,
        duration: video.duration,
        width: bestQualityFile.width || video.width,
        height: bestQualityFile.height || video.height,
      };
    } catch (error) {
      logger.error({ provider: this.providerName, id, error }, "Failed to get video by ID");
      throw error;
    }
  }

  async checkRateLimit(): Promise<RateLimitInfo> {
    return {
      remaining: this.rateLimitRemaining,
      reset: this.rateLimitReset,
      limit: 200,
    };
  }

  protected extractIdFromUrl(url: string): string | null {
    const match = url.match(/pexels\.com\/video\/[\w-]+-(\d+)/);
    return match ? `pexels_${match[1]}` : null;
  }

  private selectBestVideoFile(
    files: PexelsVideo['video_files'], 
    orientation: OrientationEnum
  ): PexelsVideo['video_files'][0] {
    const isPortrait = orientation === OrientationEnum.portrait;
    
    const orientedFiles = files.filter(file => {
      const fileIsPortrait = file.height > file.width;
      return isPortrait === fileIsPortrait;
    });

    const filesToUse = orientedFiles.length > 0 ? orientedFiles : files;

    const sortedFiles = filesToUse.sort((a, b) => {
      const qualityOrder = ['hd', 'sd', 'hls'];
      const aIndex = qualityOrder.indexOf((a.quality || '').toLowerCase());
      const bIndex = qualityOrder.indexOf((b.quality || '').toLowerCase());
      
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      
      return aIndex - bIndex;
    });

    return sortedFiles[0] || files[0];
  }

  private updateRateLimitFromHeaders(response: any): void {
    if (response.headers) {
      const remaining = response.headers['x-ratelimit-remaining'];
      const reset = response.headers['x-ratelimit-reset'];
      
      if (remaining !== undefined) {
        this.rateLimitRemaining = parseInt(remaining, 10);
      }
      if (reset !== undefined) {
        this.rateLimitReset = parseInt(reset, 10) * 1000;
      }
    }
  }
}