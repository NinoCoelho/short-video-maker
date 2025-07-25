import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import {
  RecordVoiceOver as TTSIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import axios from 'axios';

interface GeneratedAudio {
  id: string;
  text: string;
  filename: string;
  duration: number;
  voice: string;
  language: string;
  createdAt: Date;
}

const TTSStudio: React.FC = () => {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('Paulo');
  const [language, setLanguage] = useState('pt');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generatedAudios, setGeneratedAudios] = useState<GeneratedAudio[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingFilename, setCurrentPlayingFilename] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const handleGenerateAudio = async () => {
    if (!text.trim()) {
      setError('Por favor, insira um texto para gerar o áudio.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await axios.post('/api/generate-tts', {
        text: text.trim(),
        voice,
        language
      });

      const audioData = response.data.data || response.data;
      const newAudio: GeneratedAudio = {
        id: Date.now().toString(),
        text: text.trim(),
        filename: audioData.filename,
        duration: audioData.duration,
        voice,
        language,
        createdAt: new Date()
      };

      setGeneratedAudios(prev => [newAudio, ...prev]);
      setSuccess('Áudio gerado com sucesso!');
      setText('');
    } catch (err) {
      console.error('Erro ao gerar áudio:', err);
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Erro ao gerar áudio');
      } else {
        setError('Erro inesperado ao gerar áudio');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAudio = (filename: string) => {
    if (audioPlayerRef.current) {
      const player = audioPlayerRef.current;
      
      if (isPlaying && currentPlayingFilename === filename) {
        player.pause();
        player.currentTime = 0;
        setIsPlaying(false);
        setCurrentPlayingFilename(null);
        return;
      }
      
      if (isPlaying) {
        player.pause();
        player.currentTime = 0;
      }
      
      player.src = `/api/temp/${filename}`;
      setCurrentPlayingFilename(filename);
      setIsPlaying(true);
      
      player.play()
        .then(() => {
          player.onended = () => {
            setIsPlaying(false);
            setCurrentPlayingFilename(null);
          };
        })
        .catch(e => {
          console.error("Erro ao reproduzir áudio:", e);
          setIsPlaying(false);
          setCurrentPlayingFilename(null);
        });
    }
  };

  const handleDeleteAudio = (id: string) => {
    setGeneratedAudios(prev => prev.filter(audio => audio.id !== id));
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Box>
      <audio ref={audioPlayerRef} hidden />
      
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          TTS Studio
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Gere áudio de alta qualidade a partir de texto
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Card elevation={0} sx={{ border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                Geração de Áudio
              </Typography>
              
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    label="Texto para gerar áudio"
                    variant="outlined"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Digite o texto que deseja converter em áudio..."
                    disabled={loading}
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Idioma</InputLabel>
                    <Select
                      value={language}
                      label="Idioma"
                      onChange={(e) => setLanguage(e.target.value)}
                      disabled={loading}
                    >
                      <MenuItem value="pt">Português</MenuItem>
                      <MenuItem value="en">Inglês</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Voz</InputLabel>
                    <Select
                      value={voice}
                      label="Voz"
                      onChange={(e) => setVoice(e.target.value)}
                      disabled={loading}
                    >
                      <MenuItem value="Paulo">Paulo</MenuItem>
                      <MenuItem value="Noel">Noel</MenuItem>
                      <MenuItem value="Scarlett">Scarlett</MenuItem>
                      <MenuItem value="NinoCoelho">NinoCoelho</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                

                
                <Grid item xs={12}>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleGenerateAudio}
                    disabled={loading || !text.trim()}
                    startIcon={loading ? <CircularProgress size={20} /> : <TTSIcon />}
                    sx={{
                      background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                      '&:hover': {
                        background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`,
                      },
                    }}
                  >
                    {loading ? 'Gerando...' : 'Gerar Áudio'}
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              background: `linear-gradient(145deg, ${theme.palette.background.paper}, ${alpha(theme.palette.primary.main, 0.05)})`,
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            }}
          >
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Áudios Gerados ({generatedAudios.length})
            </Typography>
            
            {generatedAudios.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                Nenhum áudio gerado ainda
              </Typography>
            ) : (
              <List>
                {generatedAudios.map((audio, index) => (
                  <React.Fragment key={audio.id}>
                    <ListItem sx={{ px: 0 }}>
                      <ListItemText
                        primary={
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {audio.text.substring(0, 50)}...
                          </Typography>
                        }
                        secondary={
                          <Box sx={{ mt: 1 }}>
                            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                              <Chip label={audio.voice} size="small" />
                              <Chip label={audio.language} size="small" />
                              <Chip label={formatDuration(audio.duration)} size="small" />
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {audio.createdAt.toLocaleString()}
                            </Typography>
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <IconButton
                            size="small"
                            onClick={() => handlePlayAudio(audio.filename)}
                            color={isPlaying && currentPlayingFilename === audio.filename ? "secondary" : "default"}
                          >
                            {isPlaying && currentPlayingFilename === audio.filename ? <StopIcon /> : <PlayIcon />}
                          </IconButton>
                          <IconButton
                            size="small"
                            component="a"
                            href={`/api/temp/${audio.filename}?download=true`}
                            download
                          >
                            <DownloadIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteAudio(audio.id)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </ListItemSecondaryAction>
                    </ListItem>
                    {index < generatedAudios.length - 1 && <Box sx={{ borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`, mx: -1 }} />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TTSStudio; 