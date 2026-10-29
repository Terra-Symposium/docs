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

const textCell = (key: string, text: string) => ({
  _key: key,
  _type: 'cell' as const,
  content: [
    {
      _key: `${key}-block`,
      _type: 'block' as const,
      children: [{ _key: `${key}-text`, _type: 'span' as const, marks: [], text }],
      markDefs: [],
      style: 'normal' as const,
    },
  ],
});

const tableFixture = [
  {
    _key: 'table-under-test',
    _type: 'table',
    header: 'Example table',
    rows: [
      { _key: 'heading-row', _type: 'row', cells: [textCell('heading-cell', 'Name')] },
      { _key: 'data-row', _type: 'row', cells: [textCell('data-cell', 'Terra')] },
    ],
  },
] satisfies TerraContent;

test('table.spec: Render cells and emit structure edits', XL_VIEWPORT_TEST, async ({ page }) => {
  const cell = page.getByRole('textbox', { name: 'Table cell 2, 1' });
  await test.step('Inject Table and verify it renders', async () => {
    await openEditor(page, tableFixture);
    await expect(cell).toHaveValue('Terra');
  });

  const output = page.getByTestId('editor-output');
  await test.step('Edit a cell and verify onChange', async () => {
    await cell.fill('Updated Terra');
    await expect
      .poll(
        async () =>
          JSON.parse((await output.textContent()) ?? '[]')[0]?.rows?.[1]?.cells?.[0]?.content?.[0]
            ?.children?.[0]?.text,
      )
      .toBe('Updated Terra');
  });

  await test.step('Add a row and verify onChange', async () => {
    await page.getByRole('button', { name: 'Row', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Table cell 3, 1' })).toBeVisible();
    await expect
      .poll(async () => JSON.parse((await output.textContent()) ?? '[]')[0]?.rows?.length)
      .toBe(3);
  });
});

test('table.spec: Edit heading, rows and columns', XL_VIEWPORT_TEST, async ({ page }) => {
  await openEditor(page, tableFixture);
  const table = page.locator('[data-terra-block="table"]');
  await table.getByRole('textbox', { name: 'Table heading' }).fill('Updated heading');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.header,
    )
    .toBe('Updated heading');

  await table.getByRole('button', { name: 'Column', exact: true }).click();
  await expect(table.getByRole('textbox', { name: 'Table cell 2, 2' })).toBeVisible();
  await table.getByRole('textbox', { name: 'Table cell 2, 2' }).fill('Second column');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.rows?.[1]
          ?.cells?.[1]?.content?.[0]?.children?.[0]?.text,
    )
    .toBe('Second column');
  await table.getByRole('button', { name: 'Delete column 2' }).click();
  await expect(table.getByRole('textbox', { name: 'Table cell 2, 2' })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.rows?.[1]
          ?.cells?.length,
    )
    .toBe(1);

  await table.getByRole('button', { name: 'Delete row 2' }).click();
  await expect(table.getByRole('textbox', { name: 'Table cell 2, 1' })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.rows
          ?.length,
    )
    .toBe(1);
});
