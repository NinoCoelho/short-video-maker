import React, { CSSProperties } from 'react';
import { FixedSizeList as List } from 'react-window';
import {
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Box,
  Typography,
  Chip,
  LinearProgress,
  Divider,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import { CircularProgress } from '@mui/material';

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

interface RowProps {
  index: number;
  style: CSSProperties;
  data: {
    videos: VideoItem[];
    getVideoTitle: (video: VideoItem) => string;
    getStatusColor: (status: string) => string;
    getStatusIcon: (status: string) => React.ReactNode;
    getStatusText: (status: string, progress?: number, stage?: string) => string;
    handleVideoClick: (id: string) => void;
    handleEditVideo: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
    handleDeleteVideo: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  };
}

const Row: React.FC<RowProps> = React.memo(({ index, style, data }) => {
  const {
    videos,
    getVideoTitle,
    getStatusColor,
    getStatusIcon,
    getStatusText,
    handleVideoClick,
    handleEditVideo,
    handleDeleteVideo,
  } = data;

  const video = videos[index];
  const videoId = video?.id || '';
  const videoStatus = video?.status || 'unknown';

  return (
    <div style={style}>
      {index > 0 && <Divider />}
      <ListItem
        button
        onClick={() => handleVideoClick(videoId)}
        sx={{
          py: 2,
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
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
          {(videoStatus === 'missing_mp4' ||
            videoStatus === 'no_script' ||
            videoStatus === 'failed') && (
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
});

Row.displayName = 'VirtualVideoRow';

interface VirtualVideoListProps {
  videos: VideoItem[];
  getVideoTitle: (video: VideoItem) => string;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => React.ReactNode;
  getStatusText: (status: string, progress?: number, stage?: string) => string;
  handleVideoClick: (id: string) => void;
  handleEditVideo: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  handleDeleteVideo: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const VirtualVideoList: React.FC<VirtualVideoListProps> = React.memo(
  ({
    videos,
    getVideoTitle,
    getStatusColor,
    getStatusIcon,
    getStatusText,
    handleVideoClick,
    handleEditVideo,
    handleDeleteVideo,
  }) => {
    const itemData = {
      videos,
      getVideoTitle,
      getStatusColor,
      getStatusIcon,
      getStatusText,
      handleVideoClick,
      handleEditVideo,
      handleDeleteVideo,
    };

    // Only use virtual scrolling for lists with more than 20 items
    if (videos.length <= 20) {
      return (
        <>
          {videos.map((video, index) => (
            <Row
              key={video.id}
              index={index}
              style={{}}
              data={itemData}
            />
          ))}
        </>
      );
    }

    return (
      <List
        height={600}
        itemCount={videos.length}
        itemSize={120} // Estimated height of each item
        width="100%"
        itemData={itemData}
      >
        {Row}
      </List>
    );
  }
);

VirtualVideoList.displayName = 'VirtualVideoList';