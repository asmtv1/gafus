/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    include: [
      'characterization-tests/**/*.test.ts',
      'apps/web/src/**/*.{test,spec}.ts',
      'packages/**/*.test.ts'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.next',
      'coverage'
    ]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
      '@gafus/*': path.resolve(__dirname, 'packages/*')
    }
  }
});