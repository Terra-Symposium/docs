import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

export type DocsAttachment = { title: string; href: string; type?: string; size?: number };
export type DocsLeaf = {
  title: string;
  href: string;
  description?: string;
  updatedAt?: string;
  attachments?: DocsAttachment[];
};
export type DocsGroup = { title: string; leaves: DocsLeaf[] };
export type DocsSection = { title: string; groups: DocsGroup[] };
/** Remote persistence is host-owned. Local repository pages omit this provider. */
export type DocsRemoteProvider = {
  loadDraft: (slug: string) => Promise<{ markdown: string; revision: number }>;
  saveDraft: (slug: string, markdown: string, expectedRevision: number) => Promise<number>;
  publish: (slug: string, expectedRevision: number) => Promise<number>;
  history: (slug: string) => Promise<unknown[]>;
  uploadAttachment?: (slug: string, file: File) => Promise<DocsAttachment>;
};
export type DocsCapabilities = {
  edit?: boolean;
  save?: boolean;
  history?: boolean;
  publish?: boolean;
};
export type DocsMode = 'view' | 'attachments' | 'edit';

function firstLeaf(section: DocsSection): string {
  return section.groups.flatMap((group) => group.leaves)[0]?.href ?? '/';
}
function sectionForPath(sections: DocsSection[], path: string): number {
  return Math.max(
    0,
    sections.findIndex((section) =>
      section.groups.some((group) => group.leaves.some((leaf) => leaf.href === path)),
    ),
  );
}

export function DocsWorkspaceNavigation({
  sections,
  currentPath,
}: {
  sections: DocsSection[];
  currentPath: string;
}): JSX.Element {
  const [sectionIndex, setSectionIndex] = useState(() => sectionForPath(sections, currentPath));
  const [query, setQuery] = useState('');
  useEffect(() => setSectionIndex(sectionForPath(sections, currentPath)), [sections, currentPath]);
  const section = sections[sectionIndex];
  const groups = useMemo(
    () =>
      section?.groups
        .map((group) => ({
          ...group,
          leaves: group.leaves.filter((leaf) =>
            `${leaf.title} ${leaf.description ?? ''}`.toLowerCase().includes(query.toLowerCase()),
          ),
        }))
        .filter((group) => group.leaves.length) ?? [],
    [section, query],
  );
  return (
    <nav className="terra-docs-workspace-nav" aria-label="Documentation">
      <label className="terra-docs-control-label" htmlFor="terra-docs-section">
        Section
      </label>
      <select
        id="terra-docs-section"
        aria-label="Section"
        value={sectionIndex}
        onChange={(event) => {
          const index = Number(event.currentTarget.value);
          setSectionIndex(index);
          const href = sections[index] && firstLeaf(sections[index]);
          if (href) window.location.assign(href);
        }}
      >
        {sections.map((entry, index) => (
          <option key={`${entry.title}-${index}`} value={index}>
            {entry.title}
          </option>
        ))}
      </select>
      <label className="terra-docs-control-label" htmlFor="terra-docs-search">
        Search pages
      </label>
      <input
        id="terra-docs-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search this section"
      />
      <div className="terra-docs-workspace-groups">
        {groups.map((group, index) => (
          <div className="terra-docs-workspace-group" key={`${group.title}-${index}`}>
            <h2>{group.title}</h2>
            <ul>
              {group.leaves.map((leaf, leafIndex) => (
                <li key={`${leaf.href}-${leafIndex}`}>
                  <a href={leaf.href} aria-current={leaf.href === currentPath ? 'page' : undefined}>
                    {leaf.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {groups.length === 0 && <p className="terra-docs-empty">No pages found.</p>}
    </nav>
  );
}

export function DocsWorkspaceToolbar({
  attachments = [],
  capabilities = {},
  onEdit,
  onSave,
  onHistory,
  onPublish,
  remoteProvider,
  onModeChange,
}: {
  attachments?: DocsAttachment[];
  capabilities?: DocsCapabilities | undefined;
  onEdit?: (() => void) | undefined;
  onSave?: (() => void) | undefined;
  onHistory?: (() => void) | undefined;
  onPublish?: (() => void) | undefined;
  remoteProvider?: DocsRemoteProvider | undefined;
  onModeChange?: ((mode: DocsMode) => void) | undefined;
}): JSX.Element {
  const [mode, setMode] = useState<DocsMode>('view');
  useEffect(() => {
    const element = document.querySelector<HTMLElement>('.terra-docs-site');
    if (element) element.dataset.docsMode = mode;
    return () => {
      if (element) delete element.dataset.docsMode;
    };
  }, [mode]);
  return (
    <div className="terra-docs-workspace-toolbar" role="toolbar" aria-label="Document controls">
      <label htmlFor="terra-docs-mode">Mode</label>
      <select
        id="terra-docs-mode"
        aria-label="Mode"
        value={mode}
        onChange={(event) => {
          const next = event.currentTarget.value as DocsMode;
          setMode(next);
          onModeChange?.(next);
          if (next === 'edit') onEdit?.();
        }}
      >
        <option value="view">View</option>
        <option value="attachments">
          Attachments{attachments.length ? ` (${attachments.length})` : ''}
        </option>
        {capabilities.edit && remoteProvider && <option value="edit">Edit</option>}
      </select>
      {mode === 'edit' && capabilities.save && (
        <button type="button" onClick={onSave}>
          Save
        </button>
      )}
      {mode === 'edit' && capabilities.history && (
        <button type="button" onClick={onHistory}>
          History
        </button>
      )}
      {mode === 'edit' && capabilities.publish && (
        <button type="button" onClick={onPublish}>
          Publish
        </button>
      )}
    </div>
  );
}

export function DocsAttachmentsView({
  attachments = [],
  onUpload,
}: {
  attachments?: DocsAttachment[];
  onUpload?: ((file: File) => void | Promise<void>) | undefined;
}): JSX.Element {
  return (
    <section className="terra-docs-attachments-view" aria-label="Attachments">
      <h2>Attachments</h2>
      {onUpload && (
        <label className="terra-docs-attachment-upload">
          Add attachment{' '}
          <input
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void onUpload(file);
              event.currentTarget.value = '';
            }}
          />
        </label>
      )}
      {attachments.length ? (
        <ul>
          {attachments.map((attachment, index) => (
            <li key={`${attachment.href}-${index}`}>
              <a href={attachment.href} target="_blank" rel="noopener noreferrer">
                {attachment.title}
              </a>
              {attachment.type && <span>{attachment.type}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p>No attachments found.</p>
      )}
    </section>
  );
}
