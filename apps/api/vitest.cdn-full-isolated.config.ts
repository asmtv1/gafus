/** Real provider isolated CDN acceptance; no default queues/Redis security mocks. */
import base from './vitest.config';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  ...(base as Record<string,unknown>),
  test: {
    ...(base.test ?? {}),
    setupFiles: [],
    include: ['src/test/agent2-cdn-full-isolated.actor-access.test.ts'],
    exclude: [],
    maxWorkers: 1, fileParallelism:false, testTimeout: 25000, hookTimeout:45000,
  },
});
