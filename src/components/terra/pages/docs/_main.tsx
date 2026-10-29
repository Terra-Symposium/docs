// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/pages/docs/_main.tsx
 * Docs scaffold entrypoint, shell, transition ctx, and compiled view/edit surfaces.
 * Folder boundary: page composition and shared Docs state; block rendering, editing, chrome, and navigation remain separate.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import {
  $editReadyPath,
  $editorMounts,
  $leafTitle,
  $mode,
  $sidebar,
  $surfaceReady,
  $toolbar,
  resetEditorMounts,
  setEditorMount,
  useAtom,
  useTransitionState,
} from '../../../../lib/terra/docs/state.js';
import { keepDeepPath } from '../../../../lib/terra/docs/tree.js';
import { document } from '../../../../lib/terra/docs/editor-dom.js';
import { isDocBody } from '../../../../lib/terra/runtime/types.js';
import { cn, setDocumentTitle } from '../../../../lib/terra/runtime/runtime.js';
import { toPortableBody } from '../../../../lib/terra/runtime/leaf.js';
import { dirname } from '../../../../lib/terra/runtime/shared.js';
import {
  lazy,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { getDocsHostAdapter } from '../../../../lib/host-runtime.js';
import { docsRootPath } from '../../../../lib/terra/runtime/shared.js';

// COMPONENTS
import * as TerraQualityRegex from '../../../../lib/terra/regex.mjs';
import EditProvider, { Loader, TransitionShell } from './_editable.js';
import Nav from './_sidebar.js';
import { Suspense } from 'react';
import {
  AlertError,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  Textarea,
} from '@terra-symposium/styling/ui/terra-original';
import { Attachments } from './_attachments.js';
import { Toolbar } from './_toolbar.js';
import { useBlockNav } from './use-block-nav.js';
import { useMediaPaste } from './use-media-paste.js';
import { EditStateCtx, EditorSurfaceCtx, TransitionCtx } from '../../../../lib/terra/docs/state.js';
import { ErrorBoundary } from '../../ui.js';
import { Toaster } from 'sonner';
const TerraContentEditor = lazy(() =>
  import('../../editor/TerraContentEditor.js').then((module) => ({
    default: module.TerraContentEditor,
  })),
);

// TYPES
import type { DocBody, DocVer } from '../../../../lib/terra/runtime/types.js';
import type {
  DocsPermissionLevel as Permission,
  Draft,
  EditorRefs,
  EditorSurface,
  Mode,
  Tree as TreeType,
} from '../../../../lib/terra/runtime/types.js';
import type { User } from '../../../../lib/terra/runtime/types.js';
import type { TerraContent as TerraContentData } from '../../../../lib/terra/runtime/types.js';
/*//////////////////////////////////////////////////
HOOKS
//////////////////////////////////////////////////*/

/**
 * Handles DOM keyboard and pointer tracking for custom block els.
 *
 * @param refs - Refs input supplied to use block nav's operation.
 *
 * @return Selection, keyboard, and pointer handlers used to navigate and position custom editor blocks.
 */
/**
 * Renders the view component.
 *
 * @param props - Document body and optional reset key used to render the read-only Docs editor surface.
 * @param body - Body input supplied to view's operation.
 * @param resetKey - Key used to reset Terra's editor state for a new document.
 *
 * @return The read-only editor view for the supplied document body.
 */
function View({ body, resetKey }: { body: DocBody; resetKey?: string }): JSX.Element {
  const transition = useTransitionState();
  useEffect(() => {
    return ((timer: number) => () => {
      window.clearTimeout(timer);
      if ($surfaceReady.get() === 'view') $surfaceReady.set(null);
    })(
      window.setTimeout(() => {
        $surfaceReady.set('view');
        document.dispatchEvent(new Event('docs:surface-ready'));
      }),
    );
  }, [resetKey, transition]);
  return (
    <Suspense fallback={<div aria-hidden="true" data-docs-view-loading />}>
      <TerraContentEditor
        content={body as unknown as any[]}
        readOnly
        {...(resetKey !== undefined ? { resetKey } : {})}
      />
    </Suspense>
  );
}

/**
 * Reads the editor surface context when a Docs editor provider is present.
 *
 * @return The active editor surface, or `null` when this component is outside an editor provider.
 */
function useEditorSurfaceOptional(): EditorSurface | null {
  return useContext(EditorSurfaceCtx);
}

/**
 * Wraps lexical engine maintaining layout constraints.
 *
 * @param props - Optional wrapper classes for the editable Lexical editor surface.
 * @param className - Additional CSS classes merged into edit.
 *
 * @return The interactive Docs editing surface with its configured toolbar.
 */
const EditorSurfaces = {
  Edit({ className }: { className?: string }): JSX.Element {
    // INIT
    const surface = useEditorSurfaceOptional();
    const editorRefs = { toolbar: useAtom($toolbar), empty: useRef<EditorRefs>({} as EditorRefs) };
    const [init, setInit] = useState(false);
    const transition = useContext(TransitionCtx);
    useLayoutEffect(() => {
      if (!init) transition?.setLoading(true);
    }, [init, transition]);
    useLayoutEffect(() => {
      $editReadyPath.set(null);
      $surfaceReady.set(null);
      setInit(false);
      if (!surface) return;
      if (!surface.editor.loaded) return;
      resetEditorMounts(surface.path, ['root']);
      if (surface.parseError) {
        setInit(true);
        return;
      }
      const body = surface.refs.current.body;
      if (!body) return;
      let frame = 0;
      const mountObserver = {
        check(): void {
          const root = body.querySelector<HTMLElement>('[data-terra-content-editor]');
          if (root) {
            setEditorMount(surface.path, 'root', true);
            observer.disconnect();
          }
          const mounts = $editorMounts.get();
          setInit(
            !!root &&
              mounts.path === surface.path &&
              mounts.expected.length === mounts.mounted.length,
          );
        },
        queue(): void {
          window.cancelAnimationFrame(frame);
          frame = window.requestAnimationFrame(mountObserver.check);
        },
      };
      const observer = new MutationObserver(mountObserver.queue);
      observer.observe(body, { childList: true, subtree: true });
      mountObserver.queue();
      return () => {
        window.cancelAnimationFrame(frame);
        setEditorMount(surface.path, 'root', false);
        observer.disconnect();
      };
    }, [surface?.path, surface?.parseError, surface?.editor.loaded]);
    useEffect(() => {
      $editReadyPath.set(null);
      $surfaceReady.set(null);
      if (!init) return;
      return ((timer: number) => () => {
        window.clearTimeout(timer);
        if ($editReadyPath.get() === surface?.path) $editReadyPath.set(null);
        if ($surfaceReady.get() === 'edit') $surfaceReady.set(null);
      })(
        window.setTimeout(() => {
          $editReadyPath.set(surface?.path || null);
          $surfaceReady.set('edit');
          document.dispatchEvent(new Event('docs:surface-ready'));
        }, 50),
      );
    }, [init, surface?.path]);

    // bind keyboard shortcuts and rich media ingestion at the root
    // these must execute unconditionally to satisfy React hooks rules
    useBlockNav(surface ? surface.refs : editorRefs.empty);
    useMediaPaste(
      surface ? surface.refs : editorRefs.empty,
      surface?.insert ?? (() => undefined),
      surface?.uploadImage ?? (async () => ''),
      surface?.attachFiles ?? (async () => undefined),
    );

    // VALIDATION
    if (!surface)
      return (
        <AlertError
          title="Editor failed to initialize."
          description="Reload the page to reattach the docs editor provider."
        />
      );
    const { editor, parseError: parseErr, refs } = surface;

    // RENDER
    return (
      <div
        ref={(e) => {
          refs.current.body = e;
        }}
        className={cn(
          'min-w-0',
          className,
          '[&_[class*="_toolbarRoot_"]]:static [&_[class*="_toolbarRoot_"]]:!top-auto [&_[class*="_toolbarRoot_"]]:!z-auto [&_[class*="_toolbarRoot_"]]:m-0 [&_[class*="_toolbarRoot_"]]:w-full [&_[class*="_toolbarRoot_"]]:gap-0 [&_[class*="_toolbarRoot_"]]:overflow-visible [&_[class*="_toolbarRoot_"]]:rounded-none [&_[class*="_toolbarRoot_"]]:border-none [&_[class*="_toolbarRoot_"]]:!bg-transparent [&_[class*="_toolbarRoot_"]]:p-0 [&_[class*="_toolbarRoot_"]]:!shadow-none [&_[class*="_toolbarRoot_"]]:outline-none [&_[class*="_toolbarRoot_"]]:ring-0 focus-within:[&_[class*="_toolbarRoot_"]]:!shadow-none',
        )}
        data-docs-body-editor
        data-docs-editor="inline"
        data-docs-editor-initialized={init}
        data-docs-path={editor.draft.path}
      >
        {editor.busy === 'loading' && <div aria-hidden="true" data-docs-editor-loading />}
        {parseErr ? (
          <>
            <AlertError
              description={`${parseErr}\n\nThe source remains editable below.`}
              title="Visual editor fallback"
            />
            <textarea
              className="mt-4 min-h-[32rem] w-full rounded-md border border-primary-6 bg-primary-1 p-4 font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary-8"
              value={editor.draft.source || ''}
              onChange={(e) => surface.onMdChange(e.currentTarget.value)}
              aria-label="Document source fallback"
            />
          </>
        ) : (
          <Suspense fallback={<div aria-hidden="true" data-docs-editor-loading />}>
            <TerraContentEditor
              content={
                (isDocBody(editor.draft.content)
                  ? editor.draft.content
                  : undefined) as unknown as TerraContentData
              }
              docsAttachments={[]}
              memberProfile="docs"
              onChange={(c) => {
                surface.onBodyChange(
                  toPortableBody(
                    c.map((b) => (b._type === 'terraBlock' ? { ...b, _type: 'block' } : b)),
                  ),
                );
              }}
              resetKey={`${editor.draft.path}:${editor.version}`}
            />
          </Suspense>
        )}
      </div>
    );
  },

  /**
   * Renders the head component.
   *
   * @param props - Compact layout, editability, page metadata, contributors, and timestamps displayed in the Docs page header.
   * @param full - Whether the page is rendered in full mode.
   * @param contributors - Contributors input supplied to head's operation.
   * @param updatedAt - Updated at input supplied to head's operation.
   * @param editable - Editability flag controlling whether head accepts changes.
   * @param description - Supporting text shown in head.
   * @param title - Heading text shown in head.
   *
   * @return The page head block.
   *
   * @remarks Renders the docs page head metadata and edit controls.
   */

  Head({
    compact = false,
    description = '',
    editable,
    title,
    full,
    contributors: initContributors = [],
    updatedAt,
  }: {
    compact?: boolean;
    description?: string;
    editable: boolean;
    title: string;
    full: boolean;
    contributors?: string[] | null;
    updatedAt?: string;
  }): JSX.Element {
    // STATES
    const edit = useContext(EditStateCtx);
    const draft: Pick<Draft, 'description' | 'title'> = edit?.draft ?? { description, title };
    const contributors = initContributors ?? [];

    // RENDER
    // prettier-ignore
    return (
			<header className='terra-docs-document-header relative z-10 w-full print:!mb-8 print:border-none'>
				<div className={cn('mx-auto w-full px-6 transition-opacity duration-200 md:px-10 print:!pb-3', compact ? 'pb-3 pt-5' : 'pb-10 pt-7', full ? 'max-w-none' : 'max-w-5xl')}>
					<div>
						<Label htmlFor='docs-title' className='sr-only'>
							Title
						</Label>
						<Input
							id='docs-title'
							value={draft.title}
							onChange={e => {
								const title = e.currentTarget.value;
								edit?.update({ title });
								if (!edit?.draft.path) return;
								$leafTitle.set({ path: edit.draft.path, title });
								setDocumentTitle(title);
							}}
							placeholder='Page title'
							disabled={!editable}
							className='mb-2 mt-0 h-fit border-none bg-transparent p-0 font-serif italic tracking-tight text-4xl text-primary-12 shadow-none focus-visible:ring-0 md:text-5xl disabled:cursor-default disabled:opacity-100 dark:bg-transparent'
							suppressHydrationWarning
						/>
					</div>
					<div>
						<Label htmlFor='docs-description' className='sr-only'>
							Description
						</Label>
						<Textarea
							id='docs-description'
							value={draft.description}
							onChange={e => edit?.update({ description: e.currentTarget.value })}
							placeholder='Add a description...'
							disabled={!editable}
							className='min-h-0 resize-none border-none bg-transparent p-0 text-base text-pretty text-primary-11 shadow-none focus-visible:ring-0 disabled:cursor-default disabled:opacity-100 dark:bg-transparent'
							suppressHydrationWarning
						/>
					</div>
					{(updatedAt || contributors.length > 0) && (
						<div className='mt-4 flex flex-wrap items-center gap-2 text-sm text-primary-11'>
							{updatedAt && <span>Last modified {new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(updatedAt))}</span>}
							{contributors.map(c => <Badge key={c} size='sm' title='Contributing author' variant='secondary'>{c}</Badge>)}
						</div>
					)}
				</div>
			</header>
		);
  },
};

/**
 * Renders the scaffold component.
 *
 * @param props - Tree, route, user, document content, edit permission, metadata, and display mode for the Docs page shell.
 * @param tree - Tree input supplied to scaffold's operation.
 * @param pathname - Pathname input supplied to scaffold's operation.
 * @param permission - Permission input supplied to scaffold's operation.
 * @param userData - user record supplied to scaffold.
 * @param description - Supporting text shown in scaffold.
 * @param contributors - Contributors input supplied to scaffold's operation.
 * @param updatedAt - Updated at input supplied to scaffold's operation.
 * @param full - Full input supplied to scaffold's operation.
 * @param standalone - Standalone input supplied to scaffold's operation.
 * @param path - Source or route path resolved for scaffold.
 * @param compiledMDX - Compiled mdx input supplied to scaffold's operation.
 * @param title - Heading text shown in scaffold.
 * @param source - Source node identifier for the connection drawn by scaffold.
 * @param content - Content input supplied to scaffold's operation.
 * @param mode - Mode input supplied to scaffold's operation.
 *
 * @return The Docs scaffold with its navigation tree, content surface, and page controls.
 */
export default function Scaffold({
  tree,
  pathname: initPathname,
  permission,
  userData,
  description: initDesc,
  contributors: initContributors,
  updatedAt: initUpdatedAt,
  full = false,
  standalone = false,
  path: initPath,
  compiledMDX: initMdx = '',
  title: initTitle,
  source: initSrc,
  content: initContent,
  mode: initialMode,
  viewContent,
}: {
  tree: TreeType[];
  pathname: string;
  permission: Permission;
  userData: User | null;
  description?: string;
  full?: boolean;
  standalone?: boolean;
  path?: string;
  compiledMDX?: string;
  title: string;
  source?: string;
  content?: string | DocVer[] | DocBody;
  contributors?: string[];
  updatedAt?: string;
  mode?: Mode;
  viewContent?: ReactNode;
}): JSX.Element {
  // STATES
  const navigationState = { open: useAtom($sidebar), leafTitle: useAtom($leafTitle) };
  // Match the original Docs shell: only render the Portable Text editor after hydration.
  // Its external store is not SSR-safe, and rendering it in the initial HTML causes React #419.
  const [hydrated, setHydrated] = useState<boolean>(standalone);
  const toolbar = useAtom($toolbar);
  const stored = useAtom($mode);
  const writable = permission === 'write';
  const modeSynced = useRef(false);
  const pendingMode = useRef<Mode | null>(initialMode ?? null);
  const contributors = useMemo(() => initContributors ?? [], [initContributors]);
  // prettier-ignore
  const [dest, setDest] = useState<{ open: boolean; section: string; group: string; title: string; newSection: boolean }>({ open: false, section: '', group: '', title: 'Untitled', newSection: false, });
  const destRes = useRef<
    ((tgt: { path: string; parentId?: string; title?: string } | null) => void) | null
  >(null);
  const sects = useMemo(
    () => tree.filter((n): n is Extract<TreeType, { type: 'branch' }> => n.type === 'branch'),
    [tree],
  );
  const destActions = {
    groups: useMemo(() => {
      if (!dest.section) return [];
      return (
        sects
          .find((s) => s.origName === dest.section)
          ?.children?.filter(
            (c): c is Extract<TreeType, { type: 'branch' }> => c.type === 'branch',
          ) ?? []
      );
    }, [sects, dest.section]),
    finish: useCallback(async () => {
      if (!dest.section || !dest.group) return;
      const section = dest.newSection
        ? dest.section.trim().toLowerCase().replace(TerraQualityRegex.REGEX_A_Z0_9_G_REGEX(), '-')
        : dest.section;
      const group = dest.newSection
        ? dest.group.trim().toLowerCase().replace(TerraQualityRegex.REGEX_A_Z0_9_G_REGEX(), '-')
        : dest.group;
      const sel = sects
        .find((i) => i.origName === section)
        ?.children?.find((i) => i.type === 'branch' && i.origName === group);
      const selPath =
        sel?.type === 'branch'
          ? sel.children?.find((i) => i.type === 'leaf' && Boolean(i.path))
          : undefined;
      const leafPath = selPath?.type === 'leaf' ? selPath.path : undefined;
      const selBase = leafPath ? dirname(leafPath) : '';
      const destPath = {
        base: !dest.newSection && selBase && selBase !== '.' ? selBase : `${section}/${group}`,
        slug:
          dest.title
            .trim()
            .toLowerCase()
            .replace(TerraQualityRegex.REGEX_A_Z0_9_G_REGEX(), '-')
            .replace(TerraQualityRegex.REGEX_G_REGEX_20(), '') || 'untitled',
      };
      destRes.current?.({
        path: `${destPath.base}/${destPath.slug}.mdx`,
        parentId: dest.newSection ? undefined : sel?.origName,
        title: dest.title.trim() || 'Untitled',
      });
      destRes.current = null;
      setDest((p) => ({ ...p, open: false }));
    }, [dest, sects]),
  };

  // prettier-ignore
  const [currDoc, setCurrDoc] = useState({ pathname: initPathname, path: initPath, title: initTitle, description: initDesc, contributors, updatedAt: initUpdatedAt, source: initSrc || (typeof initContent === 'string' ? initContent : ''), content: toPortableBody(initContent), compiledMDX: initMdx, versions: [] as DocVer[] });

  // 1. ASTRO VIEW TRANSITION / HMR PROP SYNC
  // Force component state to update if Astro swaps the underlying page and injects new props into this instance.
  useEffect(() => {
    const content = toPortableBody(initContent);
    const src = initSrc || (typeof initContent === 'string' ? initContent : '');
    setCurrDoc((p) => {
      if (
        p.pathname === initPathname &&
        p.path === initPath &&
        p.title === initTitle &&
        p.description === initDesc &&
        p.updatedAt === initUpdatedAt &&
        p.source === src &&
        p.compiledMDX === initMdx &&
        p.contributors.length === contributors.length &&
        p.contributors.every((c, i) => c === contributors[i]) &&
        JSON.stringify(p.content) === JSON.stringify(content)
      )
        return p;
      return {
        ...p,
        pathname: initPathname,
        path: initPath,
        title: initTitle,
        description: initDesc,
        contributors,
        updatedAt: initUpdatedAt,
        source: src,
        content,
        compiledMDX: initMdx,
        versions: p.versions,
      };
    });
  }, [
    initPathname,
    initPath,
    initTitle,
    initDesc,
    contributors,
    initUpdatedAt,
    initSrc,
    initContent,
    initMdx,
  ]);
  useEffect(() => {
    /**
     * Handles rename.
     *
     * @param e - Pointer event received from the editor control.
     */
    const rename = (e: Event) => {
      if (
        !(e as CustomEvent<{ isActive?: boolean; title?: string }>).detail.isActive ||
        typeof (e as CustomEvent<{ isActive?: boolean; title?: string }>).detail.title !== 'string'
      )
        return;
      setCurrDoc((p) => ({
        ...p,
        title: (e as CustomEvent<{ isActive?: boolean; title?: string }>).detail.title!,
      }));
    };
    document.addEventListener('docs:rename', rename);
    return () => {
      document.removeEventListener('docs:rename', rename);
    };
  }, []);
  useEffect(() => {
    if (currDoc.path) $leafTitle.set({ path: currDoc.path, title: currDoc.title });
  }, [currDoc.path, currDoc.title]);
  useEffect(() => {
    setDocumentTitle(
      navigationState.leafTitle?.path === currDoc.path
        ? (navigationState.leafTitle?.title ?? currDoc.title)
        : currDoc.title,
    );
  }, [currDoc.path, currDoc.title, navigationState.leafTitle]);
  useEffect(() => {
    /**
     * Handles update favicon.
     */
    const updateFavicon = () => {
      const favicon = document.getElementById('favicon') as HTMLLinkElement | null;
      if (!favicon) return;
      const href = favicon.href.split(',')[1];
      if (!href) return;
      const styles = getComputedStyle(document.documentElement);
      const primary = styles.getPropertyValue('--primaryLight9').trim();
      const secondary = styles.getPropertyValue('--secondaryLight5').trim();
      if (!primary || !secondary) return;
      favicon.href = `data:image/svg+xml,${encodeURIComponent(
        decodeURIComponent(href)
          .replace(
            /fill="[^"]*"\s*stroke="[^"]*"/,
            `fill="rgb(${secondary})" stroke="rgb(${secondary})"`,
          )
          .replace(/fill="[^"]*"/, `fill="rgb(${primary})"`),
      )}`;
    };
    updateFavicon();
    document.addEventListener('docs:hue-change', updateFavicon);
    return () => {
      document.removeEventListener('docs:hue-change', updateFavicon);
    };
  }, []);

  // 2. SPA NAVIGATION INTERCEPT & URL SYNC
  // Only updates the state, letting React naturally handle side effects.
  useEffect(() => {
    /**
     * Handles handle nav.
     *
     * @param e - Keyboard or pointer event received from the editor control.
     */
    const handleNav = (e: Event) => {
      setCurrDoc((previous) => {
        const detail = ((e as CustomEvent).detail || {}) as Record<string, unknown>;
        const rawPathname =
          typeof detail.pathname === 'string'
            ? detail.pathname
            : typeof detail.url === 'string'
              ? detail.url
              : previous.pathname || '';
        return {
          ...previous,
          ...detail,
          source:
            Object.prototype.hasOwnProperty.call(detail, 'source') &&
            typeof detail.source === 'string'
              ? detail.source
              : previous.source || '',
          content: isDocBody(detail.content) ? detail.content : previous.content,
          pathname: keepDeepPath(
            previous.pathname || '',
            rawPathname ? rawPathname.split('?')[0] || '' : previous.pathname || '',
          ),
          compiledMDX:
            Object.prototype.hasOwnProperty.call(detail, 'compiledMDX') &&
            detail.compiledMDX !== undefined
              ? String(detail.compiledMDX)
              : (previous.compiledMDX ?? ''),
          versions: previous.versions,
        };
      });
    };
    document.addEventListener('docs:navigate', handleNav);
    window.addEventListener('docs:navigate', handleNav);

    // Handle 403/404 Soft-Redirect Intercepts
    /**
     * Handles handle err redirect.
     *
     * @param e - Change event received from the active Docs input.
     */
    const handleErrRedirect = (e: Event) => {
      const type = ((e as CustomEvent).detail || {}).type; // '403' or '404'
      console.warn(
        `[Scaffold] Caught docs:error:redirect event (${type}). Performing soft redirect...`,
      );
      toast.error(type === '403' ? 'Permission denied.' : 'Document not found.');
      if (type === '403') {
        const url = new URL(window.location.href);
        url.searchParams.delete('403');
        url.searchParams.delete('404');
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
        return;
      }
      // find first leaf to fall back to securely
      /**
       * Handles get first leaf.
       *
       * @param nodes - Docs tree nodes being rendered in the navigation.
       */
      const cFallback = (
        (function firstLeaf(nodes: TreeType[]): string | null {
          for (const n of nodes) {
            if (n.type === 'leaf') return n.url || null;
            if (n.type === 'branch' && n.children) {
              const found = firstLeaf(n.children);
              if (found) return found;
            }
          }
          return null;
        })(tree) || docsRootPath()
      ).split('?')[0];
      const url = new URL(window.location.href);
      url.pathname = cFallback;
      url.searchParams.delete('403');
      url.searchParams.delete('404');
      window.history.replaceState(null, '', url.toString());
      document.dispatchEvent(
        new CustomEvent('docs:navigate', { detail: { url: cFallback, pathname: cFallback } }),
      );
    };
    document.addEventListener('docs:error:redirect', handleErrRedirect);
    return () => {
      document.removeEventListener('docs:navigate', handleNav);
      window.removeEventListener('docs:navigate', handleNav);
      document.removeEventListener('docs:error:redirect', handleErrRedirect);
    };
  }, [tree]);

  // keep the selected mode and URL query aligned so reloads preserve the active surface
  useEffect(() => {
    if (modeSynced.current) return;
    modeSynced.current = true;
    if (typeof window === 'undefined') return;
    const cur = new URL(window.location.href).searchParams.get('mode');
    if (!writable && stored === 'edit') $mode.set('view');
    if (cur && ['view', 'edit', 'attachments'].includes(cur) && (writable || cur !== 'edit')) {
      pendingMode.current = cur as Mode;
      if (cur !== stored) $mode.set(cur as Mode);
    } else if (!cur && stored !== 'view') $mode.set('view');
  }, [stored, writable]);
  useEffect(() => {
    if (pendingMode.current && stored !== pendingMode.current) return;
    pendingMode.current = null;
    const url = new URL(window.location.href);
    const cur = url.searchParams.get('mode');
    if (!writable) {
      if (cur === 'edit') {
        url.searchParams.delete('mode');
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }
      if (stored === 'edit') $mode.set('view');
      return;
    }
    if (cur === stored) return;
    if (stored === 'view') url.searchParams.delete('mode');
    else url.searchParams.set('mode', stored);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [stored, writable]);

  // Ensure URL matches document viewed (without appending duplicate query strings)
  useEffect(() => {
    const url = new URL(window.location.href);
    const cCurrPath = currDoc.pathname?.split('?')[0];
    const nPath = cCurrPath ? keepDeepPath(url.pathname, cCurrPath) : '';
    if (nPath && url.pathname !== nPath) {
      console.info('[Docs:url-sync]', {
        current: url.pathname,
        next: cCurrPath,
        path: currDoc.path,
        resolved: nPath,
      });
      url.pathname = nPath;
      window.history.replaceState(null, '', url.toString());
    }
  }, [currDoc.pathname]);

  // PROCESS
  const a: Mode = !hydrated
    ? (initialMode ?? 'view')
    : !writable && stored === 'edit'
      ? 'view'
      : stored;

  // unify all loading scenarios into a single boolean
  const loadingState = {
    isSaving: toolbar?.busy === 'saving' && !toolbar?.optimistic,
    transition: useTransitionState(),
  };
  const isLoading = !hydrated || loadingState.isSaving || loadingState.transition !== 'idle';
  useEffect(() => {
    setHydrated(true);
    if (!writable && stored === 'edit') $mode.set('view');
  }, [currDoc.pathname, writable, stored]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!(url.searchParams.get('403') === 'true')) return;
    console.warn('[Docs:403]', { pathname: url.pathname, search: url.search });
    toast.error('Permission denied.');
    url.searchParams.delete('403');
    url.searchParams.delete('404');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  // RENDER
  if (standalone) {
    return (
      <TransitionShell
        className="size-full min-w-0 max-w-none overflow-visible text-inherit print:m-0 print:h-auto print:min-h-0 print:w-full print:overflow-visible print:p-0"
        mode="view"
      >
        <div data-docs-shell data-docs-mode="view" className="w-full">
          <div className={cn('mx-auto w-full px-6 md:px-10', full ? 'max-w-none' : 'max-w-5xl')}>
            <div data-docs-body className="relative h-full min-h-[50vh] text-primary-12">
              <div
                className="prose max-w-none pb-40 pt-8 transition-opacity duration-200"
                data-docs-body-content
                data-docs-view-root="true"
              >
                <ErrorBoundary
                  name="StandaloneBody"
                  fallback={() => (
                    <AlertError
                      title="Standalone Surface Crashed"
                      description="The standalone documentation surface crashed during rendering."
                    />
                  )}
                >
                  <View
                    body={isDocBody(currDoc.content) ? currDoc.content : []}
                    resetKey={currDoc.path ?? currDoc.pathname}
                  />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      </TransitionShell>
    );
  }
  return (
    <SidebarProvider
      className="terra-docs-workspace font-sans"
      open={hydrated ? navigationState.open : true}
      onOpenChange={(n) => {
        $sidebar.set(n);
      }}
    >
      <Toaster richColors />
      <Nav
        docs={tree}
        pathname={currDoc.pathname}
        permission={permission}
        userData={userData ?? null}
        siteTitle={getDocsHostAdapter()?.siteTitle ?? 'Terra Symposium'}
        siteDescription={getDocsHostAdapter()?.siteDescription}
        homePath={getDocsHostAdapter()?.homePath ?? docsRootPath()}
      />
      {/* NAV SIDEBAR; larger than sm */}
      <SidebarInset className="relative flex min-h-svh min-w-0 flex-col print:min-h-0">
        {/* NAV HEADER; sm or smaller */}
        <ErrorBoundary name="NavHeader">
          <header className="flex h-14 shrink-0 items-center border-b border-primary-6 bg-primary-2 px-5 md:hidden print:hidden">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-2 h-4" />
            <span className="font-serif text-lg">
              {getDocsHostAdapter()?.siteTitle ?? 'Terra Symposium'}
            </span>
          </header>
        </ErrorBoundary>
        <div
          className={cn('relative flex min-h-0 flex-1 flex-col', isLoading && 'overflow-hidden')}
        >
          {/* CONTENT SHELL */}
          {hydrated && !loadingState.isSaving && (
            <TransitionShell
              className={cn(
                'size-full min-w-0 max-w-none overflow-visible text-inherit print:m-0 print:h-auto print:min-h-0 print:w-full print:overflow-visible print:p-0',
                loadingState.isSaving
                  ? 'hidden'
                  : isLoading
                    ? 'pointer-events-none absolute inset-0 overflow-hidden opacity-0'
                    : 'block',
              )}
              mode={a}
              path={currDoc.path}
            >
              <EditProvider key={currDoc.pathname} permission={permission} {...currDoc}>
                <div className="w-full">
                  {/* HEAD */}
                  <EditorSurfaces.Head
                    compact={a === 'edit'}
                    editable={writable && a !== 'view'}
                    title={currDoc.title}
                    full={full}
                    {...(currDoc.description !== undefined && { description: currDoc.description })}
                    contributors={currDoc.contributors}
                    updatedAt={currDoc.updatedAt}
                  />
                  {/* MAIN */}
                  <div className="w-full">
                    <div
                      className={cn(
                        'mx-auto w-full px-6 md:px-10',
                        full ? 'max-w-none' : 'max-w-5xl',
                      )}
                    >
                      {/* root; must be relative and fill height to constrain absolute overlay */}
                      <div data-docs-body className="relative h-full min-h-[50vh] text-primary-12">
                        {/* Keep the document mode and formatting controls in one shared toolbar in every mode. */}
                        <Toolbar toolbar={toolbar} activeMode={a} editable={writable} />
                        {/* content */}
                        <div
                          className={cn(
                            'prose max-w-none pb-40 transition-opacity duration-200',
                            a === 'edit' ? 'pt-2' : 'pt-8',
                          )}
                          data-docs-body-content
                          data-docs-view-root={a === 'view' ? 'true' : undefined}
                        >
                          <ErrorBoundary
                            name="EditorBody"
                            resetKey={`${a}:${currDoc.path ?? ''}`}
                            fallback={() => (
                              <div className="p-8">
                                <AlertError
                                  title="Editor Surface Crashed"
                                  description="The workspace editor canvas encountered a rendering crash. You can safely switch to attachments view to recover."
                                />
                              </div>
                            )}
                          >
                            {hydrated &&
                              (a === 'view' ? (
                                (viewContent ?? (
                                  <View
                                    body={isDocBody(currDoc.content) ? currDoc.content : []}
                                    resetKey={currDoc.path ?? currDoc.pathname}
                                  />
                                ))
                              ) : a === 'edit' ? (
                                <EditorSurfaces.Edit />
                              ) : a === 'attachments' ? (
                                <Attachments dPath={currDoc.path ?? ''} tree={tree} />
                              ) : null)}
                          </ErrorBoundary>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </EditProvider>
            </TransitionShell>
          )}
          {isLoading && <Loader className="absolute inset-0 z-10" />}
        </div>
        <Dialog
          open={dest.open}
          onOpenChange={(o) => {
            if (!o) destRes.current?.(null);
            setDest((p) => ({ ...p, open: o }));
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save document</DialogTitle>
              <DialogDescription>Choose where to save this document.</DialogDescription>
            </DialogHeader>
            {/* prettier-ignore */}
            <div className='space-y-4'>
							<Label>Page title</Label>
							<Input value={dest.title} onChange={e => { setDest(p => ({ ...p, title: e.currentTarget.value })); }} />
							<Label>Section</Label>
							<Select
								value={dest.section}
								onValueChange={v => { setDest(p => ({ ...p, section: v, group: sects.find(s => s.origName === v)?.children?.find(c => c.type === 'branch')?.origName || '' })); }}
							>
								<SelectTrigger aria-label='Select section'><SelectValue placeholder='Select section' /></SelectTrigger>
								<SelectContent>{sects.map(s => (<SelectItem key={s.origName} value={s.origName}>{s.title || s.origName}</SelectItem>))}</SelectContent>
							</Select>
							<Label>Group</Label>
							<Select value={dest.group} onValueChange={g => { setDest(p => ({ ...p, group: g })); }}>
								<SelectTrigger aria-label='Select group'><SelectValue placeholder='Select group' /></SelectTrigger>
								<SelectContent>{destActions.groups.map(s => (<SelectItem key={s.origName} value={s.origName}>{s.title || s.origName}</SelectItem>))}</SelectContent>
							</Select>
							<Button variant='outline' onClick={() => { setDest(p => ({ ...p, newSection: !p.newSection, section: '', group: '' })); }}>
								{dest.newSection ? 'Use existing section' : 'Create new section'}
							</Button>
							{dest.newSection && (
								<>
									<Label>New section name</Label>
									<Input value={dest.section} onChange={e => { setDest(p => ({ ...p, section: e.currentTarget.value })); }} />
									<Label>New group name</Label>
									<Input value={dest.group} onChange={e => { setDest(p => ({ ...p, group: e.currentTarget.value })); }} />
								</>
							)}
						</div>
            <DialogFooter>
              <Button
                onClick={destActions.finish}
                disabled={!dest.title.trim() || !dest.section || !dest.group}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
