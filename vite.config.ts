import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __OCR_CODE_REVISION__: JSON.stringify(revision) },
  build: { rollupOptions: { input: { app: path.resolve(__dirname, 'index.html'), ocrCheck: path.resolve(__dirname, 'ocr-check.html') } } },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5174,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
  },
});
