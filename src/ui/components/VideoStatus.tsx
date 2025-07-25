import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  Alert,
  CircularProgress,
  Grid,
  Paper,
} from '@mui/material';
import {
  CheckCircle,
  Error,
  HourglassEmpty,
  PlayArrow,
  Schedule,
  MovieFilter,
  VolumeUp,
  Subtitles,
} from '@mui/icons-material';
import axios from 'axios';

interface VideoStatusData {
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error?: string;
  progress?: number;
  stage?: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
  estimatedTimeRemaining?: number;
}

interface VideoStatusProps {
  videoId: string;
  onStatusChange?: (status: VideoStatusData) => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'ready': return 'success';
    case 'processing': return 'primary';
    case 'failed': return 'error';
    case 'pending': return 'warning';
    default: return 'default';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'ready': return <CheckCircle />;
    case 'processing': return <PlayArrow />;
    case 'failed': return <Error />;
    case 'pending': return <HourglassEmpty />;
    default: return <Schedule />;
  }
};

const getStageIcon = (stage?: string) => {
  switch (stage) {
    case 'Initializing': return <Schedule />;
    case 'Processing frames': return <MovieFilter />;
    case 'Encoding video': return <VolumeUp />;
    case 'Finalizing': return <Subtitles />;
    case 'Completed': return <CheckCircle />;
    default: return <PlayArrow />;
  }
};

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
};

const formatTime = (isoString: string) => {
  return new Date(isoString).toLocaleTimeString();
};

export const VideoStatus: React.FC<VideoStatusProps> = ({
  videoId,
  onStatusChange,
  autoRefresh = true,
  refreshInterval = 2000,
}) => {
  const [status, setStatus] = useState<VideoStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  const fetchStatus = async () => {
    try {
      const response = await axios.get(`/api/status/${videoId}`);
      const newStatus = response.data.data || response.data;
      setStatus(newStatus);
      setError(null);
      setLastFetchTime(Date.now());
      onStatusChange?.(newStatus);
    } catch (err) {
      setError('Failed to fetch video status');
      console.error('Error fetching video status:', err);
    } finally {
      setLoading(false);
    }
  };

  // Função para calcular intervalo de refresh dinâmico
  const getDynamicRefreshInterval = (currentStatus: VideoStatusData | null): number => {
    if (!currentStatus) return refreshInterval;
    
    // Se o status for final (ready/failed), para o refresh
    if (currentStatus.status === 'ready' || currentStatus.status === 'failed') {
      return 0; // Não faz mais refresh
    }
    
    // Se o progresso estiver próximo de 100%, refresh mais frequente
    if (currentStatus.progress && currentStatus.progress >= 90) {
      return 1000; // 1 segundo quando próximo do fim
    }
    
    // Se estiver processando, refresh normal
    if (currentStatus.status === 'processing') {
      return refreshInterval;
    }
    
    // Para status pending, refresh menos frequente
    return refreshInterval * 2; // 4 segundos para pending
  };

  useEffect(() => {
    fetchStatus();

    if (autoRefresh) {
      const setupInterval = () => {
        const interval = getDynamicRefreshInterval(status);
        
        if (interval > 0) {
          return setInterval(fetchStatus, interval);
        }
        return null;
      };

      const intervalId = setupInterval();
      
      return () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }
  }, [videoId, autoRefresh, refreshInterval, status?.status, status?.progress]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={2}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!status) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        No status information available
      </Alert>
    );
  }

  const getStageDescription = (stage?: string, progress?: number) => {
    const progressText = progress ? ` (${progress}%)` : '';
    
    switch (stage) {
      case 'Initializing': 
        return `Preparando ambiente de renderização${progressText}...`;
      case 'Processing frames': 
        return `Processando frames do vídeo${progressText}...`;
      case 'Encoding video': 
        return `Codificando vídeo final${progressText}...`;
      case 'Finalizing': 
        return progress && progress >= 95 
          ? `Finalizando renderização${progressText}... (quase pronto!)`
          : `Finalizando renderização${progressText}...`;
      case 'Completed': 
        return 'Renderização concluída com sucesso! 🎉';
      default: 
        return `Processando${progressText}...`;
    }
  };

  const getDetailedStatusMessage = (status: VideoStatusData) => {
    if (status.status === 'ready') {
      return 'Seu vídeo está pronto para visualização e download!';
    }
    
    if (status.status === 'processing') {
      if (status.progress && status.progress >= 95) {
        return 'Últimos ajustes sendo aplicados...';
      }
      if (status.progress && status.progress >= 80) {
        return 'Renderização quase concluída...';
      }
      if (status.progress && status.progress >= 50) {
        return 'Progresso na metade, continuando...';
      }
      return 'Processamento em andamento...';
    }
    
    if (status.status === 'pending') {
      return 'Aguardando início do processamento...';
    }
    
    if (status.status === 'failed') {
      return 'Ocorreu um erro durante o processamento.';
    }
    
    return status.message || 'Status desconhecido';
  };

  // Calcular tempo decorrido
  const getElapsedTime = () => {
    if (!status.startedAt) return null;
    const elapsed = (Date.now() - new Date(status.startedAt).getTime()) / 1000;
    return formatDuration(elapsed);
  };

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              {getStatusIcon(status.status)}
              <Typography variant="h6" component="div">
                Status: {status.status.toUpperCase()}
              </Typography>
              <Chip
                label={status.status}
                color={getStatusColor(status.status) as any}
                size="small"
              />
            </Box>
            
            <Typography variant="body2" color="text.secondary" mb={1}>
              {getDetailedStatusMessage(status)}
            </Typography>

            {status.stage && (
              <Box display="flex" alignItems="center" gap={1}>
                {getStageIcon(status.stage)}
                <Typography variant="body2" color="text.secondary">
                  {getStageDescription(status.stage, status.progress)}
                </Typography>
              </Box>
            )}
          </Grid>

          <Grid item xs={12} sm={6}>
            {status.progress !== undefined && (
              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" color="text.secondary">
                    Progresso
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight="bold">
                    {status.progress}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={status.progress}
                  sx={{ 
                    height: 8, 
                    borderRadius: 4,
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 4,
                      backgroundColor: status.progress >= 95 ? '#4caf50' : undefined
                    }
                  }}
                />
              </Box>
            )}

            {status.estimatedTimeRemaining && (
              <Typography variant="body2" color="text.secondary" mt={1}>
                Tempo estimado: {formatDuration(status.estimatedTimeRemaining)}
              </Typography>
            )}

            {getElapsedTime() && (
              <Typography variant="body2" color="text.secondary" mt={1}>
                Tempo decorrido: {getElapsedTime()}
              </Typography>
            )}
          </Grid>
        </Grid>

        {(status.startedAt || status.completedAt) && (
          <Paper variant="outlined" sx={{ mt: 2, p: 1 }}>
            <Grid container spacing={2}>
              {status.startedAt && (
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Iniciado em:
                  </Typography>
                  <Typography variant="body2">
                    {formatTime(status.startedAt)}
                  </Typography>
                </Grid>
              )}
              {status.completedAt && (
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Concluído em:
                  </Typography>
                  <Typography variant="body2">
                    {formatTime(status.completedAt)}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        )}

        {status.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Erro:</strong> {status.error}
            </Typography>
          </Alert>
        )}

        {/* Indicador de última atualização */}
        <Box sx={{ mt: 1, textAlign: 'right' }}>
          <Typography variant="caption" color="text.secondary">
            Última atualização: {new Date(lastFetchTime).toLocaleTimeString()}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}; 