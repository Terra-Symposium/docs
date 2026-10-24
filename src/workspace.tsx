import { useEffect, useState } from 'react';
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
  useEffect(() => setSectionIndex(sectionForPath(sections, currentPath)), [sections, currentPath]);
  const section = sections[sectionIndex];
  const groups = section?.groups ?? [];
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
      <div className="terra-docs-workspace-groups">
        {groups.map((group, index) => (
          <div className="terra-docs-workspace-group" key={`${group.title}-${index}`}>
            <h2>{group.title}</h2>
            <ul>
              {group.leaves.map((leaf, leafIndex) => (
                <li
                  key={`${leaf.href}-${leafIndex}`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    const menu = event.currentTarget.querySelector('details');
                    if (menu) menu.open = true;
                  }}
                >
                  <a href={leaf.href} aria-current={leaf.href === currentPath ? 'page' : undefined}>
                    {leaf.title}
                  </a>
                  <details className="terra-docs-leaf-menu">
                    <summary aria-label={`Actions for ${leaf.title}`}>⋯</summary>
                    <div role="group" aria-label={`Actions for ${leaf.title}`}>
                      <a href={leaf.href} target="_blank" rel="noopener noreferrer">
                        Open in new tab
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            new URL(leaf.href, window.location.href).href,
                          );
                        }}
                      >
                        Copy link
                      </button>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {groups.length === 0 && <p className="terra-docs-empty">No pages in this section.</p>}
    </nav>
  );
}

export function DocsWorkspaceToolbar({
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
      <select
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
        {capabilities.edit && remoteProvider && <option value="edit">Edit</option>}
        <option value="attachments">Attachments</option>
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
