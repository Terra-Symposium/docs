import { expect, test } from '@playwright/test';

// The PNGs beside this test were captured from the pinned website checkout at
// cad2bae15a975d32f60a01b60693c5e0b5c90ed2 using its parity-baseline route,
// hue 145, and the exact viewport/state below. Only Astro's injected dev UI is
// excluded from the package capture.
const referenceStyle = 'astro-dev-toolbar, astro-dev-overlay { display: none !important; }';
const screenshotTolerance = { threshold: 0.1, maxDiffPixelRatio: 0.002 };

async function openParityFixture(page: import('@playwright/test').Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/parity-demo/');
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false');
  await expect(page.locator('.terra-docs-document-header')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function expectOriginalScreenshot(
  page: import('@playwright/test').Page,
  name: string,
): Promise<void> {
  await expect(page).toHaveScreenshot(`original-${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    style: referenceStyle,
    ...screenshotTolerance,
  });
}

async function setMode(
  page: import('@playwright/test').Page,
  mode: 'View' | 'Edit' | 'Attachments',
): Promise<void> {
  await page.getByRole('combobox', { name: 'Mode' }).click();
  await page.getByRole('option', { name: mode, exact: true }).click();
}

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'breakpoint', width: 768, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

for (const viewport of viewports) {
  test(`pinned Terra Docs UI parity: ${viewport.name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/parity-demo/');
    await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false');
    await expect(page.getByRole('heading', { name: 'Start with the product' })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });
    await page.mouse.move(0, 0);

    await expect(page.getByRole('textbox', { name: 'Search pages' })).toHaveCount(0);
    await expect(page.locator('.terra-docs-document-header')).toBeVisible();
    await expect(page.locator('[data-docs-toolbar-frame]')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
      'Salesphere',
    );
    await expect
      .poll(() =>
        page.locator('body').evaluate((body) => getComputedStyle(body).webkitFontSmoothing),
      )
      .toBe('antialiased');

    await expect(page).toHaveScreenshot(`original-${viewport.name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      // The pinned source is an Astro dev server and injects its dev toolbar.
      // That browser tooling is not part of the Docs UI captured by the golden.
      style: referenceStyle,
      ...screenshotTolerance,
    });
    expect(errors, `Browser errors at ${viewport.width}x${viewport.height}`).toEqual([]);
  });
}

test('long document descriptions remain fully visible at responsive widths', async ({ page }) => {
  const description =
    'This deliberately long document description wraps onto several lines at narrow viewports. The header must expand to show every line, keep the mode toolbar below it, and never hide the final sentence.';
  await page.goto('/parity-demo/');
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false');
  await page.evaluate((value) => {
    const key = 'terra-docs-workspace-demo-v1';
    const fixture = JSON.parse(localStorage.getItem(key) ?? '{}');
    fixture.documents.salesphere.description = value;
    localStorage.setItem(key, JSON.stringify(fixture));
    window.dispatchEvent(new CustomEvent('terra-docs-fixture-updated'));
  }, description);

  const field = page.locator('#docs-description');
  await expect(field).toHaveValue(description);

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'breakpoint', width: 768, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect
      .poll(() =>
        field.evaluate(
          (element: HTMLTextAreaElement) => element.scrollHeight <= element.clientHeight + 1,
        ),
      )
      .toBe(true);
    const layout = await page.evaluate(() => {
      const description = document.querySelector<HTMLTextAreaElement>('#docs-description');
      const toolbar = document.querySelector<HTMLElement>('[data-docs-toolbar-frame]');
      if (!description || !toolbar) return null;
      return {
        descriptionHeight: description.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(description).lineHeight),
        descriptionBottom: description.getBoundingClientRect().bottom,
        toolbarTop: toolbar.getBoundingClientRect().top,
      };
    });
    expect(layout).not.toBeNull();
    expect(layout!.descriptionHeight).toBeGreaterThanOrEqual(layout!.lineHeight * 2);
    if (viewport.width < 768)
      expect(layout!.descriptionHeight).toBeGreaterThan(layout!.lineHeight * 2);
    expect(layout!.descriptionBottom).toBeLessThanOrEqual(layout!.toolbarTop);
    await page.screenshot({
      path: `test-results/description-${viewport.name}.png`,
      fullPage: true,
      style: referenceStyle,
    });
  }
});

test('pinned Terra Docs toolbar mode menu matches the original', async ({ page }) => {
  await openParityFixture(page);
  await page.getByRole('combobox', { name: 'Mode' }).click();
  await expect(page.getByRole('option', { name: 'View', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Attachments', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Code', exact: true })).toHaveCount(0);
  await expectOriginalScreenshot(page, 'mode-menu');
});

test('pinned Terra Docs visual editor toolbar matches the original', async ({ page }) => {
  await openParityFixture(page);
  await setMode(page, 'Edit');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Block type' })).toBeVisible();
  await expectOriginalScreenshot(page, 'edit-mode');
});

test('Terra Docs attachments mode uses a compact selector and preserves the empty state', async ({
  page,
}) => {
  await openParityFixture(page);
  await page.evaluate(() => {
    const key = 'terra-docs-workspace-demo-v1';
    const state = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (state.documents?.salesphere) state.documents.salesphere.attachments = [];
    localStorage.setItem(key, JSON.stringify(state));
    window.dispatchEvent(new Event('terra-docs-fixture-updated'));
  });
  await setMode(page, 'Attachments');
  await expect(page.locator('[data-docs-attachments]')).toHaveAttribute('data-loading', 'false');
  await expect(page.getByText('No attachments found.', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.mouse.move(0, 0);
  // The original website used a full-width mode select here. The shared Docs
  // toolbar intentionally keeps this selector content-sized so attachment
  // filters stay on the same row; original-attachments-mode.png remains the
  // pinned pre-abstraction reference for documenting that single change.
  await expect(page).toHaveScreenshot('compact-attachments-mode.png', {
    animations: 'disabled',
    caret: 'hide',
    style: referenceStyle,
    ...screenshotTolerance,
  });
});

test('pinned Terra Docs leaf context menu matches the original', async ({ page }) => {
  await openParityFixture(page);
  await page.getByRole('link', { name: 'Salesphere', exact: true }).click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Rename page', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Files', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Duplicate page', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Delete page', exact: true })).toBeVisible();
  await expectOriginalScreenshot(page, 'leaf-context-menu');
});

test('pinned Terra Docs group context menu matches the original', async ({ page }) => {
  await openParityFixture(page);
  await expect(page.getByRole('button', { name: /Actions for group/ })).toHaveCount(0);
  await page.locator('[data-docs-drop^="branch:"]').filter({ hasText: 'Start here' }).hover();
  await expect(page.getByRole('button', { name: /Actions for group/ })).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.mouse.click(169, 160, { button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Add page', exact: true })).toBeVisible();
  await expect(
    menu.getByRole('menuitem', { name: 'Manage attachments', exact: true }),
  ).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Delete group', exact: true })).toBeVisible();
  await expectOriginalScreenshot(page, 'group-context-menu');
});

test('pinned Terra Docs attachment management dialog matches the original', async ({ page }) => {
  await openParityFixture(page);
  await page.mouse.click(169, 160, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Manage attachments', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Manage Attachments — Start here/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('position', 'fixed');
  await expect(page.locator('[data-state="open"].fixed').first()).toHaveCSS('position', 'fixed');
  await expect(page.locator('[data-state="open"].fixed').first()).toHaveCSS('height', '1000px');
  await expect(dialog.getByText('Salesphere', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Runtime map', { exact: true })).toBeVisible();
  await expectOriginalScreenshot(page, 'attachment-management-dialog');
});
