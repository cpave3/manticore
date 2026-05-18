import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3456',
      '/v1': 'http://localhost:3456',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
