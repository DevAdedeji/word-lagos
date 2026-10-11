import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  server: {
    port: 43127,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:43128',
    },
  },
});
