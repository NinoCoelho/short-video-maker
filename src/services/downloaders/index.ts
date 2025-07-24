export { BaseDownloader, DownloadOptions, VideoMetadata, DownloadResult, DownloadProgress } from './BaseDownloader';
export { YouTubeDownloader } from './YouTubeDownloader';
export { FacebookDownloader } from './FacebookDownloader';
export { InstagramDownloader } from './InstagramDownloader';
export { TikTokDownloader } from './TikTokDownloader';
export { GenericDownloader } from './GenericDownloader';
export { DownloaderManager, DownloaderConfig } from './DownloaderManager';
import { DownloaderManager, DownloaderConfig } from './DownloaderManager';

// Convenience function to create a pre-configured downloader manager
export function createDownloaderManager(config?: DownloaderConfig): DownloaderManager {
  return new DownloaderManager(config);
}