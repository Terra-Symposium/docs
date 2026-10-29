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

const embedFixture = [
  {
    _key: 'embed-under-test',
    _type: 'embed',
    src: 'about:blank',
    title: 'Local example',
    width: '320px',
    height: '180px',
  },
] satisfies TerraContent;

test(
  'embed.spec: Render title and size without remote requests',
  XL_VIEWPORT_TEST,
  async ({ page }) => {
    await openEditor(page, embedFixture);
    const frame = page.getByTitle('Local example');
    await expect(frame).toHaveAttribute('src', 'about:blank');
    await expect(frame).toHaveCSS('width', '320px');
    await expect(frame).toHaveCSS('height', '180px');
  },
);
