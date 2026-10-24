import { expect, test } from '@playwright/test';

test('document controls follow the header and leaf actions work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Terra Docs', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Search pages')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Mode' })).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Mode' }).locator('option[value="edit"]'),
  ).toHaveCount(0);
  await page.locator('.terra-docs-workspace-group li').first().click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'Copy link' }).first()).toBeVisible();
  expect(
    await page.evaluate(() => {
      const header = document.querySelector('.terra-docs-document-header');
      const toolbar = document.querySelector('.terra-docs-toolbar-shell');
      return (
        !!header &&
        !!toolbar &&
        header.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    }),
  ).toBeTruthy();
});

test('attachments switch hides document at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.terra-docs-site')).toHaveAttribute('data-docs-mode', 'view');
  await page.getByRole('combobox', { name: 'Mode' }).selectOption('attachments');
  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible();
  await expect(page.locator('.terra-docs-site-article')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
