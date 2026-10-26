import type { ComponentType, ReactNode } from 'react';

type UnknownRecord = Record<string, unknown>;
type PortableBlock<T extends string = string> = T extends string
  ? { _type: T; _key?: string; children?: PortableBlock[]; [key: string]: unknown }
  : never;

export type DocsPermissionLevel = 'read' | 'write';
export type Mode = 'view' | 'edit' | 'attachments';
export type Transition = 'idle' | 'local' | 'p' | `to-${Mode}`;
export type DocTableCell = {
  _key?: string;
  _type?: 'cell';
  content?: DocBody;
  html?: string;
  markdown?: string;
};
export type DocBlock = {
  _type: string;
  _key?: string;
  alt?: string;
  children?: PortableBlock[];
  code?: string;
  content?: DocBody | null;
  depth?: number;
  direction?: string;
  edges?: unknown[];
  height?: number | string;
  inline?: boolean;
  items?: Array<{ content?: DocBody | null; markdown?: string; title?: string }>;
  kind?: string;
  language?: string;
  listItem?: string;
  markdown?: string;
  markDefs?: DocsContentPtMarkDef[];
  nodes?: unknown[];
  nodeSep?: number;
  proximityConnect?: boolean;
  rankSep?: number;
  rows?: Array<{ cells: DocTableCell[] }>;
  source?: string;
  src?: string;
  scope?: string;
  style?: string;
  text?: string;
  title?: string;
  url?: string;
  value?: unknown;
  width?: number | string;
  [key: string]: unknown;
};
export type DocBody = DocBlock[];
export const isDocBody = (value: unknown): value is DocBody =>
  Array.isArray(value) &&
  value.every((block) => block && typeof block === 'object' && '_type' in block);
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
  [key: string]: unknown;
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
export type ActionRes<T = unknown> = { data?: T; error?: unknown };
export type Draft = {
  content?: string | DocBody | null;
  description?: string;
  path?: string;
  title?: string;
  source: string;
};
export type EditorSel = {
  anchorOffset?: number;
  anchorPath?: number[] | null;
  anchorText?: string;
  box?: { height: number; left: number; top: number; width: number };
  collapsed?: boolean;
  code?: { from: number; to: number } | null;
  dom?: Range | null;
  focusOffset?: number;
  focusPath?: number[] | null;
  focusText?: string;
  text?: string;
  visible?: boolean;
};
export type EditorRefs = {
  body?: HTMLElement | null;
  selection?: EditorSel | null;
  toolbar?: ToolbarState | null;
};
export type EditorSurface = UnknownRecord;
export type ToolbarState = {
  applySearchText: (value: string) => void;
  busy: string | null;
  dirty: boolean;
  discard?: () => void | Promise<void>;
  insert: (md: string, rootEnd?: boolean, selection?: EditorSel | null) => void;
  optimistic?: boolean;
  path?: string;
  permission?: DocsPermissionLevel;
  prettier?: () => void;
  readSearchText: () => Promise<string>;
  save?: () => void | Promise<void>;
  setMode: (mode: Mode) => Promise<void>;
  toggleList?: (kind: string) => void;
};
export type EditorState = {
  busy: string | null;
  dirty: boolean;
  draft: Draft;
  loaded: boolean;
  optimistic: boolean;
  version: number;
};
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
  [key: string]: unknown;
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
  [key: string]: unknown;
};
export type Tree = Leaf | Branch;
export type AttchType =
  'image' | 'pdf' | 'youtube' | 'tsdocs' | 'website' | 'file' | 'doc' | 'document' | 'other';
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
  icon: ReactNode;
  label: string;
  value: string;
  onSelect: () => void;
};
export type RepoComponentWithLabel = {
  name: string;
  label?: string;
  component?: ComponentType<UnknownRecord>;
  displayLabel?: string;
  [key: string]: unknown;
};
export type MenuTree = { components: RepoComponentWithLabel[]; folders: Record<string, MenuTree> };
export type DragState =
  | { active: boolean; path: string; kind: 'leaf' }
  | { fPath: string; kind: 'branch'; pPath: string };
export type ReorderDropState = { key: string; position: 'after' | 'before' | 'inside' };
export type TableRow<TCell = DocTableCell> = { _key: string; _type: 'row'; cells: TCell[] };
export type BlockTgt = HTMLElement & { __blockActions?: UnknownRecord[] };
export type TsDocsItem = { slug: string; title: string; body: DocBody };
export type Edge = UnknownRecord;
export type FlowNode = UnknownRecord;
export type FlowEdgeData = UnknownRecord & {
  color?: string;
  label?: string;
  srcHandleOverride?: string;
  tgtHandleOverride?: string;
};
export type NodeData = UnknownRecord & {
  attributes?: Array<{ name: string; type?: string; value?: string }>;
  compact?: boolean;
  editable?: boolean;
  href?: string;
  id?: string;
  onClick?: () => void;
  requiredHandles?: { sources?: Pos[]; tgts?: Pos[] };
  title?: string;
};
export type Pos = 'top' | 'right' | 'bottom' | 'left';
export type DagreNode = { x?: number; y?: number; width?: number; height?: number };
export type FlowNodeLike = {
  id: string;
  position?: { x: number; y: number };
  [key: string]: unknown;
};
export type FlowSize = { w: number; h: number };
export type NodesProps = UnknownRecord & {
  direction?: string;
  edges?: Edge[];
  height?: number;
  nodes?: FlowNode[];
};
export type GroupNodeData = NodeData & {
  isDragTarget?: boolean;
  onResizeEnd?: (id: string, size: FlowSize) => void;
};
export type PowerSrcGraph = {
  nodes: Array<
    | { type: 'origin' | 'terminal'; position?: { row?: number }; [key: string]: unknown }
    | {
        type: 'content';
        question?: { _ref?: string };
        position?: { row?: number };
        [key: string]: unknown;
      }
  >;
  [key: string]: unknown;
};
export type DocsContentPtMarkDef = {
  _key?: string;
  _type?: string;
  href?: string;
  [key: string]: unknown;
};
export type DocsContentPtSpan = {
  _key?: string;
  _type?: string;
  marks?: string[];
  text?: string;
  [key: string]: unknown;
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
export type DocsAttachment = {
  path?: string;
  size?: number;
  title: string;
  type?: string;
  url?: string;
};
export type EditorToolbarAdapter = UnknownRecord;
export type PortableEditorBlock = PortableBlock;
export type DocsPermSrc = UnknownRecord;
export type User = { _id?: string; _type?: string; [key: string]: unknown };
export type DocsNestedContent = PortableBlock[];
export type TerraContent = PortableBlock[];
export type Problem = { _id?: string; title?: string; [key: string]: unknown };
type ArticleInlineType = 'image' | 'video' | 'table' | 'questions' | 'dialogue' | 'definition';
export type ArticleContent = Array<
  PortableBlock<'block'> & { children?: PortableBlock<ArticleInlineType>[] }
>;
export type DocsContent = PortableBlock<keyof typeof DOCS_BLOCK_SCHEMAS>[];
export type ProblemContent = PortableBlock<(typeof PROBLEM_BLOCK_TYPES)[number]>[];
export type StructureQuestion = { _id?: string; question?: string };
export type TraversalGraph = { nodes: FlowNodeLike[]; edges?: ArcGraphEdge[] };
export type ArcGraph = { nodes: FlowNodeLike[]; edges: ArcGraphEdge[]; [key: string]: unknown };
export type ArcGraphEdge = { source: string; target: string; [key: string]: unknown };
export type Arc = { _id?: string; _type?: string; [key: string]: unknown };
export type Viewpoint = { _id?: string; title?: string; [key: string]: unknown };
export type FlowMenuContext = { type: 'pane' | '_node' | 'e'; id: string | null };
export type DocsBlockEditorProps = UnknownRecord;
export type PortableTextBlockRendererProps<TBlock> = {
  attributes: UnknownRecord;
  children: ReactNode;
  node: TBlock;
  path: Array<string | number>;
  readOnly?: boolean;
};
export type PortableTextBlockEditorProps<TBlock> = Omit<
  PortableTextBlockRendererProps<TBlock>,
  'readOnly'
>;
export type InlineObjectRenderProps = UnknownRecord;
export type JSX = ReactNode;

export const DOCS_BLOCK_SCHEMAS = {
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
} satisfies Record<string, { fields: Array<{ name: string; type: string }> }>;
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
