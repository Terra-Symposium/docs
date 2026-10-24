import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  use: { baseURL: 'http://127.0.0.1:4335', browserName: 'chromium' },
  webServer: {
    command: 'python3 -m http.server 4335 --bind 127.0.0.1 --directory site-dist',
    url: 'http://127.0.0.1:4335/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
