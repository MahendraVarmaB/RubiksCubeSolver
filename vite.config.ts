import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: '/RubiksCubeSolver/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  worker: {
    // Bundle worker as a module so it can use imports
    format: 'es',
  },
  optimizeDeps: {
    // Exclude solver files from pre-bundling (they are large and loaded lazily)
    exclude: ['./src/workers/solver-worker'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep solver code in its own chunk for lazy loading.
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/src/lib/solver/')) {
            return 'solver';
          }
        },
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
