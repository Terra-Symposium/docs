import test from 'node:test';
import assert from 'node:assert/strict';
import { DOCS_BLOCK_TYPES, enabledDocsBlocks } from '../lib-dist/components/blocks.js';
import { docsValueToMarkdown, markdownToDocsValue } from '../lib-dist/lib/markdown-model.js';
import { renderMarkdown } from '../lib-dist/lib/markdown.js';

test('all reusable rich blocks are enabled by default and can be opted out individually', () => {
  assert.equal(DOCS_BLOCK_TYPES.length, 11);
  assert.equal(enabledDocsBlocks().length, 11);
  assert.equal(enabledDocsBlocks({ embed: false }).includes('embed'), false);
  assert.equal(enabledDocsBlocks({ code: false }).includes('math'), true);
});

test('Markdown keeps existing accordion syntax and unsupported source across conversion', () => {
  const source =
    '## Heading\n\n=== [Item]\nOriginal **content**\n===\n\n<custom-widget value="1"></custom-widget>\n';
  const result = docsValueToMarkdown(markdownToDocsValue(source));
  assert.match(result, /=== \[Item\]\nOriginal \*\*content\*\*\n===/);
  assert.match(result, /<custom-widget value="1"><\/custom-widget>/);
});

test('structured block containers round-trip without losing source fields', () => {
  for (const type of DOCS_BLOCK_TYPES.filter((item) => item !== 'accordion' && item !== 'tabs')) {
    const block = { _type: type, _key: 'stable', value: 'example', extra: { nested: true } };
    const source = `:::terra-docs ${type}\n${JSON.stringify(block)}\n:::\n`;
    const restored = markdownToDocsValue(source);
    assert.equal(restored.length, 1, type);
    assert.equal(restored[0]._type, type);
    assert.deepEqual(restored[0].extra, block.extra);
    assert.equal(markdownToDocsValue(docsValueToMarkdown(restored))[0].extra.nested, true);
  }
});

test('rich Markdown rendering escapes unsafe content and supports block opt-out', () => {
  const source = ':::terra-docs callout\n{"_type":"callout","title":"Safe","content":"Hello"}\n:::';
  assert.match(renderMarkdown(source), /terra-docs-callout/);
  assert.doesNotMatch(renderMarkdown(source, { callout: false }), /terra-docs-callout/);
  assert.doesNotMatch(
    renderMarkdown(
      ':::terra-docs docImage\n{"_type":"docImage","url":"javascript:alert(1)","alt":"bad"}\n:::',
    ),
    /src="javascript:/,
  );
});

test('inline math survives visual conversion and renders as math', () => {
  const source = 'An equation $x^2 + 1$ in text.\n';
  const value = markdownToDocsValue(source);
  assert.equal(
    value[0].children.some((child) => child._type === 'math'),
    true,
  );
  assert.match(docsValueToMarkdown(value), /\$x\^2 \+ 1\$/);
  assert.match(renderMarkdown(source), /katex/);
  assert.doesNotMatch(renderMarkdown(source, { inlineMath: false }), /katex/);
});

test('Markdown links become visual link annotations and keep their targets', () => {
  const source = 'Read [the guide](/product/purpose/) and **[the map](/product/structure/)**.\n';
  const value = markdownToDocsValue(source);
  assert.equal(value[0].markDefs.length, 2);
  assert.equal(
    value[0].children.some((child) => child.text?.includes('](')),
    false,
  );
  assert.match(docsValueToMarkdown(value), /\[the guide\]\(\/product\/purpose\/\)/);
  assert.match(docsValueToMarkdown(value), /\*\*\[the map\]\(\/product\/structure\/\)\*\*/);
});
