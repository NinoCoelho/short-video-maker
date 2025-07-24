// Database schema types for video import feature

export interface Video {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  file_path?: string;
  file_size?: bigint;
  format?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ImportJob {
  id: string;
  source_url: string;
  source_platform?: string;
  status: 'pending' | 'downloading' | 'transcribing' | 'analyzing' | 'segmenting' | 'completed' | 'failed';
  progress: number;
  video_id?: string;
  settings?: {
    targetDuration?: number;
    orientation?: 'portrait' | 'landscape' | 'square';
    language?: string;
    autoTranslate?: boolean;
    targetLanguages?: string[];
    highlightDetection?: boolean;
    minSegmentDuration?: number;
    maxSegmentDuration?: number;
  };
  error_message?: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

export interface Transcription {
  id: string;
  video_id: string;
  language: string;
  text: string;
  timestamps: Array<{
    start: number;
    end: number;
    text: string;
    confidence?: number;
  }>;
  confidence_score?: number;
  created_at: Date;
}

export interface Highlight {
  id: string;
  video_id: string;
  start_time: number;
  end_time: number;
  score: number;
  reason?: string;
  tags?: string[];
  created_at: Date;
}

export interface VideoSegment {
  id: string;
  parent_video_id: string;
  segment_number: number;
  start_time: number;
  end_time: number;
  title?: string;
  orientation?: 'portrait' | 'landscape' | 'square';
  crop_config?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  transcription_segment?: {
    text: string;
    timestamps: Array<{
      start: number;
      end: number;
      text: string;
    }>;
  };
  rendered_video_id?: string;
  created_at: Date;
}

export interface Translation {
  id: string;
  source_text_hash: string;
  source_language: string;
  target_language: string;
  translated_text: string;
  provider?: string;
  created_at: Date;
}