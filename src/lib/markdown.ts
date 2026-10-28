import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocsRichBlock, enabledDocsBlocks } from '../components/blocks.js';
import type { DocsBlockOptions, RichBlock } from '../components/blocks.js';

export function renderMarkdown(markdown: string, options: DocsBlockOptions = {}): string {
  const rendered: string[] = [];
  const placeholder = (html: string) => {
    const marker = `TERRADOCSRICHPLACEHOLDER${rendered.length}END`;
    rendered.push(html);
    return marker;
  };
  const portable = markdown.replace(
    /^:::terra-docs ([A-Za-z]+)\s*\n([\s\S]*?)^:::\s*$/gm,
    (source, type: string, json: string) => {
      try {
        const data = JSON.parse(json) as RichBlock;
        if (!enabledDocsBlocks(options).includes(type as never) || data._type !== type)
          return placeholder(
            `<pre>${sanitizeHtml(source, { allowedTags: [], allowedAttributes: {} })}</pre>`,
          );
        return placeholder(renderToStaticMarkup(createElement(DocsRichBlock, { block: data })));
      } catch {
        return placeholder(
          `<pre>${sanitizeHtml(source, { allowedTags: [], allowedAttributes: {} })}</pre>`,
        );
      }
    },
  );
  const withCallouts = portable.replace(
    /^:::(?!terra-docs(?:\s|$))([A-Za-z][\w-]*)(?:\[([^\]\n]*)\])?[ \t]*\n([\s\S]*?)^:::[ \t]*$/gm,
    (source, kind: string, title: string | undefined, markdown: string) => {
      if (!enabledDocsBlocks(options).includes('callout'))
        return placeholder(
          `<pre>${sanitizeHtml(source, { allowedTags: [], allowedAttributes: {} })}</pre>`,
        );
      return placeholder(
        renderToStaticMarkup(
          createElement(DocsRichBlock, {
            block: {
              _type: 'callout',
              kind,
              title: title?.trim() || kind,
              markdown,
            },
          }),
        ),
      );
    },
  );
  const withMath = withCallouts.replace(
    /^\$\$\s*\n([\s\S]*?)^\$\$\s*$/gm,
    (_source, code: string) =>
      options.math === false
        ? _source
        : placeholder(
            renderToStaticMarkup(createElement(DocsRichBlock, { block: { _type: 'math', code } })),
          ),
  );
  const parser = new Marked({ gfm: true });
  if (options.inlineMath !== false && options.math !== false)
    parser.use({
      extensions: [
        {
          name: 'terraInlineMath',
          level: 'inline',
          start: (source) => source.indexOf('$'),
          tokenizer(source) {
            const match = /^\$([^$\n]+)\$/.exec(source);
            return match ? { type: 'terraInlineMath', raw: match[0], text: match[1] } : undefined;
          },
          renderer(token) {
            return placeholder(
              renderToStaticMarkup(
                createElement(DocsRichBlock, {
                  block: { _type: 'math', code: token.text, inline: true },
                }),
              ),
            );
          },
        },
      ],
    });
  let blockNumber = 0;
  const rich = withMath.replace(
    /^(===|\|\|\|)\s*\[([^\]\n]+)\]\s*\n([\s\S]*?)^\1\s*$/gm,
    (_match, delimiter: string, title: string, body: string) => {
      const summary = sanitizeHtml(title, { allowedTags: [], allowedAttributes: {} });
      const content = parser.parse(body, { async: false });
      if (delimiter === '===')
        return `<details class="terra-docs-accordion"><summary>${summary}</summary>${content}</details>`;
      blockNumber += 1;
      return `<details class="terra-docs-tab" data-tab="${blockNumber}"><summary>${summary}</summary>${content}</details>`;
    },
  );
  const html = parser.parse(rich, { async: false });
  const safe = sanitizeHtml(html, {
    ...sanitizeHtml.defaults,
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'details',
      'summary',
      'input',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'name', 'target', 'rel', 'id'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      input: ['type', 'checked', 'disabled'],
      '*': ['id', 'class', 'aria-label'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
  return safe.replace(
    /TERRADOCSRICHPLACEHOLDER(\d+)END/g,
    (_match, index: string) => rendered[Number(index)] ?? '',
  );
}
