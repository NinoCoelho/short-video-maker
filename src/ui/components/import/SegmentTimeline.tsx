import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Slider,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Popover,
  List,
  ListItem,
  ListItemText,
  Chip,
  Alert,
  LinearProgress,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import MergeIcon from '@mui/icons-material/Merge';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import { useWebSocket } from '../../hooks/useWebSocket';

interface VideoSegment {
  id: string;
  startTime: number;
  endTime: number;
  label?: string;
  type: 'highlight' | 'filler' | 'intro' | 'outro' | 'custom';
  score?: number;
  color?: string;
  metadata?: Record<string, any>;
}

interface SegmentTimelineProps {
  videoId: string;
  segments: VideoSegment[];
  duration: number;
  currentTime: number;
  onSegmentUpdate?: (segments: VideoSegment[]) => void;
  onTimeChange?: (time: number) => void;
  onPreview?: (startTime: number, endTime: number) => void;
  isPlaying?: boolean;
  waveformData?: number[];
}

interface TimelineAction {
  type: 'update' | 'add' | 'delete' | 'split' | 'merge';
  segments: VideoSegment[];
  timestamp: number;
}

const SegmentTimeline: React.FC<SegmentTimelineProps> = ({
  videoId,
  segments: initialSegments,
  duration,
  currentTime,
  onSegmentUpdate,
  onTimeChange,
  onPreview,
  isPlaying = false,
  waveformData = []
}) => {
  const [segments, setSegments] = useState<VideoSegment[]>(initialSegments);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    segmentId: string;
    type: 'start' | 'end' | 'move';
    startX: number;
    startTime: number;
  } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<VideoSegment | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    segmentId: string | null;
    time: number;
  } | null>(null);
  const [history, setHistory] = useState<TimelineAction[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showWaveform, setShowWaveform] = useState(true);
  const [viewMode, setViewMode] = useState<'full' | 'fit'>('fit');
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const { socket, emit } = useWebSocket();

  const SEGMENT_COLORS = {
    highlight: '#4CAF50',
    filler: '#FF9800',
    intro: '#2196F3',
    outro: '#9C27B0',
    custom: '#607D8B'
  };

  // Listen for segment updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleSegmentUpdate = (data: { videoId: string; segments: VideoSegment[] }) => {
      if (data.videoId === videoId) {
        setSegments(data.segments);
        addToHistory('update', data.segments);
      }
    };

    socket.on('segment-update', handleSegmentUpdate);
    
    return () => {
      socket.off('segment-update', handleSegmentUpdate);
    };
  }, [socket, videoId]);

  // Update segments when prop changes
  useEffect(() => {
    setSegments(initialSegments);
    setHistory([{ type: 'update', segments: initialSegments, timestamp: Date.now() }]);
    setHistoryIndex(0);
  }, [initialSegments]);

  const timelineWidth = useMemo(() => {
    return Math.max(800, duration * 10 * zoomLevel);
  }, [duration, zoomLevel]);

  const pixelsPerSecond = useMemo(() => {
    return timelineWidth / duration;
  }, [timelineWidth, duration]);

  const addToHistory = useCallback((type: TimelineAction['type'], segments: VideoSegment[]) => {
    const newAction: TimelineAction = {
      type,
      segments: [...segments],
      timestamp: Date.now()
    };
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAction);
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setSegments(history[newIndex].segments);
      
      if (onSegmentUpdate) {
        onSegmentUpdate(history[newIndex].segments);
      }
    }
  }, [history, historyIndex, onSegmentUpdate]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setSegments(history[newIndex].segments);
      
      if (onSegmentUpdate) {
        onSegmentUpdate(history[newIndex].segments);
      }
    }
  }, [history, historyIndex, onSegmentUpdate]);

  const snapTime = useCallback((time: number): number => {
    if (!snapToGrid) return time;
    
    const snapInterval = 0.5; // Snap to 0.5 second intervals
    return Math.round(time / snapInterval) * snapInterval;
  }, [snapToGrid]);

  const timeToPixels = useCallback((time: number): number => {
    return (time / duration) * timelineWidth;
  }, [duration, timelineWidth]);

  const pixelsToTime = useCallback((pixels: number): number => {
    return (pixels / timelineWidth) * duration;
  }, [timelineWidth, duration]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  }, []);

  const handleTimelineClick = useCallback((event: React.MouseEvent) => {
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const clickedTime = pixelsToTime(x);
    
    if (onTimeChange) {
      onTimeChange(clickedTime);
    }
  }, [pixelsToTime, onTimeChange]);

  const handleContextMenu = useCallback((event: React.MouseEvent, segmentId?: string) => {
    event.preventDefault();
    
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = pixelsToTime(x);
    
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      segmentId: segmentId || null,
      time: snapTime(time)
    });
  }, [pixelsToTime, snapTime]);

  const handleMouseDown = useCallback((event: React.MouseEvent, segmentId: string, type: 'start' | 'end' | 'move') => {
    event.preventDefault();
    event.stopPropagation();
    
    const segment = segments.find(s => s.id === segmentId);
    if (!segment || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startTime = type === 'start' ? segment.startTime : type === 'end' ? segment.endTime : currentTime;
    
    setDragState({
      isDragging: true,
      segmentId,
      type,
      startX,
      startTime
    });
    
    setSelectedSegmentId(segmentId);
  }, [segments, currentTime]);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!dragState || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const deltaX = currentX - dragState.startX;
    const deltaTime = pixelsToTime(deltaX);
    
    let newTime = snapTime(dragState.startTime + deltaTime);
    newTime = Math.max(0, Math.min(duration, newTime));
    
    const updatedSegments = segments.map(segment => {
      if (segment.id === dragState.segmentId) {
        switch (dragState.type) {
          case 'start':
            return { ...segment, startTime: Math.min(newTime, segment.endTime - 0.1) };
          case 'end':
            return { ...segment, endTime: Math.max(newTime, segment.startTime + 0.1) };
          case 'move':
            const segmentDuration = segment.endTime - segment.startTime;
            const newStartTime = Math.max(0, Math.min(duration - segmentDuration, newTime));
            return {
              ...segment,
              startTime: newStartTime,
              endTime: newStartTime + segmentDuration
            };
        }
      }
      return segment;
    });
    
    setSegments(updatedSegments);
  }, [dragState, segments, pixelsToTime, snapTime, duration]);

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      addToHistory('update', segments);
      
      if (onSegmentUpdate) {
        onSegmentUpdate(segments);
      }
      
      // Emit WebSocket event
      emit('segment-update', {
        videoId,
        segments
      });
    }
    
    setDragState(null);
  }, [dragState, segments, addToHistory, onSegmentUpdate, emit, videoId]);

  const handleZoom = useCallback((direction: 'in' | 'out') => {
    setZoomLevel(prev => {
      const newZoom = direction === 'in' ? prev * 1.5 : prev / 1.5;
      return Math.max(0.1, Math.min(10, newZoom));
    });
  }, []);

  const handleFitToScreen = useCallback(() => {
    setZoomLevel(1);
    setViewMode('fit');
  }, []);

  const splitSegment = useCallback((segmentId: string, time: number) => {
    const segment = segments.find(s => s.id === segmentId);
    if (!segment || time <= segment.startTime || time >= segment.endTime) return;
    
    const newSegment: VideoSegment = {
      ...segment,
      id: `${segment.id}-split-${Date.now()}`,
      startTime: time,
      endTime: segment.endTime
    };
    
    const updatedSegments = segments.map(s => 
      s.id === segmentId 
        ? { ...s, endTime: time }
        : s
    ).concat(newSegment);
    
    setSegments(updatedSegments);
    addToHistory('split', updatedSegments);
    
    if (onSegmentUpdate) {
      onSegmentUpdate(updatedSegments);
    }
    
    setContextMenu(null);
  }, [segments, addToHistory, onSegmentUpdate]);

  const mergeSegments = useCallback((segmentIds: string[]) => {
    const segmentsToMerge = segments.filter(s => segmentIds.includes(s.id)).sort((a, b) => a.startTime - b.startTime);
    if (segmentsToMerge.length < 2) return;
    
    const mergedSegment: VideoSegment = {
      ...segmentsToMerge[0],
      id: `merged-${Date.now()}`,
      endTime: segmentsToMerge[segmentsToMerge.length - 1].endTime,
      label: `Merged (${segmentsToMerge.length} segments)`
    };
    
    const updatedSegments = segments.filter(s => !segmentIds.includes(s.id)).concat(mergedSegment);
    
    setSegments(updatedSegments);
    addToHistory('merge', updatedSegments);
    
    if (onSegmentUpdate) {
      onSegmentUpdate(updatedSegments);
    }
  }, [segments, addToHistory, onSegmentUpdate]);

  const addSegment = useCallback((startTime: number) => {
    const endTime = Math.min(startTime + 5, duration);
    
    const newSegment: VideoSegment = {
      id: `segment-${Date.now()}`,
      startTime,
      endTime,
      type: 'custom',
      label: 'New Segment'
    };
    
    const updatedSegments = [...segments, newSegment].sort((a, b) => a.startTime - b.startTime);
    
    setSegments(updatedSegments);
    addToHistory('add', updatedSegments);
    
    if (onSegmentUpdate) {
      onSegmentUpdate(updatedSegments);
    }
    
    setContextMenu(null);
  }, [segments, duration, addToHistory, onSegmentUpdate]);

  const deleteSegment = useCallback((segmentId: string) => {
    const updatedSegments = segments.filter(s => s.id !== segmentId);
    
    setSegments(updatedSegments);
    addToHistory('delete', updatedSegments);
    
    if (onSegmentUpdate) {
      onSegmentUpdate(updatedSegments);
    }
    
    setContextMenu(null);
    setSelectedSegmentId(null);
  }, [segments, addToHistory, onSegmentUpdate]);

  // Render waveform
  const renderWaveform = () => {
    if (!showWaveform || !waveformData.length) return null;
    
    const waveformPath = waveformData.map((amplitude, index) => {
      const x = (index / (waveformData.length - 1)) * timelineWidth;
      const y = 30 + amplitude * 20; // Scale amplitude
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
    
    return (
      <svg
        width={timelineWidth}
        height="60"
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      >
        <path
          d={waveformPath}
          stroke="#3f51b5"
          strokeWidth="1"
          fill="none"
          opacity={0.5}
        />
      </svg>
    );
  };

  return (
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Timeline ({formatTime(duration)})
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <FormControlLabel
            control={<Switch checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />}
            label="Snap"
            sx={{ mr: 2 }}
          />
          
          <FormControlLabel
            control={<Switch checked={showWaveform} onChange={(e) => setShowWaveform(e.target.checked)} />}
            label="Waveform"
            sx={{ mr: 2 }}
          />
          
          <Tooltip title="Undo">
            <IconButton onClick={undo} disabled={historyIndex <= 0}>
              <UndoIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Redo">
            <IconButton onClick={redo} disabled={historyIndex >= history.length - 1}>
              <RedoIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Zoom In">
            <IconButton onClick={() => handleZoom('in')}>
              <ZoomInIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Zoom Out">
            <IconButton onClick={() => handleZoom('out')}>
              <ZoomOutIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Fit to Screen">
            <IconButton onClick={handleFitToScreen}>
              <FitScreenIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Typography variant="body2">
          Current: {formatTime(currentTime)}
        </Typography>
        <Typography variant="body2">
          Zoom: {Math.round(zoomLevel * 100)}%
        </Typography>
        <Typography variant="body2">
          Segments: {segments.length}
        </Typography>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto', position: 'relative' }}>
        <Box
          ref={timelineRef}
          sx={{
            position: 'relative',
            height: 200,
            width: timelineWidth,
            bgcolor: 'grey.100',
            cursor: 'crosshair',
            border: '1px solid',
            borderColor: 'divider'
          }}
          onClick={handleTimelineClick}
          onContextMenu={handleContextMenu}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {renderWaveform()}
          
          {/* Time ruler */}
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 20, bgcolor: 'grey.200' }}>
            {Array.from({ length: Math.ceil(duration / 10) + 1 }, (_, i) => {
              const time = i * 10;
              const x = timeToPixels(time);
              
              return (
                <Box
                  key={i}
                  sx={{
                    position: 'absolute',
                    left: x,
                    top: 0,
                    height: '100%',
                    borderLeft: '1px solid',
                    borderColor: 'grey.400',
                    fontSize: '12px',
                    pl: 0.5,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {formatTime(time)}
                </Box>
              );
            })}
          </Box>
          
          {/* Current time indicator */}
          <Box
            sx={{
              position: 'absolute',
              left: timeToPixels(currentTime),
              top: 0,
              bottom: 0,
              width: 2,
              bgcolor: 'red',
              zIndex: 3,
              pointerEvents: 'none'
            }}
          />
          
          {/* Segments */}
          {segments.map(segment => {
            const left = timeToPixels(segment.startTime);
            const width = timeToPixels(segment.endTime - segment.startTime);
            const isSelected = selectedSegmentId === segment.id;
            
            return (
              <Box
                key={segment.id}
                sx={{
                  position: 'absolute',
                  left,
                  top: 60,
                  width,
                  height: 80,
                  bgcolor: SEGMENT_COLORS[segment.type] || SEGMENT_COLORS.custom,
                  opacity: isSelected ? 0.9 : 0.7,
                  border: isSelected ? '2px solid' : '1px solid',
                  borderColor: isSelected ? 'primary.main' : 'transparent',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: isSelected ? 2 : 1,
                  '&:hover': { opacity: 0.9 }
                }}
                onMouseDown={(e) => handleMouseDown(e, segment.id, 'move')}
                onContextMenu={(e) => handleContextMenu(e, segment.id)}
              >
                {/* Resize handles */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: -2,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    cursor: 'ew-resize',
                    bgcolor: 'rgba(0,0,0,0.2)'
                  }}
                  onMouseDown={(e) => handleMouseDown(e, segment.id, 'start')}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    right: -2,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    cursor: 'ew-resize',
                    bgcolor: 'rgba(0,0,0,0.2)'
                  }}
                  onMouseDown={(e) => handleMouseDown(e, segment.id, 'end')}
                />
                
                {/* Segment content */}
                <Box sx={{ textAlign: 'center', color: 'white', fontSize: '12px', px: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                    {segment.label || segment.type}
                  </Typography>
                  <Typography variant="caption" display="block">
                    {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                  </Typography>
                  {segment.score && (
                    <Typography variant="caption" display="block">
                      {Math.round(segment.score * 100)}%
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Context Menu */}
      <Popover
        open={Boolean(contextMenu)}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
        onClose={() => setContextMenu(null)}
      >
        <List dense>
          {contextMenu?.segmentId ? (
            <>
              <ListItem button onClick={() => {
                const segment = segments.find(s => s.id === contextMenu.segmentId);
                if (segment) {
                  setEditingSegment(segment);
                  setEditDialogOpen(true);
                }
                setContextMenu(null);
              }}>
                <EditIcon sx={{ mr: 1 }} />
                Edit Segment
              </ListItem>
              
              <ListItem button onClick={() => {
                if (onPreview && contextMenu.segmentId) {
                  const segment = segments.find(s => s.id === contextMenu.segmentId);
                  if (segment) {
                    onPreview(segment.startTime, segment.endTime);
                  }
                }
                setContextMenu(null);
              }}>
                <PlayArrowIcon sx={{ mr: 1 }} />
                Preview Segment
              </ListItem>
              
              <ListItem button onClick={() => {
                if (contextMenu.segmentId) {
                  splitSegment(contextMenu.segmentId, contextMenu.time);
                }
              }}>
                <ContentCutIcon sx={{ mr: 1 }} />
                Split at {formatTime(contextMenu.time)}
              </ListItem>
              
              <ListItem button onClick={() => {
                if (contextMenu.segmentId) {
                  deleteSegment(contextMenu.segmentId);
                }
              }}>
                <DeleteIcon sx={{ mr: 1 }} />
                Delete Segment
              </ListItem>
            </>
          ) : (
            <ListItem button onClick={() => addSegment(contextMenu?.time || 0)}>
              <AddIcon sx={{ mr: 1 }} />
              Add Segment at {formatTime(contextMenu?.time || 0)}
            </ListItem>
          )}
        </List>
      </Popover>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Segment</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Label"
              value={editingSegment?.label || ''}
              onChange={(e) => setEditingSegment(prev => prev ? { ...prev, label: e.target.value } : null)}
              fullWidth
            />
            
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={editingSegment?.type || 'custom'}
                onChange={(e) => setEditingSegment(prev => prev ? { ...prev, type: e.target.value as VideoSegment['type'] } : null)}
              >
                <MenuItem value="highlight">Highlight</MenuItem>
                <MenuItem value="filler">Filler</MenuItem>
                <MenuItem value="intro">Intro</MenuItem>
                <MenuItem value="outro">Outro</MenuItem>
                <MenuItem value="custom">Custom</MenuItem>
              </Select>
            </FormControl>
            
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Start Time"
                type="number"
                value={editingSegment?.startTime || 0}
                onChange={(e) => setEditingSegment(prev => prev ? { ...prev, startTime: Number(e.target.value) } : null)}
                inputProps={{ min: 0, max: duration, step: 0.1 }}
              />
              <TextField
                label="End Time"
                type="number"
                value={editingSegment?.endTime || 0}
                onChange={(e) => setEditingSegment(prev => prev ? { ...prev, endTime: Number(e.target.value) } : null)}
                inputProps={{ min: 0, max: duration, step: 0.1 }}
              />
            </Box>
            
            {editingSegment?.score !== undefined && (
              <Box>
                <Typography gutterBottom>Score: {Math.round((editingSegment.score || 0) * 100)}%</Typography>
                <Slider
                  value={editingSegment.score}
                  onChange={(_, value) => setEditingSegment(prev => prev ? { ...prev, score: value as number } : null)}
                  min={0}
                  max={1}
                  step={0.01}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
                />
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => {
            if (editingSegment) {
              const updatedSegments = segments.map(s => 
                s.id === editingSegment.id ? editingSegment : s
              );
              setSegments(updatedSegments);
              addToHistory('update', updatedSegments);
              
              if (onSegmentUpdate) {
                onSegmentUpdate(updatedSegments);
              }
            }
            setEditDialogOpen(false);
          }} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default SegmentTimeline;