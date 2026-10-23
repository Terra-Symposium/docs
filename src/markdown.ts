import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export function renderMarkdown(markdown: string): string {
  let blockNumber = 0;
  const rich = markdown.replace(
    /^(===|\|\|\|)\[([^\]\n]+)\]\s*\n([\s\S]*?)^\1\s*$/gm,
    (_match, delimiter: string, title: string, body: string) => {
      const summary = sanitizeHtml(title, { allowedTags: [], allowedAttributes: {} });
      const content = marked.parse(body, { async: false, gfm: true });
      if (delimiter === '===')
        return `<details class="terra-docs-accordion"><summary>${summary}</summary>${content}</details>`;
      blockNumber += 1;
      return `<details class="terra-docs-tab" data-tab="${blockNumber}"><summary>${summary}</summary>${content}</details>`;
    },
  );
  const html = marked.parse(rich, { async: false, gfm: true });
  return sanitizeHtml(html, {
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
}
