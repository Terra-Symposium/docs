// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/pages/docs/_attachments.tsx
 * Docs attachment collection, uploads, and attachment-specific context menus.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import {
  $surfaceReady,
  $transition,
  clearTransition,
  useAtom,
} from '../../../../lib/terra/docs/state.js';
import { $attachmentFilter } from '../../../../lib/terra/docs/attachments.js';
import { sanitizeName } from '../../../../lib/terra/docs/tree.js';
import { uploadAssetChunked } from '../../../../lib/terra/docs/assets.js';
import { actions } from '../../../../lib/terra/runtime/action-proxy.js';
import {
  cn,
  error as logError,
  errorLog,
  isRec,
  notify,
  warn,
} from '../../../../lib/terra/runtime/runtime.js';
import {
  createElement,
  createElement as __terraQualityCreateElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { currLeafSrc } from '../../../../lib/terra/runtime/leaf.js';
import { dirname, docsPath, isDocsPath } from '../../../../lib/terra/runtime/shared.js';
import { toast } from 'sonner';

// COMPONENTS
import * as TerraQualityRegex from '../../../../lib/terra/regex.mjs';
import {
  ArrowUpRight as PopOutIcon,
  Box as BoxIcon,
  Catalog as CatalogIcon,
  Copy as CopyIcon,
  Doc as DocumentIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  LogoYoutube as YouTubeIcon,
  MagicWand as MagicIcon,
  TrashCan as TrashIcon,
  Upload as UploadIcon,
} from '@carbon/icons-react';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@terra-symposium/styling/ui/terra-original';
import { CodeBlock } from '../../editor/docs/_CodeBlock.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@terra-symposium/styling/ui/terra-original';
import { ErrorBoundary } from '../../ui.js';
import { Empty } from '../../ui.js';
import { Input } from '@terra-symposium/styling/ui/terra-original';
import { Label } from '@terra-symposium/styling/ui/terra-original';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@terra-symposium/styling/ui/terra-original';
import { Textarea } from '@terra-symposium/styling/ui/terra-original';
import { TsDocsSelect } from './_blocks.js';

// DATA
import { ATTCH_TYPES } from '../../../../lib/terra/docs/attachments.js';

// TYPES
import type { AttchType, DocsTreeMenuAction, Sister } from '../../../../lib/terra/runtime/types.js';
import type { Leaf as LeafNode, Tree as TreeType } from '../../../../lib/terra/runtime/types.js';
import type { Md } from '../../../../lib/terra/runtime/types.js';

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Handles latest content.
 *
 * @param content - Docs content whose attachment references should be collected.
 */
const latestContent = (content: unknown): string => {
  try {
    return currLeafSrc(content, '_attachments.latestContent');
  } catch (_err) {
    return typeof content === 'string' ? content : '';
  }
};

/**
 * Handles text asset.
 *
 * @param sis - Attachment records to normalize for the Docs editor.
 */
const textAsset = (sis: Sister): boolean =>
  /\.(?:csv|json|log|md|mdx|text|txt|xml|ya?ml)$/i.test(sis.name || sis.path.split('?')[0] || '');

/*//////////////////////////////////////////////////
COMPONENTS
//////////////////////////////////////////////////*/

/**
 * Renders the document attachment manager for filtering, selecting, uploading, and organizing assets.
 *
 * @param props - The document path and current Docs tree used to scope and display its attachments.
 *
 * @return The attachment manager and its upload, selection, and organization controls.
 */
export function Attachments({ dPath, tree }: { dPath: string; tree: TreeType[] }): JSX.Element {
  // STATES
  const docId = dPath.split('/').filter(Boolean).at(-1) || dPath;
  const attchFilter = useAtom($attachmentFilter);
  const [sisters, setSisters] = useState<Sister[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'select' | AttchType>('select');
  const [urlInput, setUrlInput] = useState('');
  const [renameDlg, setRenameDlg] = useState<{
    open: boolean;
    path: string;
    name: string;
    isMd: boolean;
    id?: string;
  } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [viewDlg, setViewDlg] = useState<Sister | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [transferDlg, setTransferDlg] = useState<{
    open: boolean;
    action: 'copy' | 'cut';
    items: Sister[];
  } | null>(null);
  const [transferTgt, setTransferTgt] = useState<string>('');
  const [transferring, setTransferring] = useState(false);
  const [mergePdfState, setMergePdfState] = useState<{ pdfs: File[]; others: File[] } | null>(null);
  const [ctxAttachment, setCtxAttachment] = useState<{ item: Sister; x: number; y: number } | null>(
    null,
  );
  const ctxMenuRef = useRef<HTMLDivElement | null>(null);
  const sistersMap = useMemo(() => {
    const map = new Map<string, Sister>();
    sisters.forEach((s) => {
      if (s.path) map.set(s.path, s);
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [sisters]);
  const selItems = useMemo(
    () => sel.map((p) => sistersMap.get(p)).filter((s): s is Sister => Boolean(s)),
    [sel, sistersMap],
  );
  useEffect(() => {
    if (!viewDlg) return;
  }, [viewDlg]);

  // PROCESS
  const localLeaves = useMemo(() => {
    let tgts: LeafNode[] = [];
    const groups = [tree];
    while (groups.length > 0) {
      const nodes = groups.pop()!;
      if (nodes.some((n) => n.type === 'leaf' && n.path === dPath)) {
        tgts = nodes.filter((n): n is LeafNode => n.type === 'leaf' && n.path !== dPath);
        break;
      }
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (node?.type === 'branch') groups.push(node.children || []);
      }
    }
    return tgts;
  }, [tree, dPath]);
  const gSisters = useMemo(() => {
    const groups: Partial<Record<AttchType, Sister[]>> = {};
    for (const s of sisters) {
      let cat: AttchType = 'other';
      if (s.type === 'youtube') cat = 'youtube';
      else if (
        s.name.toLowerCase().endsWith('.pdf') ||
        s.path.toLowerCase().split('?')[0].endsWith('.pdf') ||
        s.isMd ||
        s.type === 'document'
      )
        cat = 'document';
      else if (s.type === 'website') cat = 'website';
      else if (s.type === 'tsdocs') cat = 'tsdocs';
      else if (TerraQualityRegex.REGEX_PNG_JPE_G_GIF_WEBP_SVG_AVIF_I_REGEX_2().test(s.name))
        cat = 'image';
      else if (
        s.type &&
        ((val: string): val is AttchType => (ATTCH_TYPES as readonly string[]).includes(val))(
          s.type,
        )
      )
        cat = s.type;
      if (!attchFilter.includes(cat)) continue;
      (groups[cat] ??= []).push(s);
    }
    for (const arr of Object.values(groups)) {
      arr?.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));
    }
    return groups;
  }, [sisters, attchFilter]);

  // SURFACE MOUNT LIFECYCLE
  useEffect(() => {
    $surfaceReady.set(null);
    if (loading) return;
    let a = true;
    setTimeout(() => {
      if (a) $surfaceReady.set('attachments');
    }, 100);
    return () => {
      a = false;
      if ($surfaceReady.get() === 'attachments') $surfaceReady.set(null);
    };
  }, [loading, dPath]);

  // RESOLVE DIRECTORY SISTER FILE ASSETS
  useEffect(() => {
    let a = true;
    setLoading(true);
    if (!dPath) warn('Attachments', 'dPath is empty — no fetch will succeed.');
    actions.read.doc
      .attachments({ path: docId })
      .then(async ({ data: d, error: err }) => {
        if (err) {
          errorLog('Attachments', 'Action returned an error', logError(err));
          return;
        }
        if (!a) return;
        if (!d) {
          warn('Attachments', 'data is null/undefined — setSisters not called.');
          return;
        }
        setSisters(d as Sister[]);
      })
      .catch((_err) => {
        errorLog('Attachments', 'Fetch threw an exception', logError(_err));
      })
      .finally(() => {
        if (a) setLoading(false);
      });
    return () => {
      a = false;
    };
  }, [docId]);

  // ATTACHMENT ACTION HANDLERS
  /**
   * Handles view asset.
   *
   * @param sis - Attachment records being filtered for the active document.
   */
  const viewAsset = async (sis: Sister): Promise<void> => {
    if (!textAsset(sis) || !sis.path.startsWith('http')) {
      setViewDlg(sis);
      return;
    }
    try {
      const res = await fetch(sis.path);
      if (!res.ok) throw new Error(`Attachment preview failed (${res.status}).`);
      setViewDlg({ ...sis, content: await res.text() });
    } catch (err) {
      notify({
        error: err instanceof Error ? err : new Error('Attachment preview failed.'),
        fallback: 'Failed to load attachment preview.',
      });
      setViewDlg(sis);
    }
  };

  /**
   * Handles process upload.
   *
   * @param file - File selected for upload or attachment.
   * @param tempId - Temporary identifier assigned before persistence.
   * @param isMdFile - Whether the file should be treated as Markdown content.
   */
  const processUpload = async (file: File, tempId: string, isMdFile: boolean) => {
    try {
      const finalAsset = await uploadAssetChunked(file, docId, {
        onProgress: ({ currentChunk: currChunk, totalChunks, message: msg }) => {
          if (msg) setSisters((p) => p.map((s) => (s.id === tempId ? { ...s, name: msg } : s)));
          else if (totalChunks > 1)
            setSisters((p) =>
              p.map((s) =>
                s.id === tempId ? { ...s, name: `Uploading (${currChunk}/${totalChunks})...` } : s,
              ),
            );
        },
      });
      setSisters((p) =>
        p.map((s) =>
          s.id === tempId
            ? {
                ...s,
                ...(finalAsset.id ? { id: finalAsset.id } : {}),
                path: finalAsset.path || finalAsset.src || tempId,
                name: finalAsset.name || file.name,
                isMd: isMdFile,
                title: file.name,
              }
            : s,
        ),
      );
    } catch (_err: unknown) {
      errorLog('Attachments:Upload', `Failed '${file.name}'`, logError(_err));
      setSisters((p) => p.filter((s) => s.id !== tempId));
      toast.error(_err instanceof Error ? _err.message : `Failed to upload ${file.name}.`);
      notify({
        error: _err instanceof Error ? _err : new Error('Failed to attach.'),
        fallback: `Failed to upload ${file.name}.`,
      });
    }
  };
  const add = useCallback(
    async (v: FileList | File[] | null) => {
      if ($transition.get() || !v || v.length === 0 || !dPath) return;
      const validFiles: File[] = [];
      const pdfFiles: File[] = [];
      Array.from(v).forEach((f) => {
        validFiles.push(f);
        if (f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf') pdfFiles.push(f);
      });
      if (pdfFiles.length > 1) {
        setMergePdfState({
          pdfs: pdfFiles,
          others: validFiles.filter((f) => !pdfFiles.includes(f)),
        });
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      validFiles.forEach((f, i) => {
        const isMdFile = TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(f.name);
        const tmpId = `temp-${Date.now()}-${i}`;
        setSisters((p) => [...p, { id: tmpId, path: tmpId, name: f.name, isMd: isMdFile }]);
        void processUpload(f, tmpId, isMdFile);
      });
      if (fileRef.current) fileRef.current.value = '';
    },
    [docId],
  );
  const addRemote = useCallback(
    async (v: string, t: AttchType) => {
      setAddDialogOpen(false);
      if ($transition.get() || !dPath || !v.trim()) return;
      const urls = v
        .split(TerraQualityRegex.REGEX_N_S_REGEX())
        .filter((u) =>
          t === 'tsdocs'
            ? u.trim().length > 0
            : u.startsWith('http') || isDocsPath(u) || u.startsWith('/tsdocs'),
        );
      if (!urls.length) return;
      setUploading(true);
      await Promise.allSettled(
        urls.map(async (u, i) => {
          let aType = t;
          if (t === 'other') {
            if (u.toLowerCase().split('?')[0].endsWith('.pdf')) aType = 'document';
            else if (
              TerraQualityRegex.REGEX_PNG_JPE_G_GIF_WEBP_SVG_AVIF_I_REGEX_2().test(
                u.toLowerCase().split('?')[0] ?? '',
              )
            )
              aType = 'image';
          }
          const tmpId = `temp-${aType}-${Date.now()}-${i}`;
          // prettier-ignore
          setSisters(p => [...p, { id: tmpId, path: tmpId, name: 'Loading...', isMd: aType === 'website', title: aType === 'youtube' ? 'Extracting Transcript...' : aType === 'document' ? 'Downloading Document...' : aType === 'tsdocs' ? 'Linking Reference...' : 'Downloading...', type: aType, sourceUrl: u },]);
          try {
            let item: Sister | null = null;
            if (aType === 'youtube') {
              const { data, error } = await actions.write.attachment.youtube({
                path: docId,
                url: u,
              });
              if (error || !data) throw error;
              const { title } = data as { title: string };
              item = {
                id: tmpId,
                path: u,
                name: `${title} Video`,
                isMd: false,
                title,
                type: 'youtube',
                sourceUrl: u,
              };
            } else if (aType === 'website') {
              const { data: webData, error: webErr } = await actions.read.external.website({
                url: u,
              });
              if (webErr || !webData) throw webErr;
              const { title, text } = webData;
              const dir = dirname(dPath);
              const nPath = `${dir === '.' ? '' : `${dir}/`}${sanitizeName(title || 'website')}.mdx`;
              const { data: docData, error: wErr } = await actions.write.doc.editor({
                path: nPath,
                source: text,
                title,
                type: 'website',
                sourceUrl: u,
              });
              if (wErr || !docData) throw wErr;
              item = {
                id: tmpId,
                path: nPath,
                name: nPath.split('/').pop() || '',
                isMd: true,
                title,
                type: 'website',
                sourceUrl: u,
                source: text,
              };
            } else if (aType === 'tsdocs') {
              const fmtUrl = u.startsWith('http')
                ? u
                : u.startsWith('/')
                  ? `${window.location.origin}${u}`
                  : `${window.location.origin}${docsPath(`tsdocs/${u}`)}`;
              const { data: linkData, error: linkErr } = await actions.write.attachment.link({
                path: docId,
                url: fmtUrl,
                type: 'tsdocs',
                title: (
                  u
                    .split('/')
                    .filter(Boolean)
                    .pop()
                    ?.replace(TerraQualityRegex.REGEX_G_REGEX_7(), ' ') || 'TsDocs Reference'
                ).replace(TerraQualityRegex.REGEX_B_W_G_REGEX(), (c) => c.toUpperCase()),
              });
              if (linkErr || !linkData) throw linkErr;
              const { title } = linkData as { title: string; id: string };
              item = {
                id: tmpId,
                path: fmtUrl,
                name: title,
                isMd: false,
                title,
                type: 'tsdocs',
                sourceUrl: fmtUrl,
              };
            } else {
              const { data, error } = await actions.write.attachment.remoteFile({
                path: docId,
                url: u,
                type: aType,
              });
              if (error || !data) throw error;
              const {
                title,
                id,
                path: assetPath,
                name,
              } = data as { title: string; id: string; path: string; name: string };
              item = { id, path: assetPath, name, isMd: false, title, type: aType, sourceUrl: u };
            }
            setSisters((p) => p.map((s) => (s.id === tmpId ? item : s)));
          } catch (_err) {
            setSisters((p) => p.filter((s) => s.id !== tmpId));
            toast.error(`Failed to process ${u}`);
          }
        }),
      );
      setUploading(false);
      clearTransition();
    },
    [docId],
  );
  useEffect(() => {
    /**
     * Handles handle paste.
     *
     * @param e - Input event carrying the selected attachment files.
     */
    const handlePaste = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const text = e.clipboardData?.getData('text');
      if (text) {
        const urls = text
          .split(TerraQualityRegex.REGEX_N_S_REGEX())
          .filter((u) => u.startsWith('http') || isDocsPath(u) || u.startsWith('/tsdocs'));
        if (urls.length > 0) {
          e.preventDefault();
          const ytUrls = urls.filter((u) => u.includes('youtube.com') || u.includes('youtu.be'));
          const refUrls = urls.filter((u) => u.includes('/tsdocs/'));
          const imgUrls = urls.filter((u) =>
            TerraQualityRegex.REGEX_PNG_JPE_G_GIF_WEBP_SVG_AVIF_I_REGEX_2().test(
              u.toLowerCase().split('?')[0] ?? '',
            ),
          );
          const docUrls = [
            ...urls.filter((u) => u.toLowerCase().split('?')[0].endsWith('.pdf')),
            ...urls.filter((u) => u.toLowerCase().split('?')[0].endsWith('.json')),
          ];
          const webUrls = urls.filter(
            (u) =>
              !ytUrls.includes(u) &&
              !refUrls.includes(u) &&
              !docUrls.includes(u) &&
              !imgUrls.includes(u),
          );
          if (ytUrls.length > 0) void addRemote(ytUrls.join('\n'), 'youtube');
          if (refUrls.length > 0) void addRemote(refUrls.join('\n'), 'tsdocs');
          if (docUrls.length > 0) void addRemote(docUrls.join('\n'), 'document');
          if (imgUrls.length > 0) void addRemote(imgUrls.join('\n'), 'image');
          if (webUrls.length > 0) void addRemote(webUrls.join('\n'), 'website');
        }
      }
      if (e.clipboardData?.files?.length) {
        e.preventDefault();
        void add(e.clipboardData.files);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [addRemote, add]);

  /**
   * Handles rename attch.
   *
   * @param nName - Proposed attachment name displayed in the editor.
   */
  const renameAttch = async (nName: string) => {
    if (!renameDlg) return;
    try {
      const { path, name, isMd, id } = renameDlg;
      const nFilename = `${sanitizeName(nName)}${name.match(TerraQualityRegex.REGEX_I_REGEX())?.[0] ?? ''}`;
      const nPath = `${dirname(path) === '.' ? '' : `${dirname(path)}/`}${nFilename}`;
      setSisters((p) =>
        p.map((s) => (s.path === path ? { ...s, path: nPath, name: nFilename } : s)),
      );
      if (isMd) {
        const { error: err } = await actions.write.doc.commit({ cur: path, next: nPath });
        if (err) throw err;
      } else if (id)
        await actions.write.attachment.rename({
          docPath: docId,
          attachmentKey: id,
          newName: nFilename,
        });
      toast.success('Renamed successfully');
    } catch (_err) {
      errorLog('Attachments:Rename', 'Rename failed', logError(_err));
      setSisters((p) =>
        p.map((s) =>
          s.path === renameDlg.path ? { ...s, path: renameDlg.path, name: renameDlg.name } : s,
        ),
      );
      toast.error('Failed to rename attachment');
    } finally {
      setRenameDlg(null);
      setRenameInput('');
    }
  };

  /**
   * Handles remove.
   *
   * @param items - Attachment items rendered by the list.
   */
  const remove = async (items: Sister[]) => {
    if (!window.confirm(`Are you sure you want to delete ${items.length} items?`)) return;
    const itemKeys = new Set(items.flatMap((i) => [i.id, i.path].filter(Boolean)));
    setSisters((p) =>
      p.filter((s) => !(s.id && itemKeys.has(s.id)) && !(s.path && itemKeys.has(s.path))),
    );
    try {
      await Promise.allSettled(
        items.map(async (i) => {
          if (i.isMd) await actions.write.doc.rm({ assets: false, path: i.path, type: 'doc' });
          else if (i.id) {
            await actions.write.attachment.rm({ docPath: docId, attachmentKey: i.id });
            if (i.path.startsWith('http')) await actions.write.asset.delete({ url: i.path });
          }
        }),
      );
      setSel([]);
    } catch (_err) {
      setSisters([...sisters]);
      notify({
        error: _err instanceof Error ? _err : new Error('Deletion failed'),
        fallback: 'Failed to delete some attachments.',
      });
    }
  };

  const isDialogOpen =
    !!mergePdfState ||
    !!viewDlg ||
    (renameDlg?.open ?? false) ||
    (transferDlg?.open ?? false) ||
    addDialogOpen;

  // GLOBAL KEYBOARD SHORTCUTS
  useEffect(() => {
    /**
     * Handles handle key down.
     *
     * @param e - Keyboard event used to operate the attachment panel.
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || uploading || isDialogOpen || selItems.length === 0) return;
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        void remove(selItems);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, uploading, isDialogOpen, selItems]);
  useEffect(() => {
    if (!ctxAttachment) return;
    /**
     * Closes the attachment context menu when the user presses Escape.
     *
     * @param e - Keyboard event checked for the Escape key.
     */
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxAttachment(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [ctxAttachment]);
  useLayoutEffect(() => {
    const menu = ctxMenuRef.current;
    if (!ctxAttachment || !menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const inset = 8;
    const x = Math.max(inset, Math.min(ctxAttachment.x, window.innerWidth - width - inset));
    const y = Math.max(inset, Math.min(ctxAttachment.y, window.innerHeight - height - inset));
    if (x !== ctxAttachment.x || y !== ctxAttachment.y) {
      setCtxAttachment((current) =>
        current?.item.path === ctxAttachment.item.path ? { ...current, x, y } : current,
      );
    }
  }, [ctxAttachment]);
  useEffect(() => {
    /**
     * Opens the attachment context menu for the item under the pointer.
     *
     * @param e - Mouse event used to identify the attachment item and menu position.
     */
    const open = (e: MouseEvent) => {
      const id = (
        e.target instanceof Element
          ? e.target.closest<HTMLElement>('[data-docs-attachment-id]')
          : null
      )?.dataset.docsAttachmentId;
      const item = id ? sistersMap.get(id) : undefined;
      if (
        !(e.target instanceof Element
          ? e.target.closest<HTMLElement>('[data-docs-attachments]')
          : null)
      )
        return;
      e.preventDefault();
      if (item) setCtxAttachment({ item, x: e.clientX, y: e.clientY });
      else setAddDialogOpen(true);
    };
    document.addEventListener('contextmenu', open, true);
    return () => document.removeEventListener('contextmenu', open, true);
  }, [sistersMap]);

  // RENDER
  return (
    <ErrorBoundary name="Attachments">
      <div
        data-docs-attachments
        data-docs-path={dPath}
        data-loading={loading}
        className={cn(
          '-mx-6 -my-40 flex min-h-[calc(100vh+8rem)] flex-col rounded-xl border-2 px-6 pb-40 transition-colors md:-mx-20 md:px-20',
          isDragging ? 'border-primary-8 bg-primary-4/20' : 'border-transparent',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) void add(e.dataTransfer.files);
        }}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            setAddDialogOpen(true);
          }
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSel([]);
        }}
      >
        <div className="flex flex-col gap-8 py-8">
          {loading ? null : Object.keys(gSisters).length === 0 ? (
            <Empty>No attachments found.</Empty>
          ) : (
            ATTCH_TYPES.filter((c) => gSisters[c]).map((c) => (
              <div key={c} className="space-y-4">
                <h3 className="h3 capitalize">{c}</h3>
                <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3">
                  {gSisters[c]!.map((v) => {
                    const isTemp = v.path.startsWith('temp-');
                    return (
                      <Card
                        key={v.id || v.path}
                        data-docs-attachment-id={v.id || v.path}
                        role="button"
                        tabIndex={isTemp ? -1 : 0}
                        aria-disabled={isTemp ? true : undefined}
                        aria-selected={sel.includes(v.path)}
                        aria-label={`Attachment ${v.title || v.name}`}
                        className={cn(
                          'cursor-pointer transition-colors hover:border-primary-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-8',
                          sel.includes(v.path) && 'bg-primary-4/50 ring-2 ring-primary-8',
                          isTemp && 'pointer-events-none opacity-50',
                        )}
                        onKeyDown={(e) => {
                          if (isTemp) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (v.type === 'youtube')
                              setViewDlg({
                                ...v,
                                isMd: true,
                                content: latestContent(v.content) || 'No transcript text found.',
                              });
                            else void viewAsset(v);
                          }
                        }}
                        onClick={(e) => {
                          if (isTemp) return;
                          e.stopPropagation();
                          if (e.shiftKey && sel.length > 0) {
                            const i1 = sisters.findIndex((s) => s.path === sel[sel.length - 1]);
                            const i2 = sisters.findIndex((s) => s.path === v.path);
                            setSel((p) =>
                              Array.from(
                                new Set([
                                  ...(e.metaKey || e.ctrlKey ? p : []),
                                  ...sisters
                                    .slice(Math.min(i1, i2), Math.max(i1, i2) + 1)
                                    .map((s) => s.path),
                                ]),
                              ),
                            );
                          } else if (e.metaKey || e.ctrlKey) {
                            setSel((p) =>
                              p.includes(v.path) ? p.filter((x) => x !== v.path) : [...p, v.path],
                            );
                          } else {
                            if (v.type === 'youtube')
                              setViewDlg({
                                ...v,
                                isMd: true,
                                content: latestContent(v.content) || 'No transcript text found.',
                              });
                            else void viewAsset(v);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setCtxAttachment({ item: v, x: e.clientX, y: e.clientY });
                        }}
                      >
                        <CardHeader>
                          {__terraQualityCreateElement(
                            /* prettier-ignore */ v.type === 'youtube' ? YouTubeIcon : v.type === 'website' ? LinkIcon : v.type === 'image' ? ImageIcon : v.type === 'tsdocs' ? CatalogIcon : v.type === 'other' ? BoxIcon : DocumentIcon,
                            { className: 'size-6 text-primary-10', 'aria-hidden': 'true' },
                          )}
                          <CardTitle className="truncate text-base">{v.title || v.name}</CardTitle>
                          <CardDescription className="truncate">
                            {v.sourceUrl || v.path}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        <input
          data-testid="docs-attachment-upload"
          ref={fileRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => void add(e.currentTarget.files)}
          disabled={uploading || loading}
        />
      </div>
      {ctxAttachment && (
        <div
          ref={ctxMenuRef}
          role="menu"
          data-docs-attachment-menu
          className="fixed z-[120] max-h-[calc(100dvh-1rem)] min-w-32 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-primary-6 bg-white p-1 text-primary-12 shadow-lg dark:bg-black"
          style={{ left: ctxAttachment.x, top: ctxAttachment.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {(
            (sel.includes(ctxAttachment.item.path) && sel.length > 1
              ? [
                  {
                    icon: <CopyIcon />,
                    label: `Copy ${sel.length} items`,
                    onSelect: () => setTransferDlg({ open: true, action: 'copy', items: selItems }),
                  },
                  {
                    icon: <PopOutIcon />,
                    label: `Move ${sel.length} items`,
                    onSelect: () => setTransferDlg({ open: true, action: 'cut', items: selItems }),
                  },
                  ...(selItems.every(
                    (s) =>
                      s.path.toLowerCase().split('?')[0].endsWith('.pdf') ||
                      s.name.toLowerCase().endsWith('.pdf'),
                  )
                    ? [
                        {
                          icon: <DocumentIcon />,
                          label: `Merge ${sel.length} PDFs`,
                          onSelect: () => {
                            void (async () => {
                              if (
                                !window.confirm(`Merge ${selItems.length} PDFs into a single file?`)
                              )
                                return;
                              setUploading(true);
                              const tmpId = `temp-merge-${Date.now()}`;
                              const itemKeys = new Set(
                                selItems.flatMap((i) => [i.id, i.path].filter(Boolean)),
                              );
                              setSisters((p) => [
                                ...p.filter(
                                  (s) =>
                                    !(s.id && itemKeys.has(s.id)) &&
                                    !(s.path && itemKeys.has(s.path)),
                                ),
                                {
                                  id: tmpId,
                                  path: tmpId,
                                  name: 'Merging PDFs...',
                                  isMd: false,
                                  type: 'document',
                                },
                              ]);
                              setSel([]);
                              try {
                                const { PDFDocument } = await import('pdf-lib');
                                const mergedPdf = await PDFDocument.create();
                                for (let i = 0; i < selItems.length; i++) {
                                  const item = selItems[i];
                                  let buf: ArrayBuffer;
                                  if (item?.path.startsWith('http')) {
                                    buf = await (await fetch(item.path)).arrayBuffer();
                                  } else {
                                    const { data, error: err } = await actions.read.asset.get({
                                      path: item?.path || '',
                                    });
                                    if (err || !data)
                                      throw err || new Error('Failed to read local asset');
                                    buf = data;
                                  }
                                  const pdfDoc = await PDFDocument.load(buf);
                                  (
                                    await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices())
                                  ).forEach((p) => mergedPdf.addPage(p));
                                }
                                const mergedFile = new File(
                                  [(await mergedPdf.save()).buffer as ArrayBuffer],
                                  'Merged-Document.pdf',
                                  { type: 'application/pdf' },
                                );
                                setSisters((p) =>
                                  p.map((s) =>
                                    s.id === tmpId ? { ...s, name: 'Uploading Merged PDF...' } : s,
                                  ),
                                );
                                const finalAsset = await uploadAssetChunked(mergedFile, docId, {
                                  onProgress: ({
                                    currentChunk: currChunk,
                                    totalChunks,
                                    message: msg,
                                  }) => {
                                    if (msg)
                                      setSisters((p) =>
                                        p.map((s) => (s.id === tmpId ? { ...s, name: msg } : s)),
                                      );
                                    else if (totalChunks > 1)
                                      setSisters((p) =>
                                        p.map((s) =>
                                          s.id === tmpId
                                            ? {
                                                ...s,
                                                name: `Uploading (${currChunk}/${totalChunks})...`,
                                              }
                                            : s,
                                        ),
                                      );
                                  },
                                });
                                const fPath = finalAsset.path || finalAsset.src || tmpId;
                                setSisters((p) =>
                                  p.map((s) =>
                                    s.id === tmpId
                                      ? {
                                          ...s,
                                          ...(finalAsset.id ? { id: finalAsset.id } : {}),
                                          path: fPath,
                                          name: fPath.split('/').pop() || mergedFile.name,
                                        }
                                      : s,
                                  ),
                                );
                                await Promise.allSettled(
                                  selItems.map(async (i) => {
                                    if (i.isMd)
                                      await actions.write.doc.rm({
                                        assets: false,
                                        path: i.path,
                                        type: 'doc',
                                      });
                                    else if (i.id) {
                                      await actions.write.attachment.rm({
                                        docPath: docId,
                                        attachmentKey: i.id,
                                      });
                                      if (i.path.startsWith('http'))
                                        await actions.write.asset.delete({ url: i.path });
                                    }
                                  }),
                                );
                                toast.success('PDFs merged successfully.');
                              } catch (_err) {
                                errorLog(
                                  'Attachments:Merge',
                                  'Fatal exception caught during PDF merge',
                                  logError(_err),
                                );
                                toast.error('Failed to merge PDFs.');
                                setSisters([...sisters]);
                              } finally {
                                setUploading(false);
                              }
                            })();
                          },
                        },
                      ]
                    : []),
                  { separator: true },
                  {
                    destructive: true,
                    icon: <TrashIcon />,
                    label: `Delete ${sel.length} items`,
                    onSelect: () => void remove(selItems),
                  },
                ]
              : [
                  ...(!ctxAttachment.item.type || ctxAttachment.item.type !== 'youtube'
                    ? [
                        {
                          onSelect: () => {
                            setRenameInput(
                              ctxAttachment.item.name.replace(
                                TerraQualityRegex.REGEX_I_REGEX(),
                                '',
                              ),
                            );
                            setRenameDlg({
                              open: true,
                              path: ctxAttachment.item.path,
                              name: ctxAttachment.item.name,
                              isMd: ctxAttachment.item.isMd || false,
                              id: ctxAttachment.item.id,
                            });
                          },
                          icon: <EditIcon />,
                          label: 'Rename',
                        },
                      ]
                    : []),
                  {
                    icon: <CopyIcon />,
                    label: 'Copy to...',
                    onSelect: () =>
                      setTransferDlg({ open: true, action: 'copy', items: [ctxAttachment.item] }),
                  },
                  {
                    icon: <PopOutIcon />,
                    label: 'Move to...',
                    onSelect: () =>
                      setTransferDlg({ open: true, action: 'cut', items: [ctxAttachment.item] }),
                  },
                  ...(ctxAttachment.item.isMd
                    ? [
                        {
                          onSelect: () =>
                            document.dispatchEvent(
                              new CustomEvent('docs:synthesize', {
                                detail: {
                                  path: ctxAttachment.item.path,
                                  name: ctxAttachment.item.name,
                                },
                              }),
                            ),
                          icon: <MagicIcon />,
                          label: 'Synthesize Content',
                        },
                        ...(!ctxAttachment.item.type || ctxAttachment.item.type !== 'youtube'
                          ? [
                              {
                                icon: <CopyIcon />,
                                label: 'Duplicate',
                                onSelect: () => {
                                  void (async () => {
                                    const path = ctxAttachment.item.path;
                                    if (!path) return;
                                    const name = window.prompt(
                                      'Duplicate file name',
                                      `${path.split('/').at(-1)?.replace(TerraQualityRegex.REGEX_MD_MDX_I_REGEX(), '') ?? ''}-copy`,
                                    );
                                    if (!name) return;
                                    try {
                                      const { data: docData, error: readErr } =
                                        await actions.read.doc.get({ path });
                                      if (readErr || !docData)
                                        throw readErr || new Error('Failed to read doc.');
                                      const nPath = `${dirname(path)}/${sanitizeName(name)}.mdx`;
                                      const { data, error: writeErr } =
                                        await actions.write.doc.save({
                                          path: nPath,
                                          source: (docData as Record<string, unknown>)
                                            .source as string,
                                        });
                                      if (writeErr || !data)
                                        throw writeErr || new Error('Failed to duplicate.');
                                      const duplicateData = data as Record<string, unknown>;
                                      setSisters((p) => [
                                        ...p,
                                        {
                                          path: nPath,
                                          name: nPath.split('/').pop() || '',
                                          isMd: true,
                                          title: duplicateData.title as string,
                                          source: duplicateData.source as string,
                                          type: duplicateData.type as string,
                                          sourceUrl: duplicateData.sourceUrl as string,
                                        },
                                      ]);
                                    } catch (_err: unknown) {
                                      errorLog(
                                        'Attachments:Duplicate',
                                        'Duplicate failed',
                                        logError(_err),
                                      );
                                      notify({
                                        error:
                                          _err instanceof Error
                                            ? _err
                                            : new Error('Failed to duplicate.'),
                                        fallback: 'Failed to duplicate.',
                                      });
                                    }
                                  })();
                                },
                              },
                            ]
                          : []),
                      ]
                    : []),
                  { separator: true },
                  {
                    destructive: true,
                    onSelect: () => void remove([ctxAttachment.item]),
                    icon: <TrashIcon />,
                    label: 'Delete',
                  },
                ]) as DocsTreeMenuAction[]
          ).map((a, i) =>
            a.separator ? (
              <div
                key={`separator-${i}`}
                role="separator"
                className="mx-1.5 my-1 h-px bg-primary-6/50"
              />
            ) : (
              <button
                key={`${a.label}-${i}`}
                type="button"
                role="menuitem"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-3 py-1 text-left text-sm hover:bg-primary-4"
                disabled={a.disabled}
                onClick={() => {
                  setCtxAttachment(null);
                  a.onSelect?.();
                }}
              >
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          if (viewDlg) setViewDlg(null);
          if (renameDlg?.open) {
            setRenameDlg(null);
            setRenameInput('');
          }
          if (transferDlg?.open) setTransferDlg(null);
          if (mergePdfState) setMergePdfState(null);
          if (addDialogOpen) {
            setAddDialogOpen(false);
            setTimeout(() => {
              setDialogMode('select');
              setUrlInput('');
            }, 200);
          }
        }}
      >
        {!!mergePdfState && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Multiple PDFs Selected</DialogTitle>
              <DialogDescription>
                Would you like to merge these {mergePdfState.pdfs.length} PDFs into a single file,
                or upload them separately?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 sm:justify-between">
              <Button
                variant="ghost"
                onClick={() => {
                  [...mergePdfState.pdfs, ...mergePdfState.others].forEach((f, i) => {
                    const isMdFile = TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(f.name);
                    const tmpId = `temp-${Date.now()}-${i}`;
                    setSisters((p) => [
                      ...p,
                      { id: tmpId, path: tmpId, name: f.name, isMd: isMdFile, type: 'document' },
                    ]);
                    void processUpload(f, tmpId, isMdFile);
                  });
                  setMergePdfState(null);
                }}
              >
                Upload Separately
              </Button>
              <Button
                disabled={uploading}
                loading={uploading}
                onClick={async () => {
                  setUploading(true);
                  setMergePdfState(null);
                  try {
                    const { PDFDocument } = await import('pdf-lib');
                    const mergedPdf = await PDFDocument.create();
                    for (let i = 0; i < mergePdfState.pdfs.length; i++) {
                      const pdfDoc = await PDFDocument.load(
                        await mergePdfState.pdfs[i].arrayBuffer(),
                      );
                      (await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices())).forEach((p) =>
                        mergedPdf.addPage(p),
                      );
                    }
                    [
                      new File(
                        [(await mergedPdf.save()).buffer as ArrayBuffer],
                        'Merged-Document.pdf',
                        { type: 'application/pdf' },
                      ),
                      ...mergePdfState.others,
                    ].forEach((f, i) => {
                      const isMdFile = TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(f.name);
                      const tmpId = `temp-${Date.now()}-${i}`;
                      setSisters((p) => [
                        ...p,
                        { id: tmpId, path: tmpId, name: f.name, isMd: isMdFile, type: 'document' },
                      ]);
                      void processUpload(f, tmpId, isMdFile);
                    });
                  } catch (_err) {
                    errorLog(
                      'Attachments:UploadMerge',
                      'Fatal exception caught during PDF merge',
                      logError(_err),
                    );
                    toast.error('Failed to merge PDFs.');
                  } finally {
                    setUploading(false);
                  }
                }}
              >
                Merge to Single PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
        {!!viewDlg && (
          <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>{viewDlg.title || viewDlg.name}</DialogTitle>
              <DialogDescription className="truncate">
                {viewDlg.sourceUrl || viewDlg.path}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto py-4">
              {viewDlg.isMd ? (
                <CodeBlock
                  docsSource
                  code={
                    typeof viewDlg.content === 'string'
                      ? viewDlg.content
                      : latestContent(viewDlg.content) || ''
                  }
                  language="mdx"
                  tone="view"
                  className="my-0 text-xs"
                />
              ) : textAsset(viewDlg) ? (
                <CodeBlock
                  code={typeof viewDlg.content === 'string' ? viewDlg.content : ''}
                  language="text"
                  tone="view"
                  className="my-0 text-xs"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-primary-11">
                  <DocumentIcon className="size-16 opacity-50" aria-hidden="true" />
                  <p>Binary storage entry.</p>
                  {viewDlg.unavailable ? (
                    <p>Source asset is unavailable.</p>
                  ) : (
                    <Button
                      onClick={() => {
                        void (async () => {
                          if (!viewDlg) return;
                          try {
                            if (viewDlg.type === 'tsdocs') {
                              const scopeMatch = viewDlg.path.match(
                                TerraQualityRegex.REGEX_DOCS_TSDOCS_REGEX(),
                              );
                              const scope = scopeMatch ? scopeMatch[1] : viewDlg.path;
                              const { data, error } = await actions.read.tsdocs({ scope });
                              if (!error && data?.docs) {
                                const url = URL.createObjectURL(
                                  new Blob(
                                    [
                                      JSON.stringify(
                                        (Array.isArray(data.docs) ? data.docs : [])
                                          .filter(isRec)
                                          .map((d) => ({
                                            title: d.title,
                                            slug: d.slug,
                                            source: d.body,
                                          })),
                                        null,
                                        2,
                                      ),
                                    ],
                                    { type: 'application/json' },
                                  ),
                                );
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${sanitizeName(scope.replace(TerraQualityRegex.REGEX_G_REGEX_10(), '-'))}.json`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              } else toast.error('Failed to download TSDocs reference.');
                              return;
                            }
                            if (viewDlg.type === 'youtube' || viewDlg.type === 'website') {
                              window.open(viewDlg.sourceUrl || viewDlg.path, '_blank');
                              return;
                            }
                            let dlName = viewDlg.title || viewDlg.name;
                            const extMatch = viewDlg.path
                              .split('?')[0]
                              ?.match(TerraQualityRegex.REGEX_A_Z0_9_I_REGEX());
                            if (
                              extMatch &&
                              !dlName.toLowerCase().endsWith(extMatch[0].toLowerCase())
                            )
                              dlName = `${dlName}${extMatch[0]}`;
                            else if (
                              viewDlg.type === 'document' &&
                              !dlName.toLowerCase().endsWith('.pdf')
                            )
                              dlName = `${dlName}.pdf`;
                            const { data, error } = await actions.read.asset.get({
                              path: viewDlg.path,
                            });
                            if (error || !data) throw error;
                            const url = URL.createObjectURL(
                              new Blob([data], {
                                type:
                                  viewDlg.type === 'document'
                                    ? 'application/pdf'
                                    : 'application/octet-stream',
                              }),
                            );
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = dlName;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          } catch (_err) {
                            toast.error('Failed to download asset.');
                          }
                        })();
                      }}
                    >
                      <DownloadIcon className="mr-2 size-4" /> Download Asset
                    </Button>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setViewDlg(null);
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
        {renameDlg?.open && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rename Attachment</DialogTitle>
              <DialogDescription>
                Assign folder-compliant file identity token string parameters.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                autoFocus
                value={renameInput}
                onChange={(e) => {
                  setRenameInput(e.target.value);
                }}
                onKeyDown={(e) => e.key === 'Enter' && void renameAttch(renameInput)}
              />
            </div>
            {/* prettier-ignore */}
            <DialogFooter>
							<Button variant='ghost' onClick={() => { setRenameDlg(null); }}>Cancel</Button>
							<Button disabled={!renameInput.trim()} onClick={() => void renameAttch(renameInput)}>Rename</Button>
						</DialogFooter>
          </DialogContent>
        )}
        {transferDlg?.open &&
          // prettier-ignore
          <DialogContent className='sm:max-w-md'>
						<DialogHeader>
							<DialogTitle>
								{transferDlg.action === 'copy' ? 'Copy' : 'Move'} Asset
								{transferDlg.items.length > 1 ? 's' : ''}
							</DialogTitle>
							<DialogDescription>Shift structural components between system documents.</DialogDescription>
						</DialogHeader>
						<div className='py-4'>
							<Select value={transferTgt} onValueChange={setTransferTgt}>
								<SelectTrigger aria-label='Select destination page'><SelectValue placeholder='Select destination page' /></SelectTrigger>
								<SelectContent className='max-h-60'>
									<SelectItem value='__new__' className='font-semibold text-primary-11'>✨ Move to new page...</SelectItem>
									{localLeaves.length ? (localLeaves.map(l => (<SelectItem key={l.path} value={l.path!}>{l.title || l.origName}</SelectItem>))) : (<SelectItem value='none' disabled>No target layers found</SelectItem>)}
								</SelectContent>
							</Select>
						</div>
						<DialogFooter>
							<Button variant='ghost' onClick={() => { setTransferDlg(null); }}>Cancel</Button>
							<Button
								disabled={!transferTgt || transferTgt === 'none' || transferring}
								loading={transferring}
								onClick={() => {
									void (async () => {
										if (!transferDlg || !transferTgt || transferTgt === 'none' || transferDlg.items.length === 0) return;
										setTransferring(true);
										try {
											let destPath = transferTgt;
											if (transferTgt === '__new__') {
												const title = window.prompt('Enter a title for the new page:');
												if (!title) {
													setTransferring(false);
													return;
												}
												const dir = dirname(dPath);
												const nPath = `${dir === '.' ? '' : `${dir}/`}${sanitizeName(title)}.mdx`;
										const { data: nDoc, error: createErr } = await actions.write.doc.editor({ path: nPath, title, source: '' });
												if (createErr || !nDoc) throw createErr || new Error('Failed to create new page.');
												destPath = nPath;
											}
											if (transferDlg.action === 'copy') {
												await Promise.allSettled(
													transferDlg.items.map(async i => {
														if (i.isMd) {
														const { data: docData } = await actions.read.doc.get({ path: i.path });
														await actions.write.doc.save({
															path: `${dirname(destPath)}/${`${i.name.replace(TerraQualityRegex.REGEX_I_REGEX(), '')}-copy-${Math.floor(Math.random() * 10000)}${i.name.match(TerraQualityRegex.REGEX_I_REGEX())?.[0] ?? ''}`}`,
															source: (docData as Md).source as string,
														});
													} else if (i.id) {
														await actions.write.attachment.move({ sourceDocPath: docId, targetDocPath: destPath, attachmentKey: i.id });
														await actions.write.attachment.add({ files: [{ name: i.name }], path: destPath });
													}
												}),
												);
											} else {
												await Promise.allSettled(
													transferDlg.items.map(async i => {
														if (i.isMd) {
														const { data: docData } = await actions.read.doc.get({ path: i.path });
														await actions.write.doc.commit({ cur: i.path, next: `${dirname(destPath)}/${i.name}`, source: (docData as Md).source as string });
													} else if (i.id) await actions.write.attachment.move({ sourceDocPath: docId, targetDocPath: destPath, attachmentKey: i.id });
												}),
											);
											const itemKeys = new Set(transferDlg.items.flatMap(i => [i.id, i.path].filter(Boolean)));
											setSisters(p => p.filter(s => !(s.id && itemKeys.has(s.id)) && !(s.path && itemKeys.has(s.path))));
											}
											setSel([]);
											toast.success(`Successfully ${transferDlg.action === 'copy' ? 'copied' : 'moved'} attachments.`);
										} catch (_err) {
											errorLog('Attachments:Transfer', 'Transfer failed', logError(_err));
											toast.error(`Failed to ${transferDlg.action} attachments.`);
										} finally {
											setTransferring(false);
											setTransferDlg(null);
										}
									})();
								}}
							>
								{transferDlg.action === 'copy' ? 'Copy' : 'Move'}
							</Button>
						</DialogFooter>
					</DialogContent>}
        {addDialogOpen && (
          <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-xl">
            {/* prettier-ignore */}
            <DialogHeader>
							{dialogMode === 'select' ? (
								<>
									<DialogTitle>Add Attachment</DialogTitle>
									<DialogDescription>Select attachment category.</DialogDescription>
								</>
							) : (
								<>
									<DialogTitle className='capitalize'>Add {dialogMode}</DialogTitle>
									<DialogDescription>{dialogMode === 'tsdocs' ? 'Select an API reference page or folder to link.' : ['youtube', 'website'].includes(dialogMode) ? `Provide URLs to attach ${dialogMode} content.` : `Upload files or provide URLs to attach remote ${dialogMode}s.`}</DialogDescription>
								</>
							)}
						</DialogHeader>
            <div className="flex-1 overflow-y-auto py-4">
              {dialogMode === 'select' ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {[
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
                      aria-label={`Add ${t} attachment`}
                      className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-primary-6 bg-transparent p-6 text-center transition-colors hover:border-primary-8 hover:bg-primary-3/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-8"
                      onClick={() => {
                        setDialogMode(v as AttchType);
                      }}
                    >
                      {createElement(i, {
                        className: 'size-6 text-primary-11',
                        'aria-hidden': 'true',
                      })}
                      <span className="mt-2 text-sm font-medium text-primary-11">{t}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {!['youtube', 'website', 'tsdocs'].includes(dialogMode) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAddDialogOpen(false);
                        fileRef.current?.click();
                      }}
                    >
                      <UploadIcon className="mr-2 size-5" />
                      Select Files to Upload
                    </Button>
                  )}
                  <div className="space-y-2">
                    <Label>
                      {dialogMode === 'tsdocs'
                        ? 'Select Reference'
                        : !['youtube', 'website'].includes(dialogMode)
                          ? 'Or Import via URL'
                          : 'Import via URL'}
                    </Label>
                    {dialogMode === 'tsdocs' ? (
                      <TsDocsSelect
                        variant="inline"
                        multiple
                        value={urlInput ? urlInput.split('\n').filter(Boolean) : []}
                        onChange={(v: string | string[]) => {
                          setUrlInput(Array.isArray(v) ? v.join('\n') : v);
                        }}
                      />
                    ) : (
                      <Textarea
                        autoFocus
                        placeholder={'https://...\nPaste multiple URLs on new lines'}
                        value={urlInput}
                        onChange={(e) => {
                          setUrlInput(e.target.value);
                        }}
                        rows={4}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void addRemote(urlInput, dialogMode);
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="shrink-0 border-t border-primary-6 pt-4">
              {dialogMode === 'select' ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAddDialogOpen(false);
                  }}
                >
                  Cancel
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDialogMode('select');
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    disabled={!urlInput.trim() || uploading}
                    loading={uploading}
                    onClick={() => void addRemote(urlInput, dialogMode)}
                  >
                    {dialogMode === 'tsdocs' ? 'Attach Reference' : 'Attach URL'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ErrorBoundary>
  );
}

Attachments.displayName = 'DocsAttachments';
