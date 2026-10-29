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

const rawFixture = [
  { _key: 'raw-under-test', _type: 'raw', markdown: '# Terra source' },
] satisfies TerraContent;

test('raw.spec: Show read-only source', XL_VIEWPORT_TEST, async ({ page }) => {
  await openEditor(page, rawFixture);
  const source = page.locator('[data-docs-code-block="view"]');
  await expect(source).toContainText('# Terra source');
  await expect(source.getByRole('button', { name: 'Copy' })).toBeVisible();
  await expect(page.getByTestId('editor-output')).toContainText('# Terra source');
});
