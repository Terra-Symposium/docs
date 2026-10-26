// @ts-nocheck -- canonical website serializer, now isolated from host imports.
/**
 * astro/src/actions/docs/content.ts
 * Shared helpers for normalizing and serializing docs content versions, syntax, and tables.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { createTrace } from './runtime.js';
import { encodeNodesPayload } from './nodes.js';
import { isEndpointVal } from './shared.js';

// COMPONENTS
import * as TerraQualityRegex from '../regex.mjs';

// DATA
import { TESTIMONIALS_EXPORT } from './shared.js';

// TYPES
import type { DocBlock, DocBody, DocTableCell } from './types.js';
import type { DocsContentPtMarkDef as PtMarkDef, DocsContentPtSpan as PtSpan } from './types.js';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/**
 * Checks whether a value is a plain record.
 *
 * @param val - Candidate value to narrow to a non-array record.
 *
 * @returns True when the value is a non-array object with own properties.
 */
const isRec = (val: unknown): val is Record<string, unknown> => Boolean(val && typeof val === 'object' && !Array.isArray(val));
const trace = createTrace('DOCS:content', false);
trace('module.loaded');

// prettier-ignore
/** Portable Text object types accepted by problem authoring. */
export const PROBLEM_BLOCK_TYPES = [
	'hint', 'headline', 'nodes', 'entity', 'definition', 'countryReference', 'notes', 'photo', 'audio',
	'video', 'choicesReference', 'question', 'prompts', 'timer', 'table', 'map', 'tabs', 'accordion',
] as const;

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Checks whether a value is a Portable Text span node.
 *
 * @param val - Candidate Portable Text node to narrow to a text span.
 *
 * @returns True when the value is a Portable Text span node.
 */
const ptText = (val: unknown): val is PtSpan => isRec(val) && val._type === 'span';

/** Narrows persisted mark definitions before the Markdown serializer reads link fields. */
const ptMarkDefs = (val: unknown): PtMarkDef[] =>
	Array.isArray(val)
		? val.filter((d): d is PtMarkDef => isRec(d) && d._type === 'link' && (d._key === undefined || typeof d._key === 'string') && (d.href === undefined || typeof d.href === 'string'))
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
		const href = defs.find(d => d._key === m && typeof d.href === 'string')?.href;
		return href ? `[${a}](${href})` : a;
	}, text);

/**
 * Reads the list style flag from a Portable Text block, if one was stored.
 *
 * @param val - Portable Text block or other persisted value whose list marker is inspected.
 *
 * @returns Stored list style, or an empty string when the block is not part of a list.
 */
const listKind = (val: unknown): string => (isRec(val) && typeof val.listItem === 'string' ? val.listItem : '');

/**
 * Serializes a string literal so it can be embedded safely in JSX attributes.
 *
 * @param value - String literal to quote.
 *
 * @returns A quoted string literal that can survive MDX parsing unchanged.
 */
const quote = (val: string): string => JSON.stringify(val);

/**
 * Escapes HTML control characters before text is embedded in serialized docs markup.
 *
 * @param value - HTML text to escape.
 *
 * @returns Text with HTML metacharacters escaped for serialization.
 */
const escHtml = (val: string): string =>
	val
		.replace(TerraQualityRegex.REGEX_G_REGEX_17(), '&amp;')
		.replace(TerraQualityRegex.REGEX_G_REGEX_23(), '&lt;')
		.replace(TerraQualityRegex.REGEX_G_REGEX_24(), '&gt;')
		.replace(TerraQualityRegex.REGEX_G_REGEX_5(), '&quot;')
		.replace(TerraQualityRegex.REGEX_G_REGEX_4(), '&#39;');

/**
 * Extracts readable text from nested docs content when structured serializers cannot recover it.
 *
 * @param val - Nested docs content or leaf payload.
 *
 * @returns Plain text recovered from the input.
 */
const bodyText = (val: unknown): string => {
	if (typeof val === 'string') return val;
	if (!val) return '';
	if (Array.isArray(val)) return val.map(bodyText).join('');
	if (!isRec(val)) return '';
	if (typeof val.text === 'string') return val.text;
	if (typeof val.markdown === 'string' && val.markdown.trim()) return fromBlockJsx(val.markdown).replace(TerraQualityRegex.REGEX_G_REGEX_22(), '');
	if (typeof val.html === 'string' && val.html.trim()) return val.html.replace(TerraQualityRegex.REGEX_G_REGEX_22(), ' ');
	const children = Array.isArray(val.children) ? val.children : [];
	return bodyText(children.length > 0 ? children : (val.c ?? val.content ?? val.body ?? []));
};

/*//////////////////////////////////////////////////
BLOCK SYNTAX
//////////////////////////////////////////////////*/

/**
 * Registry of the custom accordion and tabs block syntaxes used in docs content.
 *
 * @remarks
 * The registry is intentionally tiny so the parser can stay predictable.
 */
const BLOCKS = [
	{ id: 'accordion', syntax: '===', root: 'AccordionGroup', item: 'AccordionItem', label: 'Accordion' },
	{ id: 'tabs', syntax: '|||', root: 'TabsGroup', item: 'TabsItem', label: 'Tabs' },
] as const;

/**
 * Handles docs editor mount ids.
 *
 * @param source - Source text containing the Docs blocks to parse.
 */
export const docsEditorMountIds = (src: string): string[] => {
	return [
		'root',
		...Array.from(
			toBlockJsx(src)
				.replace(/```[\s\S]*?```/g, '')
				.replace(TerraQualityRegex.REGEX_CODE_B_S_S_CODE_G_REGEX(), '')
				.replace(/<TabsGroup\b[^>]*>([\s\S]*?)<\/TabsGroup>/g, (g, i: string) => `${g.slice(0, g.indexOf('>') + 1)}${i.match(/<TabsItem\b[\s\S]*?<\/TabsItem>/)?.[0] || ''}</TabsGroup>`)
				.matchAll(/<(AccordionGroup|AccordionItem|TabsGroup|DocsTable|Nodes)\b/g),
			m => `${m[1]}:${m.index}`,
		),
	];
};

/** Returns stable mount identifiers for every asynchronous Docs editor renderer. */
/**
 * Separates compact tabs markers before they reach the line-based block parser.
 *
 * @param md - Markdown or MDX source containing docs block markers.
 *
 * @returns Source with tab labels, bodies, and adjacent delimiters on distinct lines.
 */
const normBlockMarkers = (md: string): string =>
	md
		.replace(/([^\n])[ \t]+(?=\|\|\|(?:[ \t]*(?:\|\|\||$)))/g, '$1\n\n')
		.replace(/(\|\|\|[ \t]*\[[^\]\n]*\])[ \t]+(?=\S)/g, '$1\n\n')
		.replace(/(^|\n)[ \t]*\|\|\|[ \t]+(?=\|\|\|[ \t]*\[)/gm, '$1|||\n\n');

/**
 * Rewrites the supported docs block markers into their JSX wrapper forms.
 *
 * @param md - Markdown or MDX source to normalize.
 *
 * @return Source where supported block markers have been rewritten to their JSX wrappers.
 *
 * @remarks
 * Only the supported block syntaxes are rewritten; everything else is preserved.
 */
export function toBlockJsx(md: string): string {
	if (!md) return '';
	const code = new Map<string, string>();
	const lns = normBlockMarkers(md)
		.replace(TerraQualityRegex.REGEX_CODE_B_S_S_CODE_G_REGEX(), m => {
			const key = `TERRA_CODE_${code.size}`;
			code.set(key, m);
			return key;
		})
		.replace(TerraQualityRegex.REGEX_S_S_N_G_REGEX(), m => {
			let res = '';
			for (let i = 0; i < m.length; i++) res += m[i] && ['{', '}', '<', '>'].includes(m[i]) && (i === 0 || m[i - 1] !== '\\') ? '\\' + m[i] : (m[i] ?? '');
			return res;
		})
		.replace(TerraQualityRegex.REGEX_XA0_U2002_U2003_U200B_G_REGEX(), ' ')
		.split(TerraQualityRegex.REGEX_R_N_REGEX());
	const res: string[] = [];
	let icode = false;
	const grp = new Set<string>();
	const itm = new Set<string>();
	for (let i = 0; i < lns.length; i++) {
		const line = lns[i];
		const t = line.trimStart();
		const tClean = t.trimEnd();
		if (t.startsWith('```')) {
			icode = !icode;
			res.push(t);
			continue;
		}
		if (icode) {
			res.push(line);
			continue;
		}
		const _m = BLOCKS.find(b => tClean.startsWith(b.syntax));
		if (_m) {
			const rM = tClean.match(new RegExp(`^${_m.syntax.replace(TerraQualityRegex.REGEX_G_REGEX_9(), '\\$&')}(?:\\s*\\[(.*?)\\])?$`));
			if (tClean === _m.syntax) {
				if (itm.has(_m.item)) {
					res.push('', `</${_m.item}>`);
					itm.delete(_m.item);
				}
				let nIsSameGroup = false;
				for (let j = i + 1; j < lns.length; j++) {
					const nLine = lns[j]?.trim();
					if (!nLine) continue;
					if (nLine.startsWith(_m.syntax) && nLine !== _m.syntax) nIsSameGroup = true;
					break;
				}
				if (!nIsSameGroup && grp.has(_m.label)) {
					res.push(`</${_m.root}>`, '');
					grp.delete(_m.label);
				}
			} else if (rM) {
				if (itm.has(_m.item)) {
					res.push('', `</${_m.item}>`);
					itm.delete(_m.item);
				}
				if (!grp.has(_m.label)) {
					res.push('', `<${_m.root}>`);
					grp.add(_m.label);
				}
				res.push(`<${_m.item} title=${quote(rM?.[1] || 'Section')}>`, '');
				itm.add(_m.item);
			} else res.push(t);
			continue;
		}
		res.push(line);
	}
	for (const label of grp) {
		const b = BLOCKS.find(x => x.label === label);
		if (b) {
			if (itm.has(b.item)) {
				res.push('', `</${b.item}>`);
				itm.delete(b.item);
			}
			res.push(`</${b.root}>`, '');
		}
	}
	const n = res.join('\n');
	return code.size ? n.replace(TerraQualityRegex.REGEX_TERRA_CODE_D_G_REGEX(), k => code.get(k) || k) : n;
}

/**
 * Restores the custom docs JSX wrappers back to the markdown block syntax they came from.
 *
 * @param jsx - Canonical JSX source to restore.
 *
 * @return Markdown where supported docs JSX wrappers have been converted back to block syntax.
 *
 * @remarks
 * This is the inverse of `toBlockJsx` for the supported docs block shapes.
 */
export function fromBlockJsx(jsx: string): string {
	if (!jsx) return '';
	const code = new Map<string, string>();
	let _rs = toCodeJsx(jsx)
		.replace(/<Code\b[\s\S]*?<\/Code>/g, m => {
			const key = `TERRA_CODE_${code.size}`;
			code.set(key, m);
			return key;
		})
		.replace(/^\\?=\\?=\\?=/gm, '===')
		.replace(/^\\?\|\\?\|\\?\|/gm, '|||')
		.replace(/^\\?:\\?:\\?:/gm, ':::')
		.replace(/^(===|\|\|\||\^\^\^|:::)[ \t]*\\?\[(.*?)\\?\]/gm, (_m, p, c) => `${p}[${c.replace(/\\\]/g, ']').replace(/\\\[/g, '[')}]`);
	_rs = _rs
		.replace(TerraQualityRegex.REGEX_XA0_U2002_U2003_U200B_G_REGEX(), ' ')
		.replace(/<DocsMath\b([\s\S]*?)code=(?:\{\s*("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)\s*\}|(["'])([\s\S]*?)\3)([\s\S]*?)\/>/gi, (_m, p, e, _quote, s, v) => {
			// prettier-ignore
			const parsed = e
					? e.startsWith('`')
						? e.slice(1, -1).replace(TerraQualityRegex.REGEX_G_REGEX_15(), '`').replace(TerraQualityRegex.REGEX_G_REGEX_14(), '$').replace(TerraQualityRegex.REGEX_G_REGEX_13(), '\\')
						: e.startsWith('"') ? JSON.parse(e.replace(TerraQualityRegex.REGEX_N_G_REGEX_3(), '\\n')) : e.slice(1, -1).replace(/\\([`'"])/g, '$1')
					: s;
			return TerraQualityRegex.REGEX_BINLINE_B_I_REGEX().test(p) || TerraQualityRegex.REGEX_BINLINE_B_I_REGEX().test(v) ? `$${parsed}$` : `\n\n$$${parsed}$$\n\n`;
		})
		.replace(TerraQualityRegex.REGEX_S_S_N_G_REGEX(), _m => _m.replace(/\\\{/g, '{').replace(/\\\}/g, '}').replace(/\\</g, '<').replace(/\\>/g, '>'));
	_rs = _rs.replace(/(<\/?(?:AccordionGroup|TabsGroup|AccordionItem|TabsItem)\b[^>]*>)/g, '\n$1\n').replace(TerraQualityRegex.REGEX_N_3_G_REGEX(), '\n\n');
	if (code.size) _rs = _rs.replace(TerraQualityRegex.REGEX_TERRA_CODE_D_G_REGEX(), k => code.get(k) || k);
	const lns = _rs.split('\n');
	const out: string[] = [];
	let icode = false;
	let pad = '';
	for (let i = 0; i < lns.length; i++) {
		const raw = lns[i] || '';
		const t = raw.trimStart();
		if (t.startsWith('```')) {
			icode = !icode;
			if (icode) pad = raw.match(/^[ \t]*/)?.[0] || '';
			out.push(t);
			continue;
		}
		if (icode) {
			out.push(raw.startsWith(pad) ? raw.slice(pad.length) : t);
			continue;
		}
		if (BLOCKS.find(b => t === `<${b.root}>`)) {
			out.push('');
			continue;
		}
		if (BLOCKS.find(b => t === `</${b.root}>`)) {
			out.push('');
			continue;
		}
		if (
			BLOCKS.find(b => {
				const match = t.match(new RegExp(`^<${b.item}\\b[^>]*title="([^"]*)"[^>]*>$`));
				if (!match) return false;
				out.push(`\n\n${b.syntax}[${match[1] || 'Section'}]\n\n`);
				return true;
			})
		)
			continue;
		const itemClose = BLOCKS.find(b => t === `</${b.item}>`);
		if (itemClose) {
			out.push(`\n\n${itemClose.syntax}\n\n`);
			continue;
		}
		if (t.length === 0) {
			out.push('');
			continue;
		}
		if (/^(===|\|\|\||\^\^\^|:::)/.test(t)) {
			out.push(t);
			continue;
		}
		out.push(raw.replace(/^[ \t]{1,8}/, ''));
	}
	return /* prettier-ignore */ out.join('\n').replace(TerraQualityRegex.REGEX_N_3_G_REGEX(), '\n\n').trim() + '\n';
}

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
const codeAttrs = (lang?: string): string => (lang?.trim() ? ` language=${JSON.stringify(lang.trim())}` : '');

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
			const unwrapped = match[1].replace(TerraQualityRegex.REGEX_G_REGEX_11(), '$1').replace(TerraQualityRegex.REGEX_N_G_REGEX_2(), '\n');
			if (unwrapped === n) break;
			n = unwrapped;
		}
		return n.replace(/\\r\\n|\\n|\\r/g, m => (m === '\\r' ? '\r' : '\n'));
	}
	if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') return String(val);
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
export const codeSrcJsx = (lang: string | undefined, src: string): string => `\n<Code${codeAttrs(lang)} source=${quote(src)} />\n`;

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
	if (res.includes('<pre><code')) res = res.replace(/<pre><code(?:\s+class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/gi, (_, l: string, v: string) => codeJsx(l || '', v));
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
	res = res.replace(/<Code\b([\s\S]*?)\s+code=(?:"([\s\S]*?)"|\{`((?:\\.|[^`])*?)`\})\s*\/>/g, (_match, p, q, e) => {
		return `<Code${p} source=${quote(e !== undefined ? e.replace(TerraQualityRegex.REGEX_G_REGEX_11(), '$1') : q)} />`;
	});
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
export const mdTableToHtml = (md: string, renderCell: (val: string) => string = escHtml): string | null => {
	const lines = md.replace(TerraQualityRegex.REGEX_R_N_G_REGEX(), '\n').trim().split('\n');
	if (lines.length < 2 || lines.some(l => !l.trim())) return null;
	const rows = lines.map(line => {
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
	if (!width || rows.some(r => r.length !== width) || !rows[1]?.every(val => /^:?-{3,}:?$/u.test(val.trim()))) return null;

	// prettier-ignore
	const body = rows.slice(2).map(r => `<tr>${r.map(c => `<td>${renderCell(c)}</td>`).join('')}</tr>`).join('');
	return `<table><thead><tr>${/* prettier-ignore */ rows[0].map(renderCell).map(c => `<th>${c}</th>`).join('')}</tr></thead>${body ? `<tbody>${body}</tbody>` : ''}</table>`;
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
const renderMd = (val: string): string => {
	const text = val.trim();
	if (!text) return '';
	const code = text.match(/^```([^\n`]*)\n([\s\S]*?)\n```$/);
	if (code) return `<pre><code${code[1]?.trim() ? ` class="language-${escHtml(code[1].trim())}"` : ''}>${escHtml(code[2] || '')}</code></pre>`;
	const codes: string[] = [];
	const lines = text.split(/\n{2,}/);
	let html = escHtml(text)
		.replace(/`([^`]+)`/g, (_, c: string) => {
			codes.push(`<code>${escHtml(c)}</code>`);
			return `__CODE_${codes.length - 1}__`;
		})
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, l: string, h: string) => `<a href="${escHtml(h)}">${l}</a>`)
		.replace(TerraQualityRegex.REGEX_S_S_G_REGEX(), '<strong>$1</strong>')
		.replace(TerraQualityRegex.REGEX_N_G_REGEX(), (_, a: string, b: string, v: string) => `${a}<em>${b}</em>${v}`)
		.replace(TerraQualityRegex.REGEX_N_G_REGEX_3(), '<br />');
	codes.forEach((c, i) => {
		html = html.replace(`__CODE_${i}__`, c);
	});
	if (lines.length > 1) return lines.map(l => `<p>${renderMd(l)}</p>`).join('');
	return html;
};

/**
 * Handles strip nested anchors.
 *
 * @param val - Table cell markup to sanitize before it is embedded in a Docs table.
 */
export const stripNestedAnchors = (val: string): string => val.replace(/<a([^>]*)>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/a>/gi, '<a$1>$2</a>').replace(/\[\[([^\]]+)\]\(([^)]+)\)\]\(\2\)/g, '[$1]($2)');

/**
 * Handles sanitize table html.
 *
 * @param val - Table markup whose inline styles should be removed.
 */
export const sanitizeTableHtml = (val: string): string => val.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '').replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

/**
 * Formats raw table HTML with consistent indentation so docs tables round-trip cleanly.
 *
 * @param value - Table HTML to format.
 *
 * @returns Formatted table HTML string with stable indentation.
 */
const fmtRawTable = (val: string): string => {
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
		.map(l => l.trim())
		.filter(Boolean)
		.map(l => {
			if (/^<\/(?:table|thead|tbody|tfoot|tr|th|td|ul|ol)\b[^>]*>$/iu.test(l)) depth = Math.max(0, depth - 1);
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
const atomicTableHtml = (val: string): string => {
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
	let n = protectMarkupBlocks(protectMarkupBlocks(normBlockMarkers(toCodeJsx(src).replace(/(<Code\b[^>]*>\s*\{`(?:\\.|[^`])*`\})(?!\s*<\/Code>)/g, '$1\n</Code>')), 'Code', blocks), 'table', blocks);
	for (let i = 0; i < 4; i++) {
		n = n
			.replace(/([^\n])\s+(?=(?:#{1,6}\s+|===|\|\|\||:::(?![A-Za-z])))/g, '$1\n\n')
			.replace(/([^\n])\s+(?=:::[A-Za-z])/g, '$1\n\n')
			.replace(/^(?:===|\|\|\||:::[A-Za-z][\w-]*)(?:\[[^\]]*\])?\s+(?=\S)/gm, m => `${m.trimEnd()}\n\n`)
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
		.flatMap(l => {
			const heading = l.match(/^(#{1,6}\s+)(.+)$/);
			if (!heading) return [l];
			const words = heading[2].trim().split(TerraQualityRegex.REGEX_S_REGEX_2()).filter(Boolean);
			if (words.length < 2) return [l];
			let cap = 0;
			for (const word of words) {
				if (/^[A-Z0-9]/.test(word)) cap++;
				else break;
			}
			if (cap < 2) return [l];
			if (!words.slice(cap).some(w => /[a-z]/.test(w))) return [l];
			return [`${heading[1]}${words.slice(0, Math.max(1, cap - 1)).join(' ')}`, '', words.slice(Math.max(1, cap - 1)).join(' ')];
		})
		.join('\n')
		.replace(TerraQualityRegex.REGEX_N_3_G_REGEX(), '\n\n');
	return blocks
		.reduceRight((o, b, i) => o.replace(new RegExp(`TERRA_PROTECTED_${i}__`, 'g'), b), n)
		.replace(/(<\/Code>)[ \t]*(\d+)(?=\s|$)/g, '$1')
		.replace(/(<\/Code>)\n+\s*(\d+)\s*(?=\n|$)/g, '$1')
		.replace(/^(#{1,6})[ \t]*\n[ \t]*(?:\n[ \t]*)?(\d+\.\s+\S[^\n]*)/gm, (m, h: string, i: string, o: number, v: string) => (/^\n\s*\d+\.\s/.test(v.slice(o + m.length)) ? m : `${h} ${i}`))
		.trim();
};

/**
 * Renders a Portable Text table block into HTML with a header row followed by body rows.
 *
 * @param rows - Table rows to serialize.
 *
 * @returns HTML table markup for the stored Portable Text rows.
 */
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
			.map(cell => {
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
						else if (body) html = sanitizeTableHtml(TerraQualityRegex.REGEX_TABLE_B_I_REGEX().test(body) ? body : renderMd(body));
						else {
							const md = fromBlockJsx(cell.markdown || '').trim();
							const fallback = mdTableToHtml(md, renderMd);
							if (fallback) html = sanitizeTableHtml(fallback);
							else if (TerraQualityRegex.REGEX_TABLE_B_I_REGEX().test(md)) html = sanitizeTableHtml(md);
							else {
								const text = bodyText(cell.content) || bodyText(cell.markdown) || bodyText(cell.html);
								html = text ? sanitizeTableHtml(renderMd(text)) : '';
							}
						}
					}
				}
				if (html.includes('\n') || /<(?:p|ul|ol|table|pre|div)\b/i.test(html)) {
					let depth = 0;
					return `\t\t<${tag}>\n${html
						.split(TerraQualityRegex.REGEX_R_N_REGEX())
						.map(l => l.trim())
						.filter(Boolean)
						.map(l => {
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
		return isRec(block) && typeof block._type === 'string' ? blockMd(block as DocBlock, number) : '';
	} catch (err) {
		if (isRec(block) && typeof block.markdown === 'string') return fromBlockJsx(block.markdown);
		console.error('[DOCS:content] Failed to serialize block.', { type: isRec(block) && typeof block._type === 'string' ? block._type : typeof block, err });
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
		const text = (Array.isArray(b.c) && b.c.length > 0 ? b.c : Array.isArray((b as { children?: unknown[] }).children) ? (b as { children: unknown[] }).children : [])
			.map(c => {
				if (ptText(c)) return renderMarks(c.text || '', Array.isArray(c.marks) ? c.marks : [], ptMarkDefs(b.markDefs));
				return isRec(c) && typeof c._type === 'string' ? sBlockMd(c, number) : '';
			})
			.join('');
		if (TABLE_TAG.test(text)) {
			const table = atomicTableHtml(text);
			return table ? `\n${table}\n` : '';
		}
		if (b.style && TerraQualityRegex.REGEX_H_1_6_U_REGEX().test(b.style)) return `\n${'#'.repeat(Number(b.style.slice(1)))} ${text}\n`;
		if (b.listItem) return `\n${b.listItem === 'number' ? `${number}.` : '*'} ${text}\n`;
		return text ? `\n${text}\n` : '';
	}
	switch (b._type) {
		case 'accordion':
		case 'tabs': {
			const syntax = b._type === 'tabs' ? '|||' : '===';
			return (Array.isArray(b.items) ? b.items : [])
				.map(t => {
					const content = nestedMd(t.content, t.markdown || '');
					return content ? `\n${syntax}[${t.title}]\n\n${content}\n\n${syntax}\n` : `\n${syntax}[${t.title}]\n\n${syntax}\n`;
				})
				.join('');
		}
		case 'callout': {
			const content = nestedMd(b.content, b.markdown || '');
			return content ? `\n:::${b.kind}${b.title ? `[${b.title}]` : ''}\n\n${content}\n\n:::\n` : `\n:::${b.kind}${b.title ? `[${b.title}]` : ''}\n\n:::\n`;
		}
		case 'code': {
			const val = stringifyCodeValue(b.value);
			return `\n${b.source ? codeSrcJsx(b.language, b.source) : isEndpointVal(val) ? codeSrcJsx(b.language, val) : codeJsx(b.language, val)}\n`;
		}
		case 'embed':
			return `\n<Embed ${Object.entries({ src: b.src, title: b.title, width: b.width, height: b.height } as Record<string, unknown>)
				.filter(([, v]) => v !== undefined && v !== null && v !== '')
				.map(([k, v]) => {
					if (v === true) return k;
					if (typeof v === 'string') return `${k}=${quote(v)}`;
					if (typeof v === 'number' || typeof v === 'boolean') return `${k}={${String(v)}}`;
					return `${k}={${JSON.stringify(v)}}`;
				})
				.join(' ')} />\n`;
		case 'heading':
			return `\n${'#'.repeat(b.depth)} ${b.text}\n`;
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
			return b.markdown?.trim() === '<Testimonials />' ? TESTIMONIALS_EXPORT : fmtRawTable(fromBlockJsx(b.markdown || ''));
		case 'table': {
			const html = tableHtml(b.rows || []);
			if (html) return `\n${html}\n`;
			const md = fromBlockJsx(b.markdown || '').trim();
			const fallback = mdTableToHtml(md, renderMd);
			return fallback ? `\n${fallback}\n` : md ? `\n${md}\n` : '';
		}
		case 'tsDocs':
			return `\n<TsDocs scope=${quote(b.scope || '')} />\n`;
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
	md.replace(/<DocsTable\b[\s\S]*?html=\{`([\s\S]*?)`\}\s*\/>/g, (_match, h: string) => `<DocsTable html={\`${h.replace(/(?<!\\)`/g, '\\`').replace(/(?<!\\)\$\{/g, '\\${')}\`} />`);

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
		escDocsTableTemplates(Array.isArray(body) && body.length > 0 ? stringifyEditorContentBody(body) : fromBlockJsx(markdown || '').trim())
			.replace(/<DocsTable\s+html=\{`(?:\\.|[^`])*`\}\s*\/>/g, m => {
				tables.push(m);
				return `TERRA_EDITOR_TABLE_${tables.length - 1}`;
			})
			.replace(
				TerraQualityRegex.REGEX_TABLE_B_S_S_TABLE_GI_REGEX(),
				t =>
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
		const text = (Array.isArray(b.c) && b.c.length > 0 ? b.c : Array.isArray((b as { children?: unknown[] }).children) ? (b as { children: unknown[] }).children : [])
			.map(s => {
				if (ptText(s)) return renderMarks(s.text || '', Array.isArray(s.marks) ? s.marks : [], ptMarkDefs(b.markDefs));
				return isRec(s) && typeof s._type === 'string' ? editorBlockMd(s as DocBlock, number, mode) : '';
			})
			.join('');
		if (mode === 'docs' && TABLE_TAG.test(text)) {
			const table = atomicTableHtml(text);
			return table ? `\n${editorNestedMd(null, table)}\n` : '';
		}
		if (b.style && TerraQualityRegex.REGEX_H_1_6_U_REGEX().test(b.style)) return `\n${'#'.repeat(Number(b.style.slice(1)))} ${text}\n`;
		if (b.listItem) return `\n${b.listItem === 'number' ? `${number}.` : '*'} ${text}\n`;
		return text ? `\n${text}\n` : '';
	}
	switch (b._type) {
		case 'accordion':
		case 'tabs': {
			if (mode === 'problem') return problemBlockMd({ ...b });
			const root = b._type === 'tabs' ? 'TabsGroup' : 'AccordionGroup';
			const item = b._type === 'tabs' ? 'TabsItem' : 'AccordionItem';
			return `<${root}>\n\n${(Array.isArray(b.items) ? b.items : []).map(e => `<${item} title=${quote(e.title || 'Section')}>\n\n${editorNestedMd(e.content, e.markdown || '')}\n\n</${item}>`).join('\n\n')}\n\n</${root}>`;
		}
		case 'callout': {
			const content = editorNestedMd(b.content, b.markdown || '');
			return content ? `\n:::${b.kind}${b.title ? `[${b.title}]` : ''}\n\n${content}\n\n:::\n` : `\n:::${b.kind}${b.title ? `[${b.title}]` : ''}\n\n:::\n`;
		}
		case 'table': {
			if (mode === 'problem') return problemBlockMd({ ...b });
			const html = tableHtml(b.rows || []) || mdTableToHtml(fromBlockJsx(b.markdown || '').trim(), renderMd);
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
			return mode === 'problem' && PROBLEM_BLOCK_TYPES.includes(b._type as (typeof PROBLEM_BLOCK_TYPES)[number]) ? problemBlockMd({ ...b }) : blockMd(b, number);
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
	void { length: body.length, firstTypes: body.slice(0, 6).map(b => (isRec(b) && typeof b._type === 'string' ? b._type : typeof b)) };
	let md = '';
	let number = 1;
	for (let i = 0; i < body.length; i++) {
		const block = body[i];
		const listNumber = listKind(block) === 'number' && listKind(body[i - 1]) === 'number' ? number + 1 : 1;
		const text = sBlockMd(block, listNumber).trim();
		void { index: i, type: isRec(block) && typeof block._type === 'string' ? block._type : typeof block, textLength: text.length, textHead: text.slice(0, 120) };
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
	void { length: body.length, firstTypes: body.slice(0, 6).map(b => (isRec(b) && typeof b._type === 'string' ? b._type : typeof b)) };
	let md = '';
	let number = 1;
	for (let i = 0; i < body.length; i++) {
		const block = body[i];
		const listNumber = listKind(block) === 'number' && listKind(body[i - 1]) === 'number' ? number + 1 : 1;
		const text = editorBlockMd(block, listNumber).trim();
		void { index: i, type: isRec(block) && typeof block._type === 'string' ? block._type : typeof block, textLength: text.length, textHead: text.slice(0, 120) };
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
		const list = listKind(block);
		const text = editorBlockMd(block, list === 'number' && listKind(body[i - 1]) === 'number' ? number + 1 : 1, 'problem').trim();
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
		hasContent: Boolean(content && typeof content === 'object' && 'content' in (content as Record<string, unknown>)),
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
		return normDocsSpacing(content.content.trim() === '<Testimonials />' ? TESTIMONIALS_EXPORT : content.content);
	}
	return '';
};
