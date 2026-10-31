import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/consumer-browser',
  testMatch: '**/*.spec.ts',
  workers: 1,
  use: {
    browserName: 'chromium',
    viewport: { width: 1987, height: 1248 },
  },
});
