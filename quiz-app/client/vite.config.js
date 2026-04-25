import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // base is always '/' — the app is deployed at the root of its Vercel domain.
  // VITE_BASE_PATH can be set to a sub-path (e.g. '/quiz-app/') if the app is
  // ever moved to a path-prefixed deployment, but defaults to '/' for Vercel.
  base: process.env.VITE_BASE_PATH ?? '/',

  plugins: [react()],

  resolve: {
    // Prevent duplicate React instances when multiple packages depend on it
    dedupe: ['react', 'react-dom'],
  },

  server: {
    // Dev proxy: forwards /api/* to the local Express server on port 3001.
    // This makes fetch('/api/questions') work identically in dev and production.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
