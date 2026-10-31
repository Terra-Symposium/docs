import { openEditor } from '../../../../support/editor.js';
import { expect, test } from '@playwright/test';
import { markdownToDocsValue } from '../../../../../../lib-dist/lib/markdown-model.js';
import type { TerraContent } from '../../../../support/editor.js';

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

test('table.spec: Render cells and emit structure edits', async ({ page }) => {
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

test('table.spec: Preserve inline code marks inside nested cells', async ({ page }) => {
  const fixture = [
    {
      _key: 'inline-code-table',
      _type: 'table',
      header: 'Inline code',
      rows: [
        {
          _key: 'inline-code-header',
          _type: 'row',
          cells: [textCell('inline-code-heading', 'Value')],
        },
        {
          _key: 'inline-code-row',
          _type: 'row',
          cells: [
            {
              _key: 'inline-code-cell',
              _type: 'cell',
              content: [
                {
                  _key: 'inline-code-block',
                  _type: 'block',
                  children: [
                    {
                      _key: 'inline-code-span',
                      _type: 'span',
                      marks: ['code'],
                      text: 'problem',
                    },
                  ],
                  markDefs: [],
                  style: 'normal',
                },
              ],
            },
          ],
        },
      ],
    },
  ] satisfies TerraContent;

  await openEditor(page, fixture, { readOnly: true });
  const cell = page.locator('[data-docs-editor-block="DocsTable"] tbody td');
  await expect(cell.locator('code')).toHaveText('problem');
});

test('table.spec: Render Sanity terraBlock aliases inside nested table cells', async ({ page }) => {
  const terraCell = (key: string, text: string) => ({
    _key: key,
    _type: 'cell',
    content: [
      {
        _key: `${key}-block`,
        _type: 'terraBlock',
        children: [{ _key: `${key}-text`, _type: 'span', marks: [], text }],
        markDefs: [],
        style: 'normal',
      },
    ],
  });
  const fixture = [
    {
      _key: 'sanity-table',
      _type: 'table',
      header: 'Sanity table payload',
      rows: [
        {
          _key: 'sanity-header-row',
          _type: 'row',
          cells: [
            terraCell('sanity-heading-cell', 'Aspect'),
            terraCell('sanity-description-cell', 'Description'),
          ],
        },
        {
          _key: 'sanity-data-row',
          _type: 'row',
          cells: [
            terraCell('sanity-aspect-cell', 'Professional practice'),
            terraCell('sanity-body-cell', 'Evidence-based and collaborative.'),
          ],
        },
      ],
    },
  ] satisfies TerraContent;

  await openEditor(page, fixture, { readOnly: true });
  const table = page.locator('[data-docs-editor-block="DocsTable"] table');
  await expect(table.getByRole('columnheader').nth(0)).toContainText('Aspect');
  await expect(table.getByRole('columnheader').nth(1)).toContainText('Description');
  await expect(table.getByRole('cell').nth(0)).toContainText('Professional practice');
  await expect(table.getByRole('cell').nth(1)).toContainText('Evidence-based and collaborative.');
});

test('table.spec: Render compact Docs Markdown text aliases inside nested cells', async ({
  page,
}) => {
  const compactCell = (key: string, text: string) => ({
    _key: key,
    _type: 'cell',
    content: [
      {
        _key: `${key}-block`,
        _type: 'block',
        c: [{ _key: `${key}-span`, _type: 'span', marks: [], text }],
        markDefs: [],
        style: 'normal',
      },
    ],
  });
  const fixture = [
    {
      _key: 'compact-markdown-table',
      _type: 'table',
      header: 'Markdown parser table',
      rows: [
        {
          _key: 'compact-header-row',
          _type: 'row',
          cells: [
            compactCell('compact-header', '🏗️ Service'),
            compactCell('compact-tech', '📦 Technology'),
          ],
        },
        {
          _key: 'compact-data-row',
          _type: 'row',
          cells: [
            compactCell('compact-service', 'Web Application'),
            compactCell('compact-runtime', 'Astro'),
          ],
        },
      ],
    },
  ] satisfies TerraContent;

  await openEditor(page, fixture, { readOnly: true });
  const table = page.locator('[data-docs-editor-block="DocsTable"] table');
  await expect(table.getByRole('columnheader').nth(0)).toHaveText('🏗️ Service');
  await expect(table.getByRole('columnheader').nth(1)).toHaveText('📦 Technology');
  await expect(table.getByRole('cell').nth(0)).toHaveText('Web Application');
  await expect(table.getByRole('cell').nth(1)).toHaveText('Astro');
});

test('table.spec: Render legacy Sanity text blocks with string children in cells', async ({
  page,
}) => {
  const legacyTextCell = (key: string, text: string) => ({
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
  const fixture = [
    {
      _key: 'legacy-string-children-table',
      _type: 'table',
      header: 'Production-shaped Sanity table',
      rows: [
        {
          _key: 'legacy-string-children-header',
          _type: 'row',
          cells: [
            legacyTextCell('legacy-header-label', '🔍 Aspect'),
            legacyTextCell('legacy-header-description', 'Description'),
          ],
        },
        {
          _key: 'legacy-string-children-body',
          _type: 'row',
          cells: [
            legacyTextCell('legacy-body-label', '🗣️ Voice'),
            legacyTextCell('legacy-body-description', 'Professional and evidence-based.'),
          ],
        },
      ],
    },
  ] satisfies TerraContent;

  await openEditor(page, fixture, { readOnly: true });
  const table = page.locator('[data-docs-editor-block="DocsTable"] table');
  await expect(table.getByRole('columnheader').nth(0)).toHaveText('🔍 Aspect');
  await expect(table.getByRole('columnheader').nth(1)).toHaveText('Description');
  await expect(table.getByRole('cell').nth(0)).toHaveText('🗣️ Voice');
  await expect(table.getByRole('cell').nth(1)).toHaveText('Professional and evidence-based.');
});

test('table.spec: Import a Markdown table into the visual editor', async ({ page }) => {
  const value = markdownToDocsValue(
    '| Name | Value |\n| --- | --- |\n| Terra | **Shared Docs** |\n',
  );
  await openEditor(page, value);

  const table = page.locator('[data-terra-block="table"]');
  await expect(table).toBeVisible();
  await expect(table.getByRole('textbox', { name: 'Table cell 1, 1' })).toHaveValue('Name');
  const valueCell = table.getByRole('textbox', { name: 'Table cell 2, 1' });
  await expect(valueCell).toHaveValue('Terra');
  await valueCell.fill('Terra Symposium');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.rows?.[1]
          ?.cells?.[0]?.content?.[0]?.children?.[0]?.text,
    )
    .toBe('Terra Symposium');
});

test('table.spec: Edit heading, rows and columns', async ({ page }) => {
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

test('table.spec: Insert from toolbar', async ({ page }) => {
  await openEditor(page, []);
  await page.getByRole('button', { name: 'Insert content' }).click();
  await page.getByRole('option', { name: 'Table', exact: true }).click();
  await expect(page.locator('[data-terra-block="table"]')).toBeVisible();
  await expect
    .poll(async () =>
      JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]').some(
        (block: { _type?: string }) => block._type === 'table',
      ),
    )
    .toBe(true);
});
