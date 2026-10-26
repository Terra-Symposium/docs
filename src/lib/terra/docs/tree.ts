/** Canonical path and identity helpers for the Docs navigation tree. */
import * as TerraQualityRegex from '../regex.mjs';
import { docsRootPath, parseRoute } from '../runtime/shared.js';
import type { Branch, Tree as TreeType } from '../runtime/types.js';

export const parseDocsRoute = (pathname: string): ReturnType<typeof parseRoute> =>
  parseRoute(pathname || docsRootPath());

export const sanitizeName = (name: string): string =>
  name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
/**
 * Handles is index file.
 *
 * @param path - Docs path to normalize into a route-safe identifier.
 */
export const isIndexFile = (path: string): boolean =>
  TerraQualityRegex.REGEX_INDEX_MD_MDX_I_REGEX().test(path || '');

export const getStableKey = (node: TreeType): string => {
  if (node.type === 'branch') return node.origName;
  if (node.type === 'leaf') return node.origName;
  return Math.random().toString();
};

export function extractAllNodeIds(nodes: TreeType[]): string[] {
  const ids: string[] = [];
  const pending = [...nodes].reverse();
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.origName) ids.push(node.origName);
    if (node.type === 'leaf' && node.path) ids.push(node.path);
    if (node.type === 'branch' && node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) pending.push(child);
      }
    }
  }
  return [...new Set(ids)];
}

export function getSiblings(nodes: TreeType[], targetPath: string): TreeType[] {
  if (!targetPath || targetPath === '.') return nodes;
  let current = nodes;
  for (const segment of targetPath.split('/')) {
    const branch = current.find(
      (node): node is Branch => node.type === 'branch' && node.origName === segment,
    );
    if (!branch?.children) return [];
    current = branch.children;
  }
  return current;
}

export const keepDeepPath = (curr: string, n: string): string => {
  // prettier-ignore
  const cur = curr.replace(TerraQualityRegex.REGEX_DOCS_REGEX(), '').replace(TerraQualityRegex.REGEX_PATTERN_REGEX_3(), '').split('/').filter(Boolean);
  // prettier-ignore
  const nxt = n.replace(TerraQualityRegex.REGEX_DOCS_REGEX(), '').replace(TerraQualityRegex.REGEX_PATTERN_REGEX_3(), '').split('/').filter(Boolean);
  if (!nxt.length) return n;
  if (cur.length > nxt.length && cur.slice(cur.length - nxt.length).join('/') === nxt.join('/'))
    return curr;
  return n;
};
