import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  CircularProgress, 
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  LinearProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import ClearIcon from '@mui/icons-material/Clear';
import EditIcon from '@mui/icons-material/Edit';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';

interface VideoItem {
  id: string;
  status: string;
  scenes?: any[];
  config?: any;
  createdAt?: string;
  error?: string;
  progress?: number;
  stage?: string;
  message?: string;
}

const VideoList: React.FC = () => {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchVideos = async () => {
    try {
      const response = await axios.get('/api/videos');
      console.log('API response:', response.data);
      
      // Garante que videos seja sempre um array
      const videosData = Array.isArray(response.data) ? response.data : [];
      console.log('Processed videos data:', videosData);
      
      setVideos(videosData);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching videos:', err);
      setError('Failed to fetch videos');
      setVideos([]); // Garante que videos seja um array vazio em caso de erro
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []); // Remove a dependência [videos] para evitar loop infinito

  // Separate useEffect para polling baseado no status dos vídeos
  useEffect(() => {
    const hasProcessingVideos = videos.some(video => video.status === 'processing');
    const pollingInterval = hasProcessingVideos ? 2000 : 5000; // 2s se processando, 5s caso contrário
    
    if (videos.length === 0) return; // Não faz polling se não há vídeos
    
    const interval = setInterval(() => {
      fetchVideos();
    }, pollingInterval);
    
    return () => {
      clearInterval(interval);
    };
  }, [videos.map(v => v.status).join(',')]); // Só atualiza quando o status muda // Dependência nos vídeos para ajustar a frequência

  const handleCreateNew = () => {
    navigate('/create');
  };

  const handleVideoClick = (id: string) => {
    navigate(`/video/${id}`);
  };

  const handleEditVideo = (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    navigate(`/edit/${id}`);
  };

  const handleDeleteVideo = async (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    
    try {
      await axios.delete(`/api/videos/${id}`);
      fetchVideos();
    } catch (err) {
      setError('Failed to delete video');
      console.error('Error deleting video:', err);
    }
  };

  const handleClearAllVideos = async () => {
    setClearing(true);
    try {
      await axios.delete('/api/videos');
      setVideos([]);
      setClearDialogOpen(false);
    } catch (err) {
      setError('Failed to clear all videos');
      console.error('Error clearing videos:', err);
    } finally {
      setClearing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'success';
      case 'missing_mp4':
        return 'warning';
      case 'no_script':
        return 'error';
      case 'processing':
        return 'info';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <PlayArrowIcon />;
      case 'missing_mp4':
        return <WarningIcon />;
      case 'no_script':
        return <ErrorIcon />;
      case 'processing':
        return <CircularProgress size={16} />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string, progress?: number, stage?: string) => {
    switch (status) {
      case 'ready':
        return 'Ready';
      case 'missing_mp4':
        return 'Missing MP4';
      case 'no_script':
        return 'No Script';
      case 'processing':
        if (progress !== undefined && stage) {
          return `${stage} (${progress}%)`;
        }
        return progress !== undefined ? `Processing (${progress}%)` : 'Processing';
      case 'failed':
        return 'Failed';
      case 'pending':
        return 'Pending';
      default:
        return 'Unknown';
    }
  };

  const getVideoTitle = (video: VideoItem) => {
    if (video.scenes && video.scenes.length > 0) {
      return video.scenes[0].text?.substring(0, 50) + (video.scenes[0].text?.length > 50 ? '...' : '');
    }
    return `Video ${video.id.substring(0, 8)}...`;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
      </Box>
    );
  }

  // Garante que videos seja sempre um array
  const videosArray = Array.isArray(videos) ? videos : [];
  console.log('Rendering with videos:', videosArray);

  return (
    <Box maxWidth="md" mx="auto" py={4}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1">
          Your Videos ({videosArray.length})
        </Typography>
        <Box display="flex" gap={2}>
          {videosArray.length > 0 && (
            <Button 
              variant="outlined" 
              color="error" 
              startIcon={<ClearIcon />}
              onClick={() => setClearDialogOpen(true)}
            >
              Clear All
            </Button>
          )}
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={<AddIcon />}
            onClick={handleCreateNew}
          >
            Create New Video
          </Button>
        </Box>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      )}
      
      {videosArray.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            You haven't created any videos yet.
          </Typography>
          <Button 
            variant="outlined" 
            startIcon={<AddIcon />}
            onClick={handleCreateNew}
            sx={{ mt: 2 }}
          >
            Create Your First Video
          </Button>
        </Paper>
      ) : (
        <Paper>
          <List>
            {videosArray.map((video, index) => {
              const videoId = video?.id || '';
              const videoStatus = video?.status || 'unknown';
              
              return (
                <div key={videoId}>
                  {index > 0 && <Divider />}
                  <ListItem 
                    button 
                    onClick={() => handleVideoClick(videoId)}
                    sx={{ 
                      py: 2,
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.04)'
                      }
                    }}
                  >
                    <ListItemText
                      primary={getVideoTitle(video)}
                      secondary={
                        <Box component="div" display="flex" flexDirection="column" gap={1} mt={1}>
                          <Box display="flex" alignItems="center" gap={1}>
                            {(() => {
                              const statusIcon = getStatusIcon(videoStatus);
                              return (
                                <Chip
                                  {...(statusIcon && { icon: statusIcon })}
                                  label={getStatusText(videoStatus, video.progress, video.stage)}
                                  color={getStatusColor(videoStatus) as any}
                                  size="small"
                                  variant="outlined"
                                />
                              );
                            })()}
                            {video.createdAt && (
                              <Typography variant="caption" color="text.secondary">
                                {new Date(video.createdAt).toLocaleDateString()}
                              </Typography>
                            )}
                          </Box>
                          {/* Progress bar for processing videos */}
                          {videoStatus === 'processing' && video.progress !== undefined && (
                            <Box width="100%">
                              <LinearProgress 
                                variant="determinate" 
                                value={video.progress} 
                                sx={{ height: 6, borderRadius: 3 }}
                              />
                              {video.stage && (
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                  {video.stage}
                                </Typography>
                              )}
                            </Box>
                          )}
                          {/* Error message for failed videos */}
                          {videoStatus === 'failed' && video.error && (
                            <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                              {video.error}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      {(videoStatus === 'missing_mp4' || videoStatus === 'no_script' || videoStatus === 'failed') && (
                        <IconButton 
                          edge="end" 
                          aria-label="edit"
                          onClick={(e) => handleEditVideo(videoId, e)}
                          color="primary"
                          sx={{ mr: 1 }}
                        >
                          <EditIcon />
                        </IconButton>
                      )}
                      {videoStatus === 'ready' && (
                        <IconButton 
                          edge="end" 
                          aria-label="play"
                          onClick={() => handleVideoClick(videoId)}
                          color="primary"
                          sx={{ mr: 1 }}
                        >
                          <PlayArrowIcon />
                        </IconButton>
                      )}
                      <IconButton 
                        edge="end" 
                        aria-label="delete" 
                        onClick={(e) => handleDeleteVideo(videoId, e)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </div>
              );
            })}
          </List>
        </Paper>
      )}

      {/* Dialog de confirmação para limpar todos os vídeos */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear All Videos</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete all {videosArray.length} videos? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)} disabled={clearing}>
            Cancel
          </Button>
          <Button 
            onClick={handleClearAllVideos} 
            color="error" 
            variant="contained"
            disabled={clearing}
            startIcon={clearing ? <CircularProgress size={16} /> : <ClearIcon />}
          >
            {clearing ? 'Clearing...' : 'Clear All'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VideoList; 