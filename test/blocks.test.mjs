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

test('GFM tables become editable table blocks and survive a Markdown round trip', () => {
  const source = '| Name | Reference |\n| --- | --- |\n| **Terra** | [Docs](/guides/docs) |\n';
  const value = markdownToDocsValue(source);
  const table = value.find((block) => block._type === 'table');
  assert.ok(table);
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0].cells[0].content[0].children[0].text, 'Name');
  assert.equal(table.rows[1].cells[0].content[0].children[0].marks.includes('strong'), true);
  assert.equal(table.rows[1].cells[1].content[0].markDefs[0].href, '/guides/docs');

  const roundTrip = docsValueToMarkdown(value);
  assert.match(roundTrip, /\| Name \| Reference \|/);
  assert.match(roundTrip, /\| \*\*Terra\*\* \| \[Docs\]\(\/guides\/docs\) \|/);
  const restored = markdownToDocsValue(roundTrip).find((block) => block._type === 'table');
  assert.equal(restored.rows[1].cells[0].content[0].children[0].text, 'Terra');
  assert.equal(restored.rows[1].cells[1].content[0].markDefs[0].href, '/guides/docs');
});

test('native HTML tables become editable table blocks without losing cell formatting', () => {
  const source =
    '<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td><strong>Terra</strong></td><td>One &amp; two</td></tr></tbody></table>';
  const value = markdownToDocsValue(source);
  const table = value.find((block) => block._type === 'table');
  assert.ok(table);
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[1].cells[0].content[0].children[0].text, 'Terra');
  assert.equal(table.rows[1].cells[0].content[0].children[0].marks.includes('strong'), true);
  assert.equal(table.rows[1].cells[1].content[0].children[0].text, 'One & two');
  assert.match(docsValueToMarkdown(value), /\| \*\*Terra\*\* \| One & two \|/);
});

test('images, headings, quotes, lists, fenced code and display math retain their visual block types', () => {
  const source = [
    '# Page title',
    '',
    '> A quoted sentence.',
    '',
    '- **First**',
    '  - Nested',
    '- Last',
    '',
    '1. Ordered one',
    '2. Ordered two',
    '',
    '![Diagram](./diagram.svg "System diagram")',
    '',
    '```ts',
    'const answer = 42;',
    '```',
    '',
    '$$',
    'x^2 + 1',
    '$$',
  ].join('\n');
  const value = markdownToDocsValue(source);
  assert.equal(value[0].style, 'normal');
  assert.equal(
    value.find((block) => block.style === 'blockquote').children[0].text,
    'A quoted sentence.',
  );
  assert.deepEqual(
    value.filter((block) => block.listItem).map((block) => [block.listItem, block.level]),
    [
      ['bullet', 1],
      ['bullet', 2],
      ['bullet', 1],
      ['number', 1],
      ['number', 1],
    ],
  );
  assert.equal(value.find((block) => block._type === 'docImage').url, './diagram.svg');
  assert.equal(value.find((block) => block._type === 'code').value, 'const answer = 42;');
  assert.equal(value.find((block) => block._type === 'math').code, 'x^2 + 1');

  const roundTrip = markdownToDocsValue(docsValueToMarkdown(value));
  assert.equal(roundTrip.find((block) => block._type === 'docImage').alt, 'Diagram');
  assert.equal(roundTrip.filter((block) => block.listItem).length, 5);
  assert.equal(roundTrip.find((block) => block._type === 'code').value, 'const answer = 42;');
  assert.equal(roundTrip.find((block) => block._type === 'math').code, 'x^2 + 1');
});

test('callout directives map to rich blocks and block opt-outs preserve original Markdown', () => {
  const source = ':::warning[Check this]\nReview **the source**.\n:::';
  const value = markdownToDocsValue(source);
  assert.equal(value[0]._type, 'callout');
  assert.equal(value[0].kind, 'warning');
  assert.equal(value[0].title, 'Check this');
  assert.match(docsValueToMarkdown(value), /:::warning\[Check this\]/);
  assert.match(docsValueToMarkdown(value), /Review \*\*the source\*\*/);

  for (const [markdown, option] of [
    ['| a | b |\n| --- | --- |\n| c | d |', { table: false }],
    ['![asset](./asset.svg)', { docImage: false }],
    ['```ts\nconst x = 1;\n```', { code: false }],
    ['$$\nx^2\n$$', { math: false }],
    [':::warning[Note]\nBody.\n:::', { callout: false }],
    ['===[Details]\nBody.\n===', { accordion: false }],
  ]) {
    const restored = docsValueToMarkdown(markdownToDocsValue(markdown, option));
    assert.match(restored, markdown.includes('|') ? /\| a \| b \|/ : /./);
    for (const line of markdown.split('\n').filter(Boolean)) assert.ok(restored.includes(line));
  }
});
