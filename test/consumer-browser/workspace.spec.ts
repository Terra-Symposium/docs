import { expect, test } from '@playwright/test';

const CONSUMER_VIEWPORT_TEST = {
  tag: '@viewport:consumer',
  annotation: {
    type: 'viewport-reason',
    description: 'The installed consumer contract uses its declared 1987×1248 desktop viewport.',
  },
} as const;

const consumerUrls = (process.env.DOCS_CONSUMER_URLS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const targetUrls = consumerUrls.length ? consumerUrls : ['http://127.0.0.1:4336/workspace-demo/'];

for (const targetUrl of targetUrls) {
  const label =
    targetUrl === 'http://127.0.0.1:4336/workspace-demo/'
      ? 'local packaged workspace'
      : new URL(targetUrl).host + new URL(targetUrl).pathname;
  test(
    `packaged Docs consumer mounts the public workspace with host-provided document data: ${label}`,
    CONSUMER_VIEWPORT_TEST,
    async ({ page }) => {
      expect(page.viewportSize()).toEqual({ width: 1987, height: 1248 });
      const browserErrors: string[] = [];
      page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400)
          browserErrors.push(`HTTP ${response.status()}: ${response.url()}`);
      });

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.terra-docs-workspace')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.terra-docs-document-header')).toBeVisible();
      await expect(page.locator('[data-docs-toolbar-frame]')).toBeVisible();
      await expect(page.locator('#docs-title')).toBeVisible();
      await expect(page.locator('#docs-description')).toBeVisible();
      await expect(page.locator('[data-sidebar="sidebar"]').filter({ visible: true })).toHaveCount(
        1,
      );

      await expect(page.getByRole('link', { name: 'Salesphere Docs' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Salesphere');
      expect(browserErrors, `Browser errors in ${targetUrl}`).toEqual([]);
    },
  );
}
