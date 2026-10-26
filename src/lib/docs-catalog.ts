/// <reference types="vite/client" />

import type { DocsHostTreeNode } from './host.js';
import type { DocsLocalPage } from '../components/LocalDocsWorkspace.js';

const modules = import.meta.glob('../content/docs/**/*.md', { eager: true }) as Record<
  string,
  { default: unknown; frontmatter?: { title?: string; description?: string } }
>;
const sources = import.meta.glob('../content/docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const docsPages: DocsLocalPage[] = Object.entries(modules).map(([file, module]) => {
  const slug = file
    .replace('../content/docs/', '')
    .replace(/(?:^|\/)index\.md$/, '')
    .replace(/\.md$/, '');
  const id = slug || 'index';
  const title =
    module.frontmatter?.title ??
    (id === 'index'
      ? 'Terra Docs'
      : id
          .split('/')
          .at(-1)!
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (value) => value.toUpperCase()));
  return {
    id,
    path: `content/docs/${id === 'index' ? 'index' : slug}.md`,
    pathname: id === 'index' ? '/' : `/${slug}/`,
    title,
    ...(module.frontmatter?.description ? { description: module.frontmatter.description } : {}),
    markdown: String(sources[file] ?? '').replace(/^---\s*\n[\s\S]*?\n---\s*\n/, ''),
  };
});

const sections = [
  {
    id: 'start-here',
    title: 'Start here',
    groups: [{ id: 'guides', title: 'Guides', ids: ['index', 'getting-started'] }],
  },
  {
    id: 'configure',
    title: 'Configure',
    groups: [{ id: 'guides', title: 'Guides', ids: ['configuration', 'storage', 'deploy'] }],
  },
  {
    id: 'reference',
    title: 'Reference',
    groups: [{ id: 'guides', title: 'Guides', ids: ['component', 'development'] }],
  },
];

export const docsTree: DocsHostTreeNode[] = sections.map((section) => ({
  type: 'branch',
  origName: section.id,
  title: section.title,
  path: section.id,
  children: section.groups.map((group) => ({
    type: 'branch',
    origName: `${section.id}/${group.id}`,
    title: group.title,
    path: `${section.id}/${group.id}`,
    children: group.ids.flatMap((id) => {
      const page = docsPages.find((entry) => entry.id === id);
      return page
        ? [
            {
              type: 'leaf' as const,
              origName: page.id,
              title: page.title,
              path: page.path,
              url: page.pathname,
              permission: 'read' as const,
            },
          ]
        : [];
    }),
  })),
}));
