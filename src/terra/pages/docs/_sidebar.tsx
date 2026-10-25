// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/pages/docs/_sidebar.tsx
 * Docs sidebar entrypoint, state management, and unified dialog orchestrators.
 * Folder boundary: sidebar navigation and its dialogs; the recursive tree structure remains in `_tree.tsx`.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import {
	$leafTitle,
	$mode,
	$transition,
	$unsavedDrafts,
	clearTransition,
	extractAllNodeIds,
	getHue,
	getStableKey,
	isIndexFile,
	memoryDrafts,
	runMutation,
	sanitizeName,
	setTransition,
	uploadAssetChunked,
	useAtom,
} from './_helpers.js';
import { actions } from '../../runtime/action-proxy.js';
import { bName, buildRoute as buildRoute, cTitle, dirname, docsPath, docsRootPath, FILES, isDocsPath, parseRoute, toNodeLabel, toPaths } from '../../runtime/shared.js';
import { cn, createTrace, notify } from '../../runtime/runtime.js';
import { isDevOrigin } from '../../runtime/runtime.js';
import { components as repoComponents } from './_custom.js';
import { currLeafSrc } from '../../runtime/leaf.js';
import { toast } from 'sonner';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// COMPONENTS
import * as TerraQualityRegex from '../../regex.mjs';
import React from 'react';
import Tree, { Menu } from './_tree.js';
import User from '../../runtime/ui.js';
import {
	Add as AddIcon,
	ArrowLeft as LeftArrowIcon,
	ArrowUpRight as PopOutIcon,
	Box as BoxIcon,
	Catalog as CatalogIcon,
	ColorPalette as ColorIcon,
	Doc as DocumentIcon,
	Download as DownloadIcon,
	Edit as EditIcon,
	Image as ImageIcon,
	Link as LinkIcon,
	LogoYoutube as YouTubeIcon,
	MagicWand as MagicIcon,
	OverflowMenuVertical as OverflowMenuIcon,
	TrashCan as TrashIcon,
	Upload as UploadIcon,
} from '@carbon/icons-react';
import { AlertError } from '@terra-symposium/styling/ui/terra-original';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import { Card } from '@terra-symposium/styling/ui/terra-original';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@terra-symposium/styling/ui/terra-original';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@terra-symposium/styling/ui/terra-original';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@terra-symposium/styling/ui/terra-original';
import { ErrorBoundary } from '../../runtime/ui.js';
import { Empty } from '../../runtime/ui.js';
import { ExportDialog as SharedExportDialog } from './_export-dialog.js';
import { Input } from '@terra-symposium/styling/ui/terra-original';
import { Label } from '@terra-symposium/styling/ui/terra-original';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@terra-symposium/styling/ui/terra-original';
import { Separator } from '@terra-symposium/styling/ui/terra-original';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarRail } from '@terra-symposium/styling/ui/terra-original';
import { Slider } from '@terra-symposium/styling/ui/terra-original';
import { Spinner } from '@terra-symposium/styling/ui/terra-original';
import { Textarea } from '@terra-symposium/styling/ui/terra-original';
import { TsDocsSelect } from './_blocks.js';

// TYPES
import type { ActionRes, Md } from '../../runtime/types.js';
import type { AttchTgt, AttchType, DelTgt, DocsExportOpts as ExportOptions, ExportTgt, PromptState, Sister } from '../../runtime/types.js';
import type { DocsTreeMenuAction as MenuAction } from '../../runtime/types.js';
import type { Branch, Leaf as LeafNode, Mode, Tree as TreeType } from '../../runtime/types.js';
import type { DragState } from '../../runtime/types.js';
import type { ReorderDropState } from '../../runtime/types.js';
import type { PDFDocument, PDFImage } from 'pdf-lib';

// prettier-ignore

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/**
 * Handles get sibs.
 *
 * @param nodes - Docs tree nodes used to build the sidebar entries.
 * @param tgtPath - Target path used to identify the active sidebar item.
 */
const getSibs = (nodes: TreeType[], tgtPath: string): TreeType[] => {
	if (!tgtPath || tgtPath === '.') return nodes;
	let cur = nodes;
	for (const seg of tgtPath.split('/')) {
		let match: Branch | undefined;
		for (const n of cur) {
			if (n.type === 'branch' && n.origName === seg) {
				match = n;
				break;
			}
		}
		if (match?.children) cur = match.children;
		else return [];
	}
	return cur;
};

/**
 * SANITY MANY-TO-MANY ROUTING ARCHITECTURE
 *
 * Parses explicit Sanity IDs directly from the URL.
 * A single leaf or group can belong to multiple parents. Canonical routing keeps the active
 * section anchored to the first path segment so the sidebar select never drifts.
 *
 * @param pathname - Current browser pathname used to mark the active route.
 */
const route = (pathname: string): ReturnType<typeof parseRoute> => parseRoute(pathname || docsRootPath());

/** Keeps matching leaves visible while retaining their original section and group hierarchy. */
const filterTree = (nodes: TreeType[] = [], query: string): TreeType[] => {
	const normalized = query.trim().toLocaleLowerCase();
	if (!normalized) return nodes;
	return nodes.flatMap(node => {
		const label = cTitle(toNodeLabel(node.title || node.origName)).toLocaleLowerCase();
		if (label.includes(normalized)) return [node];
		if (node.type !== 'branch') return [];
		const children = filterTree(node.children ?? [], normalized);
		return children.length ? [{ ...node, children }] : [];
	});
};

/**
 * Reads the typed detail payload from a DOM event.
 *
 * @param e - DOM event carrying the custom payload.
 * @returns The event detail payload.
 */
const eDetail = <T,>(e: Event): T => (e as CustomEvent<T>).detail;

/**
 * Handles latest content.
 *
 * @param content - Docs content used to derive the sidebar structure.
 */
const latestContent = (content: Md['content']): string => {
	if (typeof content === 'string') return content;
	return Array.isArray(content) ? currLeafSrc(content, 'sidebar.latestContent') : '';
};

/*//////////////////////////////////////////////////
FUNCTIONS
//////////////////////////////////////////////////*/

/**
 * Updates the Docs route through client-side history while preserving applicable query parameters.
 *
 * @param props - The destination URL and Docs mode to apply during client-side navigation.
 */
export function navigate({ href, mode }: { href: string; mode: Mode }): void {
	setTransition('local');
	const url = new URL(href, window.location.origin);
	new URL(window.location.href).searchParams.forEach((v, k) => {
		if (k !== 'mode' && !url.searchParams.has(k)) url.searchParams.set(k, v);
	});
	if (mode !== 'view') url.searchParams.set('mode', mode);
	else url.searchParams.delete('mode');
	window.history.pushState(null, '', url.toString());
	document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: url.pathname + url.search, pathname: url.pathname + url.search } }));
	// safety escape hatch to force unlock the shell if reconciliation fails
	setTimeout(() => {
		clearTransition();
	}, 1000);
}

/**
 * Handles archive.
 *
 * @param v - Paths input supplied to archive's operation.
 * @param r - Root dir input supplied to archive's operation.
 * @param f - Filename base input supplied to archive's operation.
 * @param o - Opts input supplied to archive's operation.
 * @param d - Callback invoked for progress.
 * @param n - Node ids input supplied to archive's operation.
 */
const SidebarComponents = {
	async archive(v: string[], r: string, f: string, o: ExportOptions, d?: (percent: number) => void, n: string[] = []): Promise<void> {
		console.info('[archive] start', { paths: v, rootDir: r, filenameBase: f, opts: o, nodeIds: n });
		if (!v?.length && !r) throw new Error('No docs files found to download.');
		let allPaths: string[] = v && v.length > 0 ? [...v] : [];
		const isMdFile = TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(r) || !r.includes('.');
		if (allPaths.length === 0) {
			if (isMdFile) {
				if (isIndexFile(r)) {
					const dir = dirname(r);
					const { data: entries, error: listErr } = await actions.read.doc.list({ type: 'folderEntries', path: dir === '.' ? '' : dir });
					if (listErr || !entries) throw listErr || new Error('Failed to fetch structural archive entries.');
					allPaths = (entries as string[]).filter(p => p === r || dirname(p) === dir);
				} else allPaths = [r];
			} else {
				const { data: entries, error: listErr } = await actions.read.doc.list({ type: 'folderEntries', path: r === '.' ? '' : r });
				if (listErr || !entries) throw listErr || new Error('Failed to fetch structural archive entries.');
				allPaths = entries as string[];
			}
		}
		if (isMdFile && !allPaths.includes(r)) allPaths.push(r);
		const attchPaths: string[] = [];
		const assetNameMap = new Map<string, string>();

		// Create a combined list of paths explicitly for fetching attachments
		await Promise.allSettled(
			[...new Set([...allPaths, ...n])].map(async p => {
				const c = p.split('?')[0] || p;
				if (TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(c) || !c.includes('.')) {
					try {
						const { data: atts, error: err } = await actions.read.doc.attachments({ path: p });
						if (!err && Array.isArray(atts)) {
							for (const att of atts) {
								if (att && typeof att === 'object' && 'path' in att && typeof att.path === 'string') {
									if ('name' in att && typeof att.name === 'string') {
										assetNameMap.set(att.path, att.name);
										assetNameMap.set(att.path.split('?')[0] || att.path, att.name);
									}
									if (!allPaths.includes(att.path) && !attchPaths.includes(att.path)) attchPaths.push(att.path);
								}
							}
						} else if (err) console.warn(`[archive] Error fetching attachments for ${p}:`, err);
					} catch (e) {
						console.error(`[archive] Exception fetching attachments for ${p}:`, e);
					}
				}
			}),
		);
		if (attchPaths.length > 0) {
			allPaths.push(...attchPaths);
			allPaths = [...new Set(allPaths)];
		}
		console.info('[archive] discovered paths', { allPaths, attachmentPaths: attchPaths, assetNames: [...assetNameMap.entries()] });
		const zip = new (await import('jszip')).default();
		let mergedPdf: PDFDocument | null = null;
		const wantsPdfMerge = (o.filters.pdfs && o.merges.pdfs) || (o.filters.images && o.merges.images) || (o.filters.pages && o.merges.pages && o.format === 'pdf');
		console.info('[archive] merge plan', { wantsPdfMerge, textMerge: o.filters.pages && o.merges.pages && o.format === 'raw', pdfMerge: o.filters.pdfs && o.merges.pdfs });
		if (wantsPdfMerge) {
			const { PDFDocument } = await import('pdf-lib');
			mergedPdf = await PDFDocument.create();
		}
		const gJson: Record<string, { title: string; source: string; description?: string; [key: string]: unknown }[]> = {};
		const textJson: { path: string; filename: string; value: string }[] = [];
		const failures: { filename: string; path: string; reason: string }[] = [];

		// Helper to accurately identify file types, prioritizing Sanity's explicit filename when available
		/**
		 * Checks whether ext match.
		 *
		 * @param p - Value passed to the helper.
		 * @param regex - Value passed to the helper.
		 */
		const isExtMatch = (p: string, regex: RegExp) => {
			if (regex.test(p.split('?')[0] || p)) return true;
			const filename = assetNameMap.get(p.split('?')[0] || p);
			if (filename && regex.test(filename)) return true;
			return false;
		};
		const mdPaths: string[] = [];
		const textPaths: string[] = [];
		const pdfPaths: string[] = [];
		const imgPaths: string[] = [];
		const ytPaths: string[] = [];
		const refPaths: string[] = [];
		const otherPaths: string[] = [];
		for (const p of allPaths) {
			const c = p.split('?')[0] || p;
			const isTsDoc = p.includes(`${docsRootPath()}/tsdocs/`);
			const isHttp = p.startsWith('http');
			const noDot = !assetNameMap.has(p) && !c.includes('.');
			if (!isHttp && !isTsDoc && (TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(c) || noDot)) mdPaths.push(p);
			let matched = false;
			if (!isHttp && !isTsDoc && (/\.(md|mdx|txt|json|cpp|c|h|hpp|js|jsx|ts|tsx|astro|yaml|yml|xml|csv|html|css|scss|sh|py|java|rs|go|rb|swift)$/i.test(assetNameMap.get(c) || c) || noDot)) {
				textPaths.push(p);
				matched = true;
			}
			if (isExtMatch(p, TerraQualityRegex.REGEX_PDF_I_REGEX())) {
				pdfPaths.push(p);
				matched = true;
			}
			if (isExtMatch(p, TerraQualityRegex.REGEX_PNG_JPE_G_GIF_WEBP_SVG_AVIF_I_REGEX_2())) {
				imgPaths.push(p);
				matched = true;
			}
			if (p.endsWith('youtube_transcripts.json') || p.includes('youtube.com/') || p.includes('youtu.be/')) {
				ytPaths.push(p);
				matched = true;
			}
			if (isTsDoc) {
				refPaths.push(p);
				matched = true;
			}
			if (!matched) otherPaths.push(p);
		}
		const tasks: { path: string; type: keyof ExportOptions['filters'] }[] = [];
		if (o.filters.pages) textPaths.forEach(p => tasks.push({ path: p, type: 'pages' }));
		if (o.filters.pdfs) pdfPaths.forEach(p => tasks.push({ path: p, type: 'pdfs' }));
		if (o.filters.images) imgPaths.forEach(p => tasks.push({ path: p, type: 'images' }));
		if (o.filters.youtube) ytPaths.forEach(p => tasks.push({ path: p, type: 'youtube' }));
		if (o.filters.tsdocs) refPaths.forEach(p => tasks.push({ path: p, type: 'tsdocs' }));
		if (o.filters.other) otherPaths.forEach(p => tasks.push({ path: p, type: 'other' }));
		console.info('[archive] classified tasks', { total: tasks.length, tasks, textPaths, pdfPaths, imgPaths, otherPaths });
		if (tasks.length === 0) throw new Error('No files match the selected filters.');
		let completed = 0;
		/**
		 * Updates the update Progress for the docs.
		 */
		const updateProgress = () => {
			completed++;
			console.info('[archive] progress', { completed, total: tasks.length, percent: Math.round((completed / tasks.length) * 100) });
			if (d) d(Math.round((completed / tasks.length) * 100));
		};

		/**
		 * Resolves the Path.
		 *
		 * @param p - Value passed to the helper.
		 * @param forceExt - Value passed to the helper.
		 */
		const resolvePath = (p: string, forceExt?: string) => {
			let rel = p;
			if (assetNameMap.has(p.split('?')[0] || p)) rel = assetNameMap.get(p.split('?')[0] || p)!;
			else if (rel.startsWith('http://') || rel.startsWith('https://')) {
				// prettier-ignore
				try {
				const urlObj = new URL(rel);
				let baseName = urlObj.pathname.split('/').pop() || 'downloaded-file';
				if (urlObj.search) {
					const sQuery = urlObj.search.replace(/[^a-zA-Z0-9]/g, '-').replace(TerraQualityRegex.REGEX_G_REGEX_3(), '-').replace(TerraQualityRegex.REGEX_G_REGEX_20(), '');
					if (sQuery) baseName = `${baseName}-${sQuery}`;
				}
				rel = baseName;
			} catch (_e) {
				rel = rel.split('/').pop()?.replace(/[^a-zA-Z0-9.-]/g, '-') || 'downloaded-file';
			}
			} else {
				if (!isMdFile && p.startsWith(`${r}/`)) rel = p.slice(r.length + 1);
				else if (isMdFile) rel = p.split('/').pop() || p;
			}
			if (o.flatten) {
				if (/(?:\/|^)index\.[^.]+$/i.test(p) && p.includes('/')) {
					const parts = p.split('/');
					rel = `${parts[parts.length - 2]}${p.match(TerraQualityRegex.REGEX_PATTERN_REGEX())?.[0] || ''}`;
				} else rel = p.split('/').pop() || rel;
			}
			if (forceExt) {
				if (rel.match(TerraQualityRegex.REGEX_A_Z0_9_I_REGEX_2())) rel = rel.replace(TerraQualityRegex.REGEX_A_Z0_9_I_REGEX_2(), forceExt);
				else rel = `${rel}${forceExt}`;
			}
			return rel || 'untitled-file';
		};

		/**
		 * Fetches the fetch Asset Data.
		 *
		 * @param p - Value passed to the helper.
		 *
		 * @returns fetch Asset Data.
		 */
		const fetchAssetData = async (p: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> => {
			if (TerraQualityRegex.REGEX_HTTPS_I_REGEX().test(p)) {
				try {
					console.info('[archive] fetching remote asset directly', { path: p });
					const res = await fetch(p, { signal: AbortSignal.timeout(20_000) });
					if (res.ok) {
						const buffer = await res.arrayBuffer();
						console.info('[archive] remote asset fetched directly', { path: p, bytes: buffer.byteLength });
						return { buffer, contentType: res.headers.get('content-type') || '' };
					}
					console.warn('[archive] direct remote asset fetch failed; trying server proxy', { path: p, status: res.status });
				} catch (err) {
					console.warn('[archive] direct remote asset fetch threw; trying server proxy', { path: p, err });
				}
			}
			const { data, error } = await actions.read.asset.get({ path: p });
			if (error || !data) {
				console.error('[archive] Failed to fetch asset through Docs read action', { path: p, error });
				throw error || new Error('Failed to read asset');
			}
			console.info('[archive] asset fetched', { path: p, bytes: data.byteLength });
			return { buffer: data, contentType: '' };
		};
		for (const task of tasks) {
			const { path: p, type } = task;
			console.info('[archive] processing task', { path: p, type, filename: assetNameMap.get(p.split('?')[0] || p), merge: o.merges[type as keyof typeof o.merges] });
			if (type === 'pages' && !mdPaths.includes(p)) {
				try {
					const res = await fetchAssetData(p);
					if (res) {
						if (o.merges.pages) textJson.push({ path: p, filename: resolvePath(p), value: new TextDecoder().decode(res.buffer) });
						else zip.file(resolvePath(p), res.buffer);
						console.info('[archive] text attachment processed', { path: p, filename: resolvePath(p), bytes: res.buffer.byteLength, merged: o.merges.pages });
					}
				} catch (e) {
					console.error(`[archive] Error fetching text attachment for ${p}:`, e);
					failures.push({ filename: assetNameMap.get(p.split('?')[0] || p) || resolvePath(p), path: p, reason: e instanceof Error ? e.message : String(e) });
				}
			} else if (type === 'pages') {
				if (o.format === 'pdf') {
					try {
						const { data: routeData } = await actions.read.util.pathname({ path: p });
						if (routeData) {
							const url = `${window.location.origin}${routeData}`;
							const { data, error } = await actions.read.external.pdf({ url });
							if (!error && data && data.pdfBase64) {
								const byteChars = atob(data.pdfBase64);
								const byteNums = new Array(byteChars.length);
								for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
								const byteArray = new Uint8Array(byteNums);
								if (o.merges.pages && mergedPdf) {
									const { PDFDocument } = await import('pdf-lib');
									const pdfDoc = await PDFDocument.load(byteArray);
									(await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices())).forEach(p => mergedPdf.addPage(p));
								} else {
									zip.file(resolvePath(p, '.pdf'), byteArray);
								}
							} else if (error) console.error(`[archive] PDF Conversion Error for ${url}:`, error);
						}
					} catch (e) {
						console.error(`[archive] Pages -> PDF exception for ${p}:`, e);
					}
				} else {
					const { data, error } = await actions.read.doc.get({ path: p });
					if (!error && data) {
						const doc = data as Md;
						const fm = ['---'];
						if (doc.title) fm.push(`title: "${doc.title.replace(TerraQualityRegex.REGEX_G_REGEX_5(), '\\"')}"`);
						if (doc.description) fm.push(`description: "${doc.description.replace(TerraQualityRegex.REGEX_G_REGEX_5(), '\\"')}"`);
						fm.push('---');
						let localSrc = typeof doc.source === 'string' ? doc.source : '';
						localSrc = localSrc.replace(/\]\((http[^)]+)\)/g, (m, l) => {
							const basename = l.split('/').pop()?.split('?')[0];
							return basename ? `](${basename})` : m;
						});
						localSrc = localSrc.replace(/src=["'](http[^"']+)["']/g, (m, l) => {
							const basename = l.split('/').pop()?.split('?')[0];
							return basename ? `src="${basename}"` : m;
						});
						if (o.merges.pages) {
							let relPath = p;
							if (!isMdFile && p.startsWith(`${r}/`)) relPath = p.slice(r.length + 1);
							else if (isMdFile) relPath = p.split('/').pop() || p;
							const dir = relPath.includes('/') ? relPath.substring(0, relPath.lastIndexOf('/')) : '.';
							const fname = relPath.split('/').pop() || '';
							const key = dir === '.' ? fname.replace(TerraQualityRegex.REGEX_PATTERN_REGEX(), '') : dir;
							if (!gJson[key]) gJson[key] = [];
							let src = typeof doc.source === 'string' ? doc.source : '';
							src = src.replace(/\]\((?!http|#)([^)]+)\)/g, (m, l) => {
								const basename = l.split('/').pop();
								return basename ? `](${basename})` : m;
							});
							src = src.replace(/src=["'](?!http|#)([^"']+)["']/g, (m, l) => {
								const basename = l.split('/').pop();
								return basename ? `src="${basename}"` : m;
							});
							gJson[key].push({ title: fname, description: doc.description, source: src });
						} else {
							zip.file(resolvePath(p, '.mdx'), `${fm.join('\n')}\n\n${localSrc}`);
						}
					} else if (error) console.error(`[archive] Error fetching doc content for ${p}:`, error);
				}
			} else if (type === 'pdfs') {
				try {
					const res = await fetchAssetData(p);
					if (res && res.buffer) {
						if (o.merges.pdfs && mergedPdf) {
							try {
								const { PDFDocument } = await import('pdf-lib');
								const pdfDoc = await PDFDocument.load(res.buffer);
								const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
								copiedPages.forEach(p => mergedPdf.addPage(p));
								console.info('[archive] PDF merged', { path: p, pages: copiedPages.length });
							} catch (err) {
								console.error('[archive] PDF merge failed; preserving standalone PDF', { path: p, err });
								zip.file(resolvePath(p, '.pdf'), res.buffer);
							}
						} else {
							zip.file(resolvePath(p, '.pdf'), res.buffer);
						}
					}
				} catch (e) {
					console.error(`[archive] Exception processing PDF ${p}:`, e, { filename: assetNameMap.get(p.split('?')[0] || p), merge: o.merges.pdfs });
					failures.push({ filename: assetNameMap.get(p.split('?')[0] || p) || resolvePath(p), path: p, reason: e instanceof Error ? e.message : String(e) });
				}
			} else if (type === 'images') {
				try {
					const res = await fetchAssetData(p);
					if (res && res.buffer) {
						if (o.merges.images && mergedPdf) {
							try {
								let img: PDFImage | undefined;
								if (p.match(/\.(jpe?g)$/i)) img = await mergedPdf.embedJpg(res.buffer);
								else if (p.match(/\.(png)$/i)) img = await mergedPdf.embedPng(res.buffer);
								if (img) {
									mergedPdf.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
								} else {
									console.warn(`[archive] Unsupported image type for PDF merge, zipping standalone: ${p}`);
									zip.file(resolvePath(p), res.buffer);
								}
							} catch (e) {
								console.error(`[archive] Failed to embed image ${p} into PDF, zipping instead:`, e);
								zip.file(resolvePath(p), res.buffer);
							}
						} else {
							zip.file(resolvePath(p), res.buffer);
						}
					}
				} catch (e) {
					console.error(`[archive] Exception processing Image ${p}:`, e);
					failures.push({ filename: assetNameMap.get(p.split('?')[0] || p) || resolvePath(p), path: p, reason: e instanceof Error ? e.message : String(e) });
				}
			} else if (type === 'youtube') {
				try {
					if (p.includes('youtube.com/') || p.includes('youtu.be/')) {
						const { data: ytData, error: ytErr } = await actions.read.external.youtube({ url: p });
						if (!ytErr && ytData) {
							const cTitle = ytData.title || 'video';
							if (o.merges.youtube) {
								if (!gJson['youtube']) gJson['youtube'] = [];
								gJson['youtube'].push({ title: cTitle as string, source: (ytData.transcript as string) || '' });
							} else {
								zip.file(resolvePath(`${sanitizeName(cTitle as string)}.txt`), (ytData.transcript as string) || '');
							}
						} else if (ytErr) console.error(`[archive] Error fetching YouTube transcript for ${p}:`, ytErr);
					} else {
						const res = await fetchAssetData(p);
						if (res && res.buffer) {
							const videos = JSON.parse(new TextDecoder().decode(res.buffer)) as { title?: string; sourceUrl?: string }[];
							if (Array.isArray(videos)) {
								for (const video of videos) {
									if (video.sourceUrl) {
										const { data: ytData, error: ytErr } = await actions.read.external.youtube({ url: video.sourceUrl });
										if (!ytErr && ytData) {
											const cTitle = ytData.title || video.title || 'video';
											if (o.merges.youtube) {
												if (!gJson['youtube']) gJson['youtube'] = [];
												gJson['youtube'].push({ title: cTitle as string, source: (ytData.transcript as string) || '' });
											} else {
												zip.file(resolvePath(`${sanitizeName(cTitle as string)}.txt`), (ytData.transcript as string) || '');
											}
										}
									}
								}
							}
						}
					}
				} catch (e) {
					console.error(`[archive] Exception processing YouTube resource ${p}:`, e);
				}
			} else if (type === 'tsdocs') {
				try {
					const scopeMatch = p.match(TerraQualityRegex.REGEX_DOCS_TSDOCS_REGEX());
					const scope = scopeMatch ? scopeMatch[1] : p;
					const { data: tsData, error: tsErr } = await actions.read.tsdocs({ scope });
					if (!tsErr && tsData && tsData.docs) {
						const items = tsData.docs as { slug: string; title: string; body: string }[];
						if (o.merges.tsdocs) {
							if (!gJson['tsdocs']) gJson['tsdocs'] = [];
							items.forEach(d => {
								// prettier-ignore
								gJson['tsdocs'].push({ title: d.title, slug: d.slug, source: d.body });
							});
						} else {
							// prettier-ignore
							zip.file(resolvePath(`${sanitizeName(scope.replace(TerraQualityRegex.REGEX_G_REGEX_10(), '-'))}.json`), JSON.stringify(items.map(d => ({ title: d.title, slug: d.slug, source: d.body })), null, 2));
						}
					} else if (tsErr) console.error(`[archive] Error fetching TSDocs for scope ${scope}:`, tsErr);
				} catch (e) {
					console.error(`[archive] Exception processing TSDocs ${p}:`, e);
				}
			} else {
				try {
					const res = await fetchAssetData(p);
					if (res && res.buffer) {
						let tgtPath = resolvePath(p);
						if (!TerraQualityRegex.REGEX_A_Z0_9_I_REGEX_2().test(tgtPath)) {
							let forcedExt = '';
							if (res.contentType.includes('application/pdf')) forcedExt = '.pdf';
							else if (res.contentType.includes('image/jpeg')) forcedExt = '.jpg';
							else if (res.contentType.includes('image/png')) forcedExt = '.png';
							else if (res.contentType.includes('image/webp')) forcedExt = '.webp';
							else if (res.contentType.includes('application/json')) forcedExt = '.json';
							else {
								const arr = new Uint8Array(res.buffer.slice(0, 4));
								if (arr[0] === 0x25 && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x44) forcedExt = '.pdf';
							}
							if (forcedExt) tgtPath = resolvePath(p, forcedExt);
							if (forcedExt === '.pdf' && o.merges.pdfs && mergedPdf) {
								const { PDFDocument } = await import('pdf-lib');
								const pdfDoc = await PDFDocument.load(res.buffer);
								(await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices())).forEach(p => mergedPdf.addPage(p));
								updateProgress();
								continue;
							}
						}
						zip.file(tgtPath, res.buffer);
					}
				} catch (e) {
					console.error(`[archive] Exception processing Other attachment ${p}:`, e);
					failures.push({ filename: assetNameMap.get(p.split('?')[0] || p) || resolvePath(p), path: p, reason: e instanceof Error ? e.message : String(e) });
				}
			}
			updateProgress();
		}

		// FINALISE MERGES
		// Write distinct JSON files for merged categories to prevent structural collisions
		// and isolate domain concerns when consumed by external tools.
		if (o.merges.tsdocs && gJson['tsdocs']) {
			zip.file(`${f}-tsdocs.json`, JSON.stringify(gJson['tsdocs'], null, 2));
			delete gJson['tsdocs'];
		}
		if (o.merges.youtube && gJson['youtube']) {
			zip.file(`${f}-youtube.json`, JSON.stringify(gJson['youtube'], null, 2));
			delete gJson['youtube'];
		}
		if (o.merges.pages && o.format === 'raw' && Object.keys(gJson).length > 0) zip.file(`${f}-mdx.json`, JSON.stringify(gJson, null, 2));
		if (o.merges.pages && textJson.length > 0) zip.file(`${f}-text.json`, JSON.stringify(textJson, null, 2));
		console.info('[archive] merged text summary', { count: textJson.length, files: textJson.map(i => i.filename) });
		if (failures.length) {
			console.warn('[archive] export completed with failures', { count: failures.length, failures });
			toast.warning(`${failures.length} attachment${failures.length === 1 ? '' : 's'} failed. See the browser console for details.`);
		} else toast.success('Export completed.');
		if (wantsPdfMerge && mergedPdf && mergedPdf.getPageCount() > 0) {
			try {
				const mergedPdfBytes = await mergedPdf.save();
				zip.file(`${f}-merged.pdf`, mergedPdfBytes);
				console.info('[archive] merged PDF finalized', { pages: mergedPdf.getPageCount(), bytes: mergedPdfBytes.length });
			} catch (e) {
				console.error(`[archive] Error generating Master PDF:`, e);
			}
		}
		const href = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
		const link = document.createElement('a');
		link.href = href;
		link.download = `${f}.zip`;
		link.click();
		URL.revokeObjectURL(href);
	},
	/**
	 * Renders the export dialog component.
	 *
	 * @param props - Selected export target, target-state setter, and disabled state for the archive dialog.
	 * @param tgt - Tgt input supplied to export dialog's operation.
	 * @param setTgt - State setter for tgt.
	 * @param disabled - Disabled state controlling whether export dialog accepts interaction.
	 *
	 * @return The shared export dialog for the selected Docs paths, or `null` when no target is active.
	 */
	ExportDialog({ tgt, setTgt, disabled }: { tgt: ExportTgt; setTgt: (val: ExportTgt) => void; disabled: boolean }): JSX.Element | null {
		return <SharedExportDialog target={tgt} setTarget={setTgt} disabled={disabled} onExport={(t, o, p) => SidebarComponents.archive(t.paths, t.rootDir, t.filename, o, p, t.nodeIds || [])} />;
	},
} as {
	archive: (v: string[], r: string, f: string, o: ExportOptions, d?: (percent: number) => void, n?: string[]) => Promise<void>;
	ExportDialog: (props: { tgt: ExportTgt; setTgt: (val: ExportTgt) => void; disabled: boolean }) => JSX.Element | null;
	ManageAttchsDialog: (props: { tgt: AttchTgt | null; setTgt: React.Dispatch<React.SetStateAction<AttchTgt | null>>; disabled: boolean; tree: TreeType[] }) => JSX.Element | null;
	PromptDialog: (props: { state: PromptState; setState: (v: PromptState) => void; disabled: boolean }) => JSX.Element | null;
	DeleteDialog: (props: { tgt: DelTgt; setTgt: (v: DelTgt) => void; onConfirm: () => void; disabled: boolean }) => JSX.Element | null;
};

/**
 * RENDER TRIPWIRE
 * A diagnostic tool to catch and analyze React infinite loops.
 *
 * @param componentName - Component name input supplied to use render tripwire's operation.
 * @param trackedVars - Tracked vars input supplied to use render tripwire's operation.
 */
function useRenderTripwire(componentName: string, trackedVars: Record<string, unknown>): void {
	const renders = useRef(0);
	const prevVars = useRef(trackedVars);
	const now = performance.now();
	const windowStart = useRef(now);
	if (now - windowStart.current > 500) {
		windowStart.current = now;
		renders.current = 0;
	}
	renders.current++;
	if (renders.current > 50) {
		const diff: Record<string, { old: unknown; new: unknown }> = {};
		for (const key in trackedVars) if (trackedVars[key] !== prevVars.current[key]) diff[key] = { old: prevVars.current[key], new: trackedVars[key] };
		console.error(`🚨 [TRIPWIRE TRIGGERED] Infinite Loop in ${componentName} 🚨`);
		console.error(`Detected 50 renders in rapid succession. Average delta: ${(now - windowStart.current).toFixed(2)}ms`);
		console.error('State Differences (What is causing the thrash):', JSON.stringify(diff));
		console.trace(`Trace for ${componentName} infinite loop`);
		throw new Error(`Render Tripwire killed infinite loop in ${componentName}. Check console for state diffs.`);
	}
	prevVars.current = trackedVars;
}

/*//////////////////////////////////////////////////
COMPONENTS
//////////////////////////////////////////////////*/

/*
 * Dialog component for selecting and managing all attachments across a section tree.
 *
 * @param props - Active attachment target, state setter, disabled state, and Docs tree for browsing and managing related assets.
 * @param tgt - The specific target node (Leaf, Group, or Section) receiving the attachment modifications.
 * @param setTgt - State dispatcher to clear or update the active target boundary, closing the dialog.
 * @param disabled - Master lock preventing interactions while network mutations or animations are active.
 * @param tree - Tree input supplied to manage attchs dialog's operation.
 *
 * @return The interactive modal overlay containing the attachment dashboard.
 *
 * @remarks
 * Provides a unified interface for uploading raw media, scraping external web links, linking YouTube videos,
 * and directly associating existing or new internal documentation pages as relational attachments.
 */
SidebarComponents.ManageAttchsDialog = function ManageAttchsDialog({
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
	const [a, setActive] = useState<{ title: string; fullTitle: string; id: string; path: string; type: string } | null>(null);
	const [addMode, setAddMode] = useState<AttchType | 'select' | 'page' | null>(null);
	const [url, setUrl] = useState('');
	const [query, setQuery] = useState('');
	const [isCreating, setIsCreating] = useState(false);
	const [selAtts, setSelAtts] = useState<{ docPath: string; a: Sister }[]>([]);
	const fileRef = useRef<HTMLInputElement | null>(null);
	useRenderTripwire('ManageAttchsDialog', { tgt, disabled, tree, atts, loading, active: a, addMode, url, query, isCreating, selectedAtts: selAtts });
	const nodeGroups = useMemo(() => {
		if (!tgt) return [];
		const n = tgt.node;
		if (tgt.scope === 'leaf') {
			const lTitle = cTitle(toNodeLabel(tgt.title)) || tgt.title;
			return [{ groupTitle: 'Page', nodes: [{ title: lTitle, fullTitle: lTitle, id: (n as LeafNode).origName, path: (n as LeafNode).path || '', type: 'Page' as const, node: n }] }];
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
			(n as Branch).children?.forEach(c => {
				if (c.type === 'leaf') {
					const lTitle = cTitle(toNodeLabel(c.title || c.origName));
					gNodes.push({ title: lTitle, fullTitle: `${gTitle} / ${lTitle}`, id: c.origName, path: c.path || '', type: 'Page' as const, node: c });
				}
			});
			return [{ groupTitle: gTitle, nodes: gNodes }];
		}
		if (tgt.scope === 'section') {
			const groups: { groupTitle: string; nodes: { title: string; fullTitle: string; id: string; path: string; type: 'Index' | 'Page'; node: TreeType }[] }[] = [];
			const sectTitle = cTitle(toNodeLabel(tgt.title));
			// prettier-ignore
			groups.push({ groupTitle: 'Section Root', nodes: [{ title: `${sectTitle} (Index)`, fullTitle: sectTitle, id: (n as Branch).origName, path: 'url' in n && n.url ? n.url.replace(TerraQualityRegex.REGEX_DOCS_REGEX(), '') : '', type: 'Index' as const, node: n },] });
			(n as Branch).children?.forEach(c => {
				if (c.type === 'branch') {
					const gTitle = cTitle(toNodeLabel(c.title || c.origName));
					const gNodes = [];
					// prettier-ignore
					gNodes.push({ title: `${gTitle} (Index)`, fullTitle: `${sectTitle} / ${gTitle}`, id: c.origName, path: 'url' in c && c.url ? c.url.replace(TerraQualityRegex.REGEX_DOCS_REGEX(), '') : '', type: 'Index' as const, node: c });
					c.children?.forEach(l => {
						if (l.type === 'leaf') {
							const lTitle = cTitle(toNodeLabel(l.title || l.origName));
							gNodes.push({ title: lTitle, fullTitle: `${sectTitle} / ${gTitle} / ${lTitle}`, id: l.origName, path: l.path || '', type: 'Page' as const, node: l });
						}
					});
					groups.push({ groupTitle: gTitle, nodes: gNodes });
				} else if (c.type === 'leaf') {
					const lTitle = cTitle(toNodeLabel(c.title || c.origName));
					groups[0].nodes.push({ title: lTitle, fullTitle: `${sectTitle} / ${lTitle}`, id: c.origName, path: c.path || '', type: 'Page' as const, node: c });
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
			nodes.forEach(n => {
				const currTitle = n.title || n.origName;
				if (n.type === 'leaf') {
					if (currTitle.toLowerCase().includes(lowerQuery) || (n.path ? n.path.toLowerCase() : '').includes(lowerQuery)) {
						leaves.push({ path: n.path!, title: currTitle, breadcrumb: pathStr });
					}
				} else if (n.type === 'branch' && n.children) walk(n.children, pathStr ? `${pathStr} / ${currTitle}` : currTitle);
			});
		})(tree, '');
		return leaves;
	}, [query, tree]);
	useEffect(() => {
		if (tgt?.scope === 'leaf') {
			const lTitle = cTitle(toNodeLabel(tgt.title)) || tgt.title;
			setActive({ title: lTitle, fullTitle: lTitle, id: (tgt.node as LeafNode).origName, path: (tgt.node as LeafNode).path || '', type: 'Page' });
		} else setActive(null);
		setAddMode(null);
		setUrl('');
		setQuery('');
		setSelAtts([]);
	}, [tgt]);
	const fetchAtts = useCallback(async () => {
		if (!tgt) return;
		setLoading(true);
		let ids: string[] = [];
		if (a) ids = [a.id];
		else ids = nodeGroups.flatMap(g => g.nodes.map(n => n.id));
		ids = [...new Set(ids.filter(Boolean))];
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
			setSelAtts(v => {
				if (v.find(p => (p.a.id || p.a.path) === (a.id || a.path))) return v.filter(p => (p.a.id || p.a.path) !== (a.id || a.path));
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
		setAtts(v => {
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
	const addRemote = async (v: string, type: AttchType | 'page', tgtPath: string, titleOverride?: string) => {
		if (!tgtPath || !v.trim()) return;
		const urls = v
			.split(TerraQualityRegex.REGEX_N_S_REGEX())
					.filter(u => (type === 'tsdocs' ? u.trim().length > 0 : u.startsWith('http') || isDocsPath(u) || u.startsWith('/tsdocs') || type === 'page'));
		if (!urls.length) return;
		void runMutation(
			async () => {
				await Promise.allSettled(
					urls.map(async u => {
						let t = type;
						if (t === 'other')
							t = u.toLowerCase().split('?')[0].endsWith('.pdf') ? 'document' : TerraQualityRegex.REGEX_PNG_JPE_G_GIF_WEBP_SVG_AVIF_I_REGEX_2().test(u.toLowerCase().split('?')[0] ?? '') ? 'image' : t;
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
							await actions.write.doc.editor({ path: `${dir === '.' ? '' : `${dir}/`}${sanitizeName(w.title || 'website')}.mdx`, source: w.text, title: w.title, type: 'website', sourceUrl: u });
						} else if (t === 'tsdocs') {
							// prettier-ignore
							await actions.write.attachment.link({ path: tgtPath, url: u.startsWith('http') ? u : u.startsWith('/') ? `${window.location.origin}${u}` : `${window.location.origin}${docsPath(`tsdocs/${u}`)}`, type: 'tsdocs', title: u.split('/').filter(Boolean).pop()?.replace(TerraQualityRegex.REGEX_G_REGEX_7(), ' ').replace(TerraQualityRegex.REGEX_B_W_G_REGEX(), c => c.toUpperCase()) || 'Reference' });
						} else await actions.write.attachment.remoteFile({ path: tgtPath, url: u, type: t as AttchType });
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
						(function findGroup(nodes: TreeType[], tgtLeafId: string, currGroupId?: string): boolean {
							for (const n of nodes) {
								if (n.type === 'leaf' && (n.origName === tgtLeafId || n.path === tgtLeafId)) {
									groupId = currGroupId;
									return true;
								}
								if (n.type === 'branch' && n.children) if (findGroup(n.children, tgtLeafId, n.origName)) return true;
							}
							return false;
						})(tree, a.id);
					}
					if (groupId) parentId = groupId;
				}
				const writeRes = await actions.write.doc.editor({ path: newId, title: query, source: 'This page is empty.', parentId }).catch(e => ({ data: null, error: e }));
				if (writeRes.error) throw writeRes.error;
				if (writeRes.data && typeof writeRes.data === 'object' && 'path' in writeRes.data && typeof writeRes.data.path === 'string') finalPath = writeRes.data.path;
				finalTitle = query;
				await new Promise(r => setTimeout(r, 1500));
			} catch (err) {
				notify({ error: err instanceof Error ? err : new Error('Creation failed'), fallback: 'Failed to create leaf.' });
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
			onOpenChange={o => {
				if (!o) {
					setTgt(null);
					setActive(null);
					setAddMode(null);
					setSelAtts([]);
				}
			}}
		>
			<DialogContent size='xl'>
				{/* HEADER */}
				<DialogHeader>
					{a ? (
						<>
							<DialogTitle>
								{tgt.scope !== 'leaf' && (
									<Button
										variant='ghost'
										size='icon'
										aria-label='Back to target list'
										onClick={() => {
											setActive(null);
											setAddMode(null);
											setSelAtts([]);
										}}
									>
										<LeftArrowIcon className='size-5 text-primary-11' aria-hidden='true' />
									</Button>
								)}
								<span className='truncate'>{aPathTitle}</span>
								{addMode && <span className='shrink-0 font-normal text-primary-11'>/ {addMode === 'select' ? 'Add Attachment' : `Add ${addMode}`}</span>}
							</DialogTitle>
							<DialogDescription className='sr-only'>Manage attachments for {aPathTitle}</DialogDescription>
						</>
					) : (
						<>
							<DialogTitle>Manage Attachments — {cTitle(toNodeLabel(tgt.title))}</DialogTitle>
							<DialogDescription>Select a target layer or drag and drop attachments to move them between nodes.</DialogDescription>
						</>
					)}
				</DialogHeader>
				{/* BODY*/}
				<div
					className='min-h-96 flex-1 overflow-y-auto py-4 outline-none'
					tabIndex={-1}
					onClick={() => {
						setSelAtts([]);
					}}
				>
					{loading || disabled ? (
						<div className='flex h-64 items-center justify-center'>
							<Spinner className='size-8 text-primary-10' />
						</div>
					) : !a ? (
						<div className='flex flex-col gap-6'>
							{nodeGroups.map((g, i) => (
								<div key={g.groupTitle + i} className='space-y-3'>
									{nodeGroups.length > 1 && <h4 className='text-sm font-semibold uppercase tracking-wider text-primary-11'>{g.groupTitle}</h4>}
									<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
										{g.nodes.map(n => (
											<Card
												key={n.id}
												className='flex h-full flex-col transition-colors hover:border-primary-8 hover:bg-primary-3/30'
												onDragOver={e => {
													e.preventDefault();
												}}
												onDrop={e => {
													e.preventDefault();
													const sPath = e.dataTransfer.getData('application/source-path');
													const id = e.dataTransfer.getData('application/attachment-id');
													if (!sPath || !id || sPath === n.id) return;
													const srcList = atts[sPath] || [];
													const match = srcList.find(a => a.id === id);
													if (!match) return;
													setAtts(p => ({ ...p, [sPath]: srcList.filter(a => a.id !== id), [n.id]: [...(p[n.id] || []), match] }));
													void actions.write.attachment.move({ sourceDocPath: sPath, targetDocPath: n.id, attachmentKey: id }).then(({ error: err }) => {
														if (err) {
															setAtts({ ...atts });
															toast.error('Move failed');
															notify({ error: new Error(err.message || 'Move failed'), fallback: 'Failed to relocate attachment relational schema node.' });
														}
													});
												}}
											>
												<button
													type='button'
													aria-label={`Open ${n.title}`}
													onClick={e => {
														e.stopPropagation();
														setActive(n);
													}}
													className='flex w-full items-center justify-between border-b border-primary-6 bg-primary-3/30 p-3 text-left transition-colors hover:bg-primary-4/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-8'
												>
													<p className='flex items-center text-sm font-medium'>
														{n.type === 'Page' ? (
															<DocumentIcon className='mr-2 size-4 text-primary-10' aria-hidden='true' />
														) : (
															<CatalogIcon className='mr-2 size-4 text-primary-10' aria-hidden='true' />
														)}
														{n.title}
													</p>
												</button>
												<div className='flex flex-1 flex-wrap content-start gap-2 p-4'>
													{(atts[n.id] || []).length === 0 ? (
														<div className='flex h-12 w-full items-center justify-center opacity-50'>
															<UploadIcon className='size-6 text-primary-8' aria-hidden='true' />
														</div>
													) : (
														(atts[n.id] || []).map(a => {
															const isSelected = selAtts.some(s => (s.a.id || s.a.path) === (a.id || a.path));
															return (
																<button
																	key={a.id || a.path}
																	type='button'
																	aria-pressed={isSelected}
																	aria-label={`Select attachment ${a.name}`}
																	draggable
																	onDragStart={e => {
																		e.dataTransfer.setData('application/source-path', n.id);
																		e.dataTransfer.setData('application/attachment-id', a.id || '');
																		e.dataTransfer.effectAllowed = 'move';
																	}}
																	onKeyDown={e => {
																		if (e.key === 'Enter' || e.key === ' ') {
																			e.preventDefault();
																			toggleSel(e as unknown as React.MouseEvent, n.id, a);
																		}
																	}}
																	onClick={e => {
																		toggleSel(e, n.id, a);
																	}}
																	className={cn(
																		'flex cursor-grab items-center gap-2 rounded-md border px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-8',
																		isSelected ? 'border-primary-9 bg-primary-5 ring-1 ring-primary-8' : 'border-primary-6 bg-primary-3',
																	)}
																>
																	<DocumentIcon className='size-3 shrink-0 text-primary-10' aria-hidden='true' />
																	<span className='max-w-[100px] truncate'>{a.name}</span>
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
						<div className='space-y-6'>
							{addMode ? (
								<div className='flex flex-col gap-6'>
									{addMode === 'select' ? (
										<>
											<div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
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
														type='button'
														aria-label={`Add ${t}`}
														className='flex cursor-pointer flex-col items-center justify-center rounded-xl border border-primary-6 bg-transparent p-4 transition-colors hover:border-primary-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-8'
														onClick={e => {
															e.stopPropagation();
															setAddMode(v as AttchType | 'page');
															setUrl('');
															setQuery('');
														}}
													>
														<React.Fragment>{React.createElement(i, { className: 'size-5 text-primary-11', 'aria-hidden': 'true' })}</React.Fragment>
														<span className='mt-2 text-sm font-medium text-primary-11'>{t}</span>
													</button>
												))}
											</div>
										</>
									) : addMode === 'page' ? (
										<div
											className='flex flex-col gap-4'
											onClick={e => {
												e.stopPropagation();
											}}
										>
											<Input
												autoFocus
												placeholder='Search or type to create...'
												value={query}
												onChange={e => {
													setQuery(e.target.value);
												}}
											/>
											<div className='flex max-h-64 min-h-24 flex-col overflow-y-auto pr-2'>
												{!query.trim() &&
													tree.map(n => (
														<Button
															key={n.origName}
															variant='ghost'
															size='sm'
															className='mt-0.5 h-auto w-full justify-start py-1.5 pl-6 text-left font-normal text-primary-11 hover:text-primary-12'
															onClick={() => void attachPage(n.type === 'leaf' ? n.path || '' : '', false, n.title || n.origName)}
														>
															<span className='truncate'>{n.title || n.origName}</span>
														</Button>
													))}
												{query.trim() && (
													<div className='flex flex-col gap-1'>
														<Button
															variant='ghost'
															className='mb-2 h-auto w-full justify-start border border-dashed border-primary-6 py-2 text-left text-primary-10 hover:border-primary-8 hover:text-primary-12'
															onClick={() => void attachPage('', true)}
															disabled={isCreating}
														>
															<div className='flex flex-col'>
																<span className='text-sm font-medium'>{isCreating ? 'Creating...' : `Create "${query}"`}</span>
																<span className='text-xs opacity-70'>Create page and attach</span>
															</div>
														</Button>
														{filteredLeaves.length > 0 &&
															filteredLeaves.map(r => (
																<Button key={r.path} variant='ghost' className='h-auto w-full justify-start py-2 text-left' onClick={() => void attachPage(r.path, false, r.title)}>
																	<div className='flex flex-col'>
																		<span className='text-sm font-medium'>{r.title}</span>
																		<span className='text-xs text-primary-11 opacity-70'>{r.breadcrumb ? `${r.breadcrumb} / ${r.path}` : r.path}</span>
																	</div>
																</Button>
															))}
													</div>
												)}
											</div>
										</div>
									) : (
										<div
											className='flex flex-col gap-4'
											onClick={e => {
												e.stopPropagation();
											}}
										>
											{!['youtube', 'website', 'tsdocs'].includes(addMode) && (
												<Button variant='outline' className='w-full border-dashed py-8' onClick={() => fileRef.current?.click()}>
													<UploadIcon className='mr-2 size-5' aria-hidden='true' /> Select Files
												</Button>
											)}
											<div className='space-y-2'>
												<Label className='text-xs font-semibold uppercase text-primary-11'>Import via URL</Label>
												{addMode === 'tsdocs' ? (
													<TsDocsSelect
														variant='inline'
														multiple
														value={url ? url.split('\n').filter(Boolean) : []}
														onChange={v => {
															setUrl(Array.isArray(v) ? v.join('\n') : v);
														}}
													/>
												) : (
													<Textarea
														autoFocus
														placeholder='https://...'
														value={url}
														onChange={e => {
															setUrl(e.target.value);
														}}
														rows={3}
														onKeyDown={e => {
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
									<div className='flex min-h-24 flex-wrap content-start gap-3 rounded-md border border-primary-6 bg-primary-2 p-4'>
										{(atts[a.id] || []).length === 0 ? (
											<Empty variant='compact'>No attachments yet.</Empty>
										) : (
											(atts[a.id] || []).map(v => (
												<ContextMenu key={v.id || v.path}>
													<ContextMenuTrigger
														className={cn(
															'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs shadow-sm outline-none transition-colors',
															selAtts.some(s => (s.a.id || s.a.path) === (v.id || v.path)) ? 'border-primary-9 bg-primary-5 ring-1 ring-primary-8' : 'border-primary-6 bg-primary-3',
														)}
														onClick={e => {
															toggleSel(e, a.id, v);
														}}
													>
														<DocumentIcon className='size-3 shrink-0 text-primary-10' />
														<span className='max-w-[200px] truncate font-medium'>{v.name}</span>
													</ContextMenuTrigger>
													<ContextMenuContent>
														<Menu
															actions={[
																{
																	label: 'Copy URL',
																	icon: <LinkIcon />,
																	onSelect: () => {
								void navigator.clipboard.writeText(`${window.location.origin}${docsPath(v.path)}`);
																		toast.success('URL copied');
																	},
																},
																...(v.isMd
																	? [
																			{
																				icon: <MagicIcon />,
																				label: 'Synthesize Content',
																				onSelect: () => {
																					document.dispatchEvent(new CustomEvent('docs:synthesize', { detail: { path: v.path, name: v.name } }));
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
								type='file'
								className='hidden'
								multiple
								onChange={e => {
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
};

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
SidebarComponents.PromptDialog = function PromptDialog({ state: s, setState: setS, disabled }: { state: PromptState; setState: (v: PromptState) => void; disabled: boolean }): JSX.Element | null {
	if (!s) return null;
	return (
		<Dialog
			open={s.open}
			onOpenChange={o => {
				if (!o) {
					s.onCancel?.();
					setS(null);
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{s.title}</DialogTitle>
					<DialogDescription>{s.description || `Enter a new ${s.label.toLowerCase()}.`}</DialogDescription>
				</DialogHeader>
				<div className='py-4'>
					<Input
						autoFocus
						aria-label={s.label}
						value={s.value}
						onChange={e => {
							setS({ ...s, value: e.target.value });
						}}
						className='w-full focus:ring-0'
						disabled={disabled}
						onKeyDown={e => {
							if (e.key === 'Enter') {
								e.preventDefault();
								if (s.value.trim()) {
									s.onSave(s.value.trim());
									setS(null);
								}
							}
						}}
					/>
				</div>
				<DialogFooter>
					<Button
						disabled={disabled || !s.value.trim()}
						onClick={() => {
							if (s.value.trim()) {
								s.onSave(s.value.trim());
								setS(null);
							}
						}}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

/*
 * Renders the delete dialog component.
 *
 * @param props - The selected deletion target, state setter, confirmation callback, and disabled state for the delete confirmation.
 * @param setTgt - Clears or updates the active target.
 * @param tgt - Tgt input supplied to delete dialog's operation.
 * @param disabled - Disabled state controlling whether delete dialog accepts interaction.
 * @param onConfirm - Callback invoked for confirm.
 *
 * @return The delete dialog or nothing when no target is selected.
 *
 * @remarks Renders the delete confirmation dialog for sidebar content.
 */
SidebarComponents.DeleteDialog = function DeleteDialog({
	tgt,
	setTgt,
	onConfirm,
	disabled,
}: {
	tgt: DelTgt;
	setTgt: (v: DelTgt) => void;
	onConfirm: () => void;
	disabled: boolean;
}): JSX.Element | null {
	if (!tgt) return null;
	return (
		<Dialog
			open={!!tgt}
			onOpenChange={o => {
				if (!o) setTgt(null);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete {tgt.kind === 'leaf' ? 'page' : tgt.kind === 'branch' ? 'group' : 'section'}?</DialogTitle>
					<DialogDescription>
						Delete <code>{tgt.title || tgt.path}</code> {tgt.kind !== 'leaf' ? ' and its nested docs.' : '.'} This action cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant='destructive'
						disabled={disabled}
						onClick={() => {
							onConfirm();
						}}
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

/**
 * Renders the top collapsed header boundary on mobile-view structurally isolating context safely cleanly.
 *
 * @return {JSX.Element} Visual mobile heading frame.
 */
/**
 * Main sidebar controller connecting context providers natively driving application visual trees.
 *
 * @param {object} props - Input definitions matching specific nav tree routes.
 * @param docs - Docs input supplied to nav's operation.
 * @param pathname - Pathname input supplied to nav's operation.
 * @param permission - Permission input supplied to nav's operation.
 * @param userData - user record supplied to nav.
 *
 * @return {JSX.Element} Fully formatted UI sidebar assembly correctly binding handlers.
 */
export default (function Nav({
	docs: items,
	pathname,
	permission,
	userData,
	siteTitle = 'Terra Symposium',
	siteDescription,
	homePath = '/',
	...props
}: {
	docs: TreeType[];
	pathname: string;
	permission: import('../../runtime/types.js').DocsPermissionLevel;
	userData?: import('../../runtime/types.js').User | null;
	siteTitle?: string;
	siteDescription?: string;
	homePath?: string;
}): JSX.Element {
	// STATES
	const leafTitle = useAtom($leafTitle);
	const curMode = useAtom($mode);
	const transitioning = useAtom($transition);
	const [creating, setCreating] = useState(false);
	const [loading, setLoading] = useState(false);
	const [drag, setDrag] = useState<DragState | null>(null);
	const [dState, setDState] = useState<ReorderDropState | null>(null);
	const [hovered, setHovered] = useState<string | null>(null);
	const [cPathname, setCPathname] = useState(() => route(pathname || '').pathname);
	const urlIds = useMemo(() => route(cPathname), [cPathname]);
	const [viewedSecId, setViewedSecId] = useState<string | null>(() => route(pathname || '').sectionId || null);
	const [sectionOpen, setSectionOpen] = useState(false);
	const [searchPages, setSearchPages] = useState('');
	const [tree, setTree] = useState(items);
	const prevTree = useRef(items);
	const [selLeaves, setSelLeaves] = useState<string[]>([]);
	const [lastSel, setLastSel] = useState<string | null>(null);

	// DIALOG STATES
	const [manageAttTgt, setManageAttTgt] = useState<AttchTgt | null>(null);
	const [exportTgt, setExportTgt] = useState<{ paths: string[]; rootDir: string; filename: string; title: string; nodeIds?: string[] } | null>(null);
	const [assetTgt, setAssetTgt] = useState<{ path: string; title: string } | null>(null);
	const [assetDialogOpen, setAssetDialogOpen] = useState(false);
	const [assetBusy, setAssetBusy] = useState(false);
	const [assetComponent, setAssetComponent] = useState(repoComponents.find(c => c.name !== 'Leaf' && c.name !== 'Visualize')?.name ?? repoComponents[0]?.name ?? '');
	const [hueDlg, setHueDlg] = useState<{ open: boolean; hue: number; section: TreeType } | null>(null);
	const [inputDlg, setInputDlg] = useState<{ open: boolean; title: string; description?: string; label: string; value: string; onSave: (val: string) => void; onCancel?: () => void } | null>(null);
	const [delTgt, setDelTgt] = useState<{ kind: 'section' | 'branch' | 'leaf'; path: string; bPath?: string; slugPath?: string; active?: boolean; title: string; origNode?: TreeType } | null>(null);

	// INJECT TRIPWIRE TO CATCH STATE THRASHING
	useRenderTripwire('Nav', {
		curMode,
		transitioning,
		creating,
		loading,
		drag,
		dState,
		hovered,
		cPathname,
		urlSectionId: urlIds.sectionId,
		viewedSecId,
		sectionOpen,
		treeHash: tree.length,
		selLeavesCount: selLeaves.length,
		lastSel,
		manageAttTgtScope: manageAttTgt?.scope,
		exportTargetPresent: !!exportTgt,
		assetTargetPresent: !!assetTgt,
		hueDlgOpen: hueDlg?.open,
		inputDlgOpen: inputDlg?.open,
		delTargetPresent: !!delTgt,
	});

	// Sync viewed section with URL on navigation
	useEffect(() => {
		if (urlIds.sectionId) setViewedSecId(urlIds.sectionId);
	}, [urlIds.sectionId]);
	const sects = useMemo(() => {
		let s = Array.isArray(tree) ? tree.filter((d): d is Branch => d.type === 'branch') : [];
		// 1. Deduplicate by origName to prevent React key collisions and redundant entries
		const uniqueMap = new Map<string, Branch>();
		s.forEach(n => {
			if (!uniqueMap.has(n.origName)) uniqueMap.set(n.origName, n);
		});
		s = Array.from(uniqueMap.values());
		// 2. Filter out top-level nodes that are actually children of another top-level node.
		// (This happens if the API returns explicit warrants for both a Section and its inner Group).
		const nestedBranchIds = new Set<string>();
		s.forEach(n => {
			if (n.children)
				(function walk(children: TreeType[]) {
					children.forEach(c => {
						if (c.type === 'branch') {
							nestedBranchIds.add(c.origName);
							if (c.children) walk(c.children);
						}
					});
				})(n.children);
		});
		s = s.filter(n => !nestedBranchIds.has(n.origName));

		// prettier-ignore
		if (/**
		 * SIMULATED SECTION WRAPPER
		 *
		 * If a user accesses a group directly (e.g., via granular permission /docs/{groupId}/{leafId}),
		 * the nav tree will return Groups as the top-level branches instead of Sections.
		 * The sidebar structurally expects Sections at the top level. We intercept this and wrap
		 * the Groups in a simulated "Shared Context" Section to render the tree seamlessly.
	 */ (s.length > 0 && s.every(b => b.children?.every(c => c.type === 'leaf'))) && s[0]?.origName !== urlIds.sectionId) s = [{ type: 'branch', origName: urlIds.sectionId, permission: 'read', simulated: true, title: s[0]?.title || 'Shared Context', url: docsPath(urlIds.sectionId), children: s }];
		// prettier-ignore
		if (s.length === 0 && permission === 'write') s.push({ type: 'branch', origName: 'new-section', permission: 'read', simulated: true, url: docsPath('new-section'), children: [{ type: 'leaf', origName: 'index', path: 'index.mdx', url: docsRootPath(), permission: 'read', title: 'Untitled', fileType: 'mdx' }]});
		return s;
	}, [tree, permission, urlIds.sectionId]);
	const sectsMap = useMemo(() => {
		const map = new Map<string, Branch>();
		for (const s of sects) map.set(s.origName, s);
		return map;
	}, [sects]);
	const aViewed = useMemo(() => {
		if (viewedSecId) {
			const match = sectsMap.get(viewedSecId);
			if (match) return match;
		}
		if (urlIds.sectionId) {
			const fallback = sectsMap.get(urlIds.sectionId);
			if (fallback) return fallback;
		}
		return sects[0];
	}, [sects, sectsMap, viewedSecId, urlIds.sectionId]);
	const children = useMemo(() => {
		return aViewed?.type === 'branch' ? aViewed.children : [];
	}, [aViewed]);
	const visibleChildren = useMemo(() => filterTree(children ?? [], searchPages), [children, searchPages]);

	// INIT / MOUNT
	useEffect(() => {
		if (JSON.stringify(items) !== JSON.stringify(prevTree.current)) {
			setTree(items);
			prevTree.current = items;
		}
	}, [items]);
	useEffect(() => {
		setCPathname(route(pathname).pathname);
	}, [pathname]);
	const refreshTree = useCallback(async (): Promise<void> => {
		try {
			const { data, error: err } = (await actions.read.doc.list({ type: 'nav', pathname: docsRootPath(), full: true })) as ActionRes<TreeType[]>;
			if (!err && Array.isArray(data) && data.length !== 0) setTree(data);
		} catch (err) {
			console.error('[DEBUG:Sidebar] refreshTree err: ', err);
		}
	}, []);
	useEffect(() => {
		/*
		 * Handles update sidebar node title.
		 *
		 * @param nodes - Sidebar nodes containing the document to rename.
		 * @param targetPath - Path of the document whose title should change.
		 * @param newTitle - New title assigned to the matching document.
		 */
		if (leafTitle?.path)
			setTree(c =>
				(function updateSidebarNodeTitle(nodes: TreeType[], tgtPath: string, newTitle: string): TreeType[] {
					/**
					 * Normalizes a sidebar asset path for comparisons by removing draft and file-extension markers.
					 *
					 * @param val - Sidebar document path or basename to normalize before matching a title update.
					 */
					const cPath = (val: string): string => val.replace(TerraQualityRegex.REGEX_DRAFTS_REGEX(), '').replace(TerraQualityRegex.REGEX_MD_MDX_PDF_I_REGEX(), '');
					return nodes.map(n => {
						const nodePath = n.type === 'leaf' ? n.path || '' : '';
						if (
							n.type === 'leaf' &&
							(nodePath === tgtPath || n.origName === tgtPath || cPath(nodePath) === cPath(tgtPath) || cPath(nodePath.split('/').at(-1) || nodePath) === cPath(tgtPath.split('/').at(-1) || tgtPath))
						)
							return { ...n, title: newTitle };
						if (n.type === 'branch' && n.children) return { ...n, children: updateSidebarNodeTitle(n.children, tgtPath, newTitle) };
						return n;
					});
				})(c, leafTitle.path, leafTitle.title),
			);
	}, [leafTitle]);
	useEffect(() => {
		/**
		 * Handles rename event.
		 *
		 * @param e - Rename event carrying the updated document path.
		 */
		const ES = [
			{
				handler: (e: Event): void => {
					const d = eDetail<
						/* Basic draft details utilized by sidebar renaming and drafting events. */ ({
							path: string;
							title: string;
						} & {
							nfilepath: string;
							pathname: string;
						}) & { isActive?: boolean }
					>(e);
					if (!d?.path || !d.nfilepath) return;
					createTrace('DOCS:shared', isDevOrigin(globalThis.location?.origin ?? ''))('rename.start', { next: d.nfilepath, previous: d.path });
					setTree(current => {
						const renamed: TreeType[] = [];
						const pending: { source: TreeType[]; target: TreeType[]; index: number }[] = [{ source: current, target: renamed, index: 0 }];
						while (pending.length > 0) {
							const frame = pending[pending.length - 1]!;
							if (frame.index >= frame.source.length) {
								pending.pop();
								continue;
							}
							const node = frame.source[frame.index++]!;
							if (node.type === 'leaf' && node.path === d.path) {
								const slug = d.nfilepath.replace(TerraQualityRegex.REGEX_PATTERN_REGEX_6(), '').replace(FILES.markdown, '').replace(TerraQualityRegex.REGEX_INDEX_I_REGEX(), '');
								frame.target.push({ ...node, path: d.nfilepath, title: d.title ?? node.title, url: docsPath(slug) });
								continue;
							}
							if (node.type === 'branch') {
								const children: TreeType[] = [];
								frame.target.push({ ...node, children });
								pending.push({ source: node.children ?? [], target: children, index: 0 });
								continue;
							}
							frame.target.push(node);
						}
						return renamed;
					});
					if (d.isActive) setCPathname(route(d.pathname).pathname);
				},
				type: 'docs:rename',
			},
			{
				handler: (e: Event): void => {
					const d = eDetail<{ url?: string; pathname?: string }>(e);
					if (d?.url || d?.pathname) setCPathname(route(d.url || d.pathname || '').pathname);
				},
				type: 'docs:navigate',
			},
		];
		ES.forEach(({ type: t, handler: h }) => {
			document.addEventListener(t, h);
		});
		return () => {
			ES.forEach(({ type: t, handler: h }) => {
				document.removeEventListener(t, h);
			});
		};
	}, []);
	const findActiveLeaf = useCallback((v: TreeType[], t: string): LeafNode | null => {
		for (const n of v) {
			if (n.type === 'leaf' && n.url === t) return n;
			if (n.type === 'branch' && n.children) {
				const found = findActiveLeaf(n.children, t);
				if (found) return found;
			}
		}
		return null;
	}, []);

	// MULTI-SELECT HANDLERS
	const handleSelect = useCallback(
		(v: string, i: boolean, r: boolean) => {
			setSelLeaves(s => {
				if (r) {
					const anchor = lastSel || findActiveLeaf(tree, cPathname)?.path;
					if (anchor) {
						const allLeaves: string[] = [];
						/*
						 * Handles walk.
						 *
						 * @param nodes - Sidebar nodes traversed while collecting leaf paths.
						 */
						(function walk(nodes: TreeType[]) {
							nodes.forEach(n => {
								if (n.type === 'leaf' && n.path) allLeaves.push(n.path);
								if (n.type === 'branch' && n.children) walk(n.children);
							});
						})(tree);
						const i1 = allLeaves.indexOf(anchor);
						const i2 = allLeaves.indexOf(v);
						if (i1 !== -1 && i2 !== -1) return Array.from(new Set([...(i ? s : []), ...allLeaves.slice(Math.min(i1, i2), Math.max(i1, i2) + 1)]));
					}
				}
				if (i) {
					setLastSel(v);
					if (s.includes(v)) return s.filter(p => p !== v);
					return [...s, v];
				}
				setLastSel(v);
				return [v];
			});
		},
		[tree, lastSel, cPathname, findActiveLeaf],
	);
	const clearSelection = useCallback(() => {
		setSelLeaves([]);
		setLastSel(null);
	}, []);
	const mergeLeaves = useCallback(
		(v: string[]) => {
			const leafOrder = new Map<string, number>();
			(function walk(nodes: TreeType[], order = 0): number {
				for (const node of nodes) {
					if (node.type === 'leaf' && node.path) leafOrder.set(node.path, order++);
					if (node.type === 'branch' && node.children) order = walk(node.children, order);
				}
				return order;
			})(tree);
			const orderedPaths = Array.from(new Set(v)).sort((a, b) => (leafOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (leafOrder.get(b) ?? Number.MAX_SAFE_INTEGER));
			if (orderedPaths.length < 2) return;
			setInputDlg({
				open: true,
				title: 'Merge Pages',
				label: 'New page title',
				value: 'Merged Page',
				onCancel: () => {},
				onSave: nTitle => {
					// prettier-ignore
					void runMutation(
						async () => {
							try {
								const [firstPath, ...restPaths] = orderedPaths;
								if (!firstPath) throw new Error('Not enough valid documents to merge');
								setTree(v => {
														/*
									 * Handles prune.
																		 *
																											 * @param items - Sidebar items being pruned from the tree.
									 */
									return (function prune(items: TreeType[]): TreeType[] {
						const n: TreeType[] = [];
						for (const node of items) {
							if (node.type === 'leaf') {
								if (!node.path || new Set(restPaths).has(node.path)) continue;
								n.push(node.path === firstPath ? { ...node, title: nTitle } : node);
								continue;
							}
							if (!node.children) {
								n.push(node);
								continue;
							}
							const children = prune(node.children);
							if (children.length > 0) n.push({ ...node, children });
						}
						return n;
					})(v);
								});
				const pages = (await Promise.all(orderedPaths.map(p => actions.read.doc.get({ path: p }))))
					.map((r, i) => ({ path: orderedPaths[i]!, doc: r?.data as Md | undefined }))
					.filter((e): e is { path: string; doc: Md } => Boolean(e.doc));
								if (pages.length < 2) throw new Error('Not enough valid documents to merge');
								const hoisted = new Set<string>();
								const mergedContent = (hoisted.size > 0 ? Array.from(hoisted).join('\n') + '\n\n' : '') + (pages.map(({ doc: d }) => {
					let raw = (typeof d.source === 'string' ? d.source : '') || latestContent(d.content) || '';
									// extract standard imports securely without collapsing body blocks
									raw = raw.replace(/^import\s+[^;]+;/gm, m => {
										hoisted.add(m.trim());
										return '';
									});
									// extract generated MDX exports targeting typical runtime const outputs
									raw = raw.replace(/^export\s+(const|let|var|type|interface)\s+[^;]+;/gm, m => {
										hoisted.add(m.trim());
										return '';
									});
									return `## ${d.title || 'Untitled'}\n\n${raw.trim()}`;
								})).join('\n\n');
								const mergedDesc = pages.map(({ doc: d }) => d.description).filter(Boolean).join(' ').substring(0, 500);
								const { data: nDoc, error: createErr } = (await actions.write.doc.editor({ path: firstPath, title: nTitle, description: mergedDesc, source: mergedContent })) as ActionRes<Md>;
								if (createErr || !nDoc) throw createErr || new Error('Failed to merge doc');
								const { error: srcErr } = await actions.write.doc.retargetSources({ sourceIds: restPaths, targetId: nDoc.path || firstPath });
								if (srcErr) throw srcErr;
								// pass the raw path string straight out of the selection array to the RM action to safely hit Sanity identifiers without verifyWrite injecting `.mdx`
								for (const p of restPaths) {
									if ((TerraQualityRegex.REGEX_INDEX_MD_MDX_I_REGEX().test(p))) await actions.write.doc.rm({ path: dirname(p), type: 'folder' });
									else await actions.write.doc.rm({ path: p, assets: false, type: 'doc' });
								}
								setSelLeaves([]);
								setLastSel(null);
							const tgtRoute = nDoc.pathname || docsPath(dirname(firstPath).toLowerCase());
									memoryDrafts.set(tgtRoute, { source: (typeof nDoc.source === 'string' ? nDoc.source : '') || latestContent(nDoc.content) || '', draft: { content: Array.isArray(nDoc.content) ? nDoc.content : [], description: nDoc.description || '', path: nDoc.path || firstPath, title: nDoc.title || nTitle }, metadata: nDoc });
								$unsavedDrafts.setKey(tgtRoute, false);
								const tgtUrl = new URL(tgtRoute, window.location.origin);
								tgtUrl.searchParams.set('mode', 'edit');
								window.history.pushState(null, '', tgtUrl.toString());
								document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: tgtRoute, pathname: tgtRoute, path: nDoc.path || firstPath, title: nDoc.title || nTitle, description: mergedDesc, source: mergedContent, content: Array.isArray(nDoc.content) ? nDoc.content : undefined, compiledMDX: '' } }),);
								toast.success('Pages merged successfully.');
							} catch (err) {
								setTree((JSON.parse(JSON.stringify(tree)) as TreeType[]));
								throw err;
							}
						},
						'Failed to merge pages.',
						() => { setLoading(true); },
						() => { setLoading(false); },
					);
				},
			});
		},
		[tree],
	);
	const addSection = useCallback(
		(o?: { title?: string; description?: string }) => {
			if ($transition.get()) return;
			setInputDlg({
				open: true,
				title: o?.title || 'Add Section',
				description: o?.description,
				label: 'Section name',
				value: 'Untitled Section',
				onCancel: () => {},
				onSave: name => {
					setInputDlg(null);
					setCreating(true);
					(async () => {
						// prettier-ignore
						try {
							const { data: sNameRes } = await actions.read.util.node({ op: 'name', val: name });
							const tSectId = `temp_s_${Date.now()}`;
							const tGrpId = `temp_g_${Date.now()}`;
							const tLeafId = `temp_l_${Date.now()}`;
							const dPath = `${((sNameRes as string) || 'untitled')}/general/untitled`;
							const url = buildRoute(tSectId, tGrpId, tLeafId);
							const sectUrl = docsPath(tSectId);
							setTree(c => {
								const nTree = JSON.parse(JSON.stringify(c)) as TreeType[];
								if (!nTree.find(n => n.type === 'branch' && 'url' in n && n.url === sectUrl))
									nTree.push({
										type: 'branch', origName: tSectId, permission: 'write', title: name, url: sectUrl,
										children: [{
											type: 'branch', origName: tGrpId, permission: 'write', title: 'General', url: buildRoute(tSectId, tGrpId),
											children: [{ type: 'leaf', fileType: 'mdx', origName: tLeafId, path: dPath, permission: 'write', title: 'Untitled', description: '', url, source: '' }],
										}],
									firstLeafUrl: url, hue: getHue(name),
									});
								return nTree;
							});
							memoryDrafts.set(url, { source: '', draft: { content: [], description: '', path: dPath, title: 'Untitled' }, metadata: { path: dPath, title: 'Untitled', description: '', pathname: url } });
							$unsavedDrafts.setKey(url, false);
							const tgtUrl = new URL(url, window.location.origin);
							tgtUrl.searchParams.set('mode', 'edit');
							window.history.pushState(null, '', tgtUrl.toString());
							document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: url, pathname: url, path: dPath, title: 'Untitled', description: '', source: '', content: [], compiledMDX: '' } }),);
							const { data, error } = await actions.write.doc.createSection({ title: name });
							if (error || !data) throw new Error(error?.message || 'Failed to create section.');
							setTimeout(() => {
								void refreshTree();
							}, 2500);
						} catch (err) {
							console.error('[addSection] Creation failed:', err);
							toast.error(err instanceof Error ? err.message : 'Failed to create section.');
							void refreshTree();
						} finally {
							setCreating(false);
						}
					})();
				},
			});
		},
		[refreshTree],
	);
	const uploadAsLeaf = useCallback(
		async (f: FileList | File[] | null, t: string) => {
			if ($transition.get() || !f || f.length === 0) return;
			runMutation(
				async () => {
					const dir = dirname(t);
					for (let i = 0; i < f.length; i++) {
						const file = f[i];
						if (!file || !TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(file.name)) {
							toast.error(`File ${file?.name} must be a markdown document to be a page.`);
							continue;
						}
						const baseName = sanitizeName(file.name.replace(TerraQualityRegex.REGEX_I_REGEX(), '')) || 'untitled';
						const { error: wErr } = await actions.write.doc.editor({
							path: `${dir && dir !== '.' ? `${dir}/` : ''}${baseName}`,
							title: baseName.replace(TerraQualityRegex.REGEX_G_REGEX_2(), ' '),
							source: await file.text(),
						});
						if (wErr) throw wErr;
					}
					await refreshTree();
					toast.success('Pages uploaded successfully.');
				},
				'Failed to upload as page.',
				() => {
					setLoading(true);
				},
				() => {
					setLoading(false);
				},
			);
		},
		[refreshTree],
	);
	const triggerRenameSection = useCallback(
		(t: TreeType) => {
			const cName = t.type === 'branch' ? t.origName : '';
			const currTitle = cTitle(toNodeLabel(t.title || cName)) || cName;
			setInputDlg({
				open: true,
				title: 'Rename Section',
				label: 'Section name',
				value: currTitle,
				onCancel: () => {},
				onSave: nTitle => {
					if ($transition.get() || t.type !== 'branch') return;
					if (!nTitle || nTitle === currTitle) return;
					runMutation(
						async () => {
							const { error: err } = await actions.write.doc.retitle({ id: t.origName, title: nTitle });
							if (err) throw err;
							await refreshTree();
						},
						'Failed to process rename.',
						() => {
							setLoading(true);
						},
						() => {
							setLoading(false);
						},
					);
				},
			});
		},
		[refreshTree],
	);
	const SidebarActions: {
		saveHue: () => void;
		makeAsset?: () => Promise<void>;
		renderSects?: (t: TreeType) => MenuAction[];
	} = {
		saveHue: useCallback(() => {
			if ($transition.get() || !hueDlg?.section || hueDlg.section.type !== 'branch') return;
			runMutation(
				async () => {
					const tgtSectId = hueDlg.section.origName;
					// Apply hue mutation to Sanity
					const { error: err } = await actions.write.doc.hue({ id: tgtSectId, hue: hueDlg.hue });
					if (err) throw err;
					// 1. Optimistically update our local tree state so the sidebar dot updates immediately
					setTree(p => {
						const n = [...p];
						const idx = n.findIndex(s => s.origName === tgtSectId);
						const section = n[idx];
						if (idx !== -1 && section?.type === 'branch') n[idx] = { ...section, hue: hueDlg.hue };
						return n;
					});
					setHueDlg(null);
					// 2. Wait 2.5 seconds to allow the CDN to index the hue change so it persists properly across page loads.
					await new Promise(r => setTimeout(r, 2500));
					// 3. Refresh tree so subsequent queries use the correct backend hue.
					await refreshTree();
					// 4. Hot-swap the CSS variables robustly
					try {
						const html = await (await fetch(window.location.href)).text();
						const styleMatch = html.match(/<style[^>]*>([\s\S]*?--primary-1:[\s\S]*?)<\/style>/i);
						if (styleMatch) {
							let styleEl = document.getElementById('terra-dynamic-hue');
							if (!styleEl) {
								styleEl = document.createElement('style');
								styleEl.id = 'terra-dynamic-hue';
								document.head.appendChild(styleEl);
							}
							styleEl.innerHTML = styleMatch[1] || '';
							document.dispatchEvent(new CustomEvent('docs:hue-change'));
						} else {
							const inlineMatch = html.match(/<[^>]+style=["']([^"']*?--primary-1:[^"']*?)["']/i);
							if (inlineMatch) document.documentElement.style.cssText = inlineMatch[1] || '';
							else window.location.reload();
						}
					} catch (_e) {
						window.location.reload();
					}
				},
				'Failed to update color.',
				() => {
					setLoading(true);
				},
				() => {
					setLoading(false);
				},
			);
		}, [hueDlg, refreshTree]),
	};
	const rmBranch = useCallback(
		async (f: string, _bPath: string, s: string): Promise<void> => {
			const pNorm = dirname(f) === '.' ? '' : dirname(f);
			let prevTree: TreeType[] = [];
			setTree(c => {
				prevTree = c;
				const nTree = JSON.parse(JSON.stringify(c)) as TreeType[];
				const sibs = getSibs(nTree, pNorm);
				const idx = sibs.findIndex(n => n.type === 'branch' && [pNorm, n.origName].filter(Boolean).join('/') === f);
				if (idx !== -1) sibs.splice(idx, 1);
				return nTree;
			});
			const currPath = cPathname.toLowerCase().replace(TerraQualityRegex.REGEX_PATTERN_REGEX_3(), '');
			const currPrefix = docsPath(s).toLowerCase().replace(TerraQualityRegex.REGEX_PATTERN_REGEX_3(), '');
			const nPrefix = docsPath(dirname(s));
			const redirect =
				currPath !== currPrefix && !currPath.startsWith(`${currPrefix}/`) ? null : `${nPrefix.replace(TerraQualityRegex.REGEX_PATTERN_REGEX_3(), '')}${currPath.slice(currPrefix.length)}` || nPrefix;
			try {
				const { error: err } = await actions.write.doc.rm({ path: s, type: 'folder' });
				if (err && !err.message?.includes('folder not found')) throw err;
				await refreshTree();
				if (redirect && redirect !== cPathname) navigate({ href: redirect, mode: 'view' });
			} catch (err) {
				setTree(prevTree);
				throw err;
			}
		},
		[cPathname, refreshTree],
	);
	const rmLeaf = useCallback(
		async (p: string, b: string, a: boolean): Promise<void> => {
			const isIdx = TerraQualityRegex.REGEX_INDEX_MD_MDX_I_REGEX().test(p);
			const tgtPath = isIdx ? dirname(p) : p;
			const tgtType = isIdx ? 'folder' : 'doc';
			let prevTree: TreeType[] = [];
			setTree(c => {
				prevTree = c;
				const nTree = JSON.parse(JSON.stringify(c)) as TreeType[];
				const sibs = getSibs(nTree, b);
				const i = sibs.findIndex(n => (n.type === 'leaf' ? n.path === p : false));
				if (i !== -1) sibs.splice(i, 1);
				return nTree;
			});
			try {
				const { error: err } = await actions.write.doc.rm(isIdx ? { path: tgtPath, type: tgtType } : { assets: a, path: tgtPath, type: tgtType });
				if (err && !err.message?.includes('folder not found')) throw err;
				await refreshTree();
				if (a) navigate({ href: docsPath(dirname(p).replace(/^\.\/?/, '')), mode: 'view' });
			} catch (err) {
				setTree(prevTree);
				throw err;
			}
		},
		[refreshTree],
	);

	const openCreate = useCallback(
		(p: string, v: string): void => {
			if ($transition.get()) return;
			setInputDlg({
				open: true,
				title: 'Add Page',
				label: 'Page title',
				value: 'Untitled Page',
				onCancel: () => {},
				onSave: name => {
					setInputDlg(null);
					setCreating(true);
					(async () => {
						// prettier-ignore
						try {
							const { data: res, error: resErr } = await actions.read.doc.resolvePath({ path: p, title: name });
							if (resErr || !res) throw resErr || new Error('Failed to resolve path');
							const dPath = (res).path;
							const tLeafId = `temp_l_${Date.now()}`;
							const sectId = urlIds.sectionId;
							let url = '';
							// safety Fallback for parentId mapping
							let aParentId = v;
							if (typeof window !== 'undefined' && (!aParentId || aParentId === '.' || aParentId === sectId)) {
								try {
									const curr = route(window.location.pathname + window.location.search);
									if (curr.groupId) aParentId = curr.groupId;
									else if (curr.sectionId) aParentId = curr.sectionId;
									} catch {
										// The existing parent remains the safe fallback.
									}
							}
							url = aParentId === sectId ? buildRoute(sectId, undefined, tLeafId) : buildRoute(sectId, aParentId, tLeafId);
							setTree(v => {
								const nTree = JSON.parse(JSON.stringify(v)) as TreeType[];
								(function insertLeaf(nodes: TreeType[], tgtId: string): boolean {
									for (const n of nodes) {
										if (n.type === 'branch') {
											if (n.origName === tgtId) {
												if (!n.children) n.children = [];
												// prevent duplicate pushes if it re-renders
													if (!n.children.find(c => c.type === 'leaf' && c.url === url))
														n.children.push({ type: 'leaf', fileType: 'mdx', origName: tLeafId, path: dPath, permission: 'write', title: name, description: '', url, source: '' });
												return true;
											}
											if (n.children && insertLeaf(n.children, tgtId)) return true;
										}
									}
									return false;
								})(nTree, aParentId);
								return nTree;
							});
							memoryDrafts.set(url, { source: '', draft: { content: [], description: '', path: dPath, title: name }, metadata: { path: dPath, title: name, description: '', pathname: url } });
							$unsavedDrafts.setKey(url, false);
							const tgtUrl = new URL(url, window.location.origin);
							tgtUrl.searchParams.set('mode', 'edit');
							window.history.pushState(null, '', tgtUrl.toString());
							document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: url, pathname: url, path: dPath, title: name, description: '', source: '', content: [], compiledMDX: '' } }),);
							const { data, error: err } = (await actions.write.doc.editor({ source: '', description: '', path: dPath, title: name, parentId: aParentId })) as ActionRes<Md>;
							if (err || !data) throw err || new Error('Failed to create docs page.');
							setTimeout(() => {
								void refreshTree();
							}, 2500);
						} catch (err) {
							console.error('[openCreate] Creation failed:', err);
							toast.error('Failed to create docs page.');
							void refreshTree();
						} finally {
							setCreating(false);
						}
					})();
				},
			});
		},
		[refreshTree, urlIds.sectionId],
	);
	const addGroup = useCallback(
		(p: string, s: string) => {
			if ($transition.get()) return;
			setInputDlg({
				open: true,
				title: 'Add Group',
				label: 'Group name',
				value: 'Untitled Group',
				onCancel: () => {},
				onSave: name => {
					setInputDlg(null);
					setCreating(true);
					(async () => {
						// prettier-ignore
						try {
							const { data: res, error: resErr } = await actions.read.doc.resolvePath({ path: p, title: name });
							if (resErr || !res) throw resErr || new Error('Failed to resolve path');
							const dPath = `${((res).dir)}/untitled`;
							const tGrpId = `temp_g_${Date.now()}`;
							const tLeafId = `temp_l_${Date.now()}`;
							const rootId = s || urlIds.sectionId;
							const url = buildRoute(rootId, tGrpId, tLeafId);
							const gUrl = buildRoute(rootId, tGrpId);
							setTree(v => {
								const nTree = JSON.parse(JSON.stringify(v)) as TreeType[];
								(function insertGroup(nodes: TreeType[], tgtId: string): boolean {
									for (const n of nodes) {
										if (n.type === 'branch') {
											if (n.origName === tgtId) {
												if (!n.children) n.children = [];
												if (!n.children.find(c => c.type === 'branch' && 'url' in c && c.url === gUrl))
													n.children.push({
													 type: 'branch', origName: tGrpId, permission: 'write', title: name, url: gUrl,
													 children: [{ type: 'leaf', fileType: 'mdx', origName: tLeafId, path: dPath, permission: 'write', title: 'Untitled', description: '', url, source: '' }],
												});
												return true;
											}
											if (n.children && insertGroup(n.children, tgtId)) return true;
										}
									}
									return false;
								})(nTree, rootId);
								return nTree;
							});
							memoryDrafts.set(url, { source: '', draft: { content: [], description: '', path: dPath, title: 'Untitled' }, metadata: { path: dPath, title: 'Untitled', description: '', pathname: url } });
							$unsavedDrafts.setKey(url, false);
							const tgtUrl = new URL(url, window.location.origin);
							tgtUrl.searchParams.set('mode', 'edit');
							window.history.pushState(null, '', tgtUrl.toString());
							document.dispatchEvent(new CustomEvent('docs:navigate', { detail: { url: url, pathname: url, path: dPath, title: 'Untitled', description: '', source: '', content: [], compiledMDX: '' } }));
							const { data: gData, error: gErr } = await actions.write.doc.createGroup({ title: name, path: gUrl, sectionId: rootId });
							if (gErr || !gData) throw gErr || new Error('Failed to create group.');
						const { data, error: err } = (await actions.write.doc.editor({ source: '', description: '', path: dPath, title: 'Untitled', parentId: (typeof gData === 'object' && '_id' in gData && typeof gData._id === 'string' ? gData._id : undefined) })) as ActionRes<Md>;
							if (err || !data) throw err || new Error('Failed to create group leaf.');
							setTimeout(() => {
								void refreshTree();
							}, 2500);
						} catch (err) {
							console.error('[addGroup] Creation failed:', err);
							toast.error('Failed to create group.');
							void refreshTree();
						} finally {
							setCreating(false);
						}
					})();
				},
			});
		},
		[refreshTree, urlIds.sectionId],
	);
	const mvLeaf = useCallback(
		async ({ path: p, tTarget: tTgt, tpath: v, tPosition: r }: { path: string; tTarget?: string; tpath: string; tPosition?: 'after' | 'before' }): Promise<void> => {
			console.warn('[docs:mv-leaf]', { path: p, tTarget: tTgt, tpath: v, tPosition: r });
			const prevTree = JSON.parse(JSON.stringify(tree)) as TreeType[];
			let _nPath = p;
			try {
				/**
				 * Handles find parent path.
				 *
				 * @param nodes - Sidebar nodes searched for the target document.
				 * @param tgtPath - Target document path being resolved.
				 * @param currPath - Current traversal path accumulated during the search.
				 */
				const pPath =
					(function findParentPath(nodes: TreeType[], tgtPath: string, currPath = ''): string | null {
						for (const n of nodes) {
							if (n.type === 'leaf' && n.path === tgtPath) return currPath || '.';
							if (n.type === 'branch' && n.children) {
								const found = findParentPath(n.children, tgtPath, currPath ? `${currPath}/${n.origName}` : n.origName);
								if (found) return found;
							}
						}
						return null;
					})(tree, p) || '';
				const isMovingBranch = pPath !== v;
				const nTree = JSON.parse(JSON.stringify(tree)) as TreeType[];
				const oldSibs = getSibs(nTree, pPath);
				const sIdx = oldSibs.findIndex(n => (n.type === 'leaf' ? n.path === p : false));
				let movedNode = null;
				if (sIdx !== -1) movedNode = oldSibs.splice(sIdx, 1)[0];
				const tgtSibs = getSibs(nTree, v);
				let iIdx = tgtSibs.length;
				if (tTgt) {
					const tgtIdx = tgtSibs.findIndex(n => (n.type === 'leaf' ? n.path === tTgt : n.type === 'branch' && [v, n.origName].filter(Boolean).join('/') === tTgt));
					if (tgtIdx !== -1) iIdx = (r ?? 'before') === 'before' ? tgtIdx : tgtIdx + 1;
				}
				if (movedNode) tgtSibs.splice(iIdx, 0, movedNode);
				setTree(nTree);
				if (isMovingBranch) {
					const tgtNorm = v === '.' ? '' : v;
					const folderBacked = TerraQualityRegex.REGEX_INDEX_MD_MDX_I_REGEX().test(p);
					const leafDirName = folderBacked ? p.split('/').slice(-2)[0] : bName(p, p.match(TerraQualityRegex.REGEX_I_REGEX())?.[0]);
					const ext = p.match(TerraQualityRegex.REGEX_I_REGEX())?.[0] ?? '.mdx';
					const nPath = folderBacked ? `${tgtNorm === '.' ? '' : `${tgtNorm}/`}${leafDirName}/index${ext}` : `${tgtNorm === '.' ? '' : `${tgtNorm}/`}${leafDirName}${ext}`;
					if (p !== nPath) {
						const { data: docData } = await actions.read.doc.get({ path: p });
						const { data: movedDoc, error } = await actions.write.doc.commit({
							cur: p,
							next: nPath,
							source: docData && typeof docData === 'object' && 'source' in docData && typeof docData.source === 'string' ? docData.source : '',
						});
						_nPath = (movedDoc as Md | undefined)?.path || nPath;
						if (error) {
							setTree(prevTree);
							toast.error(error.message || 'Move failed');
							notify({ error: new Error(error.message), fallback: 'Failed to move docs page.' });
							return;
						}
					}
				}
				if (tgtSibs.length > 0) {
					const parentIds = v.split('/');
					const parentId = parentIds[parentIds.length - 1];
					if (parentId && parentId !== '.') {
						const { error } = await actions.write.doc.reorder({
							id: parentId,
							field: /* Identify whether we are patching a Group or Section natively */ parentIds.length > 1 ? 'leaves' : 'groups',
							items: tgtSibs.filter(s => s.type === 'leaf').map(s => ({ _type: 'reference', _ref: s === movedNode ? _nPath : s.origName })),
						});
						if (error) throw error;
					}
				}
				if (isMovingBranch && oldSibs) {
					const oldParentIds = pPath.split('/');
					const oldParentId = oldParentIds[oldParentIds.length - 1];
					if (oldParentId && oldParentId !== '.') {
						const { error } = await actions.write.doc.reorder({
							id: oldParentId,
							field: oldParentIds.length > 1 ? 'leaves' : 'groups',
							items: oldSibs.filter(s => s.type === 'leaf').map(s => ({ _type: 'reference', _ref: s.origName })),
						});
						if (error) throw error;
					}
				}
				await refreshTree();
			} catch (err: unknown) {
				setTree(prevTree);
				toast.error(err instanceof Error ? err.message : 'Move failed');
				notify({ error: err instanceof Error ? err : new Error('Move failed'), fallback: 'Failed to move docs page.' });
				void refreshTree();
			}
		},
		[tree, refreshTree],
	);
	const mvBranch = useCallback(
		async ({ fPath: f, pPath: p, tpath: t, tPosition: v, tTarget: tTgt }: { fPath: string; pPath: string; tpath: string; tPosition?: 'after' | 'before'; tTarget?: string }): Promise<void> => {
			if (p !== t) return;
			try {
				const nTree = JSON.parse(JSON.stringify(tree)) as TreeType[];
				const oldSibs = getSibs(nTree, p);
				const srcIdx = oldSibs.findIndex(n => (n.type === 'branch' ? [p, n.origName].filter(Boolean).join('/') === f : false));
				let movedNode = null;
				if (srcIdx !== -1) movedNode = oldSibs.splice(srcIdx, 1)[0];
				const tgtSibs = getSibs(nTree, t);
				let iIdx = tgtSibs.length;
				const tIdx = tgtSibs.findIndex(n => n.type === 'branch' && [t, n.origName].filter(Boolean).join('/') === tTgt);
				if (tIdx !== -1) iIdx = (v ?? 'before') === 'before' ? tIdx : tIdx + 1;
				if (movedNode) tgtSibs.splice(iIdx, 0, movedNode);
				setTree(nTree);
				if (tgtSibs.length > 0) {
					const parentIds = t.split('/');
					const parentId = parentIds[parentIds.length - 1];
					if (parentId && parentId !== '.') {
						const { error } = await actions.write.doc.reorder({ id: parentId, field: 'groups', items: tgtSibs.filter(s => s.type === 'branch').map(s => ({ _type: 'reference', _ref: s.origName })) });
						if (error) throw error;
					}
				}
				await refreshTree();
			} catch (err: unknown) {
				setTree(JSON.parse(JSON.stringify(tree)) as TreeType[]);
				toast.error(err instanceof Error ? err.message : 'Move failed');
				notify({ error: err instanceof Error ? err : new Error('Move failed'), fallback: 'Failed to reorder docs groups.' });
				void refreshTree();
			}
		},
		[tree, refreshTree],
	);
	const actionDisabled = creating || loading;
	const assetChoices = useMemo(() => repoComponents.filter(c => c.name !== 'Leaf' && c.name !== 'Visualize').map(c => ({ label: c.name.replace(/([a-z])([A-Z])/g, '$1 $2'), name: c.name })), []);
	useEffect(() => {
		if (!assetTgt) return;
		if (!assetChoices.some(c => c.name === assetComponent)) setAssetComponent(assetChoices[0]?.name ?? '');
		setAssetDialogOpen(true);
	}, [assetTgt, assetChoices, assetComponent]);
	SidebarActions.makeAsset = useCallback(async (): Promise<void> => {
		if (!assetTgt || !assetComponent || assetBusy) return;
		try {
			setAssetBusy(true);
			const { error } = await actions.write.doc.asset({ path: assetTgt.path, component: assetComponent, title: assetTgt.title, description: '' });
			if (error) throw error;
			setAssetDialogOpen(false);
			setAssetTgt(null);
			toast.success('Asset created successfully.');
			await refreshTree();
		} catch (err) {
			console.error('[Sidebar] Failed to convert page to asset:', err);
			notify({ error: err instanceof Error ? err : new Error('Failed to convert page to asset.'), fallback: 'Failed to convert page to asset.' });
		} finally {
			setAssetBusy(false);
		}
	}, [assetBusy, assetComponent, assetTgt, refreshTree]);
	SidebarActions.renderSects = useCallback(
		(t: TreeType) => {
			const origName = t.type === 'branch' ? t.origName : '';
			const slugPath = 'url' in t && t.url ? t.url.replace(TerraQualityRegex.REGEX_DOCS_REGEX(), '') : '';
			const titleStr = cTitle(toNodeLabel(t.title || origName));
			return [
				{
					icon: <LinkIcon />,
					label: 'Copy link',
					disabled: actionDisabled,
					onSelect: () => {
						void navigator.clipboard.writeText(`${window.location.origin}${'url' in t && t.url ? t.url : ''}`);
						toast.success('Link copied');
					},
				},
				{
					icon: <BoxIcon />,
					label: 'Manage attachments',
					disabled: actionDisabled,
					onSelect: () => {
						setManageAttTgt({ path: slugPath, title: titleStr || slugPath, scope: 'section', node: t });
					},
				},
				{
					icon: <DownloadIcon />,
					label: 'Download section',
					disabled: actionDisabled,
					onSelect: ((paths, nodeIds) => () => {
						setExportTgt({ paths, rootDir: slugPath, filename: sanitizeName(titleStr || slugPath), title: `${titleStr} docs`, nodeIds });
					})(Array.from(new Set([...toPaths(t.type === 'branch' ? t.children : [])])), extractAllNodeIds([t])),
				},
				{
					icon: <PopOutIcon />,
					label: 'Make asset',
					disabled: actionDisabled,
					onSelect: () => {
						setAssetTgt({ path: slugPath, title: titleStr || slugPath });
					},
				},
				...(permission === 'write'
					? [
							{
								disabled: actionDisabled,
								icon: <EditIcon />,
								label: 'Rename section',
								onSelect: () => {
									triggerRenameSection(t);
								},
							},
							{
								disabled: actionDisabled,
								icon: <ColorIcon />,
								label: 'Change color',
								onSelect: () => {
									setHueDlg({ open: true, hue: getHue(t.title || slugPath, t.type === 'branch' ? t.hue : undefined), section: t });
								},
							},
							{
								destructive: true,
								disabled: actionDisabled,
								icon: <TrashIcon />,
								label: 'Delete section',
								onSelect: () => {
									setDelTgt({ kind: 'section', path: origName, slugPath, title: titleStr || slugPath, origNode: t });
								},
							},
						]
					: []),
			];
		},
		[permission, actionDisabled, triggerRenameSection],
	);
	const getTree = useCallback(() => tree, [tree]);

	// CONTEXT
	const treeCtx = useMemo(
		() => ({
			creating,
			transitioning,
			drag,
			dState,
			mode: curMode,
			mvBranch,
			mvLeaf,
			pathname: cPathname,
			refreshTree,
			shellPermission: permission,
			openCreate,
			addGroup,
			uploadAsLeaf,
			rmBranch,
			rmLeaf,
			setDrag: (d: DragState | null) => {
				setDrag(d);
				if (!d) setDState(null);
			},
			setDState,
			setHovered,
			hovered,
			setInputDlg,
			setTree,
			getTree,
			findActiveLeaf,
			setCPathname,
			selectedLeaves: selLeaves,
			handleSelect,
			clearSelection,
			mergeLeaves,
			setDelTarget: setDelTgt,
			setExportTarget: setExportTgt,
			setManageAttTgt,
			setAssetTarget: setAssetTgt,
		}),
		// prettier-ignore
		[creating, transitioning, drag, dState, curMode, mvBranch, mvLeaf, cPathname, refreshTree, permission, openCreate, addGroup, uploadAsLeaf, rmBranch, rmLeaf, hovered, selLeaves, handleSelect, clearSelection, mergeLeaves, getTree],
	);

	// RENDERS
	return (
		<ErrorBoundary
			name='Sidebar'
			fallback={() => (
				<Sidebar className='not-prose z-50 overflow-y-auto p-4'>
					<AlertError description='An unexpected error occurred while rendering the sidebar panel. The remaining workspace continues to function.' title='Sidebar render crash' />
				</Sidebar>
			)}
		>
			<Sidebar
				{...props}
				sticky
				className='not-prose bg-primary-2 p-2'
				onClick={() => {
					// prevent clearing if a dialog is actively open
					if (inputDlg?.open || hueDlg?.open || delTgt) return;
					if (selLeaves.length > 0) clearSelection();
				}}
			>
				{/* STYLE */}
				{/* prettier-ignore */}
				<style dangerouslySetInnerHTML={{ __html: ` [data-sidebar="sidebar"], [data-sidebar="sidebar"][data-mobile="true"], [data-mobile="true"] .bg-sidebar, .bg-sidebar { background-color: rgb(var(--primary-2)) !important; } ` }} />
				{/* DIALOGS */}
				<SidebarComponents.ExportDialog tgt={exportTgt} setTgt={setExportTgt} disabled={loading || transitioning} />
				<SidebarComponents.ManageAttchsDialog tgt={manageAttTgt} setTgt={setManageAttTgt} disabled={loading || transitioning} tree={tree} />
				{/* prettier-ignore */}
				<Dialog
					open={assetDialogOpen}
					onOpenChange={o => {
						if (assetBusy) return;
						setAssetDialogOpen(o);
						if (!o) setAssetTgt(null);
					}}
				>
					<DialogContent className='sm:max-w-lg'>
						<DialogHeader>
							<DialogTitle>Make Asset</DialogTitle>
							<DialogDescription>This will replace the page history with one standalone component version.</DialogDescription>
						</DialogHeader>
						<div className='space-y-4 py-4'>
							<div className='space-y-1.5'>
								<Label>Component</Label>
								<Select value={assetComponent} onValueChange={setAssetComponent}>
									<SelectTrigger aria-label='Select a component...'><SelectValue placeholder='Select a component...' /></SelectTrigger>
									<SelectContent>{assetChoices.map(c => <SelectItem key={c.name} value={c.name}>{c.label}</SelectItem>)}</SelectContent>
								</Select>
							</div>
							<AlertError title='Warning' description='Converting this page to an asset erases every existing version except the selected component.' />
						</div>
						<DialogFooter>
							<Button variant='ghost' disabled={assetBusy} onClick={() => { setAssetTgt(null); }}>Cancel</Button>
							<Button disabled={!assetComponent || assetBusy} loading={assetBusy} onClick={() => void SidebarActions.makeAsset!()}>Make Asset</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
				<SidebarComponents.PromptDialog state={inputDlg} setState={setInputDlg} disabled={loading || transitioning} />
				<SidebarComponents.DeleteDialog
					tgt={delTgt}
					setTgt={setDelTgt}
					onConfirm={() => {
						if (!delTgt || transitioning) return;
						const { kind, origNode, slugPath, path, bPath, active: a } = delTgt;
						setDelTgt(null);
						runMutation(
							async () => {
								if (kind === 'section' && origNode) {
									const sectionPath = slugPath!;
									let prev: TreeType[] = [];
									setTree(c => {
										prev = c;
										return c.filter(n => !(n.type === 'branch' && n.origName === (origNode as Branch).origName));
									});
									const { error: err } = await actions.write.doc.rm({ path: sectionPath, type: 'folder' });
									if (err && !err.message?.includes('folder not found')) {
										setTree(prev);
										throw err;
									}
									await refreshTree();
									if (cPathname.toLowerCase().startsWith(docsPath(sectionPath).toLowerCase())) navigate({ href: docsRootPath(), mode: 'view' });
								} else if (kind === 'branch') await rmBranch(path, bPath!, slugPath!);
								else if (kind === 'leaf') await rmLeaf(path, bPath!, !!a);
							},
							`Failed to delete ${kind}.`,
							() => setLoading(true),
							() => setLoading(false),
						);
					}}
					disabled={loading || transitioning}
				/>
				<Dialog
					open={hueDlg?.open ?? false}
					onOpenChange={o => {
						if (loading || transitioning) return;
						setHueDlg(p => (p ? { ...p, open: o } : null));
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Section Color</DialogTitle>
							<DialogDescription>Adjust the hue for this section to customize its appearance.</DialogDescription>
						</DialogHeader>
						<Slider
							min={0}
							max={360}
							step={1}
							value={[hueDlg?.hue ?? 0]}
							onValueChange={([v]) => {
								setHueDlg(p => (p ? { ...p, hue: v ?? 0 } : null));
							}}
							disabled={loading || transitioning}
							className='my-6 w-full [&_[data-slot=slider-range]]:bg-[color:var(--slider-color)] [&_[data-slot=slider-thumb]]:border-[color:var(--slider-color)] [&_[data-slot=slider-thumb]]:bg-[color:var(--slider-color)]'
							style={{ '--slider-color': `hsl(${hueDlg?.hue ?? 0} 65% 55%)` } as React.CSSProperties}
						/>
						<DialogFooter>
							<Button
								variant='ghost'
								disabled={loading || transitioning}
								onClick={() => {
									if (hueDlg?.section) setHueDlg({ ...hueDlg, hue: getHue(hueDlg.section.title || (hueDlg.section.type === 'branch' ? hueDlg.section.origName : '')) });
								}}
							>
								Reset
							</Button>
							<Button
								disabled={loading || transitioning}
								loading={loading}
								onClick={() => {
									SidebarActions.saveHue();
								}}
							>
								Save
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
				{/* HEADER */}
				<SidebarHeader className='print:hidden' data-docs-navigation='true'>
					{/* logo */}
					<div className='mb-4 space-y-1 border-b border-primary-6 pb-4'>
						<a className='font-serif text-2xl hover:italic hover:tracking-tight' href={homePath}>
							{siteTitle}
						</a>
						{siteDescription && <p className='m-0 text-sm text-primary-11'>{siteDescription}</p>}
					</div>
					{/* sects */}
					<div className='mt-2'>
						<Label htmlFor='docs-section-picker' className='mb-1 block text-[10px] font-semibold tracking-[0.12em] text-primary-10'>SECTION</Label>
						<div className='flex items-center gap-1'>
						<div className={cn('block min-w-0 flex-1 rounded-md transition-opacity')}>
							<Select
								disabled={transitioning}
								open={sectionOpen}
								onOpenChange={setSectionOpen}
								value={aViewed ? aViewed.origName : ''}
								onValueChange={async v => {
									if (v === '__add_section__') {
										setTimeout(() => {
											addSection();
										}, 0);
										return;
									}
									if (aViewed?.origName === v) return;
									setSearchPages('');
									setViewedSecId(v);
								}}
							>
								<SelectTrigger
									id='docs-section-picker'
									className='w-full'
									aria-label='Section'
									data-docs-navigation='true'
									onPointerDown={e => {
										if (e.button === 0) setSectionOpen(true);
									}}
								>
									<SelectValue placeholder='Section' />
								</SelectTrigger>
								<SelectContent className='w-[var(--radix-select-trigger-width)]'>
									{sects.map(s => {
										if (s.simulated) {
											return (
												<SelectItem
													key={s.origName}
													value={s.origName}
													icon={<span aria-hidden='true' className='size-3.5 rounded-[3px]' style={{ backgroundColor: `hsl(${getHue(s.title || 'New Section')} 65% 55%)` }} />}
													className='data-[state=checked]:text-primary-10 dark:data-[state=checked]:text-primary-12'
												>
													{s.title || 'New Section'}
												</SelectItem>
											);
										}
										// prettier-ignore
										return (
												<SelectItem
											key={s.origName}
													value={s.origName}
													icon={<span aria-hidden='true' className='size-3.5 rounded-[3px]' style={{ backgroundColor: `hsl(${hueDlg?.open && hueDlg.section.origName === s.origName ? hueDlg.hue : getHue(s.title || s.origName, s.hue)} 65% 55%)` }} />}
													className='data-[state=checked]:text-primary-10 dark:data-[state=checked]:text-primary-12'
												>
													<ContextMenu>
												<ContextMenuTrigger className='flex w-full items-center justify-between'><span className='line-clamp-1'>{cTitle(toNodeLabel(s.title || s.origName))}</span></ContextMenuTrigger>
													<ContextMenuContent><Menu actions={SidebarActions.renderSects!(s)} /></ContextMenuContent>
													</ContextMenu>
												</SelectItem>
											);
									})}
									{permission === 'write' && (
										<>
											{sects.length > 0 && !sects[0]?.simulated && <Separator className='my-1' />}
											<SelectItem
												value='__add_section__'
												icon={<AddIcon className='size-4' />}
												className='font-medium text-primary-11 data-[state=checked]:text-primary-10 dark:data-[state=checked]:text-primary-12'
											>
												<span>Add section</span>
											</SelectItem>
										</>
									)}
								</SelectContent>
							</Select>
						</div>
						{aViewed && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant='ghost' size='xs' aria-label={`Actions for section ${aViewed.title || aViewed.origName}`} className='h-8 w-8 shrink-0 px-1'>
										<OverflowMenuIcon size={16} />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align='end'>
									{(SidebarActions.renderSects?.(aViewed) ?? []).map((action, index) => (
										<DropdownMenuItem key={`${action.label}-${index}`} disabled={action.disabled} onSelect={() => action.onSelect?.()} className={action.destructive ? 'text-destructive focus:text-destructive' : undefined}>
											{action.icon}{action.label}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						</div>
						<Input aria-label='Search pages' placeholder='Search pages' value={searchPages} onChange={event => setSearchPages(event.currentTarget.value)} className='mt-2' />
					</div>
				</SidebarHeader>
				{/* TOC */}
				<ContextMenu>
					<ContextMenuTrigger className='flex min-h-0 flex-1 flex-col outline-none'>
						<SidebarContent className='min-h-0 flex-1 overflow-y-auto'>
							<SidebarMenu>
								{visibleChildren.map(n => (
									<Tree key={getStableKey(n)} bPath={aViewed?.origName ?? ''} node={n} ctx={treeCtx} siblings={children} />
								))}
							</SidebarMenu>
						</SidebarContent>
					</ContextMenuTrigger>
					{permission === 'write' && aViewed && (
						<ContextMenuContent>
							<Menu
								actions={[
									{
										disabled: actionDisabled,
										icon: <AddIcon />,
										label: 'Add group',
										onSelect: () => {
											if (aViewed.simulated) addSection({ title: 'Create Section', description: 'A section must be created first to hold your new group.' });
											else treeCtx.addGroup(aViewed.origName, aViewed.origName);
										},
									},
								]}
							/>
						</ContextMenuContent>
					)}
				</ContextMenu>
				{/* USER */}
				<SidebarFooter>{userData && <User user={userData} className='mr-auto pl-0' />}</SidebarFooter>
				{/* RAIL */}
				<SidebarRail />
			</Sidebar>
		</ErrorBoundary>
	);
});
