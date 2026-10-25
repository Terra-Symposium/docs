import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
});

test('standalone Astro pages mount the extracted read-only workspace with their nested navigation', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Terra Docs', exact: true }).first()).toBeVisible();
	await expect(page.getByRole('link', { name: 'Create an instance' })).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Section' })).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Mode' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Search pages' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Install an instance' })).toBeVisible();
	await page.screenshot({ path: '/tmp/terra-docs-static-desktop.png', fullPage: true });

	await page.getByRole('combobox', { name: 'Section' }).click();
	await page.getByRole('option', { name: 'Configure' }).click();
	await expect(page.getByRole('link', { name: 'Storage providers' })).toBeVisible();
	await page.getByRole('link', { name: 'Storage providers' }).click();
	await expect(page).toHaveURL(/\/storage\//);
	await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Storage providers');
});

test('shared workspace keeps the Terra header, toolbar position, section navigation, and nested leaf actions', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/workspace-demo/');
	await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Salesphere');
	await expect(page.getByRole('link', { name: 'Salesphere Docs' })).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Section' })).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Mode' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Search pages' })).toBeVisible();
	await expect(page.getByText(/Last modified/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Actions for section Overview' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Actions for group Start here' })).toBeVisible();

	const toolbarPosition = await page.evaluate(() => {
		const header = document.querySelector('.terra-docs-document-header');
		const toolbar = document.querySelector('[data-docs-toolbar-frame]');
		const mode = document.querySelector<HTMLElement>('[aria-label="Mode"]');
		return {
			followsHeader: !!header && !!toolbar && Boolean(header.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING),
			modeWidth: mode?.getBoundingClientRect().width ?? 0,
		};
	});
	expect(toolbarPosition.followsHeader).toBeTruthy();
	expect(toolbarPosition.modeWidth).toBeGreaterThanOrEqual(145);
	expect(toolbarPosition.modeWidth).toBeLessThan(180);

	await page.getByRole('combobox', { name: 'Section' }).click();
	await page.getByRole('option', { name: 'Configure' }).click();
	await expect(page.getByRole('link', { name: 'Local files' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Search pages' }).fill('local');
	await expect(page.getByRole('link', { name: 'Local files' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Storage providers' })).toHaveCount(0);
	await page.getByRole('textbox', { name: 'Search pages' }).clear();
	await page.getByRole('combobox', { name: 'Section' }).click();
	await page.getByRole('option', { name: 'Overview' }).click();

	const leaf = page.getByRole('link', { name: 'Salesphere', exact: true });
	await page.getByRole('button', { name: 'Actions for section Overview' }).click();
	for (const name of ['Manage attachments', 'Download section', 'Rename section', 'Change color', 'Delete section']) {
		await expect(page.getByRole('menuitem', { name })).toBeVisible();
	}
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Actions for group Start here' }).click();
	for (const name of ['Add page', 'Manage attachments', 'Download group', 'Rename group', 'Delete group']) {
		await expect(page.getByRole('menuitem', { name })).toBeVisible();
	}
	await page.getByRole('menuitem', { name: 'Manage attachments' }).click();
	await expect(page.getByRole('dialog')).toContainText('Manage Attachments');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Actions for group Start here' }).click();
	await expect(page.getByRole('menuitem', { name: 'Add page' })).toBeVisible();
	await page.keyboard.press('Escape');
	await leaf.click({ button: 'right' });
	await expect(page.getByRole('menuitem', { name: 'Files' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Rename page' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Delete page' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Duplicate page' })).toBeVisible();
	await page.waitForTimeout(250);
	await page.screenshot({ path: '/tmp/terra-docs-leaf-context-menu.png', fullPage: true });
	await page.keyboard.press('Escape');
	await leaf.hover();
	await expect(page.getByRole('button', { name: 'Reorder item' }).last()).toBeVisible();
	const sourceRow = page.locator('[data-docs-drop]').filter({ hasText: 'Salesphere' });
	const targetRow = page.locator('[data-docs-drop]').filter({ hasText: 'Runtime map' });
	await sourceRow.getByRole('button', { name: 'Reorder item' }).dragTo(targetRow);
	await expect.poll(() => page.evaluate(() => (window as Window & { __terraDocsActionCalls?: Array<{ operation: string }> }).__terraDocsActionCalls?.some(call => call.operation === 'write.doc.reorder'))).toBe(true);

	await page.screenshot({ path: '/tmp/terra-docs-shared-desktop.png', fullPage: true });
});

test('shared workspace performs deletion and opens attachment management from its original controls', async ({ page }) => {
	await page.goto('/workspace-demo/');
	await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Salesphere');
	await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-docs-mode', 'view');
	const leaf = page.getByRole('link', { name: 'Salesphere', exact: true });
	await leaf.click({ button: 'right' });
	await expect(page.getByRole('menuitem', { name: 'Delete page' })).toBeVisible();
	await page.getByRole('menuitem', { name: 'Delete page' }).click();
	await expect(page.getByRole('dialog')).toContainText('Delete page?');
	await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
	await expect.poll(() => page.evaluate(() => (window as Window & { __terraDocsActionCalls?: Array<{ operation: string }> }).__terraDocsActionCalls?.some(call => call.operation === 'write.doc.rm'))).toBe(true);

	await page.getByRole('combobox', { name: 'Mode' }).click();
	await page.getByRole('option', { name: 'Attachments' }).click();
	await expect(page.locator('[data-docs-attachments]')).toBeVisible();
	await expect(page.getByText('Product brief.pdf')).toBeVisible();
	await page.locator('[data-docs-attachments]').evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })));
	await expect(page.getByRole('dialog')).toContainText('Add Attachment');
	await expect(page.getByRole('button', { name: 'Add Document attachment' })).toBeVisible();
});

test('remote editors get visual authoring controls while Code remains document content, not a mode', async ({ page }) => {
	await page.goto('/workspace-demo/');
	const mode = page.getByRole('combobox', { name: 'Mode' });
	await mode.click();
	await expect(page.getByRole('option', { name: 'Edit' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Code', exact: true })).toHaveCount(0);
	await page.getByRole('option', { name: 'Edit' }).click();
	await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-docs-mode', 'edit');
	await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Block type' })).toBeVisible();
	await expect(page.getByText('e.replace is not a function')).toHaveCount(0);
	await page.screenshot({ path: '/tmp/terra-docs-edit-desktop.png', fullPage: true });
	await page.getByRole('combobox', { name: 'Block type' }).click();
	await expect(page.getByRole('option', { name: 'Insert accordion' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Insert tabs' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Insert table' })).toBeVisible();
});

test('local read-only workspaces expose View and Attachments, with leaf files in the Attachments mode', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/workspace-readonly/');
	const mode = page.getByRole('combobox', { name: 'Mode' });
	await mode.click();
	await expect(page.getByRole('option', { name: 'Edit' })).toHaveCount(0);
	await expect(page.getByRole('option', { name: 'Code', exact: true })).toHaveCount(0);
	await page.getByRole('option', { name: 'Attachments' }).click();
	await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-docs-mode', 'attachments');
	await expect(page.getByText('Product brief.pdf')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.screenshot({ path: '/tmp/terra-docs-shared-mobile.png', fullPage: true });
});
