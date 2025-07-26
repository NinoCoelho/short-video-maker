import React from 'react';
import {
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Box,
  Checkbox,
  Tooltip,
  CircularProgress,
  Chip,
  alpha,
  LinearProgress,
} from '@mui/material';
import {
  InsertDriveFile as FileIcon,
  Delete as DeleteIcon,
  CloudUpload as UploadIcon,
  Description as TextIcon,
  Code as CodeIcon,
  Article as ArticleIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UploadedFile } from '../../../types/iaScript';

interface FilePanelProps {
  files: UploadedFile[];
  selectedFiles: string[];
  onFilesChange: (fileIds: string[]) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  uploadingFile: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  uploadProgress?: number;
}

const FilePanel: React.FC<FilePanelProps> = ({
  files,
  selectedFiles,
  onFilesChange,
  onFileUpload,
  uploadingFile,
  fileInputRef,
  uploadProgress = 0,
}) => {
  const handleToggleFile = (fileId: string) => {
    if (selectedFiles.includes(fileId)) {
      onFilesChange(selectedFiles.filter(id => id !== fileId));
    } else {
      onFilesChange([...selectedFiles, fileId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      onFilesChange([]);
    } else {
      onFilesChange(files.map(f => f.id));
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('json')) return <CodeIcon />;
    if (mimeType.includes('markdown')) return <ArticleIcon />;
    if (mimeType.includes('csv')) return <TextIcon />;
    return <FileIcon />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Paper
      elevation={3}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" gutterBottom>
          Arquivos
        </Typography>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.csv,.json"
          onChange={onFileUpload}
          style={{ display: 'none' }}
        />
        
        <Button
          fullWidth
          variant="outlined"
          startIcon={uploadingFile ? <CircularProgress size={20} /> : <UploadIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
        >
          {uploadingFile ? `Enviando... ${uploadProgress}%` : 'Enviar Arquivo'}
        </Button>
        
        {uploadingFile && uploadProgress > 0 && (
          <LinearProgress 
            variant="determinate" 
            value={uploadProgress} 
            sx={{ mt: 1 }}
          />
        )}

        {files.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              {files.length} arquivo(s)
            </Typography>
            <Button
              size="small"
              onClick={handleSelectAll}
            >
              {selectedFiles.length === files.length ? 'Desmarcar' : 'Selecionar'} todos
            </Button>
          </Box>
        )}
      </Box>

      <List sx={{ flex: 1, overflow: 'auto' }}>
        {files.map((file) => {
          const isSelected = selectedFiles.includes(file.id);
          
          return (
            <ListItem
              key={file.id}
              button
              onClick={() => handleToggleFile(file.id)}
              sx={{
                bgcolor: isSelected ? alpha('#primary.main', 0.08) : 'transparent',
                '&:hover': {
                  bgcolor: isSelected ? alpha('#primary.main', 0.12) : 'action.hover',
                },
              }}
            >
              <ListItemIcon>
                <Checkbox
                  edge="start"
                  checked={isSelected}
                  tabIndex={-1}
                  disableRipple
                />
              </ListItemIcon>
              
              <ListItemIcon sx={{ minWidth: 40 }}>
                {getFileIcon(file.mimeType)}
              </ListItemIcon>
              
              <ListItemText
                primary={
                  <Typography variant="body2" noWrap>
                    {file.originalName}
                  </Typography>
                }
                secondary={
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(file.sizeBytes)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mx: 1 }}>
                      •
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {file.metadata.lineCount} linhas
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {format(new Date(file.createdAt), "dd 'de' MMM", { locale: ptBR })}
                    </Typography>
                  </Box>
                }
              />
            </ListItem>
          );
        })}
      </List>

      {files.length === 0 && (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            color: 'text.secondary',
          }}
        >
          <FileIcon sx={{ fontSize: 48, mb: 2, opacity: 0.3 }} />
          <Typography variant="body2" align="center">
            Nenhum arquivo enviado ainda.
            Clique no botão acima para adicionar.
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default FilePanel;