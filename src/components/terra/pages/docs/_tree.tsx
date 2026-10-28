// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/pages/docs/_tree.tsx
 * Recursively rendering branch nodes composing the sidebar UI tree structure, alongside leaves and menus.
 * Folder boundary: recursive sidebar tree presentation only; sidebar state and dialogs remain in `_sidebar.tsx`.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import {
  $unsavedDrafts,
  clearTransition,
  memoryDrafts,
  resetEditorMounts,
  setTransition,
  useAtom,
} from '../../../../lib/terra/docs/state.js';
import {
  extractAllNodeIds,
  getStableKey,
  isIndexFile,
  sanitizeName,
} from '../../../../lib/terra/docs/tree.js';
import { runMutation } from '../../../../lib/terra/docs/mutations.js';
import { download, uploadAssetChunked } from '../../../../lib/terra/docs/assets.js';
import { actions } from '../../../../lib/terra/runtime/action-proxy.js';
import {
  bName,
  cTitle,
  dirname,
  docsPath,
  docsRootPath,
  toNodeLabel,
  toPaths,
} from '../../../../lib/terra/runtime/shared.js';
import { cn, notify } from '../../../../lib/terra/runtime/runtime.js';
import { toPortableBody } from '../../../../lib/terra/runtime/leaf.js';
import { Toc } from './_toc.js';
import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';

// COMPONENTS
import * as TerraQualityRegex from '../../../../lib/terra/regex.mjs';
import React, { Fragment } from 'react';
import {
  Add as AddIcon,
  ArrowUpRight as PopOutIcon,
  Box as BoxIcon,
  Copy as CopyIcon,
  Doc as DocumentIcon,
  Download as DownloadIcon,
  Draggable as DragIcon,
  Edit as EditIcon,
  Link as LinkIcon,
  MagicWand as MagicIcon,
  TrashCan as TrashIcon,
} from '@carbon/icons-react';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@terra-symposium/styling/ui/terra-original';
import { ErrorBoundary } from '../../ui.js';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@terra-symposium/styling/ui/terra-original';

// DATA
import { REORDER } from '../../../../lib/terra/runtime/shared.js';

// TYPES
import type { ActionRes, Md } from '../../../../lib/terra/runtime/types.js';
import type { DocsTreeMenuAction as MenuAction } from '../../../../lib/terra/runtime/types.js';
import type { DragState } from '../../../../lib/terra/runtime/types.js';
import type {
  Leaf as LeafNode,
  Mode,
  Tree as ITree,
  Tree as TreeType,
} from '../../../../lib/terra/runtime/types.js';
import type { ReorderDropState } from '../../../../lib/terra/runtime/types.js';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

// DATA
/** Validated interactive literal mappings explicitly capturing action intents. */
const UI = {
  add: { doc: 'Add page', group: 'Add group' },
  open: 'bg-primary-3 text-primary-12',
} as const;

// TYPES

/*//////////////////////////////////////////////////
MENU COMPONENTS
//////////////////////////////////////////////////*/

/**
 * Renders a standard ContextMenu with support for nested sub-actions and separators.
 *
 * @param props - Ordered menu actions, including labels, optional icons, disabled state, separators, and nested sub-actions.
 *
 * @return The context menu with the supplied actions and any nested menus.
 */
export function Menu({ actions }: { actions: MenuAction[] }): JSX.Element {
  // prettier-ignore
  return <ErrorBoundary name='Menu'>{actions.map((a, i) => (
				<Fragment key={a.label + i}>
					{a.separator && <ContextMenuSeparator />}
					{a.subActions ? (
						<ContextMenuSub>
						<ContextMenuSubTrigger disabled={a.disabled} className={a.destructive ? 'text-red-600 focus:text-red-600' : undefined}>{a.icon} <span>{a.label}</span></ContextMenuSubTrigger>
							<ContextMenuSubContent><Menu actions={a.subActions} /></ContextMenuSubContent>
						</ContextMenuSub>
					) : <ContextMenuItem className='px-3' disabled={a.disabled} intent={a.destructive ? 'destructive' : 'default'} onSelect={a.onSelect}>{a.icon} {a.label}</ContextMenuItem>}
				</Fragment>
			))}</ErrorBoundary>;
}

/**
 * Renders the link component.
 *
 * @param props - Tree node state, display mode, navigation context, and optional trailing control for one sidebar link.
 * @param active - Boolean flag controlling link's active behaviour.
 * @param contexting - Contexting input supplied to link's operation.
 * @param dragging - Dragging input supplied to link's operation.
 * @param renaming - Renaming input supplied to link's operation.
 * @param node - Node input supplied to link's operation.
 * @param trailing - Trailing input supplied to link's operation.
 * @param mode - Mode input supplied to link's operation.
 * @param transitioning - Transitioning input supplied to link's operation.
 *
 * @return The interactive sidebar link with its current selection and drag/rename states.
 */
function Link({
  active: a,
  contexting = false,
  dragging = false,
  renaming = false,
  node,
  trailing,
  mode,
  transitioning = false,
}: {
  active: boolean;
  contexting?: boolean;
  dragging?: boolean;
  renaming?: boolean;
  node: ITree;
  trailing?: ReactNode;
  mode: Mode;
  transitioning?: boolean;
}): JSX.Element {
  const unsaved = useAtom($unsavedDrafts);
  const asset = node.type === 'leaf' && node.asset === true;
  const isDirty =
    node.type === 'leaf' &&
    (unsaved[(node.type === 'leaf' ? node.path : '') ?? ''] ||
      unsaved[(node.type === 'leaf' ? node.url : '') ?? '']);
  return (
    <SidebarMenuButton
      asChild
      isActive={a}
      className={cn(
        'group h-auto justify-between py-0 transition-colors',
        contexting && UI.open,
        renaming && 'ring-1 ring-ring',
        isDirty && 'pl-1.5',
      )}
    >
      <div className="flex w-full items-center gap-1">
        {/* display */}
        <a
          href={
            asset
              ? node.type === 'leaf' && node.url
                ? node.url
                : ''
              : 'url' in node && node.url
                ? node.url
                : ''
          }
          target={asset || (node.type === 'leaf' && node.fileType === 'pdf') ? '_blank' : '_self'}
          rel={
            asset || (node.type === 'leaf' && node.fileType === 'pdf') ? 'noreferrer' : undefined
          }
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5',
            dragging && 'pointer-events-none',
          )}
          draggable={false}
          onDragStart={(e) => {
            e.preventDefault();
          }}
          onClick={async (e: ReactMouseEvent<HTMLAnchorElement>) => {
            if (asset || (node.type === 'leaf' && node.fileType === 'pdf')) return;
            if (e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            e.preventDefault();
            if (a || transitioning || !('url' in node) || !node.url) return;
            if (node.type !== 'leaf') return;
            setTransition('local');
            let data: Md | undefined;
            try {
              const result = (await actions.read.doc.get({ path: node.path })) as ActionRes<Md>;
              if (!result.error) data = result.data;
            } catch {
              // Keep the current document visible when its replacement cannot be loaded.
            }
            if (!data || !Array.isArray(data.content) || typeof data.source !== 'string') {
              clearTransition();
              toast.error('Failed to load document.');
              return;
            }
            const content = toPortableBody(data.content);
            resetEditorMounts(node.path, ['root']);
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  resolve();
                }),
              ),
            );
            const url = new URL(node.url, window.location.origin);
            new URL(window.location.href).searchParams.forEach((v, k) => {
              if (k !== 'mode' && !url.searchParams.has(k)) url.searchParams.set(k, v);
            });
            if (mode !== 'view') url.searchParams.set('mode', mode);
            else url.searchParams.delete('mode');
            // PIPELINE: sidebar navigation carries stored JSON; View never compiles Markdown.
            window.history.pushState(null, '', url.toString());
            // prettier-ignore
            document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: url.pathname + url.search, pathname: url.pathname + url.search, path: node.path, title: data.title || node.title, description: data.description ?? node.description, contributors: node.contributors, updatedAt: node.updatedAt, source: data.source, content, compiledMDX: '' } }));
          }}
        >
          {isDirty && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-yellow-500"
              title="Unsaved changes"
            />
          )}
          <span className="line-clamp-1">{cTitle(toNodeLabel(node.title || node.origName))}</span>
          {asset && (
            <PopOutIcon className="ml-auto size-3.5 shrink-0 text-primary-10" aria-hidden="true" />
          )}
        </a>
        {/* handle */}
        {trailing}
      </div>
    </SidebarMenuButton>
  );
}

/*//////////////////////////////////////////////////
COMPONENTS
//////////////////////////////////////////////////*/

/**
 * Encapsulates the drag handler button for consistent visual implementation
 * across branch and leaf levels to reduce boilerplate logic.
 *
 * @param props - Drag availability, visibility, and start/end callbacks for the branch or leaf reorder handle.
 * @param disabled - Disabled state controlling whether drag handle accepts interaction.
 * @param isVisible - Boolean flag controlling drag handle's is visible behaviour.
 * @param onDragStart - Callback invoked for drag start.
 * @param onDragEnd - Callback invoked for drag end.
 *
 * @return The draggable reorder button, hidden or disabled when reordering is unavailable.
 */
function DragHandle({
  disabled,
  isVisible,
  onDragStart,
  onDragEnd,
}: {
  disabled: boolean;
  isVisible: boolean;
  onDragStart: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Reorder item"
      draggable
      className={cn(
        REORDER.handle,
        isVisible && !disabled ? 'opacity-100' : 'opacity-0 disabled:opacity-0',
      )}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
      }}
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      title="Drag"
    >
      <DragIcon className="size-3" aria-hidden="true" />
    </Button>
  );
}

/*//////////////////////////////////////////////////
TOC COMPONENTS
//////////////////////////////////////////////////*/

/**
 * Renders the toc component.
 *
 * @param props - Optional heading override used while collecting the document's navigable section headings.
 * @param title - Heading text shown in toc.
 *
 * @return A table of contents for discovered headings, or `null` when there are no headings to navigate.
 */
const TREE_COMPONENTS = {
  /*//////////////////////////////////////////////////
LEAF COMPONENTS
//////////////////////////////////////////////////*/

  /**
   * Renders the leaf component.
   *
   * @param props - Leaf metadata, parent path, sibling nodes, and tree interaction handlers for rendering a document entry.
   * @param active - Boolean flag controlling leaf's active behaviour.
   * @param bPath - B path input supplied to leaf's operation.
   * @param node - Node input supplied to leaf's operation.
   * @param ctx - Ctx input supplied to leaf's operation.
   * @param siblings - Siblings input supplied to leaf's operation.
   *
   * @return The document row with its navigation, selection, rename, attachment, export, and reorder controls.
   */
  Leaf({
    active: a,
    bPath,
    node,
    ctx,
    siblings,
  }: {
    active: boolean;
    bPath: string;
    node: LeafNode;
    siblings?: TreeType[];
    ctx: {
      creating: boolean;
      transitioning: boolean;
      drag: DragState | null;
      dState: ReorderDropState | null;
      mode: Mode;
      openCreate: (fPath: string, parentId: string) => void;
      uploadAsLeaf: (
        files: FileList | File[] | null,
        tgtPath: string,
        pos: 'before' | 'after',
        tgtType: 'file' | 'folder',
      ) => Promise<void>;
      mvLeaf: (input: {
        path: string;
        tTarget?: string;
        tpath: string;
        tPosition?: 'after' | 'before';
      }) => Promise<void>;
      shellPermission: 'read' | 'write';
      setDrag: (drag: DragState | null) => void;
      setDState: (state: ReorderDropState | null) => void;
      setHovered: (val: string | null) => void;
      hovered: string | null;
      setInputDlg: (
        dlg: {
          open: boolean;
          title: string;
          description?: string;
          label: string;
          value: string;
          onSave: (val: string) => void;
          onCancel?: () => void;
        } | null,
      ) => void;
      selectedLeaves: string[];
      handleSelect: (path: string, isCmd: boolean, isShift: boolean) => void;
      clearSelection: () => void;
      mergeLeaves: (paths: string[]) => void;
      setDelTarget: React.Dispatch<
        React.SetStateAction<{
          kind: 'section' | 'branch' | 'leaf';
          path: string;
          bPath?: string;
          slugPath?: string;
          active?: boolean;
          title: string;
          origNode?: TreeType;
        } | null>
      >;
      setExportTarget: React.Dispatch<
        React.SetStateAction<{
          paths: string[];
          rootDir: string;
          filename: string;
          title: string;
          nodeIds?: string[];
        } | null>
      >;
      setManageAttTgt: React.Dispatch<
        React.SetStateAction<{
          path: string;
          title: string;
          scope: 'section' | 'group' | 'leaf';
          node: TreeType;
        } | null>
      >;
      setAssetTarget: React.Dispatch<React.SetStateAction<{ path: string; title: string } | null>>;
      setTree: React.Dispatch<React.SetStateAction<TreeType[]>>;
      refreshTree: () => Promise<void>;
    };
  }): JSX.Element {
    // STATES
    const { creating, drag, dState, mode, shellPermission, hovered } = ctx;
    const [contexting, setContexting] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [isDragOverFile, setIsDragOverFile] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const leafRef = useRef<HTMLLIElement | null>(null);
    const permission = shellPermission === 'write' ? 'write' : node.permission;
    /**
     * Checks whether editable file.
     *
     * @param path - Path to process.
     * @param fileType - Value passed to the helper.
     */
    const editable =
      permission === 'write' && !!node.path && (node.fileType === 'md' || node.fileType === 'mdx');
    const path = node.path ?? '';
    const drop = `leaf:${path}`;
    const disabled = creating || renaming || progress !== null;
    const isIdx = isIndexFile(path);
    const [sis, setSis] = useState<
      { id?: string; path: string; name: string; title?: string; isMd: boolean }[]
    >([]);
    const [sisLoading, setSisLoading] = useState(false);
    const isSimulated = (node as LeafNode & { simulated?: boolean }).url === docsRootPath();
    const isMultiSel = ctx.selectedLeaves.includes(path);

    // SCROLL ACTIVE TO VIEWPORT TOP
    useEffect(() => {
      if (!a || !leafRef.current) return;
      /**
       * Returns the raise.
       */
      const raise = () => {
        const el = leafRef.current;
        if (!el) return;
        const container = el.closest('.overflow-y-auto');
        if (container) {
          const rects = [container.getBoundingClientRect(), el.getBoundingClientRect()] as const;
          const offset = rects[1].top - rects[0].top;
          if (Math.abs(offset - 16) > 5)
            container.scrollBy({ top: offset - 16, behavior: 'smooth' });
        } else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      const timers = new Set<ReturnType<typeof setTimeout>>();
      timers.add(setTimeout(raise, 50));
      timers.add(setTimeout(raise, 400));
      timers.add(setTimeout(raise, 1000));
      return () => {
        timers.forEach(clearTimeout);
      };
    }, [a]);

    // RESOLVE SISTER FILES (ASSETS)
    useEffect(() => {
      let isActive = true;
      if (contexting && editable && path) {
        setSisLoading(true);
        const dir = dirname(path);
        const siblingByPath = new Map<string, LeafNode>();
        for (const sibling of siblings ?? [])
          if (sibling.type === 'leaf' && sibling.path) siblingByPath.set(sibling.path, sibling);
        actions.read.doc
          .list({ path: dir, type: 'folderEntries' })
          .then(({ data: d }) => {
            if (isActive && d && Array.isArray(d)) {
              const sisList: {
                id?: string;
                path: string;
                name: string;
                title?: string;
                isMd: boolean;
              }[] = [];
              for (const p of d as string[]) {
                if (p === path || dirname(p) !== dir) continue;
                const isMd = TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(p);
                if (!isIdx && isMd) continue;
                const sNode = siblingByPath.get(p);
                sisList.push({
                  name: bName(p),
                  path: p,
                  title: sNode && sNode.type === 'leaf' ? sNode.title : undefined,
                  isMd,
                });
              }
              setSis(sisList);
            }
          })
          .catch((e: unknown) => {
            console.error('[DocsTree:sisters] load-failed', { path, error: e });
            toast.error(e instanceof Error ? e.message : 'Failed to load sibling files.');
          })
          .finally(() => {
            if (isActive) setSisLoading(false);
          });
      }
      return () => {
        isActive = false;
      };
    }, [contexting, editable, path, siblings, isIdx]);

    // HANDLERS
    /**
     * Returns the rename page.
     *
     */
    const pageActions = {
      renamePage: (): void => {
        if (renaming || !node.path) return;
        const currTitle = cTitle(toNodeLabel(node.title || node.origName)) || bName(node.path);
        setRenaming(true);
        ctx.setInputDlg({
          open: true,
          title: 'Rename Page',
          label: 'Page title',
          value: currTitle,
          onCancel: () => {
            setRenaming(false);
          },
          onSave: async (nTitle) => {
            ctx.setInputDlg(null);
            if (!nTitle || nTitle === currTitle) {
              setRenaming(false);
              return;
            }
            try {
              const { data: res, error: resErr } = await actions.read.doc.resolvePath({
                path: node.path!,
                title: nTitle,
              });
              if (resErr || !res) throw resErr || new Error('Failed to resolve path');
              const nPath = res.path;
              const { data: optRouteRes } = await actions.read.util.pathname({ path: nPath });
              const optRoute =
                (optRouteRes as string) || ('url' in node ? node.url : docsRootPath());
              // optimistic UI updates
              // prettier-ignore
              document.dispatchEvent(new CustomEvent('docs:rename', { detail: { nfilepath: nPath, path: node.path!, pathname: optRoute, title: nTitle, isActive: a } }),);
              if (a) {
                const url = new URL(window.location.href);
                url.pathname = optRoute;
                window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
              }
              if (nPath !== node.path!) {
                const { data: docData } = await actions.read.doc.get({ path: node.path! });
                const { error: err } = await actions.write.doc.commit({
                  cur: node.path!,
                  next: nPath,
                  title: nTitle,
                  source:
                    docData &&
                    typeof docData === 'object' &&
                    'source' in docData &&
                    typeof docData.source === 'string'
                      ? docData.source
                      : '',
                });
                if (err) throw err;
              } else {
                const { error: writeErr } = await actions.write.doc.editor({
                  path: nPath,
                  title: nTitle,
                });
                if (writeErr) throw writeErr;
              }
            } catch (err) {
              toast.error('Failed to rename docs page.');
              // revert on failure
              const originalRoute = 'url' in node ? node.url : docsRootPath();
              // prettier-ignore
              document.dispatchEvent(new CustomEvent('docs:rename', { detail: { nfilepath: node.path!, path: node.path!, pathname: originalRoute, title: currTitle, isActive: a } }));
              if (a) {
                const url = new URL(window.location.href);
                url.pathname = originalRoute;
                window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
              }
              console.error('Rename failed', err);
            } finally {
              setRenaming(false);
            }
          },
        });
      },

      /*
       * Returns the duplicate.
       *
       * @param mode - Value passed to the helper.
       */
      duplicate: (mode: 'reference' | 'content'): void => {
        if (creating || !node.path) return;
        // prettier-ignore
        ctx.setInputDlg({
			open: true,
			title: mode === 'reference' ? 'Duplicate by Reference' : 'Duplicate by Content',
			label: 'New page name',
			value: `${path.split('/').at(-1)?.replace(TerraQualityRegex.REGEX_MD_MDX_I_REGEX(), '') ?? ''}-copy`,
			onCancel: () => {},
			onSave: t =>
				runMutation(async () => {
					const { data: cur, error: readErr } = (await actions.read.doc.get({ path })) as ActionRes<Md>;
					if (readErr || !cur) throw readErr || new Error('Failed to read doc.');
					const nPath = `${bPath}/${sanitizeName(t)}.mdx`;
					// MDX natively acts as a reference symlink when imported
					let finalSrc = cur.source as string;
					if (mode === 'reference') {
						finalSrc = `import Reference from './${path.split('/').pop()}';\n\n<Reference />`;
					}
					// find the parent ID directly from bPath to prevent orphaned docs
					const parentIds = bPath.split('/').filter(Boolean);
					// prettier-ignore
					const { data: doc, error: writeErr } = (await actions.write.doc.save({ path: nPath, source: finalSrc, parentId: parentIds.length > 0 ? parentIds[parentIds.length - 1] : undefined, title: t })) as ActionRes<Md>;
					if (writeErr || !doc) throw writeErr || new Error('Failed to write doc.');
					const nLeafPath = doc.path || nPath;
						const nRoute = docsPath([...bPath.split('/').filter(Boolean), nLeafPath].join('/'));

					// 1. Optimistically insert into the sidebar tree to prevent flashing
					ctx.setTree(c => {
						const nTree = JSON.parse(JSON.stringify(c)) as TreeType[];
						const insertionFrames: { nodes: TreeType[]; index: number }[] = [{ nodes: nTree, index: 0 }];
						while (insertionFrames.length) {
							const frame = insertionFrames[insertionFrames.length - 1];
							if (!frame) break;
							if (frame.index >= frame.nodes.length) {
								insertionFrames.pop();
								continue;
							}
							const n = frame.nodes[frame.index];
							frame.index += 1;
							if (n.type === 'leaf' && n.path === path) {
								// GUARANTEE ORIGINAL KEY: Fallback to a highly unique temp ID so React doesn't share state
								// prettier-ignore
								frame.nodes.splice(frame.index, 0, { type: 'leaf', fileType: 'mdx', origName: typeof doc.origName === 'string' ? doc.origName : `temp_l_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, path: nLeafPath, permission: 'write', title: t, description: doc.description || '', url: nRoute, source: finalSrc });
								break;
							}
							if (n.type === 'branch' && n.children) insertionFrames.push({ nodes: n.children, index: 0 });
						}
						return nTree;
					});

					// 2. Navigate smoothly & retain parameterized context IDs
					const tgtUrl = new URL(nRoute, window.location.origin);
					new URL(window.location.href).searchParams.forEach((v, k) => {
						if (k !== 'mode' && !tgtUrl.searchParams.has(k)) tgtUrl.searchParams.set(k, v);
					});
					tgtUrl.searchParams.set('mode', 'edit');
					window.history.pushState(null, '', tgtUrl.toString());
					const ePathname = `${tgtUrl.pathname}${tgtUrl.search}`;

					// 3. Prime memoryDrafts to prevent <Main> from fetching undefined state and crashing React
					memoryDrafts.set(ePathname, {
						source: finalSrc,
						draft: { content: Array.isArray(doc.content) ? doc.content : [], description: doc.description || '', path: nLeafPath, title: t },
						metadata: doc,
					});
					$unsavedDrafts.setKey(ePathname, false);
					// prettier-ignore
					document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: ePathname, pathname: ePathname, path: nLeafPath, title: t, description: doc.description || '', source: finalSrc, content: Array.isArray(doc.content) ? doc.content : [], compiledMDX: '' } }),);
					ctx.setInputDlg(null);

					// 4. Silently fetch the real Sanity IDs in the background
					setTimeout(() => {
						void ctx.refreshTree();
					}, 2500);
				}, 'Failed to duplicate.'),
		});
      },
    };

    /**
     * Returns the add.
     *
     * @param files - Value passed to the helper.
     */
    const add = async (files: FileList | File[] | null): Promise<void> => {
      if (creating || !files || files.length === 0 || !node.path) return;
      runMutation(
        async () => {
          let totalSize = 0;
          let uploadedSize = 0;
          for (let i = 0; i < files.length; i++) if (files[i]) totalSize += files[i].size;
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) continue;
            const tmpId = `temp-${Date.now()}-${i}`;
            const isMdFile = TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(file.name);
            setSis((p) => [...p, { id: tmpId, path: tmpId, name: file.name, isMd: isMdFile }]);
            const finalAsset = await uploadAssetChunked(file, node.path!, {
              onProgress: ({ bytes }) => {
                uploadedSize += bytes;
                setProgress(Math.round((uploadedSize / totalSize) * 100));
              },
            });
            const fPath = finalAsset.path || finalAsset.src || tmpId;
            const nName = fPath.split('/').pop() || file.name;
            setSis((p) => {
              if (p.some((s) => s.name === nName && s.id !== tmpId))
                return p.filter((s) => s.id !== tmpId);
              return p.map((s) =>
                s.id === tmpId ? { ...s, path: fPath, name: nName, isMd: isMdFile } : s,
              );
            });
          }
          toast.success('Files attached successfully.');
        },
        'Failed to upload docs file.',
        () => {
          setProgress(0);
        },
        () => {
          setProgress(null);
          setContexting(false);
          if (fileRef.current) fileRef.current.value = '';
        },
      );
    };

    // SISTER ACTION HANDLERS
    /**
     * Rename sister.
     *
     * @param s - Value passed to the helper.
     *
     * @returns True when the helper predicate succeeds.
     */
    const sisterActions = {
      renameSister: (s: { path: string; name: string; isMd: boolean }) => {
        ctx.setInputDlg({
          open: true,
          title: 'Rename Attachment',
          label: 'New name',
          value: s.name.replace(TerraQualityRegex.REGEX_I_REGEX(), ''),
          onCancel: () => {},
          onSave: (nName) =>
            runMutation(async () => {
              const fileName = {
                extension: s.name.match(TerraQualityRegex.REGEX_I_REGEX())?.[0] ?? '',
                stem: sanitizeName(nName),
              };
              const nFilename = `${fileName.stem}${fileName.extension}`;
              const dir = dirname(s.path);
              const nPath = `${dir && dir !== '.' ? `${dir}/` : ''}${nFilename}`;
              // optimistic UI update
              setSis((p) =>
                p.map((x) => (x.path === s.path ? { ...x, path: nPath, name: nFilename } : x)),
              );
              ctx.setInputDlg(null);
              try {
                if (s.isMd) {
                  const { data: docData } = await actions.read.doc.get({ path: s.path });
                  const { error } = await actions.write.doc.commit({
                    cur: s.path,
                    next: nPath,
                    source:
                      docData &&
                      typeof docData === 'object' &&
                      'source' in docData &&
                      typeof docData.source === 'string'
                        ? docData.source
                        : '',
                  });
                  if (error) throw error;
                } else {
                  const { data: buf, error: readErr } = await actions.read.asset.get({
                    path: s.path,
                  });
                  if (readErr || !buf) throw readErr || new Error('Failed to read asset');
                  const { error: writeErr } = await actions.write.asset.raw({
                    bytes: buf,
                    path: nPath,
                  });
                  if (writeErr) throw writeErr;
                  await actions.write.doc.rm({ path: s.path, type: 'asset', assets: false });
                }
                toast.success('Renamed successfully');
              } catch (err) {
                // revert on failure
                setSis((p) =>
                  p.map((x) => (x.path === nPath ? { ...x, path: s.path, name: s.name } : x)),
                );
                throw err;
              }
            }, 'Failed to rename attachment.'),
        });
      },

      /*
       * Duplicates the duplicate Sister.
       *
       * @param s - Value passed to the helper.
       *
       * @returns True when the helper predicate succeeds.
       */
      duplicateSister: async (s: { path: string; name: string; isMd: boolean }) => {
        ctx.setInputDlg({
          open: true,
          title: 'Duplicate Attachment',
          label: 'New name',
          value: `${s.name.replace(TerraQualityRegex.REGEX_I_REGEX(), '')}-copy`,
          onCancel: () => {},
          onSave: (n) =>
            runMutation(async () => {
              const tgt = { path: s.path, stem: sanitizeName(n) };
              const { data: docData, error: err } = await actions.read.doc.get({ path: tgt.path });
              if (err || !docData) throw err || new Error('Failed to read doc.');
              const nPath = `${dirname(tgt.path)}/${tgt.stem}.mdx`;
              const { data, error: wErr } = await actions.write.doc.save({
                path: nPath,
                source:
                  typeof docData === 'object' &&
                  'source' in docData &&
                  typeof docData.source === 'string'
                    ? docData.source
                    : '',
              });
              if (wErr || !data) throw wErr || new Error('Failed to write doc.');
              const sisterDetails = {
                name: nPath.split('/').pop() || '',
                title:
                  typeof data === 'object' && 'title' in data && typeof data.title === 'string'
                    ? data.title
                    : undefined,
              };
              setSis((p) => [
                ...p,
                { path: nPath, name: sisterDetails.name, isMd: true, title: sisterDetails.title },
              ]);
              ctx.setInputDlg(null);
            }, 'Failed to duplicate.'),
        });
      },

      /*
       * Deletes the delete Sister.
       *
       * @param s - Value passed to the helper.
       *
       * @returns True when the helper predicate succeeds.
       */
      deleteSister: async (s: { path: string; name: string; isMd: boolean }) => {
        if (!window.confirm(`Are you sure you want to delete ${s.name}?`)) return;
        const deletion = {
          previousSisters: [...sis],
          remove: (): void => setSis((p) => p.filter((x) => x.path !== s.path)),
          restore: (): void => setSis(deletion.previousSisters),
        };
        deletion.remove();
        runMutation(async () => {
          try {
            const { error } = await actions.write.doc.rm({
              assets: false,
              path: s.path,
              type: s.isMd ? 'doc' : 'asset',
            });
            if (error) throw error;
          } catch (err) {
            deletion.restore();
            throw err;
          }
        }, 'Failed to delete attachment.');
      },

      /*
       * Synthesize sister.
       *
       * @param s - Value passed to the helper.
       */
      synthesizeSister: (s: { path: string; name: string }): void => {
        try {
          document.dispatchEvent(
            new CustomEvent('docs:synthesize', { detail: { path: s.path, name: s.name } }),
          );
        } catch (err) {
          console.error('Synthesis failed', err);
          toast.error(err instanceof Error ? err.message : 'Synthesis failed');
        }
      },
    };

    // RENDER
    return (
      <SidebarMenuItem ref={leafRef}>
        {!!node.path && !isSimulated ? (
          <ContextMenu onOpenChange={setContexting}>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => void add(e.currentTarget.files)}
              disabled={disabled}
            />
            <ContextMenuTrigger asChild>
              <div
                data-docs-drop={drop}
                data-docs-parent={bPath}
                className={cn(
                  'relative rounded-md',
                  dState?.key === drop && dState.position === 'before' && REORDER.before,
                  dState?.key === drop && dState.position === 'after' && REORDER.after,
                  (isMultiSel || isDragOverFile) && 'bg-primary-4/50 ring-2 ring-primary-8',
                  progress !== null && 'pointer-events-none opacity-70',
                )}
                onMouseEnter={() => {
                  ctx.setHovered(drop);
                }}
                onMouseLeave={() => {
                  if (ctx.hovered === drop) ctx.setHovered(null);
                }}
                onClickCapture={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    ctx.handleSelect(path, e.metaKey || e.ctrlKey, e.shiftKey);
                  } else if (ctx.selectedLeaves.length > 0) ctx.clearSelection();
                }}
                onDragEnter={(e) => {
                  if (permission === 'write' && !drag && e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOverFile(true);
                  }
                }}
                onDragOver={(e) => {
                  if (permission !== 'write') return;
                  if (!drag && e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    if (y < rect.height * 0.25) {
                      if (isDragOverFile) setIsDragOverFile(false);
                      if (dState?.key !== drop || dState.position !== 'before')
                        ctx.setDState({ key: drop, position: 'before' });
                    } else if (y > rect.height * 0.75) {
                      if (isDragOverFile) setIsDragOverFile(false);
                      if (dState?.key !== drop || dState.position !== 'after')
                        ctx.setDState({ key: drop, position: 'after' });
                    } else {
                      if (!isDragOverFile) setIsDragOverFile(true);
                      if (dState?.key === drop) ctx.setDState(null);
                    }
                    return;
                  }
                  if (!drag || drag.kind !== 'leaf') return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (isDragOverFile) setIsDragOverFile(false);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                  if (dState?.key !== drop || dState.position !== pos)
                    ctx.setDState({ key: drop, position: pos });
                }}
                onDragLeave={(e) => {
                  if (isDragOverFile) setIsDragOverFile(false);
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  if (dState?.key === drop) ctx.setDState(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files?.length && !drag) {
                    if (isDragOverFile) {
                      setIsDragOverFile(false);
                      void add(e.dataTransfer.files);
                    } else if (dState?.key === drop) {
                      ctx.setDState(null);
                      void ctx.uploadAsLeaf(
                        e.dataTransfer.files,
                        node.path!,
                        dState.position === 'inside' ? 'after' : dState.position,
                        'file',
                      );
                    }
                    return;
                  }
                  const dPath = e.dataTransfer.getData('application/docs-path');
                  const move =
                    drag ??
                    (e.dataTransfer.getData('application/docs-kind') === 'leaf' && dPath
                      ? { kind: 'leaf' as const, path: dPath }
                      : null);
                  if (!move || move.kind !== 'leaf' || !node.path) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  void ctx.mvLeaf({
                    path: move.path,
                    tPosition: e.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
                    tTarget: node.path,
                    tpath: bPath,
                  });
                  ctx.setDrag(null);
                }}
              >
                <Link
                  active={a}
                  contexting={contexting || dState?.key === drop}
                  dragging={drag?.kind === 'leaf'}
                  renaming={renaming}
                  node={node}
                  mode={mode}
                  trailing={
                    <div className="flex items-center gap-2">
                      {progress !== null && (
                        <span className="text-xs font-medium text-primary-10">{progress}%</span>
                      )}
                      <DragHandle
                        disabled={disabled}
                        isVisible={hovered === drop}
                        onDragStart={(e) => {
                          ctx.setDrag({ active: a, kind: 'leaf', path });
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('application/docs-kind', 'leaf');
                          e.dataTransfer.setData('application/docs-path', path);
                          e.dataTransfer.setData('application/docs-parent', bPath);
                          e.dataTransfer.setData('text/plain', path);
                        }}
                        onDragEnd={() => {
                          ctx.setDrag(null);
                        }}
                      />
                    </div>
                  }
                />
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {permission !== 'write' ? (
                <Menu
                  actions={[
                    {
                      icon: <LinkIcon />,
                      label: 'Copy link',
                      onSelect: () => {
                        void navigator.clipboard.writeText(
                          new URL(node.url || docsPath(path), window.location.origin).href,
                        );
                        toast.success('Link copied');
                      },
                    },
                  ]}
                />
              ) : isMultiSel && ctx.selectedLeaves.length > 1 ? (
                <Menu
                  actions={[
                    {
                      disabled: disabled,
                      icon: <DocumentIcon />,
                      label: `Merge ${ctx.selectedLeaves.length} pages`,
                      onSelect: () => {
                        ctx.mergeLeaves(ctx.selectedLeaves);
                      },
                    },
                    {
                      icon: <TrashIcon />,
                      label: 'Clear selection',
                      onSelect: () => {
                        ctx.clearSelection();
                      },
                    },
                  ]}
                />
              ) : (
                <Menu
                  // prettier-ignore
                  actions={[
									{ disabled: disabled, icon: <LinkIcon />, label: 'Copy link', 	onSelect: () => { void navigator.clipboard.writeText(`${window.location.origin}${node.url || ''}`); toast.success('Link copied'); } },
									{ disabled: disabled, icon: <EditIcon />, label: 'Rename page', 	onSelect: pageActions.renamePage },
									{
										disabled: disabled,
										icon: <BoxIcon />,
										label: 'Files',
										subActions: sisLoading
											? [{ label: 'Loading...', disabled: true }]
											: sis.length === 0
												? [{ label: 'No files', disabled: true }, { separator: true, label: 'sep' }, { icon: <AddIcon />, label: 'New', 				onSelect: () => fileRef.current?.click() },]
												: [
													...sis.map(s => ({
														icon: s.isMd ? <DocumentIcon /> : <LinkIcon />,
														label: cTitle(toNodeLabel(s.title || s.name)) || s.name,
														subActions: [
															{
																icon: <DownloadIcon />,
																label: s.isMd ? 'Download' : 'Open',
																																onSelect: () => {
																	if (s.isMd) {
											void actions.read.doc
												.get({ path: s.path })
												.then(({ data: d }) => {
												download(s.name, d && typeof d === 'object' && 'source' in d && typeof d.source === 'string' ? d.source : '', 'text/markdown');
																			})
																			.catch(() => { notify({ error: new Error('Failed to download file.'), fallback: 'Failed to download file.' }); });
																	} else {
																		const a = document.createElement('a');
														a.href = docsPath(s.path);
																		let dlName = s.name;
																		const extMatch = s.path.split('?')[0]?.match(TerraQualityRegex.REGEX_A_Z0_9_I_REGEX());
																		if (extMatch && !dlName.toLowerCase().endsWith(extMatch[0].toLowerCase())) dlName = `${dlName}${extMatch[0]}`;
																		a.download = dlName;
																		a.target = '_blank';
																		document.body.appendChild(a);
																		a.click();
																		document.body.removeChild(a);
																	}
																},
															},
											{ icon: <EditIcon />, label: 'Rename', 							onSelect: () => { sisterActions.renameSister(s); } },
											...(s.isMd ? [ { icon: <MagicIcon />, label: 'Synthesize Content', 							onSelect: () => { sisterActions.synthesizeSister(s); } }, { icon: <CopyIcon />, label: 'Duplicate', 							onSelect: () => sisterActions.duplicateSister(s) }, ] : []),
											{ separator: true, destructive: true, icon: <TrashIcon />, label: 'Delete', 							onSelect: () => sisterActions.deleteSister(s) },
														],
													})),
													{ separator: sis.length > 0, icon: <AddIcon />, label: 'New', 					onSelect: () => fileRef.current?.click() },
												],
									},
									{
										disabled: disabled,
										icon: <CopyIcon />,
										label: 'Duplicate page',
										subActions: [
											{ icon: <LinkIcon />, label: 'By reference (Point to same leaf)', 			onSelect: () => { pageActions.duplicate('reference'); } },
											{ icon: <CopyIcon />, label: 'By content (Duplicate leaf)', 			onSelect: () => { pageActions.duplicate('content'); } }
										]
									},
							{ icon: <PopOutIcon />, label: 'Make asset', disabled: disabled || !(permission === 'write' && !node.asset && !isSimulated && !!path), 	onSelect: () => { ctx.setAssetTarget({ path, title: cTitle(toNodeLabel(node.title || node.origName)) || bName(path) }); } },
							{ icon: <DownloadIcon />, label: 'Download page', disabled: disabled, 	onSelect: () => { ctx.setExportTarget({ paths: [path], rootDir: path, filename: sanitizeName(node.title || bName(path)), title: cTitle(toNodeLabel(node.title || node.origName)) || 'Document' }); } },
									{ destructive: true, disabled: disabled, icon: <TrashIcon />, label: 'Delete page', 	onSelect: () => { ctx.setDelTarget({ kind: 'leaf', path: node.path!, bPath, active: a, title: node.title || node.path! }); } },
								]}
                />
              )}
            </ContextMenuContent>
          </ContextMenu>
        ) : (
          <Link active={a} node={node} mode={mode} />
        )}
        {a && <Toc title={node.title} />}
      </SidebarMenuItem>
    );
  },

  /*//////////////////////////////////////////////////
TREE COMPONENTS
//////////////////////////////////////////////////*/

  /**
   * Main recursive tree mapping structural layers evaluating context dependencies natively.
   *
   * @param props - Tree path, current node, sibling list, and shared navigation/mutation state for recursively rendering sidebar levels.
   * @param {TreeType[]} [props.siblings] - Sibling nodes within the same local directory layer.
   * @param bPath - B path input supplied to tree's operation.
   * @param node - Node input supplied to tree's operation.
   * @param ctx - Ctx input supplied to tree's operation.
   *
   * @return {JSX.Element} The rendered SidebarGroup bounding nested leaves and child trees.
   */
  Tree({
    bPath,
    node,
    ctx,
    siblings: sibs,
  }: {
    bPath: string;
    node: TreeType;
    siblings?: TreeType[];
    ctx: {
      creating: boolean;
      transitioning: boolean;
      drag: DragState | null;
      dState: ReorderDropState | null;
      mode: Mode;
      mvBranch: (input: {
        fPath: string;
        pPath: string;
        tpath: string;
        tPosition?: 'after' | 'before';
        tTarget?: string;
      }) => Promise<void>;
      uploadAsLeaf: (
        files: FileList | File[] | null,
        tgtPath: string,
        pos: 'before' | 'after',
        tgtType: 'file' | 'folder',
      ) => Promise<void>;
      mvLeaf: (input: {
        path: string;
        tTarget?: string;
        tpath: string;
        tPosition?: 'after' | 'before';
      }) => Promise<void>;
      pathname: string;
      refreshTree: () => Promise<void>;
      shellPermission: 'read' | 'write';
      openCreate: (fPath: string, parentId: string) => void;
      addGroup: (fPath: string, sectionId: string) => void;
      setDrag: (drag: DragState | null) => void;
      setDState: (state: ReorderDropState | null) => void;
      setHovered: (val: string | null) => void;
      hovered: string | null;
      setInputDlg: (
        dlg: {
          open: boolean;
          title: string;
          description?: string;
          label: string;
          value: string;
          onSave: (val: string) => void;
          onCancel?: () => void;
        } | null,
      ) => void;
      setTree: React.Dispatch<React.SetStateAction<TreeType[]>>;
      getTree: () => TreeType[];
      findActiveLeaf: (nodes: TreeType[], tgtUrl: string) => LeafNode | null;
      setCPathname: React.Dispatch<React.SetStateAction<string>>;
      selectedLeaves: string[];
      handleSelect: (path: string, isCmd: boolean, isShift: boolean) => void;
      clearSelection: () => void;
      mergeLeaves: (paths: string[]) => void;
      setDelTarget: React.Dispatch<
        React.SetStateAction<{
          kind: 'section' | 'branch' | 'leaf';
          path: string;
          bPath?: string;
          slugPath?: string;
          active?: boolean;
          title: string;
          origNode?: TreeType;
        } | null>
      >;
      setExportTarget: React.Dispatch<
        React.SetStateAction<{
          paths: string[];
          rootDir: string;
          filename: string;
          title: string;
          nodeIds?: string[];
        } | null>
      >;
      setManageAttTgt: React.Dispatch<
        React.SetStateAction<{
          path: string;
          title: string;
          scope: 'section' | 'group' | 'leaf';
          node: TreeType;
        } | null>
      >;
      setAssetTarget: React.Dispatch<React.SetStateAction<{ path: string; title: string } | null>>;
    };
  }): JSX.Element {
    // STATES
    const { creating, drag, dState, pathname, shellPermission, setDState, setHovered, hovered } =
      ctx;
    const nodeUrl = 'url' in node ? node.url : '';
    const permission = shellPermission === 'write' ? 'write' : node.permission;
    const fPath = [bPath, node.type === 'branch' ? node.origName : ''].filter(Boolean).join('/');
    const slugPath =
      'url' in node && node.url ? node.url.replace(TerraQualityRegex.REGEX_DOCS_REGEX(), '') : '';
    const [renaming, setRenaming] = useState(false);
    const [contexting, setContexting] = useState(false);
    const drop = node.type === 'branch' ? `branch:${fPath}` : `leaf:${node.path ?? ''}`;
    const disabled = creating || renaming;

    // HANDLERS
    /**
     * Returns the rename node.
     *
     */
    const treeActions = {
      renameNode: (): void => {
        if (renaming || node.type !== 'branch') return;
        const currName = node.origName;
        const currTitle = cTitle(toNodeLabel(node.title || currName)) || currName;
        setRenaming(true);
        ctx.setInputDlg({
          open: true,
          title: 'Rename Group',
          label: 'Group name',
          value: currTitle,
          onCancel: () => {
            setRenaming(false);
          },
          onSave: async (nName) => {
            if (!nName || nName === currTitle) {
              ctx.setInputDlg(null);
              setRenaming(false);
              return;
            }
            // optimistic UI mutation bypasses global loading sweep
            ctx.setTree((c) => {
              const updatedTree = [...c];
              const titleFrames: { nodes: TreeType[]; index: number }[] = [
                { nodes: updatedTree, index: 0 },
              ];
              while (titleFrames.length) {
                const frame = titleFrames[titleFrames.length - 1];
                if (!frame) break;
                if (frame.index >= frame.nodes.length) {
                  titleFrames.pop();
                  continue;
                }
                const idx = frame.index;
                const curr = frame.nodes[idx];
                frame.index += 1;
                if (curr.type !== 'branch') continue;
                if (curr.origName === node.origName) {
                  frame.nodes[idx] = { ...curr, title: nName };
                  continue;
                }
                if (curr.children) {
                  const children = [...curr.children];
                  frame.nodes[idx] = { ...curr, children };
                  titleFrames.push({ nodes: children, index: 0 });
                }
              }
              return updatedTree;
            });
            ctx.setInputDlg(null);
            try {
              const { error: err } = await actions.write.doc.editor({
                path: node.origName,
                title: nName,
              });
              if (err) throw err;
              toast.success('Group renamed successfully.');
            } catch (err) {
              console.error('[renameNode] Error renaming group:', err);
              toast.error('Failed to rename group. The document has not been changed.');
              void ctx.refreshTree();
            } finally {
              setRenaming(false);
            }
          },
        });
      },

      /*
       * Handles drag over.
       *
       * @param e - Value passed to the helper.
       */
      handleDragOver: (e: React.DragEvent<HTMLElement>): void => {
        if (permission !== 'write') return;
        if (!drag && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
          if (dState?.key !== drop || dState.position !== pos)
            setDState({ key: drop, position: pos });
          return;
        }
        if (!drag) return;
        if (node.type === 'leaf' && drag.kind !== 'leaf') return;
        if (node.type === 'branch' && drag.kind === 'branch' && drag.pPath !== bPath) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        if (dState?.key !== drop || dState.position !== pos)
          setDState({ key: drop, position: pos });
      },

      /*
       * Handles drag leave.
       *
       * @param e - Value passed to the helper.
       */
      handleDragLeave: (e: React.DragEvent<HTMLElement>): void => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (dState?.key === drop) setDState(null);
      },
    };

    // RENDER
    // leaf
    if (node.type === 'leaf')
      return (
        <ErrorBoundary name="Tree">
          <TREE_COMPONENTS.Leaf
            active={pathname !== '' && pathname === nodeUrl}
            bPath={bPath}
            node={node}
            ctx={ctx}
            siblings={sibs}
          />
        </ErrorBoundary>
      );
    // branch
    const branchActions: MenuAction[] = [
      {
        disabled,
        icon: <LinkIcon />,
        label: 'Copy link',
        onSelect: () => {
          void navigator.clipboard.writeText(`${window.location.origin}${nodeUrl}`);
          toast.success('Link copied');
        },
      },
      {
        disabled,
        icon: <AddIcon />,
        label: 'Add page',
        onSelect: () => {
          ctx.openCreate(fPath, node.origName);
        },
      },
      {
        disabled,
        icon: <BoxIcon />,
        label: 'Manage attachments',
        onSelect: () => {
          ctx.setManageAttTgt({
            path: slugPath,
            title: node.title || slugPath,
            scope: 'group',
            node,
          });
        },
      },
      {
        disabled,
        icon: <DownloadIcon />,
        label: 'Download group',
        onSelect: () => {
          ctx.setExportTarget({
            paths: toPaths(node.children),
            rootDir: slugPath,
            filename: sanitizeName(
              cTitle(toNodeLabel(node.title || node.origName)) || node.origName,
            ),
            title: `${cTitle(toNodeLabel(node.title || node.origName))} docs`,
            nodeIds: extractAllNodeIds([node]),
          });
        },
      },
      { disabled, icon: <EditIcon />, label: 'Rename group', onSelect: treeActions.renameNode },
      {
        separator: true,
        destructive: true,
        disabled,
        icon: <TrashIcon />,
        label: 'Delete group',
        onSelect: () => {
          ctx.setDelTarget({
            kind: 'branch',
            path: fPath,
            bPath,
            slugPath,
            title: node.title || slugPath,
          });
        },
      },
    ];
    const label = (
      <SidebarGroupLabel asChild className="p-0">
        <div
          data-docs-drop={drop}
          className={cn(
            'flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-primary-11',
            dState?.key === drop && dState.position === 'before' && REORDER.before,
            dState?.key === drop && dState.position === 'after' && REORDER.after,
            contexting && UI.open,
            renaming && 'ring-1 ring-ring',
          )}
          onMouseEnter={() => {
            setHovered(drop);
          }}
          onMouseLeave={() => {
            if (hovered === drop) setHovered(null);
          }}
          onDragOver={treeActions.handleDragOver}
          onDragLeave={treeActions.handleDragLeave}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files?.length && !drag) {
              if (dState?.key === drop) {
                ctx.setDState(null);
                void ctx.uploadAsLeaf(
                  e.dataTransfer.files,
                  slugPath,
                  dState.position === 'inside' ? 'after' : dState.position,
                  'folder',
                );
              }
              return;
            }
            const dPath = e.dataTransfer.getData('application/docs-path');
            const dParent = e.dataTransfer.getData('application/docs-parent');
            const move =
              drag ??
              (e.dataTransfer.getData('application/docs-kind') === 'leaf' && dPath
                ? { kind: 'leaf' as const, path: dPath }
                : dPath && dParent
                  ? { fPath: dPath, kind: 'branch' as const, pPath: dParent }
                  : null);
            if (!move) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const tPos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            if (move.kind === 'leaf')
              void ctx.mvLeaf({ path: move.path, tPosition: tPos, tTarget: fPath, tpath: bPath });
            else
              void ctx.mvBranch({
                fPath: move.fPath,
                pPath: move.pPath,
                tpath: bPath,
                tPosition: tPos,
                tTarget: fPath,
              });
            ctx.setDrag(null);
          }}
        >
          <span className="min-w-0 flex-1 truncate">
            {cTitle(toNodeLabel(node.title || node.origName))}
          </span>
          {permission === 'write' && !node.simulated && (
            <DragHandle
              disabled={disabled}
              isVisible={hovered === drop}
              onDragStart={(e) => {
                ctx.setDrag({ fPath, kind: 'branch', pPath: bPath });
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/docs-kind', 'branch');
                e.dataTransfer.setData('application/docs-path', fPath);
                e.dataTransfer.setData('application/docs-parent', bPath);
                e.dataTransfer.setData('text/plain', fPath);
              }}
              onDragEnd={() => {
                ctx.setDrag(null);
              }}
            />
          )}
        </div>
      </SidebarGroupLabel>
    );
    return (
      <ErrorBoundary name="Tree">
        <SidebarGroup className={cn('p-0', !bPath.includes('/') && 'mt-4 first:mt-0')}>
          {/* SECTIONS */}
          {permission === 'write' && !node.simulated ? (
            <ContextMenu onOpenChange={setContexting}>
              <ContextMenuTrigger asChild>{label}</ContextMenuTrigger>
              <ContextMenuContent>
                <Menu actions={branchActions} />
              </ContextMenuContent>
            </ContextMenu>
          ) : (
            label
          )}
          {/* GROUPS */}
          <SidebarGroupContent>
            <SidebarMenu>
              {node.type === 'branch' &&
                node.children?.map((c) => (
                  <TREE_COMPONENTS.Tree
                    key={getStableKey(c)}
                    bPath={fPath}
                    node={c}
                    ctx={ctx}
                    siblings={node.children}
                  />
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </ErrorBoundary>
    );
  },
};

export const { Tree } = TREE_COMPONENTS;
export default TREE_COMPONENTS.Tree;
