import { marked } from 'marked';
import type { DocsValue } from './Docs.js';
import type { RichBlock } from './blocks.js';
import { enabledDocsBlocks } from './blocks.js';
import type { DocsBlockOptions } from './blocks.js';

const key = () => crypto.randomUUID();
type Token = {
  type: string;
  raw: string;
  text?: string;
  depth?: number;
  lang?: string;
  tokens?: Token[];
  [name: string]: unknown;
};
function span(text: string, marks: string[] = []) {
  return { _type: 'span', _key: key(), text, marks };
}
function inline(
  tokens: Token[] | undefined,
): (ReturnType<typeof span> | { _type: 'math'; _key: string; code: string; inline: true })[] {
  if (!tokens) return [];
  return tokens.flatMap((token) => {
    if (token.type === 'strong')
      return inline(token.tokens).map((item) =>
        item._type === 'span' ? { ...item, marks: [...item.marks, 'strong'] } : item,
      );
    if (token.type === 'em')
      return inline(token.tokens).map((item) =>
        item._type === 'span' ? { ...item, marks: [...item.marks, 'em'] } : item,
      );
    if (token.type === 'del')
      return inline(token.tokens).map((item) =>
        item._type === 'span' ? { ...item, marks: [...item.marks, 'strike-through'] } : item,
      );
    if (token.type === 'text' || token.type === 'escape') {
      const pieces = (token.text ?? token.raw).split(/(\$[^$\n]+\$)/g).filter(Boolean);
      return pieces.map((piece) =>
        /^\$[^$\n]+\$$/.test(piece)
          ? { _type: 'math', _key: key(), code: piece.slice(1, -1), inline: true }
          : span(piece),
      );
    }
    if (token.type === 'codespan') return [span(token.text ?? token.raw, ['code'])];
    return [span(token.raw)];
  });
}
function textBlock(style: string, tokens: Token[] | undefined, fallback: string) {
  return {
    _type: 'block',
    _key: key(),
    style,
    markDefs: [],
    children: inline(tokens).length ? inline(tokens) : [span(fallback)],
  };
}

/** Decode Markdown without dropping unsupported syntax; opaque tokens become raw blocks. */
export function markdownToDocsValue(markdown: string, options: DocsBlockOptions = {}): DocsValue {
  const blocks: RichBlock[] = [];
  const richSource = markdown.replace(
    /^:::terra-docs ([A-Za-z]+)\s*\n([\s\S]*?)^:::\s*$/gm,
    (source, type: string, json: string) => {
      try {
        const data = JSON.parse(json) as RichBlock;
        if (data._type === type && enabledDocsBlocks(options).includes(type as never)) {
          const placeholder = `TERRADOCSBLOCK${blocks.length}PLACEHOLDER`;
          blocks.push({ ...data, _key: data._key ?? key() });
          return `\n\n${placeholder}\n\n`;
        }
      } catch {
        /* Preserve malformed source. */
      }
      const placeholder = `TERRADOCSBLOCK${blocks.length}PLACEHOLDER`;
      blocks.push({ _type: 'raw', _key: key(), markdown: source });
      return `\n\n${placeholder}\n\n`;
    },
  );
  const source = richSource.replace(
    /^(===|\|\|\|)\s*\[([^\]\n]+)\]\s*\n([\s\S]*?)^\1\s*$/gm,
    (_match, delimiter: string, title: string, body: string) => {
      const placeholder = `TERRADOCSBLOCK${blocks.length}PLACEHOLDER`;
      blocks.push({
        _type: delimiter === '===' ? 'accordion' : 'tabs',
        _key: key(),
        items: [{ title, markdown: body, content: [] }],
        markdown: _match,
      });
      return `\n\n${placeholder}\n\n`;
    },
  );
  const parsed = marked.lexer(source, { gfm: true }) as Token[];
  const result: RichBlock[] = [];
  for (const token of parsed) {
    if (token.type === 'space') continue;
    const marker = token.raw.trim().match(/^TERRADOCSBLOCK(\d+)PLACEHOLDER$/);
    if (marker) {
      const block = blocks[Number(marker[1])];
      if (block) result.push(block);
      continue;
    }
    if (token.type === 'heading') {
      result.push(
        textBlock(`h${Math.min(6, Math.max(2, token.depth ?? 2))}`, token.tokens, token.text ?? ''),
      );
      continue;
    }
    if (token.type === 'paragraph' && !/\n\s*\n/.test(token.raw)) {
      result.push(textBlock('normal', token.tokens, token.text ?? ''));
      continue;
    }
    if (token.type === 'blockquote') {
      result.push(textBlock('blockquote', token.tokens, token.text ?? ''));
      continue;
    }
    if (token.type === 'code') {
      result.push({
        _type: 'code',
        _key: key(),
        language: token.lang ?? '',
        value: token.text ?? '',
      });
      continue;
    }
    result.push({ _type: 'raw', _key: key(), markdown: token.raw });
  }
  return result as DocsValue;
}

/** Serialize supported visual blocks and keep every opaque raw token verbatim. */
export function docsValueToMarkdown(value: DocsValue): string {
  return (
    value
      .map((block) => {
        const item = block as RichBlock;
        const extra = Object.keys(item).some(
          (name) =>
            ![
              '_type',
              '_key',
              'markdown',
              'language',
              'source',
              'value',
              'items',
              'code',
              'inline',
            ].includes(name),
        );
        if (item._type === 'block') {
          const children = Array.isArray(item.children)
            ? (item.children as {
                _type?: string;
                text?: string;
                marks?: string[];
                code?: string;
              }[])
            : [];
          const content = children
            .map((child) => {
              if (child._type === 'math') return `$${child.code ?? ''}$`;
              let text = child.text ?? '';
              for (const mark of child.marks ?? []) {
                if (mark === 'strong') text = `**${text}**`;
                if (mark === 'em') text = `*${text}*`;
                if (mark === 'strike-through') text = `~~${text}~~`;
                if (mark === 'code') text = `\`${text}\``;
              }
              return text;
            })
            .join('');
          const style = String(item.style ?? 'normal');
          if (/^h[2-6]$/.test(style)) return `${'#'.repeat(Number(style[1]))} ${content}`;
          if (style === 'blockquote') return `> ${content}`;
          return content;
        }
        if (item._type === 'raw' && !extra) return String(item.markdown ?? '');
        if (item._type === 'code' && !extra)
          return `\`\`\`${String(item.language ?? '')}\n${String(item.value ?? '')}\n\`\`\``;
        if (item._type === 'accordion' || item._type === 'tabs') {
          if (item.markdown) return item.markdown;
          const delimiter = item._type === 'accordion' ? '===' : '|||';
          return (
            Array.isArray(item.items) ? (item.items as { title?: string; markdown?: string }[]) : []
          )
            .map(
              (entry) =>
                `${delimiter}[${entry.title ?? 'Item'}]\n${entry.markdown ?? ''}\n${delimiter}`,
            )
            .join('\n\n');
        }
        return `:::terra-docs ${item._type}\n${JSON.stringify(item)}\n:::`;
      })
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}
