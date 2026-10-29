import test from 'node:test';
import assert from 'node:assert/strict';
import { DOCS_BLOCK_TYPES, enabledDocsBlocks } from '../lib-dist/components/blocks.js';
import { docsValueToMarkdown, markdownToDocsValue } from '../lib-dist/lib/markdown-model.js';
import { renderMarkdown } from '../lib-dist/lib/markdown.js';

function withoutPortableTextKeys(value) {
  if (Array.isArray(value)) return value.map(withoutPortableTextKeys);
  if (!value || typeof value !== 'object') return value;
  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([name, item]) => {
        if (name === '_key') return false;
        if (name !== 'markdown' || !item || typeof item !== 'string') return true;
        return !(
          'content' in value ||
          ['accordion', 'tabs', 'table', 'math', 'docImage'].includes(String(value._type)) ||
          (value._type === 'code' && ('value' in value || 'source' in value))
        );
      })
      .map(([name, item]) => [name, withoutPortableTextKeys(item)]),
  );
  if (Array.isArray(value.markDefs) && Array.isArray(normalized.children)) {
    const hrefByKey = new Map(
      value.markDefs
        .filter(
          (mark) =>
            mark?._type === 'link' &&
            typeof mark._key === 'string' &&
            typeof mark.href === 'string',
        )
        .map((mark) => [mark._key, mark.href]),
    );
    normalized.children = normalized.children.map((child, index) => {
      const sourceChild = value.children?.[index];
      if (!child || typeof child !== 'object' || !Array.isArray(sourceChild?.marks)) return child;
      return {
        ...child,
        marks: sourceChild.marks.map((mark) =>
          hrefByKey.has(mark) ? `link:${hrefByKey.get(mark)}` : mark,
        ),
      };
    });
  }
  if (normalized._type === 'block' || normalized._type === 'terraBlock')
    normalized._type = 'textBlock';
  return normalized;
}

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
  assert.match(result, /::::terra-docs accordion/);
  assert.match(result, /:::terra-item "Item"\nOriginal \*\*content\*\*\n:::terra-item-end/);
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

test('complex rich blocks use readable typed YAML and render instead of showing source payloads', () => {
  const diagram = {
    _key: 'readable-diagram',
    _type: 'nodes',
    direction: 'LR',
    height: 220,
    nodes: [
      { _key: 'start', _type: 'node', id: 'start', type: 'origin', data: { title: 'Input' } },
      { _key: 'finish', _type: 'node', id: 'finish', type: 'terminal', data: { title: 'Output' } },
    ],
    edges: [
      {
        _key: 'edge',
        _type: 'edge',
        id: 'input-output',
        source: 'start',
        target: 'finish',
        data: { arrowHead: true },
      },
    ],
  };
  const markdown = docsValueToMarkdown([diagram]);
  assert.match(markdown, /^:::terra-docs nodes\n(?:_key: readable-diagram\n)?_type: nodes/m);
  assert.match(markdown, /title: Input/);
  assert.doesNotMatch(markdown, /"_type"\s*:/);
  assert.deepEqual(markdownToDocsValue(markdown), [diagram]);

  const callout = {
    _type: 'callout',
    kind: 'note',
    title: 'Flow',
    content: [diagram],
  };
  const nestedMarkdown = docsValueToMarkdown([callout]);
  const rendered = renderMarkdown(nestedMarkdown);
  const restored = markdownToDocsValue(nestedMarkdown);
  assert.doesNotMatch(nestedMarkdown, /"_type"\s*:/);
  assert.match(rendered, /terra-docs-callout/);
  assert.match(rendered, /terra-docs-diagram/);
  assert.doesNotMatch(rendered, /_type:\s*nodes/);
  assert.equal(restored[0]._type, 'callout');
  assert.equal(restored[0].kind, 'note');
  assert.equal(restored[0].content[0]._type, 'nodes');
  assert.equal(restored[0].content[0].nodes[0].data.title, 'Input');
});

test('typed rich blocks preserve intentional trailing newlines in code values', () => {
  const code = {
    _type: 'code',
    _key: 'http-example',
    language: 'plaintext',
    value:
      '\n\nGET /index.html HTTP/1.1\nHost: www.example.com\n\n[blank line indicates end of headers]\n\n',
  };
  const markdown = docsValueToMarkdown([code]);

  assert.match(markdown, /^:::terra-docs code\n/m);
  assert.deepEqual(markdownToDocsValue(markdown), [code]);
  assert.match(renderMarkdown(markdown), /GET \/index\.html HTTP\/1\.1/);
});

test('raw blocks use typed source when bare Markdown would change them into paragraphs', () => {
  const raw = {
    _type: 'raw',
    _key: 'source-import',
    markdown: "import Nodes from '@src/pages/docs/components/_Nodes';",
  };
  const markdown = docsValueToMarkdown([raw]);

  assert.match(markdown, /^:::terra-docs raw\n/m);
  assert.deepEqual(markdownToDocsValue(markdown), [raw]);
});

test('legacy rich components nested in callouts serialize and render as their content', () => {
  const source = [
    ':::example[3NF Decomposition Visualised]',
    '',
    '<Code language="yaml">',
    'node_data: "graph"',
    '</Code>',
    '',
    ':::',
  ].join('\n');

  const parsed = markdownToDocsValue(source);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]._type, 'callout');
  assert.equal(parsed[0].content[0]._type, 'code');
  assert.equal(parsed[0].content[0].language, 'yaml');
  assert.equal(parsed[0].content[0].value, 'node_data: "graph"');

  const markdown = docsValueToMarkdown(parsed);
  assert.doesNotMatch(markdown, /TERRADOCSBLOCK\d+PLACEHOLDER/);
  assert.match(markdown, /```yaml\nnode_data: "graph"\n```/);
  const rendered = renderMarkdown(markdown);
  assert.match(rendered, /terra-docs-callout/);
  assert.match(rendered, /node_data:/);
  assert.doesNotMatch(rendered, /TERRADOCSBLOCK|_type: code/);

  const restored = markdownToDocsValue(markdown);
  assert.equal(restored[0]._type, 'callout');
  assert.equal(restored[0].content[0]._type, 'code');
  assert.equal(restored[0].content[0].value, 'node_data: "graph"');
});

test('tables with rich cell content use readable Markdown cells and preserve the table', () => {
  const paragraph = (key, text, marks = [], listItem, level) => ({
    _type: 'terraBlock',
    _key: key,
    style: 'normal',
    markDefs: marks.includes('resource')
      ? [{ _type: 'link', _key: 'resource', href: 'https://example.test/guide' }]
      : [],
    ...(listItem ? { listItem, level } : {}),
    children: [{ _type: 'span', _key: `${key}-span`, text, marks }],
  });
  const table = {
    _key: 'nested-table',
    _type: 'table',
    header: 'Nested data',
    rows: [
      {
        _type: 'row',
        _key: 'header-row',
        cells: [
          { _type: 'cell', _key: 'header-topic', content: [paragraph('topic-heading', 'Topic')] },
          {
            _type: 'cell',
            _key: 'header-detail',
            content: [paragraph('detail-heading', 'Details')],
          },
          {
            _type: 'cell',
            _key: 'header-example',
            content: [paragraph('example-heading', 'Example')],
          },
        ],
      },
      {
        _type: 'row',
        _key: 'body-row',
        cells: [
          {
            _type: 'cell',
            _key: 'topic-cell',
            content: [paragraph('topic', 'Collections', ['strong'])],
          },
          {
            _type: 'cell',
            _key: 'detail-cell',
            content: [
              paragraph('detail', 'A mutable sequence of elements.'),
              paragraph('resource-link', 'Read the guide', ['resource']),
              paragraph('list-a', 'Preserves order', [], 'bullet', 1),
              paragraph('list-b', 'Allows nested values', [], 'bullet', 1),
              paragraph('list-c', 'Supports nested levels', [], 'bullet', 2),
            ],
          },
          {
            _type: 'cell',
            _key: 'example-cell',
            content: [
              {
                _type: 'code',
                _key: 'code-example',
                language: 'python',
                value: 'items = [1, 2, 3]',
              },
            ],
          },
        ],
      },
    ],
  };

  const markdown = docsValueToMarkdown([table]);
  assert.match(markdown, /^:::terra-docs table\n/m);
  assert.match(markdown, /_docsCellFormat: markdown-v1/);
  assert.match(markdown, /markdown: \|-/);
  assert.match(markdown, /- Preserves order/);
  assert.match(markdown, /\[Read the guide\]\(https:\/\/example\.test\/guide\)/);
  assert.match(markdown, /\n[ \t]+```python\n[ \t]+items = \[1, 2, 3\]\n[ \t]+```/);
  assert.doesNotMatch(markdown, /_type: (?:terraBlock|block|span)\b/);
  assert.doesNotMatch(markdown, /children:\n|markDefs:\n|content:\n/);

  const rendered = renderMarkdown(markdown);
  assert.match(rendered, /<table[\s>]/);
  assert.match(rendered, /First paragraph|Collections/);
  assert.match(rendered, /<ul[\s>]/);
  assert.match(rendered, /Preserves order/);
  assert.match(rendered, /href="https:\/\/example\.test\/guide"/);
  assert.match(rendered, /items = \[1, 2, 3\]/);
  assert.doesNotMatch(rendered, /_type: row|_docsCellFormat/);

  const restored = markdownToDocsValue(markdown);
  assert.deepEqual(withoutPortableTextKeys(restored), withoutPortableTextKeys([table]));
  assert.equal(restored[0]._docsCellFormat, undefined);
});

test('tables with multiple plain-text paragraphs per cell use readable GFM and retain paragraph boundaries', () => {
  const paragraph = (key, text, marks = []) => ({
    _type: 'terraBlock',
    _key: key,
    style: 'normal',
    markDefs: [],
    children: String(text)
      .split(/(\n)/g)
      .map((part, index) => ({ _type: 'span', _key: `${key}-span-${index}`, text: part, marks })),
  });
  const table = {
    _type: 'table',
    _key: 'paragraph-table',
    header: 'Table',
    rows: [
      {
        _type: 'row',
        cells: [
          { _type: 'cell', content: [paragraph('heading-a', 'Task')] },
          { _type: 'cell', content: [paragraph('heading-b', 'Details')] },
        ],
      },
      {
        _type: 'row',
        cells: [
          { _type: 'cell', content: [paragraph('task', 'Assessment')] },
          {
            _type: 'cell',
            content: [
              paragraph('first-detail', 'Released Monday.'),
              paragraph('second-detail', 'Complete before lecture.', ['strong']),
              paragraph('third-detail', 'Product\nOperation: Usability'),
            ],
          },
        ],
      },
    ],
  };

  const markdown = docsValueToMarkdown([table]);
  assert.match(markdown, /^\| Task \| Details \|$/m);
  assert.match(
    markdown,
    /Released Monday\.<br data-docs-paragraph-break>\*\*Complete before lecture\.\*\*<br data-docs-paragraph-break>Product<br>Operation: Usability/,
  );
  assert.doesNotMatch(markdown, /^:::terra-docs table/m);
  assert.deepEqual(
    withoutPortableTextKeys(markdownToDocsValue(markdown)),
    withoutPortableTextKeys([table]),
  );
  assert.match(renderMarkdown(markdown), /<table[\s>]/);
  assert.match(renderMarkdown(markdown), /Product<br \/>Operation: Usability/);
});

test('escaped punctuation inside a table link stays one link annotation', () => {
  const table = {
    _type: 'table',
    header: 'Sources',
    rows: [
      {
        _type: 'row',
        cells: [
          {
            _type: 'cell',
            content: [
              {
                _type: 'terraBlock',
                style: 'normal',
                markDefs: [],
                children: [{ _type: 'span', text: 'Source', marks: [] }],
              },
            ],
          },
        ],
      },
      {
        _type: 'row',
        cells: [
          {
            _type: 'cell',
            content: [
              {
                _type: 'terraBlock',
                style: 'normal',
                markDefs: [
                  { _type: 'link', _key: 'source-link', href: 'https://example.test/source' },
                ],
                children: [{ _type: 'span', text: 'Quiz_Practice', marks: ['source-link'] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const markdown = docsValueToMarkdown([table]);
  assert.match(markdown, /Quiz.*Practice/);
  const restored = markdownToDocsValue(markdown);
  assert.equal(restored[0].rows[1].cells[0].content[0].children[0].text, 'Quiz_Practice');
  assert.equal(restored[0].rows[1].cells[0].content[0].children[0].marks.length, 1);
  assert.equal(docsValueToMarkdown(restored), markdown);
});

test('Portable Text fallback directives render as formatted document content', () => {
  const paragraph = {
    _key: 'paragraph-with-unsupported-metadata',
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [{ _key: 'reference', _type: 'link', href: 'https://example.test/page' }],
    children: [
      { _key: 'strong', _type: 'span', text: 'Readable ', marks: ['strong'] },
      { _key: 'linked', _type: 'span', text: 'text', marks: ['reference'] },
    ],
    customMetadata: { source: 'Sanity' },
  };
  const markdown = docsValueToMarkdown([paragraph]);
  assert.match(markdown, /^:::terra-docs terraBlock/m);
  const rendered = renderMarkdown(markdown);
  assert.match(rendered, /<p>/);
  assert.match(rendered, /<strong>Readable <\/strong>/);
  assert.match(rendered, /<a href="https:\/\/example\.test\/page">text<\/a>/);
  assert.doesNotMatch(rendered, /customMetadata|_type: terraBlock/);
  assert.deepEqual(markdownToDocsValue(markdown), [paragraph]);
});

test('structured block JSON is opaque to component parsing', () => {
  const value = {
    _key: 'table-under-test',
    _type: 'table',
    header: 'Examples',
    rows: [
      {
        _type: 'row',
        cells: [
          {
            _type: 'cell',
            content: [
              {
                _type: 'block',
                style: 'normal',
                markDefs: [],
                children: [
                  { _type: 'span', marks: [], text: '<Nodes nodes={[]} edges={[]} />' },
                  { _type: 'span', marks: [], text: ':::danger is literal text' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const restored = markdownToDocsValue(
    `:::terra-docs table\n${JSON.stringify(value, null, 2)}\n:::\n`,
  );
  assert.deepEqual(restored[0], value);
});

test('canonical Portable Text paragraph directives preserve marks and inline math exactly', () => {
  const value = {
    _key: 'paragraph-under-test',
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [{ _key: 'source-link', _type: 'link', href: '/#leaf' }],
    children: [
      { _key: 'lead', _type: 'span', text: 'Literal $ text ', marks: [] },
      { _key: 'bold', _type: 'span', text: 'marked', marks: ['strong', 'source-link'] },
      { _key: 'equation', _type: 'math', code: 'x^2', inline: true },
    ],
  };
  const source = `:::terra-docs terraBlock\n${JSON.stringify(value)}\n:::`;
  assert.deepEqual(markdownToDocsValue(source), [value]);
});

test('adjacent overlapping inline marks remain readable Markdown and round-trip without duplication', () => {
  const value = {
    _key: 'overlapping-marks',
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    children: [
      { _key: 'plain-italic', _type: 'span', text: 'Emphasises ', marks: ['em'] },
      { _key: 'bold-italic', _type: 'span', text: 'what the system does', marks: ['em', 'strong'] },
      { _key: 'more-italic', _type: 'span', text: ', not ', marks: ['em'] },
      {
        _key: 'more-bold-italic',
        _type: 'span',
        text: 'how it works internally',
        marks: ['em', 'strong'],
      },
      { _key: 'final-italic', _type: 'span', text: '.', marks: ['em'] },
    ],
  };

  const markdown = docsValueToMarkdown([value]);
  assert.equal(
    markdown,
    '<em>Emphasises </em><strong><em>what the system does</em></strong><em>, not </em>' +
      '<strong><em>how it works internally</em></strong><em>.</em>\n',
  );
  assert.doesNotMatch(markdown, /\*{4}/);

  const restored = markdownToDocsValue(markdown)[0];
  assert.deepEqual(
    restored.children.map(({ text, marks }) => [text, [...marks].sort()]),
    value.children.map(({ text, marks }) => [text, [...marks].sort()]),
  );
});

test('grouped accordion and tab data keeps its block boundaries on Markdown round trips', () => {
  for (const type of ['accordion', 'tabs']) {
    const value = {
      _key: `${type}-group`,
      _type: type,
      items: [
        {
          _key: 'first-item',
          _type: 'item',
          title: 'First',
          content: [
            {
              _key: 'first-content',
              _type: 'block',
              style: 'normal',
              markDefs: [],
              children: [{ _key: 'first-span', _type: 'span', text: 'First content', marks: [] }],
            },
          ],
        },
        {
          _key: 'second-item',
          _type: 'item',
          title: 'Second',
          content: [
            {
              _key: 'second-content',
              _type: 'block',
              style: 'normal',
              markDefs: [],
              children: [{ _key: 'second-span', _type: 'span', text: 'Second content', marks: [] }],
            },
          ],
        },
      ],
    };
    const markdown = docsValueToMarkdown([value]);
    assert.match(markdown, new RegExp(`^::::terra-docs ${type}`, 'm'));
    assert.equal(markdownToDocsValue(markdown)[0].items.length, 2);
    assert.deepEqual(
      markdownToDocsValue(markdown)[0].items.map((item) => item.title),
      ['First', 'Second'],
    );
  }
});

test('grouped blocks keep nested rich content readable instead of serializing ordinary text as YAML', () => {
  const paragraph = (key, value) => ({
    _type: 'terraBlock',
    _key: `${key}-block`,
    style: 'normal',
    markDefs: [],
    children: (Array.isArray(value) ? value : [{ text: value }]).map((run, index) => ({
      _type: 'span',
      _key: `${key}-span-${index}`,
      text: run.text,
      marks: run.marks ?? [],
    })),
  });
  const table = {
    _type: 'table',
    _key: 'nested-table',
    header: 'Contacts',
    rows: [
      {
        _type: 'row',
        _key: 'contacts-header',
        cells: [
          { _type: 'cell', _key: 'contacts-name', content: [paragraph('name-heading', 'Name')] },
          { _type: 'cell', _key: 'contacts-email', content: [paragraph('email-heading', 'Email')] },
          { _type: 'cell', _key: 'contacts-site', content: [paragraph('site-heading', 'Site')] },
        ],
      },
      {
        _type: 'row',
        _key: 'contacts-person',
        cells: [
          {
            _type: 'cell',
            _key: 'contacts-person-name',
            content: [paragraph('person-name', 'Ada')],
          },
          {
            _type: 'cell',
            _key: 'contacts-person-email',
            content: [paragraph('person-email', 'ada@example.test')],
          },
          {
            _type: 'cell',
            _key: 'contacts-person-site',
            content: [paragraph('person-site', 'https://example.test/contact')],
          },
        ],
      },
    ],
  };
  const value = {
    _type: 'accordion',
    _key: 'course-guide',
    items: [
      {
        _type: 'item',
        _key: 'course-contacts',
        title: 'Contacts and resources',
        content: [
          paragraph('lead', [
            { text: 'Contact the ' },
            { text: 'subject team', marks: ['strong'] },
            { text: ' before the lab.' },
          ]),
          table,
          { _type: 'code', _key: 'course-code', language: 'text', value: 'week = 1' },
          {
            _type: 'callout',
            _key: 'course-note',
            kind: 'note',
            title: 'Bring your student card',
            content: [paragraph('course-note-body', 'You may use it to enter the lab.')],
          },
        ],
      },
    ],
  };

  const markdown = docsValueToMarkdown([value]);
  assert.match(markdown, /^::::terra-docs accordion/m);
  assert.match(markdown, /:::terra-item "Contacts and resources"/);
  assert.match(markdown, /\*\*subject team\*\*/);
  assert.match(markdown, /:::terra-docs table\[Contacts\]/);
  assert.match(markdown, /ada&#64;example\.test/);
  assert.match(markdown, /https&#58;\/\/example\.test\/contact/);
  assert.match(markdown, /```text\nweek = 1\n```/);
  assert.match(markdown, /:::note\[Bring your student card\]/);
  assert.doesNotMatch(markdown, /_type: (?:item|terraBlock|block|span)/);

  const restored = markdownToDocsValue(markdown);
  assert.deepEqual(withoutPortableTextKeys(restored), withoutPortableTextKeys([value]));
  const rendered = renderMarkdown(markdown);
  assert.match(rendered, /class="terra-docs-accordions"/);
  assert.match(rendered, /<summary>Contacts and resources<\/summary>/);
  assert.match(rendered, /week = 1/);
  assert.doesNotMatch(rendered, /_type: (?:item|terraBlock|block|span)/);
});

test('grouped Markdown with colon-labeled list items bypasses YAML parsing', () => {
  const source = `::::terra-docs accordion
:::terra-item "Part B: SMEs"
:::note[Instructions]
Identify suitable companies and provide:

- **Research**: Demonstrate that you have researched each company.
- **Motivation**: Explain why you want to work there.
- **Accomplishments**: Describe relevant achievements.
:::
:::terra-item-end
::::`;

  const value = markdownToDocsValue(source);
  assert.equal(value[0]._type, 'accordion');
  assert.equal(value[0].items[0].title, 'Part B: SMEs');
  const callout = value[0].items[0].content.find((block) => block._type === 'callout');
  assert.ok(callout);
  assert.deepEqual(
    callout.content
      .filter((block) => block._type === 'block')
      .map((block) => block.children.map((child) => child.text).join('')),
    [
      'Identify suitable companies and provide:',
      'Research: Demonstrate that you have researched each company.',
      'Motivation: Explain why you want to work there.',
      'Accomplishments: Describe relevant achievements.',
    ],
  );

  const rendered = renderMarkdown(source);
  assert.match(rendered, /<summary>Part B: SMEs<\/summary>/);
  assert.match(rendered, /<strong>Research<\/strong>:/);
  assert.match(rendered, /<strong>Accomplishments<\/strong>:/);
  assert.doesNotMatch(rendered, /_type: (?:item|terraBlock|block|span)/);
});

test('nested standalone math keeps its block boundary in callouts and grouped blocks', () => {
  const math = { _type: 'math', _key: 'inline-formula', code: 'x^2', inline: true };
  const callout = {
    _type: 'callout',
    _key: 'math-callout',
    kind: 'note',
    title: 'Formula',
    content: [math],
  };
  const accordion = {
    _type: 'accordion',
    _key: 'math-accordion',
    items: [{ _type: 'item', _key: 'math-item', title: 'Formula', content: [math] }],
  };

  for (const value of [callout, accordion]) {
    const markdown = docsValueToMarkdown([value]);
    assert.match(
      markdown,
      value._type === 'callout' ? /^:{3,}note\[Formula\]/m : /^:{4,}terra-docs accordion/m,
    );
    assert.match(markdown, /_type: math/);
    assert.deepEqual(
      withoutPortableTextKeys(markdownToDocsValue(markdown)),
      withoutPortableTextKeys([value]),
    );
    assert.doesNotMatch(renderMarkdown(markdown), /TERRADOCSBLOCK|_type: math/);
    assert.match(renderMarkdown(markdown), /terra-docs-math/);
  }
});

test('canonical Terra Docs components import into their matching rich blocks', () => {
  const template = String.fromCharCode(96);
  const source = [
    '<Nodes',
    '  direction="TB"',
    '  nodes={' +
      template +
      '[\n    { "_key": "node-1", "_type": "node", "id": "start", "type": "origin", "data": { "title": "Start" } },\n    { "_key": "node-2", "_type": "node", "id": "end", "type": "terminal", "data": { "title": "End" } }\n  ]' +
      template +
      '}',
    '  edges={' +
      template +
      '[\n    { "_key": "edge-1", "_type": "edge", "id": "link", "source": "start", "target": "end", "data": { "arrowHead": true } }\n  ]' +
      template +
      '}',
    '  height={420}',
    '/>',
    '',
    '<Code language="ts">',
    '{' + template + 'const path = "./docs";',
    'const escaped = \\' + template + 'template\\' + template + ';',
    'const price = \\$5;',
    template + '}',
    '</Code>',
    '',
    '<Embed src="https://example.test/video" title="Demo" />',
    '<TsDocs scope="@terra-symposium/docs" />',
  ].join('\n');

  const value = markdownToDocsValue(source);
  const nodes = value.find((block) => block._type === 'nodes');
  const code = value.find((block) => block._type === 'code');
  const embed = value.find((block) => block._type === 'embed');
  const tsDocs = value.find((block) => block._type === 'tsDocs');

  assert.equal(nodes.direction, 'TB');
  assert.equal(nodes.nodes.length, 2);
  assert.equal(nodes.nodes[0].data.title, 'Start');
  assert.equal(nodes.edges[0].target, 'end');
  assert.equal(nodes.height, 420);
  assert.equal(code.language, 'ts');
  assert.match(code.value, /const path = "\.\/docs"/);
  assert.match(code.value, /const escaped = `template`/);
  assert.match(code.value, /const price = \$5/);
  assert.equal(embed.src, 'https://example.test/video');
  assert.equal(embed.title, 'Demo');
  assert.equal(tsDocs.scope, '@terra-symposium/docs');

  const roundTrip = markdownToDocsValue(docsValueToMarkdown(value));
  assert.deepEqual(roundTrip.find((block) => block._type === 'nodes').nodes, nodes.nodes);
  assert.equal(roundTrip.find((block) => block._type === 'code').value, code.value);
  assert.equal(roundTrip.find((block) => block._type === 'embed').src, embed.src);
  assert.equal(roundTrip.find((block) => block._type === 'tsDocs').scope, tsDocs.scope);
});

test('legacy adjacent Code tags do not swallow the following code samples', () => {
  const source = `<Code language="c">\nint first(void) { return 1; }\n\n<Code language="c">\n#include <stdio.h>\n\n<Code language="c">\nstruct player { int age; };\n</Code>`;
  const code = markdownToDocsValue(source).filter((block) => block._type === 'code');
  assert.deepEqual(
    code.map(({ language, value }) => [language, value.trim()]),
    [
      ['c', 'int first(void) { return 1; }'],
      ['c', '#include <stdio.h>'],
      ['c', 'struct player { int age; };'],
    ],
  );
});

test('component examples inside fenced or inline code stay code content', () => {
  const source = [
    '`<Embed src="https://example.test" />`',
    '',
    '```tsx',
    '<Nodes nodes={[]} edges={[]} />',
    '```',
  ].join('\n');
  const value = markdownToDocsValue(source);
  assert.equal(
    value.some((block) => block._type === 'embed' || block._type === 'nodes'),
    false,
  );
  assert.equal(value[0].children[0].text, '<Embed src="https://example.test" />');
  assert.equal(
    value.find((block) => block._type === 'code').value,
    '<Nodes nodes={[]} edges={[]} />',
  );
});

test('nested callout directives keep each original level as a block', () => {
  const value = markdownToDocsValue(
    ':::warning[Outer]\nBefore.\n\n:::danger[Inner]\nStop.\n:::\n\nAfter.\n:::',
  );
  assert.equal(value[0]._type, 'callout');
  assert.equal(value[0].title, 'Outer');
  assert.equal(value[0].content.filter((block) => block._type === 'callout').length, 1);
  assert.equal(value[0].content.find((block) => block._type === 'callout').kind, 'danger');
});

test('nested callouts use deeper fences and keep Markdown tables and text readable', () => {
  const paragraph = (text) => ({
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', text, marks: [] }],
  });
  const table = {
    _type: 'table',
    header: 'Characteristics',
    rows: [
      {
        _type: 'row',
        cells: [
          { _type: 'cell', content: [paragraph('Category')] },
          { _type: 'cell', content: [paragraph('Details')] },
        ],
      },
      {
        _type: 'row',
        cells: [
          { _type: 'cell', content: [paragraph('Static')] },
          { _type: 'cell', content: [paragraph('Shared across all instances.')] },
        ],
      },
    ],
  };
  const source = [
    {
      _type: 'callout',
      kind: 'tip',
      title: 'Advantages of OOP',
      content: [
        table,
        paragraph('Classes and objects are the primary building blocks.'),
        {
          _type: 'callout',
          kind: 'note',
          title: 'Remember',
          content: [paragraph('A class describes the structure of its objects.')],
        },
      ],
    },
  ];

  const markdown = docsValueToMarkdown(source);
  assert.match(markdown, /^::::tip\[Advantages of OOP\]/m);
  assert.match(markdown, /^:::note\[Remember\]/m);
  assert.match(markdown, /\| Category \| Details \|/);
  assert.match(markdown, /Classes and objects are the primary building blocks\./);
  assert.doesNotMatch(markdown, /_type: (?:terraBlock|block|span)/);

  const restored = markdownToDocsValue(markdown);
  assert.equal(restored[0]._type, 'callout');
  assert.equal(restored[0].content[0]._type, 'table');
  assert.equal(
    restored[0].content[1].children[0].text,
    'Classes and objects are the primary building blocks.',
  );
  assert.equal(restored[0].content[2]._type, 'callout');
  assert.equal(restored[0].content[2].title, 'Remember');
  assert.equal(
    restored[0].content[2].content[0].children[0].text,
    'A class describes the structure of its objects.',
  );
  assert.equal(docsValueToMarkdown(restored), markdown);
  const rendered = renderMarkdown(markdown);
  assert.match(rendered, /<table[\s>]/);
  assert.match(rendered, /terra-docs-callout/);
  assert.match(rendered, /Classes and objects are the primary building blocks\./);
  assert.doesNotMatch(rendered, /_type: (?:terraBlock|block|span)/);
});

test('visually empty Portable Text paragraphs do not force nested callouts into YAML', () => {
  const source = [
    {
      _type: 'callout',
      kind: 'note',
      title: 'Notation Standard',
      content: [
        {
          _type: 'terraBlock',
          style: 'normal',
          markDefs: [],
          children: [{ _type: 'span', text: 'Use Crow’s Foot notation.', marks: [] }],
        },
        { _type: 'terraBlock', style: 'normal', markDefs: [], children: [] },
      ],
    },
  ];
  const markdown = docsValueToMarkdown(source);
  assert.match(markdown, /^:::note\[Notation Standard\]/m);
  assert.doesNotMatch(markdown, /_type: (?:terraBlock|block|span)/);
  const restored = markdownToDocsValue(markdown);
  assert.equal(restored[0].content.length, 1);
  assert.equal(restored[0].content[0].children[0].text, 'Use Crow’s Foot notation.');
});

test('invalid canonical component payloads are preserved as raw source', () => {
  const source = '<Nodes nodes={notAnArray} edges={[]} />';
  const value = markdownToDocsValue(source);
  assert.equal(
    value.some((block) => block._type === 'nodes'),
    false,
  );
  assert.equal(
    value.some((block) => block._type === 'raw' && block.markdown.includes(source)),
    true,
  );
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

test('math delimiters embedded in a Portable Text span remain supported inline math', () => {
  const value = [
    {
      _type: 'terraBlock',
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', text: 'The program $P$ is modified.', marks: [] }],
    },
  ];
  const markdown = docsValueToMarkdown(value);
  const restored = markdownToDocsValue(markdown);
  assert.equal(restored[0].children.find((child) => child._type === 'math')?.code, 'P');
  assert.match(renderMarkdown(markdown), /katex/);
});

test('escaped dollar delimiters in plain spans stay literal across Markdown round trips', () => {
  const source = String.raw`5. Apply \$\sum \vec{F} = 0\$, \$\sum \tau = 0\$, or \$\sum \tau = I\alpha\$ with a declared sign convention.`;
  const first = markdownToDocsValue(source);
  const markdown = docsValueToMarkdown(first);
  assert.match(markdown, /\\\$/);
  const restored = markdownToDocsValue(markdown);
  const plainText = (block) => (block.children ?? []).map((child) => child.text ?? '').join('');
  assert.equal(first.length, 1);
  assert.equal(restored.length, 1);
  assert.equal(
    first[0].children.some((child) => child._type === 'math'),
    false,
  );
  assert.equal(
    restored[0].children.some((child) => child._type === 'math'),
    false,
  );
  assert.equal(plainText(restored[0]), plainText(first[0]));
});

test('multiline headings stay one readable heading across Markdown round trips', () => {
  const value = [
    {
      _type: 'terraBlock',
      style: 'h2',
      markDefs: [],
      children: [
        {
          _type: 'span',
          text: 'Human-centred design prioritises end-users.\nThis document covers two stages.',
          marks: [],
        },
      ],
    },
  ];
  const markdown = docsValueToMarkdown(value);
  const restored = markdownToDocsValue(markdown);
  assert.match(
    markdown,
    /^## Human-centred design prioritises end-users\.<br>This document covers two stages\./,
  );
  assert.equal(restored.length, 1);
  assert.equal(restored[0].style, 'h2');
  assert.equal(
    restored[0].children.map((child) => child.text ?? '').join(''),
    value[0].children[0].text,
  );
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

test('GFM tables keep multiline code-marked cells readable and lossless', () => {
  const paragraph = (text, marks = []) => ({
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', text, marks }],
  });
  const value = [
    {
      _type: 'table',
      header: 'Lab locations',
      rows: [
        {
          _type: 'row',
          cells: [
            { _type: 'cell', content: [paragraph('Lab')] },
            { _type: 'cell', content: [paragraph('Location')] },
          ],
        },
        {
          _type: 'row',
          cells: [
            { _type: 'cell', content: [paragraph('Lab 1')] },
            {
              _type: 'cell',
              content: [paragraph('\n{CB11.07.406`}\n', ['code']), paragraph('`')],
            },
          ],
        },
      ],
    },
  ];

  const markdown = docsValueToMarkdown(value);
  assert.match(markdown, /^\| Lab \| Location \|$/m);
  assert.match(markdown, /<code>&#10;\{CB11\.07\.406&#96;\}&#10;<\/code>/);
  assert.doesNotMatch(markdown, /^:::terra-docs table$/m);
  const restored = markdownToDocsValue(markdown).find((block) => block._type === 'table');
  assert.deepEqual(withoutPortableTextKeys(restored), withoutPortableTextKeys(value[0]));
});

test('tables with structured or list content keep the source readable and round-trip list metadata', () => {
  const paragraph = (text, listItem) => ({
    _type: 'terraBlock',
    _key: `block-${text}`,
    style: 'normal',
    ...(listItem ? { listItem, level: 1 } : {}),
    markDefs: [],
    children: [{ _type: 'span', _key: `span-${text}`, text, marks: [] }],
  });
  const value = {
    _type: 'table',
    _key: 'table-with-list-cell',
    header: 'Assessment dates',
    rows: [
      {
        _type: 'row',
        _key: 'header-row',
        cells: [
          { _type: 'cell', _key: 'header-a', content: [paragraph('Assessment')] },
          { _type: 'cell', _key: 'header-b', content: [paragraph('Due')] },
        ],
      },
      {
        _type: 'row',
        _key: 'body-row',
        cells: [
          { _type: 'cell', _key: 'body-a', content: [paragraph('Project')] },
          {
            _type: 'cell',
            _key: 'body-b',
            content: [paragraph('Draft: Week 4', 'bullet'), paragraph('Final: Week 8', 'bullet')],
          },
        ],
      },
    ],
  };

  const markdown = docsValueToMarkdown([value]);
  assert.match(markdown, /^:::terra-docs table\n/m);
  assert.match(markdown, /_docsCellFormat: markdown-v1/);
  assert.match(markdown, /- Draft: Week 4\n\s+- Final: Week 8/);
  assert.doesNotMatch(
    markdown,
    /_type: (?:terraBlock|block|span)\b|children:\n|markDefs:\n|content:\n/,
  );
  assert.doesNotMatch(markdown, /^\| Assessment \| Due \|$/m);
  assert.deepEqual(
    withoutPortableTextKeys(markdownToDocsValue(markdown)),
    withoutPortableTextKeys([value]),
  );
});

test('simple tables preserve deliberately empty cells as readable GFM', () => {
  const empty = {
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', text: '', marks: [] }],
  };
  const text = (value) => ({
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', text: value, marks: [] }],
  });
  const value = [
    {
      _type: 'table',
      header: 'Prime and non-prime attributes',
      rows: [
        {
          _type: 'row',
          cells: [
            { _type: 'cell', content: [empty] },
            { _type: 'cell', content: [text('Location')] },
            { _type: 'cell', content: [text('Description')] },
          ],
        },
        {
          _type: 'row',
          cells: [
            { _type: 'cell', content: [text('L (Left)')] },
            { _type: 'cell', content: [text('Appears only on the left of FDs')] },
            { _type: 'cell', content: [text('Must be included in every candidate key.')] },
          ],
        },
      ],
    },
  ];

  const markdown = docsValueToMarkdown(value);
  assert.match(markdown, /^\| {2}\| Location \| Description \|$/m);
  assert.doesNotMatch(markdown, /^:::terra-docs table$/m);
  const restored = markdownToDocsValue(markdown)[0];
  assert.equal(restored._type, 'table');
  assert.equal(restored.rows[0].cells[0].content[0].children[0].text, '');
  assert.equal(restored.rows[0].cells[1].content[0].children[0].text, 'Location');
});

test('empty Sanity paragraphs do not turn a rich table into a Portable Text source dump', () => {
  const paragraph = (text, listItem) => ({
    _type: 'terraBlock',
    style: 'normal',
    markDefs: [],
    ...(listItem ? { listItem, level: 1 } : {}),
    children: [{ _type: 'span', text, marks: [] }],
  });
  const table = {
    _type: 'table',
    header: 'Readable table',
    rows: [
      {
        _type: 'row',
        cells: [
          { _type: 'cell', content: [paragraph('Topic')] },
          { _type: 'cell', content: [paragraph('Notes')] },
        ],
      },
      {
        _type: 'row',
        cells: [
          { _type: 'cell', content: [paragraph('Example')] },
          {
            _type: 'cell',
            content: [paragraph('First item', 'bullet'), paragraph('', undefined)],
          },
        ],
      },
    ],
  };

  const markdown = docsValueToMarkdown([table]);
  assert.match(markdown, /^:::terra-docs table\n/m);
  assert.match(markdown, /_docsCellFormat: markdown-v1/);
  assert.match(markdown, /- First item/);
  assert.doesNotMatch(
    markdown,
    /_type: (?:terraBlock|block|span)\b|children:\n|markDefs:\n|content:\n/,
  );

  const rendered = renderMarkdown(markdown);
  assert.match(rendered, /<table[\s>]/);
  assert.match(rendered, /First item/);
  assert.doesNotMatch(rendered, /_docsCellFormat|_type: terraBlock/);

  const restored = markdownToDocsValue(markdown);
  assert.equal(restored[0]._type, 'table');
  assert.equal(restored[0].rows[1].cells[1].content.length, 1);
  assert.equal(docsValueToMarkdown(restored), markdown);
});

test('tables with uneven Sanity rows keep the original cells without padded columns', () => {
  const cell = (text) => ({
    _type: 'cell',
    content: [
      {
        _type: 'terraBlock',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', text, marks: [] }],
      },
    ],
  });
  const table = {
    _type: 'table',
    header: 'Partial row',
    rows: [
      { _type: 'row', cells: [cell('Item'), cell('Details')] },
      { _type: 'row', cells: [cell('One cell in the Sanity source')] },
    ],
  };

  const markdown = docsValueToMarkdown([table]);
  assert.match(markdown, /^:::terra-docs table\n/m);
  assert.match(markdown, /_docsCellFormat: markdown-v1/);
  assert.doesNotMatch(
    markdown,
    /_type: (?:terraBlock|block|span)\b|children:\n|markDefs:\n|content:\n/,
  );
  const restored = markdownToDocsValue(markdown);
  assert.equal(restored[0].rows[1].cells.length, 1);
  assert.equal(
    restored[0].rows[1].cells[0].content[0].children[0].text,
    'One cell in the Sanity source',
  );
  assert.equal(docsValueToMarkdown(restored), markdown);
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

test('HTML table cells keep every paragraph, literal identifiers, inline code, and math', () => {
  const source = [
    '<table><tbody><tr>',
    '<td><p>Clients: dynamic/intermittent IP, may be offline.</p><p>Server: permanent IP, always online.</p></td>',
    '<td>Python __str__() and SQL pk_prod.</td>',
    '<td><p>Call <code>pk_prod</code>.</p><p>Formula $z_1z_2$.</p></td>',
    '</tr></tbody></table>',
  ].join('');
  const table = markdownToDocsValue(source).find((block) => block._type === 'table');
  assert.ok(table);

  const [paragraphs, identifiers, formatted] = table.rows[0].cells.map((cell) => cell.content);
  assert.deepEqual(
    paragraphs.map((block) => block.children.map((child) => child.text ?? '').join('')),
    ['Clients: dynamic/intermittent IP, may be offline.', 'Server: permanent IP, always online.'],
  );
  assert.equal(
    identifiers[0].children.map((child) => child.text ?? '').join(''),
    'Python __str__() and SQL pk_prod.',
  );
  assert.ok(identifiers[0].children.every((child) => child.marks.length === 0));
  assert.equal(
    formatted[0].children.find((child) => child.text === 'pk_prod').marks.includes('code'),
    true,
  );
  assert.equal(formatted[1].children.find((child) => child._type === 'math').code, 'z_1z_2');
});

test('Markdown and HTML table images stay structured and round-trip as readable Markdown', () => {
  const markdownSource = [
    '| Topic | Illustration |',
    '| --- | --- |',
    '| Before ![diagram](./diagram.png "System diagram") after | ![axes](./axes.svg) |',
  ].join('\n');
  const markdownTable = markdownToDocsValue(markdownSource).find(
    (block) => block._type === 'table',
  );
  assert.ok(markdownTable);
  const markdownCell = markdownTable.rows[1].cells[0].content;
  assert.deepEqual(
    markdownCell
      .filter((block) => block._type === 'docImage')
      .map(({ alt, url, title }) => ({ alt, url, title })),
    [{ alt: 'diagram', url: './diagram.png', title: 'System diagram' }],
  );
  assert.equal(markdownTable.rows[1].cells[1].content[0]._type, 'docImage');
  const markdownRoundTrip = docsValueToMarkdown([markdownTable]);
  assert.match(markdownRoundTrip, /\| Before <br data-docs-paragraph-break>!\[diagram\]/);
  assert.match(markdownRoundTrip, /!\[diagram\]\(\.\/diagram\.png "System diagram"\)/);
  assert.match(markdownRoundTrip, /!\[axes\]\(\.\/axes\.svg\)/);
  const restoredMarkdownTable = markdownToDocsValue(markdownRoundTrip).find(
    (block) => block._type === 'table',
  );
  assert.equal(
    restoredMarkdownTable.rows[1].cells[0].content.filter((block) => block._type === 'docImage')
      .length,
    1,
  );
  assert.equal(restoredMarkdownTable.rows[1].cells[1].content[0].url, './axes.svg');

  const htmlSource =
    '<table><tbody><tr><td>Before <img src="./inline.png" alt="Inline diagram" title="Inline title"/> after</td></tr></tbody></table>';
  const htmlTable = markdownToDocsValue(htmlSource).find((block) => block._type === 'table');
  assert.ok(htmlTable);
  const htmlCell = htmlTable.rows[0].cells[0].content;
  assert.deepEqual(
    htmlCell
      .filter((block) => block._type === 'docImage')
      .map(({ alt, url, title }) => ({ alt, url, title })),
    [{ alt: 'Inline diagram', url: './inline.png', title: 'Inline title' }],
  );
  const htmlRoundTrip = docsValueToMarkdown([htmlTable]);
  assert.match(htmlRoundTrip, /!\[Inline diagram\]\(\.\/inline\.png "Inline title"\)/);
  assert.doesNotMatch(htmlRoundTrip, /:::terra-docs table/);
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

test('ordinary Portable Text stays readable and mixed nested list kinds keep their depth', () => {
  const source = [
    {
      _type: 'terraBlock',
      style: 'h3',
      markDefs: [],
      children: [{ _type: 'span', text: 'Preparation', marks: [] }],
    },
    {
      _type: 'terraBlock',
      style: 'normal',
      markDefs: [{ _type: 'link', _key: 'link-1', href: 'https://example.test/guide' }],
      children: [
        { _type: 'span', text: 'Read ', marks: [] },
        { _type: 'span', text: 'the guide', marks: ['strong', 'link-1'] },
        { _type: 'span', text: ' and ', marks: [] },
        { _type: 'span', text: 'format', marks: ['code'] },
        { _type: 'span', text: ' the result.', marks: [] },
      ],
    },
    {
      _type: 'terraBlock',
      style: 'normal',
      listItem: 'number',
      level: 1,
      markDefs: [],
      children: [{ _type: 'span', text: 'Install the tool', marks: [] }],
    },
    {
      _type: 'terraBlock',
      style: 'normal',
      listItem: 'bullet',
      level: 2,
      markDefs: [],
      children: [{ _type: 'span', text: 'Choose the shell', marks: [] }],
    },
    {
      _type: 'terraBlock',
      style: 'normal',
      listItem: 'number',
      level: 1,
      markDefs: [],
      children: [{ _type: 'span', text: 'Verify the install', marks: [] }],
    },
  ];

  const markdown = docsValueToMarkdown(source);
  assert.match(markdown, /^### Preparation/m);
  assert.match(markdown, /\[\*\*the guide\*\*\]\(https:\/\/example\.test\/guide\)/);
  assert.match(markdown, /1\. Install the tool\n {3}- Choose the shell\n2\. Verify the install/);
  assert.doesNotMatch(markdown, /:::terra-docs terraBlock/);

  const restored = markdownToDocsValue(markdown);
  assert.deepEqual(
    restored.filter((block) => block.listItem).map((block) => [block.listItem, block.level]),
    [
      ['number', 1],
      ['bullet', 2],
      ['number', 1],
    ],
  );
  assert.equal(restored[0].style, 'h3');
  assert.equal(restored[1].markDefs[0].href, 'https://example.test/guide');
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
