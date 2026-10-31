/**
 * astro/src/components/flow/_layout.ts
 * Pure Dagre layout primitives shared by flow UI and testable graph helpers.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// COMPONENTS
import Dagre from '@dagrejs/dagre';

// TYPES
import type { DagreNode, FlowNodeLike, FlowSize } from '../runtime/types.js';
import type { Edge } from '@xyflow/react';

/*//////////////////////////////////////////////////
EXPORTS
//////////////////////////////////////////////////*/

/**
 * Handles layout graph.
 *
 * @param nodes - Nodes to position in the generated graph.
 * @param edges - Directed connections between graph nodes.
 * @param direction - Dagre rank direction used for layout.
 * @param nodeSep - Minimum separation between adjacent nodes.
 * @param rankSep - Minimum separation between graph ranks.
 * @param opts - Callbacks for measuring, registering, and placing nodes.
 *
 * @return Positioned nodes and the computed graph height.
 */
export function layoutGraph<TNode extends FlowNodeLike>(
  nodes: TNode[],
  edges: Pick<Edge, 'source' | 'target'>[],
  direction: 'TB' | 'LR',
  nodeSep: number,
  rankSep: number,
  opts: {
    getSize: (node: TNode) => FlowSize;
    getGroupId?: (node: TNode) => string | undefined;
    getCustomPosition?: (node: TNode) => import('@xyflow/react').XYPosition | undefined;
    registerNode?: (graph: Dagre.graphlib.Graph, node: TNode, size: FlowSize) => void;
    placeNode?: (
      node: TNode,
      dagreNode: DagreNode | undefined,
      persisted: import('@xyflow/react').XYPosition | undefined,
    ) => TNode;
  },
): { positionedNodes: TNode[]; graphHeight: number } {
  const graph = new Dagre.graphlib.Graph({ compound: true });
  graph.setGraph({ rankdir: direction, nodesep: nodeSep, ranksep: rankSep });
  graph.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => {
    const size = opts.getSize(n);
    if (opts.registerNode) opts.registerNode(graph, n, size);
    else graph.setNode(n.id, { width: size.w, height: size.h });
  });
  nodes.forEach((n) => {
    const parentId = opts.getGroupId?.(n);
    if (parentId && graph.hasNode(parentId)) graph.setParent(n.id, parentId);
  });
  const groupNodeIds = new Set(
    nodes.filter((node) => (node as { type?: unknown }).type === 'group').map((node) => node.id),
  );
  // Dagre's compound-graph ranker cannot assign ranks to self-loop edges or
  // edges whose endpoint is a compound group. Keep those edges in the React
  // Flow graph (the caller still owns the original edge list), but omit them
  // from the graph used only to compute node positions.
  edges.forEach((e) => {
    if (e.source !== e.target && !groupNodeIds.has(e.source) && !groupNodeIds.has(e.target)) {
      graph.setEdge(e.source, e.target);
    }
  });
  Dagre.layout(graph);
  return {
    positionedNodes: nodes.map((n) => {
      const persisted = opts.getCustomPosition?.(n);
      const dagreNode = graph.node(n.id) as DagreNode | undefined;
      return opts.placeNode
        ? opts.placeNode(n, dagreNode, persisted)
        : { ...n, position: persisted ?? { x: dagreNode?.x ?? 0, y: dagreNode?.y ?? 0 } };
    }),
    graphHeight: (graph.graph() as { height?: number }).height ?? 0,
  };
}
