import { ImportVideoSegment as VideoSegment, Scene, SceneInput, RenderConfig, OrientationEnum, Caption, ImportedVideo, TranscriptionSegment } from "../../types/shorts";
import { logger } from "../../logger";
import cuid from "cuid";

export class ImportConverter {
  /**
   * Converts imported video segments into Scene format for rendering
   * Maps import metadata (highlights, transcriptions, crops) to render format
   * Preserves quality settings and aspect ratios
   */
  static convertSegmentsToScenes(
    segments: VideoSegment[],
    importedVideo: ImportedVideo,
    config: RenderConfig
  ): Scene[] {
    logger.info({ segmentCount: segments.length, videoId: importedVideo.id }, "Converting imported video segments to scenes");

    const scenes: Scene[] = [];

    for (const segment of segments) {
      try {
        const scene = this.convertSingleSegmentToScene(segment, importedVideo, config);
        scenes.push(scene);
        
        logger.debug({ 
          segmentId: segment.id, 
          sceneId: scene.id, 
          duration: scene.duration 
        }, "Converted segment to scene");
      } catch (error) {
        logger.error({ 
          segmentId: segment.id, 
          error 
        }, "Failed to convert segment to scene");
        throw error;
      }
    }

    logger.info({ 
      totalScenes: scenes.length, 
      videoId: importedVideo.id 
    }, "Successfully converted all segments to scenes");

    return scenes;
  }

  /**
   * Converts imported video segments to SceneInput format for the creation pipeline
   * This preserves the imported video references and metadata
   */
  static convertSegmentsToSceneInputs(
    segments: VideoSegment[],
    importedVideo: ImportedVideo,
    config: RenderConfig
  ): SceneInput[] {
    logger.info({ segmentCount: segments.length, videoId: importedVideo.id }, "Converting segments to SceneInput format");

    return segments.map((segment) => {
      const segmentTranscription = segment.transcription || [];
      const text = segmentTranscription.map(t => t.text).join(' ').trim();
      
      // Generate search terms from transcription or use default terms
      const searchTerms = this.extractSearchTermsFromTranscription(segmentTranscription, importedVideo);
      
      // Use the imported video URL with segment timing
      const videoUrl = this.buildSegmentVideoUrl(importedVideo, segment);
      
      // Convert transcription to captions format
      const captions = this.convertTranscriptionToCaptions(segmentTranscription);
      
      const sceneInput: SceneInput = {
        text: text || `Imported segment ${segment.start}-${segment.end}`,
        searchTerms,
        videos: [videoUrl],
        audio: segment.transcription ? {
          url: '', // Will be filled by TTS if needed
          duration: segment.end - segment.start
        } : undefined,
        captions: captions.length > 0 ? captions : undefined
      };

      logger.debug({ 
        segmentId: segment.id, 
        text: sceneInput.text, 
        videoUrl, 
        captionCount: captions.length 
      }, "Converted segment to SceneInput");

      return sceneInput;
    });
  }

  private static convertSingleSegmentToScene(
    segment: VideoSegment,
    importedVideo: ImportedVideo,
    config: RenderConfig
  ): Scene {
    const segmentDuration = segment.end - segment.start;
    const segmentTranscription = segment.transcription || [];
    
    // Extract text from transcription
    const text = segmentTranscription.map(t => t.text).join(' ').trim();
    
    // Generate search terms from transcription or video metadata
    const searchTerms = this.extractSearchTermsFromTranscription(segmentTranscription, importedVideo);
    
    // Build video URL with segment timing and crop information
    const videoUrl = this.buildSegmentVideoUrl(importedVideo, segment);
    
    // Convert transcription timestamps to captions
    const captions = this.convertTranscriptionToCaptions(segmentTranscription);
    
    // Determine orientation from segment or imported video
    const orientation = segment.orientation || this.determineOrientationFromVideo(importedVideo);
    
    const scene: Scene = {
      id: segment.id || cuid(),
      text: text || `Imported segment ${segment.start}-${segment.end}`,
      searchTerms,
      duration: segmentDuration,
      orientation,
      captions,
      videos: [videoUrl],
      audio: {
        url: '', // Will be populated by audio extraction or TTS
        duration: segmentDuration
      }
    };

    return scene;
  }

  private static buildSegmentVideoUrl(importedVideo: ImportedVideo, segment: VideoSegment): string {
    // Build URL that includes segment timing and crop information
    let videoUrl = `/api/imported-video/${importedVideo.id}`;
    
    const params = new URLSearchParams({
      start: segment.start.toString(),
      end: segment.end.toString()
    });

    // Add crop parameters if available
    if (segment.cropConfig) {
      params.append('crop', JSON.stringify(segment.cropConfig));
    }

    // Add target orientation if different from source
    if (segment.orientation && segment.orientation !== this.determineOrientationFromVideo(importedVideo)) {
      params.append('orientation', segment.orientation);
    }

    videoUrl += `?${params.toString()}`;

    logger.debug({ 
      segmentId: segment.id, 
      videoUrl, 
      hasCrop: !!segment.cropConfig 
    }, "Built segment video URL");

    return videoUrl;
  }

  private static extractSearchTermsFromTranscription(
    transcription: TranscriptionSegment[],
    importedVideo: ImportedVideo
  ): string[] {
    const searchTerms: string[] = [];
    
    if (transcription.length > 0) {
      // Extract key terms from transcription
      const allText = transcription.map(t => t.text).join(' ');
      const words = allText.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3)
        .filter(word => !this.isStopWord(word));
      
      // Get most frequent words
      const wordFreq: { [key: string]: number } = {};
      words.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      });
      
      const sortedWords = Object.entries(wordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([word]) => word);
      
      searchTerms.push(...sortedWords);
    }
    
    // Add fallback terms based on video platform or generic terms
    if (searchTerms.length === 0) {
      searchTerms.push(
        importedVideo.sourcePlatform,
        'video',
        'content',
        'social'
      );
    }
    
    // Ensure we have at least 3 search terms
    while (searchTerms.length < 3) {
      searchTerms.push('video', 'content', 'media');
    }
    
    return searchTerms.slice(0, 5); // Limit to 5 terms
  }

  private static convertTranscriptionToCaptions(
    transcription: TranscriptionSegment[]
  ): Caption[] {
    return transcription.map(segment => ({
      text: segment.text,
      startMs: segment.start * 1000, // Convert seconds to milliseconds
      endMs: segment.end * 1000
    }));
  }

  private static determineOrientationFromVideo(importedVideo: ImportedVideo): OrientationEnum {
    const { width, height } = importedVideo.originalResolution || importedVideo;
    
    if (width === height) {
      return OrientationEnum.square;
    } else if (height > width) {
      return OrientationEnum.portrait;
    } else {
      return OrientationEnum.landscape;
    }
  }

  private static isStopWord(word: string): boolean {
    const stopWords = [
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 
      'her', 'was', 'one', 'our', 'out', 'day', 'get', 'use', 'man', 'new',
      'now', 'way', 'may', 'say', 'each', 'which', 'she', 'how', 'its', 'who',
      'oil', 'sit', 'set', 'run', 'eat', 'far', 'sea', 'eye', 'ask', 'try'
    ];
    return stopWords.includes(word.toLowerCase());
  }

  /**
   * Maps import metadata to render-compatible format
   * Preserves quality settings, aspect ratios, and special handling cases
   */
  static mapImportMetadataToRenderFormat(
    importedVideo: ImportedVideo,
    segments: VideoSegment[],
    config: RenderConfig
  ): {
    preservedQuality: boolean;
    originalAspectRatio: { width: number; height: number };
    totalSegments: number;
    hasCustomCrops: boolean;
    specialCases: string[];
  } {
    const metadata = {
      preservedQuality: true,
      originalAspectRatio: importedVideo.originalResolution || { width: importedVideo.width, height: importedVideo.height },
      totalSegments: segments.length,
      hasCustomCrops: segments.some(s => s.cropConfig),
      specialCases: [] as string[]
    };

    // Check for special cases
    if (segments.length > 10) {
      metadata.specialCases.push('multiple_segments');
    }

    if (metadata.hasCustomCrops) {
      metadata.specialCases.push('custom_crops');
    }

    if (importedVideo.sourcePlatform === 'tiktok' || importedVideo.sourcePlatform === 'instagram') {
      metadata.specialCases.push('vertical_social_platform');
    }

    const totalDuration = segments.reduce((acc, segment) => acc + (segment.end - segment.start), 0);
    if (totalDuration > 300) { // More than 5 minutes
      metadata.specialCases.push('long_content');
    }

    logger.info({ 
      videoId: importedVideo.id, 
      metadata 
    }, "Mapped import metadata to render format");

    return metadata;
  }
}