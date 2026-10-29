import { openEditor } from '../support/editor.js';
import { expect, test } from '@playwright/test';
import type { TerraContent } from '../support/editor.js';

const XL_VIEWPORT_TEST = {
  tag: '@viewport:xl',
  annotation: {
    type: 'viewport-reason',
    description: 'Rich-block interactions use the standard desktop editor layout.',
  },
} as const;

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

test('tabs.spec: Switch tabs and emit structure edits', XL_VIEWPORT_TEST, async ({ page }) => {
  await openEditor(page, tabsFixture);
  const tabs = page.locator('[data-terra-block="tabs"]');
  await expect(tabs.getByText('First explanation')).toBeVisible();
  await tabs.getByRole('tab', { name: 'Second topic' }).click();
  await expect(tabs.getByText('Second explanation')).toBeVisible();
  await expect(tabs.getByText('First explanation')).toBeHidden();

  await tabs.getByRole('button', { name: 'Add tab' }).click();
  await tabs.getByRole('textbox', { name: 'Tab title' }).last().fill('Third topic');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items,
      { intervals: [25, 75, 150], timeout: 1500 },
    )
    .toEqual([
      expect.objectContaining({ title: 'First topic' }),
      expect.objectContaining({ title: 'Second topic' }),
      expect.objectContaining({ title: 'Third topic' }),
    ]);
  await tabs.getByRole('button', { name: 'Delete tab Third topic' }).click();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items
          ?.length,
      { intervals: [25, 75, 150], timeout: 1500 },
    )
    .toBe(2);
});

test('tabs.spec: Emit active tab edits', XL_VIEWPORT_TEST, async ({ page }) => {
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
