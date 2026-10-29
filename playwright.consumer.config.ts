import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/consumer-browser',
  testMatch: '**/*.spec.ts',
  workers: 1,
  projects: [
    {
      name: 'chromium-xl',
      grep: /@viewport:xl\b/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  use: {
    browserName: 'chromium',
    viewport: { width: 1987, height: 1248 },
  },
  webServer: {
    command:
      'pnpm docs:build && python3 -m http.server 4336 --bind 127.0.0.1 --directory site-dist',
    url: 'http://127.0.0.1:4336/workspace-demo/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
