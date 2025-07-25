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
  AttachFile as AttachFileIcon,
  SmartToy as AIIcon,
  Person as PersonIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  FolderOpen as FolderOpenIcon,
  PlayArrow as PlayIcon,
  VideoCall as VideoCallIcon,
  Settings as SettingsIcon,
  InsertDriveFile as FileIcon,
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
import {
  ScriptSession,
  ScriptTemplate,
  UploadedFile,
  ChatMessage,
  PlaceholderDefinition,
  SendChatMessageRequest,
} from '../../types/iaScript';
import { RenderConfig, VoiceEnum, OrientationEnum, MusicMood } from '../../types/shorts';

// Sub-components
import FilePanel from '../components/ia-script/FilePanel';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Main state
  const [session, setSession] = useState<ScriptSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // File management
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

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
  });

  // UI state
  const [showConfigPanel, setShowConfigPanel] = useState(true);
  const [showFilePanel, setShowFilePanel] = useState(true);

  // Initialize session on mount
  useEffect(() => {
    initializeSession();
    loadFiles();
    loadTemplates();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const loadFiles = async () => {
    try {
      const response = await api.get('/api/ia-script/files');
      setUploadedFiles(response.data.files || []);
    } catch (err) {
      console.error('Failed to load files:', err);
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/api/ia-script/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const uploadedFile = response.data.file;
      setUploadedFiles([uploadedFile, ...uploadedFiles]);
      setSuccess(`Arquivo "${uploadedFile.originalName}" carregado com sucesso!`);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Falha ao carregar arquivo';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
        filesUsed: selectedFiles,
        placeholdersResolved: placeholderValues,
      },
    };

    setMessages([...messages, userMessage]);
    setInputText('');
    setIsGenerating(true);
    setError(null);

    try {
      const request: SendChatMessageRequest = {
        content: inputText,
        fileIds: selectedFiles,
        placeholderValues,
      };

      const response = await api.post(
        `/api/ia-script/sessions/${session.id}/chat`,
        request
      );

      const responseData = response.data.data || response.data;
      const { script, message: assistantMessage } = responseData;

      setMessages(prev => [...prev, assistantMessage]);
      
      if (script) {
        setSession(prev => prev ? { ...prev, currentScript: script } : null);
        setSuccess('Script gerado com sucesso!');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Falha ao gerar script';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTemplateSelect = async (template: ScriptTemplate) => {
    try {
      const response = await api.post(`/api/ia-script/templates/${template.id}/use`, {
        config: videoConfig,
      });

      setSession(response.data.session);
      setMessages([]);
      setInputText(template.promptTemplate);
      setPlaceholders(template.placeholders);
      setVideoConfig({ ...videoConfig, ...template.defaultConfig });
      
      // Load associated files
      const associatedFiles = uploadedFiles?.filter(f => 
        template.fileAssociations.includes(f.id)
      );
      setSelectedFiles(associatedFiles?.map(f => f.id) || []);
      
      setShowTemplateDialog(false);
      setSuccess(`Template "${template.name}" carregado!`);
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
      fileAssociations: selectedFiles,
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
        { immediate }
      );

      const { videoId, redirectUrl } = response.data;
      
      if (immediate) {
        setSuccess('Vídeo enviado para renderização!');
        setTimeout(() => navigate('/dashboard'), 2000);
      } else {
        navigate(redirectUrl);
      }
    } catch (err) {
      setError('Falha ao criar vídeo');
    }
  };

  return (
    <Container maxWidth={false} sx={{ height: '100vh', py: 2 }}>
      <Grid container spacing={2} sx={{ height: '100%' }}>
        {/* Left Panel - Files */}
        {showFilePanel && (
          <Grid item xs={12} md={2.5}>
            <FilePanel
              files={uploadedFiles}
              selectedFiles={selectedFiles}
              onFilesChange={setSelectedFiles}
              onFileUpload={handleFileUpload}
              uploadingFile={uploadingFile}
              fileInputRef={fileInputRef}
            />
          </Grid>
        )}

        {/* Center - Chat Interface */}
        <Grid item xs={12} md={showFilePanel && showConfigPanel ? 7 : showFilePanel || showConfigPanel ? 9.5 : 12}>
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
                p: 2,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <PsychologyIcon sx={{ fontSize: 32, color: theme.palette.primary.main }} />
                <Typography variant="h5" fontWeight="bold">
                  IA Script Studio
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Templates">
                  <IconButton onClick={() => setShowTemplateDialog(true)}>
                    <Badge badgeContent={templates?.length || 0} color="primary">
                      <TemplateIcon />
                    </Badge>
                  </IconButton>
                </Tooltip>
                <Tooltip title={showFilePanel ? 'Ocultar arquivos' : 'Mostrar arquivos'}>
                  <IconButton onClick={() => setShowFilePanel(!showFilePanel)}>
                    <FolderOpenIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={showConfigPanel ? 'Ocultar configurações' : 'Mostrar configurações'}>
                  <IconButton onClick={() => setShowConfigPanel(!showConfigPanel)}>
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
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {messages.length === 0 && (
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    color: 'text.secondary',
                  }}
                >
                  <AIIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
                  <Typography variant="h6" gutterBottom>
                    Bem-vindo ao IA Script Studio
                  </Typography>
                  <Typography variant="body2" sx={{ maxWidth: 500 }}>
                    Crie scripts para seus vídeos usando inteligência artificial.
                    Faça upload de arquivos de texto para usar como fonte de conteúdo
                    e use placeholders para inserir partes específicas dos arquivos.
                  </Typography>
                </Box>
              )}

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
                      bgcolor: message.role === 'user'
                        ? alpha(theme.palette.primary.main, 0.1)
                        : alpha(theme.palette.secondary.main, 0.1),
                    }}
                  >
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {message.content}
                    </Typography>
                    
                    {message.metadata?.filesUsed && message.metadata.filesUsed.length > 0 && (
                      <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {message.metadata.filesUsed.map(fileId => {
                          const file = uploadedFiles?.find(f => f.id === fileId);
                          return file ? (
                            <Chip
                              key={fileId}
                              size="small"
                              icon={<FileIcon />}
                              label={file.originalName}
                              variant="outlined"
                            />
                          ) : null;
                        })}
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
                  <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2">Gerando script...</Typography>
                  </Paper>
                </Box>
              )}

              <div ref={chatEndRef} />
            </Box>

            {/* Current Script Preview */}
            {session?.currentScript && (
              <Box
                sx={{
                  p: 2,
                  borderTop: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.success.main, 0.05),
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" color="success.main">
                    Script Gerado: {session.currentScript.title}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PlayIcon />}
                      onClick={() => handleRenderVideo(false)}
                    >
                      Revisar no Studio
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<VideoCallIcon />}
                      onClick={() => handleRenderVideo(true)}
                      color="success"
                    >
                      Renderizar Agora
                    </Button>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {session.currentScript.metadata.totalScenes} cenas • 
                  ~{session.currentScript.metadata.estimatedDuration}s • 
                  {session.currentScript.metadata.aiProvider}
                </Typography>
              </Box>
            )}

            {/* Input Area */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
              <PlaceholderInput
                value={inputText}
                onChange={setInputText}
                placeholders={placeholders}
                onPlaceholdersChange={setPlaceholders}
                placeholderValues={placeholderValues}
                onPlaceholderValuesChange={setPlaceholderValues}
                files={uploadedFiles?.filter(f => selectedFiles.includes(f.id)) || []}
                onSend={handleSendMessage}
                disabled={isGenerating || !session}
              />
              
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Anexar arquivo">
                    <IconButton
                      size="small"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFile}
                    >
                      <AttachFileIcon />
                    </IconButton>
                  </Tooltip>
                  
                  {selectedFiles.length > 0 && (
                    <Chip
                      size="small"
                      label={`${selectedFiles.length} arquivo(s) selecionado(s)`}
                      onDelete={() => setSelectedFiles([])}
                    />
                  )}
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleSaveAsTemplate}
                    disabled={!inputText.trim()}
                  >
                    Salvar Template
                  </Button>
                  
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
            </Box>
          </Paper>
        </Grid>

        {/* Right Panel - Configuration */}
        {showConfigPanel && (
          <Grid item xs={12} md={2.5}>
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
          sx={{ position: 'fixed', bottom: 20, left: 20, right: 20, maxWidth: 600, mx: 'auto' }}
          onClose={() => setError(null)}
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
    </Container>
  );
};

export default IAScriptStudio;