import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  Tooltip,
  alpha,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  InsertDriveFile as FileIcon,
  Code as CodeIcon,
  Functions as FunctionsIcon,
  ContentCopy as CopyIcon,
  ContentPaste as PasteIcon,
} from '@mui/icons-material';
import { PlaceholderDefinition, PlaceholderType, UploadedFile } from '../../../types/iaScript';

interface PlaceholderInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholders: PlaceholderDefinition[];
  onPlaceholdersChange: (placeholders: PlaceholderDefinition[]) => void;
  placeholderValues: Record<string, string>;
  onPlaceholderValuesChange: (values: Record<string, string>) => void;
  files: UploadedFile[];
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const PlaceholderInput: React.FC<PlaceholderInputProps> = ({
  value,
  onChange,
  placeholders,
  onPlaceholdersChange,
  placeholderValues,
  onPlaceholderValuesChange,
  files,
  onSend,
  disabled,
  placeholder,
}) => {
  const textFieldRef = useRef<HTMLInputElement>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [editingPlaceholder, setEditingPlaceholder] = useState<PlaceholderDefinition | null>(null);
  const [showPlaceholderDialog, setShowPlaceholderDialog] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Placeholder form state
  const [placeholderForm, setPlaceholderForm] = useState({
    name: '',
    type: 'full_file' as PlaceholderType,
    fileId: '',
    lineStart: 1,
    lineEnd: 10,
    randomCount: 5,
  });

  useEffect(() => {
    // Extract placeholders from text and resolve their values
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = [...value.matchAll(regex)];
    const newValues: Record<string, string> = {};

    matches.forEach((match) => {
      const placeholderName = match[1];
      const placeholder = placeholders.find(p => p.name === placeholderName);
      
      if (placeholder && placeholder.fileId) {
        const file = files.find(f => f.id === placeholder.fileId);
        if (file) {
          newValues[placeholderName] = extractContent(file, placeholder);
        }
      }
    });

    onPlaceholderValuesChange(newValues);
  }, [value, placeholders, files]);

  const extractContent = (file: UploadedFile, placeholder: PlaceholderDefinition): string => {
    const lines = file.content.split('\n');
    
    switch (placeholder.type) {
      case 'full_file':
        return file.content;
      
      case 'partial_file':
        const start = (placeholder.config?.lineStart || 1) - 1;
        const end = placeholder.config?.lineEnd || lines.length;
        return lines.slice(start, end).join('\n');
      
      case 'random_lines':
        const count = placeholder.config?.randomCount || 5;
        const shuffled = [...lines].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count).join('\n');
      
      default:
        return file.content;
    }
  };

  const handleAddPlaceholder = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setCursorPosition(textFieldRef.current?.selectionStart || 0);
  };

  const handleInsertQuickPlaceholder = (type: string) => {
    const placeholder = `{{${type}}}`;
    const newValue = value.slice(0, cursorPosition) + placeholder + value.slice(cursorPosition);
    onChange(newValue);
    setAnchorEl(null);
  };

  const handleCreateCustomPlaceholder = () => {
    setAnchorEl(null);
    setPlaceholderForm({
      name: '',
      type: 'full_file',
      fileId: files[0]?.id || '',
      lineStart: 1,
      lineEnd: 10,
      randomCount: 5,
    });
    setEditingPlaceholder(null);
    setShowPlaceholderDialog(true);
  };

  const handleSavePlaceholder = () => {
    if (!placeholderForm.name || !placeholderForm.fileId) return;

    const newPlaceholder: PlaceholderDefinition = {
      id: Date.now().toString(),
      name: placeholderForm.name,
      type: placeholderForm.type,
      fileId: placeholderForm.fileId,
      config: {
        lineStart: placeholderForm.lineStart,
        lineEnd: placeholderForm.lineEnd,
        randomCount: placeholderForm.randomCount,
      },
    };

    if (editingPlaceholder) {
      onPlaceholdersChange(
        placeholders.map(p => p.id === editingPlaceholder.id ? newPlaceholder : p)
      );
    } else {
      onPlaceholdersChange([...placeholders, newPlaceholder]);
      // Insert into text
      const placeholder = `{{${newPlaceholder.name}}}`;
      const newValue = value.slice(0, cursorPosition) + placeholder + value.slice(cursorPosition);
      onChange(newValue);
    }

    setShowPlaceholderDialog(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <Box>
      <Box sx={{ position: 'relative' }}>
        <TextField
          ref={textFieldRef}
          fullWidth
          multiline
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder || "Digite seu prompt aqui... Use {{nome}} para criar placeholders"}
          disabled={disabled}
          sx={{
            '& .MuiOutlinedInput-root': {
              paddingBottom: 5,
            },
          }}
        />
        
        <Box
          sx={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          {placeholders.map((placeholder) => {
            const file = files.find(f => f.id === placeholder.fileId);
            return (
              <Chip
                key={placeholder.id}
                size="small"
                icon={<CodeIcon />}
                label={`{{${placeholder.name}}}`}
                onDelete={() => {
                  onPlaceholdersChange(placeholders.filter(p => p.id !== placeholder.id));
                }}
                onClick={() => {
                  setEditingPlaceholder(placeholder);
                  setPlaceholderForm({
                    name: placeholder.name,
                    type: placeholder.type,
                    fileId: placeholder.fileId || '',
                    lineStart: placeholder.config?.lineStart || 1,
                    lineEnd: placeholder.config?.lineEnd || 10,
                    randomCount: placeholder.config?.randomCount || 5,
                  });
                  setShowPlaceholderDialog(true);
                }}
                sx={{
                  bgcolor: alpha('#primary.main', 0.1),
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: alpha('#primary.main', 0.2),
                  },
                }}
              />
            );
          })}
          
          <Tooltip title="Adicionar placeholder">
            <IconButton size="small" onClick={handleAddPlaceholder}>
              <AddIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Quick Placeholder Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => handleInsertQuickPlaceholder('arquivo_completo')}>
          <ListItemIcon>
            <FileIcon />
          </ListItemIcon>
          <ListItemText primary="Arquivo Completo" />
        </MenuItem>
        <MenuItem onClick={() => handleInsertQuickPlaceholder('trecho')}>
          <ListItemIcon>
            <CopyIcon />
          </ListItemIcon>
          <ListItemText primary="Trecho do Arquivo" />
        </MenuItem>
        <MenuItem onClick={() => handleInsertQuickPlaceholder('linhas_aleatorias')}>
          <ListItemIcon>
            <FunctionsIcon />
          </ListItemIcon>
          <ListItemText primary="Linhas Aleatórias" />
        </MenuItem>
        <MenuItem onClick={handleCreateCustomPlaceholder}>
          <ListItemIcon>
            <EditIcon />
          </ListItemIcon>
          <ListItemText primary="Criar Personalizado..." />
        </MenuItem>
      </Menu>

      {/* Placeholder Configuration Dialog */}
      <Dialog
        open={showPlaceholderDialog}
        onClose={() => setShowPlaceholderDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingPlaceholder ? 'Editar Placeholder' : 'Criar Placeholder'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Nome do Placeholder"
              value={placeholderForm.name}
              onChange={(e) => setPlaceholderForm({ ...placeholderForm, name: e.target.value })}
              fullWidth
              helperText="Será usado como {{nome}}"
            />

            <FormControl fullWidth>
              <InputLabel>Arquivo</InputLabel>
              <Select
                value={placeholderForm.fileId}
                onChange={(e) => setPlaceholderForm({ ...placeholderForm, fileId: e.target.value })}
                label="Arquivo"
              >
                {files.map((file) => (
                  <MenuItem key={file.id} value={file.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FileIcon fontSize="small" />
                      {file.originalName}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Tipo de Extração</InputLabel>
              <Select
                value={placeholderForm.type}
                onChange={(e) => setPlaceholderForm({ ...placeholderForm, type: e.target.value as PlaceholderType })}
                label="Tipo de Extração"
              >
                <MenuItem value="full_file">Arquivo Completo</MenuItem>
                <MenuItem value="partial_file">Trecho do Arquivo</MenuItem>
                <MenuItem value="random_lines">Linhas Aleatórias</MenuItem>
              </Select>
            </FormControl>

            {placeholderForm.type === 'partial_file' && (
              <>
                <TextField
                  label="Linha Inicial"
                  type="number"
                  value={placeholderForm.lineStart}
                  onChange={(e) => setPlaceholderForm({ ...placeholderForm, lineStart: parseInt(e.target.value) || 1 })}
                  fullWidth
                />
                <TextField
                  label="Linha Final"
                  type="number"
                  value={placeholderForm.lineEnd}
                  onChange={(e) => setPlaceholderForm({ ...placeholderForm, lineEnd: parseInt(e.target.value) || 10 })}
                  fullWidth
                />
              </>
            )}

            {placeholderForm.type === 'random_lines' && (
              <TextField
                label="Número de Linhas"
                type="number"
                value={placeholderForm.randomCount}
                onChange={(e) => setPlaceholderForm({ ...placeholderForm, randomCount: parseInt(e.target.value) || 5 })}
                fullWidth
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPlaceholderDialog(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSavePlaceholder}
            variant="contained"
            disabled={!placeholderForm.name || !placeholderForm.fileId}
          >
            {editingPlaceholder ? 'Salvar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PlaceholderInput;