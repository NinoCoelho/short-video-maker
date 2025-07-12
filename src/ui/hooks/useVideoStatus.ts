import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import type { VideoStatusObject } from '../../short-creator/VideoStatusManager';

interface VideoStatusUpdate {
  videoId: string;
  status: string;
  progress?: number;
  message?: string;
  error?: string;
}

interface VideoProcessingProgress {
  videoId: string;
  stage: string;
  progress: number;
  total?: number;
  message?: string;
}

interface SceneProcessing {
  videoId: string;
  sceneIndex: number;
  totalScenes: number;
  stage: string;
  progress?: number;
}

export function useVideoStatus(videoId?: string) {
  const { emit, on, off, isConnected } = useWebSocket();
  const [status, setStatus] = useState<VideoStatusObject | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Subscribe to a specific video
  const subscribeToVideo = useCallback((id: string) => {
    if (isConnected && id) {
      emit('subscribe:video', id);
      setIsSubscribed(true);
    }
  }, [emit, isConnected]);

  // Unsubscribe from a specific video
  const unsubscribeFromVideo = useCallback((id: string) => {
    if (isConnected && id) {
      emit('unsubscribe:video', id);
      setIsSubscribed(false);
    }
  }, [emit, isConnected]);

  // Subscribe to all videos (for list views)
  const subscribeToAll = useCallback(() => {
    if (isConnected) {
      emit('subscribe:all');
      setIsSubscribed(true);
    }
  }, [emit, isConnected]);

  // Unsubscribe from all videos
  const unsubscribeFromAll = useCallback(() => {
    if (isConnected) {
      emit('unsubscribe:all');
      setIsSubscribed(false);
    }
  }, [emit, isConnected]);

  useEffect(() => {
    // Status update handler
    const handleStatusUpdate = (update: VideoStatusUpdate) => {
      if (!videoId || update.videoId === videoId) {
        setStatus(prev => ({
          ...prev,
          status: update.status as any,
          message: update.message,
          error: update.error,
          progress: update.progress
        }));
      }
    };

    // Progress update handler
    const handleProgressUpdate = (update: VideoProcessingProgress) => {
      if (!videoId || update.videoId === videoId) {
        setStatus(prev => ({
          ...prev,
          progress: update.progress,
          stage: update.stage,
          message: update.message
        }));
      }
    };

    // Scene processing handler
    const handleSceneProcessing = (update: SceneProcessing) => {
      if (!videoId || update.videoId === videoId) {
        const sceneProgress = ((update.sceneIndex + 1) / update.totalScenes) * 100;
        setStatus(prev => ({
          ...prev,
          stage: `Processing scene ${update.sceneIndex + 1}/${update.totalScenes}: ${update.stage}`,
          progress: update.progress ?? sceneProgress
        }));
      }
    };

    // Video completed handler
    const handleVideoCompleted = (data: { videoId: string; outputPath: string }) => {
      if (!videoId || data.videoId === videoId) {
        setStatus(prev => ({
          ...prev,
          status: 'ready',
          progress: 100,
          completedAt: new Date().toISOString()
        }));
      }
    };

    // Video error handler
    const handleVideoError = (data: { videoId: string; error: string; stage?: string }) => {
      if (!videoId || data.videoId === videoId) {
        setStatus(prev => ({
          ...prev,
          status: 'failed',
          error: data.error,
          stage: data.stage,
          completedAt: new Date().toISOString()
        }));
      }
    };

    // Set up event listeners
    on('video:status:update', handleStatusUpdate);
    on('video:processing:progress', handleProgressUpdate);
    on('scene:processing', handleSceneProcessing);
    on('video:completed', handleVideoCompleted);
    on('video:error', handleVideoError);

    // Subscribe to updates
    if (isConnected) {
      if (videoId) {
        subscribeToVideo(videoId);
      } else {
        subscribeToAll();
      }
    }

    // Cleanup
    return () => {
      off('video:status:update', handleStatusUpdate);
      off('video:processing:progress', handleProgressUpdate);
      off('scene:processing', handleSceneProcessing);
      off('video:completed', handleVideoCompleted);
      off('video:error', handleVideoError);

      if (isConnected) {
        if (videoId) {
          unsubscribeFromVideo(videoId);
        } else {
          unsubscribeFromAll();
        }
      }
    };
  }, [videoId, isConnected, on, off, subscribeToVideo, unsubscribeFromVideo, subscribeToAll, unsubscribeFromAll]);

  return {
    status,
    isConnected,
    isSubscribed,
    subscribeToVideo,
    unsubscribeFromVideo,
    subscribeToAll,
    unsubscribeFromAll
  };
}