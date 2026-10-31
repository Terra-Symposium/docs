import { markdownToDocsValue } from '../lib/markdown-model.js';
import { $surfaceReady, useTransitionState } from '../lib/terra/docs/state.js';
import { TerraDocsWorkspace } from './terra/Workspace.js';
import { docsHueTheme } from '../lib/docs-theme.js';
import type { DocsHostAdapter, DocsHostAttachment, DocsHostTreeNode } from '../lib/host.js';
import type { DocsAttachment, DocsLeaf, DocsSection } from '../lib/workspace-types.js';
import type { DocsNavNode } from './navigation.js';
import { useEffect } from 'react';
import type { JSX, ReactNode } from 'react';

type Props = {
  title: string;
  homeHref?: string;
  description?: string;
  pageTitle?: string;
  hue?: number | null;
  nodes?: DocsNavNode[];
  sections?: DocsSection[];
  currentPath: string;
  rootPath?: string;
  markdown?: string;
  content?: unknown;
  attachments?: DocsAttachment[];
  updatedAt?: string;
  renderContent?: ReactNode;
  children?: ReactNode;
  staticContent?: boolean;
};

function StaticContentSlot({ children }: { children: ReactNode }): JSX.Element {
  const transition = useTransitionState();
  useEffect(() => {
    $surfaceReady.set('view');
    document.dispatchEvent(new Event('docs:surface-ready'));
  }, [transition]);
  return <>{children}</>;
}

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'index';
const routeKey = (value: string): string => {
  try {
    const url = new URL(value, 'http://terra-docs.local');
    return `${url.pathname.replace(/\/$/, '') || '/'}${url.hash}`;
  } catch {
    return value;
  }
};
const storageKey = (value: string): string => {
  try {
    const url = new URL(value, 'http://terra-docs.local');
    return (url.pathname.replace(/^\/+|\/+$/g, '') || 'index.mdx') + url.hash;
  } catch {
    return value.replace(/^\/+|\/+$/g, '') || 'index.mdx';
  }
};

function sectionsFromNavigation(nodes: DocsNavNode[]): DocsSection[] {
  const toLeaf = (node: DocsNavNode): DocsLeaf | null =>
    node.href
      ? {
          ...(node.id ? { id: node.id } : {}),
          ...(node.path ? { path: node.path } : {}),
          title: node.title,
          href: node.href,
          ...(node.description ? { description: node.description } : {}),
          ...(node.updatedAt ? { updatedAt: node.updatedAt } : {}),
          ...(node.attachments ? { attachments: node.attachments } : {}),
        }
      : null;
  return nodes.map((section) => {
    const children = section.children ?? [];
    const nestedGroups = children.some((node) => Boolean(node.children?.length));
    const groups = nestedGroups
      ? children.map((group) => ({
          ...(group.id ? { id: group.id } : {}),
          ...(group.path ? { path: group.path } : {}),
          title: group.title,
          leaves: (group.children ?? [])
            .map(toLeaf)
            .filter((leaf): leaf is DocsLeaf => leaf !== null),
        }))
      : [
          {
            title: section.title,
            leaves: (children.length ? children : [section])
              .map(toLeaf)
              .filter((leaf): leaf is DocsLeaf => leaf !== null),
          },
        ];
    return {
      ...(section.id ? { id: section.id } : {}),
      ...(section.path ? { path: section.path } : {}),
      title: section.title,
      groups,
    };
  });
}

/** Adapts a host's local Markdown pages to the original, read-only Terra Docs workspace. */
export function DocsStaticWorkspace({
  title,
  homeHref = '/',
  description,
  pageTitle,
  hue = 145,
  nodes = [],
  sections,
  currentPath,
  rootPath = '/',
  markdown = '',
  content,
  attachments = [],
  updatedAt,
  renderContent,
  children,
  staticContent = false,
}: Props): JSX.Element {
  const workspaceSections: DocsSection[] = sections ?? sectionsFromNavigation(nodes);
  const theme = docsHueTheme(hue);
  const currentKey = routeKey(currentPath);
  const allLeaves = workspaceSections.flatMap((section, sectionIndex) =>
    section.groups.flatMap((group, groupIndex) =>
      group.leaves.map((leaf, leafIndex) => ({
        section,
        group,
        leaf,
        sectionIndex,
        groupIndex,
        leafIndex,
      })),
    ),
  );
  const active =
    allLeaves.find((item) => routeKey(item.leaf.href) === currentKey) ??
    allLeaves.find((item) => routeKey(item.leaf.href) === routeKey(rootPath)) ??
    allLeaves[0];
  const currentAttachments = active?.leaf.attachments ?? attachments;
  const docPath = active?.leaf.href ?? currentPath;
  const docContent = Array.isArray(content) ? content : markdownToDocsValue(markdown);
  const contentSlot = renderContent ?? children;
  const readyContent =
    contentSlot !== undefined || staticContent ? (
      <StaticContentSlot key={currentPath}>{contentSlot ?? null}</StaticContentSlot>
    ) : undefined;

  const tree: DocsHostTreeNode[] = workspaceSections.map((section) => {
    const sectionId = section.id ?? slug(section.title);
    return {
      type: 'branch',
      origName: sectionId,
      title: section.title,
      path: section.path ?? sectionId,
      url: section.groups[0]?.leaves[0]?.href ?? rootPath,
      permission: 'read',
      children: section.groups.map((group) => {
        const groupId = group.id ?? slug(group.title);
        const groupKey = `${sectionId}/${groupId}`;
        return {
          type: 'branch',
          origName: group.id ?? groupKey,
          title: group.title,
          path: group.path ?? groupKey,
          permission: 'read',
          children: group.leaves.map((leaf) => ({
            type: 'leaf',
            origName: leaf.id ?? `${groupKey}/${slug(leaf.title)}`,
            title: leaf.title,
            path: leaf.path ?? storageKey(leaf.href),
            url: leaf.href,
            permission: 'read',
            ...(leaf.description ? { description: leaf.description } : {}),
            ...(leaf.updatedAt ? { updatedAt: leaf.updatedAt } : {}),
          })),
        };
      }),
    };
  });
  const leafForPath = (path?: string): DocsLeaf | undefined => {
    if (!path) return active?.leaf;
    const requestedRoute = routeKey(path);
    const requestedStoragePath = storageKey(path);
    return allLeaves.find(
      (item) =>
        routeKey(item.leaf.href) === requestedRoute ||
        storageKey(item.leaf.path ?? item.leaf.href) === requestedStoragePath,
    )?.leaf;
  };
  const hostAttachments: DocsHostAttachment[] = currentAttachments.map((item, index) => ({
    id: String(index),
    name: item.title,
    path: item.href,
    ...(item.type ? { type: item.type } : {}),
    ...(item.size !== undefined ? { size: item.size } : {}),
  }));
  const host: DocsHostAdapter = {
    capabilities: {
      read: true,
      write: false,
      reorder: false,
      attachments: false,
      export: false,
      history: false,
      publish: false,
    },
    rootPath,
    homePath: homeHref,
    siteTitle: title,
    ...(description ? { siteDescription: description } : {}),
    buildRoute(sectionId, groupId, leafId) {
      const found = allLeaves.find(
        (item) =>
          (item.section.id ?? slug(item.section.title)) === sectionId &&
          (groupId === undefined || (item.group.id ?? slug(item.group.title)) === groupId) &&
          (leafId === undefined || (item.leaf.id ?? slug(item.leaf.title)) === leafId),
      );
      return found?.leaf.href ?? rootPath;
    },
    resolveRoute(value) {
      const match =
        allLeaves.find((item) => routeKey(item.leaf.href) === routeKey(value)) ?? active;
      return {
        sectionId: match?.section.id ?? slug(match?.section.title ?? 'index'),
        groupId: match?.group.id ?? slug(match?.group.title ?? 'index'),
        leafId: match?.leaf.id ?? slug(match?.leaf.title ?? 'index'),
        targetId: match?.leaf.id ?? slug(match?.leaf.title ?? 'index'),
        pathname: match?.leaf.href ?? rootPath,
      };
    },
    routePath(path) {
      if (/^(?:https?:)?\/\//i.test(path) || path.startsWith('/')) return path;
      return `${rootPath.replace(/\/$/, '')}/${path}`;
    },
    async invoke<T = unknown>(
      operation: import('../lib/host.js').DocsActionOperation,
      input?: unknown,
    ): Promise<{ data?: T; error?: unknown }> {
      let data: unknown;
      if (operation === 'read.doc.list') {
        const request = input as { type?: string; path?: string } | undefined;
        if (request?.type === 'nav') data = tree;
        else if (request?.type === 'folderEntries') {
          const folder = (request.path ?? '').replace(/^\/+|\/+$/g, '');
          data = allLeaves
            .filter(
              (item) =>
                !folder ||
                (item.leaf.path ?? item.leaf.href).replace(/^\/+/, '').startsWith(`${folder}/`),
            )
            .map((item) => item.leaf.path ?? item.leaf.href);
        } else data = [];
      } else if (operation === 'read.doc.get') {
        const request = input as { path?: string } | undefined;
        const selected = leafForPath(request?.path) ?? active?.leaf;
        if (
          selected &&
          typeof window !== 'undefined' &&
          routeKey(selected.href) !== routeKey(currentPath)
        ) {
          window.location.assign(selected.href);
        }
        data = selected
          ? {
              path: selected.path ?? selected.href,
              pathname: selected.href,
              title: selected.title,
              description: selected.description,
              updatedAt: selected.updatedAt ?? updatedAt,
              source: markdown,
              content: docContent,
            }
          : null;
      } else if (operation === 'read.doc.attachments') {
        data = hostAttachments;
      } else if (operation === 'read.util.pathname') {
        data = currentPath;
      } else if (operation === 'read.util.node') {
        data = {
          title: active?.leaf.title ?? pageTitle ?? title,
          origName: slug(active?.leaf.title ?? pageTitle ?? title),
        };
      } else if (operation === 'read.tsdocs') {
        data = { scopes: [] };
      } else if (operation === 'read.asset.get') {
        data = new ArrayBuffer(0);
      } else {
        return { error: new Error(`The local Docs provider does not implement ${operation}.`) };
      }
      return { data: data as T };
    },
  };

  return (
    <div className="docs-theme-scope" style={theme}>
      <TerraDocsWorkspace
        host={host}
        tree={tree}
        pathname={currentPath}
        permission="read"
        path={active?.leaf.path ?? docPath}
        title={pageTitle ?? active?.leaf.title ?? title}
        {...(active?.leaf.description ? { description: active.leaf.description } : {})}
        {...((active?.leaf.updatedAt ?? updatedAt)
          ? { updatedAt: active?.leaf.updatedAt ?? updatedAt }
          : {})}
        source={markdown}
        content={docContent}
        {...(readyContent !== undefined ? { renderContent: readyContent } : {})}
      />
    </div>
  );
}
