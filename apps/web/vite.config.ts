import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In dev the API runs on the host at :3000; in Docker, Nest serves this build directly.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
