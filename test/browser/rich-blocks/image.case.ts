import { openEditor } from '../support/editor.js';
import { expect, test } from '@playwright/test';
import type { TerraContent } from '../support/editor.js';

const imageFixture = [
	{
		_key: 'image-under-test',
		_type: 'docImage',
		url: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
		alt: 'A one-pixel Terra image',
		title: 'Original caption',
		width: '120',
		height: '80',
	},
] satisfies TerraContent;

test('image.spec: Render metadata and emit field edits', async ({ page }) => {
	await openEditor(page, imageFixture);
	const image = page.locator('[data-terra-block="docImage"]');
	await expect(image.getByRole('img', { name: 'A one-pixel Terra image' })).toBeVisible();
	await expect(image.getByText('Original caption')).toBeVisible();

	const updatedURL = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%222%22 height=%222%22/%3E';
	await image.getByRole('textbox', { name: 'Image URL' }).fill(updatedURL);
	await image.getByRole('textbox', { name: 'Alternative text' }).fill('Updated Terra image');
	await image.getByRole('textbox', { name: 'Caption' }).fill('Updated caption');
	await image.getByRole('textbox', { name: 'Width' }).fill('240');
	await image.getByRole('textbox', { name: 'Height' }).fill('160');
	await expect(image.getByRole('img', { name: 'Updated Terra image' })).toHaveAttribute('src', updatedURL);
	await expect(image.getByText('Updated caption')).toBeVisible();
	await expect
		.poll(async () => {
			const [block] = JSON.parse((await page.getByTestId('editor-output').textContent()) ?? '[]') as typeof imageFixture;
			return [block?.url, block?.alt, block?.title, block?.width, block?.height];
		})
		.toEqual([updatedURL, 'Updated Terra image', 'Updated caption', '240', '160']);
});

test('image.spec: Delete only the selected block', async ({ page }) => {
	await openEditor(page, imageFixture);
	await page.locator('[data-terra-block="docImage"]').getByRole('button', { name: 'Delete image' }).click();
	await expect(page.locator('[data-terra-block="docImage"]')).toHaveCount(0);
	await expect(page.getByTestId('editor-output')).toContainText('[]');
});
