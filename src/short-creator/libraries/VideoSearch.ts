import { OrientationEnum, Video } from "../../types/shorts";
import { VideoProvider, VideoSearchError } from "./VideoProvider";
import { logger } from "../../logger";
import { VideoProviderFacade } from "./VideoProviderFacade";

export class VideoSearch {
  constructor(
    private videoProviderFacade: VideoProviderFacade
  ) {}

  public async findVideo(
    searchTerms: string,
    duration: number,
    excludeVideoIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    projectId?: string
  ): Promise<Video> {
    logger.info({ searchTerms, duration, excludeVideoIds, orientation }, "🔍 Starting video search");

    return await this.videoProviderFacade.findVideo(
      [searchTerms],
      duration,
      excludeVideoIds,
      orientation,
      30000,
      0,
      projectId
    );
  }

  public async findVideos(
    searchTerms: string,
    duration: number,
    excludeVideoIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    count: number = 1,
    projectId?: string
  ): Promise<Video[]> {
    logger.info({ searchTerms, duration, excludeVideoIds, orientation, count }, "🔍 Starting video search for multiple videos");

    return await this.videoProviderFacade.findVideos(
        [searchTerms],
        duration,
        excludeVideoIds,
        orientation,
        count,
        30000,
        0,
        projectId
      );
  }

  public async findRandomVideo(
    excludeVideoIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait
  ): Promise<Video> {
    logger.info("Delegating random video search to VideoProviderFacade");
    return await this.videoProviderFacade.findRandomVideo(excludeVideoIds, orientation);
  }

  public async getVideoByUrl(url: string): Promise<Video> {
    logger.info({ url }, "🔍 Getting video by URL");
    return await this.videoProviderFacade.getVideoByUrl(url);
  }
} 