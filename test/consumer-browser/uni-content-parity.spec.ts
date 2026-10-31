import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  markdownMathExpressions,
  normalizeVisibleText,
  visibleSourceUnits,
} from './content-parity-helpers.js';

type UniAttachment = {
  id: string;
  name: string;
  path: string;
  type: string;
  sha256?: string;
  size?: number;
};

type UniLeaf = {
  id: string;
  title: string;
  path: string;
  attachments: UniAttachment[];
};

type UniSection = {
  id: string;
  title: string;
  hue: number;
  groups: Array<{ title: string; leaves: UniLeaf[] }>;
};

const uniUrl = process.env.DOCS_UNI_URL?.trim() ?? '';
const uniTocPath = process.env.DOCS_UNI_TOC_PATH?.trim() ?? '';

function markdownHeadings(markdown: string): string[] {
  const content = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  let inFence = false;
  return content.split(/\r?\n/).flatMap((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return [];
    }
    const heading = !inFence && line.match(/^#{2,6}\s+(.+?)\s*#*$/);
    return heading
      ? [
          heading[1]
            .replaceAll('\\[', '[')
            .replaceAll('\\]', ']')
            .replaceAll('\\(', '(')
            .replaceAll('\\)', ')')
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/[`*_~]/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
        ]
      : [];
  });
}

function normalizeText(value: string): string {
  return normalizeVisibleText(value);
}

function localAttachmentRoute(leaf: UniLeaf, attachment: UniAttachment): string {
  const pagePath = leaf.path.split('/').map(encodeURIComponent).join('/');
  const pageUrl = new URL(pagePath, 'https://local.invalid/');
  const assetUrl = new URL(attachment.path, pageUrl);
  const pathname = assetUrl.pathname.startsWith('/content/')
    ? '/files/' + assetUrl.pathname.slice('/content/'.length)
    : assetUrl.pathname;
  return pathname + assetUrl.search + assetUrl.hash;
}

function expectedOrderedListValues(markdown: string): number[] {
  const values: number[] = [];
  let inFence = false;
  let inRichBlock = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```+|~~~+)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*:::/.test(line)) {
      inRichBlock = !inRichBlock;
      continue;
    }
    if (inRichBlock) continue;
    const ordered = line.match(/^(\d+)[.)]\s+/);
    if (ordered) values.push(Number(ordered[1]));
  }
  return values;
}

test('source comparison keeps HTML line breaks between table cell values', () => {
  const source =
    '| Subject codes | `31282` Systems Testing and Quality Management<br>`32571`<br>Enterprise Software Testing |';
  expect(visibleSourceUnits(source)).toContain(
    '31282 Systems Testing and Quality Management 32571 Enterprise Software Testing',
  );
});

test('source comparison keeps a literal pipe in prose', () => {
  expect(visibleSourceUnits('Professor Ren Ping Liu | Subject Coordinator')).toContain(
    'Professor Ren Ping Liu | Subject Coordinator',
  );
});

test('source comparison checks rich math data without treating schema fields as prose', () => {
  const source = `:::terra-docs math\n_key: formula-key\n_type: math\ncode: x^2 + 1\ninline: true\n:::`;
  expect(visibleSourceUnits(source)).not.toContain('_key: formula-key');
  expect(visibleSourceUnits(source)).not.toContain('_type: math');
  expect(markdownMathExpressions(source)).toEqual(['x^2 + 1']);
});

test('source comparison checks display math as math instead of prose', () => {
  const source = 'Before the formula.\n\n$$\n\\text{Total delay} = N \\cdot \\frac{L}{R}\n$$\n\nAfter the formula.';
  expect(visibleSourceUnits(source)).toEqual(['Before the formula.', 'After the formula.']);
  expect(markdownMathExpressions(source)).toEqual(['\\text{Total delay} = N \\cdot \\frac{L}{R}']);
});

test('source comparison does not treat math delimiters inside inline code as rendered math', () => {
  const source = 'A code example: `\\$\\mathcal{O}(n^2)\\$` and actual math $n^2$.';
  expect(markdownMathExpressions(source)).toEqual(['n^2']);
});
test('source comparison preserves math delimiters displayed as inline code', () => {
  const tick = String.fromCharCode(96);
  expect(visibleSourceUnits('Display math uses ' + tick + '$$' + tick + ' delimiters.')).toEqual([
    'Display math uses $$ delimiters.',
  ]);
});

test('source comparison treats image titles with parentheses as metadata', () => {
  const source = '![A useful diagram.](./diagram.png "TCP additive increase (AIMD) probes bandwidth.")';
  expect(visibleSourceUnits(source)).toEqual(['A useful diagram.']);
});

test('source comparison handles a linked URL wrapped in prose parentheses', () => {
  const source = 'The direct link ([https://edstem.org/](https://edstem.org/)) is not recommended.';
  expect(visibleSourceUnits(source)).toEqual([
    'The direct link (https://edstem.org/) is not recommended.',
  ]);
});

test('source comparison checks legacy Markdown table directives by visible cells', () => {
  const source = `:::terra-docs table[UDP%20Fields]\n| Field | Description |\n| --- | --- |\n| Source Port | Sending process port number |\n:::`;
  expect(visibleSourceUnits(source)).toEqual([
    'UDP Fields',
    'Field',
    'Description',
    'Source Port',
    'Sending process port number',
  ]);
});

test('source comparison checks an embed title without treating schema fields as prose', () => {
  const source = `:::terra-docs embed\n_key: embed-key\n_type: embed\nsrc: https://example.com\ntitle: Embedded lesson\n:::`;
  const units = visibleSourceUnits(source);
  expect(units).toContain('Embedded lesson');
  expect(units).not.toContain('_key: embed-key');
  expect(units).not.toContain('src: https://example.com');
});

test('source comparison descends through accordions to read nested rich-block values', () => {
  const source = `::::terra-docs accordion
:::terra-item "Supplement: Additional Practice"
This section has a nested table.

:::terra-docs table
_type: table
header: Table
rows:
  - cells:
      - markdown: Review/Practice Problem
      - markdown: Skill/Concept Practiced
  - cells:
      - markdown: Add two 16-bit words in binary.
      - markdown: Checksum computation.
:::
:::terra-item-end
::::`;
  const units = visibleSourceUnits(source);
  expect(units).toContain('Supplement: Additional Practice');
  expect(units).toContain('This section has a nested table.');
  expect(units).toContain('Review/Practice Problem');
  expect(units).toContain('Add two 16-bit words in binary.');
  expect(units).toContain('Checksum computation.');
  expect(units).not.toContain('Table');
  expect(units).not.toContain('_type: table');
});

test('source comparison splits Markdown tables nested in accordion items into visible cells', () => {
  const source = `::::terra-docs accordion
:::terra-item "Objectives"
| 🛠️ Development | 🔧 Maintenance |
| --- | --- |
| ✅ Improve development efficiency | ✅ Improve maintenance efficiency |
:::terra-item-end
::::`;
  expect(visibleSourceUnits(source)).toEqual([
    'Objectives',
    '🛠️ Development',
    '🔧 Maintenance',
    '✅ Improve development efficiency',
    '✅ Improve maintenance efficiency',
  ]);
});

test('source comparison checks callout titles and prose inside accordion items', () => {
  const source = `::::terra-docs accordion
:::terra-item "Tutorial attendance"
:::tip[Attendance policy]
You may attend any tutorial slot.
:::
:::example[Worked example]
Show each algebraic step.
:::
:::terra-item-end
::::`;
  expect(visibleSourceUnits(source)).toEqual([
    'Tutorial attendance',
    'Attendance policy',
    'You may attend any tutorial slot.',
    'Worked example',
    'Show each algebraic step.',
  ]);
});

test('source comparison checks nested display math separately from prose', () => {
  const source = `::::terra-docs accordion
:::terra-item "First principles"
The derivative is defined by the limit of the difference quotient:

$$
f'(x) = \\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}
$$
:::terra-item-end
::::`;
  expect(visibleSourceUnits(source)).toEqual([
    'First principles',
    'The derivative is defined by the limit of the difference quotient:',
  ]);
  expect(markdownMathExpressions(source)).toEqual([
    "f'(x) = \\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}",
  ]);
});

test('source comparison handles example blocks nested in accordion items', () => {
  const source = `::::terra-docs accordion
:::terra-item "Implicit differentiation"
:::example[Circle]
Differentiate the circle equation with respect to both variables.
:::
:::terra-item-end
::::`;
  expect(visibleSourceUnits(source)).toEqual([
    'Implicit differentiation',
    'Circle',
    'Differentiate the circle equation with respect to both variables.',
  ]);
});

test('Uni tree navigation to a leaf without contributor metadata does not crash Docs', async ({
  page,
}) => {
  test.skip(!uniUrl, 'Set DOCS_UNI_URL.');
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto(new URL('/', uniUrl).toString(), { waitUntil: 'networkidle' });

  const leafId = 'BsQUwF6kisLoqnrcb5aNJ2';
  const leaf = page.locator(`a[href="/#${leafId}"]`);
  await expect(leaf).toBeVisible();
  await leaf.click();
  await expect(page).toHaveURL(new RegExp(`#${leafId}$`));
  await expect(page.locator('#docs-title')).toHaveValue('Subject Information');
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false');
  expect(browserErrors, 'tree navigation should not throw in Scaffold').toEqual([]);
});

test('Uni direct leaf deep links load without contributor metadata', async ({ page }) => {
  test.skip(!uniUrl, 'Set DOCS_UNI_URL.');
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  const leafId = 'BsQUwF6kisLoqnrcb5aNJ2';
  await page.goto(new URL(`/#${leafId}`, uniUrl).toString(), { waitUntil: 'networkidle' });

  await expect(page).toHaveURL(new RegExp(`#${leafId}$`));
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false');
  await expect(page.locator('#docs-title')).toHaveValue('Subject Information');
  expect(browserErrors, 'direct leaf entry should not throw in Scaffold').toEqual([]);
});

test('Uni landing page renders the local Markdown source before visual capture', async ({ page }) => {
  test.skip(!uniUrl || !uniTocPath, 'Set DOCS_UNI_URL and DOCS_UNI_TOC_PATH.');

  const repoRoot = resolve(dirname(uniTocPath), '..');
  const markdown = readFileSync(resolve(repoRoot, 'content/index.md'), 'utf8');
  const expected = visibleSourceUnits(markdown).map(normalizeText);
  expect(expected.length).toBeGreaterThan(0);

  const response = await page.goto(new URL('/', uniUrl).toString(), { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  const body = page.locator('[data-docs-body-content]');
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-loading', 'false');
  await expect(body).toHaveText(/\S/);
  const rendered = normalizeText(await body.innerText());
  for (const unit of expected) {
    expect(rendered, `Uni landing page should render source unit: ${unit}`).toContain(unit);
  }
});

test('Uni source, TOC, rendered pages, and attachment view agree for every leaf', async ({
  page,
}) => {
  test.setTimeout(300_000);
  test.skip(!uniUrl || !uniTocPath, 'Set DOCS_UNI_URL and DOCS_UNI_TOC_PATH.');

  const sections = JSON.parse(readFileSync(uniTocPath, 'utf8')) as UniSection[];
  const repoRoot = resolve(dirname(uniTocPath), '..');
  const leaves = sections.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.leaves.map((leaf) => ({
        ...leaf,
        section: section.title,
        group: group.title,
        hue: section.hue,
      })),
    ),
  );
  expect(leaves).toHaveLength(88);
  expect(new Set(leaves.map((leaf) => leaf.id)).size).toBe(leaves.length);
  const leafStart = Number(process.env.DOCS_UNI_LEAF_START ?? 0);
  const leafEnd = Number(process.env.DOCS_UNI_LEAF_END ?? leaves.length);
  expect(
    Number.isInteger(leafStart) &&
      Number.isInteger(leafEnd) &&
      leafStart >= 0 &&
      leafEnd <= leaves.length &&
      leafEnd > leafStart,
    'Uni audit shard has a valid non-empty TOC range',
  ).toBe(true);
  const auditedLeaves = leaves.slice(leafStart, leafEnd);
  const localLeafIds = new Set(leaves.map((leaf) => leaf.id));
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  for (const leaf of leaves) {
    const markdownPath = resolve(repoRoot, leaf.path);
    const markdown = readFileSync(markdownPath, 'utf8');
    expect(markdown, `${leaf.id} keeps representable tables in Markdown`).not.toMatch(
      /<\/?table\b/i,
    );
    if (leaf.id === 'ns1Jhrj96oySML10X1Zswc') {
      expect(markdown, 'Mechanics keeps its diagram as a supported Docs block').toContain(
        ':::terra-docs nodes',
      );
      expect(markdown, 'Mechanics drops the invalid serialized graph fields').not.toMatch(
        /node_data:|edges_data:/,
      );
    }
    const attachmentIds = leaf.attachments.map((attachment) => attachment.id).sort();
    const headingTexts = markdownHeadings(markdown);
    for (const attachment of leaf.attachments) {
      if (attachment.type === 'fileAttachment') {
        const diskPath = resolve(dirname(markdownPath), attachment.path);
        const buffer = readFileSync(diskPath);
        expect(buffer.byteLength, `${leaf.title}: ${attachment.name} size`).toBe(attachment.size);
        if (attachment.sha256)
          expect(
            createHash('sha256').update(buffer).digest('hex'),
            `${leaf.title}: ${attachment.name} checksum`,
          ).toBe(attachment.sha256);
      } else {
        const localReference = attachment.path.match(/^\/#([^/?#]+)$/)?.[1];
        if (localReference) {
          expect(localLeafIds.has(localReference), `${leaf.title}: ${attachment.name} target`).toBe(
            true,
          );
        } else {
          expect(
            () => new URL(attachment.path),
            `${leaf.title}: ${attachment.name} URL`,
          ).not.toThrow();
        }
      }
    }
  }

  const firstLeaf = auditedLeaves[0]!;
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(new URL(`/?mode=view#${firstLeaf.id}`, uniUrl).toString(), {
    waitUntil: 'networkidle',
  });
  await expect(page.locator('.terra-docs-workspace')).toBeVisible();

  const shell = page.locator('[data-docs-shell]');
  const title = page.locator('#docs-title');
  const sectionSelector = page.getByRole('combobox', { name: 'Section' });
  const body = page.locator('[data-docs-body-content]');

  for (const leaf of auditedLeaves) {
    await page.evaluate((id) => {
      if (window.location.hash !== '#' + id) window.location.hash = '#' + id;
    }, leaf.id);
    await expect(shell, `${leaf.section}/${leaf.group}/${leaf.title} ready`).toHaveAttribute(
      'data-loading',
      'false',
    );
    await expect(title, `${leaf.id} title`).toHaveValue(leaf.title);
    await expect(sectionSelector, `${leaf.id} section`).toContainText(leaf.section);
    await expect
      .poll(async () => {
        try {
          return await page.evaluate(() =>
            document.documentElement.style.getPropertyValue('--hue'),
          );
        } catch {
          // A route transition can briefly replace the document execution
          // context; retry until the selected section's theme is applied.
          return '';
        }
      }, { message: `${leaf.id} section hue finishes updating` })
      .toBe(String(leaf.hue));

    const markdownPath = resolve(repoRoot, leaf.path);
    const markdown = readFileSync(markdownPath, 'utf8');
    const sourceUnits = visibleSourceUnits(markdown).map(normalizeText);
    const sourceMath = markdownMathExpressions(markdown).map(normalizeText).sort();
    // Source units include Markdown inside collapsed accordion items. Expand
    // every item before comparing so hidden content is checked in its actual
    // Docs renderer instead of being mistaken for missing content.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const collapsedItems = body.locator('button[aria-expanded="false"]');
      if ((await collapsedItems.count()) === 0) break;
      await collapsedItems.first().click();
    }
    const finalSourceUnit = sourceUnits.at(-1);
    const readVisibleBody = async (): Promise<string> => {
      const text = await body.evaluate((element) => {
        const visibleClone = element.cloneNode(true) as HTMLElement;
        // KaTeX splits superscripts and emits separate visual and assistive
        // trees. Compare surrounding prose here; math source is checked below.
        visibleClone.querySelectorAll('.katex').forEach((math) => math.remove());
        return visibleClone.innerText;
      });
      const visibleCode = await body
        .locator('code')
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const style = getComputedStyle(element);
              return style.display !== 'none' && style.visibility === 'visible' && element.getClientRects().length > 0;
            })
            .map((element) => element.textContent ?? '')
            .join(' '),
        );
      const visibleImageAlt = await body
        .locator('img[alt]')
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const style = getComputedStyle(element);
              return style.display !== 'none' && style.visibility === 'visible' && element.getClientRects().length > 0;
            })
            .map((element) => element.getAttribute('alt') ?? '')
            .join(' '),
        );
      const accessibleEmbedTitles = await body
        .locator('iframe[title]')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('title') ?? '').join(' '),
        );
      return normalizeText(`${text} ${visibleCode} ${visibleImageAlt} ${accessibleEmbedTitles}`);
    };
    // Switching a leaf updates the host props and the extracted Docs workspace
    // state in separate React effects. Wait for a source unit at the end of the
    // document so an older revision with the same opening paragraph cannot pass
    // the readiness check and then be compared as if it were current.
    if (finalSourceUnit)
      await expect
        .poll(readVisibleBody, { message: `${leaf.id} source content finishes rendering` })
        .toContain(finalSourceUnit);
    const renderedBody = await readVisibleBody();
    expect(renderedBody.length, `${leaf.id} has rendered body content`).toBeGreaterThan(0);
    const renderedProse = await body.evaluate((element) => {
      const visibleClone = element.cloneNode(true) as HTMLElement;
      visibleClone.querySelectorAll('.katex, pre, code').forEach((element) => element.remove());
      return visibleClone.innerText;
    });
    expect(
      renderedProse,
      `${leaf.id} must render supported Markdown directives as blocks, not raw fences`,
    ).not.toMatch(/^\s*:{3,}\s*$/m);
    expect(renderedBody, `${leaf.id} must not show serialized block payloads`).not.toMatch(
      /(?:"_type"\s*:\s*"block"|:::terra-docs\s+nodes|<Nodes\s+direction=)/,
    );

    for (const sourceUnit of sourceUnits)
      expect(renderedBody, `${leaf.id} source meaning should render: ${sourceUnit.slice(0, 140)}`).toContain(
        sourceUnit,
      );
    if (leaf.id === '9AexXGHk6co2Lu8zEXVqtu')
      await page.screenshot({
        path: 'test-results/consumer-uni-network-course-guide-light.png',
        fullPage: true,
      });
    const readRenderedMath = () =>
      body.locator('.katex annotation[encoding="application/x-tex"]').allTextContents();
    await expect
      .poll(async () => (await readRenderedMath()).map(normalizeText).sort(), {
        message: `${leaf.id} math finishes rendering for the selected leaf`,
      })
      .toEqual(sourceMath);
    const renderedMath = await readRenderedMath();
    expect(
      renderedMath.map(normalizeText).sort(),
      `${leaf.id} inline and display math should render from the same source expressions`,
    ).toEqual(sourceMath);
    const headingCounts = new Map<string, number>();
    for (const heading of markdownHeadings(markdown))
      headingCounts.set(heading, (headingCounts.get(heading) ?? 0) + 1);
    for (const [heading, count] of headingCounts) {
      const renderedHeading = body.getByRole('heading', {
        name: `Copy link to ${heading}`,
        exact: true,
      });
      await expect(renderedHeading, `${leaf.id} heading ${heading}`).toHaveCount(count);
      await expect(renderedHeading.first()).toBeVisible();
    }

    const renderedLists = await body
      .locator('ul[data-docs-list-level], ol[data-docs-list-level]')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const list = element as HTMLOListElement | HTMLUListElement;
          const style = getComputedStyle(list);
          const level = Number(list.dataset.docsListLevel ?? 0);
          return {
            tag: list.tagName,
            level,
            start: list.tagName === 'OL' ? Number((list as HTMLOListElement).start) : null,
            padding: Number.parseFloat(style.paddingInlineStart),
            margin: Number.parseFloat(style.marginInlineStart),
            lineHeight: Number.parseFloat(style.lineHeight),
            marker: style.listStyleType,
            itemMargins: [...list.children].map(
              (item) =>
                Number.parseFloat(getComputedStyle(item).marginBlockStart) +
                Number.parseFloat(getComputedStyle(item).marginBlockEnd),
            ),
          };
        }),
      );
    for (const list of renderedLists) {
      expect(list.level, `${leaf.id} list level`).toBeGreaterThan(0);
      expect(list.padding, `${leaf.id} list marker indent`).toBe(24);
      expect(list.margin, `${leaf.id} nested-list indent`).toBe((list.level - 1) * 24);
      expect(list.lineHeight, `${leaf.id} list line height`).toBeLessThanOrEqual(24);
      expect(list.marker, `${leaf.id} list marker`).toBe(list.tag === 'OL' ? 'decimal' : 'disc');
      expect(list.itemMargins, `${leaf.id} list item spacing`).toEqual(
        list.itemMargins.map(() => 0),
      );
      if (list.tag === 'OL') expect(list.start, `${leaf.id} ordered-list start`).toBeGreaterThan(0);
    }

    const diagramColors = await body
      .locator('[data-docs-editor-block="Nodes"] .react-flow__node a')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          title: node.textContent?.trim() ?? '',
          classes: (node as HTMLElement).className,
          color: getComputedStyle(node).color,
          primary: getComputedStyle(node).getPropertyValue('--primary-12').trim(),
          secondary: getComputedStyle(node).getPropertyValue('--secondary-11').trim(),
        })),
      );
    for (const node of diagramColors) {
      if (node.classes.split(/\s+/).includes('text-primary-12'))
        expect(node.color, `${leaf.id} primary node ${node.title}`).toBe(
          `rgb(${node.primary.split(/\s+/).join(', ')})`,
        );
      if (node.classes.split(/\s+/).includes('text-secondary-11'))
        expect(node.color, `${leaf.id} secondary node ${node.title}`).toBe(
          `rgb(${node.secondary.split(/\s+/).join(', ')})`,
        );
    }

    if (leaf.id === 'BsQUwF6kisLoqnrcb5aNJ2')
      await page.screenshot({
        path: 'test-results/consumer-uni-database-subject-light.png',
        fullPage: true,
      });
  }

  const appsAndSockets = leaves.find((leaf) => leaf.id === 'y6IcP6oVLv997QPbhVhsuf');
  expect(appsAndSockets, 'Apps & Sockets fixture leaf exists').toBeDefined();
  const appsAndSocketsMarkdown = readFileSync(resolve(repoRoot, appsAndSockets!.path), 'utf8');
  const expectedListValues = expectedOrderedListValues(appsAndSocketsMarkdown);
  expect(expectedListValues.length, 'Apps & Sockets contains real ordered lists').toBeGreaterThan(
    0,
  );
  await page.evaluate((id) => {
    window.location.hash = `#${id}`;
  }, appsAndSockets!.id);
  await expect(shell).toHaveAttribute('data-loading', 'false');
  await expect(title).toHaveValue(appsAndSockets!.title);
  const topLevelOrderedLists = body.locator('ol[data-docs-list-level="1"]');
  await expect(topLevelOrderedLists, 'ordered-list blocks have finished rendering').toHaveCount(
    expectedListValues.length,
  );
  const actualListValues = await topLevelOrderedLists.evaluateAll((lists) =>
    lists.map((list) => Number((list as HTMLOListElement).start)),
  );
  expect(actualListValues, 'Apps & Sockets item numbers match source').toEqual(expectedListValues);
  await page.screenshot({
    path: 'test-results/consumer-uni-apps-and-sockets-light.png',
    fullPage: true,
  });

  const mode = page.getByRole('combobox', { name: 'Mode' });
  await mode.click();
  await page.getByRole('option', { name: 'Attachments', exact: true }).click();
  await expect(page.locator('[data-docs-shell]')).toHaveAttribute('data-docs-mode', 'attachments');
  const attachments = page.locator('[data-docs-attachment-id]');
  for (const leaf of auditedLeaves) {
    await page.evaluate((id) => {
      if (window.location.hash !== '#' + id) window.location.hash = '#' + id;
    }, leaf.id);
    await expect(page.locator('[data-docs-shell]'), `${leaf.id} attachments ready`).toHaveAttribute(
      'data-loading',
      'false',
    );
    await expect(title, `${leaf.id} attachment page title`).toHaveValue(leaf.title);
    await expect(attachments, `${leaf.id} attachment count`).toHaveCount(leaf.attachments.length);
    for (const attachment of leaf.attachments) {
      const card = page.locator('[data-docs-attachment-id="' + attachment.id + '"]');
      await expect(card, `${leaf.id} attachment ${attachment.name}`).toHaveCount(1);
      await expect(card).toHaveAttribute('aria-label', 'Attachment ' + attachment.name);
      if (attachment.type === 'fileAttachment')
        await expect(card.locator('p.truncate')).toHaveText(
          localAttachmentRoute(leaf, attachment),
        );
    }
    const renderedAttachmentIds = await attachments.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-docs-attachment-id') ?? '').sort(),
    );
    expect(renderedAttachmentIds, `${leaf.id} attachment IDs`).toEqual(
      leaf.attachments.map((attachment) => attachment.id).sort(),
    );
  }

  await page.screenshot({
    path: 'test-results/consumer-uni-last-leaf-attachments.png',
    fullPage: true,
  });

  await mode.click();
  await page.getByRole('option', { name: 'View', exact: true }).click();
  await page.evaluate(() => {
    window.location.hash = '#BsQUwF6kisLoqnrcb5aNJ2';
  });
  await expect(shell).toHaveAttribute('data-loading', 'false');
  await expect(title).toHaveValue('Subject Information');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect
    .poll(() =>
      page
        .locator('.terra-docs-workspace')
        .evaluate(
          (workspace) =>
            getComputedStyle(workspace.closest<HTMLElement>('.docs-theme-scope') ?? workspace)
              .colorScheme,
        ),
    )
    .toBe('dark');
  const darkRoot = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
    hue: document.documentElement.style.getPropertyValue('--hue'),
  }));
  expect(darkRoot.html).toBe(darkRoot.body);
  expect(darkRoot.html).not.toBe('rgb(255, 255, 255)');
  expect(darkRoot.hue).toBe('30');
  await page.screenshot({
    path: 'test-results/consumer-uni-database-subject-dark.png',
    fullPage: true,
  });
  expect(browserErrors, 'all TOC navigation and mode changes should stay error-free').toEqual([]);
});
