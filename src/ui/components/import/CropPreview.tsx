import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Slider,
  Switch,
  FormControlLabel,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Alert,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
  Grid,
  Card,
  CardContent,
  Divider
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import CropIcon from '@mui/icons-material/Crop';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import RestoreIcon from '@mui/icons-material/Restore';
import SaveIcon from '@mui/icons-material/Save';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CompareIcon from '@mui/icons-material/Compare';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TuneIcon from '@mui/icons-material/Tune';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useDebounce } from '../../hooks/useDebounce';

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SubjectDetection {
  id: string;
  bbox: CropRegion;
  confidence: number;
  type: 'person' | 'face' | 'object' | 'text';
  timestamp: number;
}

interface CropPreviewProps {
  videoId: string;
  videoUrl: string;
  originalDimensions: { width: number; height: number };
  targetAspectRatio: number; // e.g., 9/16 for vertical video
  cropRegion: CropRegion;
  onCropChange?: (cropRegion: CropRegion) => void;
  onApplyToAll?: (cropRegion: CropRegion) => void;
  subjectTracking?: boolean;
  currentTime?: number;
  duration?: number;
  onTimeChange?: (time: number) => void;
  detections?: SubjectDetection[];
  presets?: Array<{ name: string; ratio: number; crop?: CropRegion }>;
}

type ViewMode = 'split' | 'before' | 'after' | 'overlay';
type TrackingMode = 'off' | 'auto' | 'manual';

const CropPreview: React.FC<CropPreviewProps> = ({
  videoId,
  videoUrl,
  originalDimensions,
  targetAspectRatio,
  cropRegion: initialCropRegion,
  onCropChange,
  onApplyToAll,
  subjectTracking = false,
  currentTime = 0,
  duration = 0,
  onTimeChange,
  detections = [],
  presets = [
    { name: 'TikTok/Instagram', ratio: 9/16 },
    { name: 'YouTube Shorts', ratio: 9/16 },
    { name: 'Square', ratio: 1 },
    { name: 'Landscape', ratio: 16/9 },
    { name: 'Cinema', ratio: 21/9 }
  ]
}) => {
  const [cropRegion, setCropRegion] = useState<CropRegion>(initialCropRegion);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; region: CropRegion } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [trackingMode, setTrackingMode] = useState<TrackingMode>(subjectTracking ? 'auto' : 'off');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [trackingData, setTrackingData] = useState<SubjectDetection[]>(detections);
  const [manualKeyframes, setManualKeyframes] = useState<Array<{ time: number; crop: CropRegion }>>([]);
  const [showPresets, setShowPresets] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const { socket, emit } = useWebSocket();
  const debouncedCropRegion = useDebounce(cropRegion, 300);

  // Listen for crop updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleCropUpdate = (data: { videoId: string; cropRegion: CropRegion; time: number }) => {
      if (data.videoId === videoId) {
        setCropRegion(data.cropRegion);
      }
    };

    const handleTrackingUpdate = (data: { videoId: string; detections: SubjectDetection[] }) => {
      if (data.videoId === videoId) {
        setTrackingData(data.detections);
      }
    };

    socket.on('crop-update', handleCropUpdate);
    socket.on('tracking-update', handleTrackingUpdate);
    
    return () => {
      socket.off('crop-update', handleCropUpdate);
      socket.off('tracking-update', handleTrackingUpdate);
    };
  }, [socket, videoId]);

  // Emit crop changes
  useEffect(() => {
    if (debouncedCropRegion !== initialCropRegion) {
      onCropChange?.(debouncedCropRegion);
      
      emit('crop-update', {
        videoId,
        cropRegion: debouncedCropRegion,
        time: currentTime
      });
    }
  }, [debouncedCropRegion, initialCropRegion, onCropChange, emit, videoId, currentTime]);

  // Calculate optimal crop region based on aspect ratio
  const calculateOptimalCrop = useCallback((
    originalWidth: number,
    originalHeight: number,
    targetRatio: number
  ): CropRegion => {
    const originalRatio = originalWidth / originalHeight;
    
    let width: number;
    let height: number;
    let x: number;
    let y: number;
    
    if (originalRatio > targetRatio) {
      // Original is wider, crop width
      height = originalHeight;
      width = height * targetRatio;
      x = (originalWidth - width) / 2;
      y = 0;
    } else {
      // Original is taller, crop height
      width = originalWidth;
      height = width / targetRatio;
      x = 0;
      y = (originalHeight - height) / 2;
    }
    
    return { x, y, width, height };
  }, []);

  // Get current detection at timestamp
  const getCurrentDetection = useCallback((): SubjectDetection | null => {
    if (!trackingData.length) return null;
    
    // Find closest detection to current time
    const closest = trackingData.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.timestamp - currentTime);
      const currDiff = Math.abs(curr.timestamp - currentTime);
      return currDiff < prevDiff ? curr : prev;
    });
    
    // Only use if within 1 second
    return Math.abs(closest.timestamp - currentTime) <= 1 ? closest : null;
  }, [trackingData, currentTime]);

  // Auto-adjust crop based on subject detection
  useEffect(() => {
    if (trackingMode !== 'auto') return;
    
    const detection = getCurrentDetection();
    if (detection) {
      const { bbox } = detection;
      const padding = 0.1; // 10% padding around subject
      
      // Calculate crop region centered on subject with padding
      const centerX = bbox.x + bbox.width / 2;
      const centerY = bbox.y + bbox.height / 2;
      
      const subjectWidth = bbox.width * (1 + padding);
      const subjectHeight = bbox.height * (1 + padding);
      
      // Ensure we maintain target aspect ratio
      const targetWidth = Math.max(subjectWidth, subjectHeight * targetAspectRatio);
      const targetHeight = targetWidth / targetAspectRatio;
      
      const newX = Math.max(0, Math.min(originalDimensions.width - targetWidth, centerX - targetWidth / 2));
      const newY = Math.max(0, Math.min(originalDimensions.height - targetHeight, centerY - targetHeight / 2));
      
      setCropRegion({
        x: newX,
        y: newY,
        width: targetWidth,
        height: targetHeight
      });
    }
  }, [trackingMode, getCurrentDetection, targetAspectRatio, originalDimensions]);

  const handlePresetSelect = useCallback((preset: typeof presets[0]) => {
    const newCrop = 'crop' in preset && preset.crop ? preset.crop : calculateOptimalCrop(
      originalDimensions.width,
      originalDimensions.height,
      preset.ratio
    );
    
    setCropRegion(newCrop);
    setSelectedPreset(preset.name);
    setShowPresets(false);
  }, [calculateOptimalCrop, originalDimensions]);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (!previewRef.current) return;
    
    const rect = previewRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoomLevel - panOffset.x;
    const y = (event.clientY - rect.top) / zoomLevel - panOffset.y;
    
    setIsDragging(true);
    setDragStart({
      x: event.clientX,
      y: event.clientY,
      region: { ...cropRegion }
    });
  }, [cropRegion, zoomLevel, panOffset]);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isDragging || !dragStart || !previewRef.current) return;
    
    const deltaX = (event.clientX - dragStart.x) / zoomLevel;
    const deltaY = (event.clientY - dragStart.y) / zoomLevel;
    
    const newCrop = {
      x: Math.max(0, Math.min(originalDimensions.width - dragStart.region.width, dragStart.region.x + deltaX)),
      y: Math.max(0, Math.min(originalDimensions.height - dragStart.region.height, dragStart.region.y + deltaY)),
      width: dragStart.region.width,
      height: dragStart.region.height
    };
    
    setCropRegion(newCrop);
  }, [isDragging, dragStart, zoomLevel, originalDimensions]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  const handleResize = useCallback((corner: 'nw' | 'ne' | 'sw' | 'se', deltaX: number, deltaY: number) => {
    const newCrop = { ...cropRegion };
    
    switch (corner) {
      case 'nw':
        newCrop.x += deltaX;
        newCrop.y += deltaY;
        newCrop.width -= deltaX;
        newCrop.height -= deltaY;
        break;
      case 'ne':
        newCrop.y += deltaY;
        newCrop.width += deltaX;
        newCrop.height -= deltaY;
        break;
      case 'sw':
        newCrop.x += deltaX;
        newCrop.width -= deltaX;
        newCrop.height += deltaY;
        break;
      case 'se':
        newCrop.width += deltaX;
        newCrop.height += deltaY;
        break;
    }
    
    // Maintain aspect ratio
    if (targetAspectRatio) {
      newCrop.height = newCrop.width / targetAspectRatio;
    }
    
    // Ensure bounds
    newCrop.x = Math.max(0, newCrop.x);
    newCrop.y = Math.max(0, newCrop.y);
    newCrop.width = Math.min(originalDimensions.width - newCrop.x, newCrop.width);
    newCrop.height = Math.min(originalDimensions.height - newCrop.y, newCrop.height);
    
    setCropRegion(newCrop);
  }, [cropRegion, targetAspectRatio, originalDimensions]);

  const handleReset = useCallback(() => {
    const optimalCrop = calculateOptimalCrop(
      originalDimensions.width,
      originalDimensions.height,
      targetAspectRatio
    );
    setCropRegion(optimalCrop);
  }, [calculateOptimalCrop, originalDimensions, targetAspectRatio]);

  const handleAddKeyframe = useCallback(() => {
    const newKeyframe = { time: currentTime, crop: { ...cropRegion } };
    setManualKeyframes(prev => [...prev.filter(k => k.time !== currentTime), newKeyframe].sort((a, b) => a.time - b.time));
  }, [currentTime, cropRegion]);

  const handleStartTracking = useCallback(async () => {
    setIsProcessing(true);
    
    try {
      const response = await fetch(`/api/import/start-tracking/${videoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cropRegion,
          startTime: currentTime,
          duration: 5, // Track for 5 seconds
          trackingType: 'auto'
        })
      });
      
      if (response.ok) {
        const { taskId } = await response.json();
        // Track progress via WebSocket
      }
    } catch (error) {
      console.error('Failed to start tracking:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [videoId, cropRegion, currentTime]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Render crop overlay
  const renderCropOverlay = () => {
    const scaleX = previewRef.current?.clientWidth || 1;
    const scaleY = previewRef.current?.clientHeight || 1;
    
    const overlayStyle = {
      position: 'absolute' as const,
      left: (cropRegion.x / originalDimensions.width) * scaleX,
      top: (cropRegion.y / originalDimensions.height) * scaleY,
      width: (cropRegion.width / originalDimensions.width) * scaleX,
      height: (cropRegion.height / originalDimensions.height) * scaleY,
      border: '2px solid #2196f3',
      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
      cursor: 'move',
      zIndex: 2
    };
    
    return (
      <Box
        sx={overlayStyle}
        onMouseDown={handleMouseDown}
      >
        {/* Resize handles */}
        {['nw', 'ne', 'sw', 'se'].map(corner => (
          <Box
            key={corner}
            sx={{
              position: 'absolute',
              width: 10,
              height: 10,
              bgcolor: '#2196f3',
              border: '1px solid white',
              cursor: `${corner}-resize`,
              ...(corner.includes('n') ? { top: -5 } : { bottom: -5 }),
              ...(corner.includes('w') ? { left: -5 } : { right: -5 })
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              // Handle resize logic here
            }}
          />
        ))}
        
        {/* Center indicator */}
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 20,
            height: 20,
            border: '2px solid white',
            borderRadius: '50%',
            bgcolor: 'rgba(33, 150, 243, 0.3)'
          }}
        />
      </Box>
    );
  };

  return (
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Crop Preview
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Reset to optimal">
            <IconButton onClick={handleReset}>
              <RestoreIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Subject tracking">
            <IconButton
              onClick={handleStartTracking}
              disabled={isProcessing}
              color={trackingMode !== 'off' ? 'primary' : 'default'}
            >
              <MyLocationIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Advanced settings">
            <IconButton onClick={() => setShowAdvanced(!showAdvanced)}>
              <TuneIcon />
            </IconButton>
          </Tooltip>
          
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => onApplyToAll?.(cropRegion)}
            size="small"
          >
            Apply to All
          </Button>
        </Box>
      </Box>

      {/* View Mode Controls */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>View Mode</InputLabel>
          <Select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
            <MenuItem value="split">Split View</MenuItem>
            <MenuItem value="before">Before Only</MenuItem>
            <MenuItem value="after">After Only</MenuItem>
            <MenuItem value="overlay">Overlay</MenuItem>
          </Select>
        </FormControl>
        
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Tracking</InputLabel>
          <Select
            value={trackingMode}
            onChange={(e) => setTrackingMode(e.target.value as TrackingMode)}
          >
            <MenuItem value="off">Off</MenuItem>
            <MenuItem value="auto">Auto</MenuItem>
            <MenuItem value="manual">Manual</MenuItem>
          </Select>
        </FormControl>
        
        <Button
          variant="outlined"
          size="small"
          onClick={() => setShowPresets(true)}
          startIcon={<AspectRatioIcon />}
        >
          Presets
        </Button>
        
        {trackingMode === 'manual' && (
          <Button
            variant="outlined"
            size="small"
            onClick={handleAddKeyframe}
            startIcon={<CenterFocusStrongIcon />}
          >
            Add Keyframe
          </Button>
        )}
      </Box>

      {/* Advanced Controls */}
      {showAdvanced && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Advanced Settings</Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="body2" gutterBottom>Zoom: {Math.round(zoomLevel * 100)}%</Typography>
                <Slider
                  value={zoomLevel}
                  onChange={(_, value) => setZoomLevel(value as number)}
                  min={0.1}
                  max={3}
                  step={0.1}
                  size="small"
                />
              </Grid>
              
              <Grid item xs={6}>
                <Box>
                  <Typography variant="body2" gutterBottom>Position</Typography>
                  <Typography variant="caption">
                    X: {Math.round(cropRegion.x)}px, Y: {Math.round(cropRegion.y)}px
                  </Typography>
                  <br />
                  <Typography variant="caption">
                    Size: {Math.round(cropRegion.width)}×{Math.round(cropRegion.height)}px
                  </Typography>
                </Box>
              </Grid>
            </Grid>
            
            {manualKeyframes.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" gutterBottom>Manual Keyframes:</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {manualKeyframes.map((keyframe, index) => (
                    <Chip
                      key={index}
                      label={formatTime(keyframe.time)}
                      size="small"
                      onDelete={() => {
                        setManualKeyframes(prev => prev.filter((_, i) => i !== index));
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {isProcessing && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <LinearProgress sx={{ mt: 1 }} />
          Processing subject tracking...
        </Alert>
      )}

      {/* Main Preview Area */}
      <Box sx={{ flexGrow: 1, display: 'flex', gap: 2, minHeight: 400 }}>
        {(viewMode === 'split' || viewMode === 'before') && (
          <Box sx={{ flex: 1, position: 'relative' }}>
            <Typography variant="subtitle2" gutterBottom>Original</Typography>
            <Box
              ref={previewRef}
              sx={{
                position: 'relative',
                width: '100%',
                height: '100%',
                bgcolor: 'black',
                overflow: 'hidden'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
                }}
                currentTime={currentTime}
              />
              
              {viewMode === 'before' && renderCropOverlay()}
              
              {/* Subject detection overlay */}
              {trackingData.map(detection => {
                if (Math.abs(detection.timestamp - currentTime) > 0.5) return null;
                
                const scaleX = previewRef.current?.clientWidth || 1;
                const scaleY = previewRef.current?.clientHeight || 1;
                
                return (
                  <Box
                    key={detection.id}
                    sx={{
                      position: 'absolute',
                      left: (detection.bbox.x / originalDimensions.width) * scaleX,
                      top: (detection.bbox.y / originalDimensions.height) * scaleY,
                      width: (detection.bbox.width / originalDimensions.width) * scaleX,
                      height: (detection.bbox.height / originalDimensions.height) * scaleY,
                      border: '1px solid #ff9800',
                      bgcolor: 'rgba(255, 152, 0, 0.1)',
                      pointerEvents: 'none'
                    }}
                  >
                    <Chip
                      label={`${detection.type} ${Math.round(detection.confidence * 100)}%`}
                      size="small"
                      sx={{ position: 'absolute', top: -25, left: 0, fontSize: '10px' }}
                    />
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
        
        {(viewMode === 'split' || viewMode === 'after') && (
          <Box sx={{ flex: 1, position: 'relative' }}>
            <Typography variant="subtitle2" gutterBottom>
              Cropped ({Math.round(cropRegion.width)}×{Math.round(cropRegion.height)})
            </Typography>
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                height: '100%',
                bgcolor: 'black',
                overflow: 'hidden'
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
                }}
              />
            </Box>
          </Box>
        )}
        
        {viewMode === 'overlay' && (
          <Box sx={{ width: '100%', position: 'relative' }}>
            <Typography variant="subtitle2" gutterBottom>Overlay View</Typography>
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                height: '100%',
                bgcolor: 'black'
              }}
            >
              <video
                src={videoUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
                }}
                currentTime={currentTime}
              />
              {renderCropOverlay()}
            </Box>
          </Box>
        )}
      </Box>

      {/* Time Controls */}
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <IconButton
            onClick={() => setIsPlaying(!isPlaying)}
            size="small"
          >
            {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
          
          <Typography variant="body2" sx={{ minWidth: 100 }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Typography>
          
          <Slider
            value={currentTime}
            onChange={(_, value) => onTimeChange?.(value as number)}
            min={0}
            max={duration}
            step={0.1}
            sx={{ flexGrow: 1 }}
            valueLabelDisplay="auto"
            valueLabelFormat={formatTime}
          />
        </Box>
      </Box>

      {/* Presets Dialog */}
      <Dialog open={showPresets} onClose={() => setShowPresets(false)} maxWidth="md">
        <DialogTitle>Crop Presets</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            {presets.map((preset, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card
                  sx={{ 
                    cursor: 'pointer', 
                    '&:hover': { bgcolor: 'action.hover' },
                    border: selectedPreset === preset.name ? '2px solid' : '1px solid',
                    borderColor: selectedPreset === preset.name ? 'primary.main' : 'divider'
                  }}
                  onClick={() => handlePresetSelect(preset)}
                >
                  <CardContent>
                    <Typography variant="h6">{preset.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Ratio: {preset.ratio.toFixed(2)}:1
                    </Typography>
                    <Box
                      sx={{
                        width: 60,
                        height: 60 / preset.ratio,
                        border: '2px solid',
                        borderColor: 'primary.main',
                        mt: 1,
                        mx: 'auto'
                      }}
                    />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPresets(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default CropPreview;