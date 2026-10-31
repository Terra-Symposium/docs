import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'node:test';
import postcss from 'postcss';

const root = fileURLToPath(new URL('../', import.meta.url));

test('the packed Docs stylesheet is a single deterministic Styling and Docs cascade', async () => {
  const style = await readFile(`${root}/lib-dist/style.css`, 'utf8');
  assert.doesNotMatch(style, /@import\s|@tailwind\s|@terra-symposium\/styling\/ui\.css/);
  assert.match(style, /\.flex\s*\{\s*display:\s*flex\s*\}/);
  assert.match(style, /\.md\\:hidden\s*\{\s*display:\s*none\s*\}/);
  assert.match(style, /\.max-w-3xl\s*\{/);
  assert.ok(style.includes('text-3xl'), 'rich text heading variant is present');
  assert.match(style, /\.font-docs\s*\{/);
  assert.match(style, /\.max-w-5xl\s*\{/);

  const hiddenUtility = style.indexOf('.hidden{display:none}');
  const responsiveSidebar = style.indexOf('.md\\:block{display:block}');
  assert.ok(hiddenUtility >= 0, 'base hidden utility is present');
  assert.ok(responsiveSidebar > hiddenUtility, 'responsive sidebar variant follows base utility');
  assert.ok(
    style.includes('@layer utilities'),
    'Styling effect layer is included in the package entrypoint',
  );

  const nestedSelectors = [];
  postcss.parse(style).walkRules((rule) => {
    if (/(^|[^\\])&/.test(rule.selector)) nestedSelectors.push(rule.selector);
  });
  assert.deepEqual(
    nestedSelectors,
    [],
    'Tailwind nesting must be flattened before browser delivery, as it was in the website build',
  );
});

test('math font URLs in the package stylesheet resolve inside its published files', async () => {
  const css = await readFile(`${root}/lib-dist/style.css`, 'utf8');
  assert.match(css, /fonts\/KaTeX_Main-Regular\.woff2/);
  await stat(`${root}/lib-dist/fonts/KaTeX_Main-Regular.woff2`);
});
