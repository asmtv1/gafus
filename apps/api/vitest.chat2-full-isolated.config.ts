/** Dedicated real-provider test; never inherits default mock setup. */
import base from './vitest.config';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  ...(base as Record<string, unknown>),
  test: {
    ...(base.test ?? {}),
    setupFiles: [],
    include: ['src/modules/chat2/chat2.full-isolated.http.test.ts'],
    exclude: [],
    testTimeout: 25000,
    hookTimeout: 45000,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
