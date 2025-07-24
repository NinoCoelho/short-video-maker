import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Slider,
  TextField,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Collapse,
  Alert,
  LinearProgress,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Fab
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import SortIcon from '@mui/icons-material/Sort';
import FilterListIcon from '@mui/icons-material/FilterList';
import BatchPredictionIcon from '@mui/icons-material/BatchPrediction';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import { useWebSocket } from '../../hooks/useWebSocket';
// Note: Drag and drop functionality will need @hello-pangea/dnd package
// import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

interface Highlight {
  id: string;
  startTime: number;
  endTime: number;
  score: number;
  reason: string;
  type: 'manual' | 'auto';
  confidence?: number;
  tags?: string[];
  transcript?: string;
}

interface HighlightEditorProps {
  videoId: string;
  highlights: Highlight[];
  duration: number;
  onHighlightUpdate?: (highlights: Highlight[]) => void;
  onPreview?: (startTime: number, endTime: number) => void;
  onApplyChanges?: (highlights: Highlight[]) => void;
  currentTime?: number;
}

type SortBy = 'time' | 'score' | 'duration';
type FilterBy = 'all' | 'manual' | 'auto' | 'high-score' | 'low-score';

const HighlightEditor: React.FC<HighlightEditorProps> = ({
  videoId,
  highlights: initialHighlights,
  duration,
  onHighlightUpdate,
  onPreview,
  onApplyChanges,
  currentTime = 0
}) => {
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [batchOperationOpen, setBatchOperationOpen] = useState(false);
  const [selectedHighlights, setSelectedHighlights] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>('time');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  const { socket, emit } = useWebSocket();

  // Listen for highlight updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleHighlightUpdate = (data: { videoId: string; highlights: Highlight[] }) => {
      if (data.videoId === videoId) {
        setHighlights(data.highlights);
        setHasChanges(false);
      }
    };

    socket.on('highlight-update', handleHighlightUpdate);
    
    return () => {
      socket.off('highlight-update', handleHighlightUpdate);
    };
  }, [socket, videoId]);

  // Update highlights when prop changes
  useEffect(() => {
    setHighlights(initialHighlights);
    setHasChanges(false);
  }, [initialHighlights]);

  // Sort and filter highlights
  const processedHighlights = useMemo(() => {
    let filtered = [...highlights];
    
    // Apply filter
    switch (filterBy) {
      case 'manual':
        filtered = filtered.filter(h => h.type === 'manual');
        break;
      case 'auto':
        filtered = filtered.filter(h => h.type === 'auto');
        break;
      case 'high-score':
        filtered = filtered.filter(h => h.score >= 0.7);
        break;
      case 'low-score':
        filtered = filtered.filter(h => h.score < 0.5);
        break;
    }
    
    // Apply sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return b.score - a.score;
        case 'duration':
          return (b.endTime - b.startTime) - (a.endTime - a.startTime);
        default: // time
          return a.startTime - b.startTime;
      }
    });
    
    return filtered;
  }, [highlights, sortBy, filterBy]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const getScoreColor = useCallback((score: number): 'error' | 'warning' | 'success' => {
    if (score >= 0.7) return 'success';
    if (score >= 0.5) return 'warning';
    return 'error';
  }, []);

  const handleHighlightEdit = useCallback((highlight: Highlight) => {
    setEditingHighlight({ ...highlight });
  }, []);

  const handleHighlightSave = useCallback(() => {
    if (!editingHighlight) return;
    
    const updatedHighlights = highlights.map(h => 
      h.id === editingHighlight.id ? editingHighlight : h
    );
    
    setHighlights(updatedHighlights);
    setEditingHighlight(null);
    setHasChanges(true);
    
    if (onHighlightUpdate) {
      onHighlightUpdate(updatedHighlights);
    }
  }, [editingHighlight, highlights, onHighlightUpdate]);

  const handleHighlightDelete = useCallback((id: string) => {
    const updatedHighlights = highlights.filter(h => h.id !== id);
    setHighlights(updatedHighlights);
    setHasChanges(true);
    
    if (onHighlightUpdate) {
      onHighlightUpdate(updatedHighlights);
    }
  }, [highlights, onHighlightUpdate]);

  const handleAddHighlight = useCallback((newHighlight: Omit<Highlight, 'id'>) => {
    const highlight: Highlight = {
      ...newHighlight,
      id: `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'manual'
    };
    
    const updatedHighlights = [...highlights, highlight];
    setHighlights(updatedHighlights);
    setHasChanges(true);
    setAddDialogOpen(false);
    
    if (onHighlightUpdate) {
      onHighlightUpdate(updatedHighlights);
    }
  }, [highlights, onHighlightUpdate]);

  const handleBatchOperation = useCallback((operation: 'delete' | 'adjust-score' | 'merge', value?: number) => {
    const selectedIds = Array.from(selectedHighlights);
    let updatedHighlights = [...highlights];
    
    switch (operation) {
      case 'delete':
        updatedHighlights = updatedHighlights.filter(h => !selectedIds.includes(h.id));
        break;
        
      case 'adjust-score':
        if (value !== undefined) {
          updatedHighlights = updatedHighlights.map(h => 
            selectedIds.includes(h.id) 
              ? { ...h, score: Math.max(0, Math.min(1, h.score + value)) }
              : h
          );
        }
        break;
        
      case 'merge':
        const selectedHighlights = updatedHighlights.filter(h => selectedIds.includes(h.id));
        if (selectedHighlights.length > 1) {
          const minStart = Math.min(...selectedHighlights.map(h => h.startTime));
          const maxEnd = Math.max(...selectedHighlights.map(h => h.endTime));
          const avgScore = selectedHighlights.reduce((sum, h) => sum + h.score, 0) / selectedHighlights.length;
          
          const mergedHighlight: Highlight = {
            id: `highlight-merged-${Date.now()}`,
            startTime: minStart,
            endTime: maxEnd,
            score: avgScore,
            reason: 'Merged highlights',
            type: 'manual',
            tags: Array.from(new Set(selectedHighlights.flatMap(h => h.tags || [])))
          };
          
          updatedHighlights = updatedHighlights.filter(h => !selectedIds.includes(h.id));
          updatedHighlights.push(mergedHighlight);
        }
        break;
    }
    
    setHighlights(updatedHighlights);
    setSelectedHighlights(new Set());
    setBatchOperationOpen(false);
    setHasChanges(true);
    
    if (onHighlightUpdate) {
      onHighlightUpdate(updatedHighlights);
    }
  }, [selectedHighlights, highlights, onHighlightUpdate]);

  // Drag and drop functionality - requires @hello-pangea/dnd package
  const handleDragEnd = useCallback((result: any) => {
    // Disabled until drag-and-drop package is installed
    console.log('Drag and drop requires @hello-pangea/dnd package');
  }, []);

  const handleApplyChanges = useCallback(async () => {
    if (!onApplyChanges) return;
    
    setIsProcessing(true);
    try {
      await onApplyChanges(highlights);
      
      // Emit WebSocket event
      emit('highlight-update', {
        videoId,
        highlights
      });
      
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to apply changes:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [highlights, onApplyChanges, emit, videoId]);

  const handleAutoDetect = useCallback(async () => {
    setIsProcessing(true);
    try {
      // This would call an API to auto-detect highlights
      const response = await fetch(`/api/import/auto-detect-highlights/${videoId}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const { highlights: newHighlights } = await response.json();
        setHighlights(prev => [...prev, ...newHighlights]);
        setHasChanges(true);
      }
    } catch (error) {
      console.error('Auto-detect failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [videoId]);

  return (
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">
            Highlights ({highlights.length})
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Auto-detect highlights">
              <IconButton onClick={handleAutoDetect} disabled={isProcessing}>
                <AutoFixHighIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Sort highlights">
              <IconButton onClick={() => setShowFilters(!showFilters)}>
                <FilterListIcon />
              </IconButton>
            </Tooltip>
            
            {selectedHighlights.size > 0 && (
              <Tooltip title="Batch operations">
                <IconButton onClick={() => setBatchOperationOpen(true)}>
                  <BatchPredictionIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
        
        <Collapse in={showFilters}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Sort by</InputLabel>
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                <MenuItem value="time">Time</MenuItem>
                <MenuItem value="score">Score</MenuItem>
                <MenuItem value="duration">Duration</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Filter</InputLabel>
              <Select value={filterBy} onChange={(e) => setFilterBy(e.target.value as FilterBy)}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="manual">Manual</MenuItem>
                <MenuItem value="auto">Auto</MenuItem>
                <MenuItem value="high-score">High Score</MenuItem>
                <MenuItem value="low-score">Low Score</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Collapse>
        
        {hasChanges && (
          <Alert 
            severity="info" 
            action={
              <Button
                color="inherit"
                size="small"
                onClick={handleApplyChanges}
                disabled={isProcessing}
                startIcon={isProcessing ? <LinearProgress /> : <SaveIcon />}
              >
                Apply Changes
              </Button>
            }
          >
            You have unsaved changes
          </Alert>
        )}
      </Box>

      <List sx={{ flexGrow: 1, overflow: 'auto' }}>
        {processedHighlights.map((highlight, index) => {
          const isCurrentHighlight = currentTime >= highlight.startTime && currentTime <= highlight.endTime;
          
          return (
            <ListItem
              key={highlight.id}
              sx={{
                mb: 1,
                bgcolor: isCurrentHighlight ? 'primary.light' : 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1
              }}
            >
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedHighlights.has(highlight.id)}
                              onChange={(e) => {
                                const newSelected = new Set(selectedHighlights);
                                if (e.target.checked) {
                                  newSelected.add(highlight.id);
                                } else {
                                  newSelected.delete(highlight.id);
                                }
                                setSelectedHighlights(newSelected);
                              }}
                            />
                          }
                          label=""
                          sx={{ mr: 1 }}
                        />
                        
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2">
                                {formatTime(highlight.startTime)} - {formatTime(highlight.endTime)}
                              </Typography>
                              <Chip
                                label={`${Math.round(highlight.score * 100)}%`}
                                size="small"
                                color={getScoreColor(highlight.score)}
                              />
                              {highlight.type === 'auto' && (
                                <Chip label="Auto" size="small" variant="outlined" />
                              )}
                              {highlight.tags?.map(tag => (
                                <Chip key={tag} label={tag} size="small" />
                              ))}
                            </Box>
                          }
                          secondary={
                            <Box>
                              <Typography variant="body2" color="text.secondary">
                                {highlight.reason}
                              </Typography>
                              {highlight.transcript && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                  "{highlight.transcript}"
                                </Typography>
                              )}
                            </Box>
                          }
                        />
                        
                        <ListItemSecondaryAction>
                          <Tooltip title="Preview">
                            <IconButton
                              size="small"
                              onClick={() => onPreview?.(highlight.startTime, highlight.endTime)}
                            >
                              <PlayArrowIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => handleHighlightEdit(highlight)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => handleHighlightDelete(highlight.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
            </ListItem>
          );
        })}
      </List>

      <Fab
        color="primary"
        size="small"
        sx={{ position: 'absolute', bottom: 16, right: 16 }}
        onClick={() => setAddDialogOpen(true)}
      >
        <AddIcon />
      </Fab>

      {/* Edit Dialog */}
      <Dialog open={!!editingHighlight} onClose={() => setEditingHighlight(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Highlight</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Box>
              <Typography gutterBottom>Time Range</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label="Start Time"
                  type="number"
                  value={editingHighlight?.startTime || 0}
                  onChange={(e) => setEditingHighlight(prev => prev ? { ...prev, startTime: Number(e.target.value) } : null)}
                  inputProps={{ min: 0, max: duration, step: 0.1 }}
                  size="small"
                />
                <TextField
                  label="End Time"
                  type="number"
                  value={editingHighlight?.endTime || 0}
                  onChange={(e) => setEditingHighlight(prev => prev ? { ...prev, endTime: Number(e.target.value) } : null)}
                  inputProps={{ min: 0, max: duration, step: 0.1 }}
                  size="small"
                />
              </Box>
            </Box>
            
            <Box>
              <Typography gutterBottom>Score: {Math.round((editingHighlight?.score || 0) * 100)}%</Typography>
              <Slider
                value={editingHighlight?.score || 0}
                onChange={(_, value) => setEditingHighlight(prev => prev ? { ...prev, score: value as number } : null)}
                min={0}
                max={1}
                step={0.01}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
              />
            </Box>
            
            <TextField
              label="Reason"
              multiline
              rows={3}
              value={editingHighlight?.reason || ''}
              onChange={(e) => setEditingHighlight(prev => prev ? { ...prev, reason: e.target.value } : null)}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingHighlight(null)}>Cancel</Button>
          <Button onClick={handleHighlightSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Add Dialog */}
      <AddHighlightDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdd={handleAddHighlight}
        duration={duration}
        currentTime={currentTime}
      />

      {/* Batch Operation Dialog */}
      <BatchOperationDialog
        open={batchOperationOpen}
        onClose={() => setBatchOperationOpen(false)}
        selectedCount={selectedHighlights.size}
        onOperation={handleBatchOperation}
      />
    </Paper>
  );
};

// Add Highlight Dialog Component
const AddHighlightDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onAdd: (highlight: Omit<Highlight, 'id'>) => void;
  duration: number;
  currentTime: number;
}> = ({ open, onClose, onAdd, duration, currentTime }) => {
  const [startTime, setStartTime] = useState(currentTime);
  const [endTime, setEndTime] = useState(Math.min(currentTime + 10, duration));
  const [score, setScore] = useState(0.7);
  const [reason, setReason] = useState('');

  const handleAdd = () => {
    onAdd({
      startTime,
      endTime,
      score,
      reason,
      type: 'manual'
    });
    
    // Reset form
    setStartTime(currentTime);
    setEndTime(Math.min(currentTime + 10, duration));
    setScore(0.7);
    setReason('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add New Highlight</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <Box>
            <Typography gutterBottom>Time Range</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Start Time (seconds)"
                type="number"
                value={startTime}
                onChange={(e) => setStartTime(Number(e.target.value))}
                inputProps={{ min: 0, max: duration, step: 0.1 }}
                fullWidth
              />
              <TextField
                label="End Time (seconds)"
                type="number"
                value={endTime}
                onChange={(e) => setEndTime(Number(e.target.value))}
                inputProps={{ min: 0, max: duration, step: 0.1 }}
                fullWidth
              />
            </Box>
          </Box>
          
          <Box>
            <Typography gutterBottom>Score: {Math.round(score * 100)}%</Typography>
            <Slider
              value={score}
              onChange={(_, value) => setScore(value as number)}
              min={0}
              max={1}
              step={0.01}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
            />
          </Box>
          
          <TextField
            label="Reason / Description"
            multiline
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            placeholder="Why is this segment important?"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleAdd} 
          variant="contained"
          disabled={!reason || startTime >= endTime}
        >
          Add Highlight
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Batch Operation Dialog Component
const BatchOperationDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  onOperation: (operation: 'delete' | 'adjust-score' | 'merge', value?: number) => void;
}> = ({ open, onClose, selectedCount, onOperation }) => {
  const [scoreAdjustment, setScoreAdjustment] = useState(0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Batch Operations ({selectedCount} selected)</DialogTitle>
      <DialogContent>
        <List>
          <ListItem>
            <ListItemText primary="Delete Selected" secondary="Remove all selected highlights" />
            <Button
              variant="outlined"
              color="error"
              onClick={() => onOperation('delete')}
              startIcon={<DeleteIcon />}
            >
              Delete
            </Button>
          </ListItem>
          
          <ListItem>
            <ListItemText 
              primary="Adjust Scores" 
              secondary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                  <Slider
                    value={scoreAdjustment}
                    onChange={(_, value) => setScoreAdjustment(value as number)}
                    min={-0.5}
                    max={0.5}
                    step={0.05}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`}
                    sx={{ width: 200 }}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => onOperation('adjust-score', scoreAdjustment)}
                    disabled={scoreAdjustment === 0}
                  >
                    Apply
                  </Button>
                </Box>
              }
            />
          </ListItem>
          
          <ListItem>
            <ListItemText primary="Merge Selected" secondary="Combine selected highlights into one" />
            <Button
              variant="outlined"
              onClick={() => onOperation('merge')}
              startIcon={<ContentCutIcon />}
              disabled={selectedCount < 2}
            >
              Merge
            </Button>
          </ListItem>
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default HighlightEditor;