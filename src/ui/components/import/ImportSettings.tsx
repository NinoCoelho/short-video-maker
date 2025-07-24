import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Switch,
  FormControlLabel,
  Paper,
  Grid,
  Chip,
  Alert,
  Divider,
  TextField,
  Tooltip,
  IconButton
} from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import LanguageIcon from '@mui/icons-material/Language';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import InfoIcon from '@mui/icons-material/Info';
import ImageIcon from '@mui/icons-material/Image';
import { ImportSettings, MusicMoodEnum, OrientationEnum } from '../../../types/shorts';

interface ImportSettingsProps {
  settings: ImportSettings;
  onSubmit: (settings: ImportSettings) => void;
  onBack: () => void;
}

const ImportSettingsComponent: React.FC<ImportSettingsProps> = ({
  settings: initialSettings,
  onSubmit,
  onBack
}) => {
  const [settings, setSettings] = useState<ImportSettings>(initialSettings);

  const languages = [
    { code: 'pt', name: 'Portuguese' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' }
  ];

  const musicMoods = [
    { value: MusicMoodEnum.UPBEAT, label: 'Upbeat', description: 'Energetic and positive' },
    { value: MusicMoodEnum.CALM, label: 'Calm', description: 'Relaxing and peaceful' },
    { value: MusicMoodEnum.DRAMATIC, label: 'Dramatic', description: 'Intense and emotional' },
    { value: MusicMoodEnum.FUNNY, label: 'Funny', description: 'Light and humorous' },
    { value: MusicMoodEnum.INSPIRATIONAL, label: 'Inspirational', description: 'Motivating and uplifting' },
    { value: MusicMoodEnum.NONE, label: 'No Music', description: 'Keep original audio only' }
  ];

  const overlayPresets = [
    { value: '', label: 'None' },
    { value: 'subscribe', label: 'Subscribe Button' },
    { value: 'logo', label: 'Channel Logo' },
    { value: 'watermark', label: 'Watermark' },
    { value: 'custom', label: 'Custom Image' }
  ];

  const handleChange = (field: keyof ImportSettings) => (
    event: React.ChangeEvent<{ value: unknown }> | any
  ) => {
    const value = event.target ? event.target.value : event;
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSliderChange = (field: keyof ImportSettings) => (
    _event: Event,
    value: number | number[]
  ) => {
    setSettings(prev => ({
      ...prev,
      [field]: value as number
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(settings);
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Typography variant="h6" gutterBottom>
        Import Settings
      </Typography>
      
      <Grid container spacing={3}>
        {/* Language Selection */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <LanguageIcon sx={{ mr: 1 }} />
              <Typography variant="subtitle1">Language & Transcription</Typography>
            </Box>
            
            <FormControl fullWidth>
              <InputLabel>Target Language</InputLabel>
              <Select
                value={settings.targetLanguage}
                onChange={handleChange('targetLanguage')}
                label="Target Language"
              >
                {languages.map(lang => (
                  <MenuItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Alert severity="info" sx={{ mt: 2 }}>
              AI will transcribe and translate the video content to the selected language
            </Alert>
          </Paper>
        </Grid>

        {/* Music Selection */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <MusicNoteIcon sx={{ mr: 1 }} />
              <Typography variant="subtitle1">Background Music</Typography>
            </Box>
            
            <Grid container spacing={1}>
              {musicMoods.map(mood => (
                <Grid item xs={6} sm={4} key={mood.value}>
                  <Paper
                    variant={settings.music === mood.value ? "elevation" : "outlined"}
                    sx={{
                      p: 1.5,
                      cursor: 'pointer',
                      bgcolor: settings.music === mood.value ? 'primary.light' : 'transparent',
                      color: settings.music === mood.value ? 'primary.contrastText' : 'text.primary',
                      '&:hover': { bgcolor: 'action.hover' }
                    }}
                    onClick={() => setSettings(prev => ({ ...prev, music: mood.value }))}
                  >
                    <Typography variant="body2" fontWeight="medium">
                      {mood.label}
                    </Typography>
                    <Typography variant="caption" color="inherit" sx={{ opacity: 0.7 }}>
                      {mood.description}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>

        {/* Orientation */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <AspectRatioIcon sx={{ mr: 1 }} />
              <Typography variant="subtitle1">Video Orientation</Typography>
            </Box>
            
            <FormControl fullWidth>
              <InputLabel>Orientation</InputLabel>
              <Select
                value={settings.orientation}
                onChange={handleChange('orientation')}
                label="Orientation"
              >
                <MenuItem value={OrientationEnum.PORTRAIT}>
                  Portrait (9:16) - TikTok, Reels, Shorts
                </MenuItem>
                <MenuItem value={OrientationEnum.LANDSCAPE}>
                  Landscape (16:9) - YouTube
                </MenuItem>
                <MenuItem value={OrientationEnum.SQUARE}>
                  Square (1:1) - Instagram Feed
                </MenuItem>
              </Select>
            </FormControl>
          </Paper>
        </Grid>

        {/* Overlay Settings */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <ImageIcon sx={{ mr: 1 }} />
              <Typography variant="subtitle1">Overlay</Typography>
            </Box>
            
            <FormControl fullWidth>
              <InputLabel>Overlay Type</InputLabel>
              <Select
                value={settings.overlay || ''}
                onChange={handleChange('overlay')}
                label="Overlay Type"
              >
                {overlayPresets.map(preset => (
                  <MenuItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            {settings.overlay === 'custom' && (
              <TextField
                fullWidth
                label="Custom Overlay URL"
                placeholder="https://example.com/overlay.png"
                sx={{ mt: 2 }}
                size="small"
              />
            )}
          </Paper>
        </Grid>

        {/* AI Features */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <AutoAwesomeIcon sx={{ mr: 1 }} />
              <Typography variant="subtitle1">AI Features</Typography>
            </Box>
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.autoHighlights}
                  onChange={(e) => setSettings(prev => ({ 
                    ...prev, 
                    autoHighlights: e.target.checked 
                  }))}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">Auto-detect Highlights</Typography>
                  <Typography variant="caption" color="text.secondary">
                    AI will identify the best moments to create shorts
                  </Typography>
                </Box>
              }
            />
          </Paper>
        </Grid>

        {/* Duration Settings */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Segment Duration
            </Typography>
            
            <Box sx={{ px: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Minimum Duration: {settings.minSegmentDuration}s
              </Typography>
              <Slider
                value={settings.minSegmentDuration}
                onChange={handleSliderChange('minSegmentDuration')}
                min={10}
                max={30}
                step={5}
                marks
                valueLabelDisplay="auto"
                sx={{ mb: 3 }}
              />
              
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Maximum Duration: {settings.maxSegmentDuration}s
              </Typography>
              <Slider
                value={settings.maxSegmentDuration}
                onChange={handleSliderChange('maxSegmentDuration')}
                min={30}
                max={180}
                step={10}
                marks
                valueLabelDisplay="auto"
              />
            </Box>
            
            <Box display="flex" alignItems="center" mt={2}>
              <InfoIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                AI will create segments within these duration limits
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Box display="flex" justifyContent="space-between" mt={4}>
        <Button
          variant="outlined"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          size="large"
        >
          Start Import
        </Button>
      </Box>
    </Box>
  );
};

export default ImportSettingsComponent;