import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.VERCEL ? '/' : './',
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Proxy /api and /ws → Express backend so REST and WebSocket Control Plane work seamlessly.
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
