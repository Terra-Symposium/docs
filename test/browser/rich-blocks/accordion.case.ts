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

test(
  'accordion.spec: Expand sections and emit structure edits',
  XL_VIEWPORT_TEST,
  async ({ page }) => {
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
  },
);

test('accordion.spec: Emit nested content edits', XL_VIEWPORT_TEST, async ({ page }) => {
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
