import { DocsStaticWorkspace } from './StaticWorkspace.js';
import type { DocsSection, DocsAttachment } from '../lib/workspace-types.js';
import type { DocsNavNode } from './navigation.js';
import type { JSX, ReactNode } from 'react';

/**
 * Compatibility adapter for static React sites.
 *
 * All navigation, page chrome, modes, and document rendering are delegated to
 * the same TerraDocsWorkspace used by the local and remote host adapters.
 */
export function DocsSiteLayout({
  title,
  homeHref = '/',
  description,
  pageTitle,
  nodes,
  currentPath,
  hue = 145,
  children,
  sections,
  attachments = [],
  rootPath,
  markdown,
  content,
}: {
  title: string;
  homeHref?: string;
  description?: string;
  pageTitle?: string;
  nodes: DocsNavNode[];
  currentPath: string;
  hue?: number | null;
  children?: ReactNode;
  sections?: DocsSection[];
  attachments?: DocsAttachment[];
  rootPath?: string;
  markdown?: string;
  content?: unknown;
}): JSX.Element {
  return (
    <DocsStaticWorkspace
      title={title}
      homeHref={homeHref}
      {...(description ? { description } : {})}
      {...(pageTitle ? { pageTitle } : {})}
      hue={hue}
      nodes={nodes}
      {...(sections ? { sections } : {})}
      currentPath={currentPath}
      {...(rootPath ? { rootPath } : {})}
      {...(markdown !== undefined ? { markdown } : {})}
      {...(content !== undefined ? { content } : {})}
      attachments={attachments}
      {...(children !== undefined ? { renderContent: children } : {})}
    />
  );
}
