import { openEditor } from '../support/editor.js';
import { expect, test } from '@playwright/test';
import type { TerraContent } from '../support/editor.js';

/** Verify root insertion and nested insertion across every Docs container. */
for (const kind of ['tabs', 'accordion', 'callout'] as const) {
  test(`${kind} body excludes recursive blocks while root keeps them`, async ({ page }) => {
    const content = [
      {
        _key: 'nested-text',
        _type: 'terraBlock',
        style: 'normal',
        markDefs: [],
        children: [{ _key: 'nested-span', _type: 'span', text: 'Nested text', marks: [] }],
      },
    ] satisfies TerraContent;
    const container =
      kind === 'callout'
        ? { _key: kind, _type: kind, kind: 'note', content }
        : {
            _key: kind,
            _type: kind,
            items: [{ _key: 'item', _type: 'item' as const, title: 'Section', content }],
          };

    await openEditor(page, [container]);
    if (kind === 'accordion')
      await page.getByRole('button', { name: 'Toggle Section', exact: true }).click();

    await page.getByRole('button', { name: 'Insert content', exact: true }).first().click();
    for (const label of ['Tabs', 'Accordion', 'Callout'])
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    await page
      .locator(`[data-terra-block="${kind}"]`)
      .getByRole('button', { name: 'Insert content', exact: true })
      .click();
    for (const label of ['Tabs', 'Accordion', 'Callout'])
      await expect(page.getByRole('option', { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Code', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Add attachment', exact: true })).toBeVisible();
  });
}
