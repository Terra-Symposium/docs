import { cn as stylingCn } from '@terra-symposium/styling/ui';
import { getDocsHostAdapter } from '../../host-runtime.js';

export const cn = stylingCn;
export function isDevOrigin(value: string | URL): boolean {
  const hostCheck = getDocsHostAdapter()?.isDevelopmentOrigin;
  if (hostCheck) return hostCheck(String(value));
  try {
    const host = new URL(value).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}
export const isRec = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
export const isString = (value: unknown): value is string => typeof value === 'string';
export const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
export const validateType = (types: readonly string[], value: unknown): boolean =>
  types.includes(typeof value);
export const warn = (tag: string, message: string, detail?: unknown): void =>
  console.warn(`[${tag}] ${message}`, detail ?? '');
export const error = warn;
export const errorLog = warn;
export const createTrace =
  (scope: string, enabled: boolean) =>
  (event: string, detail?: unknown): void => {
    if (enabled) console.debug(`[${scope}] ${event}`, detail ?? '');
  };
export const notify = ({ error: reason, fallback }: { error: unknown; fallback: string }): void => {
  const message = reason instanceof Error ? reason.message : fallback;
  if (typeof document !== 'undefined')
    document.dispatchEvent(
      new CustomEvent('docs:notify', { detail: { message, variant: 'error' } }),
    );
};
export const hash = (value: string): number => {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) | 0;
  return result;
};
export const canonicalId = (value: string): string =>
  value
    .trim()
    .replace(/[^a-z0-9_-]/gi, '-')
    .toLowerCase();
export const normArcGraph = <T>(graph: T): T => graph;
type ArcNode = Record<string, unknown> & { _key?: string; hidden?: boolean; type?: string };
type ArcEdge = Record<string, unknown> & { _key?: string; source?: string; target?: string };

export function resolvedEdges(graph: unknown): ArcEdge[] {
  const record = isRec(graph) ? graph : {};
  const nodes: ArcNode[] = Array.isArray(record.nodes)
    ? record.nodes.filter((node): node is ArcNode => isRec(node) && !node.hidden)
    : [];
  const keys = new Set(nodes.flatMap((node) => (typeof node._key === 'string' ? [node._key] : [])));
  const edges: ArcEdge[] = (Array.isArray(record.edges) ? record.edges : []).filter(
    (edge): edge is ArcEdge =>
      isRec(edge) &&
      typeof edge.source === 'string' &&
      typeof edge.target === 'string' &&
      keys.has(edge.source) &&
      keys.has(edge.target),
  );
  const terminal = nodes.find((node) => node.type === 'terminal');
  const terminalKey = terminal?._key;
  if (typeof terminalKey !== 'string') return edges;
  // Capture the narrowed key before entering the callback; TypeScript widens
  // the optional property again inside the closure.
  const resolvedTerminalKey: string = terminalKey;
  const sources = new Set(edges.flatMap((edge) => (edge.source ? [edge.source] : [])));
  return [
    ...edges,
    ...nodes.flatMap((node) => {
      if (node.type !== 'content' || typeof node._key !== 'string' || sources.has(node._key))
        return [];
      return [
        {
          _key: `terminal:${node._key}`,
          _type: 'edge',
          source: node._key,
          target: resolvedTerminalKey,
        },
      ];
    }),
  ];
}
export function setDocumentTitle(title: string): void {
  const siteTitle = getDocsHostAdapter()?.siteTitle ?? 'Terra Symposium';
  document.title = title ? `${title} | ${siteTitle}` : siteTitle;
}
export const isDarkMode = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
export const getImg = (id: string, width?: number): { url: () => string } => ({
  url: () => getDocsHostAdapter()?.assetUrl?.(id, width) ?? '',
});
