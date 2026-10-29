import { expect, test } from '@playwright/test';
import { openEditor } from '../support/editor.js';
import type { TerraContent } from '../support/editor.js';

const XL_VIEWPORT_TEST = {
  tag: '@viewport:xl',
  annotation: {
    type: 'viewport-reason',
    description: 'Rich-block interactions use the standard desktop editor layout.',
  },
} as const;

const emptyScopeFixture = [
  { _key: 'tsdocs-under-test', _type: 'tsDocs', scope: '' },
] satisfies TerraContent;
const scopedFixture = [
  { _key: 'tsdocs-under-test', _type: 'tsDocs', scope: 'lib/local' },
] satisfies TerraContent;
const paragraph = (text: string): TerraContent => [
  {
    _key: `${text}-block`,
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    children: [{ _key: `${text}-span`, _type: 'span', marks: [], text }],
  },
];

test('tsdocs.spec: Hide remote panel without a scope', XL_VIEWPORT_TEST, async ({ page }) => {
  await openEditor(page, emptyScopeFixture);
  await expect(page.locator('[data-docs-block-skeleton]')).toHaveCount(0);
  await expect(page.getByTestId('editor-output')).toContainText('tsDocs');
});

test('tsdocs.spec: Render generated pages for a scope', XL_VIEWPORT_TEST, async ({ page }) => {
  await openEditor(page, scopedFixture, {
    mockResponses: {
      'read.tsdocs': {
        data: {
          docs: [
            { slug: 'lib/local/alpha', title: 'Alpha helper', body: 'alpha source' },
            { slug: 'lib/local/beta', title: 'Beta helper', body: 'beta source' },
          ],
        },
      },
      'read.source.body': {
        dataByInput: {
          'alpha source': paragraph('Alpha returns a value.'),
          'beta source': paragraph('Beta returns nothing.'),
        },
      },
    },
  });
  const contents = page.getByRole('navigation', { name: 'TSDocs contents' });
  await expect(contents.getByRole('link', { name: 'Alpha helper' })).toHaveAttribute(
    'href',
    '#lib-local-alpha',
  );
  await expect(contents.getByRole('link', { name: 'Beta helper' })).toHaveAttribute(
    'href',
    '#lib-local-beta',
  );
  await expect(page.locator('#lib-local-alpha')).toContainText('Alpha returns a value.');
  await expect(page.locator('#lib-local-beta')).toContainText('Beta returns nothing.');
});

test(
  'tsdocs.spec: Show an error when the scope cannot load',
  XL_VIEWPORT_TEST,
  async ({ page }) => {
    await openEditor(page, scopedFixture, {
      mockResponses: { 'read.tsdocs': { data: { docs: null } } },
    });
    await expect(page.getByText('TsDocs Error')).toBeVisible();
  },
);
