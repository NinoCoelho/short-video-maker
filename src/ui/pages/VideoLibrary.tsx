import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  IconButton,
  Chip,
  TextField,
  InputAdornment,
  Paper,
  Avatar,
  LinearProgress,
  Menu,
  MenuItem,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  PlayArrow as PlayIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  MoreVert as MoreIcon,
  VideoLibrary as VideoIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface Video {
  id: string;
  status: string;
  progress?: number;
  stage?: string;
  createdAt: string;
  scenes?: any[];
}

const VideoLibrary: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/videos');
      setVideos(response.data.data || response.data);
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return theme.palette.success.main;
      case 'processing': return theme.palette.warning.main;
      case 'failed': return theme.palette.error.main;
      default: return theme.palette.grey[500];
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready': return 'Concluído';
      case 'processing': return 'Processando';
      case 'failed': return 'Falhou';
      case 'pending': return 'Pendente';
      default: return 'Desconhecido';
    }
  };

  const filteredVideos = videos.filter(video => {
    const matchesSearch = video.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (video.scenes && video.scenes.some(scene => 
        scene.text?.toLowerCase().includes(searchTerm.toLowerCase())
      ));
    const matchesStatus = statusFilter === 'all' || video.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, videoId: string) => {
    setAnchorEl(event.currentTarget);
    setSelectedVideo(videoId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedVideo(null);
  };

  const handleDeleteVideo = async (videoId: string) => {
    try {
      await axios.delete(`/api/videos/${videoId}`);
      setVideos(videos.filter(v => v.id !== videoId));
      handleMenuClose();
    } catch (error) {
      console.error('Error deleting video:', error);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          Biblioteca de Vídeos
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Gerencie todos os seus vídeos criados
        </Typography>
      </Box>

      {/* Filters */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              placeholder="Buscar vídeos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="all">Todos</MenuItem>
              <MenuItem value="ready">Concluídos</MenuItem>
              <MenuItem value="processing">Processando</MenuItem>
              <MenuItem value="failed">Falharam</MenuItem>
              <MenuItem value="pending">Pendentes</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Videos Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <LinearProgress sx={{ width: '100%' }} />
        </Box>
      ) : filteredVideos.length === 0 ? (
        <Paper elevation={0} sx={{ p: 6, textAlign: 'center', border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
          <VideoIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            Nenhum vídeo encontrado
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {searchTerm || statusFilter !== 'all' 
              ? 'Tente ajustar os filtros de busca'
              : 'Comece criando seu primeiro vídeo'
            }
          </Typography>
          <Button variant="contained" onClick={() => navigate('/studio')}>
            Criar Vídeo
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {filteredVideos.map((video) => (
            <Grid item xs={12} sm={6} md={4} key={video.id}>
              <Card 
                elevation={0}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 8px 30px ${alpha(theme.palette.primary.main, 0.15)}`,
                  },
                }}
              >
                <CardContent sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Avatar
                      sx={{
                        backgroundColor: alpha(getStatusColor(video.status), 0.2),
                        color: getStatusColor(video.status),
                      }}
                    >
                      <VideoIcon />
                    </Avatar>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, video.id)}
                    >
                      <MoreIcon />
                    </IconButton>
                  </Box>
                  
                  <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                    Vídeo {video.id.substring(0, 8)}...
                  </Typography>
                  
                  <Chip
                    label={getStatusText(video.status)}
                    size="small"
                    sx={{
                      backgroundColor: alpha(getStatusColor(video.status), 0.2),
                      color: getStatusColor(video.status),
                      mb: 2,
                    }}
                  />
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Criado em {new Date(video.createdAt).toLocaleDateString('pt-BR')}
                  </Typography>
                  
                  {video.status === 'processing' && video.progress && (
                    <Box sx={{ mt: 2 }}>
                      <LinearProgress
                        variant="determinate"
                        value={video.progress}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: alpha(theme.palette.primary.main, 0.2),
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                          },
                        }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {video.progress}% - {video.stage}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
                
                <CardActions sx={{ p: 2, pt: 0 }}>
                  <Button
                    size="small"
                    startIcon={<PlayIcon />}
                    onClick={() => navigate(`/video/${video.id}`)}
                    disabled={video.status !== 'ready'}
                  >
                    Visualizar
                  </Button>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => navigate(`/edit/${video.id}`)}
                  >
                    Editar
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          if (selectedVideo) navigate(`/video/${selectedVideo}`);
          handleMenuClose();
        }}>
          <PlayIcon sx={{ mr: 1 }} /> Visualizar
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedVideo) navigate(`/edit/${selectedVideo}`);
          handleMenuClose();
        }}>
          <EditIcon sx={{ mr: 1 }} /> Editar
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedVideo) window.open(`/api/video/${selectedVideo}`, '_blank');
          handleMenuClose();
        }}>
          <DownloadIcon sx={{ mr: 1 }} /> Download
        </MenuItem>
        <MenuItem 
          onClick={() => {
            if (selectedVideo) handleDeleteVideo(selectedVideo);
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} /> Excluir
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default VideoLibrary; 