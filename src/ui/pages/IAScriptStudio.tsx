import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  LinearProgress,
  alpha,
  useTheme,
  Slider,
  Switch,
  FormControlLabel,
  Collapse,
  Fade,
  Grow,
  Divider,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  VideoCall as VideoCallIcon,
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  AutoAwesome as MagicIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  MusicNote as MusicIcon,
  RecordVoiceOver as VoiceIcon,
  Language as LanguageIcon,
  AspectRatio as AspectRatioIcon,
  TextFields as TextIcon,
  Palette as PaletteIcon,
  VolumeUp as VolumeIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useVideoStatus } from '../hooks/useVideoStatus';
import {
  ScriptSession,
  SendChatMessageRequest,
} from '../../types/iaScript';
import { RenderConfig, VoiceEnum, OrientationEnum, CaptionPositionEnum, MusicVolumeEnum } from '../../types/shorts';

// Create axios instance with correct backend URL
const api = axios.create({
  baseURL: 'http://localhost:3233',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Load saved settings from localStorage
const loadSavedSettings = (): RenderConfig => {
  const saved = localStorage.getItem('iaScriptStudioSettings');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved settings:', e);
    }
  }
  return {
    voice: VoiceEnum.Paulo,
    orientation: OrientationEnum.portrait,
    language: 'pt',
    music: 'happy',
    captionPosition: 'bottom',
    captionBackgroundColor: '#000000',
    captionTextColor: '#ffffff',
    paddingBack: 3000,
    captionsEnabled: true,
    overlay: '',
    hook: '',
    musicVolume: 'medium',
  };
};

// Save settings to localStorage
const saveSettings = (settings: RenderConfig) => {
  localStorage.setItem('iaScriptStudioSettings', JSON.stringify(settings));
};

// Progress animation component
const GenerationProgress: React.FC<{ progress: number; stage: string }> = ({ progress, stage }) => {
  const theme = useTheme();
  
  return (
    <Fade in timeout={500}>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        gap: 3,
        py: 6,
      }}>
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          <CircularProgress
            variant="determinate"
            value={progress}
            size={120}
            thickness={4}
            sx={{
              color: theme.palette.primary.main,
              [`& .MuiCircularProgress-circle`]: {
                strokeLinecap: 'round',
              },
            }}
          />
          <Box
            sx={{
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <MagicIcon sx={{ fontSize: 40, color: theme.palette.primary.main, mb: 1 }} />
              <Typography variant="h6" component="div" color="text.secondary">
                {progress}%
              </Typography>
            </Box>
          </Box>
        </Box>
        
        <Typography variant="h5" color="primary" fontWeight="medium">
          Criando seu vídeo
        </Typography>
        
        <Typography variant="body1" color="text.secondary" textAlign="center">
          {stage}
        </Typography>
        
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ 
            width: '60%', 
            height: 8, 
            borderRadius: 4,
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            },
          }}
        />
      </Box>
    </Fade>
  );
};

const IAScriptStudio: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Main state
  const [session, setSession] = useState<ScriptSession | null>(null);
  const [promptText, setPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Progress states
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  
  // Video states
  const [renderingVideoId, setRenderingVideoId] = useState<string | null>(null);
  const [completedVideoId, setCompletedVideoId] = useState<string | null>(null);
  const [currentScript, setCurrentScript] = useState<any>(null);
  
  // WebSocket for video status updates
  const { status: videoStatus, subscribe, unsubscribe, isConnected } = useVideoStatus();
  
  // Video configuration with saved settings
  const [videoConfig, setVideoConfig] = useState<RenderConfig>(loadSavedSettings());
  
  // UI state
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Initialize session on mount
  useEffect(() => {
    initializeSession();
  }, []);
  
  // Save settings whenever they change
  useEffect(() => {
    saveSettings(videoConfig);
  }, [videoConfig]);

  // Monitor video rendering progress
  useEffect(() => {
    if (!videoStatus || !renderingVideoId || videoStatus.id !== renderingVideoId) return;

    switch (videoStatus.status) {
      case 'processing':
        const progressPercent = Math.round(videoStatus.progress || 0);
        setRenderProgress(progressPercent);
        setGenerationStep(videoStatus.stage || 'Renderizando vídeo...');
        break;

      case 'completed':
        setCompletedVideoId(renderingVideoId);
        setRenderingVideoId(null);
        setRenderProgress(100);
        setGenerationStep('Vídeo pronto!');
        unsubscribe(renderingVideoId);
        setIsGenerating(false);
        // Auto-play video when ready
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.play();
            setIsPlaying(true);
          }
        }, 500);
        break;

      case 'failed':
        setError(videoStatus.error || 'Erro ao renderizar vídeo');
        setRenderingVideoId(null);
        setIsGenerating(false);
        setRenderProgress(0);
        unsubscribe(renderingVideoId);
        break;
    }
  }, [videoStatus, renderingVideoId, unsubscribe]);

  const initializeSession = async () => {
    try {
      const response = await api.post('/api/ia-script/sessions', {
        config: videoConfig,
      });
      const sessionData = response.data.data?.session || response.data.session || response.data;
      setSession(sessionData);
    } catch (err: any) {
      console.error('Failed to create session:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Falha ao iniciar sessão';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    }
  };

  const handleGenerateVideo = async () => {
    if (!promptText.trim() || !session || isGenerating) return;
    
    if (!session.id) {
      setError('Sessão não inicializada. Por favor, recarregue a página.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGenerationStep('Analisando seu prompt...');
    setGenerationProgress(10);
    setCompletedVideoId(null);

    try {
      // Simulate progress steps
      const progressSteps = [
        { delay: 500, progress: 20, step: 'Gerando roteiro...' },
        { delay: 1500, progress: 40, step: 'Criando estrutura do vídeo...' },
        { delay: 2500, progress: 60, step: 'Preparando cenas...' },
        { delay: 3500, progress: 80, step: 'Finalizando script...' },
      ];

      // Start progress simulation
      progressSteps.forEach(({ delay, progress, step }) => {
        setTimeout(() => {
          if (isGenerating) {
            setGenerationStep(step);
            setGenerationProgress(progress);
          }
        }, delay);
      });

      const request: SendChatMessageRequest = {
        content: promptText,
        placeholderValues: {},
      };

      const response = await api.post(
        `/api/ia-script/sessions/${session.id}/chat`,
        request
      );

      const responseData = response.data.data || response.data;
      const { script } = responseData;
      
      if (script) {
        setCurrentScript(script);
        setVideoConfig(prev => ({ ...prev, hook: script.title || 'Meu Vídeo' }));
        setGenerationProgress(100);
        setGenerationStep('Script pronto! Iniciando renderização...');
        
        // Immediately start rendering
        setTimeout(() => {
          handleRenderVideo(script);
        }, 1000);
      }
    } catch (err: any) {
      setIsGenerating(false);
      setGenerationProgress(0);
      
      let errorMessage = 'Erro ao gerar o script.';
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      }
      
      setError(errorMessage);
    }
  };

  const handleRenderVideo = async (script: any) => {
    if (!session) return;

    try {
      setGenerationStep('Iniciando renderização do vídeo...');
      setRenderProgress(0);
      
      const response = await api.post(
        `/api/ia-script/sessions/${session.id}/render`,
        { 
          immediate: true,
          config: videoConfig
        }
      );

      const { videoId } = response.data;
      
      console.log('Starting to monitor video:', videoId);
      setRenderingVideoId(videoId);
      subscribe(videoId);
      
    } catch (err) {
      setError('Falha ao iniciar renderização do vídeo');
      setIsGenerating(false);
    }
  };

  const handleNewVideo = () => {
    setPromptText('');
    setCompletedVideoId(null);
    setCurrentScript(null);
    setGenerationProgress(0);
    setRenderProgress(0);
    setIsGenerating(false);
    setGenerationStep('');
  };

  const handleConfigChange = (field: keyof RenderConfig, value: any) => {
    setVideoConfig(prev => ({ ...prev, [field]: value }));
  };

  const toggleVideo = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h3" fontWeight="bold" gutterBottom>
          IA Script Studio
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Crie vídeos incríveis com inteligência artificial
        </Typography>
      </Box>

      {/* Main Content */}
      {!isGenerating && !completedVideoId && (
        <Fade in timeout={500}>
          <Card elevation={3}>
            <CardContent sx={{ p: 4 }}>
              {/* Prompt Input */}
              <Box sx={{ mb: 4 }}>
                <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <MagicIcon color="primary" />
                  Descreva seu vídeo
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="Digite aqui a descrição do vídeo que você deseja criar..."
                  variant="outlined"
                  sx={{
                    mt: 2,
                    '& .MuiOutlinedInput-root': {
                      fontSize: '1.1rem',
                      backgroundColor: alpha(theme.palette.primary.main, 0.02),
                    },
                  }}
                />
              </Box>

              <Divider sx={{ my: 3 }} />

              {/* Basic Settings */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Configurações Básicas
                </Typography>
                
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mt: 2 }}>
                  {/* Voice Selection */}
                  <FormControl fullWidth>
                    <InputLabel><VoiceIcon sx={{ mr: 1, fontSize: 20 }} />Voz</InputLabel>
                    <Select
                      value={videoConfig.voice}
                      onChange={(e) => handleConfigChange('voice', e.target.value)}
                      label="Voz"
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

                  {/* Orientation */}
                  <FormControl fullWidth>
                    <InputLabel><AspectRatioIcon sx={{ mr: 1, fontSize: 20 }} />Orientação</InputLabel>
                    <Select
                      value={videoConfig.orientation}
                      onChange={(e) => handleConfigChange('orientation', e.target.value)}
                      label="Orientação"
                    >
                      <MenuItem value={OrientationEnum.portrait}>Vertical (9:16)</MenuItem>
                      <MenuItem value={OrientationEnum.landscape}>Horizontal (16:9)</MenuItem>
                      <MenuItem value={OrientationEnum.square}>Quadrado (1:1)</MenuItem>
                    </Select>
                  </FormControl>

                  {/* Language */}
                  <FormControl fullWidth>
                    <InputLabel><LanguageIcon sx={{ mr: 1, fontSize: 20 }} />Idioma</InputLabel>
                    <Select
                      value={videoConfig.language}
                      onChange={(e) => handleConfigChange('language', e.target.value)}
                      label="Idioma"
                    >
                      <MenuItem value="pt">Português</MenuItem>
                      <MenuItem value="en">English</MenuItem>
                    </Select>
                  </FormControl>

                  {/* Music Volume */}
                  <FormControl fullWidth>
                    <InputLabel><VolumeIcon sx={{ mr: 1, fontSize: 20 }} />Volume da Música</InputLabel>
                    <Select
                      value={videoConfig.musicVolume || MusicVolumeEnum.medium}
                      onChange={(e) => handleConfigChange('musicVolume', e.target.value)}
                      label="Volume da Música"
                    >
                      <MenuItem value={MusicVolumeEnum.muted}>Mudo</MenuItem>
                      <MenuItem value={MusicVolumeEnum.low}>Baixo</MenuItem>
                      <MenuItem value={MusicVolumeEnum.medium}>Médio</MenuItem>
                      <MenuItem value={MusicVolumeEnum.high}>Alto</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                {/* Music Selection */}
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MusicIcon fontSize="small" />
                    Música de Fundo
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                    {musicMoods.map((mood) => (
                      <Chip
                        key={mood.value}
                        label={mood.label}
                        onClick={() => handleConfigChange('music', mood.value)}
                        sx={{
                          cursor: 'pointer',
                          bgcolor: videoConfig.music === mood.value ? mood.color : 'transparent',
                          color: videoConfig.music === mood.value ? 'white' : 'text.primary',
                          borderColor: mood.color,
                          borderWidth: 1,
                          borderStyle: 'solid',
                          '&:hover': {
                            bgcolor: videoConfig.music === mood.value ? mood.color : alpha(mood.color, 0.1),
                          },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </Box>

              {/* Advanced Settings */}
              <Box>
                <Button
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  endIcon={showAdvancedSettings ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  sx={{ mb: 2 }}
                >
                  Configurações Avançadas
                </Button>
                
                <Collapse in={showAdvancedSettings}>
                  <Box sx={{ pl: 2, pr: 2, pb: 2 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                      {/* Caption Position */}
                      <FormControl fullWidth size="small">
                        <InputLabel>Posição das Legendas</InputLabel>
                        <Select
                          value={videoConfig.captionPosition}
                          onChange={(e) => handleConfigChange('captionPosition', e.target.value)}
                          label="Posição das Legendas"
                        >
                          <MenuItem value={CaptionPositionEnum.top}>Superior</MenuItem>
                          <MenuItem value={CaptionPositionEnum.center}>Centro</MenuItem>
                          <MenuItem value={CaptionPositionEnum.bottom}>Inferior</MenuItem>
                        </Select>
                      </FormControl>

                      {/* Overlay */}
                      <FormControl fullWidth size="small">
                        <InputLabel>Overlay</InputLabel>
                        <Select
                          value={videoConfig.overlay || ''}
                          onChange={(e) => handleConfigChange('overlay', e.target.value)}
                          label="Overlay"
                        >
                          <MenuItem value="">Nenhum</MenuItem>
                          <MenuItem value="jornada">Jornada</MenuItem>
                          <MenuItem value="jornada_landscape">Jornada Landscape</MenuItem>
                          <MenuItem value="jornada_laranja">Jornada Laranja</MenuItem>
                          <MenuItem value="whatsappbanner">WhatsApp Banner</MenuItem>
                        </Select>
                      </FormControl>

                      {/* Caption Colors */}
                      <TextField
                        size="small"
                        label="Cor do Fundo das Legendas"
                        type="color"
                        value={videoConfig.captionBackgroundColor}
                        onChange={(e) => handleConfigChange('captionBackgroundColor', e.target.value)}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                      />
                      
                      <TextField
                        size="small"
                        label="Cor do Texto das Legendas"
                        type="color"
                        value={videoConfig.captionTextColor}
                        onChange={(e) => handleConfigChange('captionTextColor', e.target.value)}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                      />
                    </Box>

                    {/* Padding */}
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="caption" gutterBottom>
                        Tempo de espera após fala: {(videoConfig.paddingBack || 3000) / 1000}s
                      </Typography>
                      <Slider
                        value={videoConfig.paddingBack || 3000}
                        onChange={(_, value) => handleConfigChange('paddingBack', value)}
                        min={0}
                        max={5000}
                        step={500}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(value) => `${value / 1000}s`}
                      />
                    </Box>
                  </Box>
                </Collapse>
              </Box>

              {/* Generate Button */}
              <Box sx={{ mt: 4, textAlign: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleGenerateVideo}
                  disabled={!promptText.trim() || isGenerating || !session}
                  startIcon={<VideoCallIcon />}
                  sx={{
                    px: 6,
                    py: 2,
                    fontSize: '1.2rem',
                    background: 'linear-gradient(45deg, #6366f1, #8b5cf6)',
                    '&:hover': {
                      background: 'linear-gradient(45deg, #5b21b6, #7c3aed)',
                    },
                  }}
                >
                  Gerar Vídeo
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Fade>
      )}

      {/* Generation Progress */}
      {isGenerating && !completedVideoId && (
        <Card elevation={3}>
          <CardContent sx={{ p: 6 }}>
            <GenerationProgress 
              progress={renderProgress > 0 ? renderProgress : generationProgress} 
              stage={generationStep} 
            />
          </CardContent>
        </Card>
      )}

      {/* Video Result */}
      {completedVideoId && (
        <Grow in timeout={500}>
          <Card elevation={3}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h5" fontWeight="medium">
                  Seu vídeo está pronto!
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = `http://localhost:3233/api/video/${completedVideoId}`;
                      link.download = `video-${completedVideoId}.mp4`;
                      link.click();
                    }}
                  >
                    Download
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<RefreshIcon />}
                    onClick={handleNewVideo}
                  >
                    Novo Vídeo
                  </Button>
                </Box>
              </Box>

              {/* Video Player */}
              <Box sx={{ 
                position: 'relative',
                width: '100%',
                maxWidth: 800,
                mx: 'auto',
                borderRadius: 2,
                overflow: 'hidden',
                backgroundColor: '#000',
              }}>
                <video
                  ref={videoRef}
                  controls
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                  src={`http://localhost:3233/api/video/${completedVideoId}`}
                >
                  Seu navegador não suporta vídeo HTML5.
                </video>
                
                {/* Custom Play Button Overlay */}
                {!isPlaying && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      cursor: 'pointer',
                    }}
                    onClick={toggleVideo}
                  >
                    <IconButton
                      sx={{
                        bgcolor: 'rgba(255, 255, 255, 0.9)',
                        '&:hover': {
                          bgcolor: 'white',
                        },
                      }}
                    >
                      <PlayIcon sx={{ fontSize: 60, color: 'primary.main' }} />
                    </IconButton>
                  </Box>
                )}
              </Box>

              {/* Script Details */}
              {currentScript && (
                <Box sx={{ mt: 4, p: 3, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Detalhes do Script
                  </Typography>
                  <Typography variant="body1" fontWeight="medium" gutterBottom>
                    {currentScript.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {currentScript.metadata?.totalScenes} cenas • 
                    ~{currentScript.metadata?.estimatedDuration}s de duração
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grow>
      )}

      {/* Alerts */}
      {error && (
        <Alert
          severity="error"
          sx={{ 
            position: 'fixed', 
            bottom: 20, 
            left: 20, 
            right: 20, 
            maxWidth: 600, 
            mx: 'auto',
            boxShadow: 3,
          }}
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          severity="success"
          sx={{ 
            position: 'fixed', 
            bottom: 20, 
            left: 20, 
            right: 20, 
            maxWidth: 600, 
            mx: 'auto',
            boxShadow: 3,
          }}
          onClose={() => setSuccess(null)}
        >
          {success}
        </Alert>
      )}
    </Container>
  );
};

export default IAScriptStudio;