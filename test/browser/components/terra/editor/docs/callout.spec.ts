import { openEditor } from '../../../../support/editor.js';
import { expect, test } from '@playwright/test';
import {
  docsValueToMarkdown,
  markdownToDocsValue,
} from '../../../../../../lib-dist/lib/markdown-model.js';
import type { TerraContent } from '../../../../support/editor.js';

const calloutFixture = [
  {
    _key: 'callout-under-test',
    _type: 'callout',
    kind: 'example',
    title: 'Original example',
    content: [
      {
        _key: 'callout-paragraph',
        _type: 'terraBlock',
        style: 'normal',
        markDefs: [],
        children: [{ _key: 'callout-text', _type: 'span', marks: [], text: 'Nested explanation' }],
      },
    ],
  },
] satisfies TerraContent;

test('callout.spec: Render content and emit title edits', async ({ page }) => {
  await openEditor(page, calloutFixture);
  const callout = page.locator('[data-terra-block="callout"]');
  await expect(callout).toHaveAttribute('data-docs-aside', 'example');
  await expect(callout).toContainText('Nested explanation');
  await callout.getByRole('textbox', { name: 'Callout title' }).fill('Updated example');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.title,
    )
    .toBe('Updated example');
  await expect(callout).toContainText('Nested explanation');
});

test('callout.spec: Emit nested content edits', async ({ page }) => {
  await openEditor(page, calloutFixture);
  const nested = page
    .locator('[data-terra-block="callout"]')
    .getByRole('textbox', { name: 'Document editor' });
  await nested.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' updated');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.content?.[0]
          ?.children?.[0]?.text,
    )
    .toBe('Nested explanation updated');
});

test('callout.spec: Imported directives retain rich body while edited content serializes', async ({
  page,
}) => {
  await openEditor(
    page,
    markdownToDocsValue(':::warning[Check this]\nReview **the source**.\n:::'),
  );
  const callout = page.locator('[data-terra-block="callout"]');
  await expect(callout).toContainText('Review the source.');
  const nested = callout.getByRole('textbox', { name: 'Document editor' });
  await nested.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' updated');
  await expect
    .poll(async () =>
      JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]
        ?.content?.[0]?.children?.map((child: { text?: string }) => child.text ?? '')
        .join(''),
    )
    .toContain('Review the source. updated');
  const saved = JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]');
  expect(saved[0].markdown).toBe('');
  expect(docsValueToMarkdown(saved as never)).toContain(':::warning[Check this]');
  expect(docsValueToMarkdown(saved as never)).toContain('Review **the source**. updated');
});
