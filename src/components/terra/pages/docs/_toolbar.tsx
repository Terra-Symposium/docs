// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/pages/docs/_toolbar.tsx
 * Shared UI components, toolbars, and context menus for the visual MDX Editor.
 * Folder boundary: editor chrome and commands; document state, block rendering, and navigation remain outside this module.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import {
  $attachmentFilter,
  clearTransition,
  codeViewOf,
  isDocBody,
  setTransition,
  toolbarFocusValue,
  useAtom,
} from './_helpers.js';
import { $createHeadingNode } from '@lexical/rich-text';
import { $createParagraphNode, $getNearestNodeFromDOMNode, $isElementNode } from 'lexical';
import { actions } from '../../runtime/action-proxy.js';
import { docsRootPath } from '../../runtime/shared.js';
import { cn, notify } from '../../runtime/runtime.js';
import { components as repoComponents } from './_custom.js';
import { dirname, toPascal } from '../../runtime/shared.js';
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { stringifyDocBody } from '../../runtime/content.js';
import { toast } from 'sonner';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getDocsHostAdapter } from '../../../../lib/host-runtime.js';

// COMPONENTS
import * as TerraQualityRegex from '../../regex.mjs';
import React from 'react';
import { TextTooltip, TooltipProvider } from '@terra-symposium/styling/ui/terra-original';
import {
  ArrowLeft as LeftArrowIcon,
  ArrowRight as RightArrowIcon,
  ArrowUpRight as PopOutIcon,
  ButtonCentered as FullWordIcon,
  CaretDown as CaretDownIcon,
  CharacterPatterns as ReplaceIcon,
  CharacterSentenceCase as CaseIcon,
  DataShare as ShareIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  ListBulleted as BulletListIcon,
  ListNumbered as NumberListIcon,
  Paste as PasteIcon,
  Redo as RedoIcon,
  RepoSourceCode as ModuleIcon,
  Search as SearchIcon,
  Task as CheckListIcon,
  TextBold as BoldIcon,
  TextFont as TextFontIcon,
  TextItalic as ItalicIcon,
  TextStrikethrough as StrikethroughIcon,
  TextUnderline as UnderlineIcon,
  Undo as UndoIcon,
} from '@carbon/icons-react';
import { Button as UiButton } from '@terra-symposium/styling/ui/terra-original';
import { ButtonGroup } from '@terra-symposium/styling/ui/terra-original';
import { CodeBlock } from '../../editor/docs/_CodeBlock.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@terra-symposium/styling/ui/terra-original';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@terra-symposium/styling/ui/terra-original';
import { EditStateCtx } from './_helpers.js';
import { ErrorBoundary } from '../../runtime/ui.js';
import { Input } from '@terra-symposium/styling/ui/terra-original';
import { Label } from '@terra-symposium/styling/ui/terra-original';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@terra-symposium/styling/ui/terra-original';
import { SearchEmpty } from '@terra-symposium/styling/ui/terra-original';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@terra-symposium/styling/ui/terra-original';
import { Textarea } from '@terra-symposium/styling/ui/terra-original';
import { Toggle } from '@terra-symposium/styling/ui/terra-original';
import { ToggleGroup, ToggleGroupItem } from '@terra-symposium/styling/ui/terra-original';

// DATA
import { ATTCH_TYPES } from './_helpers.js';
import { DOCS_BLOCK_ICONS } from './_icons.js';
import { EMPTY_NODES } from '../../runtime/nodes.js';

// TYPES
import type { AttchType, BlockOpt, MenuTree, RepoComponentWithLabel } from '../../runtime/types.js';
import type { DocBody, DocVer, Md } from '../../runtime/types.js';
import type { EditorToolbarAdapter, PortableEditorBlock } from '../../runtime/types.js';
import type { Mode as ToolbarMode, ToolbarState, Tree } from '../../runtime/types.js';
import type { DocsAttachment } from '../../runtime/types.js';
import type { LexicalEditor, LexicalNode } from 'lexical';
import type { MouseEvent, ReactNode } from 'react';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

const FIND_WORD = String.raw`[\p{L}\p{N}_]`;
const BLIND_REGEX = [
  /<[^>]+>/gu,
  /^[\t ]*(?:#{1,6}|>+|[-+*]|\d+\.)[\t ]*/gmu,
  /:::[^\n]*|===|\|\|\|/gu,
  /[`*_~[\]()]/gu,
  /\s+/gu,
] as const;
const ICON_CLASS = 'size-4 text-primary-11';
const SECONDARY_TEXT_CLASS = 'text-xs text-primary-11';
const MENU_GAP_CLASS = 'gap-2';
const FIELD_GAP_CLASS = 'space-y-1.5';
const MENU_WIDTH_CLASS = 'w-56';

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Handles code offset.
 *
 * @param content - Docs content containing the target block.
 * @param node - Block node being transformed by the toolbar action.
 * @param value - Replacement value supplied by the toolbar control.
 */
const codeOffset = (content: HTMLElement, node: Node, val: number): number => {
  if (!content.contains(node)) return content.innerText.length;
  const range = document.createRange();
  range.selectNodeContents(content);
  range.setEnd(node, val);
  return range.toString().length;
};

/**
 * Derives a clean, human-readable label from a raw filename or URL.
 *
 * @param {string} v - The raw filename or path string.
 * @param {string} fallback - The default label if extraction fails.
 *
 * @return {string} The formatted, capitalized label.
 */
/**
 * Prevents the active selection range from being lost when clicking toolbar buttons.
 *
 * @param {MouseEvent<HTMLElement>} e - The triggered mouse event.
 *
 * @return Nothing; the browser's default mouse action is cancelled so toolbar commands retain the editor selection.
 */
function preserveSel(e: MouseEvent<HTMLElement>): void {
  e.preventDefault();
}

/**
 * Constructs a Regular Expression used to power the Find & Replace feature.
 *
 * @param cfg - Search options controlling markup removal, case sensitivity, the query text, and whole-word matching.
 * @param {boolean} cfg.blind - Whether to ignore markdown syntax.
 * @param {boolean} cfg.case - Whether the search is case-sensitive.
 * @param {string} cfg.find - The string sequence to search for.
 * @param {boolean} cfg.full - Whether to match full words only.
 *
 * @return {RegExp | null} The compiled RegExp object or null if no search term exists.
 */
/**
 * Normalizes a saved document version into its structured body and preview representations.
 *
 * @param ver - Ver input supplied to parse ver body's operation.
 *
 * @return The parsed body, original JSON text, and Markdown preview; empty values are returned when no version is available or parsing fails.
 */
function parseVerBody(ver: DocVer | undefined): { body: DocBody; json: string; markdown: string } {
  if (!ver) return { body: [], json: '', markdown: '' };
  const json = typeof ver.contentJson === 'string' ? ver.contentJson : '';
  if (!json.trim()) return { body: [], json, markdown: '' };
  try {
    const parsed = JSON.parse(json) as unknown;
    const body = isDocBody(parsed) ? parsed : [];
    return { body, json, markdown: stringifyDocBody(body) };
  } catch (_err) {
    console.error('[Toolbar:versions:preview.parseVersionBody.fail]', {
      savedAt: ver.savedAt,
      title: ver.title,
      message: _err instanceof Error ? _err.message : String(_err),
      jsonHead: json.slice(0, 400),
      jsonTail: json.slice(-400),
    });
    return { body: [], json, markdown: '' };
  }
}

/**
 * Detects long JSON-like text that should be treated as structured source rather than ordinary prose.
 *
 * @param val - Source text to check for JSON delimiters and a minimum payload length.
 *
 * @return `true` when the text has JSON-like boundaries and content; otherwise `false`.
 */
function looksLikeJsonBlob(val: string): boolean {
  const v = val.trim();
  // prettier-ignore
  return ['{}', '[]'].some(p => v.startsWith(p[0]) && v.endsWith(p[1])) && v.length > 80;
}

/*//////////////////////////////////////////////////
COMPONENTS
//////////////////////////////////////////////////*/

const Button = React.forwardRef<
  HTMLButtonElement,
  /*
   * Pre-configured micro-button used throughout the toolbar.
   */ Omit<React.ComponentPropsWithoutRef<typeof UiButton>, 'children' | 'size' | 'variant'> & {
    active?: boolean;
    children: ReactNode;
    lbl: string;
    shortcut?: string;
  }
>(function Button(
  {
    children: c,
    className: v,
    disabled: d,
    lbl: l,
    shortcut: s,
    onClick: o,
    onMouseDown: r,
    active: a,
    ...p
  },
  x,
): JSX.Element {
  void a;
  return (
    <TextTooltip content={s ? `${l} (${s})` : l} side="top" align="center" delayDuration={400}>
      <UiButton
        ref={x}
        variant="ghost"
        size="xs"
        aria-label={l}
        disabled={d}
        onClick={o}
        onMouseDown={r}
        className={cn('inline-flex h-6 !p-0.5 shadow-none', v)}
        {...p}
      >
        {c}
      </UiButton>
    </TextTooltip>
  );
});
Button.displayName = 'Button';

/**
 * Mode control for the document viewer, visual editor, and attachment browser.
 *
 * @param props - Current toolbar mode, mode-change callback, edit permission, optional disabled state, and control size.
 * @param {ToolbarMode} props.mode - The active interface mode.
 * @param {Function} props.onModeChange - Callback fired when a new mode is selected.
 * @param {boolean} [props.disabled] - Locks the control.
 * @param {boolean} props.editable - Validates if the user possesses edit warrants.
 *
 * @return {JSX.Element} The Select dropdown for mode switching.
 */
function Mode({
  mode,
  onModeChange,
  disabled,
  editable,
  size = 'xs',
}: {
  mode: ToolbarMode;
  onModeChange: (val: ToolbarMode) => void;
  disabled?: boolean;
  editable: boolean;
  size?: 'sm' | 'xs';
}): JSX.Element {
  void editable;
  return (
    <Select
      size={size}
      disabled={disabled}
      value={mode}
      onValueChange={(v) => {
        const n = (v || 'view') as ToolbarMode;
        if (mode === n) return;
        setTransition(`to-${n}`);
        onModeChange(n);
      }}
    >
      <SelectTrigger className="w-[150px]" aria-label="Mode">
        <SelectValue placeholder="Mode" />
      </SelectTrigger>
      {/* prettier-ignore */}
      <SelectContent align='start'>
				{(editable ? ['view', 'edit', 'attachments'] : ['view', 'attachments'] as ToolbarMode[]).map(o => <SelectItem key={o} value={o}>{o[0].toUpperCase() + o.slice(1)}</SelectItem>)}
			</SelectContent>
    </Select>
  );
}

/**
 * Renders Docs-specific controls beside a content editor toolbar.
 *
 * Formatting and content insertion remain editor-owned; these controls manage
 * the document shell's mode and persistence state.
 *
 * @param props - Docs toolbar state and current mode.
 *
 * @return The mode, history, save, or version actions supported by the active Docs editor toolbar.
 */
const TOOLBAR_COMPONENTS = {
  DocsToolbarActions({
    activeMode: aMode,
    editable,
    size = 'xs',
    toolbar,
  }: {
    activeMode: ToolbarMode;
    editable: boolean;
    size?: 'sm' | 'xs';
    toolbar: ToolbarState | null;
  }): JSX.Element | null {
    const edit = useContext(EditStateCtx);
    const [versions, setVersions] = useState<DocVer[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [selectedVersionId, setSelectedVersionId] = useState('');
    const ready = !!toolbar;
    const selectedVersion = versions.find((v) => v.savedAt === selectedVersionId);
    const preview = useMemo(() => parseVerBody(selectedVersion), [selectedVersion]);
    useEffect(() => {
      let live = true;
      if (!editable || !toolbar?.path || !historyOpen) {
        setVersions([]);
        return;
      }
      const path = toolbar.path;
      const id = path.split('/').pop()?.replace(TerraQualityRegex.REGEX_MDX_I_REGEX(), '') || path;
      void (async (): Promise<void> => {
        try {
          const result = await actions.write.doc.versions.get({ path });
          if (result.error) throw result.error;
          let data = result.data;
          if (Array.isArray(data) && data.length === 0 && path !== id) {
            const fallback = await actions.write.doc.versions.get({ path: id });
            if (fallback.error) throw fallback.error;
            if (Array.isArray(fallback.data) && fallback.data.length > 0) data = fallback.data;
          }
          if (live && Array.isArray(data)) setVersions(data as DocVer[]);
        } catch (err) {
          console.error('[Toolbar:versions] load-failed', { path, error: err });
          toast.error(err instanceof Error ? err.message : 'Failed to load doc versions.');
        }
      })();
      return () => {
        live = false;
      };
    }, [editable, historyOpen, toolbar?.path]);
    useEffect(() => {
      if (historyOpen && !selectedVersionId && versions[0])
        setSelectedVersionId(versions[0].savedAt);
    }, [historyOpen, selectedVersionId, versions]);
    const save = async (e: { preventDefault: () => void }): Promise<void> => {
      e.preventDefault();
      if (!toolbar?.save) return;
      try {
        await toolbar.save();
      } catch (err) {
        console.error('[Docs:save] failed', err);
        toast.error(err instanceof Error ? err.message : 'Unable to save document.');
      }
    };
    useEffect(() => {
      if (aMode === 'view') return;
      const onKeyDown = (e: KeyboardEvent): void => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') void save(e);
      };
      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.removeEventListener('keydown', onKeyDown);
      };
    }, [aMode, toolbar]);
    if (!editable) return null;
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1" data-docs-toolbar-actions>
          <Mode
            editable={editable}
            mode={aMode}
            size={size}
            disabled={!ready}
            onModeChange={(m) => {
              if (!toolbar) return;
              toolbar.setMode(m).catch((e) => {
                console.error('[Toolbar:mode] change-failed', { error: e, mode: m });
                toast.error(e instanceof Error ? e.message : 'Failed to change mode.');
                clearTransition();
              });
            }}
          />
          {aMode !== 'view' && aMode !== 'attachments' && (
            <>
              <ButtonGroup>
                <TextTooltip content="Save (⌘S)" side="top" align="center" delayDuration={400}>
                  <UiButton
                    size={size}
                    disabled={!ready || !(toolbar?.dirty ?? false)}
                    loading={(toolbar?.busy ?? null) === 'saving'}
                    onMouseDown={preserveSel}
                    onClick={(e) => void save(e)}
                  >
                    Save
                  </UiButton>
                </TextTooltip>
                <TextTooltip
                  content="Version History"
                  side="top"
                  align="center"
                  delayDuration={400}
                >
                  <UiButton
                    size={size}
                    className="px-0.5"
                    disabled={!ready}
                    aria-label="Version History"
                    onMouseDown={preserveSel}
                    onClick={() => {
                      if (versions.length > 0 && !selectedVersionId)
                        setSelectedVersionId(versions[0].savedAt);
                      setHistoryOpen(true);
                    }}
                  >
                    <CaretDownIcon />
                  </UiButton>
                </TextTooltip>
                <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Version History</DialogTitle>
                      <DialogDescription className="sr-only">
                        Select a version to preview and restore.
                      </DialogDescription>
                      <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
                        <SelectTrigger className="h-14" aria-label="Select a version">
                          <SelectValue placeholder="Select a version" />
                        </SelectTrigger>
                        <SelectContent>
                          {versions.map((v) => (
                            <SelectItem key={v.savedAt} value={v.savedAt}>
                              <span className="flex flex-col text-left">
                                <span>
                                  {v.title} ({new Date(v.savedAt).toLocaleString()})
                                </span>
                                <span className={SECONDARY_TEXT_CLASS}>{v.description}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <CodeBlock
                        tone="view"
                        language="mdx"
                        docsSource
                        code={preview.markdown.trim() || ' '}
                      />
                    </div>
                    <DialogFooter>
                      <UiButton variant="ghost" onClick={() => setHistoryOpen(false)}>
                        Cancel
                      </UiButton>
                      <UiButton
                        disabled={!selectedVersion}
                        onClick={(): void => {
                          if (!edit || !selectedVersionId) return;
                          edit.update?.({
                            content: preview.body,
                            description: selectedVersion?.description || '',
                            source: preview.markdown,
                            title: selectedVersion?.title || '',
                          });
                          (edit.setCode ?? edit.setSrc)?.(preview.markdown);
                          setHistoryOpen(false);
                          notify({
                            error: null,
                            fallback: 'Restored version to local draft. Save to apply.',
                          });
                        }}
                      >
                        Restore
                      </UiButton>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </ButtonGroup>
            </>
          )}
        </div>
      </TooltipProvider>
    );
  },

  /**
   * Undo and Redo control group dynamically checking CodeMirror depth levels.
   *
   * @param props - Editor mouse handler, disabled state, and optional toolbar adapter used to inspect undo/redo depth.
   * @param {Function} props.onMouseDown - Bound handler guarding focus.
   * @param {boolean} [props.disabled] - Locks the controls.
   * @param adapter - Adapter input supplied to undo's operation.
   *
   * @return {JSX.Element} The paired undo/redo button group.
   */
  Undo({
    onMouseDown,
    disabled,
    adapter,
  }: {
    onMouseDown: (e: MouseEvent<HTMLElement>) => void;
    disabled?: boolean;
    adapter?: EditorToolbarAdapter | undefined;
  }): JSX.Element {
    // STATES
    const [state, setState] = useState<{ redo: boolean; undo: boolean }>({
      redo: false,
      undo: false,
    });

    // INIT
    useEffect(() => {
      let frame = 0;
      /**
       * Handles sync.
       */
      const sync = (): void => {
        const view = codeViewOf();
        const n = view
          ? { redo: redoDepth(view.state) > 0, undo: undoDepth(view.state) > 0 }
          : { redo: false, undo: false };
        setState((c) => (c.undo === n.undo && c.redo === n.redo ? c : n));
      };
      sync();
      /**
       * Handles refresh.
       */
      const refresh = (): void => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(sync);
      };
      (['focusin', 'keyup', 'mouseup'] as const).forEach((e) => {
        document.addEventListener(e, refresh, true);
      });
      return () => {
        cancelAnimationFrame(frame);
        (['focusin', 'keyup', 'mouseup'] as const).forEach((e) => {
          document.removeEventListener(e, refresh, true);
        });
      };
    }, []);

    // RENDER
    return (
      <ButtonGroup>
        {[
          {
            lbl: 'Undo',
            canFire: adapter?.undoable ?? state.undo,
            action: adapter?.undo ?? undo,
            icon: UndoIcon,
            shortcut: '⌘Z',
          },
          {
            lbl: 'Redo',
            canFire: adapter?.redoable ?? state.redo,
            action: adapter?.redo ?? redo,
            icon: RedoIcon,
            shortcut: '⌘Y',
          },
        ].map((b) => (
          <Button
            key={b.lbl}
            lbl={b.lbl}
            shortcut={b.shortcut}
            disabled={disabled || !b.canFire}
            onMouseDown={onMouseDown}
            onClick={() => {
              if (adapter) {
                if (b.lbl === 'Undo') adapter.undo?.();
                else adapter.redo?.();
                return;
              }
              const view = codeViewOf();
              if (!view) return;
              b.action(view);
              view.focus();
            }}
          >
            <b.icon />
          </Button>
        ))}
      </ButtonGroup>
    );
  },

  /**
   * Complex Popover enabling blind/case-sensitive searches and sequential replacement inside active viewports.
   *
   * @param props - Active editing mode and toolbar state used to find text and apply replacements in the current editor.
   * @param {ToolbarMode} props.mode - The active interface mode determining search limits.
   * @param {ToolbarState | null} props.toolbar - System toolbar state reference to execute replacements.
   *
   * @return {JSX.Element | null} The Find and Replace popover or null in view mode.
   */
  FindReplace({
    mode,
    toolbar,
  }: {
    mode: ToolbarMode;
    toolbar: ToolbarState | null;
  }): JSX.Element | null {
    // STATES
    const ref = useRef<HTMLTextAreaElement | null>(null);
    const [cfg, setCfg] = useState({
      blind: false,
      case: false,
      find: '',
      full: false,
      open: false,
      replace: '',
    });
    const [idx, setIdx] = useState(0);
    const [content, setContent] = useState('');

    // INIT
    useEffect(() => {
      if (!cfg.open || !toolbar) return;
      let a = true;
      void toolbar.readSearchText().then((r) => {
        if (a) setContent(r || '');
      });
      return () => {
        a = false;
      };
    }, [cfg.open, cfg.find, toolbar]);

    // PROCESS
    const searchable = useMemo(() => {
      return cfg.blind ? BLIND_REGEX.reduce((a, r) => a.replace(r, ''), content) : content;
    }, [cfg.blind, content]);
    const matcher = useMemo(() => {
      if (!cfg.find) return null;
      const v = cfg.blind ? BLIND_REGEX.reduce((a, r) => a.replace(r, ''), cfg.find) : cfg.find;
      if (!v) return null;
      const body = v.replace(TerraQualityRegex.REGEX_G_REGEX_9(), '\\$&');
      return new RegExp(
        cfg.full ? `(?<!${FIND_WORD})${body}(?!${FIND_WORD})` : body,
        `${cfg.case ? 'g' : 'gi'}u`,
      );
    }, [cfg]);
    const matches = useMemo(
      () =>
        matcher && searchable ? Array.from(searchable.matchAll(matcher), (m) => m.index ?? 0) : [],
      [matcher, searchable],
    );
    const jsonBlocked = looksLikeJsonBlob(cfg.find) || looksLikeJsonBlob(cfg.replace);

    // HELPERS
    /**
     * Handles focus find.
     */
    const focusFind = (): void => {
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.select();
      });
    };
    /**
     * Handles open sel.
     */
    const openSel = (): void => {
      setCfg(
        ((selectedText: string) => (prev: typeof cfg) => ({
          ...prev,
          find: selectedText || prev.find,
          open: true,
        }))(window.getSelection()?.toString().replace(/\r\n?/gu, '\n') ?? ''),
      );
      focusFind();
    };
    /**
     * Handles navigate.
     *
     * @param backward - Whether navigation should move toward the previous item.
     */
    const navigate = (backward = false): void => {
      const browser = window as Window & {
        find?: (
          val: string,
          caseSensitive?: boolean,
          backward?: boolean,
          wrapAround?: boolean,
          wholeWord?: boolean,
          searchInFrames?: boolean,
          showDialog?: boolean,
        ) => boolean;
      };
      const finder = typeof browser.find === 'function' ? browser.find.bind(browser) : null;
      if (cfg.find && !cfg.blind && matches.length)
        setIdx((p) => (p + (backward ? -1 : 1) + matches.length) % matches.length);
      if (cfg.find && !cfg.blind && finder) {
        finder(cfg.find, cfg.case, backward, true, false, true, cfg.full);
        requestAnimationFrame(() => {
          const sel = window.getSelection();
          if (!sel || !sel.rangeCount) return;
          let rect = sel.getRangeAt(0).getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            const codemirrorSel = document.querySelector(
              '.docs-code-block .cm-selectionBackground, .docs-code-block .cm-search-match',
            );
            if (codemirrorSel) rect = codemirrorSel.getBoundingClientRect();
          }
          if (rect.width === 0 && rect.height === 0) return;
          const toolbarEl = document.querySelector('[data-docs-toolbar-frame]');
          const top = toolbarEl ? toolbarEl.getBoundingClientRect().bottom : 60;
          if (rect.top < top + 40) {
            window.scrollBy({ top: rect.top - top - 60, behavior: 'auto' });
          } else if (rect.bottom > window.innerHeight - 40) {
            window.scrollBy({ top: rect.bottom - window.innerHeight + 60, behavior: 'auto' });
          }
        });
      }
    };

    // INIT
    useEffect(() => {
      if (cfg.open) focusFind();
    }, [cfg.open]);
    useEffect(() => {
      setIdx(0);
    }, [cfg.find]);
    useEffect(() => {
      if (!matches.length) {
        setIdx(0);
        return;
      }
      setIdx((p) => Math.min(p, matches.length - 1));
    }, [matches.length]);
    useEffect(() => {
      if (mode === 'view') return;
      /**
       * Handles on key down.
       *
       * @param e - Pointer event received from the toolbar control.
       */
      const onKeyDown = (e: KeyboardEvent): void => {
        if ((e.metaKey || e.ctrlKey) && e.key?.toLowerCase() === 'f') {
          e.preventDefault();
          openSel();
          return;
        }
        if (cfg.open && e.key === 'Enter') {
          e.preventDefault();
          navigate(e.shiftKey);
        }
      };
      document.addEventListener('keydown', onKeyDown, true);
      return () => {
        document.removeEventListener('keydown', onKeyDown, true);
      };
    }, [cfg, mode]);

    // RENDER
    // validation
    if (mode === 'view') return null;
    // component
    return (
      <Popover
        open={cfg.open}
        onOpenChange={(o) => {
          setCfg((p) => ({ ...p, open: o }));
        }}
      >
        {/* TRIGGER */}
        <PopoverTrigger asChild>
          <UiButton
            size="xs"
            variant="ghost"
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={openSel}
          >
            <SearchIcon /> Find
          </UiButton>
        </PopoverTrigger>
        {/* CONTENT*/}
        <PopoverContent align="end" className="w-80 space-y-2">
          {/* query */}
          {[
            { title: 'Find', val: cfg.find, key: 'find', ref, placeholder: 'Search text' },
            { title: 'Replace', val: cfg.replace, key: 'replace', placeholder: 'Replace' },
          ].map((f) => (
            <div key={f.title} className="space-y-1">
              <Label>{f.title}</Label>
              <Textarea
                ref={'ref' in f ? f.ref : undefined}
                value={f.val}
                onChange={(e) => {
                  const inputChange = { field: f.key, value: e.currentTarget?.value ?? '' };
                  setCfg((p) => ({ ...p, [inputChange.field]: inputChange.value }));
                }}
                placeholder={f.placeholder}
                rows={Math.max(2, f.val.split('\n').length)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    navigate(e.shiftKey);
                  }
                }}
              />
            </div>
          ))}
          {/* match */}
          <div className="flex items-center justify-between text-xs text-primary-11">
            <span>
              {' '}
              {cfg.find && (matches.length ? `Result ${idx + 1}/${matches.length}` : 'No matches')}
            </span>
            {cfg.blind && <span>Text only</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { icon: <LeftArrowIcon />, backward: true, lbl: 'Previous match' },
              { icon: <RightArrowIcon />, backward: false, lbl: 'Next match' },
            ].map((b) => (
              <UiButton
                key={String(b.backward)}
                size="xs"
                variant="tonal"
                disabled={!cfg.find || cfg.blind}
                onClick={() => {
                  navigate(b.backward);
                }}
                aria-label={b.lbl}
                title={b.lbl}
              >
                {b.icon}
              </UiButton>
            ))}
            {/* search params */}
            {[
              { key: 'case', title: 'Case sensitive', content: <CaseIcon /> },
              { key: 'full', title: 'Full words', content: <FullWordIcon /> },
              { key: 'blind', title: 'Markdown blind', content: 'Blind' },
            ].map((t) => (
              <Toggle
                key={t.key}
                size="xs"
                variant="tonal"
                aria-label={t.title}
                title={t.title}
                pressed={cfg[t.key as keyof typeof cfg] as boolean}
                onPressedChange={(v) => {
                  setCfg((p) => ({ ...p, [t.key]: v }));
                }}
              >
                {t.content}
              </Toggle>
            ))}
            {/* replace */}
            <UiButton
              size="xs"
              disabled={
                !matches.length || !toolbar || toolbar.busy === 'saving' || cfg.blind || jsonBlocked
              }
              onClick={() => {
                if (jsonBlocked) {
                  toast.error('Paste markdown, not JSON, into find or replace.');
                  return;
                }
                if (matcher && toolbar)
                  toolbar.applySearchText(content.replace(matcher, cfg.replace));
              }}
              aria-label="Replace"
              title="Replace"
            >
              <ReplaceIcon />
            </UiButton>
            {jsonBlocked && <span className="text-red-11 text-xs">JSON input blocked</span>}
          </div>
        </PopoverContent>
      </Popover>
    );
  },

  /**
   * Dropdown dialog facilitating attachment uploads or selecting document attachments natively bound to the leaf.
   *
   * @param props - Icon component, optional insertion callback, selection-preserving mouse handler, disabled state, and attachment context.
   * @param {React.ElementType} props.icon - The base icon to display.
   * @param {Function} [props.insert] - Callback mutating the AST text content natively.
   * @param {Function} props.onMouseDown - Preserves focus bindings.
   * @param {boolean} [props.disabled] - Sets interactability state.
   * @param {string} [props.ctx] - Current physical parent path evaluating available local attachments.
   *
   * @return {JSX.Element} The rendered Uploader dialog button.
   */
  Uploader({
    icon: Icon,
    insert,
    onMouseDown,
    disabled,
    ctx,
  }: {
    icon: React.ElementType;
    insert?: (md: string, rootEnd?: boolean) => void;
    onMouseDown: (e: MouseEvent<HTMLElement>) => void;
    disabled?: boolean;
    ctx?: string;
  }): JSX.Element {
    // STATES
    const [cfg, setCfg] = useState({ busy: false, open: false, attachment: '' });
    const [atts, setAtts] = useState<{ path: string; name: string }[]>([]);
    const [insertMode, setInsertMode] = useState<'embed' | 'link'>('embed');

    // EFFECTS
    useEffect(() => {
      let a = true;
      if (cfg.open && ctx) {
        actions.read.doc
          .attachments({ path: ctx })
          .then(({ data: d }) => {
            // prettier-ignore
            if (a && Array.isArray(d))
						setAtts(
							d
								.filter((a): a is DocsAttachment & { path: string } => Boolean(a && typeof a === 'object' && typeof (a as Record<string, unknown>).path === 'string'))
								.map(a => ({
									path: a.path,
									name: typeof a.name === 'string' ? a.name : a.path.split('/').pop() || 'attachment',
								})),
						);
          })
          .catch((e) => {
            console.error('[Toolbar:attachments] load-failed', { path: ctx, error: e });
            toast.error(e instanceof Error ? e.message : 'Failed to load attachments.');
          });
      }
      return () => {
        a = false;
      };
    }, [cfg.open, ctx]);

    // HELPERS
    /**
     * Handles submit.
     */
    const uploaderActions = {
      reset: useCallback(() => {
        setCfg({ busy: false, open: false, attachment: '' });
        setInsertMode('embed');
      }, []),
      submit: async (): Promise<void> => {
        if (!cfg.attachment || cfg.attachment === 'none' || !insert) return;
        setCfg((p) => ({ ...p, busy: true }));
        try {
          const att = atts.find((a) => a.path === cfg.attachment);
          if (!att) throw new Error('Attachment not found');
          const lbl =
            att.name
              .split('/')
              .pop()
              ?.split('.')[0]
              ?.replace(TerraQualityRegex.REGEX_G_REGEX_7(), ' ')
              .replace(TerraQualityRegex.REGEX_B_W_G_REGEX(), (c) => c.toUpperCase()) ||
            'attachment';
          const c = (att.path.startsWith('http') ? att.path : att.name).replace(
            TerraQualityRegex.REGEX_G_REGEX(),
            '%20',
          );
          let fmt = '';
          if (insertMode === 'link') fmt = `[${lbl}](<${c}>)`;
          else {
            if (TerraQualityRegex.REGEX_PNG_JPE_G_GIF_WEBP_SVG_AVIF_I_REGEX_2().test(att.name))
              fmt = `\n![${lbl}](<${c}>)\n`;
            else fmt = `\n<Embed src="${c}" title="${lbl}" />\n`;
          }
          insert(fmt);
          uploaderActions.reset();
        } catch {
          setCfg((p) => ({ ...p, busy: false }));
        }
      },
    };

    // RENDER
    return (
      <Popover
        open={cfg.open}
        onOpenChange={(o) => {
          if (!o) uploaderActions.reset();
          else setCfg((p) => ({ ...p, open: o }));
        }}
      >
        {/* TRIGGER */}
        <PopoverTrigger asChild>
          <Button disabled={disabled} lbl={'Insert attachment'} onMouseDown={onMouseDown}>
            <Icon />
          </Button>
        </PopoverTrigger>
        {/* POPOVER */}
        <PopoverContent align="start" className="w-80 space-y-4">
          {/* ATTACHMENTS */}
          <div className={FIELD_GAP_CLASS}>
            <Label className={SECONDARY_TEXT_CLASS}>Document Attachments</Label>
            <Select
              value={cfg.attachment}
              onValueChange={(p) => {
                setCfg((v) => ({ ...v, attachment: p }));
              }}
            >
              <SelectTrigger aria-label="Document Attachment">
                <SelectValue placeholder="Select an attachment" />
              </SelectTrigger>
              {/* prettier-ignore */}
              <SelectContent>
							{atts.length === 0 ? (<SelectItem value='none' disabled>No attachments found</SelectItem>
							) : (atts.map(a => (<SelectItem key={a.path} value={a.path}>{a.name}</SelectItem>)))}
						</SelectContent>
            </Select>
          </div>
          {/* FORMAT (EMBED VS LINK) */}
          {/* prettier-ignore */}
          <div className={FIELD_GAP_CLASS}>
					<Label>Format</Label>
					<ToggleGroup type='single' value={insertMode} onValueChange={v => v && setInsertMode(v as 'embed' | 'link')} className='justify-start'>
						{[['embed', 'Visual Embed'], ['link', 'Text Link']].map(([v, l]) => (
							<ToggleGroupItem key={v} value={v} size='sm' className='h-7 px-3 text-xs'>
								{l}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>
          {/* INSERT */}
          <UiButton
            className="w-full"
            disabled={!cfg.attachment || cfg.attachment === 'none' || cfg.busy}
            loading={cfg.busy}
            onClick={() => void uploaderActions.submit()}
          >
            Insert
          </UiButton>
        </PopoverContent>
      </Popover>
    );
  },

  /**
   * Recursive structural map converting component tree branches into native interactive dropdown triggers natively.
   *
   * @param props - Component name, its nested menu tree, and optional callback for copying a selected component into the editor.
   * @param {string} props.name - Branch literal mapping component segment text explicitly.
   * @param {MenuTree} props.tree - Context bounding branch constraints natively.
   * @param {Function} [props.onInsert] - Passed insertion trigger executing AST injections cleanly safely.
   * @param onCopy - Callback invoked for copy.
   *
   * @return {JSX.Element} React rendered menu node explicitly containing nested branches cleanly.
   */
  GlobalComponentMenuNode({
    name,
    tree,
    onCopy,
  }: {
    name: string;
    tree: MenuTree;
    onCopy?: (component: RepoComponentWithLabel) => void;
  }): JSX.Element {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="capitalize">
          {name.replace(TerraQualityRegex.REGEX_G_REGEX_7(), ' ')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {tree.components.map((c) => (
            <DropdownMenuItem
              key={`${c.path}:${c.name}`}
              onMouseDown={preserveSel}
              onSelect={(e) => {
                e.preventDefault();
                onCopy?.(c);
              }}
            >
              {c.displayLabel
                .replace(TerraQualityRegex.REGEX_G_REGEX_7(), ' ')
                .replace(TerraQualityRegex.REGEX_B_W_G_REGEX(), (c) => c.toUpperCase())}
            </DropdownMenuItem>
          ))}
          {Object.entries(tree.folders).map(([f, s]) => (
            <TOOLBAR_COMPONENTS.GlobalComponentMenuNode key={f} name={f} tree={s} onCopy={onCopy} />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  },

  /**
   * Complex unified insertion menu tracking local sister references alongside globally configured repo components.
   *
   * @param props - Mapping parameters defining the interaction boundaries.
   * @param onInsert - Executes JS AST modifications natively by parsing safe import and JSX parameters.
   * @param onInsertMd - Fallback routine injecting pure un-compiled Markdown strings directly into the editor state.
   * @param onMouseDown - Guards boundary constraints reliably to protect CodeMirror/Lexical focus tracking.
   * @param disabled - Sets the interaction scope natively tracking external loading locks cleanly.
   * @param ctx - Physical source directory routing constraints properly evaluating sibling lists and local scope.
   *
   * @return The React JSX Element representing the fully interactive Dropdown and Dialog boundary.
   *
   * @remarks
   * Acts as the primary interface for embedding both local media, external components, and other documents
   * directly into the active MDX editor. It natively handles Sanity ID resolution and AST injection.
   */
  Custom({
    onInsert,
    onInsertMd,
    onMouseDown,
    disabled,
    ctx,
  }: {
    onInsert?: (statement: string, snippet: string) => void;
    onInsertMd?: (md: string, rootEnd?: boolean) => void;
    onMouseDown: (e: MouseEvent<HTMLElement>) => void;
    disabled?: boolean;
    ctx?: string;
  }): JSX.Element {
    // STATES
    const [sis, setSis] = useState<{ path: string; name: string }[]>([]);
    const [search, setSearch] = useState({
      open: false,
      query: '',
      tree: [] as Tree[],
      busy: false,
    });
    const savedSel = useRef<Range | null>(null);
    const copyLock = useRef<string | null>(null);

    // 1. FETCH LOCAL FILES (Allows ALL leaves as valid attachments)
    useEffect(() => {
      if (!ctx) return;
      const dir = dirname(
        TerraQualityRegex.REGEX_INDEX_MD_MDX_I_REGEX_2().test(ctx.split('/').pop() || '')
          ? dirname(ctx)
          : ctx,
      );
      actions.read.doc
        .list({ type: 'folderEntries', path: dir })
        .then(({ data: d }) => {
          // prettier-ignore
          if (Array.isArray(d)) setSis(d.filter((p: string) => p !== ctx && dirname(p) === dir && /\.(md|mdx|astro|tsx)$/i.test(p.split('/').pop() || '')).map((p: string) => ({ path: p, name: p.split('/').pop() || '' })));
        })
        .catch((e) => {
          console.error('[Toolbar:insert.load-failed]', { path: dir, error: e });
          toast.error(e instanceof Error ? e.message : 'Failed to load insert targets.');
        });
    }, [ctx]);

    // 2. BUILD GLOBAL COMPONENT TREE
    const componentTree = useMemo(() => {
      const root: MenuTree = { components: [], folders: {} };
      const counts = new Map<string, number>();
      repoComponents.forEach((c) => counts.set(c.path, (counts.get(c.path) ?? 0) + 1));
      repoComponents.forEach((c) => {
        const parts = c.path.split('/_custom/');
        if (parts.length <= 1) {
          root.components.push({ ...c, displayLabel: c.name });
          return;
        }
        const segs = parts[1]!.split('/');
        const file = segs.pop()!.replace(TerraQualityRegex.REGEX_PATTERN_REGEX(), '');
        if (file !== 'index' && (counts.get(c.path) ?? 0) > 1) segs.push(file);
        let cur = root;
        segs.forEach((s) => {
          cur = cur.folders[s] ??= { components: [], folders: {} };
        });
        // prettier-ignore
        cur.components.push({ ...c, displayLabel: c.name });
      });
      return root;
    }, []);
    const copyComponent = useCallback(
      async (c: RepoComponentWithLabel): Promise<void> => {
        if (onInsert) {
          onInsert(`import ${c.name} from '${c.path}';`, c.clipboardValue ?? `<${c.name} />`);
          return;
        }
        const text = c.clipboardValue ?? `<${c.name} />`;
        const key = `${c.path}:${c.name}`;
        if (copyLock.current === key) return;
        copyLock.current = key;
        try {
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            const fallback = document.createElement('textarea');
            fallback.value = text;
            fallback.setAttribute('readonly', 'true');
            fallback.style.position = 'fixed';
            fallback.style.opacity = '0';
            document.body.appendChild(fallback);
            fallback.select();
            if (!document.execCommand('copy')) {
              fallback.remove();
              throw new Error('Clipboard write failed');
            }
            fallback.remove();
          }
          window.setTimeout(() => toast.success('Copied to clipboard', { duration: 4000 }), 0);
        } catch (_err) {
          toast.error('Failed to copy to clipboard');
        } finally {
          window.setTimeout(() => {
            if (copyLock.current === key) copyLock.current = null;
          }, 0);
        }
      },
      [onInsert],
    );

    // 3. FETCH FULL DOC TREE FOR SEARCH/BROWSE
    useEffect(() => {
      if (!search.open) return;
      let a = true;
      if (search.tree.length === 0) {
        setSearch((s) => ({ ...s, busy: true }));
        actions.read.doc
          .list({ type: 'nav', pathname: docsRootPath() })
          .then(({ data: d }) => {
            if (a)
              setSearch((s) => ({
                ...s,
                tree: Array.isArray(d)
                  ? d.filter((n): n is Tree => Boolean(n && typeof n === 'object' && 'type' in n))
                  : [],
                busy: false,
              }));
          })
          .catch((_err) => {
            console.error(`[Toolbar:Embed] Failed to fetch document tree:`, _err);
            if (a) setSearch((s) => ({ ...s, busy: false }));
          });
      }
      return () => {
        a = false;
      };
    }, [search.open]);

    // 4. FILTER LEAVES ON QUERY (Returns all leaves when query is empty)
    const filteredLeaves = useMemo(() => {
      const leaves: { path: string; title: string; breadcrumb: string }[] = [];
      // Track seen paths to prevent duplicate React key warnings when the nav tree
      // contains the same node referenced from multiple locations.
      const seen = new Set<string>();
      const lowerQuery = search.query.trim().toLowerCase();
      const searchFrames: { nodes: Tree[]; index: number; path: string }[] = [
        { nodes: search.tree, index: 0, path: '' },
      ];
      while (searchFrames.length) {
        const frame = searchFrames[searchFrames.length - 1];
        if (!frame) break;
        if (frame.index >= frame.nodes.length) {
          searchFrames.pop();
          continue;
        }
        const n = frame.nodes[frame.index];
        frame.index += 1;
        const currTitle = n.title || n.origName || 'Untitled';
        if (n.type === 'leaf') {
          const nodePath = n.path;
          if (typeof nodePath !== 'string' || seen.has(nodePath)) continue;
          if (
            !lowerQuery ||
            (typeof currTitle === 'string' ? currTitle.toLowerCase() : '').includes(lowerQuery) ||
            (n.path && typeof n.path === 'string' ? n.path.toLowerCase() : '').includes(lowerQuery)
          ) {
            seen.add(nodePath);
            leaves.push({ path: nodePath, title: currTitle, breadcrumb: frame.path });
          }
        } else if (n.type === 'branch' && n.children) {
          searchFrames.push({
            nodes: n.children,
            index: 0,
            path: frame.path ? `${frame.path} / ${currTitle}` : currTitle,
          });
        }
      }
      return leaves;
    }, [search.query, search.tree]);

    // 5. EMBED OR CREATE LEAF
    /**
     * Handles embed.
     *
     * @param targetPath - Destination path for the moved or renamed document.
     * @param isNew - Whether the destination represents a newly created document.
     */
    const embed = async (tgtPath: string, isNew = false) => {
      let finalPath = tgtPath;
      let leafId = tgtPath;
      // 1. Close Modal immediately to prevent multiple submissions
      setSearch((s) => ({ ...s, open: false, busy: true }));
      setTransition('p');
      try {
        if (isNew) {
          // scope the new document natively UNDER the current document's path.
          // this ensures string-based `verifyWrite` auth checks pass by matching the prefix of the inherited warrant.
          const basePath = ctx ? ctx.replace(TerraQualityRegex.REGEX_PATTERN_REGEX_2(), '') : '';
          const sName = search.query.trim()
            ? search.query.replace(TerraQualityRegex.REGEX_A_Z0_9_GI_REGEX_2(), '-').toLowerCase()
            : 'untitled';
          const nId = basePath
            ? `${basePath}/${sName}-${Date.now()}.mdx`
            : `${sName}-${Date.now()}.mdx`;
          finalPath = nId;
          // create the page purely as a stand-alone document without anchoring to the group
          const writeRes = await actions.write.doc
            .editor({ path: nId, title: search.query, source: 'This page is empty.' })
            .catch((_err) => ({ data: null, error: _err }));
          if (writeRes.error) {
            console.error(`[Toolbar:Embed] write.doc.editor action failed:`, writeRes.error);
            throw writeRes.error;
          }
          finalPath = (writeRes.data as Md)?.path || finalPath;
        }
        // map leaf explicitly to the editor's attachment array unconditionally
        if (ctx) {
          const attRes = await actions.write.attachment
            .docRef({ path: ctx, refId: finalPath, title: search.query || 'Embedded Page' })
            .catch((_err) => {
              console.error(`[Toolbar:Embed] write.attachment.docRef action failed:`, _err);
              return { data: null, error: _err };
            });
          if (attRes && attRes.data) {
            // Resolves the exact Sanity UUID returned to map directly into the React AST parameter
            const attachment = {
              leafId:
                typeof attRes.data === 'object' &&
                'refId' in attRes.data &&
                typeof attRes.data.refId === 'string'
                  ? attRes.data.refId
                  : leafId,
              sister: { path: finalPath, name: finalPath.split('/').pop() || finalPath },
            };
            leafId = attachment.leafId;
            setSis((p) => {
              if (!p.some((s) => s.path === finalPath)) return [...p, attachment.sister];
              return p;
            });
          }
        }
        // delay AST injection to allow Sanity CDN replica propagation to finish
        if (isNew || ctx) await new Promise((r) => setTimeout(r, 1500));
        clearTransition();
        // 2. Yield to event loop to allow DOM reconciliation
        await new Promise((r) => setTimeout(r, 200));
        // 3. Force focus back into the active editor securely
        const aEditor = document.querySelector<HTMLElement>(
          '[contenteditable="true"], .cm-content',
        );
        if (aEditor) {
          aEditor.focus({ preventScroll: true });
          const sel = window.getSelection();
          if (sel && savedSel.current) {
            sel.removeAllRanges();
            sel.addRange(savedSel.current);
            savedSel.current = null; // clear after use
          } else if (!sel || sel.rangeCount === 0) {
            try {
              const range = document.createRange();
              range.selectNodeContents(aEditor);
              range.collapse(false);
              sel?.removeAllRanges();
              sel?.addRange(range);
            } catch {
              // Selection restoration is best effort.
            }
          }
        }
        // clean up busy state and search query now that injection is ready
        setSearch((s) => ({ ...s, query: '', busy: false }));
        await new Promise((r) => requestAnimationFrame(r));
        // 4. Inject purely as AST text (bypassing the import statement injection)
        // This mirrors how globally configured components like <Nodes /> and <DocsMath /> are inserted.
        if (onInsertMd) {
          try {
            onInsertMd(`\n\n<Leaf id="${leafId}" />\n\n`);
          } catch (_err) {
            console.error(`[Toolbar:Embed] Exception thrown during onInsertMd AST mutation:`, _err);
          }
        } else
          console.error(`[Toolbar:Embed] onInsertMd callback is MISSING. Aborting AST injection.`);
      } catch (_err) {
        clearTransition();
        console.error(`[Toolbar:Embed] Critical pipeline failure during leaf embed process:`, _err);
        notify({
          error: _err instanceof Error ? _err : new Error('Embed failed'),
          fallback: 'Failed to embed leaf.',
        });
        setSearch((s) => ({ ...s, query: '', busy: false }));
      }
    };

    // 6. LOCAL MENUS
    // prettier-ignore
    const menuGroups = {
			globalComponents: componentTree.components,
			globalFolders: componentTree.folders,
			local: [
		{
			label: 'Copy attachments',
			icon: <PasteIcon className={ICON_CLASS} />,
			items: sis,
						onSelect: (s: { path: string }) =>
				actions.read.doc
					.get({ path: s.path })
					.then(({ data: d }) => onInsertMd?.(`\n${(d as Md)?.source || ''}\n`))
					.catch(e => {
						console.error('[Toolbar:insert.partial-load-failed]', { path: s.path, error: e });
						toast.error(e instanceof Error ? e.message : 'Failed to load partial.');
					}),
		},
		{
			label: 'Share attachment',
			icon: <ShareIcon className={ICON_CLASS} />,
			items: sis.filter(s => TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(s.name)),
						onSelect: (s: { name: string }) => {
				const importName = toPascal(s.name.replace(TerraQualityRegex.REGEX_PATTERN_REGEX(), ''));
				onInsert?.(`import ${importName} from '${TerraQualityRegex.REGEX_INDEX_MD_MDX_I_REGEX_2().test(ctx?.split('/').pop() || '') ? '../' : './'}${s.name}';`, `<${importName} />\n`);
			},
		},
			],
		};
    return (
      <>
        <DropdownMenu>
          {/* TRIGGER */}
          <DropdownMenuTrigger asChild>
            <Button disabled={disabled} lbl="Insert component" onMouseDown={onMouseDown}>
              <DOCS_BLOCK_ICONS.code />
            </Button>
          </DropdownMenuTrigger>
          {/* DROPDOWN MENU */}
          <DropdownMenuContent align="start" className={MENU_WIDTH_CLASS}>
            <DropdownMenuItem
              onMouseDown={preserveSel}
              onSelect={(e) => {
                e.preventDefault();
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) savedSel.current = sel.getRangeAt(0).cloneRange();
                setSearch((s) => ({ ...s, open: true }));
              }}
              className={MENU_GAP_CLASS}
            >
              <PopOutIcon className={ICON_CLASS} /> Embed Page
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={MENU_GAP_CLASS}>
                <ModuleIcon className={ICON_CLASS} /> Modules
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={MENU_WIDTH_CLASS}>
                {menuGroups.globalComponents.map((c) => (
                  <DropdownMenuItem
                    key={c.path}
                    onMouseDown={preserveSel}
                    onSelect={(e) => {
                      e.preventDefault();
                      void copyComponent(c);
                    }}
                  >
                    {c.displayLabel
                      .replace(TerraQualityRegex.REGEX_G_REGEX_7(), ' ')
                      .replace(TerraQualityRegex.REGEX_B_W_G_REGEX(), (c) => c.toUpperCase())}
                  </DropdownMenuItem>
                ))}
                {Object.entries(menuGroups.globalFolders).map(([f, s]) => (
                  <TOOLBAR_COMPONENTS.GlobalComponentMenuNode
                    key={f}
                    name={f}
                    tree={s}
                    onCopy={copyComponent}
                  />
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {menuGroups.local.map((m) => (
              <React.Fragment key={m.label}>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={!m.items.length} className={MENU_GAP_CLASS}>
                    {m.icon} {m.label}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {m.items.map((s) => (
                      <DropdownMenuItem
                        key={s.path}
                        onMouseDown={preserveSel}
                        onSelect={(e) => {
                          e.preventDefault();
                          m.onSelect(s);
                        }}
                      >
                        {s.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* CUSOM DIALOG */}
        <Dialog
          open={search.open}
          onOpenChange={(o) => {
            setSearch((s) => ({ ...s, open: o }));
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Embed Document</DialogTitle>
              <DialogDescription className="sr-only">
                Browse the document tree or search to embed a page.
              </DialogDescription>
            </DialogHeader>
            {/* prettier-ignore */}
            <div className='space-y-4 pt-2'>
						<Input icon={<SearchIcon className={ICON_CLASS} />} autoFocus placeholder='Search or type to create...' value={search.query} onChange={e => { setSearch(s => ({ ...s, query: e.target.value })); }} />
						<div className='flex max-h-64 min-h-24 flex-col gap-1 overflow-y-auto pr-2'>
							{search.busy && search.tree.length === 0 && <p className='py-4 text-center text-sm text-primary-11'>Loading...</p>}
							{search.query.trim() && (
								<UiButton variant='outline' className='mb-2 flex-col items-start gap-y-0 border-dashed py-6' onClick={() => void embed('', true)} disabled={search.busy}>
									<span className='text-sm font-medium'>{search.busy ? 'Creating...' : `Create "${search.query}"`}</span>
									<span className={SECONDARY_TEXT_CLASS}>Create page and embed as attachment</span>
								</UiButton>
							)}
							{search.query.trim() && !search.busy && filteredLeaves.length === 0 && <SearchEmpty query={search.query} />}
							{filteredLeaves.map(l => (
								<UiButton key={l.path} variant='ghost' className='flex-col items-start gap-y-0 py-6' onClick={() => embed(l.path)}>
									<span className='text-sm font-medium capitalize'>{l.title}</span>
									<span className={SECONDARY_TEXT_CLASS}>{l.breadcrumb ? `${l.breadcrumb} / ` : ''}{l.title}</span>
								</UiButton>
							))}
						</div>
					</div>
          </DialogContent>
        </Dialog>
      </>
    );
  },

  /**
   * Dropdown control for quickly converting a block or inserting a supported block template.
   *
   * @param props - Disabled state, toolbar context, optional editor adapter, available block options, and JSON mode for the block selector.
   * @param {object} - Value passed to the helper.
   * @param {boolean} [props.disabled] - Locks the control.
   * @param {ToolbarState | null} props.toolbar - System toolbar state reference to execute replacements.
   * @param {BlockOpt[]} props.options - Select actions with icon prefixes.
   * @param adapter - Adapter input supplied to block type's operation.
   * @param json - Json input supplied to block type's operation.
   *
   * @return {JSX.Element} The Select dropdown block wrapper.
   */
  BlockType({
    disabled,
    toolbar,
    adapter,
    options: opts,
    json = false,
  }: {
    disabled?: boolean;
    toolbar: ToolbarState | null;
    adapter?: EditorToolbarAdapter | undefined;
    options: BlockOpt[];
    json?: boolean;
  }): JSX.Element {
    // STATES
    const [val, setVal] = useState('p');
    // refs to persist the last known location of the user's cursor
    const savedBlock = useRef<HTMLElement | null>(null);

    // INIT
    useEffect(() => {
      let frame = 0;
      if (disabled || !toolbar) return;
      /**
       * Synchronizes the current view state with the source data.
       *
       */
      const sync = (): void => {
        const view = codeViewOf();
        // 1. Visual Mode (Lexical) - Read from DOM selection safely
        if (!view || view.dom.offsetParent === null) {
          const sel = window.getSelection();
          const blockCursor = document.querySelector<HTMLElement>(
            '[data-docs-block-cursor="true"]',
          );
          if (blockCursor && sel?.anchorNode && !blockCursor.contains(sel.anchorNode)) {
            const blockVal = toolbarFocusValue(
              blockCursor,
              opts.map((o) => o.value),
            );
            if (blockVal) {
              setVal((c) => (c === blockVal ? c : blockVal));
              return;
            }
          }
          // Only update the saved reference if the selection is actively inside the editor.
          // This prevents the dropdown click from overwriting the last known cursor location.
          if (sel && sel.rangeCount > 0 && sel.anchorNode) {
            const node = sel.anchorNode;
            const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
            if (el?.closest('.mdxeditor-root, [contenteditable="true"]')) {
              const textBlock = el?.closest('h1, h2, h3, h4, h5, h6, p') as HTMLElement | null;
              if (textBlock) savedBlock.current = textBlock;
              else if (
                el
                  ?.closest('td, th')
                  ?.closest('[data-docs-editor-block="DocsTable"], [data-terra-block="table"]')
              )
                savedBlock.current = null;
              const blockVal = el
                ? toolbarFocusValue(
                    el,
                    opts.map((o) => o.value),
                  )
                : null;
              if (blockVal) {
                setVal((c) => (c === blockVal ? c : blockVal));
                return;
              }
            }
          }
          return;
        }
        // A focused rich code block uses CodeMirror for its own content.
        const { head } = view.state.selection.main;
        const text = view.state.doc.lineAt(head).text;
        let n = 'p';
        if (TerraQualityRegex.REGEX_S_REGEX_5().test(text)) n = 'h3';
        else if (TerraQualityRegex.REGEX_S_REGEX_6().test(text)) n = 'h4';
        else if (TerraQualityRegex.REGEX_S_REGEX_4().test(text)) n = 'h2';
        setVal((c) => (c === n ? c : n));
      };
      sync();
      /**
       * Handles refresh.
       */
      const refresh = (): void => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(sync);
      };
      /**
       * Handles on block select.
       *
       * @param e - Change event received from the toolbar input.
       */
      const onBlockSelect = (e: Event): void => {
        const { block: selBlock, decorator } =
          (e as CustomEvent<{ block?: unknown; decorator?: unknown }>).detail ?? {};
        const block =
          selBlock instanceof HTMLElement
            ? selBlock
            : decorator instanceof HTMLElement
              ? decorator.querySelector<HTMLElement>(
                  '[data-docs-editor-block], .docs-math-wrapper, [data-math-code], [data-docs-view-root="true"]',
                )
              : null;
        const blockVal = block
          ? toolbarFocusValue(
              block,
              opts.map((o) => o.value),
            )
          : null;
        if (!blockVal) return;
        savedBlock.current = null;
        setVal((c) => (c === blockVal ? c : blockVal));
      };
      (['focusin', 'keyup', 'mouseup', 'selectionchange'] as const).forEach((e) => {
        document.addEventListener(e, refresh, true);
      });
      document.addEventListener('docs:block-select', onBlockSelect);
      document.addEventListener('docs:block-selected', onBlockSelect);
      return () => {
        cancelAnimationFrame(frame);
        (['focusin', 'keyup', 'mouseup', 'selectionchange'] as const).forEach((e) => {
          document.removeEventListener(e, refresh, true);
        });
        document.removeEventListener('docs:block-select', onBlockSelect);
        document.removeEventListener('docs:block-selected', onBlockSelect);
      };
    }, [disabled, toolbar]);

    // RENDER
    return (
      <Select
        disabled={disabled || !toolbar}
        value={val}
        onValueChange={(v) => {
          const item = opts.find((i) => i.value === v);
          if (!item) return;
          if (item.group === 'type') {
            if (json) {
              window.dispatchEvent(
                new CustomEvent('docs:json-command', {
                  detail: { type: 'style', style: v === 'p' ? 'normal' : v },
                }),
              );
              setVal(v);
              return;
            }
            if (adapter?.setBlockType) {
              adapter.setBlockType(v as 'paragraph' | 'h2' | 'h3' | 'h4');
              setVal(v);
              return;
            }
            const view = codeViewOf();
            if (view && view.dom.offsetParent !== null) {
              const { head } = view.state.selection.main;
              const line = view.state.doc.lineAt(head);
              const text = line.text;
              let n: string;
              let prefix = '';
              if (v === 'h2') {
                prefix = '## ';
                n = text.replace(TerraQualityRegex.REGEX_S_REGEX_4(), '').trimStart() || 'Heading';
              } else if (v === 'h3') {
                prefix = '### ';
                n = text.replace(TerraQualityRegex.REGEX_S_REGEX_5(), '').trimStart() || 'Heading';
              } else if (v === 'h4') {
                prefix = '#### ';
                n = text.replace(TerraQualityRegex.REGEX_S_REGEX_6(), '').trimStart() || 'Heading';
              } else n = text.replace(/^#{1,6}\s+/, '').trimStart() || 'Text';
              const replacementStr = `${prefix}${n}`;
              view.dispatch({
                changes: { from: line.from, to: line.to, insert: replacementStr },
                selection: { anchor: line.from + replacementStr.length },
              });
              view.focus();
              setVal(v);
              return;
            }
            try {
              if (savedBlock.current) {
                const editor = (
                  savedBlock.current.closest<HTMLElement>('[contenteditable="true"]') as
                    (HTMLElement & { __lexicalEditor?: LexicalEditor }) | null
                )?.__lexicalEditor;
                if (editor) {
                  editor.update(() => {
                    const lexicalNode = $getNearestNodeFromDOMNode(savedBlock.current!);
                    if (lexicalNode) {
                      let blockNode: LexicalNode | null = lexicalNode;
                      while (blockNode && !$isElementNode(blockNode))
                        blockNode = blockNode.getParent();
                      if (blockNode && $isElementNode(blockNode)) {
                        let replacementNode;
                        if (v === 'p') replacementNode = $createParagraphNode();
                        else if (v === 'h2' || v === 'h3' || v === 'h4')
                          replacementNode = $createHeadingNode(v);
                        if (replacementNode) {
                          blockNode.getChildren().forEach((c) => {
                            replacementNode.append(c);
                          });
                          blockNode.replace(replacementNode);
                          replacementNode.selectStart();
                        }
                      }
                    }
                  });
                } else
                  console.error(
                    '[BlockType] [VisualMode] ABORTED: Could not locate __lexicalEditor on editorRoot.',
                  );
              } else
                console.error(
                  '[BlockType] [VisualMode] ABORTED: No saved cursor context. Ensure the cursor was placed inside the editor before selection.',
                );
            } catch (_err) {
              console.error('[BlockType] [VisualMode] CRITICAL PIPELINE FAILURE:', _err);
            }
            setVal(v);
            return;
          }
          item.onSelect();
        }}
        size="xs"
      >
        <SelectTrigger aria-label="Block type" className="w-40" onMouseDown={preserveSel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {/* prettier-ignore */}
          <SelectGroup>
					<SelectLabel>Block Type</SelectLabel>
						{opts.filter(o => o.group === 'type').map(({ value: v, label: l, icon: i }) => (<SelectItem key={v} value={v} icon={React.createElement(i, { className: ICON_CLASS })}>{l}</SelectItem>))}
				</SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Insert Block</SelectLabel>
            {opts
              .filter((o) => o.group === 'insert')
              .map(({ value: v, label: l, icon: i }) => (
                <SelectItem
                  key={v}
                  value={v}
                  icon={React.createElement(i, { className: ICON_CLASS })}
                >
                  {l}
                </SelectItem>
              ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  },

  /**
   * Main floating action bar assembling all text and format mutation interactions into a single cohesive boundary.
   *
   * @param props - Active mode, editability, toolbar state, optional block list and adapter, and whether Docs-specific actions are enabled.
   * @param {object} - Value passed to the helper.
   * @param {ToolbarMode} [props.activeMode] - Inherited mode state isolating interactive parameters.
   * @param {ToolbarState | null} props.toolbar - System level hook connecting buttons smoothly back into abstract DOM memory states.
   * @param editable - Editability flag controlling whether toolbar accepts changes.
   * @param blocks - Blocks input supplied to toolbar's operation.
   * @param adapter - Adapter input supplied to toolbar's operation.
   * @param docs - Docs input supplied to toolbar's operation.
   *
   * @return {JSX.Element | null} Assembled floating bar mapping components.
   */
  Toolbar({
    activeMode: aMode,
    editable,
    toolbar,
    blocks,
    adapter,
    docs = true,
  }: {
    activeMode?: ToolbarMode;
    editable: boolean;
    toolbar: ToolbarState | null;
    transitioning?: boolean;
    blocks?: PortableEditorBlock[];
    adapter?: EditorToolbarAdapter;
    docs?: boolean;
  }): JSX.Element | null {
    // STATES
    const toolbarCtx = {
      edit: useContext(EditStateCtx),
      attachmentFilter: useAtom($attachmentFilter),
    };
    const mode = aMode ?? 'view';
    const [vers, setVers] = useState<DocVer[]>([]);
    const [verDialogOpen, setVerDialogOpen] = useState(false);
    const [selVerId, setSelVerId] = useState<string>('');
    const codeAtEnd = useRef(false);
    const codeSel = useRef<Parameters<NonNullable<ToolbarState['insert']>>[2]>(null);
    const codeLength = useRef(0);
    useEffect(() => {
      /**
       * Handles sync.
       */
      const sync = (): void => {
        const view = codeViewOf();
        if (!view) return;
        const { from, to } = view.state.selection.main;
        codeLength.current = view.state.doc.length;
        codeSel.current = {
          code: { from: Math.min(from, to), to: Math.max(from, to) },
          dom: null,
          visible: true,
        };
        codeAtEnd.current = false;
      };
      document.addEventListener('selectionchange', sync);
      return () => {
        document.removeEventListener('selectionchange', sync);
      };
    }, []);
    const [endpoint, setEndpoint] = useState('');
    const [endpointOpen, setEndpointOpen] = useState(false);
    const ready = adapter?.ready ?? !!toolbar;
    const saving = toolbar?.busy ?? null;
    const dirty = toolbar?.dirty ?? false;
    const publishDraft = getDocsHostAdapter()?.publishDraft;
    const publish = async (): Promise<void> => {
      if (!publishDraft || !toolbar?.path) return;
      try {
        if (dirty && toolbar.save) await toolbar.save();
        await publishDraft(toolbar.path);
        toast.success('Published.');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to publish document.');
      }
    };
    useEffect(() => {
      let live = true;
      if (!docs || !editable || !toolbar?.path || !verDialogOpen) {
        setVers([]);
        return;
      }
      const tgtPath = toolbar.path;
      // prettier-ignore
      const tgtId = tgtPath.split('/').pop()?.replace(TerraQualityRegex.REGEX_MDX_I_REGEX(), '') || tgtPath;
      (async (): Promise<void> => {
        try {
          const res = await actions.write.doc.versions.get({ path: tgtPath });
          if (res.error) throw res.error;
          let resultData = res.data;
          if (Array.isArray(resultData) && resultData.length === 0 && tgtPath !== tgtId) {
            const fallback = await actions.write.doc.versions.get({ path: tgtId });
            if (fallback.error) throw fallback.error;
            if (Array.isArray(fallback.data) && fallback.data.length > 0)
              resultData = fallback.data;
          }
          if (!live || !Array.isArray(resultData)) return;
          setVers(resultData as DocVer[]);
        } catch (err) {
          console.error('[Toolbar:versions] load-failed', { path: tgtPath, error: err });
          toast.error(err instanceof Error ? err.message : 'Failed to load doc versions.');
        }
      })();
      return () => {
        live = false;
      };
    }, [docs, editable, toolbar?.path, verDialogOpen]);
    // HANDLERS
    const onSave = toolbar
      ? async (e: { preventDefault: () => void }) => {
          e.preventDefault();
          if (!toolbar.save) return;
          try {
            const res = toolbar.save();
            if (res instanceof Promise) await res;
          } catch (err: unknown) {
            console.error('[Docs:save] failed', err);
            toast.error(err instanceof Error ? err.message : 'Unable to save document.');
          }
        }
      : undefined;
    const selVer = vers.find((v) => v.savedAt === selVerId);
    useEffect(() => {
      if (verDialogOpen && !selVerId && vers[0]) setSelVerId(vers[0].savedAt);
    }, [verDialogOpen, selVerId, vers]);
    const previewPack = useMemo(() => parseVerBody(selVer), [selVer]);
    useEffect(() => {
      previewPack.markdown.trim();
    }, [toolbar?.path, vers, selVer, previewPack.json, previewPack.markdown, previewPack.body]);

    /**
     * On restore preview.
     */
    const toolbarActions = {
      discard: toolbar
        ? async (e: { preventDefault: () => void }): Promise<void> => {
            e.preventDefault();
            if (!toolbar.discard) return;
            try {
              await Promise.resolve(toolbar.discard());
            } catch (_err: unknown) {
              console.error('[Thundra] Discard failed:', _err);
            }
          }
        : undefined,
      restorePreview: async (): Promise<void> => {
        if (!toolbarCtx.edit || !selVerId) return;
        console.info(
          '[Toolbar:history:restore]',
          JSON.stringify({
            path: toolbar?.path ?? null,
            savedAt: selVerId,
            sourceLength: previewPack.markdown.length,
            sourceHead: previewPack.markdown.slice(0, 120),
            sourceTail: previewPack.markdown.slice(-120),
          }),
        );
        if (toolbarCtx.edit.update)
          toolbarCtx.edit.update({
            content: previewPack.body,
            title: selVer?.title || '',
            description: selVer?.description || '',
            source: previewPack.markdown,
          });
        const setCode = toolbarCtx.edit.setCode ?? toolbarCtx.edit.setSrc;
        if (setCode) setCode(previewPack.markdown);
        setVerDialogOpen(false);
        notify({ error: null, fallback: 'Restored version to local draft. Save to apply.' });
      },
    };
    const insert = toolbar?.insert ?? adapter?.insert;
    /**
     * Handles json command.
     *
     * @param detail - Toolbar detail describing the requested document update.
     */
    const jsonCmd = (
      detail:
        | { type: 'decorator'; decorator: string }
        | { type: 'insert'; block: Record<string, unknown> }
        | { type: 'list'; list: string },
    ): boolean => {
      if (mode !== 'edit') return false;
      window.dispatchEvent(new CustomEvent('docs:json-command', { detail }));
      return true;
    };
    /**
     * Handles json block.
     *
     * @param _type - Sanity field type associated with the value.
     * @param value - Field value being normalized for the toolbar.
     */
    const jsonBlock = (_type: string, val: Record<string, unknown>): Record<string, unknown> => ({
      _key: crypto.randomUUID(),
      _type,
      ...val,
    });

    // SELECTION HANDLER
    /**
     * Safe sel.
     *
     * @param fallback - Value passed to the helper.
     * @param isInline - Value passed to the helper.
     *
     * @returns safe Sel.
     */
    const sSel = (fallback: string, isInline = false): string => {
      let text = '';
      try {
        const view = codeViewOf();
        if (view && view.dom.offsetParent !== null) {
          if (!view.state.selection.main.empty)
            text = view.state.sliceDoc(
              view.state.selection.main.from,
              view.state.selection.main.to,
            );
        } else {
          const winSel = window.getSelection();
          // explicitly check that the selection is not collapsed to avoid capturing the whole block bounds
          if (winSel && winSel.rangeCount > 0 && !winSel.isCollapsed) text = winSel.toString();
        }
      } catch {
        // Fall back to the caller-provided text below.
      }
      if (!text.trim()) return fallback;
      // strip structural markdown (tables, asides, newlines) that break inline link/bold syntax
      // prettier-ignore
      if (isInline) return text.replace(/[\r\n]+/g, ' ').replace(/(:::|\|\|\||===|\|)/g, '').replace(/\s{2,}/g, ' ').trim() || fallback;
      return text;
    };

    /**
     * Handles click toolbar button.
     *
     * @param label - Label displayed beside the toolbar control.
     */
    const clickToolbarButton = (label: string): void => {
      const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      button?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      button?.click();
    };

    // prettier-ignore
    const toolbarOpts = {
		blocks: [
		{ group: 'type', value: 'p', label: 'Text', icon: TextFontIcon, 		onSelect: () => undefined },
		{ group: 'type', value: 'h2', label: 'Heading 2', icon: DOCS_BLOCK_ICONS.heading, 		onSelect: () => undefined },
		{ group: 'type', value: 'h3', label: 'Heading 3', icon: DOCS_BLOCK_ICONS.heading, 		onSelect: () => undefined },
		{ group: 'type', value: 'h4', label: 'Heading 4', icon: DOCS_BLOCK_ICONS.heading, 		onSelect: () => undefined },
		{ group: 'insert', value: 'table', label: 'Insert table', icon: DOCS_BLOCK_ICONS.table, 		onSelect: () => jsonCmd({ type: 'insert', block: jsonBlock('table', { header: 'Column 1|Column 2', rows: [jsonBlock('row', { cells: [jsonBlock('cell', { content: [jsonBlock('block', { children: [jsonBlock('span', { marks: [], text: 'Text' })], markDefs: [], style: 'normal' })] }), jsonBlock('cell', { content: [jsonBlock('block', { children: [jsonBlock('span', { marks: [], text: 'Text' })], markDefs: [], style: 'normal' })] })] })] }) }) || insert?.(`\n\n<table>\n\t<thead>\n\t\t<tr>\n\t\t\t<th>Column 1</th>\n\t\t\t<th>Column 2</th>\n\t\t</tr>\n\t</thead>\n\t<tbody>\n\t\t<tr>\n\t\t\t<td>Text</td>\n\t\t\t<td>Text</td>\n\t\t</tr>\n\t</tbody>\n</table>\n\n`,) },
		{ group: 'insert', value: 'nodes', label: 'Insert nodes', icon: DOCS_BLOCK_ICONS.nodes, 		onSelect: () => jsonCmd({ type: 'insert', block: jsonBlock('nodes', { edges: [], nodes: [{ id: 'start', type: 'origin', data: { title: 'Start' } }] }) }) || insert?.(EMPTY_NODES) },
		{ group: 'insert', value: 'code-local', label: 'Insert code block', icon: DOCS_BLOCK_ICONS.code, onSelect: () => insertionActions.insertLocalCode() },
		{ group: 'insert', value: 'code-received', label: 'Receive value', icon: ShareIcon, 		onSelect: () => { setEndpointOpen(true); } },
		{ group: 'insert', value: 'math', label: 'Insert math', icon: DOCS_BLOCK_ICONS.math, 		onSelect: () => jsonCmd({ type: 'insert', block: jsonBlock('math', { code: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}" }) }) || insert?.(`\n\n<DocsMath code="f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}" />\n\n`) },
		{ group: 'insert', value: 'tsdocs', label: 'Insert TypeDoc', icon: DOCS_BLOCK_ICONS.tsDocs, 		onSelect: () => jsonCmd({ type: 'insert', block: jsonBlock('tsDocs', { scope: '' }) }) || insert?.(`\n\n<TsDocs scope="" />\n\n`) },
		{ group: 'insert', value: 'accordion', label: 'Insert accordion', icon: DOCS_BLOCK_ICONS.accordion, 		onSelect: () => jsonCmd({ type: 'insert', block: jsonBlock('accordion', { items: [jsonBlock('item', { content: [jsonBlock('block', { children: [jsonBlock('span', { marks: [], text: sSel('Content...') })], markDefs: [], style: 'normal' })], title: 'Accordion item' })] }) }) || insert?.(`\n\n=== [Accordion Item]\n\n${sSel('Content...')}\n\n===\n\n`) },
		{ group: 'insert', value: 'tabs', label: 'Insert tabs', icon: DOCS_BLOCK_ICONS.tabs, 		onSelect: () => jsonCmd({ type: 'insert', block: jsonBlock('tabs', { items: [jsonBlock('item', { content: [jsonBlock('block', { children: [jsonBlock('span', { marks: [], text: sSel('Content...') })], markDefs: [], style: 'normal' })], title: 'Tab' })] }) }) || insert?.(`\n\n||| [Tabs Item]\n\n${sSel('Content...')}\n\n|||\n\n`) },
		{ group: 'insert', value: 'aside', label: 'Insert aside', icon: DOCS_BLOCK_ICONS.callout, 		onSelect: () => jsonCmd({ type: 'insert', block: jsonBlock('callout', { content: [jsonBlock('block', { children: [jsonBlock('span', { marks: [], text: sSel('Content...') })], markDefs: [], style: 'normal' })], kind: 'note', title: 'Note' }) }) || insert?.(`\n\n:::note[Note]\n\n${sSel('Content...')}\n\n:::\n\n`) },
		{ group: 'insert', value: 'attachment', label: 'Insert image', icon: DOCS_BLOCK_ICONS.docImage, 		onSelect: () => jsonCmd({ type: 'insert', block: jsonBlock('docImage', { alt: '', url: '' }) }) || clickToolbarButton('Insert attachment') },
		{ group: 'insert', value: 'component', label: 'Insert component', icon: DOCS_BLOCK_ICONS.code, 		onSelect: () => { clickToolbarButton('Insert component'); } },
		...(mode === 'edit' ? [] : (blocks ?? []).map(({ type: v, label: l, icon: i, insert: c }) => ({ group: 'insert' as const, value: v, label: `Insert ${l?.toLowerCase()}`, icon: i, 		onSelect: () => insert?.(c()) }))),
		] as BlockOpt[],
		formats: [
			{ key: 'bold', lbl: 'Bold', icon: BoldIcon, shortcut: '⌘B', format: (val: string): string => `**${val}**` },
			{ key: 'italic', lbl: 'Italic', icon: ItalicIcon, shortcut: '⌘I', format: (val: string): string => `_${val}_` },
			{ key: 'underline', lbl: 'Underline', icon: UnderlineIcon, shortcut: '⌘U', format: (val: string): string => `<u>${val}</u>` },
			{ key: 'strikethrough', lbl: 'Strikethrough', icon: StrikethroughIcon, shortcut: '⌘X', format: (val: string): string => `~~${val}~~` },
			{ key: 'link', lbl: 'Link', icon: LinkIcon, shortcut: '⌘K', format: (val: string): string => `[${val}](url)` },
		],
		};

    // DATA
    /**
     * Handles insert code.
     *
     * @param source - Docs source payload sent to the endpoint.
     * @param endpoint - API endpoint receiving the toolbar request.
     */
    const insertionActions = {
      insertLocalCode: (): void => {
        if (
          jsonCmd({
            type: 'insert',
            block: jsonBlock('code', { language: 'text', value: 'Code...' }),
          })
        )
          return;
        insert?.(`\n\n<Code language="text">\n{\`\nCode...\n\`}\n</Code>\n\n`);
      },
      insertCode: (src: 'local' | 'received', endpoint = ''): void => {
        const code =
          src === 'received'
            ? `\n\n<Code language="json" source=${JSON.stringify(endpoint)} />\n\n`
            : '\n\n<Code language="text">\n{`\nCode...\n`}\n</Code>\n\n';
        if (
          jsonCmd({
            type: 'insert',
            block: jsonBlock(
              'code',
              src === 'received'
                ? { language: 'json', source: endpoint, value: '' }
                : { language: 'text', value: 'Code...' },
            ),
          })
        )
          return;
        if (insert) {
          const srcLength = codeLength.current;
          insert(
            code,
            codeAtEnd.current || (srcLength > 0 && (codeSel.current?.code?.to ?? -1) >= srcLength),
            codeSel.current,
          );
          codeAtEnd.current = false;
          codeSel.current = null;
          return;
        }
        const curr = toolbarCtx.edit?.code ?? toolbarCtx.edit?.source ?? '';
        const sel = codeSel.current?.code;
        const range =
          codeAtEnd.current || !sel
            ? { from: curr.length, to: curr.length }
            : { from: Math.min(sel.from, curr.length), to: Math.min(sel.to, curr.length) };
        const n = `${curr.slice(0, range.from)}${code}${curr.slice(range.to)}`;
        toolbarCtx.edit?.update({ source: n });
        toolbarCtx.edit?.setCode(n);
        if (toolbarCtx.edit) {
          codeAtEnd.current = false;
          codeSel.current = null;
          return;
        }
        const view = codeViewOf();
        if (view) {
          const range = codeAtEnd.current
            ? { from: view.state.doc.length, to: view.state.doc.length }
            : (codeSel.current?.code ?? view.state.selection.main);
          view.dispatch({
            changes: { from: range.from, insert: code, to: range.to },
            scrollIntoView: true,
            selection: { anchor: range.from + code.length },
          });
          view.focus();
          codeAtEnd.current = false;
          codeSel.current = null;
          return;
        }
        codeAtEnd.current = false;
        codeSel.current = null;
      },
      /*
       * Handles receive code.
       */
      receiveCode: (): void => {
        const src = endpoint.trim();
        if (!src) return;
        insertionActions.insertCode('received', src);
        setEndpoint('');
        setEndpointOpen(false);
      },
    };

    // KEYBOARD SHORTCUTS
    useEffect(() => {
      if (mode === 'view' || !onSave) return;
      /**
       * Handles key down.
       *
       * @param e - Value passed to the helper.
       */
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key?.toLowerCase() === 's') {
          e.preventDefault();
          void onSave(e);
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [mode, onSave]);

    // RENDER
    return (
      <ErrorBoundary name="Toolbar">
        <div
          className="docs-toolbar-scroll not-prose pointer-events-auto sticky top-10 isolate z-50 -mx-3 -mt-5 mb-5 w-[calc(100%+1.5rem)] max-w-[calc(100%+1.5rem)] overflow-visible text-primary-12 print:hidden"
          data-docs-toolbar-frame
          data-docs-toolbar-scroll
        >
          <div
            aria-hidden="true"
            className="docs-toolbar-backdrop pointer-events-none absolute -inset-x-4 -bottom-12 -top-16 z-0"
          />
          <div className="relative z-10 rounded-lg border border-primary-6 bg-primary-3">
            <TooltipProvider>
              <div
                className="mdxeditor-toolbar not-prose relative z-10 box-border flex w-full min-w-0 flex-wrap items-center justify-between gap-1.5 gap-x-3 px-2 py-1 text-primary-12 print:hidden"
                data-docs-main-toolbar
              >
                {mode === 'view' ? (
                  docs && (
                    <Mode
                      editable={editable}
                      mode={mode}
                      disabled={!ready}
                      onModeChange={(v) => {
                        if (!toolbar) return;
                        toolbar.setMode(v).catch((e) => {
                          console.error('[Toolbar:mode] change-failed', { mode: v, error: e });
                          toast.error(e instanceof Error ? e.message : 'Failed to change mode.');
                          clearTransition();
                        });
                      }}
                    />
                  )
                ) : mode === 'attachments' ? (
                  // ATTACHMENT FILTERS
                  <>
                    {/* MODE */}
                    {docs && (
                      <Mode
                        editable={editable}
                        mode={mode}
                        disabled={!ready}
                        onModeChange={(v) => {
                          if (!toolbar) return;
                          toolbar.setMode(v).catch((e) => {
                            console.error('[Toolbar:mode] change-failed', { mode: v, error: e });
                            toast.error(e instanceof Error ? e.message : 'Failed to change mode.');
                            clearTransition();
                          });
                        }}
                      />
                    )}
                    {/* ATTACHMENTS */}
                    <ToggleGroup
                      type="multiple"
                      value={[...toolbarCtx.attachmentFilter]}
                      onValueChange={(v) => {
                        if (v) $attachmentFilter.set(v as AttchType[]);
                      }}
                      className="ml-auto max-w-full flex-wrap justify-end"
                    >
                      {ATTCH_TYPES.map((f) => (
                        <ToggleGroupItem
                          key={f}
                          value={f}
                          size="sm"
                          className="h-6 px-2 text-xs capitalize"
                          onMouseDown={preserveSel}
                        >
                          {f}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </>
                ) : (
                  <>
                    {/* BLOCKS */}
                    <ButtonGroup>
                      {/* block select */}
                      <TOOLBAR_COMPONENTS.BlockType
                        disabled={!ready}
                        toolbar={toolbar}
                        adapter={adapter}
                        options={toolbarOpts.blocks}
                        json={mode === 'edit'}
                      />
                      {/* format */}
                      {toolbarOpts.formats
                        .map(({ key: k, lbl: l, icon: i, shortcut: s, format: f }) => ({
                          key: k,
                          lbl: l,
                          icon: i,
                          shortcut: s,
                          onClick: () =>
                            jsonCmd({
                              type: 'decorator',
                              decorator: k === 'strikethrough' ? 'strike-through' : k,
                            }) ||
                            (adapter?.format
                              ? adapter.format(
                                  k === 'strikethrough'
                                    ? 'strike'
                                    : (k as 'bold' | 'italic' | 'underline' | 'link'),
                                )
                              : insert?.(f(sSel('text', true)))),
                        }))
                        .map(({ key: k, lbl: l, icon: i, shortcut: s, onClick: o }) => (
                          <Button
                            key={k}
                            lbl={l}
                            shortcut={s}
                            disabled={!ready}
                            onMouseDown={preserveSel}
                            onClick={o}
                          >
                            {React.createElement(i)}
                          </Button>
                        ))}
                      {/* lists */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button lbl="Insert list" disabled={!ready} onMouseDown={preserveSel}>
                            <BulletListIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {[
                            {
                              key: 'bullet' as const,
                              lbl: 'Bulleted list',
                              icon: BulletListIcon,
                              prefix: '\n- ',
                              fallback: 'Item',
                            },
                            {
                              key: 'number' as const,
                              lbl: 'Numbered list',
                              icon: NumberListIcon,
                              prefix: '\n1. ',
                              fallback: 'Item',
                            },
                            {
                              key: 'check' as const,
                              lbl: 'Checklist',
                              icon: CheckListIcon,
                              prefix: '\n- [ ] ',
                              fallback: 'Task',
                            },
                          ]
                            .map(({ key: k, lbl: l, icon: i, prefix: p, fallback: f }) => ({
                              key: k,
                              lbl: l,
                              icon: i,
                              onClick: () =>
                                jsonCmd({ type: 'list', list: k === 'check' ? 'bullet' : k }) ||
                                (adapter?.toggleList
                                  ? adapter.toggleList(k)
                                  : toolbar?.toggleList
                                    ? toolbar.toggleList(k)
                                    : insert?.(`${p}${sSel(f)}\n`)),
                            }))
                            .map(({ key: k, lbl: l, icon: i, onClick: o }) => (
                              <DropdownMenuItem
                                key={k}
                                disabled={!ready}
                                onSelect={() => {
                                  if (o) o();
                                }}
                                className={MENU_GAP_CLASS}
                              >
                                {React.createElement(i, { className: ICON_CLASS })}
                                <span>{l}</span>
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ButtonGroup>
                    <div className="flex items-center gap-1">
                      {/* MODE */}
                      {docs && (
                        <Mode
                          editable={editable}
                          mode={mode}
                          disabled={!ready}
                          onModeChange={(v) => {
                            if (!editable || !toolbar) return;
                            toolbar.setMode(v).catch((e) => {
                              console.error('[Toolbar:mode] change-failed', { mode: v, error: e });
                              toast.error(
                                e instanceof Error ? e.message : 'Failed to change mode.',
                              );
                              clearTransition();
                            });
                          }}
                        />
                      )}
                      {/* SAVE */}
                      {/* find/replace */}
                      <TextTooltip
                        content="Find (⌘F)"
                        side="top"
                        align="center"
                        delayDuration={400}
                      >
                        {docs && <TOOLBAR_COMPONENTS.FindReplace mode={mode} toolbar={toolbar} />}
                      </TextTooltip>
                      {/* undo/redo */}
                      <TOOLBAR_COMPONENTS.Undo
                        onMouseDown={preserveSel}
                        disabled={!ready}
                        adapter={adapter}
                      />
                      {docs && (
                        <>
                          {/* discard */}
                          <UiButton
                            size="xs"
                            variant="tonal"
                            disabled={
                              !ready || !dirty || saving !== null || (toolbar?.optimistic ?? false)
                            }
                            onMouseDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={(e) => void toolbarActions.discard?.(e)}
                          >
                            Discard
                          </UiButton>
                          {/* save */}
                          <ButtonGroup>
                            <TextTooltip
                              content="Save (⌘S)"
                              side="top"
                              align="center"
                              delayDuration={400}
                            >
                              <UiButton
                                size="xs"
                                disabled={!ready || !dirty}
                                loading={saving === 'saving'}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                }}
                                onClick={(e) => void onSave?.(e)}
                              >
                                Save
                              </UiButton>
                            </TextTooltip>
                            <TextTooltip
                              content="Version History"
                              side="top"
                              align="center"
                              delayDuration={400}
                            >
                              <UiButton
                                size="xs"
                                className="px-0.5"
                                disabled={!ready}
                                aria-label="Version History"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                }}
                                onClick={() => {
                                  if (vers.length > 0 && !selVerId) setSelVerId(vers[0].savedAt);
                                  setVerDialogOpen(true);
                                }}
                              >
                                <CaretDownIcon />
                              </UiButton>
                            </TextTooltip>
                            <Dialog open={verDialogOpen} onOpenChange={setVerDialogOpen}>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Version History</DialogTitle>
                                  <DialogDescription className="sr-only">
                                    Select a version to preview and restore.
                                  </DialogDescription>
                                  <Select value={selVerId} onValueChange={setSelVerId}>
                                    <SelectTrigger
                                      className="h-14"
                                      aria-label="Select a version..."
                                    >
                                      <SelectValue placeholder="Select a version..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {vers.map((v) => (
                                        <SelectItem key={v.savedAt} value={v.savedAt}>
                                          <span className="flex flex-col text-left">
                                            <span>
                                              {v.title} ({new Date(v.savedAt).toLocaleString()})
                                            </span>
                                            <span className={SECONDARY_TEXT_CLASS}>
                                              {v.description}
                                            </span>
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </DialogHeader>
                                <div className="min-h-0 flex-1 overflow-y-auto">
                                  <CodeBlock
                                    tone="view"
                                    language="mdx"
                                    docsSource
                                    code={previewPack.markdown.trim() || ' '}
                                  />
                                </div>
                                {/* prettier-ignore */}
                                <DialogFooter>
														<UiButton variant='ghost' onClick={() => { setVerDialogOpen(false); }}>Cancel</UiButton>
									<UiButton disabled={!selVer} onClick={toolbarActions.restorePreview}>Restore</UiButton>
													</DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </ButtonGroup>
                          {docs && publishDraft && (
                            <UiButton
                              size="xs"
                              disabled={!ready || saving === 'saving'}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => void publish()}
                            >
                              Publish
                            </UiButton>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <TOOLBAR_COMPONENTS.Uploader
                        icon={ImageIcon}
                        insert={insert}
                        onMouseDown={preserveSel}
                        disabled={!ready}
                        ctx={toolbar?.path}
                      />
                      <TOOLBAR_COMPONENTS.Custom
                        onInsert={(_statement, v) => insert?.(v, true)}
                        onInsertMd={insert}
                        onMouseDown={preserveSel}
                        disabled={!ready}
                        ctx={toolbar?.path}
                      />
                    </div>
                    <Dialog
                      open={endpointOpen}
                      onOpenChange={(o) => {
                        setEndpointOpen(o);
                        if (!o) setEndpoint('');
                      }}
                    >
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Receive value</DialogTitle>
                          <DialogDescription className="sr-only">
                            Enter an API endpoint to receive code value into the editor.
                          </DialogDescription>
                        </DialogHeader>
                        <Label htmlFor="docs-received-code-endpoint">API endpoint</Label>
                        <Input
                          id="docs-received-code-endpoint"
                          value={endpoint}
                          onChange={(e) => {
                            setEndpoint(e.target.value);
                          }}
                          placeholder="/api/docs?action=testimonials"
                        />
                        {/* prettier-ignore */}
                        <div className='flex justify-end gap-2'>
										<UiButton variant='outline' onClick={() => { setEndpointOpen(false); }}>Cancel</UiButton>
					<UiButton disabled={!endpoint.trim()} onClick={insertionActions.receiveCode}>Receive value</UiButton>
									</div>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </div>
            </TooltipProvider>
          </div>
        </div>
      </ErrorBoundary>
    );
  },
};

export const { DocsToolbarActions } = TOOLBAR_COMPONENTS;
export const { Toolbar } = TOOLBAR_COMPONENTS;
