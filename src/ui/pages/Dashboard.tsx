import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  Chip,
  LinearProgress,
  IconButton,
  Avatar,
  Button,
  useTheme,
  alpha,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  VideoLibrary as VideoIcon,
  TrendingUp as TrendingIcon,
  AccessTime as TimeIcon,
  CloudDone as DoneIcon,
  PlayArrow as PlayIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  SmartToy as AIIcon,
  Delete as DeleteIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface DashboardStats {
  totalVideos: number;
  completedVideos: number;
  processingVideos: number;
  failedVideos: number;
  totalDuration: number;
  todayVideos: number;
}

interface RecentVideo {
  id: string;
  status: string;
  title?: string;
  createdAt?: string;
  thumbnail?: string;
  duration?: number;
}

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalVideos: 0,
    completedVideos: 0,
    processingVideos: 0,
    failedVideos: 0,
    totalDuration: 0,
    todayVideos: 0,
  });
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ 
    open: false, 
    message: '', 
    severity: 'success' 
  });

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/videos');
      const videos = response.data;

      // Calculate stats
      const totalVideos = videos.length;
      const completedVideos = videos.filter((v: any) => v.status === 'ready').length;
      const processingVideos = videos.filter((v: any) => v.status === 'processing').length;
      const failedVideos = videos.filter((v: any) => v.status === 'failed').length;
      
      const today = new Date().toDateString();
      const todayVideos = videos.filter((v: any) => 
        new Date(v.createdAt || Date.now()).toDateString() === today
      ).length;

      // Calculate total duration from completed videos
      const totalDuration = videos
        .filter((v: any) => v.status === 'ready' && v.duration)
        .reduce((sum: number, v: any) => sum + (v.duration || 0), 0);

      setStats({
        totalVideos,
        completedVideos,
        processingVideos,
        failedVideos,
        totalDuration,
        todayVideos,
      });

      // Get recent videos (last 5)
      const recent = videos
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 5);
      setRecentVideos(recent);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      setError(error.response?.data?.message || 'Erro ao carregar dados. Verifique se o servidor está rodando.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (videoId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Previne navegação quando clica no delete
    setVideoToDelete(videoId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!videoToDelete) return;

    try {
      setDeletingVideoId(videoToDelete);
      await axios.delete(`/api/videos/${videoToDelete}`);
      
      // Atualizar a lista após deletar
      await fetchDashboardData();
      
      setSnackbar({
        open: true,
        message: 'Vídeo deletado com sucesso',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error deleting video:', error);
      setSnackbar({
        open: true,
        message: 'Erro ao deletar vídeo. Tente novamente.',
        severity: 'error'
      });
    } finally {
      setDeletingVideoId(null);
      setDeleteDialogOpen(false);
      setVideoToDelete(null);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return theme.palette.success.main;
      case 'processing':
        return theme.palette.warning.main;
      case 'failed':
        return theme.palette.error.main;
      default:
        return theme.palette.grey[500];
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready':
        return 'Concluído';
      case 'processing':
        return 'Processando';
      case 'failed':
        return 'Falhou';
      case 'pending':
        return 'Pendente';
      default:
        return 'Desconhecido';
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    return `${diffDays}d atrás`;
  };

  const statCards = [
    {
      title: 'Total de Vídeos',
      value: stats.totalVideos,
      icon: <VideoIcon />,
      color: theme.palette.primary.main,
      gradient: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
    },
    {
      title: 'Concluídos',
      value: stats.completedVideos,
      icon: <DoneIcon />,
      color: theme.palette.success.main,
      gradient: `linear-gradient(135deg, ${theme.palette.success.main}, ${theme.palette.success.dark})`,
    },
    {
      title: 'Processando',
      value: stats.processingVideos,
      icon: <TrendingIcon />,
      color: theme.palette.warning.main,
      gradient: `linear-gradient(135deg, ${theme.palette.warning.main}, ${theme.palette.warning.dark})`,
    },
    {
      title: 'Hoje',
      value: stats.todayVideos,
      icon: <TimeIcon />,
      color: theme.palette.secondary.main,
      gradient: `linear-gradient(135deg, ${theme.palette.secondary.main}, ${theme.palette.secondary.dark})`,
    },
  ];

  // Show error state
  if (error && !loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '60vh',
        gap: 2 
      }}>
        <ErrorIcon sx={{ fontSize: 64, color: theme.palette.error.main }} />
        <Typography variant="h5" color="error">
          Erro ao carregar dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {error}
        </Typography>
        <Button 
          variant="contained" 
          onClick={fetchDashboardData}
          startIcon={<RefreshIcon />}
        >
          Tentar Novamente
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
            Dashboard
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton onClick={fetchDashboardData} disabled={loading}>
              <RefreshIcon />
            </IconButton>
            <Button 
              variant="contained" 
              startIcon={<AddIcon />}
              onClick={() => navigate('/studio')}
              sx={{
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                '&:hover': {
                  background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`,
                },
              }}
            >
              Novo Vídeo
            </Button>
          </Box>
        </Box>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Visão geral da sua produção de vídeos
        </Typography>
      </Box>

      {loading && !error ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Stats Grid */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {statCards.map((stat, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card
                  elevation={0}
                  sx={{
                    p: 2,
                    height: '100%',
                    background: alpha(stat.color, 0.05),
                    border: `1px solid ${alpha(stat.color, 0.1)}`,
                    transition: 'all 0.3s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: `0 12px 24px ${alpha(stat.color, 0.15)}`,
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                        {stat.title}
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700, color: stat.color }}>
                        {stat.value}
                      </Typography>
                    </Box>
                    <Avatar
                      sx={{
                        background: stat.gradient,
                        width: 56,
                        height: 56,
                      }}
                    >
                      {stat.icon}
                    </Avatar>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Quick Actions */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
              Ações Rápidas
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Chip
                icon={<AddIcon />}
                label="Criar Vídeo Manual"
                onClick={() => navigate('/studio')}
                sx={{
                  py: 2.5,
                  px: 1,
                  fontSize: '0.875rem',
                  background: alpha(theme.palette.primary.main, 0.1),
                  '&:hover': {
                    background: alpha(theme.palette.primary.main, 0.2),
                  },
                }}
              />
              <Chip
                icon={<AIIcon />}
                label="Gerar com IA"
                onClick={() => navigate('/ai-scripts')}
                sx={{
                  py: 2.5,
                  px: 1,
                  fontSize: '0.875rem',
                  background: alpha(theme.palette.secondary.main, 0.1),
                  '&:hover': {
                    background: alpha(theme.palette.secondary.main, 0.2),
                  },
                }}
              />
            </Box>
          </Box>

          {/* Recent Videos */}
          <Box>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
              Vídeos Recentes
            </Typography>
            <Grid container spacing={2}>
              {recentVideos.length === 0 ? (
                <Grid item xs={12}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 4,
                      textAlign: 'center',
                      background: alpha(theme.palette.background.paper, 0.5),
                      border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                    }}
                  >
                    <VideoIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="body1" color="text.secondary">
                      Nenhum vídeo encontrado
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Comece criando seu primeiro vídeo
                    </Typography>
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={() => navigate('/studio')}
                    >
                      Criar Vídeo
                    </Button>
                  </Paper>
                </Grid>
              ) : (
                recentVideos.map((video) => (
                  <Grid item xs={12} key={video.id}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        background: alpha(theme.palette.background.paper, 0.5),
                        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                        '&:hover': {
                          background: alpha(theme.palette.action.hover, 0.1),
                          transform: 'translateX(8px)',
                        },
                      }}
                      onClick={() => navigate(`/video/${video.id}`)}
                    >
                      <Avatar
                        variant="rounded"
                        sx={{
                          width: 80,
                          height: 60,
                          background: alpha(theme.palette.primary.main, 0.1),
                        }}
                      >
                        {video.thumbnail ? (
                          <img
                            src={video.thumbnail}
                            alt={video.title || 'Video thumbnail'}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <VideoIcon />
                        )}
                      </Avatar>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {video.title || `Vídeo ${video.id.slice(0, 8)}`}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                          <Chip
                            label={getStatusText(video.status)}
                            size="small"
                            sx={{
                              backgroundColor: alpha(getStatusColor(video.status), 0.1),
                              color: getStatusColor(video.status),
                              fontWeight: 600,
                            }}
                          />
                          {video.createdAt && (
                            <Typography variant="caption" color="text.secondary">
                              {formatRelativeTime(video.createdAt)}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {video.status === 'ready' && (
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/video/${video.id}`);
                            }}
                          >
                            <PlayIcon />
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => handleDeleteClick(video.id, e)}
                          disabled={deletingVideoId === video.id}
                        >
                          {deletingVideoId === video.id ? (
                            <CircularProgress size={20} />
                          ) : (
                            <DeleteIcon />
                          )}
                        </IconButton>
                      </Box>
                    </Paper>
                  </Grid>
                ))
              )}
            </Grid>
          </Box>

          {/* Activity Progress */}
          {stats.processingVideos > 0 && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
                Processamento Ativo
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  background: alpha(theme.palette.warning.main, 0.05),
                  border: `1px solid ${alpha(theme.palette.warning.main, 0.1)}`,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <CircularProgress size={20} sx={{ mr: 2 }} />
                  <Typography variant="body1">
                    {stats.processingVideos} vídeo{stats.processingVideos > 1 ? 's' : ''} sendo processado{stats.processingVideos > 1 ? 's' : ''}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="indeterminate"
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: alpha(theme.palette.warning.main, 0.1),
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: theme.palette.warning.main,
                      borderRadius: 4,
                    },
                  }}
                />
              </Paper>
            </Box>
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirmar Exclusão</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Tem certeza que deseja excluir este vídeo? Esta ação não pode ser desfeita.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            color="error" 
            variant="contained"
            disabled={!!deletingVideoId}
          >
            {deletingVideoId ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Dashboard;