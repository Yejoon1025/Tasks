import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // VITE_BASE_PATH is injected by GitHub Actions from a repo secret.
  // '/'           → username.github.io (root domain)
  // '/repo-name/' → username.github.io/repo-name (project page)
  // Unset locally → '/' keeps the dev server working normally.
  base: process.env.VITE_BASE_PATH ?? '/',

  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
