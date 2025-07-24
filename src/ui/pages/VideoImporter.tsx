import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Box,
  Typography,
  Paper,
  Button,
  Stepper,
  Step,
  StepLabel,
  Alert,
  CircularProgress,
  Container
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadIcon from '@mui/icons-material/Upload';
import URLInput from '../components/import/URLInput';
import ImportSettings from '../components/import/ImportSettings';
import ImportProgress from '../components/import/ImportProgress';
import { useWebSocket } from '../hooks/useWebSocket';
import { VideoSourceType, ImportJobStatus } from '../../types/import';
import { ImportSettings as IImportSettings, MusicMoodEnum, OrientationEnum } from '../../types/shorts';
import { logger } from '../../utils/browser-logger';

const steps = ['Enter Video URL', 'Configure Settings', 'Import Progress'];

interface ImportState {
  url: string;
  settings: IImportSettings;
  jobId: string | null;
  status: ImportJobStatus | null;
  progress: number;
  error: string | null;
  currentStep: string | null;
}

const VideoImporter: React.FC = () => {
  const navigate = useNavigate();
  const { socket, isConnected } = useWebSocket();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importState, setImportState] = useState<ImportState>({
    url: '',
    settings: {
      targetLanguage: 'pt',
      music: MusicMoodEnum.UPBEAT,
      overlay: undefined,
      orientation: OrientationEnum.PORTRAIT,
      autoHighlights: true,
      maxSegmentDuration: 60,
      minSegmentDuration: 15
    },
    jobId: null,
    status: null,
    progress: 0,
    error: null,
    currentStep: null
  });

  // Listen to WebSocket events for import progress
  React.useEffect(() => {
    if (!socket || !importState.jobId) return;

    const handleImportProgress = (data: any) => {
      if (data.jobId === importState.jobId) {
        setImportState(prev => ({
          ...prev,
          status: data.status,
          progress: data.progress,
          currentStep: data.currentStep,
          error: data.error
        }));

        // If completed successfully, navigate to video editor
        if (data.status === ImportJobStatus.COMPLETED && data.videoId) {
          setTimeout(() => {
            navigate(`/edit/${data.videoId}`);
          }, 1000);
        }
      }
    };

    socket.on('import-progress', handleImportProgress);
    socket.on('import-complete', handleImportProgress);
    socket.on('import-error', handleImportProgress);

    return () => {
      socket.off('import-progress', handleImportProgress);
      socket.off('import-complete', handleImportProgress);
      socket.off('import-error', handleImportProgress);
    };
  }, [socket, importState.jobId, navigate]);

  const handleURLSubmit = useCallback((url: string) => {
    setImportState(prev => ({ ...prev, url }));
    setActiveStep(1);
  }, []);

  const handleSettingsSubmit = useCallback((settings: IImportSettings) => {
    setImportState(prev => {
      const newState = { ...prev, settings };
      // Start import with the updated state
      setTimeout(() => startImportWithState(newState), 0);
      return newState;
    });
  }, []);

  const startImportWithState = async (state: ImportState) => {
    setLoading(true);
    setActiveStep(2);
    
    try {
      logger.info('Starting video import', { url: state.url, settings: state.settings });
      
      const response = await axios.post('/api/import/process', {
        url: state.url,
        config: {
          segmentDetection: {
            method: 'scene-change',
            threshold: 0.3
          },
          contentAnalysis: {
            extractKeywords: true,
            generateSummary: true,
            detectHighlights: state.settings.autoHighlights || false
          },
          translation: {
            enabled: false
          }
        }
      });

      logger.info('Import started successfully', { jobId: response.data.jobId });
      
      setImportState(prev => ({
        ...prev,
        jobId: response.data.jobId,
        status: ImportJobStatus.QUEUED
      }));
    } catch (error) {
      logger.error('Failed to start import:', error);
      setImportState(prev => ({
        ...prev,
        error: axios.isAxiosError(error) 
          ? error.response?.data?.error || 'Failed to start import'
          : 'An unexpected error occurred'
      }));
    } finally {
      setLoading(false);
    }
  };

  const startImport = async () => {
    await startImportWithState(importState);
  };

  const handleBack = () => {
    if (activeStep === 0) {
      navigate('/');
    } else {
      setActiveStep(prev => prev - 1);
    }
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <URLInput
            onSubmit={handleURLSubmit}
            initialValue={importState.url}
          />
        );
      case 1:
        return (
          <ImportSettings
            settings={importState.settings}
            onSubmit={handleSettingsSubmit}
            onBack={handleBack}
          />
        );
      case 2:
        return (
          <ImportProgress
            jobId={importState.jobId}
            status={importState.status}
            progress={importState.progress}
            currentStep={importState.currentStep}
            error={importState.error}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Container maxWidth="md">
      <Box py={4}>
        <Box display="flex" alignItems="center" mb={3}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            Back to videos
          </Button>
          <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center' }}>
            <UploadIcon sx={{ mr: 1 }} />
            Import Video
          </Typography>
        </Box>

        {!isConnected && activeStep === 2 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            WebSocket connection lost. Progress updates may be delayed.
          </Alert>
        )}

        <Paper sx={{ p: 3, mb: 3 }}>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {loading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : (
            renderStepContent()
          )}
        </Paper>

        <Box mt={2}>
          <Typography variant="body2" color="text.secondary" align="center">
            Import videos from YouTube, social media, or any public URL. 
            The video will be analyzed and optimized for short-form content.
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default VideoImporter;