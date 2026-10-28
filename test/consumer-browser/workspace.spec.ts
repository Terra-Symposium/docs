import { expect, test } from '@playwright/test';

const consumerUrls = (process.env.DOCS_CONSUMER_URLS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const readOnlyUrls = new Set(
  (process.env.DOCS_READ_ONLY_CONSUMER_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const targetUrls = consumerUrls.length ? consumerUrls : [''];

for (const targetUrl of targetUrls) {
  const label = targetUrl
    ? new URL(targetUrl).host + new URL(targetUrl).pathname
    : 'no URL supplied';
  test(`installed Docs consumer preserves the shared workspace contract: ${label}`, async ({
    page,
  }) => {
    test.skip(!targetUrl, 'Set DOCS_CONSUMER_URLS to one or more installed Docs host URLs.');

    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400)
        browserErrors.push(`HTTP ${response.status()}: ${response.url()}`);
    });

    const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
    expect(response?.status(), `Consumer route did not load: ${targetUrl}`).toBeLessThan(400);
    await expect(page.locator('.terra-docs-workspace')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.terra-docs-document-header')).toBeVisible();
    await expect(page.locator('[data-docs-toolbar-frame]')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search pages' })).toHaveCount(0);
    await expect(page.locator('#docs-title')).toBeVisible();
    await expect(page.locator('#docs-description')).toBeVisible();
    await expect(page.locator('[data-sidebar="sidebar"]').filter({ visible: true })).toHaveCount(1);

    const order = await page.evaluate(() => {
      const header = document.querySelector('.terra-docs-document-header');
      const toolbar = document.querySelector('[data-docs-toolbar-frame]');
      const body = document.querySelector('[data-docs-body-content]');
      return {
        headerBeforeToolbar: Boolean(
          header &&
          toolbar &&
          header.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        toolbarBeforeBody: Boolean(
          toolbar &&
          body &&
          toolbar.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      };
    });
    expect(order).toEqual({ headerBeforeToolbar: true, toolbarBeforeBody: true });

    const mobileHeader = page.locator('.terra-docs-workspace header.md\\:hidden');
    await expect
      .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
      .toBe('none');
    await page.setViewportSize({ width: 768, height: 900 });
    await expect
      .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
      .toBe('none');
    await page.setViewportSize({ width: 767, height: 900 });
    await expect
      .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
      .toBe('flex');
    await page.setViewportSize({ width: 1987, height: 1248 });
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-desktop.png`,
      fullPage: true,
    });

    const section = page.getByRole('combobox', { name: 'Section' });
    await section.click();
    const sectionList = page.getByRole('listbox');
    await expect(sectionList).toBeVisible();
    await expect
      .poll(() =>
        sectionList.evaluate(
          (listbox) =>
            listbox.closest('[data-radix-popper-content-wrapper]')?.parentElement === document.body,
        ),
      )
      .toBe(true);
    await page.keyboard.press('Escape');

    const mode = page.getByRole('combobox', { name: 'Mode' });
    await mode.click();
    await expect(page.getByRole('option', { name: 'Code', exact: true })).toHaveCount(0);
    if (readOnlyUrls.has(targetUrl))
      await expect(page.getByRole('option', { name: 'Edit', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Attachments', exact: true }).click();
    await expect(page.locator('[data-docs-shell]')).toHaveAttribute(
      'data-docs-mode',
      'attachments',
    );
    await expect(page.locator('[data-docs-attachments]')).toBeVisible();
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-attachments.png`,
      fullPage: true,
    });
    expect(browserErrors, `Browser errors in ${targetUrl}`).toEqual([]);
  });
}
