import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  CircularProgress, 
  Alert,
  Grid,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import { Video } from '../../types/shorts';

const VideoDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    const fetchVideoDetails = async () => {
      if (!id) {
        setError('No video ID provided');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const detailsResponse = await axios.get(`/api/video-data/${id}`);
        setVideo(detailsResponse.data);

        const statusResponse = await axios.get(`/api/status/${id}`);
        const statusData = statusResponse.data.data || statusResponse.data;
        setStatus(statusData.status);
        setStatusError(statusData.error || null);

      } catch (err: any) {
        // If it's a 404, the video data might not be ready yet
        if (err.response?.status === 404) {
          // Try to get just the status
          try {
            const statusResponse = await axios.get(`/api/status/${id}`);
            const statusData = statusResponse.data.data || statusResponse.data;
            setStatus(statusData.status || 'processing');
            setStatusError(statusData.error || null);
          } catch (statusErr) {
            setError('Video not found');
            console.error('Error fetching video status:', statusErr);
          }
        } else {
          setError('Failed to fetch video details');
          console.error('Error fetching video details:', err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchVideoDetails();

    const intervalId = setInterval(async () => {
      if (!id) return;
      try {
        const response = await axios.get(`/api/status/${id}`);
        const statusData = response.data.data || response.data;
        const newStatus = statusData.status;
        const newError = statusData.error || null;
        setStatus(newStatus);
        setStatusError(newError);
        if (newStatus === 'ready' || newStatus === 'failed') {
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error('Error fetching video status update:', err);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [id]);

  const handleBack = () => {
    navigate('/');
  };

  const handleEdit = () => {
    navigate(`/edit/${id}`);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = `/api/video/${id}`;
    link.download = `video-${id}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getVideoData = async () => {
    try {
      // Buscar dados completos do vídeo
      const [videoDataResponse, scriptResponse] = await Promise.all([
        axios.get(`/api/video-data/${id}`),
        axios.get(`/api/script/${id}`).catch(() => ({ data: null }))
      ]);

      return {
        videoData: videoDataResponse.data,
        script: scriptResponse.data
      };
    } catch (error) {
      console.error('Error fetching video data:', error);
      throw error;
    }
  };

  const handleApproval = async (action: 'approved' | 'reproved') => {
    if (!id) return;

    console.log('Vite Env:', (import.meta as any).env);

    const setLoadingState = action === 'approved' ? setApproving : setRejecting;
    setLoadingState(true);

    try {
      // Buscar todos os dados do vídeo
      const { videoData, script } = await getVideoData();
      
      // URL de download direto
      const downloadUrl = `${window.location.origin}/api/video/${id}`;
      
      // Preparar payload completo
      const payload = {
        videoId: id,
        status: action,
        timestamp: new Date().toISOString(),
        video: {
          id: id,
          status: status,
          downloadUrl: downloadUrl,
          ...video
        },
        videoData: videoData,
        script: script,
        originalJson: {
          scenes: videoData?.scenes || [],
          config: videoData?.config || {},
          music: videoData?.music || {}
        }
      };

      // Enviar para a URL de aprovação
      const approvalUrl = (import.meta as any).env?.VITE_APPROVAL_URL;
      
      if (!approvalUrl) {
        throw new Error('A variável VITE_APPROVAL_URL não está configurada no seu arquivo .env. Por favor, adicione-a para continuar.');
      }

      const response = await axios.post(approvalUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 1800000
      });

      setSnackbar({
        open: true,
        message: `Vídeo ${action === 'approved' ? 'aprovado' : 'reprovado'} com sucesso!`,
        severity: 'success'
      });

      // Opcional: redirecionar após um delay
      // setTimeout(() => {
      //   navigate('/');
      // }, 2000);

    } catch (error) {
      console.error(`Error ${action} video:`, error);
      setSnackbar({
        open: true,
        message: `Erro ao ${action === 'approved' ? 'aprovar' : 'reprovar'} vídeo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        severity: 'error'
      });
    } finally {
      setLoadingState(false);
    }
  };

  const handleApprove = () => handleApproval('approved');
  const handleReject = () => handleApproval('reproved');

  const handleDeleteVideo = async () => {
    if (!id) return;

    setDeleting(true);
    try {
      await axios.delete(`/api/videos/${id}`);
      setSnackbar({
        open: true,
        message: 'Vídeo deletado com sucesso!',
        severity: 'success'
      });
      
      // Redirecionar para a lista após um delay
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (error) {
      console.error('Error deleting video:', error);
      setSnackbar({
        open: true,
        message: 'Erro ao deletar vídeo',
        severity: 'error'
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="30vh">
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return <Alert severity="error">{error}</Alert>;
    }

    // If we have status but no video data yet, show processing
    if (!video && (status === 'processing' || status === 'pending' || status === 'queued')) {
      return (
        <Box textAlign="center" py={4}>
          <CircularProgress size={60} sx={{ mb: 2 }} />
          <Typography variant="h6">Your video is being created...</Typography>
          <Typography variant="body1" color="text.secondary">
            This may take a few minutes. Please wait.
          </Typography>
        </Box>
      );
    }

    if (status === 'processing') {
      return (
        <Box textAlign="center" py={4}>
          <CircularProgress size={60} sx={{ mb: 2 }} />
          <Typography variant="h6">Your video is being created...</Typography>
          <Typography variant="body1" color="text.secondary">
            This may take a few minutes. Please wait.
          </Typography>
        </Box>
      );
    }

    if (status === 'ready') {
      return (
        <Box>
          <Box mb={3} textAlign="center">
            <Typography variant="h6" color="success.main" gutterBottom>
              Your video is ready!
            </Typography>
          </Box>
          
          <Box sx={{ 
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            mb: 3,
            backgroundColor: '#000',
            borderRadius: 1,
            overflow: 'hidden'
          }}>
            {video && (
              <Box
                component="video"
                controls
                sx={{
                  maxHeight: '70vh',
                  maxWidth: '100%',
                  objectFit: 'contain',
                }}
                src={`/api/video/${id}`}
              />
            )}
          </Box>
          
          <Box textAlign="center" display="flex" justifyContent="center" gap={2} flexWrap="wrap">
            <Button 
              component="a"
              href={`/api/video/${id}`}
              download
              variant="contained" 
              color="primary" 
              startIcon={<DownloadIcon />}
              sx={{ textDecoration: 'none' }}
            >
              Download Video
            </Button>
            <Button 
              variant="outlined" 
              color="primary" 
              startIcon={<EditIcon />}
              onClick={handleEdit}
            >
              Edit Video
            </Button>
            <Button 
              variant="contained" 
              color="success" 
              startIcon={approving ? <CircularProgress size={16} /> : <CheckCircleIcon />}
              onClick={handleApprove}
              disabled={approving || rejecting}
            >
              {approving ? 'Aprovando...' : 'Aprovar'}
            </Button>
            <Button 
              variant="contained" 
              color="error" 
              startIcon={rejecting ? <CircularProgress size={16} /> : <CancelIcon />}
              onClick={handleReject}
              disabled={approving || rejecting}
            >
              {rejecting ? 'Reprovando...' : 'Reprovar'}
            </Button>
            <Button 
              variant="outlined" 
              color="error" 
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteDialogOpen(true)}
              disabled={approving || rejecting}
            >
              Deletar
            </Button>
          </Box>
        </Box>
      );
    }

    if (status === 'failed') {
      return (
        <Box textAlign="center">
          <Alert severity="error" sx={{ mb: 3 }}>
            {statusError || 'Video processing failed. Please try again with different settings.'}
          </Alert>
          <Button 
            variant="outlined" 
            color="primary" 
            startIcon={<EditIcon />}
            onClick={handleEdit}
          >
            Edit Video
          </Button>
        </Box>
      );
    }

    return (
      <Alert severity="info" sx={{ mb: 3 }}>
        Unknown video status. Please try refreshing the page.
      </Alert>
    );
  };

  const capitalizeFirstLetter = (str: string) => {
    if (!str || typeof str !== 'string') return 'Unknown';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  return (
    <Box maxWidth="md" mx="auto" py={4}>
      <Box display="flex" alignItems="center" mb={3}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={handleBack}
          sx={{ mr: 2 }}
        >
          Back to videos
        </Button>
        <Typography variant="h4" component="h1">
          Video Details
        </Typography>
      </Box>

      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">
              Video ID
            </Typography>
            <Typography variant="body1">
              {id || 'Unknown'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">
              Status
            </Typography>
            <Typography 
              variant="body1" 
              color={
                status === 'ready' ? 'success.main' : 
                status === 'processing' ? 'info.main' : 
                status === 'pending' || status === 'queued' ? 'info.main' :
                status === 'failed' ? 'error.main' : 'text.primary'
              }
            >
              {capitalizeFirstLetter(status || 'unknown')}
            </Typography>
          </Grid>
        </Grid>
        
        {renderContent()}
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          {"Confirmar Exclusão"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Tem certeza de que deseja apagar este vídeo? Esta ação não pode ser desfeita.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancelar
          </Button>
          <Button 
            onClick={handleDeleteVideo} 
            color="error" 
            variant="contained" 
            autoFocus
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deleting ? 'Apagando...' : 'Apagar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VideoDetails; 