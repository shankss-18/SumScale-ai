import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ---------------------------------------------------------------------------
// Backend API URL — read from env at build time.
// In dev: set VITE_API_BASE_URL in frontend/.env (not committed).
// Default falls back to local backend port.
// ---------------------------------------------------------------------------
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  // Dev server configuration
  server: {
    port: 5173,
    strictPort: true,   // Fail if port is in use — matches FRONTEND_URL env var exactly

    // Proxy API calls to the FastAPI backend during development.
    // This avoids CORS preflight for local dev while keeping the CORS config strict.
    proxy: {
      '/api': {
        target: API_BASE_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: false,
      },
    },
  },

  // Optimise dependency pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'axios', 'i18next', 'react-i18next'],
  },
});
