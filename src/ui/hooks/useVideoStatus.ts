import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { logger } from '../../utils/browser-logger';

export interface VideoStatus {
  id: string;
  status: string;
  progress?: number;
  message?: string;
  error?: string;
  stage?: string;
  lastUpdate: string;
}

export interface VideoStatusHook {
  status: VideoStatus | null;
  isConnected: boolean;
  error: string | null;
  subscribe: (videoId: string) => void;
  unsubscribe: (videoId: string) => void;
  subscribeToAll: () => void;
  unsubscribeFromAll: () => void;
}

export function useVideoStatus(videoId?: string): VideoStatusHook {
  const { socket, isConnected, error: wsError, emit } = useWebSocket();
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to a specific video
  const subscribe = useCallback((id: string) => {
    console.log('[useVideoStatus] Subscribing to video:', id);
    if (emit('subscribe:video', id)) {
      logger.info(`Subscribed to video updates: ${id}`);
      console.log('[useVideoStatus] Successfully subscribed to:', id);
    } else {
      console.warn('[useVideoStatus] Failed to subscribe to:', id);
    }
  }, [emit]);

  // Unsubscribe from a specific video
  const unsubscribe = useCallback((id: string) => {
    if (emit('unsubscribe:video', id)) {
      logger.info(`Unsubscribed from video updates: ${id}`);
    }
  }, [emit]);

  // Subscribe to all videos (for list views)
  const subscribeToAll = useCallback(() => {
    if (emit('subscribe:all')) {
      logger.info('Subscribed to all video updates');
    }
  }, [emit]);

  // Unsubscribe from all videos
  const unsubscribeFromAll = useCallback(() => {
    if (emit('unsubscribe:all')) {
      logger.info('Unsubscribed from all video updates');
    }
  }, [emit]);

  // Set up socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Video status update handler
    const handleVideoStatusUpdate = (event: any) => {
      logger.debug('Video status update received:', event);
      console.log('[useVideoStatus] Status update:', {
        videoId: event.videoId,
        status: event.status,
        progress: event.progress,
        stage: event.stage,
        message: event.message
      });
      
      // Only update if this is for the video we're tracking or if we're tracking all
      if (!videoId || event.videoId === videoId) {
        setStatus({
          id: event.videoId,
          status: event.status,
          progress: event.progress,
          message: event.message,
          stage: event.stage,
          lastUpdate: event.timestamp || new Date().toISOString()
        });
      }
    };

    // Video processing progress handler
    const handleVideoProgress = (event: any) => {
      logger.debug('Video progress update received:', event);
      
      if (!videoId || event.videoId === videoId) {
        setStatus(prev => ({
          id: event.videoId,
          status: prev?.status || 'processing',
          progress: event.progress,
          message: event.message,
          stage: event.stage,
          lastUpdate: event.timestamp || new Date().toISOString()
        }));
      }
    };

    // Video completion handler
    const handleVideoCompleted = (event: any) => {
      logger.debug('Video completed event received:', event);
      
      if (!videoId || event.videoId === videoId) {
        setStatus(prev => ({
          id: event.videoId,
          status: 'completed',
          progress: 100,
          message: 'Video processing completed',
          stage: 'Completed',
          lastUpdate: event.timestamp || new Date().toISOString()
        }));
      }
    };

    // Video error handler
    const handleVideoError = (event: any) => {
      logger.error('Video error event received:', event);
      
      if (!videoId || event.videoId === videoId) {
        setStatus(prev => ({
          id: event.videoId,
          status: 'failed',
          progress: prev?.progress,
          message: event.error,
          error: event.error,
          stage: 'Failed',
          lastUpdate: event.timestamp || new Date().toISOString()
        }));
      }
    };

    // Scene processing handler
    const handleSceneProcessing = (event: any) => {
      logger.debug('Scene processing event received:', event);
      
      if (!videoId || event.videoId === videoId) {
        setStatus(prev => ({
          id: event.videoId,
          status: 'processing',
          progress: event.progress,
          message: `Processing scene ${event.sceneIndex + 1}/${event.totalScenes}`,
          stage: event.stage,
          lastUpdate: event.timestamp || new Date().toISOString()
        }));
      }
    };

    // Subscription confirmation handlers
    const handleSubscribedVideo = (data: any) => {
      logger.info(`Confirmed subscription to video: ${data.videoId}`);
    };

    const handleSubscribedAll = () => {
      logger.info('Confirmed subscription to all videos');
    };

    // Register event listeners
    socket.on('video:status:update', handleVideoStatusUpdate);
    socket.on('video:processing:progress', handleVideoProgress);
    socket.on('video:completed', handleVideoCompleted);
    socket.on('video:error', handleVideoError);
    socket.on('scene:processing', handleSceneProcessing);
    socket.on('subscribed:video', handleSubscribedVideo);
    socket.on('subscribed:all', handleSubscribedAll);

    // Cleanup
    return () => {
      socket.off('video:status:update', handleVideoStatusUpdate);
      socket.off('video:processing:progress', handleVideoProgress);
      socket.off('video:completed', handleVideoCompleted);
      socket.off('video:error', handleVideoError);
      socket.off('scene:processing', handleSceneProcessing);
      socket.off('subscribed:video', handleSubscribedVideo);
      socket.off('subscribed:all', handleSubscribedAll);
    };
  }, [socket, videoId]);

  // Auto-subscribe to specific video if provided
  useEffect(() => {
    if (isConnected && videoId) {
      subscribe(videoId);
      
      // Cleanup subscription on unmount or video change
      return () => {
        unsubscribe(videoId);
      };
    }
  }, [isConnected, videoId, subscribe, unsubscribe]);

  // Update error state from WebSocket error
  useEffect(() => {
    setError(wsError);
  }, [wsError]);

  return {
    status,
    isConnected,
    error,
    subscribe,
    unsubscribe,
    subscribeToAll,
    unsubscribeFromAll
  };
}