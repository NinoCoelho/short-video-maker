import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/ui',
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, 'dist/ui'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/ui/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/ui'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3232,
    allowedHosts: ['*', 'ninomac.bonito-halosaur.ts.net'],
    proxy: {
      '/api/proxy': {
        target: 'http://ninoserver1.bonito-halosaur.ts.net:8090',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/proxy/, ''),
      },
      '/api': {
        target: 'http://localhost:3233',
        changeOrigin: true,
      },
      '/mcp': {
        target: 'http://localhost:3233',
        changeOrigin: true,
      },
      '/pxv': {
        target: 'http://localhost:3233',
        changeOrigin: true,
      },
    },
  },
}); 