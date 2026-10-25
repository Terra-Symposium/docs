import { openEditor } from '../support/editor.js';
import { expect, test } from '@playwright/test';
import type { TerraContent } from '../support/editor.js';

const embedFixture = [{ _key: 'embed-under-test', _type: 'embed', src: 'about:blank', title: 'Local example', width: '320px', height: '180px' }] satisfies TerraContent;

test('embed.spec: Render title and size without remote requests', async ({ page }) => {
	await openEditor(page, embedFixture);
	const frame = page.getByTitle('Local example');
	await expect(frame).toHaveAttribute('src', 'about:blank');
	await expect(frame).toHaveCSS('width', '320px');
	await expect(frame).toHaveCSS('height', '180px');
});
