import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { DocsRichBlock, enabledDocsBlocks } from '../components/blocks.js';
import type { DocsBlockOptions, RichBlock } from '../components/blocks.js';

type CalloutRange = {
  start: number;
  bodyStart: number;
  closeStart: number;
  end: number;
  fenceLength: number;
  kind: string;
  title?: string;
};

function markdownCalloutRanges(source: string): CalloutRange[] {
  const stack: Omit<CalloutRange, 'closeStart' | 'end'>[] = [];
  const ranges: CalloutRange[] = [];
  let codeFence: { char: string; length: number } | undefined;
  let offset = 0;

  while (offset < source.length) {
    const newline = source.indexOf('\n', offset);
    const end = newline === -1 ? source.length : newline + 1;
    const lineEnd = newline === -1 ? source.length : newline;
    const line = source.slice(offset, end).replace(/\r?\n$/, '');

    if (codeFence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1]![0] === codeFence.char && close[1]!.length >= codeFence.length)
        codeFence = undefined;
      offset = end;
      continue;
    }

    const codeOpen = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (codeOpen) {
      codeFence = { char: codeOpen[1]![0]!, length: codeOpen[1]!.length };
      offset = end;
      continue;
    }

    const open = line.match(
      /^ {0,3}(:{3,})(?!(?:terra-docs|terra-item(?:-end)?)(?:\s|$))([A-Za-z][\w-]*)(?:\[([^\]\n]*)\])?[ \t]*$/,
    );
    if (open) {
      stack.push({
        start: offset,
        bodyStart: end,
        fenceLength: open[1]!.length,
        kind: open[2]!,
        ...(open[3] ? { title: open[3].trim() } : {}),
      });
    } else {
      const close = line.match(/^ {0,3}(:{3,})[ \t]*$/);
      const current = stack.at(-1);
      if (close && current?.fenceLength === close[1]!.length) {
        const closed = stack.pop();
        if (closed && stack.length === 0)
          ranges.push({ ...closed, closeStart: offset, end: lineEnd });
      }
    }
    offset = end;
  }

  return ranges;
}

function renderCallouts(
  markdown: string,
  options: DocsBlockOptions,
  placeholder: (html: string) => string,
): string {
  let source = markdown;
  for (const range of markdownCalloutRanges(markdown).reverse()) {
    const raw = source.slice(range.start, range.end);
    const body = source.slice(range.bodyStart, range.closeStart).trimEnd();
    const html = enabledDocsBlocks(options).includes('callout')
      ? renderToStaticMarkup(
          createElement(DocsRichBlock, {
            block: {
              _type: 'callout',
              kind: range.kind,
              title: range.title || range.kind,
              markdown: body,
            },
          }),
        )
      : `<pre>${sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} })}</pre>`;
    source = source.slice(0, range.start) + placeholder(html) + source.slice(range.end);
  }
  return source;
}

function renderGroupedBlocks(
  markdown: string,
  options: DocsBlockOptions,
  placeholder: (html: string) => string,
): string {
  const grouped = markdown.replace(
    /^(:{4,})terra-docs (accordion|tabs)[ \t]*\r?\n([\s\S]*?)^\1[ \t]*$/gm,
    (source, _fence: string, type: string, body: string) => {
      const markers = [...body.matchAll(/^:::terra-item ("(?:\\.|[^"\\])*")[ \t]*\r?$/gm)];
      const items: { title: string; markdown: string }[] = [];
      let valid = markers.length > 0 && !body.slice(0, markers[0]!.index).trim();
      for (let index = 0; valid && index < markers.length; index += 1) {
        const marker = markers[index]!;
        const start = (marker.index ?? 0) + marker[0].length;
        const next = markers[index + 1]?.index ?? body.length;
        const endMarker = /^:::terra-item-end[ \t]*\r?$/gm;
        endMarker.lastIndex = start;
        const end = endMarker.exec(body);
        if (!end || end.index >= next || body.slice(end.index + end[0].length, next).trim()) {
          valid = false;
          break;
        }
        try {
          const title = JSON.parse(marker[1]!) as unknown;
          if (typeof title !== 'string') {
            valid = false;
            break;
          }
          items.push({
            title,
            markdown: body
              .slice(start, end.index)
              .replace(/^\r?\n/, '')
              .replace(/\r?\n$/, ''),
          });
        } catch {
          valid = false;
        }
      }
      if (!valid || !enabledDocsBlocks(options).includes(type as never)) {
        return placeholder(
          '<pre>' + sanitizeHtml(source, { allowedTags: [], allowedAttributes: {} }) + '</pre>',
        );
      }
      return placeholder(
        renderToStaticMarkup(createElement(DocsRichBlock, { block: { _type: type, items } })),
      );
    },
  );
  return grouped.replace(
    /^(===|\|\|\|)\s*\[([^\]\n]+)\]\s*\n([\s\S]*?)^\1\s*$/gm,
    (_match, delimiter: string, title: string, body: string) => {
      const summary = sanitizeHtml(title, { allowedTags: [], allowedAttributes: {} });
      const content = renderMarkdown(body, options);
      if (delimiter === '===')
        return placeholder(
          `<details class="terra-docs-accordion"><summary>${summary}</summary>${content}</details>`,
        );
      return placeholder(
        `<details class="terra-docs-tab"><summary>${summary}</summary>${content}</details>`,
      );
    },
  );
}

export function renderMarkdown(markdown: string, options: DocsBlockOptions = {}): string {
  const rendered: string[] = [];
  const parser = new Marked({ gfm: true });
  const placeholder = (html: string) => {
    const marker = `TERRADOCSRICHPLACEHOLDER${rendered.length}END`;
    rendered.push(html);
    return marker;
  };
  const grouped = renderGroupedBlocks(markdown, options, placeholder);
  // Render a complete outer callout first. Its body is rendered recursively by
  // DocsRichBlock, so nested typed blocks keep their own parser context instead
  // of being replaced by placeholders that cannot cross the callout boundary.
  const callouts = renderCallouts(grouped, options, placeholder);
  const captioned = callouts.replace(
    /^:::terra-docs table\[([^\]\r\n]*)\][ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/gm,
    (source, caption: string, body: string) => {
      try {
        const decoded = decodeURIComponent(caption);
        const label = sanitizeHtml(decoded, { allowedTags: [], allowedAttributes: {} });
        const table = parser.parse(body, { async: false });
        return placeholder(
          '<section class="terra-docs-table"><strong>' + label + '</strong>' + table + '</section>',
        );
      } catch {
        return placeholder(
          '<pre>' + sanitizeHtml(source, { allowedTags: [], allowedAttributes: {} }) + '</pre>',
        );
      }
    },
  );
  const portable = captioned.replace(
    /^(:{3,})terra-docs ([A-Za-z]+)\s*\n([\s\S]*?)^\1\s*$/gm,
    (source, fence: string, type: string, payload: string) => {
      // Grouped accordion/tab Markdown is not YAML. Keep it for the dedicated
      // grouped renderer so ordinary prose and list labels are never parsed as
      // YAML aliases.
      if (
        fence.length >= 4 &&
        (type === 'accordion' || type === 'tabs') &&
        /^:::terra-item "/m.test(payload)
      )
        return source;
      try {
        const data = parseYaml(payload) as RichBlock;
        if (data?._type === type && (type === 'block' || type === 'terraBlock')) {
          return placeholder(renderToStaticMarkup(createElement(DocsRichBlock, { block: data })));
        }
        if (!enabledDocsBlocks(options).includes(type as never) || data?._type !== type) {
          if (fence.length >= 4 && (type === 'accordion' || type === 'tabs')) return source;
          return placeholder(
            '<pre>' + sanitizeHtml(source, { allowedTags: [], allowedAttributes: {} }) + '</pre>',
          );
        }
        return placeholder(renderToStaticMarkup(createElement(DocsRichBlock, { block: data })));
      } catch {
        if (fence.length >= 4 && (type === 'accordion' || type === 'tabs')) return source;
        return placeholder(
          '<pre>' + sanitizeHtml(source, { allowedTags: [], allowedAttributes: {} }) + '</pre>',
        );
      }
    },
  );
  const withMath = portable.replace(/^\$\$\s*\n([\s\S]*?)^\$\$\s*$/gm, (_source, code: string) =>
    options.math === false
      ? _source
      : placeholder(
          renderToStaticMarkup(createElement(DocsRichBlock, { block: { _type: 'math', code } })),
        ),
  );
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
  const html = parser.parse(withMath, { async: false });
  const safe = sanitizeHtml(html, {
    ...sanitizeHtml.defaults,
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'u',
      'details',
      'summary',
      'figure',
      'figcaption',
      'section',
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
