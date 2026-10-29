// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/pages/docs/_sidebar.tsx
 * Docs sidebar entrypoint, state management, and unified dialog orchestrators.
 * Folder boundary: sidebar navigation and its dialogs; the recursive tree structure remains in `_tree.tsx`.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import {
  $leafTitle,
  $mode,
  $transition,
  $unsavedDrafts,
  memoryDrafts,
  useAtom,
} from '../../../../lib/terra/docs/state.js';
import {
  extractAllNodeIds,
  getSiblings as getSibs,
  parseDocsRoute as route,
  getStableKey,
  sanitizeName,
} from '../../../../lib/terra/docs/tree.js';
import { navigateDocs as navigate } from '../../../../lib/terra/docs/navigation.js';
import { runMutation } from '../../../../lib/terra/docs/mutations.js';
import { getHue } from '@terra-symposium/styling';
import { actions } from '../../../../lib/terra/runtime/action-proxy.js';
import { archiveDocs } from '../../../../lib/terra/docs/archive.js';
import { ManageAttachmentsDialog } from './_manage-attachments-dialog.js';
import { useRenderTripwire } from './use-render-tripwire.js';
import {
  bName,
  buildRoute as buildRoute,
  cTitle,
  dirname,
  docsPath,
  docsRootPath,
  FILES,
  toNodeLabel,
  toPaths,
} from '../../../../lib/terra/runtime/shared.js';
import { cn, createTrace, notify } from '../../../../lib/terra/runtime/runtime.js';
import { isDevOrigin } from '../../../../lib/terra/runtime/runtime.js';
import { components as repoComponents } from '../../../../lib/terra/custom-components.js';
import { currLeafSrc } from '../../../../lib/terra/runtime/leaf.js';
import { toast } from 'sonner';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// COMPONENTS
import * as TerraQualityRegex from '../../../../lib/terra/regex.mjs';
import React from 'react';
import Tree, { Menu } from './_tree.js';
import User from '../../ui.js';
import {
  Add as AddIcon,
  ArrowUpRight as PopOutIcon,
  Box as BoxIcon,
  ColorPalette as ColorIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Link as LinkIcon,
  OverflowMenuVertical as OverflowMenuIcon,
  TrashCan as TrashIcon,
} from '@carbon/icons-react';
import { AlertError } from '@terra-symposium/styling/ui/terra-original';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@terra-symposium/styling/ui/terra-original';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@terra-symposium/styling/ui/terra-original';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@terra-symposium/styling/ui/terra-original';
import { ErrorBoundary } from '../../ui.js';
import { ExportDialog as SharedExportDialog } from './_export-dialog.js';
import { Input } from '@terra-symposium/styling/ui/terra-original';
import { Label } from '@terra-symposium/styling/ui/terra-original';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@terra-symposium/styling/ui/terra-original';
import { Separator } from '@terra-symposium/styling/ui/terra-original';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
} from '@terra-symposium/styling/ui/terra-original';
import { Slider } from '@terra-symposium/styling/ui/terra-original';

// TYPES
import type { ActionRes, Md } from '../../../../lib/terra/runtime/types.js';
import type { AttchTgt, DelTgt, PromptState } from '../../../../lib/terra/runtime/types.js';
import type { DocsTreeMenuAction as MenuAction } from '../../../../lib/terra/runtime/types.js';
import type {
  Branch,
  Leaf as LeafNode,
  Tree as TreeType,
} from '../../../../lib/terra/runtime/types.js';
import type { DragState } from '../../../../lib/terra/runtime/types.js';
import type { ReorderDropState } from '../../../../lib/terra/runtime/types.js';

// prettier-ignore

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/**
 * SANITY MANY-TO-MANY ROUTING ARCHITECTURE
 *
 * Parses explicit Sanity IDs directly from the URL.
 * A single leaf or group can belong to multiple parents. Canonical routing keeps the active
 * section anchored to the first path segment so the sidebar select never drifts.
 *
 * @param pathname - Current browser pathname used to mark the active route.
 */
/**
 * Reads the typed detail payload from a DOM event.
 *
 * @param e - DOM event carrying the custom payload.
 * @returns The event detail payload.
 */
const eDetail = <T,>(e: Event): T => (e as CustomEvent<T>).detail;

/**
 * Handles latest content.
 *
 * @param content - Docs content used to derive the sidebar structure.
 */
const latestContent = (content: Md['content']): string => {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? currLeafSrc(content, 'sidebar.latestContent') : '';
};

/*//////////////////////////////////////////////////
FUNCTIONS
//////////////////////////////////////////////////*/

/**
 * Handles archive.
 *
 * @param v - Paths input supplied to archive's operation.
 * @param r - Root dir input supplied to archive's operation.
 * @param f - Filename base input supplied to archive's operation.
 * @param o - Opts input supplied to archive's operation.
 * @param d - Callback invoked for progress.
 * @param n - Node ids input supplied to archive's operation.
 */
const SidebarComponents = {} as {
  PromptDialog: (props: {
    state: PromptState;
    setState: (v: PromptState) => void;
    disabled: boolean;
  }) => JSX.Element | null;
  DeleteDialog: (props: {
    tgt: DelTgt;
    setTgt: (v: DelTgt) => void;
    onConfirm: () => void;
    disabled: boolean;
  }) => JSX.Element | null;
};

/**
 * RENDER TRIPWIRE
 * A diagnostic tool to catch and analyze React infinite loops.
 *
 * @param componentName - Component name input supplied to use render tripwire's operation.
 * @param trackedVars - Tracked vars input supplied to use render tripwire's operation.
 */
/*//////////////////////////////////////////////////
COMPONENTS
//////////////////////////////////////////////////*/

/*
 * Dialog component for selecting and managing all attachments across a section tree.
 *
 * @param props - Active attachment target, state setter, disabled state, and Docs tree for browsing and managing related assets.
 * @param tgt - The specific target node (Leaf, Group, or Section) receiving the attachment modifications.
 * @param setTgt - State dispatcher to clear or update the active target boundary, closing the dialog.
 * @param disabled - Master lock preventing interactions while network mutations or animations are active.
 * @param tree - Tree input supplied to manage attchs dialog's operation.
 *
 * @return The interactive modal overlay containing the attachment dashboard.
 *
 * @remarks
 * Provides a unified interface for uploading raw media, scraping external web links, linking YouTube videos,
 * and directly associating existing or new internal documentation pages as relational attachments.
 */
SidebarComponents.PromptDialog = function PromptDialog({
  state: s,
  setState: setS,
  disabled,
}: {
  state: PromptState;
  setState: (v: PromptState) => void;
  disabled: boolean;
}): JSX.Element | null {
  if (!s) return null;
  return (
    <Dialog
      open={s.open}
      onOpenChange={(o) => {
        if (!o) {
          s.onCancel?.();
          setS(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{s.title}</DialogTitle>
          <DialogDescription>
            {s.description || `Enter a new ${s.label.toLowerCase()}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            autoFocus
            aria-label={s.label}
            value={s.value}
            onChange={(e) => {
              setS({ ...s, value: e.target.value });
            }}
            className="w-full focus:ring-0"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (s.value.trim()) {
                  s.onSave(s.value.trim());
                  setS(null);
                }
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={disabled || !s.value.trim()}
            onClick={() => {
              if (s.value.trim()) {
                s.onSave(s.value.trim());
                setS(null);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/*
 * Renders the delete dialog component.
 *
 * @param props - The selected deletion target, state setter, confirmation callback, and disabled state for the delete confirmation.
 * @param setTgt - Clears or updates the active target.
 * @param tgt - Tgt input supplied to delete dialog's operation.
 * @param disabled - Disabled state controlling whether delete dialog accepts interaction.
 * @param onConfirm - Callback invoked for confirm.
 *
 * @return The delete dialog or nothing when no target is selected.
 *
 * @remarks Renders the delete confirmation dialog for sidebar content.
 */
SidebarComponents.DeleteDialog = function DeleteDialog({
  tgt,
  setTgt,
  onConfirm,
  disabled,
}: {
  tgt: DelTgt;
  setTgt: (v: DelTgt) => void;
  onConfirm: () => void;
  disabled: boolean;
}): JSX.Element | null {
  if (!tgt) return null;
  return (
    <Dialog
      open={!!tgt}
      onOpenChange={(o) => {
        if (!o) setTgt(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {tgt.kind === 'leaf' ? 'page' : tgt.kind === 'branch' ? 'group' : 'section'}?
          </DialogTitle>
          <DialogDescription>
            Delete <code>{tgt.title || tgt.path}</code>{' '}
            {tgt.kind !== 'leaf' ? ' and its nested docs.' : '.'} This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={disabled}
            onClick={() => {
              onConfirm();
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Renders the top collapsed header boundary on mobile-view structurally isolating context safely cleanly.
 *
 * @return {JSX.Element} Visual mobile heading frame.
 */
/**
 * Main sidebar controller connecting context providers natively driving application visual trees.
 *
 * @param {object} props - Input definitions matching specific nav tree routes.
 * @param docs - Docs input supplied to nav's operation.
 * @param pathname - Pathname input supplied to nav's operation.
 * @param permission - Permission input supplied to nav's operation.
 * @param userData - user record supplied to nav.
 *
 * @return {JSX.Element} Fully formatted UI sidebar assembly correctly binding handlers.
 */
export default (function Nav({
  docs: items,
  pathname,
  permission,
  userData,
  siteTitle = 'Terra Symposium',
  siteDescription,
  homePath = '/',
  ...props
}: {
  docs: TreeType[];
  pathname: string;
  permission: import('../../../../lib/terra/runtime/types.js').DocsPermissionLevel;
  userData?: import('../../../../lib/terra/runtime/types.js').User | null;
  siteTitle?: string;
  siteDescription?: string;
  homePath?: string;
}): JSX.Element {
  // STATES
  const leafTitle = useAtom($leafTitle);
  const curMode = useAtom($mode);
  const transitioning = useAtom($transition);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dState, setDState] = useState<ReorderDropState | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [cPathname, setCPathname] = useState(() => route(pathname || '').pathname);
  const urlIds = useMemo(() => route(cPathname), [cPathname]);
  const [viewedSecId, setViewedSecId] = useState<string | null>(
    () => route(pathname || '').sectionId || null,
  );
  const [sectionOpen, setSectionOpen] = useState(false);
  const [tree, setTree] = useState(items);
  const prevTree = useRef(items);
  const [selLeaves, setSelLeaves] = useState<string[]>([]);
  const [lastSel, setLastSel] = useState<string | null>(null);

  // DIALOG STATES
  const [manageAttTgt, setManageAttTgt] = useState<AttchTgt | null>(null);
  const [exportTgt, setExportTgt] = useState<{
    paths: string[];
    rootDir: string;
    filename: string;
    title: string;
    nodeIds?: string[];
  } | null>(null);
  const [assetTgt, setAssetTgt] = useState<{ path: string; title: string } | null>(null);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetComponent, setAssetComponent] = useState(
    repoComponents.find((c) => c.name !== 'Leaf' && c.name !== 'Visualize')?.name ??
      repoComponents[0]?.name ??
      '',
  );
  const [hueDlg, setHueDlg] = useState<{ open: boolean; hue: number; section: TreeType } | null>(
    null,
  );
  const [inputDlg, setInputDlg] = useState<{
    open: boolean;
    title: string;
    description?: string;
    label: string;
    value: string;
    onSave: (val: string) => void;
    onCancel?: () => void;
  } | null>(null);
  const [delTgt, setDelTgt] = useState<{
    kind: 'section' | 'branch' | 'leaf';
    path: string;
    bPath?: string;
    slugPath?: string;
    active?: boolean;
    title: string;
    origNode?: TreeType;
  } | null>(null);

  // INJECT TRIPWIRE TO CATCH STATE THRASHING
  useRenderTripwire('Nav', {
    curMode,
    transitioning,
    creating,
    loading,
    drag,
    dState,
    hovered,
    cPathname,
    urlSectionId: urlIds.sectionId,
    viewedSecId,
    sectionOpen,
    treeHash: tree.length,
    selLeavesCount: selLeaves.length,
    lastSel,
    manageAttTgtScope: manageAttTgt?.scope,
    exportTargetPresent: !!exportTgt,
    assetTargetPresent: !!assetTgt,
    hueDlgOpen: hueDlg?.open,
    inputDlgOpen: inputDlg?.open,
    delTargetPresent: !!delTgt,
  });

  // Sync viewed section with URL on navigation
  useEffect(() => {
    if (urlIds.sectionId) setViewedSecId(urlIds.sectionId);
  }, [urlIds.sectionId]);
  const sects = useMemo(() => {
    let s = Array.isArray(tree) ? tree.filter((d): d is Branch => d.type === 'branch') : [];
    // 1. Deduplicate by origName to prevent React key collisions and redundant entries
    const uniqueMap = new Map<string, Branch>();
    s.forEach((n) => {
      if (!uniqueMap.has(n.origName)) uniqueMap.set(n.origName, n);
    });
    s = Array.from(uniqueMap.values());
    // 2. Filter out top-level nodes that are actually children of another top-level node.
    // (This happens if the API returns explicit warrants for both a Section and its inner Group).
    const nestedBranchIds = new Set<string>();
    s.forEach((n) => {
      if (n.children)
        (function walk(children: TreeType[]) {
          children.forEach((c) => {
            if (c.type === 'branch') {
              nestedBranchIds.add(c.origName);
              if (c.children) walk(c.children);
            }
          });
        })(n.children);
    });
    s = s.filter((n) => !nestedBranchIds.has(n.origName));

    // prettier-ignore
    if (/**
		 * SIMULATED SECTION WRAPPER
		 *
		 * If a user accesses a group directly (e.g., via granular permission /docs/{groupId}/{leafId}),
		 * the nav tree will return Groups as the top-level branches instead of Sections.
		 * The sidebar structurally expects Sections at the top level. We intercept this and wrap
		 * the Groups in a simulated "Shared Context" Section to render the tree seamlessly.
	 */ (s.length > 0 && s.every(b => b.children?.every(c => c.type === 'leaf'))) && s[0]?.origName !== urlIds.sectionId) s = [{ type: 'branch', origName: urlIds.sectionId, permission: 'read', simulated: true, title: s[0]?.title || 'Shared Context', url: docsPath(urlIds.sectionId), children: s }];
    // prettier-ignore
    if (s.length === 0 && permission === 'write') s.push({ type: 'branch', origName: 'new-section', permission: 'read', simulated: true, url: docsPath('new-section'), children: [{ type: 'leaf', origName: 'index', path: 'index.mdx', url: docsRootPath(), permission: 'read', title: 'Untitled', fileType: 'mdx' }]});
    return s;
  }, [tree, permission, urlIds.sectionId]);
  const sectsMap = useMemo(() => {
    const map = new Map<string, Branch>();
    for (const s of sects) map.set(s.origName, s);
    return map;
  }, [sects]);
  const aViewed = useMemo(() => {
    if (viewedSecId) {
      const match = sectsMap.get(viewedSecId);
      if (match) return match;
    }
    if (urlIds.sectionId) {
      const fallback = sectsMap.get(urlIds.sectionId);
      if (fallback) return fallback;
    }
    return sects[0];
  }, [sects, sectsMap, viewedSecId, urlIds.sectionId]);
  const children = useMemo(() => {
    return aViewed?.type === 'branch' ? aViewed.children : [];
  }, [aViewed]);

  // INIT / MOUNT
  useEffect(() => {
    if (JSON.stringify(items) !== JSON.stringify(prevTree.current)) {
      setTree(items);
      prevTree.current = items;
    }
  }, [items]);
  useEffect(() => {
    setCPathname(route(pathname).pathname);
  }, [pathname]);
  const refreshTree = useCallback(async (): Promise<void> => {
    try {
      const { data, error: err } = (await actions.read.doc.list({
        type: 'nav',
        pathname: docsRootPath(),
        full: true,
      })) as ActionRes<TreeType[]>;
      if (!err && Array.isArray(data) && data.length !== 0) setTree(data);
    } catch (err) {
      console.error('[DEBUG:Sidebar] refreshTree err: ', err);
    }
  }, []);
  useEffect(() => {
    /*
     * Handles update sidebar node title.
     *
     * @param nodes - Sidebar nodes containing the document to rename.
     * @param targetPath - Path of the document whose title should change.
     * @param newTitle - New title assigned to the matching document.
     */
    if (leafTitle?.path)
      setTree((c) =>
        (function updateSidebarNodeTitle(
          nodes: TreeType[],
          tgtPath: string,
          newTitle: string,
        ): TreeType[] {
          /**
           * Normalizes a sidebar asset path for comparisons by removing draft and file-extension markers.
           *
           * @param val - Sidebar document path or basename to normalize before matching a title update.
           */
          const cPath = (val: string): string =>
            val
              .replace(TerraQualityRegex.REGEX_DRAFTS_REGEX(), '')
              .replace(TerraQualityRegex.REGEX_MD_MDX_PDF_I_REGEX(), '');
          return nodes.map((n) => {
            const nodePath = n.type === 'leaf' ? n.path || '' : '';
            if (
              n.type === 'leaf' &&
              (nodePath === tgtPath ||
                n.origName === tgtPath ||
                cPath(nodePath) === cPath(tgtPath) ||
                cPath(nodePath.split('/').at(-1) || nodePath) ===
                  cPath(tgtPath.split('/').at(-1) || tgtPath))
            )
              return { ...n, title: newTitle };
            if (n.type === 'branch' && n.children)
              return { ...n, children: updateSidebarNodeTitle(n.children, tgtPath, newTitle) };
            return n;
          });
        })(c, leafTitle.path, leafTitle.title),
      );
  }, [leafTitle]);
  useEffect(() => {
    /**
     * Handles rename event.
     *
     * @param e - Rename event carrying the updated document path.
     */
    const ES = [
      {
        handler: (e: Event): void => {
          const d = eDetail<
            /* Basic draft details utilized by sidebar renaming and drafting events. */ ({
              path: string;
              title: string;
            } & {
              nfilepath: string;
              pathname: string;
            }) & { isActive?: boolean }
          >(e);
          if (!d?.path || !d.nfilepath) return;
          createTrace('DOCS:shared', isDevOrigin(globalThis.location?.origin ?? ''))(
            'rename.start',
            { next: d.nfilepath, previous: d.path },
          );
          setTree((current) => {
            const renamed: TreeType[] = [];
            const pending: { source: TreeType[]; target: TreeType[]; index: number }[] = [
              { source: current, target: renamed, index: 0 },
            ];
            while (pending.length > 0) {
              const frame = pending[pending.length - 1]!;
              if (frame.index >= frame.source.length) {
                pending.pop();
                continue;
              }
              const node = frame.source[frame.index++]!;
              if (node.type === 'leaf' && node.path === d.path) {
                const slug = d.nfilepath
                  .replace(TerraQualityRegex.REGEX_PATTERN_REGEX_6(), '')
                  .replace(FILES.markdown, '')
                  .replace(TerraQualityRegex.REGEX_INDEX_I_REGEX(), '');
                frame.target.push({
                  ...node,
                  path: d.nfilepath,
                  title: d.title ?? node.title,
                  url: docsPath(slug),
                });
                continue;
              }
              if (node.type === 'branch') {
                const children: TreeType[] = [];
                frame.target.push({ ...node, children });
                pending.push({ source: node.children ?? [], target: children, index: 0 });
                continue;
              }
              frame.target.push(node);
            }
            return renamed;
          });
          if (d.isActive) setCPathname(route(d.pathname).pathname);
        },
        type: 'docs:rename',
      },
      {
        handler: (e: Event): void => {
          const d = eDetail<{ url?: string; pathname?: string }>(e);
          if (d?.url || d?.pathname) setCPathname(route(d.url || d.pathname || '').pathname);
        },
        type: 'docs:navigate',
      },
    ];
    ES.forEach(({ type: t, handler: h }) => {
      document.addEventListener(t, h);
    });
    return () => {
      ES.forEach(({ type: t, handler: h }) => {
        document.removeEventListener(t, h);
      });
    };
  }, []);
  const findActiveLeaf = useCallback((v: TreeType[], t: string): LeafNode | null => {
    for (const n of v) {
      if (n.type === 'leaf' && n.url === t) return n;
      if (n.type === 'branch' && n.children) {
        const found = findActiveLeaf(n.children, t);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // MULTI-SELECT HANDLERS
  const handleSelect = useCallback(
    (v: string, i: boolean, r: boolean) => {
      setSelLeaves((s) => {
        if (r) {
          const anchor = lastSel || findActiveLeaf(tree, cPathname)?.path;
          if (anchor) {
            const allLeaves: string[] = [];
            /*
             * Handles walk.
             *
             * @param nodes - Sidebar nodes traversed while collecting leaf paths.
             */
            (function walk(nodes: TreeType[]) {
              nodes.forEach((n) => {
                if (n.type === 'leaf' && n.path) allLeaves.push(n.path);
                if (n.type === 'branch' && n.children) walk(n.children);
              });
            })(tree);
            const i1 = allLeaves.indexOf(anchor);
            const i2 = allLeaves.indexOf(v);
            if (i1 !== -1 && i2 !== -1)
              return Array.from(
                new Set([
                  ...(i ? s : []),
                  ...allLeaves.slice(Math.min(i1, i2), Math.max(i1, i2) + 1),
                ]),
              );
          }
        }
        if (i) {
          setLastSel(v);
          if (s.includes(v)) return s.filter((p) => p !== v);
          return [...s, v];
        }
        setLastSel(v);
        return [v];
      });
    },
    [tree, lastSel, cPathname, findActiveLeaf],
  );
  const clearSelection = useCallback(() => {
    setSelLeaves([]);
    setLastSel(null);
  }, []);
  const mergeLeaves = useCallback(
    (v: string[]) => {
      const leafOrder = new Map<string, number>();
      (function walk(nodes: TreeType[], order = 0): number {
        for (const node of nodes) {
          if (node.type === 'leaf' && node.path) leafOrder.set(node.path, order++);
          if (node.type === 'branch' && node.children) order = walk(node.children, order);
        }
        return order;
      })(tree);
      const orderedPaths = Array.from(new Set(v)).sort(
        (a, b) =>
          (leafOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (leafOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
      );
      if (orderedPaths.length < 2) return;
      setInputDlg({
        open: true,
        title: 'Merge Pages',
        label: 'New page title',
        value: 'Merged Page',
        onCancel: () => {},
        onSave: (nTitle) => {
          // prettier-ignore
          void runMutation(
						async () => {
							try {
								const [firstPath, ...restPaths] = orderedPaths;
								if (!firstPath) throw new Error('Not enough valid documents to merge');
								setTree(v => {
														/*
									 * Handles prune.
																		 *
																											 * @param items - Sidebar items being pruned from the tree.
									 */
									return (function prune(items: TreeType[]): TreeType[] {
						const n: TreeType[] = [];
						for (const node of items) {
							if (node.type === 'leaf') {
								if (!node.path || new Set(restPaths).has(node.path)) continue;
								n.push(node.path === firstPath ? { ...node, title: nTitle } : node);
								continue;
							}
							if (!node.children) {
								n.push(node);
								continue;
							}
							const children = prune(node.children);
							if (children.length > 0) n.push({ ...node, children });
						}
						return n;
					})(v);
								});
				const pages = (await Promise.all(orderedPaths.map(p => actions.read.doc.get({ path: p }))))
					.map((r, i) => ({ path: orderedPaths[i]!, doc: r?.data as Md | undefined }))
					.filter((e): e is { path: string; doc: Md } => Boolean(e.doc));
								if (pages.length < 2) throw new Error('Not enough valid documents to merge');
								const hoisted = new Set<string>();
								const mergedContent = (hoisted.size > 0 ? Array.from(hoisted).join('\n') + '\n\n' : '') + (pages.map(({ doc: d }) => {
					let raw = (typeof d.source === 'string' ? d.source : '') || latestContent(d.content) || '';
									// extract standard imports securely without collapsing body blocks
									raw = raw.replace(/^import\s+[^;]+;/gm, m => {
										hoisted.add(m.trim());
										return '';
									});
									// extract generated MDX exports targeting typical runtime const outputs
									raw = raw.replace(/^export\s+(const|let|var|type|interface)\s+[^;]+;/gm, m => {
										hoisted.add(m.trim());
										return '';
									});
									return `## ${d.title || 'Untitled'}\n\n${raw.trim()}`;
								})).join('\n\n');
								const mergedDesc = pages.map(({ doc: d }) => d.description).filter(Boolean).join(' ').substring(0, 500);
								const { data: nDoc, error: createErr } = (await actions.write.doc.editor({ path: firstPath, title: nTitle, description: mergedDesc, source: mergedContent })) as ActionRes<Md>;
								if (createErr || !nDoc) throw createErr || new Error('Failed to merge doc');
								const { error: srcErr } = await actions.write.doc.retargetSources({ sourceIds: restPaths, targetId: nDoc.path || firstPath });
								if (srcErr) throw srcErr;
								// pass the raw path string straight out of the selection array to the RM action to safely hit Sanity identifiers without verifyWrite injecting `.mdx`
								for (const p of restPaths) {
									if ((TerraQualityRegex.REGEX_INDEX_MD_MDX_I_REGEX().test(p))) await actions.write.doc.rm({ path: dirname(p), type: 'folder' });
									else await actions.write.doc.rm({ path: p, assets: false, type: 'doc' });
								}
								setSelLeaves([]);
								setLastSel(null);
							const tgtRoute = nDoc.pathname || docsPath(dirname(firstPath).toLowerCase());
									memoryDrafts.set(tgtRoute, { source: (typeof nDoc.source === 'string' ? nDoc.source : '') || latestContent(nDoc.content) || '', draft: { content: Array.isArray(nDoc.content) ? nDoc.content : [], description: nDoc.description || '', path: nDoc.path || firstPath, title: nDoc.title || nTitle }, metadata: nDoc });
								$unsavedDrafts.setKey(tgtRoute, false);
								const tgtUrl = new URL(tgtRoute, window.location.origin);
								tgtUrl.searchParams.set('mode', 'edit');
								window.history.pushState(null, '', tgtUrl.toString());
								document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: tgtRoute, pathname: tgtRoute, path: nDoc.path || firstPath, title: nDoc.title || nTitle, description: mergedDesc, source: mergedContent, content: Array.isArray(nDoc.content) ? nDoc.content : undefined, compiledMDX: '' } }),);
								toast.success('Pages merged successfully.');
							} catch (err) {
								setTree((JSON.parse(JSON.stringify(tree)) as TreeType[]));
								throw err;
							}
						},
						'Failed to merge pages.',
						() => { setLoading(true); },
						() => { setLoading(false); },
					);
        },
      });
    },
    [tree],
  );
  const addSection = useCallback(
    (o?: { title?: string; description?: string }) => {
      if ($transition.get()) return;
      setInputDlg({
        open: true,
        title: o?.title || 'Add Section',
        description: o?.description,
        label: 'Section name',
        value: 'Untitled Section',
        onCancel: () => {},
        onSave: (name) => {
          setInputDlg(null);
          setCreating(true);
          (async () => {
            // prettier-ignore
            try {
							const { data: sNameRes } = await actions.read.util.node({ op: 'name', val: name });
							const tSectId = `temp_s_${Date.now()}`;
							const tGrpId = `temp_g_${Date.now()}`;
							const tLeafId = `temp_l_${Date.now()}`;
							const dPath = `${((sNameRes as string) || 'untitled')}/general/untitled`;
							const url = buildRoute(tSectId, tGrpId, tLeafId);
							const sectUrl = docsPath(tSectId);
							setTree(c => {
								const nTree = JSON.parse(JSON.stringify(c)) as TreeType[];
								if (!nTree.find(n => n.type === 'branch' && 'url' in n && n.url === sectUrl))
									nTree.push({
										type: 'branch', origName: tSectId, permission: 'write', title: name, url: sectUrl,
										children: [{
											type: 'branch', origName: tGrpId, permission: 'write', title: 'General', url: buildRoute(tSectId, tGrpId),
											children: [{ type: 'leaf', fileType: 'mdx', origName: tLeafId, path: dPath, permission: 'write', title: 'Untitled', description: '', url, source: '' }],
										}],
									firstLeafUrl: url, hue: getHue(name),
									});
								return nTree;
							});
							memoryDrafts.set(url, { source: '', draft: { content: [], description: '', path: dPath, title: 'Untitled' }, metadata: { path: dPath, title: 'Untitled', description: '', pathname: url } });
							$unsavedDrafts.setKey(url, false);
							const tgtUrl = new URL(url, window.location.origin);
							tgtUrl.searchParams.set('mode', 'edit');
							window.history.pushState(null, '', tgtUrl.toString());
							document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: url, pathname: url, path: dPath, title: 'Untitled', description: '', source: '', content: [], compiledMDX: '' } }),);
							const { data, error } = await actions.write.doc.createSection({ title: name });
							if (error || !data) throw new Error(error?.message || 'Failed to create section.');
							setTimeout(() => {
								void refreshTree();
							}, 2500);
						} catch (err) {
							console.error('[addSection] Creation failed:', err);
							toast.error(err instanceof Error ? err.message : 'Failed to create section.');
							void refreshTree();
						} finally {
							setCreating(false);
						}
          })();
        },
      });
    },
    [refreshTree],
  );
  const uploadAsLeaf = useCallback(
    async (f: FileList | File[] | null, t: string) => {
      if ($transition.get() || !f || f.length === 0) return;
      runMutation(
        async () => {
          const dir = dirname(t);
          for (let i = 0; i < f.length; i++) {
            const file = f[i];
            if (!file || !TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(file.name)) {
              toast.error(`File ${file?.name} must be a markdown document to be a page.`);
              continue;
            }
            const baseName =
              sanitizeName(file.name.replace(TerraQualityRegex.REGEX_I_REGEX(), '')) || 'untitled';
            const { error: wErr } = await actions.write.doc.editor({
              path: `${dir && dir !== '.' ? `${dir}/` : ''}${baseName}`,
              title: baseName.replace(TerraQualityRegex.REGEX_G_REGEX_2(), ' '),
              source: await file.text(),
            });
            if (wErr) throw wErr;
          }
          await refreshTree();
          toast.success('Pages uploaded successfully.');
        },
        'Failed to upload as page.',
        () => {
          setLoading(true);
        },
        () => {
          setLoading(false);
        },
      );
    },
    [refreshTree],
  );
  const triggerRenameSection = useCallback(
    (t: TreeType) => {
      const cName = t.type === 'branch' ? t.origName : '';
      const currTitle = cTitle(toNodeLabel(t.title || cName)) || cName;
      setInputDlg({
        open: true,
        title: 'Rename Section',
        label: 'Section name',
        value: currTitle,
        onCancel: () => {},
        onSave: (nTitle) => {
          if ($transition.get() || t.type !== 'branch') return;
          if (!nTitle || nTitle === currTitle) return;
          runMutation(
            async () => {
              const { error: err } = await actions.write.doc.retitle({
                id: t.origName,
                title: nTitle,
              });
              if (err) throw err;
              await refreshTree();
            },
            'Failed to process rename.',
            () => {
              setLoading(true);
            },
            () => {
              setLoading(false);
            },
          );
        },
      });
    },
    [refreshTree],
  );
  const SidebarActions: {
    saveHue: () => void;
    makeAsset?: () => Promise<void>;
    renderSects?: (t: TreeType) => MenuAction[];
  } = {
    saveHue: useCallback(() => {
      if ($transition.get() || !hueDlg?.section || hueDlg.section.type !== 'branch') return;
      runMutation(
        async () => {
          const tgtSectId = hueDlg.section.origName;
          // Apply hue mutation to Sanity
          const { error: err } = await actions.write.doc.hue({ id: tgtSectId, hue: hueDlg.hue });
          if (err) throw err;
          // 1. Optimistically update our local tree state so the sidebar dot updates immediately
          setTree((p) => {
            const n = [...p];
            const idx = n.findIndex((s) => s.origName === tgtSectId);
            const section = n[idx];
            if (idx !== -1 && section?.type === 'branch') n[idx] = { ...section, hue: hueDlg.hue };
            return n;
          });
          setHueDlg(null);
          // 2. Wait 2.5 seconds to allow the CDN to index the hue change so it persists properly across page loads.
          await new Promise((r) => setTimeout(r, 2500));
          // 3. Refresh tree so subsequent queries use the correct backend hue.
          await refreshTree();
          // 4. Hot-swap the CSS variables robustly
          try {
            const html = await (await fetch(window.location.href)).text();
            const styleMatch = html.match(/<style[^>]*>([\s\S]*?--primary-1:[\s\S]*?)<\/style>/i);
            if (styleMatch) {
              let styleEl = document.getElementById('terra-dynamic-hue');
              if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'terra-dynamic-hue';
                document.head.appendChild(styleEl);
              }
              styleEl.innerHTML = styleMatch[1] || '';
              document.dispatchEvent(new CustomEvent('docs:hue-change'));
            } else {
              const inlineMatch = html.match(/<[^>]+style=["']([^"']*?--primary-1:[^"']*?)["']/i);
              if (inlineMatch) document.documentElement.style.cssText = inlineMatch[1] || '';
              else window.location.reload();
            }
          } catch (_e) {
            window.location.reload();
          }
        },
        'Failed to update color.',
        () => {
          setLoading(true);
        },
        () => {
          setLoading(false);
        },
      );
    }, [hueDlg, refreshTree]),
  };
  const rmBranch = useCallback(
    async (f: string, _bPath: string, s: string): Promise<void> => {
      const pNorm = dirname(f) === '.' ? '' : dirname(f);
      let prevTree: TreeType[] = [];
      setTree((c) => {
        prevTree = c;
        const nTree = JSON.parse(JSON.stringify(c)) as TreeType[];
        const sibs = getSibs(nTree, pNorm);
        const idx = sibs.findIndex(
          (n) => n.type === 'branch' && [pNorm, n.origName].filter(Boolean).join('/') === f,
        );
        if (idx !== -1) sibs.splice(idx, 1);
        return nTree;
      });
      const currPath = cPathname
        .toLowerCase()
        .replace(TerraQualityRegex.REGEX_PATTERN_REGEX_3(), '');
      const currPrefix = docsPath(s)
        .toLowerCase()
        .replace(TerraQualityRegex.REGEX_PATTERN_REGEX_3(), '');
      const nPrefix = docsPath(dirname(s));
      const redirect =
        currPath !== currPrefix && !currPath.startsWith(`${currPrefix}/`)
          ? null
          : `${nPrefix.replace(TerraQualityRegex.REGEX_PATTERN_REGEX_3(), '')}${currPath.slice(currPrefix.length)}` ||
            nPrefix;
      try {
        const { error: err } = await actions.write.doc.rm({ path: s, type: 'folder' });
        if (err && !err.message?.includes('folder not found')) throw err;
        await refreshTree();
        if (redirect && redirect !== cPathname) navigate({ href: redirect, mode: 'view' });
      } catch (err) {
        setTree(prevTree);
        throw err;
      }
    },
    [cPathname, refreshTree],
  );
  const rmLeaf = useCallback(
    async (p: string, b: string, a: boolean): Promise<void> => {
      const isIdx = TerraQualityRegex.REGEX_INDEX_MD_MDX_I_REGEX().test(p);
      const tgtPath = isIdx ? dirname(p) : p;
      const tgtType = isIdx ? 'folder' : 'doc';
      let prevTree: TreeType[] = [];
      setTree((c) => {
        prevTree = c;
        const nTree = JSON.parse(JSON.stringify(c)) as TreeType[];
        const sibs = getSibs(nTree, b);
        const i = sibs.findIndex((n) => (n.type === 'leaf' ? n.path === p : false));
        if (i !== -1) sibs.splice(i, 1);
        return nTree;
      });
      try {
        const { error: err } = await actions.write.doc.rm(
          isIdx ? { path: tgtPath, type: tgtType } : { assets: a, path: tgtPath, type: tgtType },
        );
        if (err && !err.message?.includes('folder not found')) throw err;
        await refreshTree();
        if (a) navigate({ href: docsPath(dirname(p).replace(/^\.\/?/, '')), mode: 'view' });
      } catch (err) {
        setTree(prevTree);
        throw err;
      }
    },
    [refreshTree],
  );

  const openCreate = useCallback(
    (p: string, v: string): void => {
      if ($transition.get()) return;
      setInputDlg({
        open: true,
        title: 'Add Page',
        label: 'Page title',
        value: 'Untitled Page',
        onCancel: () => {},
        onSave: (name) => {
          setInputDlg(null);
          setCreating(true);
          (async () => {
            // prettier-ignore
            try {
							const { data: res, error: resErr } = await actions.read.doc.resolvePath({ path: p, title: name });
							if (resErr || !res) throw resErr || new Error('Failed to resolve path');
							const dPath = (res).path;
							const tLeafId = `temp_l_${Date.now()}`;
							const sectId = urlIds.sectionId;
							let url = '';
							// safety Fallback for parentId mapping
							let aParentId = v;
							if (typeof window !== 'undefined' && (!aParentId || aParentId === '.' || aParentId === sectId)) {
								try {
									const curr = route(window.location.pathname + window.location.search);
									if (curr.groupId) aParentId = curr.groupId;
									else if (curr.sectionId) aParentId = curr.sectionId;
									} catch {
										// The existing parent remains the safe fallback.
									}
							}
							url = aParentId === sectId ? buildRoute(sectId, undefined, tLeafId) : buildRoute(sectId, aParentId, tLeafId);
							setTree(v => {
								const nTree = JSON.parse(JSON.stringify(v)) as TreeType[];
								(function insertLeaf(nodes: TreeType[], tgtId: string): boolean {
									for (const n of nodes) {
										if (n.type === 'branch') {
											if (n.origName === tgtId) {
												if (!n.children) n.children = [];
												// prevent duplicate pushes if it re-renders
													if (!n.children.find(c => c.type === 'leaf' && c.url === url))
														n.children.push({ type: 'leaf', fileType: 'mdx', origName: tLeafId, path: dPath, permission: 'write', title: name, description: '', url, source: '' });
												return true;
											}
											if (n.children && insertLeaf(n.children, tgtId)) return true;
										}
									}
									return false;
								})(nTree, aParentId);
								return nTree;
							});
							memoryDrafts.set(url, { source: '', draft: { content: [], description: '', path: dPath, title: name }, metadata: { path: dPath, title: name, description: '', pathname: url } });
							$unsavedDrafts.setKey(url, false);
							const tgtUrl = new URL(url, window.location.origin);
							tgtUrl.searchParams.set('mode', 'edit');
							window.history.pushState(null, '', tgtUrl.toString());
							document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: url, pathname: url, path: dPath, title: name, description: '', source: '', content: [], compiledMDX: '' } }),);
							const { data, error: err } = (await actions.write.doc.editor({ source: '', description: '', path: dPath, title: name, parentId: aParentId })) as ActionRes<Md>;
							if (err || !data) throw err || new Error('Failed to create docs page.');
							setTimeout(() => {
								void refreshTree();
							}, 2500);
						} catch (err) {
							console.error('[openCreate] Creation failed:', err);
							toast.error('Failed to create docs page.');
							void refreshTree();
						} finally {
							setCreating(false);
						}
          })();
        },
      });
    },
    [refreshTree, urlIds.sectionId],
  );
  const addGroup = useCallback(
    (p: string, s: string) => {
      if ($transition.get()) return;
      setInputDlg({
        open: true,
        title: 'Add Group',
        label: 'Group name',
        value: 'Untitled Group',
        onCancel: () => {},
        onSave: (name) => {
          setInputDlg(null);
          setCreating(true);
          (async () => {
            // prettier-ignore
            try {
							const { data: res, error: resErr } = await actions.read.doc.resolvePath({ path: p, title: name });
							if (resErr || !res) throw resErr || new Error('Failed to resolve path');
							const dPath = `${((res).dir)}/untitled`;
							const tGrpId = `temp_g_${Date.now()}`;
							const tLeafId = `temp_l_${Date.now()}`;
							const rootId = s || urlIds.sectionId;
							const url = buildRoute(rootId, tGrpId, tLeafId);
							const gUrl = buildRoute(rootId, tGrpId);
							setTree(v => {
								const nTree = JSON.parse(JSON.stringify(v)) as TreeType[];
								(function insertGroup(nodes: TreeType[], tgtId: string): boolean {
									for (const n of nodes) {
										if (n.type === 'branch') {
											if (n.origName === tgtId) {
												if (!n.children) n.children = [];
												if (!n.children.find(c => c.type === 'branch' && 'url' in c && c.url === gUrl))
													n.children.push({
													 type: 'branch', origName: tGrpId, permission: 'write', title: name, url: gUrl,
													 children: [{ type: 'leaf', fileType: 'mdx', origName: tLeafId, path: dPath, permission: 'write', title: 'Untitled', description: '', url, source: '' }],
												});
												return true;
											}
											if (n.children && insertGroup(n.children, tgtId)) return true;
										}
									}
									return false;
								})(nTree, rootId);
								return nTree;
							});
							memoryDrafts.set(url, { source: '', draft: { content: [], description: '', path: dPath, title: 'Untitled' }, metadata: { path: dPath, title: 'Untitled', description: '', pathname: url } });
							$unsavedDrafts.setKey(url, false);
							const tgtUrl = new URL(url, window.location.origin);
							tgtUrl.searchParams.set('mode', 'edit');
							window.history.pushState(null, '', tgtUrl.toString());
							document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: url, pathname: url, path: dPath, title: 'Untitled', description: '', source: '', content: [], compiledMDX: '' } }));
							const { data: gData, error: gErr } = await actions.write.doc.createGroup({ title: name, path: gUrl, sectionId: rootId });
							if (gErr || !gData) throw gErr || new Error('Failed to create group.');
						const { data, error: err } = (await actions.write.doc.editor({ source: '', description: '', path: dPath, title: 'Untitled', parentId: (typeof gData === 'object' && '_id' in gData && typeof gData._id === 'string' ? gData._id : undefined) })) as ActionRes<Md>;
							if (err || !data) throw err || new Error('Failed to create group leaf.');
							setTimeout(() => {
								void refreshTree();
							}, 2500);
						} catch (err) {
							console.error('[addGroup] Creation failed:', err);
							toast.error('Failed to create group.');
							void refreshTree();
						} finally {
							setCreating(false);
						}
          })();
        },
      });
    },
    [refreshTree, urlIds.sectionId],
  );
  const mvLeaf = useCallback(
    async ({
      path: p,
      tTarget: tTgt,
      tpath: v,
      tPosition: r,
    }: {
      path: string;
      tTarget?: string;
      tpath: string;
      tPosition?: 'after' | 'before';
    }): Promise<void> => {
      console.warn('[docs:mv-leaf]', { path: p, tTarget: tTgt, tpath: v, tPosition: r });
      const prevTree = JSON.parse(JSON.stringify(tree)) as TreeType[];
      let _nPath = p;
      try {
        /**
         * Handles find parent path.
         *
         * @param nodes - Sidebar nodes searched for the target document.
         * @param tgtPath - Target document path being resolved.
         * @param currPath - Current traversal path accumulated during the search.
         */
        const pPath =
          (function findParentPath(
            nodes: TreeType[],
            tgtPath: string,
            currPath = '',
          ): string | null {
            for (const n of nodes) {
              if (n.type === 'leaf' && n.path === tgtPath) return currPath || '.';
              if (n.type === 'branch' && n.children) {
                const found = findParentPath(
                  n.children,
                  tgtPath,
                  currPath ? `${currPath}/${n.origName}` : n.origName,
                );
                if (found) return found;
              }
            }
            return null;
          })(tree, p) || '';
        const isMovingBranch = pPath !== v;
        const nTree = JSON.parse(JSON.stringify(tree)) as TreeType[];
        const oldSibs = getSibs(nTree, pPath);
        const sIdx = oldSibs.findIndex((n) => (n.type === 'leaf' ? n.path === p : false));
        let movedNode = null;
        if (sIdx !== -1) movedNode = oldSibs.splice(sIdx, 1)[0];
        const tgtSibs = getSibs(nTree, v);
        let iIdx = tgtSibs.length;
        if (tTgt) {
          const tgtIdx = tgtSibs.findIndex((n) =>
            n.type === 'leaf'
              ? n.path === tTgt
              : n.type === 'branch' && [v, n.origName].filter(Boolean).join('/') === tTgt,
          );
          if (tgtIdx !== -1) iIdx = (r ?? 'before') === 'before' ? tgtIdx : tgtIdx + 1;
        }
        if (movedNode) tgtSibs.splice(iIdx, 0, movedNode);
        setTree(nTree);
        if (isMovingBranch) {
          const tgtNorm = v === '.' ? '' : v;
          const folderBacked = TerraQualityRegex.REGEX_INDEX_MD_MDX_I_REGEX().test(p);
          const leafDirName = folderBacked
            ? p.split('/').slice(-2)[0]
            : bName(p, p.match(TerraQualityRegex.REGEX_I_REGEX())?.[0]);
          const ext = p.match(TerraQualityRegex.REGEX_I_REGEX())?.[0] ?? '.mdx';
          const nPath = folderBacked
            ? `${tgtNorm === '.' ? '' : `${tgtNorm}/`}${leafDirName}/index${ext}`
            : `${tgtNorm === '.' ? '' : `${tgtNorm}/`}${leafDirName}${ext}`;
          if (p !== nPath) {
            const { data: docData } = await actions.read.doc.get({ path: p });
            const { data: movedDoc, error } = await actions.write.doc.commit({
              cur: p,
              next: nPath,
              source:
                docData &&
                typeof docData === 'object' &&
                'source' in docData &&
                typeof docData.source === 'string'
                  ? docData.source
                  : '',
            });
            _nPath = (movedDoc as Md | undefined)?.path || nPath;
            if (error) {
              setTree(prevTree);
              toast.error(error.message || 'Move failed');
              notify({ error: new Error(error.message), fallback: 'Failed to move docs page.' });
              return;
            }
          }
        }
        if (tgtSibs.length > 0) {
          const parentIds = v.split('/');
          const parentId = parentIds[parentIds.length - 1];
          if (parentId && parentId !== '.') {
            const { error } = await actions.write.doc.reorder({
              id: parentId,
              field:
                /* Identify whether we are patching a Group or Section natively */ parentIds.length >
                1
                  ? 'leaves'
                  : 'groups',
              items: tgtSibs
                .filter((s) => s.type === 'leaf')
                .map((s) => ({ _type: 'reference', _ref: s === movedNode ? _nPath : s.origName })),
            });
            if (error) throw error;
          }
        }
        if (isMovingBranch && oldSibs) {
          const oldParentIds = pPath.split('/');
          const oldParentId = oldParentIds[oldParentIds.length - 1];
          if (oldParentId && oldParentId !== '.') {
            const { error } = await actions.write.doc.reorder({
              id: oldParentId,
              field: oldParentIds.length > 1 ? 'leaves' : 'groups',
              items: oldSibs
                .filter((s) => s.type === 'leaf')
                .map((s) => ({ _type: 'reference', _ref: s.origName })),
            });
            if (error) throw error;
          }
        }
        await refreshTree();
      } catch (err: unknown) {
        setTree(prevTree);
        toast.error(err instanceof Error ? err.message : 'Move failed');
        notify({
          error: err instanceof Error ? err : new Error('Move failed'),
          fallback: 'Failed to move docs page.',
        });
        void refreshTree();
      }
    },
    [tree, refreshTree],
  );
  const mvBranch = useCallback(
    async ({
      fPath: f,
      pPath: p,
      tpath: t,
      tPosition: v,
      tTarget: tTgt,
    }: {
      fPath: string;
      pPath: string;
      tpath: string;
      tPosition?: 'after' | 'before';
      tTarget?: string;
    }): Promise<void> => {
      if (p !== t) return;
      try {
        const nTree = JSON.parse(JSON.stringify(tree)) as TreeType[];
        const oldSibs = getSibs(nTree, p);
        const srcIdx = oldSibs.findIndex((n) =>
          n.type === 'branch' ? [p, n.origName].filter(Boolean).join('/') === f : false,
        );
        let movedNode = null;
        if (srcIdx !== -1) movedNode = oldSibs.splice(srcIdx, 1)[0];
        const tgtSibs = getSibs(nTree, t);
        let iIdx = tgtSibs.length;
        const tIdx = tgtSibs.findIndex(
          (n) => n.type === 'branch' && [t, n.origName].filter(Boolean).join('/') === tTgt,
        );
        if (tIdx !== -1) iIdx = (v ?? 'before') === 'before' ? tIdx : tIdx + 1;
        if (movedNode) tgtSibs.splice(iIdx, 0, movedNode);
        setTree(nTree);
        if (tgtSibs.length > 0) {
          const parentIds = t.split('/');
          const parentId = parentIds[parentIds.length - 1];
          if (parentId && parentId !== '.') {
            const { error } = await actions.write.doc.reorder({
              id: parentId,
              field: 'groups',
              items: tgtSibs
                .filter((s) => s.type === 'branch')
                .map((s) => ({ _type: 'reference', _ref: s.origName })),
            });
            if (error) throw error;
          }
        }
        await refreshTree();
      } catch (err: unknown) {
        setTree(JSON.parse(JSON.stringify(tree)) as TreeType[]);
        toast.error(err instanceof Error ? err.message : 'Move failed');
        notify({
          error: err instanceof Error ? err : new Error('Move failed'),
          fallback: 'Failed to reorder docs groups.',
        });
        void refreshTree();
      }
    },
    [tree, refreshTree],
  );
  const actionDisabled = creating || loading;
  const assetChoices = useMemo(
    () =>
      repoComponents
        .filter((c) => c.name !== 'Leaf' && c.name !== 'Visualize')
        .map((c) => ({ label: c.name.replace(/([a-z])([A-Z])/g, '$1 $2'), name: c.name })),
    [],
  );
  useEffect(() => {
    if (!assetTgt) return;
    if (!assetChoices.some((c) => c.name === assetComponent))
      setAssetComponent(assetChoices[0]?.name ?? '');
    setAssetDialogOpen(true);
  }, [assetTgt, assetChoices, assetComponent]);
  SidebarActions.makeAsset = useCallback(async (): Promise<void> => {
    if (!assetTgt || !assetComponent || assetBusy) return;
    try {
      setAssetBusy(true);
      const { error } = await actions.write.doc.asset({
        path: assetTgt.path,
        component: assetComponent,
        title: assetTgt.title,
        description: '',
      });
      if (error) throw error;
      setAssetDialogOpen(false);
      setAssetTgt(null);
      toast.success('Asset created successfully.');
      await refreshTree();
    } catch (err) {
      console.error('[Sidebar] Failed to convert page to asset:', err);
      notify({
        error: err instanceof Error ? err : new Error('Failed to convert page to asset.'),
        fallback: 'Failed to convert page to asset.',
      });
    } finally {
      setAssetBusy(false);
    }
  }, [assetBusy, assetComponent, assetTgt, refreshTree]);
  SidebarActions.renderSects = useCallback(
    (t: TreeType) => {
      const origName = t.type === 'branch' ? t.origName : '';
      const slugPath =
        'url' in t && t.url ? t.url.replace(TerraQualityRegex.REGEX_DOCS_REGEX(), '') : '';
      const titleStr = cTitle(toNodeLabel(t.title || origName));
      return [
        {
          icon: <LinkIcon />,
          label: 'Copy link',
          disabled: actionDisabled,
          onSelect: () => {
            void navigator.clipboard.writeText(
              `${window.location.origin}${'url' in t && t.url ? t.url : ''}`,
            );
            toast.success('Link copied');
          },
        },
        {
          icon: <BoxIcon />,
          label: 'Manage attachments',
          disabled: actionDisabled,
          onSelect: () => {
            setManageAttTgt({
              path: slugPath,
              title: titleStr || slugPath,
              scope: 'section',
              node: t,
            });
          },
        },
        {
          icon: <DownloadIcon />,
          label: 'Download section',
          disabled: actionDisabled,
          onSelect: ((paths, nodeIds) => () => {
            setExportTgt({
              paths,
              rootDir: slugPath,
              filename: sanitizeName(titleStr || slugPath),
              title: `${titleStr} docs`,
              nodeIds,
            });
          })(
            Array.from(new Set([...toPaths(t.type === 'branch' ? t.children : [])])),
            extractAllNodeIds([t]),
          ),
        },
        {
          icon: <PopOutIcon />,
          label: 'Make asset',
          disabled: actionDisabled,
          onSelect: () => {
            setAssetTgt({ path: slugPath, title: titleStr || slugPath });
          },
        },
        ...(permission === 'write'
          ? [
              {
                disabled: actionDisabled,
                icon: <EditIcon />,
                label: 'Rename section',
                onSelect: () => {
                  triggerRenameSection(t);
                },
              },
              {
                disabled: actionDisabled,
                icon: <ColorIcon />,
                label: 'Change color',
                onSelect: () => {
                  setHueDlg({
                    open: true,
                    hue: getHue(t.title || slugPath, t.type === 'branch' ? t.hue : undefined),
                    section: t,
                  });
                },
              },
              {
                destructive: true,
                disabled: actionDisabled,
                icon: <TrashIcon />,
                label: 'Delete section',
                onSelect: () => {
                  setDelTgt({
                    kind: 'section',
                    path: origName,
                    slugPath,
                    title: titleStr || slugPath,
                    origNode: t,
                  });
                },
              },
            ]
          : []),
      ];
    },
    [permission, actionDisabled, triggerRenameSection],
  );
  const getTree = useCallback(() => tree, [tree]);

  // CONTEXT
  const treeCtx = useMemo(
    () => ({
      creating,
      transitioning,
      drag,
      dState,
      mode: curMode,
      mvBranch,
      mvLeaf,
      pathname: cPathname,
      refreshTree,
      shellPermission: permission,
      openCreate,
      addGroup,
      uploadAsLeaf,
      rmBranch,
      rmLeaf,
      setDrag: (d: DragState | null) => {
        setDrag(d);
        if (!d) setDState(null);
      },
      setDState,
      setHovered,
      hovered,
      setInputDlg,
      setTree,
      getTree,
      findActiveLeaf,
      setCPathname,
      selectedLeaves: selLeaves,
      handleSelect,
      clearSelection,
      mergeLeaves,
      setDelTarget: setDelTgt,
      setExportTarget: setExportTgt,
      setManageAttTgt,
      setAssetTarget: setAssetTgt,
    }),
    // prettier-ignore
    [creating, transitioning, drag, dState, curMode, mvBranch, mvLeaf, cPathname, refreshTree, permission, openCreate, addGroup, uploadAsLeaf, rmBranch, rmLeaf, hovered, selLeaves, handleSelect, clearSelection, mergeLeaves, getTree],
  );

  // RENDERS
  return (
    <ErrorBoundary
      name="Sidebar"
      fallback={() => (
        <Sidebar className="not-prose z-50 overflow-y-auto p-4">
          <AlertError
            description="An unexpected error occurred while rendering the sidebar panel. The remaining workspace continues to function."
            title="Sidebar render crash"
          />
        </Sidebar>
      )}
    >
      <Sidebar
        {...props}
        sticky
        className="not-prose bg-primary-2 p-2"
        onClick={() => {
          // prevent clearing if a dialog is actively open
          if (inputDlg?.open || hueDlg?.open || delTgt) return;
          if (selLeaves.length > 0) clearSelection();
        }}
      >
        {/* STYLE */}
        {/* prettier-ignore */}
        <style dangerouslySetInnerHTML={{ __html: ` [data-sidebar="sidebar"], [data-sidebar="sidebar"][data-mobile="true"], [data-mobile="true"] .bg-sidebar, .bg-sidebar { background-color: rgb(var(--primary-2)) !important; } ` }} />
        {/* DIALOGS */}
        <SharedExportDialog
          target={exportTgt}
          setTarget={setExportTgt}
          disabled={loading || transitioning}
          onExport={(target, options, progress) =>
            archiveDocs(
              target.paths,
              target.rootDir,
              target.filename,
              options,
              progress,
              target.nodeIds || [],
            )
          }
        />
        <ManageAttachmentsDialog
          tgt={manageAttTgt}
          setTgt={setManageAttTgt}
          disabled={loading || transitioning}
          tree={tree}
        />
        {/* prettier-ignore */}
        <Dialog
					open={assetDialogOpen}
					onOpenChange={o => {
						if (assetBusy) return;
						setAssetDialogOpen(o);
						if (!o) setAssetTgt(null);
					}}
				>
					<DialogContent className='sm:max-w-lg'>
						<DialogHeader>
							<DialogTitle>Make Asset</DialogTitle>
							<DialogDescription>This will replace the page history with one standalone component version.</DialogDescription>
						</DialogHeader>
						<div className='space-y-4 py-4'>
							<div className='space-y-1.5'>
								<Label>Component</Label>
								<Select value={assetComponent} onValueChange={setAssetComponent}>
									<SelectTrigger aria-label='Select a component...'><SelectValue placeholder='Select a component...' /></SelectTrigger>
									<SelectContent>{assetChoices.map(c => <SelectItem key={c.name} value={c.name}>{c.label}</SelectItem>)}</SelectContent>
								</Select>
							</div>
							<AlertError title='Warning' description='Converting this page to an asset erases every existing version except the selected component.' />
						</div>
						<DialogFooter>
							<Button variant='ghost' disabled={assetBusy} onClick={() => { setAssetTgt(null); }}>Cancel</Button>
							<Button disabled={!assetComponent || assetBusy} loading={assetBusy} onClick={() => void SidebarActions.makeAsset!()}>Make Asset</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
        <SidebarComponents.PromptDialog
          state={inputDlg}
          setState={setInputDlg}
          disabled={loading || transitioning}
        />
        <SidebarComponents.DeleteDialog
          tgt={delTgt}
          setTgt={setDelTgt}
          onConfirm={() => {
            if (!delTgt || transitioning) return;
            const { kind, origNode, slugPath, path, bPath, active: a } = delTgt;
            setDelTgt(null);
            runMutation(
              async () => {
                if (kind === 'section' && origNode) {
                  const sectionPath = slugPath!;
                  let prev: TreeType[] = [];
                  setTree((c) => {
                    prev = c;
                    return c.filter(
                      (n) => !(n.type === 'branch' && n.origName === (origNode as Branch).origName),
                    );
                  });
                  const { error: err } = await actions.write.doc.rm({
                    path: sectionPath,
                    type: 'folder',
                  });
                  if (err && !err.message?.includes('folder not found')) {
                    setTree(prev);
                    throw err;
                  }
                  await refreshTree();
                  if (cPathname.toLowerCase().startsWith(docsPath(sectionPath).toLowerCase()))
                    navigate({ href: docsRootPath(), mode: 'view' });
                } else if (kind === 'branch') await rmBranch(path, bPath!, slugPath!);
                else if (kind === 'leaf') await rmLeaf(path, bPath!, !!a);
              },
              `Failed to delete ${kind}.`,
              () => setLoading(true),
              () => setLoading(false),
            );
          }}
          disabled={loading || transitioning}
        />
        <Dialog
          open={hueDlg?.open ?? false}
          onOpenChange={(o) => {
            if (loading || transitioning) return;
            setHueDlg((p) => (p ? { ...p, open: o } : null));
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Section Color</DialogTitle>
              <DialogDescription>
                Adjust the hue for this section to customize its appearance.
              </DialogDescription>
            </DialogHeader>
            <Slider
              min={0}
              max={360}
              step={1}
              value={[hueDlg?.hue ?? 0]}
              onValueChange={([v]) => {
                setHueDlg((p) => (p ? { ...p, hue: v ?? 0 } : null));
              }}
              disabled={loading || transitioning}
              className="my-6 w-full [&_[data-slot=slider-range]]:bg-[color:var(--slider-color)] [&_[data-slot=slider-thumb]]:border-[color:var(--slider-color)] [&_[data-slot=slider-thumb]]:bg-[color:var(--slider-color)]"
              style={
                { '--slider-color': `hsl(${hueDlg?.hue ?? 0} 65% 55%)` } as React.CSSProperties
              }
            />
            <DialogFooter>
              <Button
                variant="ghost"
                disabled={loading || transitioning}
                onClick={() => {
                  if (hueDlg?.section)
                    setHueDlg({
                      ...hueDlg,
                      hue: getHue(
                        hueDlg.section.title ||
                          (hueDlg.section.type === 'branch' ? hueDlg.section.origName : ''),
                      ),
                    });
                }}
              >
                Reset
              </Button>
              <Button
                disabled={loading || transitioning}
                loading={loading}
                onClick={() => {
                  SidebarActions.saveHue();
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* HEADER */}
        <SidebarHeader className="print:hidden" data-docs-navigation="true">
          {/* logo */}
          <div className="mb-4 space-y-1 border-b border-primary-6 pb-4">
            <a className="font-serif text-2xl hover:italic hover:tracking-tight" href={homePath}>
              {siteTitle}
            </a>
            {siteDescription && <p className="m-0 text-sm text-primary-11">{siteDescription}</p>}
          </div>
          {/* sects */}
          <div className="mt-2">
            <Label
              htmlFor="docs-section-picker"
              className="mb-1 block text-[10px] font-semibold tracking-[0.12em] text-primary-10"
            >
              SECTION
            </Label>
            <div className="flex items-center gap-1">
              <div className="block min-w-0 flex-1 rounded-md transition-opacity">
                <Select
                  disabled={transitioning}
                  open={sectionOpen}
                  onOpenChange={setSectionOpen}
                  value={aViewed ? aViewed.origName : ''}
                  onValueChange={async (v) => {
                    if (v === '__add_section__') {
                      setTimeout(() => {
                        addSection();
                      }, 0);
                      return;
                    }
                    if (aViewed?.origName === v) return;
                    setViewedSecId(v);
                  }}
                >
                  <SelectTrigger
                    id="docs-section-picker"
                    className="w-full"
                    aria-label="Section"
                    data-docs-navigation="true"
                    onPointerDown={(e) => {
                      if (e.button === 0) setSectionOpen(true);
                    }}
                  >
                    <SelectValue placeholder="Section" />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--radix-select-trigger-width)]">
                    {sects.map((s) => {
                      if (s.simulated) {
                        return (
                          <SelectItem
                            key={s.origName}
                            value={s.origName}
                            icon={
                              <span
                                aria-hidden="true"
                                className="size-3.5 rounded-[3px]"
                                style={{
                                  backgroundColor: `hsl(${getHue(s.title || 'New Section')} 65% 55%)`,
                                }}
                              />
                            }
                            className="data-[state=checked]:text-primary-10 dark:data-[state=checked]:text-primary-12"
                          >
                            {s.title || 'New Section'}
                          </SelectItem>
                        );
                      }
                      // prettier-ignore
                      return (
												<SelectItem
											key={s.origName}
													value={s.origName}
													icon={<span aria-hidden='true' className='size-3.5 rounded-[3px]' style={{ backgroundColor: `hsl(${hueDlg?.open && hueDlg.section.origName === s.origName ? hueDlg.hue : getHue(s.title || s.origName, s.hue)} 65% 55%)` }} />}
													className='data-[state=checked]:text-primary-10 dark:data-[state=checked]:text-primary-12'
												>
													<ContextMenu>
												<ContextMenuTrigger className='flex w-full items-center justify-between'><span className='line-clamp-1'>{cTitle(toNodeLabel(s.title || s.origName))}</span></ContextMenuTrigger>
													<ContextMenuContent><Menu actions={SidebarActions.renderSects!(s)} /></ContextMenuContent>
													</ContextMenu>
												</SelectItem>
											);
                    })}
                    {permission === 'write' && (
                      <>
                        {sects.length > 0 && !sects[0]?.simulated && <Separator className="my-1" />}
                        <SelectItem
                          value="__add_section__"
                          icon={<AddIcon className="size-4" />}
                          className="font-medium text-primary-11 data-[state=checked]:text-primary-10 dark:data-[state=checked]:text-primary-12"
                        >
                          <span>Add section</span>
                        </SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {aViewed && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={`Actions for section ${aViewed.title || aViewed.origName}`}
                      className="h-8 w-8 shrink-0 px-1"
                    >
                      <OverflowMenuIcon size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(SidebarActions.renderSects?.(aViewed) ?? []).map((action, index) => (
                      <DropdownMenuItem
                        key={`${action.label}-${index}`}
                        disabled={action.disabled}
                        onSelect={() => action.onSelect?.()}
                        className={
                          action.destructive ? 'text-destructive focus:text-destructive' : undefined
                        }
                      >
                        {action.icon}
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </SidebarHeader>
        {/* TOC */}
        <ContextMenu>
          <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col outline-none">
            <SidebarContent className="min-h-0 flex-1 overflow-y-auto">
              <SidebarMenu>
                {children.map((n) => (
                  <Tree
                    key={getStableKey(n)}
                    bPath={aViewed?.origName ?? ''}
                    node={n}
                    ctx={treeCtx}
                    siblings={children}
                  />
                ))}
              </SidebarMenu>
            </SidebarContent>
          </ContextMenuTrigger>
          {permission === 'write' && aViewed && (
            <ContextMenuContent>
              <Menu
                actions={[
                  {
                    disabled: actionDisabled,
                    icon: <AddIcon />,
                    label: 'Add group',
                    onSelect: () => {
                      if (aViewed.simulated)
                        addSection({
                          title: 'Create Section',
                          description: 'A section must be created first to hold your new group.',
                        });
                      else treeCtx.addGroup(aViewed.origName, aViewed.origName);
                    },
                  },
                ]}
              />
            </ContextMenuContent>
          )}
        </ContextMenu>
        {/* USER */}
        <SidebarFooter>
          {userData && <User user={userData} className="mr-auto pl-0" />}
        </SidebarFooter>
        {/* RAIL */}
        <SidebarRail />
      </Sidebar>
    </ErrorBoundary>
  );
});
