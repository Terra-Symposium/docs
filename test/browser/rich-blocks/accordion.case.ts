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
const repeatedTitleAccordionFixture = [
  {
    _key: 'repeated-title-accordion',
    _type: 'accordion',
    items: [
      {
        _key: 'first-challenges',
        _type: 'item',
        title: 'Challenges',
        content: [
          {
            _key: 'first-challenge-body',
            _type: 'terraBlock',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _key: 'first-challenge-span',
                _type: 'span',
                marks: [],
                text: 'First challenge body',
              },
            ],
          },
        ],
      },
      {
        _key: 'second-challenges',
        _type: 'item',
        title: 'Challenges',
        content: [
          {
            _key: 'second-challenge-body',
            _type: 'terraBlock',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _key: 'second-challenge-span',
                _type: 'span',
                marks: [],
                text: 'Second challenge body',
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

test('accordion.spec: Repeated titles keep independent panels', async ({ page }) => {
  await openEditor(page, repeatedTitleAccordionFixture);
  const accordion = page.locator('[data-terra-block="accordion"]');
  const triggers = accordion.getByRole('button', { name: 'Toggle Challenges' });
  await expect(triggers).toHaveCount(2);

  const first = triggers.nth(0);
  const second = triggers.nth(1);
  const firstId = await first.getAttribute('id');
  const secondId = await second.getAttribute('id');
  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(firstId).not.toBe(secondId);
  const firstPanel = accordion.locator(`[role="region"][aria-labelledby="${firstId}"]`);
  const secondPanel = accordion.locator(`[role="region"][aria-labelledby="${secondId}"]`);
  await expect(firstPanel).toHaveCount(1);
  await expect(secondPanel).toHaveCount(1);

  await first.click();
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await expect(second).toHaveAttribute('aria-expanded', 'false');
  await expect(firstPanel).toHaveAttribute('data-state', 'open');
  await expect(secondPanel).toHaveAttribute('data-state', 'closed');
  await expect(firstPanel.getByText('First challenge body')).toBeVisible();

  await second.click();
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await expect(firstPanel).toHaveAttribute('data-state', 'closed');
  await expect(secondPanel).toHaveAttribute('data-state', 'open');
  await expect(secondPanel.getByText('Second challenge body')).toBeVisible();
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
