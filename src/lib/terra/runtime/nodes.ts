/**
 * astro/src/actions/docs/nodes.ts
 * Pure utility functions for parsing and rendering node blocks.
 * Extracted from the React component to prevent circular dependencies.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { createTrace, validateType } from './runtime.js';
import { parse as fromYaml } from 'yaml';

// COMPONENTS
import * as TerraQualityRegex from '../regex.mjs';

// TYPES
import type { DocsNodesDraft as Draft, Field, Md } from './types.js';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

const trace = createTrace('DOCS:nodes', false);
trace('module.loaded');

/**
 * Canonical fallback `Nodes` block used when a document has no explicit graph markup.
 *
 * @remarks
 * The template keeps the editor and migration paths aligned on a minimal valid node payload.
 */
export const EMPTY_NODES = `\n\n<Nodes\n  node_data={[\n    { id: 'start', type: 'origin', data: { title: 'Start' } }\n  ]}\n  edges_data={[]}\n  direction="TB"\n  height={400}\n/>\n\n`;

/**
 * Handles the nodes route.
 */
export const NODES = {
  empty: EMPTY_NODES,
  jsx: EMPTY_NODES,
  fields:
    /*
     * Validated UI node mappings matching structural attributes and parsing constraints.
     */ [
      {
        key: 'direction',
        kind: 'string',
        label: 'Direction',
        placeholder: 'TB or LR',
        tooltip: 'Graph flow direction.',
      },
      {
        key: 'nodes',
        kind: 'expression',
        label: 'Nodes',
        placeholder: '[...]',
        textarea: true,
        tooltip: 'Node defs.',
      },
      {
        key: 'edges',
        kind: 'expression',
        label: 'Edges',
        placeholder: '[...]',
        textarea: true,
        tooltip: 'Edge defs.',
      },
      {
        key: 'height',
        kind: 'expression',
        label: 'Height',
        placeholder: '384',
        tooltip: 'Canvas height.',
      },
      {
        key: 'nodeSep',
        kind: 'expression',
        label: 'node_sep',
        placeholder: '50',
        tooltip: 'Node x-spacing.',
      },
      {
        key: 'rankSep',
        kind: 'expression',
        label: 'rank_sep',
        placeholder: '5',
        tooltip: 'Rank y-spacing.',
      },
      {
        key: 'proximityConnect',
        kind: 'boolean',
        label: 'proximity',
        tooltip: 'Enable auto-connect.',
      },
    ] as const satisfies readonly /** Editor metadata describing a supported JSX attribute in a Docs `Nodes` block. */ {
      key: string;
      kind: 'boolean' | 'expression' | 'string';
      label: string;
      placeholder?: string;
      textarea?: boolean;
      tooltip: string;
    }[],
  import: "import Nodes from '@src/pages/docs/blocks/nodes';",
  keys: {
    direction: 'direction',
    edges: 'edges_data',
    height: 'height',
    nodeSep: 'node_sep',
    nodes: 'node_data',
    proximityConnect: 'proximity_connect',
    rankSep: 'rank_sep',
  } as const,
  rx: {
    block: /(?:^|\n)[ \t\xA0]*\^\^\^[ \t]*\r?\n([\s\S]*?)\r?\n[ \t\xA0]*\^\^\^[ \t]*(?=\n|$)/g,
    import:
      /^import\s+Nodes\s+from\s+['"]@(?:src|pages)\/pages\/docs\/(?:_components\/(?:blocks\/nodes|docs\/(?:editor\/nodes|scaffold\/nodes|nodes))|components\/_Nodes)['"];\s*\n?/m,
    tag: /<Nodes\b[\s\S]*?\/>/g,
    meta: /\b(nodes|edges|direction|height|nodeSep|rankSep|proximityConnect)=\{metadata\.([A-Za-z0-9_$]+)\}/g,
  },
  inline: (content: string, meta: Md = {}): string => {
    trace('inline.start', { length: content.length });
    const n = content
      ?.replace(NODES.rx.import, '')
      ?.replace(NODES.rx.tag, (c) => {
        const vals: Draft = Object.fromEntries(
          Object.entries(properties(c)).map(([k, v]) => [k, `${v ?? ''}`]),
        );
        const result: Record<string, unknown> = {};
        for (const field of NODES.fields) {
          const content = Object.hasOwn(vals, field.key) ? vals[field.key] : undefined;
          if (field.kind === 'boolean') {
            if (content) result[NODES.keys[field.key]] = true;
            continue;
          }
          if (typeof content === 'string' && content.trim()) {
            const trimmed = content.trim();
            const key = trimmed.match(/^metadata\.([A-Za-z0-9_$]+)$/)?.[1];
            if (key) {
              result[NODES.keys[field.key]] = meta[key];
            } else result[NODES.keys[field.key]] = scalar(trimmed);
          }
        }
        return jsx(result);
      })
      ?.replace(NODES.rx.block, (_, p: string) => {
        // prettier-ignore
        const src = p.replace(/^\s*```[a-z]*\r?\n/i, '').replace(/\r?\n\s*```\s*$/i, '').split('\n').map(l => l.replace(/^[ \t]*(?:>\s*)+/u, '')).join('\n').trim();
        if (!src)
          return jsx({
            node_data: [{ id: 'start', type: 'terminator', data: { title: 'Start' } }],
            edges_data: [],
          });
        const recs: string[] = [];
        const statements: string[] = [];
        for (const line of src.split('\n')) {
          if (!line.trim()) {
            recs.push(line);
            continue;
          }
          if (TerraQualityRegex.REGEX_A_ZA_Z_W_S_U_REGEX().test(line.trim())) {
            statements.push(line);
            continue;
          }
          recs.push(line);
        }
        const san = recs.join('\n').trim();
        const assignmentVals: Record<string, unknown> = {};
        // prettier-ignore
        for (const line of statements.join('\n').split('\n').map(x => x.trim()).filter(Boolean)) {
				let i = 0;
				while (i < line.length) {
					const el = line.slice(i).match(/^([A-Za-z_$][\w$]*)\s*=\s*/u);
					const attributeName = el?.[1];
					if (!el || !attributeName) break;
					i += el[0].length;
					let v = '';
					let depth = 0;
					let mQuote: '"' | "'" | '`' | null = null;
					while (i < line.length) {
						const char = line[i];
						if (mQuote) {
							v += char;
							if (char === '\\') {
								v += line[i + 1] ?? '';
								i += 2;
								continue;
							}
							if (char === mQuote) mQuote = null;
							i++;
							continue;
						}
						if (char === '"' || char === "'" || char === '`') {
							mQuote = char;
							v += char;
							i++;
							continue;
						}
						if (char === '[' || char === '{' || char === '(') {
							depth++;
							v += char;
							i++;
							continue;
						}
						if (char === ']' || char === '}' || char === ')') {
							depth = Math.max(0, depth - 1);
							v += char;
							i++;
							continue;
						}
							if (depth === 0 && TerraQualityRegex.REGEX_S_U_REGEX().test(char ?? '') && TerraQualityRegex.REGEX_A_ZA_Z_W_S_U_REGEX().test(line.slice(i).trimStart())) break;
						v += char;
						i++;
					}
					const trimmed = v.trim();
						assignmentVals[attributeName] = scalar((trimmed.match(/^\{([^{}\n]+)\}$/u)?.[1]?.trim() ?? (/^\{[-\w.'"`$]+\}$/u.test(trimmed) ? trimmed.slice(1, -1).trim() : null)) ?? trimmed);
						while (i < line.length && TerraQualityRegex.REGEX_S_U_REGEX().test(line[i] ?? '')) i++;
				}
			}
        const asgn = Object.keys(assignmentVals).length ? assignmentVals : null;
        let parsed: Record<string, unknown> | null = null;
        if (san) {
          try {
            parsed = fromYaml(san) as Record<string, unknown>;
          } catch {
            parsed = null;
          }
        }
        if (!parsed) {
          if (asgn) parsed = asgn;
          else {
            try {
              parsed = Function(`"use strict"; return ({\n${loose(src)}\n});`)() as Record<
                string,
                unknown
              >;
            } catch {
              parsed = null;
            }
          }
        } else if (asgn && validateType(['object'], parsed)) parsed = { ...parsed, ...asgn };
        if (!parsed || !validateType(['object'], parsed) || Array.isArray(parsed)) return _;
        return jsx(
          Object.fromEntries(
            Object.entries(parsed).flatMap(([k, c]) => {
              const field =
                new Map<string, Field['key']>(
                  Object.entries(NODES.keys).map(([f, s]) => [s, f as Field['key']]),
                ).get(k) ?? (FIELDS.has(k) ? (k as Field['key']) : null);
              if (!field) return [];
              return [[NODES.keys[field as keyof typeof NODES.keys], c]];
            }),
          ),
        );
      });
    trace('inline.complete', {
      inputLength: content.length,
      outputLength: n?.length ?? 0,
      hasNodes: n?.includes('<Nodes'),
    });
    return n;
  },
} as const;

/**
 * Encodes node payload arrays into a serializer-safe string literal.
 *
 * @remarks
 * A template literal keeps the payload readable while preventing mdxeditor from compacting the
 * payload back into a raw array expression during code/edit round-trips.
 *
 * @param value - Node or edge array to encode for safe serializer round-tripping.
 */
export const encodeNodesPayload = (val: unknown): string =>
  `\`${(Array.isArray(val) ? `[\n${val.map((i) => `    ${literal(i)}`).join(',\n')}\n  ]` : '[]')
    .replace(TerraQualityRegex.REGEX_G_REGEX_12(), '\\\\')
    .replace(TerraQualityRegex.REGEX_G_REGEX_18(), '\\`')
    .replace(TerraQualityRegex.REGEX_G_REGEX_16(), '\\$')}\``;

/**
 * Decodes a serializer-safe node payload back into arrays.
 *
 * @remarks
 * Accepts raw arrays, JSON strings, backtick-wrapped literals, and the newer quoted payload.
 *
 * @param value - Serialized node payload in array, JSON, or quoted literal form.
 */
export const decodeNodesPayload = (val: unknown): unknown[] => {
  if (Array.isArray(val)) return val;
  if (typeof val !== 'string' || !val.trim()) return [];
  try {
    const parsed = JSON.parse(
      val.trim().startsWith('`') && val.trim().endsWith('`')
        ? val
            .trim()
            .slice(1, -1)
            .replace(TerraQualityRegex.REGEX_G_REGEX_15(), '`')
            .replace(TerraQualityRegex.REGEX_G_REGEX_14(), '$')
            .replace(TerraQualityRegex.REGEX_G_REGEX_13(), '\\')
        : val.trim(),
    ) as unknown;
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') {
      const nested = JSON.parse(parsed) as unknown;
      return Array.isArray(nested) ? nested : [];
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Reflows serialized `Nodes` tags into a stable multiline attribute shell.
 *
 * @param source - MDX source that may contain one or more `Nodes` tags.
 *
 * @returns Source with `Nodes` tags rewritten to a multiline layout.
 *
 * @remarks
 * This keeps the code view stable even when the MDX editor would otherwise compact the shell.
 */
export const fmtNodesSrc = (src: string): string => {
  trace('format.start', { length: src.length });
  const n = src.replace(NODES.rx.tag, (t) => {
    return `<Nodes\n${NODES.fields
      .flatMap((f) => {
        const content = properties(t)[f.key];
        if (validateType(['undefined'], content) || content === null || content === '') return [];
        if (f.kind === 'boolean') return content === true || content === 'true' ? [f.key] : [];
        if (f.key === 'nodes' || f.key === 'edges')
          return [`${f.key}={${encodeNodesPayload(nodesPayload(content))}}`];
        if (f.kind === 'string')
          return typeof content === 'string' ? [`${f.key}=${JSON.stringify(content)}`] : [];
        if (['height', 'nodeSep', 'rankSep'].includes(f.key))
          return [`${f.key}={${typeof content === 'string' ? content.trim() : String(content)}}`];
        return [`${f.key}={${JSON.stringify(content)}}`];
      })
      .map((a) => `  ${a}`)
      .join('\n')}\n/>`;
  });
  trace('format.complete', { length: n.length });
  return n;
};
const FIELDS = new Map<string, Field>(NODES.fields.map((f) => [f.key, f]));

/*//////////////////////////////////////////////////
FUNCTIONS
//////////////////////////////////////////////////*/

/**
 * Serializes a value into a compact literal suitable for inline MDX attributes.
 *
 * @param v - Value to stringify.
 *
 * @returns A one-line literal that stays readable inside MDX attribute shells.
 *
 * @remarks Keeps serialized node metadata compact enough to embed inside MDX attributes.
 */
const literal = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(literal).join(', ')}]`;
  if (v && typeof v === 'object') {
    return `{ ${Object.entries(v as Record<string, unknown>)
      .sort(([l], [r]) => l.localeCompare(r))
      .map(([k, e]) => `${JSON.stringify(k)}: ${literal(e)}`)
      .join(', ')} }`;
  }
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return `${v}`;
  if (v === null) return 'null';
  return 'undefined';
};

/**
 * Interprets a plain scalar string without forcing object or array parsing.
 *
 * @param value - Scalar text to interpret.
 *
 * @returns Scalar value, or the original string when it should remain a literal label.
 *
 * @remarks The scalar path preserves plain strings unless they clearly parse as another primitive.
 */
const scalar = (val: string): unknown => {
  const trimmed = val.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.startsWith('{') || trimmed.startsWith('['))
      return Function(`"use strict"; return (${loose(trimmed)});`)() as unknown;
    if (
      trimmed.startsWith('"') ||
      trimmed.startsWith("'") ||
      trimmed.startsWith('`') ||
      TerraQualityRegex.REGEX_TRUE_FALSE_NULL_UNDEFINED_D_D_U_REGEX().test(trimmed)
    )
      return Function(`"use strict"; return (${trimmed});`)() as unknown;
    return Function(`"use strict"; return (${quote(trimmed)});`)() as unknown;
  } catch {
    return val;
  }
};

/**
 * Parses the raw attribute shell on a `Nodes` tag into a field map of editor keys and raw values.
 *
 * @param content - Raw `Nodes` tag source.
 *
 * @returns Parsed field values keyed by editor field name.
 *
 * @remarks This parser reads one inline `Nodes` tag at a time and preserves only recognized fields.
 */
const properties = (content: string): Draft => {
  const vals: Draft = {};
  let i = content.indexOf('Nodes') + 5;
  while (i < content.length) {
    while (TerraQualityRegex.REGEX_S_U_REGEX().test(content[i] ?? '')) i++;
    if (content.slice(i).startsWith('/>') || content[i] === '>') break;
    const name = content.slice(i).match(TerraQualityRegex.REGEX_A_ZA_Z_W_U_REGEX())?.[0];
    if (!name) {
      i++;
      continue;
    }
    i += name.length;
    const field = FIELDS.get(name);
    while (TerraQualityRegex.REGEX_S_U_REGEX().test(content[i] ?? '')) i++;
    if (content[i] !== '=') {
      if (field?.kind === 'boolean') vals[field.key] = true;
      continue;
    }
    i++;
    while (TerraQualityRegex.REGEX_S_U_REGEX().test(content[i] ?? '')) i++;
    if (!field) continue;
    if (content[i] === '{') {
      i++;
      let depth = 1;
      let v = '';
      let mQuote: '"' | "'" | '`' | null = null;
      for (; i < content.length; i++) {
        const char = content[i];
        if (!char) break;
        if (mQuote) {
          v += char;
          if (char === '\\') {
            v += content[i + 1] ?? '';
            i++;
            continue;
          }
          if (char === mQuote) mQuote = null;
          continue;
        }
        if (char === '"' || char === "'" || char === '`') {
          mQuote = char;
          v += char;
          continue;
        }
        if (char === '{') {
          depth++;
          v += char;
          continue;
        }
        if (char === '}') {
          depth--;
          if (!depth) break;
          v += char;
          continue;
        }
        v += char;
      }
      vals[field.key] = v.trim();
      i++;
      continue;
    }
    const qmarker = content[i];
    if (qmarker !== '"' && qmarker !== "'") continue;
    i++;
    const end = content.indexOf(qmarker, i);
    if (end === -1) break;
    vals[field.key] = content.slice(i, end);
    i = end + 1;
  }
  return vals;
};

/**
 * Serializes a node payload into the `Nodes` JSX form used in docs.
 *
 * @param vals - Normalized node payload.
 *
 * @returns Rendered `Nodes` JSX string used by the editor and source view.
 *
 * @remarks The rendered tag shape matches the editor-side `Nodes` component contract.
 */
const jsx = (vals: Record<string, unknown>): string => {
  return `<Nodes ${NODES.fields
    .flatMap((f) => {
      const content = vals[NODES.keys[f.key]];
      if (validateType(['undefined'], content) || content === null) return [];
      if (f.kind === 'boolean') return content === true ? [f.key] : [];
      if (f.kind === 'string')
        return typeof content === 'string' ? [`${f.key}=${JSON.stringify(content)}`] : [];
      return [
        `${f.key}={${f.key === 'nodes' || f.key === 'edges' ? encodeNodesPayload(nodesPayload(content)) : literal(content)}}`,
      ];
    })
    .join(' ')} />`;
};

/**
 * Quotes a bare scalar when it would otherwise be misread by the YAML parser.
 *
 * @param x - String value to quote if needed.
 *
 * @returns Original string when it is already safe, otherwise a JSON-quoted literal.
 *
 * @remarks Plain identifiers are preserved so the generated YAML stays readable.
 */
const quote = (x: string): string => {
  const y = x.trim();
  if (!y) return '""';
  if (
    ['"', "'", '`', '{', '['].includes(y.charAt(0)) ||
    TerraQualityRegex.REGEX_TRUE_FALSE_NULL_UNDEFINED_D_D_U_REGEX().test(y)
  )
    return y;
  return JSON.stringify(y);
};

/**
 * Adds quoting to bare scalar values that would otherwise parse as JS expressions.
 *
 * @param body - Raw node block source.
 *
 * @returns Source with bare scalar values quoted so YAML does not misread them.
 *
 * @remarks This pass quotes bare values that would otherwise be misread as JS expressions.
 */
const loose = (body: string): string => {
  let name = '';
  let i = 0;
  let mquote: '"' | "'" | '`' | null = null;
  while (i < body.length) {
    const char = body[i];
    if (mquote) {
      name += char;
      if (char === '\\') {
        name += body[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (char === mquote) mquote = null;
      i++;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      mquote = char;
      name += char;
      i++;
      continue;
    }
    if (char !== ':') {
      name += char;
      i++;
      continue;
    }
    name += char;
    i++;
    while (body[i] === ' ' || body[i] === '\t') {
      name += body[i];
      i++;
    }
    const src = body[i] ?? '';
    if (!src || ['"', "'", '`', '{', '[', '\n'].includes(src) || /[-\d]/u.test(src)) continue;
    let end = i;
    while (end < body.length && !/[,\]\n}]/u.test(body[end] ?? '')) end++;
    const v = body.slice(i, end);
    if (/^(?:true|false|null|undefined)$/u.test(v.trim())) name += v;
    else name += quote(v);
    i = end;
  }
  return name;
};

/**
 * Normalizes a raw nodes payload before JSX emission.
 *
 * @param value - Raw attribute payload.
 *
 * @returns Decoded node payload ready for JSX emission.
 *
 * @remarks The payload may already be encoded as a backtick-wrapped string during a previous round-trip.
 */
const nodesPayload = (val: unknown): unknown[] => {
  const decoded = decodeNodesPayload(val);
  void {
    rawType: Array.isArray(val) ? 'array' : typeof val,
    rawLength: Array.isArray(val) ? val.length : typeof val === 'string' ? val.length : 0,
    decodedLength: decoded.length,
    decodedHead: decoded.length > 0 ? JSON.stringify(decoded[0]).slice(0, 200) : '',
    preview:
      typeof val === 'string'
        ? val.slice(0, 160)
        : Array.isArray(val)
          ? JSON.stringify(val.slice(0, 1)).slice(0, 160)
          : '',
  };
  return decoded;
};

/*//////////////////////////////////////////////////
EXPORTS
//////////////////////////////////////////////////*/
