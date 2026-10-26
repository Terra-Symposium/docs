import type { ReactNode } from 'react';

export type DocsPermissionLevel = 'read' | 'write';
export type Mode = 'view' | 'edit' | 'attachments';
export type DocTableCell = {
  _key?: string;
  _type?: 'cell';
  content?: DocBody;
  html?: string;
  markdown?: string;
};
export type DocBlock = { _type: string; _key?: string; [key: string]: any };
export type DocBody = DocBlock[];
export type DocVer = {
  _key?: string;
  ver?: string;
  content?: string | DocBody;
  contentJson: string;
  body?: DocBody;
  component?: string;
  description: string;
  title: string;
  savedAt: string;
};
export type Md = {
  [key: string]: any;
  content?: string | DocVer[] | DocBody | null;
  description?: string;
  component?: string;
  order?: number;
  path?: string;
  pathname?: string;
  src?: string;
  title?: string;
  sources?: string[];
};
export type ActionRes<T = unknown> = { data?: T; error?: any };
export type Draft = {
  content?: string | DocBody | null;
  description?: string;
  path?: string;
  title?: string;
  source: string;
};
export type EditorSel = any;
export type EditorRefs = any;
export type EditorSurface = any;
export type ToolbarState = any;
export type EditorState = any;
export type PathProps = { pathname: string };
export type Leaf = {
  type: 'leaf';
  origName: string;
  path?: string;
  url: string;
  permission: DocsPermissionLevel;
  title?: string;
  description?: string;
  contributors?: string[];
  content?: unknown;
  source?: string;
  [key: string]: any;
};
export type Branch = {
  type: 'branch';
  origName: string;
  children: Tree[];
  permission: DocsPermissionLevel;
  title?: string;
  url?: string;
  firstLeafUrl?: string;
  hue?: number;
  [key: string]: any;
};
export type Tree = Leaf | Branch;
export type AttchType = 'image' | 'pdf' | 'youtube' | 'tsdocs' | 'website' | 'file' | 'doc';
export type Sister = {
  content?: unknown;
  id?: string;
  path: string;
  name: string;
  isMd: boolean;
  title?: string;
  type?: string;
  sourceUrl?: string;
  source?: string;
  unavailable?: boolean;
};
export type DocsTreeMenuAction = {
  destructive?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onSelect?: () => void;
  separator?: boolean;
  subActions?: DocsTreeMenuAction[];
};
export type DocsExportOpts = {
  flatten: boolean;
  format: 'raw' | 'pdf';
  filters: {
    pages: boolean;
    pdfs: boolean;
    images: boolean;
    youtube: boolean;
    tsdocs: boolean;
    other: boolean;
  };
  merges: { pages: boolean; pdfs: boolean; images: boolean; youtube: boolean; tsdocs: boolean };
};
export type ExportTgt = {
  paths: string[];
  rootDir: string;
  filename: string;
  title: string;
  nodeIds?: string[];
} | null;
export type AttchTgt = {
  path: string;
  title: string;
  scope: 'section' | 'group' | 'leaf';
  node: Tree;
};
export type DelTgt = {
  kind: 'section' | 'branch' | 'leaf';
  path: string;
  bPath?: string;
  slugPath?: string;
  active?: boolean;
  title: string;
  origNode?: Tree;
} | null;
export type PromptState = {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  value: string;
  onSave: (val: string) => void;
  onCancel?: () => void;
} | null;
export type BlockOpt = {
  group: 'type' | 'insert';
  icon: any;
  label: string;
  value: string;
  onSelect: () => void;
};
export type RepoComponentWithLabel = {
  name: string;
  label?: string;
  component?: any;
  displayLabel?: string;
  [key: string]: any;
};
export type MenuTree = { components: RepoComponentWithLabel[]; folders: Record<string, MenuTree> };
export type DragState =
  | { active: boolean; path: string; kind: 'leaf' }
  | { fPath: string; kind: 'branch'; pPath: string };
export type ReorderDropState = { key: string; position: 'after' | 'before' | 'inside' };
export type TableRow<TCell = DocTableCell> = { _key: string; _type: 'row'; cells: TCell[] };
export type BlockTgt = HTMLElement & { __blockActions?: any[] };
export type TsDocsItem = { slug: string; title: string; body: DocBody };
export type Edge = any;
export type FlowNode = any;
export type FlowEdgeData = any;
export type NodeData = any;
export type Pos = any;
export type DagreNode = any;
export type FlowNodeLike = any;
export type FlowSize = any;
export type NodesProps = any;
export type GroupNodeData = any;
export type PowerSrcGraph = any;
export type DocsContentPtMarkDef = {
  _key?: string;
  _type?: string;
  href?: string;
  [key: string]: any;
};
export type DocsContentPtSpan = {
  _key?: string;
  _type?: string;
  marks?: string[];
  text?: string;
  [key: string]: any;
};
export type DocsNodesDraft = Record<string, boolean | string | undefined>;
export type Field = {
  key: string;
  kind: string;
  label: string;
  placeholder?: string;
  textarea?: boolean;
  tooltip: string;
};
export type DocsAttachment = any;
export type EditorToolbarAdapter = any;
export type PortableEditorBlock = any;
export type DocsPermSrc = any;
export type User = any;
export type DocsNestedContent = any;
export type TerraContent = any;
export type Problem = any;
export type ArticleContent = any;
export type DocsContent = any;
export type ProblemContent = any;
export type StructureQuestion = any;
export type TraversalGraph = any;
export type ArcGraph = any;
export type ArcGraphEdge = any;
export type Arc = any;
export type Viewpoint = any;
export type FlowMenuContext = any;
export type DocsBlockEditorProps = any;
export type PortableTextBlockRendererProps = any;
export type PortableTextBlockEditorProps = any;
export type InlineObjectRenderProps = any;
export type JSX = any;

export const DOCS_BLOCK_SCHEMAS: Record<string, { fields: Array<{ name: string; type: string }> }> =
  {
    accordion: { fields: [{ name: 'items', type: 'array' }] },
    tabs: { fields: [{ name: 'items', type: 'array' }] },
    table: { fields: [{ name: 'rows', type: 'array' }] },
    callout: {
      fields: [
        { name: 'kind', type: 'string' },
        { name: 'content', type: 'array' },
      ],
    },
    code: { fields: [{ name: 'value', type: 'string' }] },
    docImage: { fields: [{ name: 'url', type: 'string' }] },
    embed: { fields: [{ name: 'src', type: 'string' }] },
    math: { fields: [{ name: 'code', type: 'string' }] },
    nodes: { fields: [{ name: 'nodes', type: 'array' }] },
    raw: { fields: [{ name: 'markdown', type: 'string' }] },
    tsDocs: { fields: [{ name: 'scope', type: 'string' }] },
  };
export const PROBLEM_BLOCK_TYPES = [
  'hint',
  'headline',
  'nodes',
  'entity',
  'definition',
  'countryReference',
  'notes',
  'photo',
  'audio',
  'video',
  'choicesReference',
  'question',
  'prompts',
  'timer',
  'table',
  'map',
  'tabs',
  'accordion',
] as const;
export const TERRA_CONTAINER_TYPES = ['tabs', 'accordion', 'callout'] as const;
export const ARTICLE_INLINE_SCHEMAS = {};
export const PROBLEM_BLOCK_SCHEMAS = {};
