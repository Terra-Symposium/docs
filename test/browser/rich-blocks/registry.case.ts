import { openEditor } from '../support/editor.js';
import { expect, test } from '@playwright/test';
import type { TerraContent } from '../support/editor.js';

const paragraph = [
  {
    _key: 'registry-paragraph',
    _type: 'block',
    style: 'normal',
    markDefs: [],
    children: [{ _key: 'registry-span', _type: 'span', marks: [], text: 'Start writing here.' }],
  },
] satisfies TerraContent;

test('default registry inserts code content and exposes every shared block', async ({ page }) => {
  await openEditor(page, paragraph);
  await page.getByRole('button', { name: 'Insert content' }).click();
  const menu = page.getByRole('listbox');
  const inline = menu.getByRole('group', { name: 'Inline' });
  const blocks = menu.getByRole('group', { name: 'Block' });
  await expect(inline.getByRole('option', { name: 'Math', exact: true })).toBeVisible();
  for (const block of [
    'Math',
    'Code',
    'Receive value',
    'Nodes',
    'TypeScript docs',
    'Raw',
    'Table',
    'Callout',
    'Tabs',
    'Accordion',
    'Add attachment',
  ]) {
    await expect(blocks.getByRole('option', { name: block, exact: true })).toBeVisible();
  }
  await blocks.getByRole('option', { name: 'Code', exact: true }).click();
  await expect(page.locator('[data-terra-block="code"]')).toBeVisible();
  await expect
    .poll(async () => {
      const value = JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]');
      return value.some((block: { _type?: string }) => block._type === 'code');
    })
    .toBe(true);
});

test('block opt-outs hide insertion controls, retain source, and keep attachment links available', async ({
  page,
}) => {
  const preservedCode = {
    _key: 'disabled-code',
    _type: 'code',
    language: 'json',
    value: '{"preserved":true}',
  };
  await openEditor(page, [preservedCode], {
    attachments: [{ name: 'Course notes.pdf', path: '/files/course-notes.pdf' }],
    blocks: { code: false, docImage: false, embed: false },
  });

  await expect(page.locator('[data-docs-unsupported-block="code"]')).toBeVisible();
  const displayedSource = await page
    .locator('[data-docs-unsupported-block="code"] pre')
    .textContent();
  expect(JSON.parse(displayedSource ?? 'null')).toEqual(preservedCode);
  const initialValue = JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]');
  expect(initialValue).toContainEqual(preservedCode);

  await page.getByRole('button', { name: 'Insert content' }).click();
  const menu = page.getByRole('listbox');
  const blocks = menu.getByRole('group', { name: 'Block' });
  for (const hidden of ['Code', 'Receive value'])
    await expect(blocks.getByRole('option', { name: hidden, exact: true })).toHaveCount(0);
  for (const hidden of ['Image', 'Embed'])
    await expect(menu.getByRole('option', { name: hidden, exact: true })).toHaveCount(0);
  await blocks.getByRole('option', { name: 'Add attachment', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Add attachment' });
  await expect(dialog.getByRole('button', { name: 'Visual embed', exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Document attachment' }).click();
  await page.getByRole('option', { name: 'Course notes.pdf', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Visual embed', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Insert text link', exact: true }).click();

  await expect
    .poll(async () => {
      const value = JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]');
      return JSON.stringify(value);
    })
    .toContain('Course notes.pdf');
  await expect(page.getByTestId('editor-output')).toContainText('/files/course-notes.pdf');
});

test('attachment picker enables visual embeds only for enabled block types', async ({ page }) => {
  await openEditor(page, paragraph, {
    attachments: [
      { name: 'Course notes.pdf', path: '/files/course-notes.pdf' },
      { name: 'Class diagram.png', path: '/files/class-diagram.png' },
    ],
    blocks: { docImage: false },
  });
  await page.getByRole('button', { name: 'Insert content' }).click();
  await page
    .getByRole('listbox')
    .getByRole('group', { name: 'Block' })
    .getByRole('option', { name: 'Add attachment', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Add attachment' });
  await dialog.getByRole('combobox', { name: 'Document attachment' }).click();
  await page.getByRole('option', { name: 'Course notes.pdf', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Visual embed', exact: true })).toBeVisible();

  await dialog.getByRole('combobox', { name: 'Document attachment' }).click();
  await page.getByRole('option', { name: 'Class diagram.png', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Visual embed', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Insert text link', exact: true })).toBeVisible();
});
