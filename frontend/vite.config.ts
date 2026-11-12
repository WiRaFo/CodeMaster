import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { securityPlugin } from './build/security-plugin.ts';

const apiTarget = process.env['API_URL'] ?? 'http://127.0.0.1:3000';
// Host не подменяется: backend сверяет Origin изменяющих запросов с адресом сайта (защита от CSRF, S-007).
const apiProxy = { '/api': { target: apiTarget, changeOrigin: false, xfwd: true } };

const PREVIEW_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), payment=(), geolocation=(self)',
};

export default defineConfig({
  // SITE_URL (например https://archive.example.kz) нужен только для sitemap.xml; без него sitemap не создаётся.
  plugins: [react(), tailwindcss(), securityPlugin(process.env['SITE_URL'])],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: apiProxy,
  },
  // Заголовки, которые нельзя задать через <meta>: их же нужно включить на боевом веб-сервере (docs/deployment.md).
  preview: { host: '127.0.0.1', port: 4173, proxy: apiProxy, headers: PREVIEW_HEADERS },
  build: { sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    css: false,
  },
});
