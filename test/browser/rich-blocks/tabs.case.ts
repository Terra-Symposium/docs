import { openEditor } from '../support/editor.js';
import { expect, test } from '@playwright/test';
import type { TerraContent } from '../support/editor.js';

const paragraph = (key: string, text: string) => ({
  _key: key,
  _type: 'terraBlock' as const,
  style: 'normal' as const,
  markDefs: [],
  children: [{ _key: `${key}-span`, _type: 'span' as const, marks: [], text }],
});
const tabsFixture = [
  {
    _key: 'tabs-under-test',
    _type: 'tabs',
    items: [
      {
        _key: 'first-tab',
        _type: 'item',
        title: 'First topic',
        content: [paragraph('first-content', 'First explanation')],
      },
      {
        _key: 'second-tab',
        _type: 'item',
        title: 'Second topic',
        content: [paragraph('second-content', 'Second explanation')],
      },
    ],
  },
] satisfies TerraContent;

test('tabs.spec: Switch tabs and emit structure edits', async ({ page }) => {
  await openEditor(page, tabsFixture);
  const tabs = page.locator('[data-terra-block="tabs"]');
  const firstTab = tabs.getByRole('tab', { name: 'First topic' });
  const firstPanelId = await firstTab.getAttribute('aria-controls');
  expect(firstPanelId).toBeTruthy();
  const firstPanel = tabs.locator(`[role="tabpanel"][id="${firstPanelId}"]`);
  await expect(firstPanel).toBeVisible();
  await expect(firstPanel.getByText('First explanation')).toBeVisible();

  const secondTab = tabs.getByRole('tab', { name: 'Second topic' });
  const secondPanelId = await secondTab.getAttribute('aria-controls');
  expect(secondPanelId).toBeTruthy();
  const secondPanel = tabs.locator(`[role="tabpanel"][id="${secondPanelId}"]`);
  await secondTab.click();
  await expect(secondPanel).toBeVisible();
  await expect(secondPanel.getByText('Second explanation')).toBeVisible();
  await expect(firstPanel).toBeHidden();
  await expect(firstTab).toHaveAttribute('aria-selected', 'false');
  await expect(secondTab).toHaveAttribute('aria-selected', 'true');

  await tabs.getByRole('button', { name: 'Add tab' }).click();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items
          ?.length,
    )
    .toBe(3);
  await tabs.getByRole('textbox', { name: 'Tab title' }).last().fill('Third topic');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items?.[2]
          ?.title,
    )
    .toBe('Third topic');
  await tabs.getByRole('button', { name: 'Delete tab Third topic' }).click();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items
          ?.length,
    )
    .toBe(2);

  await tabs.getByRole('button', { name: 'Delete tab Second topic' }).click();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items
          ?.length,
    )
    .toBe(1);
  await expect(tabs.getByRole('tab', { name: 'First topic' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tabs.getByText('First explanation')).toBeVisible();
});

test('tabs.spec: Emit active tab edits', async ({ page }) => {
  await openEditor(page, tabsFixture);
  const nested = page
    .locator('[data-terra-block="tabs"]')
    .getByRole('textbox', { name: 'Document editor' });
  await nested.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' updated');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items?.[0]
          ?.content?.[0]?.children?.[0]?.text,
    )
    .toBe('First explanation updated');
});
