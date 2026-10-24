import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@terra-symposium/styling/ui';
import {
  DocumentAttachment,
  Download,
  Link,
  OverflowMenuVertical,
  TrashCan,
} from '@carbon/icons-react';

export type DocsAttachment = { title: string; href: string; type?: string; size?: number };
export type DocsLeaf = {
  title: string;
  href: string;
  description?: string;
  updatedAt?: string;
  attachments?: DocsAttachment[];
};
export type DocsGroup = { title: string; id?: string; leaves: DocsLeaf[] };
export type DocsSection = { title: string; id?: string; groups: DocsGroup[] };
export type DocsTreeActionName =
  | 'create-leaf'
  | 'rename-leaf'
  | 'duplicate-leaf'
  | 'delete-leaf'
  | 'move-leaf'
  | 'move-leaf-up'
  | 'move-leaf-down'
  | 'manage-attachments'
  | 'download-leaf'
  | 'rename-group'
  | 'delete-group'
  | 'move-group-up'
  | 'move-group-down'
  | 'rename-section'
  | 'delete-section'
  | 'download-section';
export type DocsTreeAction = {
  name: DocsTreeActionName;
  section: DocsSection;
  group?: DocsGroup;
  leaf?: DocsLeaf;
};
/** Host actions own mutations and authorization. The package renders controls only for allowed actions. */
export type DocsTreeActions = {
  available: (action: DocsTreeAction) => boolean;
  perform: (action: DocsTreeAction) => void | Promise<void>;
};
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
  actions,
}: {
  sections: DocsSection[];
  currentPath: string;
  actions?: DocsTreeActions | undefined;
}): JSX.Element {
  const [sectionIndex, setSectionIndex] = useState(() => sectionForPath(sections, currentPath));
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setSectionIndex(sectionForPath(sections, currentPath)), [sections, currentPath]);
  const section = sections[sectionIndex];
  const groups = section?.groups ?? [];
  const run = (action: DocsTreeAction) => {
    if (!actions?.available(action)) return;
    if (
      action.name.startsWith('delete-') &&
      !window.confirm(
        `Delete ${action.leaf?.title ?? action.group?.title ?? action.section.title}? This action cannot be undone.`,
      )
    )
      return;
    setError('');
    void Promise.resolve(actions.perform(action)).catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : 'Action failed.'),
    );
  };
  const leafAction = (
    name: DocsTreeActionName,
    group: DocsGroup,
    leaf: DocsLeaf,
  ): DocsTreeAction => ({ name, section: section!, group, leaf });
  const menuItems = (group: DocsGroup, leaf: DocsLeaf, kind: 'context' | 'dropdown') => {
    const Item = kind === 'context' ? ContextMenuItem : DropdownMenuItem;
    const Separator = kind === 'context' ? ContextMenuSeparator : DropdownMenuSeparator;
    return (
      <>
        <Item onSelect={() => window.open(leaf.href, '_blank', 'noopener,noreferrer')}>
          Open in new tab
        </Item>
        <Item
          onSelect={() => {
            void navigator.clipboard.writeText(new URL(leaf.href, window.location.href).href);
          }}
        >
          <Link className="size-4" />
          Copy link
        </Item>
        <Item
          onSelect={() => {
            sessionStorage.setItem('terra-docs:mode', 'attachments');
            window.location.assign(leaf.href);
          }}
        >
          <DocumentAttachment className="size-4" />
          Attachments view
        </Item>
        {actions &&
          (
            [
              'move-leaf-up',
              'move-leaf-down',
              'move-leaf',
              'rename-leaf',
              'duplicate-leaf',
              'manage-attachments',
              'download-leaf',
              'delete-leaf',
            ] as const
          )
            .filter((name) => actions.available(leafAction(name, group, leaf)))
            .map((name, index) => (
              <span key={name}>
                {index === 0 && <Separator />}
                <Item onSelect={() => run(leafAction(name, group, leaf))}>
                  {name === 'move-leaf-up' ? (
                    'Move up'
                  ) : name === 'move-leaf-down' ? (
                    'Move down'
                  ) : name === 'move-leaf' ? (
                    'Move to group'
                  ) : name === 'rename-leaf' ? (
                    'Rename page'
                  ) : name === 'duplicate-leaf' ? (
                    'Duplicate page'
                  ) : name === 'manage-attachments' ? (
                    'Manage attachments'
                  ) : name === 'download-leaf' ? (
                    <>
                      <Download className="size-4" />
                      Download page
                    </>
                  ) : (
                    <>
                      <TrashCan className="size-4" />
                      Delete page
                    </>
                  )}
                </Item>
              </span>
            ))}
      </>
    );
  };
  return (
    <nav className="terra-docs-workspace-nav" aria-label="Documentation">
      <label className="terra-docs-control-label" htmlFor="terra-docs-section">
        Section
      </label>
      <div className="terra-docs-workspace-section-select">
        <Select
          value={String(sectionIndex)}
          onValueChange={(value) => {
            const index = Number(value);
            setSectionIndex(index);
            setQuery('');
            const href = sections[index] && firstLeaf(sections[index]);
            if (href) window.location.assign(href);
          }}
        >
          <SelectTrigger id="terra-docs-section" aria-label="Section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sections.map((entry, index) => (
              <SelectItem key={`${entry.title}-${index}`} value={String(index)}>
                {entry.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {section && actions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs" aria-label={`Actions for section ${section.title}`}>
                <OverflowMenuVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {(['rename-section', 'download-section', 'delete-section'] as const)
                .filter((name) => actions.available({ name, section }))
                .map((name) => (
                  <DropdownMenuItem key={name} onSelect={() => run({ name, section })}>
                    {name === 'rename-section'
                      ? 'Rename section'
                      : name === 'download-section'
                        ? 'Download section'
                        : 'Delete section'}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Input
        aria-label="Search pages"
        placeholder="Search pages"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {error && <p role="alert">{error}</p>}
      <div className="terra-docs-workspace-groups">
        {groups
          .filter(
            (group) =>
              !query ||
              group.title.toLowerCase().includes(query.toLowerCase()) ||
              group.leaves.some((leaf) => leaf.title.toLowerCase().includes(query.toLowerCase())),
          )
          .map((group, index) => (
            <div className="terra-docs-workspace-group" key={`${group.title}-${index}`}>
              <div className="terra-docs-workspace-group-heading">
                <h2>{group.title}</h2>
                {actions && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-label={`Actions for group ${group.title}`}
                      >
                        <OverflowMenuVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {(
                        [
                          'create-leaf',
                          'move-group-up',
                          'move-group-down',
                          'rename-group',
                          'delete-group',
                        ] as const
                      )
                        .filter((name) => actions.available({ name, section: section!, group }))
                        .map((name) => (
                          <DropdownMenuItem
                            key={name}
                            onSelect={() => run({ name, section: section!, group })}
                          >
                            {name === 'create-leaf'
                              ? 'New page'
                              : name === 'move-group-up'
                                ? 'Move group up'
                                : name === 'move-group-down'
                                  ? 'Move group down'
                                  : name === 'rename-group'
                                    ? 'Rename group'
                                    : 'Delete group'}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <ul>
                {group.leaves
                  .filter(
                    (leaf) =>
                      !query ||
                      group.title.toLowerCase().includes(query.toLowerCase()) ||
                      leaf.title.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((leaf, leafIndex) => (
                    <li key={`${leaf.href}-${leafIndex}`}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <a
                            href={leaf.href}
                            aria-current={leaf.href === currentPath ? 'page' : undefined}
                          >
                            {leaf.title}
                          </a>
                        </ContextMenuTrigger>
                        <ContextMenuContent>{menuItems(group, leaf, 'context')}</ContextMenuContent>
                      </ContextMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="xs"
                            aria-label={`Actions for ${leaf.title}`}
                          >
                            <OverflowMenuVertical size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {menuItems(group, leaf, 'dropdown')}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
    const requested = sessionStorage.getItem('terra-docs:mode');
    if (requested === 'attachments') {
      setMode('attachments');
      onModeChange?.('attachments');
      sessionStorage.removeItem('terra-docs:mode');
    }
  }, [onModeChange]);
  useEffect(() => {
    const element = document.querySelector<HTMLElement>('.terra-docs-site');
    if (element) element.dataset.docsMode = mode;
    return () => {
      if (element) delete element.dataset.docsMode;
    };
  }, [mode]);
  return (
    <div
      className="terra-docs-workspace-toolbar"
      role="toolbar"
      aria-label="Document controls"
      data-can-edit={Boolean(capabilities.edit && remoteProvider)}
    >
      <Select
        value={mode}
        onValueChange={(value) => {
          const next = value as DocsMode;
          setMode(next);
          onModeChange?.(next);
          if (next === 'edit') onEdit?.();
        }}
      >
        <SelectTrigger aria-label="Mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="view">View</SelectItem>
          {capabilities.edit && remoteProvider && <SelectItem value="edit">Edit</SelectItem>}
          <SelectItem value="attachments">Attachments</SelectItem>
        </SelectContent>
      </Select>
      {mode === 'edit' && capabilities.save && (
        <Button type="button" size="xs" onClick={onSave}>
          Save
        </Button>
      )}
      {mode === 'edit' && capabilities.history && (
        <Button type="button" size="xs" variant="ghost" onClick={onHistory}>
          History
        </Button>
      )}
      {mode === 'edit' && capabilities.publish && (
        <Button type="button" size="xs" variant="tonal" onClick={onPublish}>
          Publish
        </Button>
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
