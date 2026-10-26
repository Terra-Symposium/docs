/** Converts supported Docs block markers to and from JSX wrappers. */
import * as TerraQualityRegex from '../../regex.mjs';
import { normBlockMarkers, quote, toCodeJsx } from './markdown.js';

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
  {
    id: 'accordion',
    syntax: '===',
    root: 'AccordionGroup',
    item: 'AccordionItem',
    label: 'Accordion',
  },
  { id: 'tabs', syntax: '|||', root: 'TabsGroup', item: 'TabsItem', label: 'Tabs' },
] as const;

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
    .replace(TerraQualityRegex.REGEX_CODE_B_S_S_CODE_G_REGEX(), (m) => {
      const key = `TERRA_CODE_${code.size}`;
      code.set(key, m);
      return key;
    })
    .replace(TerraQualityRegex.REGEX_S_S_N_G_REGEX(), (m) => {
      let res = '';
      for (let i = 0; i < m.length; i++) {
        const current = m[i] ?? '';
        const previous = i > 0 ? m[i - 1] : undefined;
        res +=
          current && ['{', '}', '<', '>'].includes(current) && previous !== '\\'
            ? `\\${current}`
            : current;
      }
      return res;
    })
    .replace(TerraQualityRegex.REGEX_XA0_U2002_U2003_U200B_G_REGEX(), ' ')
    .split(TerraQualityRegex.REGEX_R_N_REGEX());
  const res: string[] = [];
  let icode = false;
  const grp = new Set<string>();
  const itm = new Set<string>();
  for (let i = 0; i < lns.length; i++) {
    const line = lns[i] ?? '';
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
    const _m = BLOCKS.find((b) => tClean.startsWith(b.syntax));
    if (_m) {
      const rM = tClean.match(
        new RegExp(
          `^${_m.syntax.replace(TerraQualityRegex.REGEX_G_REGEX_9(), '\\$&')}(?:\\s*\\[(.*?)\\])?$`,
        ),
      );
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
    const b = BLOCKS.find((x) => x.label === label);
    if (b) {
      if (itm.has(b.item)) {
        res.push('', `</${b.item}>`);
        itm.delete(b.item);
      }
      res.push(`</${b.root}>`, '');
    }
  }
  const n = res.join('\n');
  return code.size
    ? n.replace(TerraQualityRegex.REGEX_TERRA_CODE_D_G_REGEX(), (k) => code.get(k) || k)
    : n;
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
    .replace(/<Code\b[\s\S]*?<\/Code>/g, (m) => {
      const key = `TERRA_CODE_${code.size}`;
      code.set(key, m);
      return key;
    })
    .replace(/^\\?=\\?=\\?=/gm, '===')
    .replace(/^\\?\|\\?\|\\?\|/gm, '|||')
    .replace(/^\\?:\\?:\\?:/gm, ':::')
    .replace(
      /^(===|\|\|\||\^\^\^|:::)[ \t]*\\?\[(.*?)\\?\]/gm,
      (_m, p, c) => `${p}[${c.replace(/\\\]/g, ']').replace(/\\\[/g, '[')}]`,
    );
  _rs = _rs
    .replace(TerraQualityRegex.REGEX_XA0_U2002_U2003_U200B_G_REGEX(), ' ')
    .replace(
      /<DocsMath\b([\s\S]*?)code=(?:\{\s*("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)\s*\}|(["'])([\s\S]*?)\3)([\s\S]*?)\/>/gi,
      (_m, p, e, _quote, s, v) => {
        // prettier-ignore
        const parsed = e
					? e.startsWith('`')
						? e.slice(1, -1).replace(TerraQualityRegex.REGEX_G_REGEX_15(), '`').replace(TerraQualityRegex.REGEX_G_REGEX_14(), '$').replace(TerraQualityRegex.REGEX_G_REGEX_13(), '\\')
						: e.startsWith('"') ? JSON.parse(e.replace(TerraQualityRegex.REGEX_N_G_REGEX_3(), '\\n')) : e.slice(1, -1).replace(/\\([`'"])/g, '$1')
					: s;
        return TerraQualityRegex.REGEX_BINLINE_B_I_REGEX().test(p) ||
          TerraQualityRegex.REGEX_BINLINE_B_I_REGEX().test(v)
          ? `$${parsed}$`
          : `\n\n$$${parsed}$$\n\n`;
      },
    )
    .replace(TerraQualityRegex.REGEX_S_S_N_G_REGEX(), (_m) =>
      _m.replace(/\\\{/g, '{').replace(/\\\}/g, '}').replace(/\\</g, '<').replace(/\\>/g, '>'),
    );
  _rs = _rs
    .replace(/(<\/?(?:AccordionGroup|TabsGroup|AccordionItem|TabsItem)\b[^>]*>)/g, '\n$1\n')
    .replace(TerraQualityRegex.REGEX_N_3_G_REGEX(), '\n\n');
  if (code.size)
    _rs = _rs.replace(TerraQualityRegex.REGEX_TERRA_CODE_D_G_REGEX(), (k) => code.get(k) || k);
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
    if (BLOCKS.find((b) => t === `<${b.root}>`)) {
      out.push('');
      continue;
    }
    if (BLOCKS.find((b) => t === `</${b.root}>`)) {
      out.push('');
      continue;
    }
    if (
      BLOCKS.find((b) => {
        const match = t.match(new RegExp(`^<${b.item}\\b[^>]*title="([^"]*)"[^>]*>$`));
        if (!match) return false;
        out.push(`\n\n${b.syntax}[${match[1] || 'Section'}]\n\n`);
        return true;
      })
    )
      continue;
    const itemClose = BLOCKS.find((b) => t === `</${b.item}>`);
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
  return (
    /* prettier-ignore */ out.join('\n').replace(TerraQualityRegex.REGEX_N_3_G_REGEX(), '\n\n').trim() + '\n'
  );
}
