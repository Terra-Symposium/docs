import { defineConfig } from '@playwright/test';

const port = Number(process.env.DOCS_PLAYWRIGHT_PORT ?? 4335);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './test/browser',
  use: { baseURL, browserName: 'chromium' },
  expect: {
    toHaveScreenshot: {
      pathTemplate: '{testDir}/{testFileName}-snapshots/{arg}{ext}',
    },
  },
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory site-dist`,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
