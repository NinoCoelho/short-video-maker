import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ErrorIcon from '@mui/icons-material/Error';
import DownloadIcon from '@mui/icons-material/Download';
import TranscribeIcon from '@mui/icons-material/Subtitles';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import MovieIcon from '@mui/icons-material/Movie';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import { ImportJobStatus } from '../../../types/import';
import { useNavigate } from 'react-router-dom';

interface ImportProgressProps {
  jobId: string | null;
  status: ImportJobStatus | null;
  progress: number;
  currentStep: string | null;
  error: string | null;
}

interface ProcessStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactElement;
  status: 'pending' | 'active' | 'completed' | 'error';
  details?: string[];
}

const ImportProgress: React.FC<ImportProgressProps> = ({
  jobId,
  status,
  progress,
  currentStep,
  error
}) => {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const [startTime] = useState(Date.now());

  const getStepStatus = (stepId: string): ProcessStep['status'] => {
    if (!status || status === ImportJobStatus.FAILED) return 'error';
    
    const stepOrder = ['download', 'transcribe', 'analyze', 'process', 'complete'];
    const currentIndex = stepOrder.indexOf(currentStep || '');
    const stepIndex = stepOrder.indexOf(stepId);
    
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const steps: ProcessStep[] = [
    {
      id: 'download',
      label: 'Downloading Video',
      description: 'Fetching video from source',
      icon: <DownloadIcon />,
      status: getStepStatus('download'),
      details: [
        'Validating URL',
        'Downloading video content',
        'Saving to temporary storage'
      ]
    },
    {
      id: 'transcribe',
      label: 'Transcribing Audio',
      description: 'Converting speech to text',
      icon: <TranscribeIcon />,
      status: getStepStatus('transcribe'),
      details: [
        'Extracting audio track',
        'Running speech recognition',
        'Generating timestamps'
      ]
    },
    {
      id: 'analyze',
      label: 'Analyzing Content',
      description: 'AI analysis for best moments',
      icon: <AnalyticsIcon />,
      status: getStepStatus('analyze'),
      details: [
        'Detecting scene changes',
        'Identifying key moments',
        'Analyzing sentiment',
        'Extracting topics'
      ]
    },
    {
      id: 'process',
      label: 'Processing Video',
      description: 'Creating optimized segments',
      icon: <MovieIcon />,
      status: getStepStatus('process'),
      details: [
        'Splitting into segments',
        'Applying filters',
        'Adding captions',
        'Optimizing quality'
      ]
    },
    {
      id: 'complete',
      label: 'Finalizing',
      description: 'Preparing your video',
      icon: <AutoAwesomeIcon />,
      status: status === ImportJobStatus.COMPLETED ? 'completed' : getStepStatus('complete'),
      details: [
        'Generating thumbnails',
        'Creating preview',
        'Saving project'
      ]
    }
  ];

  // Update estimated time based on progress
  useEffect(() => {
    if (progress > 0 && progress < 100) {
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      const rate = progress / elapsed;
      const remaining = (100 - progress) / rate;
      setEstimatedTime(Math.ceil(remaining));
    }
  }, [progress, startTime]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const getStatusColor = () => {
    switch (status) {
      case ImportJobStatus.COMPLETED:
        return 'success';
      case ImportJobStatus.FAILED:
      case ImportJobStatus.CANCELLED:
        return 'error';
      default:
        return 'primary';
    }
  };

  const getStepIcon = (step: ProcessStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'active':
        return <CircularProgress size={20} />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <RadioButtonUncheckedIcon color="disabled" />;
    }
  };

  const handleRetry = () => {
    // Implement retry logic
    window.location.reload();
  };

  if (!jobId) {
    return (
      <Alert severity="info">
        Initializing import process...
      </Alert>
    );
  }

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Import Progress
          </Typography>
          {status && (
            <Chip
              label={status.toUpperCase()}
              color={getStatusColor()}
              size="small"
            />
          )}
        </Box>

        <Box mb={3}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="body2" color="text.secondary">
              Overall Progress
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {progress}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            color={getStatusColor()}
            sx={{ height: 8, borderRadius: 4 }}
          />
          {estimatedTime && status !== ImportJobStatus.COMPLETED && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Estimated time remaining: {formatTime(estimatedTime)}
            </Typography>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Box>
              <Typography variant="body2" gutterBottom>
                {error}
              </Typography>
              <Button
                size="small"
                startIcon={<RefreshIcon />}
                onClick={handleRetry}
                sx={{ mt: 1 }}
              >
                Retry Import
              </Button>
            </Box>
          </Alert>
        )}

        <Box>
          <Box display="flex" alignItems="center" mb={2}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              Processing Steps
            </Typography>
            <IconButton
              size="small"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          <List>
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <ListItem>
                  <ListItemIcon>
                    {getStepIcon(step)}
                  </ListItemIcon>
                  <ListItemText
                    primary={step.label}
                    secondary={
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {step.description}
                        </Typography>
                        <Collapse in={showDetails && step.status === 'active'}>
                          <List dense sx={{ pl: 2, mt: 1 }}>
                            {step.details?.map((detail, idx) => (
                              <ListItem key={idx} sx={{ py: 0 }}>
                                <Typography variant="caption" color="text.secondary">
                                  • {detail}
                                </Typography>
                              </ListItem>
                            ))}
                          </List>
                        </Collapse>
                      </Box>
                    }
                  />
                  {step.status === 'active' && currentStep && (
                    <CircularProgress size={20} />
                  )}
                </ListItem>
                {index < steps.length - 1 && <Box sx={{ ml: 4, borderLeft: 2, borderColor: 'divider', height: 20 }} />}
              </React.Fragment>
            ))}
          </List>
        </Box>
      </Paper>

      {status === ImportJobStatus.COMPLETED && (
        <Alert 
          severity="success" 
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/')}>
              View Video
            </Button>
          }
        >
          Video imported successfully! Redirecting to editor...
        </Alert>
      )}

      {status === ImportJobStatus.FAILED && (
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            onClick={() => navigate('/')}
          >
            Back to Videos
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleRetry}
            startIcon={<RefreshIcon />}
          >
            Try Again
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default ImportProgress;