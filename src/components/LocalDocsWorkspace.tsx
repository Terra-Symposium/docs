import { useMemo } from 'react';
import { markdownToDocsValue } from '../lib/markdown-model.js';
import { TerraDocsWorkspace } from './terra/Workspace.js';
import type { DocsActionOperation, DocsActionResult, DocsHostAdapter, DocsHostAttachment, DocsHostTreeNode, DocsCustomBlock } from '../lib/host.js';
import type { JSX } from 'react';

/** A local page supplied by a repository or static site build. */
export type DocsLocalPage = {
	id: string;
	path: string;
	pathname: string;
	title: string;
	markdown: string;
	description?: string;
	contributors?: string[];
	updatedAt?: string;
	attachments?: DocsHostAttachment[];
};

export type DocsLocalWorkspaceProps = {
	tree: DocsHostTreeNode[];
	pages: DocsLocalPage[];
	pathname: string;
	title: string;
	description?: string;
	rootPath?: string;
	homePath?: string;
	customBlocks?: DocsCustomBlock[];
};

function normalized(value: string, base = 'http://docs.local'): string {
	try {
		const url = new URL(value, base);
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return value;
	}
}

function routeId(value: string): string {
	try {
		const hash = new URL(value, 'http://docs.local').hash.slice(1);
		return hash ? decodeURIComponent(hash) : '';
	} catch {
		return '';
	}
}

function findPage(pages: DocsLocalPage[], value: unknown): DocsLocalPage | undefined {
	if (typeof value !== 'string' || !value) return undefined;
	const route = normalized(value);
	const pathOnly = normalized(value).split(/[?#]/, 1)[0];
	const id = routeId(value);
	return pages.find(page => page.id === value || page.id === id || page.path === value || normalized(page.pathname) === route || normalized(page.pathname).split(/[?#]/, 1)[0] === pathOnly);
}

function findTreeNode(nodes: DocsHostTreeNode[], id: string, ancestors: DocsHostTreeNode[] = []): { node: DocsHostTreeNode; ancestors: DocsHostTreeNode[] } | undefined {
	for (const node of nodes) {
		const branch = [...ancestors, node];
		if (node.origName === id) return { node, ancestors };
		const found = node.children ? findTreeNode(node.children, id, branch) : undefined;
		if (found) return found;
	}
	return undefined;
}

function firstLeaf(nodes: DocsHostTreeNode[]): DocsHostTreeNode | undefined {
	for (const node of nodes) {
		if (node.type === 'leaf') return node;
		const found = firstLeaf(node.children ?? []);
		if (found) return found;
	}
	return undefined;
}

/**
 * Render repository-owned Markdown with the original Terra Docs workspace.
 * This adapter has no write operations, account dependency, or server requirement.
 */
export function DocsLocalWorkspace(props: DocsLocalWorkspaceProps): JSX.Element {
	const { tree, pages, pathname, title, description, rootPath = '/', homePath, customBlocks } = props;
	const page = findPage(pages, pathname) ?? pages[0];
	const content = useMemo(() => page ? markdownToDocsValue(page.markdown) : [], [page]);
	const host = useMemo<DocsHostAdapter>(() => {
		const activePage = (): DocsLocalPage | undefined => typeof window === 'undefined'
			? page
			: findPage(pages, `${window.location.pathname}${window.location.search}${window.location.hash}`) ?? page;
		const resolvePage = (input: unknown): DocsLocalPage | undefined => {
			if (!input || typeof input !== 'object') return undefined;
			const value = input as Record<string, unknown>;
			const direct = findPage(pages, value.path) ?? findPage(pages, value.pathname) ?? findPage(pages, value.id);
			if (direct) return direct;
			const requested = [value.path, value.pathname, value.id].find(candidate => typeof candidate === 'string' && candidate.length > 0);
			if (typeof requested !== 'string') return activePage();
			const basename = requested.split(/[?#]/, 1)[0]?.split('/').filter(Boolean).at(-1);
			const active = activePage();
			if (basename && active?.path.split('/').at(-1) === basename) return active;
			const matches = pages.filter(candidate => candidate.path.split('/').at(-1) === basename || candidate.id === basename);
			return matches.length === 1 ? matches[0] : undefined;
		};
		const adapter: DocsHostAdapter = {
			capabilities: { read: true, write: false, reorder: false, attachments: false, export: true, history: false, publish: false },
			rootPath,
			...(homePath ? { homePath } : {}),
			siteTitle: title,
			...(description ? { siteDescription: description } : {}),
			assetUrl: () => undefined,
			resolveRoute(value) {
				const resolved = findPage(pages, value) ?? pages[0];
				const match = resolved ? findTreeNode(tree, resolved.id) : undefined;
				const branches = match?.ancestors.filter(node => node.type === 'branch') ?? [];
				return {
					sectionId: branches[0]?.origName ?? tree[0]?.origName ?? 'index',
					...(branches[1] ? { groupId: branches[1].origName } : {}),
					...(resolved ? { leafId: resolved.id } : {}),
					targetId: resolved?.id ?? tree[0]?.origName ?? 'index',
					pathname: resolved?.pathname ?? normalized(value),
				};
			},
			buildRoute(sectionId, groupId, leafId) {
				const leaf = leafId ? findTreeNode(tree, leafId)?.node : undefined;
				if (leaf?.url) return leaf.url;
				const group = groupId ? findTreeNode(tree, groupId)?.node : undefined;
				const section = findTreeNode(tree, sectionId)?.node;
				return firstLeaf(group?.children ?? section?.children ?? tree)?.url ?? rootPath;
			},
			routePath(path) {
				return findPage(pages, path)?.pathname ?? rootPath;
			},
			async invoke<T = unknown>(operation: DocsActionOperation, input?: unknown): Promise<DocsActionResult<T>> {
				const args = (input ?? {}) as Record<string, unknown>;
				if (operation === 'read.doc.list') return { data: tree as T };
				if (operation === 'read.doc.get') {
					const document = resolvePage(args);
					return { data: (document ? { ...document, source: document.markdown, content: markdownToDocsValue(document.markdown) } : null) as T };
				}
				if (operation === 'read.doc.attachments') {
					const document = resolvePage(args) ?? activePage();
					const attachments = (document?.attachments ?? []).map(attachment => ({ ...attachment, title: attachment.name, isMd: false }));
					return { data: attachments as T };
				}
				if (operation === 'read.source.body') return { data: markdownToDocsValue(String(args.source ?? '')) as T };
				if (operation === 'read.util.pathname') return { data: String(args.path ?? pathname) as T };
				if (operation === 'read.util.node') {
					const document = resolvePage(args);
					return { data: (document ? { origName: document.id, title: document.title, path: document.path } : null) as T };
				}
				if (operation === 'read.tsdocs') return { data: { scopes: [] } as T };
				if (operation === 'read.asset.get') {
					const assetPath = String(args.path ?? args.id ?? '');
					const response = await fetch(assetPath);
					if (!response.ok) return { error: new Error(`Unable to read local attachment (${response.status}).`) };
					return { data: await response.arrayBuffer() as T };
				}
				return { data: null as T };
			},
		};
		return adapter;
	}, [description, homePath, pages, pathname, rootPath, title, tree]);

	return (
		<TerraDocsWorkspace
			host={host}
			tree={tree}
			pathname={pathname}
			permission='read'
			title={page?.title ?? title}
			{...(page?.path ? { path: page.path } : {})}
			{...(page?.description ?? description ? { description: page?.description ?? description } : {})}
			{...(page?.contributors ? { contributors: page.contributors } : {})}
			{...(page?.updatedAt ? { updatedAt: page.updatedAt } : {})}
		{...(page ? { source: page.markdown, content } : { content })}
			{...(customBlocks ? { customBlocks } : {})}
		/>
	);
}
