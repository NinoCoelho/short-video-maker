import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { logger } from '../../utils/browser-logger';

export interface WebSocketOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface WebSocketState {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempt: number;
}

export function useWebSocket(url?: string, options: WebSocketOptions = {}) {
  const {
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectDelay = 1000
  } = options;

  const [state, setState] = useState<WebSocketState>({
    socket: null,
    isConnected: false,
    isConnecting: false,
    error: null,
    reconnectAttempt: 0
  });

  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptRef = useRef(0);

  const socketUrl = url || `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;

  const connect = useCallback(() => {
    if (state.socket?.connected) {
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isConnecting: true, 
      error: null,
      reconnectAttempt: reconnectAttemptRef.current
    }));

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true
    });

    socket.on('connect', () => {
      logger.info('WebSocket connected');
      reconnectAttemptRef.current = 0;
      setState(prev => ({
        ...prev,
        socket,
        isConnected: true,
        isConnecting: false,
        error: null,
        reconnectAttempt: 0
      }));
    });

    socket.on('disconnect', (reason) => {
      logger.warn(`WebSocket disconnected: ${reason}`);
      setState(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false
      }));

      // Auto-reconnect for recoverable disconnections
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        // Server initiated disconnect or client initiated - don't auto-reconnect
        return;
      }

      // Attempt to reconnect
      if (reconnectAttemptRef.current < reconnectAttempts) {
        reconnectAttemptRef.current++;
        const delay = reconnectDelay * Math.pow(2, reconnectAttemptRef.current - 1); // Exponential backoff
        
        setState(prev => ({
          ...prev,
          reconnectAttempt: reconnectAttemptRef.current
        }));

        reconnectTimeoutRef.current = setTimeout(() => {
          logger.info(`Attempting to reconnect (${reconnectAttemptRef.current}/${reconnectAttempts})`);
          connect();
        }, delay);
      } else {
        setState(prev => ({
          ...prev,
          error: 'Failed to reconnect after maximum attempts'
        }));
      }
    });

    socket.on('connect_error', (error) => {
      logger.error('WebSocket connection error:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error.message || 'Connection failed'
      }));
    });

    socket.on('pong', () => {
      logger.debug('WebSocket pong received');
    });

  }, [socketUrl, reconnectAttempts, reconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (state.socket) {
      state.socket.disconnect();
    }
    
    setState(prev => ({
      ...prev,
      socket: null,
      isConnected: false,
      isConnecting: false,
      error: null
    }));
    
    reconnectAttemptRef.current = 0;
  }, [state.socket]);

  const emit = useCallback((event: string, data?: any) => {
    if (state.socket?.connected) {
      state.socket.emit(event, data);
      return true;
    }
    logger.warn(`Cannot emit ${event}: WebSocket not connected`);
    return false;
  }, [state.socket]);

  const ping = useCallback(() => {
    return emit('ping');
  }, [emit]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (state.socket) {
        state.socket.disconnect();
      }
    };
  }, [autoConnect]); // Only depend on autoConnect to avoid reconnecting on every render

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    emit,
    ping
  };
}