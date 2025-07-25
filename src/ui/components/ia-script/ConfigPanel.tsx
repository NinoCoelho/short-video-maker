import React from 'react';
import {
  Paper,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Switch,
  FormControlLabel,
  Divider,
  Slider,
  Chip,
  alpha,
} from '@mui/material';
import {
  Palette as PaletteIcon,
  MusicNote as MusicIcon,
  RecordVoiceOver as VoiceIcon,
  Language as LanguageIcon,
  AspectRatio as AspectRatioIcon,
  TextFields as TextIcon,
} from '@mui/icons-material';
import { RenderConfig, VoiceEnum, OrientationEnum, CaptionPositionEnum, MusicVolumeEnum } from '../../../types/shorts';

interface ConfigPanelProps {
  config: RenderConfig;
  onChange: (config: RenderConfig) => void;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onChange }) => {
  const handleChange = (field: keyof RenderConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  const musicMoods = [
    { value: 'happy', label: 'Alegre', color: '#FFC107' },
    { value: 'sad', label: 'Triste', color: '#607D8B' },
    { value: 'excited', label: 'Animado', color: '#FF5722' },
    { value: 'chill', label: 'Relaxante', color: '#00BCD4' },
    { value: 'inspirational', label: 'Inspiracional', color: '#9C27B0' },
    { value: 'cinematic', label: 'Cinematográfico', color: '#3F51B5' },
    { value: 'worship', label: 'Adoração', color: '#795548' },
  ];

  const voices = [
    { value: VoiceEnum.Paulo, label: 'Paulo', lang: 'pt' },
    { value: VoiceEnum.Noel, label: 'Noel', lang: 'pt' },
    { value: VoiceEnum.Scarlett, label: 'Scarlett', lang: 'en' },
    { value: VoiceEnum.NinoCoelho, label: 'Nino Coelho', lang: 'pt' },
  ];

  return (
    <Paper
      elevation={3}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6">
          Configurações do Vídeo
        </Typography>
      </Box>

      <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
        {/* Voice Selection */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VoiceIcon fontSize="small" />
            Voz
          </Typography>
          <FormControl fullWidth size="small">
            <Select
              value={config.voice}
              onChange={(e) => handleChange('voice', e.target.value)}
            >
              {voices.map((voice) => (
                <MenuItem key={voice.value} value={voice.value}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {voice.label}
                    <Chip size="small" label={voice.lang} />
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Music Selection */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MusicIcon fontSize="small" />
            Música de Fundo
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {musicMoods.map((mood) => (
              <Chip
                key={mood.value}
                label={mood.label}
                onClick={() => handleChange('music', mood.value)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: config.music === mood.value ? mood.color : 'transparent',
                  color: config.music === mood.value ? 'white' : 'text.primary',
                  borderColor: mood.color,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  '&:hover': {
                    bgcolor: config.music === mood.value ? mood.color : alpha(mood.color, 0.1),
                  },
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Music Volume */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Volume da Música
          </Typography>
          <FormControl fullWidth size="small">
            <Select
              value={config.musicVolume || MusicVolumeEnum.medium}
              onChange={(e) => handleChange('musicVolume', e.target.value)}
            >
              <MenuItem value={MusicVolumeEnum.muted}>Mudo</MenuItem>
              <MenuItem value={MusicVolumeEnum.low}>Baixo</MenuItem>
              <MenuItem value={MusicVolumeEnum.medium}>Médio</MenuItem>
              <MenuItem value={MusicVolumeEnum.high}>Alto</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Orientation */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AspectRatioIcon fontSize="small" />
            Orientação
          </Typography>
          <FormControl fullWidth size="small">
            <Select
              value={config.orientation}
              onChange={(e) => handleChange('orientation', e.target.value)}
            >
              <MenuItem value={OrientationEnum.portrait}>Vertical (9:16)</MenuItem>
              <MenuItem value={OrientationEnum.landscape}>Horizontal (16:9)</MenuItem>
              <MenuItem value={OrientationEnum.square}>Quadrado (1:1)</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Language */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LanguageIcon fontSize="small" />
            Idioma
          </Typography>
          <FormControl fullWidth size="small">
            <Select
              value={config.language}
              onChange={(e) => handleChange('language', e.target.value)}
            >
              <MenuItem value="pt">Português</MenuItem>
              <MenuItem value="en">English</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Caption Settings */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextIcon fontSize="small" />
            Legendas
          </Typography>
          
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Posição</InputLabel>
            <Select
              value={config.captionPosition}
              onChange={(e) => handleChange('captionPosition', e.target.value)}
              label="Posição"
            >
              <MenuItem value={CaptionPositionEnum.top}>Superior</MenuItem>
              <MenuItem value={CaptionPositionEnum.center}>Centro</MenuItem>
              <MenuItem value={CaptionPositionEnum.bottom}>Inferior</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              size="small"
              label="Cor do Fundo"
              type="color"
              value={config.captionBackgroundColor}
              onChange={(e) => handleChange('captionBackgroundColor', e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              label="Cor do Texto"
              type="color"
              value={config.captionTextColor}
              onChange={(e) => handleChange('captionTextColor', e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        </Box>

        {/* Advanced Settings */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Configurações Avançadas
          </Typography>
          
          {/* Overlay */}
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Overlay</InputLabel>
            <Select
              value={config.overlay || ''}
              onChange={(e) => handleChange('overlay', e.target.value)}
              label="Overlay"
            >
              <MenuItem value="">Nenhum</MenuItem>
              <MenuItem value="jornada">Jornada</MenuItem>
              <MenuItem value="jornada_landscape">Jornada Landscape</MenuItem>
              <MenuItem value="jornada_laranja">Jornada Laranja</MenuItem>
              <MenuItem value="whatsappbanner">WhatsApp Banner</MenuItem>
            </Select>
          </FormControl>

          {/* Padding */}
          <Box>
            <Typography variant="caption" gutterBottom>
              Tempo de espera após fala: {(config.paddingBack || 3000) / 1000}s
            </Typography>
            <Slider
              value={config.paddingBack || 3000}
              onChange={(_, value) => handleChange('paddingBack', value)}
              min={0}
              max={5000}
              step={500}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value / 1000}s`}
            />
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default ConfigPanel;