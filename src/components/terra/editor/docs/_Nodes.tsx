// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/docs/_Nodes.tsx
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { cn } from '../../../../lib/terra/runtime/runtime.js';
import { decodeNodesPayload } from '../../../../lib/terra/runtime/nodes.js';

// COMPONENTS
import Canvas from '../../flow/Nodes.js';
import { ErrorBoundary } from '../../ui.js';

// TYPES
import type { DocsBlock } from '../types.js';
import type { Edge, FlowNode } from '../../../../lib/terra/runtime/types.js';
import type { NodesProps } from '../../../../lib/terra/runtime/types.js';

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Decodes and renders a Docs flow diagram.
 *
 * @param props - Node data, optional styling class, and rendering state used to display a graph preview.
 *
 * @return The graph preview for the supplied node data.
 */
function NodesRenderer(props: NodesProps & { className?: string }): JSX.Element {
  const {
    className,
    nodes: rawNodes,
    edges: rawEdges,
    direction,
    height,
    nodeSep,
    rankSep,
    proximityConnect,
    ...rest
  } = props;
  const resolvedHeight = Number.isFinite(Number(height)) ? Number(height) : 384;
  return (
    <ErrorBoundary name="Nodes">
      <div
        className={cn(
          'docs-block relative my-0 flow-root transition-all duration-200 [&>:first-child]:!mt-0 [&>:last-child]:!mb-0',
          className,
        )}
        data-docs-editor-block="Nodes"
        style={{ height: resolvedHeight, width: '100%' }}
        contentEditable={false}
        suppressContentEditableWarning
      >
        <Canvas
          {...rest}
          direction={direction}
          height={resolvedHeight}
          nodeSep={nodeSep}
          rankSep={rankSep}
          proximityConnect={proximityConnect}
          nodes={decodeNodesPayload(rawNodes).filter((n): n is FlowNode => {
            if (!n || typeof n !== 'object') return false;
            const val = n as Record<string, unknown>;
            return typeof val.id === 'string' && Boolean(val.data && typeof val.data === 'object');
          })}
          edges={decodeNodesPayload(rawEdges).filter((e): e is Edge => {
            if (!e || typeof e !== 'object') return false;
            const val = e as Record<string, unknown>;
            return (
              typeof val.id === 'string' &&
              typeof val.source === 'string' &&
              typeof val.target === 'string'
            );
          })}
          className={className}
        />
      </div>
    </ErrorBoundary>
  );
}
Object.assign(NodesRenderer, { displayName: 'DocsNodesRenderer' });

/**
 * Renders the nodes block component.
 *
 * @param props - Portable Text node props passed to the renderer.
 *
 * @return Rendered documentation node content.
 */
export function NodesBlock({
  block,
}: {
  block: /** Sanity Portable Text graph data and its visualization settings. */ DocsBlock<'nodes'>;
}): JSX.Element {
  return (
    <ErrorBoundary name="NodesBlock">
      <NodesRenderer
        {...(block.nodes === undefined
          ? {}
          : { nodes: block.nodes as unknown as NonNullable<NodesProps['nodes']> })}
        {...(block.edges === undefined
          ? {}
          : { edges: block.edges as unknown as NonNullable<NodesProps['edges']> })}
        {...(block.direction === 'TB' || block.direction === 'LR'
          ? { direction: block.direction }
          : {})}
        {...(block.height === undefined ? {} : { height: block.height })}
        {...(block.nodeSep === undefined ? {} : { nodeSep: block.nodeSep })}
        {...(block.proximityConnect === undefined
          ? {}
          : { proximityConnect: block.proximityConnect })}
        {...(block.rankSep === undefined ? {} : { rankSep: block.rankSep })}
      />
    </ErrorBoundary>
  );
}
Object.assign(NodesBlock, { displayName: 'DocsNodesBlock' });
