import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Emitted next to the compiled server so `npm start` serves one origin.
    outDir: 'dist/public',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    // Dev-only: forwards API calls to the Express server so the key stays server-side.
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'shared/**/*.ts', 'server/**/*.ts'],
      exclude: ['src/main.tsx', 'src/test/**', '**/*.test.*'],
    },
  },
});
