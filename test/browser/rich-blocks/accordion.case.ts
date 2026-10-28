import { openEditor } from '../support/editor.js';
import { expect, test } from '@playwright/test';
import { docsValueToMarkdown, markdownToDocsValue } from '../../../lib-dist/lib/markdown-model.js';
import type { TerraContent } from '../support/editor.js';

const accordionFixture = [
  {
    _key: 'accordion-under-test',
    _type: 'accordion',
    items: [
      {
        _key: 'first-section',
        _type: 'item',
        title: 'First section',
        content: [
          {
            _key: 'first-paragraph',
            _type: 'terraBlock',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _key: 'first-span',
                _type: 'span',
                marks: [],
                text: 'Nested accordion explanation',
              },
            ],
          },
        ],
      },
    ],
  },
] satisfies TerraContent;

test('accordion.spec: Expand sections and emit structure edits', async ({ page }) => {
  await openEditor(page, accordionFixture);
  const accordion = page.locator('[data-terra-block="accordion"]');
  await accordion.getByRole('button', { name: 'Toggle First section' }).click();
  await expect(accordion.getByText('Nested accordion explanation')).toBeVisible();

  await accordion.getByRole('button', { name: 'Add section' }).click();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items
          ?.length,
    )
    .toBe(2);
  await accordion.getByRole('textbox', { name: 'Accordion title' }).last().fill('Second section');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items?.[1]
          ?.title,
    )
    .toBe('Second section');
  await accordion.getByRole('button', { name: 'Delete accordion section' }).last().click();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items
          ?.length,
    )
    .toBe(1);
});

test('accordion.spec: Emit nested content edits', async ({ page }) => {
  await openEditor(page, accordionFixture);
  const accordion = page.locator('[data-terra-block="accordion"]');
  await accordion.getByRole('button', { name: 'Toggle First section' }).click();
  const nested = accordion.getByRole('textbox', { name: 'Document editor' });
  await nested.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' updated');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.items?.[0]
          ?.content?.[0]?.children?.[0]?.text,
    )
    .toBe('Nested accordion explanation updated');
});

test('accordion.spec: Imported Markdown renders, edits, and serializes nested content', async ({
  page,
}) => {
  const value = markdownToDocsValue('===[Details]\nA **bold** answer.\n===');
  await openEditor(page, value);
  const accordion = page.locator('[data-terra-block="accordion"]');
  await accordion.getByRole('button', { name: 'Toggle Details' }).click();
  await expect(accordion).toContainText('A bold answer.');
  const nested = accordion.getByRole('textbox', { name: 'Document editor' });
  await nested.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' updated');
  await expect
    .poll(async () =>
      JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]
        ?.items?.[0]?.content?.[0]?.children?.map((child: { text?: string }) => child.text ?? '')
        .join(''),
    )
    .toContain('A bold answer. updated');
  const saved = JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]');
  expect(saved[0].markdown).toBe('');
  expect(saved[0].items[0].markdown).toBe('');
  expect(docsValueToMarkdown(saved as never)).toContain('A **bold** answer. updated');
});
