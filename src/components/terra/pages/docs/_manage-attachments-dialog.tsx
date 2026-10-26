// @ts-nocheck -- attachment editing is a host-backed Docs dialog.
/** Manages attachments for a Docs page, group, or section. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as TerraQualityRegex from '../../../../lib/terra/regex.mjs';
import { actions } from '../../../../lib/terra/runtime/action-proxy.js';
import { cn, notify } from '../../../../lib/terra/runtime/runtime.js';
import {
  cTitle,
  dirname,
  docsPath,
  isDocsPath,
  toNodeLabel,
} from '../../../../lib/terra/runtime/shared.js';
import { runMutation } from '../../../../lib/terra/docs/mutations.js';
import { uploadAssetChunked } from '../../../../lib/terra/docs/assets.js';
import { sanitizeName, parseDocsRoute as route } from '../../../../lib/terra/docs/tree.js';
import { useRenderTripwire } from './use-render-tripwire.js';
import { toast } from 'sonner';
import {
  Add as AddIcon,
  ArrowLeft as LeftArrowIcon,
  Box as BoxIcon,
  Catalog as CatalogIcon,
  Doc as DocumentIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  LogoYoutube as YouTubeIcon,
  MagicWand as MagicIcon,
  Upload as UploadIcon,
} from '@carbon/icons-react';
import { Empty } from '../../ui.js';
import { TsDocsSelect } from './_blocks.js';
import {
  Button,
  Card,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Spinner,
  Textarea,
} from '@terra-symposium/styling/ui/terra-original';
import type {
  AttchTgt,
  AttchType,
  Branch,
  Leaf as LeafNode,
  Sister,
  Tree as TreeType,
} from '../../../../lib/terra/runtime/types.js';

export function ManageAttachmentsDialog({
  tgt,
  setTgt,
  disabled,
  tree,
}: {
  tgt: AttchTgt | null;
  setTgt: React.Dispatch<React.SetStateAction<AttchTgt | null>>;
  disabled: boolean;
  tree: TreeType[];
}) {
  const [atts, setAtts] = useState<Record<string, Sister[]>>({});
  const [loading, setLoading] = useState(false);
  const [a, setActive] = useState<{
    title: string;
    fullTitle: string;
    id: string;
    path: string;
    type: string;
  } | null>(null);
  const [addMode, setAddMode] = useState<AttchType | 'select' | 'page' | null>(null);
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selAtts, setSelAtts] = useState<{ docPath: string; a: Sister }[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  useRenderTripwire('ManageAttachmentsDialog', {
    tgt,
    disabled,
    tree,
    atts,
    loading,
    active: a,
    addMode,
    url,
    query,
    isCreating,
    selectedAtts: selAtts,
  });
  const nodeGroups = useMemo(() => {
    if (!tgt) return [];
    const n = tgt.node;
    if (tgt.scope === 'leaf') {
      const lTitle = cTitle(toNodeLabel(tgt.title)) || tgt.title;
      return [
        {
          groupTitle: 'Page',
          nodes: [
            {
              title: lTitle,
              fullTitle: lTitle,
              id: (n as LeafNode).origName,
              path: (n as LeafNode).path || '',
              type: 'Page' as const,
              node: n,
            },
          ],
        },
      ];
    }
    if (tgt.scope === 'group') {
      const gNodes = [];
      const gTitle = cTitle(toNodeLabel(tgt.title));
      gNodes.push({
        title: `${gTitle} (Index)`,
        fullTitle: gTitle,
        id: (n as Branch).origName,
        path: 'url' in n && n.url ? n.url.replace(TerraQualityRegex.REGEX_DOCS_REGEX(), '') : '',
        type: 'Index' as const,
        node: n,
      });
      (n as Branch).children?.forEach((c) => {
        if (c.type === 'leaf') {
          const lTitle = cTitle(toNodeLabel(c.title || c.origName));
          gNodes.push({
            title: lTitle,
            fullTitle: `${gTitle} / ${lTitle}`,
            id: c.origName,
            path: c.path || '',
            type: 'Page' as const,
            node: c,
          });
        }
      });
      return [{ groupTitle: gTitle, nodes: gNodes }];
    }
    if (tgt.scope === 'section') {
      const groups: {
        groupTitle: string;
        nodes: {
          title: string;
          fullTitle: string;
          id: string;
          path: string;
          type: 'Index' | 'Page';
          node: TreeType;
        }[];
      }[] = [];
      const sectTitle = cTitle(toNodeLabel(tgt.title));
      // prettier-ignore
      groups.push({ groupTitle: 'Section Root', nodes: [{ title: `${sectTitle} (Index)`, fullTitle: sectTitle, id: (n as Branch).origName, path: 'url' in n && n.url ? n.url.replace(TerraQualityRegex.REGEX_DOCS_REGEX(), '') : '', type: 'Index' as const, node: n },] });
      (n as Branch).children?.forEach((c) => {
        if (c.type === 'branch') {
          const gTitle = cTitle(toNodeLabel(c.title || c.origName));
          const gNodes = [];
          // prettier-ignore
          gNodes.push({ title: `${gTitle} (Index)`, fullTitle: `${sectTitle} / ${gTitle}`, id: c.origName, path: 'url' in c && c.url ? c.url.replace(TerraQualityRegex.REGEX_DOCS_REGEX(), '') : '', type: 'Index' as const, node: c });
          c.children?.forEach((l) => {
            if (l.type === 'leaf') {
              const lTitle = cTitle(toNodeLabel(l.title || l.origName));
              gNodes.push({
                title: lTitle,
                fullTitle: `${sectTitle} / ${gTitle} / ${lTitle}`,
                id: l.origName,
                path: l.path || '',
                type: 'Page' as const,
                node: l,
              });
            }
          });
          groups.push({ groupTitle: gTitle, nodes: gNodes });
        } else if (c.type === 'leaf') {
          const lTitle = cTitle(toNodeLabel(c.title || c.origName));
          groups[0].nodes.push({
            title: lTitle,
            fullTitle: `${sectTitle} / ${lTitle}`,
            id: c.origName,
            path: c.path || '',
            type: 'Page' as const,
            node: c,
          });
        }
      });
      return groups;
    }
    return [];
  }, [tgt]);
  const filteredLeaves = useMemo(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];
    const lowerQuery = trimmedQuery.toLowerCase();
    const leaves: { path: string; title: string; breadcrumb: string }[] = [];
    /*
     * Handles walk.
     *
     * @param nodes - Sidebar nodes being rendered or filtered.
     * @param pathStr - Path prefix used to resolve each node's route.
     */
    (function walk(nodes: TreeType[], pathStr: string) {
      nodes.forEach((n) => {
        const currTitle = n.title || n.origName;
        if (n.type === 'leaf') {
          if (
            currTitle.toLowerCase().includes(lowerQuery) ||
            (n.path ? n.path.toLowerCase() : '').includes(lowerQuery)
          ) {
            leaves.push({ path: n.path!, title: currTitle, breadcrumb: pathStr });
          }
        } else if (n.type === 'branch' && n.children)
          walk(n.children, pathStr ? `${pathStr} / ${currTitle}` : currTitle);
      });
    })(tree, '');
    return leaves;
  }, [query, tree]);
  useEffect(() => {
    if (tgt?.scope === 'leaf') {
      const lTitle = cTitle(toNodeLabel(tgt.title)) || tgt.title;
      setActive({
        title: lTitle,
        fullTitle: lTitle,
        id: (tgt.node as LeafNode).origName,
        path: (tgt.node as LeafNode).path || '',
        type: 'Page',
      });
    } else setActive(null);
    setAddMode(null);
    setUrl('');
    setQuery('');
    setSelAtts([]);
  }, [tgt]);
  const fetchAtts = useCallback(async () => {
    if (!tgt) return;
    setLoading(true);
    const ids = [
      ...new Set(
        (a ? [a.id] : nodeGroups.flatMap((g) => g.nodes.map((n) => n.id))).filter(Boolean),
      ),
    ];
    const { data, error: err } = await actions.read.doc.attachments({ paths: ids });
    if (!err && data) setAtts(data as Record<string, Sister[]>);
    else setAtts({});
    setLoading(false);
  }, [tgt, a, nodeGroups]);
  useEffect(() => {
    void fetchAtts();
  }, [fetchAtts]);

  // DRAG AND DROP
  /**
   * Handles on drop.
   *
   * @param e - Pointer event received from the sidebar item.
   * @param tgtPath - Destination path associated with the selected item.
   */
  // SELECTION
  /**
   * Handles toggle sel.
   *
   * @param e - Pointer event received from the document action.
   * @param docPath - Document path targeted by the action.
   * @param a - Action metadata used to perform the document operation.
   */
  const toggleSel = (e: React.MouseEvent, docPath: string, a: Sister) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey) {
      setSelAtts((v) => {
        if (v.find((p) => (p.a.id || p.a.path) === (a.id || a.path)))
          return v.filter((p) => (p.a.id || p.a.path) !== (a.id || a.path));
        return [...v, { docPath, a }];
      });
    } else {
      setSelAtts([{ docPath, a }]);
    }
  };

  // ACTIONS
  const handleKeyboardDelete = useCallback(async () => {
    if (!selAtts.length) return;
    // 1. Snapshot for rollback
    const originalSel = [...selAtts];
    // 2. Optimistic UI updates
    setAtts((v) => {
      const n = { ...v };
      for (const { docPath, a } of originalSel) {
        n[docPath] = (n[docPath] || []).filter(
          (
            (key: string) => (p: Sister) =>
              (p.id || p.path) !== key
          )(a.id || a.path),
        );
      }
      return n;
    });
    setSelAtts([]);
    // 3. Background network operation
    try {
      for (const { docPath, a } of originalSel) {
        if (a.isMd) await actions.write.doc.rm({ path: a.path, type: 'doc', assets: false });
        else if (a.id) {
          await actions.write.attachment.rm({ docPath, attachmentKey: a.id });
          if (a.path.startsWith('http')) await actions.write.asset.delete({ url: a.path });
        }
      }
      // Background sync just to ensure external alignment
      void fetchAtts();
    } catch (_err) {
      // 4. Failure rollback
      setAtts({ ...atts });
      setSelAtts(originalSel);
      toast.error(`Failed to delete ${originalSel.length === 1 ? 'attachment' : 'attachments'}`);
    }
  }, [atts, selAtts, fetchAtts]);

  // GLOBAL KEYBOARD SHORTCUTS
  useEffect(() => {
    if (!tgt) return;
    /**
     * Handles handle key down.
     *
     * @param e - Pointer event received from the sidebar control.
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || disabled || selAtts.length === 0) return;
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        void handleKeyboardDelete();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [tgt, loading, disabled, selAtts, handleKeyboardDelete]);

  /**
   * Handles upload.
   *
   * @param files - Files available to the sidebar resolver.
   * @param tgtPath - Target path used to select the matching file.
   */
  /**
   * Handles add remote.
   *
   * @param v - Sidebar value being normalized.
   * @param type - Sidebar node type used to select the renderer.
   * @param tgtPath - Target path associated with the node.
   * @param titleOverride - Optional title replacing the node's default title.
   */
  const addRemote = async (
    v: string,
    type: AttchType | 'page',
    tgtPath: string,
    titleOverride?: string,
  ) => {
    if (!tgtPath || !v.trim()) return;
    const urls = v
      .split(TerraQualityRegex.REGEX_N_S_REGEX())
      .filter((u) =>
        type === 'tsdocs'
          ? u.trim().length > 0
          : u.startsWith('http') || isDocsPath(u) || u.startsWith('/tsdocs') || type === 'page',
      );
    if (!urls.length) return;
    void runMutation(
      async () => {
        await Promise.allSettled(
          urls.map(async (u) => {
            let t = type;
            if (t === 'other')
              t = u.toLowerCase().split('?')[0].endsWith('.pdf')
                ? 'document'
                : TerraQualityRegex.REGEX_PNG_JPE_G_GIF_WEBP_SVG_AVIF_I_REGEX_2().test(
                      u.toLowerCase().split('?')[0] ?? '',
                    )
                  ? 'image'
                  : t;
            if (t === 'page') {
              // directly inject a strict Sanity reference to the existing document
              // prettier-ignore
              await actions.write.attachment.docRef({
								path: tgtPath,
								refId: u, // u is the pure Sanity path/id
								title: titleOverride || u.split('/').filter(Boolean).pop()?.replace(TerraQualityRegex.REGEX_G_REGEX_7(), ' ').replace(TerraQualityRegex.REGEX_B_W_G_REGEX(), c => c.toUpperCase()) || 'Page',
							});
            } else if (t === 'youtube') {
              await actions.write.attachment.youtube({ path: tgtPath, url: u });
            } else if (t === 'website') {
              const { data: w } = await actions.read.external.website({ url: u });
              if (!w) throw new Error('Website import returned no content.');
              const dir = dirname(tgtPath);
              await actions.write.doc.editor({
                path: `${dir === '.' ? '' : `${dir}/`}${sanitizeName(w.title || 'website')}.mdx`,
                source: w.text,
                title: w.title,
                type: 'website',
                sourceUrl: u,
              });
            } else if (t === 'tsdocs') {
              // prettier-ignore
              await actions.write.attachment.link({ path: tgtPath, url: u.startsWith('http') ? u : u.startsWith('/') ? `${window.location.origin}${u}` : `${window.location.origin}${docsPath(`tsdocs/${u}`)}`, type: 'tsdocs', title: u.split('/').filter(Boolean).pop()?.replace(TerraQualityRegex.REGEX_G_REGEX_7(), ' ').replace(TerraQualityRegex.REGEX_B_W_G_REGEX(), c => c.toUpperCase()) || 'Reference' });
            } else
              await actions.write.attachment.remoteFile({
                path: tgtPath,
                url: u,
                type: t as AttchType,
              });
          }),
        );
        await fetchAtts();
        setAddMode(null);
        setUrl('');
      },
      'Failed to attach',
      () => {
        setLoading(true);
      },
      () => {
        setLoading(false);
      },
    );
  };

  /**
   * Handles attach page.
   *
   * @param path - Document path being created or edited.
   * @param isNew - Whether the path represents a new document.
   * @param customTitle - Optional title supplied by the editor.
   */
  const attachPage = async (path: string, isNew = false, customTitle?: string) => {
    if (!a) return;
    let finalPath = path;
    let finalTitle = customTitle || path;
    if (isNew) {
      setIsCreating(true);
      try {
        const newId = `temp_l_${Date.now()}`;
        finalPath = newId;
        // Anchor document structurally inside the group to bypass verifyWrite 404
        let parentId = a.id;
        if (a.type === 'Page') {
          let groupId: string | undefined;
          // 1. Primary Fallback: Extract from the current docs route
          if (typeof window !== 'undefined') {
            try {
              const curr = route(window.location.pathname + window.location.search);
              groupId = curr.groupId || curr.sectionId || undefined;
            } catch {
              // Tree lookup below provides the fallback group.
            }
          }
          // 2. Secondary Fallback: Tree Search (for established documents)
          if (!groupId) {
            /*
             * Handles find group.
             *
             * @param nodes - Sidebar nodes containing the target leaf.
             * @param tgtLeafId - Leaf identifier being selected.
             * @param currGroupId - Current group identifier used for route context.
             */
            (function findGroup(
              nodes: TreeType[],
              tgtLeafId: string,
              currGroupId?: string,
            ): boolean {
              for (const n of nodes) {
                if (n.type === 'leaf' && (n.origName === tgtLeafId || n.path === tgtLeafId)) {
                  groupId = currGroupId;
                  return true;
                }
                if (n.type === 'branch' && n.children)
                  if (findGroup(n.children, tgtLeafId, n.origName)) return true;
              }
              return false;
            })(tree, a.id);
          }
          if (groupId) parentId = groupId;
        }
        const writeRes = await actions.write.doc
          .editor({ path: newId, title: query, source: 'This page is empty.', parentId })
          .catch((e) => ({ data: null, error: e }));
        if (writeRes.error) throw writeRes.error;
        if (
          writeRes.data &&
          typeof writeRes.data === 'object' &&
          'path' in writeRes.data &&
          typeof writeRes.data.path === 'string'
        )
          finalPath = writeRes.data.path;
        finalTitle = query;
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        notify({
          error: err instanceof Error ? err : new Error('Creation failed'),
          fallback: 'Failed to create leaf.',
        });
        setIsCreating(false);
        return;
      }
      setIsCreating(false);
    }
    // Pass the exact path without forcing it into a fake `/docs/` URL structure
    await addRemote(finalPath, 'page', a.id, finalTitle);
    setAddMode(null);
    setQuery('');
  };

  const aPathTitle = useMemo(() => {
    if (!a) return '';
    return a.fullTitle || a.title;
  }, [a]);
  if (!tgt) return null;
  return (
    <Dialog
      open={!!tgt}
      onOpenChange={(o) => {
        if (!o) {
          setTgt(null);
          setActive(null);
          setAddMode(null);
          setSelAtts([]);
        }
      }}
    >
      <DialogContent size="xl">
        {/* HEADER */}
        <DialogHeader>
          {a ? (
            <>
              <DialogTitle>
                {tgt.scope !== 'leaf' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Back to target list"
                    onClick={() => {
                      setActive(null);
                      setAddMode(null);
                      setSelAtts([]);
                    }}
                  >
                    <LeftArrowIcon className="size-5 text-primary-11" aria-hidden="true" />
                  </Button>
                )}
                <span className="truncate">{aPathTitle}</span>
                {addMode && (
                  <span className="shrink-0 font-normal text-primary-11">
                    / {addMode === 'select' ? 'Add Attachment' : `Add ${addMode}`}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Manage attachments for {aPathTitle}
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>Manage Attachments — {cTitle(toNodeLabel(tgt.title))}</DialogTitle>
              <DialogDescription>
                Select a target layer or drag and drop attachments to move them between nodes.
              </DialogDescription>
            </>
          )}
        </DialogHeader>
        {/* BODY*/}
        <div
          className="min-h-96 flex-1 overflow-y-auto py-4 outline-none"
          tabIndex={-1}
          onClick={() => {
            setSelAtts([]);
          }}
        >
          {loading || disabled ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner className="size-8 text-primary-10" />
            </div>
          ) : !a ? (
            <div className="flex flex-col gap-6">
              {nodeGroups.map((g, i) => (
                <div key={g.groupTitle + i} className="space-y-3">
                  {nodeGroups.length > 1 && (
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-primary-11">
                      {g.groupTitle}
                    </h4>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.nodes.map((n) => (
                      <Card
                        key={n.id}
                        className="flex h-full flex-col transition-colors hover:border-primary-8 hover:bg-primary-3/30"
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const sPath = e.dataTransfer.getData('application/source-path');
                          const id = e.dataTransfer.getData('application/attachment-id');
                          if (!sPath || !id || sPath === n.id) return;
                          const srcList = atts[sPath] || [];
                          const match = srcList.find((a) => a.id === id);
                          if (!match) return;
                          setAtts((p) => ({
                            ...p,
                            [sPath]: srcList.filter((a) => a.id !== id),
                            [n.id]: [...(p[n.id] || []), match],
                          }));
                          void actions.write.attachment
                            .move({ sourceDocPath: sPath, targetDocPath: n.id, attachmentKey: id })
                            .then(({ error: err }) => {
                              if (err) {
                                setAtts({ ...atts });
                                toast.error('Move failed');
                                notify({
                                  error: new Error(err.message || 'Move failed'),
                                  fallback: 'Failed to relocate attachment relational schema node.',
                                });
                              }
                            });
                        }}
                      >
                        <button
                          type="button"
                          aria-label={`Open ${n.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActive(n);
                          }}
                          className="flex w-full items-center justify-between border-b border-primary-6 bg-primary-3/30 p-3 text-left transition-colors hover:bg-primary-4/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-8"
                        >
                          <p className="flex items-center text-sm font-medium">
                            {n.type === 'Page' ? (
                              <DocumentIcon
                                className="mr-2 size-4 text-primary-10"
                                aria-hidden="true"
                              />
                            ) : (
                              <CatalogIcon
                                className="mr-2 size-4 text-primary-10"
                                aria-hidden="true"
                              />
                            )}
                            {n.title}
                          </p>
                        </button>
                        <div className="flex flex-1 flex-wrap content-start gap-2 p-4">
                          {(atts[n.id] || []).length === 0 ? (
                            <div className="flex h-12 w-full items-center justify-center opacity-50">
                              <UploadIcon className="size-6 text-primary-8" aria-hidden="true" />
                            </div>
                          ) : (
                            (atts[n.id] || []).map((a) => {
                              const isSelected = selAtts.some(
                                (s) => (s.a.id || s.a.path) === (a.id || a.path),
                              );
                              return (
                                <button
                                  key={a.id || a.path}
                                  type="button"
                                  aria-pressed={isSelected}
                                  aria-label={`Select attachment ${a.name}`}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('application/source-path', n.id);
                                    e.dataTransfer.setData('application/attachment-id', a.id || '');
                                    e.dataTransfer.effectAllowed = 'move';
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      toggleSel(e as unknown as React.MouseEvent, n.id, a);
                                    }
                                  }}
                                  onClick={(e) => {
                                    toggleSel(e, n.id, a);
                                  }}
                                  className={cn(
                                    'flex cursor-grab items-center gap-2 rounded-md border px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-8',
                                    isSelected
                                      ? 'border-primary-9 bg-primary-5 ring-1 ring-primary-8'
                                      : 'border-primary-6 bg-primary-3',
                                  )}
                                >
                                  <DocumentIcon
                                    className="size-3 shrink-0 text-primary-10"
                                    aria-hidden="true"
                                  />
                                  <span className="max-w-[100px] truncate">{a.name}</span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {addMode ? (
                <div className="flex flex-col gap-6">
                  {addMode === 'select' ? (
                    <>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        {[
                          { Icon: DocumentIcon, text: 'Page', type: 'page' },
                          { Icon: DocumentIcon, text: 'Document', type: 'document' },
                          { Icon: ImageIcon, text: 'Image', type: 'image' },
                          { Icon: YouTubeIcon, text: 'YouTube', type: 'youtube' },
                          { Icon: LinkIcon, text: 'Website', type: 'website' },
                          { Icon: CatalogIcon, text: 'TsDocs', type: 'tsdocs' },
                          { Icon: BoxIcon, text: 'Other', type: 'other' },
                        ].map(({ Icon: i, text: t, type: v }) => (
                          <button
                            key={t}
                            type="button"
                            aria-label={`Add ${t}`}
                            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-primary-6 bg-transparent p-4 transition-colors hover:border-primary-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddMode(v as AttchType | 'page');
                              setUrl('');
                              setQuery('');
                            }}
                          >
                            <React.Fragment>
                              {React.createElement(i, {
                                className: 'size-5 text-primary-11',
                                'aria-hidden': 'true',
                              })}
                            </React.Fragment>
                            <span className="mt-2 text-sm font-medium text-primary-11">{t}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : addMode === 'page' ? (
                    <div
                      className="flex flex-col gap-4"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <Input
                        autoFocus
                        placeholder="Search or type to create..."
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                        }}
                      />
                      <div className="flex max-h-64 min-h-24 flex-col overflow-y-auto pr-2">
                        {!query.trim() &&
                          tree.map((n) => (
                            <Button
                              key={n.origName}
                              variant="ghost"
                              size="sm"
                              className="mt-0.5 h-auto w-full justify-start py-1.5 pl-6 text-left font-normal text-primary-11 hover:text-primary-12"
                              onClick={() =>
                                void attachPage(
                                  n.type === 'leaf' ? n.path || '' : '',
                                  false,
                                  n.title || n.origName,
                                )
                              }
                            >
                              <span className="truncate">{n.title || n.origName}</span>
                            </Button>
                          ))}
                        {query.trim() && (
                          <div className="flex flex-col gap-1">
                            <Button
                              variant="ghost"
                              className="mb-2 h-auto w-full justify-start border border-dashed border-primary-6 py-2 text-left text-primary-10 hover:border-primary-8 hover:text-primary-12"
                              onClick={() => void attachPage('', true)}
                              disabled={isCreating}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {isCreating ? 'Creating...' : `Create "${query}"`}
                                </span>
                                <span className="text-xs opacity-70">Create page and attach</span>
                              </div>
                            </Button>
                            {filteredLeaves.length > 0 &&
                              filteredLeaves.map((r) => (
                                <Button
                                  key={r.path}
                                  variant="ghost"
                                  className="h-auto w-full justify-start py-2 text-left"
                                  onClick={() => void attachPage(r.path, false, r.title)}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">{r.title}</span>
                                    <span className="text-xs text-primary-11 opacity-70">
                                      {r.breadcrumb ? `${r.breadcrumb} / ${r.path}` : r.path}
                                    </span>
                                  </div>
                                </Button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col gap-4"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      {!['youtube', 'website', 'tsdocs'].includes(addMode) && (
                        <Button
                          variant="outline"
                          className="w-full border-dashed py-8"
                          onClick={() => fileRef.current?.click()}
                        >
                          <UploadIcon className="mr-2 size-5" aria-hidden="true" /> Select Files
                        </Button>
                      )}
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-primary-11">
                          Import via URL
                        </Label>
                        {addMode === 'tsdocs' ? (
                          <TsDocsSelect
                            variant="inline"
                            multiple
                            value={url ? url.split('\n').filter(Boolean) : []}
                            onChange={(v) => {
                              setUrl(Array.isArray(v) ? v.join('\n') : v);
                            }}
                          />
                        ) : (
                          <Textarea
                            autoFocus
                            placeholder="https://..."
                            value={url}
                            onChange={(e) => {
                              setUrl(e.target.value);
                            }}
                            rows={3}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void addRemote(url, addMode, a.id);
                              }
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex min-h-24 flex-wrap content-start gap-3 rounded-md border border-primary-6 bg-primary-2 p-4">
                    {(atts[a.id] || []).length === 0 ? (
                      <Empty variant="compact">No attachments yet.</Empty>
                    ) : (
                      (atts[a.id] || []).map((v) => (
                        <ContextMenu key={v.id || v.path}>
                          <ContextMenuTrigger
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs shadow-sm outline-none transition-colors',
                              selAtts.some((s) => (s.a.id || s.a.path) === (v.id || v.path))
                                ? 'border-primary-9 bg-primary-5 ring-1 ring-primary-8'
                                : 'border-primary-6 bg-primary-3',
                            )}
                            onClick={(e) => {
                              toggleSel(e, a.id, v);
                            }}
                          >
                            <DocumentIcon className="size-3 shrink-0 text-primary-10" />
                            <span className="max-w-[200px] truncate font-medium">{v.name}</span>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <Menu
                              actions={[
                                {
                                  label: 'Copy URL',
                                  icon: <LinkIcon />,
                                  onSelect: () => {
                                    void navigator.clipboard.writeText(
                                      `${window.location.origin}${docsPath(v.path)}`,
                                    );
                                    toast.success('URL copied');
                                  },
                                },
                                ...(v.isMd
                                  ? [
                                      {
                                        icon: <MagicIcon />,
                                        label: 'Synthesize Content',
                                        onSelect: () => {
                                          document.dispatchEvent(
                                            new CustomEvent('docs:synthesize', {
                                              detail: { path: v.path, name: v.name },
                                            }),
                                          );
                                        },
                                      },
                                    ]
                                  : []),
                              ]}
                            />
                          </ContextMenuContent>
                        </ContextMenu>
                      ))
                    )}
                  </div>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  const files = e.currentTarget.files;
                  const tgtPath = a.id;
                  void (async () => {
                    if (!files || files.length === 0 || !tgtPath) return;
                    void runMutation(
                      async () => {
                        const arr = Array.from(files);
                        for (let i = 0; i < arr.length; i++) {
                          const f = arr[i];
                          if (!f) continue;
                          await uploadAssetChunked(f, tgtPath);
                        }
                        await fetchAtts();
                        setAddMode(null);
                        if (fileRef.current) fileRef.current.value = '';
                      },
                      'Upload failed',
                      () => {
                        setLoading(true);
                      },
                      () => {
                        setLoading(false);
                      },
                    );
                  })();
                }}
              />
            </div>
          )}
        </div>
        {/* FOOTER */}
        {/* prettier-ignore */}
        <DialogFooter className='flex shrink-0 items-center justify-end gap-2 pt-4'>
					{a && !addMode && <Button onClick={() => { setAddMode('select'); }}><AddIcon className='mr-2 size-4' aria-hidden='true' /> Add Attachment</Button>}
					{a && addMode === 'select' && <Button variant='ghost' onClick={() => { setAddMode(null); }}>Cancel</Button>}
					{a && addMode === 'page' && <Button variant='ghost' onClick={() => { setAddMode('select'); setQuery(''); }}>Back</Button>}
					{a && addMode && addMode !== 'select' && addMode !== 'page' && (
						<>
							<Button variant='ghost' onClick={() => { setAddMode('select'); }}>Back</Button>
							<Button disabled={!url.trim()} onClick={() => void addRemote(url, addMode, a.id)}>Attach</Button>
						</>
					)}
				</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/*
 * Re-useable structural prompt component.
 *
 * @param props - Prompt title, label, current value, save/cancel callbacks, and disabled state for the reusable input dialog.
 * @param state - State input supplied to prompt dialog's operation.
 * @param setState - State setter for state.
 * @param disabled - Disabled state controlling whether prompt dialog accepts interaction.
 *
 * @return The prompt dialog while prompt state is active, or `null` when it is closed.
 */
