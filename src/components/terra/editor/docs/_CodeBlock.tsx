// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/docs/_CodeBlock.tsx
 * Shared Docs CodeMirror renderer.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { $hydrating, $transition } from '../../../../lib/terra/docs/state.js';
import { htmlToMd } from '../../../../lib/terra/docs/editor-dom.js';
import { cn, errorLog } from '../../../../lib/terra/runtime/runtime.js';
import {
  copyLineDown,
  copyLineUp,
  cursorLineBoundaryBackward,
  cursorLineBoundaryForward,
  history,
  historyKeymap,
  indentWithTab,
  moveLineDown,
  moveLineUp,
  selectLineBoundaryBackward,
  selectLineBoundaryForward,
  standardKeymap,
} from '@codemirror/commands';
import { drawSelection, keymap, lineNumbers, placeholder as cmPlaceholder } from '@codemirror/view';
import { githubLight } from '@uiw/codemirror-theme-github';
import { indentUnit } from '@codemirror/language';
import { isDarkMode } from '../../../../lib/terra/runtime/runtime.js';
import { isEndpointVal } from '../../../../lib/terra/runtime/shared.js';
import { languages } from '@codemirror/language-data';
import { markdown } from '@codemirror/lang-markdown';
import {
  mdTableToHtml,
  stringifyCodeValue,
} from '../../../../lib/terra/runtime/content/markdown.js';
import { oneDark } from '@codemirror/theme-one-dark';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// COMPONENTS
import * as TerraQualityRegex from '../../../../lib/terra/regex.mjs';
import { AlertError } from '@terra-symposium/styling/ui/terra-original';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import { Checkmark as CheckIcon, Copy as CopyIcon } from '@carbon/icons-react';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { ErrorBoundary } from '../../ui.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@terra-symposium/styling/ui/terra-original';

// TYPES
import type { Extension } from '@codemirror/state';
import type { JSX } from 'react';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/**
 * Supported programming languages for code blocks.
 *
 * @remarks Used to initialize the CodeMirror environment correctly.
 */
const LANGS = [
  'text',
  'astro',
  'bash',
  'css',
  'html',
  'javascript',
  'json',
  'jsx',
  'math',
  'mdx',
  'shell',
  'typescript',
  'tsx',
  'yaml',
] as const;
const light = [githubLight] satisfies Extension[];
const dark = [oneDark] satisfies Extension[];
const codeSrcCache = new Map<string, Promise<string>>();
/**
 * Triggers a layout re-measure to fully expand codemirror instances.
 *
 * @param v - The target CodeMirror view reference.
 *
 * @returns Void
 *
 * @remarks Resolves constraints within un-mounted or obscured states.
 */
const expand = (v: EditorView | null): void => {
  if (!v) return;
  // Keep the code block editor's measured viewport aligned with its rendered content.
  if ((v as EditorView & { viewState?: { printing: boolean } }).viewState)
    (v as EditorView & { viewState?: { printing: boolean } }).viewState!.printing = true;
  v.requestMeasure({
    read: (view) => Math.ceil(view.contentHeight),
    write: (height, view) => {
      view.dom.style.height = `${height}px`;
      view.scrollDOM.style.height = `${height}px`;
    },
  });
};
/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Renders the loading placeholder for deferred Docs content.
 *
 * @param props - Optional source identifier attached to the placeholder so its deferred block can be connected to the editor view.
 *
 * @return The loading placeholder.
 */
function BlockSkeleton({ source: src }: { source?: string }): JSX.Element {
  return (
    <div
      className="h-24 w-full animate-pulse rounded-sm bg-primary-3"
      data-docs-block-skeleton
      data-docs-code-source={src}
    />
  );
}
Object.assign(BlockSkeleton, { displayName: 'DocsCodeBlockSkeleton' });

/**
 * Resolves the primary language format identifier from a passed string.
 *
 * @param v - The unformatted language identifier.
 *
 * @return The resolved language name string.
 *
 * @remarks Used generally for syntax highlighting assignments.
 */
function langOf(v: string): string {
  return v?.trim().toLowerCase() || 'text';
}

/**
 * High-performance rich-text rendering shell managing syntax highlighted text presentations parsing raw code blocks.
 *
 * @param props - Unified mapping resolving presentation versus active edit inputs.
 *
 * @return Instanced CodeMirror window evaluating code chunks mapped dynamically against site theme constraints.
 *
 * @remarks Facilitates explicit fallbacks during hydration avoiding layout shifts natively.
 */
export function CodeBlock(
  props:
    | {
        className?: string;
        code?: unknown;
        docsSource?: boolean;
        language: string;
        source?: string;
        tone: 'edit';
        placeholder?: string;
        expandAll?: boolean;
        fullHeight?: boolean;
        languageEditable?: boolean;
        readOnly?: boolean;
        onCodeChange?: (code: string) => void;
        onCommit?: (code: string, language: string) => void;
        onLanguageChange?: (language: string, code: string) => void;
      }
    | {
        className?: string;
        code?: unknown;
        docsSource?: boolean;
        language: string;
        source?: string;
        tone: 'view';
        placeholder?: string;
      },
): JSX.Element {
  // STATES
  const src =
    props.source?.trim() ||
    (typeof props.code === 'string' && isEndpointVal(props.code) ? props.code.trim() : '');
  const locked = props.tone === 'view' || props.readOnly === true;
  const docsSrc = props.docsSource === true;
  // Keep intentional leading/trailing newlines. Stripping them here causes a
  // controlled Docs editor to undo a CodeMirror Enter transaction on rerender.
  const code = stringifyCodeValue(props.code);
  const viewCode = docsSrc
    ? code.replace(
        /<Code\b([\s\S]*?)>(?:\s*\{`((?:\\.|[^`])*)`\}\s*|\s*([\s\S]*?)\s*)<\/Code>/g,
        (_match, p, e, v) => {
          return `\n<Code${p}>\n${/* prettier-ignore */ e !== undefined ? e.replace(TerraQualityRegex.REGEX_G_REGEX_11(), '$1').replace(TerraQualityRegex.REGEX_N_G_REGEX_2(), '\n') : (v || '').trim()}\n</Code>\n`;
        },
      )
    : code;
  const [copied, setCopied] = useState(false);
  const [resCode, setResCode] = useState(() => viewCode);
  const [receivedState, setReceivedState] = useState<'error' | 'loading' | 'received'>(
    src ? 'loading' : 'received',
  );
  const [receivedErr, setReceivedErr] = useState('');

  // REFS
  const host = useRef<HTMLDivElement>(null);
  const received = useRef<HTMLElement>(null);
  const view = useRef<EditorView | null>(null);
  const theme = useRef(new Compartment());
  /**
   * Returns the displayed code.
   *
   * @returns Current displayed code.
   */
  const codeVal = (): string => viewCode;
  const codeRef = useRef(resCode);
  const langRef = useRef(langOf(props.language));
  const chgRef = useRef(props.tone === 'edit' ? props.onCodeChange : undefined);
  const cmtRef = useRef(props.tone === 'edit' ? props.onCommit : undefined);

  // SYNC REFS
  chgRef.current = props.tone === 'edit' ? props.onCodeChange : undefined;
  cmtRef.current = props.tone === 'edit' ? props.onCommit : undefined;
  codeRef.current = resCode;
  langRef.current = langOf(props.language);

  // DERIVED
  const curLang = langOf(props.language);
  const expAll = 'expandAll' in props && props.expandAll === true;
  const fullHeight = props.tone === 'edit' && props.fullHeight === true;

  // RENDER HELPERS

  // EFFECTS
  useEffect(() => {
    const n = codeVal();
    if (!src) {
      setResCode(n);
      setReceivedState('received');
      setReceivedErr('');
      return;
    }
    setResCode(n);
    setReceivedState('loading');
    setReceivedErr('');
    let a = true;
    const req =
      codeSrcCache.get(src) ??
      fetch(new URL(src, window.location.origin).toString(), {
        headers: { Accept: 'application/json, text/plain, */*' },
      }).then(async (r) => {
        const text = (await r.text()).trimEnd();
        if (!r.ok) {
          throw new Error(
            (() => {
              try {
                const val = JSON.parse(text) as { error?: unknown };
                return typeof val.error === 'string'
                  ? val.error
                  : `Endpoint request failed: ${r.status}`;
              } catch {
                return text || `Endpoint request failed: ${r.status}`;
              }
            })(),
          );
        }
        return text;
      });
    codeSrcCache.set(src, req);
    if (codeSrcCache.size > 32 && codeSrcCache.keys().next().value !== undefined)
      codeSrcCache.delete(codeSrcCache.keys().next().value as string);
    void req.then(
      (t) => {
        if (!a) return;
        setResCode(t);
        setReceivedState('received');
      },
      (e) => {
        codeSrcCache.delete(src);
        if (!a) return;
        const msg = e instanceof Error ? e.message : 'Unable to receive the API value.';
        errorLog('DocsCode', `Failed to receive ${src}`, { message: msg });
        setResCode(n);
        setReceivedErr(msg);
        setReceivedState('error');
      },
    );
    return () => {
      a = false;
    };
  }, [docsSrc, props.code, props.source, src]);

  useEffect(() => {
    if (props.tone === 'view') return;
    let a = true;
    let activeEnterHandler: ((event: KeyboardEvent) => void) | undefined;
    $hydrating.set($hydrating.get() + 1);
    const hydration = {
      finished: false,
      fallback: undefined as ReturnType<typeof setTimeout> | undefined,
      release: () => {
        if (hydration.finished) return;
        hydration.finished = true;
        if (hydration.fallback) clearTimeout(hydration.fallback);
        hydration.fallback = undefined;
        $hydrating.set(Math.max(0, $hydrating.get() - 1));
      },
    };
    hydration.fallback = setTimeout(() => hydration.release(), 3000);
    void (async () => {
      if (src) {
        hydration.release();
        return;
      }
      if (!host.current) return;
      const n = host.current;
      let exts: Promise<Extension[]> | Extension[] = (async (): Promise<Extension[]> => {
        const lang = langOf(langRef.current);
        if (lang === 'md' || lang === 'markdown' || lang === 'mdx') return [markdown()];
        const parser = languages.find(
          (e) =>
            e.name.toLowerCase() === lang ||
            e.extensions.some((extension) => extension.toLowerCase() === lang),
        );
        if (!parser) return [];
        try {
          return [await parser.load()];
        } catch {
          return [];
        }
      })();
      exts = await exts;
      if (!a) return;
      view.current?.destroy();
      n.replaceChildren();
      const editorView = new EditorView({
        parent: n,
        state: EditorState.create({
          doc: codeRef.current,
          extensions: [
            theme.current.of(isDarkMode() ? dark : light),
            drawSelection(),
            history(),
            lineNumbers(),
            indentUnit.of('\t'),
            EditorState.allowMultipleSelections.of(true),
            ...(props.placeholder ? [cmPlaceholder(props.placeholder)] : []),
            keymap.of([
              ...standardKeymap,
              ...historyKeymap,
              {
                key: 'Mod-ArrowLeft',
                run: cursorLineBoundaryBackward,
                shift: selectLineBoundaryBackward,
              },
              {
                key: 'Mod-ArrowRight',
                run: cursorLineBoundaryForward,
                shift: selectLineBoundaryForward,
              },
              {
                key: 'Mod-Shift-l',
                run: (view) => {
                  const selectedLines = new Set<number>();
                  for (const range of view.state.selection.ranges) {
                    for (
                      let line = view.state.doc.lineAt(range.from).number;
                      line <=
                      view.state.doc.lineAt(
                        range.empty ? range.to : Math.max(range.to - 1, range.from),
                      ).number;
                      line++
                    )
                      selectedLines.add(line);
                  }
                  if (
                    !selectedLines.size ||
                    (selectedLines.size === 1 &&
                      view.state.selection.ranges.length === 1 &&
                      view.state.selection.main.empty)
                  )
                    return false;
                  view.dispatch({
                    selection: EditorSelection.create(
                      Array.from(selectedLines, (line) =>
                        EditorSelection.cursor(view.state.doc.line(line).to),
                      ),
                    ),
                    scrollIntoView: true,
                    userEvent: 'select',
                  });
                  return true;
                },
              },
              { key: 'Alt-ArrowUp', run: (view) => moveLineUp(view) },
              { key: 'Alt-ArrowDown', run: (view) => moveLineDown(view) },
              { key: 'Shift-Alt-ArrowUp', run: (view) => copyLineUp(view) },
              { key: 'Shift-Alt-ArrowDown', run: (view) => copyLineDown(view) },
              indentWithTab,
            ]),
            ...(locked || src
              ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
              : []),
            ...(Array.isArray(exts) ? exts : []),
            EditorView.updateListener.of((u) => {
              const lineSet = new Set<number>();
              for (const r of u.state.selection.ranges) {
                for (
                  let n = u.state.doc.lineAt(r.from).number - 1;
                  n <= u.state.doc.lineAt(r.empty ? r.to : Math.max(r.to - 1, r.from)).number - 1;
                  n++
                )
                  lineSet.add(n);
              }
              if (lineSet.size > 1) {
                u.view.dom.setAttribute(
                  'data-docs-multicursor',
                  JSON.stringify({ lines: Array.from(lineSet).sort((a, b) => a - b) }),
                );
              } else u.view.dom.removeAttribute('data-docs-multicursor');
              if (!u.docChanged || props.tone !== 'edit' || src || props.readOnly) return;
              codeRef.current = u.state.doc.toString();
              chgRef.current?.(codeRef.current);
            }),
            EditorView.domEventHandlers({
              blur: () => {
                if (props.tone !== 'edit' || props.readOnly) return;
                cmtRef.current?.(codeRef.current, langRef.current);
              },
              paste: (evt, v) => {
                if (props.tone !== 'edit' || props.readOnly) return false;
                if (!evt.clipboardData) return false;
                const html = evt.clipboardData.getData('text/html'),
                  plain = evt.clipboardData.getData('text/plain'),
                  types = Array.from(evt.clipboardData.types ?? []),
                  isVSCode = types.includes('vscode-editor-data');
                if (html && !isVSCode) {
                  const md = htmlToMd(html);
                  if (md && md !== plain) {
                    evt.preventDefault();
                    v.dispatch({
                      changes: {
                        from: v.state.selection.main.from,
                        to: v.state.selection.main.to,
                        insert: md,
                      },
                      selection: { anchor: v.state.selection.main.from + md.length },
                      scrollIntoView: true,
                    });
                    return true;
                  }
                }
                if (plain) {
                  let transformed = plain,
                    changed = false;
                  if (transformed.includes('/`/`/`')) {
                    transformed = transformed.replaceAll('/`/`/`', '```');
                    changed = true;
                  }
                  if (transformed.includes('&grave;')) {
                    transformed = transformed.replaceAll('&grave;', '&amp;grave;');
                    changed = true;
                  }
                  const table = mdTableToHtml(transformed);
                  if (table) {
                    transformed = table;
                    changed = true;
                  }
                  if (changed) {
                    evt.preventDefault();
                    v.dispatch({
                      changes: {
                        from: v.state.selection.main.from,
                        to: v.state.selection.main.to,
                        insert: transformed,
                      },
                      selection: { anchor: v.state.selection.main.from + transformed.length },
                      scrollIntoView: true,
                    });
                    return true;
                  }
                }
                return false;
              },
            }),
          ],
        }),
      });
      const codeInput = editorView.contentDOM;
      const onCodeEnter = (event: KeyboardEvent): void => {
        if (event.key !== 'Enter' || props.tone !== 'edit' || props.readOnly || src) return;
        const activeView = view.current;
        if (!activeView) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const { from, to } = activeView.state.selection.main;
        activeView.dispatch({
          changes: { from, to, insert: '\n' },
          selection: { anchor: from + 1 },
          scrollIntoView: true,
          userEvent: 'input.type',
        });
      };
      activeEnterHandler = onCodeEnter;
      codeInput.addEventListener('keydown', onCodeEnter, true);
      view.current = editorView;
      (editorView.dom as HTMLDivElement & { cmView?: { view: EditorView } }).cmView = {
        view: editorView,
      };
      if (expAll) {
        expand(view.current);
        queueMicrotask(() => {
          expand(view.current);
        });
        requestAnimationFrame(() => {
          expand(view.current);
          view.current?.requestMeasure();
          setTimeout(() => {
            expand(view.current);
            view.current?.requestMeasure();
          }, 250);
        });
      } else requestAnimationFrame(() => view.current?.requestMeasure());
      if (document.fonts) {
        try {
          await document.fonts.ready;
        } catch {
          // Font readiness is an optional measurement optimization.
        }
      }
      if (a) view.current?.requestMeasure();
      hydration.release();
    })();
    return () => {
      a = false;
      hydration.release();
      if (view.current) {
        if (activeEnterHandler)
          view.current.contentDOM.removeEventListener('keydown', activeEnterHandler, true);
        delete (view.current.dom as HTMLDivElement & { cmView?: { view: EditorView } }).cmView;
      }
      view.current?.destroy();
      view.current = null;
    };
  }, [expAll, locked, props.language, props.tone, src]);
  useEffect(() => {
    return $transition.listen((i) => {
      if (!i && view.current)
        requestAnimationFrame(() => {
          if (expAll) expand(view.current);
          view.current?.requestMeasure();
          setTimeout(() => {
            if (expAll) expand(view.current);
            view.current?.requestMeasure();
          }, 250);
        });
    });
  }, [expAll]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    /**
     * Synchronises the editor theme with the system preference.
     *
     * @returns Nothing.
     */
    const m = window.matchMedia('(prefers-color-scheme: dark)'),
      sync = (): void => {
        if (!view.current) return;
        view.current.dispatch({ effects: theme.current.reconfigure(isDarkMode() ? dark : light) });
      };
    sync();
    m.addEventListener('change', sync);
    return () => {
      m.removeEventListener('change', sync);
    };
  }, []);
  useEffect(() => {
    const n = codeVal();
    if (!view.current || view.current?.state.doc.toString() === n) return;
    view.current.dispatch({ changes: { from: 0, to: view.current.state.doc.length, insert: n } });
    codeRef.current = n;
    if (expAll) expand(view.current);
    view.current.requestMeasure();
  }, [expAll, props.code]);
  useEffect(() => {
    if (!src || !view.current || view.current?.state.doc.toString() === resCode) return;
    view.current.dispatch({
      changes: { from: 0, to: view.current.state.doc.length, insert: resCode },
    });
    codeRef.current = resCode;
    if (expAll) expand(view.current);
    view.current.requestMeasure();
  }, [expAll, resCode, src]);
  useLayoutEffect(() => {
    if (received.current && received.current.textContent !== resCode)
      received.current.textContent = resCode;
  }, [resCode]);
  useEffect(() => {
    if (!host.current || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const obs = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => view.current?.requestMeasure());
    });
    obs.observe(host.current);
    return () => {
      cancelAnimationFrame(frame);
      obs.disconnect();
    };
  }, []);

  // RENDER
  return (
    <ErrorBoundary name="CodeBlock">
      <div
        className={cn(
          'docs-code-block relative mb-10 mt-0 flow-root w-full max-w-full overflow-hidden rounded-sm border border-primary-6 bg-primary-1',
          '[&_.cm-editor]:!h-auto [&_.cm-editor]:!max-h-none [&_.cm-editor]:!bg-primary-1',
          '[&_.cm-scroller]:!h-auto [&_.cm-scroller]:!max-h-none [&_.cm-scroller]:overflow-x-auto [&_.cm-scroller]:overflow-y-hidden',
          '[&_.cm-scroller]:!text-[13px] [&_.cm-scroller]:!leading-[16px]',
          '[&_.cm-content]:!my-0 [&_.cm-content]:!min-h-0 [&_.cm-content]:whitespace-pre [&_.cm-content]:break-normal',
          '[&_.cm-line]:!min-h-[16px]',
          '[&_.cm-gutters]:!border-r [&_.cm-gutters]:!border-r-primary-6 [&_.cm-gutters]:!bg-primary-1 [&_.cm-gutters]:!text-primary-10',
          '[&_.cm-gutterElement]:!font-mono [&_.cm-gutterElement]:!text-[13px] [&_.cm-gutterElement]:!tabular-nums',
          fullHeight &&
            'flex min-h-[50vh] flex-col [&_.cm-editor]:!min-h-[calc(50vh-1.75rem)] [&_.cm-scroller]:!min-h-[calc(50vh-1.75rem)]',
          'transition-all duration-200',
          props.className,
        )}
        data-docs-code-block={props.tone}
        data-docs-code-editor
        data-docs-code-source={src || 'local'}
        contentEditable={props.tone === 'edit' ? false : undefined}
        suppressContentEditableWarning
      >
        <div className="docs-code-block-header flex items-center justify-between gap-2 border-b border-primary-6 bg-primary-2 px-2 py-px">
          {props.tone === 'view' ||
          !(props.tone === 'edit' ? props.languageEditable !== false && !src : false) ? (
            <p className="!my-0 text-xs font-medium text-primary-11">{langOf(curLang)}</p>
          ) : (
            <Select
              size="xs"
              value={curLang}
              onValueChange={(v) => {
                langRef.current = langOf(v);
                props.onLanguageChange?.(langRef.current, codeRef.current);
              }}
            >
              <SelectTrigger aria-label="Select code language">
                <span aria-label={curLang}>{langOf(curLang)}</span>
              </SelectTrigger>
              <SelectContent align="start">
                {(LANGS.includes(langOf(props.language) as (typeof LANGS)[number])
                  ? LANGS
                  : [...LANGS, langOf(props.language)]
                ).map((v) => (
                  <SelectItem key={v} value={v}>
                    {langOf(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="xs"
            className="aspect-square size-6"
            aria-label={copied ? 'Copied' : 'Copy'}
            title={copied ? 'Copied' : 'Copy'}
            onClick={() => {
              void navigator.clipboard
                .writeText(src ? received.current?.textContent || resCode : resCode)
                .then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1200);
                });
            }}
          >
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          </Button>
        </div>
        <div
          {...(!src && { ref: host })}
          className={cn(
            'docs-code-block-body w-full max-w-full overflow-x-auto overflow-y-hidden text-inherit',
            fullHeight && 'min-h-0 flex-1',
          )}
        >
          {src ? (
            <div
              className="min-w-0 max-w-full"
              data-docs-code-source={src}
              data-state={receivedState}
            >
              <div hidden={receivedState !== 'loading'} className="p-3">
                <BlockSkeleton source={src} />
              </div>
              <div hidden={receivedState !== 'error'}>
                <AlertError title="API value unavailable" description={receivedErr} />
              </div>
              <code
                ref={received}
                hidden={receivedState !== 'received'}
                className="block whitespace-pre p-3"
                data-docs-code-received
                data-docs-code-source={src}
                data-state={receivedState}
              />
            </div>
          ) : (
            <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden">
              {
                /* prettier-ignore */ props.tone === 'view' ? (
		<div className='docs-code-block-fb m-0 flex max-w-full flex-col overflow-x-auto overflow-y-hidden bg-transparent p-0 text-sm leading-6' data-docs-code-fb='true'>
			{(props.tone === 'view' ? resCode.replace(TerraQualityRegex.REGEX_R_N_G_REGEX(), '\n').split('\n') : []).map((l, i) => (
				<div key={i} className='docs-code-block-fallback-line flex min-w-full text-sm leading-6'>
					<div className='min-w-10 shrink-0 select-none border-r border-primary-6 px-2 text-right font-mono tabular-nums leading-6 text-primary-10'>{i + 1}</div>
					<span className='block whitespace-pre px-1 leading-6 text-inherit'>{l || ' '}</span>
				</div>
			))}
		</div>
	) : <div className='docs-code-block-fb m-0 max-w-full overflow-x-auto overflow-y-hidden whitespace-pre bg-transparent p-0 text-inherit' data-docs-code-fb='true'>{resCode}</div>
              }
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
