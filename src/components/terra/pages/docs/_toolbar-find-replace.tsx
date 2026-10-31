// @ts-nocheck -- host toolbar adapter contracts are typed in src/host.ts.
/** Find and replace content in the active Docs editor surface. */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as TerraQualityRegex from '../../../../lib/terra/regex.mjs';
import { toast } from 'sonner';
import {
  ArrowLeft as LeftArrowIcon,
  ArrowRight as RightArrowIcon,
  ButtonCentered as FullWordIcon,
  CharacterPatterns as ReplaceIcon,
  CharacterSentenceCase as CaseIcon,
  Search as SearchIcon,
} from '@carbon/icons-react';
import {
  Button as UiButton,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  Toggle,
} from '@terra-symposium/styling/ui';
import type { Mode as ToolbarMode, ToolbarState } from '../../../../lib/terra/runtime/types.js';

const FIND_WORD = String.raw`[\p{L}\p{N}_]`;

const BLIND_REGEX = [
  /<[^>]+>/gu,
  /^[\t ]*(?:#{1,6}|>+|[-+*]|\d+\.)[\t ]*/gmu,
  /:::[^\n]*|===|\|\|\|/gu,
  /[`*_~[\]()]/gu,
  /\s+/gu,
] as const;

function looksLikeJsonBlob(val: string): boolean {
  const v = val.trim();
  // prettier-ignore
  return ['{}', '[]'].some(p => v.startsWith(p[0]) && v.endsWith(p[1])) && v.length > 80;
}

/**
 * Complex Popover enabling blind/case-sensitive searches and sequential replacement inside active viewports.
 *
 * @param props - Active editing mode and toolbar state used to find text and apply replacements in the current editor.
 * @param {ToolbarMode} props.mode - The active interface mode determining search limits.
 * @param {ToolbarState | null} props.toolbar - System toolbar state reference to execute replacements.
 *
 * @return {JSX.Element | null} The Find and Replace popover or null in view mode.
 */
export function FindReplace({
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
}
