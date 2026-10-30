import { expect, test } from '@playwright/test';
import { openEditor } from '../../../../support/editor.js';
import type { TerraContent } from '../../../../support/editor.js';

const XL_VIEWPORT_TEST = {
  tag: '@viewport:xl',
  annotation: {
    type: 'viewport-reason',
    description: 'Root and nested editor insertion controls use the desktop editor layout.',
  },
} as const;

const textFixture = [
  {
    _key: 'paragraph',
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    children: [{ _key: 'paragraph-text', _type: 'span', marks: [], text: 'Editor text' }],
  },
] satisfies TerraContent;

const migratedTableFixture = [
  {
    _key: 'before-table',
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    children: [{ _key: 'before-text', _type: 'span', marks: ['strong'], text: 'Before table' }],
  },
  {
    _key: 'migrated-table',
    _type: 'table',
    header: 'Migrated table',
    rows: [
      {
        _key: 'heading-row',
        _type: 'row',
        cells: [
          {
            _key: 'heading-cell',
            _type: 'cell',
            content: [
              {
                _key: 'heading-block',
                _type: 'block',
                style: 'normal',
                markDefs: [],
                children: [{ _key: 'heading-text', _type: 'span', marks: [], text: 'Column' }],
              },
            ],
          },
        ],
      },
      {
        _key: 'value-row',
        _type: 'row',
        cells: [
          {
            _key: 'value-cell',
            _type: 'cell',
            content: [
              {
                _key: 'value-block',
                _type: 'block',
                style: 'normal',
                markDefs: [],
                children: [
                  { _key: 'value-text', _type: 'span', marks: [], text: 'Original value' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    _key: 'after-table',
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    children: [{ _key: 'after-text', _type: 'span', marks: [], text: 'After table' }],
  },
] satisfies TerraContent;

test(
  'root editor offers portable blocks and inserts a table from the toolbar',
  XL_VIEWPORT_TEST,
  async ({ page }) => {
    await openEditor(page, textFixture, { toolbar: true });
    const toolbar = page.getByRole('toolbar', { name: 'Editor controls' });
    const insert = toolbar.getByRole('combobox', { name: 'Insert rich block' });
    await insert.click();
    for (const type of ['tabs', 'accordion', 'callout']) {
      await expect(page.getByRole('option', { name: type, exact: true })).toBeVisible();
    }
    await page.getByRole('option', { name: 'table', exact: true }).click();

    await expect(page.locator('[data-terra-block="table"]')).toBeVisible();
    await expect
      .poll(async () => {
        const content = JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]');
        return content.some((block: { _type?: string }) => block._type === 'table');
      })
      .toBe(true);
  },
);

test(
  'nested editor hides recursive blocks but keeps portable tables available',
  XL_VIEWPORT_TEST,
  async ({ page }) => {
    await openEditor(page, textFixture, { nested: true, toolbar: true });
    const toolbar = page.getByRole('toolbar', { name: 'Editor controls' });
    await toolbar.getByRole('combobox', { name: 'Insert rich block' }).click();
    for (const type of ['tabs', 'accordion', 'callout']) {
      await expect(page.getByRole('option', { name: type, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('option', { name: 'table', exact: true })).toBeVisible();
  },
);

test(
  'canonical migrated table content renders, edits, and reloads without legacy nesting',
  XL_VIEWPORT_TEST,
  async ({ page }) => {
    await openEditor(page, migratedTableFixture, { persistKey: 'docs-migrated-table' });
    const table = page.locator('[data-terra-block="table"]');
    await expect(table).toBeVisible();
    await expect(page.getByText('Before table', { exact: true })).toBeVisible();
    await expect(page.getByText('After table', { exact: true })).toBeVisible();
    await expect(page.getByText('Original value', { exact: true })).toBeVisible();

    await page.getByRole('textbox', { name: 'Table cell 2, 1' }).fill('Updated value');
    await expect
      .poll(async () => {
        const content = JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]');
        return {
          blockTypes: content.map((block: { _type?: string }) => block._type),
          value: content[1]?.rows?.[1]?.cells?.[0]?.content?.[0]?.children?.[0]?.text,
        };
      })
      .toEqual({ blockTypes: ['block', 'table', 'block'], value: 'Updated value' });

    await page.reload();
    await expect(page.locator('[data-terra-block="table"]')).toBeVisible();
    await expect(page.getByText('Before table', { exact: true })).toBeVisible();
    await expect(page.getByText('After table', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Table cell 2, 1' })).toHaveValue(
      'Updated value',
    );
  },
);
