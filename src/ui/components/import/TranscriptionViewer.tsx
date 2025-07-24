import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Chip,
  InputAdornment,
  Button,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem,
  Tooltip,
  Divider,
  CircularProgress,
  Alert
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HighlightIcon from '@mui/icons-material/Highlight';
import ClearIcon from '@mui/icons-material/Clear';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useDebounce } from '../../hooks/useDebounce';

interface TranscriptionSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
  speaker?: string;
}

interface TranscriptionViewerProps {
  videoId: string;
  segments: TranscriptionSegment[];
  onSegmentEdit?: (segmentId: string, newText: string) => void;
  onTimeClick?: (time: number) => void;
  onHighlight?: (segment: TranscriptionSegment) => void;
  isEditable?: boolean;
  currentTime?: number;
}

const TranscriptionViewer: React.FC<TranscriptionViewerProps> = ({
  videoId,
  segments: initialSegments,
  onSegmentEdit,
  onTimeClick,
  onHighlight,
  isEditable = true,
  currentTime = 0
}) => {
  const [segments, setSegments] = useState<TranscriptionSegment[]>(initialSegments);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);
  const [highlightedSegments, setHighlightedSegments] = useState<Set<string>>(new Set());
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const listRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<Map<string, HTMLElement>>(new Map());
  const { socket, emit } = useWebSocket();
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Listen for transcription updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleTranscriptionUpdate = (data: { videoId: string; segments: TranscriptionSegment[] }) => {
      if (data.videoId === videoId) {
        setSegments(data.segments);
      }
    };

    socket.on('transcription-update', handleTranscriptionUpdate);
    
    return () => {
      socket.off('transcription-update', handleTranscriptionUpdate);
    };
  }, [socket, videoId]);

  // Update segments when prop changes
  useEffect(() => {
    setSegments(initialSegments);
  }, [initialSegments]);

  // Auto-scroll to current segment
  useEffect(() => {
    const currentSegment = segments.find(
      seg => currentTime >= seg.startTime && currentTime <= seg.endTime
    );
    
    if (currentSegment && segmentRefs.current.has(currentSegment.id)) {
      const element = segmentRefs.current.get(currentSegment.id);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTime, segments]);

  // Filter segments based on search
  const filteredSegments = useMemo(() => {
    if (!debouncedSearchQuery) return segments;
    
    const query = debouncedSearchQuery.toLowerCase();
    return segments.filter(segment => 
      segment.text.toLowerCase().includes(query) ||
      segment.speaker?.toLowerCase().includes(query)
    );
  }, [segments, debouncedSearchQuery]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }, []);

  const handleEditStart = useCallback((segment: TranscriptionSegment) => {
    setEditingSegmentId(segment.id);
    setEditText(segment.text);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editingSegmentId || !onSegmentEdit) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      await onSegmentEdit(editingSegmentId, editText);
      
      // Update local state
      setSegments(prev => prev.map(seg => 
        seg.id === editingSegmentId ? { ...seg, text: editText } : seg
      ));
      
      // Emit WebSocket event
      emit('transcription-edit', {
        videoId,
        segmentId: editingSegmentId,
        newText: editText
      });
      
      setEditingSegmentId(null);
    } catch (err) {
      setError('Failed to save edit');
      console.error('Edit error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [editingSegmentId, editText, onSegmentEdit, emit, videoId]);

  const handleEditCancel = useCallback(() => {
    setEditingSegmentId(null);
    setEditText('');
  }, []);

  const handleHighlight = useCallback((segment: TranscriptionSegment) => {
    const newHighlighted = new Set(highlightedSegments);
    if (newHighlighted.has(segment.id)) {
      newHighlighted.delete(segment.id);
    } else {
      newHighlighted.add(segment.id);
    }
    setHighlightedSegments(newHighlighted);
    
    if (onHighlight && !highlightedSegments.has(segment.id)) {
      onHighlight(segment);
    }
  }, [highlightedSegments, onHighlight]);

  const handleExport = useCallback((format: 'srt' | 'vtt' | 'txt' | 'json') => {
    let content = '';
    const selectedSegments = highlightedSegments.size > 0 
      ? segments.filter(s => highlightedSegments.has(s.id))
      : segments;

    switch (format) {
      case 'srt':
        content = selectedSegments.map((seg, index) => 
          `${index + 1}\n${formatSRTTime(seg.startTime)} --> ${formatSRTTime(seg.endTime)}\n${seg.text}\n`
        ).join('\n');
        break;
      
      case 'vtt':
        content = 'WEBVTT\n\n' + selectedSegments.map((seg, index) => 
          `${index + 1}\n${formatVTTTime(seg.startTime)} --> ${formatVTTTime(seg.endTime)}\n${seg.text}\n`
        ).join('\n');
        break;
      
      case 'txt':
        content = selectedSegments.map(seg => seg.text).join('\n\n');
        break;
      
      case 'json':
        content = JSON.stringify(selectedSegments, null, 2);
        break;
    }

    // Create and download file
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${videoId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    
    setExportMenuAnchor(null);
  }, [segments, highlightedSegments, videoId]);

  const formatSRTTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  };

  const formatVTTTime = (seconds: number): string => {
    const time = formatSRTTime(seconds);
    return time.replace(',', '.');
  };

  const handleCopyAll = useCallback(() => {
    const text = segments.map(seg => seg.text).join('\n\n');
    navigator.clipboard.writeText(text);
  }, [segments]);

  const handleClearHighlights = useCallback(() => {
    setHighlightedSegments(new Set());
  }, []);

  return (
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Transcription
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
          <TextField
            size="small"
            placeholder="Search transcription..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <ClearIcon />
                  </IconButton>
                </InputAdornment>
              )
            }}
            sx={{ flexGrow: 1 }}
          />
          
          <Tooltip title="Copy all text">
            <IconButton onClick={handleCopyAll}>
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Export transcription">
            <IconButton onClick={(e) => setExportMenuAnchor(e.currentTarget)}>
              <FileDownloadIcon />
            </IconButton>
          </Tooltip>
          
          {highlightedSegments.size > 0 && (
            <Chip
              label={`${highlightedSegments.size} highlighted`}
              onDelete={handleClearHighlights}
              size="small"
              color="primary"
            />
          )}
        </Box>
        
        {filteredSegments.length !== segments.length && (
          <Typography variant="body2" color="text.secondary">
            Showing {filteredSegments.length} of {segments.length} segments
          </Typography>
        )}
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ flexGrow: 1, overflow: 'auto' }} ref={listRef}>
        <List>
          {filteredSegments.map((segment, index) => {
            const isCurrentSegment = currentTime >= segment.startTime && currentTime <= segment.endTime;
            const isEditing = editingSegmentId === segment.id;
            const isHighlighted = highlightedSegments.has(segment.id);
            const isExpanded = expandedSegments.has(segment.id);
            
            return (
              <React.Fragment key={segment.id}>
                {index > 0 && <Divider />}
                <ListItem
                  ref={(el) => {
                    if (el) segmentRefs.current.set(segment.id, el);
                  }}
                  sx={{
                    bgcolor: isCurrentSegment ? 'primary.light' : isHighlighted ? 'warning.light' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                    transition: 'background-color 0.3s'
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={formatTime(segment.startTime)}
                          size="small"
                          onClick={() => onTimeClick?.(segment.startTime)}
                          sx={{ cursor: 'pointer' }}
                          icon={<PlayArrowIcon fontSize="small" />}
                        />
                        {segment.speaker && (
                          <Chip
                            label={segment.speaker}
                            size="small"
                            variant="outlined"
                          />
                        )}
                        {segment.confidence && segment.confidence < 0.8 && (
                          <Chip
                            label={`${Math.round(segment.confidence * 100)}% confidence`}
                            size="small"
                            color="warning"
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      isEditing ? (
                        <Box sx={{ mt: 1 }}>
                          <TextField
                            fullWidth
                            multiline
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            disabled={isProcessing}
                            autoFocus
                          />
                          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                            <Button
                              size="small"
                              startIcon={isProcessing ? <CircularProgress size={16} /> : <SaveIcon />}
                              onClick={handleEditSave}
                              disabled={isProcessing}
                            >
                              Save
                            </Button>
                            <Button
                              size="small"
                              startIcon={<CancelIcon />}
                              onClick={handleEditCancel}
                              disabled={isProcessing}
                            >
                              Cancel
                            </Button>
                          </Box>
                        </Box>
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            mt: 1,
                            cursor: 'pointer',
                            display: '-webkit-box',
                            WebkitLineClamp: isExpanded ? 'unset' : 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                          onClick={() => {
                            const newExpanded = new Set(expandedSegments);
                            if (isExpanded) {
                              newExpanded.delete(segment.id);
                            } else {
                              newExpanded.add(segment.id);
                            }
                            setExpandedSegments(newExpanded);
                          }}
                        >
                          {segment.text}
                        </Typography>
                      )
                    }
                  />
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Highlight segment">
                      <IconButton
                        size="small"
                        onClick={() => handleHighlight(segment)}
                        color={isHighlighted ? 'primary' : 'default'}
                      >
                        <HighlightIcon />
                      </IconButton>
                    </Tooltip>
                    {isEditable && !isEditing && (
                      <Tooltip title="Edit text">
                        <IconButton
                          size="small"
                          onClick={() => handleEditStart(segment)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </ListItem>
              </React.Fragment>
            );
          })}
        </List>
      </Box>

      <Menu
        anchorEl={exportMenuAnchor}
        open={Boolean(exportMenuAnchor)}
        onClose={() => setExportMenuAnchor(null)}
      >
        <MenuItem onClick={() => handleExport('srt')}>Export as SRT</MenuItem>
        <MenuItem onClick={() => handleExport('vtt')}>Export as WebVTT</MenuItem>
        <MenuItem onClick={() => handleExport('txt')}>Export as Text</MenuItem>
        <MenuItem onClick={() => handleExport('json')}>Export as JSON</MenuItem>
      </Menu>
    </Paper>
  );
};

export default TranscriptionViewer;