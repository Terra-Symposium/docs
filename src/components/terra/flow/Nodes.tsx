// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/flow/Nodes.tsx
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import katex from 'katex';
import {
  applyEdgeChanges,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react';
import {
  cn,
  createTrace,
  errorLog,
  isRec,
  validateType,
  warn as logWarn,
} from '../../../lib/terra/runtime/runtime.js';
import { getCustomPos, getGroupId, getNodeSize, layoutGraph, useEditor } from './_chrome.js';
import { useCallback, useEffect, useRef, useState } from 'react';

// COMPONENTS
import React from 'react';
import {
  AlignHorizontalCenter as AlignHorizontalCenterIcon,
  AlignHorizontalLeft as AlignHorizontalLeftIcon,
  AlignHorizontalRight as AlignHorizontalRightIcon,
  AlignVerticalBottom as AlignVerticalBottomIcon,
  AlignVerticalCenter as AlignVerticalCenterIcon,
  AlignVerticalTop as AlignVerticalTopIcon,
  Choices as DecisionIcon,
  DataCategorical as TypeIcon,
  DataStructured as DataIcon,
  DistributeHorizontalCenter as DistributeHorizontalCenterIcon,
  DistributeHorizontalLeft as DistributeHorizontalLeftIcon,
  DistributeHorizontalRight as DistributeHorizontalRightIcon,
  DistributeVerticalBottom as DistributeVerticalBottomIcon,
  DistributeVerticalCenter as DistributeVerticalCenterIcon,
  DistributeVerticalTop as DistributeVerticalTopIcon,
  Document as NoteIcon,
  Edit as EditIcon,
  MagicWand as WandIcon,
  Maximize as MaximizeIcon,
  ObjectStorage as GroupIcon,
  PlayOutline as OriginIcon,
  RadioButton as TerminatorIcon,
  Redo as RedoIcon,
  StopOutline as TerminalIcon,
  Table as ErdIcon,
  Task as ProcessIcon,
  TrashCan as TrashIcon,
  Undo as UndoIcon,
} from '@carbon/icons-react';
import {
  Background,
  ControlButton,
  Controls,
  MarkerType,
  NodeResizer,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import {
  Button,
  ButtonGroup,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@terra-symposium/styling/ui/terra-original';
import { ErrorBoundary } from '../ui.js';
import { Handles, SkeletonCard, ZoomControls } from './_chrome.js';

// TYPES
import type {
  Connection,
  EdgeChange,
  EdgeMarkerType,
  EdgeProps,
  Node as XyNode,
  NodeChange,
  NodeProps,
  XYPosition,
} from '@xyflow/react';
import type {
  Edge,
  FlowEdgeData,
  FlowNode,
  NodeData,
  Pos,
} from '../../../lib/terra/runtime/types.js';
import type { GroupNodeData, NodesProps } from '../../../lib/terra/runtime/types.js';
import type { FlowMenuContext } from './menuContext.js';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

const HANDLES: Pos[] = ['top', 'right', 'bottom', 'left'];
const NODE_STYLES = {
  process: 'rounded border-2 border-primary-6 bg-primary-3 p-2 text-primary-12',
  terminator: 'rounded-full border-2 border-secondary-7 bg-secondary-3 px-4 py-2 text-secondary-11',
  decision:
    'rounded border-2 border-dashed border-yellow-700 bg-yellow-300 p-2 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-100',
  data: '-skew-x-12 border-2 border-gray-7 bg-gray-3 p-2 text-gray-11',
  origin:
    'rounded-full border-2 border-green-300 bg-green-100 px-4 py-2 font-bold text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100',
  terminal:
    'rounded-full border-2 border-red-300 bg-red-100 px-4 py-2 font-bold text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100',
} as const;
const NODE_CLASS = {
  attribute: 'break-words text-right opacity-70',
  selected: 'ring-2 ring-red-500 ring-offset-2 ring-offset-transparent',
} as const;

// prettier-ignore
const NODE_CFG: Record<keyof typeof NODE_TYPES, ({
    label: string;
    Icon: import('react').ComponentType<{
        className?: string;
    }>;
    colorCls: string;
})> = {
	data: { label: 'Data', Icon: DataIcon, colorCls: 'text-gray-11' },
	decision: { label: 'Decision', Icon: DecisionIcon, colorCls: 'text-yellow-600' },
	erd: { label: 'ERD', Icon: ErdIcon, colorCls: 'text-primary-11' },
	group: { label: 'Container', Icon: GroupIcon, colorCls: 'text-primary-11' },
	note: { label: 'Sticky note', Icon: NoteIcon, colorCls: 'text-gray-11' },
	origin: { label: 'Origin', Icon: OriginIcon, colorCls: 'text-green-600' },
	process: { label: 'Process', Icon: ProcessIcon, colorCls: 'text-primary-11' },
	terminal: { label: 'Terminal', Icon: TerminalIcon, colorCls: 'text-red-600' },
	terminator: { label: 'Terminator', Icon: TerminatorIcon, colorCls: 'text-secondary-11' },
};
const trace = createTrace('AUTHORING:Nodes', true);

// prettier-ignore
const NODE_MENUS = {
	align: [
	{ label: 'Align horizontal left', Icon: AlignHorizontalLeftIcon, val: 'left' as const },
	{ label: 'Align horizontal center', Icon: AlignHorizontalCenterIcon, val: 'center' as const },
	{ label: 'Align horizontal right', Icon: AlignHorizontalRightIcon, val: 'right' as const },
	{ label: 'sep', val: 'sep1' as const },
	{ label: 'Align vertical top', Icon: AlignVerticalTopIcon, val: 'top' as const },
	{ label: 'Align vertical center', Icon: AlignVerticalCenterIcon, val: 'middle' as const },
	{ label: 'Align vertical bottom', Icon: AlignVerticalBottomIcon, val: 'bottom' as const },
],

	// prettier-ignore
	distribute: [
	{ label: 'Distribute horizontal left', Icon: DistributeHorizontalLeftIcon, val: 'horizontal-left' },
	{ label: 'Distribute horizontal center', Icon: DistributeHorizontalCenterIcon, val: 'horizontal-center' },
	{ label: 'Distribute horizontal right', Icon: DistributeHorizontalRightIcon, val: 'horizontal-right' },
	{ label: 'sep', val: 'sep2' },
	{ label: 'Distribute vertical top', Icon: DistributeVerticalTopIcon, val: 'vertical-top' },
	{ label: 'Distribute vertical center', Icon: DistributeVerticalCenterIcon, val: 'vertical-center' },
	{ label: 'Distribute vertical bottom', Icon: DistributeVerticalBottomIcon, val: 'vertical-bottom' },
],

	// prettier-ignore
	edges: [
	{ label: 'Solid Line', val: 'solid' as const },
	{ label: 'Dashed Line', val: 'dashed' as const, dash: '4 2' },
	{ label: 'Dotted Line', val: 'dotted' as const, dash: '1 3', cap: 'round' as const },
],
};
const MENU_CLASS = {
  content: 'min-w-40 !border-primary-6 p-1',
  icon: 'mr-2',
  subContent: 'min-w-64 !border-primary-6 p-1',
} as const;

/*//////////////////////////////////////////////////
NODE TYPES
//////////////////////////////////////////////////*/

/**
 * Renders the container node used to group related flowchart nodes.
 *
 * @param props - Flow node props.
 * @param data - Group node data and resize hooks.
 * @param selected - Boolean flag controlling group node's selected behaviour.
 *
 * @return Resizable group frame, title bar, and group handles.
 */
export function GroupNode({ data, selected }: NodeProps<XyNode<GroupNodeData>>): React.JSX.Element {
  return (
    <ErrorBoundary name="GroupNode">
      <NodeResizer
        color="#ef4444"
        isVisible={selected && data.editable === true}
        minWidth={160}
        minHeight={100}
        onResizeEnd={(_e, p): void => {
          if (data.id) data.onResizeEnd?.(data.id, p);
        }}
      />
      <div
        className={cn(
          'size-full text-primary-11 transition-all',
          selected && `rounded-lg ${NODE_CLASS.selected}`,
          data.isDragTarget && 'ring-dashed rounded-lg bg-primary-3/20 ring-2 ring-primary-6',
        )}
      >
        <div className="border-b border-primary-6 pb-2 text-lg font-bold text-primary-12">
          {data.title}
        </div>
        <Handles editable={data.editable === true} {...data.requiredHandles} />
      </div>
    </ErrorBoundary>
  );
}

/**
 * Creates a higher-order flowchart node renderer with specified styling.
 *
 * @param className - CSS classes applied to the shell container.
 * @param inner - CSS classes applied to the text wrapper.
 *
 * @return Flowchart node component.
 */
function createNode(
  className: string,
  inner?: string,
): (props: NodeProps<XyNode<NodeData>>) => React.JSX.Element {
  return function NodeCard({ data, selected }: NodeProps<XyNode<NodeData>>): React.JSX.Element {
    const Element = data.onClick ? 'button' : data.href ? 'a' : 'div';
    return (
      <Element
        {...(Element === 'button' ? { type: 'button' } : {})}
        {...(Element === 'a' ? { href: data.href } : {})}
        onClick={data.onClick}
        className={cn(
          'relative block min-w-40 text-pretty p-2 text-center text-sm font-normal !no-underline shadow-md transition-shadow',
          selected && 'ring-2 ring-red-500 ring-offset-2 ring-offset-transparent',
          className,
        )}
      >
        <Handles
          editable={data.editable === true}
          sources={data.requiredHandles?.sources ?? []}
          tgts={data.requiredHandles?.tgts ?? []}
        />
        <span className={inner}>{data.title}</span>
      </Element>
    );
  };
}

/**
 * Renders a sticky-note style node in the flowchart.
 *
 * @param props - Flow node props.
 * @param id - Unique clipping mask identifier.
 * @param data - Sticky note text and resize hooks.
 * @param selected - Boolean flag controlling note node's selected behaviour.
 *
 * @return Sticky note styled container.
 */
export function NoteNode({
  id,
  data,
  selected,
}: NodeProps<XyNode<GroupNodeData>>): React.JSX.Element {
  return (
    <ErrorBoundary name="NoteNode">
      <NodeResizer
        color="#ef4444"
        isVisible={selected && data.editable === true}
        minWidth={128}
        minHeight={128}
        onResizeEnd={(_e, p): void => {
          if (data.id) data.onResizeEnd?.(data.id, p);
        }}
      />
      <div
        className={cn(
          "relative size-full min-h-32 min-w-32 before:absolute before:left-[5px] before:top-[30%] before:h-3/4 before:w-[90%] before:bg-black/25 before:shadow-[rgba(0,0,0,0.5)_-2px_2px_15px] before:content-['']",
          selected && NODE_CLASS.selected,
        )}
      >
        <svg width="0" height="0" className="absolute">
          <defs>
            <clipPath id={`sticky-${id}`} clipPathUnits="objectBoundingBox">
              <path d="M 1 0 Q 1 0.69, 0.97 0.96 0.97 0.96, 0 0.96 Q 0.04 0.69, 0.04 0 0.04 0, 1 0" />
            </clipPath>
          </defs>
        </svg>
        <div
          className="relative flex size-full min-h-32 min-w-32 items-center justify-center bg-yellow-300 p-5 pt-3 text-center text-sm font-normal text-yellow-950 shadow-md"
          style={{ clipPath: `url(#sticky-${id})` }}
        >
          {data.title}
        </div>
      </div>
    </ErrorBoundary>
  );
}
export const NODE_TYPES = {
  erd: function ErdNode({ data, selected }: NodeProps<XyNode<NodeData>>): React.JSX.Element {
    const compact = data.compact === true;
    const Element = data.onClick ? 'button' : data.href ? 'a' : 'div';
    return (
      <Element
        type={Element === 'button' ? 'button' : undefined}
        href={Element === 'a' ? data.href : undefined}
        onClick={data.onClick}
        className={cn(
          'block max-h-96 w-full overflow-y-scroll rounded-md border-2 border-primary-6 bg-primary-2 text-primary-12 !no-underline shadow-lg transition-shadow',
          compact ? 'text-xs' : 'text-sm',
          selected && NODE_CLASS.selected,
        )}
      >
        <div
          className={cn(
            'border-b-2 border-primary-6 bg-primary-3 text-center font-bold text-primary-12',
            compact ? 'px-2 py-0.5 text-sm' : 'px-3 py-2 text-lg',
          )}
        >
          {data.title}
        </div>
        {data.attributes && data.attributes.length > 0 && (
          <ul className={cn('my-0', compact ? 'gap-y-0.5 p-0.5 px-1.5' : 'p-2')}>
            {data.attributes.map((a) => (
              <li
                key={a.name}
                className={cn(
                  'grid grid-cols-[auto,1fr] font-mono',
                  compact ? 'my-0 gap-x-2 leading-tight' : 'gap-x-3 gap-y-0',
                )}
              >
                <span className="shrink-0">{a.name}</span>
                {(() => {
                  const inlineMath = a.type.match(/^\$(?!\$)([\s\S]+)\$$/);
                  const displayMath = a.type.match(/^\$\$([\s\S]+)\$\$$/);
                  if (!inlineMath && !displayMath)
                    return <span className={NODE_CLASS.attribute}>{a.type}</span>;
                  return (
                    <span
                      className={`${NODE_CLASS.attribute} [&_.katex-display]:m-0 [&_.katex]:text-inherit`}
                      dangerouslySetInnerHTML={{
                        __html: katex.renderToString(
                          (displayMath?.[1] ?? inlineMath?.[1] ?? '').trim(),
                          {
                            displayMode: Boolean(displayMath),
                            throwOnError: false,
                            strict: 'ignore',
                          },
                        ),
                      }}
                    />
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
        <Handles
          editable={data.editable === true}
          sources={data.requiredHandles?.sources ?? []}
          tgts={data.requiredHandles?.tgts ?? []}
        />
      </Element>
    );
  },
  process: createNode(NODE_STYLES.process),
  terminator: createNode(NODE_STYLES.terminator),
  origin: createNode(NODE_STYLES.origin),
  terminal: createNode(NODE_STYLES.terminal),
  decision: createNode(NODE_STYLES.decision),
  data: createNode(NODE_STYLES.data, 'block skew-x-12'),
  note: NoteNode,
  group: GroupNode,
};

/*//////////////////////////////////////////////////
CANVAS
//////////////////////////////////////////////////*/

/**
 * Synchronises _node and edge state with layout and handle metadata.
 *
 * @param v - Flow nodes to sync.
 * @param r - Flow edges to sync.
 * @param dir - Whether nodes rank top-to-bottom (`TB`) or left-to-right (`LR`).
 * @param proximityConnect - Connection rule that lets nearby graph nodes link automatically in sync graph.
 * @param editable - Editability flag controlling whether sync graph accepts changes.
 * @param arcControls - Arc controls input supplied to sync graph's operation.
 * @param onResizeEnd - Callback fired after a group node resize is committed.
 *
 * @return Node and edge arrays after layout, handle assignment, and grouping metadata are applied.
 *
 * @remarks
 * This centralises the derived handle logic so the component tree stays thin.
 */
function syncGraph(
  v: FlowNode[],
  r: Edge[],
  dir: 'TB' | 'LR',
  proximityConnect: boolean,
  editable: boolean,
  arcControls: boolean,
  onResizeEnd?: (
    id: string,
    params: { x: number; y: number; width: number; height: number },
  ) => void,
): { nodes: FlowNode[]; edges: Edge[] } {
  const sNodes = Array.isArray(v) ? v : [];
  const nodesById = new Map(sNodes.map((_node) => [_node.id, _node]));
  const handlesByNodeId = new Map<string, { sources: Set<Pos>; tgts: Set<Pos> }>();
  const syncedGraph = {
    edges: (Array.isArray(r) ? r : [])
      .filter((_e) => nodesById.has(_e.source) && nodesById.has(_e.target))
      .map((e) => {
        const edgeData: FlowEdgeData = e.data ?? {};
        const l = isRec(e) ? (e as Record<string, unknown>) : {};
        const arrowHead = edgeData.arrowHead ?? (l['arrowHead'] as boolean) ?? false;
        const srcOverride = edgeData.srcHandleOverride ?? (l['srcHandleOverride'] as Pos);
        const tgtOverride = edgeData.tgtHandleOverride ?? (l['tgtHandleOverride'] as Pos);
        const strokeStyle = edgeData.strokeStyle ?? 'solid';
        const markerEnd: EdgeMarkerType | undefined = arrowHead
          ? { type: MarkerType.ArrowClosed, width: 20, height: 20 }
          : undefined;
        let srcHandle: string;
        let tgtHandle: string;
        if (arcControls) {
          // Arc nodes use named ports, not the positional ports used by docs flowcharts.
          srcHandle =
            e.sourceHandle && !HANDLES.includes(e.sourceHandle as Pos) ? e.sourceHandle : 'default';
          tgtHandle = 'inbound';
        } else if (proximityConnect) {
          const dx =
            (nodesById.get(e.target)!.position?.x ?? 0) -
            (nodesById.get(e.source)!.position?.x ?? 0);
          const dy =
            (nodesById.get(e.target)!.position?.y ?? 0) -
            (nodesById.get(e.source)!.position?.y ?? 0);
          const horizontal = Math.abs(dx) > Math.abs(dy);
          srcHandle = horizontal ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
          tgtHandle = horizontal ? (dx > 0 ? 'left' : 'right') : dy > 0 ? 'top' : 'bottom';
        } else if (!proximityConnect && dir === 'TB') {
          srcHandle = srcOverride ?? 'bottom';
          tgtHandle = tgtOverride ?? 'top';
        } else {
          srcHandle = srcOverride ?? (dir === 'LR' ? 'right' : 'bottom');
          tgtHandle = tgtOverride ?? (dir === 'LR' ? 'left' : 'top');
        }
        if (!arcControls) {
          if (!handlesByNodeId.has(e.source))
            handlesByNodeId.set(e.source, { sources: new Set(), tgts: new Set() });
          if (!handlesByNodeId.has(e.target))
            handlesByNodeId.set(e.target, { sources: new Set(), tgts: new Set() });
          handlesByNodeId.get(e.source)!.sources.add(srcHandle as Pos);
          handlesByNodeId.get(e.target)!.tgts.add(tgtHandle as Pos);
        }
        const updatedEdge: Edge = {
          ...e,
          data: {
            ...edgeData,
            arrowHead,
            srcHandleOverride: srcOverride,
            tgtHandleOverride: tgtOverride,
            strokeStyle,
          },
          sourceHandle: srcHandle,
          targetHandle: tgtHandle,
          style: {
            ...e.style,
            strokeDasharray:
              strokeStyle === 'dashed' ? '5 5' : strokeStyle === 'dotted' ? '2 2' : undefined,
          },
        };
        if (markerEnd) updatedEdge.markerEnd = markerEnd;
        return updatedEdge;
      }),
    nodes: sNodes.map((n) => {
      const handles = handlesByNodeId.get(n.id);
      const resGroupId = getGroupId(n);
      return {
        ...n,
        parentId: undefined, // enforce flat absolute structure globally
        className: cn(
          validateType(['string'], n.className) || Array.isArray(n.className)
            ? n.className
            : undefined,
          n.type === 'group' &&
            'rounded-lg border !border-primary-6 !bg-primary-2 !text-primary-12',
        ),
        zIndex: n.type === 'group' ? -10 : 10,
        nodeOrigin: n.type === 'group' ? [0, 0] : [0.5, 0.5],
        data: {
          ...(n.data && validateType(['object'], n.data) ? n.data : { title: '', attributes: [] }),
          id: n.id,
          editable,
          ...(resGroupId ? { groupId: resGroupId } : {}),
          ...(onResizeEnd ? { onResizeEnd } : {}),
          requiredHandles: {
            sources: editable ? HANDLES : Array.from(handles?.sources ?? []),
            targets: editable ? HANDLES : Array.from(handles?.tgts ?? []),
          },
        },
      };
    }),
  };
  return {
    nodes: [
      ...syncedGraph.nodes.filter((n) => n.type === 'group'),
      ...syncedGraph.nodes.filter((n) => n.type !== 'group'),
    ],
    edges: syncedGraph.edges,
  };
}

const FLOW_COMPONENTS = {
  nodeTypes: NODE_TYPES,
  /**
   * Renders the interactive flow canvas and context menus for n editing, grouping, and layout.
   *
   * @param props - Flow nodes and edges, node/edge renderers, graph callbacks, context-menu actions, and canvas display options.
   * @param _onEdgeDoubleClick - Edge double-click handler.
   * @param nodeTypes - Node renderer map that draws graph nodes in canvas.
   * @param edgeTypes - Edge renderer map that draws graph connections in canvas.
   * @param nodeLabels - Node label map shown alongside canvas's graph nodes.
   * @param onNodeClick - Callback invoked when a user selects a node in canvas.
   * @param onEdgeDoubleClick - Callback invoked for edge double click.
   * @param onAddContent - Callback invoked for add content.
   * @param lockedTypes - Node types that canvas must keep read-only.
   * @param allowedTypes - Node types that canvas permits users to create.
   * @param onReady - Callback invoked when canvas finishes initialising its graph surface.
   * @param height - Viewport height reserved for canvas's graph surface.
   * @param arcControls - Arc controls input supplied to canvas's operation.
   * @param readyWhenEmpty - Readiness rule that lets canvas finish with no graph nodes.
   * @param flow - Flow graph data rendered into canvas's canvas.
   * @param interactive - Interaction flag that controls whether canvas accepts graph input.
   * @param editable - Editability flag controlling whether canvas accepts changes.
   * @param isFocused - Boolean flag controlling canvas's is focused behaviour.
   * @param onNodesChange - Callback invoked with the updated node changes from canvas.
   * @param onEdgesChange - Callback invoked with the updated edge changes from canvas.
   * @param onConnect - Callback invoked with a new connection created in canvas.
   * @param onAddNode - Callback invoked for add node.
   * @param onGroupNodes - Callback invoked for group nodes.
   * @param onUngroupNodes - Callback invoked for ungroup nodes.
   * @param onDeleteSelected - Callback invoked for delete selected.
   * @param onAlignNodes - Callback invoked for align nodes.
   * @param onDistributeNodes - Callback invoked for distribute nodes.
   * @param onRenameNode - Callback invoked for rename node.
   * @param onChangeNodeType - Callback invoked for change node type.
   * @param onChangeEdgeStyle - Callback invoked for change edge style.
   * @param onDeleteEdge - Callback invoked for delete edge.
   * @param onAutoLayout - Callback invoked for auto layout.
   * @param showBg - Visibility flag for canvas's graph background.
   * @param showCtrls - Visibility flag for canvas's graph controls.
   *
   * @return Interactive React Flow canvas and its context-menu actions.
   *
   * @remarks
   * This component stays intentionally thin and delegates all graph mutation logic to the helper
   * functions above.
   */
  Canvas({
    flow,
    nodeTypes,
    edgeTypes,
    nodeLabels,
    onNodeClick,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onEdgeDoubleClick,
    onAddNode,
    onAddContent,
    lockedTypes,
    allowedTypes,
    onGroupNodes,
    onUngroupNodes,
    onDeleteSelected,
    onAlignNodes,
    onDistributeNodes,
    onRenameNode,
    onChangeNodeType,
    onChangeEdgeStyle,
    onDeleteEdge,
    onAutoLayout,
    onReady,
    interactive,
    editable,
    isFocused,
    height,
    showBg,
    showCtrls,
    arcControls,
    readyWhenEmpty,
  }: {
    flow: { nodes: FlowNode[]; edges: Edge[] };
    nodeTypes: Record<string, React.ComponentType<NodeProps<FlowNode>>>;
    edgeTypes?: Record<string, React.ComponentType<EdgeProps<Edge>>>;
    nodeLabels: Partial<Record<keyof typeof NODE_TYPES, string>>;
    onNodeClick?: (n: FlowNode) => void;
    onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
    onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
    onConnect: (params: Connection) => void;
    onEdgeDoubleClick: (_e: React.MouseEvent, e: Edge) => void;
    onAddNode: (type: keyof typeof NODE_TYPES, position: XYPosition) => void;
    onAddContent?: (position: XYPosition) => void;
    lockedTypes: (keyof typeof NODE_TYPES)[];
    allowedTypes: (keyof typeof NODE_TYPES)[];
    onGroupNodes: (groupNode: FlowNode, selectedNodes: FlowNode[], x: number, y: number) => void;
    onUngroupNodes: (nodes: FlowNode[]) => void;
    onDeleteSelected: (nodes: FlowNode[]) => void;
    onAlignNodes: (
      nodes: FlowNode[],
      alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
    ) => void;
    onDistributeNodes: (nodes: FlowNode[], type: string) => void;
    onRenameNode: (id: string) => void;
    onChangeNodeType: (id: string, type: keyof typeof NODE_TYPES) => void;
    onChangeEdgeStyle: (id: string, style: 'solid' | 'dashed' | 'dotted') => void;
    onDeleteEdge: (id: string) => void;
    onAutoLayout: () => void;
    onReady?: () => void;
    interactive: boolean;
    editable: boolean;
    isFocused: boolean;
    height: number;
    showBg: boolean;
    showCtrls: boolean;
    arcControls: boolean;
    readyWhenEmpty: boolean;
  }): React.JSX.Element {
    // STATES
    const {
      fitView,
      screenToFlowPosition: screenToFlowPos,
      getIntersectingNodes,
      updateNodeData,
      getNodes,
    } = useReactFlow();
    const nodesInit = useNodesInitialized();
    const hasInitialLayout = useRef(false);
    const lastFit = useRef('');
    const lastPos = useRef<{ x: number; y: number } | null>(null);
    const dragTgtGroup = useRef<string | null>(null);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(readyWhenEmpty && flow.nodes.length === 0);
    const notified = useRef(false);
    const [menuCtx, setMenuCtx] = useState<FlowMenuContext>({ type: 'pane', id: null });

    // INIT
    useEffect(() => {
      if (!flow.nodes.length) {
        if (readyWhenEmpty) setReady(true);
        return;
      }
      if (!nodesInit) return;
      const key = `${height}:${flow.nodes.map((_node) => _node.id).join(',')}`;
      if (lastFit.current === key) return;
      const frame = { id: 0 };
      frame.id = requestAnimationFrame(() => {
        lastFit.current = key;
        void fitView({ padding: 0.1 });
        if (!hasInitialLayout.current) {
          hasInitialLayout.current = true;
          setReady(true);
        }
      });
      return () => {
        cancelAnimationFrame(frame.id);
      };
    }, [height, fitView, flow.nodes, nodesInit]);
    useEffect(() => {
      reactFlowWrapper.current?.querySelector('.react-flow.light')?.classList.remove('light');
    }, []);
    useEffect(() => {
      if (!ready || notified.current) return;
      notified.current = true;
      onReady?.();
    }, [onReady, ready]);

    // HELPERS
    const selNodes = flow.nodes.filter((n) => n.selected);
    const nodesMap = React.useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow.nodes]);
    const tgtNode = React.useMemo(
      () => (menuCtx.type === '_node' && menuCtx.id ? nodesMap.get(menuCtx.id) : undefined),
      [nodesMap, menuCtx.type, menuCtx.id],
    );

    /**
     * Checks whether the n is locked.
     *
     * @param n - Value passed to the helper.
     *
     * @returns True when the n is missing or its type is blocked from editing.
     */
    const locked = (n: FlowNode | undefined): boolean => {
      if (!n) {
        logWarn('AuthNodes', 'menu.n-missing', { menuCtx, nodeCount: flow.nodes.length });
        return true;
      }
      return lockedTypes.includes(n.type as keyof typeof NODE_TYPES);
    };
    const isTgtLocked = React.useMemo(() => {
      if (menuCtx.type !== '_node' || menuCtx.id === null) return false;
      if (!tgtNode) {
        logWarn('AuthNodes', 'menu.n-missing', { menuCtx, nodeCount: flow.nodes.length });
        return true;
      }
      return locked(tgtNode);
    }, [flow.nodes.length, lockedTypes, menuCtx, tgtNode]);

    // RENDER
    return (
      <ContextMenu
        onOpenChange={(o) => {
          trace('menu.state', { open: o, context: menuCtx });
        }}
      >
        <ContextMenuTrigger
          asChild
          onContextMenu={(_e) => {
            lastPos.current = { x: _e.clientX, y: _e.clientY };
            trace('menu.open.request', { position: lastPos.current });
          }}
        >
          <div className="relative z-20 size-full" ref={reactFlowWrapper}>
            {!ready && (
              <div
                className="pointer-events-none absolute inset-0 z-10 rounded-md border border-primary-6 bg-primary-1/95"
                aria-label="Loading nodes"
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-8">
                    <SkeletonCard />
                    <SkeletonCard className="translate-x-16 animate-pulse opacity-75" />
                    <SkeletonCard className="-translate-x-12 animate-pulse opacity-50" />
                  </div>
                </div>
              </div>
            )}
            <ReactFlow<FlowNode, Edge>
              nodes={flow.nodes}
              edges={flow.edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgeDoubleClick={onEdgeDoubleClick}
              onNodeContextMenu={(_e, _node) => {
                trace('menu.n', { id: _node.id, type: _node.type });
                setMenuCtx({ type: '_node', id: _node.id });
              }}
              {...(onNodeClick
                ? {
                    onNodeClick: (_e, n) => {
                      onNodeClick(n);
                    },
                  }
                : {})}
              onEdgeContextMenu={(_e, v) => {
                trace('menu.e', { id: v.id });
                setMenuCtx({ type: 'e', id: v.id });
              }}
              onPaneContextMenu={() => {
                trace('menu.pane', { nodeCount: flow.nodes.length, edgeCount: flow.edges.length });
                setMenuCtx({ type: 'pane', id: null });
              }}
              onNodeDrag={(_e, _node, draggedNodes) => {
                if (!editable) return;
                const primaryNode = draggedNodes[0] || _node;
                if (primaryNode.type === 'group') return;
                const groupId =
                  getIntersectingNodes(primaryNode).find((n) => n.type === 'group')?.id ?? null;
                if (groupId !== dragTgtGroup.current) {
                  if (dragTgtGroup.current)
                    updateNodeData(dragTgtGroup.current, { isDragTarget: false });
                  if (groupId) updateNodeData(groupId, { isDragTarget: true });
                  dragTgtGroup.current = groupId;
                }
              }}
              onNodeDragStop={(_e, _node, draggedNodes) => {
                if (!editable) return;
                if (dragTgtGroup.current) {
                  const tgtGroupId = dragTgtGroup.current;
                  updateNodeData(tgtGroupId, { isDragTarget: false });
                  dragTgtGroup.current = null;
                  const groupNode = getNodes().find((n) => n.id === tgtGroupId);
                  const nodesToGroup = draggedNodes.filter(
                    (n) => n.type !== 'group' && n.id !== tgtGroupId,
                  );
                  if (groupNode && nodesToGroup.length > 0)
                    onGroupNodes(
                      groupNode as FlowNode,
                      nodesToGroup,
                      groupNode.position.x,
                      groupNode.position.y,
                    );
                } else {
                  const nodesToUngroup = draggedNodes.filter(
                    (n) => getGroupId(n) && n.type !== 'group',
                  );
                  if (nodesToUngroup.length > 0) onUngroupNodes(nodesToUngroup);
                }
              }}
              nodeTypes={nodeTypes}
              {...(edgeTypes ? { edgeTypes: edgeTypes as never } : {})}
              fitView
              minZoom={0.1}
              zoomOnScroll={false}
              panOnScroll={isFocused}
              zoomOnPinch={true}
              preventScrolling={false}
              nodesDraggable={interactive || editable}
              nodesConnectable={editable}
              elementsSelectable={true}
              panOnDrag={false}
              selectionOnDrag={true}
              elevateNodesOnSelect={false}
            >
              {showBg && <Background />}
              {showCtrls && arcControls ? (
                <>
                  <Controls
                    position="top-left"
                    showFitView={false}
                    showInteractive={false}
                    showZoom={false}
                  >
                    <ButtonGroup>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled
                        aria-label="Undo"
                        title="Undo"
                      >
                        <UndoIcon aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled
                        aria-label="Redo"
                        title="Redo"
                      >
                        <RedoIcon aria-hidden="true" />
                      </Button>
                    </ButtonGroup>
                  </Controls>
                  <Controls
                    position="top-right"
                    showFitView={false}
                    showInteractive={false}
                    showZoom={false}
                  >
                    <ButtonGroup>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Arrange nodes"
                        title="Arrange nodes"
                        onClick={onAutoLayout}
                      >
                        <WandIcon aria-hidden="true" />
                      </Button>
                    </ButtonGroup>
                  </Controls>
                  <ZoomControls position="bottom-right" />
                </>
              ) : (
                showCtrls && (
                  <Controls
                    position="bottom-left"
                    showInteractive={false}
                    className="!m-3 [&_*]:!border-primary-6 [&_*]:!bg-primary-3"
                  >
                    {editable && (
                      <ControlButton
                        aria-label="Auto-layout nodes"
                        title="Auto-layout nodes"
                        onClick={onAutoLayout}
                      >
                        <WandIcon aria-hidden="true" />
                      </ControlButton>
                    )}
                    <ControlButton
                      aria-label="Full screen"
                      title="Full screen"
                      onClick={() =>
                        document.fullscreenElement
                          ? void document.exitFullscreen()
                          : void reactFlowWrapper.current?.requestFullscreen()
                      }
                    >
                      <MaximizeIcon aria-hidden="true" />
                    </ControlButton>
                  </Controls>
                )
              )}
            </ReactFlow>
          </div>
        </ContextMenuTrigger>
        {editable && (
          <ContextMenuContent className={MENU_CLASS.content}>
            {selNodes.length > 1 ? (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Align</ContextMenuSubTrigger>
                  <ContextMenuSubContent className={MENU_CLASS.subContent}>
                    {NODE_MENUS.align.map((m) =>
                      m.label === 'sep' ? (
                        <ContextMenuSeparator key={m.val} />
                      ) : (
                        <ContextMenuItem
                          key={m.val}
                          onClick={() => {
                            onAlignNodes(
                              selNodes,
                              m.val as 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
                            );
                          }}
                        >
                          {m.Icon && <m.Icon className={MENU_CLASS.icon} />} {m.label}
                        </ContextMenuItem>
                      ),
                    )}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                {selNodes.length > 2 && (
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>Distribute</ContextMenuSubTrigger>
                    <ContextMenuSubContent className={MENU_CLASS.subContent}>
                      {NODE_MENUS.distribute.map((m) =>
                        m.label === 'sep' ? (
                          <ContextMenuSeparator key={m.val} />
                        ) : (
                          <ContextMenuItem
                            key={m.val}
                            onClick={() => {
                              onDistributeNodes(selNodes, m.val);
                            }}
                          >
                            {m.Icon && <m.Icon className={MENU_CLASS.icon} />} {m.label}
                          </ContextMenuItem>
                        ),
                      )}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="cursor-pointer focus:!bg-primary-3 focus:!text-primary-12"
                  onClick={() => {
                    const minX = Math.min(
                      ...selNodes.map((n) => n.position.x - getNodeSize(n).w / 2),
                    );
                    const minY = Math.min(
                      ...selNodes.map((n) => n.position.y - getNodeSize(n).h / 2),
                    );
                    const padding = 40;
                    const gWidth =
                      Math.max(...selNodes.map((n) => n.position.x + getNodeSize(n).w / 2)) -
                      minX +
                      padding * 2;
                    const gHeight =
                      Math.max(...selNodes.map((n) => n.position.y + getNodeSize(n).h / 2)) -
                      minY +
                      padding * 2;
                    const gX = minX - padding + gWidth / 2;
                    const gY = minY - padding + gHeight / 2;
                    onGroupNodes(
                      {
                        id: `group-${Date.now().toString(36)}`,
                        type: 'group',
                        position: { x: gX, y: gY },
                        style: { width: gWidth, height: gHeight },
                        data: { attributes: [], customPosition: { x: gX, y: gY }, title: 'Group' },
                      },
                      selNodes,
                      gX,
                      gY,
                    );
                  }}
                >
                  <GroupIcon className={MENU_CLASS.icon} /> Create Group
                </ContextMenuItem>
                <ContextMenuItem
                  intent="destructive"
                  onClick={() => {
                    onDeleteSelected(selNodes.filter((n) => !locked(n)));
                  }}
                  disabled={selNodes.every(locked)}
                >
                  <TrashIcon className={MENU_CLASS.icon} /> Delete Selected
                </ContextMenuItem>
              </>
            ) : menuCtx.type === '_node' && menuCtx.id ? (
              <>
                <ContextMenuItem
                  disabled={isTgtLocked}
                  onClick={() => {
                    onRenameNode(menuCtx.id!);
                  }}
                >
                  <EditIcon className={MENU_CLASS.icon} /> Rename Node
                </ContextMenuItem>
                <ContextMenuSub>
                  <ContextMenuSubTrigger disabled={isTgtLocked}>
                    <TypeIcon className={MENU_CLASS.icon} /> Change Type
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className={MENU_CLASS.content}>
                    {allowedTypes.map((t) => {
                      const { Icon, label, colorCls } = NODE_CFG[t];
                      return (
                        <ContextMenuItem
                          key={t}
                          disabled={isTgtLocked}
                          onClick={() => {
                            onChangeNodeType(menuCtx.id!, t);
                          }}
                        >
                          <Icon className={cn('size-4 shrink-0', colorCls)} />
                          <span>{nodeLabels[t] || label}</span>
                        </ContextMenuItem>
                      );
                    })}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={isTgtLocked}
                  intent="destructive"
                  onClick={() => tgtNode && onDeleteSelected([tgtNode])}
                >
                  <TrashIcon className={MENU_CLASS.icon} /> Delete Node
                </ContextMenuItem>
              </>
            ) : menuCtx.type === 'e' && menuCtx.id ? (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <TypeIcon className={MENU_CLASS.icon} /> Change Style
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className={MENU_CLASS.content}>
                    {NODE_MENUS.edges.map((m) => (
                      <ContextMenuItem
                        key={m.val}
                        onClick={() => {
                          onChangeEdgeStyle(menuCtx.id!, m.val);
                        }}
                      >
                        <svg
                          className="size-4 shrink-0 text-primary-11"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeDasharray={m.dash}
                          strokeLinecap={m.cap}
                        >
                          <line x1="0" y1="8" x2="16" y2="8" />
                        </svg>
                        <span>{m.label}</span>
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem
                  intent="destructive"
                  onClick={() => {
                    onDeleteEdge(menuCtx.id!);
                  }}
                >
                  <TrashIcon className={MENU_CLASS.icon} /> Delete Edge
                </ContextMenuItem>
              </>
            ) : menuCtx.type === 'pane' ? (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <TypeIcon className={MENU_CLASS.icon} /> Add Node
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className={MENU_CLASS.content}>
                  {allowedTypes.map((t) => {
                    const { Icon, label, colorCls } = NODE_CFG[t];
                    return (
                      <ContextMenuItem
                        key={t}
                        onClick={() => {
                          try {
                            if (!lastPos.current) {
                              logWarn('AuthNodes', 'menu.add.missing-position', { type: t });
                              return;
                            }
                            const pos = screenToFlowPos(lastPos.current);
                            trace('menu.add', { type: t, position: pos });
                            if (t === 'process' && onAddContent) onAddContent(pos);
                            else onAddNode(t, pos);
                          } catch (err: unknown) {
                            errorLog('AuthNodes', `menu.add.failed: ${t}`, {
                              error: err instanceof Error ? err.message : String(err),
                            });
                          }
                        }}
                      >
                        <Icon className={cn('size-4 shrink-0', colorCls)} />
                        <span>{nodeLabels[t] || label}</span>
                      </ContextMenuItem>
                    );
                  })}
                </ContextMenuSubContent>
              </ContextMenuSub>
            ) : null}
          </ContextMenuContent>
        )}
      </ContextMenu>
    );
  },
};

/*//////////////////////////////////////////////////
COMPONENT
//////////////////////////////////////////////////*/

/**
 * Renders the flow editor wrapper used by docs diagrams.
 *
 * @param props - Initial nodes and edges, layout configuration, interactions, change callbacks, and display settings for the problem graph.
 * @param className - Extra classes applied to the outer flow wrapper.
 * @param onCommit - Callback that receives the fully normalised flow after each change.
 * @param nodes - Graph nodes rendered and updated by nodes.
 * @param edges - Graph connections rendered and updated by nodes.
 * @param nodeSep - Horizontal gap between graph nodes in nodes.
 * @param rankSep - Vertical gap between graph ranks in nodes.
 * @param height - Viewport height reserved for nodes's graph surface.
 * @param onAddContent - Callback invoked for add content.
 * @param onNodeClick - Callback invoked when a user selects a node in nodes.
 * @param nodeTypes - Node renderer map that draws graph nodes in nodes.
 * @param nodeLabels - Node label map shown alongside nodes's graph nodes.
 * @param lockedTypes - Node types that nodes must keep read-only.
 * @param allowedTypes - Node types that nodes permits users to create.
 * @param disabled - Disabled state controlling whether nodes accepts interaction.
 * @param clipboardKey - Clipboard key that enables graph copy and paste in nodes.
 * @param arcControls - Arc controls input supplied to nodes's operation.
 * @param edgeTypes - Edge renderer map that draws graph connections in nodes.
 * @param readyWhenEmpty - Readiness rule that lets nodes finish with no graph nodes.
 * @param onReady - Callback invoked when nodes finishes initialising its graph surface.
 * @param style - Inline style values merged into nodes.
 * @param rest - Rest input supplied to nodes's operation.
 * @param direction - Layout direction that arranges nodes's graph.
 * @param interactive - Interaction flag that controls whether nodes accepts graph input.
 * @param editable - Editability flag controlling whether nodes accepts changes.
 * @param proximityConnect - Connection rule that lets nearby graph nodes link automatically in nodes.
 * @param showBg - Visibility flag for nodes's graph background.
 * @param showCtrls - Visibility flag for nodes's graph controls.
 *
 * @return Docs flow editor wrapper with derived height, toolbar controls, and drag state.
 *
 * @remarks
 * This is the public entrypoint; the rest of the file exists to keep the canvas state manageable.
 */
export default function Nodes({
  nodes: initialNodes = [],
  edges: initialEdges = [],
  className,
  direction: dir = 'TB',
  nodeSep = 50,
  rankSep = 5,
  proximityConnect = false,
  interactive = false,
  height,
  onCommit,
  onAddContent,
  onNodeClick,
  nodeTypes: customNodeTypes = {},
  nodeLabels = {},
  lockedTypes = [],
  allowedTypes = Object.keys(NODE_TYPES) as (keyof typeof NODE_TYPES)[],
  editable = false,
  disabled = !editable,
  clipboardKey = editable ? 'terra.flow.docs' : undefined,
  showBg = true,
  showCtrls = true,
  arcControls = false,
  edgeTypes,
  readyWhenEmpty = true,
  onReady,
  style,
  ...rest
}: NodesProps): React.JSX.Element {
  // STATES
  const [graph, setGraph] = useState<{ nodes: FlowNode[]; edges: Edge[] }>({
    nodes: initialNodes,
    edges: initialEdges,
  });
  const [flow, setFlow] = useState<{ nodes: FlowNode[]; edges: Edge[] }>({ nodes: [], edges: [] });
  const [isFocused, setIsFocused] = useState(false);
  const [internalHeight, setInternalHeight] = useState(384);
  const graphRef = useRef(graph);
  const flowRef = useRef(flow);
  const permitted = editable && !disabled;
  const fns = useRef({ onCommit, onAddContent });
  fns.current = { onCommit, onAddContent };

  // INIT
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);
  useEffect(() => {
    flowRef.current = flow;
  }, [flow]);

  // HELPERS
  const writeGraph = useCallback(
    (
      v:
        | { nodes: FlowNode[]; edges: Edge[] }
        | ((curr: { nodes: FlowNode[]; edges: Edge[] }) => { nodes: FlowNode[]; edges: Edge[] }),
      c = true,
    ) => {
      const n = typeof v === 'function' ? v(graphRef.current) : v;
      graphRef.current = n;
      setGraph(n);
      if (c) fns.current.onCommit?.(n);
    },
    [],
  );
  useEditor({
    adapter: {
      ...(clipboardKey ? { clipboardKey } : {}),
      cloneNode: (n, id) => ({
        ...n,
        id,
        data: {
          ...n.data,
          ...(typeof (n.data as { graphKey?: unknown }).graphKey === 'string'
            ? { graphKey: id }
            : {}),
        },
      }),
      editableNode: (n) => !lockedTypes.includes(n.type as keyof typeof NODE_TYPES),
      read: flow,
      write: useCallback(
        (n: { nodes: FlowNode[]; edges: Edge[] }): void => {
          flowRef.current = n;
          setFlow(n);
          writeGraph((c) => {
            const currEntities = {
              nodes: new Map(c.nodes.map((i) => [i.id, i])),
              edges: new Map(c.edges.map((i) => [i.id, i])),
            };
            return {
              nodes: n.nodes.map((n) => {
                const {
                  editable: _,
                  groupId: __,
                  id: ___,
                  isDragTarget: ____,
                  onResizeEnd: _____,
                  requiredHandles: ______,
                  ...data
                } = n.data;
                return {
                  ...currEntities.nodes.get(n.id),
                  id: n.id,
                  type: n.type,
                  position: n.position,
                  style: n.style,
                  data,
                };
              }),
              edges: n.edges.map((e) => {
                return {
                  ...currEntities.edges.get(e.id),
                  id: e.id,
                  source: e.source,
                  target: e.target,
                  sourceHandle: e.sourceHandle,
                  targetHandle: e.targetHandle,
                  label: e.label,
                  data: e.data,
                };
              }),
            };
          });
        },
        [writeGraph],
      ),
    },
    disabled,
  });
  const handleResizeEnd = useCallback(
    (i: string, p: { x: number; y: number; width: number; height: number }) => {
      writeGraph((c) => ({
        ...c,
        nodes: c.nodes.map((n) =>
          n.id === i
            ? {
                ...n,
                position: { x: p.x, y: p.y },
                style: { ...n.style, width: p.width, height: p.height },
                data: { ...n.data, customPosition: { x: p.x, y: p.y } },
              }
            : n,
        ),
      }));
    },
    [writeGraph],
  );

  // prettier-ignore
  useEffect(() => {
		const { positionedNodes, graphHeight } = layoutGraph<FlowNode>(graph.nodes, graph.edges, dir, nodeSep, rankSep, {
						getSize: node =>
				getNodeSize(
					node,
					{ width: 175, height: 60, groupWidth: 160, groupHeight: 100, erdWidth: 224, erdHeight: 60 },
					n => {
						if (n.type !== 'erd') return;
						const attrs = n.data && validateType(['object'], n.data) && 'attributes' in n.data ? (n.data as { attributes?: unknown[] }).attributes : undefined;
						return 60 + (Array.isArray(attrs) ? attrs.length : 0) * 20;
					},
				),
			getGroupId,
			getCustomPosition: getCustomPos,
						registerNode: (graph, node, size) => {
				if (node.type === 'group') graph.setNode(node.id, { paddingLeft: 40, paddingRight: 40, paddingTop: 60, paddingBottom: 40 });
				else graph.setNode(node.id, { width: size.w, height: size.h });
			},
						placeNode: (node, dagreNode) => {
				const persisted = getCustomPos(node);
				if (node.type === 'group') {
					const calcW = dagreNode?.width ?? 200;
					const calcH = dagreNode?.height ?? 150;
					const w = persisted ? (node.style?.width ?? calcW) : calcW;
					const h = persisted ? (node.style?.height ?? calcH) : calcH;
					return { ...node, position: persisted ?? { x: (/* dagre computes absolute center, NodeResizer forces a top-left origin. Translating natively! */ (dagreNode?.x ?? 0) - (Number(w) / 2)), y: ((dagreNode?.y ?? 0) - (Number(h) / 2)) }, style: { ...node.style, width: w, height: h } };
				}
				return { ...node, position: persisted ?? { x: dagreNode?.x ?? 0, y: dagreNode?.y ?? 0 } };
			},
		});
		if (graphHeight && height === undefined) setInternalHeight(graphHeight + 40);
			const { nodes, edges } = syncGraph(positionedNodes, graph.edges, dir, proximityConnect, permitted, arcControls, handleResizeEnd);
		const nFlow = { edges, nodes, selectedById: new Map(flowRef.current.nodes.filter(n => n.selected).map(n => [n.id, true])) };
		setFlow({ nodes: nFlow.nodes.map(n => ({ ...n, selected: nFlow.selectedById.get(n.id) ?? false })), edges: nFlow.edges });
	}, [graph, dir, nodeSep, rankSep, proximityConnect, permitted, arcControls, height, handleResizeEnd]);
  useEffect(() => {
    writeGraph({ nodes: initialNodes, edges: initialEdges }, false);
  }, [initialNodes, initialEdges, writeGraph]);

  // HELPERS

  // RENDER
  return (
    <ErrorBoundary name="Nodes">
      <div
        {...rest}
        style={{ height: height ?? internalHeight, ...style }}
        className={cn(
          'docs-flow size-full overflow-hidden rounded-md border border-primary-6',
          interactive && 'scrim-primary-1 scrim-20',
          className,
        )}
        tabIndex={rest.tabIndex ?? 0}
        onFocus={(e) => {
          setIsFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          rest.onBlur?.(e);
        }}
      >
        <ReactFlowProvider>
          <FLOW_COMPONENTS.Canvas
            flow={flow}
            nodeTypes={
              { ...FLOW_COMPONENTS.nodeTypes, ...customNodeTypes } as unknown as Record<
                string,
                React.ComponentType<NodeProps<FlowNode>>
              >
            }
            {...(edgeTypes ? { edgeTypes } : {})}
            nodeLabels={nodeLabels}
            onNodeClick={onNodeClick}
            onNodesChange={
              /* prettier-ignore */ useCallback((r: NodeChange[]) => {
		const typedChanges = r as NodeChange<FlowNode>[];
		const nodeChanges = { byId: new Map(flowRef.current.nodes.map(n => [n.id, n])), positionIds: new Set(typedChanges.filter(c => c.type === 'position').map(c => c.id)) };
		const childrenByGroupMap = new Map<string, FlowNode[]>();
		flowRef.current.nodes.forEach(n => {
			const gId = getGroupId(n);
			if (gId) {
				const children = childrenByGroupMap.get(gId) ?? [];
				children.push(n);
				childrenByGroupMap.set(gId, children);
			}
		});
		const extraChanges: NodeChange<FlowNode>[] = [];
		typedChanges.forEach(v => {
			if (v.type === 'position') {
				const n = nodeChanges.byId.get(v.id);
				if (n && n.type === 'group') {
					(childrenByGroupMap.get(n.id) ?? []).forEach(c => {
						if (!nodeChanges.positionIds.has(c.id)) {
							const childChange: NodeChange<FlowNode> = { type: 'position', id: c.id };
							if (v.position) {
								childChange.position = { x: c.position.x + (v.position.x - n.position.x), y: c.position.y + (v.position.y - n.position.y) };
							}
							if (v.dragging !== undefined) childChange.dragging = v.dragging;
							if (childChange.position || childChange.dragging !== undefined) extraChanges.push(childChange);
						}
					});
				}
			}
		});
		const allChanges = [...typedChanges, ...extraChanges];
		const isDragFinished = editable && allChanges.some(c => c.type === 'position' && c.dragging === false);
		const hasRemoval = editable && allChanges.some(c => c.type === 'remove');
		const nNodes = applyNodeChanges<FlowNode>(allChanges, flowRef.current.nodes);
		let fNodes = nNodes;
		let fEdges = flowRef.current.edges;
		if (proximityConnect || isDragFinished) {
			const synced = syncGraph(nNodes, flowRef.current.edges, dir, proximityConnect, editable, arcControls, handleResizeEnd);
			fNodes = synced.nodes;
			fEdges = synced.edges;
		}
		setFlow({ nodes: fNodes, edges: fEdges });
		flowRef.current = { nodes: fNodes, edges: fEdges };
		if (isDragFinished || hasRemoval) {
			writeGraph(v => {
				let nNodes = v.nodes;
				const nodeUpdates = {
					removedIds: hasRemoval ? new Set(allChanges.filter(c => c.type === 'remove').map(c => (c as { id: string }).id)) : undefined,
					draggedById: isDragFinished ? new Map(fNodes.map(n => [n.id, n])) : undefined,
				};
				if (hasRemoval) {
					nNodes = nNodes.filter(n => !nodeUpdates.removedIds?.has(n.id));
				}
				if (isDragFinished) {
					nNodes = nNodes.map(n => {
						const dragged = nodeUpdates.draggedById?.get(n.id);
						if (!dragged) return n;
						// use gracefully checked positions to avoid TypeErrors when nodes don't have static initial positions
						const prevPos = n.position;
						if (!prevPos || dragged.position.x !== prevPos.x || dragged.position.y !== prevPos.y) return {...n,position: dragged.position,data: { ...(n.data ?? { title: '', attributes: [] }), customPosition: dragged.position },};
						return n;
					});
				}
				return { ...v, nodes: nNodes };
			});
		}
	}, [dir, proximityConnect, editable, arcControls, handleResizeEnd, writeGraph])
            }
            onEdgesChange={useCallback(
              (v: EdgeChange<Edge>[]) => {
                const nEdges = applyEdgeChanges<Edge>(v, flowRef.current.edges);
                setFlow({ ...flowRef.current, edges: nEdges });
                flowRef.current = { ...flowRef.current, edges: nEdges };
                if (editable && v.some((c) => c.type === 'remove')) {
                  const remEdgeIds = new Set(v.filter((c) => c.type === 'remove').map((c) => c.id));
                  writeGraph((c) => ({
                    ...c,
                    edges: remEdgeIds.size
                      ? c.edges.filter((_e) => !remEdgeIds.has(_e.id))
                      : c.edges,
                  }));
                }
              },
              [editable, writeGraph],
            )}
            onConnect={useCallback(
              (p: Connection) => {
                if (!editable) return;
                writeGraph((c) => ({
                  ...c,
                  edges: [
                    ...c.edges,
                    {
                      id: `_e-${p.source}-${p.target}-${Date.now().toString(36)}`,
                      source: p.source,
                      target: p.target,
                      sourceHandle: p.sourceHandle,
                      targetHandle: p.targetHandle,
                      labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
                      data: {
                        srcHandleOverride: p.sourceHandle as Pos,
                        tgtHandleOverride: p.targetHandle as Pos,
                        arrowHead: true,
                      },
                    },
                  ],
                }));
              },
              [editable, writeGraph],
            )}
            onEdgeDoubleClick={useCallback(
              (_e: React.MouseEvent, r: Edge) => {
                if (!editable) return;
                const nLabel = window.prompt('Enter edge label:', (r.label as string) || '');
                if (nLabel === null) return;
                writeGraph((g) => ({
                  ...g,
                  edges: g.edges.map((e) =>
                    e.id === r.id
                      ? { ...e, label: nLabel, labelBgStyle: { fill: 'white', fillOpacity: 0.8 } }
                      : e,
                  ),
                }));
              },
              [editable, writeGraph],
            )}
            onAddNode={useCallback(
              (t: keyof typeof NODE_TYPES, p: XYPosition) => {
                writeGraph((c) => ({
                  ...c,
                  nodes: [
                    ...c.nodes,
                    {
                      id: `${t}-${Date.now().toString(36)}`,
                      type: t,
                      position: p,
                      data: {
                        attributes: [],
                        customPosition: p,
                        title: `${NODE_CFG[t].label} ${c.nodes.length + 1}`,
                      },
                    },
                  ],
                }));
              },
              [writeGraph],
            )}
            lockedTypes={lockedTypes}
            allowedTypes={allowedTypes}
            onAddContent={fns.current.onAddContent}
            onGroupNodes={useCallback(
              (g: FlowNode, v: FlowNode[]) => {
                const group = { node: g, targetIds: new Set(v.map((s) => s.id)) };
                writeGraph((c) => {
                  const nNodes = c.nodes.map((n) => {
                    if (group.targetIds.has(n.id)) {
                      const { parentId: _parentId, extent: _extent, ...rest } = n;
                      return { ...rest, data: { ...n.data, groupId: g.id } };
                    }
                    return n;
                  });
                  return {
                    ...c,
                    nodes: nNodes.some((n) => n.id === group.node.id)
                      ? nNodes
                      : [group.node, ...nNodes],
                  };
                });
              },
              [writeGraph],
            )}
            onUngroupNodes={useCallback(
              (v: FlowNode[]) => {
                const ungroupMap = new Map(v.map((u) => [u.id, u]));
                writeGraph((c) => ({
                  ...c,
                  nodes: c.nodes.map((n) => {
                    if (ungroupMap.has(n.id)) {
                      if (!getGroupId(ungroupMap.get(n.id)!)) return n;
                      const { parentId: _, extent: __, ...rest } = n;
                      const { groupId: ___, ...restData } =
                        (rest.data as Record<string, unknown>) ?? {};
                      return { ...rest, data: restData as NodeData };
                    }
                    return n;
                  }),
                }));
              },
              [writeGraph],
            )}
            onDeleteSelected={useCallback(
              (s: FlowNode[]) => {
                writeGraph((c) => {
                  const selIds = new Set(s.map((n) => n.id));
                  return {
                    ...c,
                    nodes: c.nodes.filter((n) => !selIds.has(n.id)),
                    edges: c.edges.filter((_e) => !selIds.has(_e.source) && !selIds.has(_e.target)),
                  };
                });
              },
              [writeGraph],
            )}
            onAlignNodes={useCallback(
              (v: FlowNode[], t: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
                if (v.length < 2) return;
                const selNodesMap = new Map(v.map((s) => [s.id, s]));
                writeGraph((c) => {
                  const absPos = v.map((n) => ({ n, abs: n.position }));
                  const minX = Math.min(...absPos.map((p) => p.abs.x - getNodeSize(p.n).w / 2));
                  const maxX = Math.max(...absPos.map((p) => p.abs.x + getNodeSize(p.n).w / 2));
                  const minY = Math.min(...absPos.map((p) => p.abs.y - getNodeSize(p.n).h / 2));
                  const maxY = Math.max(...absPos.map((p) => p.abs.y + getNodeSize(p.n).h / 2));
                  return {
                    ...c,
                    nodes: c.nodes.map((n) => {
                      if (selNodesMap.has(n.id)) {
                        const flowNode = selNodesMap.get(n.id)!;
                        const size = getNodeSize(flowNode);
                        let nAbsX = flowNode.position.x;
                        let nAbsY = flowNode.position.y;
                        switch (t) {
                          case 'left':
                            nAbsX = minX + size.w / 2;
                            break;
                          case 'center':
                            nAbsX = (minX + maxX) / 2;
                            break;
                          case 'right':
                            nAbsX = maxX - size.w / 2;
                            break;
                          case 'top':
                            nAbsY = minY + size.h / 2;
                            break;
                          case 'middle':
                            nAbsY = (minY + maxY) / 2;
                            break;
                          case 'bottom':
                            nAbsY = maxY - size.h / 2;
                            break;
                        }
                        const nPos = { x: nAbsX, y: nAbsY };
                        return { ...n, position: nPos, data: { ...n.data, customPosition: nPos } };
                      }
                      return n;
                    }),
                  };
                });
              },
              [writeGraph],
            )}
            onDistributeNodes={useCallback(
              (v: FlowNode[], t: string) => {
                if (v.length < 3) return;
                writeGraph((c) => {
                  const isHoriz = t.startsWith('horizontal');
                  const sizeKey = isHoriz ? 'w' : 'h';

                  /**
                   * Handles get edge.
                   *
                   * @param p - Graph node whose position should be rendered.
                   */
                  const getEdge = (p: { n: FlowNode; abs: { x: number; y: number } }) => {
                    const basePos = p.abs[isHoriz ? 'x' : 'y'];
                    const size = getNodeSize(p.n)[sizeKey];
                    if (t.endsWith('left') || t.endsWith('top')) return basePos - size / 2;
                    if (t.endsWith('center')) return basePos;
                    return basePos + size / 2;
                  };
                  const sorted = [...v.map((n) => ({ n, abs: n.position }))].sort(
                    (a, b) => getEdge(a) - getEdge(b),
                  );
                  const min = getEdge(sorted[0]);
                  const layoutLookup = {
                    nodes: new Map(v.map((s) => [s.id, s])),
                    indices: new Map(sorted.map((s, i) => [s.n.id, i])),
                  };
                  return {
                    ...c,
                    nodes: c.nodes.map((n) => {
                      if (layoutLookup.nodes.has(n.id)) {
                        const tEdge =
                          min +
                          ((getEdge(sorted[sorted.length - 1]) - min) / (sorted.length - 1)) *
                            layoutLookup.indices.get(n.id)!;
                        const flowNode = layoutLookup.nodes.get(n.id)!;
                        const size = getNodeSize(flowNode)[sizeKey];
                        let nAbsVal = tEdge;
                        if (t.endsWith('left') || t.endsWith('top')) nAbsVal = tEdge + size / 2;
                        else if (t.endsWith('right') || t.endsWith('bottom'))
                          nAbsVal = tEdge - size / 2;
                        const newPos = {
                          x: isHoriz ? nAbsVal : flowNode.position.x,
                          y: isHoriz ? flowNode.position.y : nAbsVal,
                        };
                        return {
                          ...n,
                          position: newPos,
                          data: { ...n.data, customPosition: newPos },
                        };
                      }
                      return n;
                    }),
                  };
                });
              },
              [writeGraph],
            )}
            onRenameNode={useCallback(
              (i: string) => {
                let _node: FlowNode | undefined;
                for (const n of flowRef.current.nodes) {
                  if (n.id === i) {
                    _node = n;
                    break;
                  }
                }
                if (!_node) return;
                const nTitle = window.prompt('Enter new name:', _node.data.title);
                if (!nTitle) return;
                writeGraph((c) => ({
                  ...c,
                  nodes: c.nodes.map((n) =>
                    n.id === i ? { ...n, data: { ...n.data, title: nTitle } } : n,
                  ),
                }));
              },
              [writeGraph],
            )}
            onChangeNodeType={useCallback(
              (i: string, t: keyof typeof NODE_TYPES) => {
                writeGraph((c) => ({
                  ...c,
                  nodes: c.nodes.map((n) => (n.id === i ? { ...n, type: t } : n)),
                }));
              },
              [writeGraph],
            )}
            onChangeEdgeStyle={useCallback(
              (i: string, s: 'solid' | 'dashed' | 'dotted') => {
                writeGraph((c) => ({
                  ...c,
                  edges: c.edges.map((e) =>
                    e.id === i ? { ...e, data: { ...e.data, strokeStyle: s } } : e,
                  ),
                }));
              },
              [writeGraph],
            )}
            onDeleteEdge={useCallback(
              (i: string) => {
                writeGraph((c) => ({ ...c, edges: c.edges.filter((_e) => _e.id !== i) }));
              },
              [writeGraph],
            )}
            onAutoLayout={useCallback(() => {
              writeGraph((c) => {
                const validNodeIds = new Set(c.nodes.map((n) => n.id));
                return {
                  ...c,
                  nodes: c.nodes.map((n) => {
                    const { parentId: _parentId, extent: _extent, ...rest } = n;
                    return {
                      ...rest,
                      data: Object.fromEntries(
                        Object.entries(rest.data ?? {}).filter(([k]) => k !== 'customPosition'),
                      ) as NodeData,
                    };
                  }),
                  edges: c.edges.filter(
                    (e) => validNodeIds.has(e.source) && validNodeIds.has(e.target),
                  ),
                };
              });
            }, [writeGraph])}
            interactive={interactive}
            editable={permitted}
            isFocused={isFocused}
            height={typeof height === 'number' && Number.isFinite(height) ? height : internalHeight}
            showBg={showBg}
            showCtrls={showCtrls}
            arcControls={arcControls}
            readyWhenEmpty={readyWhenEmpty}
            onReady={onReady}
          />
        </ReactFlowProvider>
      </div>
    </ErrorBoundary>
  );
}
