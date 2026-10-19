import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Chromium понимает woff2 — запасной woff из пакетов шрифтов не нужен (минус ~13 МБ в установщике)
const woff2Only = {
  name: 'kadro-woff2-only',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.includes('@fontsource') || !id.endsWith('.css')) return null;
    return { code: code.replace(/,\s*url\([^)]*\.woff\)\s*format\('woff'\)/g, ''), map: null };
  },
};

export default defineConfig({
  root: path.join(__dirname, 'src/renderer'),
  base: './',
  plugins: [woff2Only, react()],
  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome130',
    sourcemap: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
