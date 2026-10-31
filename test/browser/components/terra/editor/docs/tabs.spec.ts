import { openEditor } from '../../../../support/editor.js';
import { expect, test } from '@playwright/test';
import type { TerraContent } from '../../../../support/editor.js';

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

test('tabs.spec: Render source-backed table cells inside read-only tabs', async ({ page }) => {
  const cell = (key: string, text: string) => ({
    _key: key,
    _type: 'cell',
    content: [
      {
        _key: `${key}-block`,
        _type: 'block',
        children: [{ _key: `${key}-span`, _type: 'span', marks: [], text }],
        markDefs: [],
        style: 'normal',
      },
    ],
  });
  const content = [
    {
      _key: 'brand-tabs',
      _type: 'tabs',
      items: [
        {
          _key: 'overview',
          _type: 'item',
          title: 'Overview',
          content: [
            {
              _key: 'overview-table',
              _type: 'table',
              header: 'Overview values',
              rows: [
                {
                  _key: 'overview-header',
                  _type: 'row',
                  cells: [cell('aspect', 'Aspect'), cell('description', 'Description')],
                },
                {
                  _key: 'overview-voice',
                  _type: 'row',
                  cells: [
                    cell('voice', 'Voice'),
                    cell('voice-copy', 'Professional and evidence-based.'),
                  ],
                },
              ],
            },
          ],
        },
        {
          _key: 'principles',
          _type: 'item',
          title: 'Principles',
          content: [
            {
              _key: 'principles-table',
              _type: 'table',
              header: 'Principle values',
              rows: [
                {
                  _key: 'principles-header',
                  _type: 'row',
                  cells: [cell('attribute', 'Attribute'), cell('description-2', 'Description')],
                },
                {
                  _key: 'principles-motto',
                  _type: 'row',
                  cells: [
                    cell('motto', 'Motto'),
                    cell('motto-copy', 'Engineering trust and confidence.'),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ] satisfies TerraContent;

  await openEditor(page, content, { readOnly: true });
  const tabs = page.getByRole('tablist').last();
  const overview = page.getByRole('tab', { name: 'Overview' });
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('table').getByText('Voice', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('table').getByText('Professional and evidence-based.', { exact: true }),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Principles' }).click();
  await expect(page.getByRole('table').getByText('Motto', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('table').getByText('Engineering trust and confidence.', { exact: true }),
  ).toBeVisible();
  await expect(tabs).toBeVisible();
});

test('tabs.spec: Render Sanity terraBlock cells inside production-shaped nested tables', async ({
  page,
}) => {
  const terraCell = (key: string, text: string) => ({
    _key: key,
    _type: 'cell',
    content: [
      {
        _key: `${key}-block`,
        _type: 'terraBlock',
        children: [{ _key: `${key}-span`, _type: 'span', marks: [], text }],
        markDefs: [],
        style: 'normal',
      },
    ],
  });
  const content = [
    {
      _key: 'salesphere-brand-tabs',
      _type: 'tabs',
      items: [
        {
          _key: 'brand-overview',
          _type: 'item',
          title: 'Overview',
          content: [
            {
              _key: 'brand-overview-table',
              _type: 'table',
              header: 'Table',
              rows: [
                {
                  _key: 'brand-heading-row',
                  _type: 'row',
                  cells: [
                    terraCell('brand-aspect', '🔍 Aspect'),
                    terraCell('brand-description', 'Description'),
                  ],
                },
                {
                  _key: 'brand-voice-row',
                  _type: 'row',
                  cells: [
                    terraCell('brand-voice', '🗣️ Voice'),
                    terraCell(
                      'brand-voice-description',
                      'Professional, authoritative, and evidence-based.',
                    ),
                  ],
                },
                {
                  _key: 'brand-culture-row',
                  _type: 'row',
                  cells: [
                    terraCell('brand-culture', '🏢 Culture'),
                    terraCell(
                      'brand-culture-description',
                      'Data-driven, ethical, and collaborative.',
                    ),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ] satisfies TerraContent;

  await openEditor(page, content, { readOnly: true });
  const table = page.locator('[data-docs-editor-block="DocsTable"] table');
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(table.getByRole('columnheader').nth(0)).toContainText('🔍 Aspect');
  await expect(table.getByRole('columnheader').nth(1)).toContainText('Description');
  await expect(table.getByRole('cell').nth(0)).toContainText('🗣️ Voice');
  await expect(table.getByRole('cell').nth(1)).toContainText(
    'Professional, authoritative, and evidence-based.',
  );
  await expect(table.getByRole('cell').nth(3)).toContainText(
    'Data-driven, ethical, and collaborative.',
  );
});

test('tabs.spec: Render production legacy string children in table cells', async ({ page }) => {
  const cell = (key: string, text: string) => ({
    _key: key,
    _type: 'cell',
    content: [
      {
        _key: `${key}-block`,
        _type: 'terraBlock',
        children: text,
        markDefs: [],
        style: 'normal',
      },
    ],
  });
  const content = [
    {
      _key: 'production-tabs',
      _type: 'tabs',
      items: [
        {
          _key: 'production-overview',
          _type: 'item',
          title: 'Overview',
          content: [
            {
              _key: 'production-brand-table',
              _type: 'table',
              header: 'Table',
              rows: [
                {
                  _key: 'production-header',
                  _type: 'row',
                  cells: [cell('aspect', '🔍 Aspect'), cell('description', 'Description')],
                },
                {
                  _key: 'production-voice',
                  _type: 'row',
                  cells: [
                    cell('voice', '🗣️ Voice'),
                    cell('voice-copy', 'Professional, authoritative, and evidence-based.'),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ] satisfies TerraContent;

  await openEditor(page, content, { readOnly: true });
  const table = page.locator('[data-docs-editor-block="DocsTable"] table');
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(table.getByRole('columnheader').nth(0)).toHaveText('🔍 Aspect');
  await expect(table.getByRole('columnheader').nth(1)).toHaveText('Description');
  await expect(table.getByRole('cell').nth(0)).toHaveText('🗣️ Voice');
  await expect(table.getByRole('cell').nth(1)).toHaveText(
    'Professional, authoritative, and evidence-based.',
  );
});
