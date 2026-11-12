import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiTarget = process.env['API_URL'] ?? 'http://127.0.0.1:3000';
// Host не подменяется: backend сверяет Origin изменяющих запросов с адресом сайта (защита от CSRF, S-007).
const apiProxy = { '/api': { target: apiTarget, changeOrigin: false, xfwd: true } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: apiProxy,
  },
  preview: { host: '127.0.0.1', port: 4173, proxy: apiProxy },
  build: { sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    css: false,
  },
});
