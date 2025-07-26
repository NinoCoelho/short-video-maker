import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Avatar,
  Divider,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  CardActions,
  Tooltip,
  Badge,
  LinearProgress,
  Fab,
  Menu,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Send as SendIcon,
  SmartToy as AIIcon,
  Person as PersonIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  PlayArrow as PlayIcon,
  VideoCall as VideoCallIcon,
  Settings as SettingsIcon,
  Code as CodeIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Psychology as PsychologyIcon,
  ViewModule as TemplateIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useVideoStatus } from '../hooks/useVideoStatus';
import {
  ScriptSession,
  ScriptTemplate,
  ChatMessage,
  PlaceholderDefinition,
  SendChatMessageRequest,
} from '../../types/iaScript';
import { RenderConfig, VoiceEnum, OrientationEnum, MusicMood } from '../../types/shorts';

// Sub-components
import ConfigPanel from '../components/ia-script/ConfigPanel';
import PlaceholderInput from '../components/ia-script/PlaceholderInput';
import TemplateManager from '../components/ia-script/TemplateManager';

// Create axios instance with correct backend URL
const api = axios.create({
  baseURL: 'http://localhost:3233',
  headers: {
    'Content-Type': 'application/json',
  },
});

const IAScriptStudio: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Main state
  const [session, setSession] = useState<ScriptSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Progress states
  const [generationStep, setGenerationStep] = useState<string>('');
  const [renderProgress, setRenderProgress] = useState<number>(0);
  
  // Video rendering states
  const [renderingVideoId, setRenderingVideoId] = useState<string | null>(null);
  const [completedVideoId, setCompletedVideoId] = useState<string | null>(null);
  
  // WebSocket for video status updates
  const { status: videoStatus, subscribe, unsubscribe, isConnected } = useVideoStatus();
  
  // Debug WebSocket connection
  useEffect(() => {
    console.log('WebSocket connection status:', isConnected);
    if (videoStatus) {
      console.log('Video status update:', videoStatus);
    }
  }, [isConnected, videoStatus]);

  // Removed file management - files no longer supported

  // Template management
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ScriptTemplate | null>(null);

  // Placeholder management
  const [placeholders, setPlaceholders] = useState<PlaceholderDefinition[]>([]);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});

  // Video configuration
  const [videoConfig, setVideoConfig] = useState<RenderConfig>({
    voice: VoiceEnum.Paulo,
    orientation: OrientationEnum.portrait,
    language: 'pt',
    music: 'happy',
    captionPosition: 'bottom',
    captionBackgroundColor: '#000000',
    captionTextColor: '#ffffff',
    paddingBack: 3000,
    captionsEnabled: true, // Always enable captions for IA Script
    overlay: '', // Will be set from ConfigPanel
    hook: '', // Will be set to script title when generated
    musicVolume: 'medium',
  });

  // UI state
  const [showConfigPanel, setShowConfigPanel] = useState(true);
  const [showScriptReview, setShowScriptReview] = useState(false);
  const [reviewingScript, setReviewingScript] = useState<any>(null);

  // Initialize session on mount
  useEffect(() => {
    initializeSession();
    loadTemplates();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Monitor video rendering progress and add updates to chat
  useEffect(() => {
    if (!videoStatus || !renderingVideoId || videoStatus.id !== renderingVideoId) return;

    const addProgressMessage = (content: string, isComplete: boolean = false) => {
      const progressMessage: ChatMessage = {
        id: `progress-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: new Date(),
        metadata: {
          isProgress: true,
          videoId: renderingVideoId,
          isComplete
        }
      };

      setMessages(prev => {
        // Remove previous progress messages for this video
        const filtered = prev.filter(msg => 
          !(msg.metadata?.isProgress && msg.metadata?.videoId === renderingVideoId && !msg.metadata?.isComplete)
        );
        return [...filtered, progressMessage];
      });
    };

    switch (videoStatus.status) {
      case 'processing':
        const progressPercent = Math.round(videoStatus.progress || 0);
        const stage = videoStatus.stage || 'Processando';
        addProgressMessage(
          `🎬 **Renderizando vídeo** (${progressPercent}%)\n\n` +
          `📍 **Status**: ${stage}\n` +
          `${videoStatus.message ? `💬 ${videoStatus.message}\n` : ''}` +
          `⏰ Aguarde enquanto criamos seu vídeo...`
        );
        break;

      case 'completed':
        addProgressMessage(
          `✅ **Vídeo renderizado com sucesso!**\n\n` +
          `🎯 **ID do vídeo**: ${renderingVideoId}\n` +
          `📺 Seu vídeo está pronto para visualização\n\n` +
          `💡 **Próximos passos:**\n` +
          `• Visualize o resultado abaixo\n` +
          `• Faça ajustes se necessário\n` +
          `• Ou continue editando no chat`,
          true
        );
        setCompletedVideoId(renderingVideoId);
        setRenderingVideoId(null);
        unsubscribe(renderingVideoId);
        break;

      case 'failed':
        addProgressMessage(
          `❌ **Erro na renderização**\n\n` +
          `🚫 **Erro**: ${videoStatus.error || 'Erro desconhecido'}\n` +
          `💡 Tente renderizar novamente ou faça ajustes no script`,
          true
        );
        setRenderingVideoId(null);
        unsubscribe(renderingVideoId);
        break;
    }
  }, [videoStatus, renderingVideoId, subscribe, unsubscribe]);

  const initializeSession = async () => {
    try {
      const response = await api.post('/api/ia-script/sessions', {
        config: videoConfig,
      });
      const sessionData = response.data.data?.session || response.data.session || response.data;
      console.log('Session response:', response.data);
      console.log('Session data:', sessionData);
      setSession(sessionData);
      setMessages(sessionData.conversationHistory || []);
    } catch (err: any) {
      console.error('Failed to create session:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Falha ao iniciar sessão';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    }
  };


  const loadTemplates = async () => {
    try {
      const response = await api.get('/api/ia-script/templates');
      setTemplates(response.data.templates || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };


  const handleSendMessage = async () => {
    if (!inputText.trim() || !session || isGenerating) return;
    
    if (!session.id) {
      console.error('Session ID is missing:', session);
      setError('Sessão não inicializada corretamente. Por favor, recarregue a página.');
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: new Date(),
      metadata: {
        placeholdersResolved: placeholderValues,
      },
    };

    setMessages([...messages, userMessage]);
    setInputText('');
    setIsGenerating(true);
    setError(null);
    setGenerationStep('Processando prompt...');

    try {
      // Build context-aware prompt with current script and conversation history
      let contextualContent = inputText;
      
      // Add script context and conversation history if available
      if (session.currentScript) {
        // Build conversation history context
        const conversationHistory = messages
          .filter(msg => msg.role === 'user' && !msg.metadata?.isProgress)
          .map((msg, index) => `${index + 1}. ${msg.content}`)
          .join('\n');

        const scriptContext = `CONTEXTO COMPLETO DA CONVERSA:

HISTÓRICO DE SOLICITAÇÕES:
${conversationHistory}

SCRIPT ATUAL:
Título: ${session.currentScript.title}
Descrição: ${session.currentScript.description || 'N/A'}
Total de cenas: ${session.currentScript.metadata.totalScenes}
Duração estimada: ${session.currentScript.metadata.estimatedDuration}s

CENAS ATUAIS:
${session.currentScript.scenes.map((scene, index) => 
  `Cena ${index + 1}: (${scene.duration}) ${scene.text}
  Visual: ${scene.visualSuggestion || 'N/A'}
  Palavras-chave: ${scene.searchKeywords?.join(', ') || 'N/A'}`
).join('\n\n')}

---

NOVA SOLICITAÇÃO:
${inputText}

INSTRUÇÕES:
- Considere todo o contexto da conversa anterior
- Mantenha a estrutura do script atual se for uma modificação
- Se for uma alteração específica, ajuste apenas o que foi solicitado
- Se for um novo script, ignore o contexto anterior
- Sempre retorne o script completo atualizado`;
        
        contextualContent = scriptContext;
      }

      const request: SendChatMessageRequest = {
        content: contextualContent,
        placeholderValues,
      };

      // Simulate progress steps
      const progressSteps = [
        { delay: 500, step: 'Analisando contexto...' },
        { delay: 1500, step: 'Gerando estrutura do script...' },
        { delay: 2500, step: 'Criando cenas...' },
        { delay: 3500, step: 'Otimizando roteiro...' },
      ];

      // Start progress simulation
      progressSteps.forEach(({ delay, step }) => {
        setTimeout(() => {
          if (isGenerating) {
            setGenerationStep(step);
          }
        }, delay);
      });

      const response = await api.post(
        `/api/ia-script/sessions/${session.id}/chat`,
        request
      );

      const responseData = response.data.data || response.data;
      const { script, message: assistantMessage } = responseData;

      setMessages(prev => [...prev, assistantMessage]);
      
      if (script) {
        setSession(prev => prev ? { ...prev, currentScript: script } : null);
        // Automatically set the hook to the script title
        setVideoConfig(prev => ({ ...prev, hook: script.title || 'Meu Vídeo' }));
        setSuccess('Script gerado com sucesso!');
      }
    } catch (err: any) {
      let errorMessage = 'Ocorreu um erro ao gerar o script.';
      
      // Extract error message from different possible formats
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.response?.data?.details) {
        errorMessage = err.response.data.details;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      // Add recovery suggestions based on error type
      if (err.response?.status === 500 || errorMessage.includes('Script generation failed')) {
        errorMessage = '😔 Não foi possível gerar o script. Tente novamente ou simplifique seu prompt.';
      } else if (err.response?.status === 429) {
        errorMessage = '⏱️ Muitas requisições! Aguarde alguns segundos antes de tentar novamente.';
      } else if (err.response?.status === 401) {
        errorMessage = '🔑 Erro de autenticação. Verifique as configurações da API.';
      } else if (!navigator.onLine) {
        errorMessage = '📡 Sem conexão com a internet. Verifique sua conexão e tente novamente.';
      }
      
      setError(errorMessage);
      
      // Add error message to chat
      const errorAssistantMessage: ChatMessage = {
        id: Date.now().toString() + '-error',
        role: 'assistant',
        content: `❌ ${errorMessage}\n\n💡 Dica: Tente ser mais específico no seu prompt ou verifique se todos os serviços estão funcionando corretamente.`,
        timestamp: new Date(),
        metadata: {
          isError: true,
          canRetry: true,
          originalPrompt: inputText
        }
      };
      setMessages(prev => [...prev, errorAssistantMessage]);
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const handleTemplateSelect = async (template: ScriptTemplate) => {
    setSuccess(`Carregando template "${template.name}"...`);
    try {
      const response = await api.post(`/api/ia-script/templates/${template.id}/use`, {
        config: videoConfig,
      });

      setSession(response.data.session);
      setMessages([]);
      setInputText(template.promptTemplate);
      setPlaceholders(template.placeholders);
      setVideoConfig({ ...videoConfig, ...template.defaultConfig });
      
      // File associations removed
      
      setShowTemplateDialog(false);
      setSuccess(`Template "${template.name}" carregado com sucesso!`);
    } catch (err) {
      setError('Falha ao carregar template');
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!inputText.trim()) {
      setError('Digite um prompt antes de salvar como template');
      return;
    }

    setEditingTemplate({
      id: '',
      name: '',
      description: '',
      promptTemplate: inputText,
      placeholders: placeholders,
      defaultConfig: videoConfig,
      fileAssociations: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      isPublic: false,
    });
    setShowTemplateDialog(true);
  };

  const handleRenderVideo = async (immediate: boolean = false) => {
    if (!session?.currentScript) {
      setError('Nenhum script gerado ainda');
      return;
    }

    try {
      const response = await api.post(
        `/api/ia-script/sessions/${session.id}/render`,
        { 
          immediate: true, // Always render immediately in chat
          config: videoConfig // Pass current UI config for rendering
        }
      );

      const { videoId } = response.data;
      
      // Add initial rendering message to chat
      const renderMessage: ChatMessage = {
        id: `render-start-${Date.now()}`,
        role: 'assistant',
        content: `🚀 **Iniciando renderização do vídeo**\n\n` +
                `🎬 **ID do vídeo**: ${videoId}\n` +
                `⏱️ **Status**: Preparando renderização...\n\n` +
                `💫 Acompanhe o progresso em tempo real abaixo!`,
        timestamp: new Date(),
        metadata: {
          isProgress: true,
          videoId: videoId,
          isComplete: false
        }
      };

      setMessages(prev => [...prev, renderMessage]);
      
      // Start monitoring this video
      console.log('Starting to monitor video:', videoId);
      setRenderingVideoId(videoId);
      subscribe(videoId);
      
      setSuccess('Renderização iniciada! Acompanhe o progresso no chat.');
      
      // Also add debug logs to track subscription
      setTimeout(() => {
        console.log('Current renderingVideoId:', renderingVideoId);
        console.log('Current videoStatus:', videoStatus);
      }, 1000);
      
    } catch (err) {
      setError('Falha ao iniciar renderização do vídeo');
    }
  };

  return (
    <Container maxWidth={false} sx={{ height: '100vh', py: 0.5 }}>
      <Grid container spacing={2} sx={{ height: '100%' }}>
        {/* Center - Chat Interface */}
        <Grid item xs={12} md={showConfigPanel ? 9 : 12}>
          <Paper
            elevation={3}
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              bgcolor: theme.palette.background.default,
            }}
          >
            {/* Header */}
            <Box
              sx={{
                p: 1,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 56,
              }}
            >
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Templates">
                  <IconButton size="small" onClick={() => setShowTemplateDialog(true)}>
                    <Badge badgeContent={templates?.length || 0} color="primary">
                      <TemplateIcon />
                    </Badge>
                  </IconButton>
                </Tooltip>
                <Tooltip title="Salvar como Template">
                  <IconButton 
                    size="small" 
                    onClick={handleSaveAsTemplate}
                    disabled={!inputText.trim()}
                  >
                    <SaveIcon />
                  </IconButton>
                </Tooltip>
              </Box>
              
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title={showConfigPanel ? 'Ocultar configurações' : 'Mostrar configurações'}>
                  <IconButton size="small" onClick={() => setShowConfigPanel(!showConfigPanel)}>
                    <SettingsIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Messages */}
            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
                p: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                maxHeight: 'calc(100vh - 280px)',
              }}
            >
              {messages.map((message) => (
                <Box
                  key={message.id}
                  sx={{
                    display: 'flex',
                    gap: 2,
                    alignItems: 'flex-start',
                    flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                  }}
                >
                  <Avatar
                    sx={{
                      bgcolor: message.role === 'user' 
                        ? theme.palette.primary.main 
                        : theme.palette.secondary.main,
                    }}
                  >
                    {message.role === 'user' ? <PersonIcon /> : <AIIcon />}
                  </Avatar>
                  
                  <Paper
                    sx={{
                      p: 2,
                      maxWidth: '70%',
                      bgcolor: message.metadata?.isError
                        ? alpha(theme.palette.error.main, 0.1)
                        : message.role === 'user'
                        ? alpha(theme.palette.primary.main, 0.1)
                        : alpha(theme.palette.secondary.main, 0.1),
                      borderLeft: message.metadata?.isError ? `4px solid ${theme.palette.error.main}` : 'none',
                    }}
                  >
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {message.content}
                    </Typography>
                    
                    {/* Show review button if this message has a script */}
                    {message.metadata?.hasScript && message.metadata?.scriptData && (
                      <Box sx={{ mt: 2 }}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => {
                            setReviewingScript(message.metadata.scriptData);
                            setShowScriptReview(true);
                          }}
                          startIcon={<EditIcon />}
                          sx={{
                            background: 'linear-gradient(45deg, #6366f1, #8b5cf6)',
                            '&:hover': {
                              background: 'linear-gradient(45deg, #5b21b6, #7c3aed)',
                            }
                          }}
                        >
                          📋 Revisar Script
                        </Button>
                      </Box>
                    )}
                    
                    {/* Show video player if this is a completed video message */}
                    {message.metadata?.isComplete && message.metadata?.videoId && (
                      <Box sx={{ mt: 2 }}>
                        <Paper 
                          sx={{ 
                            p: 2, 
                            bgcolor: alpha(theme.palette.primary.main, 0.05),
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
                          }}
                        >
                          <Typography variant="h6" gutterBottom>
                            🎬 Visualização do Vídeo
                          </Typography>
                          <video
                            controls
                            style={{
                              width: '100%',
                              maxWidth: '400px',
                              height: 'auto',
                              borderRadius: '8px'
                            }}
                            src={`http://localhost:3233/api/video/${message.metadata.videoId}`}
                          >
                            Seu navegador não suporta vídeo HTML5.
                          </video>
                          <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => window.open(`http://localhost:3233/video/${message.metadata.videoId}`, '_blank')}
                              startIcon={<PlayIcon />}
                            >
                              Ver Detalhes
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = `http://localhost:3233/api/video/${message.metadata.videoId}`;
                                link.download = `video-${message.metadata.videoId}.mp4`;
                                link.click();
                              }}
                              startIcon={<PlayIcon />}
                            >
                              Download
                            </Button>
                          </Box>
                        </Paper>
                      </Box>
                    )}
                    
                    {message.metadata?.canRetry && (
                      <Box sx={{ mt: 2 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          onClick={() => {
                            setInputText(message.metadata.originalPrompt || '');
                            // Remove error message
                            setMessages(prev => prev.filter(m => m.id !== message.id));
                          }}
                          startIcon={<PlayIcon />}
                        >
                          Tentar Novamente
                        </Button>
                      </Box>
                    )}
                    
                    
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      {format(new Date(message.timestamp), 'HH:mm', { locale: ptBR })}
                    </Typography>
                  </Paper>
                </Box>
              ))}

              {isGenerating && (
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Avatar sx={{ bgcolor: theme.palette.secondary.main }}>
                    <AIIcon />
                  </Avatar>
                  <Paper 
                    sx={{ 
                      p: 2, 
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: 1,
                      minWidth: 300,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <CircularProgress size={20} />
                      <Typography variant="body2" fontWeight="medium">
                        Gerando script...
                      </Typography>
                    </Box>
                    {generationStep && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                        {generationStep}
                      </Typography>
                    )}
                  </Paper>
                </Box>
              )}

              <div ref={chatEndRef} />
            </Box>

            {/* Current Script Preview */}
            {session?.currentScript && (
              <Box
                sx={{
                  px: 1.5,
                  py: 0.75,
                  borderTop: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.success.main, 0.05),
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minHeight: 48,
                }}
              >
                <Box>
                  <Typography variant="body2" color="success.main" fontWeight="medium">
                    {session.currentScript.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {session.currentScript.metadata.totalScenes} cenas • 
                    ~{session.currentScript.metadata.estimatedDuration}s
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column', alignItems: 'flex-end' }}>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={renderProgress > 0 ? <CircularProgress size={16} color="inherit" /> : <VideoCallIcon />}
                    onClick={() => handleRenderVideo(true)}
                    color="success"
                    disabled={renderProgress > 0}
                  >
                    {renderProgress > 0 ? `Renderizando... ${renderProgress}%` : 'Renderizar'}
                  </Button>
                  {renderProgress > 0 && (
                    <LinearProgress
                      variant="determinate"
                      value={renderProgress}
                      sx={{ height: 4, borderRadius: 1, width: 120 }}
                    />
                  )}
                </Box>
              </Box>
            )}

            {/* Input Area */}
            <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
              <PlaceholderInput
                value={inputText}
                onChange={setInputText}
                placeholders={placeholders}
                onPlaceholdersChange={setPlaceholders}
                placeholderValues={placeholderValues}
                onPlaceholderValuesChange={setPlaceholderValues}
                files={[]}
                onSend={handleSendMessage}
                disabled={isGenerating || !session}
                placeholder={messages.length === 0 ? "Digite seu prompt aqui... Use {{nome}} para criar placeholders" : ""}
              />
              
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                <Button
                  variant="contained"
                  endIcon={<SendIcon />}
                  onClick={handleSendMessage}
                  disabled={!inputText.trim() || isGenerating || !session}
                >
                  Enviar
                </Button>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Right Panel - Configuration */}
        {showConfigPanel && (
          <Grid item xs={12} md={3}>
            <ConfigPanel
              config={videoConfig}
              onChange={setVideoConfig}
            />
          </Grid>
        )}
      </Grid>

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
          action={
            error.includes('API') ? (
              <Button 
                color="inherit" 
                size="small"
                onClick={() => navigate('/settings')}
              >
                Configurações
              </Button>
            ) : null
          }
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          severity="success"
          sx={{ position: 'fixed', bottom: 20, left: 20, right: 20, maxWidth: 600, mx: 'auto' }}
          onClose={() => setSuccess(null)}
        >
          {success}
        </Alert>
      )}

      {/* Template Dialog */}
      <TemplateManager
        open={showTemplateDialog}
        onClose={() => {
          setShowTemplateDialog(false);
          setEditingTemplate(null);
        }}
        templates={templates}
        editingTemplate={editingTemplate}
        onTemplateSelect={handleTemplateSelect}
        onTemplateUpdate={loadTemplates}
      />

      {/* Script Review Dialog */}
      <Dialog
        open={showScriptReview}
        onClose={() => setShowScriptReview(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6">📋 Revisão do Script</Typography>
        </DialogTitle>
        
        <DialogContent>
          {reviewingScript && (
            <Box sx={{ p: 2 }}>
              <Typography variant="h5" gutterBottom>
                {reviewingScript.title}
              </Typography>
              
              {reviewingScript.description && (
                <Typography variant="body1" paragraph>
                  {reviewingScript.description}
                </Typography>
              )}
              
              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                Cenas do Script
              </Typography>
              
              {reviewingScript.scenes && reviewingScript.scenes.map((scene: any, index: number) => (
                <Paper key={index} sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6">
                    Cena {scene.sceneNumber || index + 1}
                  </Typography>
                  <Typography variant="body1" paragraph>
                    {scene.text}
                  </Typography>
                  {scene.searchKeywords && scene.searchKeywords.length > 0 && (
                    <Box>
                      <Typography variant="caption">Palavras-chave:</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                        {scene.searchKeywords.map((keyword: string, keyIndex: number) => (
                          <Chip key={keyIndex} label={keyword} size="small" />
                        ))}
                      </Box>
                    </Box>
                  )}
                </Paper>
              ))}
            </Box>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={() => setShowScriptReview(false)}>
            Fechar
          </Button>
          <Button
            onClick={() => {
              setShowScriptReview(false);
              handleRenderVideo();
            }}
            variant="contained"
          >
            Renderizar Vídeo
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default IAScriptStudio;