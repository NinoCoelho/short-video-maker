import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Layout
import DashboardLayout from './components/DashboardLayout';

// Pages
import Dashboard from './pages/Dashboard';
import VideoStudio from './pages/VideoStudio';
import IAScriptStudio from './pages/IAScriptStudio';
import VideoLibrary from './pages/VideoLibrary';
import TTSStudio from './pages/TTSStudio';
import VideoEditor from './pages/VideoEditor';
import VideoDetails from './pages/VideoDetails';
import LibraryManager from './pages/LibraryManager';
import Settings from './pages/Settings';
import ApiDocumentation from './pages/ApiDocumentation';

// Create theme
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6366f1',
      light: '#8b5cf6',
      dark: '#4f46e5',
    },
    secondary: {
      main: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
    },
    background: {
      default: '#0f172a',
      paper: '#1e293b',
    },
    text: {
      primary: '#f8fafc',
      secondary: '#cbd5e1',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      fontSize: '2.5rem',
    },
    h2: {
      fontWeight: 600,
      fontSize: '2rem',
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.5rem',
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.25rem',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.125rem',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1rem',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
        },
      },
    },
  },
});

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <DashboardLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/studio" element={<VideoStudio />} />
              <Route path="/ia-script-studio" element={<IAScriptStudio />} />
              <Route path="/library" element={<VideoLibrary />} />
              <Route path="/tts" element={<TTSStudio />} />
              <Route path="/video/:id" element={<VideoDetails />} />
              <Route path="/edit/:id" element={<VideoEditor />} />
              <Route path="/library-manager" element={<LibraryManager />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/api-docs" element={<ApiDocumentation />} />
            </Routes>
          </DashboardLayout>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App; 