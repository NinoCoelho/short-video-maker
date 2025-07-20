import { OrientationEnum, Video } from "../../types/shorts";
import { VideoSearchError, VideoProvider } from "./VideoProvider";
import { logger } from "../../logger";
import { Config } from "../../config";

export class LocalImageAPI implements VideoProvider {
  constructor(private config: Config, private port: number = 3123) {}

  async findVideo(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    timeout: number = 30000,
    retryCounter: number = 0,
  ): Promise<Video> {
    const videos = await this.findVideos(searchTerms, minDurationSeconds, excludeIds, orientation, 1);
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
  ): Promise<Video[]> {
    const originalQuery = searchTerms.join(" ");
    let queryWords = originalQuery.split(" ");

    while (queryWords.length > 0) {
      const currentQuery = queryWords.join(" ");
    try {
        logger.info({ query: currentQuery }, "Attempting video search with query");
        
        const response = await fetch(`${this.config.videoServerUrl}/v1/videos?query=${encodeURIComponent(currentQuery)}&per_page=20&orientation=${orientation === OrientationEnum.portrait ? "portrait" : "landscape"}`);

      if (!response.ok) {
          logger.warn({ query: currentQuery, status: response.status }, "API request failed.");
          queryWords.pop();
          continue;
      }
        
      const data = await response.json();
        
        if (!data || data.length === 0) {
          logger.warn({ query: currentQuery }, "Query yielded no results.");
          queryWords.pop();
          continue;
        }

      const availableVideos = data
        .filter((video: any) => !excludeIds.includes(video.id.toString()))
        .sort((a: any, b: any) => Math.abs(a.duration - minDurationSeconds) - Math.abs(b.duration - minDurationSeconds));

        if (availableVideos.length > 0) {
      const selectedVideos = [];
      const usedIndices = new Set<number>();
          while (selectedVideos.length < count && usedIndices.size < availableVideos.length) {
        const randomIndex = Math.floor(Math.random() * availableVideos.length);
        if (!usedIndices.has(randomIndex)) {
          usedIndices.add(randomIndex);
          const video = availableVideos[randomIndex];
              selectedVideos.push({
                id: video.id.toString(),
                url: `${this.config.videoServerUrl}${video.file_path}`,
                duration: video.duration,
                width: video.width,
                height: video.height,
              });
            }
          }
          if (selectedVideos.length > 0) {
            logger.info({ query: currentQuery, count: selectedVideos.length }, "Successfully found videos.");
            return selectedVideos;
          }
        }
      } catch (error) {
        logger.error({ query: currentQuery, error }, "An unexpected error occurred during video search.");
      }

      // Se chegamos aqui, a tentativa falhou. Tenta com uma query mais curta.
      queryWords.pop();
    }

    // ÚLTIMO RECURSO: Tenta uma busca em branco
    try {
      logger.info("Falling back to an empty search as a last resort.");
      const response = await fetch(`${this.config.videoServerUrl}/v1/videos?query=&per_page=20&orientation=${orientation === OrientationEnum.portrait ? "portrait" : "landscape"}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const video = data[Math.floor(Math.random() * data.length)];
          return [{
            id: video.id.toString(),
            url: `${this.config.videoServerUrl}${video.file_path}`,
            duration: video.duration,
            width: video.width,
            height: video.height,
          }];
        }
      }
    } catch (error) {
      logger.error({ error }, "Empty search fallback also failed.");
        }

    logger.error({ originalQuery }, "No videos found for any variation of the search query.");
    throw new VideoSearchError(`No videos found for any variation of the search query: ${originalQuery}`);
  }

  public async findRandomVideo(
    excludeIds: string[],
    orientation: OrientationEnum = OrientationEnum.portrait
  ): Promise<Video> {
    logger.info("Searching for a random video.");
    // Usa a busca em branco para pegar um vídeo aleatório
    const videos = await this.findVideos([], 10, excludeIds, orientation, 1);
    if (videos.length === 0) {
      throw new VideoSearchError("Could not find any random video.");
    }
    return videos[0];
  }

  async getVideoById(id: string): Promise<Video> {
    try {
      const response = await fetch(`${this.config.videoServerUrl}/v1/videos?query=${id}&per_page=1`);
      if (!response.ok) {
        throw new VideoSearchError(`LocalImageAPI request for id ${id} failed`);
      }
      const data = await response.json();
      
      if (!data || data.length === 0) {
        throw new VideoSearchError(`Video with id ${id} not found in LocalImageAPI`);
      }

      const video = data[0];
      return {
        id: video.id.toString(),
        url: `${this.config.videoServerUrl}${video.file_path}`,
        duration: video.duration,
        width: video.width,
        height: video.height,
      };
    } catch (error) {
      throw new VideoSearchError(`Error getting video by id in LocalImageAPI: ${id}`);
    }
  }

  async getVideoByUrl(url: string): Promise<Video> {
    try {
      // Extrai o ID da URL
      const urlParts = url.split('/');
      const id = urlParts[urlParts.length - 1];
      
      if (!id || !/^\d+$/.test(id)) {
        throw new VideoSearchError(`Could not extract valid video ID from URL: ${url}`);
      }

      logger.info({ url }, "🔍 Getting video by URL");
      
      // Faz uma consulta real à API usando o ID extraído
      try {
        const response = await fetch(`${this.config.videoServerUrl}/v1/videos/${id}`);
        
        if (response.ok) {
          const videoData = await response.json();
          return {
            id: videoData.id.toString(),
            url: `${this.config.videoServerUrl}${videoData.file_path}`,
            duration: videoData.duration,
            width: videoData.width,
            height: videoData.height,
          };
        }
      } catch (apiError) {
        logger.warn({ id, error: apiError }, "Direct API call failed, trying query search");
      }
      
      // Se a consulta direta falhar, tenta buscar por query
      try {
        const searchResponse = await fetch(`${this.config.videoServerUrl}/v1/videos?query=${id}&per_page=1`);
        
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData && searchData.length > 0) {
            const video = searchData[0];
            return {
              id: video.id.toString(),
              url: `${this.config.videoServerUrl}${video.file_path}`,
              duration: video.duration,
              width: video.width,
              height: video.height,
            };
          }
        }
      } catch (searchError) {
        logger.warn({ id, error: searchError }, "Query search also failed");
      }
      
      // Se ambas as tentativas falharam, mas ainda temos a URL original,
      // retorna dados estimados para permitir que o processo continue
      logger.warn({ url }, "API calls failed, using fallback video data");
      return {
        id: id,
        url: url, // Usa a URL original
        duration: 10.0, // Duração padrão
        width: 1920,
        height: 1080,
      };
      
    } catch (error) {
      logger.error({ url, error }, "Error getting video by URL");
      throw new VideoSearchError(`Error getting video by URL: ${url} - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 