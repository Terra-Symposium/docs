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

const blockFixture = [
  { _key: 'math-under-test', _type: 'math', code: 'x^2', inline: false },
] satisfies TerraContent;
const inlineFixture = [
  {
    _key: 'inline-math-paragraph',
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    children: [
      { _key: 'before-math', _type: 'span', marks: [], text: 'Equation ' },
      { _key: 'inline-math', _type: 'math', code: 'x^2', inline: true },
      { _key: 'after-math', _type: 'span', marks: [], text: ' is useful.' },
    ],
  },
] satisfies TerraContent;

test('math.spec: Render block and emit formula edits', XL_VIEWPORT_TEST, async ({ page }) => {
  await openEditor(page, blockFixture);
  const math = page.locator('[data-docs-editor-block="math"]');
  await expect(math).toHaveAttribute('data-math-code', 'x^2');
  await expect(math.locator('.katex')).toBeVisible();
  await page.locator('.docs-math-wrapper').evaluate((element) => {
    (
      element as HTMLElement & { __blockActions?: Array<{ onSelect?: () => void }> }
    ).__blockActions?.[0]?.onSelect?.();
  });
  const formula = page.getByPlaceholder("f'(x) = ...");
  await expect(formula).toBeFocused();
  await formula.fill('y^3');
  await page.getByRole('button', { name: 'Save Formula' }).click();
  await expect(formula).not.toBeVisible();
  await expect(math).toHaveAttribute('data-math-code', 'y^3');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.code,
    )
    .toBe('y^3');
  await page.locator('.docs-math-wrapper').evaluate((element) => {
    (
      element as HTMLElement & { __blockActions?: Array<{ onSelect?: () => void }> }
    ).__blockActions?.[0]?.onSelect?.();
  });
  await expect(formula).toBeFocused();
  await expect(formula).toHaveValue('y^3');
  await formula.fill('z^4');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(formula).not.toBeVisible();
  await expect(math).toHaveAttribute('data-math-code', 'y^3');
});

test('math.spec: Render inline within a paragraph', XL_VIEWPORT_TEST, async ({ page }) => {
  await openEditor(page, inlineFixture);
  const inline = page.locator('[data-terra-inline="math"]');
  await expect(inline.locator('.katex')).toBeVisible();
  await expect(page.locator('[data-terra-content-editor]')).toContainText('Equation');
  await expect(page.locator('[data-terra-content-editor]')).toContainText('is useful.');
});
