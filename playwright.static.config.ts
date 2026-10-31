import { defineConfig } from '@playwright/test';
const port = Number(process.env.DOCS_PLAYWRIGHT_PORT ?? 4335);
export default defineConfig({
  testDir: './test/browser',
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium' },
  expect: { toHaveScreenshot: { pathTemplate: '{testDir}/{testFileName}-snapshots/{arg}{ext}' } },
});
