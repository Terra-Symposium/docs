import { defineConfig } from '@playwright/test';
import { withResponsivePlaywright } from '@terra-symposium/standards-reporting/viewports';

export default withResponsivePlaywright(
  defineConfig({
    testDir: './test/browser',
    use: { baseURL: 'http://127.0.0.1:4335', browserName: 'chromium' },
    projects: [{ name: 'chromium' }],
    webServer: {
      command:
        'pnpm docs:build && python3 -m http.server 4335 --bind 127.0.0.1 --directory site-dist',
      url: 'http://127.0.0.1:4335/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  }),
  {
    viewportPolicy: 'declared',
    viewportCatalog: {
      mobile: { width: 390, height: 844 },
      md: { width: 768, height: 900 },
      xl: { width: 1280, height: 720 },
    },
    screenshotsDirectory: 'test-results/visual/screenshots',
    screenshotOnlySlideshow: true,
  },
);
