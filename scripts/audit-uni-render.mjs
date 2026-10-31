/* global process, URL, document, location, console, HTMLInputElement, HTMLTextAreaElement */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const uniRoot = resolve(process.env.UNI_DOCS_ROOT || '/Users/kaimacann/Desktop/uni/notes');
const baseUrl = process.env.UNI_DOCS_URL || 'http://127.0.0.1:5175';
const reportPath = resolve(
  process.env.UNI_RENDER_REPORT || join(uniRoot, 'content/_archive/live-render-audit.json'),
);
const screenshotDir = resolve(process.env.UNI_RENDER_SCREENSHOTS || '/tmp/uni-render-audit');
const pkgRoot = dirname(
  await realpath(join(uniRoot, 'node_modules/@terra-symposium/docs/package.json')),
);
const docsPkg = await import(pathToFileURL(join(pkgRoot, 'lib-dist/lib/index.js')));
const manifest = JSON.parse(
  await readFile(join(uniRoot, 'content/_archive/manifest.json'), 'utf8'),
);
const reconciliation = JSON.parse(
  await readFile(join(uniRoot, 'content/_archive/reconciliation-report.json'), 'utf8'),
);
const toc = JSON.parse(await readFile(join(uniRoot, 'content/toc.json'), 'utf8'));
const leaves = manifest.leaves;
const failures = [];
const pageErrors = [];
const consoleErrors = [];
const pages = [];
const screenshots = [];
const sourceAnomalies = [];
const familyTotals = {};
const sanitySections = JSON.parse(
  await readFile(join(uniRoot, 'content/_archive/sanity-production-tree.json'), 'utf8'),
);
const sanityLeaves = sanitySections.flatMap((section) =>
  (section.groups ?? []).flatMap((group) => group.leaves ?? []),
);
const manifestById = new Map(leaves.map((leaf) => [leaf.id, leaf]));
const reconciliationPageById = new Map((reconciliation.pages ?? []).map((leaf) => [leaf.id, leaf]));
const tocLeaves = toc.flatMap((section) =>
  (section.groups ?? []).flatMap((group) =>
    (group.leaves ?? []).map((leaf) => ({ section, group, leaf })),
  ),
);
const tocById = new Map(
  tocLeaves.map(({ section, group, leaf }) => [leaf.id, { section, group, leaf }]),
);
const imageManifest = [...(manifest.inlineImages ?? []), ...(manifest.recoveredInlineImages ?? [])];

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit);
    return;
  }
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const [key, child] of Object.entries(value)) {
    if (key !== '_key' && key !== '_type') walk(child, visit);
  }
}
function ofType(value, type) {
  const items = [];
  walk(value, (item) => {
    if (item._type === type) items.push(item);
  });
  return items;
}
function plainText(value) {
  if (Array.isArray(value)) return value.map(plainText).join(' ');
  if (!value || typeof value !== 'object') return '';
  if (value._type === 'span') return String(value.text ?? '');
  if (Array.isArray(value.children)) return value.children.map(plainText).join('');
  if (Array.isArray(value.content)) return value.content.map(plainText).join(' ');
  if (Array.isArray(value.cells)) return value.cells.map(plainText).join(' ');
  if (Array.isArray(value.rows)) return value.rows.map(plainText).join(' ');
  return '';
}
function tableCellPlainText(value) {
  if (Array.isArray(value)) return value.map(tableCellPlainText).join('');
  if (!value || typeof value !== 'object') return '';
  if (value._type === 'span') return String(value.text ?? '');
  if (value._type === 'code' || value._type === 'math' || value._type === 'nodes') return '';
  if (Array.isArray(value.children)) return value.children.map(tableCellPlainText).join('');
  if (Array.isArray(value.content)) return value.content.map(tableCellPlainText).join('');
  if (Array.isArray(value.cells)) return value.cells.map(tableCellPlainText).join(' ');
  if (Array.isArray(value.rows)) return value.rows.map(tableCellPlainText).join(' ');
  if (typeof value.text === 'string') return value.text;
  return '';
}
function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200b-\u200f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function normalizeCode(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+$/gm, '')
    .replace(/\n+$/, '');
}
function isMarkdownThematicBreak(value) {
  const source = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  return /^(?:\*(?:[\t ]*\*){2,}|-(?:[\t ]*-){2,}|_(?:[\t ]*_){2,})[\t ]*$/.test(source);
}
function normalizePageAssetUrls(value, pagePath) {
  const routeDirectory = dirname(String(pagePath ?? ''))
    .replace(/^content\//, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  if (!routeDirectory) return String(value ?? '');
  return String(value ?? '')
    .split(`/files/${routeDirectory}/`)
    .join('./')
    .replaceAll('/files/', '/content/');
}
function expectedEmbedUrl(source) {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let videoId;
    if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
      videoId =
        match?.[1] ??
        (url.pathname === '/watch' ? (url.searchParams.get('v') ?? undefined) : undefined);
    } else if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0];
    }
    if (!videoId || !/^[\w-]+$/.test(videoId)) return source;
    const playerHost =
      host === 'youtube-nocookie.com' ? 'www.youtube-nocookie.com' : 'www.youtube.com';
    const player = new URL(`https://${playerHost}/embed/${videoId}`);
    for (const key of ['list', 'index', 'playsinline', 'rel']) {
      const value = url.searchParams.get(key);
      if (value) player.searchParams.set(key, value);
    }
    const time = url.searchParams.get('start') ?? url.searchParams.get('t');
    if (time) {
      if (/^\d+$/.test(time)) player.searchParams.set('start', time);
      else {
        const match = time.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
        if (match?.[0]) {
          const seconds =
            Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
          if (seconds > 0) player.searchParams.set('start', String(seconds));
        }
      }
    }
    return player.toString();
  } catch {
    return source;
  }
}
const supportedDecorators = new Set(['strong', 'em', 'underline', 'strike-through', 'code']);
function canonicalHref(value, pagePath) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const pageUrl = pagePath ? new URL(`/${pagePath}`, baseUrl) : new URL(baseUrl);
    const resolved = new URL(value, pageUrl);
    if (resolved.pathname.startsWith('/files/'))
      resolved.pathname = `/content/${resolved.pathname.slice('/files/'.length)}`;
    return resolved.href;
  } catch {
    return value;
  }
}
function sourceInlineRuns(block, pagePath) {
  const linkByKey = new Map(
    (block.markDefs ?? [])
      .filter((definition) => definition?._type === 'link' && definition?._key)
      .map((definition) => [definition._key, definition.href]),
  );
  const runs = [];
  let previousSignature = null;
  for (const child of block.children ?? []) {
    if (child?._type !== 'span') {
      previousSignature = null;
      continue;
    }
    const text = String(child.text ?? '');
    if (!text) continue;
    const decorators = [];
    const unknownMarks = [];
    let href = null;
    for (const mark of child.marks ?? []) {
      if (supportedDecorators.has(mark)) decorators.push(mark);
      else if (linkByKey.has(mark)) href = canonicalHref(linkByKey.get(mark), pagePath);
      else unknownMarks.push(String(mark));
    }
    decorators.sort();
    unknownMarks.sort();
    const signature = JSON.stringify({ decorators, href, unknownMarks });
    const last = runs.at(-1);
    if (previousSignature === signature && last?.signature === signature) last.text += text;
    else runs.push({ signature, decorators, href, unknownMarks, text });
    previousSignature = signature;
  }
  return runs;
}
function renderedInlineRuns(spans, pagePath) {
  const runs = [];
  for (const span of spans) {
    const { decorators = [], href = null, text = '', unknownMarks = [] } = span;
    if (!text) continue;
    const signature = JSON.stringify({
      decorators: [...decorators].sort(),
      href: canonicalHref(href, pagePath),
      unknownMarks: [...unknownMarks].sort(),
    });
    const last = runs.at(-1);
    if (span.canJoinPrevious && last?.signature === signature) last.text += text;
    else
      runs.push({
        signature,
        decorators: [...decorators].sort(),
        href: canonicalHref(href, pagePath),
        unknownMarks,
        text,
      });
  }
  return runs;
}
function expectedTopType(type) {
  if (type === 'terraBlock' || type === 'block') return 'text';
  return type;
}

const sourceAudit = {
  sanityLeaves: sanityLeaves.length,
  tocPages: tocLeaves.length,
  uniqueTocPages: new Set(tocLeaves.map(({ leaf }) => leaf.id)).size,
  markdownLeaves: 0,
  reconciledSanityLeaves: 0,
  reconciliation: reconciliation.summary,
  imageLocalizedLeaves: 0,
  differences: [],
  markdownHashesVerified: 0,
  markdownHashFailures: [],
  inlineAssets: {
    expected: imageManifest.length,
    sanityExpected: manifest.inlineImages?.length ?? 0,
    recoveredExpected: manifest.recoveredInlineImages?.length ?? 0,
    verified: 0,
    failures: [],
  },
};
if (
  tocLeaves.length !== leaves.length ||
  new Set(tocLeaves.map(({ leaf }) => leaf.id)).size !== leaves.length
)
  sourceAudit.differences.push({
    issue: 'toc-page-count-or-uniqueness',
    expected: leaves.length,
    actual: tocLeaves.length,
  });
for (const sourceLeaf of sanityLeaves) {
  const leaf = manifestById.get(sourceLeaf._id);
  if (!leaf) {
    sourceAudit.differences.push({ id: sourceLeaf._id, issue: 'missing-local-markdown' });
    continue;
  }
  sourceAudit.markdownLeaves++;
  const markdown = await readFile(join(uniRoot, leaf.path), 'utf8');
  const parsed = docsPkg.markdownToDocsValue(markdown);
  const reconciliationPage = reconciliationPageById.get(sourceLeaf._id);
  if (!reconciliationPage || !Array.isArray(reconciliationPage.canonicalRoundTrip?.comparisons)) {
    sourceAudit.differences.push({
      id: sourceLeaf._id,
      issue: 'missing-source-reconciliation-record',
    });
  } else {
    sourceAudit.reconciledSanityLeaves++;
  }
  const sourceContent = sourceLeaf.content ?? [];
  const sourceImages = ofType(sourceContent, 'docImage');
  const parsedImages = ofType(parsed, 'docImage');
  const expectedAssets = imageManifest.filter((item) => item.leafId === sourceLeaf._id);
  let imagesMatch = expectedAssets.length === parsedImages.length;
  for (const original of sourceImages) {
    const asset = expectedAssets.find((item) => item.url === original.url);
    if (!asset) {
      imagesMatch = false;
      sourceAudit.differences.push({
        id: sourceLeaf._id,
        issue: 'sanity-inline-image-unrecorded',
        expected: original.url,
      });
    }
  }
  const localImagePath = (image) => {
    try {
      return decodeURIComponent(
        new URL(image.url, new URL(`/${leaf.path}`, baseUrl)).pathname.replace(/^\/+/, ''),
      );
    } catch {
      return image.url;
    }
  };
  for (const asset of expectedAssets) {
    const renderedSource = parsedImages.find(
      (image) => localImagePath(image) === asset.path && (image.alt ?? '') === (asset.alt ?? ''),
    );
    if (!renderedSource || /^https?:\/\//i.test(renderedSource.url)) {
      imagesMatch = false;
      sourceAudit.differences.push({
        id: sourceLeaf._id,
        issue: 'image-markdown-source-mismatch',
        originalUrl: asset.url,
        expectedPath: asset.path,
        actualPath: renderedSource ? localImagePath(renderedSource) : null,
        expectedAlt: asset.alt,
        actualAlt: renderedSource?.alt ?? null,
      });
    }
  }
  if (imagesMatch) {
    if (expectedAssets.length) sourceAudit.imageLocalizedLeaves++;
  } else if (!sourceAudit.differences.some((item) => item.id === sourceLeaf._id)) {
    sourceAudit.differences.push({
      id: sourceLeaf._id,
      issue: 'inline-image-count-or-localization-mismatch',
      expected: expectedAssets.length,
      actual: parsedImages.length,
    });
  }
}
for (const leaf of leaves) {
  const markdown = await readFile(join(uniRoot, leaf.path), 'utf8');
  const actual = createHash('sha256').update(markdown).digest('hex');
  if (actual === leaf.sha256) sourceAudit.markdownHashesVerified++;
  else
    sourceAudit.markdownHashFailures.push({
      id: leaf.id,
      path: leaf.path,
      expected: leaf.sha256,
      actual,
    });
}
for (const asset of imageManifest) {
  try {
    const bytes = await readFile(join(uniRoot, asset.path));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== asset.bytes || sha256 !== asset.sha256) {
      sourceAudit.inlineAssets.failures.push({
        path: asset.path,
        expectedBytes: asset.bytes,
        actualBytes: bytes.length,
        expectedSha256: asset.sha256,
        actualSha256: sha256,
      });
    } else sourceAudit.inlineAssets.verified++;
  } catch (error) {
    sourceAudit.inlineAssets.failures.push({ path: asset.path, issue: String(error) });
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1680, height: 1100 },
  colorScheme: 'dark',
});
page.on('pageerror', (error) => pageErrors.push({ url: page.url(), message: error.message }));
page.on('console', (message) => {
  if (message.type() === 'error') {
    const record = { url: page.url(), message: message.text() };
    consoleErrors.push(record);
  }
});
await mkdir(screenshotDir, { recursive: true });
const allPageScreenshotDirs = {
  dark: join(screenshotDir, 'all-pages-dark'),
  light: join(screenshotDir, 'all-pages-light'),
  attachments: join(screenshotDir, 'attachments-dark'),
};
await Promise.all(
  Object.values(allPageScreenshotDirs).map((directory) => mkdir(directory, { recursive: true })),
);
await page.route('https://www.youtube.com/embed/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main>Offline YouTube embed fixture</main></body></html>',
  }),
);

async function openLeaf(leaf, parsed) {
  await page.goto(`${baseUrl}/#${encodeURIComponent(leaf.id)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  try {
    await page.waitForFunction(
      ({ hash, count }) => {
        const roots = [...document.querySelectorAll('[aria-label="Document viewer"]')].filter(
          (element) => !element.parentElement?.closest('[aria-label="Document viewer"]'),
        );
        if (location.hash !== hash || roots.length !== 1 || roots[0].children.length !== count)
          return false;
        return true;
      },
      { hash: `#${encodeURIComponent(leaf.id)}`, count: parsed.length },
      { timeout: 20000 },
    );
  } catch {
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'viewer-ready',
      expectedTopLevel: parsed.length,
    });
    return false;
  }
  // Nested Portable Text viewers and the outer transition shell settle separately.
  // Requiring only the block count can capture the loading overlay or a fallback toast.
  try {
    await page.waitForFunction(
      () => {
        const shell = [...document.querySelectorAll('[data-docs-shell]')].find(
          (element) => element.getAttribute('data-docs-mode') === 'view',
        );
        const loadFailure = [...document.querySelectorAll('[data-sonner-toast]')].some((toast) =>
          toast.textContent?.includes('Document blocks did not finish loading'),
        );
        return (
          shell?.getAttribute('data-loading') === 'false' &&
          !document.querySelector('[data-docs-loading-overlay]') &&
          !loadFailure
        );
      },
      undefined,
      { timeout: 20000 },
    );
  } catch (error) {
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'viewer-transition-ready',
      error: String(error).slice(0, 200),
    });
    return false;
  }
  return true;
}

function leafScreenshotName(leaf) {
  return `${String(leaf.title ?? 'page')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${leaf.id.replace(/[^a-zA-Z0-9-]+/g, '-')}.png`;
}

async function capturePageScreenshot(leaf, directory, label) {
  const file = join(directory, leafScreenshotName(leaf));
  try {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
    });
    await page.waitForFunction(
      () => {
        const loading = [...document.querySelectorAll('[data-docs-shell]')].some(
          (element) => element.getAttribute('data-loading') === 'true',
        );
        const loadFailure = [...document.querySelectorAll('[data-sonner-toast]')].some((toast) =>
          toast.textContent?.includes('Document blocks did not finish loading'),
        );
        return !loading && !document.querySelector('[data-docs-loading-overlay]') && !loadFailure;
      },
      undefined,
      { timeout: 20000 },
    );
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled', timeout: 30000 });
    screenshots.push({ family: label, title: leaf.title, id: leaf.id, path: file });
    return true;
  } catch (error) {
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'full-page-screenshot',
      theme: label,
      error: String(error).slice(0, 240),
    });
    return false;
  }
}

const expectedTocRoutes = tocLeaves.map(({ leaf }) => ({ id: leaf.id, title: leaf.title }));
const navigationAudit = { expectedPages: expectedTocRoutes.length, actualPages: 0, mismatches: [] };
await page.emulateMedia({ colorScheme: 'dark' });
await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page
  .waitForSelector('[aria-label="Document viewer"]', { timeout: 20000 })
  .catch(() => undefined);
const actualTocRoutes = [];
const sectionSelect = page.getByRole('combobox', { name: 'Section' });
for (const section of toc) {
  await sectionSelect.click();
  await page.getByRole('option', { name: section.title, exact: true }).click();
  await page.waitForTimeout(75);
  const sectionRoutes = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .filter((anchor) => anchor.parentElement?.classList.contains('peer/menu-button'))
      .map((anchor) => {
        try {
          const url = new URL(anchor.getAttribute('href') ?? '', location.href);
          const id = decodeURIComponent(url.hash.slice(1));
          return id ? { id, title: (anchor.textContent ?? '').trim() } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean),
  );
  const expectedInSection = section.groups.flatMap((group) =>
    group.leaves.map((leaf) => ({ id: leaf.id, title: leaf.title })),
  );
  const expectedIds = new Set(expectedInSection.map((entry) => entry.id));
  const observedIds = new Map();
  for (const entry of sectionRoutes) {
    if (!expectedIds.has(entry.id)) {
      navigationAudit.mismatches.push({
        issue: 'toc-extra-entry-in-section',
        section: section.title,
        id: entry.id,
        title: entry.title,
      });
    }
    observedIds.set(entry.id, [...(observedIds.get(entry.id) ?? []), entry]);
  }
  if (sectionRoutes.length !== expectedInSection.length)
    navigationAudit.mismatches.push({
      issue: 'toc-section-route-count',
      section: section.title,
      expected: expectedInSection.length,
      actual: sectionRoutes.length,
    });
  for (const expected of expectedInSection) {
    const matches = observedIds.get(expected.id) ?? [];
    if (matches.length !== 1 || matches[0]?.title !== expected.title)
      navigationAudit.mismatches.push({
        issue:
          matches.length === 0
            ? 'toc-leaf-missing'
            : matches.length > 1
              ? 'toc-leaf-duplicated'
              : 'toc-leaf-title',
        section: section.title,
        id: expected.id,
        expectedTitle: expected.title,
        actualTitles: matches.map((entry) => entry.title),
        count: matches.length,
      });
  }
  actualTocRoutes.push(...sectionRoutes);
}
const expectedTocById = new Map(expectedTocRoutes.map((entry) => [entry.id, entry]));
const observedTocRoutes = actualTocRoutes;
navigationAudit.actualPages = observedTocRoutes.length;
if (observedTocRoutes.length !== expectedTocRoutes.length) {
  navigationAudit.mismatches.push({
    issue: 'toc-route-count',
    expected: expectedTocRoutes.length,
    actual: observedTocRoutes.length,
  });
}
const observedCounts = new Map();
for (const entry of observedTocRoutes)
  observedCounts.set(entry.id, (observedCounts.get(entry.id) ?? 0) + 1);
for (const expected of expectedTocRoutes) {
  const count = observedCounts.get(expected.id) ?? 0;
  const matches = observedTocRoutes.filter((entry) => entry.id === expected.id);
  if (count !== 1 || matches[0]?.title !== expected.title) {
    navigationAudit.mismatches.push({
      issue:
        count === 0 ? 'toc-leaf-missing' : count > 1 ? 'toc-leaf-duplicated' : 'toc-leaf-title',
      id: expected.id,
      expectedTitle: expected.title,
      actualTitles: matches.map((entry) => entry.title),
      count,
    });
  }
}
for (const unexpected of observedTocRoutes.filter((entry) => !expectedTocById.has(entry.id))) {
  navigationAudit.mismatches.push({
    issue: 'toc-extra-entry',
    id: unexpected.id,
    title: unexpected.title,
  });
}
if (navigationAudit.mismatches.length)
  failures.push({
    category: 'toc-navigation-data',
    count: navigationAudit.mismatches.length,
    sample: navigationAudit.mismatches.slice(0, 20),
  });

const attachmentRouteAudit = {
  expectedItems: tocLeaves.reduce(
    (sum, entry) =>
      sum + (entry.leaf.attachments ?? []).filter((attachment) => attachment.path).length,
    0,
  ),
  renderedItems: 0,
  pages: 0,
  routeChecks: 0,
  routeFailures: [],
  fileOpenings: [],
  screenshotPages: 0,
};

const localFileRoutes = new Map();
for (const { leaf } of tocLeaves) {
  for (const attachment of leaf.attachments ?? []) {
    if (attachment.type !== 'fileAttachment' || !attachment.path || !attachment.sha256) continue;
    const url = new URL(attachment.path, new URL(`/${leaf.path}`, baseUrl));
    if (url.pathname.startsWith('/content/'))
      url.pathname = `/files/${url.pathname.slice('/content/'.length)}`;
    const route = url.href;
    const existing = localFileRoutes.get(route);
    if (existing && (existing.sha256 !== attachment.sha256 || existing.size !== attachment.size)) {
      attachmentRouteAudit.routeFailures.push({
        id: leaf.id,
        name: attachment.name,
        issue: 'conflicting-checksums-for-route',
        url: route,
      });
    } else {
      localFileRoutes.set(route, {
        id: leaf.id,
        name: attachment.name,
        url: route,
        sha256: attachment.sha256,
        size: attachment.size,
      });
    }
  }
}
const fileRouteEntries = [...localFileRoutes.values()];
for (let start = 0; start < fileRouteEntries.length; start += 4) {
  const batch = fileRouteEntries.slice(start, start + 4);
  await Promise.all(
    batch.map(async (attachment) => {
      attachmentRouteAudit.routeChecks++;
      try {
        const response = await page.request.get(attachment.url, { timeout: 30000 });
        const bytes = await response.body();
        const actualSha256 = createHash('sha256').update(bytes).digest('hex');
        if (
          !response.ok() ||
          (attachment.size !== undefined && bytes.length !== attachment.size) ||
          actualSha256 !== attachment.sha256
        ) {
          attachmentRouteAudit.routeFailures.push({
            id: attachment.id,
            name: attachment.name,
            url: attachment.url,
            status: response.status(),
            expectedSize: attachment.size,
            actualSize: bytes.length,
            expectedSha256: attachment.sha256,
            actualSha256,
          });
        }
      } catch (error) {
        attachmentRouteAudit.routeFailures.push({
          id: attachment.id,
          name: attachment.name,
          url: attachment.url,
          error: String(error).slice(0, 180),
        });
      }
    }),
  );
}
if (attachmentRouteAudit.routeFailures.length)
  failures.push({
    category: 'attachment-http-roundtrip',
    count: attachmentRouteAudit.routeFailures.length,
    sample: attachmentRouteAudit.routeFailures.slice(0, 20),
  });

for (let index = 0; index < leaves.length; index++) {
  const leaf = leaves[index];
  const placement = tocById.get(leaf.id);
  if (index % 10 === 0) console.log(`Render audit ${index + 1}/${leaves.length}: ${leaf.title}`);
  if (!placement) {
    failures.push({ page: leaf.id, title: leaf.title, category: 'toc-placement-missing' });
    continue;
  }
  if (placement.leaf.title !== leaf.title || placement.leaf.path !== leaf.path) {
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'toc-manifest-metadata',
      tocTitle: placement.leaf.title,
      tocPath: placement.leaf.path,
      manifestPath: leaf.path,
    });
  }
  const markdown = await readFile(join(uniRoot, leaf.path), 'utf8');
  const parsed = docsPkg.markdownToDocsValue(markdown);
  const expectedSpans = ofType(parsed, 'span');
  const expectedCounts = {};
  walk(parsed, (item) => {
    if (typeof item._type === 'string')
      expectedCounts[item._type] = (expectedCounts[item._type] ?? 0) + 1;
  });
  for (const [type, count] of Object.entries(expectedCounts))
    familyTotals[type] = (familyTotals[type] ?? 0) + count;

  if (!(await openLeaf(leaf, parsed))) continue;
  const headerData = await page.evaluate((id) => {
    const title = document.querySelector('input[placeholder="Page title"]');
    const description = document.querySelector('textarea[placeholder="Add a description..."]');
    const section = document.querySelector('[role="combobox"][aria-label="Section"]');
    const anchors = [...document.querySelectorAll('a[href]')];
    const selected = anchors.find((anchor) => {
      try {
        return (
          decodeURIComponent(
            new URL(anchor.getAttribute('href') ?? '', location.href).hash.slice(1),
          ) === id
        );
      } catch {
        return false;
      }
    });
    return {
      documentTitle: document.title,
      title: title instanceof HTMLInputElement ? title.value : null,
      titleDisabled: title instanceof HTMLInputElement ? title.disabled : null,
      description: description instanceof HTMLTextAreaElement ? description.value : null,
      descriptionDisabled: description instanceof HTMLTextAreaElement ? description.disabled : null,
      section: section?.textContent?.trim() ?? null,
      selectedLeaf: selected?.textContent?.trim() ?? null,
    };
  }, leaf.id);
  if (headerData.title !== leaf.title || !headerData.documentTitle.startsWith(`${leaf.title} |`))
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'active-leaf-title',
      expected: leaf.title,
      actualInput: headerData.title,
      documentTitle: headerData.documentTitle,
    });
  if (headerData.selectedLeaf !== placement.leaf.title)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'active-toc-leaf-title',
      expected: placement.leaf.title,
      actual: headerData.selectedLeaf,
    });
  if (headerData.section !== placement.section.title)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'active-section-select',
      expected: placement.section.title,
      actual: headerData.section,
    });
  if (headerData.titleDisabled !== true || headerData.descriptionDisabled !== true)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'local-header-write-access',
      titleDisabled: headerData.titleDisabled,
      descriptionDisabled: headerData.descriptionDisabled,
    });

  await page.emulateMedia({ colorScheme: 'dark' });
  await capturePageScreenshot(leaf, allPageScreenshotDirs.dark, 'all-pages-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await capturePageScreenshot(leaf, allPageScreenshotDirs.light, 'all-pages-light');
  await page.emulateMedia({ colorScheme: 'dark' });

  const dom = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('[aria-label="Document viewer"]')].filter(
      (element) => !element.parentElement?.closest('[aria-label="Document viewer"]'),
    );
    const root = roots[0];
    if (!root) return { rootCount: roots.length };
    const children = [...root.children];
    const classify = (element) => {
      const kind = element.getAttribute('data-docs-editor-block');
      if (kind === 'DocsTable') return 'table';
      if (kind === 'Diagram') return 'nodes';
      if (kind === 'Raw Markdown') return 'raw';
      if (kind === 'TypeScript docs') return 'tsDocs';
      if (kind === 'math') return 'math';
      if (element.matches('[data-docs-code-block="view"]')) return 'code';
      if (element.matches('[data-pt-block="text"]')) return 'text';
      if (element.matches('aside[data-docs-aside]')) return 'callout';
      if (element.matches('img') || element.querySelector(':scope > img')) return 'docImage';
      if (element.matches('iframe') || element.querySelector(':scope > iframe')) return 'embed';
      if (
        element.matches('.docs-math, .docs-math-wrapper') ||
        element.querySelector(':scope > .docs-math, :scope > .docs-math-wrapper')
      )
        return 'math';
      if (element.querySelector('[role="tablist"][aria-label="Tab options"]')) return 'tabs';
      if (element.querySelector('button[aria-label^="Toggle "]')) return 'accordion';
      return 'unknown';
    };
    const all = (selector) => [...root.querySelectorAll(selector)];
    const lastKey = (path) =>
      [...String(path ?? '').matchAll(/_key=="([^"]+)"/g)].at(-1)?.[1] ?? '';
    const readCode = (block) => {
      const lines = [...block.querySelectorAll('.cm-content .cm-line')];
      if (lines.length) return lines.map((line) => line.textContent ?? '').join('\n');
      const fallback = [
        ...block.querySelectorAll('[data-docs-code-fb] .docs-code-block-fallback-line > span'),
      ];
      return fallback.map((line) => line.textContent ?? '').join('\n');
    };
    const tables = all('section[data-docs-editor-block="DocsTable"]').map((section) => {
      const table = section.querySelector(':scope > table');
      const rows = table ? [...table.rows] : [];
      const cellText = (cell) => {
        const clone = cell.cloneNode(true);
        clone
          .querySelectorAll('.docs-code-block, .docs-math, .docs-math-wrapper, .katex')
          .forEach((node) => node.remove());
        // innerText is empty on a detached clone; compare the actual text nodes.
        return clone.textContent ?? '';
      };
      return {
        heading: section.querySelector(':scope > h3')?.textContent?.trim() ?? '',
        rows: rows.map((row) => [...row.children].map(cellText)),
      };
    });
    const codeBlocks = all('.docs-code-block[data-docs-code-block="view"]')
      .filter((block) => !block.closest('[data-docs-editor-block="Raw Markdown"]'))
      .map((block) => ({
        language: block.querySelector('.docs-code-block-header p')?.textContent?.trim() ?? '',
        code: readCode(block),
      }));
    const rawBlocks = all('[data-docs-editor-block="Raw Markdown"]').map((block) => ({
      code: readCode(block),
      text: block.innerText ?? '',
      divider: Boolean(block.querySelector('hr[data-docs-raw-divider]')),
    }));
    const graphBlocks = all('[data-docs-editor-block="Diagram"]').map((wrapper) => {
      const graph = wrapper.querySelector('[data-docs-editor-block="Nodes"]');
      return {
        path: wrapper.getAttribute('data-pt-path') ?? '',
        nodes: graph
          ? [...graph.querySelectorAll('.react-flow__node')].map((node) => ({
              id: node.getAttribute('data-id') ?? '',
              type:
                [...node.classList]
                  .find((className) => className.startsWith('react-flow__node-'))
                  ?.slice('react-flow__node-'.length) ?? '',
              href: node.querySelector('a[href]')?.getAttribute('href') ?? null,
              text: node.innerText?.trim() ?? '',
              attributes: [...node.querySelectorAll('li')].map((item) => {
                const spans = [...item.children].filter((child) => child.tagName === 'SPAN');
                const value = spans[1];
                const annotation = value?.querySelector('annotation[encoding="application/x-tex"]');
                return {
                  name: spans[0]?.textContent?.trim() ?? '',
                  value: annotation?.textContent?.trim() ?? value?.textContent?.trim() ?? '',
                };
              }),
              math: [...node.querySelectorAll('annotation[encoding="application/x-tex"]')].map(
                (annotation) => annotation.textContent ?? '',
              ),
            }))
          : [],
        edges: graph
          ? [...graph.querySelectorAll('.react-flow__edge')].map((edge) => ({
              id: edge.getAttribute('data-id') ?? '',
              aria: edge.getAttribute('aria-label') ?? '',
              arrowHead: Boolean(edge.querySelector('path')?.getAttribute('marker-end')),
              strokeDasharray:
                edge
                  .querySelector('path.react-flow__edge-path')
                  ?.getAttribute('stroke-dasharray') ??
                edge.querySelector('path.react-flow__edge-path')?.style.strokeDasharray ??
                '',
              path: edge.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '',
            }))
          : [],
        errors: wrapper.querySelectorAll('[role="alert"], [data-docs-error], .error-boundary')
          .length,
        box: graph?.getBoundingClientRect().toJSON() ?? null,
      };
    });
    const textBlocks = all('[data-pt-block="text"][data-pt-path]').map((element) => {
      const path = element.getAttribute('data-pt-path') ?? '';
      const key = lastKey(path);
      const firstContent = element.firstElementChild;
      const listItem = element.querySelector(':scope > ol > li, :scope > ul > li');
      const inline = [...element.querySelectorAll('[data-pt-inline="span"][data-pt-path]')];
      const text = inline
        .map((span) => {
          const value = span.querySelector('[data-pt-text="true"]');
          if (value) return value.textContent ?? '';
          return span.querySelector('[data-pt-line-break="true"]') ? '\n' : '';
        })
        .join('');
      return {
        key,
        path,
        text,
        style: element.getAttribute('data-style') ?? 'normal',
        listItem: listItem?.getAttribute('data-list-item') ?? null,
        level: listItem?.getAttribute('data-level') ?? null,
        tag: firstContent?.tagName?.toLowerCase() ?? '',
      };
    });
    const inlineSpans = all('[data-pt-inline="span"][data-pt-path]').map((element) => {
      const path = element.getAttribute('data-pt-path') ?? '';
      const key = lastKey(path);
      const blockKey = path.match(/_key=="([^"]+)"/)?.[1] ?? '';
      const value = element.querySelector('[data-pt-text="true"]');
      const text =
        value?.textContent ?? (element.querySelector('[data-pt-line-break="true"]') ? '\n' : '');
      const marksRoot = element.querySelector('[data-pt-marks="true"]') ?? element;
      const decorators = [
        ['strong', 'strong'],
        ['em', 'em'],
        ['u', 'underline'],
        ['s', 'strike-through'],
        ['code', 'code'],
      ]
        .filter(([selector]) => marksRoot.querySelector(selector))
        .map(([, decorator]) => decorator);
      const previous = element.previousElementSibling;
      return {
        key,
        blockKey,
        text,
        decorators,
        href: marksRoot.querySelector('a[href]')?.getAttribute('href') ?? null,
        unknownMarks: [],
        canJoinPrevious: previous?.getAttribute('data-pt-inline') === 'span',
      };
    });
    return {
      rootCount: roots.length,
      direct: children.map((element) => ({
        type: classify(element),
        tag: element.tagName,
        path: element.getAttribute('data-pt-path') ?? '',
        text: (element.innerText ?? '').replace(/\s+/g, ' ').slice(0, 90),
      })),
      textBlocks,
      tables,
      codeBlocks,
      rawBlocks,
      graphBlocks,
      callouts: all('aside[data-docs-aside]').map((aside) => ({
        kind: aside.getAttribute('data-docs-aside') ?? '',
        title: aside.querySelector('.title')?.textContent?.trim() ?? '',
      })),
      accordionTriggers: all('button[aria-label^="Toggle "]').map((trigger) => {
        const triggerId = trigger.id;
        const region = all('[role="region"]').find((element) =>
          (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).includes(triggerId),
        );
        return {
          label: trigger.getAttribute('aria-label')?.replace(/^Toggle\s*/, '') ?? '',
          id: triggerId,
          controls: trigger.getAttribute('aria-controls'),
          regionId: region?.id ?? '',
          expanded: trigger.getAttribute('aria-expanded'),
        };
      }),
      tabs: all('[role="tablist"][aria-label="Tab options"]').map((list) => ({
        labels: [...list.querySelectorAll('[role="tab"]')].map(
          (tab) => tab.textContent?.trim() ?? '',
        ),
      })),
      embeds: all('iframe').map((frame) => ({
        src: frame.getAttribute('src') ?? '',
        title: frame.getAttribute('title') ?? '',
        height: frame.getAttribute('height') ?? '',
        renderedHeight: frame.getBoundingClientRect().height,
      })),
      images: all('img').map((img) => ({
        src: img.getAttribute('src') ?? '',
        alt: img.getAttribute('alt') ?? '',
        title: img.getAttribute('title'),
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      })),
      math: all('.docs-math annotation[encoding="application/x-tex"]').map(
        (annotation) => annotation.textContent ?? '',
      ),
      inlineSpans,
      inlineSpanCount: inlineSpans.length,
      tsDocs: all('[data-docs-editor-block="TypeScript docs"]').length,
      katexErrors: all('.katex-error').map((element) => element.textContent ?? ''),
      errors: all('[role="alert"], [data-docs-error], .error-boundary')
        .map((element) => (element.innerText ?? '').trim().slice(0, 220))
        .filter(Boolean),
    };
  });

  const sourceTextBlocks = [];
  walk(parsed, (item) => {
    if (item._type === 'terraBlock' || item._type === 'block') sourceTextBlocks.push(item);
  });
  const sourceContentTextBlocks = sourceTextBlocks.filter((block) =>
    normalizeText((block.children ?? []).map(plainText).join('')),
  );
  const renderedContentTextBlocks = (dom.textBlocks ?? []).filter((block) =>
    normalizeText(normalizePageAssetUrls(block.text, leaf.path)),
  );
  const record = {
    id: leaf.id,
    title: leaf.title,
    path: leaf.path,
    parsedBlocks: parsed.length,
    renderedBlocks: dom.direct?.length ?? 0,
    topLevelMismatches: [],
    textBlocks: {
      source: sourceTextBlocks.length,
      rendered: dom.textBlocks?.length ?? 0,
      sourceContent: sourceContentTextBlocks.length,
      renderedContent: renderedContentTextBlocks.length,
      sourceEmpty: sourceTextBlocks.length - sourceContentTextBlocks.length,
      renderedEmpty: (dom.textBlocks?.length ?? 0) - renderedContentTextBlocks.length,
      missing: [],
      unexpected: [],
      textMismatch: [],
      styleMismatch: [],
      listMismatch: [],
    },
    inlineSpanCount: { source: expectedSpans.length, rendered: dom.inlineSpanCount ?? 0 },
    inlineSpans: {
      emptySource: expectedSpans.filter((span) => !String(span.text ?? '')).length,
      sourceRuns: 0,
      renderedRuns: 0,
      runMismatch: [],
    },
    customBlocks: {},
  };
  pages.push(record);
  if (dom.rootCount !== 1)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'viewer-root-count',
      actual: dom.rootCount,
    });
  if (dom.direct?.length !== parsed.length)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'top-level-count',
      expected: parsed.length,
      actual: dom.direct?.length ?? 0,
    });
  for (let blockIndex = 0; blockIndex < parsed.length; blockIndex++) {
    const expected = expectedTopType(parsed[blockIndex]._type);
    const actual = dom.direct?.[blockIndex]?.type ?? 'missing';
    if (expected !== actual) {
      const mismatch = {
        index: blockIndex,
        expected,
        actual,
        snippet: dom.direct?.[blockIndex]?.text ?? '',
      };
      record.topLevelMismatches.push(mismatch);
      failures.push({ page: leaf.id, title: leaf.title, category: 'top-level-type', ...mismatch });
    }
  }

  if (record.textBlocks.sourceContent !== record.textBlocks.renderedContent) {
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'text-block-content-count',
      expected: record.textBlocks.sourceContent,
      actual: record.textBlocks.renderedContent,
      sourceEmpty: record.textBlocks.sourceEmpty,
      renderedEmpty: record.textBlocks.renderedEmpty,
    });
  }
  const renderedTextBlockForSource = [];
  for (let blockIndex = 0; blockIndex < sourceContentTextBlocks.length; blockIndex++) {
    const block = sourceContentTextBlocks[blockIndex];
    const sourceIndex = sourceTextBlocks.indexOf(block);
    const actual = renderedContentTextBlocks[blockIndex];
    const expectedText = (block.children ?? []).map(plainText).join('');
    if (!actual) record.textBlocks.missing.push(block._key ?? `index:${sourceIndex}`);
    else renderedTextBlockForSource[sourceIndex] = actual;
    const actualText = actual ? normalizePageAssetUrls(actual.text, leaf.path) : '';
    if (actual && normalizeText(actualText) !== normalizeText(expectedText)) {
      record.textBlocks.textMismatch.push({
        key: block._key,
        index: sourceIndex,
        expected: expectedText.slice(0, 180),
        actual: actualText.slice(0, 180),
      });
    }
    if (actual) {
      const expectedStyle = block.style ?? 'normal';
      const expectedTag = block.listItem
        ? block.listItem === 'number'
          ? 'ol'
          : 'ul'
        : expectedStyle === 'blockquote'
          ? 'blockquote'
          : /^h[1-6]$/.test(expectedStyle)
            ? expectedStyle
            : 'p';
      if (actual.style !== expectedStyle || actual.tag !== expectedTag)
        record.textBlocks.styleMismatch.push({
          key: block._key,
          index: sourceIndex,
          expectedStyle,
          actualStyle: actual.style,
          expectedTag,
          actualTag: actual.tag,
        });
      const expectedListItem = block.listItem ?? null;
      const expectedLevel = block.listItem ? String(block.level ?? 1) : null;
      if (
        actual.listItem !== expectedListItem ||
        (expectedLevel !== null && actual.level !== expectedLevel)
      )
        record.textBlocks.listMismatch.push({
          key: block._key,
          index: sourceIndex,
          expectedListItem,
          actualListItem: actual.listItem,
          expectedLevel,
          actualLevel: actual.level,
        });
    }
  }
  if (renderedContentTextBlocks.length > sourceContentTextBlocks.length)
    record.textBlocks.unexpected.push(
      ...renderedContentTextBlocks.slice(sourceContentTextBlocks.length).map((block) => ({
        text: normalizePageAssetUrls(block.text, leaf.path).slice(0, 180),
        style: block.style,
        listItem: block.listItem,
        level: block.level,
      })),
    );
  if (record.textBlocks.missing.length)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'missing-rendered-text-blocks',
      count: record.textBlocks.missing.length,
      sample: record.textBlocks.missing.slice(0, 8),
    });
  if (record.textBlocks.unexpected.length)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'unexpected-rendered-text-blocks',
      count: record.textBlocks.unexpected.length,
      sample: record.textBlocks.unexpected.slice(0, 8),
    });
  if (record.textBlocks.textMismatch.length)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'rendered-text-block-content',
      count: record.textBlocks.textMismatch.length,
      sample: record.textBlocks.textMismatch.slice(0, 8),
    });
  if (record.textBlocks.styleMismatch.length)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'text-block-style',
      count: record.textBlocks.styleMismatch.length,
      sample: record.textBlocks.styleMismatch.slice(0, 8),
    });
  if (record.textBlocks.listMismatch.length)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'text-block-list-semantics',
      count: record.textBlocks.listMismatch.length,
      sample: record.textBlocks.listMismatch.slice(0, 8),
    });

  const renderedSpansByBlock = new Map();
  for (const span of dom.inlineSpans ?? []) {
    if (!span.blockKey) continue;
    const entries = renderedSpansByBlock.get(span.blockKey) ?? [];
    entries.push(span);
    renderedSpansByBlock.set(span.blockKey, entries);
  }
  for (let blockIndex = 0; blockIndex < sourceTextBlocks.length; blockIndex++) {
    const block = sourceTextBlocks[blockIndex];
    if (!normalizeText((block.children ?? []).map(plainText).join(''))) continue;
    const key = String(block._key ?? '');
    const sourceRuns = sourceInlineRuns(block, leaf.path);
    const renderedBlockKey = renderedTextBlockForSource[blockIndex]?.key ?? key;
    let actualRuns = renderedInlineRuns(
      renderedSpansByBlock.get(renderedBlockKey) ?? [],
      leaf.path,
    ).map((run) => ({
      ...run,
      text: normalizePageAssetUrls(run.text, leaf.path),
    }));
    // The Markdown parser generates fresh keys for synthetic group overviews,
    // and renders empty Portable Text paragraphs as a line break. The text
    // blocks are paired in document order above, so use the paired DOM key and
    // treat a lone blank line as the visual representation of an empty block.
    if (sourceRuns.length === 0 && actualRuns.every((run) => normalizeText(run.text) === ''))
      actualRuns = [];
    record.inlineSpans.sourceRuns += sourceRuns.length;
    record.inlineSpans.renderedRuns += actualRuns.length;
    const runCount = Math.max(sourceRuns.length, actualRuns.length);
    for (let runIndex = 0; runIndex < runCount; runIndex++) {
      const expected = sourceRuns[runIndex];
      const actual = actualRuns[runIndex];
      if (
        !expected ||
        !actual ||
        expected.signature !== actual.signature ||
        normalizeText(expected.text) !== normalizeText(actual.text)
      )
        record.inlineSpans.runMismatch.push({
          block: key,
          run: runIndex,
          expected: expected
            ? {
                text: expected.text.slice(0, 160),
                decorators: expected.decorators,
                href: expected.href,
                unknownMarks: expected.unknownMarks,
              }
            : null,
          actual: actual
            ? {
                text: actual.text.slice(0, 160),
                decorators: actual.decorators,
                href: actual.href,
                unknownMarks: actual.unknownMarks,
              }
            : null,
        });
    }
  }
  if (record.inlineSpans.runMismatch.length)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'inline-run-content-or-marks',
      count: record.inlineSpans.runMismatch.length,
      sample: record.inlineSpans.runMismatch.slice(0, 8),
    });

  const checkCount = (type, expected, actual) => {
    record.customBlocks[type] = { expected, rendered: actual };
    if (expected !== actual)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'block-count',
        type,
        expected,
        actual,
      });
  };
  const sourceTables = ofType(parsed, 'table');
  checkCount('table', sourceTables.length, dom.tables?.length ?? 0);
  for (
    let tableIndex = 0;
    tableIndex < Math.min(sourceTables.length, dom.tables?.length ?? 0);
    tableIndex++
  ) {
    const expectedHeading =
      sourceTables[tableIndex].header && sourceTables[tableIndex].header !== 'Table'
        ? String(sourceTables[tableIndex].header)
        : '';
    const actualHeading = dom.tables[tableIndex].heading ?? '';
    if (normalizeText(expectedHeading) !== normalizeText(actualHeading))
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'table-accessible-heading',
        table: tableIndex,
        expected: expectedHeading,
        actual: actualHeading,
      });
    const sourceRows = sourceTables[tableIndex].rows ?? [];
    const actualRows = dom.tables[tableIndex].rows ?? [];
    const expectedColumnCount = sourceRows.reduce(
      (count, row) => Math.max(count, row.cells?.length ?? 0),
      0,
    );
    if (sourceRows.length !== actualRows.length)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'table-row-count',
        table: tableIndex,
        expected: sourceRows.length,
        actual: actualRows.length,
      });
    for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex++) {
      const sourceCells = sourceRows[rowIndex]?.cells ?? [];
      const actualCells = actualRows[rowIndex] ?? [];
      if (expectedColumnCount !== actualCells.length)
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'table-cell-count',
          table: tableIndex,
          row: rowIndex,
          expected: expectedColumnCount,
          actual: actualCells.length,
        });
      for (let cellIndex = 0; cellIndex < expectedColumnCount; cellIndex++) {
        const expected = normalizeText(tableCellPlainText(sourceCells[cellIndex]?.content));
        const actual = normalizeText(normalizePageAssetUrls(actualCells[cellIndex], leaf.path));
        if (expected !== actual)
          failures.push({
            page: leaf.id,
            title: leaf.title,
            category: 'table-cell-text',
            table: tableIndex,
            row: rowIndex,
            cell: cellIndex,
            expected: expected.slice(0, 120),
            actual: actual.slice(0, 120),
          });
      }
    }
  }
  const sourceCode = ofType(parsed, 'code');
  checkCount('code', sourceCode.length, dom.codeBlocks?.length ?? 0);
  for (
    let codeIndex = 0;
    codeIndex < Math.min(sourceCode.length, dom.codeBlocks?.length ?? 0);
    codeIndex++
  ) {
    const expected = normalizeCode(sourceCode[codeIndex].value);
    const actual = normalizeCode(dom.codeBlocks[codeIndex].code);
    if (expected !== actual)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'code-payload',
        block: codeIndex,
        expected: expected.slice(0, 180),
        actual: actual.slice(0, 180),
      });
    const language = String(sourceCode[codeIndex].language ?? 'text').toLowerCase();
    const renderedLanguage = String(dom.codeBlocks[codeIndex].language ?? '').toLowerCase();
    if (renderedLanguage && language !== renderedLanguage)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'code-language',
        block: codeIndex,
        expected: language,
        actual: renderedLanguage,
      });
  }
  const sourceRaw = ofType(parsed, 'raw');
  checkCount('raw', sourceRaw.length, dom.rawBlocks?.length ?? 0);
  for (
    let rawIndex = 0;
    rawIndex < Math.min(sourceRaw.length, dom.rawBlocks?.length ?? 0);
    rawIndex++
  ) {
    const expected = normalizeCode(sourceRaw[rawIndex].markdown);
    if (isMarkdownThematicBreak(expected)) {
      if (!dom.rawBlocks[rawIndex].divider)
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'raw-thematic-break-render',
          block: rawIndex,
          expected,
          actual: dom.rawBlocks[rawIndex].text,
        });
      continue;
    }
    const actual = normalizeCode(normalizePageAssetUrls(dom.rawBlocks[rawIndex].code, leaf.path));
    if (expected.trim() !== actual.trim()) {
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'raw-payload',
        block: rawIndex,
        expected: expected.slice(0, 180),
        actual: actual.slice(0, 180),
      });
    } else if (expected !== actual) {
      record.customBlocks.rawBoundaryWhitespace =
        (record.customBlocks.rawBoundaryWhitespace ?? 0) + 1;
    }
  }

  const sourceGraphs = ofType(parsed, 'nodes');
  checkCount('nodes', sourceGraphs.length, dom.graphBlocks?.length ?? 0);
  for (
    let graphIndex = 0;
    graphIndex < Math.min(sourceGraphs.length, dom.graphBlocks?.length ?? 0);
    graphIndex++
  ) {
    const sourceGraph = sourceGraphs[graphIndex];
    const rendered = dom.graphBlocks[graphIndex];
    const sourceNodeIds = (sourceGraph.nodes ?? []).map((node) => String(node.id ?? '')).sort();
    const renderedNodeIds = (rendered.nodes ?? []).map((node) => node.id).sort();
    const sourceNodeIdSet = new Set(sourceNodeIds);
    const invalidEdges = (sourceGraph.edges ?? []).filter(
      (edge) =>
        !sourceNodeIdSet.has(String(edge.source ?? '')) ||
        !sourceNodeIdSet.has(String(edge.target ?? '')),
    );
    if (invalidEdges.length) {
      sourceAnomalies.push({
        page: leaf.id,
        title: leaf.title,
        block: sourceGraph._key ?? `graph:${graphIndex}`,
        category: 'diagram-edge-with-missing-endpoint',
        edges: invalidEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          missingEndpoints: [edge.source, edge.target].filter(
            (endpoint) => !sourceNodeIdSet.has(String(endpoint)),
          ),
        })),
      });
    }
    const sourceEdgeIds = (sourceGraph.edges ?? [])
      .filter(
        (edge) =>
          sourceNodeIdSet.has(String(edge.source ?? '')) &&
          sourceNodeIdSet.has(String(edge.target ?? '')),
      )
      .map((edge) => String(edge.id ?? ''))
      .sort();
    const renderedEdgeIds = (rendered.edges ?? []).map((edge) => edge.id).sort();
    if (JSON.stringify(sourceNodeIds) !== JSON.stringify(renderedNodeIds))
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'diagram-nodes',
        graph: graphIndex,
        expected: sourceNodeIds,
        actual: renderedNodeIds,
        errorBoundaryCount: rendered.errors,
      });
    const renderedGraphHeight = Number(rendered.box?.height ?? 0);
    const expectedGraphHeight = Number.isFinite(Number(sourceGraph.height))
      ? Number(sourceGraph.height)
      : 384;
    if (Math.abs(renderedGraphHeight - expectedGraphHeight) > 1)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'diagram-height',
        graph: graphIndex,
        expected: expectedGraphHeight,
        actual: renderedGraphHeight,
      });
    for (const node of sourceGraph.nodes ?? []) {
      const actual = rendered.nodes?.find((candidate) => candidate.id === String(node.id ?? ''));
      if (!actual) continue;
      if (String(node.type ?? '') !== actual.type)
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'diagram-node-type',
          graph: graphIndex,
          node: node.id,
          expected: node.type ?? '',
          actual: actual.type,
        });
      const expectedHref = canonicalHref(node.data?.href, leaf.path);
      const actualHref = canonicalHref(actual.href, leaf.path);
      if (expectedHref !== actualHref)
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'diagram-node-link',
          graph: graphIndex,
          node: node.id,
          expected: expectedHref,
          actual: actualHref,
        });
      const expectedAttributes = (node.data?.attributes ?? []).map((attribute) => {
        const rawValue = String(attribute.type ?? '').trim();
        const math = rawValue.match(/^\$\$([\s\S]*)\$\$$/) ?? rawValue.match(/^\$([\s\S]*)\$$/);
        return {
          name: normalizeText(attribute.name),
          value: normalizeText(math?.[1] ?? rawValue),
        };
      });
      const actualAttributes = (actual.attributes ?? []).map((attribute) => ({
        name: normalizeText(attribute.name),
        value: normalizeText(attribute.value),
      }));
      if (JSON.stringify(expectedAttributes) !== JSON.stringify(actualAttributes))
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'diagram-node-attributes',
          graph: graphIndex,
          node: node.id,
          expected: expectedAttributes,
          actual: actualAttributes,
        });
    }
    if (JSON.stringify(sourceEdgeIds) !== JSON.stringify(renderedEdgeIds))
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'diagram-edges',
        graph: graphIndex,
        expected: sourceEdgeIds,
        actual: renderedEdgeIds,
        errorBoundaryCount: rendered.errors,
      });
    for (const sourceEdge of sourceGraph.edges ?? []) {
      if (
        !sourceNodeIdSet.has(String(sourceEdge.source ?? '')) ||
        !sourceNodeIdSet.has(String(sourceEdge.target ?? ''))
      )
        continue;
      const actual = rendered.edges?.find(
        (candidate) => candidate.id === String(sourceEdge.id ?? ''),
      );
      if (!actual) continue;
      const expectedAria = `Edge from ${sourceEdge.source} to ${sourceEdge.target}`;
      if (actual.aria !== expectedAria)
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'diagram-edge-endpoints',
          graph: graphIndex,
          edge: sourceEdge.id,
          expected: expectedAria,
          actual: actual.aria,
        });
      const expectedArrowHead = Boolean(
        sourceEdge.data?.arrowHead ?? sourceEdge.arrowHead ?? false,
      );
      if (actual.arrowHead !== expectedArrowHead)
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'diagram-edge-arrowhead',
          graph: graphIndex,
          edge: sourceEdge.id,
          expected: expectedArrowHead,
          actual: actual.arrowHead,
        });
      const strokeStyle = sourceEdge.data?.strokeStyle ?? 'solid';
      const expectedDasharray =
        strokeStyle === 'dashed' ? '5 5' : strokeStyle === 'dotted' ? '2 2' : '';
      if (actual.strokeDasharray.replace(/\s+/g, ' ').trim() !== expectedDasharray)
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'diagram-edge-style',
          graph: graphIndex,
          edge: sourceEdge.id,
          expected: expectedDasharray,
          actual: actual.strokeDasharray,
        });
    }
    for (const node of sourceGraph.nodes ?? []) {
      const actual = rendered.nodes?.find((candidate) => candidate.id === String(node.id ?? ''));
      const expectedLabel = String(node.data?.title ?? node.id ?? '');
      if (actual && !normalizeText(actual.text).includes(normalizeText(expectedLabel)))
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'diagram-label',
          graph: graphIndex,
          node: node.id,
          expected: expectedLabel,
          actual: actual.text,
        });
    }
    const sourceGraphMath = (sourceGraph.nodes ?? [])
      .flatMap((node) =>
        (node.data?.attributes ?? [])
          .map((attribute) => String(attribute.type ?? '').trim())
          .filter((value) => /^\$[\s\S]*\$$/.test(value))
          .map((value) => ({ node: String(node.id ?? ''), formula: value.slice(1, -1) })),
      )
      .sort((left, right) =>
        `${left.node}:${left.formula}`.localeCompare(`${right.node}:${right.formula}`),
      );
    const renderedGraphMath = (rendered.nodes ?? [])
      .flatMap((node) =>
        (node.math ?? []).map((formula) => ({ node: node.id, formula: String(formula).trim() })),
      )
      .sort((left, right) =>
        `${left.node}:${left.formula}`.localeCompare(`${right.node}:${right.formula}`),
      );
    if (JSON.stringify(sourceGraphMath) !== JSON.stringify(renderedGraphMath)) {
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'diagram-math',
        graph: graphIndex,
        expected: sourceGraphMath,
        actual: renderedGraphMath,
      });
    }
    if (rendered.errors)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'diagram-error-boundary',
        graph: graphIndex,
        count: rendered.errors,
      });
  }

  const sourceCallouts = ofType(parsed, 'callout');
  checkCount('callout', sourceCallouts.length, dom.callouts?.length ?? 0);
  for (
    let calloutIndex = 0;
    calloutIndex < Math.min(sourceCallouts.length, dom.callouts?.length ?? 0);
    calloutIndex++
  ) {
    const source = sourceCallouts[calloutIndex];
    const actual = dom.callouts[calloutIndex];
    if (String(source.kind ?? 'note') !== actual.kind)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'callout-kind',
        block: calloutIndex,
        expected: source.kind ?? 'note',
        actual: actual.kind,
      });
    if (normalizeText(source.title) !== normalizeText(actual.title))
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'callout-title',
        block: calloutIndex,
        expected: source.title,
        actual: actual.title,
      });
  }

  const sourceAccordions = ofType(parsed, 'accordion');
  const accordionLabels = sourceAccordions.flatMap((group) =>
    (group.items ?? []).map((item) => String(item.title ?? '')),
  );
  checkCount('accordion-items', accordionLabels.length, dom.accordionTriggers?.length ?? 0);
  if (
    JSON.stringify(accordionLabels) !==
    JSON.stringify((dom.accordionTriggers ?? []).map((item) => item.label))
  ) {
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'accordion-labels',
      expected: accordionLabels,
      actual: (dom.accordionTriggers ?? []).map((item) => item.label),
    });
  }
  const sourceTabs = ofType(parsed, 'tabs').map((group) =>
    (group.items ?? []).map((item) => String(item.title ?? '')),
  );
  const actualTabs = (dom.tabs ?? []).map((group) => group.labels);
  checkCount('tabs', sourceTabs.length, actualTabs.length);
  if (JSON.stringify(sourceTabs) !== JSON.stringify(actualTabs))
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'tab-labels',
      expected: sourceTabs,
      actual: actualTabs,
    });

  const sourceEmbeds = ofType(parsed, 'embed');
  checkCount('embed', sourceEmbeds.length, dom.embeds?.length ?? 0);
  for (
    let embedIndex = 0;
    embedIndex < Math.min(sourceEmbeds.length, dom.embeds?.length ?? 0);
    embedIndex++
  ) {
    const source = sourceEmbeds[embedIndex];
    const actual = dom.embeds[embedIndex];
    if (expectedEmbedUrl(source.src) !== actual.src)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'embed-src',
        expected: expectedEmbedUrl(source.src),
        actual: actual.src,
      });
    if (String(source.title ?? source.src) !== actual.title)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'embed-title',
        expected: source.title ?? source.src,
        actual: actual.title,
      });
    const expectedHeight = Number.parseFloat(String(source.height ?? '500px'));
    if (Number.isFinite(expectedHeight) && Math.abs(actual.renderedHeight - expectedHeight) > 1)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'embed-height',
        expected: expectedHeight,
        actual: actual.renderedHeight,
      });
  }

  const sourceImages = ofType(parsed, 'docImage');
  checkCount('docImage', sourceImages.length, dom.images?.length ?? 0);
  for (
    let imageIndex = 0;
    imageIndex < Math.min(sourceImages.length, dom.images?.length ?? 0);
    imageIndex++
  ) {
    const source = sourceImages[imageIndex];
    const actual = dom.images[imageIndex];
    const expectedUrl = new URL(source.url, new URL(`/${leaf.path}`, baseUrl));
    const expectedPath = expectedUrl.pathname.startsWith('/content/')
      ? `/files/${expectedUrl.pathname.slice('/content/'.length)}`
      : expectedUrl.pathname;
    const actualPath = new URL(actual.src, baseUrl).pathname;
    if (expectedPath !== actualPath)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'image-src',
        expected: expectedPath,
        actual: actualPath,
      });
    if ((source.alt ?? '') !== actual.alt)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'image-alt',
        expected: source.alt ?? '',
        actual: actual.alt,
      });
    if ((source.title ?? null) !== actual.title)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'image-title',
        expected: source.title ?? null,
        actual: actual.title,
      });
    if (!actual.complete || actual.naturalWidth < 1)
      failures.push({
        page: leaf.id,
        title: leaf.title,
        category: 'image-load',
        src: actual.src,
        complete: actual.complete,
        width: actual.naturalWidth,
      });
  }

  const sourceMath = ofType(parsed, 'math').map((item) => String(item.code ?? '').trim());
  const renderedMath = (dom.math ?? []).map((code) => code.trim());
  checkCount('math', sourceMath.length, renderedMath.length);
  if (JSON.stringify(sourceMath) !== JSON.stringify(renderedMath))
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'math-payload',
      expected: sourceMath,
      actual: renderedMath,
    });
  if (dom.katexErrors?.length)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'math-render-error',
      errors: dom.katexErrors,
    });

  const sourceTsDocs = ofType(parsed, 'tsDocs');
  checkCount('tsDocs', sourceTsDocs.length, dom.tsDocs ?? 0);
  if (dom.errors?.length)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'render-error-boundary',
      errors: dom.errors,
    });
}

const attachmentModeAudit = {
  expectedPages: tocLeaves.length,
  renderedPages: 0,
  expectedItems: 0,
  renderedItems: 0,
  pagesWithAttachments: 0,
  screenshotPages: 0,
  itemMismatches: [],
  fileOpenings: [],
  references: { localDocumentRefs: 0, externalDocumentRefs: 0, externalLinks: 0, failures: [] },
};
const activeTocIds = new Set(tocLeaves.map(({ leaf }) => leaf.id));
for (const { leaf } of tocLeaves) {
  const expectedAttachments = (leaf.attachments ?? []).filter((attachment) => attachment.path);
  attachmentModeAudit.expectedItems += expectedAttachments.length;
  for (const attachment of leaf.attachments ?? []) {
    if (attachment.type === 'documentRef') {
      const refId = String(attachment.documentRef ?? '');
      const local = activeTocIds.has(refId);
      if (local) attachmentModeAudit.references.localDocumentRefs++;
      else attachmentModeAudit.references.externalDocumentRefs++;
      if (local && !String(attachment.path ?? '').includes(`#${refId}`))
        attachmentModeAudit.references.failures.push({
          leafId: leaf.id,
          attachment: attachment.name,
          issue: 'active-document-reference-not-local',
          expectedId: refId,
          path: attachment.path,
        });
      if (!local && !/^https?:\/\//i.test(String(attachment.path ?? '')))
        attachmentModeAudit.references.failures.push({
          leafId: leaf.id,
          attachment: attachment.name,
          issue: 'unavailable-document-reference-not-external',
          expectedId: refId,
          path: attachment.path,
        });
    } else if (attachment.type === 'externalLink') {
      attachmentModeAudit.references.externalLinks++;
      if (!/^https?:\/\//i.test(String(attachment.path ?? '')))
        attachmentModeAudit.references.failures.push({
          leafId: leaf.id,
          attachment: attachment.name,
          issue: 'external-link-url-missing',
          path: attachment.path,
        });
    }
  }

  const url = `${baseUrl}/?mode=attachments#${encodeURIComponent(leaf.id)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForFunction(
      ({ id, title }) => {
        const mode = document.querySelector('[role="combobox"][aria-label="Mode"]');
        const pageTitle = document.querySelector('input[placeholder="Page title"]');
        return (
          location.hash === `#${encodeURIComponent(id)}` &&
          mode?.textContent?.trim() === 'Attachments' &&
          pageTitle instanceof HTMLInputElement &&
          pageTitle.value === title
        );
      },
      { id: leaf.id, title: leaf.title },
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () =>
        document.querySelector('[data-docs-attachments]')?.getAttribute('data-loading') === 'false',
      undefined,
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () => {
        const shell = [...document.querySelectorAll('[data-docs-shell]')].find(
          (element) => element.getAttribute('data-docs-mode') === 'attachments',
        );
        const loadFailure = [...document.querySelectorAll('[data-sonner-toast]')].some((toast) =>
          toast.textContent?.includes('Document blocks did not finish loading'),
        );
        return (
          shell?.getAttribute('data-loading') === 'false' &&
          !document.querySelector('[data-docs-loading-overlay]') &&
          !loadFailure
        );
      },
      undefined,
      { timeout: 20000 },
    );
  } catch (error) {
    const mismatch = {
      leafId: leaf.id,
      title: leaf.title,
      issue: 'attachments-mode-not-ready',
      error: String(error).slice(0, 200),
    };
    attachmentModeAudit.itemMismatches.push(mismatch);
    failures.push({ category: 'attachments-mode-ready', ...mismatch });
    continue;
  }

  attachmentModeAudit.renderedPages++;
  if (expectedAttachments.length) attachmentModeAudit.pagesWithAttachments++;
  const actualLabels = await page
    .locator('[role="button"][aria-label^="Attachment "]')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''));
  attachmentModeAudit.renderedItems += actualLabels.length;
  const expectedLabels = expectedAttachments.map((attachment) => `Attachment ${attachment.name}`);
  const counts = (items) => {
    const values = new Map();
    for (const item of items) values.set(item, (values.get(item) ?? 0) + 1);
    return values;
  };
  const expectedCounts = counts(expectedLabels);
  const actualCounts = counts(actualLabels);
  const differences = [...new Set([...expectedCounts.keys(), ...actualCounts.keys()])]
    .map((label) => ({
      label,
      expected: expectedCounts.get(label) ?? 0,
      actual: actualCounts.get(label) ?? 0,
    }))
    .filter((item) => item.expected !== item.actual);
  if (differences.length) {
    const mismatch = {
      leafId: leaf.id,
      title: leaf.title,
      issue: 'attachment-list-mismatch',
      differences,
    };
    attachmentModeAudit.itemMismatches.push(mismatch);
    failures.push({ category: 'attachment-mode-ownership', ...mismatch });
  }

  if (expectedAttachments.length) {
    await page.emulateMedia({ colorScheme: 'dark' });
    if (await capturePageScreenshot(leaf, allPageScreenshotDirs.attachments, 'attachments-dark'))
      attachmentModeAudit.screenshotPages++;
  }
}
if (attachmentModeAudit.references.failures.length)
  failures.push({
    category: 'attachment-reference-routing',
    count: attachmentModeAudit.references.failures.length,
    sample: attachmentModeAudit.references.failures.slice(0, 20),
  });

const textAttachmentEntry = tocLeaves
  .map(({ leaf }) => ({
    leaf,
    attachment: (leaf.attachments ?? []).find(
      (item) =>
        item.type === 'fileAttachment' &&
        /\.(?:csv|json|log|md|mdx|text|txt|xml|ya?ml)$/i.test(item.name),
    ),
  }))
  .find((entry) => entry.attachment);
if (textAttachmentEntry?.attachment) {
  const { leaf, attachment } = textAttachmentEntry;
  const localPath = resolve(dirname(join(uniRoot, leaf.path)), attachment.path ?? attachment.name);
  const expectedText = await readFile(localPath, 'utf8');
  await page.goto(`${baseUrl}/?mode=attachments#${encodeURIComponent(leaf.id)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  const card = page.getByRole('button', { name: `Attachment ${attachment.name}`, exact: true });
  try {
    await card.waitFor({ state: 'visible', timeout: 20000 });
    await card.click();
    const dialog = page.getByRole('dialog').last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    const preview = dialog.locator('.docs-code-block').first();
    await preview.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(
      ({ selector, expected }) => {
        const element = document.querySelector(selector);
        const normalize = (value) =>
          String(value ?? '')
            .replace(/\s+/g, ' ')
            .trim();
        return normalize(element?.textContent).includes(normalize(expected).slice(0, 120));
      },
      { selector: '[role="dialog"] .docs-code-block', expected: expectedText },
      { timeout: 10000 },
    );
    const renderedText = await preview.innerText();
    const opening = {
      leafId: leaf.id,
      title: leaf.title,
      attachment: attachment.name,
      sourceChars: expectedText.length,
      renderedChars: renderedText.length,
      matchesSource: normalizeText(renderedText).includes(
        normalizeText(expectedText).slice(0, 120),
      ),
    };
    attachmentModeAudit.fileOpenings.push(opening);
    if (!opening.matchesSource) failures.push({ category: 'attachment-text-preview', ...opening });
  } catch (error) {
    const opening = {
      leafId: leaf.id,
      title: leaf.title,
      attachment: attachment.name,
      sourceChars: expectedText.length,
      issue: 'text-attachment-preview-failed',
      error: String(error).slice(0, 200),
    };
    attachmentModeAudit.fileOpenings.push(opening);
    failures.push({ category: 'attachment-text-preview', ...opening });
  }
} else {
  failures.push({ category: 'attachment-text-preview', issue: 'no-text-attachment-fixture-found' });
}

// Traverse every tab panel and accordion panel recursively so nested controls in inactive panels are tested too.
const controlsByPage = [];
for (const leaf of leaves) {
  const markdown = await readFile(join(uniRoot, leaf.path), 'utf8');
  const parsed = docsPkg.markdownToDocsValue(markdown);
  if (!ofType(parsed, 'accordion').length && !ofType(parsed, 'tabs').length) continue;
  if (!(await openLeaf(leaf, parsed))) continue;
  const root = page.locator('[aria-label="Document viewer"]').first();
  await root.waitFor({ timeout: 15000 });
  const visitedTabs = new Set();
  const visitedAccordions = new Set();
  let interactions = 0;
  const panelLocator = (id) =>
    page.locator(`[id="${id.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`);
  const exercisePanel = async (container) => {
    const lists = container.locator('[role="tablist"][aria-label="Tab options"]');
    for (let listIndex = 0; listIndex < (await lists.count()); listIndex++) {
      const list = lists.nth(listIndex);
      if (!(await list.isVisible())) continue;
      const tabs = list.locator('[role="tab"]');
      const labels = await tabs.allTextContents();
      for (let tabIndex = 0; tabIndex < labels.length; tabIndex++) {
        const tab = tabs.nth(tabIndex);
        if (!(await tab.isVisible())) continue;
        const panelId = await tab.getAttribute('aria-controls');
        const identity = await tab.evaluate(
          (element) =>
            element.id ||
            `${element.closest('[data-pt-path]')?.getAttribute('data-pt-path') ?? ''}:${element.textContent ?? ''}`,
        );
        if (visitedTabs.has(identity)) continue;
        visitedTabs.add(identity);
        interactions++;
        const label = labels[tabIndex].trim();
        if (!panelId)
          failures.push({
            page: leaf.id,
            title: leaf.title,
            category: 'tab-panel-association',
            label,
            tabId: identity,
          });
        await tab.click({ timeout: 5000 });
        if ((await tab.getAttribute('aria-selected')) !== 'true')
          failures.push({ page: leaf.id, title: leaf.title, category: 'tab-interaction', label });
        if (panelId) {
          const panel = panelLocator(panelId);
          if (!(await panel.isVisible()))
            failures.push({
              page: leaf.id,
              title: leaf.title,
              category: 'tab-panel-visibility',
              label,
              panelId,
            });
          else await exercisePanel(panel);
        }
      }
    }

    const triggers = container.locator('button[aria-label^="Toggle "]');
    for (let triggerIndex = 0; triggerIndex < (await triggers.count()); triggerIndex++) {
      const trigger = triggers.nth(triggerIndex);
      if (!(await trigger.isVisible())) continue;
      const label = (await trigger.getAttribute('aria-label')) ?? '';
      const association = await trigger.evaluate((element) => {
        const targetId = element.getAttribute('aria-controls');
        const triggerId = element.id;
        const labelledRegion = [
          ...document.querySelectorAll('[role="region"][aria-labelledby]'),
        ].find((region) =>
          (region.getAttribute('aria-labelledby') ?? '').split(/\s+/).includes(triggerId),
        );
        return { targetId: targetId || labelledRegion?.id || '', triggerId };
      });
      const panelId = association.targetId;
      const identity = association.triggerId || `${label}:${triggerIndex}`;
      if (visitedAccordions.has(identity)) continue;
      visitedAccordions.add(identity);
      interactions++;
      if (!panelId)
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'accordion-panel-association',
          label,
          triggerId: identity,
        });
      await trigger.click({ timeout: 5000 });
      if ((await trigger.getAttribute('aria-expanded')) !== 'true')
        failures.push({
          page: leaf.id,
          title: leaf.title,
          category: 'accordion-interaction',
          label,
          state: await trigger.getAttribute('aria-expanded'),
        });
      if (panelId) {
        const panel = panelLocator(panelId);
        if (!(await panel.isVisible()))
          failures.push({
            page: leaf.id,
            title: leaf.title,
            category: 'accordion-panel-visibility',
            label,
            panelId,
          });
        else await exercisePanel(panel);
      }
    }
  };
  await exercisePanel(root);
  const expectedTabControls = ofType(parsed, 'tabs').reduce(
    (sum, group) => sum + (group.items?.length ?? 0),
    0,
  );
  const expectedAccordionControls = ofType(parsed, 'accordion').reduce(
    (sum, group) => sum + (group.items?.length ?? 0),
    0,
  );
  controlsByPage.push({
    id: leaf.id,
    title: leaf.title,
    interactions,
    expectedTabControls,
    expectedAccordionControls,
    visitedTabs: visitedTabs.size,
    visitedAccordions: visitedAccordions.size,
  });
  if (visitedTabs.size !== expectedTabControls)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'tabs-not-exercised',
      expected: expectedTabControls,
      actual: visitedTabs.size,
    });
  if (visitedAccordions.size !== expectedAccordionControls)
    failures.push({
      page: leaf.id,
      title: leaf.title,
      category: 'accordions-not-exercised',
      expected: expectedAccordionControls,
      actual: visitedAccordions.size,
    });
}

// Save representative screenshots from the exact consumer artifact after exercising nested content.
const screenshotSamples = [
  {
    family: 'user-page-dark',
    id: 'ns1Jhrj96oySML10X1aEhK',
    selector: '[aria-label="Document viewer"]',
  },
  {
    family: 'compound-diagram',
    id: 'BsQUwF6kisLoqnrcb5Nl74',
    selector: '[aria-label="Document viewer"] [data-docs-editor-block="Diagram"]',
  },
  {
    family: 'table',
    id: 'ns1Jhrj96oySML10X1aEhK',
    selector: '[aria-label="Document viewer"] section[data-docs-editor-block="DocsTable"]',
  },
  {
    family: 'code',
    id: 'BsQUwF6kisLoqnrcb5aHos',
    selector: '[aria-label="Document viewer"] .docs-code-block[data-docs-code-block="view"]',
  },
  {
    family: 'raw',
    id: 'BsQUwF6kisLoqnrcb5aIUF',
    selector: '[aria-label="Document viewer"] [data-docs-editor-block="Raw Markdown"]',
  },
  {
    family: 'callout',
    id: 'ns1Jhrj96oySML10X1aEhK',
    selector: '[aria-label="Document viewer"] aside[data-docs-aside]',
  },
  {
    family: 'tabs',
    id: '2htUysgH83UdOH3tEjVROV',
    selector: '[aria-label="Document viewer"] [role="tablist"][aria-label="Tab options"]',
  },
  {
    family: 'math',
    id: 'uqEPoah3utAOCg4wMblA3a',
    selector: '[aria-label="Document viewer"] .docs-math',
  },
  {
    family: 'embed',
    id: 'CJH9mxysXmvN6d11DKEXiU',
    selector: '[aria-label="Document viewer"] iframe',
  },
  {
    family: 'docImage',
    id: '9AexXGHk6co2Lu8zEXVrKq',
    selector: '[aria-label="Document viewer"] img',
  },
];
for (const sample of screenshotSamples) {
  const leaf = manifestById.get(sample.id);
  if (!leaf) continue;
  const markdown = await readFile(join(uniRoot, leaf.path), 'utf8');
  const parsed = docsPkg.markdownToDocsValue(markdown);
  if (!(await openLeaf(leaf, parsed))) continue;
  const root = page.locator('[aria-label="Document viewer"]').first();
  await root.waitFor({ timeout: 15000 });
  if (sample.family === 'math') {
    const containsMath = (value) => ofType(value, 'math').length > 0;
    for (const group of ofType(parsed, 'accordion')) {
      for (const item of group.items ?? []) {
        if (!containsMath(item.content)) continue;
        const trigger = root.getByRole('button', { name: `Toggle ${item.title}` }).first();
        if (
          (await trigger.count()) &&
          (await trigger.isVisible()) &&
          (await trigger.getAttribute('aria-expanded')) !== 'true'
        )
          await trigger.click();
      }
    }
    for (const group of ofType(parsed, 'tabs')) {
      for (const item of group.items ?? []) {
        if (!containsMath(item.content)) continue;
        const tab = root.getByRole('tab', { name: String(item.title ?? '') }).first();
        if (
          (await tab.count()) &&
          (await tab.isVisible()) &&
          (await tab.getAttribute('aria-selected')) !== 'true'
        )
          await tab.click();
      }
    }
  } else if (sample.family === 'compound-diagram') {
    for (const accordion of ofType(parsed, 'accordion')) {
      for (const item of accordion.items ?? []) {
        if (!ofType(item.content, 'nodes').length) continue;
        const trigger = root.getByRole('button', { name: `Toggle ${item.title}` }).first();
        if (
          (await trigger.count()) &&
          (await trigger.isVisible()) &&
          (await trigger.getAttribute('aria-expanded')) !== 'true'
        )
          await trigger.click();
      }
    }
  }
  const locator = page.locator(sample.selector).first();
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 10000 });
    const file = join(screenshotDir, `${sample.family}.png`);
    if (sample.family === 'user-page-dark' || sample.family === 'compound-diagram') {
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled', timeout: 30000 });
    } else {
      await root.screenshot({ path: file, animations: 'disabled', timeout: 30000 });
    }
    screenshots.push({ family: sample.family, title: leaf.title, path: file });
  } catch (error) {
    failures.push({
      page: sample.id,
      title: leaf.title,
      category: 'screenshot-capture',
      family: sample.family,
      error: String(error).slice(0, 180),
    });
  }
}

const fatalConsoleErrors = consoleErrors.filter((entry) =>
  /127\.0\.0\.1:5175|Cannot set properties|Error hydrating|Failed to fetch dynamically imported|net::ERR_ABORTED 500/i.test(
    entry.message,
  ),
);
const report = {
  generatedAt: new Date().toISOString(),
  app: {
    url: baseUrl,
    packageRoot: pkgRoot,
    packageVersion: JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf8')).version,
    manifestLeaves: leaves.length,
  },
  sourceAudit: {
    sanityLeaves: sourceAudit.sanityLeaves,
    markdownLeaves: sourceAudit.markdownLeaves,
    reconciledSanityLeaves: sourceAudit.reconciledSanityLeaves,
    reconciliation: sourceAudit.reconciliation,
    imageLocalizedLeaves: sourceAudit.imageLocalizedLeaves,
    markdownHashesVerified: sourceAudit.markdownHashesVerified,
    inlineAssets: sourceAudit.inlineAssets,
    differences: sourceAudit.differences,
    markdownHashFailures: sourceAudit.markdownHashFailures,
  },
  navigationAudit,
  attachmentRouteAudit,
  attachmentModeAudit,
  sourceAnomalies,
  sourceAnomalyCount: sourceAnomalies.length,
  renderedAudit: {
    renderedPages: pages.length,
    sourceTextBlockCount: pages.reduce((sum, page) => sum + page.textBlocks.source, 0),
    renderedTextBlockCount: pages.reduce((sum, page) => sum + page.textBlocks.rendered, 0),
    sourceInlineSpanCount: pages.reduce((sum, page) => sum + page.inlineSpanCount.source, 0),
    renderedInlineSpanCount: pages.reduce((sum, page) => sum + page.inlineSpanCount.rendered, 0),
    blockFamilyCounts: familyTotals,
    interactionPages: controlsByPage.length,
    interactionCount: controlsByPage.reduce((sum, item) => sum + item.interactions, 0),
    controlsByPage,
  },
  pageErrors,
  consoleErrors,
  fatalConsoleErrors,
  failures,
  failureCount: failures.length,
  pages,
  screenshots,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
const summary = {
  reportPath,
  app: report.app,
  sourceAudit: report.sourceAudit,
  navigationAudit: report.navigationAudit,
  attachmentRouteAudit: {
    expectedItems: report.attachmentRouteAudit.expectedItems,
    routeChecks: report.attachmentRouteAudit.routeChecks,
    routeFailures: report.attachmentRouteAudit.routeFailures.length,
  },
  attachmentModeAudit: {
    expectedPages: report.attachmentModeAudit.expectedPages,
    renderedPages: report.attachmentModeAudit.renderedPages,
    expectedItems: report.attachmentModeAudit.expectedItems,
    renderedItems: report.attachmentModeAudit.renderedItems,
    pagesWithAttachments: report.attachmentModeAudit.pagesWithAttachments,
    screenshotPages: report.attachmentModeAudit.screenshotPages,
    itemMismatches: report.attachmentModeAudit.itemMismatches.slice(0, 30),
    fileOpenings: report.attachmentModeAudit.fileOpenings,
    references: report.attachmentModeAudit.references,
  },
  renderedAudit: {
    renderedPages: report.renderedAudit.renderedPages,
    sourceTextBlockCount: report.renderedAudit.sourceTextBlockCount,
    renderedTextBlockCount: report.renderedAudit.renderedTextBlockCount,
    sourceInlineSpanCount: report.renderedAudit.sourceInlineSpanCount,
    renderedInlineSpanCount: report.renderedAudit.renderedInlineSpanCount,
    interactionPages: report.renderedAudit.interactionPages,
    interactionCount: controlsByPage.reduce((sum, page) => sum + page.interactions, 0),
    blockFamilyCounts: familyTotals,
  },
  pageErrorCount: pageErrors.length,
  consoleErrorCount: consoleErrors.length,
  fatalConsoleErrors,
  failureCount: failures.length,
  sourceAnomalyCount: sourceAnomalies.length,
  failureCategories: failures.reduce((counts, failure) => {
    counts[failure.category] = (counts[failure.category] ?? 0) + 1;
    return counts;
  }, {}),
  failures: failures.slice(0, 80),
  sourceAnomalies,
  screenshots,
};
console.log(JSON.stringify(summary, null, 2));
if (
  failures.length ||
  sourceAudit.differences.length ||
  sourceAudit.markdownHashFailures.length ||
  sourceAudit.inlineAssets.failures.length ||
  fatalConsoleErrors.length ||
  pageErrors.length
)
  process.exitCode = 1;
