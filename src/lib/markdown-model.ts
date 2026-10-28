import { marked } from 'marked';
import type { DocsValue } from '../components/Docs.js';
import type { RichBlock } from '../components/blocks.js';
import { enabledDocsBlocks } from '../components/blocks.js';
import type { DocsBlockOptions } from '../components/blocks.js';

const key = () => crypto.randomUUID();
type Token = {
  type: string;
  raw: string;
  text?: string;
  depth?: number;
  lang?: string;
  href?: string;
  title?: string | null;
  tokens?: Token[];
  header?: Token[];
  rows?: Token[][];
  items?: Token[];
  ordered?: boolean;
  task?: boolean;
  checked?: boolean;
  [name: string]: unknown;
};

function span(text: string, marks: string[] = []) {
  return { _type: 'span', _key: key(), text, marks };
}

function inline(
  tokens: Token[] | undefined,
  markDefs: { _type: 'link'; _key: string; href: string }[],
  inlineMath = true,
): (ReturnType<typeof span> | { _type: 'math'; _key: string; code: string; inline: true })[] {
  if (!tokens) return [];
  return tokens.flatMap((token) => {
    if (token.type === 'strong')
      return inline(token.tokens, markDefs, inlineMath).map((item) =>
        item._type === 'span' ? { ...item, marks: [...item.marks, 'strong'] } : item,
      );
    if (token.type === 'em')
      return inline(token.tokens, markDefs, inlineMath).map((item) =>
        item._type === 'span' ? { ...item, marks: [...item.marks, 'em'] } : item,
      );
    if (token.type === 'del')
      return inline(token.tokens, markDefs, inlineMath).map((item) =>
        item._type === 'span' ? { ...item, marks: [...item.marks, 'strike-through'] } : item,
      );
    if (token.type === 'link') {
      const href = typeof token.href === 'string' ? token.href : '';
      if (!href || !/^(?:https?:\/\/|mailto:|tel:|\/|\.\.?\/|#)/i.test(href))
        return [span(token.raw)];
      const mark = key();
      markDefs.push({ _type: 'link', _key: mark, href });
      return inline(token.tokens, markDefs, inlineMath).map((item) =>
        item._type === 'span' ? { ...item, marks: [...item.marks, mark] } : item,
      );
    }
    if (token.type === 'text' || token.type === 'escape') {
      const pieces = (token.text ?? token.raw).split(/(\$[^$\n]+\$)/g).filter(Boolean);
      return pieces.map((piece) =>
        inlineMath && /^\$[^$\n]+\$$/.test(piece)
          ? { _type: 'math', _key: key(), code: piece.slice(1, -1), inline: true }
          : span(piece),
      );
    }
    if (token.type === 'codespan') return [span(token.text ?? token.raw, ['code'])];
    if (token.type === 'br') return [span('\n')];
    // Images in the middle of prose have no Portable Text inline equivalent. Keep their source.
    return [span(token.raw)];
  });
}

function textBlock(
  style: string,
  tokens: Token[] | undefined,
  fallback: string,
  inlineMath = true,
) {
  const markDefs: { _type: 'link'; _key: string; href: string }[] = [];
  const children = inline(tokens, markDefs, inlineMath);
  return {
    _type: 'block',
    _key: key(),
    style,
    markDefs,
    children: children.length ? children : [span(fallback)],
  };
}

function paragraphTokens(tokens: Token[] | undefined): Token[] {
  if (!tokens) return [];
  return tokens.flatMap((token) =>
    (token.type === 'paragraph' || token.type === 'heading') && token.tokens
      ? paragraphTokens(token.tokens)
      : [token],
  );
}

function enabled(options: DocsBlockOptions, type: string): boolean {
  return enabledDocsBlocks(options).includes(type as never);
}

function richPlaceholder(blocks: RichBlock[], block: RichBlock): string {
  const placeholder = `TERRADOCSBLOCK${blocks.length}PLACEHOLDER`;
  blocks.push({ ...block, _key: block._key ?? key() });
  return `\n\n${placeholder}\n\n`;
}

function rawPlaceholder(blocks: RichBlock[], markdown: string): string {
  return richPlaceholder(blocks, { _type: 'raw', markdown });
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);?/g, (match, code: string) => {
      const point = Number(code);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    })
    .replace(/&#x([0-9a-f]+);?/gi, (match, code: string) => {
      const point = Number.parseInt(code, 16);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    })
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (_match, entity: string) => {
      const entities: Record<string, string> = {
        nbsp: ' ',
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        '#39': "'",
      };
      return entities[entity.toLowerCase()] ?? _match;
    });
}

function htmlAttribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decodeHtml(value);
}

/** Convert common inline HTML in a native table cell to Markdown before Portable Text parsing. */
function htmlToMarkdown(source: string, depth = 0): string {
  if (depth > 8) return decodeHtml(source.replace(/<[^>]*>/g, ''));
  return source
    .replace(/<br\b[^>]*\/?>/gi, '\n')
    .replace(/<img\b([^>]*)\/?>/gi, (_match, attrs: string) => {
      const alt = htmlAttribute(attrs, 'alt') ?? 'image';
      const src = htmlAttribute(attrs, 'src') ?? '';
      return `![${alt}](${src})`;
    })
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_match, attrs: string, body: string) => {
      const href = htmlAttribute(attrs, 'href');
      const text = htmlToMarkdown(body, depth + 1);
      return href ? `[${text}](${href})` : text;
    })
    .replace(
      /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,
      (_match, _tag, body: string) => `**${htmlToMarkdown(body, depth + 1)}**`,
    )
    .replace(
      /<(em|i)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,
      (_match, _tag, body: string) => `*${htmlToMarkdown(body, depth + 1)}*`,
    )
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code\s*>/gi, (_match, body: string) => {
      const code = decodeHtml(body.replace(/<[^>]*>/g, '')).replace(/`/g, '\\`');
      return `\`${code}\``;
    })
    .replace(/<\/p\s*>|<\/div\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);|&#\d+;?|&#x[0-9a-f]+;?/gi, decodeHtml)
    .trim();
}

function inlineTokensFromMarkdown(source: string): Token[] {
  const tokens = marked.lexer(source, { gfm: true }) as Token[];
  const paragraph = tokens.find((token) => token.type === 'paragraph');
  return paragraph?.tokens ?? (source ? [{ type: 'text', raw: source, text: source }] : []);
}

function tableCell(tokens: Token[], fallback: string, inlineMath: boolean) {
  const content = textBlock('normal', tokens, fallback, inlineMath);
  return { _type: 'cell', _key: key(), content: [content] };
}

function tableBlock(rows: Token[][], markdown: string, inlineMath: boolean): RichBlock | undefined {
  if (!rows.length) return undefined;
  return {
    _type: 'table',
    _key: key(),
    header: 'Table',
    markdown,
    rows: rows.map((cells) => ({
      _type: 'row',
      _key: key(),
      cells: cells.map((cell) =>
        tableCell(Array.isArray(cell.tokens) ? cell.tokens : [], cell.text ?? cell.raw, inlineMath),
      ),
    })),
  };
}

function htmlTableBlock(source: string, inlineMath: boolean): RichBlock | undefined {
  const table = source.match(/<table\b[^>]*>[\s\S]*?<\/table\s*>/i)?.[0];
  if (!table) return undefined;
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map((row) => {
    const cells = [...(row[1] ?? '').matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)\s*>/gi)];
    return cells.map((cell) => {
      const markdown = htmlToMarkdown(cell[1] ?? '');
      const tokens = inlineTokensFromMarkdown(markdown);
      return {
        type: 'text',
        raw: markdown,
        text: markdown,
        tokens,
      } satisfies Token;
    });
  });
  return tableBlock(rows, table, inlineMath);
}

function markdownList(token: Token, options: DocsBlockOptions, level = 1): RichBlock[] {
  const items = Array.isArray(token.items) ? token.items : [];
  const result: RichBlock[] = [];
  for (const item of items) {
    const itemTokens = Array.isArray(item.tokens) ? item.tokens : [];
    const bodyTokens: Token[] = [];
    const nestedLists: Token[] = [];
    for (const child of itemTokens) {
      if (child.type === 'list') {
        nestedLists.push(child);
        continue;
      }
      const childTokens =
        (child.type === 'text' || child.type === 'paragraph') && Array.isArray(child.tokens)
          ? child.tokens
          : [child];
      if (bodyTokens.length) bodyTokens.push({ type: 'text', raw: '\n', text: '\n' });
      bodyTokens.push(...childTokens);
    }
    const markDefs: { _type: 'link'; _key: string; href: string }[] = [];
    let children = inline(
      bodyTokens,
      markDefs,
      options.inlineMath !== false && options.math !== false,
    );
    if (item.task)
      children = [span(item.checked ? '[x] ' : '[ ] '), ...children] as typeof children;
    if (children.length) {
      result.push({
        _type: 'block',
        _key: key(),
        style: 'normal',
        listItem: token.ordered ? 'number' : 'bullet',
        level,
        markDefs,
        children,
      });
    } else {
      result.push({ _type: 'raw', _key: key(), markdown: item.raw });
    }
    for (const nested of nestedLists) result.push(...markdownList(nested, options, level + 1));
  }
  return result;
}

/** Decode Markdown without dropping unsupported syntax; opaque tokens become raw blocks. */
export function markdownToDocsValue(markdown: string, options: DocsBlockOptions = {}): DocsValue {
  const blocks: RichBlock[] = [];
  const inlineMath = options.inlineMath !== false && options.math !== false;
  const richSource = markdown.replace(
    /^:::terra-docs ([A-Za-z]+)\s*\n([\s\S]*?)^:::\s*$/gm,
    (source, type: string, json: string) => {
      try {
        const data = JSON.parse(json) as RichBlock;
        if (data._type === type && enabled(options, type)) return richPlaceholder(blocks, data);
      } catch {
        /* Preserve malformed source. */
      }
      return rawPlaceholder(blocks, source);
    },
  );
  const withAccordions = richSource.replace(
    /^(===|\|\|\|)\s*\[([^\]\n]+)\]\s*\n([\s\S]*?)^\1\s*$/gm,
    (source, delimiter: string, title: string, body: string) => {
      const type = delimiter === '===' ? 'accordion' : 'tabs';
      if (!enabled(options, type)) return rawPlaceholder(blocks, source);
      return richPlaceholder(blocks, {
        _type: type,
        items: [{ title, markdown: body, content: markdownToDocsValue(body, options) }],
      });
    },
  );
  const withCallouts = withAccordions.replace(
    /^:::(?!terra-docs(?:\s|$))([A-Za-z][\w-]*)(?:\[([^\]\n]*)\])?[ \t]*\n([\s\S]*?)^:::[ \t]*$/gm,
    (source, kind: string, title: string | undefined, body: string) => {
      if (!enabled(options, 'callout')) return rawPlaceholder(blocks, source);
      return richPlaceholder(blocks, {
        _type: 'callout',
        kind,
        title: title?.trim() || kind,
        content: markdownToDocsValue(body, options),
        markdown: body,
      });
    },
  );
  const source = withCallouts.replace(/^\$\$\s*\n([\s\S]*?)^\$\$\s*$/gm, (raw, code: string) =>
    enabled(options, 'math')
      ? richPlaceholder(blocks, { _type: 'math', code: code.trim(), inline: false, markdown: raw })
      : rawPlaceholder(blocks, raw),
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
      const depth = token.depth ?? 2;
      const style = depth === 1 ? 'normal' : `h${Math.min(6, depth)}`;
      result.push(textBlock(style, token.tokens, token.text ?? '', inlineMath));
      continue;
    }
    if (token.type === 'paragraph') {
      const image =
        token.tokens?.length === 1 && token.tokens[0]?.type === 'image'
          ? token.tokens[0]
          : undefined;
      if (image && enabled(options, 'docImage')) {
        result.push({
          _type: 'docImage',
          _key: key(),
          alt: image.text ?? '',
          url: image.href ?? '',
          ...(image.title ? { title: image.title } : {}),
          markdown: token.raw,
        });
        continue;
      }
      const displayMath = token.raw.trim().match(/^\$\$\s*([\s\S]*?)\s*\$\$$/);
      if (displayMath && enabled(options, 'math')) {
        result.push({
          _type: 'math',
          _key: key(),
          code: displayMath[1] ?? '',
          inline: false,
          markdown: token.raw,
        });
        continue;
      }
      result.push(textBlock('normal', token.tokens, token.text ?? '', inlineMath));
      continue;
    }
    if (token.type === 'blockquote') {
      result.push(
        textBlock('blockquote', paragraphTokens(token.tokens), token.text ?? '', inlineMath),
      );
      continue;
    }
    if (token.type === 'list') {
      result.push(...markdownList(token, options));
      continue;
    }
    if (token.type === 'table') {
      if (enabled(options, 'table')) {
        const rows = [token.header ?? [], ...(token.rows ?? [])];
        const table = tableBlock(rows, token.raw, inlineMath);
        if (table) {
          result.push(table);
          continue;
        }
      }
      result.push({ _type: 'raw', _key: key(), markdown: token.raw });
      continue;
    }
    if (token.type === 'html') {
      const table = enabled(options, 'table') ? htmlTableBlock(token.raw, inlineMath) : undefined;
      if (table) result.push(table);
      else result.push({ _type: 'raw', _key: key(), markdown: token.raw });
      continue;
    }
    if (token.type === 'code') {
      if (enabled(options, 'code'))
        result.push({
          _type: 'code',
          _key: key(),
          language: token.lang ?? '',
          value: token.text ?? '',
        });
      else result.push({ _type: 'raw', _key: key(), markdown: token.raw });
      continue;
    }
    result.push({ _type: 'raw', _key: key(), markdown: token.raw });
  }
  return result as DocsValue;
}

function blockContentToMarkdown(block: RichBlock): string {
  const markDefs = new Map(
    (Array.isArray(block.markDefs) ? block.markDefs : [])
      .filter(
        (mark): mark is { _key: string; _type: string; href: string } =>
          typeof mark === 'object' && mark !== null && '_key' in mark && 'href' in mark,
      )
      .map((mark) => [mark._key, mark.href]),
  );
  const children = Array.isArray(block.children)
    ? (block.children as { _type?: string; text?: string; marks?: string[]; code?: string }[])
    : [];
  return children
    .map((child) => {
      if (child._type === 'math') return `$${child.code ?? ''}$`;
      let text = child.text ?? '';
      for (const mark of child.marks ?? []) {
        if (mark === 'strong') text = `**${text}**`;
        if (mark === 'em') text = `*${text}*`;
        if (mark === 'strike-through') text = `~~${text}~~`;
        if (mark === 'code') text = `\`${text}\``;
        if (markDefs.has(mark)) text = `[${text}](${markDefs.get(mark)})`;
      }
      return text;
    })
    .join('');
}

function tableCellMarkdown(cell: unknown): string {
  if (!cell || typeof cell !== 'object') return '';
  const value = cell as Record<string, unknown>;
  if (typeof value.markdown === 'string' && value.markdown) return value.markdown;
  return Array.isArray(value.content) ? docsValueToMarkdown(value.content as DocsValue).trim() : '';
}

function tableToMarkdown(block: RichBlock): string {
  const rows = Array.isArray(block.rows) ? (block.rows as Record<string, unknown>[]) : [];
  if (!rows.length) return `:::terra-docs table\n${JSON.stringify(block)}\n:::`;
  const cells = rows.map((row) =>
    (Array.isArray(row.cells) ? row.cells : []).map((cell) =>
      tableCellMarkdown(cell).replace(/\|/g, '\\|').replace(/\n/g, '<br>'),
    ),
  );
  const width = Math.max(1, ...cells.map((row) => row.length));
  const padded = cells.map((row) => Array.from({ length: width }, (_cell, i) => row[i] ?? ''));
  const header = padded[0] ?? Array.from({ length: width }, () => '');
  const separator = Array.from({ length: width }, () => '---');
  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...padded.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function isListBlock(block: RichBlock): boolean {
  return block._type === 'block' && (block.listItem === 'bullet' || block.listItem === 'number');
}

function listToMarkdown(blocks: RichBlock[], start: number): { markdown: string; next: number } {
  const first = blocks[start]!;
  const kind = first.listItem;
  const lines: string[] = [];
  const ordinals = new Map<number, number>();
  let index = start;
  while (index < blocks.length && isListBlock(blocks[index]!) && blocks[index]!.listItem === kind) {
    const block = blocks[index]!;
    const level = Math.max(1, Number(block.level) || 1);
    for (const previousLevel of ordinals.keys())
      if (previousLevel > level) ordinals.delete(previousLevel);
    const ordinal = (ordinals.get(level) ?? 0) + 1;
    ordinals.set(level, ordinal);
    const marker = kind === 'number' ? `${ordinal}.` : '-';
    const indentation = '  '.repeat(level - 1);
    const content = blockContentToMarkdown(block).replace(/\n/g, `\n${indentation}  `);
    lines.push(`${indentation}${marker} ${content}`);
    index += 1;
  }
  return { markdown: lines.join('\n'), next: index };
}

function nestedMarkdown(block: Record<string, unknown>): string {
  if (typeof block.markdown === 'string' && block.markdown) return block.markdown;
  return Array.isArray(block.content)
    ? docsValueToMarkdown(block.content as DocsValue).trimEnd()
    : '';
}

/** Serialize supported visual blocks and keep every opaque raw token verbatim. */
export function docsValueToMarkdown(value: DocsValue): string {
  const blocks = value as unknown as RichBlock[];
  const result: string[] = [];
  for (let index = 0; index < blocks.length;) {
    const item = blocks[index]!;
    if (isListBlock(item)) {
      const list = listToMarkdown(blocks, index);
      result.push(list.markdown);
      index = list.next;
      continue;
    }
    index += 1;
    const knownFields: Record<string, string[]> = {
      raw: ['markdown'],
      code: ['markdown', 'language', 'source', 'value'],
      docImage: ['markdown', 'alt', 'url', 'title', 'width', 'height'],
      math: ['markdown', 'code', 'inline'],
      table: ['markdown', 'header', 'rows'],
      callout: ['markdown', 'kind', 'title', 'content'],
      accordion: ['markdown', 'items'],
      tabs: ['markdown', 'items'],
    };
    const extra = Object.keys(item).some(
      (name) => !['_type', '_key', ...(knownFields[item._type] ?? [])].includes(name),
    );
    // Terra persists editor paragraphs as `terraBlock`; the portable contract and
    // Markdown importer use `block`. Both represent the same rich text node.
    if (item._type === 'block' || item._type === 'terraBlock') {
      const content = blockContentToMarkdown(item);
      const style = String(item.style ?? 'normal');
      if (/^h[2-6]$/.test(style)) result.push(`${'#'.repeat(Number(style[1]))} ${content}`);
      else if (style === 'blockquote') result.push(`> ${content}`);
      else result.push(content);
      continue;
    }
    if (item._type === 'raw' && !extra) {
      result.push(String(item.markdown ?? ''));
      continue;
    }
    if (item._type === 'code' && !extra) {
      result.push(
        typeof item.markdown === 'string' && item.markdown
          ? item.markdown
          : `\`\`\`${String(item.language ?? '')}\n${String(item.value ?? '')}\n\`\`\``,
      );
      continue;
    }
    if (item._type === 'docImage' && !extra) {
      const alt = String(item.alt ?? '').replace(/\]/g, '\\]');
      const url = String(item.url ?? '').replace(/[()]/g, (char) => `\\${char}`);
      const title = item.title ? ` "${String(item.title).replace(/"/g, '\\"')}"` : '';
      result.push(`![${alt}](${url}${title})`);
      continue;
    }
    if (item._type === 'math' && !extra) {
      result.push(
        item.inline === true
          ? `$${String(item.code ?? '')}$`
          : `$$\n${String(item.code ?? '')}\n$$`,
      );
      continue;
    }
    if (item._type === 'table' && !extra) {
      result.push(tableToMarkdown(item));
      continue;
    }
    if (item._type === 'callout' && !extra) {
      const kind = String(item.kind ?? 'info');
      const title = String(item.title ?? kind);
      const content = nestedMarkdown(item).replace(/\n+$/, '');
      if (/^[A-Za-z][\w-]*$/.test(kind) && !/[\]\n]/.test(title) && !/^:::\s*$/m.test(content))
        result.push(`:::${kind}[${title}]\n${content}\n:::`);
      else result.push(`:::terra-docs callout\n${JSON.stringify(item)}\n:::`);
      continue;
    }
    if (item._type === 'accordion' || item._type === 'tabs') {
      if (item.markdown) {
        result.push(item.markdown);
        continue;
      }
      const delimiter = item._type === 'accordion' ? '===' : '|||';
      result.push(
        (Array.isArray(item.items) ? (item.items as Record<string, unknown>[]) : [])
          .map((entry) => {
            const content = nestedMarkdown(entry).replace(/\n+$/, '');
            return `${delimiter} [${String(entry.title ?? 'Item')}]\n${content}\n${delimiter}`;
          })
          .join('\n\n'),
      );
      continue;
    }
    result.push(`:::terra-docs ${item._type}\n${JSON.stringify(item)}\n:::`);
  }
  return (
    result
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}
