import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Build langsung ke folder yang disajikan backend (mode satu aplikasi).
    // Override saat build di Docker dengan: `vite build --outDir dist`.
    outDir: path.resolve(__dirname, '../rtrw-billing-backend/client'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      // Socket.IO transport path (namespace /monitoring tetap lewat sini).
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
