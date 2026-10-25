import { colors } from '@terra-symposium/styling';
import { DocsToolbarFrame } from '@terra-symposium/styling/ui';
import { DocsWorkspaceNavigation, DocsWorkspaceToolbar, DocsAttachmentsView } from './workspace.js';
import { DocsStaticWorkspace } from './StaticWorkspace.js';
import type {
  DocsSection,
  DocsAttachment,
  DocsCapabilities,
  DocsRemoteProvider,
  DocsTreeActions,
  DocsMode as WorkspaceMode,
} from './workspace.js';
import type { DocsNavNode } from './navigation.js';
import type { CSSProperties, JSX, ReactNode } from 'react';

/** Shared Terra Docs page shell for independent installations and repository guides. */
export function DocsSiteLayout({
  title,
  homeHref = '/',
  description,
  pageTitle,
  nodes,
  currentPath,
  hue = 145,
  children,
  sidebarContent,
  sections,
  attachments = [],
  rootPath,
  markdown,
  content,
  capabilities,
  onEdit,
  onSave,
  onHistory,
  onPublish,
  remoteProvider,
  onModeChange,
  onUpload,
  treeActions,
}: {
  title: string;
  homeHref?: string;
  description?: string;
  pageTitle?: string;
  nodes: DocsNavNode[];
  currentPath: string;
  hue?: number | null;
  children?: ReactNode;
  sidebarContent?: ReactNode;
  sections?: DocsSection[];
  attachments?: DocsAttachment[];
  rootPath?: string;
  markdown?: string;
  content?: unknown;
  capabilities?: DocsCapabilities;
  onEdit?: () => void;
  onSave?: () => void;
  onHistory?: () => void;
  onPublish?: () => void;
  remoteProvider?: DocsRemoteProvider;
  onModeChange?: (mode: WorkspaceMode) => void;
  onUpload?: (file: File) => void | Promise<void>;
  treeActions?: DocsTreeActions;
}): JSX.Element {
  if (markdown !== undefined || content !== undefined) {
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
      />
    );
  }
  const [accent, neutral] = colors(hue);
  const style = {
    '--terra-docs-accent': `rgb(${accent.light[8]})`,
    ...Object.fromEntries(accent.light.map((value, index) => [`--primary-${index + 1}`, value])),
    ...Object.fromEntries(neutral.light.map((value, index) => [`--secondary-${index + 1}`, value])),
  } as CSSProperties;
  const workspaceSections: DocsSection[] =
    sections ??
    nodes.map((node) => ({
      title: node.title,
      groups: [
        {
          title: node.title,
          leaves: (node.children?.length ? node.children : [node])
            .filter((entry) => entry.href)
            .map((entry) => ({ title: entry.title, href: entry.href! })),
        },
      ],
    }));
  const activeLeaf = workspaceSections
    .flatMap((section) => section.groups.flatMap((group) => group.leaves))
    .find((leaf) => leaf.href === currentPath);
  return (
    <div className="terra-docs-site light" style={style}>
      <div className="terra-docs-site-layout">
        <aside className="terra-docs-site-sidebar">
          <header className="terra-docs-site-header">
            <a className="terra-docs-site-brand" href={homeHref}>
              {title}
            </a>
            {description && <span className="terra-docs-site-description">{description}</span>}
          </header>
          <DocsWorkspaceNavigation
            sections={workspaceSections}
            currentPath={currentPath}
            actions={treeActions}
          />
          {sidebarContent}
        </aside>
        <main className="terra-docs-site-main">
          <header className="terra-docs-document-header">
            <h1>{pageTitle ?? activeLeaf?.title ?? title}</h1>
            {activeLeaf?.description && (
              <p className="terra-docs-site-metadata">{activeLeaf.description}</p>
            )}
            {activeLeaf?.updatedAt && (
              <p className="terra-docs-site-metadata">Updated {activeLeaf.updatedAt}</p>
            )}
          </header>
          <DocsToolbarFrame>
            <DocsWorkspaceToolbar
              attachments={attachments}
              capabilities={capabilities}
              onEdit={onEdit}
              onSave={onSave}
              onHistory={onHistory}
              onPublish={onPublish}
              remoteProvider={remoteProvider}
              onModeChange={onModeChange}
            />
            <div className="terra-docs-formatting-slot" />
          </DocsToolbarFrame>
          <DocsAttachmentsView attachments={attachments} onUpload={onUpload} />
          <article className="terra-docs-site-article">{children}</article>
        </main>
      </div>
    </div>
  );
}
