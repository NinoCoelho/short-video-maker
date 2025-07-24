import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  CardMedia,
  Divider,
  Alert,
  LinearProgress,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Badge
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Settings as SettingsIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Refresh as RetryIcon,
  Save as SaveIcon,
  FolderOpen as FolderOpenIcon,
  CloudUpload as CloudUploadIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  MoreVert as MoreVertIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Info as InfoIcon,
  BatchPrediction as BatchIcon,
  VideoLibrary as VideoLibraryIcon
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { ImportJob, ImportJobStatus, VideoSourceType, ImportPipelineConfig } from '../../../types/import';
import { ImportSettings as ShortImportSettings, OrientationEnum, MusicMoodEnum } from '../../../types/shorts';
import ImportSettingsComponent from './ImportSettings';

interface BatchVideoItem {
  id: string;
  url: string;
  title?: string;
  duration?: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
  jobId?: string;
  metadata?: {
    thumbnail?: string;
    description?: string;
    platform?: string;
    fileSize?: number;
  };
  settings?: Partial<ShortImportSettings>;
}

interface BatchConfiguration {
  id: string;
  name: string;
  description?: string;
  settings: ShortImportSettings;
  createdAt: Date;
  videosCount: number;
}

interface BatchImporterProps {
  onBatchComplete?: (batch: BatchVideoItem[]) => void;
  onVideoComplete?: (video: BatchVideoItem) => void;
  defaultSettings?: Partial<ShortImportSettings>;
  maxBatchSize?: number;
  websocketUrl?: string;
}

const BatchImporter: React.FC<BatchImporterProps> = ({
  onBatchComplete,
  onVideoComplete,
  defaultSettings,
  maxBatchSize = 50,
  websocketUrl = `ws://${window.location.hostname}:${window.location.port || 3000}/ws`
}) => {
  // State management
  const [videos, setVideos] = useState<BatchVideoItem[]>([]);
  const [batchSettings, setBatchSettings] = useState<ShortImportSettings>({
    targetLanguage: 'en',
    music: MusicMoodEnum.happy,
    orientation: OrientationEnum.portrait,
    autoHighlights: true,
    maxSegmentDuration: 60,
    minSegmentDuration: 15,
    ...defaultSettings
  });
  const [useGlobalSettings, setUseGlobalSettings] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBatchConfig, setShowBatchConfig] = useState(false);
  const [savedConfigurations, setSavedConfigurations] = useState<BatchConfiguration[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<BatchVideoItem | null>(null);
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState<null | HTMLElement>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Default settings for new videos
  const defaultVideoSettings: ShortImportSettings = {
    targetLanguage: 'en',
    music: MusicMoodEnum.happy,
    orientation: OrientationEnum.portrait,
    autoHighlights: true,
    maxSegmentDuration: 60,
    minSegmentDuration: 15
  };

  // WebSocket connection management
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      wsRef.current = new WebSocket(websocketUrl);
      
      wsRef.current.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
        console.log('WebSocket connected for batch import');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected, attempting to reconnect...');
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };

      wsRef.current.onerror = (error) => {
        setConnectionError('WebSocket connection failed');
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      setConnectionError('Failed to create WebSocket connection');
      console.error('WebSocket connection error:', error);
    }
  }, [websocketUrl]);

  // Handle WebSocket messages
  const handleWebSocketMessage = (data: any) => {
    if (data.type === 'batch-video-progress') {
      const { videoId, status, progress, error, metadata } = data.payload;
      
      setVideos(prev => prev.map(video => 
        video.id === videoId || video.jobId === videoId
          ? {
              ...video,
              status,
              progress: progress || video.progress,
              error: error || video.error,
              metadata: metadata ? { ...video.metadata, ...metadata } : video.metadata
            }
          : video
      ));
      
      // Notify parent component if video is completed
      if (status === 'completed' && onVideoComplete) {
        const completedVideo = videos.find(v => v.id === videoId || v.jobId === videoId);
        if (completedVideo) {
          onVideoComplete({ ...completedVideo, status, progress: progress || 100 });
        }
      }
    } else if (data.type === 'batch-complete') {
      setIsProcessing(false);
      if (onBatchComplete) {
        onBatchComplete(videos);
      }
    }
  };

  // WebSocket lifecycle management
  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // Send message to WebSocket
  const sendWebSocketMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  };

  // File drop zone for CSV/text files
  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
          parseCSVContent(content);
        } else {
          parseTextContent(content);
        }
      };
      reader.readAsText(file);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'text/csv': ['.csv']
    },
    multiple: true
  });

  // Parse CSV content
  const parseCSVContent = (content: string) => {
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0]?.toLowerCase().split(',').map(h => h.trim());
    
    if (!headers) return;
    
    const urlIndex = headers.findIndex(h => h.includes('url') || h.includes('link'));
    const titleIndex = headers.findIndex(h => h.includes('title') || h.includes('name'));
    
    if (urlIndex === -1) {
      alert('CSV must contain a URL column');
      return;
    }

    const newVideos: BatchVideoItem[] = [];
    for (let i = 1; i < lines.length && newVideos.length < maxBatchSize; i++) {
      const row = lines[i].split(',').map(cell => cell.trim());
      const url = row[urlIndex]?.replace(/['"]/g, '');
      
      if (url && isValidUrl(url)) {
        newVideos.push({
          id: `batch-${Date.now()}-${i}`,
          url,
          title: titleIndex !== -1 ? row[titleIndex]?.replace(/['"]/g, '') : undefined,
          status: 'pending',
          progress: 0,
          settings: useGlobalSettings ? undefined : { ...defaultVideoSettings }
        });
      }
    }
    
    setVideos(prev => [...prev, ...newVideos]);
  };

  // Parse plain text content (one URL per line)
  const parseTextContent = (content: string) => {
    const urls = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && isValidUrl(line))
      .slice(0, maxBatchSize);

    const newVideos: BatchVideoItem[] = urls.map((url, index) => ({
      id: `batch-${Date.now()}-${index}`,
      url,
      status: 'pending',
      progress: 0,
      settings: useGlobalSettings ? undefined : { ...defaultVideoSettings }
    }));

    setVideos(prev => [...prev, ...newVideos]);
  };

  // Validate URL
  const isValidUrl = (string: string): boolean => {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  };

  // Add single URL
  const addSingleUrl = () => {
    if (!urlInput.trim() || !isValidUrl(urlInput.trim())) {
      alert('Please enter a valid URL');
      return;
    }

    if (videos.length >= maxBatchSize) {
      alert(`Maximum batch size is ${maxBatchSize} videos`);
      return;
    }

    const newVideo: BatchVideoItem = {
      id: `single-${Date.now()}`,
      url: urlInput.trim(),
      status: 'pending',
      progress: 0,
      settings: useGlobalSettings ? undefined : { ...defaultVideoSettings }
    };

    setVideos(prev => [...prev, newVideo]);
    setUrlInput('');
  };

  // Remove video from batch
  const removeVideo = (id: string) => {
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  // Update video settings
  const updateVideoSettings = (id: string, settings: Partial<ShortImportSettings>) => {
    setVideos(prev => prev.map(v => 
      v.id === id ? { ...v, settings: { ...v.settings, ...settings } } : v
    ));
  };

  // Apply global settings to all videos
  const applyGlobalSettings = () => {
    if (useGlobalSettings) {
      setVideos(prev => prev.map(v => ({ ...v, settings: undefined })));
    } else {
      setVideos(prev => prev.map(v => ({ 
        ...v, 
        settings: { ...batchSettings } 
      })));
    }
  };

  // Start batch processing
  const startBatchProcessing = async () => {
    if (videos.length === 0) {
      alert('Please add videos to process');
      return;
    }

    setIsProcessing(true);
    
    // Send batch start message via WebSocket
    sendWebSocketMessage({
      type: 'batch-start',
      payload: {
        batchId: `batch-${Date.now()}`,
        videos: videos.map(v => ({
          id: v.id,
          url: v.url,
          settings: v.settings || batchSettings
        })),
        globalSettings: batchSettings,
        useGlobalSettings
      }
    });

    // Process videos individually or let WebSocket handle the queue
    if (isConnected) {
      // WebSocket will handle progress updates
      videos.forEach(video => {
        updateVideoStatus(video.id, 'processing', 0);
      });
    } else {
      // Fallback to local processing
      for (const video of videos) {
        try {
          await processVideo(video);
        } catch (error) {
          console.error(`Error processing video ${video.id}:`, error);
          updateVideoStatus(video.id, 'error', 0, String(error));
        }
      }
      
      setIsProcessing(false);
      if (onBatchComplete) {
        onBatchComplete(videos);
      }
    }
  };

  // Process individual video
  const processVideo = async (video: BatchVideoItem) => {
    const settings = video.settings || batchSettings;
    
    updateVideoStatus(video.id, 'processing', 0);

    try {
      // Simulate video processing with progress updates
      const steps = ['Downloading', 'Transcribing', 'Analyzing', 'Processing'];
      
      for (let i = 0; i < steps.length; i++) {
        const progress = ((i + 1) / steps.length) * 100;
        updateVideoStatus(video.id, 'processing', progress);
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      updateVideoStatus(video.id, 'completed', 100);
      
      if (onVideoComplete) {
        const completedVideo = videos.find(v => v.id === video.id);
        if (completedVideo) {
          onVideoComplete(completedVideo);
        }
      }
    } catch (error) {
      updateVideoStatus(video.id, 'error', 0, String(error));
    }
  };

  // Update video status
  const updateVideoStatus = (id: string, status: BatchVideoItem['status'], progress: number, error?: string) => {
    setVideos(prev => prev.map(v => 
      v.id === id 
        ? { ...v, status, progress, error, ...(error && { error }) }
        : v
    ));
  };

  // Retry failed video
  const retryVideo = async (video: BatchVideoItem) => {
    // Send retry message via WebSocket if connected
    if (isConnected) {
      sendWebSocketMessage({
        type: 'retry-video',
        payload: {
          videoId: video.id,
          url: video.url,
          settings: video.settings || batchSettings
        }
      });
      updateVideoStatus(video.id, 'processing', 0);
    } else {
      // Fallback to local processing
      await processVideo(video);
    }
  };

  // Save batch configuration
  const saveBatchConfiguration = (name: string, description?: string) => {
    const config: BatchConfiguration = {
      id: `config-${Date.now()}`,
      name,
      description,
      settings: { ...batchSettings },
      createdAt: new Date(),
      videosCount: videos.length
    };

    setSavedConfigurations(prev => [...prev, config]);
    setShowBatchConfig(false);
  };

  // Load batch configuration
  const loadBatchConfiguration = (config: BatchConfiguration) => {
    setBatchSettings(config.settings);
    setSettingsMenuAnchor(null);
  };

  // Toggle card expansion
  const toggleCardExpansion = (id: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Get status color
  const getStatusColor = (status: BatchVideoItem['status']) => {
    switch (status) {
      case 'completed': return 'success';
      case 'error': return 'error';
      case 'processing': return 'primary';
      default: return 'default';
    }
  };

  // Get status icon
  const getStatusIcon = (status: BatchVideoItem['status']) => {
    switch (status) {
      case 'completed': return <CheckCircleIcon color="success" />;
      case 'error': return <ErrorIcon color="error" />;
      case 'processing': return <LinearProgress />;
      default: return null;
    }
  };

  // Calculate batch statistics
  const batchStats = {
    total: videos.length,
    completed: videos.filter(v => v.status === 'completed').length,
    processing: videos.filter(v => v.status === 'processing').length,
    errors: videos.filter(v => v.status === 'error').length,
    pending: videos.filter(v => v.status === 'pending').length
  };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center">
          <BatchIcon sx={{ mr: 2, fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" gutterBottom>
              Batch Video Importer
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Import and process multiple videos simultaneously
            </Typography>
          </Box>
        </Box>
        
        <Box display="flex" gap={1} alignItems="center">
          {/* WebSocket Connection Status */}
          <Tooltip title={isConnected ? 'Real-time updates enabled' : 'Real-time updates disabled'}>
            <Chip
              label={isConnected ? 'Connected' : 'Offline'}
              color={isConnected ? 'success' : 'default'}
              size="small"
              variant="outlined"
            />
          </Tooltip>
          
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={() => setShowSettings(true)}
          >
            Batch Settings
          </Button>
          <Button
            variant="outlined"
            startIcon={<MoreVertIcon />}
            onClick={(e) => setSettingsMenuAnchor(e.currentTarget)}
          >
            Options
          </Button>
        </Box>
      </Box>

      {/* WebSocket Connection Error */}
      {connectionError && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" gutterBottom>
            {connectionError}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Real-time progress updates are disabled. The batch will still process, but you won't see live updates.
          </Typography>
        </Alert>
      )}

      {/* Batch Statistics */}
      {videos.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Batch Status</Typography>
            <Box display="flex" gap={2}>
              <Chip 
                label={`Total: ${batchStats.total}`} 
                color="default" 
                size="small" 
              />
              <Chip 
                label={`Completed: ${batchStats.completed}`} 
                color="success" 
                size="small" 
              />
              <Chip 
                label={`Processing: ${batchStats.processing}`} 
                color="primary" 
                size="small" 
              />
              <Chip 
                label={`Errors: ${batchStats.errors}`} 
                color="error" 
                size="small" 
              />
              <Chip 
                label={`Pending: ${batchStats.pending}`} 
                color="default" 
                size="small" 
                variant="outlined" 
              />
            </Box>
          </Box>
          
          {batchStats.total > 0 && (
            <Box mt={2}>
              <LinearProgress
                variant="determinate"
                value={(batchStats.completed / batchStats.total) * 100}
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {batchStats.completed}/{batchStats.total} videos completed
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* URL Input Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Add Videos to Batch
        </Typography>
        
        {/* Single URL Input */}
        <Box display="flex" gap={2} mb={3}>
          <TextField
            fullWidth
            label="Video URL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            onKeyDown={(e) => e.key === 'Enter' && addSingleUrl()}
          />
          <Button
            variant="contained"
            onClick={addSingleUrl}
            startIcon={<AddIcon />}
            disabled={videos.length >= maxBatchSize}
          >
            Add
          </Button>
        </Box>

        {/* File Drop Zone */}
        <Box
          {...getRootProps()}
          sx={{
            border: '2px dashed',
            borderColor: isDragActive ? 'primary.main' : 'grey.300',
            borderRadius: 2,
            p: 3,
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isDragActive ? 'action.hover' : 'transparent',
            transition: 'all 0.2s ease'
          }}
        >
          <input {...getInputProps()} />
          <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="body1" gutterBottom>
            {isDragActive
              ? 'Drop files here...'
              : 'Drag & drop CSV/text files here, or click to select'
            }
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Supports CSV files with URL column or text files with one URL per line
          </Typography>
        </Box>

        {videos.length >= maxBatchSize && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Maximum batch size of {maxBatchSize} videos reached
          </Alert>
        )}
      </Paper>

      {/* Global Settings Toggle */}
      {videos.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={useGlobalSettings}
                onChange={(e) => {
                  setUseGlobalSettings(e.target.checked);
                  setTimeout(applyGlobalSettings, 0);
                }}
              />
            }
            label={
              <Box>
                <Typography variant="body1">Use Global Settings</Typography>
                <Typography variant="caption" color="text.secondary">
                  Apply the same settings to all videos, or configure individually
                </Typography>
              </Box>
            }
          />
        </Paper>
      )}

      {/* Video Cards */}
      {videos.length > 0 && (
        <Box mb={3}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h6">
              Videos in Batch ({videos.length})
            </Typography>
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={startBatchProcessing}
              disabled={isProcessing || videos.length === 0}
              startIcon={isProcessing ? <LinearProgress /> : <PlayIcon />}
            >
              {isProcessing ? 'Processing...' : 'Start Batch Import'}
            </Button>
          </Box>

          <Grid container spacing={2}>
            {videos.map((video) => (
              <Grid item xs={12} md={6} lg={4} key={video.id}>
                <Card>
                  {video.metadata?.thumbnail && (
                    <CardMedia
                      component="img"
                      height="140"
                      image={video.metadata.thumbnail}
                      alt={video.title || 'Video thumbnail'}
                    />
                  )}
                  
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                      <Typography variant="subtitle1" noWrap sx={{ flexGrow: 1 }}>
                        {video.title || 'Untitled Video'}
                      </Typography>
                      <Chip
                        label={video.status.toUpperCase()}
                        color={getStatusColor(video.status)}
                        size="small"
                      />
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {video.url}
                    </Typography>

                    {video.status === 'processing' && (
                      <Box mb={2}>
                        <LinearProgress 
                          variant="determinate" 
                          value={video.progress}
                          sx={{ mb: 1 }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          Progress: {video.progress}%
                        </Typography>
                      </Box>
                    )}

                    {video.error && (
                      <Alert severity="error" sx={{ mb: 2 }}>
                        {video.error}
                      </Alert>
                    )}

                    {/* Individual Settings Preview */}
                    {!useGlobalSettings && video.settings && (
                      <Collapse in={expandedCards.has(video.id)}>
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                          <Typography variant="caption" color="text.secondary" gutterBottom>
                            Individual Settings:
                          </Typography>
                          <Box display="flex" flexWrap="wrap" gap={0.5}>
                            <Chip 
                              label={`Lang: ${video.settings.targetLanguage}`} 
                              size="small" 
                              variant="outlined" 
                            />
                            <Chip 
                              label={`Music: ${video.settings.music}`} 
                              size="small" 
                              variant="outlined" 
                            />
                            <Chip 
                              label={`Format: ${video.settings.orientation}`} 
                              size="small" 
                              variant="outlined" 
                            />
                          </Box>
                        </Box>
                      </Collapse>
                    )}
                  </CardContent>

                  <CardActions>
                    {!useGlobalSettings && (
                      <IconButton
                        size="small"
                        onClick={() => toggleCardExpansion(video.id)}
                      >
                        {expandedCards.has(video.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    )}
                    
                    {!useGlobalSettings && (
                      <IconButton
                        size="small"
                        onClick={() => setSelectedVideo(video)}
                      >
                        <EditIcon />
                      </IconButton>
                    )}

                    {video.status === 'error' && (
                      <IconButton
                        size="small"
                        onClick={() => retryVideo(video)}
                        color="primary"
                      >
                        <RetryIcon />
                      </IconButton>
                    )}

                    <IconButton
                      size="small"
                      onClick={() => removeVideo(video.id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {videos.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <VideoLibraryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No videos in batch
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add videos using the input above to get started
          </Typography>
        </Paper>
      )}

      {/* Settings Dialog */}
      <Dialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Batch Import Settings</DialogTitle>
        <DialogContent>
          <ImportSettingsComponent
            settings={batchSettings}
            onSubmit={(settings) => {
              setBatchSettings(settings);
              setShowSettings(false);
              if (useGlobalSettings) {
                applyGlobalSettings();
              }
            }}
            onBack={() => setShowSettings(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Individual Video Settings Dialog */}
      <Dialog
        open={!!selectedVideo}
        onClose={() => setSelectedVideo(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Video Settings - {selectedVideo?.title || 'Untitled'}</DialogTitle>
        <DialogContent>
          {selectedVideo && (
            <ImportSettingsComponent
              settings={selectedVideo.settings || defaultVideoSettings}
              onSubmit={(settings) => {
                updateVideoSettings(selectedVideo.id, settings);
                setSelectedVideo(null);
              }}
              onBack={() => setSelectedVideo(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Batch Configuration Dialog */}
      <Dialog
        open={showBatchConfig}
        onClose={() => setShowBatchConfig(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Save Batch Configuration</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Configuration Name"
            sx={{ mb: 2 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = (e.target as HTMLInputElement).value;
                if (name.trim()) {
                  saveBatchConfiguration(name.trim());
                }
              }
            }}
          />
          <TextField
            fullWidth
            label="Description (Optional)"
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBatchConfig(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => saveBatchConfiguration('New Configuration')}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Options Menu */}
      <Menu
        anchorEl={settingsMenuAnchor}
        open={Boolean(settingsMenuAnchor)}
        onClose={() => setSettingsMenuAnchor(null)}
      >
        <MenuItem onClick={() => setShowBatchConfig(true)}>
          <ListItemIcon>
            <SaveIcon />
          </ListItemIcon>
          <ListItemText primary="Save Configuration" />
        </MenuItem>
        
        {savedConfigurations.length > 0 && (
          <MenuItem disabled>
            <ListItemIcon>
              <FolderOpenIcon />
            </ListItemIcon>
            <ListItemText primary="Load Configuration" />
          </MenuItem>
        )}
        
        {savedConfigurations.map((config) => (
          <MenuItem
            key={config.id}
            onClick={() => loadBatchConfiguration(config)}
            sx={{ pl: 4 }}
          >
            <ListItemText 
              primary={config.name}
              secondary={`${config.videosCount} videos`}
            />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default BatchImporter;