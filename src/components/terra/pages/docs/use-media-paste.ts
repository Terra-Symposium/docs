// @ts-nocheck -- Docs media paste behavior is attached to a mounted browser editor.
/** Handles editor media paste, drag, and drop interactions. */
import React, { useEffect } from 'react';
import { $cursor, $cursorGhost, $cursorPosition } from '../../../../lib/terra/docs/state.js';
import {
  captureNodePath,
  codeViewOf,
  document,
  htmlToMd,
  pasteMd,
} from '../../../../lib/terra/docs/editor-dom.js';
import { notify } from '../../../../lib/terra/runtime/runtime.js';
import { IMAGE_TYPES, MIME } from '../../../../lib/terra/runtime/shared.js';
import { mdTableToHtml } from '../../../../lib/terra/runtime/content/markdown.js';
import { toImgAlt, toImgMd } from './_blocks.js';
import * as TerraQualityRegex from '../../../../lib/terra/regex.mjs';
import type { EditorRefs } from '../../../../lib/terra/runtime/types.js';

export function useMediaPaste(
  refs: React.MutableRefObject<EditorRefs>,
  insert: (md: string, rootEnd?: boolean) => void,
  uploadFile: (file: File) => Promise<string>,
  attachFiles: (files: File[]) => Promise<void>,
) {
  useEffect(() => {
    if (!document) return;

    // DROP
    /**
     * Moves the move Drop Caret for the docs.
     *
     * @param e - Value passed to the helper.
     */
    const moveDropCaret = (e: DragEvent): void => {
      try {
        const root = refs.current?.body;
        const transfer = e.dataTransfer;
        if (!transfer || !root) return;
        if (
          !['Files', 'text/html', 'text/plain', 'text/uri-list'].some((t) =>
            Array.from(transfer.types ?? []).includes(t),
          )
        )
          return;
        const range =
          document.caretRangeFromPoint?.(e.clientX, e.clientY) ??
          (() => {
            const pos = document.caretPositionFromPoint?.(e.clientX, e.clientY);
            if (!pos) return null;
            const n = document.createRange();
            n.setStart(pos.offsetNode, pos.offset);
            n.collapse(true);
            return n;
          })();
        if (!range || !root.contains(range.startContainer)) return;
        const sel = window.getSelection();
        if (!sel) return;
        sel.removeAllRanges();
        sel.addRange(range);
        e.preventDefault();
      } catch (err: unknown) {
        console.error('[docs:edit] Drop event failed', err);
      }
    };
    /**
     * Handles on drop.
     *
     * @param e - Editor event carrying the changed Docs content.
     */
    const onDrop = (e: DragEvent): void => {
      try {
        const dropped = Array.from(e.dataTransfer?.files ?? []);
        if (!dropped.length || !refs.current.body) return;
        e.preventDefault();
        e.stopPropagation();
        const files = dropped.filter((f) => {
          const ext = f.name.match(TerraQualityRegex.REGEX_PATTERN_REGEX())?.[0].toLowerCase();
          return Boolean(
            (f.type && f.type in MIME) ||
            (ext && Object.values(MIME).includes(ext as (typeof MIME)[keyof typeof MIME])),
          );
        });
        if (!files.length) {
          notify({
            error: new Error('Dropped files are not permitted attachments.'),
            fallback: 'Only permitted file types can be attached.',
          });
          return;
        }
        void attachFiles(files).catch((e: unknown) => {
          notify({
            error: e instanceof Error ? e : new Error(String(e)),
            fallback: 'Failed to add dropped attachments.',
          });
        });
      } catch (err: unknown) {
        console.error('[docs:edit] Attachment drop failed', err);
      }
    };

    // PASTE
    /**
     * Handles clipboard.
     *
     * @param data - Source data to transform.
     * @param e - Value passed to the helper.
     */
    const handleClipboard = (
      data: DataTransfer,
      e: Pick<Event, 'preventDefault' | 'stopImmediatePropagation' | 'stopPropagation'>,
    ): void => {
      const view = codeViewOf();
      const sel = window.getSelection();
      const savedSel =
        refs.current.selection ?? $cursorPosition.get() ?? $cursor.get() ?? $cursorGhost.get();
      if (!refs.current.selection && view && view.dom.offsetParent !== null) {
        refs.current.selection = {
          code: { from: view.state.selection.main.from, to: view.state.selection.main.to },
          collapsed: view.state.selection.main.empty,
          dom: null,
          visible: true,
        };
        $cursorPosition.set({
          code: { from: view.state.selection.main.from, to: view.state.selection.main.to },
          collapsed: view.state.selection.main.empty,
          dom: null,
          visible: true,
        });
        $cursor.set({
          code: { from: view.state.selection.main.from, to: view.state.selection.main.to },
          collapsed: view.state.selection.main.empty,
          dom: null,
          visible: true,
        });
      } else if (!refs.current.selection && sel?.rangeCount && sel.anchorNode) {
        const ce = (
          sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement
        )?.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]');
        if (ce && refs.current.body?.contains(ce)) {
          const dom = sel.getRangeAt(0).cloneRange();
          const rect = dom.getBoundingClientRect();
          const anchorPath = captureNodePath(refs.current.body, sel.anchorNode);
          const focusPath = captureNodePath(refs.current.body, sel.focusNode);
          refs.current.selection = {
            anchorOffset: sel.anchorOffset,
            anchorPath,
            anchorText: sel.anchorNode?.textContent || undefined,
            box:
              rect.width || rect.height
                ? {
                    height: Math.max(16, rect.height || 0),
                    left: rect.left,
                    top: rect.top,
                    width: Math.max(2, rect.width || 0),
                  }
                : undefined,
            collapsed: sel.isCollapsed,
            code: null,
            dom,
            focusOffset: sel.focusOffset,
            focusPath,
            focusText: sel.focusNode?.textContent || undefined,
            text: sel.toString(),
            visible: true,
          };
          $cursorPosition.set({
            anchorOffset: sel.anchorOffset,
            anchorPath,
            anchorText: sel.anchorNode?.textContent || undefined,
            box:
              rect.width || rect.height
                ? {
                    height: Math.max(16, rect.height || 0),
                    left: rect.left,
                    top: rect.top,
                    width: Math.max(2, rect.width || 0),
                  }
                : undefined,
            collapsed: sel.isCollapsed,
            code: null,
            dom,
            focusOffset: sel.focusOffset,
            focusPath,
            focusText: sel.focusNode?.textContent || undefined,
            text: sel.toString(),
            visible: true,
          });
          $cursor.set({
            anchorOffset: sel.anchorOffset,
            anchorPath,
            anchorText: sel.anchorNode?.textContent || undefined,
            box:
              rect.width || rect.height
                ? {
                    height: Math.max(16, rect.height || 0),
                    left: rect.left,
                    top: rect.top,
                    width: Math.max(2, rect.width || 0),
                  }
                : undefined,
            collapsed: sel.isCollapsed,
            code: null,
            dom,
            focusOffset: sel.focusOffset,
            focusPath,
            focusText: sel.focusNode?.textContent || undefined,
            text: sel.toString(),
            visible: true,
          });
        }
      }
      const html = data.getData('text/html');
      let plain = data.getData('text/plain');
      const types = Array.from(data.types ?? []);
      const richClipboard =
        /<(?:AccordionGroup|AccordionItem|Code|Testimonials|TabsGroup|TabsItem|Leaf|DocsTable|TsDocs|Nodes)\b|<table\b|===|\|\|\||:::/i.test(
          `${html || ''}\n${plain || ''}`,
        );
      // CRITICAL BYPASS: Let Lexical handle pasting its own native blocks.
      if (
        (types.includes('application/x-lexical-editor') ||
          (html && html.includes('data-lexical-decorator'))) &&
        !richClipboard
      )
        return;
      if (richClipboard) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      // Intercept and sanitize triple character blocks inside raw clipboard copies
      if (plain && plain.includes('|||'))
        plain = plain
          .replace(/([^\n])[ \t]*\|\|\|/g, '$1\n\n|||')
          .replace(/\|\|\|[ \t]*([^\n])/g, '|||\n\n$1');
      if (richClipboard && plain) {
        pasteMd(
          insert,
          ((md: string): string => {
            if (!md) return '';
            return [
              ...new Set([
                ...customComponents.map((component) => component.name),
                'AccordionGroup',
                'AccordionItem',
                'Aside',
                'Code',
                'DocsMath',
                'DocsTable',
                'Embed',
                'Leaf',
                'Nodes',
                'TabsGroup',
                'TabsItem',
                'TsDocs',
              ]),
            ]
              .sort((left, right) => right.length - left.length)
              .reduce(
                (v, name) =>
                  v.replace(
                    new RegExp(
                      `(<\\/?\\s*)${name.replace(TerraQualityRegex.REGEX_G_REGEX_9(), '\\$&')}(?=\\b)`,
                      'gi',
                    ),
                    (_, prefix: string) => `${prefix}${name}`,
                  ),
                md,
              );
          })(plain),
          savedSel,
        );
        if (refs.current && refs.current.norm) {
          refs.current.norm.force = true;
          refs.current.norm.replay = true;
        }
        return;
      }
      if (html && !types.includes('vscode-editor-data')) {
        const md = htmlToMd(html);
        if (md && md !== plain) {
          pasteMd(insert, md, savedSel);
          if (refs.current && refs.current.norm) {
            refs.current.norm.force = true;
            refs.current.norm.replay = true;
          }
          return;
        }
      }
      if (plain) {
        let transformed = plain;
        let changed = false;
        if (/^[ \t]*\\`\\`\\`/gm.test(transformed)) {
          transformed = transformed.replace(/^([ \t]*)\\`\\`\\`/gm, '$1```');
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
          pasteMd(insert, transformed, savedSel);
          if (refs.current && refs.current.norm) {
            refs.current.norm.force = true;
            refs.current.norm.replay = true;
          }
          return;
        }
      }
      const file = Array.from(data.files ?? []).find(
        (f) => f.type.startsWith('image/') || f.type === 'application/pdf',
      );
      if (file && file.size > 0) {
        const isPdf = file.type === 'application/pdf';
        const optimistic = URL.createObjectURL(file);
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const lbl = toImgAlt(file.name || (isPdf ? 'document' : 'image'));
        pasteMd(
          insert,
          isPdf ? `\n<Embed src="${optimistic}" title="${lbl}" />\n` : toImgMd(optimistic, lbl),
          savedSel,
        );
        void uploadFile(file).catch((e: unknown) => {
          notify({
            error: e instanceof Error ? e : new Error(String(e)),
            fallback: `Failed to upload pasted ${isPdf ? 'PDF' : 'image'}. Local changes were kept.`,
          });
        });
        if (refs.current && refs.current.norm) {
          refs.current.norm.force = true;
          refs.current.norm.replay = true;
        }
        return;
      }
      const remote = (() => {
        const isRemote = (val: string): boolean => {
          const trimmed = val.trim();
          if (!trimmed) return false;
          if (trimmed.startsWith('/api/media?')) return true;
          if (TerraQualityRegex.REGEX_HTTPS_I_REGEX().test(trimmed)) {
            try {
              const imgUrl = new URL(trimmed);
              if (
                imgUrl.pathname === '/api/media' ||
                /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(imgUrl.pathname + imgUrl.search)
              )
                return true;
            } catch {
              return false;
            }
          }
          try {
            return (
              /^https?:$/i.test(new URL(trimmed).protocol) &&
              new RegExp(
                `\\.(${Object.values(IMAGE_TYPES)
                  .map((extension) => extension.substring(1))
                  .join('|')})(?:$|[?#])`,
                'i',
              ).test(trimmed)
            );
          } catch {
            return false;
          }
        };
        const html = data.getData('text/html').trim();
        if (html) {
          const match = html.match(/<img\b[^>]*\bsrc=(['"])(.*?)\1/i)?.[2]?.trim();
          if (match && isRemote(match)) return match;
        }
        for (const type of ['text/uri-list', 'text/plain']) {
          const val = data.getData(type).trim();
          if (val && isRemote(val)) return val;
        }
        return null;
      })();
      if (!remote) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      pasteMd(insert, toImgMd(remote, toImgAlt(remote.split('/').at(-1) ?? 'image')), savedSel);
      if (refs.current && refs.current.norm) {
        refs.current.norm.force = true;
        refs.current.norm.replay = true;
      }
    };
    /**
     * On paste.
     *
     * @param e - Value passed to the helper.
     */
    const onPaste = (e: ClipboardEvent): void => {
      try {
        if (e.clipboardData) handleClipboard(e.clipboardData, e);
      } catch (err: unknown) {
        console.error('[docs:edit] Paste event failed', err);
      }
    };
    /**
     * On before input.
     *
     * @param e - Value passed to the helper.
     */
    const onBeforeInput = (e: InputEvent): void => {
      try {
        if (e.inputType !== 'insertFromPaste' && e.inputType !== 'insertReplacementText') return;
        if (!e.dataTransfer) return;
        handleClipboard(e.dataTransfer, e);
      } catch (err: unknown) {
        console.error('[docs:edit] Beforeinput paste event failed', err);
      }
    };
    document.addEventListener('dragover', moveDropCaret, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('beforeinput', onBeforeInput, true);
    return () => {
      document.removeEventListener('dragover', moveDropCaret, true);
      document.removeEventListener('drop', onDrop, true);
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('beforeinput', onBeforeInput, true);
    };
  }, [attachFiles, insert, refs, uploadFile]);
}
