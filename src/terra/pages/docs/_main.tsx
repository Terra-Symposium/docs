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
	$cursor,
	$cursorGhost,
	$cursorPosition,
	$cursorTrack,
	$editReadyPath,
	$editorMounts,
	$leafTitle,
	$mode,
	$sidebar,
	$surfaceReady,
	$toolbar,
	captureLinearOffset,
	captureNodePath,
	codeViewOf,
	document,
	getCollapsedRange,
	htmlToMd,
	isDocBody,
	keepDeepPath,
	pasteMd,
	resetEditorMounts,
	setEditorMount,
	useAtom,
	useTransitionState,
} from './_helpers.js';
import { components as customComponents } from './_custom.js';
import { cn, notify, setDocumentTitle } from '../../runtime/runtime.js';
import { currLeafSrc, toPortableBody } from '../../runtime/leaf.js';
import { dirname, IMAGE_TYPES } from '../../runtime/shared.js';
import { lazy, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { mdTableToHtml } from '../../runtime/content.js';
import { toImgAlt, toImgMd } from './_blocks.js';
import { toast } from 'sonner';
import { getDocsHostAdapter } from '../../../host-runtime.js';
import { docsRootPath } from '../../runtime/shared.js';

// COMPONENTS
import * as TerraQualityRegex from '../../regex.mjs';
import EditProvider, { Loader, TransitionShell } from './_editable.js';
import Nav from './_sidebar.js';
import React, { Suspense } from 'react';
import { AlertError } from '@terra-symposium/styling/ui/terra-original';
import { Attachments } from './_attachments.js';
import { Badge } from '@terra-symposium/styling/ui/terra-original';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@terra-symposium/styling/ui/terra-original';
import { Toolbar } from './_toolbar.js';
import { EditStateCtx, EditorSurfaceCtx, TransitionCtx } from './_helpers.js';
import { ErrorBoundary } from '../../runtime/ui.js';
import { Input } from '@terra-symposium/styling/ui/terra-original';
import { Label } from '@terra-symposium/styling/ui/terra-original';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@terra-symposium/styling/ui/terra-original';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@terra-symposium/styling/ui/terra-original';
import { Separator } from '@terra-symposium/styling/ui/terra-original';
import { Textarea } from '@terra-symposium/styling/ui/terra-original';
import { Toaster } from 'sonner';

// DATA
import { MIME } from '../../runtime/shared.js';

// TYPES
import type { DocBody, DocVer } from '../../runtime/types.js';
import type { DocsPermissionLevel as Permission, Draft, EditorRefs, EditorSurface, Mode, Tree as TreeType } from '../../runtime/types.js';
import type { User } from '../../runtime/types.js';
import type { TerraContent as TerraContentData } from '../../runtime/types.js';
const TerraContentEditor = lazy(() => import('../../editor/TerraContentEditor.js').then(module => ({ default: module.TerraContentEditor })));
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
const EditorHooks = {
	useBlockNav(refs: React.MutableRefObject<EditorRefs>) {
		// REFS
		const bCursor = useRef<{ dec: HTMLElement; gId: string | null; label: string; side: 'left' | 'right'; wrapper: HTMLElement } | null>(null);
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
			const EDITABLE = ['input', 'textarea', 'select', '[contenteditable="true"]', '[contenteditable="plaintext-only"]', '.cm-editor', 'td', 'th'].join(', ');
			const INTERACTIVE = ['button', 'a[href]', '[role="button"]', '[role="tab"]', '[tabindex]:not([tabindex="-1"])', '[data-tool-cell]'].join(', ');
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
			const editable = (): HTMLElement | null => root()?.querySelector<HTMLElement>('[contenteditable="true"]') ?? null;

			/**
			 * Gets active editable.
			 *
			 * @returns resolved value.
			 */
			const getActiveEditable = (): HTMLElement | null => {
				if (bCursor.current) return bCursor.current.dec.parentElement?.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]') ?? editable();
				const sel = window.getSelection();
				if (sel?.anchorNode) {
					const ce = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement)?.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]');
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
				const saved = refs.current.selection ?? $cursorPosition.get() ?? $cursor.get() ?? $cursorGhost.get();
				if (!saved) return;
				const view = codeViewOf();
				if (view && view.dom.offsetParent !== null && saved.code) {
					$cursorTrack.set({ anchor: saved.code.from, collapsed: saved.code.from === saved.code.to, focus: saved.code.to, range: [saved.code.from, saved.code.to], visible: true });
					$cursorPosition.set({ code: { from: saved.code.from, to: saved.code.to }, dom: null, visible: true });
					$cursor.set({ code: { from: saved.code.from, to: saved.code.to }, dom: null, visible: true });
					$cursorGhost.set({ code: { from: saved.code.from, to: saved.code.to }, dom: null, visible: true });
					refs.current.selection = { ...saved, code: { from: saved.code.from, to: saved.code.to }, dom: null, visible: true };
					view.dispatch({ selection: { anchor: saved.code.from, head: saved.code.to }, scrollIntoView: false });
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
						acceptNode: node => (node.textContent?.includes(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
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
					(saved.dom && body.contains(saved.dom.commonAncestorContainer) ? saved.dom.cloneRange() : null);
				if (!n) return;
				sel.removeAllRanges();
				sel.addRange(n.cloneRange());
				const rect = n.getBoundingClientRect();
				const box = rect.width || rect.height ? { height: Math.max(16, rect.height || 0), left: rect.left, top: rect.top, width: Math.max(2, rect.width || 0) } : saved.box;
				const anchorLinear = typeof saved.anchorLinear === 'number' ? saved.anchorLinear : captureLinearOffset(body, n.startContainer, n.startOffset);
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
				refs.current.selection = { ...saved, anchorLinear, box, collapsed: n.collapsed, code: null, dom: n.cloneRange(), focusLinear, visible: true };
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
					refs.current.selection = { code: { from: view.state.selection.main.from, to: view.state.selection.main.to }, collapsed: view.state.selection.main.empty, dom: null, visible: true };
					$cursorTrack.set({
						anchor: view.state.selection.main.from,
						collapsed: view.state.selection.main.empty,
						focus: view.state.selection.main.to,
						range: [view.state.selection.main.from, view.state.selection.main.to],
						visible: true,
					});
					$cursorPosition.set({ code: { from: view.state.selection.main.from, to: view.state.selection.main.to }, collapsed: view.state.selection.main.empty, dom: null, visible: true });
					$cursor.set({ code: { from: view.state.selection.main.from, to: view.state.selection.main.to }, collapsed: view.state.selection.main.empty, dom: null, visible: true });
					$cursorGhost.set({ code: { from: view.state.selection.main.from, to: view.state.selection.main.to }, collapsed: view.state.selection.main.empty, dom: null, visible: true });
					return;
				}
				if (sel?.rangeCount && sel.anchorNode) {
					const ce = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement)?.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]');
					if (ce && refs.current.body?.contains(ce)) {
						const dom = sel.getRangeAt(0).cloneRange();
						const rect = dom.getBoundingClientRect();
						const anchorPath = captureNodePath(refs.current.body, sel.anchorNode);
						const focusPath = captureNodePath(refs.current.body, sel.focusNode);
						const anchorLinear = captureLinearOffset(refs.current.body, sel.anchorNode, sel.anchorOffset);
						const focusLinear = captureLinearOffset(refs.current.body, sel.focusNode, sel.focusOffset);
						$cursorTrack.set({
							anchor: anchorLinear ?? 0,
							box: rect.width || rect.height ? { height: Math.max(16, rect.height || 0), left: rect.left, top: rect.top, width: Math.max(2, rect.width || 0) } : undefined,
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
							box: rect.width || rect.height ? { height: Math.max(16, rect.height || 0), left: rect.left, top: rect.top, width: Math.max(2, rect.width || 0) } : undefined,
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
							box: rect.width || rect.height ? { height: Math.max(16, rect.height || 0), left: rect.left, top: rect.top, width: Math.max(2, rect.width || 0) } : undefined,
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
							box: rect.width || rect.height ? { height: Math.max(16, rect.height || 0), left: rect.left, top: rect.top, width: Math.max(2, rect.width || 0) } : undefined,
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
							box: rect.width || rect.height ? { height: Math.max(16, rect.height || 0), left: rect.left, top: rect.top, width: Math.max(2, rect.width || 0) } : undefined,
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
				const matches = Array.from(body.querySelectorAll<HTMLElement>('[data-docs-editor-block]')).filter(w => w.getAttribute('data-docs-editor-block') === cur.label);
				const nWrapper =
					matches.find(w => {
						if (!cur.gId) return false;
						return (w.matches('[data-docs-focus-group-id]') ? w : w.querySelector<HTMLElement>('[data-docs-focus-group-id]'))?.getAttribute('data-docs-focus-group-id') === cur.gId;
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
				const marker = dec.matches('[data-docs-focus-group-id]') ? dec : dec.querySelector<HTMLElement>('[data-docs-focus-group-id]');
				const gId = marker?.getAttribute('data-docs-focus-group-id');
				if (!body || !gId || marker?.getAttribute('data-docs-focus-group') !== 'member') return dec;
				const gRoot = body.querySelector<HTMLElement>(`[data-docs-focus-group="root"][data-docs-focus-group-id="${gId}"]`);
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
					...Array.from(ce.querySelectorAll<HTMLElement>('[data-docs-editor-block]')).filter(b => !b.closest('[data-lexical-decorator="true"]')),
				]
					.filter(e => {
						if (e.parentElement?.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]') !== ce) return false;
						return true;
					})
					.map(gDec)
					.filter(d => {
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
				if (!tgt.matches('[contenteditable="true"], [contenteditable="plaintext-only"]')) return document.activeElement === tgt;
				const sel = window.getSelection();
				if (!sel) return false;
				const walker = document.createTreeWalker(tgt, NodeFilter.SHOW_TEXT, {
					acceptNode: n => (n.textContent?.replace(TerraQualityRegex.REGEX_U200B_G_REGEX(), '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
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
				return Array.from(wrapper.querySelectorAll<HTMLElement>(pref ? '[data-docs-focus-entry]' : [EDITABLE, INTERACTIVE].join(', '))).filter(n => {
					if (seen.has(n) || !n.isConnected) return false;
					seen.add(n);
					if (pref) {
						const owner = n.closest<HTMLElement>('[data-docs-editor-block]');
						if (owner && owner !== wrapper && (!gId || owner.getAttribute('data-docs-focus-group-id') !== gId)) return false;
					}
					if ('disabled' in n && (n as HTMLButtonElement | HTMLInputElement).disabled) return false;
					if (n.getAttribute('aria-hidden') === 'true' || n.closest('[aria-hidden="true"]')) return false;
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
						decs.find(d => {
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
				const rect = (dir === 'right' ? rects[rects.length - 1] : rects[0]) || range.getBoundingClientRect();
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
				const block = (select.anchorNode instanceof Element ? select.anchorNode : select.anchorNode?.parentElement)?.closest('p, li, blockquote, h2, h3, h4, h5, h6, td, th') ?? null;
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
				const dec = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>('[data-lexical-decorator="true"]');
				if (!dec || !ce.contains(dec) || dec === ce.closest('[data-lexical-decorator="true"]')) return null;
				return gDec(dec);
			};

			/**
			 * Returns the focus block.
			 *
			 * @param dec - Value passed to the helper.
			 * @param dir - Directory entry to read.
			 */
			const focusBlock = (dec: HTMLElement, dir: 'left' | 'right'): void => {
				const cells = Array.from(dec.querySelectorAll<HTMLElement>('th, td')).filter(c => c.isContentEditable && c.getClientRects().length);
				if (cells.length) {
					clear();
					focusTgt(dir === 'right' ? cells[0] : cells[cells.length - 1], dir === 'right' ? 'right' : 'left');
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
					marker: wrapper.matches('[data-docs-focus-group-id]') ? wrapper : wrapper.querySelector<HTMLElement>('[data-docs-focus-group-id]'),
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
				bCursor.current = { dec: tgt, gId: cursorMetadata.marker?.getAttribute('data-docs-focus-group-id') ?? null, label: cursorMetadata.label, side, wrapper };
				document.dispatchEvent(new CustomEvent('docs:block-selected', { detail: { block: wrapper } }));
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
						if ((key === 'Enter' || key === ' ') && entry?.matches('button, [role="button"], [role="tab"]')) {
							e.preventDefault();
							e.stopPropagation();
							if (entry.getAttribute('aria-expanded') !== 'true') entry.click();
							setTimeout(() => {
								const container = entry.getAttribute('role') === 'tab' ? entry.closest<HTMLElement>('[data-docs-focus-group="root"]') : entry.closest<HTMLElement>('[data-docs-focus-group="member"]');
								if (container) {
									const editors = Array.from(container.querySelectorAll<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]')).filter(e => {
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
							const tgt = (e.shiftKey ? focusables(cur.wrapper, true).at(-1) : focusables(cur.wrapper, true)[0]) ?? (e.shiftKey ? focusables(cur.wrapper).at(-1) : focusables(cur.wrapper)[0]);
							if (!tgt) {
								const ce = cur.wrapper.querySelector<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]');
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
						if (bCursor.current && (e.metaKey || e.ctrlKey) && ['c', 'x', 'v'].includes(key.toLowerCase())) {
							if (key.toLowerCase() === 'x')
								requestAnimationFrame(() => {
									clear();
								});
							return;
						}
						const dir = key === 'ArrowLeft' || key === 'ArrowUp' || key === 'Backspace' ? 'left' : key === 'ArrowRight' || key === 'ArrowDown' || key === 'Delete' ? 'right' : null;
						if (!dir) return;
						const isVertical = key === 'ArrowUp' || key === 'ArrowDown';
						if (
							!bCursor.current &&
							(tgt?.closest(['input', 'textarea', 'select', '[contenteditable="plaintext-only"]', '.cm-editor', 'td', 'th', INTERACTIVE].join(', ')) ||
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
										acceptNode: n => (n.textContent?.replace(TerraQualityRegex.REGEX_U200B_G_REGEX(), '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
									});
									const first = cur.dec.compareDocumentPosition(adjacent) & Node.DOCUMENT_POSITION_FOLLOWING ? cur.dec : adjacent;
									let text = walker.nextNode();
									while (text) {
										if (text instanceof Text && isLocalText(text))
											if (
												first.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING &&
												(first === cur.dec ? adjacent : cur.dec).compareDocumentPosition(text) & Node.DOCUMENT_POSITION_PRECEDING
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
									acceptNode: n => (n.textContent?.replace(TerraQualityRegex.REGEX_U200B_G_REGEX(), '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
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
										if (dir === 'left' && relation & Node.DOCUMENT_POSITION_PRECEDING) candidate = node;
									}
									node = walker.nextNode();
								}
								body.focus({ preventScroll: true });
								const range = document.createRange();
								if (candidate) range.setStart(candidate, dir === 'right' ? 0 : (candidate.textContent?.length ?? 0));
								else if (dir === 'left') range.setStartBefore(cur.dec);
								else range.setStartAfter(cur.dec);
								range.collapse(true);
								selection.removeAllRanges();
								selection.addRange(range);
							}
							clear();
							return;
						}
						if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return;
						const dec = (() => {
							const range = getCollapsedRange();
							if (!range) return null;
							const decs = gDecs(isVertical);
							let exact: HTMLElement | undefined;
							if (dir === 'right') {
								exact = decs.find(d => {
									const edge = document.createRange();
									edge.setStartBefore(d);
									edge.collapse(true);
									return range.compareBoundaryPoints(Range.START_TO_START, edge) === 0 && range.compareBoundaryPoints(Range.END_TO_END, edge) === 0;
								});
							} else {
								for (let i = decs.length - 1; i >= 0; i--) {
									const d = decs[i]!;
									const edge = document.createRange();
									edge.setStartAfter(d);
									edge.collapse(true);
									if (range.compareBoundaryPoints(Range.START_TO_START, edge) === 0 && range.compareBoundaryPoints(Range.END_TO_END, edge) === 0) {
										exact = d;
										break;
									}
								}
							}
							if (exact) return gDec(exact);
							const block = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest('p, li, blockquote, h2, h3, h4, h5, h6, td, th') ?? null;
							if (!block || !isLocalText(block)) return null;
							const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
								acceptNode: n => (n.textContent?.replace(TerraQualityRegex.REGEX_U200B_G_REGEX(), '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
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
							if (range.compareBoundaryPoints(Range.START_TO_START, textRange) === 0 && range.compareBoundaryPoints(Range.END_TO_END, textRange) === 0) {
								if (dir === 'right') {
									return decs.find(d => !!(d.compareDocumentPosition(tgt) & Node.DOCUMENT_POSITION_PRECEDING)) ?? null;
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
							if (!nearestAdjacent(dir, isVertical) || !(window.getSelection() as Selection & { modify?: unknown })?.modify) return;
							e.preventDefault();
							e.stopPropagation();
							const adjacent = nearestAdjacent(dir, true);
							if (!adjacent) return;
							const selection = window.getSelection();
							const anchor = selection?.anchorNode ?? null;
							vPending.current = {
								beforeAnchor: anchor,
								beforeBlock: (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('p, li, blockquote, h2, h3, h4, h5, h6, td, th') ?? null,
								before: selection?.rangeCount && selection.isCollapsed ? selection.getRangeAt(0).cloneRange() : null,
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
									if (pending.dec && passedDec(pending.dec, pending.dir, pending.beforeAnchor, pending.beforeBlock, pending.before, pending.beforeRect)) {
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
							if (!verticalSelection?.rangeCount || !verticalSelection.isCollapsed || !verticalSelection.modify) return;
							verticalSelection.modify('move', dir === 'right' ? 'forward' : 'backward', 'line');
							const pending = vPending.current;
							if (!pending?.dec) return;
							const selected = selectedDec(true);
							if (selected) {
								vPending.current = null;
								focusBlock(selected, dir);
								return;
							}
							if (pending.dec && passedDec(pending.dec, pending.dir, pending.beforeAnchor, pending.beforeBlock, pending.before, pending.beforeRect)) {
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
									restoreCursor.current = window.requestAnimationFrame(() => retryRestore(attempt + 1));
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
							if (range.startContainer === range.endContainer && range.endOffset - range.startOffset === 1) {
								const selNode = range.startContainer.childNodes[range.startOffset];
								if (selNode && (selNode === cur.dec || cur.dec.contains(selNode) || cur.wrapper.contains(selNode))) return;
							}
							if (cur.dec.contains(range.startContainer) || cur.wrapper.contains(range.startContainer)) return;
							clear();
							return;
						}
						if (!sel.anchorNode || (!root()?.contains(sel.anchorNode) && sel.anchorNode !== document.body)) clear();
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
							tgt?.closest<HTMLElement>('[data-block-gutter="true"]')?.parentElement?.querySelector<HTMLElement>('[data-docs-editor-block], [data-editor-block], .docs-editor-block') ??
							tgt?.closest<HTMLElement>('[data-docs-editor-block], [data-editor-block]');
						const dec = block?.closest<HTMLElement>('[data-lexical-decorator="true"]') ?? tgt?.closest<HTMLElement>('[data-lexical-decorator="true"]') ?? block;
						if (!dec || !refs.current?.body?.contains(dec)) {
							clear();
							return;
						}
						const eTgt = tgt?.closest<HTMLElement>(EDITABLE);
						const iTgt = tgt?.closest<HTMLElement>(INTERACTIVE);
						const wrap = dec.matches('[data-docs-editor-block]') ? dec : (dec.querySelector<HTMLElement>('[data-docs-editor-block]') ?? dec);
						const wrapState = {
							box: wrap.getBoundingClientRect(),
							sameBlock:
								bCursor.current?.wrapper === wrap ||
								(bCursor.current?.label === wrap.getAttribute('data-docs-editor-block') &&
									bCursor.current?.gId ===
										(wrap.matches('[data-docs-focus-group-id]') ? wrap : wrap.querySelector<HTMLElement>('[data-docs-focus-group-id]'))?.getAttribute('data-docs-focus-group-id')),
						};
						if ((eTgt && dec.contains(eTgt)) || (iTgt && dec.contains(iTgt))) {
							if (bCursor.current) clear();
							return;
						}
						const gId = tgt?.closest<HTMLElement>('[data-docs-focus-group-id]')?.getAttribute('data-docs-focus-group-id') ?? null;
						if (gId && bCursor.current?.gId !== gId) {
							const gRoot = root()?.querySelector<HTMLElement>(`[data-docs-focus-group="root"][data-docs-focus-group-id="${gId}"]`);
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
					const block = decorator.querySelector<HTMLElement>('[data-docs-editor-block], .docs-math-wrapper, [data-math-code], [data-docs-view-root="true"]');
					if (block) document.dispatchEvent(new CustomEvent('docs:block-selected', { detail: { block } }));
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
	},

	/**
	 * Manages dragging, dropping, and clipboard paste events for media assets.
	 *
	 * @param refs - Refs input supplied to use media paste's operation.
	 * @param insert - Insert input supplied to use media paste's operation.
	 * @param uploadFile - Upload file input supplied to use media paste's operation.
	 * @param attachFiles - Attach files input supplied to use media paste's operation.
	 *
	 * @return Effects that register and clean up the editor's media paste and drag-and-drop handlers.
	 */
	useMediaPaste(refs: React.MutableRefObject<EditorRefs>, insert: (md: string, rootEnd?: boolean) => void, uploadFile: (file: File) => Promise<string>, attachFiles: (files: File[]) => Promise<void>) {
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
					if (!['Files', 'text/html', 'text/plain', 'text/uri-list'].some(t => Array.from(transfer.types ?? []).includes(t))) return;
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
					const files = dropped.filter(f => {
						const ext = f.name.match(TerraQualityRegex.REGEX_PATTERN_REGEX())?.[0].toLowerCase();
						return Boolean((f.type && f.type in MIME) || (ext && Object.values(MIME).includes(ext as (typeof MIME)[keyof typeof MIME])));
					});
					if (!files.length) {
						notify({ error: new Error('Dropped files are not permitted attachments.'), fallback: 'Only permitted file types can be attached.' });
						return;
					}
					void attachFiles(files).catch((e: unknown) => {
						notify({ error: e instanceof Error ? e : new Error(String(e)), fallback: 'Failed to add dropped attachments.' });
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
			const handleClipboard = (data: DataTransfer, e: Pick<Event, 'preventDefault' | 'stopImmediatePropagation' | 'stopPropagation'>): void => {
				const view = codeViewOf();
				const sel = window.getSelection();
				const savedSel = refs.current.selection ?? $cursorPosition.get() ?? $cursor.get() ?? $cursorGhost.get();
				if (!refs.current.selection && view && view.dom.offsetParent !== null) {
					refs.current.selection = { code: { from: view.state.selection.main.from, to: view.state.selection.main.to }, collapsed: view.state.selection.main.empty, dom: null, visible: true };
					$cursorPosition.set({ code: { from: view.state.selection.main.from, to: view.state.selection.main.to }, collapsed: view.state.selection.main.empty, dom: null, visible: true });
					$cursor.set({ code: { from: view.state.selection.main.from, to: view.state.selection.main.to }, collapsed: view.state.selection.main.empty, dom: null, visible: true });
				} else if (!refs.current.selection && sel?.rangeCount && sel.anchorNode) {
					const ce = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement)?.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]');
					if (ce && refs.current.body?.contains(ce)) {
						const dom = sel.getRangeAt(0).cloneRange();
						const rect = dom.getBoundingClientRect();
						const anchorPath = captureNodePath(refs.current.body, sel.anchorNode);
						const focusPath = captureNodePath(refs.current.body, sel.focusNode);
						refs.current.selection = {
							anchorOffset: sel.anchorOffset,
							anchorPath,
							anchorText: sel.anchorNode?.textContent || undefined,
							box: rect.width || rect.height ? { height: Math.max(16, rect.height || 0), left: rect.left, top: rect.top, width: Math.max(2, rect.width || 0) } : undefined,
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
							box: rect.width || rect.height ? { height: Math.max(16, rect.height || 0), left: rect.left, top: rect.top, width: Math.max(2, rect.width || 0) } : undefined,
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
							box: rect.width || rect.height ? { height: Math.max(16, rect.height || 0), left: rect.left, top: rect.top, width: Math.max(2, rect.width || 0) } : undefined,
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
				const richClipboard = /<(?:AccordionGroup|AccordionItem|Code|Testimonials|TabsGroup|TabsItem|Leaf|DocsTable|TsDocs|Nodes)\b|<table\b|===|\|\|\||:::/i.test(`${html || ''}\n${plain || ''}`);
				// CRITICAL BYPASS: Let Lexical handle pasting its own native blocks.
				if ((types.includes('application/x-lexical-editor') || (html && html.includes('data-lexical-decorator'))) && !richClipboard) return;
				if (richClipboard) {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
				}
				// Intercept and sanitize triple character blocks inside raw clipboard copies
				if (plain && plain.includes('|||')) plain = plain.replace(/([^\n])[ \t]*\|\|\|/g, '$1\n\n|||').replace(/\|\|\|[ \t]*([^\n])/g, '|||\n\n$1');
				if (richClipboard && plain) {
					pasteMd(
						insert,
						((md: string): string => {
							if (!md) return '';
							return [
								...new Set([
									...customComponents.map(component => component.name),
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
								.reduce((v, name) => v.replace(new RegExp(`(<\\/?\\s*)${name.replace(TerraQualityRegex.REGEX_G_REGEX_9(), '\\$&')}(?=\\b)`, 'gi'), (_, prefix: string) => `${prefix}${name}`), md);
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
				const file = Array.from(data.files ?? []).find(f => f.type.startsWith('image/') || f.type === 'application/pdf');
				if (file && file.size > 0) {
					const isPdf = file.type === 'application/pdf';
					const optimistic = URL.createObjectURL(file);
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					const lbl = toImgAlt(file.name || (isPdf ? 'document' : 'image'));
					pasteMd(insert, isPdf ? `\n<Embed src="${optimistic}" title="${lbl}" />\n` : toImgMd(optimistic, lbl), savedSel);
					void uploadFile(file).catch((e: unknown) => {
						notify({ error: e instanceof Error ? e : new Error(String(e)), fallback: `Failed to upload pasted ${isPdf ? 'PDF' : 'image'}. Local changes were kept.` });
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
								if (imgUrl.pathname === '/api/media' || /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(imgUrl.pathname + imgUrl.search)) return true;
							} catch {
								return false;
							}
						}
						try {
							return (
								/^https?:$/i.test(new URL(trimmed).protocol) &&
								new RegExp(
									`\\.(${Object.values(IMAGE_TYPES)
										.map(extension => extension.substring(1))
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
	},
};
export const useBlockNav = EditorHooks.useBlockNav;
export const useMediaPaste = EditorHooks.useMediaPaste;

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
	}, []);
	return <TerraContentEditor content={body as unknown as TerraContentData} docsAttachments={[]} memberProfile='docs' readOnly {...(resetKey !== undefined && { resetKey })} />;
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
					setInit(!!root && mounts.path === surface.path && mounts.expected.length === mounts.mounted.length);
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
		EditorHooks.useBlockNav(surface ? surface.refs : editorRefs.empty);
		EditorHooks.useMediaPaste(
			surface ? surface.refs : editorRefs.empty,
			surface?.insert ?? (() => undefined),
			surface?.uploadImage ?? (async () => ''),
			surface?.attachFiles ?? (async () => undefined),
		);

		// VALIDATION
		if (!surface) return <AlertError title='Editor failed to initialize.' description='Reload the page to reattach the docs editor provider.' />;
		const { editor, parseError: parseErr, refs } = surface;

		// RENDER
		return (
			<div
				ref={e => {
					refs.current.body = e;
				}}
				className={cn(
					'min-w-0',
					className,
					'[&_[class*="_toolbarRoot_"]]:static [&_[class*="_toolbarRoot_"]]:!top-auto [&_[class*="_toolbarRoot_"]]:!z-auto [&_[class*="_toolbarRoot_"]]:m-0 [&_[class*="_toolbarRoot_"]]:w-full [&_[class*="_toolbarRoot_"]]:gap-0 [&_[class*="_toolbarRoot_"]]:overflow-visible [&_[class*="_toolbarRoot_"]]:rounded-none [&_[class*="_toolbarRoot_"]]:border-none [&_[class*="_toolbarRoot_"]]:!bg-transparent [&_[class*="_toolbarRoot_"]]:p-0 [&_[class*="_toolbarRoot_"]]:!shadow-none [&_[class*="_toolbarRoot_"]]:outline-none [&_[class*="_toolbarRoot_"]]:ring-0 focus-within:[&_[class*="_toolbarRoot_"]]:!shadow-none',
				)}
				data-docs-body-editor
				data-docs-editor='inline'
				data-docs-editor-initialized={init}
				data-docs-path={editor.draft.path}
			>
				{editor.busy === 'loading' && <div aria-hidden='true' data-docs-editor-loading />}
				{parseErr ? (
					<>
						<AlertError description={`${parseErr}\n\nThe source remains editable below.`} title='Visual editor fallback' />
						<textarea
							className='mt-4 min-h-[32rem] w-full rounded-md border border-primary-6 bg-primary-1 p-4 font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary-8'
							value={editor.draft.source || ''}
							onChange={e => surface.onMdChange(e.currentTarget.value)}
							aria-label='Document source fallback'
						/>
					</>
				) : (
					<Suspense fallback={<div aria-hidden='true' data-docs-editor-loading />}>
						<TerraContentEditor
							content={(isDocBody(editor.draft.content) ? editor.draft.content : undefined) as unknown as TerraContentData}
							docsAttachments={[]}
							memberProfile='docs'
							onChange={c => {
								surface.onBodyChange(toPortableBody(c.map(b => (b._type === 'terraBlock' ? { ...b, _type: 'block' } : b))));
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
						{editable ? (
							<>
								<Label htmlFor='docs-description' className='sr-only'>
									Description
								</Label>
								<Textarea
									id='docs-description'
									value={draft.description}
									onChange={e => edit?.update({ description: e.currentTarget.value })}
									placeholder='Add a description...'
									className='min-h-0 resize-none border-none bg-transparent p-0 text-base text-pretty text-primary-11 shadow-none focus-visible:ring-0 dark:bg-transparent'
									suppressHydrationWarning
								/>
							</>
						) : (
							<p className='m-0 min-h-6 whitespace-pre-wrap text-base text-pretty text-primary-11'>{draft.description || <span className='text-primary-11'>Add a description...</span>}</p>
						)}
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
}): JSX.Element {
	// STATES
	const navigationState = { open: useAtom($sidebar), leafTitle: useAtom($leafTitle) };
	const [hydrated, setHydrated] = useState<boolean>(standalone);
	const toolbar = useAtom($toolbar);
	const stored = useAtom($mode);
	const writable = permission === 'write';
	const modeSynced = useRef(false);
	const pendingMode = useRef<Mode | null>(initialMode ?? null);
	const contributors = useMemo(() => initContributors ?? [], [initContributors]);
	// prettier-ignore
	const [dest, setDest] = useState<{ open: boolean; section: string; group: string; title: string; newSection: boolean }>({ open: false, section: '', group: '', title: 'Untitled', newSection: false, });
	const destRes = useRef<((tgt: { path: string; parentId?: string; title?: string } | null) => void) | null>(null);
	const sects = useMemo(() => tree.filter((n): n is Extract<TreeType, { type: 'branch' }> => n.type === 'branch'), [tree]);
	const destActions = {
		groups: useMemo(() => {
			if (!dest.section) return [];
			return sects.find(s => s.origName === dest.section)?.children?.filter((c): c is Extract<TreeType, { type: 'branch' }> => c.type === 'branch') ?? [];
		}, [sects, dest.section]),
		finish: useCallback(async () => {
			if (!dest.section || !dest.group) return;
			const section = dest.newSection ? dest.section.trim().toLowerCase().replace(TerraQualityRegex.REGEX_A_Z0_9_G_REGEX(), '-') : dest.section;
			const group = dest.newSection ? dest.group.trim().toLowerCase().replace(TerraQualityRegex.REGEX_A_Z0_9_G_REGEX(), '-') : dest.group;
			const sel = sects.find(i => i.origName === section)?.children?.find(i => i.type === 'branch' && i.origName === group);
			const selPath = sel?.type === 'branch' ? sel.children?.find(i => i.type === 'leaf' && Boolean(i.path)) : undefined;
			const leafPath = selPath?.type === 'leaf' ? selPath.path : undefined;
			const selBase = leafPath ? dirname(leafPath) : '';
			const destPath = {
				base: !dest.newSection && selBase && selBase !== '.' ? selBase : `${section}/${group}`,
				slug: dest.title.trim().toLowerCase().replace(TerraQualityRegex.REGEX_A_Z0_9_G_REGEX(), '-').replace(TerraQualityRegex.REGEX_G_REGEX_20(), '') || 'untitled',
			};
			destRes.current?.({ path: `${destPath.base}/${destPath.slug}.mdx`, parentId: dest.newSection ? undefined : sel?.origName, title: dest.title.trim() || 'Untitled' });
			destRes.current = null;
			setDest(p => ({ ...p, open: false }));
		}, [dest, sects]),
	};

	// prettier-ignore
	const [currDoc, setCurrDoc] = useState({ pathname: initPathname, path: initPath, title: initTitle, description: initDesc, contributors, updatedAt: initUpdatedAt, source: initSrc || (typeof initContent === 'string' ? initContent : ''), content: toPortableBody(initContent), compiledMDX: initMdx, versions: [] as DocVer[] });

	// 1. ASTRO VIEW TRANSITION / HMR PROP SYNC
	// Force component state to update if Astro swaps the underlying page and injects new props into this instance.
	useEffect(() => {
		const content = toPortableBody(initContent);
		const src = initSrc || (typeof initContent === 'string' ? initContent : '');
		setCurrDoc(p => {
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
	}, [initPathname, initPath, initTitle, initDesc, contributors, initUpdatedAt, initSrc, initContent, initMdx]);
	useEffect(() => {
		/**
		 * Handles rename.
		 *
		 * @param e - Pointer event received from the editor control.
		 */
		const rename = (e: Event) => {
			if (!(e as CustomEvent<{ isActive?: boolean; title?: string }>).detail.isActive || typeof (e as CustomEvent<{ isActive?: boolean; title?: string }>).detail.title !== 'string') return;
			setCurrDoc(p => ({ ...p, title: (e as CustomEvent<{ isActive?: boolean; title?: string }>).detail.title! }));
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
		setDocumentTitle(navigationState.leafTitle?.path === currDoc.path ? (navigationState.leafTitle?.title ?? currDoc.title) : currDoc.title);
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
					.replace(/fill="[^"]*"\s*stroke="[^"]*"/, `fill="rgb(${secondary})" stroke="rgb(${secondary})"`)
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
			setCurrDoc(previous => {
				const detail = ((e as CustomEvent).detail || {}) as Record<string, unknown>;
				const rawPathname = typeof detail.pathname === 'string' ? detail.pathname : typeof detail.url === 'string' ? detail.url : previous.pathname || '';
				return {
					...previous,
					...detail,
					source: Object.prototype.hasOwnProperty.call(detail, 'source') && typeof detail.source === 'string' ? detail.source : previous.source || '',
					content: isDocBody(detail.content) ? detail.content : previous.content,
					pathname: keepDeepPath(previous.pathname || '', rawPathname ? rawPathname.split('?')[0] || '' : previous.pathname || ''),
					compiledMDX: Object.prototype.hasOwnProperty.call(detail, 'compiledMDX') && detail.compiledMDX !== undefined ? String(detail.compiledMDX) : (previous.compiledMDX ?? ''),
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
			console.warn(`[Scaffold] Caught docs:error:redirect event (${type}). Performing soft redirect...`);
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
			document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: cFallback, pathname: cFallback } }));
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
			console.info('[Docs:url-sync]', { current: url.pathname, next: cCurrPath, path: currDoc.path, resolved: nPath });
			url.pathname = nPath;
			window.history.replaceState(null, '', url.toString());
		}
	}, [currDoc.pathname]);

	// PROCESS
	const a: Mode = !hydrated ? (initialMode ?? 'view') : !writable && stored === 'edit' ? 'view' : stored;

	// unify all loading scenarios into a single boolean
	const loadingState = { isSaving: toolbar?.busy === 'saving' && !toolbar?.optimistic, transition: useTransitionState() };
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
			<TransitionShell className='size-full min-w-0 max-w-none overflow-visible text-inherit print:m-0 print:h-auto print:min-h-0 print:w-full print:overflow-visible print:p-0' mode='view'>
				<div data-docs-shell data-docs-mode='view' className='w-full'>
					<div className={cn('mx-auto w-full px-6 md:px-10', full ? 'max-w-none' : 'max-w-5xl')}>
						<div data-docs-body className='relative h-full min-h-[50vh] text-primary-12'>
							<div className='prose max-w-none pb-40 pt-8 transition-opacity duration-200' data-docs-body-content data-docs-view-root='true'>
								<ErrorBoundary name='StandaloneBody' fallback={() => <AlertError title='Standalone Surface Crashed' description='The standalone documentation surface crashed during rendering.' />}>
									<View body={isDocBody(currDoc.content) ? currDoc.content : []} resetKey={currDoc.path ?? currDoc.pathname} />
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
			className='terra-docs-workspace font-sans'
			open={hydrated ? navigationState.open : true}
			onOpenChange={n => {
				$sidebar.set(n);
			}}
		>
			<Toaster richColors />
			<Nav docs={tree} pathname={currDoc.pathname} permission={permission} userData={userData ?? null} siteTitle={getDocsHostAdapter()?.siteTitle ?? 'Terra Symposium'} siteDescription={getDocsHostAdapter()?.siteDescription} homePath={getDocsHostAdapter()?.homePath ?? docsRootPath()} />
			{/* NAV SIDEBAR; larger than sm */}
			<SidebarInset className='relative flex min-h-svh min-w-0 flex-col print:min-h-0'>
				{/* NAV HEADER; sm or smaller */}
				<ErrorBoundary name='NavHeader'>
					<header className='flex h-14 shrink-0 items-center border-b border-primary-6 bg-primary-2 px-5 md:hidden print:hidden'>
						<SidebarTrigger />
						<Separator orientation='vertical' className='mx-2 h-4' />
						<span className='font-serif text-lg'>{getDocsHostAdapter()?.siteTitle ?? 'Terra Symposium'}</span>
					</header>
				</ErrorBoundary>
				<div className={cn('relative flex min-h-0 flex-1 flex-col', isLoading && 'overflow-hidden')}>
					{/* CONTENT SHELL */}
					{hydrated && !loadingState.isSaving && (
						<TransitionShell
							className={cn(
								'size-full min-w-0 max-w-none overflow-visible text-inherit print:m-0 print:h-auto print:min-h-0 print:w-full print:overflow-visible print:p-0',
								loadingState.isSaving ? 'hidden' : isLoading ? 'pointer-events-none absolute inset-0 overflow-hidden opacity-0' : 'block',
							)}
							mode={a}
							path={currDoc.path}
						>
							<EditProvider key={currDoc.pathname} permission={permission} {...currDoc}>
								<div className='w-full'>
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
									<div className='w-full'>
										<div className={cn('mx-auto w-full px-6 md:px-10', full ? 'max-w-none' : 'max-w-5xl')}>
											{/* root; must be relative and fill height to constrain absolute overlay */}
											<div data-docs-body className='relative h-full min-h-[50vh] text-primary-12'>
												{/* Keep the document mode and formatting controls in one shared toolbar in every mode. */}
												<Toolbar toolbar={toolbar} activeMode={a} editable={writable} />
												{/* content */}
												<div
													className={cn('prose max-w-none pb-40 transition-opacity duration-200', a === 'edit' ? 'pt-2' : 'pt-8')}
													data-docs-body-content
													data-docs-view-root={a === 'view' ? 'true' : undefined}
												>
													<ErrorBoundary
														name='EditorBody'
														resetKey={`${a}:${currDoc.path ?? ''}`}
														fallback={() => (
															<div className='p-8'>
																<AlertError
																	title='Editor Surface Crashed'
														description='The workspace editor canvas encountered a rendering crash. You can safely switch to attachments view to recover.'
																/>
															</div>
														)}
													>
								{hydrated &&
									(a === 'view' ? (
										<View body={isDocBody(currDoc.content) ? currDoc.content : []} resetKey={currDoc.path ?? currDoc.pathname} />
									) : a === 'edit' ? (
										<EditorSurfaces.Edit />
									) : a === 'attachments' ? (
										<Attachments dPath={currDoc.path ?? ''} tree={tree} />
									) : (
										null
									))}
													</ErrorBoundary>
												</div>
											</div>
										</div>
									</div>
								</div>
							</EditProvider>
						</TransitionShell>
					)}
					{isLoading && <Loader className='absolute inset-0 z-10' />}
				</div>
				<Dialog
					open={dest.open}
					onOpenChange={o => {
						if (!o) destRes.current?.(null);
						setDest(p => ({ ...p, open: o }));
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
							<Button onClick={destActions.finish} disabled={!dest.title.trim() || !dest.section || !dest.group}>
								Save
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</SidebarInset>
		</SidebarProvider>
	);
}
