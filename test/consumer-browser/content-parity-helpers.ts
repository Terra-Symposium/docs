import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';

export type SourcePage = {
  sourcePath: string;
  slug: string;
  pathname: string;
  title: string;
  description: string;
  frontmatter: Record<string, unknown>;
  markdown: string;
};

export function walkMarkdownFiles(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === '_archive') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && ['.md', '.mdx'].includes(extname(entry.name))) result.push(path);
    }
  };
  visit(root);
  return result.sort();
}

function frontmatter(source: string): {
  attributes: Record<string, string>;
  metadata: Record<string, unknown>;
  body: string;
} {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  const parsed = match ? parseYaml(match[1]!) : {};
  const metadata =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  const attributes = Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) =>
      typeof value === 'string' || typeof value === 'number' ? [[key, String(value)]] : [],
    ),
  );
  return { attributes, metadata, body: match ? source.slice(match[0].length) : source };
}

function titleFromSlug(slug: string): string {
  if (!slug) return 'Overview';
  return slug
    .split('/')
    .at(-1)!
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function pagesFromDirectory(
  rootValue: string,
  options: { titles?: Record<string, string>; extensions?: string[] } = {},
): SourcePage[] {
  const root = resolve(rootValue);
  return walkMarkdownFiles(root)
    .filter((path) => !options.extensions || options.extensions.includes(extname(path)))
    .map((sourcePath) => {
      const source = readFileSync(sourcePath, 'utf8');
      const { attributes, metadata, body } = frontmatter(source);
      const relativePath = relative(root, sourcePath).replaceAll('\\', '/');
      const slug = relativePath.replace(/\.(?:md|mdx)$/i, '').replace(/(?:^|\/)index$/i, '');
      return {
        sourcePath,
        slug,
        pathname: slug ? `/${slug.split('/').map(encodeURIComponent).join('/')}/` : '/',
        title: options.titles?.[slug] ?? attributes.title?.trim() ?? titleFromSlug(slug),
        description: attributes.description?.trim() ?? '',
        frontmatter: metadata,
        markdown: body,
      };
    });
}

export function normalizeVisibleText(value: string): string {
  return (
    value
      .normalize('NFKD')
      // Portable Text and Markdown renderers may typographically transform
      // straight quotes. Compare their meaning, not the typography choice.
      .replace(/[‘’]/g, "'")
      .replace(/′/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+(['′])/g, '$1')
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .trim()
  );
}

function plainMarkdownLine(line: string): string {
  // Inline math is verified from the rendered KaTeX source annotation below.
  // Keep prose comparison independent of KaTeX's duplicated assistive/visual
  // text nodes and its superscript line breaks.
  // A trailing backslash is Markdown's hard-break marker. It affects layout,
  // not visible copy, so exclude it before comparing source meaning with the
  // rendered text. Do not strip an escaped literal backslash (\\).
  const visibleLine = line.replace(/(?<!\\)\\\s*$/, '');
  const inlineCode: string[] = [];
  // Protect inline code before stripping math syntax. A code span containing
  // $$ is literal visible content, not a display-math delimiter.
  const protectedLine = visibleLine.replace(
    /(\x60+)(.*?)\1/g,
    (_match, _fence: string, value: string) => {
      const token = 'INLINECODETOKEN' + inlineCode.length + 'END';
      inlineCode.push(value);
      return token;
    },
  );
  const visibleMath = protectedLine.replace(/(?<!\\)[$]{1,2}([\s\S]*?)[$]{1,2}/g, ' ');
  let plain = visibleMath
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|(?:[-*+]\s+)|\d+[.)]\s+)/, '')
    // Destinations and quoted titles can contain balanced parentheses (and
    // links can themselves be surrounded by parentheses), so consume the
    // complete Markdown link before comparing its visible label.
    .replace(
      /!?\[([^\]]*)\]\((?:<[^>]+>|(?:\\.|[^()\s]+|\([^()\s]*\))+(?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?)\)/g,
      '$1',
    )
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<https?:\/\/[^>]+>/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    // Only remove actual HTML tags; comparison operators and escaped text such
    // as escaped less-than text are visible Markdown, not markup.
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/\{[^{}]*\}/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<![\w])_([^_\n]+)_(?![\w])/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\([\\\x60*_{}[\]()#+.$!|>~-])/g, '$1')
    .replace(/\\</g, '<')
    .replace(/\s+/g, ' ')
    .trim();
  inlineCode.forEach((value, index) => {
    plain = plain.replace('INLINECODETOKEN' + index + 'END', () => value);
  });
  return plain;
}
function addVisibleCode(units: string[], source: string): void {
  for (const line of source.split(/\r?\n/)) {
    const value = normalizeVisibleText(line);
    if (value.length >= 2) units.push(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addVisibleMarkdown(units: string[], source: string): void {
  // Structured table cells may contain their own rich-block directives, such
  // as a fenced code block serialized inside a Markdown cell. Those directive
  // delimiters are storage syntax; compare the rendered block values instead.
  const visibleBlocks = source.replace(
    /^(:{3,})terra-docs ([A-Za-z]+)(?:\[([^\]\n]*)\])?[ \t]*\r?\n([\s\S]*?)^\1[ \t]*$/gm,
    (directive, _fence: string, type: string, caption: string | undefined, payload: string) => {
      if (caption) {
        try {
          addVisibleMarkdown(units, decodeURIComponent(caption));
        } catch {
          addVisibleMarkdown(units, caption);
        }
      }
      // Grouped blocks contain nested Markdown directives. Recurse into the
      // body so nested rich-block YAML is compared by its visible fields,
      // rather than leaking storage keys such as `_type: table` as prose.
      if (type === 'accordion' || type === 'tabs') {
        addVisibleMarkdown(units, payload);
        return '\n';
      }
      const extracted = visibleRichBlockUnits(type, payload);
      if (!extracted) return directive;
      units.push(...extracted);
      return '\n';
    },
  );
  let fence: string | undefined;
  let displayMath = false;
  for (const line of visibleBlocks.split(/\r?\n/)) {
    const trimmed = line.trim();
    const accordionItem = trimmed.match(/^:{3}terra-item\s+("(?:\\.|[^"\\])*")[ \t]*$/);
    if (accordionItem) {
      try {
        addVisibleMarkdown(units, JSON.parse(accordionItem[1]!));
      } catch {
        // Malformed labels are not document copy that can be rendered safely.
      }
      continue;
    }
    if (/^:{3}terra-item-end\s*$/.test(trimmed)) continue;
    const admonition = trimmed.match(
      /^:{3,}(?:note|tip|important|caution|warning|danger|info|success|example)(?:\[([^\]]+)\])?\s*$/i,
    );
    if (admonition) {
      if (admonition[1]) addVisibleMarkdown(units, admonition[1]);
      continue;
    }
    if (/^:{3,}\s*$/.test(trimmed)) continue;
    const delimiter = trimmed.match(/^(```+|~~~+)/)?.[1];
    if (delimiter) {
      if (!fence) fence = delimiter[0];
      else if (delimiter[0] === fence[0]) fence = undefined;
      continue;
    }
    if (fence) {
      const code = normalizeVisibleText(line);
      if (code.length >= 2) units.push(code);
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      displayMath = !displayMath;
      continue;
    }
    if (displayMath) continue;
    if (!trimmed || /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) continue;
    if (trimmed.startsWith('|')) {
      for (const cell of trimmed.replace(/^\||\|$/g, '').split(/(?<!\\)\|/)) {
        const value = normalizeVisibleText(plainMarkdownLine(cell));
        if (value.length >= 2) units.push(value);
      }
      continue;
    }
    const value = normalizeVisibleText(plainMarkdownLine(line));
    if (value.length >= 2) units.push(value);
  }
}

/**
 * Portable Docs blocks serialize their editor data as YAML. Compare only the
 * fields that the block renderer actually displays; schema keys such as
 * `_docsCellFormat`, `_key`, `href`, and graph layout settings are not page
 * copy and must never be required in the rendered text.
 */
function visibleRichBlockUnits(type: string, payload: string): string[] | undefined {
  // Legacy Docs table blocks store a normal Markdown table directly in the
  // directive body. It is rendered as a table, not as YAML schema text.
  if (type === 'table' && /^\s*\|/m.test(payload)) {
    const units: string[] = [];
    for (const line of payload.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|') || /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed))
        continue;
      for (const cell of trimmed.replace(/^\||\|$/g, '').split(/(?<!\\)\|/)) {
        const value = normalizeVisibleText(plainMarkdownLine(cell));
        if (value.length >= 2) units.push(value);
      }
    }
    return units;
  }

  let data: unknown;
  try {
    data = parseYaml(payload);
  } catch {
    return undefined;
  }
  if (!isRecord(data) || data._type !== type) return undefined;

  const units: string[] = [];
  if (type === 'table') {
    if (typeof data.header === 'string' && data.header !== 'Table')
      addVisibleMarkdown(units, data.header);
    if (Array.isArray(data.rows)) {
      for (const row of data.rows) {
        if (!isRecord(row) || !Array.isArray(row.cells)) continue;
        for (const cell of row.cells) {
          if (isRecord(cell) && typeof cell.markdown === 'string')
            addVisibleMarkdown(units, cell.markdown);
        }
      }
    }
    return units;
  }
  if (type === 'nodes') {
    if (Array.isArray(data.nodes)) {
      for (const node of data.nodes) {
        if (!isRecord(node) || !isRecord(node.data)) continue;
        for (const key of ['title', 'label']) {
          const value = node.data[key];
          if (typeof value === 'string') addVisibleMarkdown(units, value);
        }
      }
    }
    return units;
  }
  if (type === 'code' && typeof data.value === 'string') {
    // A code block's value is literal source text. Running Markdown emphasis
    // cleanup over it corrupts ordinary syntax such as `/* ... */` comments.
    addVisibleCode(units, data.value);
    return units;
  }
  if (type === 'math' && typeof data.code === 'string') {
    // Math source is verified against KaTeX's source annotation below. Its
    // `_key`, `_type`, `inline`, and `code` fields are storage syntax, not prose.
    return units;
  }
  if (type === 'embed') {
    if (typeof data.title === 'string') addVisibleMarkdown(units, data.title);
    return units;
  }
  if (type === 'embed') {
    // Embed titles are exposed through the iframe's accessible name, not its
    // inner text, so the browser audit compares that label separately.
    if (typeof data.title === 'string') addVisibleMarkdown(units, data.title);
    return units;
  }

  return undefined;
}

/** Return readable source units that should be visible in the rendered body. */
export function visibleSourceUnits(markdown: string): string[] {
  const { body } = frontmatter(markdown);
  const units: string[] = [];
  const visibleBlocks = body.replace(
    /^(:{3,})terra-docs ([A-Za-z]+)(?:\[([^\]\n]*)\])?[ \t]*\r?\n([\s\S]*?)^\1[ \t]*$/gm,
    (source, _fence: string, type: string, caption: string | undefined, payload: string) => {
      if (caption) {
        try {
          addVisibleMarkdown(units, decodeURIComponent(caption));
        } catch {
          addVisibleMarkdown(units, caption);
        }
      }
      // Descend into grouped content. Its nested blocks have their own
      // renderer-specific fields and should never be compared as raw YAML.
      if (type === 'accordion' || type === 'tabs') {
        addVisibleMarkdown(units, payload);
        return '\n';
      }
      const extracted = visibleRichBlockUnits(type, payload);
      if (!extracted) return source;
      units.push(...extracted);
      // Never treat a structured block's YAML schema as visible prose. Its
      // renderer-specific user-facing fields were extracted above.
      return '\n';
    },
  );
  let fence: string | undefined;
  let displayMath = false;
  let inTable = false;

  for (const line of visibleBlocks.split(/\r?\n/)) {
    const delimiter = line.match(/^\s*(```+|~~~+)/)?.[1];
    if (delimiter) {
      if (!fence) fence = delimiter[0];
      else if (delimiter[0] === fence[0]) fence = undefined;
      continue;
    }
    if (fence) {
      const code = normalizeVisibleText(line);
      if (code.length >= 2) units.push(code);
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      displayMath = !displayMath;
      continue;
    }
    // Display equations are checked against their rendered KaTeX source
    // annotations by markdownMathExpressions; their TeX lines are not prose.
    if (displayMath) continue;

    const trimmed = line.trim();
    if (!trimmed || /^import\s/.test(trimmed) || /^export\s/.test(trimmed)) continue;
    if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) continue;
    if (/^\|/.test(trimmed)) {
      inTable = true;
      for (const cell of trimmed.replace(/^\||\|$/g, '').split('|')) {
        const value = normalizeVisibleText(plainMarkdownLine(cell));
        if (value.length >= 2) units.push(value);
      }
      continue;
    }
    if (inTable && !trimmed.startsWith('|')) inTable = false;
    if (/^:{3,}/.test(trimmed) || /^<\/?[A-Z][\w.]*(?:\s|\/?>)/.test(trimmed)) continue;

    const value = normalizeVisibleText(plainMarkdownLine(line));
    if (value.length >= 8) units.push(value);
  }
  return [...new Set(units)];
}

/** Math source is compared with KaTeX's source annotation rather than text layout. */
export function markdownMathExpressions(markdown: string): string[] {
  const { body } = frontmatter(markdown);
  const richMath: string[] = [];
  const withoutRichMath = body.replace(
    /^(:{3,})terra-docs math(?:\[[^\]\n]*\])?[ \t]*\r?\n([\s\S]*?)^\1[ \t]*$/gm,
    (directive, _fence: string, payload: string) => {
      try {
        const data: unknown = parseYaml(payload);
        if (isRecord(data) && data._type === 'math' && typeof data.code === 'string')
          richMath.push(data.code.trim());
      } catch {
        // Leave malformed directives out of the math expectations. The page
        // parity test will still catch visible source or missing content.
      }
      return '\n';
    },
  );
  const prose = withoutRichMath
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '')
    // Math delimiters inside inline code are literal code content, not math
    // rendered by the Docs Markdown pipeline.
    .replace(/(`+)[^\n]*?\1/g, '');
  return [...prose.matchAll(/(?<!\\)\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)\$/g)]
    .map((match) => (match[1] ?? match[2] ?? '').trim())
    .concat(richMath);
}

/** Extract fenced and indented Markdown code for comparison with the shared renderer. */
export function markdownCodeBlocks(markdown: string): string[] {
  const { body } = frontmatter(markdown);
  const blocks: string[] = [];
  const visit = (
    tokens: Array<{
      type?: string;
      text?: string;
      tokens?: unknown[];
      items?: Array<{ tokens?: unknown[] }>;
    }>,
  ) => {
    for (const token of tokens) {
      if (token.type === 'code') {
        const code = normalizeVisibleText(token.text ?? '');
        if (code.length >= 8) blocks.push(code);
      }
      if (token.type === 'list' && token.items) {
        for (const item of token.items) visit((item.tokens ?? []) as typeof tokens);
      } else if (token.tokens) {
        visit(token.tokens as typeof tokens);
      }
    }
  };
  visit(
    marked.lexer(body, { gfm: true }) as typeof visit extends (tokens: infer T) => void ? T : never,
  );
  return blocks;
}
