/** Serializes Docs bodies and Portable Text into Markdown and MDX. */
import { createTrace } from '../runtime.js';
import { encodeNodesPayload } from '../nodes.js';
import { isEndpointVal, TESTIMONIALS_EXPORT } from '../shared.js';
import * as TerraQualityRegex from '../../regex.mjs';
import { fromBlockJsx } from './block-jsx.js';
import {
  atomicTableHtml,
  codeJsx,
  codeSrcJsx,
  fmtRawTable,
  mdTableToHtml,
  normDocsSpacing,
  quote,
  renderMd,
  sanitizeTableHtml,
  stringifyCodeValue,
  stripNestedAnchors,
  TABLE_TAG,
  toCodeJsx,
} from './markdown.js';
import { PROBLEM_BLOCK_TYPES } from '../types.js';
import type {
  DocBlock,
  DocBody,
  DocTableCell,
  DocsContentPtMarkDef as PtMarkDef,
  DocsContentPtSpan as PtSpan,
} from '../types.js';

const isRec = (val: unknown): val is Record<string, unknown> =>
  Boolean(val && typeof val === 'object' && !Array.isArray(val));
const trace = createTrace('DOCS:content', false);
trace('module.loaded');

const ptText = (val: unknown): val is PtSpan => isRec(val) && val._type === 'span';

/** Narrows persisted mark definitions before the Markdown serializer reads link fields. */
const ptMarkDefs = (val: unknown): PtMarkDef[] =>
  Array.isArray(val)
    ? val.filter(
        (d): d is PtMarkDef =>
          isRec(d) &&
          d._type === 'link' &&
          (d._key === undefined || typeof d._key === 'string') &&
          (d.href === undefined || typeof d.href === 'string'),
      )
    : [];

/**
 * Wraps text in the Portable Text marks used by the docs serializer.
 *
 * @param text - Text content to decorate.
 * @param marks - Marks to apply in render order.
 * @param defs - Portable Text mark definitions.
 *
 * @returns Text wrapped in the mark syntax used by docs Markdown.
 */
const renderMarks = (text: string, marks: string[], defs: PtMarkDef[]): string =>
  marks.reduce((a, m) => {
    if (m === 'code') return `\`${a}\``;
    if (m === 'em') return `_${a}_`;
    if (m === 'strong') return `**${a}**`;
    const href = defs.find((d) => d._key === m && typeof d.href === 'string')?.href;
    return href ? `[${a}](${href})` : a;
  }, text);

/**
 * Reads the list style flag from a Portable Text block, if one was stored.
 *
 * @param val - Portable Text block or other persisted value whose list marker is inspected.
 *
 * @returns Stored list style, or an empty string when the block is not part of a list.
 */
const listKind = (val: unknown): string =>
  isRec(val) && typeof val.listItem === 'string' ? val.listItem : '';

const bodyText = (val: unknown): string => {
  if (typeof val === 'string') return val;
  if (!val) return '';
  if (Array.isArray(val)) return val.map(bodyText).join('');
  if (!isRec(val)) return '';
  if (typeof val.text === 'string') return val.text;
  if (typeof val.markdown === 'string' && val.markdown.trim())
    return fromBlockJsx(val.markdown).replace(TerraQualityRegex.REGEX_G_REGEX_22(), '');
  if (typeof val.html === 'string' && val.html.trim())
    return val.html.replace(TerraQualityRegex.REGEX_G_REGEX_22(), ' ');
  const children = Array.isArray(val.children) ? val.children : [];
  return bodyText(children.length > 0 ? children : (val.c ?? val.content ?? val.body ?? []));
};

const tableHtml = (rows: { cells: DocTableCell[] }[]): string => {
  /**
   * Renders the Row for the docs.
   *
   * @param row - Table row to render.
   * @param tag - Cell tag to emit for the row.
   *
   * @returns Table row markup for the rendered header or body row.
   */
  const renderRow = (row: { cells: DocTableCell[] }, tag: 'th' | 'td'): string => {
    return `\t<tr>\n${(Array.isArray(row.cells) ? row.cells : [])
      .map((cell) => {
        let html: string;
        if (cell.html?.trim())
          html = sanitizeTableHtml(stripNestedAnchors(cell.html.trim()))
            .replace(TerraQualityRegex.REGEX_S_S_G_REGEX(), '<strong>$1</strong>')
            .replace(TerraQualityRegex.REGEX_N_G_REGEX(), '$1<em>$2</em>$3');
        else {
          const body = stringifyDocBody(cell.content).trim();
          if (TerraQualityRegex.REGEX_CODE_B_S_S_CODE_REGEX().test(body)) html = body;
          else {
            const table = body ? mdTableToHtml(body, renderMd) : null;
            if (table) html = table;
            else if (body)
              html = sanitizeTableHtml(
                TerraQualityRegex.REGEX_TABLE_B_I_REGEX().test(body) ? body : renderMd(body),
              );
            else {
              const md = fromBlockJsx(cell.markdown || '').trim();
              const fallback = mdTableToHtml(md, renderMd);
              if (fallback) html = sanitizeTableHtml(fallback);
              else if (TerraQualityRegex.REGEX_TABLE_B_I_REGEX().test(md))
                html = sanitizeTableHtml(md);
              else {
                const text =
                  bodyText(cell.content) || bodyText(cell.markdown) || bodyText(cell.html);
                html = text ? sanitizeTableHtml(renderMd(text)) : '';
              }
            }
          }
        }
        if (html.includes('\n') || /<(?:p|ul|ol|table|pre|div)\b/i.test(html)) {
          let depth = 0;
          return `\t\t<${tag}>\n${html
            .split(TerraQualityRegex.REGEX_R_N_REGEX())
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
              if (/^<\//u.test(l)) depth = Math.max(0, depth - 1);
              if (/^<(?:ul|ol|table)\b[^>]*>$/u.test(l)) depth++;
              return `${'\t'.repeat(depth + 3)}${l}`;
            })
            .join('\n')}\n\t\t</${tag}>\n`;
        }
        return `\t\t<${tag}>${html}</${tag}>\n`;
      })
      .join('')}\t</tr>`;
  };
  const sRows = Array.isArray(rows) ? rows : [];
  if (!sRows.length) return '';
  // prettier-ignore
  return fmtRawTable(sanitizeTableHtml(`<table>\n${sRows[0] ? `<thead>\n${renderRow(sRows[0], 'th')}\n</thead>\n` : ''}<tbody>\n${sRows.slice(1).map(r => renderRow(r, 'td')).join('\n')}\n</tbody>\n</table>`,),);
};

/**
 * Prefers the already-serialized body, then falls back to the original markdown source.
 *
 * @param body - Body content to process.
 * @param md - Markdown source to parse.
 *
 * @returns Serialized docs source, falling back to the original markdown when body content is empty.
 */
const nestedMd = (body: DocBody | null | undefined, md = ''): string => {
  const content = stringifyDocBody(body).trim();
  if (content) return content;
  return fromBlockJsx(md).trim();
};

/**
 * Serializes a block defensively so malformed history entries do not break export.
 *
 * @param block - Block record to normalize.
 * @param number - Ordered list number for nested list items.
 *
 * @returns Serialized block Markdown, or an empty string when the block cannot be rendered safely.
 */
const sBlockMd = (block: unknown, number = 1): string => {
  try {
    return isRec(block) && typeof block._type === 'string'
      ? blockMd(block as DocBlock, number)
      : '';
  } catch (err) {
    if (isRec(block) && typeof block.markdown === 'string') return fromBlockJsx(block.markdown);
    console.error('[DOCS:content] Failed to serialize block.', {
      type: isRec(block) && typeof block._type === 'string' ? block._type : typeof block,
      err,
    });
    return '';
  }
};

/**
 * Serializes a Portable Text block into docs Markdown, preserving nested tables, lists, and custom blocks.
 *
 * @param b - Portable Text block to serialize.
 * @param number - Ordered list number for nested list items.
 *
 * @returns Markdown string for the supplied block, including nested custom syntax when present.
 */
const blockMd = (b: DocBlock, number = 1): string => {
  if (b._type === 'block') {
    const text = (
      Array.isArray(b.c) && b.c.length > 0 ? b.c : Array.isArray(b.children) ? b.children : []
    )
      .map((c) => {
        if (ptText(c))
          return renderMarks(
            c.text || '',
            Array.isArray(c.marks) ? c.marks : [],
            ptMarkDefs(b.markDefs),
          );
        return isRec(c) && typeof c._type === 'string' ? sBlockMd(c, number) : '';
      })
      .join('');
    if (TABLE_TAG.test(text)) {
      const table = atomicTableHtml(text);
      return table ? `\n${table}\n` : '';
    }
    if (b.style && TerraQualityRegex.REGEX_H_1_6_U_REGEX().test(b.style))
      return `\n${'#'.repeat(Number(b.style.slice(1)))} ${text}\n`;
    if (b.listItem) return `\n${b.listItem === 'number' ? `${number}.` : '*'} ${text}\n`;
    return text ? `\n${text}\n` : '';
  }
  switch (b._type) {
    case 'accordion':
    case 'tabs': {
      const syntax = b._type === 'tabs' ? '|||' : '===';
      return (Array.isArray(b.items) ? b.items : [])
        .map((t) => {
          const content = nestedMd(t.content, t.markdown || '');
          return content
            ? `\n${syntax}[${t.title}]\n\n${content}\n\n${syntax}\n`
            : `\n${syntax}[${t.title}]\n\n${syntax}\n`;
        })
        .join('');
    }
    case 'callout': {
      const content = nestedMd(b.content, b.markdown || '');
      return content
        ? `\n:::${b.kind}${b.title ? `[${b.title}]` : ''}\n\n${content}\n\n:::\n`
        : `\n:::${b.kind}${b.title ? `[${b.title}]` : ''}\n\n:::\n`;
    }
    case 'code': {
      const val = stringifyCodeValue(b.value);
      return `\n${b.source ? codeSrcJsx(b.language, b.source) : isEndpointVal(val) ? codeSrcJsx(b.language, val) : codeJsx(b.language, val)}\n`;
    }
    case 'embed':
      return `\n<Embed ${Object.entries({
        src: b.src,
        title: b.title,
        width: b.width,
        height: b.height,
      } as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => {
          if (v === true) return k;
          if (typeof v === 'string') return `${k}=${quote(v)}`;
          if (typeof v === 'number' || typeof v === 'boolean') return `${k}={${String(v)}}`;
          return `${k}={${JSON.stringify(v)}}`;
        })
        .join(' ')} />\n`;
    case 'heading':
      return `\n${'#'.repeat(b.depth ?? 1)} ${b.text ?? ''}\n`;
    case 'docImage':
      return `\n![${b.alt}](${b.url}${b.title ? ` "${b.title}"` : ''})\n`;
    case 'math':
      return b.inline ? `$${b.code}$` : `\n\n$$\n${b.code}\n$$\n\n`;
    case 'nodes':
      // prettier-ignore
      void { direction: b.direction, height: b.height, nodeSep: b.nodeSep, nodesCount: Array.isArray(b.nodes) ? b.nodes.length : 0, edgesCount: Array.isArray(b.edges) ? b.edges.length : 0, head: Array.isArray(b.nodes) ? encodeNodesPayload(b.nodes ?? []).slice(0, 160) : '', };
      return `\n<Nodes\n${b.direction !== undefined ? `  direction=${quote(String(b.direction))}\n` : ''}${b.nodes !== undefined ? `  nodes={${encodeNodesPayload(b.nodes ?? [])}}\n` : ''}${b.edges !== undefined ? `  edges={${encodeNodesPayload(b.edges ?? [])}}\n` : ''}${b.height !== undefined ? `  height={${b.height}}\n` : ''}${b.nodeSep !== undefined ? `  nodeSep={${b.nodeSep}}\n` : ''}${b.rankSep !== undefined ? `  rankSep={${b.rankSep}}\n` : ''}${b.proximityConnect ? '  proximityConnect\n' : ''}/>\n`;
    case 'paragraph':
      return fromBlockJsx(b.markdown || '');
    case 'raw':
      return b.markdown?.trim() === '<Testimonials />'
        ? TESTIMONIALS_EXPORT
        : fmtRawTable(fromBlockJsx(b.markdown || ''));
    case 'table': {
      const html = tableHtml(b.rows || []);
      if (html) return `\n${html}\n`;
      const md = fromBlockJsx(b.markdown || '').trim();
      const fallback = mdTableToHtml(md, renderMd);
      return fallback ? `\n${fallback}\n` : md ? `\n${md}\n` : '';
    }
    case 'tsDocs':
      return `\n<TsDocs scope=${quote(b.scope ?? '')} />\n`;
    default:
      return '';
  }
};

/**
 * Prefers editor-formatted body content, then falls back to markdown restored from custom blocks.
 *
 * @param body - Body content to process.
 * @param md - Markdown source to parse.
 *
 * @returns Editor Markdown source, using canonical JSX wrappers for nested blocks.
 */
const escDocsTableTemplates = (md: string): string =>
  md.replace(
    /<DocsTable\b[\s\S]*?html=\{`([\s\S]*?)`\}\s*\/>/g,
    (_match, h: string) =>
      `<DocsTable html={\`${h.replace(/(?<!\\)`/g, '\\`').replace(/(?<!\\)\$\{/g, '\\${')}\`} />`,
  );

/**
 * Handles editor nested md.
 *
 * @param body - Structured body used as the serialization source.
 * @param markdown - Markdown fallback used when structured content is unavailable.
 */
const editorNestedMd = (body: DocBody | null | undefined, markdown = ''): string => {
  const tables: string[] = [];
  return tables.reduce(
    (n, t, i) => n.replace(`TERRA_EDITOR_TABLE_${i}`, t),
    escDocsTableTemplates(
      Array.isArray(body) && body.length > 0
        ? stringifyEditorContentBody(body)
        : fromBlockJsx(markdown || '').trim(),
    )
      .replace(/<DocsTable\s+html=\{`(?:\\.|[^`])*`\}\s*\/>/g, (m) => {
        tables.push(m);
        return `TERRA_EDITOR_TABLE_${tables.length - 1}`;
      })
      .replace(
        TerraQualityRegex.REGEX_TABLE_B_S_S_TABLE_GI_REGEX(),
        (t) =>
          `<DocsTable html={\`${toCodeJsx(fmtRawTable(t).trim()).replace(TerraQualityRegex.REGEX_G_REGEX_12(), '\\\\').replace(TerraQualityRegex.REGEX_G_REGEX_18(), '\\`').replace(TerraQualityRegex.REGEX_G_REGEX_16(), '\\$')}\`} />`,
      ),
  );
};

/**
 * Serializes a problem block payload into the custom `ProblemBlock` JSX wrapper.
 *
 * @param b - Problem block record to serialize.
 *
 * @returns `ProblemBlock` JSX wrapper, or fallback Markdown when serialization fails.
 */
const problemBlockMd = (b: Record<string, unknown>): string => {
  try {
    return `<ProblemBlock type=${quote(typeof b._type === 'string' ? b._type : 'unknown')} data={${JSON.stringify(b)}} />`;
  } catch (err: unknown) {
    console.error('[DOCS:content] Failed to serialize problem block.', { type: b._type, err });
    return typeof b.markdown === 'string' ? fromBlockJsx(b.markdown) : '';
  }
};

/**
 * Serializes Portable Text blocks for the editor variant of the docs Markdown pipeline.
 *
 * @param b - Portable Text block to serialize.
 * @param number - Ordered list number for nested list items.
 * @param mode - Output mode to switch between docs and problem formatting.
 *
 * @returns Editor Markdown block, with tables and problem blocks kept in editor-safe JSX.
 */
const editorBlockMd = (b: DocBlock, number = 1, mode: 'docs' | 'problem' = 'docs'): string => {
  if (b._type === 'block') {
    const text = (
      Array.isArray(b.c) && b.c.length > 0 ? b.c : Array.isArray(b.children) ? b.children : []
    )
      .map((s) => {
        if (ptText(s))
          return renderMarks(
            s.text || '',
            Array.isArray(s.marks) ? s.marks : [],
            ptMarkDefs(b.markDefs),
          );
        return isRec(s) && typeof s._type === 'string'
          ? editorBlockMd(s as DocBlock, number, mode)
          : '';
      })
      .join('');
    if (mode === 'docs' && TABLE_TAG.test(text)) {
      const table = atomicTableHtml(text);
      return table ? `\n${editorNestedMd(null, table)}\n` : '';
    }
    if (b.style && TerraQualityRegex.REGEX_H_1_6_U_REGEX().test(b.style))
      return `\n${'#'.repeat(Number(b.style.slice(1)))} ${text}\n`;
    if (b.listItem) return `\n${b.listItem === 'number' ? `${number}.` : '*'} ${text}\n`;
    return text ? `\n${text}\n` : '';
  }
  switch (b._type) {
    case 'accordion':
    case 'tabs': {
      if (mode === 'problem') return problemBlockMd({ ...b });
      const root = b._type === 'tabs' ? 'TabsGroup' : 'AccordionGroup';
      const item = b._type === 'tabs' ? 'TabsItem' : 'AccordionItem';
      return `<${root}>\n\n${(Array.isArray(b.items) ? b.items : []).map((e) => `<${item} title=${quote(e.title || 'Section')}>\n\n${editorNestedMd(e.content, e.markdown || '')}\n\n</${item}>`).join('\n\n')}\n\n</${root}>`;
    }
    case 'callout': {
      const content = editorNestedMd(b.content, b.markdown || '');
      return content
        ? `\n:::${b.kind}${b.title ? `[${b.title}]` : ''}\n\n${content}\n\n:::\n`
        : `\n:::${b.kind}${b.title ? `[${b.title}]` : ''}\n\n:::\n`;
    }
    case 'table': {
      if (mode === 'problem') return problemBlockMd({ ...b });
      const html =
        tableHtml(b.rows || []) || mdTableToHtml(fromBlockJsx(b.markdown || '').trim(), renderMd);
      return html ? `\n${editorNestedMd(null, html)}\n` : '';
    }
    case 'math':
      return `<DocsMath code=${quote(b.code || '')}${b.inline ? ' inline' : ''} />`;
    case 'raw': {
      const raw = atomicTableHtml(fromBlockJsx(b.markdown || '').trim());
      if (!raw && TABLE_TAG.test(fromBlockJsx(b.markdown || '').trim())) return '';
      return TABLE_TAG.test(raw) ? `\n${editorNestedMd(null, raw)}\n` : blockMd(b, number);
    }
    case 'paragraph': {
      const md = fromBlockJsx(b.markdown || '').trim();
      if (!TABLE_TAG.test(md)) return md;
      const table = atomicTableHtml(md);
      return table ? `\n${editorNestedMd(null, table)}\n` : '';
    }
    default:
      return mode === 'problem' &&
        PROBLEM_BLOCK_TYPES.includes(b._type as (typeof PROBLEM_BLOCK_TYPES)[number])
        ? problemBlockMd({ ...b })
        : blockMd(b, number);
  }
};

/*//////////////////////////////////////////////////
EXPORTS
//////////////////////////////////////////////////*/

/**
 * Stringifies the Doc Content Body for the docs.
 *
 * @param body - Structured docs content to serialize.
 *
 * @returns Markdown or MDX source for the provided body, or an empty string for empty input.
 *
 * @remarks
 * Empty bodies return an empty string so callers can short-circuit easily.
 */
export const stringifyDocBody = (body: DocBody | null | undefined): string => {
  trace('serialize.main.start', { blocks: Array.isArray(body) ? body.length : 0 });
  if (!Array.isArray(body) || body.length === 0) return '';
  void {
    length: body.length,
    firstTypes: body
      .slice(0, 6)
      .map((b) => (isRec(b) && typeof b._type === 'string' ? b._type : typeof b)),
  };
  let md = '';
  let number = 1;
  for (let i = 0; i < body.length; i++) {
    const block = body[i];
    if (!block) continue;
    const listNumber =
      listKind(block) === 'number' && listKind(body[i - 1]) === 'number' ? number + 1 : 1;
    const text = sBlockMd(block, listNumber).trim();
    void {
      index: i,
      type: isRec(block) && typeof block._type === 'string' ? block._type : typeof block,
      textLength: text.length,
      textHead: text.slice(0, 120),
    };
    if (!text) continue;
    number = listNumber;
    if (md) {
      const prevList = listKind(body[i - 1]);
      const currList = listKind(block);
      md += prevList && currList && prevList === currList ? '\n' : '\n\n';
    }
    md += text;
  }
  const src = toCodeJsx(md).trim();
  trace('serialize.main.complete', { length: src.length });
  return src;
};

/**
 * Stringifies the Editor Content Body for the docs.
 *
 * @param body - Structured docs content to serialize.
 *
 * @returns MDX source that MDXEditor can reopen without delimiter-rewrite drift.
 *
 * @remarks
 * Accordions, tabs, and tables are emitted as explicit JSX so nested HTML never relies on regex block rewriting.
 */
export const stringifyEditorContentBody = (body: DocBody | null | undefined): string => {
  trace('serialize.editor.start', { blocks: Array.isArray(body) ? body.length : 0 });
  if (!Array.isArray(body) || body.length === 0) return '';
  void {
    length: body.length,
    firstTypes: body
      .slice(0, 6)
      .map((b) => (isRec(b) && typeof b._type === 'string' ? b._type : typeof b)),
  };
  let md = '';
  let number = 1;
  for (let i = 0; i < body.length; i++) {
    const block = body[i];
    if (!block) continue;
    const listNumber =
      listKind(block) === 'number' && listKind(body[i - 1]) === 'number' ? number + 1 : 1;
    const text = editorBlockMd(block, listNumber).trim();
    void {
      index: i,
      type: isRec(block) && typeof block._type === 'string' ? block._type : typeof block,
      textLength: text.length,
      textHead: text.slice(0, 120),
    };
    if (!text) continue;
    number = listNumber;
    if (md) {
      const prevList = listKind(body[i - 1]);
      const currList = listKind(block);
      md += prevList && currList && prevList === currList ? '\n' : '\n\n';
    }
    md += text;
  }
  const src = escDocsTableTemplates(normDocsSpacing(md));
  trace('serialize.editor.complete', { length: src.length });
  return src;
};

/**
 * Handles stringify problem editor content body.
 *
 * @param body - Problem editor body to serialize into Markdown source.
 */
export const stringifyProblemEditorContentBody = (body: DocBody | null | undefined): string => {
  if (!Array.isArray(body) || body.length === 0) return '';
  let md = '';
  let number = 1;
  for (let i = 0; i < body.length; i++) {
    const block = body[i];
    if (!block) continue;
    const list = listKind(block);
    const text = editorBlockMd(
      block,
      list === 'number' && listKind(body[i - 1]) === 'number' ? number + 1 : 1,
      'problem',
    ).trim();
    if (!text) continue;
    if (md) md += list && listKind(body[i - 1]) === list ? '\n' : '\n\n';
    md += text;
    number = list === 'number' ? number + 1 : 1;
  }
  return normDocsSpacing(md);
};

/**
 * Serializes the current leaf content payload without inspecting ver history.
 *
 * @param content - Direct `leaf.content` value or a compatibility wrapper around it.
 *
 * @returns Markdown or MDX for the active document body only.
 *
 * @remarks
 * This is the preferred live-doc read path now that leaf content is stored directly.
 */
export const currDocMd = (content: unknown): string => {
  void {
    kind: typeof content,
    isArray: Array.isArray(content),
    hasContent: Boolean(
      content && typeof content === 'object' && 'content' in (content as Record<string, unknown>),
    ),
  };
  if (typeof content === 'string') {
    return normDocsSpacing(content.trim() === '<Testimonials />' ? TESTIMONIALS_EXPORT : content);
  }
  if (Array.isArray(content)) {
    return normDocsSpacing(stringifyDocBody(content as DocBody));
  }
  if (isRec(content) && Array.isArray(content.content)) {
    return normDocsSpacing(stringifyDocBody(content.content as DocBody));
  }
  if (isRec(content) && typeof content.content === 'string') {
    return normDocsSpacing(
      content.content.trim() === '<Testimonials />' ? TESTIMONIALS_EXPORT : content.content,
    );
  }
  return '';
};
