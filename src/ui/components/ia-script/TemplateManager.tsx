import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Chip,
  Grid,
  Card,
  CardContent,
  CardActions,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
  Tab,
  Tabs,
  CircularProgress,
  alpha,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  PlayArrow as PlayIcon,
  Save as SaveIcon,
  Public as PublicIcon,
  Lock as LockIcon,
  Star as StarIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import axios from 'axios';
import { ScriptTemplate, CreateTemplateRequest } from '../../../types/iaScript';

interface TemplateManagerProps {
  open: boolean;
  onClose: () => void;
  templates: ScriptTemplate[];
  editingTemplate: ScriptTemplate | null;
  onTemplateSelect: (template: ScriptTemplate) => void;
  onTemplateUpdate: () => void;
}

const TemplateManager: React.FC<TemplateManagerProps> = ({
  open,
  onClose,
  templates,
  editingTemplate,
  onTemplateSelect,
  onTemplateUpdate,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<Partial<CreateTemplateRequest>>({
    name: '',
    description: '',
    promptTemplate: '',
    isPublic: false,
  });

  React.useEffect(() => {
    if (editingTemplate) {
      setFormData({
        name: editingTemplate.name,
        description: editingTemplate.description,
        promptTemplate: editingTemplate.promptTemplate,
        isPublic: editingTemplate.isPublic,
      });
      setActiveTab(1); // Switch to create/edit tab
    }
  }, [editingTemplate]);

  const handleSaveTemplate = async () => {
    if (!formData.name || !formData.promptTemplate) {
      setError('Nome e prompt são obrigatórios');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingTemplate) {
        // Update existing template
        await axios.put(`/api/ia-script/templates/${editingTemplate.id}`, formData);
      } else {
        // Create new template
        const createRequest: CreateTemplateRequest = {
          name: formData.name!,
          description: formData.description,
          promptTemplate: formData.promptTemplate!,
          placeholders: editingTemplate?.placeholders || [],
          defaultConfig: editingTemplate?.defaultConfig || {},
          fileIds: editingTemplate?.fileAssociations || [],
          isPublic: formData.isPublic,
        };
        await axios.post('/api/ia-script/templates', createRequest);
      }
      
      onTemplateUpdate();
      setFormData({
        name: '',
        description: '',
        promptTemplate: '',
        isPublic: false,
      });
      setActiveTab(0);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Falha ao salvar template');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    setDeleting(templateId);
    try {
      await axios.delete(`/api/ia-script/templates/${templateId}`);
      onTemplateUpdate();
    } catch (err) {
      setError('Falha ao excluir template');
    } finally {
      setDeleting(null);
    }
  };

  const myTemplates = templates.filter(t => !t.isPublic);
  const publicTemplates = templates.filter(t => t.isPublic);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Gerenciar Templates</Typography>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab label="Meus Templates" />
            <Tab label={editingTemplate ? 'Editar Template' : 'Criar Template'} />
            <Tab label="Templates Públicos" />
          </Tabs>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* My Templates Tab */}
        {activeTab === 0 && (
          <Grid container spacing={2}>
            {myTemplates.length === 0 ? (
              <Grid item xs={12}>
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  <Typography variant="body1">
                    Você ainda não tem templates salvos.
                  </Typography>
                  <Button
                    variant="outlined"
                    sx={{ mt: 2 }}
                    onClick={() => setActiveTab(1)}
                  >
                    Criar Primeiro Template
                  </Button>
                </Box>
              </Grid>
            ) : (
              myTemplates.map((template) => (
                <Grid item xs={12} sm={6} key={template.id}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                        <Typography variant="h6" gutterBottom>
                          {template.name}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {template.usageCount > 0 && (
                            <Chip
                              size="small"
                              icon={<StarIcon />}
                              label={template.usageCount}
                              color="primary"
                            />
                          )}
                          {template.isPublic && (
                            <Chip
                              size="small"
                              icon={<PublicIcon />}
                              label="Público"
                              color="secondary"
                            />
                          )}
                        </Box>
                      </Box>
                      
                      {template.description && (
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {template.description}
                        </Typography>
                      )}
                      
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          Prompt:
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            bgcolor: alpha('#000', 0.05),
                            p: 1,
                            borderRadius: 1,
                            mt: 0.5,
                            maxHeight: 100,
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {template.promptTemplate}
                        </Typography>
                      </Box>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ScheduleIcon fontSize="small" color="action" />
                        <Typography variant="caption" color="text.secondary">
                          {format(new Date(template.createdAt), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                        </Typography>
                      </Box>
                    </CardContent>
                    
                    <CardActions>
                      <Button
                        size="small"
                        startIcon={<PlayIcon />}
                        onClick={() => onTemplateSelect(template)}
                      >
                        Usar
                      </Button>
                      <Button
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() => {
                          setFormData({
                            name: template.name,
                            description: template.description,
                            promptTemplate: template.promptTemplate,
                            isPublic: template.isPublic,
                          });
                          setActiveTab(1);
                        }}
                      >
                        Editar
                      </Button>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteTemplate(template.id)}
                        disabled={deleting === template.id}
                      >
                        {deleting === template.id ? (
                          <CircularProgress size={20} />
                        ) : (
                          <DeleteIcon />
                        )}
                      </IconButton>
                    </CardActions>
                  </Card>
                </Grid>
              ))
            )}
          </Grid>
        )}

        {/* Create/Edit Template Tab */}
        {activeTab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Nome do Template"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />
            
            <TextField
              label="Descrição"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
            
            <TextField
              label="Prompt Template"
              value={formData.promptTemplate}
              onChange={(e) => setFormData({ ...formData, promptTemplate: e.target.value })}
              fullWidth
              multiline
              rows={6}
              required
              helperText="Use {{nome}} para criar placeholders que serão substituídos pelo conteúdo dos arquivos"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={formData.isPublic}
                  onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                />
              }
              label="Tornar público (outros usuários poderão usar)"
            />
          </Box>
        )}

        {/* Public Templates Tab */}
        {activeTab === 2 && (
          <Grid container spacing={2}>
            {publicTemplates.length === 0 ? (
              <Grid item xs={12}>
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  <Typography variant="body1">
                    Nenhum template público disponível ainda.
                  </Typography>
                </Box>
              </Grid>
            ) : (
              publicTemplates.map((template) => (
                <Grid item xs={12} sm={6} key={template.id}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                        <Typography variant="h6" gutterBottom>
                          {template.name}
                        </Typography>
                        <Chip
                          size="small"
                          icon={<StarIcon />}
                          label={template.usageCount}
                          color="primary"
                        />
                      </Box>
                      
                      {template.description && (
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {template.description}
                        </Typography>
                      )}
                      
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          Prompt:
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            bgcolor: alpha('#000', 0.05),
                            p: 1,
                            borderRadius: 1,
                            mt: 0.5,
                            maxHeight: 100,
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {template.promptTemplate}
                        </Typography>
                      </Box>
                      
                      <Typography variant="caption" color="text.secondary">
                        Por {template.createdBy || 'Anônimo'}
                      </Typography>
                    </CardContent>
                    
                    <CardActions>
                      <Button
                        size="small"
                        startIcon={<PlayIcon />}
                        onClick={() => onTemplateSelect(template)}
                        variant="contained"
                      >
                        Usar Template
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))
            )}
          </Grid>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
        {activeTab === 1 && (
          <Button
            onClick={handleSaveTemplate}
            variant="contained"
            disabled={saving || !formData.name || !formData.promptTemplate}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            {saving ? 'Salvando...' : editingTemplate ? 'Atualizar' : 'Salvar'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default TemplateManager;