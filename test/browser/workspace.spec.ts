import { expect, test, type Page } from '@playwright/test';

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    errors.push(
      `Request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`,
    );
  });
  await page.addInitScript(() => {
    const resetKey = 'terra-docs-fixture-initialized';
    if (sessionStorage.getItem(resetKey) === 'true') return;
    localStorage.removeItem('terra-docs-workspace-demo-v1');
    sessionStorage.setItem(resetKey, 'true');
  });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? [], 'Unhandled browser errors').toEqual([]);
});

test('standalone Astro pages mount the extracted read-only workspace with their nested navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Terra Docs', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create an instance' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Section' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Mode' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search pages' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Install an instance' })).toBeVisible();
  await page.screenshot({ path: '/tmp/terra-docs-static-desktop.png', fullPage: true });
  const mobileHeader = page.locator('.terra-docs-workspace header.md\\:hidden');
  await expect
    .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
    .toBe('none');
  await page.setViewportSize({ width: 768, height: 900 });
  await expect
    .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
    .toBe('none');
  await page.screenshot({ path: '/tmp/terra-docs-static-breakpoint.png', fullPage: true });
  await page.setViewportSize({ width: 767, height: 900 });
  await expect
    .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
    .toBe('flex');
  await page.screenshot({ path: '/tmp/terra-docs-static-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('combobox', { name: 'Section' }).click();
  await page.getByRole('option', { name: 'Configure' }).click();
  await expect(page.getByRole('link', { name: 'Storage providers' })).toBeVisible();
  await page.getByRole('link', { name: 'Storage providers' }).click();
  await expect(page).toHaveURL(/\/storage\//);
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Storage providers');
});

test('shared workspace keeps the Terra header, toolbar position, section navigation, and nested leaf actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/workspace-demo/');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Salesphere');
  await expect(page.getByRole('link', { name: 'Salesphere Docs' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Section' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Mode' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search pages' })).toHaveCount(0);
  await expect(page.getByText(/Last modified/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for section Overview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for group Start here' })).toBeVisible();

  const toolbarPosition = await page.evaluate(() => {
    const header = document.querySelector('.terra-docs-document-header');
    const toolbar = document.querySelector('[data-docs-toolbar-frame]');
    const mode = document.querySelector<HTMLElement>('[aria-label="Mode"]');
    return {
      followsHeader:
        !!header &&
        !!toolbar &&
        Boolean(header.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING),
      modeWidth: mode?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(toolbarPosition.followsHeader).toBeTruthy();
  expect(toolbarPosition.modeWidth).toBeGreaterThanOrEqual(145);
  expect(toolbarPosition.modeWidth).toBeLessThan(180);
  const hostPalette = await page.evaluate(() => {
    const host = document.querySelector('.workspace-demo-theme');
    const workspace = document.querySelector('.terra-docs-workspace');
    return {
      host: host ? getComputedStyle(host).getPropertyValue('--primary-9').trim() : '',
      workspace: workspace
        ? getComputedStyle(workspace).getPropertyValue('--primary-9').trim()
        : '',
    };
  });
  expect(hostPalette.host).not.toBe('');
  expect(hostPalette.workspace).toBe(hostPalette.host);

  const mobileHeader = page.locator('.terra-docs-workspace header.md\\:hidden');
  await expect
    .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
    .toBe('none');
  await page.setViewportSize({ width: 768, height: 900 });
  await expect
    .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
    .toBe('none');
  await page.setViewportSize({ width: 767, height: 900 });
  await expect
    .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
    .toBe('flex');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('combobox', { name: 'Section' }).click();
  await page.getByRole('option', { name: 'Configure' }).click();
  await expect(page.getByRole('link', { name: 'Local files' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Section' }).click();
  await page.getByRole('option', { name: 'Overview' }).click();

  const leaf = page.getByRole('link', { name: 'Salesphere', exact: true });
  await page.getByRole('button', { name: 'Actions for section Overview' }).click();
  for (const name of [
    'Manage attachments',
    'Download section',
    'Rename section',
    'Change color',
    'Delete section',
  ]) {
    await expect(page.getByRole('menuitem', { name })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Actions for group Start here' }).click();
  for (const name of [
    'Add page',
    'Manage attachments',
    'Download group',
    'Rename group',
    'Delete group',
  ]) {
    await expect(page.getByRole('menuitem', { name })).toBeVisible();
  }
  await page.getByRole('menuitem', { name: 'Manage attachments' }).click();
  await expect(page.getByRole('dialog')).toContainText('Manage Attachments');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Actions for group Start here' }).click();
  await expect(page.getByRole('menuitem', { name: 'Add page' })).toBeVisible();
  await page.keyboard.press('Escape');
  await leaf.click({ button: 'right' });
  const contextMenu = page.getByRole('menu');
  await expect(contextMenu).toBeVisible();
  await expect
    .poll(() =>
      contextMenu.evaluate(
        (menu) =>
          menu.closest('[data-radix-popper-content-wrapper]')?.parentElement === document.body,
      ),
    )
    .toBe(true);
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
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & { __terraDocsActionCalls?: Array<{ operation: string }> }
        ).__terraDocsActionCalls?.some((call) => call.operation === 'write.doc.reorder'),
      ),
    )
    .toBe(true);

  await page.screenshot({ path: '/tmp/terra-docs-shared-desktop.png', fullPage: true });
});

test('shared workspace performs deletion and opens attachment management from its original controls', async ({
  page,
}) => {
  await page.goto('/workspace-demo/');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Salesphere');
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-docs-mode', 'view');
  const leaf = page.getByRole('link', { name: 'Runtime map', exact: true });
  await leaf.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Delete page' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Delete page' }).click();
  await expect(page.getByRole('dialog')).toContainText('Delete page?');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & { __terraDocsActionCalls?: Array<{ operation: string }> }
        ).__terraDocsActionCalls?.some((call) => call.operation === 'write.doc.rm'),
      ),
    )
    .toBe(true);
  await expect(page.getByRole('link', { name: 'Runtime map', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Salesphere');

  await page.getByRole('combobox', { name: 'Mode' }).click();
  await page.getByRole('option', { name: 'Attachments' }).click();
  await expect(page.locator('[data-docs-attachments]')).toBeVisible();
  await expect(page.getByText('Product brief.pdf')).toBeVisible();
  await page
    .locator('[data-docs-attachments]')
    .evaluate((element) =>
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })),
    );
  await expect(page.getByRole('dialog')).toContainText('Add Attachment');
  await expect(page.getByRole('button', { name: 'Add Document attachment' })).toBeVisible();
});

test('tree create, rename, duplicate, download, and delete persist through the host adapter', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/workspace-demo/');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Salesphere');

  await page.getByRole('button', { name: 'Actions for group Start here' }).click();
  await page.getByRole('menuitem', { name: 'Add page', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: 'Add Page' });
  await createDialog.getByRole('textbox', { name: 'Page title' }).fill('Regression fixture page');
  await createDialog.getByRole('button', { name: 'Save', exact: true }).click();
  const created = page.getByRole('link', { name: 'Regression fixture page', exact: true });
  await expect(created).toBeVisible();

  await created.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename page', exact: true }).click();
  const renameDialog = page.getByRole('dialog', { name: 'Rename page' });
  await expect(renameDialog).toBeVisible();
  await renameDialog.getByRole('textbox').fill('Regression page renamed');
  await renameDialog.getByRole('button', { name: 'Save', exact: true }).click();
  const renamed = page.getByRole('link', { name: 'Regression page renamed', exact: true });
  await expect(renamed).toBeVisible();

  await renamed.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate page', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'By content (Duplicate leaf)', exact: true }).click();
  const duplicateDialog = page.getByRole('dialog', { name: 'Duplicate by Content' });
  await duplicateDialog
    .getByRole('textbox', { name: 'New page name' })
    .fill('Regression page copy');
  await duplicateDialog.getByRole('button', { name: 'Save', exact: true }).click();
  const duplicate = page.getByRole('link', { name: 'Regression page copy', exact: true });
  await expect(duplicate).toBeVisible();

  await duplicate.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Download page', exact: true }).click();
  const exportDialog = page.getByRole('dialog');
  await expect(exportDialog).toBeVisible();
  const download = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Download ZIP', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/i);

  await duplicate.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete page', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Delete page?' });
  await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(duplicate).toHaveCount(0);

  const storedBeforeReload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}'),
  );
  expect(
    Object.values(storedBeforeReload.documents).map((item: { title: string }) => item.title),
  ).toContain('Regression page renamed');
  expect(
    Object.values(storedBeforeReload.documents).map((item: { title: string }) => item.title),
  ).not.toContain('Regression page copy');

  await page.goto('/workspace-demo/');
  await expect(
    page.getByRole('link', { name: 'Regression page renamed', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Regression page copy', exact: true })).toHaveCount(
    0,
  );
});

test('leaf reorder is stored and appears in the same order after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/workspace-demo/');
  const sourceRow = page.locator('[data-docs-drop]').filter({ hasText: 'Salesphere' });
  const targetRow = page.locator('[data-docs-drop]').filter({ hasText: 'Runtime map' });
  await sourceRow.getByRole('button', { name: 'Reorder item' }).dragTo(targetRow);

  const orderedIds = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}');
    return state.tree[0].children[0].children.map((node: { origName: string }) => node.origName);
  });
  expect(orderedIds).toEqual(['runtime-map', 'salesphere']);

  await page.reload();
  const labels = await page.locator('[data-docs-drop]').allTextContents();
  expect(labels.findIndex((label) => label.includes('Runtime map'))).toBeLessThan(
    labels.findIndex((label) => label.includes('Salesphere')),
  );
});

test('attachment upload, open, download, and deletion persist across reloads', async ({ page }) => {
  await page.goto('/workspace-demo/');
  const mode = page.getByRole('combobox', { name: 'Mode' });
  await mode.click();
  await page.getByRole('option', { name: 'Attachments' }).click();
  const attachments = page.locator('[data-docs-attachments]');
  await expect(attachments).toHaveAttribute('data-loading', 'false');

  const filename = 'workspace-fixture-attachment.txt';
  await page.getByTestId('docs-attachment-upload').setInputFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from('Persistent attachment fixture content.'),
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & { __terraDocsActionCalls?: Array<{ operation: string }> }
        ).__terraDocsActionCalls?.some((call) => call.operation === 'write.asset.upload'),
      ),
    )
    .toBe(true);
  await expect(page.getByText(filename, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: `Attachment ${filename}`, exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Asset', exact: true }).click();
  expect((await download).suggestedFilename()).toBe(filename);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  const attachmentCard = page.getByRole('button', { name: `Attachment ${filename}`, exact: true });
  await attachmentCard.click({ button: 'right' });
  const attachmentMenu = page.locator('[data-docs-attachment-menu]');
  await expect(attachmentMenu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await attachmentMenu.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.getByText(filename, { exact: true })).toHaveCount(0);

  const stateWithoutAttachment = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}'),
  );
  expect(stateWithoutAttachment.documents.salesphere.attachments).not.toContainEqual(
    expect.objectContaining({ name: filename }),
  );
  expect(
    Object.values(stateWithoutAttachment.assets).map((asset: { name: string }) => asset.name),
  ).not.toContain(filename);

  await page.goto('/workspace-demo/?section=overview&group=start-here&leaf=salesphere');
  await page.getByRole('combobox', { name: 'Mode' }).click();
  await page.getByRole('option', { name: 'Attachments' }).click();
  await expect(page.getByText(filename, { exact: true })).toHaveCount(0);
});

test('visual edits save, reload, and restore a prior revision through history', async ({
  page,
}) => {
  await page.goto('/workspace-demo/');
  const mode = page.getByRole('combobox', { name: 'Mode' });
  await mode.click();
  await page.getByRole('option', { name: 'Edit' }).click();
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  await title.fill('Salesphere saved title');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(title).toHaveValue('Salesphere saved title');

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}'),
  );
  expect(saved.documents.salesphere.title).toBe('Salesphere saved title');
  expect(saved.documents.salesphere.versions).toHaveLength(1);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Salesphere saved title',
  );
  await page.getByRole('combobox', { name: 'Mode' }).click();
  await page.getByRole('option', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Version History' }).click();
  const history = page.getByRole('dialog', { name: 'Version History' });
  await expect(history).toBeVisible();
  const versionSelect = history.getByRole('combobox', { name: 'Select a version...' });
  await versionSelect.click();
  await page.getByRole('option', { name: /Salesphere \(/ }).click();
  await history.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Salesphere');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Salesphere');
});

test('deleting the active leaf switches to the next available page', async ({ page }) => {
  await page.goto('/workspace-demo/');
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Salesphere');
  await page.getByRole('link', { name: 'Salesphere', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete page', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete page?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Runtime map',
  );
  await expect(page.getByRole('heading', { name: 'Runtime map', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Mode' })).toBeVisible();
});

test('section creation is retained, and menus remain keyboard accessible and portaled', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/workspace-demo/');
  const mode = page.getByRole('combobox', { name: 'Mode' });
  await mode.click();
  await expect(page.getByRole('option', { name: 'Edit' })).toBeVisible();
  await page.keyboard.press('Escape');
  const section = page.getByRole('combobox', { name: 'Section' });
  await section.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole('listbox')
        .evaluate(
          (listbox) =>
            listbox.closest('[data-radix-popper-content-wrapper]')?.parentElement === document.body,
        ),
    )
    .toBe(true);
  await page.keyboard.press('Escape');

  await section.click();
  await page.getByRole('option', { name: 'Add section', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Section' });
  await dialog.getByRole('textbox', { name: 'Section name' }).fill('Created from browser');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const value = JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}');
        return value.tree.some((node: { title?: string }) => node.title === 'Created from browser');
      }),
    )
    .toBe(true);

  await page.goto('/workspace-demo/');
  await expect(page.getByRole('combobox', { name: 'Section' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Section' }).click();
  await expect(page.getByRole('option', { name: 'Created from browser' })).toBeVisible();
});

test('remote editors get visual authoring controls while Code remains document content, not a mode', async ({
  page,
}) => {
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

test('local read-only workspaces expose View and Attachments, with leaf files in the Attachments mode', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workspace-readonly/');
  const mode = page.getByRole('combobox', { name: 'Mode' });
  await mode.click();
  await expect(page.getByRole('option', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Code', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'Attachments' }).click();
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-docs-mode', 'attachments');
  await expect(page.getByText('Product brief.pdf')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '/tmp/terra-docs-shared-mobile.png', fullPage: true });
});

test('host branding stays in the sidebar while leaf metadata stays in the document header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/workspace-readonly/');
  await expect(page.getByRole('link', { name: 'Salesphere Docs' })).toBeVisible();
  const header = page.locator('.terra-docs-document-header');
  await expect(header).toContainText('Salesphere');
  await expect(header).toContainText('A page level description for the Salesphere overview.');
  await expect(header).not.toContainText('Product and engineering documentation.');
  await expect(page.getByRole('textbox', { name: 'Search pages' })).toHaveCount(0);
});
