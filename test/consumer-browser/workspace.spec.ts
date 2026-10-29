import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const expectedDocsVersion = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
const expectedStylingVersion = (
  JSON.parse(
    readFileSync(
      new URL('../../node_modules/@terra-symposium/styling/package.json', import.meta.url),
      'utf8',
    ),
  ) as { version: string }
).version;

async function assertViteArtifactVersion(
  page: import('@playwright/test').Page,
  targetUrl: string,
  artifact: 'docs' | 'styling',
): Promise<void> {
  const expectedVersion = artifact === 'docs' ? expectedDocsVersion : expectedStylingVersion;
  const moduleName = artifact === 'docs' ? '@terra-symposium_docs' : '@terra-symposium_styling';
  const entryUrl = new URL(`/node_modules/.vite/deps/${moduleName}.js`, targetUrl);
  const entryResponse = await page.request.get(entryUrl.toString());
  let sourceMap: { sources?: unknown };

  if (artifact === 'docs') {
    expect(entryResponse.ok(), `Vite must expose the Docs client entry for ${targetUrl}`).toBe(
      true,
    );
    const response = await page.request.get(`${entryUrl}.map`);
    expect(response.ok(), `Vite must expose the Docs client source map for ${targetUrl}`).toBe(
      true,
    );
    sourceMap = (await response.json()) as { sources?: unknown };
  } else {
    const host = new URL(targetUrl).host;
    // Styling's own site resolves Styling from its workspace. Uni consumes
    // Docs' compiled stylesheet and has no separate Styling JavaScript entry.
    if (host === '127.0.0.1:4311' || host === '127.0.0.1:5175') return;
    expect(entryResponse.ok(), `Vite must expose the Styling client entry for ${targetUrl}`).toBe(
      true,
    );
    // Styling's optimized entry is a tiny proxy. Its implementation source map
    // belongs to the content-hashed chunk it re-exports.
    const chunkPath = (await entryResponse.text()).match(/from ["']([^"']+\.js)\?v=/)?.[1];
    expect(
      chunkPath,
      `Vite Styling entry has no implementation chunk for ${targetUrl}`,
    ).toBeTruthy();
    const response = await page.request.get(new URL(`${chunkPath}.map`, targetUrl).toString());
    expect(response.ok(), `Vite must expose the Styling client source map for ${targetUrl}`).toBe(
      true,
    );
    sourceMap = (await response.json()) as { sources?: unknown };
  }

  const packageMarker =
    artifact === 'docs' ? '@terra-symposium+docs@' : '@terra-symposium+styling@';
  const source = Array.isArray(sourceMap.sources)
    ? sourceMap.sources.find(
        (candidate): candidate is string =>
          typeof candidate === 'string' && candidate.includes(packageMarker),
      )
    : undefined;

  expect(
    source,
    `Vite client source map for @terra-symposium/${artifact} must identify the package tarball used by ${targetUrl}`,
  ).toBeTruthy();
  const tarballName = artifact === 'docs' ? 'terra-symposium-docs' : 'terra-symposium-styling';
  const actualVersion = source!.match(new RegExp(`${tarballName}-(\\d+\\.\\d+\\.\\d+)\\.tgz`))?.[1];
  expect(
    actualVersion,
    `Vite client source for @terra-symposium/${artifact} should identify its installed tarball: ${source}`,
  ).toBe(expectedVersion);
}

const consumerUrls = (process.env.DOCS_CONSUMER_URLS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const readOnlyUrls = new Set(
  (process.env.DOCS_READ_ONLY_CONSUMER_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const protectedUrls = (process.env.DOCS_PROTECTED_CONSUMER_URLS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function contrastRatio(foreground: string, background: string): number {
  const luminance = (value: string): number => {
    const channels = value
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (!channels || channels.length !== 3) return 0;
    const [red, green, blue] = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function assertDescriptionFits(page: import('@playwright/test').Page): Promise<void> {
  const description = page.locator('#docs-description');
  if (!(await description.inputValue()).trim()) return;
  await expect
    .poll(() =>
      description.evaluate(
        (element: HTMLTextAreaElement) => element.scrollHeight <= element.clientHeight + 1,
      ),
    )
    .toBe(true);
}

async function assertTitleFits(page: import('@playwright/test').Page): Promise<void> {
  const title = page.locator('#docs-title');
  await expect
    .poll(() =>
      title.evaluate((input: HTMLInputElement) => {
        const styles = getComputedStyle(input);
        const size = Number.parseFloat(styles.fontSize);
        const available =
          input.clientWidth -
          Number.parseFloat(styles.paddingLeft || '0') -
          Number.parseFloat(styles.paddingRight || '0');
        const text = input.value || input.placeholder;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context || !text || !Number.isFinite(size) || available <= 0) return false;
        context.font = `${styles.fontStyle} ${styles.fontWeight} ${size}px ${styles.fontFamily}`;
        const letterSpacing = Number.parseFloat(styles.letterSpacing) || 0;
        const textWidth =
          context.measureText(text).width + Math.max(text.length - 1, 0) * letterSpacing;
        return textWidth <= available;
      }),
    )
    .toBe(true);
}

async function waitForThemeControls(
  page: import('@playwright/test').Page,
  scheme: 'light' | 'dark',
): Promise<void> {
  const background = scheme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
  await expect
    .poll(() =>
      page.locator('.docs-theme-scope').evaluate((scope) => getComputedStyle(scope).colorScheme),
    )
    .toBe(scheme);
  await expect
    .poll(() =>
      page
        .getByRole('combobox', { name: 'Mode' })
        .evaluate((control) => getComputedStyle(control).backgroundColor),
    )
    .toBe(background);
  const modeColors = await page.getByRole('combobox', { name: 'Mode' }).evaluate((control) => {
    const styles = getComputedStyle(control);
    return { foreground: styles.color, background: styles.backgroundColor };
  });
  expect(contrastRatio(modeColors.foreground, modeColors.background)).toBeGreaterThanOrEqual(4.5);
  const section = page.getByRole('combobox', { name: 'Section' });
  if (await section.isVisible()) {
    await expect
      .poll(() => section.evaluate((control) => getComputedStyle(control).backgroundColor))
      .toBe(background);
    const sectionColors = await section.evaluate((control) => {
      const styles = getComputedStyle(control);
      return { foreground: styles.color, background: styles.backgroundColor };
    });
    expect(
      contrastRatio(sectionColors.foreground, sectionColors.background),
    ).toBeGreaterThanOrEqual(4.5);
  }
}

async function assertAttachmentToolbarFits(page: import('@playwright/test').Page): Promise<void> {
  const viewport = page.viewportSize();
  const toolbar = page.locator('[data-docs-main-toolbar]');
  const toolbarBox = await toolbar.boundingBox();
  const mode = page.getByRole('combobox', { name: 'Mode' });
  const modeBox = await mode.boundingBox();
  expect(viewport).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  expect(modeBox).not.toBeNull();
  expect(modeBox!.width).toBeGreaterThan(90);
  expect(modeBox!.width).toBeLessThan(220);
  expect(modeBox!.x).toBeGreaterThanOrEqual(toolbarBox!.x);
  expect(modeBox!.x + modeBox!.width).toBeLessThanOrEqual(toolbarBox!.x + toolbarBox!.width);
  const buttons = await toolbar.locator('button').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
      };
    }),
  );
  for (const button of buttons) {
    expect(button.x, `${button.label} starts outside the viewport`).toBeGreaterThanOrEqual(0);
    expect(button.right, `${button.label} exceeds the viewport`).toBeLessThanOrEqual(
      viewport!.width,
    );
    expect(button.y, `${button.label} starts outside the toolbar`).toBeGreaterThanOrEqual(
      toolbarBox!.y,
    );
    expect(button.bottom, `${button.label} exceeds the toolbar`).toBeLessThanOrEqual(
      toolbarBox!.y + toolbarBox!.height,
    );
  }
}

const targetUrls = consumerUrls.length ? consumerUrls : [''];

for (const targetUrl of targetUrls) {
  const label = targetUrl
    ? new URL(targetUrl).host + new URL(targetUrl).pathname
    : 'no URL supplied';
  test(`installed Docs consumer preserves the shared workspace contract: ${label}`, async ({
    page,
  }) => {
    test.skip(!targetUrl, 'Set DOCS_CONSUMER_URLS to one or more installed Docs host URLs.');

    const browserErrors: string[] = [];
    let stage = 'navigation';
    page.on('pageerror', (error) => browserErrors.push(`${stage} pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(`${stage} console: ${message.text()}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400)
        browserErrors.push(`${stage} HTTP ${response.status()}: ${response.url()}`);
    });

    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
    expect(response?.status(), `Consumer route did not load: ${targetUrl}`).toBeLessThan(400);
    await expect(page.locator('.terra-docs-workspace')).toBeVisible({ timeout: 30_000 });
    // Astro's floating development toolbar is tooling, not part of the Docs UI;
    // remove it from visual captures so it cannot obscure the page being reviewed.
    await page.addStyleTag({
      content: 'astro-dev-toolbar, astro-dev-overlay { display: none !important; }',
    });
    await assertViteArtifactVersion(page, targetUrl, 'docs');
    await assertViteArtifactVersion(page, targetUrl, 'styling');
    await expect(page.locator('.terra-docs-document-header')).toBeVisible();
    await expect(page.locator('[data-docs-toolbar-frame]')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search pages' })).toHaveCount(0);
    await expect(page.locator('#docs-title')).toBeVisible();
    await expect(page.locator('#docs-description')).toBeVisible();
    const sidebarTagline = page.getByText('Product and engineering documentation.', {
      exact: true,
    });
    if (await sidebarTagline.count())
      await expect(page.locator('#docs-description')).not.toHaveValue(
        'Product and engineering documentation.',
      );
    await expect(page.locator('[data-sidebar="sidebar"]').filter({ visible: true })).toHaveCount(1);

    const visualContract = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-sidebar="sidebar"]');
      const header = document.querySelector<HTMLElement>('.terra-docs-document-header');
      const title = header?.querySelector<HTMLInputElement>('#docs-title');
      const mobileHeader = document.querySelector<HTMLElement>(
        '.terra-docs-workspace header.md\\:hidden',
      );
      return {
        sidebarBrand: sidebar?.querySelector('a')?.textContent?.trim() ?? '',
        titleFont: title ? getComputedStyle(title).fontFamily : '',
        titleSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
        titleStyle: title ? getComputedStyle(title).fontStyle : '',
        bodyFontSmoothing: getComputedStyle(document.body).webkitFontSmoothing,
        mobileHeaderDisplay: mobileHeader ? getComputedStyle(mobileHeader).display : '',
        sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
      };
    });
    expect(visualContract.sidebarBrand).not.toBe('');
    expect(visualContract.titleFont).toMatch(/Avara|serif/i);
    expect(visualContract.titleSize).toBeGreaterThanOrEqual(32);
    expect(visualContract.mobileHeaderDisplay).toBe('none');
    expect(visualContract.sidebarWidth).toBeGreaterThan(0);
    expect(visualContract.titleStyle).toBe('italic');
    expect(visualContract.bodyFontSmoothing).toBe('antialiased');

    const palette = await page.locator('.terra-docs-workspace').evaluate((workspace) => {
      const styles = getComputedStyle(workspace);
      return ['--primary-1', '--primary-9', '--primary-12', '--secondary-1', '--secondary-9'].map(
        (token) => styles.getPropertyValue(token).trim(),
      );
    });
    expect(palette.every(Boolean), `Host theme tokens are missing: ${targetUrl}`).toBe(true);
    const lightPrimary = palette[0];

    const order = await page.evaluate(() => {
      const header = document.querySelector('.terra-docs-document-header');
      const toolbar = document.querySelector('[data-docs-toolbar-frame]');
      const body = document.querySelector('[data-docs-body-content]');
      return {
        headerBeforeToolbar: Boolean(
          header &&
          toolbar &&
          header.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        toolbarBeforeBody: Boolean(
          toolbar &&
          body &&
          toolbar.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      };
    });
    expect(order).toEqual({ headerBeforeToolbar: true, toolbarBeforeBody: true });
    await assertTitleFits(page);
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-desktop.png`,
      fullPage: true,
    });

    stage = 'breakpoint layout';
    const mobileHeader = page.locator('.terra-docs-workspace header.md\\:hidden');
    await expect
      .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
      .toBe('none');
    await page.setViewportSize({ width: 768, height: 900 });
    await expect
      .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
      .toBe('none');
    await assertDescriptionFits(page);
    await assertTitleFits(page);
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-breakpoint.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 767, height: 900 });
    await expect
      .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
      .toBe('flex');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => mobileHeader.evaluate((element) => getComputedStyle(element).display))
      .toBe('flex');
    await assertDescriptionFits(page);
    await assertTitleFits(page);
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });

    stage = 'dark theme and contrast';
    await page.emulateMedia({ colorScheme: 'dark' });
    await waitForThemeControls(page, 'dark');
    await expect
      .poll(() =>
        page.locator('.docs-theme-scope').evaluate((scope) => getComputedStyle(scope).colorScheme),
      )
      .toBe('dark');
    const darkTheme = await page.locator('.terra-docs-workspace').evaluate((workspace) => {
      const styles = getComputedStyle(workspace);
      const scope = workspace.closest<HTMLElement>('.docs-theme-scope');
      const scopeStyles = scope ? getComputedStyle(scope) : styles;
      return {
        primary: styles.getPropertyValue('--primary-1').trim(),
        foreground: styles.getPropertyValue('--primary-12').trim(),
        colorScheme: scopeStyles.colorScheme,
        background: scopeStyles.backgroundColor,
        text: scopeStyles.color,
      };
    });
    expect(darkTheme.primary).not.toBe(lightPrimary);
    if (darkTheme.colorScheme) expect(darkTheme.colorScheme).toBe('dark');
    if (darkTheme.background !== 'rgba(0, 0, 0, 0)') {
      expect(contrastRatio(darkTheme.text, darkTheme.background)).toBeGreaterThanOrEqual(4.5);
    }
    await assertTitleFits(page);
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-dark-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForThemeControls(page, 'dark');
    await assertTitleFits(page);
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-dark-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: 'light' });
    await waitForThemeControls(page, 'light');

    stage = 'section selector';
    const section = page.getByRole('combobox', { name: 'Section' });
    await section.click();
    const sectionList = page.getByRole('listbox');
    await expect(sectionList).toBeVisible();
    await expect
      .poll(() =>
        sectionList.evaluate(
          (listbox) =>
            listbox.closest('[data-radix-popper-content-wrapper]')?.parentElement === document.body,
        ),
      )
      .toBe(true);
    await page.keyboard.press('Escape');

    stage = 'mode selector and attachments';
    const mode = page.getByRole('combobox', { name: 'Mode' });
    await mode.click();
    await expect(page.getByRole('option', { name: 'Code', exact: true })).toHaveCount(0);
    if (readOnlyUrls.has(targetUrl))
      await expect(page.getByRole('option', { name: 'Edit', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Attachments', exact: true }).click();
    await expect(page.locator('[data-docs-shell]')).toHaveAttribute(
      'data-docs-mode',
      'attachments',
    );
    await expect(page.locator('[data-docs-attachments]')).toBeVisible();
    await assertAttachmentToolbarFits(page);
    await assertTitleFits(page);
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-attachments.png`,
      fullPage: true,
    });

    stage = 'attachments responsive layout';
    await page.setViewportSize({ width: 768, height: 900 });
    await assertAttachmentToolbarFits(page);
    await assertTitleFits(page);
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-attachments-breakpoint.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await assertAttachmentToolbarFits(page);
    await assertTitleFits(page);
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-attachments-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });

    stage = 'dark attachments theme';
    await page.emulateMedia({ colorScheme: 'dark' });
    await waitForThemeControls(page, 'dark');
    await expect
      .poll(() =>
        page.locator('.docs-theme-scope').evaluate((scope) => getComputedStyle(scope).colorScheme),
      )
      .toBe('dark');
    const darkAttachments = await page.locator('.terra-docs-workspace').evaluate((workspace) => {
      const styles = getComputedStyle(workspace);
      const scope = workspace.closest<HTMLElement>('.docs-theme-scope');
      const scopeStyles = scope ? getComputedStyle(scope) : styles;
      const mode = workspace.querySelector<HTMLElement>('[aria-label="Mode"]');
      const controls = [
        ...workspace.querySelectorAll<HTMLElement>('[data-docs-main-toolbar] button'),
      ]
        .filter(
          (control) => control.textContent?.trim() && getComputedStyle(control).display !== 'none',
        )
        .map((control) => {
          let background = 'rgb(255, 255, 255)';
          for (
            let ancestor: HTMLElement | null = control;
            ancestor;
            ancestor = ancestor.parentElement
          ) {
            const candidate = getComputedStyle(ancestor).backgroundColor;
            if (candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') {
              background = candidate;
              break;
            }
          }
          return {
            label: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? '',
            foreground: getComputedStyle(control).color,
            background,
          };
        });
      return {
        primary: styles.getPropertyValue('--primary-1').trim(),
        modeWidth: mode?.getBoundingClientRect().width ?? 0,
        colorScheme: scopeStyles.colorScheme,
        background: scopeStyles.backgroundColor,
        text: scopeStyles.color,
        controls,
      };
    });
    expect(darkAttachments.primary).not.toBe(lightPrimary);
    expect(darkAttachments.modeWidth).toBeGreaterThan(90);
    expect(darkAttachments.modeWidth).toBeLessThan(220);
    if (darkAttachments.colorScheme) expect(darkAttachments.colorScheme).toBe('dark');
    if (darkAttachments.background !== 'rgba(0, 0, 0, 0)') {
      expect(
        contrastRatio(darkAttachments.text, darkAttachments.background),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(darkAttachments.controls.some((control) => control.label === 'Mode')).toBe(true);
    expect(darkAttachments.controls.length).toBeGreaterThan(1);
    for (const control of darkAttachments.controls) {
      expect(
        contrastRatio(control.foreground, control.background),
        `Dark toolbar control “${control.label}” has low contrast in ${targetUrl}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await assertTitleFits(page);
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-dark-attachments.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await assertAttachmentToolbarFits(page);
    await assertTitleFits(page);
    await page.screenshot({
      path: `test-results/consumer-${label.replace(/[^a-z0-9-]+/gi, '-')}-dark-attachments-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: 'light' });
    await waitForThemeControls(page, 'light');

    stage = 'leaf context menu';
    const leafLinks = page.locator('[data-docs-drop^="leaf:"] a');
    if (await leafLinks.count()) {
      const names = await leafLinks.allTextContents();
      expect(names.every((name) => !/\.(?:pdf|zip|png|jpe?g|docx?)$/i.test(name.trim()))).toBe(
        true,
      );
      await leafLinks.first().click({ button: 'right' });
      const contextMenu = page.getByRole('menu').last();
      await expect(contextMenu).toBeVisible();
      await expect(
        contextMenu.getByRole('menuitem', { name: 'Copy link', exact: true }),
      ).toBeVisible();
      const box = await contextMenu.boundingBox();
      const size = page.viewportSize();
      expect(box).not.toBeNull();
      expect(size).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size!.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size!.height);
      await page.keyboard.press('Escape');
    }
    expect(browserErrors, `Browser errors in ${targetUrl}`).toEqual([]);
  });
}

const uniUrl = process.env.DOCS_UNI_URL?.trim() ?? '';
const uniTocPath = process.env.DOCS_UNI_TOC_PATH?.trim() ?? '';
test('Uni hash routes preserve each leaf title and do not rename other index pages', async ({
  page,
}) => {
  test.skip(!uniUrl, 'Set DOCS_UNI_URL to the running Uni Docs app.');
  await page.emulateMedia({ colorScheme: 'light' });
  const javaId = 'BsQUwF6kisLoqnrcb5aIUF';
  const pythonId = 'BsQUwF6kisLoqnrcb5aHos';
  const url = new URL(`/?mode=attachments#${javaId}`, uniUrl);
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await expect(page.locator('.terra-docs-workspace')).toBeVisible();
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false');
  await expect(page.locator('#docs-title')).toHaveValue('Java');
  await expect(page.getByRole('link', { name: 'Languages', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Python', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Java', exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-docs-mode', 'attachments');
  const modeWidth = await page
    .getByRole('combobox', { name: 'Mode' })
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(modeWidth).toBeGreaterThan(90);
  expect(modeWidth).toBeLessThan(220);
  expect(new URL(page.url()).pathname).toBe('/');
  expect(new URL(page.url()).hash).toBe(`#${javaId}`);

  const leafTitles = await page.locator('[data-docs-drop^="leaf:"] a').allTextContents();
  const normalizedLeafTitles = leafTitles.map((title) => title.trim());
  expect(normalizedLeafTitles.slice(0, 3)).toEqual(['Languages', 'Python', 'Java']);
  expect(new Set(normalizedLeafTitles).size).toBeGreaterThan(20);
  expect(normalizedLeafTitles.filter((title) => title === 'Java')).toHaveLength(1);
  expect(leafTitles.map((title) => title.trim())).toContain('Languages');
  expect(leafTitles.map((title) => title.trim())).toContain('Python');
  expect(leafTitles.map((title) => title.trim())).toContain('Java');
  if (uniTocPath) {
    const sections = JSON.parse(readFileSync(uniTocPath, 'utf8')) as Array<{
      title: string;
      groups?: Array<{ leaves?: Array<{ id: string; title: string }> }>;
    }>;
    const selectedSectionTitle = await page.getByRole('combobox', { name: 'Section' }).innerText();
    const selectedSection = sections.find(
      (section) => section.title === selectedSectionTitle.trim(),
    );
    expect(selectedSection, `No Uni TOC section matches ${selectedSectionTitle}`).toBeTruthy();
    const expected = new Map(
      (selectedSection?.groups ?? []).flatMap((group) =>
        (group.leaves ?? []).map((leaf) => [leaf.id, leaf.title] as const),
      ),
    );
    const actual = await page.locator('[data-docs-drop^="leaf:"] a').evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        title: anchor.textContent?.trim() ?? '',
        id: decodeURIComponent(
          new URL(anchor.getAttribute('href') ?? '', location.href).hash.slice(1),
        ),
      })),
    );
    expect(actual).toHaveLength(expected.size);
    for (const leaf of actual) expect(expected.get(leaf.id)).toBe(leaf.title);
  }
  await assertTitleFits(page);
  await page.screenshot({ path: 'test-results/consumer-uni-java-attachments.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await waitForThemeControls(page, 'dark');
  await assertTitleFits(page);
  await page.screenshot({
    path: 'test-results/consumer-uni-java-dark-attachments.png',
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await waitForThemeControls(page, 'light');

  await page.getByRole('link', { name: 'Python', exact: true }).click();
  await expect(page.locator('#docs-title')).toHaveValue('Python');
  await expect(page.getByRole('link', { name: 'Languages', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Java', exact: true }).first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
  expect(new URL(page.url()).hash).toBe(`#${pythonId}`);

  // Choosing a different TOC section is a view filter; the current page route
  // remains in Programming. When host navigation then changes to another
  // Programming leaf, both the active leaf and the section selector must
  // follow the incoming hash instead of retaining the temporary filter.
  const section = page.getByRole('combobox', { name: 'Section' });
  await section.click();
  await page.getByRole('option', { name: 'Professional', exact: true }).click();
  await expect(section).toContainText('Professional');
  await page.evaluate((id) => {
    window.location.hash = `#${id}`;
  }, javaId);
  await expect(page.locator('#docs-title')).toHaveValue('Java');
  await expect(section).toContainText('Programming');
  await expect(page.getByRole('link', { name: 'Languages', exact: true })).toBeVisible();
});

test('Uni local text attachments open with the adjacent file content', async ({ page }) => {
  test.skip(!uniUrl || !uniTocPath, 'Set the Uni consumer URL and TOC path.');
  const sections = JSON.parse(readFileSync(uniTocPath, 'utf8')) as Array<{
    groups?: Array<{
      leaves?: Array<{
        id: string;
        path: string;
        title: string;
        attachments?: Array<{ name: string; path: string }>;
      }>;
    }>;
  }>;
  const leaf = sections
    .flatMap((section) => section.groups ?? [])
    .flatMap((group) => group.leaves ?? [])
    .find(
      (candidate) =>
        candidate.title === 'C++ Basics' &&
        candidate.attachments?.some((item) => item.name.endsWith('.txt')),
    );
  expect(leaf, 'C++ Basics should retain its local lecture-note attachments').toBeTruthy();
  const attachment = leaf!.attachments!.find((item) => item.name.endsWith('.txt'))!;
  const repoRoot = resolve(dirname(uniTocPath), '..');
  const filePath = resolve(dirname(resolve(repoRoot, leaf!.path)), attachment.path);
  const source = readFileSync(filePath, 'utf8');
  expect(source.trim().length).toBeGreaterThan(20);

  const url = new URL(`/?mode=attachments#${encodeURIComponent(leaf!.id)}`, uniUrl);
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await expect(page.locator('[data-docs-attachments]')).toHaveAttribute('data-loading', 'false');
  const card = page.getByRole('button', { name: `Attachment ${attachment.name}`, exact: true });
  await expect(card).toBeVisible();
  await card.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(attachment.name);
  await expect(dialog.locator('.docs-code-block')).toContainText(source.trim().slice(0, 120));
});

for (const targetUrl of protectedUrls) {
  test(`protected Docs host denies a signed-out browser: ${new URL(targetUrl).host}${new URL(targetUrl).pathname}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
    expect(response?.status(), `Protected route did not respond: ${targetUrl}`).toBeLessThan(400);
    await expect(page).toHaveURL(/\/dashboard\/sign-in(?:\?|$)/);
    await expect(page.locator('.terra-docs-workspace')).toHaveCount(0);
    expect(errors, `Browser errors on signed-out redirect from ${targetUrl}`).toEqual([]);
  });
}
