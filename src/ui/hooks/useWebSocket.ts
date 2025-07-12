import { useEffect, useRef, useCallback, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { logger } from '../../utils/browser-logger';

export interface WebSocketOptions {
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

export function useWebSocket(url?: string, options?: WebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    const socketUrl = url || window.location.origin;
    
    socketRef.current = io(socketUrl, {
      autoConnect: options?.autoConnect ?? true,
      reconnection: options?.reconnection ?? true,
      reconnectionAttempts: options?.reconnectionAttempts ?? 5,
      reconnectionDelay: options?.reconnectionDelay ?? 1000,
    });

    socketRef.current.on('connect', () => {
      logger.debug('WebSocket connected');
      setIsConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      logger.debug('WebSocket disconnected');
      setIsConnected(false);
    });

    socketRef.current.on('connect_error', (error) => {
      logger.error('WebSocket connection error:', error);
    });

    // Ping/pong for health check
    const pingInterval = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('ping');
      }
    }, 30000); // Every 30 seconds

    socketRef.current.on('pong', () => {
      console.debug('WebSocket pong received');
    });

    return () => {
      clearInterval(pingInterval);
    };
  }, [url, options]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn(`Cannot emit ${event}: WebSocket not connected`);
    }
  }, []);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);
    }
  }, []);

  const off = useCallback((event: string, handler?: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.off(event, handler);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    socket: socketRef.current,
    isConnected,
    connect,
    disconnect,
    emit,
    on,
    off
  };
}