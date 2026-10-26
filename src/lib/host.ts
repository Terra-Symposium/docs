import type { ComponentType, ReactNode } from 'react';

/** The portable tree-node shape used by the original Terra Docs workspace. */
export type DocsHostTreeNode = {
  type: 'branch' | 'leaf';
  origName: string;
  title?: string;
  url?: string;
  path?: string;
  permission?: 'read' | 'write';
  children?: DocsHostTreeNode[];
  [key: string]: unknown;
};

/** A portable document value handed to the workspace by its storage adapter. */
export type DocsHostDocument = {
  id?: string;
  path?: string;
  pathname?: string;
  title: string;
  description?: string;
  content?: unknown[] | string;
  source?: string;
  contributors?: string[];
  updatedAt?: string;
  [key: string]: unknown;
};

/** The subset of the signed-in account the shared navigation can display. */
export type DocsHostUser = {
  id?: string;
  name?: string;
  email?: string;
  image?: string;
  [key: string]: unknown;
};

/** Portable attachment metadata. The host resolves and authorizes its URL. */
export type DocsHostAttachment = {
  id?: string;
  name: string;
  path: string;
  type?: string;
  size?: number;
  [key: string]: unknown;
};

/** Capability flags control which mutating controls the shared UI displays. */
export type DocsHostCapabilities = {
  read?: boolean;
  write?: boolean;
  reorder?: boolean;
  attachments?: boolean;
  export?: boolean;
  history?: boolean;
  publish?: boolean;
};

export type DocsActionOperation =
  | `read.${'asset' | 'doc' | 'external' | 'source' | 'util'}.${string}`
  | `read.${'tsdocs'}`
  | `write.${'asset' | 'attachment' | 'doc'}.${string}`;

export type DocsActionResult<T = unknown> = { data?: T; error?: unknown };

export type DocsResolvedRoute = {
  sectionId: string;
  groupId?: string;
  leafId?: string;
  targetId: string;
  pathname: string;
};

/** Type contract for the stable host operations used by the shared UI. */
export type DocsHostOperationContracts = {
  'read.doc.list': {
    input: { type: 'nav'; pathname: string; full?: boolean };
    output: DocsHostTreeNode[];
  };
  'read.doc.get': {
    input: { id?: string; pathname?: string };
    output: DocsHostDocument | null;
  };
  'read.doc.attachments': {
    input: { path: string };
    output: DocsHostAttachment[];
  };
  'write.doc.save': {
    input: { path: string; title: string; description?: string; content?: unknown[]; source?: string };
    output: DocsHostDocument;
  };
  'write.doc.reorder': {
    input: { path: string; parent: string; order: number; type?: 'leaf' | 'branch' };
    output: DocsHostTreeNode[] | null;
  };
  'write.doc.rm': {
    input: { path: string; type: 'doc' | 'folder'; assets?: boolean };
    output: null;
  };
};

/** Host boundary for storage, authorization, URLs, and mutations. */
export type DocsHostAdapter = {
  capabilities: DocsHostCapabilities;
  /** Legacy action bridge for host-specific operations outside the stable contract. */
  invoke<T = unknown>(operation: DocsActionOperation, input?: unknown): Promise<DocsActionResult<T>>;
  /** Load a host-owned draft when an editor enters Edit mode. */
  loadDraft?: (path: string) => Promise<DocsHostDocument | null>;
  /** Publish the current saved draft from the shared toolbar when supported by the host. */
  publishDraft?: (path: string) => Promise<void>;
  assetUrl?: (assetId: string, width?: number) => string | undefined;
  resolveRoute?: (pathname: string) => DocsResolvedRoute;
  buildRoute?: (sectionId: string, groupId?: string, leafId?: string) => string;
  /** Base path for a host's Docs application (`/docs` for Terra, `/` for local instances). */
  rootPath?: string;
  /** Resolve a repository or content path into a browser route. */
  routePath?: (path: string) => string;
  /** Route back to the host's Docs root from its brand link. */
  homePath?: string;
  isDevelopmentOrigin?: (origin: string) => boolean;
  /** Label used in the shared sidebar and document title. */
  siteTitle?: string;
  /** Supporting text shown beneath the site title in the shared sidebar. */
  siteDescription?: string;
};

/** A host-specific rich block renderer. Generic blocks live in @terra-symposium/docs. */
export type DocsCustomBlock = {
  name: string;
  label?: string;
  component?: ComponentType<Record<string, unknown>>;
  render?: (props: Record<string, unknown>) => ReactNode;
  path?: string;
  clipboardValue?: string;
  exportValue?: string;
  [key: string]: unknown;
};

/** Root inputs required to mount the original Terra Docs workspace. */
export type TerraDocsWorkspaceProps = {
  host: DocsHostAdapter;
  tree: DocsHostTreeNode[];
  pathname: string;
  permission: 'read' | 'write';
  path?: string;
  title: string;
  description?: string;
  contributors?: string[];
  updatedAt?: string;
  userData?: DocsHostUser | null;
  source?: string;
  content?: unknown;
  standalone?: boolean;
  full?: boolean;
  mode?: 'view' | 'edit' | 'attachments';
  customBlocks?: DocsCustomBlock[];
};
