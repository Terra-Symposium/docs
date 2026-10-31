import { expect, test } from '@playwright/test';
import {
  markdownCodeBlocks,
  normalizeVisibleText,
  pagesFromDirectory,
  visibleSourceUnits,
} from './content-parity-helpers.js';

const salesphereUrl = process.env.DOCS_SALESPHERE_HOSTED_URL?.trim() ?? '';
const salesphereSourceRoot = process.env.DOCS_SALESPHERE_HOSTED_SOURCE_ROOT?.trim() ?? '';

test('all Salesphere published routes match their API content, selected TOC leaf, and rendering', async ({
  page,
}) => {
  test.skip(!salesphereUrl, 'Set DOCS_SALESPHERE_HOSTED_URL to the hosted Salesphere Docs route.');
  test.skip(
    !salesphereSourceRoot,
    'Set DOCS_SALESPHERE_HOSTED_SOURCE_ROOT to the Markdown source directory.',
  );
  test.setTimeout(180_000);

  const pages = pagesFromDirectory(salesphereSourceRoot);
  expect(pages, 'Salesphere tracked Docs page inventory').toHaveLength(22);
  for (const sourcePage of pages) {
    const slug = sourcePage.slug;
    const routePath = slug ? `${slug.split('/').map(encodeURIComponent).join('/')}/` : '';
    const url = new URL(
      routePath,
      salesphereUrl.endsWith('/') ? salesphereUrl : `${salesphereUrl}/`,
    );
    const api = new URL('/api/docs/content', url);
    if (slug) api.searchParams.set('slug', slug);
    else api.searchParams.set('slug', '');
    const response = await page.request.get(api.toString());
    expect(response.status(), `Salesphere content API ${slug}`).toBe(200);
    const actual = (await response.json()) as { slug: string; title: string; markdown: string };
    expect(actual.slug, `Salesphere API slug ${slug}`).toBe(slug);
    expect(actual.title, `Salesphere API title ${slug}`).toBe(sourcePage.title);

    // Salesphere keeps client connections open during hydration, so `networkidle`
    // can wait on activity unrelated to the page content. Navigate to the SSR
    // shell and use the source-backed rendered-content assertion below as the
    // deterministic hydration gate.
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.terra-docs-workspace')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false', {
      timeout: 30_000,
    });
    await expect(page.locator('#docs-title'), `Salesphere title ${slug}`).toHaveValue(
      sourcePage.title,
    );
    await expect(page.locator('#docs-description'), `Salesphere description ${slug}`).toHaveValue(
      sourcePage.description,
    );
    const section = slug
      ? slug
          .split('/')[0]!
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Overview';
    await expect(
      page.getByRole('combobox', { name: 'Section' }),
      `Salesphere section ${slug}`,
    ).toContainText(section);

    const sidebar = page.locator('[data-sidebar="content"]').filter({ visible: true }).last();
    const tocLink = sidebar.locator('a[href]').filter({ hasText: sourcePage.title }).first();
    await expect(tocLink, `Salesphere TOC leaf ${slug}`).toBeVisible();
    const href = await tocLink.getAttribute('href');
    expect(new URL(href!, url).pathname, `Salesphere TOC route ${slug}`).toBe(url.pathname);

    const body = page.locator('[data-docs-body-content]');
    const sourceUnits = visibleSourceUnits(actual.markdown);
    // The host renders a server shell, then hydrates the shared Docs workspace.
    // Independent rich-block islands can finish after later prose, so wait for
    // every source unit instead of treating the last paragraph as a hydration
    // signal. This catches missing content without racing tables and diagrams.
    if (sourceUnits.length) {
      await expect
        .poll(
          async () => {
            const rendered = normalizeVisibleText(await body.innerText());
            return sourceUnits.every((unit) => rendered.includes(normalizeVisibleText(unit)));
          },
          { timeout: 30_000 },
        )
        .toBe(true);
    } else {
      await expect
        .poll(async () => normalizeVisibleText(await body.innerText()), { timeout: 30_000 })
        .not.toBe('');
    }
    const rendered = normalizeVisibleText(await body.innerText());
    expect(rendered.length, `Salesphere rendered body ${slug}`).toBeGreaterThan(0);
    for (const unit of sourceUnits) {
      expect(rendered, `Salesphere published source ${slug}: ${unit.slice(0, 120)}`).toContain(
        unit,
      );
    }
    const renderedCodeBlocks = await page
      .locator('[data-docs-body-content] [data-docs-code-block="view"]')
      .evaluateAll((blocks) =>
        blocks.map((block) => {
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
    const codeSources = markdownCodeBlocks(actual.markdown);
    expect(renderedCodeBlocks.length, `Salesphere code block count ${slug}`).toBe(
      codeSources.length,
    );
    const normalizedCode = renderedCodeBlocks.map(normalizeVisibleText);
    for (const sourceCode of codeSources) {
      expect(normalizedCode, `Salesphere fenced code content ${slug}`).toContain(sourceCode);
    }
    expect(rendered, `Salesphere raw serialization ${slug}`).not.toMatch(
      /(?:"_type"\s*:\s*"block"|:::terra-docs\s+nodes|<Nodes\s+direction=)/,
    );
  }
});
