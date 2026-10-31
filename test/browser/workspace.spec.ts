import { expect, test, type Page } from '@playwright/test';

const browserErrors = new WeakMap<Page, string[]>();

async function waitForWorkspaceReady(page: Page): Promise<void> {
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false', {
    timeout: 30_000,
  });
  await expect(page.getByRole('combobox', { name: 'Section' })).toBeVisible();
}

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

test('local Markdown thematic breaks render as visible dividers in the Docs workspace', async ({
  page,
}) => {
  await page.addInitScript(
    (fixture) => {
      Object.assign(window, { __terraDocsLocalWorkspaceFixture: fixture });
    },
    {
      tree: [
        {
          type: 'branch',
          origName: 'programming',
          title: 'Programming',
          path: 'programming',
          children: [
            {
              type: 'leaf',
              origName: 'divider-page',
              title: 'Divider page',
              path: 'programming/divider-page/index.md',
              url: '/docs/divider-page/',
            },
          ],
        },
      ],
      pages: [
        {
          id: 'divider-page',
          path: 'content/programming/divider-page/index.md',
          pathname: '/docs/divider-page/',
          title: 'Divider page',
          markdown: 'Before the rule.\n\n---\n\nAfter the rule.',
        },
      ],
      pathname: '/docs/divider-page/',
      title: 'Fixture Docs',
      hue: 145,
      rootPath: '/docs/',
      homePath: '/docs/divider-page/',
    },
  );
  await page.goto('/strict-local-workspace-harness/');
  await waitForWorkspaceReady(page);

  const content = page.locator('[data-docs-view-root]');
  const divider = content.locator('hr[data-docs-raw-divider]');
  await expect(divider).toHaveCount(1);
  await expect(divider).toBeVisible();
  await expect(content).toContainText('Before the rule.');
  await expect(content).toContainText('After the rule.');
  await expect(content.locator('[data-docs-code-block="view"]')).toHaveCount(0);
});

test('Markdown ordered lists keep consecutive numbering and restart after a paragraph', async ({
  page,
}) => {
  await page.addInitScript(
    (fixture) => {
      Object.assign(window, { __terraDocsLocalWorkspaceFixture: fixture });
    },
    {
      tree: [
        {
          type: 'branch',
          origName: 'programming',
          title: 'Programming',
          path: 'programming',
          children: [
            {
              type: 'leaf',
              origName: 'numbered-page',
              title: 'Numbered page',
              path: 'programming/numbered-page/index.md',
              url: '/docs/numbered-page/',
            },
          ],
        },
      ],
      pages: [
        {
          id: 'numbered-page',
          path: 'content/programming/numbered-page/index.md',
          pathname: '/docs/numbered-page/',
          title: 'Numbered page',
          markdown: [
            '## Ordered steps',
            '',
            '1. First step',
            '2. Second step',
            '3. Third step',
            '',
            'A separate paragraph ends the list.',
            '',
            '1. A new list starts at one.',
            '',
            '- Base bullet',
            '  - Nested bullet',
            '    - Third-level bullet',
          ].join('\n'),
        },
      ],
      pathname: '/docs/numbered-page/',
      title: 'Fixture Docs',
      hue: 145,
      rootPath: '/docs/',
      homePath: '/docs/numbered-page/',
    },
  );
  await page.goto('/strict-local-workspace-harness/');
  await waitForWorkspaceReady(page);

  const content = page.locator('[data-docs-view-root]');
  await expect(content.getByText('First step')).toBeVisible();
  const orderedLists = content.locator('ol');
  await expect(orderedLists).toHaveCount(4);
  await expect
    .poll(() =>
      orderedLists.evaluateAll((lists) =>
        lists.map((list) => Number(list.getAttribute('start') ?? 1)),
      ),
    )
    .toEqual([1, 2, 3, 1]);
  await expect(content.locator('ol li')).toHaveText([
    'First step',
    'Second step',
    'Third step',
    'A new list starts at one.',
  ]);

  const baseList = content
    .locator('ul[data-docs-list-level="1"]')
    .filter({ hasText: 'Base bullet' });
  const nestedList = content
    .locator('ul[data-docs-list-level="2"]')
    .filter({ hasText: 'Nested bullet' });
  const thirdLevelList = content
    .locator('ul[data-docs-list-level="3"]')
    .filter({ hasText: 'Third-level bullet' });
  await expect(baseList).toHaveCount(1);
  await expect(nestedList).toHaveCount(1);
  await expect(thirdLevelList).toHaveCount(1);
  const listLayout = await Promise.all(
    [baseList, nestedList, thirdLevelList].map((list) =>
      list.evaluate((element) => {
        const styles = getComputedStyle(element);
        const paragraph = element.querySelector('li > p');
        const paragraphStyles = paragraph ? getComputedStyle(paragraph) : null;
        return {
          padding: Number.parseFloat(styles.paddingInlineStart),
          margin: Number.parseFloat(styles.marginInlineStart),
          marker: styles.listStyleType,
          lineHeight: Number.parseFloat(styles.lineHeight),
          paragraphMargin: paragraphStyles
            ? Number.parseFloat(paragraphStyles.marginBlockStart) +
              Number.parseFloat(paragraphStyles.marginBlockEnd)
            : null,
        };
      }),
    ),
  );
  expect(listLayout.map((item) => item.marker)).toEqual(['disc', 'disc', 'disc']);
  expect(listLayout.map((item) => item.padding)).toEqual([24, 24, 24]);
  expect(listLayout.map((item) => item.margin)).toEqual([0, 24, 48]);
  expect(listLayout.every((item) => item.lineHeight <= 24)).toBe(true);
  expect(listLayout.every((item) => item.paragraphMargin === 0)).toBe(true);
  await page.screenshot({ path: '/tmp/docs-markdown-lists.png', fullPage: true });
});

test('section hues update without reload and color the page root, links, and diagram nodes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(
    (fixture) => {
      Object.assign(window, { __terraDocsLocalWorkspaceFixture: fixture });
    },
    {
      tree: [
        {
          type: 'branch',
          origName: 'programming',
          title: 'Programming',
          hue: 30,
          children: [
            {
              type: 'branch',
              origName: 'programming-one',
              title: 'Programming 1',
              children: [
                {
                  type: 'leaf',
                  origName: 'orange-page',
                  title: 'Orange page',
                  path: 'programming/orange-page/index.md',
                  url: '/docs/#orange-page',
                },
              ],
            },
          ],
        },
        {
          type: 'branch',
          origName: 'mathematics',
          title: 'Mathematics',
          hue: 150,
          children: [
            {
              type: 'branch',
              origName: 'mathematics-one',
              title: 'Mathematics 1',
              children: [
                {
                  type: 'leaf',
                  origName: 'green-page',
                  title: 'Green page',
                  path: 'mathematics/green-page/index.md',
                  url: '/docs/#green-page',
                },
              ],
            },
          ],
        },
      ],
      pages: [
        {
          id: 'orange-page',
          path: 'content/programming/orange-page/index.md',
          pathname: '/docs/#orange-page',
          title: 'Orange page',
          markdown: [
            'A [complementary link](#green-page) follows the section hue.',
            '',
            '<Nodes direction="TB" nodes={[{"id":"orange-node","type":"terminator","data":{"title":"Orange section node","href":"/#green-page"}},{"id":"primary-node","type":"process","data":{"title":"Primary section node","href":"/#green-page"}}]} edges={[]} height={240} />',
            '',
            ...Array.from({ length: 36 }, (_, index) => `Long page background check ${index + 1}.`),
          ].join('\n\n'),
        },
        {
          id: 'green-page',
          path: 'content/mathematics/green-page/index.md',
          pathname: '/docs/#green-page',
          title: 'Green page',
          markdown: 'This page belongs to the Mathematics hue.\n\n- One\n- Two',
        },
      ],
      pathname: '/docs/#orange-page',
      title: 'Hue fixture',
      hue: 145,
      rootPath: '/docs/',
      homePath: '/docs/#orange-page',
    },
  );

  let loadCount = 0;
  page.on('load', () => {
    loadCount += 1;
  });
  await page.goto('/strict-local-workspace-harness/');
  await waitForWorkspaceReady(page);
  const content = page.locator('[data-docs-view-root]');
  const hueOfPage = () =>
    page.evaluate(() => ({
      hue: document.documentElement.style.getPropertyValue('--hue'),
      rootBackground: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      primary: getComputedStyle(document.documentElement).getPropertyValue('--primary-1').trim(),
    }));

  await expect(content.getByText('Long page background check 1.')).toBeVisible();
  await expect.poll(async () => (await hueOfPage()).hue).toBe('30');
  await expect
    .poll(() => content.locator('[data-docs-editor-block="Nodes"] .react-flow__node a').count())
    .toBeGreaterThan(0);
  const orangeNodeColors = await content
    .locator('[data-docs-editor-block="Nodes"] .react-flow__node a')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        title: node.textContent?.trim() ?? '',
        className: (node as HTMLElement).className,
        rendered: getComputedStyle(node).color,
        primary: getComputedStyle(node).getPropertyValue('--primary-12').trim(),
        secondary: getComputedStyle(node).getPropertyValue('--secondary-11').trim(),
      })),
    );
  const primaryNode = orangeNodeColors.find((node) => node.title === 'Primary section node');
  const secondaryNode = orangeNodeColors.find((node) => node.title === 'Orange section node');
  expect(primaryNode?.className).toContain('text-primary-12');
  expect(secondaryNode?.className).toContain('text-secondary-11');
  expect(primaryNode?.rendered).toBe(`rgb(${primaryNode.primary.split(/\s+/).join(', ')})`);
  expect(secondaryNode?.rendered).toBe(`rgb(${secondaryNode.secondary.split(/\s+/).join(', ')})`);

  const beforeNavigation = await page.evaluate(
    () => performance.getEntriesByType('navigation').length,
  );
  await page.getByRole('combobox', { name: 'Section' }).click();
  await page.getByRole('option', { name: 'Mathematics' }).click();
  const greenPageLink = page.getByRole('link', { name: 'Green page', exact: true });
  await expect(greenPageLink).toBeVisible();
  await greenPageLink.click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Green page');
  await expect(content.getByText('This page belongs to the Mathematics hue.')).toBeVisible();
  await expect.poll(async () => (await hueOfPage()).hue).toBe('150');
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(
    beforeNavigation,
  );
  expect(loadCount).toBe(1);

  await page.emulateMedia({ colorScheme: 'dark' });
  const darkModeState = await page.evaluate(() => ({
    htmlClass: document.documentElement.className,
    scopeClass: document.querySelector('.docs-theme-scope')?.className ?? '',
    colorScheme: getComputedStyle(document.querySelector('.docs-theme-scope')!).colorScheme,
    media: matchMedia('(prefers-color-scheme: dark)').matches,
    primary: getComputedStyle(document.querySelector('.docs-theme-scope')!)
      .getPropertyValue('--primary-1')
      .trim(),
  }));
  expect(darkModeState.colorScheme, JSON.stringify(darkModeState)).toBe('dark');
  const darkPage = await hueOfPage();
  expect(darkPage.hue).toBe('150');
  expect(darkPage.rootBackground).toBe(darkPage.bodyBackground);
  expect(darkPage.rootBackground).not.toBe('rgb(255, 255, 255)');
  expect(darkPage.primary).not.toBe('');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.screenshot({ path: '/tmp/docs-section-hue-dark-long-page.png', fullPage: true });
});

test('shared workspace keeps the Terra header, toolbar position, section navigation, and nested leaf actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/workspace-demo/?section=overview&group=start-here&leaf=salesphere');
  await waitForWorkspaceReady(page);
  await expect(page.getByRole('heading', { name: 'Start with the product' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Salesphere');
  await expect(page.getByRole('link', { name: 'Salesphere Docs' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Section' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Mode' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search pages' })).toHaveCount(0);
  await expect(page.getByText(/Last modified/)).toBeVisible();
  // The pinned UI has no persistent section action button; actions live in the selector.
  await expect(page.getByRole('button', { name: /Actions for section/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actions for group Start here' })).toHaveCount(0);

  const toolbarPosition = await page.evaluate(() => {
    const header = document.querySelector('.terra-docs-document-header');
    const toolbar = document.querySelector('[data-docs-toolbar-frame]');
    const mode = document.querySelector<HTMLElement>('[aria-label="Mode"]');
    const proseHeading = document.querySelector<HTMLElement>('[data-docs-view-root] h2');
    const workspace = document.querySelector<HTMLElement>('.terra-docs-workspace');
    return {
      followsHeader:
        !!header &&
        !!toolbar &&
        Boolean(header.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING),
      toolbarWidth: toolbar?.getBoundingClientRect().width ?? 0,
      modeWidth: mode?.getBoundingClientRect().width ?? 0,
      fontFamily: workspace ? getComputedStyle(workspace).fontFamily : '',
      headingWidth: proseHeading?.getBoundingClientRect().width ?? 0,
      headingFontSize: proseHeading ? getComputedStyle(proseHeading).fontSize : '',
      headingMarginTop: proseHeading ? getComputedStyle(proseHeading).marginTop : '',
    };
  });
  expect(toolbarPosition.followsHeader).toBeTruthy();
  expect(toolbarPosition.toolbarWidth).toBeGreaterThan(700);
  expect(toolbarPosition.modeWidth).toBeGreaterThan(toolbarPosition.toolbarWidth * 0.8);
  expect(toolbarPosition.toolbarWidth - toolbarPosition.modeWidth).toBeLessThan(100);
  expect(toolbarPosition.fontFamily).toContain('Inter');
  expect(toolbarPosition.headingWidth).toBeCloseTo(768, 0);
  expect(toolbarPosition.headingFontSize).toBe('30px');
  expect(toolbarPosition.headingMarginTop).toBe('48px');
  const hostPalette = await page.evaluate(() => {
    const host = document.querySelector('.workspace-demo-theme');
    const workspace = document.querySelector('.terra-docs-workspace');
    return {
      host: host ? getComputedStyle(host).getPropertyValue('--primaryLight9').trim() : '',
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
  const startHereGroup = page
    .locator('[data-docs-drop^="branch:"]')
    .filter({ hasText: 'Start here' });
  await startHereGroup.hover();
  await expect(page.getByRole('button', { name: 'Actions for group Start here' })).toHaveCount(0);
  await startHereGroup.click({ button: 'right' });
  for (const name of [
    'Copy link',
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
  await startHereGroup.click({ button: 'right' });
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

test('view headings keep hover permalinks and the sidebar table of contents behavior', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/workspace-demo/?section=overview&group=start-here&leaf=salesphere');
  await waitForWorkspaceReady(page);

  const heading = page
    .locator('[data-docs-view-root] h2')
    .filter({ hasText: /^Start with the product$/ });
  await expect(heading).toBeVisible();
  const copy = heading.getByRole('button', { name: 'Copy link to Start with the product' });
  await expect(copy).toHaveCount(1);
  await heading.hover();
  await expect(copy.locator('.heading-anchor-icon')).toBeVisible();

  const origin = new URL(page.url()).origin;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await copy.click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${origin}/workspace-demo/#start-with-the-product`);

  await page.evaluate(() => {
    const key = 'terra-docs-workspace-demo-v1';
    const state = JSON.parse(localStorage.getItem(key) ?? '{}');
    state.documents.salesphere.content.push({
      _key: 'heading-navigation-tail',
      _type: 'block',
      style: 'normal',
      markDefs: [],
      children: [
        {
          _key: 'heading-navigation-tail-text',
          _type: 'span',
          marks: [],
          text: 'Trailing content keeps enough page height to verify heading navigation. '.repeat(
            80,
          ),
        },
      ],
    });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await waitForWorkspaceReady(page);

  const toc = page.getByRole('navigation', { name: 'Table of contents' });
  await expect(toc).toBeVisible();
  const target = toc.getByRole('link', { name: 'Jump to Find the implementation' });
  await expect(target).toBeVisible();
  await target.click();
  await expect(page).toHaveURL(/#find-the-implementation$/);
  const targetHeading = page
    .locator('[data-docs-view-root] h2')
    .filter({ hasText: /^Find the implementation$/ });
  await expect
    .poll(async () => (await targetHeading.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
    .toBeLessThan(180);
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

test('tree create, rename, duplicate, download, and delete persist through the original context menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/workspace-demo/');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Salesphere');

  await page
    .locator('[data-docs-drop^="branch:"]')
    .filter({ hasText: 'Start here' })
    .click({ button: 'right' });
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

test('group create, rename, reorder, and delete use the shared sidebar actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/workspace-demo/');
  await waitForWorkspaceReady(page);
  await page.getByRole('combobox', { name: 'Mode' }).click();
  await page.getByRole('option', { name: 'Edit' }).click();

  const sectionPicker = page.getByRole('combobox', { name: 'Section' });
  await sectionPicker.click();
  await page.getByRole('option', { name: 'Add section', exact: true }).click();
  const sectionDialog = page.getByRole('dialog', { name: 'Add Section' });
  await sectionDialog.getByRole('textbox', { name: 'Section name' }).fill('Group lifecycle');
  await sectionDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}');
        return state.tree.some((node: { title?: string }) => node.title === 'Group lifecycle');
      }),
    )
    .toBe(true);
  await page.reload();
  await waitForWorkspaceReady(page);
  await page.getByRole('combobox', { name: 'Section' }).click();
  await page.getByRole('option', { name: 'Group lifecycle', exact: true }).click();

  const sidebarContent = page.locator('[data-sidebar="content"]').filter({ visible: true }).last();
  await expect(sidebarContent).toBeVisible();
  await sidebarContent.dispatchEvent('contextmenu', { button: 2, clientX: 16, clientY: 160 });
  const addGroup = page.getByRole('menuitem', { name: 'Add group', exact: true });
  await expect(addGroup).toBeVisible();
  await addGroup.click();
  const createDialog = page.getByRole('dialog', { name: 'Add Group' });
  await createDialog.getByRole('textbox', { name: 'Group name' }).fill('Regression group');
  await createDialog.getByRole('button', { name: 'Save', exact: true }).click();

  const sectionId = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}');
    return state.tree.find((node: { title?: string }) => node.title === 'Group lifecycle').origName;
  });
  const group = page
    .locator(`[data-docs-drop^="branch:${sectionId}/"]`)
    .filter({ hasText: 'Regression group' });
  await expect(group).toBeVisible();
  await expect(
    page.locator('[data-docs-drop^="leaf:"]').filter({ hasText: 'Untitled' }),
  ).toBeVisible();

  await group.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename group', exact: true }).click();
  const renameDialog = page.getByRole('dialog', { name: 'Rename Group' });
  await renameDialog.getByRole('textbox', { name: 'Group name' }).fill('Regression renamed');
  await renameDialog.getByRole('button', { name: 'Save', exact: true }).click();
  const renamedGroup = page
    .locator(`[data-docs-drop^="branch:${sectionId}/"]`)
    .filter({ hasText: 'Regression renamed' });
  await expect(renamedGroup).toBeVisible();

  const generalGroupId = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}');
    return state.tree
      .find((node: { title?: string }) => node.title === 'Group lifecycle')
      .children.find((node: { title?: string }) => node.title === 'General').origName;
  });

  await renamedGroup
    .getByRole('button', { name: 'Reorder item' })
    .dragTo(page.locator(`[data-docs-drop="branch:${sectionId}/${generalGroupId}"]`), {
      targetPosition: { x: 8, y: 1 },
    });
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const value = JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}');
        return value.tree
          .find((node: { title?: string }) => node.title === 'Group lifecycle')
          .children.map((node: { title?: string }) => node.title);
      }),
    )
    .toEqual(['Regression renamed', 'General']);
  await expect(renamedGroup).toBeVisible();

  const persistedGroup = page
    .locator(`[data-docs-drop^="branch:${sectionId}/"]`)
    .filter({ hasText: 'Regression renamed' });
  await persistedGroup.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete group', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: /Delete group\?/i });
  await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(
    page
      .locator(`[data-docs-drop^="branch:${sectionId}/"]`)
      .filter({ hasText: 'Regression renamed' }),
  ).toHaveCount(0);
  const remainingGroups = await page.evaluate((id) => {
    const state = JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}');
    return state.tree.find((node: { origName?: string }) => node.origName === id).children;
  }, sectionId);
  expect(remainingGroups.map((node: { title?: string }) => node.title)).toEqual(['General']);
  expect(remainingGroups[0].children.map((node: { title?: string }) => node.title)).toEqual([
    'Untitled',
  ]);
});

test('leaf reorder is stored and appears in the same order after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/workspace-demo/');
  await waitForWorkspaceReady(page);
  const sourceRow = page.locator('[data-docs-drop]').filter({ hasText: 'Salesphere' });
  const targetRow = page.locator('[data-docs-drop]').filter({ hasText: 'Runtime map' });
  const reorderHandle = sourceRow.getByRole('button', { name: 'Reorder item' });
  await expect(reorderHandle).toBeEnabled();
  await reorderHandle.dragTo(targetRow, {
    // A leaf row is only 24px tall in the shared sidebar. Drop near its bottom
    // so this specifically tests insertion after the target leaf.
    targetPosition: { x: 8, y: 23 },
  });

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}');
          return state.tree[0].children[0].children.map(
            (node: { origName: string }) => node.origName,
          );
        }),
      { timeout: 5_000 },
    )
    .toEqual(['runtime-map', 'salesphere']);

  await page.reload();
  await expect
    .poll(async () => page.locator('[data-docs-drop^="leaf:"] a').allTextContents(), {
      timeout: 10_000,
    })
    .toEqual(['Runtime map', 'Salesphere']);
});

test('merging selected pages through the sidebar retains source content and all attachments', async ({
  page,
}) => {
  await page.goto('/workspace-demo/?section=overview&group=start-here&leaf=salesphere');
  await waitForWorkspaceReady(page);

  await page.evaluate(() => {
    const key = 'terra-docs-workspace-demo-v1';
    const state = JSON.parse(localStorage.getItem(key) ?? '{}');
    const attachment = {
      id: 'runtime-map-attachment',
      name: 'Runtime trace.zip',
      path: '/assets/runtime-trace.zip',
      type: 'application/zip',
      size: 18,
    };
    state.documents['runtime-map'].attachments.push(attachment);
    state.assets[attachment.path] = {
      ...attachment,
      docId: 'runtime-map',
      bytes: [80, 75, 3, 4, 68, 79, 67, 83],
    };
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await waitForWorkspaceReady(page);

  const salesphere = page.getByRole('link', { name: 'Salesphere', exact: true });
  const runtimeMap = page.getByRole('link', { name: 'Runtime map', exact: true });
  await salesphere.click({ modifiers: ['Meta'] });
  await runtimeMap.click({ modifiers: ['Meta'] });
  await runtimeMap.click({ button: 'right' });
  const merge = page.getByRole('menuitem', { name: 'Merge 2 pages', exact: true });
  await expect(merge).toBeVisible();
  await merge.click();

  const prompt = page.getByRole('dialog', { name: 'Merge Pages' });
  await prompt.getByRole('textbox', { name: 'New page title' }).fill('Combined guide');
  await prompt.getByRole('button', { name: 'Save', exact: true }).click();

  const mergedView = page.locator('[data-docs-view-root]');
  await expect(mergedView).toContainText('Salesphere helps sales professionals');
  await expect(mergedView).toContainText('The request enters through the Astro application.');
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Combined guide',
  );

  const persisted = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}');
    return {
      runtimeMapExists: Boolean(state.documents['runtime-map']),
      merged: state.documents.salesphere,
      runtimeAssetOwner: state.assets['/assets/runtime-trace.zip']?.docId,
      retargetWasCalled: (
        window as Window & { __terraDocsActionCalls?: Array<{ operation: string }> }
      ).__terraDocsActionCalls?.some((call) => call.operation === 'write.doc.retargetSources'),
    };
  });
  expect(persisted.runtimeMapExists).toBe(false);
  expect(persisted.runtimeAssetOwner).toBe('salesphere');
  expect(persisted.retargetWasCalled).toBe(true);
  expect(persisted.merged.title).toBe('Combined guide');
  expect(persisted.merged.source).toContain('## Salesphere');
  expect(persisted.merged.source).toContain('## Runtime map');
  expect(persisted.merged.attachments.map((item: { name: string }) => item.name).sort()).toEqual([
    'Product brief.pdf',
    'Runtime trace.zip',
  ]);
  await expect(page.getByRole('link', { name: 'Runtime map', exact: true })).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Mode' }).click();
  await page.getByRole('option', { name: 'Attachments' }).click();
  await expect(page.getByRole('button', { name: 'Attachment Product brief.pdf' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attachment Runtime trace.zip' })).toBeVisible();
  await page.reload();
  await waitForWorkspaceReady(page);
  await page.getByRole('combobox', { name: 'Mode' }).click();
  await page.getByRole('option', { name: 'Attachments' }).click();
  await expect(page.getByRole('button', { name: 'Attachment Product brief.pdf' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attachment Runtime trace.zip' })).toBeVisible();
});

test('attachment upload, open, download, and deletion persist across reloads', async ({ page }) => {
  await page.goto('/workspace-demo/');
  const mode = page.getByRole('combobox', { name: 'Mode' });
  await mode.click();
  await page.getByRole('option', { name: 'Attachments' }).click();
  const attachments = page.locator('[data-docs-attachments]');
  await expect(attachments).toHaveAttribute('data-loading', 'false');
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false');

  const filename = 'workspace-fixture-attachment.bin';
  await page.getByTestId('docs-attachment-upload').setInputFiles({
    name: filename,
    mimeType: 'application/octet-stream',
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
  const menuBounds = await attachmentMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(menuBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(viewport!.width);
  expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(viewport!.height);
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
  const editor = page.getByRole('textbox', { name: 'Document editor' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Body content survives a remote save and reload.');
  await expect(editor).toContainText('Body content survives a remote save and reload.');
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  await title.fill('Salesphere saved title');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(title).toHaveValue('Salesphere saved title');

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('terra-docs-workspace-demo-v1') ?? '{}'),
  );
  expect(saved.documents.salesphere.title).toBe('Salesphere saved title');
  expect(JSON.stringify(saved.documents.salesphere.content)).toContain(
    'Body content survives a remote save and reload.',
  );
  expect(saved.documents.salesphere.versions).toHaveLength(1);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Salesphere saved title',
  );
  await mode.click();
  await page.getByRole('option', { name: 'View' }).click();
  await expect(page.locator('[data-docs-view-root]')).toContainText(
    'Body content survives a remote save and reload.',
  );
  await page.getByRole('combobox', { name: 'Mode' }).click();
  await page.getByRole('option', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Version History' }).click();
  const history = page.getByRole('dialog', { name: 'Version History' });
  await expect(history).toBeVisible();
  const versionSelect = history.getByRole('combobox', { name: 'Select a version' });
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
  await expect(
    page.locator('[data-docs-view-root] p').filter({ hasText: 'Runtime map' }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Mode' })).toBeVisible();
});

test('section creation is retained, and menus remain keyboard accessible and portaled', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/workspace-demo/');
  await waitForWorkspaceReady(page);
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

  const keyboardLeaf = page.getByRole('link', { name: 'Salesphere', exact: true });
  await keyboardLeaf.click({ button: 'right' });
  const contextMenu = page.getByRole('menu');
  await expect(contextMenu).toBeVisible();
  await expect(
    contextMenu.getByRole('menuitem', { name: 'Rename page', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      contextMenu.evaluate(
        (menu) =>
          menu.closest('[data-radix-popper-content-wrapper]')?.parentElement === document.body,
      ),
    )
    .toBe(true);
  const renamePageAction = contextMenu.getByRole('menuitem', {
    name: 'Rename page',
    exact: true,
  });
  await renamePageAction.focus();
  await expect(renamePageAction).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Rename page' })).toBeVisible();
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
  await waitForWorkspaceReady(page);
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
  await page.getByRole('button', { name: 'Insert content' }).click();
  const insertMenu = page.getByRole('listbox');
  await expect(insertMenu.getByRole('option', { name: 'Accordion', exact: true })).toBeVisible();
  await expect(insertMenu.getByRole('option', { name: 'Tabs', exact: true })).toBeVisible();
  await expect(insertMenu.getByRole('option', { name: 'Table', exact: true })).toBeVisible();
  await expect(insertMenu.getByRole('option', { name: 'Code', exact: true })).toBeVisible();
  await expect(
    insertMenu.getByRole('option', { name: 'Add attachment', exact: true }),
  ).toBeVisible();
  await expect(insertMenu.getByRole('option', { name: 'Image', exact: true })).toHaveCount(0);
  await expect(insertMenu.getByRole('option', { name: 'Embed', exact: true })).toHaveCount(0);
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
  const attachmentModeWidth = await page
    .getByRole('combobox', { name: 'Mode' })
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(attachmentModeWidth).toBeGreaterThan(90);
  expect(attachmentModeWidth).toBeLessThan(220);
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
  const description = page.getByRole('textbox', { name: 'Description' });
  await expect(description).toBeDisabled();
  await expect(description).toHaveValue('A page level description for the Salesphere overview.');
  await expect(description).not.toHaveAttribute('class', /min-h-6/);
  await expect(page.getByRole('textbox', { name: 'Search pages' })).toHaveCount(0);
});
