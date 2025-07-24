import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from '../logger';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { TranscriptSegment } from '../types/import';

export interface VideoSegment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  outputPath?: string;
  metadata?: VideoMetadata;
  keyframeAligned?: boolean;
  transcriptSegments?: Array<{ text: string; startTime: number; endTime: number }>;
}

export interface VideoMetadata {
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
  duration: number;
}

export interface SegmentOptions {
  format?: 'mp4' | 'webm' | 'mov';
  codec?: string;
  quality?: 'high' | 'medium' | 'low';
  preserveAudio?: boolean;
  fadeIn?: number; // Duration in seconds
  fadeOut?: number; // Duration in seconds
  speed?: number; // Speed multiplier (1 = normal, 2 = 2x speed, 0.5 = half speed)
  transition?: 'none' | 'fade' | 'dissolve' | 'wipe' | 'slide';
  transitionDuration?: number;
  alignToKeyframes?: boolean;
  minDuration?: number;
  maxDuration?: number;
  alignToSpeech?: boolean;
  contextPadding?: number; // Extra seconds before/after for context
}

export interface SceneDetectionOptions {
  threshold?: number; // Scene change threshold (0-1)
  minSceneDuration?: number; // Minimum scene duration in seconds
  method?: 'content' | 'threshold' | 'histogram';
}

export class VideoSegmentService extends EventEmitter {
  private tempDir: string;
  private ffmpegPath: string;
  private ffprobePath: string;

  constructor(dataDir: string) {
    super();
    this.tempDir = path.join(dataDir, 'temp', 'segments');
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    this.ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      await fs.ensureDir(this.tempDir);
      ffmpeg.setFfmpegPath(this.ffmpegPath);
      ffmpeg.setFfprobePath(this.ffprobePath);
      logger.info({ tempDir: this.tempDir }, 'Video segment service initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize video segment service');
      throw error;
    }
  }

  /**
   * Get video metadata
   */
  public async getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        resolve({
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps: this.parseFps(videoStream.r_frame_rate || '0'),
          codec: videoStream.codec_name || '',
          bitrate: parseInt(videoStream.bit_rate || '0'),
          duration: metadata.format.duration || 0
        });
      });
    });
  }

  /**
   * Cut video into segments based on timestamps with enhanced options
   */
  public async cutSegments(
    videoPath: string,
    segments: Array<{ startTime: number; endTime: number }>,
    options: SegmentOptions = {},
    transcriptSegments?: TranscriptSegment[]
  ): Promise<VideoSegment[]> {
    const jobId = this.generateJobId();
    const outputDir = path.join(this.tempDir, jobId);
    await fs.ensureDir(outputDir);

    this.emit('segmentation:started', { videoPath, segments: segments.length });

    const results: VideoSegment[] = [];
    const metadata = await this.getVideoMetadata(videoPath);
    
    // Get keyframes if alignment is requested
    let keyframes: number[] = [];
    if (options.alignToKeyframes) {
      keyframes = await this.detectKeyframes(videoPath);
    }

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      let { startTime, endTime } = segment;
      
      // Apply duration constraints
      const duration = endTime - startTime;
      if (options.minDuration && duration < options.minDuration) {
        logger.warn({ segment, minDuration: options.minDuration }, 'Segment shorter than minimum duration');
        continue;
      }
      if (options.maxDuration && duration > options.maxDuration) {
        endTime = startTime + options.maxDuration;
      }
      
      // Align to keyframes if requested
      if (options.alignToKeyframes && keyframes.length > 0) {
        startTime = this.findNearestKeyframe(startTime, keyframes, 'before');
        endTime = this.findNearestKeyframe(endTime, keyframes, 'after');
      }
      
      // Align to speech boundaries if requested
      let relevantTranscripts: TranscriptSegment[] | undefined;
      if (options.alignToSpeech && transcriptSegments) {
        const aligned = this.alignToSpeechBoundaries(startTime, endTime, transcriptSegments);
        startTime = aligned.startTime;
        endTime = aligned.endTime;
        relevantTranscripts = aligned.segments;
      }
      
      // Apply context padding
      if (options.contextPadding) {
        startTime = Math.max(0, startTime - options.contextPadding);
        endTime = Math.min(metadata.duration, endTime + options.contextPadding);
      }
      
      const segmentId = `segment-${i}`;
      const outputPath = path.join(outputDir, `${segmentId}.${options.format || 'mp4'}`);

      try {
        await this.cutSingleSegment(
          videoPath,
          startTime,
          endTime,
          outputPath,
          options
        );

        const videoSegment: VideoSegment = {
          id: segmentId,
          startTime,
          endTime,
          duration: endTime - startTime,
          outputPath,
          metadata,
          keyframeAligned: options.alignToKeyframes,
          transcriptSegments: relevantTranscripts?.map(t => ({
            text: t.text,
            startTime: t.startTime - startTime, // Relative to segment
            endTime: t.endTime - startTime
          }))
        };

        results.push(videoSegment);
        
        const progress = ((i + 1) / segments.length) * 100;
        this.emit('segmentation:progress', { progress, completed: i + 1, total: segments.length });
      } catch (error) {
        logger.error({ error, segment }, 'Failed to cut segment');
        this.emit('segmentation:error', { error, segment });
      }
    }

    this.emit('segmentation:completed', { segments: results });
    return results;
  }

  /**
   * Cut a single segment from video with enhanced quality preservation
   */
  private async cutSingleSegment(
    inputPath: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    options: SegmentOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const duration = endTime - startTime;
      
      // Use more precise seeking for better cut accuracy
      const command = ffmpeg(inputPath)
        .seekInput(startTime) // Seek in input for faster processing
        .duration(duration);

      // Apply quality settings first
      this.applyQualitySettings(command, options);

      // Build complex filter for effects
      const videoFilters: string[] = [];
      const audioFilters: string[] = [];

      // Apply fade effects
      if (options.fadeIn || options.fadeOut) {
        const fadeFilters = this.buildFadeFilters(duration, options.fadeIn, options.fadeOut);
        videoFilters.push(...fadeFilters.video);
        if (options.preserveAudio !== false) {
          audioFilters.push(...fadeFilters.audio);
        }
      }

      // Apply speed adjustment
      if (options.speed && options.speed !== 1) {
        videoFilters.push(`setpts=${1 / options.speed}*PTS`);
        if (options.preserveAudio !== false) {
          // Handle audio tempo adjustment for various speeds
          const tempoFilters = this.buildTempoFilters(options.speed);
          audioFilters.push(...tempoFilters);
        }
      }

      // Apply filters
      if (videoFilters.length > 0) {
        command.videoFilters(videoFilters);
      }
      if (audioFilters.length > 0) {
        command.audioFilters(audioFilters);
      }

      // Audio handling
      if (options.preserveAudio === false) {
        command.noAudio();
      } else {
        // Ensure audio sync
        command.outputOptions([
          '-async', '1',
          '-vsync', '1'
        ]);
      }

      // Additional output options for quality
      command.outputOptions([
        '-avoid_negative_ts', 'make_zero',
        '-fflags', '+genpts',
        '-max_muxing_queue_size', '9999'
      ]);

      command
        .output(outputPath)
        .on('progress', (progress) => {
          logger.debug({ progress }, 'Segment cutting progress');
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Detect scenes automatically
   */
  public async detectScenes(
    videoPath: string,
    options: SceneDetectionOptions = {}
  ): Promise<VideoSegment[]> {
    const {
      threshold = 0.3,
      minSceneDuration = 1,
      method = 'content'
    } = options;

    this.emit('scene-detection:started', { videoPath, options });

    try {
      // Use ffmpeg scene detection filter
      const scenesData = await this.runSceneDetection(videoPath, threshold, method);
      
      // Filter out scenes shorter than minimum duration
      const filteredScenes = this.filterShortScenes(scenesData, minSceneDuration);
      
      // Convert to VideoSegment format
      const segments = await this.convertToSegments(filteredScenes, videoPath);
      
      this.emit('scene-detection:completed', { scenes: segments.length });
      return segments;
    } catch (error) {
      this.emit('scene-detection:error', error);
      throw error;
    }
  }

  /**
   * Run ffmpeg scene detection
   */
  private async runSceneDetection(
    videoPath: string,
    threshold: number,
    method: string
  ): Promise<Array<{ time: number; score: number }>> {
    const outputPath = path.join(this.tempDir, `scene-${Date.now()}.txt`);
    
    let filter = '';
    switch (method) {
      case 'content':
        filter = `select='gt(scene,${threshold})',showinfo`;
        break;
      case 'threshold':
        filter = `blackdetect=d=0.1:pix_th=${threshold}`;
        break;
      case 'histogram':
        filter = `select='gt(scene,${threshold})',metadata=print:file=${outputPath}`;
        break;
      default:
        filter = `select='gt(scene,${threshold})',showinfo`;
    }

    const args = [
      '-i', videoPath,
      '-filter:v', filter,
      '-an',
      '-f', 'null',
      '-'
    ];
    
    const output = await this.runFFmpegCommand(args);

    // Parse scene changes from output
    const scenes: Array<{ time: number; score: number }> = [];
    const regex = /pts_time:(\d+\.?\d*)/g;
    let match;

    while ((match = regex.exec(output)) !== null) {
      scenes.push({
        time: parseFloat(match[1]),
        score: 1 // Default score, could be extracted from output if available
      });
    }

    return scenes;
  }

  /**
   * Split video into equal duration chunks
   */
  public async splitIntoChunks(
    videoPath: string,
    chunkDuration: number,
    options: SegmentOptions = {}
  ): Promise<VideoSegment[]> {
    const metadata = await this.getVideoMetadata(videoPath);
    const totalDuration = metadata.duration;
    
    const segments: Array<{ startTime: number; endTime: number }> = [];
    
    for (let start = 0; start < totalDuration; start += chunkDuration) {
      const end = Math.min(start + chunkDuration, totalDuration);
      segments.push({ startTime: start, endTime: end });
    }
    
    return this.cutSegments(videoPath, segments, options);
  }

  /**
   * Smart segmentation that combines scene detection and transcription
   * for optimal context preservation
   */
  public async smartSegmentation(
    videoPath: string,
    transcriptSegments?: TranscriptSegment[],
    options: {
      preferredDuration?: number;
      minDuration?: number;
      maxDuration?: number;
      useSceneDetection?: boolean;
      preserveContext?: boolean;
      quality?: 'high' | 'medium' | 'low';
    } = {}
  ): Promise<VideoSegment[]> {
    const {
      preferredDuration = 30,
      minDuration = 10,
      maxDuration = 60,
      useSceneDetection = true,
      preserveContext = true,
      quality = 'medium'
    } = options;

    this.emit('smart-segmentation:started', { videoPath, options });

    try {
      const metadata = await this.getVideoMetadata(videoPath);
      let segments: Array<{ startTime: number; endTime: number }> = [];

      if (useSceneDetection) {
        // First, detect scenes
        const detectedScenes = await this.detectScenes(videoPath, {
          minSceneDuration: minDuration
        });
        
        // Convert scenes to basic segments
        segments = detectedScenes.map(scene => ({
          startTime: scene.startTime,
          endTime: scene.endTime
        }));
      }

      // If no scenes detected or scene detection disabled, use time-based chunks
      if (segments.length === 0) {
        segments = [];
        for (let start = 0; start < metadata.duration; start += preferredDuration) {
          const end = Math.min(start + preferredDuration, metadata.duration);
          segments.push({ startTime: start, endTime: end });
        }
      }

      // Optimize segments based on transcription and preferences
      if (transcriptSegments && transcriptSegments.length > 0) {
        segments = this.optimizeSegmentsWithTranscript(
          segments,
          transcriptSegments,
          { minDuration, maxDuration, preferredDuration, preserveContext }
        );
      }

      // Cut the optimized segments
      const cutOptions: SegmentOptions = {
        quality,
        alignToKeyframes: true,
        alignToSpeech: !!transcriptSegments,
        contextPadding: preserveContext ? 1 : 0,
        minDuration,
        maxDuration
      };

      const result = await this.cutSegments(videoPath, segments, cutOptions, transcriptSegments);
      
      this.emit('smart-segmentation:completed', { 
        segments: result.length,
        totalDuration: result.reduce((sum, seg) => sum + seg.duration, 0)
      });

      return result;
    } catch (error) {
      this.emit('smart-segmentation:error', error);
      throw error;
    }
  }

  /**
   * Optimize segments based on transcript content for better context
   */
  private optimizeSegmentsWithTranscript(
    segments: Array<{ startTime: number; endTime: number }>,
    transcriptSegments: TranscriptSegment[],
    options: {
      minDuration: number;
      maxDuration: number;
      preferredDuration: number;
      preserveContext: boolean;
    }
  ): Array<{ startTime: number; endTime: number }> {
    const optimized: Array<{ startTime: number; endTime: number }> = [];

    for (const segment of segments) {
      // Find transcript segments that overlap with this video segment
      const overlappingTranscripts = transcriptSegments.filter(
        t => t.endTime > segment.startTime && t.startTime < segment.endTime
      );

      if (overlappingTranscripts.length === 0) {
        // No speech in this segment, keep as is
        optimized.push(segment);
        continue;
      }

      // Group transcript segments into logical chunks
      const speechChunks = this.groupTranscriptIntoChunks(
        overlappingTranscripts,
        options
      );

      // Convert speech chunks to video segments
      for (const chunk of speechChunks) {
        const chunkStart = Math.max(segment.startTime, chunk.startTime);
        const chunkEnd = Math.min(segment.endTime, chunk.endTime);
        
        if (chunkEnd - chunkStart >= options.minDuration) {
          optimized.push({
            startTime: chunkStart,
            endTime: chunkEnd
          });
        }
      }
    }

    return optimized;
  }

  /**
   * Group transcript segments into logical chunks based on content
   */
  private groupTranscriptIntoChunks(
    transcripts: TranscriptSegment[],
    options: { minDuration: number; maxDuration: number; preferredDuration: number }
  ): Array<{ startTime: number; endTime: number; text: string }> {
    const chunks: Array<{ startTime: number; endTime: number; text: string }> = [];
    let currentChunk: { startTime: number; endTime: number; text: string } | null = null;

    for (const transcript of transcripts) {
      if (!currentChunk) {
        currentChunk = {
          startTime: transcript.startTime,
          endTime: transcript.endTime,
          text: transcript.text
        };
        continue;
      }

      const chunkDuration = currentChunk.endTime - currentChunk.startTime;
      const extendedDuration = transcript.endTime - currentChunk.startTime;

      // Check if we should extend current chunk or start a new one
      const shouldStartNew = 
        extendedDuration > options.maxDuration ||
        (chunkDuration >= options.preferredDuration && this.isNaturalBreak(transcript.text)) ||
        (transcript.startTime - currentChunk.endTime > 2); // Gap longer than 2 seconds

      if (shouldStartNew) {
        if (chunkDuration >= options.minDuration) {
          chunks.push(currentChunk);
        }
        currentChunk = {
          startTime: transcript.startTime,
          endTime: transcript.endTime,
          text: transcript.text
        };
      } else {
        // Extend current chunk
        currentChunk.endTime = transcript.endTime;
        currentChunk.text += ' ' + transcript.text;
      }
    }

    // Add last chunk if valid
    if (currentChunk && (currentChunk.endTime - currentChunk.startTime) >= options.minDuration) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Determine if text represents a natural break point
   */
  private isNaturalBreak(text: string): boolean {
    const breakPhrases = [
      '.',
      '!',
      '?',
      'and so',
      'therefore',
      'however',
      'meanwhile',
      'on the other hand',
      'in conclusion',
      'finally',
      'next',
      'then'
    ];

    const lowercaseText = text.toLowerCase().trim();
    return breakPhrases.some(phrase => 
      lowercaseText.endsWith(phrase) || 
      lowercaseText.includes(phrase)
    );
  }

  /**
   * Extract highlights based on audio levels
   */
  public async extractHighlights(
    videoPath: string,
    options: {
      minVolume?: number;
      minDuration?: number;
      maxDuration?: number;
    } = {}
  ): Promise<VideoSegment[]> {
    const {
      minVolume = -20, // dB
      minDuration = 3,
      maxDuration = 30
    } = options;

    // Analyze audio levels
    const audioData = await this.analyzeAudioLevels(videoPath);
    
    // Find segments with high audio activity
    const highlights = this.findHighlightSegments(
      audioData,
      minVolume,
      minDuration,
      maxDuration
    );
    
    // Cut the highlight segments
    return this.cutSegments(videoPath, highlights, { quality: 'high' });
  }

  /**
   * Merge multiple segments into one video with transitions
   */
  public async mergeSegments(
    segments: VideoSegment[],
    outputPath: string,
    options: {
      transition?: 'none' | 'fade' | 'dissolve' | 'wipe' | 'slide';
      transitionDuration?: number;
      quality?: 'high' | 'medium' | 'low';
      format?: 'mp4' | 'webm' | 'mov';
    } = {}
  ): Promise<string> {
    const { 
      transition = 'none', 
      transitionDuration = 0.5,
      quality = 'medium',
      format = 'mp4'
    } = options;
    
    if (segments.length === 0) {
      throw new Error('No segments to merge');
    }

    this.emit('merge:started', { segments: segments.length });

    // For single segment, just copy it
    if (segments.length === 1 && transition === 'none') {
      await fs.copy(segments[0].outputPath!, outputPath);
      this.emit('merge:completed', { outputPath });
      return outputPath;
    }

    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      if (transition !== 'none' && segments.length > 1) {
        // Use complex filter for transitions
        segments.forEach(segment => {
          command.input(segment.outputPath!);
        });
        
        const filters = this.buildTransitionFilters(segments, transition, transitionDuration);
        command.complexFilter(filters);
        
        // Map the output
        command.outputOptions([
          '-map', '[out]',
          '-map', '[outa]'
        ]);
      } else {
        // Simple concatenation without transitions
        const concatFile = path.join(this.tempDir, `concat-${Date.now()}.txt`);
        const fileContent = segments
          .map(s => `file '${s.outputPath}'`)
          .join('\n');
        
        fs.writeFileSync(concatFile, fileContent);
        
        command
          .input(concatFile)
          .inputOptions(['-f', 'concat', '-safe', '0']);
          
        // Cleanup concat file after completion
        command.on('end', () => fs.unlinkSync(concatFile));
      }

      // Apply quality settings
      this.applyQualitySettings(command, { quality, format });

      // Additional output options for stability
      command
        .outputOptions([
          '-movflags +faststart',
          '-avoid_negative_ts make_zero',
          '-fflags +genpts'
        ])
        .output(outputPath)
        .on('start', (cmdline) => {
          logger.debug({ cmdline }, 'FFmpeg merge command');
        })
        .on('progress', (progress) => {
          this.emit('merge:progress', progress);
        })
        .on('end', () => {
          this.emit('merge:completed', { outputPath });
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error({ err }, 'Merge error');
          this.emit('merge:error', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Apply quality settings to ffmpeg command with enhanced preservation
   */
  private applyQualitySettings(command: any, options: SegmentOptions): void {
    const { quality = 'medium', codec, format = 'mp4' } = options;

    let crf: number;
    let preset: string;
    let videoBitrate: string | null = null;

    switch (quality) {
      case 'high':
        crf = 18;
        preset = 'slow';
        videoBitrate = '5M';
        break;
      case 'low':
        crf = 28;
        preset = 'veryfast';
        videoBitrate = '1M';
        break;
      default:
        crf = 23;
        preset = 'medium';
        videoBitrate = '2.5M';
    }

    if (format === 'mp4') {
      command
        .videoCodec(codec || 'libx264')
        .outputOptions([
          `-crf ${crf}`,
          `-preset ${preset}`,
          '-movflags +faststart',
          '-pix_fmt yuv420p', // Ensure compatibility
          '-profile:v high',
          '-level 4.1'
        ]);
      
      if (videoBitrate) {
        command.videoBitrate(videoBitrate);
      }
      
      // High quality audio
      command.audioCodec('aac')
        .audioBitrate('192k')
        .audioFrequency(48000);
        
    } else if (format === 'webm') {
      command
        .videoCodec('libvpx-vp9')
        .outputOptions([
          '-b:v', videoBitrate || '2M',
          '-crf', String(crf),
          '-cpu-used', quality === 'high' ? '0' : '2',
          '-row-mt', '1',
          '-threads', '0'
        ])
        .audioCodec('libopus')
        .audioBitrate('128k');
        
    } else if (format === 'mov') {
      command
        .videoCodec('libx264')
        .outputOptions([
          `-crf ${crf}`,
          `-preset ${preset}`,
          '-pix_fmt yuv420p'
        ])
        .audioCodec('aac')
        .audioBitrate('192k');
    }
  }

  /**
   * Filter short scenes
   */
  private filterShortScenes(
    scenes: Array<{ time: number; score: number }>,
    minDuration: number
  ): Array<{ time: number; score: number }> {
    if (scenes.length < 2) return scenes;

    const filtered: Array<{ time: number; score: number }> = [scenes[0]];

    for (let i = 1; i < scenes.length; i++) {
      const duration = scenes[i].time - filtered[filtered.length - 1].time;
      if (duration >= minDuration) {
        filtered.push(scenes[i]);
      }
    }

    return filtered;
  }

  /**
   * Convert scene data to video segments
   */
  private async convertToSegments(
    scenes: Array<{ time: number; score: number }>,
    videoPath: string
  ): Promise<VideoSegment[]> {
    const metadata = await this.getVideoMetadata(videoPath);
    const segments: VideoSegment[] = [];

    for (let i = 0; i < scenes.length - 1; i++) {
      segments.push({
        id: `scene-${i}`,
        startTime: scenes[i].time,
        endTime: scenes[i + 1].time,
        duration: scenes[i + 1].time - scenes[i].time,
        metadata
      });
    }

    // Add last segment
    if (scenes.length > 0) {
      segments.push({
        id: `scene-${scenes.length - 1}`,
        startTime: scenes[scenes.length - 1].time,
        endTime: metadata.duration,
        duration: metadata.duration - scenes[scenes.length - 1].time,
        metadata
      });
    }

    return segments;
  }

  /**
   * Analyze audio levels
   */
  private async analyzeAudioLevels(
    videoPath: string
  ): Promise<Array<{ time: number; level: number }>> {
    const args = [
      '-i', videoPath,
      '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
      '-f', 'null',
      '-'
    ];
    
    const output = await this.runFFmpegCommand(args);

    // Parse audio levels from output
    const levels: Array<{ time: number; level: number }> = [];
    const lines = output.split('\n');
    let currentTime = 0;

    for (const line of lines) {
      if (line.includes('pts_time:')) {
        const match = line.match(/pts_time:(\d+\.?\d*)/);
        if (match) {
          currentTime = parseFloat(match[1]);
        }
      } else if (line.includes('lavfi.astats.Overall.RMS_level')) {
        const match = line.match(/value=(-?\d+\.?\d*)/);
        if (match) {
          levels.push({
            time: currentTime,
            level: parseFloat(match[1])
          });
        }
      }
    }

    return levels;
  }

  /**
   * Find highlight segments based on audio levels
   */
  private findHighlightSegments(
    audioData: Array<{ time: number; level: number }>,
    minVolume: number,
    minDuration: number,
    maxDuration: number
  ): Array<{ startTime: number; endTime: number }> {
    const highlights: Array<{ startTime: number; endTime: number }> = [];
    let currentHighlight: { startTime: number; endTime: number } | null = null;

    for (let i = 0; i < audioData.length; i++) {
      const { time, level } = audioData[i];

      if (level >= minVolume) {
        if (!currentHighlight) {
          currentHighlight = { startTime: time, endTime: time };
        } else {
          currentHighlight.endTime = time;
        }
      } else if (currentHighlight) {
        const duration = currentHighlight.endTime - currentHighlight.startTime;
        if (duration >= minDuration && duration <= maxDuration) {
          highlights.push(currentHighlight);
        }
        currentHighlight = null;
      }
    }

    // Handle last highlight
    if (currentHighlight) {
      const duration = currentHighlight.endTime - currentHighlight.startTime;
      if (duration >= minDuration && duration <= maxDuration) {
        highlights.push(currentHighlight);
      }
    }

    return highlights;
  }

  /**
   * Build transition filters for merging segments with effects
   */
  private buildTransitionFilters(
    segments: VideoSegment[],
    transition: string,
    duration: number
  ): string {
    if (segments.length < 2 || transition === 'none') {
      return '';
    }
    
    const filters: string[] = [];
    let streamLabels: string[] = [];
    
    // Label input streams
    for (let i = 0; i < segments.length; i++) {
      streamLabels.push(`[${i}:v]`);
    }
    
    // Build transition effects between segments
    for (let i = 0; i < segments.length - 1; i++) {
      const inputA = i === 0 ? streamLabels[i] : `[v${i}]`;
      const inputB = streamLabels[i + 1];
      const output = i === segments.length - 2 ? '[out]' : `[v${i + 1}]`;
      
      switch (transition) {
        case 'fade':
          filters.push(
            `${inputA}${inputB}xfade=transition=fade:duration=${duration}:offset=${this.calculateOffset(segments, i, duration)}${output}`
          );
          break;
          
        case 'dissolve':
          filters.push(
            `${inputA}${inputB}xfade=transition=dissolve:duration=${duration}:offset=${this.calculateOffset(segments, i, duration)}${output}`
          );
          break;
          
        case 'wipe':
          filters.push(
            `${inputA}${inputB}xfade=transition=wipeleft:duration=${duration}:offset=${this.calculateOffset(segments, i, duration)}${output}`
          );
          break;
          
        case 'slide':
          filters.push(
            `${inputA}${inputB}xfade=transition=slideleft:duration=${duration}:offset=${this.calculateOffset(segments, i, duration)}${output}`
          );
          break;
          
        default:
          // Default to fade
          filters.push(
            `${inputA}${inputB}xfade=transition=fade:duration=${duration}:offset=${this.calculateOffset(segments, i, duration)}${output}`
          );
      }
    }
    
    // If we have audio, crossfade it too
    const audioFilters: string[] = [];
    for (let i = 0; i < segments.length - 1; i++) {
      const inputA = i === 0 ? `[${i}:a]` : `[a${i}]`;
      const inputB = `[${i + 1}:a]`;
      const output = i === segments.length - 2 ? '[outa]' : `[a${i + 1}]`;
      
      audioFilters.push(
        `${inputA}${inputB}acrossfade=d=${duration}:c1=tri:c2=tri${output}`
      );
    }
    
    // Combine video and audio filters
    let complexFilter = filters.join(';');
    if (audioFilters.length > 0) {
      complexFilter += ';' + audioFilters.join(';');
    }
    
    return complexFilter;
  }

  /**
   * Calculate offset for transitions based on segment durations
   */
  private calculateOffset(segments: VideoSegment[], index: number, transitionDuration: number): number {
    let offset = 0;
    for (let i = 0; i <= index; i++) {
      offset += segments[i].duration;
    }
    // Subtract transition overlaps
    offset -= transitionDuration * (index + 1);
    return Math.max(0, offset);
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `segment-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Detect keyframes in video for clean cuts
   */
  private async detectKeyframes(videoPath: string): Promise<number[]> {
    const args = [
      '-i', videoPath,
      '-filter:v', "select='eq(pict_type,I)',showinfo",
      '-an',
      '-f', 'null',
      '-'
    ];
    
    try {
      const output = await this.runFFmpegCommand(args);
      
      const keyframes: number[] = [];
      const regex = /pts_time:(\d+\.?\d*)/g;
      let match;
      
      while ((match = regex.exec(output)) !== null) {
        keyframes.push(parseFloat(match[1]));
      }
      
      logger.info({ count: keyframes.length }, 'Detected keyframes');
      return keyframes.sort((a, b) => a - b);
    } catch (error) {
      logger.error({ error }, 'Failed to detect keyframes');
      return [];
    }
  }

  /**
   * Find nearest keyframe to a given timestamp
   */
  private findNearestKeyframe(
    timestamp: number,
    keyframes: number[],
    direction: 'before' | 'after' = 'before'
  ): number {
    if (keyframes.length === 0) return timestamp;
    
    let nearest = timestamp;
    let minDiff = Infinity;
    
    for (const keyframe of keyframes) {
      const diff = Math.abs(keyframe - timestamp);
      
      if (direction === 'before' && keyframe <= timestamp && diff < minDiff) {
        minDiff = diff;
        nearest = keyframe;
      } else if (direction === 'after' && keyframe >= timestamp && diff < minDiff) {
        minDiff = diff;
        nearest = keyframe;
      }
    }
    
    // If no suitable keyframe found, use closest one
    if (nearest === timestamp && keyframes.length > 0) {
      nearest = keyframes.reduce((prev, curr) => 
        Math.abs(curr - timestamp) < Math.abs(prev - timestamp) ? curr : prev
      );
    }
    
    return nearest;
  }

  /**
   * Align segment boundaries to speech boundaries
   */
  private alignToSpeechBoundaries(
    startTime: number,
    endTime: number,
    transcriptSegments: TranscriptSegment[]
  ): { startTime: number; endTime: number; segments: TranscriptSegment[] } {
    // Find all transcript segments that overlap with our time range
    const overlapping = transcriptSegments.filter(
      seg => seg.endTime > startTime && seg.startTime < endTime
    );
    
    if (overlapping.length === 0) {
      return { startTime, endTime, segments: [] };
    }
    
    // Find the segment that contains or is nearest to our start time
    const startSegment = this.findNearestTranscriptSegment(startTime, transcriptSegments, 'start');
    const endSegment = this.findNearestTranscriptSegment(endTime, transcriptSegments, 'end');
    
    // Align to complete sentences/phrases
    const alignedStart = startSegment ? startSegment.startTime : startTime;
    const alignedEnd = endSegment ? endSegment.endTime : endTime;
    
    // Get all segments within the aligned boundaries
    const includedSegments = transcriptSegments.filter(
      seg => seg.startTime >= alignedStart && seg.endTime <= alignedEnd
    );
    
    return {
      startTime: alignedStart,
      endTime: alignedEnd,
      segments: includedSegments
    };
  }

  /**
   * Find nearest transcript segment
   */
  private findNearestTranscriptSegment(
    timestamp: number,
    segments: TranscriptSegment[],
    align: 'start' | 'end'
  ): TranscriptSegment | null {
    let nearest: TranscriptSegment | null = null;
    let minDiff = Infinity;
    
    for (const segment of segments) {
      if (timestamp >= segment.startTime && timestamp <= segment.endTime) {
        // Timestamp is within this segment
        return segment;
      }
      
      const diff = align === 'start' 
        ? Math.abs(segment.startTime - timestamp)
        : Math.abs(segment.endTime - timestamp);
        
      if (diff < minDiff) {
        minDiff = diff;
        nearest = segment;
      }
    }
    
    return nearest;
  }

  /**
   * Build fade filters for smooth transitions
   */
  private buildFadeFilters(
    duration: number,
    fadeIn?: number,
    fadeOut?: number
  ): { video: string[]; audio: string[] } {
    const videoFilters: string[] = [];
    const audioFilters: string[] = [];
    
    if (fadeIn && fadeIn > 0) {
      // Video fade in
      videoFilters.push(`fade=t=in:st=0:d=${fadeIn}`);
      // Audio fade in
      audioFilters.push(`afade=t=in:st=0:d=${fadeIn}`);
    }
    
    if (fadeOut && fadeOut > 0) {
      const fadeOutStart = Math.max(0, duration - fadeOut);
      // Video fade out
      videoFilters.push(`fade=t=out:st=${fadeOutStart}:d=${fadeOut}`);
      // Audio fade out
      audioFilters.push(`afade=t=out:st=${fadeOutStart}:d=${fadeOut}`);
    }
    
    return { video: videoFilters, audio: audioFilters };
  }

  /**
   * Build tempo filters for audio speed adjustment
   */
  private buildTempoFilters(speed: number): string[] {
    const filters: string[] = [];
    
    // FFmpeg atempo filter has limitations (0.5 to 2.0)
    // For speeds outside this range, we need to chain multiple filters
    let remainingSpeed = speed;
    
    while (remainingSpeed < 0.5 || remainingSpeed > 2.0) {
      if (remainingSpeed < 0.5) {
        filters.push('atempo=0.5');
        remainingSpeed /= 0.5;
      } else {
        filters.push('atempo=2.0');
        remainingSpeed /= 2.0;
      }
    }
    
    if (remainingSpeed !== 1.0) {
      filters.push(`atempo=${remainingSpeed}`);
    }
    
    return filters;
  }

  /**
   * Clean up old segment files
   */
  public async cleanup(olderThan: number = 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const files = await fs.readdir(this.tempDir);

    for (const file of files) {
      const filePath = path.join(this.tempDir, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > olderThan) {
        try {
          await fs.remove(filePath);
          logger.info({ file }, 'Cleaned up old segment file');
        } catch (error) {
          logger.error({ error, file }, 'Failed to clean up segment file');
        }
      }
    }
  }

  /**
   * Safely parse FPS from ffprobe output
   * @param fpsString - FPS string from ffprobe (e.g., "30/1" or "30")
   * @returns Parsed FPS value
   */
  private parseFps(fpsString: string): number {
    // Handle fraction format (e.g., "30/1", "24000/1001")
    if (fpsString.includes('/')) {
      const [numerator, denominator] = fpsString.split('/').map(n => parseFloat(n));
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
    
    // Handle simple number format
    const fps = parseFloat(fpsString);
    return isNaN(fps) ? 0 : fps; // Default to 0 FPS if parsing fails
  }

  /**
   * Run FFmpeg command safely using spawn
   */
  private runFFmpegCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffmpegProcess = spawn(this.ffmpegPath, args, {
        shell: false // Prevent shell injection
      });
      
      let stdout = '';
      let stderr = '';
      
      ffmpegProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      ffmpegProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpegProcess.on('error', (error) => {
        reject(error);
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          resolve(stdout + stderr);
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}: ${stderr}`));
        }
      });
    });
  }
}