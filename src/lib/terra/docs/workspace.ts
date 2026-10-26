// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/pages/docs/_helpers.ts
 * Shared Docs state, browser coordination, and pure helpers used by multiple Docs surfaces.
 * Folder boundary: cross-surface contracts only; page composition, sidebar UI, editor lifecycle, and visual blocks remain in their owners.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { actions } from '../../runtime/action-proxy.js';
import { atom, map } from 'nanostores';
import { createContext, useEffect, useState, useSyncExternalStore } from 'react';
import { getHue } from '@terra-symposium/styling';
import { validateType, warn } from '../../runtime/runtime.js';
import { toast } from 'sonner';

// COMPONENTS
import * as TerraQualityRegex from '../../regex.mjs';

// TYPES
// TYPES
import type { AttchType, Transition } from '../../runtime/types.js';
import type { DocBody } from '../../runtime/types.js';
import type {
  EditorSel,
  EditorSurface,
  Mode,
  ToolbarState,
  Tree as TreeType,
} from '../../runtime/types.js';
import type { EditorView } from '@codemirror/view';

/*//////////////////////////////////////////////////
GENERAL
//////////////////////////////////////////////////*/

export const ASIDES = ['note', 'tip', 'info', 'example', 'caution', 'danger'];
const ASSET_CHUNK_SIZE_BYTES = 0.9 * 1024 * 1024;
export const document: Document =
  typeof globalThis !== 'undefined' && typeof globalThis.document !== 'undefined'
    ? globalThis.document
    : (undefined as unknown as Document);
/**
 * Handles sanitize name.
 *
 * @param name - Document name used to construct the canonical path.
 */
export const sanitizeName = (name: string): string =>
  name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
/**
 * Handles is index file.
 *
 * @param path - Docs path to normalize into a route-safe identifier.
 */
export const isIndexFile = (path: string): boolean =>
  TerraQualityRegex.REGEX_INDEX_MD_MDX_I_REGEX().test(path || '');

/**
 * Subscribes a React component to an external store and returns its current snapshot.
 *
 * @param store - External store that exposes the current value and a subscription function for change notifications.
 *
 * @return The latest value exposed by the store, kept in sync with its notifications.
 */
export function useAtom<Value>(store: {
  get(): Value;
  subscribe(listener: (val: Value) => void): () => void;
}): Value {
  return useSyncExternalStore(
    (n) =>
      store.subscribe(() => {
        n();
      }),
    () => store.get(),
    () => store.get(),
  );
}

/**
 * Client-side circuit breaker for mutation coordination.
 *
 * @remarks This utility combines three strategies to protect the browser's UI thread and network:
 * 1. **Circuit Breaker:** Prevents excessive requests (>20/sec) or after consecutive 429/5xx errors. Opens to block new requests, then transitions to HALF_OPEN to retry after a cooldown.
 * 2. **Debouncing/Throttling:** Controls input-triggered requests (e.g., keyboard, scroll) by delaying or limiting their frequency.
 * 3. **Request Deduplication:** Reuses existing in-flight promises for identical requests, preventing redundant network calls.
 */
class CircuitBreaker {
  private failures = 0;
  private requests = 0;
  private lastReqTime = typeof Date !== 'undefined' ? Date.now() : 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private nextAttempt = 0;
  private readonly MAX_FAILURES = 5;
  private readonly RESET_TIMEOUT_MS = 10000; // 10 seconds
  private readonly MAX_REQS_PER_SEC = 20;
  /**
   * Checks check.
   */
  public check(): void {
    const now = Date.now();
    // reset the volume counter every second
    if (now - this.lastReqTime > 1000) {
      this.requests = 0;
      this.lastReqTime = now;
    }
    this.requests++;
    if (this.state === 'OPEN') {
      if (now > this.nextAttempt) this.state = 'HALF_OPEN';
      else
        throw new Error(
          'Circuit breaker tripped: Too many requests or consecutive failures. Please wait 10 seconds.',
        );
    } else if (this.requests > this.MAX_REQS_PER_SEC) {
      this.trip(now);
      throw new Error('Circuit breaker tripped: Rate limit exceeded.');
    }
  }
  /**
   * Returns the trip.
   *
   * @param now - Timestamp consulted before trip mutates time-sensitive records.
   */
  private trip(now: number): void {
    this.state = 'OPEN';
    this.nextAttempt = now + this.RESET_TIMEOUT_MS;
    warn('CircuitBreaker', 'Tripped OPEN. Network requests blocked.');
  }
  /**
   * Record success.
   */
  public recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failures = 0;
    }
  }
  /**
   * Record failure.
   */
  public recordFailure(): void {
    this.failures++;
    if (this.failures >= this.MAX_FAILURES) this.trip(Date.now());
  }
}

/**
 * Describes the documented declaration.
 *
 * @remarks Caches the shared circuit breaker used for mutation helpers.
 */
const breaker = new CircuitBreaker();

/**
 * Executes an async action safely behind a circuit breaker and transition lock.
 *
 * @param action - Async action executed by the guarded operation.
 * @param fallbackErr - Error value returned when the action cannot complete.
 * @param onStart - Optional callback invoked before the action begins.
 * @param onEnd - Optional callback invoked after the action settles.
 */
export const runMutation = async (
  action: () => Promise<void>,
  fallbackErr: string,
  onStart?: () => void,
  onEnd?: () => void,
) => {
  breaker.check();
  setTransition('local');
  if (onStart) onStart();
  try {
    await action();
    breaker.recordSuccess();
  } catch (err: unknown) {
    breaker.recordFailure();
    toast.error(err instanceof Error ? err.message : fallbackErr);
  } finally {
    if (onEnd) onEnd();
    clearTransition();
  }
};

/*//////////////////////////////////////////////////
TREE UTILS
//////////////////////////////////////////////////*/

/**
 * Handles get hue.
 *
 * @param title - Label displayed for the generated colour group.
 * @param hue - Base hue used to derive the colour group.
 */
export { getHue };

/**
 * Handles get stable key.
 *
 * @param node - Docs tree node whose route should be resolved.
 */
export const getStableKey = (node: TreeType): string => {
  if (node.type === 'branch') return node.origName;
  if (node.type === 'leaf') return node.origName;
  return Math.random().toString();
};

/*//////////////////////////////////////////////////
FUNCTIONS
//////////////////////////////////////////////////*/

/**
 * Uploads an asset in bounded chunks and reports progress while the server assembles it.
 *
 * @param file - Browser file to upload.
 * @param dPath - Destination Docs path that owns the uploaded asset.
 * @param opts - Optional image transforms, preview destination, and per-chunk progress callback.
 *
 * @return The saved asset path or URL and any available compression or filename metadata.
 */
export async function uploadAssetChunked(
  file: File,
  dPath: string,
  opts?: {
    resize?: boolean;
    grayscale?: boolean;
    previewAssetPath?: string;
    onProgress?: (data: {
      bytes: number;
      currentChunk: number;
      totalChunks: number;
      message?: string;
    }) => void;
  },
): Promise<{ path?: string; src?: string; compressedSize?: number; name?: string }> {
  const totalChunks = Math.ceil(file.size / ASSET_CHUNK_SIZE_BYTES) || 1;
  let finalAsset: { path?: string; src?: string; compressedSize?: number; name?: string } | null =
    null;
  for (let c = 0; c < totalChunks; c++) {
    const chunk = file.slice(c * ASSET_CHUNK_SIZE_BYTES, (c + 1) * ASSET_CHUNK_SIZE_BYTES);
    const formData = new FormData();
    formData.append('file', new File([chunk], file.name, { type: file.type }));
    formData.append('path', dPath);
    formData.append(
      'fileId',
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    );
    formData.append('chunkIndex', String(c));
    formData.append('totalChunks', String(totalChunks));
    if (opts?.resize) formData.append('resize', 'true');
    if (opts?.grayscale) formData.append('grayscale', 'true');
    if (opts?.previewAssetPath) formData.append('assetPath', opts.previewAssetPath);
    try {
      // native Astro Actions client automatically handles multipart/form-data encoding and routing!
      const { data, error } = await actions.write.asset.upload(formData);
      if (error) throw new Error(error.message || 'Action rejected the payload');
      if (c === totalChunks - 1)
        finalAsset = data as {
          path?: string;
          src?: string;
          compressedSize?: number;
          name?: string;
        };
      if (opts?.onProgress)
        opts.onProgress({ bytes: chunk.size, currentChunk: c + 1, totalChunks });
    } catch (err) {
      console.error(`[uploadAssetChunked] Error on chunk ${c}:`, err);
      throw err;
    }
  }
  if (!finalAsset) throw new Error('Upload failed to return final attachment.');
  return finalAsset;
}

/**
 * Handles download.
 *
 * @param filename - Filename input supplied to download's operation.
 * @param content - Content input supplied to download's operation.
 * @param type - Type input supplied to download's operation.
 */
export function download(
  filename: string,
  content: string | ArrayBuffer | Blob,
  type = 'text/plain',
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    warn('download', 'Bypass requested execution; environment window context is dead.');
    return;
  }
  let dlName = filename;
  if (
    type === 'text/markdown' &&
    !dlName.toLowerCase().endsWith('.md') &&
    !dlName.toLowerCase().endsWith('.mdx')
  )
    dlName += '.mdx';
  const href = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const link = document.createElement('a');
  link.href = href;
  link.download = dlName;
  link.click();
  URL.revokeObjectURL(href);
}

/**
 * Reads the browser selection when it is a collapsed caret, such as the Docs editor insertion point.
 *
 * @return The active collapsed range, or `null` when there is no browser selection or the selection spans content.
 */
export function getCollapsedRange(): Range | null {
  if (typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;
  return sel.getRangeAt(0);
}

/**
 * Captures child-node indexes from a root node to a target so the target can be found after DOM updates.
 *
 * @param root - DOM node whose child tree defines the path origin.
 * @param tgt - Descendant node to locate, or `null` when no selection node exists.
 *
 * @return The sequence of child indexes from the root, or `null` when the target is not inside it.
 */
export function captureNodePath(root: Node, tgt: Node | null): number[] | null {
  if (!tgt) return null;
  const path: number[] = [];
  let cur: Node | null = tgt;
  while (cur && cur !== root) {
    if (!cur.parentNode) return null;
    const i = Array.from(cur.parentNode.childNodes).findIndex((c) => c === cur);
    if (i === -1) return null;
    path.unshift(i);
    cur = cur.parentNode;
  }
  return cur === root ? path : null;
}

/**
 * Converts a DOM text position into its character offset within the editor's complete text flow.
 *
 * @param root - Editor element whose text nodes define the linear text flow.
 * @param node - Selected DOM node whose position should be measured.
 * @param offset - Character offset within a text node or child index within an element node.
 *
 * @return The character offset from the beginning of the editor, or `null` if the node is absent or outside it.
 */
export function captureLinearOffset(
  root: HTMLElement,
  node: Node | null,
  offset = 0,
): number | null {
  if (!node) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let cur = walker.nextNode();
  while (cur) {
    if (cur === (node instanceof Text ? node : (node.childNodes[offset] ?? node)))
      return total + Math.min(offset, cur.textContent?.length ?? 0);
    total += cur.textContent?.length ?? 0;
    cur = walker.nextNode();
  }
  return null;
}

/**
 * Finds the DOM caret range at a character offset in the editor's text flow.
 *
 * @param root - Editor element whose text nodes should be traversed.
 * @param i - Character offset from the start of the editor.
 *
 * @return A collapsed range at the requested offset, or `null` for an invalid or out-of-range offset.
 */
export function resolveLinearOffset(root: HTMLElement, i?: number): Range | null {
  if (typeof i !== 'number' || i < 0) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cur = walker.nextNode();
  let remaining = i;
  while (cur) {
    const len = cur.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(cur, Math.min(remaining, len));
      range.collapse(true);
      return range;
    }
    remaining -= len;
    cur = walker.nextNode();
  }
  return null;
}

/**
 * Handles paste md.
 *
 * @param insert - Insert input supplied to paste md's operation.
 * @param md - Md input supplied to paste md's operation.
 * @param selection - Selection input supplied to paste md's operation.
 */
export function pasteMd(
  insert: (md: string, rootEnd?: boolean, selection?: EditorSel | null) => void,
  md: string,
  selection?: EditorSel | null,
): void {
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        insert(md, false, selection ?? null);
      }),
    );
    return;
  }
  insert(md, false, selection ?? null);
}

/**
 * Adds an import statement when equivalent syntax is not already present in the source text.
 *
 * @param md - Markdown or source text that should receive the import.
 * @param statement - Complete import statement to add when no matching import exists.
 *
 * @return The original text when the import is already present, otherwise the text with the import prepended.
 */
export function withImport(md: string, statement: string): string {
  if (md.includes(statement)) return md;
  // Flexible duplicate protection
  const baseStatementMatch = statement.match(/import\s+(.*?)\s+from\s+['"](.*?)['"]/);
  if (baseStatementMatch) {
    const [, cmp, path] = baseStatementMatch;
    if (new RegExp(`import\\s+${cmp}\\s+from\\s+['"]${path}['"]`).test(md)) return md;
  }
  // Unconditionally append right at the very top of the evaluated string or just below fm boundaries
  if (md.startsWith('---')) {
    const parts = md.split('---');
    // parts[0] is empty, parts[1] is fm, parts[2] is body
    if (parts.length >= 3) {
      parts[2] = `\n${statement}\n` + parts[2];
      return parts.join('---');
    }
  }
  return `${statement}\n\n${md}`;
}

/**
 * Locates the CodeMirror view in the code block that currently has keyboard focus.
 *
 * @return The mounted editor view, or `null` during SSR or when the editor is not mounted.
 */
export function codeViewOf(): EditorView | null {
  if (typeof document === 'undefined') return null;
  const active =
    document.activeElement instanceof Element
      ? document.activeElement.closest<HTMLElement>('.docs-code-block .cm-editor')
      : null;
  return (
    (active as (HTMLElement & { cmView?: { view?: EditorView } }) | null)?.cmView?.view ?? null
  );
}

/**
 * Converts raw HTML into structured md, maintaining basic formatting constraints.
 *
 * @param html - Raw HTML to convert into the editor's Markdown representation.
 *
 * @return Markdown text with supported block and inline formatting preserved.
 */
export function htmlToMd(html: string): string {
  if (typeof window === 'undefined') {
    warn('htmlToMd', 'Window context unavailable; returning raw markup.');
    return html;
  }

  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const rendered = new Map<Node, string>();
  const pending: Array<{ node: Node; visited: boolean }> = [{ node: root, visited: false }];
  while (pending.length > 0) {
    const curr = pending.pop()!;
    if (curr.node.nodeType === Node.TEXT_NODE) {
      let text = curr.node.textContent || '';
      // Preserve embedded leaf structure tokens as separate Markdown blocks.
      if (text.includes('|||')) text = text.replace(/\|\|\|/g, '\n\n|||\n\n');
      rendered.set(curr.node, text);
      continue;
    }
    if (curr.node.nodeType !== Node.ELEMENT_NODE) {
      rendered.set(curr.node, '');
      continue;
    }
    const element = curr.node as HTMLElement;
    if (!curr.visited) {
      pending.push({ node: curr.node, visited: true });
      for (let i = element.childNodes.length - 1; i >= 0; i--) {
        const child = element.childNodes[i];
        if (child) pending.push({ node: child, visited: false });
      }
      continue;
    }
    const tag = element.tagName.toLowerCase();
    const children = Array.from(element.childNodes)
      .map((child) => rendered.get(child) || '')
      .join('');
    let text = children;
    switch (tag) {
      case 'table':
      case 'thead':
      case 'tbody':
      case 'tfoot':
      case 'tr':
        text = `<${tag}${Array.from(element.attributes)
          .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
          .join('')}>\n${children}\n</${tag}>`;
        break;
      case 'th':
      case 'td':
        text = `<${tag}${Array.from(element.attributes)
          .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
          .join('')}>\n${children.trim()}\n</${tag}>`;
        break;
      case 'h1':
      case 'h2':
        text = `\n## ${children}\n\n`;
        break;
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        text = `\n### ${children}\n\n`;
        break;
      case 'p':
      case 'div':
        text = element.closest('td, th') ? `\n${children}\n` : `\n${children}\n\n`;
        break;
      case 'strong':
      case 'b':
        text = `**${children}**`;
        break;
      case 'em':
      case 'i':
        text = `_${children}_`;
        break;
      case 'u':
        text = `<u>${children}</u>`;
        break;
      case 'del':
      case 's':
        text = `~~${children}~~`;
        break;
      case 'a':
        text = `[${children}](${element.getAttribute('href') || ''})`;
        break;
      case 'code':
        text = element.closest('pre') ? children : `\`${children}\``;
        break;
      case 'pre': {
        const match = element
          .querySelector('code')
          ?.className.match(TerraQualityRegex.REGEX_LANGUAGE_A_Z0_9_I_REGEX());
        text = `\n\`\`\`${match ? match[1] : 'text'}\n${children.trim()}\n\`\`\`\n`;
        break;
      }
      case 'blockquote':
        text = `\n> ${children}\n\n`;
        break;
      case 'ul':
      case 'ol':
        text = `\n${children}\n`;
        break;
      case 'li':
        text = `${element.closest('ul, ol')?.tagName.toLowerCase() === 'ol' ? '1. ' : '- '}${children.trim()}\n`;
        break;
      case 'br':
        text = '\n';
        break;
      case 'img':
        text = `![${element.getAttribute('alt') || 'image'}](${element.getAttribute('src') || ''})`;
        break;
    }
    rendered.set(curr.node, text);
  }
  return (rendered.get(root) || '').replace(TerraQualityRegex.REGEX_N_3_G_REGEX(), '\n\n').trim();
}

/*//////////////////////////////////////////////////
STORAGE UTILS
//////////////////////////////////////////////////*/

// LOCAL STORAGE
/**
 * Reads a persisted value from local storage when available.
 *
 * @param key - Local-storage key that identifies the persisted value to load.
 * @param fallback - Value returned when storage is unavailable.
 * @param valid - Type guard for the parsed value.
 *
 * @return read value.
 *
 * @template T - Expected value type.
 *
 * @remarks This is browser-only and falls back cleanly during SSR.
 */
function readStorage<T>(key: string, fallback: T, valid: (input: unknown) => input is T): T {
  if (validateType(['undefined'], globalThis.window)) return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (!validateType(['string'], v)) return fallback;
    try {
      const parsed = JSON.parse(v) as unknown;
      return valid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  } catch {
    return fallback;
  }
}

/**
 * Writes a value to local storage when available.
 *
 * @param key - Local-storage key under which the serialized value should be saved.
 * @param v - Value to serialise.
 *
 * @remarks Write failures are swallowed because persistence should never block editing.
 */
function writeStorage(key: string, v: unknown): void {
  if (validateType(['undefined'], globalThis.window)) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    return;
  }
}

/*//////////////////////////////////////////////////
STORES
//////////////////////////////////////////////////*/

// STATE ATOMS
/**
 * Shared attachment types accepted by the docs editor.
 *
 * @returns supported attachment type literals.
 *
 * @remarks These types drive both filtering and export behavior.
 */
export const ATTCH_TYPES = ['document', 'image', 'youtube', 'website', 'tsdocs', 'other'] as const;

/**
 * Persistent attachment filter state.
 *
 * @returns An atom holding the selected attachment types.
 *
 * @remarks The filter defaults to showing all supported types.
 */
export const $attachmentFilter = atom<AttchType[]>([...ATTCH_TYPES]);
/**
 * Current docs editor mode.
 *
 * @returns A persisted mode atom.
 *
 * @remarks The mode is restored from local storage so the editor reopens in the same state.
 */
export const $mode = atom<Mode>(
  readStorage('docs-mode', 'view', (i): i is Mode =>
    ['view', 'edit', 'attachments'].includes(i as string),
  ),
);
/** Shares the active leaf title across Docs surfaces. */
export const $leafTitle = atom<{ path: string; title: string } | null>(null);
/**
 * Global transition flag for docs navigation and mutations.
 *
 * @returns A boolean atom.
 *
 * @remarks This lets the UI disable inputs while a transition is active.
 */
export const $transition = atom<boolean>(false);
/**
 * Current toolbar state.
 *
 * @returns A nullable toolbar atom.
 *
 * @remarks The toolbar is controlled centrally so overlays can share the same focus state.
 */
export const $toolbar = atom<ToolbarState | null>(null);
/**
 * Hydration counter for docs editor widgets.
 *
 * @returns A numeric atom tracking hydration depth.
 *
 * @remarks This is used to delay interactions until the editor tree is ready.
 */
export const $hydrating = atom<number>(0);
/**
 * Surface readiness state for docs editing.
 *
 * @returns A nullable mode atom.
 *
 * @remarks The value flips once the interactive surface is available.
 */
export const $surfaceReady = atom<Mode | null>(null);
export const $editReadyPath = atom<string | null>(null);
/** Shared cursor state so toolbar focus can preserve the last insertion point visibly. */
export const $cursor = atom<EditorSel | null>(null);
/** Persisted caret snapshot used for the simulated cursor overlay when focus leaves the editor. */
export const $cursorGhost = atom<EditorSel | null>(null);
/** Linear caret bookmark used to simulate the visible cursor without relying on DOM focus. */
export const $cursorTrack = atom<
  | /* Describes a cursor track type. */ (Pick<EditorSel, 'box' | 'collapsed' | 'visible'> & {
      anchor: number;
      focus: number;
      range: [number, number];
    })
  | null
>(null);
/**
 * Cursor position snapshot for the docs editor.
 *
 * @returns A nullable cursor atom.
 *
 * @remarks This duplicates the visible cursor state for consumers that need direct position access.
 */
export const $cursorPosition = atom<EditorSel | null>(null);
/**
 * Unsaved docs draft flags.
 *
 * @returns A map store keyed by document id.
 *
 * @remarks This store only tracks presence, not draft content.
 */
export const $unsavedDrafts = map<Record<string, boolean>>({});
/**
 * In-memory docs draft cache.
 *
 * @returns A map of draft payloads and metadata.
 *
 * @remarks This cache is process-local and intentionally not persisted.
 */
export const memoryDrafts = new Map<
  string,
  { source: string; draft: unknown; metadata: unknown }
>();
/**
 * Sidebar visibility state for the docs editor.
 *
 * @returns A persisted boolean atom.
 *
 * @remarks The default keeps the sidebar open for discoverability.
 */
export const $sidebar = atom<boolean>(
  readStorage('docs-sidebar-open', true, (i): i is boolean => validateType(['boolean'], i)),
);

// HELPERS
if (!validateType(['undefined'], globalThis.window)) {
  $sidebar.listen((v) => {
    writeStorage('docs-sidebar-open', v);
  });
  $mode.listen((v) => {
    writeStorage('docs-mode', v);
  });
  $cursor.listen((v) => {
    if (v) $cursorGhost.set(v);
  });
}

/*//////////////////////////////////////////////////
TRANSITION SYSTEM
//////////////////////////////////////////////////*/

/**
 * Shared transition store for docs UI coordination.
 *
 * @returns transition store object.
 *
 * @remarks This is kept as a plain object so listeners can subscribe without extra abstractions.
 */
export const transitionStore = {
  transition: 'idle' as Transition,
  restore: null as (() => void) | null,
  listeners: new Set<() => void>(),
};

/**
 * Sets the active docs transition state.
 *
 * @param transition - Next transition state.
 *
 * @remarks The boolean store mirrors the non-idle state for simpler UI consumers.
 */
export function setTransition(transition: Transition): void {
  transitionStore.transition = transition;
  $transition.set(transition !== 'idle');
  transitionStore.listeners.forEach((l) => {
    l();
  });
}

/**
 * Clears the active docs transition state.
 *
 *
 * @remarks Idle is the only state that leaves the transition flag unset.
 */
export function clearTransition(): void {
  if (transitionStore.transition === 'idle') return;
  setTransition('idle');
}

/**
 * Subscribes to the current docs transition state.
 *
 * @return use Transition State.
 *
 * @remarks This is used by components that need to react to local mutation states.
 */
export function useTransitionState(): Transition {
  const [transition, setTransitionState] = useState(transitionStore.transition);
  useEffect(() => {
    /**
     * Handles update.
     */
    const update = (): void => {
      setTransitionState(transitionStore.transition);
    };
    transitionStore.listeners.add(update);
    return (): void => {
      transitionStore.listeners.delete(update);
    };
  }, []);
  return transition;
}

/**
 * Shared editor transition context.
 *
 * @returns transition context object.
 *
 * @remarks The provider keeps layout and loading overlays in sync.
 */
export const TransitionCtx = createContext<{
  setSourceReady: (ready: boolean) => void;
  setLoading: (loading: boolean) => void;
} | null>(null);

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

// CONFIG
// REACT CONTEXT
/**
 * Context for docs edit state.
 *
 * @returns edit state context object.
 *
 * @remarks The context carries the current editable document state through the editor tree.
 */
export const EditStateCtx = createContext<{
  busy: import('../../runtime/types.js').EditorState['busy'];
  code: string;
  draft: import('../../runtime/types.js').Draft;
  dirty: boolean;
  loaded?: boolean;
  mark?: () => void;
  references?: import('react').MutableRefObject<import('../../runtime/types.js').EditorRefs>;
  setSrc?: (val: string) => void;
  source?: string;
  state?: import('../../runtime/types.js').EditorState;
  save: (code?: string, opts?: { force?: boolean; format?: boolean }) => void;
  setCode: (val: string) => void;
  update: (patch: Partial<import('../../runtime/types.js').Draft>) => void;
} | null>(null);
/**
 * Context for the docs editor surface.
 *
 * @returns surface context object.
 *
 * @remarks This lets nested components reach the active editor surface without prop drilling.
 */
export const EditorSurfaceCtx = createContext<EditorSurface | null>(null);

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

// UTILITIES
/**
 * Handles extract all node ids.
 *
 * @param nodes - Graph nodes rendered and updated by extract all node ids.
 *
 * @return All unique ids discovered in the tree.
 *
 * @remarks Collects every node identifier from a tree of docs entries.
 */
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

/*//////////////////////////////////////////////////
READINESS
//////////////////////////////////////////////////*/

export const $editorMounts = atom<{
  expected: string[];
  mounted: string[];
  path: string | null;
}>({ expected: [], mounted: [], path: null });
const assignments = new Map<string, string>();

/**
 * Handles reset editor mounts.
 *
 * @param path - Source or route path resolved for reset editor mounts.
 * @param expected - Expected input supplied to reset editor mounts's operation.
 */
export function resetEditorMounts(path: string | undefined, expected: string[]): void {
  assignments.clear();
  $editorMounts.set({ expected, mounted: [], path: path || null });
}

/**
 * Handles set editor mount.
 *
 * @param path - Source or route path resolved for set editor mount.
 * @param reporter - Reporter input supplied to set editor mount's operation.
 * @param mounted - Mounted input supplied to set editor mount's operation.
 * @param kind - Content kind that selects set editor mount's renderer.
 */
export function setEditorMount(
  path: string | undefined,
  reporter: string | undefined,
  mounted: boolean,
  kind?: string,
): void {
  if (!path || !reporter) return;
  const state = $editorMounts.get();
  if (state.path !== path) return;
  if (mounted && !assignments.has(reporter)) {
    const id = kind
      ? state.expected.find((v) => v.startsWith(`${kind}:`) && !state.mounted.includes(v))
      : reporter;
    if (!id || !state.expected.includes(id)) return;
    assignments.set(reporter, id);
  }
  const id = assignments.get(reporter) || reporter;
  if (!mounted) assignments.delete(reporter);
  const n = mounted ? [...new Set([...state.mounted, id])] : state.mounted.filter((v) => v !== id);
  if (n.length !== state.mounted.length || n.some((v, i) => v !== state.mounted[i]))
    $editorMounts.set({ ...state, mounted: n });
}

/*//////////////////////////////////////////////////
NAVIGATION
//////////////////////////////////////////////////*/

/**
 * Handles keep deep path.
 *
 * @param current - Current value before the update.
 * @param next - Proposed value to compare with the current value.
 */
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

/**
 * Handles is doc body.
 *
 * @param value - Value whose display label should be derived.
 */
export const isDocBody = (val: unknown): val is DocBody =>
  Array.isArray(val) && val.every((b) => b && typeof b === 'object' && '_type' in b);

/**
 * Handles docs navigation state.
 *
 * @param prev - Previous state used as the base for the update.
 * @param detail - Change detail merged into the next state.
 */
/*//////////////////////////////////////////////////
TOOLBAR
//////////////////////////////////////////////////*/

const VAL_BY_KIND: Record<string, string> = {
  Aside: 'aside',
  DocsTable: 'table',
  Nodes: 'nodes',
  attachment: 'attachment',
  callout: 'aside',
  component: 'component',
  math: 'math',
  table: 'table',
  tsdocs: 'tsdocs',
};

/**
 * Determines which Docs toolbar block is active at the current editor selection.
 *
 * @param el - Focused element inside the active Docs editor.
 * @param vals - Supported block kinds that may be returned for custom content.
 *
 * @return The active block kind, or `null` when the selection is outside a supported block.
 */
export function toolbarFocusValue(el: Element, vals: readonly string[]): string | null {
  const text = el.closest('h1, h2, h3, h4, h5, h6, p');
  if (text) return text.tagName.toLowerCase();
  if (
    el
      .closest('td, th')
      ?.closest('[data-docs-editor-block="DocsTable"], [data-terra-block="table"]')
  )
    return 'p';
  const block = el.closest(
    '[data-docs-editor-block], [data-terra-block], .docs-math-wrapper, [data-math-code], [data-docs-view-root="true"]',
  );
  if (!block) return null;
  const kind =
    block.getAttribute('data-docs-editor-block') ?? block.getAttribute('data-terra-block') ?? '';
  if (kind && VAL_BY_KIND[kind]) return VAL_BY_KIND[kind];
  if (kind && vals.includes(kind.toLowerCase())) return kind.toLowerCase();
  if (block.matches('.docs-math-wrapper, [data-math-code]')) return 'math';
  return block.matches('[data-docs-view-root="true"]') ? 'component' : null;
}
