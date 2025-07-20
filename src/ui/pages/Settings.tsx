import React, { useState, useEffect } from 'react';
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
  Switch,
  FormControlLabel,
  Divider,
  Alert,
  useTheme,
  alpha,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  ClearAll as ClearAllIcon,
  Block as BlockIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';

const Settings: React.FC = () => {
  const theme = useTheme();
  const [settings, setSettings] = useState({
    defaultVoice: 'Paulo',
    defaultLanguage: 'pt',
    defaultOrientation: 'portrait',
    defaultMusicVolume: 'medium',
    autoSave: true,
    notifications: true,
    darkMode: true,
    videoQuality: 'high',
  });
  const [negativeTerms, setNegativeTerms] = useState<string[]>([]);
  const [newTerm, setNewTerm] = useState('');
  const [showAddTermDialog, setShowAddTermDialog] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState({ size: 0, entries: 0 });
  const [showCacheDialog, setShowCacheDialog] = useState(false);

  useEffect(() => {
    // Load existing settings and negative terms
    const savedSettings = localStorage.getItem('userSettings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
    
    loadNegativeTerms();
    loadCacheStats();
  }, []);

  const loadNegativeTerms = async () => {
    try {
      const response = await fetch('/api/video-search/negative-terms');
      if (response.ok) {
        const terms = await response.json();
        setNegativeTerms(terms);
      }
    } catch (error) {
      console.error('Error loading negative terms:', error);
    }
  };

  const loadCacheStats = async () => {
    try {
      const response = await fetch('/api/video-search/cache-stats');
      if (response.ok) {
        const stats = await response.json();
        setCacheStats(stats);
      }
    } catch (error) {
      console.error('Error loading cache stats:', error);
    }
  };

  const handleSave = async () => {
    // Save to localStorage or API
    localStorage.setItem('userSettings', JSON.stringify(settings));
    
    // Save negative terms to backend
    try {
      await fetch('/api/video-search/negative-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: negativeTerms })
      });
      setSuccess('Configurações salvas com sucesso!');
    } catch (error) {
      setSuccess('Erro ao salvar configurações');
    }
    
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleAddTerm = async () => {
    if (newTerm.trim() && !negativeTerms.includes(newTerm.trim())) {
      const updatedTerms = [...negativeTerms, newTerm.trim()];
      setNegativeTerms(updatedTerms);
      setNewTerm('');
      setShowAddTermDialog(false);
      
      // Save immediately to backend
      try {
        await fetch('/api/video-search/negative-terms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ terms: updatedTerms })
        });
        setSuccess('Termo adicionado com sucesso!');
        setTimeout(() => setSuccess(null), 3000);
      } catch (error) {
        console.error('Error saving negative terms:', error);
        setSuccess('Erro ao salvar termo negativo');
        setTimeout(() => setSuccess(null), 3000);
      }
    }
  };

  const handleRemoveTerm = async (term: string) => {
    const updatedTerms = negativeTerms.filter(t => t !== term);
    setNegativeTerms(updatedTerms);
    
    // Save immediately to backend
    try {
      await fetch('/api/video-search/negative-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: updatedTerms })
      });
      setSuccess('Termo removido com sucesso!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error saving negative terms:', error);
      setSuccess('Erro ao remover termo negativo');
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleClearCache = async () => {
    try {
      await fetch('/api/video-search/clear-cache', { method: 'POST' });
      await loadCacheStats();
      setSuccess('Cache limpo com sucesso!');
      setShowCacheDialog(false);
    } catch (error) {
      setSuccess('Erro ao limpar cache');
    }
    setTimeout(() => setSuccess(null), 3000);
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          Configurações
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Personalize sua experiência
        </Typography>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card elevation={0} sx={{ border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                <BlockIcon sx={{ mr: 1 }} />
                Termos Negativos para Busca de Vídeos
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Adicione termos que devem ser evitados na busca de vídeos de fundo
              </Typography>
              
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {negativeTerms.map((term, index) => (
                  <Chip
                    key={index}
                    label={term}
                    onDelete={() => handleRemoveTerm(term)}
                    color="secondary"
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Box>
              
              <Button
                startIcon={<AddIcon />}
                onClick={() => setShowAddTermDialog(true)}
                variant="outlined"
                size="small"
              >
                Adicionar Termo
              </Button>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12}>
          <Card elevation={0} sx={{ border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                <StorageIcon sx={{ mr: 1 }} />
                Cache de Vídeos
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Gerencie o cache de vídeos de fundo baixados para os shorts
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Typography variant="body2">
                  Entradas no cache: <strong>{cacheStats.entries}</strong>
                </Typography>
                <Typography variant="body2">
                  Tamanho: <strong>{(cacheStats.size / 1024 / 1024).toFixed(2)} MB</strong>
                </Typography>
              </Box>
              
              <Button
                startIcon={<ClearAllIcon />}
                onClick={() => setShowCacheDialog(true)}
                variant="outlined"
                color="warning"
                size="small"
              >
                Limpar Cache
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                Padrões de Vídeo
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Voz Padrão</InputLabel>
                    <Select
                      value={settings.defaultVoice}
                      label="Voz Padrão"
                      onChange={(e) => setSettings({...settings, defaultVoice: e.target.value})}
                    >
                                             <MenuItem value="Paulo">Paulo</MenuItem>
                       <MenuItem value="Noel">Noel</MenuItem>
                       <MenuItem value="Scarlett">Scarlett</MenuItem>
                       <MenuItem value="NinoCoelho">NinoCoelho</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Idioma Padrão</InputLabel>
                    <Select
                      value={settings.defaultLanguage}
                      label="Idioma Padrão"
                      onChange={(e) => setSettings({...settings, defaultLanguage: e.target.value})}
                    >
                      <MenuItem value="pt">Português</MenuItem>
                      <MenuItem value="en">Inglês</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Orientação Padrão</InputLabel>
                    <Select
                      value={settings.defaultOrientation}
                      label="Orientação Padrão"
                      onChange={(e) => setSettings({...settings, defaultOrientation: e.target.value})}
                    >
                      <MenuItem value="portrait">Retrato (9:16)</MenuItem>
                      <MenuItem value="landscape">Paisagem (16:9)</MenuItem>
                      <MenuItem value="square">Quadrado (1:1)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                Preferências
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.autoSave}
                      onChange={(e) => setSettings({...settings, autoSave: e.target.checked})}
                    />
                  }
                  label="Salvamento Automático"
                />
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.notifications}
                      onChange={(e) => setSettings({...settings, notifications: e.target.checked})}
                    />
                  }
                  label="Notificações"
                />
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.darkMode}
                      onChange={(e) => setSettings({...settings, darkMode: e.target.checked})}
                    />
                  }
                  label="Modo Escuro"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          sx={{
            background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
          }}
        >
          Salvar Configurações
        </Button>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => setSettings({
            defaultVoice: 'Paulo',
            defaultLanguage: 'pt',
            defaultOrientation: 'portrait',
            defaultMusicVolume: 'medium',
            autoSave: true,
            notifications: true,
            darkMode: true,
            videoQuality: 'high',
          })}
        >
          Restaurar Padrões
        </Button>
      </Box>

      {/* Add Term Dialog */}
      <Dialog open={showAddTermDialog} onClose={() => setShowAddTermDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Adicionar Termo Negativo</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Termo"
            fullWidth
            variant="outlined"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTerm()}
            helperText="Digite um termo que deve ser evitado na busca de vídeos"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddTermDialog(false)}>Cancelar</Button>
          <Button onClick={handleAddTerm} variant="contained" disabled={!newTerm.trim()}>
            Adicionar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cache Clear Dialog */}
      <Dialog open={showCacheDialog} onClose={() => setShowCacheDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Limpar Cache de Vídeos</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Tem certeza que deseja limpar o cache de vídeos?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Esta ação irá remover {cacheStats.entries} vídeos ({(cacheStats.size / 1024 / 1024).toFixed(2)} MB) 
            do cache. Os vídeos precisarão ser baixados novamente quando utilizados.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCacheDialog(false)}>Cancelar</Button>
          <Button onClick={handleClearCache} variant="contained" color="warning">
            Limpar Cache
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings; 