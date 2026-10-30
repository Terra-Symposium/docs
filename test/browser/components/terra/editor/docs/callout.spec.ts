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

test('callout.spec: Render content and emit title edits', XL_VIEWPORT_TEST, async ({ page }) => {
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

test('callout.spec: Emit nested content edits', XL_VIEWPORT_TEST, async ({ page }) => {
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
