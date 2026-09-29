import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // React отдельно: меняется редко, остаётся в кеше Telegram между обновлениями игры
    rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined) } },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
});
