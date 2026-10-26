/** Converts Markdown, code fences, and table markup used by Docs content. */
import * as TerraQualityRegex from '../../regex.mjs';

/** Separates compact tabs markers before they reach the line-based block parser. */
export const normBlockMarkers = (md: string): string =>
  md
    .replace(/([^\n])[ \t]+(?=\|\|\|(?:[ \t]*(?:\|\|\||$)))/g, '$1\n\n')
    .replace(/(\|\|\|[ \t]*\[[^\]\n]*\])[ \t]+(?=\S)/g, '$1\n\n')
    .replace(/(^|\n)[ \t]*\|\|\|[ \t]+(?=\|\|\|[ \t]*\[)/gm, '$1|||\n\n');

/** Serializes a string literal for embedded MDX and JSX attributes. */
export const quote = (value: string): string => JSON.stringify(value);

/** Escapes HTML control characters before text is embedded in Docs markup. */
const escHtml = (value: string): string =>
  value
    .replace(TerraQualityRegex.REGEX_G_REGEX_17(), '&amp;')
    .replace(TerraQualityRegex.REGEX_G_REGEX_23(), '&lt;')
    .replace(TerraQualityRegex.REGEX_G_REGEX_24(), '&gt;')
    .replace(TerraQualityRegex.REGEX_G_REGEX_5(), '&quot;')
    .replace(TerraQualityRegex.REGEX_G_REGEX_4(), '&#39;');

/*//////////////////////////////////////////////////
CODE SYNTAX
//////////////////////////////////////////////////*/

/**
 * Emits the optional language attribute used by serialized code fences.
 *
 * @param language - Code fence language label.
 *
 * @returns `language` attribute when the fence declares one, otherwise an empty string.
 */
const codeAttrs = (lang?: string): string =>
  lang?.trim() ? ` language=${JSON.stringify(lang.trim())}` : '';

/**
 * Converts any code payload into a printable string before it is written into docs markup.
 *
 * @param val - Any code-like value to stringify.
 *
 * @return Printable code string used by the markdown and MDX serializers.
 *
 * @remarks
 * Prefers compact primitives and pretty-prints structured values.
 */
export function stringifyCodeValue(val: unknown): string {
  if (typeof val === 'string') {
    let n = val;
    for (let i = 0; i < 16; i++) {
      const match = n.match(/^\s*\{`([\s\S]*)`}\s*$/);
      if (!match) break;
      const unwrapped = (match[1] ?? '')
        .replace(TerraQualityRegex.REGEX_G_REGEX_11(), '$1')
        .replace(TerraQualityRegex.REGEX_N_G_REGEX_2(), '\n');
      if (unwrapped === n) break;
      n = unwrapped;
    }
    return n.replace(/\\r\\n|\\n|\\r/g, (m) => (m === '\\r' ? '\r' : '\n'));
  }
  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint')
    return String(val);
  if (val == null) return '';
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

/**
 * Serializes fenced code into the canonical `<Code>` JSX used by docs content.
 *
 * @param lang - Code fence language label.
 * @param val - Raw code text.
 *
 * @return Canonical `Code` JSX for the code block.
 *
 * @remarks
 * The code payload is HTML-escaped so it can round-trip through MDX safely.
 */
export function codeJsx(lang: string | undefined, val: string): string {
  return `\n<Code${codeAttrs(lang)}>\n{\`
${val.replace(TerraQualityRegex.REGEX_G_REGEX_12(), '\\\\').replace(TerraQualityRegex.REGEX_G_REGEX_18(), '\\`').replace(TerraQualityRegex.REGEX_G_REGEX_16(), '\\$')}
\`}\n</Code>\n`;
}

/**
 * Handles code src jsx.
 *
 * @param lang - Code language label used for the generated code block.
 * @param src - Source code text to wrap in the code block.
 */
export const codeSrcJsx = (lang: string | undefined, src: string): string =>
  `\n<Code${codeAttrs(lang)} source=${quote(src)} />\n`;

/**
 * Normalizes markdown fences into the canonical Code JSX form.
 *
 * @param src - Markdown, fenced code, or legacy HTML source.
 *
 * @return Canonical `Code` JSX where code blocks were found.
 *
 * @remarks
 * The function leaves unrelated prose untouched so callers can run it on whole documents.
 */
export function toCodeJsx(src: string): string {
  if (!src) return '';
  const out: string[] = [];
  let fenced = false;
  let lang = '';
  let body: string[] = [];
  for (const line of src.replace(TerraQualityRegex.REGEX_R_N_G_REGEX(), '\n').split('\n')) {
    const trim = line.trimStart();
    if (trim.startsWith('```')) {
      if (fenced) {
        out.push(codeJsx(lang, body.join('\n')));
        lang = '';
        body = [];
      }
      fenced = !fenced;
      if (fenced) {
        lang = trim.slice(3).trim();
        continue;
      }
      continue;
    }
    if (fenced) {
      body.push(line);
      continue;
    }
    out.push(line);
  }
  let res = out.join('\n');
  const blocks: string[] = [];
  res = protectMarkupBlocks(res, 'Code', blocks);
  if (res.includes('<pre><code'))
    res = res.replace(
      /<pre><code(?:\s+class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/gi,
      (_, l: string, v: string) => codeJsx(l || '', v),
    );
  if (/<(?:td|th)\b[^>]*>\s*<code\b/i.test(res))
    res = res.replace(
      /<(t[dh])(\b[^>]*)>\s*<code(?:\s+class="language-([^"]+)")?>([\s\S]*?)<\/code>\s*<\/\1>/gi,
      (_, t: string, a: string, l: string, v: string) =>
        `<${t}${a}>${codeJsx(
          l || '',
          v
            .replace(/&#10;/g, '\n')
            .replace(/&#13;/g, '\r')
            .replace(TerraQualityRegex.REGEX_QUOT_G_REGEX(), '"')
            .replace(/&#39;/g, "'")
            .replace(TerraQualityRegex.REGEX_AMP_G_REGEX(), '&')
            .replace(TerraQualityRegex.REGEX_LT_G_REGEX(), '<')
            .replace(TerraQualityRegex.REGEX_GT_G_REGEX(), '>'),
        )}</${t}>`,
    );
  res = res.replace(
    /<Code\b([\s\S]*?)\s+code=(?:"([\s\S]*?)"|\{`((?:\\.|[^`])*?)`\})\s*\/>/g,
    (_match, p, q, e) => {
      return `<Code${p} source=${quote(e !== undefined ? e.replace(TerraQualityRegex.REGEX_G_REGEX_11(), '$1') : q)} />`;
    },
  );
  return blocks.reduce((n, b, i) => n.replace(new RegExp(`TERRA_PROTECTED_${i}__`, 'g'), b), res);
}

/*//////////////////////////////////////////////////
TABLE HTML
//////////////////////////////////////////////////*/

/**
 * Removes the outer `|` characters from a pipe-table row while respecting escaped pipes.
 *
 * @param value - Pipe-delimited text to trim.
 * @param side - Side of the pipe to trim.
 *
 * @returns Row fragment with the requested outer pipe removed.
 */
const trimPipe = (val: string, side: 'start' | 'end'): string => {
  if (side === 'start' && val.startsWith('|')) return val.slice(1);
  if (side === 'end' && val.endsWith('|')) {
    let slashes = 0;
    for (let i = val.length - 2; i >= 0 && val[i] === '\\'; i--) slashes++;
    return slashes % 2 === 0 ? val.slice(0, -1) : val;
  }
  return val;
};

/**
 * Renders a markdown pipe table into HTML when the row widths and separator row are valid.
 *
 * @param md - Table markdown to render.
 * @param renderCell - Cell renderer used for each value.
 *
 * @returns HTML table markup when the input is a valid pipe table, otherwise `null`.
 *
 * @remarks
 * Callers can supply a custom cell renderer to preserve nested markdown or JSX.
 */
export const mdTableToHtml = (
  md: string,
  renderCell: (val: string) => string = escHtml,
): string | null => {
  const lines = md.replace(TerraQualityRegex.REGEX_R_N_G_REGEX(), '\n').trim().split('\n');
  if (lines.length < 2 || lines.some((l) => !l.trim())) return null;
  const rows = lines.map((line) => {
    const cells: string[] = [];
    let cell = '';
    let esc = false;
    for (const ch of trimPipe(trimPipe(line.trim(), 'start'), 'end')) {
      if (esc) {
        cell += ch;
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === '|') {
        cells.push(cell.trim());
        cell = '';
        continue;
      }
      cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  });
  const width = rows[0]?.length || 0;
  if (
    !width ||
    rows.some((r) => r.length !== width) ||
    !rows[1]?.every((val) => /^:?-{3,}:?$/u.test(val.trim()))
  )
    return null;

  // prettier-ignore
  const body = rows.slice(2).map(r => `<tr>${r.map(c => `<td>${renderCell(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${/* prettier-ignore */ (rows[0] ?? []).map(renderCell).map(c => `<th>${c}</th>`).join('')}</tr></thead>${body ? `<tbody>${body}</tbody>` : ''}</table>`;
};

/*//////////////////////////////////////////////////
CONTENT SERIALIZATION
//////////////////////////////////////////////////*/

/**
 * Converts plain markdown into HTML for the serializer's fallback path.
 *
 * @param value - Markdown source to parse.
 *
 * @returns Rendered HTML string used when markdown does not map to richer docs blocks.
 */
export const renderMd = (val: string): string => {
  const text = val.trim();
  if (!text) return '';
  const code = text.match(/^```([^\n`]*)\n([\s\S]*?)\n```$/);
  if (code)
    return `<pre><code${code[1]?.trim() ? ` class="language-${escHtml(code[1].trim())}"` : ''}>${escHtml(code[2] || '')}</code></pre>`;
  const codes: string[] = [];
  const lines = text.split(/\n{2,}/);
  let html = escHtml(text)
    .replace(/`([^`]+)`/g, (_, c: string) => {
      codes.push(`<code>${escHtml(c)}</code>`);
      return `__CODE_${codes.length - 1}__`;
    })
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_, l: string, h: string) => `<a href="${escHtml(h)}">${l}</a>`,
    )
    .replace(TerraQualityRegex.REGEX_S_S_G_REGEX(), '<strong>$1</strong>')
    .replace(
      TerraQualityRegex.REGEX_N_G_REGEX(),
      (_, a: string, b: string, v: string) => `${a}<em>${b}</em>${v}`,
    )
    .replace(TerraQualityRegex.REGEX_N_G_REGEX_3(), '<br />');
  codes.forEach((c, i) => {
    html = html.replace(`__CODE_${i}__`, c);
  });
  if (lines.length > 1) return lines.map((l) => `<p>${renderMd(l)}</p>`).join('');
  return html;
};

/**
 * Handles strip nested anchors.
 *
 * @param val - Table cell markup to sanitize before it is embedded in a Docs table.
 */
export const stripNestedAnchors = (val: string): string =>
  val
    .replace(/<a([^>]*)>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/a>/gi, '<a$1>$2</a>')
    .replace(/\[\[([^\]]+)\]\(([^)]+)\)\]\(\2\)/g, '[$1]($2)');

/**
 * Handles sanitize table html.
 *
 * @param val - Table markup whose inline styles should be removed.
 */
export const sanitizeTableHtml = (val: string): string =>
  val
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

/**
 * Formats raw table HTML with consistent indentation so docs tables round-trip cleanly.
 *
 * @param value - Table HTML to format.
 *
 * @returns Formatted table HTML string with stable indentation.
 */
export const fmtRawTable = (val: string): string => {
  if (!TerraQualityRegex.REGEX_TABLE_B_I_REGEX().test(val)) return val;
  let depth = 0;
  return val
    .replace(/\s*\n\s*/g, ' ')
    .replace(/(<(?:td|th)\b[^>]*>)\s+(?=<(?:p|ul|ol|table|pre|div)\b)/gi, '$1')
    .replace(/(<\/(?:th|td)>)\s*(?=<(?:th|td)\b)/gi, '$1\n')
    .replace(/(<\/(?:p|ul|ol|pre|div)>)\s*(?=<\/td>)/gi, '$1')
    .replace(/(<\/li>)\s*(?=<li\b)/gi, '$1\n')
    .replace(/(<\/?(?:table|thead|tbody|tfoot|tr|ul|ol)\b[^>]*>)/gi, '\n$1\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      if (/^<\/(?:table|thead|tbody|tfoot|tr|th|td|ul|ol)\b[^>]*>$/iu.test(l))
        depth = Math.max(0, depth - 1);
      if (/^<(?:table|thead|tbody|tfoot|tr|th|td|ul|ol)\b[^>]*>$/iu.test(l)) depth++;
      return `${'\t'.repeat(depth)}${l}`;
    })
    .join('\n');
};

/** Identifies complete canonical HTML table markup. */
export const TABLE_TAG = /<\/?(?:table|thead|tbody|tfoot|tr|th|td)\b/i;

/**
 * Handles atomic table html.
 *
 * @param val - Complete table markup captured from a Docs source block.
 */
export const atomicTableHtml = (val: string): string => {
  return sanitizeTableHtml(val).trim();
};

/**
 * Handles fmt raw tables.
 *
 * @param source - Source text containing markup blocks to protect during normalization.
 */
/**
 * Replaces complete literal markup blocks without scanning past an unclosed legacy tag.
 *
 * @param src - Document source that may contain the requested markup blocks.
 * @param tag - Literal JSX or HTML tag name to protect.
 * @param blocks - Protected block collection restored after spacing normalization.
 *
 * @returns Source with complete matching blocks substituted by stable placeholders.
 *
 * @remarks
 * Legacy leaves can contain an incomplete opening tag; `indexOf` leaves that text untouched rather than allowing a regex to consume the rest of the document.
 */
const protectMarkupBlocks = (src: string, tag: string, blocks: string[]): string => {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const parts: string[] = [];
  let i = 0;
  for (;;) {
    const start = src.indexOf(open, i);
    if (start === -1) return parts.join('') + src.slice(i);
    const end = src.indexOf(close, start + open.length);
    if (end === -1) return parts.join('') + src.slice(i);
    blocks.push(src.slice(start, end + close.length));
    parts.push(src.slice(i, start), `TERRA_PROTECTED_${blocks.length - 1}__`);
    i = end + close.length;
  }
};

/**
 * Normalizes block spacing in serialized docs source.
 *
 * @param src - Markdown or MDX source to normalize.
 *
 * @returns Source with headings and block delimiters separated onto their own lines.
 */
export const normDocsSpacing = (src: string): string => {
  if (!src) return '';
  const blocks: string[] = [];
  let n = protectMarkupBlocks(
    protectMarkupBlocks(
      normBlockMarkers(
        toCodeJsx(src).replace(
          /(<Code\b[^>]*>\s*\{`(?:\\.|[^`])*`\})(?!\s*<\/Code>)/g,
          '$1\n</Code>',
        ),
      ),
      'Code',
      blocks,
    ),
    'table',
    blocks,
  );
  for (let i = 0; i < 4; i++) {
    n = n
      .replace(/([^\n])\s+(?=(?:#{1,6}\s+|===|\|\|\||:::(?![A-Za-z])))/g, '$1\n\n')
      .replace(/([^\n])\s+(?=:::[A-Za-z])/g, '$1\n\n')
      .replace(
        /^(?:===|\|\|\||:::[A-Za-z][\w-]*)(?:\[[^\]]*\])?\s+(?=\S)/gm,
        (m) => `${m.trimEnd()}\n\n`,
      )
      .replace(/([^\n])\s+(?=(?:[*-]|\d+\.)\s)/g, '$1\n')
      .replace(/([^\n])\n(?=<table\b)/g, '$1\n\n')
      .replace(/([^\n])\n(?=<Code\b)/g, '$1\n\n')
      .replace(/([^\n])\n(?=:::(?!:))/g, '$1\n\n')
      .replace(/^(:::[A-Za-z][\w-]*(?:\[[^\]]*\])?)\s+(.+)$/gm, '$1\n\n$2')
      .replace(/^:::\s+(.+)$/gm, ':::\n\n$1')
      .replace(/([^\n])\s+(?=:::(?![A-Za-z]))/g, '$1\n\n')
      .replace(TerraQualityRegex.REGEX_N_3_G_REGEX(), '\n\n');
    if (n === n) break;
  }
  n = n
    .split('\n')
    .reduce<{ lines: string[]; prev: string }>(
      (a, l) => {
        const currList = TerraQualityRegex.REGEX_S_D_S_REGEX().test(l);
        const prevList = TerraQualityRegex.REGEX_S_D_S_REGEX().test(a.prev);
        if (!l.trim()) {
          a.lines.push(l);
          return a;
        }
        if (currList && !prevList && a.lines.at(-1) !== '') a.lines.push('');
        if (currList && prevList) while (a.lines.length && a.lines.at(-1) === '') a.lines.pop();
        a.lines.push(l);
        a.prev = l;
        return a;
      },
      { lines: [], prev: '' },
    )
    .lines.join('\n')
    .split('\n')
    .flatMap((l) => {
      const heading = l.match(/^(#{1,6}\s+)(.+)$/);
      if (!heading) return [l];
      const words = (heading[2] ?? '')
        .trim()
        .split(TerraQualityRegex.REGEX_S_REGEX_2())
        .filter(Boolean);
      if (words.length < 2) return [l];
      let cap = 0;
      for (const word of words) {
        if (/^[A-Z0-9]/.test(word)) cap++;
        else break;
      }
      if (cap < 2) return [l];
      if (!words.slice(cap).some((w) => /[a-z]/.test(w))) return [l];
      return [
        `${heading[1]}${words.slice(0, Math.max(1, cap - 1)).join(' ')}`,
        '',
        words.slice(Math.max(1, cap - 1)).join(' '),
      ];
    })
    .join('\n')
    .replace(TerraQualityRegex.REGEX_N_3_G_REGEX(), '\n\n');
  return blocks
    .reduceRight((o, b, i) => o.replace(new RegExp(`TERRA_PROTECTED_${i}__`, 'g'), b), n)
    .replace(/(<\/Code>)[ \t]*(\d+)(?=\s|$)/g, '$1')
    .replace(/(<\/Code>)\n+\s*(\d+)\s*(?=\n|$)/g, '$1')
    .replace(
      /^(#{1,6})[ \t]*\n[ \t]*(?:\n[ \t]*)?(\d+\.\s+\S[^\n]*)/gm,
      (m, h: string, i: string, o: number, v: string) =>
        /^\n\s*\d+\.\s/.test(v.slice(o + m.length)) ? m : `${h} ${i}`,
    )
    .trim();
};

/**
 * Renders a Portable Text table block into HTML with a header row followed by body rows.
 *
 * @param rows - Table rows to serialize.
 *
 * @returns HTML table markup for the stored Portable Text rows.
 */
