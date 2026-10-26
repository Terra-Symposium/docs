// @ts-nocheck -- Docs editor navigation tracks browser selection across block hydration.
/** Maintains keyboard, pointer, and selection navigation across Docs editor blocks. */
import React, { useEffect, useRef } from 'react';
import {
  $cursor,
  $cursorGhost,
  $cursorPosition,
  $cursorTrack,
} from '../../../../lib/terra/docs/state.js';
import {
  captureLinearOffset,
  captureNodePath,
  codeViewOf,
  document,
  getCollapsedRange,
} from '../../../../lib/terra/docs/editor-dom.js';
import * as TerraQualityRegex from '../../../../lib/terra/regex.mjs';
import type { EditorRefs } from '../../../../lib/terra/runtime/types.js';

export function useBlockNav(refs: React.MutableRefObject<EditorRefs>) {
  // REFS
  const bCursor = useRef<{
    dec: HTMLElement;
    gId: string | null;
    label: string;
    side: 'left' | 'right';
    wrapper: HTMLElement;
  } | null>(null);
  const vCursor = useRef(0);
  const vPending = useRef<{
    beforeAnchor: Node | null;
    beforeBlock: Element | null;
    before: Range | null;
    beforeRect: { bottom: number; top: number } | null;
    dec: HTMLElement | null;
    dir: 'left' | 'right';
  } | null>(null);
  const restoreCursor = useRef(0);

  // EFFECTS
  useEffect(() => {
    const EDITABLE = [
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]',
      '[contenteditable="plaintext-only"]',
      '.cm-editor',
      'td',
      'th',
    ].join(', ');
    const INTERACTIVE = [
      'button',
      'a[href]',
      '[role="button"]',
      '[role="tab"]',
      '[tabindex]:not([tabindex="-1"])',
      '[data-tool-cell]',
    ].join(', ');
    /**
     * Returns the root.
     *
     * @returns root.
     */
    const root = (): HTMLElement | null => refs.current?.body ?? null;
    /**
     * Checks whether the value is editable.
     *
     * @returns editable.
     */
    const editable = (): HTMLElement | null =>
      root()?.querySelector<HTMLElement>('[contenteditable="true"]') ?? null;

    /**
     * Gets active editable.
     *
     * @returns resolved value.
     */
    const getActiveEditable = (): HTMLElement | null => {
      if (bCursor.current)
        return (
          bCursor.current.dec.parentElement?.closest<HTMLElement>(
            '[contenteditable="true"], [contenteditable="plaintext-only"]',
          ) ?? editable()
        );
      const sel = window.getSelection();
      if (sel?.anchorNode) {
        const ce = (
          sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement
        )?.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]');
        if (ce) return ce;
      }
      return editable();
    };

    /**
     * Checks whether local text.
     *
     * @param node - Value passed to the helper.
     *
     * @returns True when the helper predicate succeeds.
     */
    const isLocalText = (node: Node | null): boolean => {
      const ce = getActiveEditable();
      if (!node || !ce) return false;
      const el = node instanceof Element ? node : node.parentElement;
      if (!el) return false;
      const childDec = el.closest<HTMLElement>('[data-lexical-decorator="true"]');
      return !childDec || !ce.contains(childDec);
    };

    /**
     * Sets block cursor active.
     *
     * @param active - Value passed to the helper.
     */
    const setBlockCursorActive = (a: boolean): void => {
      if (!refs.current?.body) return;
      if (a) refs.current.body.dataset.docsBlockCursorActive = 'true';
      else delete refs.current.body.dataset.docsBlockCursorActive;
    };

    /**
     * Restores the restore Saved Selection.
     *
     * @param _reason - Value passed to the helper.
     */
    const restoreSavedSelection = (_reason: string): void => {
      const saved =
        refs.current.selection ?? $cursorPosition.get() ?? $cursor.get() ?? $cursorGhost.get();
      if (!saved) return;
      const view = codeViewOf();
      if (view && view.dom.offsetParent !== null && saved.code) {
        $cursorTrack.set({
          anchor: saved.code.from,
          collapsed: saved.code.from === saved.code.to,
          focus: saved.code.to,
          range: [saved.code.from, saved.code.to],
          visible: true,
        });
        $cursorPosition.set({
          code: { from: saved.code.from, to: saved.code.to },
          dom: null,
          visible: true,
        });
        $cursor.set({
          code: { from: saved.code.from, to: saved.code.to },
          dom: null,
          visible: true,
        });
        $cursorGhost.set({
          code: { from: saved.code.from, to: saved.code.to },
          dom: null,
          visible: true,
        });
        refs.current.selection = {
          ...saved,
          code: { from: saved.code.from, to: saved.code.to },
          dom: null,
          visible: true,
        };
        view.dispatch({
          selection: { anchor: saved.code.from, head: saved.code.to },
          scrollIntoView: false,
        });
        return;
      }
      const body = refs.current.body;
      if (!body) return;
      const sel = window.getSelection();
      if (!sel) return;
      /**
       * Returns the pick path.
       *
       * @param path - Path to process.
       * @param offset - Value passed to the helper.
       *
       * @returns pick Path.
       */
      const pickPath = (path?: number[], offset?: number): Range | null => {
        if (!path?.length) return null;
        let node: Node | null = body;
        for (const idx of path) {
          if (!node?.childNodes[idx]) {
            node = null;
            break;
          }
          node = node.childNodes[idx] ?? null;
        }
        if (!(node instanceof Text)) return null;
        const range = document.createRange();
        range.setStart(node, Math.min(offset ?? 0, node.textContent?.length ?? 0));
        range.collapse(true);
        return range;
      };
      /**
       * Returns the pick text.
       *
       * @param text - Text content to process.
       * @param offset - Value passed to the helper.
       *
       * @returns pick Text.
       */
      const pickText = (text?: string, offset?: number): Range | null => {
        if (!text) return null;
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) =>
            node.textContent?.includes(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
        });
        let node = walker.nextNode();
        while (node) {
          if (node instanceof Text) {
            const i = node.textContent?.indexOf(text) ?? -1;
            if (i !== -1) {
              const range = document.createRange();
              range.setStart(node, Math.min(i + (offset ?? 0), node.textContent?.length ?? 0));
              range.collapse(true);
              return range;
            }
          }
          node = walker.nextNode();
        }
        return null;
      };
      const n =
        pickPath(saved.anchorPath ?? undefined, saved.anchorOffset) ??
        pickText(saved.anchorText, saved.anchorOffset) ??
        pickPath(saved.focusPath ?? undefined, saved.focusOffset) ??
        pickText(saved.focusText, saved.focusOffset) ??
        (saved.dom && body.contains(saved.dom.commonAncestorContainer)
          ? saved.dom.cloneRange()
          : null);
      if (!n) return;
      sel.removeAllRanges();
      sel.addRange(n.cloneRange());
      const rect = n.getBoundingClientRect();
      const box =
        rect.width || rect.height
          ? {
              height: Math.max(16, rect.height || 0),
              left: rect.left,
              top: rect.top,
              width: Math.max(2, rect.width || 0),
            }
          : saved.box;
      const anchorLinear =
        typeof saved.anchorLinear === 'number'
          ? saved.anchorLinear
          : captureLinearOffset(body, n.startContainer, n.startOffset);
      const focusLinear = typeof saved.focusLinear === 'number' ? saved.focusLinear : anchorLinear;
      $cursorTrack.set({
        anchor: anchorLinear ?? 0,
        box,
        collapsed: n.collapsed,
        focus: focusLinear ?? anchorLinear ?? 0,
        range: [anchorLinear ?? 0, focusLinear ?? anchorLinear ?? 0],
        visible: true,
      });
      $cursorPosition.set({
        anchorOffset: saved.anchorOffset,
        anchorPath: saved.anchorPath,
        anchorText: saved.anchorText,
        anchorLinear,
        box,
        collapsed: n.collapsed,
        code: null,
        dom: n.cloneRange(),
        focusOffset: saved.focusOffset,
        focusPath: saved.focusPath,
        focusText: saved.focusText,
        focusLinear,
        text: saved.text,
        visible: true,
      });
      $cursor.set({
        anchorOffset: saved.anchorOffset,
        anchorPath: saved.anchorPath,
        anchorText: saved.anchorText,
        anchorLinear,
        box,
        collapsed: n.collapsed,
        code: null,
        dom: n.cloneRange(),
        focusOffset: saved.focusOffset,
        focusPath: saved.focusPath,
        focusText: saved.focusText,
        focusLinear,
        text: saved.text,
        visible: true,
      });
      $cursorGhost.set({
        anchorOffset: saved.anchorOffset,
        anchorPath: saved.anchorPath,
        anchorText: saved.anchorText,
        anchorLinear,
        box,
        collapsed: n.collapsed,
        code: null,
        dom: n.cloneRange(),
        focusOffset: saved.focusOffset,
        focusPath: saved.focusPath,
        focusText: saved.focusText,
        focusLinear,
        text: saved.text,
        visible: true,
      });
      refs.current.selection = {
        ...saved,
        anchorLinear,
        box,
        collapsed: n.collapsed,
        code: null,
        dom: n.cloneRange(),
        focusLinear,
        visible: true,
      };
      setBlockCursorActive(Boolean(bCursor.current));
    };

    /**
     * Checks whether toolbar target.
     *
     * @param target - Value passed to the helper.
     *
     * @returns True when the helper predicate succeeds.
     */
    const isToolbarTgt = (tgt: HTMLElement | null): boolean =>
      !!tgt?.closest(
        '[data-docs-main-toolbar], [data-docs-toolbar-frame], [data-toolbar="true"], [role="toolbar"], [role="dialog"], [role="menu"], [role="menuitem"], [data-radix-popper-content-wrapper]',
      );

    /**
     * Snapshot selection.
     *
     */
    const snapshotSelection = (): void => {
      const sel = window.getSelection();
      const view = codeViewOf();
      if (view && view.dom.offsetParent !== null) {
        refs.current.selection = {
          code: { from: view.state.selection.main.from, to: view.state.selection.main.to },
          collapsed: view.state.selection.main.empty,
          dom: null,
          visible: true,
        };
        $cursorTrack.set({
          anchor: view.state.selection.main.from,
          collapsed: view.state.selection.main.empty,
          focus: view.state.selection.main.to,
          range: [view.state.selection.main.from, view.state.selection.main.to],
          visible: true,
        });
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
        $cursorGhost.set({
          code: { from: view.state.selection.main.from, to: view.state.selection.main.to },
          collapsed: view.state.selection.main.empty,
          dom: null,
          visible: true,
        });
        return;
      }
      if (sel?.rangeCount && sel.anchorNode) {
        const ce = (
          sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement
        )?.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]');
        if (ce && refs.current.body?.contains(ce)) {
          const dom = sel.getRangeAt(0).cloneRange();
          const rect = dom.getBoundingClientRect();
          const anchorPath = captureNodePath(refs.current.body, sel.anchorNode);
          const focusPath = captureNodePath(refs.current.body, sel.focusNode);
          const anchorLinear = captureLinearOffset(
            refs.current.body,
            sel.anchorNode,
            sel.anchorOffset,
          );
          const focusLinear = captureLinearOffset(
            refs.current.body,
            sel.focusNode,
            sel.focusOffset,
          );
          $cursorTrack.set({
            anchor: anchorLinear ?? 0,
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
            focus: focusLinear ?? anchorLinear ?? 0,
            range: [anchorLinear ?? 0, focusLinear ?? anchorLinear ?? 0],
            visible: true,
          });
          refs.current.selection = {
            anchorOffset: sel.anchorOffset,
            anchorPath,
            anchorText: sel.anchorNode?.textContent || undefined,
            anchorLinear,
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
            focusLinear,
            text: sel.toString(),
            visible: true,
          };
          $cursorPosition.set({
            anchorOffset: sel.anchorOffset,
            anchorPath,
            anchorText: sel.anchorNode?.textContent || undefined,
            anchorLinear,
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
            focusLinear,
            text: sel.toString(),
            visible: true,
          });
          $cursor.set({
            anchorOffset: sel.anchorOffset,
            anchorPath,
            anchorText: sel.anchorNode?.textContent || undefined,
            anchorLinear,
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
            focusLinear,
            text: sel.toString(),
            visible: true,
          });
          $cursorGhost.set({
            anchorOffset: sel.anchorOffset,
            anchorPath,
            anchorText: sel.anchorNode?.textContent || undefined,
            anchorLinear,
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
            focusLinear,
            text: sel.toString(),
            visible: true,
          });
        }
      }
    };

    /**
     * Returns the clear.
     *
     */
    const clear = (): void => {
      window.cancelAnimationFrame(vCursor.current);
      vPending.current = null;
      if (bCursor.current) {
        bCursor.current.wrapper.removeAttribute('data-docs-block-cursor');
        setBlockCursorActive(false);
        bCursor.current = null;
      }
    };

    /**
     * Returns the restore.
     *
     * @returns True when the helper predicate succeeds.
     */
    const restore = (): boolean => {
      const { current: cur } = bCursor;
      const body = root();
      if (!cur || !body) return false;
      const matches = Array.from(
        body.querySelectorAll<HTMLElement>('[data-docs-editor-block]'),
      ).filter((w) => w.getAttribute('data-docs-editor-block') === cur.label);
      const nWrapper =
        matches.find((w) => {
          if (!cur.gId) return false;
          return (
            (w.matches('[data-docs-focus-group-id]')
              ? w
              : w.querySelector<HTMLElement>('[data-docs-focus-group-id]')
            )?.getAttribute('data-docs-focus-group-id') === cur.gId
          );
        }) ?? matches[0];
      if (!nWrapper) return false;
      const n = nWrapper.closest<HTMLElement>('[data-lexical-decorator="true"]') ?? nWrapper;
      nWrapper.dataset.docsBlockCursor = 'true';
      setBlockCursorActive(true);
      bCursor.current = { ...cur, dec: n, wrapper: nWrapper };
      // natively select the node so Lexical restores its internal state
      const selection = { body: getActiveEditable(), range: window.getSelection() };
      if (selection.body && selection.range) {
        const range = document.createRange();
        range.selectNode(n);
        selection.range.removeAllRanges();
        selection.range.addRange(range);
      }
      const ghost = document.createRange();
      ghost.selectNode(n);
      $cursor.set({ code: null, dom: ghost, visible: true });
      return true;
    };

    /**
     * G dec.
     *
     * @param dec - Value passed to the helper.
     *
     * @returns g Dec.
     */
    const gDec = (dec: HTMLElement): HTMLElement => {
      const body = root();
      const marker = dec.matches('[data-docs-focus-group-id]')
        ? dec
        : dec.querySelector<HTMLElement>('[data-docs-focus-group-id]');
      const gId = marker?.getAttribute('data-docs-focus-group-id');
      if (!body || !gId || marker?.getAttribute('data-docs-focus-group') !== 'member') return dec;
      const gRoot = body.querySelector<HTMLElement>(
        `[data-docs-focus-group="root"][data-docs-focus-group-id="${gId}"]`,
      );
      return gRoot?.closest<HTMLElement>('[data-lexical-decorator="true"]') ?? gRoot ?? dec;
    };

    /**
     * G decs.
     *
     * @param _vertical - Value passed to the helper.
     *
     * @returns g Decs.
     */
    const gDecs = (_vertical = false): HTMLElement[] => {
      const ce = getActiveEditable();
      if (!ce) return [];
      const seen = new Set<HTMLElement>();
      return [
        ...Array.from(ce.querySelectorAll<HTMLElement>('[data-lexical-decorator="true"]')),
        ...Array.from(ce.querySelectorAll<HTMLElement>('[data-docs-editor-block]')).filter(
          (b) => !b.closest('[data-lexical-decorator="true"]'),
        ),
      ]
        .filter((e) => {
          if (
            e.parentElement?.closest<HTMLElement>(
              '[contenteditable="true"], [contenteditable="plaintext-only"]',
            ) !== ce
          )
            return false;
          return true;
        })
        .map(gDec)
        .filter((d) => {
          if (seen.has(d)) return false;
          seen.add(d);
          return true;
        })
        .sort((a, b) => {
          const pos = a.compareDocumentPosition(b);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        });
    };

    /**
     * Returns the focus target.
     *
     * @param tgt - Value passed to the helper.
     * @param side - Value passed to the helper.
     *
     * @returns True when the helper predicate succeeds.
     */
    const focusTgt = (tgt: HTMLElement, side: 'left' | 'right'): boolean => {
      tgt.focus({ preventScroll: true });
      if (!tgt.matches('[contenteditable="true"], [contenteditable="plaintext-only"]'))
        return document.activeElement === tgt;
      const sel = window.getSelection();
      if (!sel) return false;
      const walker = document.createTreeWalker(tgt, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          n.textContent?.replace(TerraQualityRegex.REGEX_U200B_G_REGEX(), '').trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP,
      });
      const texts: Text[] = [];
      let node = walker.nextNode();
      while (node) {
        if (node instanceof Text) texts.push(node);
        node = walker.nextNode();
      }
      const range = document.createRange();
      const text = side === 'right' ? texts[0] : texts[texts.length - 1];
      if (text) range.setStart(text, side === 'right' ? 0 : (text.textContent?.length ?? 0));
      else range.selectNodeContents(tgt);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    };

    /**
     * Returns the focusables.
     *
     * @param wrapper - Value passed to the helper.
     * @param pref - Value passed to the helper.
     *
     * @returns focusables.
     */
    const focusables = (wrapper: HTMLElement, pref = false): HTMLElement[] => {
      const seen = new Set<HTMLElement>();
      const gId = wrapper.getAttribute('data-docs-focus-group-id');
      return Array.from(
        wrapper.querySelectorAll<HTMLElement>(
          pref ? '[data-docs-focus-entry]' : [EDITABLE, INTERACTIVE].join(', '),
        ),
      ).filter((n) => {
        if (seen.has(n) || !n.isConnected) return false;
        seen.add(n);
        if (pref) {
          const owner = n.closest<HTMLElement>('[data-docs-editor-block]');
          if (
            owner &&
            owner !== wrapper &&
            (!gId || owner.getAttribute('data-docs-focus-group-id') !== gId)
          )
            return false;
        }
        if ('disabled' in n && (n as HTMLButtonElement | HTMLInputElement).disabled) return false;
        if (n.getAttribute('aria-hidden') === 'true' || n.closest('[aria-hidden="true"]'))
          return false;
        return !!n.getClientRects().length;
      });
    };

    /**
     * Nearest adjacent.
     *
     * @param dir - Directory entry to read.
     * @param vertical - Value passed to the helper.
     *
     * @returns nearest Adjacent.
     */
    const nearestAdjacent = (dir: 'left' | 'right', vertical = false): HTMLElement | null => {
      const range = getCollapsedRange();
      if (!range) return null;
      const decs = gDecs(vertical);
      if (dir === 'right') {
        return (
          decs.find((d) => {
            const edge = document.createRange();
            edge.setStartBefore(d);
            edge.collapse(true);
            return range.compareBoundaryPoints(Range.START_TO_START, edge) <= 0;
          }) ?? null
        );
      }
      for (let i = decs.length - 1; i >= 0; i--) {
        const d = decs[i]!;
        const edge = document.createRange();
        edge.setStartAfter(d);
        edge.collapse(true);
        if (range.compareBoundaryPoints(Range.START_TO_START, edge) >= 0) return d;
      }
      return null;
    };

    /**
     * Caret rect.
     *
     * @param dir - Directory entry to read.
     *
     * @returns caret Rect.
     */
    const caretRect = (dir: 'left' | 'right'): { bottom: number; top: number } | null => {
      const range = getCollapsedRange();
      if (!range) return null;
      const rects = Array.from(range.getClientRects());
      const rect =
        (dir === 'right' ? rects[rects.length - 1] : rects[0]) || range.getBoundingClientRect();
      return rect.width || rect.height ? { bottom: rect.bottom, top: rect.top } : null;
    };

    /**
     * Passed dec.
     *
     * @param dec - Value passed to the helper.
     * @param dir - Directory entry to read.
     * @param beforeAnchor - Value passed to the helper.
     * @param beforeBlock - Value passed to the helper.
     * @param before - Value passed to the helper.
     * @param aRect - Value passed to the helper.
     *
     * @returns True when the helper predicate succeeds.
     */
    const passedDec = (
      dec: HTMLElement,
      dir: 'left' | 'right',
      beforeAnchor: Node | null,
      beforeBlock: Element | null,
      before: Range | null,
      aRect: { bottom: number; top: number } | null,
    ): boolean => {
      const select = window.getSelection();
      if (!select?.rangeCount || !select.isCollapsed || !before || !aRect) return false;
      const block =
        (select.anchorNode instanceof Element
          ? select.anchorNode
          : select.anchorNode?.parentElement
        )?.closest('p, li, blockquote, h2, h3, h4, h5, h6, td, th') ?? null;
      if (select.anchorNode === beforeAnchor && block === beforeBlock) return false;
      // Ignore if we've escaped local boundary limits during native modification
      if (block && !isLocalText(block)) return false;
      const range = select.getRangeAt(0);
      const edge = document.createRange();
      const box = dec.getBoundingClientRect();
      const bRect = caretRect(dir);
      if (!bRect) return false;
      if (dir === 'right') edge.setStartAfter(dec);
      else edge.setStartBefore(dec);
      edge.collapse(true);
      const leeway = 10;
      // prettier-ignore
      return dir === 'right'
				? before.compareBoundaryPoints(Range.START_TO_START, edge) < 0 && range.compareBoundaryPoints(Range.START_TO_START, edge) >= 0 && aRect.bottom < box.top + leeway && bRect.bottom >= box.top - leeway
				: before.compareBoundaryPoints(Range.START_TO_START, edge) > 0 && range.compareBoundaryPoints(Range.START_TO_START, edge) <= 0 && aRect.top > box.bottom - leeway && bRect.top <= box.bottom + leeway;
    };

    /**
     * Selected dec.
     *
     * @param _vertical - Value passed to the helper.
     *
     * @returns selected Dec.
     */
    const selectedDec = (_vertical = false): HTMLElement | null => {
      const ce = getActiveEditable();
      if (!ce) return null;
      const range = getCollapsedRange();
      if (!range || !ce.contains(range.startContainer)) return null;
      const dec = (
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement
      )?.closest<HTMLElement>('[data-lexical-decorator="true"]');
      if (!dec || !ce.contains(dec) || dec === ce.closest('[data-lexical-decorator="true"]'))
        return null;
      return gDec(dec);
    };

    /**
     * Returns the focus block.
     *
     * @param dec - Value passed to the helper.
     * @param dir - Directory entry to read.
     */
    const focusBlock = (dec: HTMLElement, dir: 'left' | 'right'): void => {
      const cells = Array.from(dec.querySelectorAll<HTMLElement>('th, td')).filter(
        (c) => c.isContentEditable && c.getClientRects().length,
      );
      if (cells.length) {
        clear();
        focusTgt(
          dir === 'right' ? cells[0] : cells[cells.length - 1],
          dir === 'right' ? 'right' : 'left',
        );
        return;
      }
      focus(dec, dir === 'right' ? 'left' : 'right');
    };

    /**
     * Returns the focus.
     *
     * @param dec - Value passed to the helper.
     * @param side - Value passed to the helper.
     */
    const focus = (dec: HTMLElement, side: 'left' | 'right'): void => {
      const tgt = gDec(dec);
      const wrapper = tgt.querySelector<HTMLElement>('[data-docs-editor-block]') ?? tgt;
      const cursorMetadata = {
        marker: wrapper.matches('[data-docs-focus-group-id]')
          ? wrapper
          : wrapper.querySelector<HTMLElement>('[data-docs-focus-group-id]'),
        label: wrapper.getAttribute('data-docs-editor-block') ?? 'Block',
      };
      clear();
      const body = getActiveEditable();
      const sel = window.getSelection();
      if (body && sel) {
        body.focus({ preventScroll: true });
        const range = document.createRange();
        if (side === 'left') range.setStartBefore(tgt);
        else range.setStartAfter(tgt);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      wrapper.dataset.docsBlockCursor = 'true';
      setBlockCursorActive(true);
      bCursor.current = {
        dec: tgt,
        gId: cursorMetadata.marker?.getAttribute('data-docs-focus-group-id') ?? null,
        label: cursorMetadata.label,
        side,
        wrapper,
      };
      document.dispatchEvent(
        new CustomEvent('docs:block-selected', { detail: { block: wrapper } }),
      );
    };

    /**
     * On key down.
     *
     * @param e - Value passed to the helper.
     */
    const eHandlers = {
      onKeyDown(e: KeyboardEvent): void {
        try {
          if (e.defaultPrevented || e.altKey) return;
          const tgt = e.target instanceof HTMLElement ? e.target : null;
          const closestEditable = tgt?.closest<HTMLElement>('[contenteditable="true"]') ?? null;
          const key = e.key;
          const entry = tgt?.closest<HTMLElement>('[data-docs-focus-entry]') ?? null;
          if (
            (key === 'Enter' || key === ' ') &&
            entry?.matches('button, [role="button"], [role="tab"]')
          ) {
            e.preventDefault();
            e.stopPropagation();
            if (entry.getAttribute('aria-expanded') !== 'true') entry.click();
            setTimeout(() => {
              const container =
                entry.getAttribute('role') === 'tab'
                  ? entry.closest<HTMLElement>('[data-docs-focus-group="root"]')
                  : entry.closest<HTMLElement>('[data-docs-focus-group="member"]');
              if (container) {
                const editors = Array.from(
                  container.querySelectorAll<HTMLElement>(
                    '[contenteditable="true"], [contenteditable="plaintext-only"]',
                  ),
                ).filter((e) => {
                  return window.getComputedStyle(e).display !== 'none' && e.offsetParent !== null;
                });
                if (editors.length > 0 && editors[0]) {
                  editors[0].focus({ preventScroll: true });
                  const sel = window.getSelection();
                  const range = document.createRange();
                  range.selectNodeContents(editors[0]);
                  range.collapse(true);
                  sel?.removeAllRanges();
                  sel?.addRange(range);
                }
              }
            }, 100);
            return;
          }
          if (bCursor.current && (key === 'Tab' || key === 'Enter')) {
            e.preventDefault();
            e.stopPropagation();
            const cur = bCursor.current;
            if (!cur) return;
            const tgt =
              (e.shiftKey
                ? focusables(cur.wrapper, true).at(-1)
                : focusables(cur.wrapper, true)[0]) ??
              (e.shiftKey ? focusables(cur.wrapper).at(-1) : focusables(cur.wrapper)[0]);
            if (!tgt) {
              const ce = cur.wrapper.querySelector<HTMLElement>(
                '[contenteditable="true"], [contenteditable="plaintext-only"]',
              );
              if (ce) {
                clear();
                ce.focus({ preventScroll: true });
              }
              return;
            }
            clear();
            focusTgt(tgt, e.shiftKey ? 'left' : 'right');
            return;
          }
          // If bCursor is active, we let standard copy/cut/paste combos fall completely
          // through to Lexical to handle natively without intercepting!
          if (
            bCursor.current &&
            (e.metaKey || e.ctrlKey) &&
            ['c', 'x', 'v'].includes(key.toLowerCase())
          ) {
            if (key.toLowerCase() === 'x')
              requestAnimationFrame(() => {
                clear();
              });
            return;
          }
          const dir =
            key === 'ArrowLeft' || key === 'ArrowUp' || key === 'Backspace'
              ? 'left'
              : key === 'ArrowRight' || key === 'ArrowDown' || key === 'Delete'
                ? 'right'
                : null;
          if (!dir) return;
          const isVertical = key === 'ArrowUp' || key === 'ArrowDown';
          if (
            !bCursor.current &&
            (tgt?.closest(
              [
                'input',
                'textarea',
                'select',
                '[contenteditable="plaintext-only"]',
                '.cm-editor',
                'td',
                'th',
                INTERACTIVE,
              ].join(', '),
            ) ||
              (closestEditable && closestEditable !== getActiveEditable()))
          )
            return;
          if (bCursor.current) {
            // Lexical will securely handle node deletion for Backspace/Delete, just visually clean up.
            if (key === 'Backspace' || key === 'Delete') {
              clear();
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            const cur = bCursor.current;
            if (!cur) return;
            const dir = key === 'ArrowLeft' || key === 'ArrowUp' ? 'left' : 'right';
            const isVertical = key === 'ArrowUp' || key === 'ArrowDown';
            const decs = gDecs(isVertical);
            const i = decs.indexOf(cur.dec);
            const adjacent = i === -1 ? null : (decs[i + (dir === 'right' ? 1 : -1)] ?? null);
            if (
              isVertical &&
              adjacent &&
              !(() => {
                const body = getActiveEditable();
                if (!body) return false;
                const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
                  acceptNode: (n) =>
                    n.textContent?.replace(TerraQualityRegex.REGEX_U200B_G_REGEX(), '').trim()
                      ? NodeFilter.FILTER_ACCEPT
                      : NodeFilter.FILTER_SKIP,
                });
                const first =
                  cur.dec.compareDocumentPosition(adjacent) & Node.DOCUMENT_POSITION_FOLLOWING
                    ? cur.dec
                    : adjacent;
                let text = walker.nextNode();
                while (text) {
                  if (text instanceof Text && isLocalText(text))
                    if (
                      first.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING &&
                      (first === cur.dec ? adjacent : cur.dec).compareDocumentPosition(text) &
                        Node.DOCUMENT_POSITION_PRECEDING
                    )
                      return true;
                  text = walker.nextNode();
                }
                return false;
              })()
            ) {
              focusBlock(adjacent, dir);
              return;
            }
            const body = getActiveEditable();
            const selection = window.getSelection();
            if (body && selection) {
              const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
                acceptNode: (n) =>
                  n.textContent?.replace(TerraQualityRegex.REGEX_U200B_G_REGEX(), '').trim()
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_SKIP,
              });
              let candidate: Text | null = null;
              let node = walker.nextNode();
              while (node) {
                if (node instanceof Text && isLocalText(node)) {
                  const relation = cur.dec.compareDocumentPosition(node);
                  if (dir === 'right' && relation & Node.DOCUMENT_POSITION_FOLLOWING) {
                    candidate = node;
                    break;
                  }
                  if (dir === 'left' && relation & Node.DOCUMENT_POSITION_PRECEDING)
                    candidate = node;
                }
                node = walker.nextNode();
              }
              body.focus({ preventScroll: true });
              const range = document.createRange();
              if (candidate)
                range.setStart(
                  candidate,
                  dir === 'right' ? 0 : (candidate.textContent?.length ?? 0),
                );
              else if (dir === 'left') range.setStartBefore(cur.dec);
              else range.setStartAfter(cur.dec);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
            }
            clear();
            return;
          }
          if (
            key !== 'ArrowLeft' &&
            key !== 'ArrowRight' &&
            key !== 'ArrowUp' &&
            key !== 'ArrowDown'
          )
            return;
          const dec = (() => {
            const range = getCollapsedRange();
            if (!range) return null;
            const decs = gDecs(isVertical);
            let exact: HTMLElement | undefined;
            if (dir === 'right') {
              exact = decs.find((d) => {
                const edge = document.createRange();
                edge.setStartBefore(d);
                edge.collapse(true);
                return (
                  range.compareBoundaryPoints(Range.START_TO_START, edge) === 0 &&
                  range.compareBoundaryPoints(Range.END_TO_END, edge) === 0
                );
              });
            } else {
              for (let i = decs.length - 1; i >= 0; i--) {
                const d = decs[i]!;
                const edge = document.createRange();
                edge.setStartAfter(d);
                edge.collapse(true);
                if (
                  range.compareBoundaryPoints(Range.START_TO_START, edge) === 0 &&
                  range.compareBoundaryPoints(Range.END_TO_END, edge) === 0
                ) {
                  exact = d;
                  break;
                }
              }
            }
            if (exact) return gDec(exact);
            const block =
              (range.startContainer instanceof Element
                ? range.startContainer
                : range.startContainer.parentElement
              )?.closest('p, li, blockquote, h2, h3, h4, h5, h6, td, th') ?? null;
            if (!block || !isLocalText(block)) return null;
            const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
              acceptNode: (n) =>
                n.textContent?.replace(TerraQualityRegex.REGEX_U200B_G_REGEX(), '').trim()
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_SKIP,
            });
            const textNodes: Text[] = [];
            let text = walker.nextNode();
            while (text) {
              if (text instanceof Text) textNodes.push(text);
              text = walker.nextNode();
            }
            const tgt = dir === 'right' ? textNodes[textNodes.length - 1] : textNodes[0];
            if (!tgt) return null;
            const textRange = document.createRange();
            textRange.setStart(tgt, dir === 'right' ? (tgt.textContent?.length ?? 0) : 0);
            textRange.collapse(true);
            if (
              range.compareBoundaryPoints(Range.START_TO_START, textRange) === 0 &&
              range.compareBoundaryPoints(Range.END_TO_END, textRange) === 0
            ) {
              if (dir === 'right') {
                return (
                  decs.find(
                    (d) => !!(d.compareDocumentPosition(tgt) & Node.DOCUMENT_POSITION_PRECEDING),
                  ) ?? null
                );
              }
              for (let i = decs.length - 1; i >= 0; i--) {
                const d = decs[i]!;
                if (d.compareDocumentPosition(tgt) & Node.DOCUMENT_POSITION_FOLLOWING) return d;
              }
            }
            return null;
          })();
          if (isVertical) {
            if (dec) {
              e.preventDefault();
              e.stopPropagation();
              focusBlock(dec, dir);
              return;
            }
            if (
              !nearestAdjacent(dir, isVertical) ||
              !(window.getSelection() as Selection & { modify?: unknown })?.modify
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            const adjacent = nearestAdjacent(dir, true);
            if (!adjacent) return;
            const selection = window.getSelection();
            const anchor = selection?.anchorNode ?? null;
            vPending.current = {
              beforeAnchor: anchor,
              beforeBlock:
                (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest(
                  'p, li, blockquote, h2, h3, h4, h5, h6, td, th',
                ) ?? null,
              before:
                selection?.rangeCount && selection.isCollapsed
                  ? selection.getRangeAt(0).cloneRange()
                  : null,
              beforeRect: caretRect(dir),
              dec: adjacent,
              dir,
            };
            window.cancelAnimationFrame(vCursor.current);
            vCursor.current = window.requestAnimationFrame(() => {
              (function settle(attempt = 0): void {
                vCursor.current = 0;
                const pending = vPending.current;
                if (!pending?.dec || bCursor.current) return void (vPending.current = null);
                const selected = selectedDec(true);
                if (selected) {
                  vPending.current = null;
                  focusBlock(selected, pending.dir);
                  return;
                }
                const currSelection = window.getSelection();
                if (currSelection?.anchorNode && pending.dec.contains(currSelection.anchorNode)) {
                  vPending.current = null;
                  focusBlock(pending.dec, pending.dir);
                  return;
                }
                if (
                  pending.dec &&
                  passedDec(
                    pending.dec,
                    pending.dir,
                    pending.beforeAnchor,
                    pending.beforeBlock,
                    pending.before,
                    pending.beforeRect,
                  )
                ) {
                  vPending.current = null;
                  focusBlock(pending.dec, pending.dir);
                  return;
                }
                if (attempt >= 5) return void (vPending.current = null);
                vCursor.current = window.requestAnimationFrame(() => settle(attempt + 1));
              })(0);
            });
            const verticalSelection = window.getSelection() as Selection & {
              modify?: (alter: 'move', dir: 'backward' | 'forward', granularity: 'line') => void;
            };
            if (
              !verticalSelection?.rangeCount ||
              !verticalSelection.isCollapsed ||
              !verticalSelection.modify
            )
              return;
            verticalSelection.modify('move', dir === 'right' ? 'forward' : 'backward', 'line');
            const pending = vPending.current;
            if (!pending?.dec) return;
            const selected = selectedDec(true);
            if (selected) {
              vPending.current = null;
              focusBlock(selected, dir);
              return;
            }
            if (
              pending.dec &&
              passedDec(
                pending.dec,
                pending.dir,
                pending.beforeAnchor,
                pending.beforeBlock,
                pending.before,
                pending.beforeRect,
              )
            ) {
              vPending.current = null;
              focusBlock(pending.dec, dir);
            }
            return;
          }
          if (!dec) return;
          e.preventDefault();
          e.stopPropagation();
          focus(dec, dir === 'right' ? 'left' : 'right');
        } catch (err: unknown) {
          console.error('[docs:edit] Key down event failed', err);
        }
      },

      /**
       * On selection change.
       *
       */
      onSelectionChange(): void {
        try {
          snapshotSelection();
          const sel = window.getSelection();
          const p = vPending.current;
          if (!bCursor.current && p?.dec) {
            const dec = selectedDec(true);
            if (dec) {
              vPending.current = null;
              window.cancelAnimationFrame(vCursor.current);
              focusBlock(dec, p.dir);
              return;
            }
            if (sel?.anchorNode && p.dec.contains(sel.anchorNode)) {
              vPending.current = null;
              window.cancelAnimationFrame(vCursor.current);
              focusBlock(p.dec, p.dir);
              return;
            }
            if (passedDec(p.dec, p.dir, p.beforeAnchor, p.beforeBlock, p.before, p.beforeRect)) {
              vPending.current = null;
              window.cancelAnimationFrame(vCursor.current);
              focusBlock(p.dec, p.dir);
              return;
            }
          }
          const { current: cur } = bCursor;
          if (!cur) return;
          if (!cur.dec.isConnected || !cur.wrapper.isConnected) {
            if (restore()) return;
            window.cancelAnimationFrame(restoreCursor.current);
            restoreCursor.current = window.requestAnimationFrame(() => {
              (function retryRestore(attempt = 0): void {
                if (restore()) return;
                if (attempt >= 12) {
                  clear();
                  return;
                }
                restoreCursor.current = window.requestAnimationFrame(() =>
                  retryRestore(attempt + 1),
                );
              })(0);
            });
            return;
          }
          if (isToolbarTgt(document.activeElement as HTMLElement | null)) {
            restoreSavedSelection('selectionchange-toolbar');
            return;
          }
          if (!sel?.rangeCount) return;
          if (!sel.isCollapsed) {
            const range = sel.getRangeAt(0);
            if (
              range.startContainer === range.endContainer &&
              range.endOffset - range.startOffset === 1
            ) {
              const selNode = range.startContainer.childNodes[range.startOffset];
              if (
                selNode &&
                (selNode === cur.dec || cur.dec.contains(selNode) || cur.wrapper.contains(selNode))
              )
                return;
            }
            if (
              cur.dec.contains(range.startContainer) ||
              cur.wrapper.contains(range.startContainer)
            )
              return;
            clear();
            return;
          }
          if (
            !sel.anchorNode ||
            (!root()?.contains(sel.anchorNode) && sel.anchorNode !== document.body)
          )
            clear();
        } catch (err: unknown) {
          console.error('[docs:edit] Selection change event failed', err);
        }
      },

      /**
       * On pointer down.
       *
       * @param e - Value passed to the helper.
       */
      onPointerDown(e: PointerEvent): void {
        try {
          const tgt = e.target instanceof HTMLElement ? e.target : null;
          if (tgt?.closest('[role="combobox"], [data-docs-navigation]')) return;
          snapshotSelection();
          if (isToolbarTgt(tgt)) {
            restoreSavedSelection('pointerdown-toolbar');
            return;
          }
          const block =
            tgt
              ?.closest<HTMLElement>('[data-block-gutter="true"]')
              ?.parentElement?.querySelector<HTMLElement>(
                '[data-docs-editor-block], [data-editor-block], .docs-editor-block',
              ) ?? tgt?.closest<HTMLElement>('[data-docs-editor-block], [data-editor-block]');
          const dec =
            block?.closest<HTMLElement>('[data-lexical-decorator="true"]') ??
            tgt?.closest<HTMLElement>('[data-lexical-decorator="true"]') ??
            block;
          if (!dec || !refs.current?.body?.contains(dec)) {
            clear();
            return;
          }
          const eTgt = tgt?.closest<HTMLElement>(EDITABLE);
          const iTgt = tgt?.closest<HTMLElement>(INTERACTIVE);
          const wrap = dec.matches('[data-docs-editor-block]')
            ? dec
            : (dec.querySelector<HTMLElement>('[data-docs-editor-block]') ?? dec);
          const wrapState = {
            box: wrap.getBoundingClientRect(),
            sameBlock:
              bCursor.current?.wrapper === wrap ||
              (bCursor.current?.label === wrap.getAttribute('data-docs-editor-block') &&
                bCursor.current?.gId ===
                  (wrap.matches('[data-docs-focus-group-id]')
                    ? wrap
                    : wrap.querySelector<HTMLElement>('[data-docs-focus-group-id]')
                  )?.getAttribute('data-docs-focus-group-id')),
          };
          if ((eTgt && dec.contains(eTgt)) || (iTgt && dec.contains(iTgt))) {
            if (bCursor.current) clear();
            return;
          }
          const gId =
            tgt
              ?.closest<HTMLElement>('[data-docs-focus-group-id]')
              ?.getAttribute('data-docs-focus-group-id') ?? null;
          if (gId && bCursor.current?.gId !== gId) {
            const gRoot = root()?.querySelector<HTMLElement>(
              `[data-docs-focus-group="root"][data-docs-focus-group-id="${gId}"]`,
            );
            const gDec = gRoot?.closest<HTMLElement>('[data-lexical-decorator="true"]') ?? dec;
            const gBox = (gRoot ?? gDec).getBoundingClientRect();
            e.preventDefault();
            e.stopPropagation();
            focus(gDec, e.clientX - gBox.left > gBox.width / 2 ? 'right' : 'left');
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          if (wrapState.sameBlock) return;
          focus(dec, e.clientX - wrapState.box.left > wrapState.box.width / 2 ? 'right' : 'left');
        } catch (err: unknown) {
          console.error('[docs:edit] Pointer down event failed', err);
        }
      },
      /**
       * Selects a decorator block from its surrounding interactive ring.
       *
       * @param e Ring selection event emitted by the visual block wrapper.
       *
       * @returns Completion after the decorator becomes the active block selection.
       */
      onBlockSelect(e: Event): void {
        const decorator = (e as CustomEvent<{ decorator?: unknown }>).detail?.decorator;
        if (!(decorator instanceof HTMLElement) || !refs.current.body?.contains(decorator)) return;
        focus(decorator, decorator.getBoundingClientRect().width > 0 ? 'left' : 'right');
        const block = decorator.querySelector<HTMLElement>(
          '[data-docs-editor-block], .docs-math-wrapper, [data-math-code], [data-docs-view-root="true"]',
        );
        if (block)
          document.dispatchEvent(new CustomEvent('docs:block-selected', { detail: { block } }));
      },
    };
    document.addEventListener('keydown', eHandlers.onKeyDown as EventListener, true);
    document.addEventListener('selectionchange', eHandlers.onSelectionChange);
    document.addEventListener('pointerdown', eHandlers.onPointerDown as EventListener, true);
    document.addEventListener('docs:block-select', eHandlers.onBlockSelect);
    return () => {
      window.cancelAnimationFrame(restoreCursor.current);
      window.cancelAnimationFrame(vCursor.current);
      vPending.current = null;
      clear();
      document.removeEventListener('keydown', eHandlers.onKeyDown as EventListener, true);
      document.removeEventListener('selectionchange', eHandlers.onSelectionChange);
      document.removeEventListener('pointerdown', eHandlers.onPointerDown as EventListener, true);
      document.removeEventListener('docs:block-select', eHandlers.onBlockSelect);
    };
  }, [refs]);
}
