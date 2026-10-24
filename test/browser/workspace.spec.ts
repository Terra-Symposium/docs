import { expect, test } from '@playwright/test';

test('document controls follow the header and leaf actions work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Terra Docs', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Search pages')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Mode' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Mode' }).click();
  await expect(page.getByRole('option', { name: 'Edit' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('.terra-docs-workspace-group li').first().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Copy link' }).first()).toBeVisible();
  expect(
    await page.evaluate(() => {
      const header = document.querySelector('.terra-docs-document-header');
      const toolbar = document.querySelector('[data-docs-toolbar-frame]');
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
  await page.getByRole('combobox', { name: 'Mode' }).click();
  await page.getByRole('option', { name: 'Attachments' }).click();
  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible();
  await expect(page.locator('.terra-docs-site-article')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('sidebar search filters leaves and context menu opens their attachments', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search pages').fill('Create an instance');
  await expect(page.locator('.terra-docs-workspace-group li')).toHaveCount(1);
  await page.getByLabel('Search pages').clear();
  await page.getByRole('button', { name: 'Actions for Terra Docs' }).click();
  await page.getByRole('menuitem', { name: 'Attachments view' }).click();
  await expect(page.locator('.terra-docs-site')).toHaveAttribute('data-docs-mode', 'attachments');
  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible();
});
