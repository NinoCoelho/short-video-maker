import React, { useState, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  Paper,
  InputAdornment,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import YouTubeIcon from '@mui/icons-material/YouTube';
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import axios from 'axios';

interface URLInputProps {
  onSubmit: (url: string) => void;
  initialValue?: string;
}

interface URLValidation {
  isValid: boolean;
  platform?: string;
  error?: string;
}

const URLInput: React.FC<URLInputProps> = ({ onSubmit, initialValue = '' }) => {
  const [url, setUrl] = useState(initialValue);
  const [validation, setValidation] = useState<URLValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const supportedPlatforms = [
    { name: 'YouTube', icon: <YouTubeIcon />, example: 'https://www.youtube.com/watch?v=...' },
    { name: 'YouTube Shorts', icon: <YouTubeIcon />, example: 'https://youtube.com/shorts/...' },
    { name: 'Direct Video URL', icon: <OndemandVideoIcon />, example: 'https://example.com/video.mp4' },
  ];

  const validateURL = useCallback(async (inputUrl: string) => {
    if (!inputUrl.trim()) {
      setValidation(null);
      return;
    }

    setIsValidating(true);
    
    try {
      // Basic URL validation
      const urlObj = new URL(inputUrl);
      
      // Check if it's a YouTube URL
      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        setValidation({
          isValid: true,
          platform: 'YouTube'
        });
      } 
      // Check if it's a direct video URL
      else if (inputUrl.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
        setValidation({
          isValid: true,
          platform: 'Direct Video'
        });
      }
      // For other URLs, validate with backend
      else {
        const response = await axios.post('/api/import/validate-url', { url: inputUrl });
        setValidation({
          isValid: response.data.isValid,
          platform: response.data.platform,
          error: response.data.error
        });
      }
    } catch (error) {
      setValidation({
        isValid: false,
        error: 'Invalid URL format'
      });
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleURLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    
    // Debounce validation
    const timeoutId = setTimeout(() => {
      validateURL(newUrl);
    }, 500);

    return () => clearTimeout(timeoutId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validation?.isValid && url.trim()) {
      onSubmit(url.trim());
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      validateURL(text);
    } catch (error) {
      console.error('Failed to read clipboard:', error);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Typography variant="h6" gutterBottom>
        Enter Video URL
      </Typography>
      
      <TextField
        fullWidth
        label="Video URL"
        placeholder="Paste a YouTube or video URL here..."
        value={url}
        onChange={handleURLChange}
        variant="outlined"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <LinkIcon />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {isValidating && <CircularProgress size={20} />}
              {!isValidating && validation?.isValid && (
                <CheckCircleIcon color="success" />
              )}
              {!isValidating && validation && !validation.isValid && (
                <ErrorIcon color="error" />
              )}
            </InputAdornment>
          )
        }}
        sx={{ mb: 2 }}
      />

      <Box display="flex" gap={1} mb={2}>
        <Button
          variant="outlined"
          onClick={handlePaste}
          size="small"
        >
          Paste from Clipboard
        </Button>
      </Box>

      {validation && !validation.isValid && validation.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {validation.error}
        </Alert>
      )}

      {validation?.isValid && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Valid {validation.platform} URL detected
        </Alert>
      )}

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle1" gutterBottom>
        Supported Platforms:
      </Typography>
      
      <List>
        {supportedPlatforms.map((platform, index) => (
          <ListItem key={index}>
            <ListItemIcon>{platform.icon}</ListItemIcon>
            <ListItemText
              primary={platform.name}
              secondary={platform.example}
            />
          </ListItem>
        ))}
      </List>

      <Box mt={3}>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={!validation?.isValid || isValidating}
          size="large"
        >
          Continue
        </Button>
      </Box>

      <Paper sx={{ p: 2, mt: 3, bgcolor: 'grey.50' }}>
        <Typography variant="body2" color="text.secondary">
          <strong>Tips:</strong>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li>YouTube videos will be downloaded in the best available quality</li>
            <li>Videos longer than 10 minutes may take more time to process</li>
            <li>Make sure the video is publicly accessible</li>
          </ul>
        </Typography>
      </Paper>
    </Box>
  );
};

export default URLInput;