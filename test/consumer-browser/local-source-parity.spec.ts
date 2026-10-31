import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  markdownCodeBlocks,
  normalizeVisibleText,
  pagesFromDirectory,
  visibleSourceUnits,
} from './content-parity-helpers.js';

const sourceHosts: Array<{
  name: string;
  url?: string;
  root?: string;
  titles?: Record<string, string>;
  tocTitles?: Record<string, string>;
  descriptions?: Record<string, string>;
  skillsSource?: string;
  basePath?: string;
  sectionForPage?: (page: { slug: string }) => string;
  format?: 'markdown' | 'mdx' | 'astro';
}> = [
  {
    name: 'Docs package',
    url: process.env.DOCS_PACKAGE_URL,
    root: process.env.DOCS_PACKAGE_SOURCE_ROOT,
    sectionForPage: ({ slug }) => {
      if (!slug || slug === 'getting-started') return 'Start here';
      if (['configuration', 'storage', 'deploy'].includes(slug)) return 'Configure';
      return 'Reference';
    },
  },
  {
    name: 'Styling',
    url: process.env.DOCS_STYLING_URL,
    root: process.env.DOCS_STYLING_SOURCE_ROOT,
    titles: {
      '': 'Styling',
      installation: 'Installation',
      components: 'Components',
      hue: 'Hue and themes',
    },
    // The local Styling page catalog owns a leaf description independently of
    // the Markdown body; assert that host metadata alongside source content.
    descriptions: { '': 'Shared UI components and hue-based themes.' },
    sectionForPage: () => 'Styling',
  },
  {
    name: 'Portfolio Styling Docs snapshot',
    url: process.env.DOCS_PORTFOLIO_STYLING_URL,
    root: process.env.DOCS_PORTFOLIO_STYLING_SOURCE_ROOT,
    basePath: '/styling-docs',
    titles: {
      '': 'Styling',
      installation: 'Installation',
      components: 'Components',
      hue: 'Hue and themes',
    },
    descriptions: { '': 'Shared UI components and hue-based themes.' },
    sectionForPage: () => 'Styling',
    // This hosted copy now uses the same Markdown renderer as the canonical
    // Styling Docs route, including the shared rich-code-block presentation.
  },
  {
    name: 'Standards',
    url: process.env.DOCS_STANDARDS_URL,
    root: process.env.DOCS_STANDARDS_SOURCE_ROOT,
    sectionForPage: ({ slug }) => {
      const category = slug.split('/')[0] || 'Overview';
      return category === 'Overview'
        ? category
        : category.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    },
  },
  {
    name: 'Salesphere standalone',
    url: process.env.DOCS_SALESPHERE_URL,
    root: process.env.DOCS_SALESPHERE_SOURCE_ROOT,
    sectionForPage: ({ slug }) => {
      const category = slug.split('/')[0] || 'Overview';
      return category === 'Overview'
        ? category
        : category.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    },
  },
  {
    name: 'Compression',
    url: process.env.DOCS_COMPRESSION_URL,
    root: process.env.DOCS_COMPRESSION_SOURCE_ROOT,
    tocTitles: {
      'plan/0-overview': 'Proposal overview',
      'plan/1-compression': 'Compression plan',
    },
    sectionForPage: ({ slug }) => {
      if (!slug) return 'Start here';
      if (slug.startsWith('at3/')) return 'Assessment';
      if (slug.startsWith('plan/')) return 'Project docs';
      return 'Start here';
    },
  },
  {
    name: 'Portfolio Terra Docs snapshot',
    url: process.env.DOCS_PORTFOLIO_TERRA_URL,
    root: process.env.DOCS_PORTFOLIO_TERRA_SOURCE_ROOT,
    format: 'astro',
    sectionForPage: ({ slug }) => {
      if (!slug || slug === 'getting-started') return 'Start here';
      if (['configuration', 'storage', 'deploy'].includes(slug)) return 'Configure';
      return 'Reference';
    },
  },
  {
    name: 'Portfolio Standards Docs snapshot',
    url: process.env.DOCS_PORTFOLIO_STANDARDS_URL,
    root: process.env.DOCS_PORTFOLIO_STANDARDS_SOURCE_ROOT,
    skillsSource: process.env.DOCS_PORTFOLIO_STANDARDS_SKILLS_SOURCE,
    format: 'mdx',
    sectionForPage: ({ slug }) => {
      const category = slug.split('/')[0] || 'Overview';
      return category === 'Overview'
        ? category
        : category.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    },
  },
];

test('every local Markdown page agrees with its Docs route and rendered content', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const configured = sourceHosts.filter((host) => host.url && host.root);
  test.skip(!configured.length, 'Set DOCS_*_URL and DOCS_*_SOURCE_ROOT for local content hosts.');

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  for (const host of configured) {
    const pages = pagesFromDirectory(host.root!, { titles: host.titles });
    expect(pages.length, `${host.name} source page inventory`).toBeGreaterThan(0);
    const seenRoutes = new Set<string>();
    for (const sourcePage of pages) {
      if (host.descriptions?.[sourcePage.slug])
        sourcePage.description = host.descriptions[sourcePage.slug]!;
      expect(seenRoutes.has(sourcePage.pathname), `${host.name} duplicate route`).toBe(false);
      seenRoutes.add(sourcePage.pathname);
      const pathname = `${host.basePath ?? ''}${sourcePage.pathname}`;
      const url = new URL(pathname, host.url!.endsWith('/') ? host.url : `${host.url}/`);
      // Navigation is followed by explicit shell, route, and source-backed body
      // hydration checks below. Waiting for every network connection to idle on
      // every page made this multi-host sweep exceed its test timeout without
      // adding useful evidence.
      const response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${host.name} ${sourcePage.sourcePath}`).toBeLessThan(400);
      await expect(
        page.locator('.terra-docs-workspace'),
        `${host.name} ${sourcePage.slug} workspace shell`,
      ).toBeVisible();
      await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false', {
        timeout: 30_000,
      });
      await expect(
        page.locator('#docs-title'),
        `${host.name} ${sourcePage.slug} title`,
      ).toHaveValue(sourcePage.title);
      await expect(
        page.locator('#docs-description'),
        `${host.name} ${sourcePage.slug} description`,
      ).toHaveValue(sourcePage.description);
      if (host.sectionForPage) {
        await expect(
          page.getByRole('combobox', { name: 'Section' }),
          `${host.name} ${sourcePage.slug} selected TOC section`,
        ).toContainText(host.sectionForPage(sourcePage));
      }

      const body = page.locator('[data-docs-body-content]');
      if (host.name.includes('Standards') && sourcePage.slug === '') {
        const hero = sourcePage.frontmatter.hero as
          { tagline?: string; actions?: Array<{ text: string; link: string }> } | undefined;
        expect(hero, 'Standards frontmatter hero').toBeDefined();
        const heroCard = body.locator('[data-standards-hero-card]');
        await expect(heroCard, 'Standards frontmatter card').toBeVisible();
        if (hero?.tagline) await expect(heroCard).toContainText(hero.tagline);
        for (const action of hero?.actions ?? []) {
          const link = heroCard.getByRole('link', { name: action.text });
          await expect(link, 'Standards frontmatter action').toHaveAttribute('href', action.link);
        }
      }
      const sourceUnits = visibleSourceUnits(sourcePage.markdown);
      const visibleSourceContent = async (): Promise<string> => {
        const renderedBody = await body.innerText();
        const renderedCode = await body.locator('code').evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              const style = getComputedStyle(node);
              return (
                style.display !== 'none' &&
                style.visibility === 'visible' &&
                node.getClientRects().length > 0
              );
            })
            .map((node) => node.textContent ?? '')
            .join(' '),
        );
        const renderedImageAlternatives = await body.locator('img[alt]').evaluateAll((images) =>
          images
            .filter((image) => {
              const style = getComputedStyle(image);
              return (
                style.display !== 'none' &&
                style.visibility === 'visible' &&
                image.getClientRects().length > 0
              );
            })
            .map((image) => image.getAttribute('alt') ?? '')
            .join(' '),
        );
        return normalizeVisibleText(`${renderedBody} ${renderedCode} ${renderedImageAlternatives}`);
      };
      // Hydration can reveal source-backed blocks in a different order from the
      // Markdown stream. Wait for the whole expected page inventory at once;
      // seeing the final paragraph alone does not prove that earlier tables,
      // tabs, or accordions have finished rendering.
      await expect
        .poll(
          async () => {
            const visible = await visibleSourceContent();
            return sourceUnits.filter((unit) => !visible.includes(unit));
          },
          { timeout: 30_000 },
        )
        .toEqual([]);
      const rendered = normalizeVisibleText(await body.innerText());
      const visibleInlineCode = normalizeVisibleText(
        (
          await body.locator('code').evaluateAll((nodes) =>
            nodes
              .filter((node) => {
                const style = getComputedStyle(node);
                return (
                  style.display !== 'none' &&
                  style.visibility === 'visible' &&
                  node.getClientRects().length > 0
                );
              })
              .map((node) => node.textContent ?? ''),
          )
        ).join(' '),
      );
      const visibleImageAlternatives = normalizeVisibleText(
        (
          await body.locator('img[alt]').evaluateAll((images) =>
            images
              .filter((image) => {
                const style = getComputedStyle(image);
                return (
                  style.display !== 'none' &&
                  style.visibility === 'visible' &&
                  image.getClientRects().length > 0
                );
              })
              .map((image) => image.getAttribute('alt') ?? ''),
          )
        ).join(' '),
      );
      expect(rendered.length, `${host.name} ${sourcePage.slug} is not empty`).toBeGreaterThan(0);
      for (const unit of sourceUnits) {
        expect(
          `${rendered} ${visibleInlineCode} ${visibleImageAlternatives}`,
          `${host.name} ${sourcePage.slug} source meaning should render: ${unit.slice(0, 120)}`,
        ).toContain(unit);
      }
      const renderedCodeBlocks = await body
        .locator(
          host.format === 'mdx' || host.format === 'astro'
            ? 'pre code'
            : '[data-docs-code-block="view"]',
        )
        .evaluateAll((blocks) =>
          blocks
            .filter((block) => {
              const style = getComputedStyle(block);
              return (
                style.display !== 'none' &&
                style.visibility === 'visible' &&
                block.getClientRects().length > 0
              );
            })
            .map((block) => {
              if (block.matches('pre code')) return block.textContent ?? '';
              const codeMirrorLines = block.querySelectorAll('.cm-line');
              if (codeMirrorLines.length)
                return Array.from(codeMirrorLines, (line) => line.textContent ?? '').join('\n');
              const fallbackLines = block.querySelectorAll('.docs-code-block-fallback-line');
              if (fallbackLines.length)
                return Array.from(fallbackLines, (line) => {
                  const spans = line.querySelectorAll('span');
                  return spans.item(spans.length - 1)?.textContent ?? '';
                }).join('\n');
              return block.querySelector('code')?.textContent ?? '';
            }),
        );
      const codeSources = markdownCodeBlocks(sourcePage.markdown);
      expect(
        renderedCodeBlocks.length,
        `${host.name} ${sourcePage.slug} rendered code block count`,
      ).toBe(codeSources.length);
      const renderedCode = renderedCodeBlocks.map(normalizeVisibleText);
      for (const sourceCode of codeSources) {
        expect(
          renderedCode,
          `${host.name} ${sourcePage.slug} fenced code block should remain code content`,
        ).toContain(sourceCode);
      }
      expect(rendered, `${host.name} ${sourcePage.slug} must not leak raw block JSON`).not.toMatch(
        /(?:"_type"\s*:\s*"block"|:::terra-docs\s+nodes|<Nodes\s+direction=)/,
      );

      if (host.name.includes('Standards') && sourcePage.slug === '') {
        const heroCard = body.locator('[data-standards-hero-card]');
        const lightCardBackground = await heroCard.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        );
        await page.emulateMedia({ colorScheme: 'light' });
        await expect
          .poll(() =>
            page
              .locator('.terra-docs-workspace')
              .evaluate(
                (element) =>
                  getComputedStyle(element.closest<HTMLElement>('.docs-theme-scope') ?? element)
                    .colorScheme,
              ),
          )
          .toBe('light');
        await page.screenshot({
          path:
            host.name === 'Standards'
              ? 'test-results/consumer-standards-hero-light.png'
              : 'test-results/consumer-portfolio-standards-hero-light.png',
          fullPage: true,
        });
        await page.emulateMedia({ colorScheme: 'dark' });
        await expect
          .poll(() =>
            page
              .locator('.terra-docs-workspace')
              .evaluate(
                (element) =>
                  getComputedStyle(element.closest<HTMLElement>('.docs-theme-scope') ?? element)
                    .colorScheme,
              ),
          )
          .toBe('dark');
        await expect
          .poll(() => heroCard.evaluate((element) => getComputedStyle(element).backgroundColor))
          .not.toBe(lightCardBackground);
        await page.screenshot({
          path:
            host.name === 'Standards'
              ? 'test-results/consumer-standards-hero-dark.png'
              : 'test-results/consumer-portfolio-standards-hero-dark.png',
          fullPage: true,
        });
        await page.emulateMedia({ colorScheme: 'light' });
        await expect
          .poll(() =>
            page
              .locator('.terra-docs-workspace')
              .evaluate(
                (element) =>
                  getComputedStyle(element.closest<HTMLElement>('.docs-theme-scope') ?? element)
                    .colorScheme,
              ),
          )
          .toBe('light');
      }

      const sidebar = page.locator('[data-sidebar="content"]').filter({ visible: true }).last();
      const links = sidebar.locator('a[href]');
      const tocLinks = await links.evaluateAll((anchors) =>
        anchors.map((anchor) => ({
          href: (anchor as HTMLAnchorElement).href,
          title: (anchor.textContent ?? '')
            .normalize('NFKD')
            .replace(/\s+/g, ' ')
            .replace(/\s+([.,!?;:])/g, '$1')
            .trim(),
        })),
      );
      const expectedRoute = new URL(pathname, url).pathname;
      const tocLink = tocLinks.find((link) => new URL(link.href).pathname === expectedRoute);
      expect(tocLink, `${host.name} ${sourcePage.slug} TOC link`).toBeDefined();
      expect(
        normalizeVisibleText(tocLink?.title ?? ''),
        `${host.name} ${sourcePage.slug} TOC label`,
      ).toBe(normalizeVisibleText(host.tocTitles?.[sourcePage.slug] ?? sourcePage.title));
      expect(new URL(tocLink!.href).pathname).toBe(url.pathname);

      if (host.sectionForPage) {
        const activeSection = host.sectionForPage(sourcePage);
        for (const expectedPage of pages.filter(
          (candidate) => host.sectionForPage!(candidate) === activeSection,
        )) {
          const path = new URL(`${host.basePath ?? ''}${expectedPage.pathname}`, host.url!)
            .pathname;
          const item = tocLinks.find((link) => new URL(link.href).pathname === path);
          expect(
            item,
            `${host.name} TOC route ${expectedPage.slug} (${path}); got ${JSON.stringify(tocLinks)}`,
          ).toBeDefined();
          expect(
            normalizeVisibleText(item?.title ?? ''),
            `${host.name} TOC label ${expectedPage.slug}`,
          ).toBe(normalizeVisibleText(host.tocTitles?.[expectedPage.slug] ?? expectedPage.title));
        }
      }
    }
  }
  const standardsSkills = configured.find(
    (host) => host.name === 'Portfolio Standards Docs snapshot' && host.skillsSource,
  );
  if (standardsSkills) {
    const skillSource = (
      JSON.parse(readFileSync(standardsSkills.skillsSource!, 'utf8')) as Array<{
        body: string;
        description: string;
        directory: string;
        title: string;
      }>
    ).find((skill) => skill.directory === 'cloud-playwright');
    expect(
      skillSource,
      'Standards Skills source inventory contains Cloud Playwright',
    ).toBeDefined();
    await page.goto(new URL('/skills/', standardsSkills.url!).toString(), {
      waitUntil: 'domcontentloaded',
    });
    const skillsBrowser = page.getByRole('region', { name: 'Skills browser' });
    await expect(skillsBrowser).toBeVisible();
    await skillsBrowser.locator('[data-skill-select="cloud-playwright"]').click();
    await expect(skillsBrowser.getByRole('heading', { name: skillSource!.title })).toBeVisible();
    await expect(skillsBrowser.locator('[data-skill-description]')).toHaveText(
      skillSource!.description,
    );
    await expect(skillsBrowser.locator('[data-skill-body]')).toHaveText(skillSource!.body);
  }
  expect(browserErrors).toEqual([]);
});

test('rich-block parity compares rendered values and ignores editor schema metadata', () => {
  const table = `:::terra-docs table
_type: table
_key: stable-key
header: Defects
_docsCellFormat: markdown-v1
rows:
  - cells:
      - markdown: ❌ Error
      - markdown: Human mistake
      - markdown: |-
          - \`=\` instead of \`==\`
          - Off-by-one error
:::`;
  const tableUnits = visibleSourceUnits(table);
  expect(tableUnits).toContain('Defects');
  expect(tableUnits).toContain('❌ Error');
  expect(tableUnits).toContain('Human mistake');
  expect(tableUnits).toContain('= instead of ==');
  expect(tableUnits).toContain('Off-by-one error');
  expect(tableUnits.join(' ')).not.toMatch(/_docsCellFormat|stable-key|_type/);

  const nodes = `:::terra-docs nodes
_type: nodes
direction: TB
nodes:
  - _type: node
    id: private-node-id
    data:
      href: https://example.test/internal-route
      title: Object-Oriented Programming
  - _type: node
    id: another-private-id
    data:
      title: Data Structures
edges: []
:::`;
  const nodeUnits = visibleSourceUnits(nodes);
  expect(nodeUnits).toContain('Object-Oriented Programming');
  expect(nodeUnits).toContain('Data Structures');
  expect(nodeUnits.join(' ')).not.toMatch(/private-node-id|internal-route|direction/);
});

test('captioned Markdown table source stays visible to the parity comparator', () => {
  const units = visibleSourceUnits(`:::terra-docs table[Methods]
| Method | Description |
| --- | --- |
| Review | Inspect the design. |
:::`);
  expect(units).toContain('Methods');
  expect(units).toContain('Method');
  expect(units).toContain('Inspect the design.');
});
