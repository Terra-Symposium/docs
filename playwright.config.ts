import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  use: { baseURL: 'http://127.0.0.1:4335', browserName: 'chromium' },
  projects: [
    {
      name: 'chromium-mobile',
      grep: /@viewport:mobile\b/,
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: 'chromium-md',
      grep: /@viewport:md\b/,
      use: { viewport: { width: 768, height: 900 } },
    },
    {
      name: 'chromium-xl',
      grep: /@viewport:xl\b/,
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: {
    command:
      'pnpm docs:build && python3 -m http.server 4335 --bind 127.0.0.1 --directory site-dist',
    url: 'http://127.0.0.1:4335/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
