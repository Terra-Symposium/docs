import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown } from '../lib-dist/lib/markdown.js';

test('renders Terra accordion and tab syntax without dropping rich content', () => {
  const source =
    '===[Details]\nA **bold** answer.\n===\n\n|||[First]\n```ts\nconst x = 1;\n```\n|||';
  const html = renderMarkdown(source);
  assert.match(html, /<details class="terra-docs-accordion"><summary>Details<\/summary>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<details class="terra-docs-tab"><summary>First<\/summary>/);
  assert.match(html, /const x = 1/);
});

test('sanitizes script markup and dangerous links', () => {
  const html = renderMarkdown('===[<script>bad()</script>Safe]\n[bad](javascript:alert(1))\n===');
  assert.doesNotMatch(html, /<script|javascript:/i);
  assert.match(html, /Safe/);
});

test('renders Docs callout directives as shared rich blocks', () => {
  const html = renderMarkdown(':::warning[Check this]\nReview **the source**.\n:::');
  assert.match(html, /terra-docs-callout terra-docs-callout-warning/);
  assert.match(html, /<strong>Check this<\/strong>/);
  assert.match(html, /Review <strong>the source<\/strong>/);
  assert.doesNotMatch(
    renderMarkdown(':::warning[Check this]\nBody.\n:::', { callout: false }),
    /terra-docs-callout/,
  );
});
