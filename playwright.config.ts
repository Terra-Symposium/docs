import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  reporter: [
    [
      '@terra-symposium/standards-reporting/playwright',
      {
        projects: [
          {
            name: 'chromium',
            configuredFiles: ['test/browser/rich-blocks.spec.ts', 'test/browser/workspace.spec.ts'],
          },
        ],
      },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4335',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'chromium-xl',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } },
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
