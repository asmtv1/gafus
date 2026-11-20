import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'training.complete.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: {
    headless: true,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [
    ['json', { outputFile: process.env.GAFUS_WEB_E2E_PLAYWRIGHT_REPORT || process.cwd() + '/.qa/testing/web-playwright-raw.json' }],
    ['list'],
  ],
  outputDir: process.env.GAFUS_WEB_E2E_PLAYWRIGHT_ARTIFACTS || process.cwd() + '/.qa/testing/web-playwright-artifacts',
});
