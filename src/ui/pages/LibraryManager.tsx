import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  CardMedia,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Fab,
  Tooltip,
  Alert,
  LinearProgress,
  Divider
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Folder as FolderIcon,
  LibraryMusic as MusicIcon,
  Image as ImageIcon,
  Upload as UploadIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types
interface Asset {
  id: string;
  filename: string;
  title: string;
  tags: string[];
  fileSize: number;
  format: string;
  createdAt: string;
  updatedAt: string;
  // Music specific
  duration?: number;
  mood?: string;
  // Overlay specific
  dimensions?: { width: number; height: number };
}

interface Collection {
  id: string;
  name: string;
  description: string;
  type: 'music' | 'overlay';
  assetIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface LibraryStats {
  totalAssets: number;
  musicAssets: number;
  overlayAssets: number;
  collections: number;
  totalSize: number;
  musicMoods: Record<string, number>;
  allTags: string[];
}

// API functions
const libraryAPI = {
  async getAssets(filter: any = {}) {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([key, value]) => {
      if (value) params.append(key, String(value));
    });
    
    const response = await fetch(`/api/library/assets?${params}`);
    if (!response.ok) throw new Error('Failed to fetch assets');
    return response.json();
  },

  async getCollections(type?: string) {
    const params = type ? `?type=${type}` : '';
    const response = await fetch(`/api/library/collections${params}`);
    if (!response.ok) throw new Error('Failed to fetch collections');
    return response.json();
  },

  async getStats() {
    const response = await fetch('/api/library/stats');
    if (!response.ok) throw new Error('Failed to fetch stats');
    return response.json();
  },

  async getMoods() {
    const response = await fetch('/api/library/moods');
    if (!response.ok) throw new Error('Failed to fetch moods');
    return response.json();
  },

  async getTags() {
    const response = await fetch('/api/library/tags');
    if (!response.ok) throw new Error('Failed to fetch tags');
    return response.json();
  },

  async uploadAsset(file: File, options: any = {}) {
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(options).forEach(([key, value]) => {
      if (value) formData.append(key, String(value));
    });

    const response = await fetch('/api/library/assets/upload', {
      method: 'POST',
      body: formData
    });
    if (!response.ok) throw new Error('Failed to upload asset');
    return response.json();
  },

  async deleteAsset(id: string) {
    const response = await fetch(`/api/library/assets/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete asset');
    return response.json();
  },

  async updateAsset(id: string, updates: any) {
    const response = await fetch(`/api/library/assets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update asset');
    return response.json();
  },

  async createCollection(data: any) {
    const response = await fetch('/api/library/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create collection');
    return response.json();
  }
};

const LibraryManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'music' | 'overlay'>('all');
  const [filterMood, setFilterMood] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  const queryClient = useQueryClient();

  // Queries
  const { data: assetsData, isLoading: assetsLoading, error: assetsError } = useQuery({
    queryKey: ['library-assets', { 
      type: filterType === 'all' ? undefined : filterType,
      search: searchTerm,
      mood: filterMood
    }],
    queryFn: () => libraryAPI.getAssets({
      type: filterType === 'all' ? undefined : filterType,
      search: searchTerm,
      mood: filterMood
    })
  });

  const { data: collectionsData } = useQuery({
    queryKey: ['library-collections'],
    queryFn: () => libraryAPI.getCollections()
  });

  const { data: statsData } = useQuery({
    queryKey: ['library-stats'],
    queryFn: () => libraryAPI.getStats()
  });

  const { data: moodsData } = useQuery({
    queryKey: ['library-moods'],
    queryFn: () => libraryAPI.getMoods()
  });

  const { data: tagsData } = useQuery({
    queryKey: ['library-tags'],
    queryFn: () => libraryAPI.getTags()
  });

  // Mutations
  const uploadMutation = useMutation({
    mutationFn: ({ file, options }: { file: File; options: any }) => 
      libraryAPI.uploadAsset(file, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-assets'] });
      queryClient.invalidateQueries({ queryKey: ['library-stats'] });
      setUploadDialogOpen(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: libraryAPI.deleteAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-assets'] });
      queryClient.invalidateQueries({ queryKey: ['library-stats'] });
      setAnchorEl(null);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => 
      libraryAPI.updateAsset(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-assets'] });
      setEditingAsset(null);
    }
  });

  // Audio playback
  const toggleAudioPlayback = (asset: Asset) => {
    if (asset.id === playingAudio) {
      // Stop current audio
      if (audioRef) {
        audioRef.pause();
        audioRef.currentTime = 0;
      }
      setPlayingAudio(null);
      setAudioRef(null);
    } else {
      // Stop any currently playing audio
      if (audioRef) {
        audioRef.pause();
        audioRef.currentTime = 0;
      }
      
      // Start new audio
      const audio = new Audio(`/api/library/files/music/${asset.filename}`);
      audio.addEventListener('ended', () => {
        setPlayingAudio(null);
        setAudioRef(null);
      });
      audio.play();
      setPlayingAudio(asset.id);
      setAudioRef(audio);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const assets = assetsData?.data?.assets || [];
  const collections = collectionsData?.data?.collections || [];
  const stats: LibraryStats = statsData?.data || {
    totalAssets: 0,
    musicAssets: 0,
    overlayAssets: 0,
    collections: 0,
    totalSize: 0,
    musicMoods: {},
    allTags: []
  };
  const availableMoods = moodsData?.data?.moods || [];
  const availableTags = tagsData?.data?.tags || [];

  const StatsCard = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Library Statistics
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <Box textAlign="center">
              <Typography variant="h4" color="primary">
                {stats.totalAssets}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Total Assets
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box textAlign="center">
              <Typography variant="h4" color="secondary">
                {stats.musicAssets}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Music Files
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box textAlign="center">
              <Typography variant="h4" color="info.main">
                {stats.overlayAssets}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Overlays
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box textAlign="center">
              <Typography variant="h4" color="success.main">
                {formatFileSize(stats.totalSize)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Total Size
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );

  const AssetCard = ({ asset }: { asset: Asset }) => {
    const isMusic = 'duration' in asset;
    const isPlaying = playingAudio === asset.id;

    return (
      <Card 
        sx={{ 
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          transition: 'transform 0.2s',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: 4
          }
        }}
      >
        <CardMedia
          sx={{ 
            height: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'background.default'
          }}
        >
          {isMusic ? (
            <MusicIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
          ) : (
            <Box
              component="img"
              src={`/api/library/files/overlay/${asset.filename}`}
              alt={asset.title}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.parentElement!.innerHTML = '<svg class="MuiSvgIcon-root" focusable="false" aria-hidden="true" viewBox="0 0 24 24" style="font-size: 48px; color: rgb(158, 158, 158);"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"></path></svg>';
              }}
            />
          )}
        </CardMedia>
        
        <CardContent sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="div" noWrap>
            {asset.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {formatFileSize(asset.fileSize)} • {asset.format.toUpperCase()}
          </Typography>
          
          {isMusic && asset.duration && (
            <Typography variant="body2" color="text.secondary">
              Duration: {formatDuration(asset.duration)}
            </Typography>
          )}
          
          {asset.mood && (
            <Chip 
              label={asset.mood} 
              size="small" 
              sx={{ mt: 1, mr: 1 }}
              color="primary"
              variant="outlined"
            />
          )}
          
          {asset.tags.map((tag) => (
            <Chip 
              key={tag}
              label={tag} 
              size="small" 
              sx={{ mt: 1, mr: 1 }}
              variant="outlined"
            />
          ))}
        </CardContent>
        
        <CardActions>
          {isMusic && (
            <IconButton 
              onClick={() => toggleAudioPlayback(asset)}
              color="primary"
            >
              {isPlaying ? <PauseIcon data-testid="PauseIcon" /> : <PlayIcon data-testid="PlayArrowIcon" />}
            </IconButton>
          )}
          
          <IconButton 
            onClick={(e) => {
              e.preventDefault();
              setSelectedAsset(asset);
              setContextMenu(
                contextMenu === null
                  ? {
                      mouseX: e.clientX - 2,
                      mouseY: e.clientY - 4,
                    }
                  : null,
              );
            }}
          >
            <MoreVertIcon data-testid="MoreVertIcon" />
          </IconButton>
        </CardActions>
      </Card>
    );
  };

  const UploadDialog = () => {
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadOptions, setUploadOptions] = useState({
      title: '',
      tags: '',
      mood: '',
      collection: ''
    });

    const handleUpload = () => {
      if (!uploadFile) return;
      
      uploadMutation.mutate({
        file: uploadFile,
        options: {
          ...uploadOptions,
          tags: uploadOptions.tags.split(',').map(t => t.trim()).filter(Boolean).join(',')
        }
      });
    };

    return (
      <Dialog 
        open={uploadDialogOpen} 
        onClose={() => setUploadDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Upload Asset</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <input
              type="file"
              accept="audio/*,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setUploadFile(file);
                  setUploadOptions(prev => ({
                    ...prev,
                    title: file.name.replace(/\.[^/.]+$/, '')
                  }));
                }
              }}
              style={{ marginBottom: 16 }}
            />
            
            <TextField
              fullWidth
              label="Title"
              value={uploadOptions.title}
              onChange={(e) => setUploadOptions(prev => ({ 
                ...prev, 
                title: e.target.value 
              }))}
              margin="normal"
            />
            
            <TextField
              fullWidth
              label="Tags (comma separated)"
              value={uploadOptions.tags}
              onChange={(e) => setUploadOptions(prev => ({ 
                ...prev, 
                tags: e.target.value 
              }))}
              margin="normal"
            />
            
            {uploadFile?.type.startsWith('audio/') && (
              <FormControl fullWidth margin="normal">
                <InputLabel>Mood</InputLabel>
                <Select
                  value={uploadOptions.mood}
                  label="Mood"
                  onChange={(e) => setUploadOptions(prev => ({ 
                    ...prev, 
                    mood: e.target.value 
                  }))}
                >
                  <MenuItem value="">None</MenuItem>
                  {availableMoods.map((mood: string) => (
                    <MenuItem key={mood} value={mood}>
                      {mood}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpload}
            variant="contained"
            disabled={!uploadFile || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Library Manager
        </Typography>
        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={() => setUploadDialogOpen(true)}
        >
          Upload Asset
        </Button>
      </Box>

      <StatsCard />

      {/* Filter Bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                placeholder="Search assets..."
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
            <Grid item xs={6} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={filterType}
                  label="Type"
                  onChange={(e) => setFilterType(e.target.value as any)}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="music">Music</MenuItem>
                  <MenuItem value="overlay">Overlays</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Mood</InputLabel>
                <Select
                  value={filterMood}
                  label="Mood"
                  onChange={(e) => setFilterMood(e.target.value)}
                  disabled={filterType === 'overlay'}
                >
                  <MenuItem value="">All</MenuItem>
                  {availableMoods.map((mood: string) => (
                    <MenuItem key={mood} value={mood}>
                      {mood}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Assets Grid */}
      {assetsLoading && <LinearProgress sx={{ mb: 3 }} />}
      
      {assetsError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load assets. Please try again.
        </Alert>
      )}

      <Grid container spacing={3}>
        {assets.map((asset: Asset) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={asset.id}>
            <AssetCard asset={asset} />
          </Grid>
        ))}
      </Grid>

      {assets.length === 0 && !assetsLoading && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            No assets found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Start by uploading some music or overlay files
          </Typography>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => setUploadDialogOpen(true)}
          >
            Upload Your First Asset
          </Button>
        </Box>
      )}

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={() => {
          setEditingAsset(selectedAsset);
          setContextMenu(null);
        }}>
          <EditIcon sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedAsset) {
            const url = `mood` in selectedAsset 
              ? `/api/library/files/music/${selectedAsset.filename}`
              : `/api/library/files/overlay/${selectedAsset.filename}`;
            window.open(url, '_blank');
          }
          setContextMenu(null);
        }}>
          <DownloadIcon sx={{ mr: 1 }} />
          Download
        </MenuItem>
        <MenuItem 
          onClick={() => {
            if (selectedAsset) {
              deleteMutation.mutate(selectedAsset.id);
            }
            setContextMenu(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      <UploadDialog />
    </Box>
  );
};

export default LibraryManager;