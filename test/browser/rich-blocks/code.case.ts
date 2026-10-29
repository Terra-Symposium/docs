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

const codeFixture = [
  { _key: 'code-under-test', _type: 'code', language: 'typescript', value: 'const answer = 1;' },
] satisfies TerraContent;

test('code.spec: Render source and emit edits', XL_VIEWPORT_TEST, async ({ page }) => {
  const code = page.locator('[data-terra-block="code"] .cm-content');
  await test.step('Inject Code and verify it renders', async () => {
    await openEditor(page, codeFixture);
    await expect(code).toContainText('const answer = 1;');
  });

  await test.step('Edit Code and verify onChange', async () => {
    await code.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('const answer = 2;');
    const output = page.getByTestId('editor-output');
    await expect
      .poll(async () => JSON.parse((await output.textContent()) ?? '[]')[0]?.value)
      .toBe('const answer = 2;');
  });
});

test('code.spec: Change language and copy source', XL_VIEWPORT_TEST, async ({ page }) => {
  await openEditor(page, codeFixture);
  const code = page.locator('[data-terra-block="code"]');
  await code.getByRole('combobox').click();
  await page.getByRole('option', { name: 'javascript' }).click();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.language,
    )
    .toBe('javascript');

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await code.getByRole('button', { name: 'Copy' }).click();
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('const answer = 1;');
});

test('code.spec: Preserve entered newlines', XL_VIEWPORT_TEST, async ({ page }) => {
  await openEditor(page, codeFixture);
  const code = page.locator('[data-terra-block="code"] .cm-content');
  await code.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('const answer = 2;');
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]')[0]?.value,
    )
    .toBe('const answer = 1;\nconst answer = 2;');
});
