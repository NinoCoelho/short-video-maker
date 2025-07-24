import { RenderConfig, SceneInput, ImportedVideo, VideoSegment, ImportSettings } from "../../types/shorts";

export interface QueueItem {
  id: string;
  sceneInput: SceneInput[];
  config: RenderConfig;
  status: "pending" | "processing" | "completed" | "failed";
  type?: "normal" | "import";
  priority?: "low" | "normal" | "high";
}

export interface ImportQueueItem extends QueueItem {
  type: "import";
  importedVideo: ImportedVideo;
  videoSegments: VideoSegment[];
  importSettings: ImportSettings;
  originalScenes?: SceneInput[]; // Backup of original scenes before import conversion
} 