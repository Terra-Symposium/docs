import { marked } from 'marked';
import type { DocsValue } from '../components/Docs.js';
import type { RichBlock } from '../components/blocks.js';
import { enabledDocsBlocks } from '../components/blocks.js';
import type { DocsBlockOptions } from '../components/blocks.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

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

function encodeInlineMathPlaceholder(code: string): string {
  const hex = Array.from(code, (character) =>
    (character.codePointAt(0) ?? 0).toString(16).padStart(6, '0'),
  ).join('');
  return `TERRADOCSMATH${hex}END`;
}

function decodeInlineMathPlaceholder(value: string): string | undefined {
  const match = value.match(/^TERRADOCSMATH([0-9a-f]+)END$/i);
  if (!match || match[1]!.length % 6 !== 0) return undefined;
  const codepoints: number[] = [];
  for (let offset = 0; offset < match[1]!.length; offset += 6) {
    const codepoint = Number.parseInt(match[1]!.slice(offset, offset + 6), 16);
    if (codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff)) return undefined;
    codepoints.push(codepoint);
  }
  return String.fromCodePoint(...codepoints);
}

function restoreInlineMathPlaceholders(value: string): string {
  return value.replace(/TERRADOCSMATH[0-9a-f]+END/gi, (placeholder) => {
    const code = decodeInlineMathPlaceholder(placeholder);
    return code === undefined ? placeholder : `$${code}$`;
  });
}

function withGeneratedInlineMathTokens(tokens: Token[] | undefined): Token[] {
  const result: Token[] = [];
  for (const token of tokens ?? []) {
    if (!['text', 'escape'].includes(token.type)) {
      result.push(token);
      continue;
    }
    const matches = [...token.raw.matchAll(/TERRADOCSMATH[0-9a-f]+END/gi)];
    if (!matches.length) {
      result.push(token);
      continue;
    }
    let cursor = 0;
    for (const match of matches) {
      const start = match.index ?? 0;
      if (start > cursor) {
        const raw = token.raw.slice(cursor, start);
        const text = token.text ?? token.raw;
        result.push({
          ...token,
          raw,
          text: text.length === token.raw.length ? text.slice(cursor, start) : raw,
        });
      }
      const code = decodeInlineMathPlaceholder(match[0]);
      result.push(
        code === undefined
          ? { ...token, raw: match[0], text: match[0] }
          : { type: 'docsMath', raw: match[0], text: code },
      );
      cursor = start + match[0].length;
    }
    if (cursor < token.raw.length) {
      const raw = token.raw.slice(cursor);
      const text = token.text ?? token.raw;
      result.push({
        ...token,
        raw,
        text: text.length === token.raw.length ? text.slice(cursor) : raw,
      });
    }
  }
  return result;
}

function span(text: string, marks: string[] = []) {
  return { _type: 'span', _key: key(), text, marks };
}

function withInlineMathTokens(tokens: Token[] | undefined, inlineMath: boolean): Token[] {
  if (!tokens || !inlineMath) return tokens ?? [];
  const result: Token[] = [];
  for (let index = 0; index < tokens.length;) {
    if (!['text', 'escape'].includes(tokens[index]!.type)) {
      result.push(tokens[index]!);
      index += 1;
      continue;
    }

    const run: Token[] = [];
    while (index < tokens.length && ['text', 'escape'].includes(tokens[index]!.type)) {
      run.push(tokens[index]!);
      index += 1;
    }
    const source = run.map((token) => token.raw).join('');
    const matches = [...source.matchAll(/(?<!\\)\$([^$\n]+)\$/g)];
    if (!matches.length) {
      result.push(...run);
      continue;
    }

    const appendSourceRange = (start: number, end: number) => {
      let offset = 0;
      for (const token of run) {
        const tokenStart = offset;
        const tokenEnd = tokenStart + token.raw.length;
        offset = tokenEnd;
        const from = Math.max(start, tokenStart);
        const to = Math.min(end, tokenEnd);
        if (from >= to) continue;
        if (from === tokenStart && to === tokenEnd) {
          result.push(token);
          continue;
        }
        const localStart = from - tokenStart;
        const localEnd = to - tokenStart;
        const raw = token.raw.slice(localStart, localEnd);
        const text = token.text ?? token.raw;
        result.push({
          ...token,
          raw,
          text: text.length === token.raw.length ? text.slice(localStart, localEnd) : raw,
        });
      }
    };

    let cursor = 0;
    for (const match of matches) {
      const start = match.index ?? 0;
      const raw = match[0];
      appendSourceRange(cursor, start);
      result.push({ type: 'docsMath', raw, text: match[1] ?? '' });
      cursor = start + raw.length;
    }
    appendSourceRange(cursor, source.length);
  }
  return result;
}

function inline(
  tokens: Token[] | undefined,
  markDefs: { _type: 'link'; _key: string; href: string }[],
  inlineMath = true,
  inheritedMarks: string[] = [],
): (ReturnType<typeof span> | { _type: 'math'; _key: string; code: string; inline: true })[] {
  if (!tokens) return [];
  let activeMarks = [...inheritedMarks];
  const result: (
    ReturnType<typeof span> | { _type: 'math'; _key: string; code: string; inline: true }
  )[] = [];
  const addMark = (items: typeof result, mark: string) =>
    items.map((item) => (item._type === 'span' ? { ...item, marks: [...item.marks, mark] } : item));

  for (const token of withInlineMathTokens(
    inlineMath ? withGeneratedInlineMathTokens(tokens) : tokens,
    inlineMath,
  )) {
    if (token.type === 'docsMath') {
      result.push({ _type: 'math', _key: key(), code: token.text ?? '', inline: true });
      continue;
    }
    if (token.type === 'html') {
      const tag = token.raw.match(/^<(\/)?(u|ins|s|del|strike|em|i|strong|b|code)\s*>$/i);
      if (tag) {
        const mark = /^code$/i.test(tag[2]!)
          ? 'code'
          : /^(?:u|ins)$/i.test(tag[2]!)
            ? 'underline'
            : /^(?:em|i)$/i.test(tag[2]!)
              ? 'em'
              : /^(?:strong|b)$/i.test(tag[2]!)
                ? 'strong'
                : 'strike-through';
        if (tag[1]) activeMarks = activeMarks.filter((item) => item !== mark);
        else activeMarks = [...activeMarks, mark];
        continue;
      }
      if (/^<br\s*\/?>$/i.test(token.raw)) {
        result.push(span('\n', activeMarks));
        continue;
      }
      result.push(span(token.raw, activeMarks));
      continue;
    }
    if (token.type === 'strong') {
      result.push(...addMark(inline(token.tokens, markDefs, inlineMath, activeMarks), 'strong'));
      continue;
    }
    if (token.type === 'em') {
      result.push(...addMark(inline(token.tokens, markDefs, inlineMath, activeMarks), 'em'));
      continue;
    }
    if (token.type === 'del') {
      result.push(
        ...addMark(inline(token.tokens, markDefs, inlineMath, activeMarks), 'strike-through'),
      );
      continue;
    }
    if (token.type === 'link') {
      const href = typeof token.href === 'string' ? token.href : '';
      if (!href || !/^(?:https?:\/\/|mailto:|tel:|\/|\.\.?\/|#)/i.test(href)) {
        result.push(span(token.raw, activeMarks));
        continue;
      }
      const mark = key();
      markDefs.push({ _type: 'link', _key: mark, href });
      const linked = addMark(inline(token.tokens, markDefs, inlineMath, activeMarks), mark);
      const joined: typeof result = [];
      for (const item of linked) {
        const previous = joined.at(-1);
        if (
          item._type === 'span' &&
          previous?._type === 'span' &&
          JSON.stringify(item.marks) === JSON.stringify(previous.marks)
        )
          previous.text += item.text;
        else joined.push(item);
      }
      result.push(...joined);
      continue;
    }
    if (token.type === 'text' || token.type === 'escape') {
      const tokenText = token.text ?? token.raw;
      if (activeMarks.includes('code')) {
        result.push(span(decodeHtml(tokenText), activeMarks));
        continue;
      }
      const pieces = tokenText.split(/(\$[^$\n]+\$)/g).filter(Boolean);
      result.push(
        ...pieces.map((piece) =>
          inlineMath && /^\$[^$\n]+\$$/.test(piece)
            ? {
                _type: 'math' as const,
                _key: key(),
                code: piece.slice(1, -1),
                inline: true as const,
              }
            : span(piece, activeMarks),
        ),
      );
      continue;
    }
    if (token.type === 'codespan') {
      result.push(span(token.text ?? token.raw, [...activeMarks, 'code']));
      continue;
    }
    if (token.type === 'br') {
      result.push(span('\n', activeMarks));
      continue;
    }
    // Images in the middle of prose have no Portable Text inline equivalent. Keep their source.
    result.push(span(token.raw, activeMarks));
  }
  return result;
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

function containsUnsupportedInlineHtml(tokens: Token[] | undefined): boolean {
  return Boolean(
    tokens?.some((token) => {
      if (token.type === 'html') {
        return (
          !/^<\/?(?:u|ins|s|del|strike|em|i|strong|b|code)\s*>$/i.test(token.raw) &&
          !/^<br\s*\/?>$/i.test(token.raw)
        );
      }
      return containsUnsupportedInlineHtml(token.tokens);
    }),
  );
}

function enabled(options: DocsBlockOptions, type: string): boolean {
  // Imported Terra Portable Text paragraphs are part of the document model itself,
  // not optional rich blocks. Canonical JSON directives let local hosts retain
  // their marks and inline objects without a lossy Markdown round trip.
  if (type === 'block' || type === 'terraBlock') return true;
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

type SourceRange = { start: number; end: number };
type JsxOpeningTag = {
  name: string;
  attributes: Record<string, unknown>;
  end: number;
  selfClosing: boolean;
};
type JsxComponentRange = { bodyEnd: number; end: number };

function codeFenceRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  let open: { start: number; char: string; length: number } | undefined;
  let index = 0;
  while (index < source.length) {
    const lineStart = index === 0 || source[index - 1] === '\n';
    if (lineStart && !open) {
      const newline = source.indexOf('\n', index);
      const end = newline === -1 ? source.length : newline + 1;
      const line = source.slice(index, end).replace(/\r?\n$/, '');
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (marker) {
        const fence = marker[1]!;
        open = { start: index, char: fence[0]!, length: fence.length };
        index = end;
        continue;
      }
    } else if (lineStart && open) {
      const newline = source.indexOf('\n', index);
      const end = newline === -1 ? source.length : newline + 1;
      const line = source.slice(index, end).replace(/\r?\n$/, '');
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (marker && marker[1]![0] === open.char && marker[1]!.length >= open.length) {
        ranges.push({ start: open.start, end });
        open = undefined;
      }
      index = end;
      continue;
    }

    // The original Docs serializer embeds code in a template literal. Fences inside that literal
    // are code content, so treat the whole component as opaque while locating Markdown fences.
    if (!open && source[index] === '<') {
      const opening = readJsxOpeningTag(source, index);
      if (opening?.name === 'Code') {
        index = jsxComponentEnd(source, opening);
        continue;
      }
    }

    // Ignore component-looking text inside inline Markdown code spans.
    if (!open && source[index] === '`' && source[index - 1] !== '\\') {
      const marker = source.slice(index).match(/^`+/)?.[0];
      if (marker) {
        const close = source.indexOf(marker, index + marker.length);
        if (close !== -1) {
          index = close + marker.length;
          continue;
        }
      }
    }
    index += 1;
  }
  if (open) ranges.push({ start: open.start, end: source.length });
  return ranges;
}

function protectMarkdownInlineMath(source: string, inlineMath: boolean): string {
  if (!inlineMath) return source;
  const fences = codeFenceRanges(source);
  let fenceIndex = 0;
  let output = '';
  let cursor = 0;
  let index = 0;
  while (index < source.length) {
    while (fenceIndex < fences.length && index >= fences[fenceIndex]!.end) fenceIndex += 1;
    const fence = fences[fenceIndex];
    if (fence && index >= fence.start && index < fence.end) {
      index = fence.end;
      continue;
    }

    if (source[index] === '`' && source[index - 1] !== '\\') {
      const marker = source.slice(index).match(/^`+/)?.[0];
      const end = marker ? source.indexOf(marker, index + marker.length) : -1;
      if (marker && end !== -1) {
        index = end + marker.length;
        continue;
      }
    }

    if (source[index] !== '$' || source[index - 1] === '\\') {
      index += 1;
      continue;
    }
    if (source[index + 1] === '$') {
      const end = source.indexOf('$$', index + 2);
      if (end !== -1) {
        index = end + 2;
        continue;
      }
      index += 2;
      continue;
    }

    let end = index + 1;
    while (end < source.length && source[end] !== '\n') {
      if (source[end] === '$' && source[end - 1] !== '\\' && source[end + 1] !== '$') break;
      end += 1;
    }
    if (end >= source.length || source[end] !== '$' || end === index + 1) {
      index += 1;
      continue;
    }

    output +=
      source.slice(cursor, index) + encodeInlineMathPlaceholder(source.slice(index + 1, end));
    index = end + 1;
    cursor = index;
  }
  return output + source.slice(cursor);
}

function structuredBlockRanges(source: string): SourceRange[] {
  const ranges = [
    ...source.matchAll(/^(:{3,})terra-docs [A-Za-z]+(?:\[[^\]\n]*\])?\s*\r?\n[\s\S]*?^\1\s*$/gm),
    ...source.matchAll(/^(:{4,})terra-docs (?:accordion|tabs)\s*\r?\n[\s\S]*?^\1\s*$/gm),
  ];
  return ranges
    .map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }))
    .sort((a, b) => a.start - b.start);
}
function readBracedExpression(
  source: string,
  start: number,
): { value: string; end: number } | undefined {
  if (source[start] !== '{') return undefined;
  let depth = 1;
  let quote: '"' | "'" | '`' | undefined;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return { value: source.slice(start + 1, index), end: index + 1 };
    }
  }
  return undefined;
}

function readJsxTagEnd(source: string, start: number): number | undefined {
  let quote: '"' | "'" | '`' | undefined;
  let expressionDepth = 0;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') expressionDepth += 1;
    else if (char === '}' && expressionDepth > 0) expressionDepth -= 1;
    else if (char === '>' && expressionDepth === 0) return index + 1;
  }
  return undefined;
}

function decodeTemplateLiteral(source: string): string {
  return source.replace(/\\([\\`$])/g, '$1');
}

function parseJsxLiteral(source: string): unknown {
  const value = source.trim();
  if (!value) return '';
  if (value.startsWith('`') && value.endsWith('`'))
    return decodeTemplateLiteral(value.slice(1, -1));
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return decodeHtml(JSON.parse(value) as string);
    } catch {
      return decodeHtml(value.slice(1, -1));
    }
  }
  if (value.startsWith("'") && value.endsWith("'"))
    return decodeHtml(value.slice(1, -1).replace(/\\([\\'"`])/g, '$1'));
  if (/^(?:true|false|null)$/.test(value)) return JSON.parse(value) as unknown;
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return Number(value);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseJsxAttributes(source: string): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? '')) index += 1;
    const name = source.slice(index).match(/^[A-Za-z_$][\w$:-]*/)?.[0];
    if (!name) {
      index += 1;
      continue;
    }
    index += name.length;
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (source[index] !== '=') {
      attributes[name] = true;
      continue;
    }
    index += 1;
    while (/\s/.test(source[index] ?? '')) index += 1;
    const quote = source[index];
    if (quote === '"' || quote === "'") {
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      attributes[name] = parseJsxLiteral(source.slice(start, index));
      continue;
    }
    if (source[index] === '{') {
      const expression = readBracedExpression(source, index);
      if (!expression) break;
      attributes[name] = parseJsxLiteral(expression.value);
      index = expression.end;
      continue;
    }
    const bare = source.slice(index).match(/^[^\s/>]+/)?.[0];
    if (!bare) {
      index += 1;
      continue;
    }
    attributes[name] = parseJsxLiteral(bare);
    index += bare.length;
  }
  return attributes;
}

function readJsxOpeningTag(source: string, start: number): JsxOpeningTag | undefined {
  if (source[start] !== '<') return undefined;
  const name = source.slice(start + 1).match(/^([A-Z][A-Za-z0-9_]*)\b/)?.[1];
  if (!name) return undefined;
  const nameEnd = start + name.length + 1;
  const end = readJsxTagEnd(source, start);
  if (!end) return undefined;
  const shell = source.slice(nameEnd, end - 1);
  const selfClosing = /\/\s*$/.test(shell);
  return {
    name,
    attributes: parseJsxAttributes(shell.replace(/\/\s*$/, '')),
    end,
    selfClosing,
  };
}

function codeBodyExpression(
  source: string,
  start: number,
): { value: string; end: number } | undefined {
  const first = source.slice(start).match(/^\s*\{/);
  if (!first) return undefined;
  const expressionStart = start + first[0].length - 1;
  const body = source.slice(expressionStart + 1).match(/^\s*`/);
  return body ? readBracedExpression(source, expressionStart) : undefined;
}

function jsxComponentEnd(source: string, opening: JsxOpeningTag): number {
  return jsxComponentRange(source, opening)?.end ?? source.length;
}

function jsxComponentRange(source: string, opening: JsxOpeningTag): JsxComponentRange | undefined {
  if (opening.selfClosing) return { bodyEnd: opening.end, end: opening.end };
  const expression = opening.name === 'Code' ? codeBodyExpression(source, opening.end) : undefined;
  const closePattern = new RegExp(`<\\/${opening.name}\\s*>`, 'g');
  closePattern.lastIndex = expression?.end ?? opening.end;
  const close = closePattern.exec(source);
  if (opening.name === 'Code') {
    // Older exported leaves can omit an end tag before the next Code block. Treat that next
    // opening tag as the boundary instead of swallowing every following code sample.
    const nextOpening = source.indexOf('<Code', expression?.end ?? opening.end);
    if (nextOpening !== -1 && (!close || nextOpening < close.index))
      return { bodyEnd: nextOpening, end: nextOpening };
  }
  return close ? { bodyEnd: close.index, end: close.index + close[0].length } : undefined;
}

function parseArrayAttribute(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function componentBlock(
  name: string,
  attributes: Record<string, unknown>,
  body: string,
): RichBlock | undefined {
  const expression = codeBodyExpression(body, 0);
  const bodyValue = expression ? parseJsxLiteral(expression.value) : decodeHtml(body.trim());
  if (name === 'Nodes') {
    const nodes = parseArrayAttribute(attributes.nodes);
    const edges = parseArrayAttribute(attributes.edges);
    if (('nodes' in attributes && !nodes) || ('edges' in attributes && !edges)) return undefined;
    return {
      _type: 'nodes',
      _key: key(),
      ...attributes,
      nodes: Array.isArray(nodes) ? nodes : [],
      edges: Array.isArray(edges) ? edges : [],
    };
  }
  if (name === 'Code') {
    const language = typeof attributes.language === 'string' ? attributes.language : '';
    const source = typeof attributes.source === 'string' ? attributes.source : undefined;
    const codeAttribute = typeof attributes.code === 'string' ? attributes.code : undefined;
    const value =
      typeof bodyValue === 'string'
        ? bodyValue.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
        : (codeAttribute ?? '');
    return {
      _type: 'code',
      _key: key(),
      language,
      ...(source ? { source } : {}),
      value: value || codeAttribute || '',
    };
  }
  if (name === 'Embed')
    return {
      _type: 'embed',
      _key: key(),
      ...attributes,
      src: typeof attributes.src === 'string' ? attributes.src : '',
      title: typeof attributes.title === 'string' ? attributes.title : '',
    };
  if (name === 'TsDocs')
    return {
      _type: 'tsDocs',
      _key: key(),
      ...attributes,
      scope: typeof attributes.scope === 'string' ? attributes.scope : '',
    };
  return undefined;
}

function inHtmlTable(source: string, index: number): boolean {
  const before = source.slice(0, index).toLowerCase();
  return before.lastIndexOf('<table') > before.lastIndexOf('</table');
}

function transformCanonicalComponents(
  source: string,
  options: DocsBlockOptions,
  blocks: RichBlock[],
): string {
  const recognized = new Set(['Nodes', 'Code', 'Embed', 'TsDocs']);
  const fences = codeFenceRanges(source);
  const structured = structuredBlockRanges(source);
  let fenceIndex = 0;
  let structuredIndex = 0;
  let output = '';
  let copiedUntil = 0;
  for (let index = 0; index < source.length; index += 1) {
    while (fenceIndex < fences.length && index >= fences[fenceIndex]!.end) fenceIndex += 1;
    const fence = fences[fenceIndex];
    if (fence && index >= fence.start && index < fence.end) {
      index = fence.end - 1;
      continue;
    }
    while (structuredIndex < structured.length && index >= structured[structuredIndex]!.end)
      structuredIndex += 1;
    const block = structured[structuredIndex];
    if (block && index >= block.start && index < block.end) {
      index = block.end - 1;
      continue;
    }
    if (source[index] === '`' && source[index - 1] !== '\\') {
      const marker = source.slice(index).match(/^`+/)?.[0];
      if (marker) {
        const close = source.indexOf(marker, index + marker.length);
        if (close !== -1) {
          index = close + marker.length - 1;
          continue;
        }
      }
    }
    if (source[index] !== '<') continue;
    const opening = readJsxOpeningTag(source, index);
    if (!opening || !recognized.has(opening.name)) continue;
    const component = jsxComponentRange(source, opening);
    if (!component) continue;
    const { end, bodyEnd } = component;
    const body = opening.selfClosing ? '' : source.slice(opening.end, bodyEnd);
    const isTableCode = opening.name === 'Code' && inHtmlTable(source, index);
    const type =
      opening.name === 'Nodes'
        ? 'nodes'
        : opening.name === 'Code'
          ? 'code'
          : opening.name === 'Embed'
            ? 'embed'
            : 'tsDocs';
    const parsed = componentBlock(opening.name, opening.attributes, body);
    if (!parsed) {
      output += source.slice(copiedUntil, index) + rawPlaceholder(blocks, source.slice(index, end));
      copiedUntil = end;
      index = end - 1;
      continue;
    }
    if (isTableCode) {
      const value = String(parsed.value ?? parsed.source ?? '');
      output +=
        source.slice(copiedUntil, index) +
        `<code>${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;
    } else {
      const replacement = enabled(options, type)
        ? richPlaceholder(blocks, parsed)
        : rawPlaceholder(blocks, source.slice(index, end));
      output += source.slice(copiedUntil, index) + replacement;
    }
    copiedUntil = end;
    index = end - 1;
  }
  return output ? output + source.slice(copiedUntil) : source;
}

function transformCallouts(
  source: string,
  options: DocsBlockOptions,
  blocks: RichBlock[],
  parse: (markdown: string) => DocsValue,
): string {
  type OpenCallout = {
    start: number;
    bodyStart: number;
    closeStart?: number;
    fenceLength: number;
    kind: string;
    title?: string;
  };
  const stack: OpenCallout[] = [];
  const ranges: (OpenCallout & { end: number })[] = [];
  const fences = codeFenceRanges(source);
  let fenceIndex = 0;
  let offset = 0;
  while (offset < source.length) {
    const newline = source.indexOf('\n', offset);
    const end = newline === -1 ? source.length : newline + 1;
    const line = source.slice(offset, end).replace(/\r?\n$/, '');
    while (fenceIndex < fences.length && offset >= fences[fenceIndex]!.end) fenceIndex += 1;
    const fence = fences[fenceIndex];
    if (fence && offset >= fence.start && offset < fence.end) {
      offset = end;
      continue;
    }
    const open = line.match(
      /^\s*(:{3,})(?!terra-docs(?:\s|$))([A-Za-z][\w-]*)(?:\[([^\]\n]*)\])?\s*$/,
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
      const closing = line.match(/^\s*(:{3,})\s*$/);
      const current = stack.at(-1);
      if (closing && current?.fenceLength === closing[1]!.length) {
        const closed = stack.pop();
        if (closed && stack.length === 0) ranges.push({ ...closed, closeStart: offset, end });
      }
    }
    offset = end;
  }
  for (const range of ranges.reverse()) {
    const raw = source.slice(range.start, range.end);
    const body =
      range.closeStart === undefined
        ? ''
        : source.slice(range.bodyStart, range.closeStart).trimEnd();
    const content = parse(body);
    const replacement = enabled(options, 'callout')
      ? richPlaceholder(blocks, {
          _type: 'callout',
          kind: range.kind,
          title: range.title || range.kind,
          content,
          ...(/TERRADOCSBLOCK\d+PLACEHOLDER/.test(body) ? {} : { markdown: body }),
        })
      : rawPlaceholder(blocks, raw);
    source = source.slice(0, range.start) + replacement + source.slice(range.end);
  }
  return source;
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

function decodeHtmlRepeated(value: string): string {
  let current = value;
  for (let pass = 0; pass < 8; pass += 1) {
    const decoded = decodeHtml(current);
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

function htmlAttribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decodeHtml(value);
}

function escapeMarkdownText(value: string): string {
  return decodeHtmlRepeated(value).replace(
    /(\$[^$\n]+\$)|([\\`*_{}\x5B\x5D#<>!$])/g,
    (_match, math: string | undefined, character: string | undefined) => math ?? `\\${character}`,
  );
}

function markdownCodeSpan(value: string): string {
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map(([ticks]) => ticks.length));
  const fence = '`'.repeat(longest + 1);
  const padding = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${fence}${padding}${value}${padding}${fence}`;
}

function htmlCodeText(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '`': '&#96;',
    '*': '&#42;',
    _: '&#95;',
    '[': '&#91;',
    ']': '&#93;',
    '\\': '&#92;',
    '!': '&#33;',
    $: '&#36;',
    '|': '&#124;',
    '~': '&#126;',
    '\r': '&#13;',
    '\n': '&#10;',
  };
  return value.replace(/[&<>`*_\x5B\x5D\\!$|~\r\n]/g, (character) => entities[character]!);
}

function markdownDestination(value: string): string {
  const destination = decodeHtmlRepeated(value).replace(/[>\s]/g, (character) =>
    character === '>' ? '%3E' : '%20',
  );
  return /[()[\]<>]/.test(destination) ? '<' + destination + '>' : destination;
}

/** Convert HTML table cells without letting ordinary underscores become Markdown emphasis. */
function escapeHtmlTableText(value: string, inlineMath: boolean): string {
  const decoded = decodeHtmlRepeated(value);
  if (!inlineMath) return escapeMarkdownText(decoded);
  const matches = [...decoded.matchAll(/(?<!\\)\$([^$\n]+)\$/g)];
  if (!matches.length) return escapeMarkdownText(decoded);

  let output = '';
  let cursor = 0;
  for (const match of matches) {
    const start = match.index ?? 0;
    const code = match[1] ?? '';
    output += escapeMarkdownText(decoded.slice(cursor, start)) + encodeInlineMathPlaceholder(code);
    cursor = start + match[0].length;
  }
  return output + escapeMarkdownText(decoded.slice(cursor));
}

function htmlToMarkdown(source: string, inlineMath: boolean): string {
  type OpenTag = { name: string; close: string };
  const stack: OpenTag[] = [];
  const tagPattern = /<!--[\s\S]*?-->|<\/?([A-Za-z][A-Za-z0-9:-]*)\b([^>]*?)>/g;
  let output = '';
  let copiedUntil = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source))) {
    const index = match.index ?? 0;
    const raw = match[0];
    const name = match[1]?.toLowerCase();
    if (!name) {
      output += escapeHtmlTableText(source.slice(copiedUntil, index), inlineMath);
      copiedUntil = index + raw.length;
      continue;
    }
    const closing = /^<\//.test(raw);
    const selfClosing = /\/\s*>$/.test(raw);
    const attributes = match[2] ?? '';
    output += escapeHtmlTableText(source.slice(copiedUntil, index), inlineMath);
    copiedUntil = tagPattern.lastIndex;

    if (closing) {
      const openIndex = stack.map((tag) => tag.name).lastIndexOf(name);
      if (openIndex >= 0) {
        for (let position = stack.length - 1; position >= openIndex; position -= 1)
          output += stack.pop()!.close;
      }
      continue;
    }

    if (name === 'br') {
      output += '\n';
      continue;
    }
    if (name === 'img') {
      const alt = htmlAttribute(attributes, 'alt') ?? 'image';
      const src = htmlAttribute(attributes, 'src') ?? '';
      const title = htmlAttribute(attributes, 'title');
      const escapedTitle = title?.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      output += src
        ? `![${escapeMarkdownText(alt)}](${markdownDestination(src)}${escapedTitle ? ` "${escapedTitle}"` : ''})`
        : escapeMarkdownText(alt);
      continue;
    }

    if (name === 'code') {
      // Code content is opaque; preserve punctuation and decode the deeply escaped export text.
      const closeTag = /<\/code\s*>/gi;
      closeTag.lastIndex = copiedUntil;
      const close = closeTag.exec(source);
      if (close) {
        output += markdownCodeSpan(decodeHtmlRepeated(source.slice(copiedUntil, close.index)));
        copiedUntil = closeTag.lastIndex;
        tagPattern.lastIndex = copiedUntil;
      } else output += escapeMarkdownText(raw);
      continue;
    }

    let open = '';
    let close = '';
    if (name === 'a') {
      const href = htmlAttribute(attributes, 'href');
      if (href) [open, close] = ['[', `](${markdownDestination(href)})`];
    } else if (name === 'strong' || name === 'b') [open, close] = ['**', '**'];
    else if (name === 'em' || name === 'i') [open, close] = ['*', '*'];
    else if (name === 's' || name === 'del' || name === 'strike') [open, close] = ['~~', '~~'];
    else if (name === 'p' || name === 'div') [open, close] = ['\n\n', '\n\n'];
    else if (name === 'li') [open, close] = ['\n- ', '\n'];
    else if (name === 'pre') [open, close] = ['\n\n```\n', '\n```\n\n'];

    output += open;
    if (open && !selfClosing) stack.push({ name, close });
    else if ((name === 'p' || name === 'div' || name === 'li' || name === 'pre') && !selfClosing)
      stack.push({ name, close });
  }
  output += escapeHtmlTableText(source.slice(copiedUntil), inlineMath);
  while (stack.length) output += stack.pop()!.close;
  return output.replace(/\n{3,}/g, '\n\n').trim();
}

function tableCell(tokens: Token[], fallback: string, options: DocsBlockOptions) {
  const contentTokens: Token[][] = [[]];
  for (const token of tokens) {
    if (token.type === 'html' && /^<br\s+data-docs-paragraph-break\s*\/?>$/i.test(token.raw)) {
      contentTokens.push([]);
    } else {
      contentTokens.at(-1)!.push(token);
    }
  }
  const inlineMath = options.inlineMath !== false && options.math !== false;
  const content = contentTokens.flatMap((part) => {
    const result: RichBlock[] = [];
    let pending: Token[] = [];
    const flush = () => {
      if (!pending.length) return;
      const text = pending.map((token) => token.text ?? token.raw).join('');
      result.push(textBlock('normal', pending, text, inlineMath));
      pending = [];
    };

    for (const token of part) {
      if (token.type === 'image' && enabled(options, 'docImage')) {
        flush();
        result.push({
          _type: 'docImage',
          _key: key(),
          alt: token.text ?? '',
          url: token.href ?? '',
          ...(token.title ? { title: token.title } : {}),
          markdown: token.raw,
        });
      } else {
        // Keep an opted-out image as literal Markdown instead of dropping it.
        pending.push(token);
      }
    }
    flush();

    if (!result.length) {
      const text = part.map((token) => token.text ?? token.raw).join('') || fallback;
      result.push(textBlock('normal', part, text, inlineMath));
    }
    return result;
  });
  return { _type: 'cell', _key: key(), content };
}

function tableBlock(
  rows: Token[][],
  markdown: string,
  options: DocsBlockOptions,
  header = 'Table',
): RichBlock | undefined {
  if (!rows.length) return undefined;
  return {
    _type: 'table',
    _key: key(),
    header,
    markdown: restoreInlineMathPlaceholders(markdown),
    rows: rows.map((cells) => ({
      _type: 'row',
      _key: key(),
      cells: cells.map((cell) =>
        tableCell(Array.isArray(cell.tokens) ? cell.tokens : [], cell.text ?? cell.raw, options),
      ),
    })),
  };
}

function markdownImagesAsBlocks(
  source: string,
  options: DocsBlockOptions,
  blocks: RichBlock[],
): string {
  if (!enabled(options, 'docImage')) return source;
  const images: Token[] = [];
  const visit = (tokens: Token[] | undefined, insideLink = false) => {
    for (const token of tokens ?? []) {
      if (token.type === 'image' && !insideLink) images.push(token);
      else if (token.tokens) visit(token.tokens, insideLink || token.type === 'link');
    }
  };
  visit(marked.lexer(source, { gfm: true }) as Token[]);

  let result = source;
  let cursor = 0;
  for (const image of images) {
    const raw = image.raw;
    const index = result.indexOf(raw, cursor);
    if (index < 0 || typeof image.href !== 'string') continue;
    const block = {
      _type: 'docImage',
      _key: key(),
      alt: image.text ?? '',
      url: image.href,
      ...(image.title ? { title: image.title } : {}),
      markdown: raw,
    } satisfies RichBlock;
    const placeholder = richPlaceholder(blocks, block);
    result = result.slice(0, index) + placeholder + result.slice(index + raw.length);
    cursor = index + placeholder.length;
  }
  return result;
}

function htmlTableBlock(
  source: string,
  options: DocsBlockOptions,
  blocks: RichBlock[],
): RichBlock | undefined {
  const table = source.match(/<table\b[^>]*>[\s\S]*?<\/table\s*>/i)?.[0];
  if (!table) return undefined;
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map((row) => {
    const cells = [...(row[1] ?? '').matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)\s*>/gi)];
    return cells.map((cell) => {
      const markdown = htmlToMarkdown(
        cell[1] ?? '',
        options.inlineMath !== false && options.math !== false,
      );
      const cellBlocks: RichBlock[] = [];
      const cellMarkdownWithBlocks = markdown.replace(
        /TERRADOCSBLOCK(\d+)PLACEHOLDER/g,
        (placeholder, indexText: string) => {
          const original = blocks[Number(indexText)];
          return original ? richPlaceholder(cellBlocks, original) : placeholder;
        },
      );
      const cellMarkdown = markdownImagesAsBlocks(cellMarkdownWithBlocks, options, cellBlocks);
      return {
        _type: 'cell',
        _key: key(),
        content: parseMarkdown(cellMarkdown, options, cellBlocks),
      };
    });
  });
  const parsedRows = rows.map((cells) => ({
    _type: 'row',
    _key: key(),
    cells,
  }));
  // Use one isolated placeholder registry per cell; parsing every paragraph and rich inline
  // component is necessary to keep the table's complete source visible in the nested renderer.
  return {
    _type: 'table',
    _key: key(),
    header: 'Table',
    markdown: restoreInlineMathPlaceholders(table),
    rows: parsedRows,
  };
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
  return parseMarkdown(markdown, options, []);
}

function parseGroupedItems(
  source: string,
  options: DocsBlockOptions,
  blocks: RichBlock[],
): RichBlock[] | undefined {
  const markers = [...source.matchAll(/^:::terra-item ("(?:\\.|[^"\\])*")[ \t]*\r?$/gm)];
  if (!markers.length || source.slice(0, markers[0]!.index).trim()) return undefined;
  const items: RichBlock[] = [];
  let consumedUntil = 0;
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index]!;
    const bodyStart = (marker.index ?? 0) + marker[0].length;
    const nextStart = markers[index + 1]?.index ?? source.length;
    const closing = /^:::terra-item-end[ \t]*\r?$/gm;
    closing.lastIndex = bodyStart;
    const end = closing.exec(source);
    if (!end || end.index >= nextStart || source.slice(end.index + end[0].length, nextStart).trim())
      return undefined;
    let title: string;
    try {
      title = JSON.parse(marker[1]!) as string;
    } catch {
      return undefined;
    }
    const body = source
      .slice(bodyStart, end.index)
      .replace(/^\r?\n/, '')
      .replace(/\r?\n$/, '');
    const content = parseMarkdown(body, options, blocks);
    items.push({
      _type: 'item',
      _key: key(),
      title,
      ...(/TERRADOCSBLOCK\d+PLACEHOLDER/.test(body) ? {} : { markdown: body }),
      content,
    });
    consumedUntil = end.index + end[0].length;
  }
  return source.slice(consumedUntil).trim() ? undefined : items;
}

function parseMarkdownTableCells(
  block: RichBlock,
  options: DocsBlockOptions,
  blocks: RichBlock[],
): RichBlock {
  const source = block as Record<string, unknown>;
  if (source._docsCellFormat !== 'markdown-v1' || !Array.isArray(source.rows)) return block;

  const { rows: sourceRows, ...table } = source;
  delete table._docsCellFormat;
  const rows = sourceRows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const rowSource = row as Record<string, unknown>;
    const { cells: sourceCells, ...rowFields } = rowSource;
    const cells = Array.isArray(sourceCells)
      ? sourceCells.map((cell) => {
          if (!cell || typeof cell !== 'object') return cell;
          const cellSource = cell as Record<string, unknown>;
          const { markdown, ...cellFields } = cellSource;
          if (typeof markdown !== 'string')
            return {
              ...cellFields,
              _type: typeof cellFields._type === 'string' ? cellFields._type : 'cell',
              content: Array.isArray(cellFields.content) ? cellFields.content : [],
            };
          return {
            ...cellFields,
            _type: typeof cellFields._type === 'string' ? cellFields._type : 'cell',
            content: parseMarkdown(markdown, options, blocks),
          };
        })
      : sourceCells;
    return {
      ...rowFields,
      _type: typeof rowFields._type === 'string' ? rowFields._type : 'row',
      cells,
    };
  });

  return { ...table, _type: 'table', rows } as RichBlock;
}

function parseMarkdown(
  markdown: string,
  options: DocsBlockOptions,
  blocks: RichBlock[],
): DocsValue {
  const inlineMath = options.inlineMath !== false && options.math !== false;
  const jsxSource = transformCanonicalComponents(markdown, options, blocks);
  const richSource = jsxSource.replace(
    /^(:{3,})terra-docs ([A-Za-z]+)\s*\n([\s\S]*?)^\1\s*$/gm,
    (source, fence: string, type: string, payload: string) => {
      // Four-colon accordion/tab blocks use grouped Markdown items. Sending
      // their prose through YAML first misreads list lines such as
      // `- **Research**: ...` as aliases and can emit noisy parser warnings.
      // Leave this form for the grouped-block parser below.
      if (
        fence.length >= 4 &&
        (type === 'accordion' || type === 'tabs') &&
        /^:::terra-item "/m.test(payload)
      )
        return source;
      try {
        const data = parseYaml(payload) as RichBlock;
        if (data && data._type === type) {
          const normalized =
            type === 'table' ? parseMarkdownTableCells(data, options, blocks) : data;
          return enabled(options, type)
            ? richPlaceholder(blocks, normalized)
            : rawPlaceholder(blocks, source);
        }
      } catch {
        // Four-colon accordion and tab blocks use nested Markdown rather than a typed payload.
        if (fence.length >= 4 && (type === 'accordion' || type === 'tabs')) return source;
      }
      if (fence.length >= 4 && (type === 'accordion' || type === 'tabs')) return source;
      return rawPlaceholder(blocks, source);
    },
  );
  const withCaptionTables = richSource.replace(
    /^:::terra-docs table\[([^\]\r\n]*)\][ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/gm,
    (source, caption: string, body: string) => {
      if (!enabled(options, 'table')) return rawPlaceholder(blocks, source);
      let header = caption;
      try {
        header = decodeURIComponent(caption);
      } catch {
        /* Keep a readable caption if an older hand-authored value is not URI-encoded. */
      }
      const tableToken = (marked.lexer(body, { gfm: true }) as Token[]).find(
        (token) => token.type === 'table',
      );
      if (!tableToken) return rawPlaceholder(blocks, source);
      const table = tableBlock(
        [tableToken.header ?? [], ...(tableToken.rows ?? [])],
        body,
        options,
        header,
      );
      return table ? richPlaceholder(blocks, table) : rawPlaceholder(blocks, source);
    },
  );
  const withGroupedBlocks = withCaptionTables.replace(
    /^(:{4,})terra-docs (accordion|tabs)[ \t]*\r?\n([\s\S]*?)^\1[ \t]*$/gm,
    (source, _fence: string, type: string, body: string) => {
      if (!enabled(options, type)) return rawPlaceholder(blocks, source);
      const items = parseGroupedItems(body, options, blocks);
      return items
        ? richPlaceholder(blocks, { _type: type, items })
        : rawPlaceholder(blocks, source);
    },
  );
  const withAccordions = withGroupedBlocks.replace(
    /^(===|\|\|\|)\s*\[([^\]\n]+)\]\s*\n([\s\S]*?)^\1\s*$/gm,
    (source, delimiter: string, title: string, body: string) => {
      const type = delimiter === '===' ? 'accordion' : 'tabs';
      if (!enabled(options, type)) return rawPlaceholder(blocks, source);
      return richPlaceholder(blocks, {
        _type: type,
        items: [
          {
            title,
            ...(/TERRADOCSBLOCK\d+PLACEHOLDER/.test(body) ? {} : { markdown: body }),
            content: parseMarkdown(body, options, blocks),
          },
        ],
      });
    },
  );
  const withCallouts = transformCallouts(withAccordions, options, blocks, (body) =>
    parseMarkdown(body, options, blocks),
  );
  const source = withCallouts.replace(/^\$\$\s*\n([\s\S]*?)^\$\$\s*$/gm, (raw, code: string) =>
    enabled(options, 'math')
      ? richPlaceholder(blocks, { _type: 'math', code: code.trim(), inline: false, markdown: raw })
      : rawPlaceholder(blocks, raw),
  );
  const parsed = marked.lexer(protectMarkdownInlineMath(source, inlineMath), {
    gfm: true,
  }) as Token[];
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
      if (token.tokens?.some((child) => child.type === 'image')) {
        result.push({ _type: 'raw', _key: key(), markdown: token.raw });
        continue;
      }
      if (containsUnsupportedInlineHtml(token.tokens)) {
        result.push({ _type: 'raw', _key: key(), markdown: token.raw });
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
        const table = tableBlock(rows, token.raw, options);
        if (table) {
          result.push(table);
          continue;
        }
      }
      result.push({ _type: 'raw', _key: key(), markdown: token.raw });
      continue;
    }
    if (token.type === 'html') {
      const table = enabled(options, 'table')
        ? htmlTableBlock(token.raw, options, blocks)
        : undefined;
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

function onlyOwnFields(value: Record<string, unknown>, fields: string[]): boolean {
  return Object.keys(value).every((name) => fields.includes(name));
}

function markdownInlineBlock(block: RichBlock): boolean {
  if (
    !onlyOwnFields(block, ['_type', '_key', 'style', 'listItem', 'level', 'markDefs', 'children'])
  )
    return false;
  const style = String(block.style ?? 'normal');
  if (!['normal', 'blockquote', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(style)) return false;
  if (block.listItem !== undefined && block.listItem !== 'bullet' && block.listItem !== 'number')
    return false;
  if (block.level !== undefined && (!Number.isInteger(block.level) || Number(block.level) < 1))
    return false;
  const definitions = Array.isArray(block.markDefs) ? block.markDefs : [];
  const links = new Set<string>();
  for (const definition of definitions) {
    if (!definition || typeof definition !== 'object') return false;
    const mark = definition as Record<string, unknown>;
    if (
      !onlyOwnFields(mark, ['_type', '_key', 'href']) ||
      mark._type !== 'link' ||
      typeof mark._key !== 'string' ||
      typeof mark.href !== 'string'
    )
      return false;
    links.add(mark._key);
  }
  const children = Array.isArray(block.children) ? block.children : [];
  return children.every((child) => {
    if (!child || typeof child !== 'object') return false;
    const value = child as Record<string, unknown>;
    if (value._type === 'span') {
      return (
        onlyOwnFields(value, ['_type', '_key', 'text', 'marks']) &&
        typeof value.text === 'string' &&
        Array.isArray(value.marks) &&
        (value.marks as unknown[]).every(
          (mark) =>
            typeof mark === 'string' &&
            (['strong', 'em', 'strike-through', 'underline', 'code'].includes(mark) ||
              links.has(mark)),
        )
      );
    }
    return (
      value._type === 'math' &&
      onlyOwnFields(value, ['_type', '_key', 'code', 'inline']) &&
      typeof value.code === 'string' &&
      !/[$\r\n]/.test(value.code) &&
      value.inline === true
    );
  });
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
  const readable = children
    .map((child) => {
      if (child._type === 'math') return '$' + String(child.code ?? '') + '$';
      const marks = child.marks ?? [];
      let text = marks.includes('code')
        ? markdownCodeSpan(child.text ?? '')
        : escapeMarkdownText(child.text ?? '');
      for (const mark of marks) {
        if (mark === 'strong') text = '**' + text + '**';
        else if (mark === 'em') text = '*' + text + '*';
        else if (mark === 'strike-through') text = '~~' + text + '~~';
        else if (mark === 'underline') text = '<u>' + text + '</u>';
        else if (mark !== 'code' && markDefs.has(mark))
          text = '[' + text + '](' + markdownDestination(markDefs.get(mark) ?? '') + ')';
      }
      return text;
    })
    .join('');
  if (children.every((child) => child._type === 'span' && !child.marks?.length)) return readable;
  if (inlineMarkdownRoundTrips(children, readable, markDefs)) return readable;

  const preserved = children
    .map((child) => {
      if (child._type === 'math') return '$' + String(child.code ?? '') + '$';
      const marks = child.marks ?? [];
      let text = marks.includes('code')
        ? '<code>' + htmlCodeText(child.text ?? '') + '</code>'
        : escapeMarkdownText(child.text ?? '');
      for (const mark of marks) {
        if (mark === 'strong') text = '<strong>' + text + '</strong>';
        else if (mark === 'em') text = '<em>' + text + '</em>';
        else if (mark === 'strike-through') text = '<s>' + text + '</s>';
        else if (mark === 'underline') text = '<u>' + text + '</u>';
        else if (mark !== 'code' && markDefs.has(mark))
          text = '[' + text + '](' + markdownDestination(markDefs.get(mark) ?? '') + ')';
      }
      return text;
    })
    .join('');
  if (!inlineMarkdownRoundTrips(children, preserved, markDefs))
    throw new Error(
      'Portable Text inline marks cannot be represented without changing their structure.',
    );
  return preserved;
}

function inlineMarkdownRoundTrips(
  children: { _type?: string; text?: string; marks?: string[]; code?: string }[],
  markdown: string,
  sourceMarkDefs: Map<string, string>,
): boolean {
  if (
    markdown.length === 0 &&
    children.length === 1 &&
    children[0]?._type === 'span' &&
    children[0].text === '' &&
    !children[0].marks?.length
  )
    return true;
  const sentinel = 'CodexInlineSentinel';
  const parsedBlocks = markdownToDocsValue(sentinel + markdown);
  if (parsedBlocks.length !== 1 || !('children' in parsedBlocks[0]!)) return false;
  const parsedBlock = parsedBlocks[0] as RichBlock;
  const parsed = Array.isArray(parsedBlock.children)
    ? (parsedBlock.children as { _type?: string; text?: string; marks?: string[]; code?: string }[])
    : [];
  const sentinelIndex = parsed.findIndex(
    (child) => child._type === 'span' && child.text?.startsWith(sentinel) && !child.marks?.length,
  );
  if (sentinelIndex < 0) return false;
  const sentinelChild = parsed[sentinelIndex]!;
  const remainingText = String(sentinelChild.text ?? '').slice(sentinel.length);
  if (remainingText) sentinelChild.text = remainingText;
  else parsed.splice(sentinelIndex, 1);
  const parsedLinks = new Map(
    (Array.isArray(parsedBlock.markDefs) ? parsedBlock.markDefs : [])
      .filter(
        (mark): mark is { _key: string; _type: 'link'; href: string } =>
          typeof mark === 'object' && mark !== null && '_key' in mark && 'href' in mark,
      )
      .map((mark) => [mark._key, mark.href]),
  );
  const signature = (
    values: { _type?: string; text?: string; marks?: string[]; code?: string }[],
    definitions: Map<string, string>,
  ) => {
    const result: ({ text: string; marks: string[] } | { math: string; inline: boolean })[] = [];
    for (const value of values) {
      if (value._type === 'math') {
        result.push({ math: String(value.code ?? ''), inline: true });
        continue;
      }
      if (value._type !== 'span') return undefined;
      const marks = (value.marks ?? [])
        .map((mark) => (definitions.has(mark) ? 'link:' + definitions.get(mark) : mark))
        .sort();
      const valueText = String(value.text ?? '');
      const pieces = marks.includes('code')
        ? [valueText]
        : valueText.split(/(\$[^$\n]+\$)/g).filter(Boolean);
      for (const piece of pieces) {
        if (/^\$[^$\n]+\$$/.test(piece)) {
          result.push({ math: piece.slice(1, -1), inline: true });
          continue;
        }
        const previous = result.at(-1);
        if (
          previous &&
          'text' in previous &&
          JSON.stringify(previous.marks) === JSON.stringify(marks)
        )
          previous.text += piece;
        else result.push({ text: piece, marks });
      }
    }
    return JSON.stringify(result);
  };
  return signature(children, sourceMarkDefs) === signature(parsed, parsedLinks);
}

function tableCellMarkdown(cell: unknown): string {
  if (!cell || typeof cell !== 'object') return '';
  const value = cell as Record<string, unknown>;
  if (typeof value.markdown === 'string' && value.markdown) return value.markdown;
  if (!Array.isArray(value.content)) return '';
  return value.content
    .map((block) => {
      if (emptyPortableTextParagraph(block)) return '';
      return escapeTableAutolinks(
        docsValueToMarkdown([block] as DocsValue)
          .replace(/(?:\r?\n)+$/, '')
          .replace(/\r?\n/g, '<br>'),
      );
    })
    .join('<br data-docs-paragraph-break>');
}

function tableCellDocumentMarkdown(cell: unknown): string {
  if (!cell || typeof cell !== 'object') return '';
  const value = cell as Record<string, unknown>;
  if (Array.isArray(value.content))
    return docsValueToMarkdown(value.content as DocsValue).trimEnd();
  return typeof value.markdown === 'string' ? value.markdown.trimEnd() : '';
}

/**
 * GFM turns bare email addresses and URLs into link marks. In a Docs table cell,
 * that is a data change when the original Portable Text was plain text. Encode
 * only the punctuation that starts an automatic link; HTML entities display
 * identically and keep the text unlinked on the next Markdown parse. Explicit
 * Markdown links and code spans retain their original destinations and marks.
 */
function escapeTableAutolinks(markdown: string): string {
  const protectedParts: string[] = [];
  const protect = (source: string) => {
    protectedParts.push(source);
    return `DOCSTABLEPROTECTED${protectedParts.length - 1}TOKEN`;
  };
  const protectedMarkdown = markdown
    .replace(/\[[^\]]*\]\((?:<[^>]*>|[^)]*)\)/g, protect)
    .replace(/(`+)[\s\S]*?\1/g, protect);
  const escaped = protectedMarkdown
    .replace(/\b((?:https?|ftp)):\/\//gi, '$1&#58;//')
    .replace(/\b(www)\./gi, '$1&#46;')
    .replace(/\b([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi, '$1&#64;$2');
  return escaped.replace(
    /DOCSTABLEPROTECTED(\d+)TOKEN/g,
    (_match, index: string) => protectedParts[Number(index)] ?? _match,
  );
}

function tableToMarkdown(block: RichBlock): string {
  const rows = Array.isArray(block.rows) ? (block.rows as Record<string, unknown>[]) : [];
  const fallback = richBlockDirective(block);
  if (!rows.length) return fallback;
  const columnCounts = rows.map((row) => (Array.isArray(row.cells) ? row.cells.length : 0));
  const rectangular = columnCounts.every((count) => count === columnCounts[0]);
  const simpleRows =
    rectangular &&
    rows.every((row) => {
      if (row._type !== 'row' || !onlyOwnFields(row, ['_type', '_key', 'cells'])) return false;
      return (
        Array.isArray(row.cells) &&
        row.cells.every((cell) => {
          if (!cell || typeof cell !== 'object') return false;
          const value = cell as Record<string, unknown>;
          if (
            !onlyOwnFields(value, ['_type', '_key', 'content', 'markdown']) ||
            value._type !== 'cell'
          )
            return false;
          if (typeof value.markdown === 'string' && value.markdown)
            return !value.markdown.includes('\n');
          if (!Array.isArray(value.content)) return false;
          return value.content.every((content) => {
            if (!content || typeof content !== 'object') return false;
            const paragraph = content as RichBlock;
            const representable =
              (paragraph._type === 'docImage' &&
                onlyOwnFields(paragraph as Record<string, unknown>, [
                  '_type',
                  '_key',
                  'alt',
                  'url',
                  'title',
                  'markdown',
                ]) &&
                typeof paragraph.url === 'string') ||
              ((paragraph._type === 'block' || paragraph._type === 'terraBlock') &&
                markdownInlineBlock(paragraph) &&
                !paragraph.listItem &&
                (paragraph.style === undefined || paragraph.style === 'normal'));
            if (!representable) return false;
            try {
              if (paragraph._type !== 'docImage') blockContentToMarkdown(paragraph);
              return true;
            } catch {
              return false;
            }
          });
        })
      );
    });
  if (!onlyOwnFields(block, ['_type', '_key', 'header', 'rows', 'markdown']) || !simpleRows)
    return markdownTableDirective(block, rows);

  const cells = rows.map((row) =>
    (Array.isArray(row.cells) ? row.cells : []).map((cell) =>
      tableCellMarkdown(cell).replace(/\|/g, '\\|').replace(/\n/g, '<br>'),
    ),
  );
  const width = Math.max(1, ...cells.map((row) => row.length));
  const padded = cells.map((row) => Array.from({ length: width }, (_cell, i) => row[i] ?? ''));
  const header = padded[0] ?? Array.from({ length: width }, () => '');
  const separator = Array.from({ length: width }, () => '---');
  const markdown = [
    '| ' + header.join(' | ') + ' |',
    '| ' + separator.join(' | ') + ' |',
    ...padded.slice(1).map((row) => '| ' + row.join(' | ') + ' |'),
  ].join('\n');
  const caption = String(block.header ?? 'Table');
  return caption !== 'Table'
    ? ':::terra-docs table[' + encodeURIComponent(caption) + ']\n' + markdown + '\n:::'
    : markdown;
}

function markdownTableDirective(block: RichBlock, rows: Record<string, unknown>[]): string {
  const source = block as Record<string, unknown>;
  const tableFields = Object.fromEntries(
    Object.entries(source).filter(
      ([name]) => !['_type', '_key', 'rows', 'markdown'].includes(name),
    ),
  );
  const markdownRows = rows.map((row) => {
    const rowFields = Object.fromEntries(
      Object.entries(row).filter(([name]) => !['_type', '_key', 'cells'].includes(name)),
    );
    const cells = Array.isArray(row.cells) ? row.cells : [];
    return {
      ...rowFields,
      cells: cells.map((cell) => {
        if (!cell || typeof cell !== 'object') return cell;
        const value = cell as Record<string, unknown>;
        const cellFields = Object.fromEntries(
          Object.entries(value).filter(
            ([name]) => !['_type', '_key', 'content', 'markdown'].includes(name),
          ),
        );
        return { ...cellFields, markdown: tableCellDocumentMarkdown(value) };
      }),
    };
  });
  return richBlockDirective({
    _type: 'table',
    ...tableFields,
    _docsCellFormat: 'markdown-v1',
    rows: markdownRows,
  });
}

function isListBlock(block: RichBlock): boolean {
  return (
    (block._type === 'block' || block._type === 'terraBlock') &&
    (block.listItem === 'bullet' || block.listItem === 'number') &&
    (block.style === undefined || block.style === 'normal') &&
    markdownInlineBlock(block)
  );
}

function listToMarkdown(blocks: RichBlock[], start: number): { markdown: string; next: number } {
  const lines: string[] = [];
  const ordinals = new Map<number, { kind: string; count: number }>();
  let index = start;
  while (index < blocks.length && isListBlock(blocks[index]!)) {
    const block = blocks[index]!;
    const level = Math.max(1, Number(block.level) || 1);
    for (const nestedLevel of ordinals.keys())
      if (nestedLevel > level) ordinals.delete(nestedLevel);
    const kind = String(block.listItem);
    const previous = ordinals.get(level);
    const ordinal = previous?.kind === kind ? previous.count + 1 : 1;
    ordinals.set(level, { kind, count: ordinal });
    const marker = kind === 'number' ? ordinal + '.' : '-';
    // A nested list must be indented far enough to clear the parent marker. Two spaces
    // are not enough after an ordered marker (`1. `) in CommonMark and flatten the item.
    const indentation = '   '.repeat(level - 1);
    const continuationIndentation = indentation + ' '.repeat(marker.length + 1);
    const content = blockContentToMarkdown(block).replace(/\n/g, '\n' + continuationIndentation);
    lines.push(indentation + marker + ' ' + content);
    index += 1;
  }
  return { markdown: lines.join('\n'), next: index };
}

function nestedMarkdown(block: Record<string, unknown>): string {
  // Component parsing replaces JSX blocks with placeholders before parsing nested
  // containers such as callouts and tabs. That transformed source is useful while
  // parsing, but cannot be written back to Markdown: the placeholder has meaning
  // only in the temporary parser registry. Rebuild that nested source from its
  // structured content so code, diagrams, images, and other rich blocks survive.
  if (
    typeof block.markdown === 'string' &&
    block.markdown &&
    !/TERRADOCSBLOCK\d+PLACEHOLDER/.test(block.markdown)
  )
    return block.markdown;
  return Array.isArray(block.content)
    ? docsValueToMarkdown(block.content as DocsValue).trimEnd()
    : '';
}

function emptyPortableTextParagraph(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const block = value as Record<string, unknown>;
  if (block._type !== 'block' && block._type !== 'terraBlock') return false;
  if (
    Object.keys(block).some(
      (name) => !['_type', '_key', 'style', 'markDefs', 'children'].includes(name),
    )
  )
    return false;
  if (block.listItem || (block.style !== undefined && block.style !== 'normal')) return false;
  if (Array.isArray(block.markDefs) && block.markDefs.length > 0) return false;
  if (!Array.isArray(block.children)) return false;
  return block.children.every((child) => {
    if (!child || typeof child !== 'object') return false;
    const span = child as Record<string, unknown>;
    return (
      span._type === 'span' &&
      String(span.text ?? '').trim() === '' &&
      (!Array.isArray(span.marks) || span.marks.length === 0) &&
      Object.keys(span).every((name) => ['_type', '_key', 'text', 'marks'].includes(name))
    );
  });
}

function semanticMarkdownValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.filter((item) => !emptyPortableTextParagraph(item)).map(semanticMarkdownValue);
  if (!value || typeof value !== 'object') return value;

  const block = value as Record<string, unknown>;
  const type = block._type;
  if (type === 'block' || type === 'terraBlock') {
    const definitions = new Map(
      (Array.isArray(block.markDefs) ? block.markDefs : [])
        .filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
        )
        .map((item) => [String(item._key ?? ''), semanticMarkdownValue(item)]),
    );
    const children: unknown[] = [];
    for (const child of Array.isArray(block.children) ? block.children : []) {
      if (!child || typeof child !== 'object') {
        children.push(semanticMarkdownValue(child));
        continue;
      }
      const item = child as Record<string, unknown>;
      if (item._type !== 'span') {
        children.push(semanticMarkdownValue(item));
        continue;
      }
      const marks = (Array.isArray(item.marks) ? item.marks : [])
        .map((mark) => definitions.get(String(mark)) ?? mark)
        .map((mark) => JSON.stringify(mark))
        .sort();
      const pieces = String(item.text ?? '')
        .split(/(\$[^$\n]+\$)/g)
        .filter(Boolean);
      for (const piece of pieces) {
        if (/^\$[^$\n]+\$$/.test(piece)) {
          children.push({ _type: 'math', code: piece.slice(1, -1), inline: true });
          continue;
        }
        const previous = children.at(-1) as
          { _type?: string; text?: string; marks?: string[] } | undefined;
        if (previous?._type === 'span' && JSON.stringify(previous.marks) === JSON.stringify(marks))
          previous.text = String(previous.text ?? '') + piece;
        else children.push({ _type: 'span', text: piece, marks });
      }
    }
    const extra = Object.fromEntries(
      Object.entries(block)
        .filter(
          ([name]) =>
            ![
              '_type',
              '_key',
              '_rev',
              '_createdAt',
              '_updatedAt',
              '_system',
              'style',
              'listItem',
              'level',
              'markDefs',
              'children',
            ].includes(name),
        )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, item]) => [name, semanticMarkdownValue(item)]),
    );
    const markDefs = [...definitions.values()].map((item) => JSON.stringify(item)).sort();
    return {
      ...extra,
      _type: 'textBlock',
      style: block.style ?? 'normal',
      listItem: block.listItem ?? null,
      level: block.level ?? null,
      markDefs,
      children,
    };
  }

  // Empty, metadata-free Portable Text paragraphs have no visible Markdown
  // representation. Ignore them in all nested block arrays (including callouts
  // and table cells), while retaining the original records in the source archive.
  const semanticBlock = block;
  const nestedContent = Array.isArray(semanticBlock.content) ? semanticBlock.content : undefined;
  const extra = Object.fromEntries(
    Object.entries(semanticBlock)
      .filter(([name]) => !['_key', '_rev', '_createdAt', '_updatedAt', '_system'].includes(name))
      .filter(([name]) => !(name === '_type' && type === 'item'))
      .filter(([name]) => !(name === 'markdown' && nestedContent))
      // Accordions and tabs can also carry an empty editor cache at the root.
      // Grouped Markdown reconstructs the item bodies directly, so this cache
      // is not source content and must not force an otherwise faithful YAML
      // fallback.
      .filter(([name]) => !(name === 'markdown' && ['accordion', 'tabs'].includes(String(type))))
      .filter(
        ([name]) => !(name === 'markdown' && ['math', 'docImage', 'table'].includes(String(type))),
      )
      .filter(
        ([name]) =>
          !(name === 'markdown' && type === 'code' && ('value' in block || 'source' in block)),
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, item]) => [name, semanticMarkdownValue(item)]),
  );
  return extra;
}

function markdownPreservesValue(value: unknown, markdown: string): boolean {
  try {
    return (
      JSON.stringify(semanticMarkdownValue([value])) ===
      JSON.stringify(semanticMarkdownValue(markdownToDocsValue(markdown)))
    );
  } catch {
    return false;
  }
}

function richBlockDirective(block: RichBlock): string {
  const type = String(block._type ?? '');
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(type))
    throw new Error('Cannot serialize Docs block with an invalid type.');
  // Remove only YAML's document-ending newline. Additional final newlines can
  // be meaningful content in block scalars (especially code values with a
  // `|+` chomping indicator), so trimming them would silently alter the block.
  const payload = stringifyYaml(block, { lineWidth: 0 }).replace(/\r?\n$/, '');
  const nestedFences = [...payload.matchAll(/^(:{3,})(?:[ \t].*)?$/gm)].map(
    (match) => match[1]!.length,
  );
  const fence = ':'.repeat(Math.max(3, 1 + Math.max(0, ...nestedFences)));
  return fence + 'terra-docs ' + type + '\n' + payload + '\n' + fence;
}

function colonFence(contents: string[], minimum = 4): string {
  const largest = contents.flatMap((content) =>
    [...content.matchAll(/^(:+)(?:[ \t].*)?$/gm)].map((match) => match[1]!.length),
  );
  return ':'.repeat(Math.max(minimum, 1 + Math.max(0, ...largest)));
}

function codeFence(code: string, language: string): string {
  const tick = String.fromCharCode(96);
  const runs = code.match(new RegExp(tick + '+', 'g')) ?? [];
  const fence = tick.repeat(Math.max(3, 1 + Math.max(0, ...runs.map((run) => run.length))));
  const suffix = language ? language : '';
  return fence + suffix + '\n' + code.replace(/\n+$/, '') + '\n' + fence;
}

/** Serialize readable Markdown where it is faithful and typed source where it is not. */
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

    if (item._type === 'block' || item._type === 'terraBlock') {
      if (!markdownInlineBlock(item) || item.listItem !== undefined) {
        result.push(richBlockDirective(item));
        continue;
      }
      const content = blockContentToMarkdown(item);
      const style = String(item.style ?? 'normal');
      if (/^h[2-6]$/.test(style))
        result.push('#'.repeat(Number(style[1])) + ' ' + content.replace(/\r?\n/g, '<br>'));
      else if (style === 'blockquote') result.push('> ' + content);
      else if (style === 'normal') result.push(content);
      else result.push(richBlockDirective(item));
      continue;
    }

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

    if (item._type === 'raw' && !extra && typeof item.markdown === 'string') {
      result.push(
        markdownPreservesValue(item, item.markdown) ? item.markdown : richBlockDirective(item),
      );
      continue;
    }

    if (item._type === 'code' && !extra) {
      const language = String(item.language ?? '');
      if (language && !/^[A-Za-z0-9_+.-]+$/.test(language)) {
        result.push(richBlockDirective(item));
      } else if (
        typeof item.markdown === 'string' &&
        item.markdown &&
        item.value === undefined &&
        item.source === undefined
      ) {
        result.push(
          markdownPreservesValue(item, item.markdown) ? item.markdown : richBlockDirective(item),
        );
      } else {
        const markdown = codeFence(String(item.value ?? item.source ?? ''), language);
        result.push(markdownPreservesValue(item, markdown) ? markdown : richBlockDirective(item));
      }
      continue;
    }

    if (item._type === 'docImage' && !extra) {
      if (item.width !== undefined || item.height !== undefined) {
        result.push(richBlockDirective(item));
        continue;
      }
      const alt = String(item.alt ?? '').replace(/\]/g, '\\]');
      const url = markdownDestination(String(item.url ?? ''));
      const title = item.title
        ? ' "' + String(item.title).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
        : '';
      const markdown = '![' + alt + '](' + url + title + ')';
      result.push(markdownPreservesValue(item, markdown) ? markdown : richBlockDirective(item));
      continue;
    }

    if (item._type === 'math' && !extra && typeof item.code === 'string') {
      if (String(item.code).includes('$$') || (item.inline === true && /[$\r\n]/.test(item.code))) {
        result.push(richBlockDirective(item));
      } else if (item.inline === true) {
        const markdown = '$' + item.code + '$';
        result.push(markdownPreservesValue(item, markdown) ? markdown : richBlockDirective(item));
      } else {
        const markdown = '$$\n' + item.code + '\n$$';
        result.push(markdownPreservesValue(item, markdown) ? markdown : richBlockDirective(item));
      }
      continue;
    }

    if (item._type === 'table') {
      const markdown = tableToMarkdown(item);
      result.push(markdownPreservesValue(item, markdown) ? markdown : richBlockDirective(item));
      continue;
    }

    if (item._type === 'callout' && !extra) {
      const kind = String(item.kind ?? 'info');
      const title = String(item.title ?? kind);
      const content = nestedMarkdown(item).replace(/\n+$/, '');
      if (/^[A-Za-z][\w-]*$/.test(kind) && !/[\]\r\n]/.test(title)) {
        const fence = colonFence([content], 3);
        const markdown = fence + kind + '[' + title + ']\n' + content + '\n' + fence;
        result.push(markdownPreservesValue(item, markdown) ? markdown : richBlockDirective(item));
      } else {
        result.push(richBlockDirective(item));
      }
      continue;
    }

    if ((item._type === 'accordion' || item._type === 'tabs') && !extra) {
      const entries = Array.isArray(item.items) ? (item.items as Record<string, unknown>[]) : [];
      const supported = entries.every(
        (entry) =>
          onlyOwnFields(entry, ['_type', '_key', 'title', 'markdown', 'content']) &&
          (entry._type === undefined || entry._type === 'item') &&
          (entry.markdown === undefined || typeof entry.markdown === 'string') &&
          (entry.content === undefined || Array.isArray(entry.content)),
      );
      if (!supported || !entries.length) {
        result.push(richBlockDirective(item));
        continue;
      }
      const renderedItems = entries.map((entry) => {
        const title = typeof entry.title === 'string' ? entry.title : 'Item';
        const body = nestedMarkdown(entry).replace(/\n+$/, '');
        return ':::terra-item ' + JSON.stringify(title) + '\n' + body + '\n:::terra-item-end';
      });
      // Grouped Markdown supports nested typed blocks. Keep ordinary text,
      // tables, callouts, code, and other nested content readable instead of
      // wrapping the entire accordion or tab tree in YAML. Portable Text keys
      // are editor identity metadata; Markdown round trips intentionally mint
      // new keys while preserving the document structure and content.
      const fence = colonFence(renderedItems, 4);
      const markdown =
        fence + 'terra-docs ' + item._type + '\n' + renderedItems.join('\n') + '\n' + fence;
      result.push(markdownPreservesValue(item, markdown) ? markdown : richBlockDirective(item));
      continue;
    }

    result.push(richBlockDirective(item));
  }
  return (
    result
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(?:\r?\n)+$/, '') + '\n'
  );
}
