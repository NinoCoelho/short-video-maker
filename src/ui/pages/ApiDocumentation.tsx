import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  useTheme,
  alpha,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';

const ApiDocumentation: React.FC = () => {
  const theme = useTheme();

  const endpoints = [
    {
      method: 'POST',
      path: '/api/render',
      description: 'Criar um novo vídeo',
      body: {
        scenes: 'Array de cenas com texto e termos de busca',
        config: 'Configurações de renderização'
      },
      response: { videoId: 'string' }
    },
    {
      method: 'GET',
      path: '/api/videos',
      description: 'Listar todos os vídeos',
      response: 'Array de vídeos'
    },
    {
      method: 'GET',
      path: '/api/status/:id',
      description: 'Obter status de um vídeo',
      response: { status: 'ready|processing|failed', progress: 'number' }
    },
    {
      method: 'DELETE',
      path: '/api/videos/:id',
      description: 'Deletar um vídeo',
      response: { success: 'boolean' }
    },
    {
      method: 'POST',
      path: '/api/generate-tts',
      description: 'Gerar áudio TTS',
      body: {
        text: 'Texto para conversão',
        voice: 'Voz selecionada',
        language: 'pt|en'
      },
      response: { filename: 'string', duration: 'number' }
    }
  ];

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return theme.palette.success.main;
      case 'POST': return theme.palette.primary.main;
      case 'DELETE': return theme.palette.error.main;
      case 'PUT': return theme.palette.warning.main;
      default: return theme.palette.grey[500];
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          Documentação da API
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Referência completa dos endpoints disponíveis
        </Typography>
      </Box>

      {/* Overview */}
      <Card elevation={0} sx={{ mb: 3, border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Visão Geral
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            A API do Short Video Maker permite criar e gerenciar vídeos curtos programaticamente.
            Todas as requisições devem incluir o header <code>Content-Type: application/json</code>.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Base URL: <code>http://localhost:3233</code>
          </Typography>
        </CardContent>
      </Card>

      {/* Endpoints */}
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Endpoints
      </Typography>

      {endpoints.map((endpoint, index) => (
        <Accordion
          key={index}
          sx={{
            mb: 2,
            '&:before': { display: 'none' },
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
              <Chip
                label={endpoint.method}
                size="small"
                sx={{
                  backgroundColor: alpha(getMethodColor(endpoint.method), 0.2),
                  color: getMethodColor(endpoint.method),
                  fontWeight: 600,
                  minWidth: 60,
                }}
              />
              <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                {endpoint.path}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                {endpoint.description}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={3}>
              {endpoint.body && (
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    Request Body
                  </Typography>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      backgroundColor: alpha(theme.palette.primary.main, 0.05),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                    }}
                  >
                    <pre style={{ margin: 0, fontSize: '0.875rem' }}>
                      {JSON.stringify(endpoint.body, null, 2)}
                    </pre>
                  </Paper>
                </Grid>
              )}
              <Grid item xs={12} md={endpoint.body ? 6 : 12}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Response
                </Typography>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    backgroundColor: alpha(theme.palette.success.main, 0.05),
                    border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
                  }}
                >
                  <pre style={{ margin: 0, fontSize: '0.875rem' }}>
                    {typeof endpoint.response === 'string' 
                      ? endpoint.response 
                      : JSON.stringify(endpoint.response, null, 2)
                    }
                  </pre>
                </Paper>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      ))}

      {/* MCP Documentation */}
      <Card elevation={0} sx={{ mt: 4, border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Model Context Protocol (MCP)
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            O servidor MCP está disponível para integração com ferramentas de IA:
          </Typography>
          <Box sx={{ ml: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              • <strong>Endpoint SSE:</strong> <code>/mcp/sse</code>
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              • <strong>Tools disponíveis:</strong> create-short-video, get-video-status
            </Typography>
            <Typography variant="body2">
              • <strong>Transporte:</strong> Server-Sent Events (SSE)
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ApiDocumentation; 