// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/flow/_chrome.tsx
 * Shared React Flow presentation primitives.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { applyEdgeChanges, applyNodeChanges, getSmoothStepPath, useInternalNode, useNodeConnections, useReactFlow, useStore } from '@xyflow/react';
import { canonicalId, cn, isNumber, isRec, isString, normArcGraph, resolvedEdges } from '../runtime/runtime.js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { layoutGraph } from './_layout.js';

// COMPONENTS
import { Background, BackgroundVariant, BaseEdge, Controls, EdgeLabelRenderer, Handle, Position as HandlePos, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import { ButtonGroup } from '@terra-symposium/styling/ui/terra-original';
import { Card, CardDescription } from '@terra-symposium/styling/ui/terra-original';
import { ErrorBoundary } from '../runtime/ui.js';
import { FitToScreen as FitToScreenIcon, MagicWand as MagicWandIcon, ZoomIn as ZoomInIcon, ZoomOut as ZoomOutIcon } from '@carbon/icons-react';
import { Textarea } from '@terra-symposium/styling/ui/terra-original';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@terra-symposium/styling/ui/terra-original';

// TYPES
// TYPES
import type {
	ArcCanvasEls,
	ArcCanvasNodeData,
	ArcFn,
	ArcGraph,
	ArcGraphEdge,
	ArcGraphNode,
	FlowAdapter,
	FlowClipboard,
	FlowCtxMenuState,
	FlowEdgeData,
	FlowEls,
	FlowNodeLike,
	FlowProblem,
	FlowProblemNodeData,
	FlowSize,
	FlowSkin,
	FlowTone,
	Pos,
} from '../runtime/types.js';
import type { GroupNodeData } from '../runtime/types.js';
import type { ComponentPropsWithoutRef, ComponentType, CSSProperties, ElementType, MouseEvent, MouseEventHandler, ReactNode } from 'react';
import type { Connection, Edge, EdgeChange, EdgeProps, Node, NodeChange, NodeProps, PanelPosition, Position as HandlePosition, ReactFlowInstance, XYPosition } from '@xyflow/react';
import type { Problem } from '../runtime/types.js';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/**
 * Signals that the canonical canvas has completed its first fit and layout.
 *
 * @returns The context used to mark the initial layout state.
 */
const InitCtx = createContext(false);
const ARC_PORTS = {
	inbound: ['inbound'],
	outbound: ['default', 'bottom'],
} as const;
const CLASS = { meta: 'text-xs opacity-70' } as const;
const EDGE_LANE = { gap: 20, minWidth: 112, maxWidth: 320, appendageGap: 4, appendageWidth: 128 } as const;

/*//////////////////////////////////////////////////
EDITOR
//////////////////////////////////////////////////*/

/**
 * Owns generic graph changes while adapters retain domain persistence.
 *
 * @param props - Flow adapter and editability flag.
 * @param adapter - Persistence adapter that reads and writes the graph state.
 * @param disabled - Disabled state controlling whether use editor accepts interaction.
 *
 * @return The current editor state and mutation helpers.
 */
export function useEditor<N extends Node = Node, E extends Edge = Edge>({ adapter, disabled = false }: { adapter: FlowAdapter<N, E>; disabled?: boolean }) {
	// STATES
	const [els, setEls] = useState<FlowEls<N, E>>(adapter.read);
	const ref = useRef(els);
	ref.current = els;

	// INIT
	useEffect((): void => {
		setEls(adapter.read);
	}, [adapter.read]);

	// HELPERS
	const write = useCallback(
		(n: FlowEls<N, E>): void => {
			ref.current = n;
			setEls(n);
			adapter.write(n);
		},
		[adapter],
	);
	const editable = useCallback((n: N): boolean => adapter.editableNode?.(n) ?? true, [adapter]);
	const selection = useCallback((): FlowClipboard<N, E> | null => {
		const nodes = ref.current.nodes.filter(n => n.selected && editable(n));
		if (!nodes.length) return null;
		const ids = new Set(nodes.map(n => n.id));
		return { version: 1, nodes, edges: ref.current.edges.filter(e => ids.has(e.source) && ids.has(e.target)) };
	}, [editable]);
	const copy = useCallback((): void => {
		const val = selection();
		if (!val || !adapter.clipboardKey || typeof window === 'undefined') return;
		window.localStorage.setItem(adapter.clipboardKey, JSON.stringify(val));
	}, [adapter.clipboardKey, selection]);
	const deleteSel = useCallback((): void => {
		if (disabled) return;
		const ids = new Set(ref.current.nodes.filter(n => n.selected && editable(n)).map(n => n.id));
		if (!ids.size) return;
		write({ nodes: ref.current.nodes.filter(n => !ids.has(n.id)), edges: ref.current.edges.filter(e => !ids.has(e.source) && !ids.has(e.target)) });
	}, [disabled, editable, write]);
	const cut = useCallback((): void => {
		if (disabled) return;
		copy();
		deleteSel();
	}, [copy, deleteSel, disabled]);
	const paste = useCallback((): void => {
		if (disabled || !adapter.clipboardKey || typeof window === 'undefined') return;
		try {
			const raw: unknown = JSON.parse(window.localStorage.getItem(adapter.clipboardKey) ?? 'null');
			if (!isRec(raw) || raw.version !== 1 || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return;
			const val = raw as unknown as FlowClipboard<N, E>;
			const ids = new Map(val.nodes.map(n => [n.id, `n-${crypto.randomUUID()}`]));
			write({
				nodes: [
					...ref.current.nodes.map(n => ({ ...n, selected: false })),
					...val.nodes.map(n => ({ ...(adapter.cloneNode?.(n, ids.get(n.id)!) ?? { ...n, id: ids.get(n.id)! }), position: { x: n.position.x + 40, y: n.position.y + 40 }, selected: true })),
				],
				edges: [...ref.current.edges, ...val.edges.map(e => ({ ...e, id: `e-${crypto.randomUUID()}`, source: ids.get(e.source)!, target: ids.get(e.target)! }))],
			});
		} catch {
			// Ignore stale or malformed local clipboard payloads.
		}
	}, [adapter.clipboardKey, disabled, write]);
	const duplicate = useCallback((): void => {
		if (disabled) return;
		const val = selection();
		if (!val) return;
		const ids = new Map(val.nodes.map(n => [n.id, `n-${crypto.randomUUID()}`]));
		write({
			nodes: [
				...ref.current.nodes.map(n => ({ ...n, selected: false })),
				...val.nodes.map(n => ({ ...(adapter.cloneNode?.(n, ids.get(n.id)!) ?? { ...n, id: ids.get(n.id)! }), position: { x: n.position.x + 40, y: n.position.y + 40 }, selected: true })),
			],
			edges: [...ref.current.edges, ...val.edges.map(e => ({ ...e, id: `e-${crypto.randomUUID()}`, source: ids.get(e.source)!, target: ids.get(e.target)! }))],
		});
	}, [adapter, disabled, selection, write]);
	useEffect((): (() => void) | void => {
		if (typeof window === 'undefined') return;
		/**
		 * Handles keydown.
		 *
		 * @param e - Pointer event received from the flow canvas.
		 */
		const keydown = (e: KeyboardEvent): void => {
			if (!(e.metaKey || e.ctrlKey) || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement | null)?.isContentEditable) return;
			if (e.key.toLowerCase() === 'c') {
				e.preventDefault();
				copy();
			} else if (e.key.toLowerCase() === 'x') {
				e.preventDefault();
				cut();
			} else if (e.key.toLowerCase() === 'v') {
				e.preventDefault();
				paste();
			} else if (e.key.toLowerCase() === 'd') {
				e.preventDefault();
				duplicate();
			}
		};
		window.addEventListener('keydown', keydown);
		return () => {
			window.removeEventListener('keydown', keydown);
		};
	}, [copy, cut, duplicate, paste]);

	// RENDER
	return {
		...els,
		selected: els.nodes.filter(n => n.selected),
		connect: useCallback(
			(c: Connection): void => {
				if (disabled || !c.source || !c.target || adapter.validConnection?.(c, ref.current) === false) return;
				const e = adapter.createEdge?.(c, ref.current) ?? ({ id: `e-${crypto.randomUUID()}`, source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle } as E);
				if (e) write({ ...ref.current, edges: [...ref.current.edges, e] });
			},
			[adapter, disabled, write],
		),
		copy,
		cut,
		deleteSelection: deleteSel,
		duplicate,
		layout: useCallback((): void => {
			if (!disabled && adapter.layout) write(adapter.layout(ref.current));
		}, [adapter, disabled, write]),
		onEdgesChange: useCallback(
			(v: EdgeChange<E>[]): void => {
				const permitted = disabled ? v.filter(c => c.type === 'select') : v;
				if (permitted.length) write({ ...ref.current, edges: applyEdgeChanges(permitted, ref.current.edges) });
			},
			[disabled, write],
		),
		onNodesChange: useCallback(
			(v: NodeChange<N>[]): void => {
				const permitted = disabled ? v.filter(c => c.type === 'select') : v;
				if (permitted.length) write({ ...ref.current, nodes: applyNodeChanges(permitted, ref.current.nodes) });
			},
			[disabled, write],
		),
		onSelectionChange: useCallback(
			(v: N[]): void => {
				write({ ...ref.current, nodes: ref.current.nodes.map(n => ({ ...n, selected: new Set(v.map(n => n.id)).has(n.id) })) });
			},
			[write],
		),
		paste,
	};
}

/*//////////////////////////////////////////////////
LAYOUT
//////////////////////////////////////////////////*/

/**
 * Reads a persisted custom position from node data when one is available.
 *
 * @param n - Node-like value with optional custom position metadata.
 *
 * @return The stored position when it is valid, otherwise `undefined`.
 */
export function getCustomPos(n: FlowNodeLike): XYPosition | undefined {
	if (!isRec(n.data) || !('customPosition' in n.data)) return;
	const point = n.data.customPosition;
	return isRec(point) && isNumber(point.x) && isNumber(point.y) ? { x: point.x, y: point.y } : undefined;
}

/**
 * Resolves a node's structural group id from its parent or embedded data.
 *
 * @param n - Node-like value with optional parent metadata.
 *
 * @return The resolved group id when present, otherwise `undefined`.
 */
export function getGroupId(n: { parentId?: string | null; data?: unknown }): string | undefined {
	return n.parentId || (isRec(n.data) && isString(n.data.groupId) ? n.data.groupId : undefined);
}

/**
 * Measures a flow node using persisted dimensions, runtime measurements, or defaults.
 *
 * @param n - Node whose size is being resolved.
 * @param defaults - Fallback dimensions used when the node has not been measured.
 * @param extraHeight - Optional height override for nodes with dynamic content.
 *
 * @return The computed width and height used by layout.
 */
export function getNodeSize(
	n: FlowNodeLike,
	defaults: { width: number; height: number; groupWidth?: number; groupHeight?: number; erdWidth?: number; erdHeight?: number } = {
		width: 175,
		height: 60,
		groupWidth: 160,
		groupHeight: 100,
		erdWidth: 224,
		erdHeight: 60,
	},
	extraHeight?: (n: FlowNodeLike) => number | undefined,
): FlowSize {
	const style: Record<string, unknown> = isRec(n.style) ? n.style : {};
	const width = Number(n.measured?.width ?? style.width ?? (n.type === 'group' ? (defaults.groupWidth ?? defaults.width) : n.type === 'erd' ? (defaults.erdWidth ?? defaults.width) : defaults.width));
	const height = extraHeight?.(n) ?? Number(n.measured?.height ?? style.height ?? (n.type === 'group' ? (defaults.groupHeight ?? defaults.height) : defaults.height));
	return { w: Number.isFinite(width) ? width : defaults.width, h: Number.isFinite(height) ? height : defaults.height };
}

/**
 * Creates the stable Arc layout used by both the editor and read-only canvas.
 *
 * @param customLayout - Optional host layout override.
 *
 * @return A layout callback for Arc nodes.
 */
export function useArcNodeLayout(
	customLayout?: (nodes: Node<ArcCanvasNodeData>[], edges: Edge<FlowEdgeData>[]) => Node<ArcCanvasNodeData>[],
): (nodes: Node<ArcCanvasNodeData>[], edges: Edge<FlowEdgeData>[]) => Node<ArcCanvasNodeData>[] {
	return useCallback(
		(n, e) => {
			if (customLayout) return customLayout(n, e);
			if (!n.length) return n;
			const sizeByType: Record<string, FlowSize> = { content: { w: 208, h: 92 }, group: { w: 240, h: 160 }, default: { w: 160, h: 72 } };
			const getSize = (node: Node<ArcCanvasNodeData>): FlowSize => {
				const type = isRec(node.data) && isString(node.data.graphType) ? node.data.graphType : 'default';
				return Object.hasOwn(sizeByType, type) ? sizeByType[type] : sizeByType.default;
			};
			return layoutGraph(n, e, 'TB', 32, 56, {
				getSize,
				placeNode: (node, dagreNode) => {
					const size = getSize(node);
					return { ...node, position: { x: (dagreNode?.x ?? 0) - size.w / 2, y: (dagreNode?.y ?? 0) - size.h / 2 } };
				},
			}).positionedNodes;
		},
		[customLayout],
	);
}

/**
 * Lays out a graph with Dagre and reprojects the result back to the node model.
 *
 * @param nodes - Nodes to position.
 * @param edges - Graph connections rendered and updated by layout graph.
 * @param direction - Layout direction that arranges layout graph's graph.
 * @param nodeSep - Spacing between nodes on the same rank.
 * @param rankSep - Spacing between ranks.
 * @param opts - Layout hooks that adapt the generic Dagre result to the caller's node model.
 *
 * @returns Positioned nodes and the resulting graph height.
 */
export { layoutGraph } from './_layout.js';

/*//////////////////////////////////////////////////
NODE CHROME
//////////////////////////////////////////////////*/

/**
 * Renders all handles for a node based on editability and required directions.
 *
 * @param props - Editable state and source/target handle positions that determine which connection points are active.
 * @param sources - Required source handle directions.
 * @param tgts - Required target handle directions.
 * @param editable - Editability flag controlling whether handles accepts changes.
 *
 * @return The full handle set for a node.
 */
export function Handles({ editable = false, sources: srcs = [], tgts = [] }: { editable?: boolean; sources?: Pos[]; tgts?: Pos[] }): JSX.Element {
	return (
		<ErrorBoundary name='Handles'>
			{(['target', 'source'] as const).map(t =>
				(
					[
						{ id: 'top', pos: HandlePos.Top },
						{ id: 'right', pos: HandlePos.Right },
						{ id: 'bottom', pos: HandlePos.Bottom },
						{ id: 'left', pos: HandlePos.Left },
					] satisfies { id: Pos; pos: HandlePos }[]
				).map(p => (
					<Port
						key={`${t}-${p.id}`}
						id={p.id}
						type={t}
						position={p.pos}
						style={{ opacity: editable || (t === 'target' ? tgts : srcs).includes(p.id) ? 1 : 0, pointerEvents: editable ? 'auto' : 'none' }}
					/>
				)),
			)}
		</ErrorBoundary>
	);
}

/**
 * Renders a single styled React Flow handle with an optional tooltip.
 *
 * @param props - Handle identifier, direction, position, accessibility label, connectability, visibility, styling, and visual variant.
 * @param ariaLabel - Accessible label for the handle.
 * @param className - Extra classes applied to the handle.
 * @param hidden - Hidden input supplied to port's operation.
 * @param id - Handle identifier.
 * @param isConnectable - Boolean flag controlling port's is connectable behaviour.
 * @param position - Handle position around the node.
 * @param style - Inline style values merged into port.
 * @param title - Optional tooltip text.
 * @param type - Handle direction.
 * @param variant - Visual variant controlling port's presentation.
 *
 * @return A styled React Flow handle or a tooltip-wrapped handle.
 */
function Port({
	ariaLabel,
	className,
	hidden = false,
	id,
	isConnectable,
	position: pos,
	style,
	title,
	type,
	variant = 'default',
}: {
	className?: string;
	containerClassName?: string;
	ariaLabel?: string;
	hidden?: boolean;
	id: string;
	isConnectable?: boolean;
	position: HandlePosition;
	onClick?: MouseEventHandler<HTMLDivElement>;
	title?: string;
	variant?: 'choice' | 'default';
	style?: CSSProperties;
	type: 'source' | 'target';
}): JSX.Element {
	const choice = variant === 'choice';
	const size = choice ? 12 : 8;
	const handle = (
		<Handle
			type={type}
			position={pos}
			className={cn('flow-node-handle shadow-sm', className)}
			style={{
				...style,
				boxSizing: 'border-box',
				width: size,
				height: size,
				minWidth: size,
				minHeight: size,
				maxWidth: size,
				maxHeight: size,
				border: `2px solid ${choice ? '#f97316' : '#000'}`,
				borderRadius: 0,
				background: choice ? '#f97316' : '#000',
				opacity: hidden ? 0 : style?.opacity,
				pointerEvents: hidden ? 'none' : (style?.pointerEvents ?? 'auto'),
				...(choice ? { clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' } : {}),
			}}
			id={id}
			{...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
			{...(isConnectable !== undefined ? { isConnectable } : {})}
		/>
	);
	return title ? (
		<Tooltip>
			<TooltipTrigger asChild>{handle}</TooltipTrigger>
			<TooltipContent size='sm'>{title}</TooltipContent>
		</Tooltip>
	) : (
		handle
	);
}

/**
 * Renders the compact skeleton card used while a flow is resolving.
 *
 * @param props - Polymorphic card props.
 * @param as - As input supplied to skeleton card's operation.
 * @param className - Additional CSS classes merged into skeleton card.
 * @param style - Inline style values merged into skeleton card.
 *
 * @return The loading skeleton card.
 */
export function SkeletonCard<T extends ElementType = 'div'>({
	as = 'div' as T,
	className,
	style,
	...props
}: { as?: T; className?: string } & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>): JSX.Element {
	const Element = as as ElementType;
	return (
		<ErrorBoundary name='SkeletonCard'>
			<Element
				{...props}
				className={cn('relative flex h-16 items-center justify-center overflow-visible rounded-md border-2 px-3 py-2 shadow-sm', className)}
				style={{ backgroundColor: '#eaf8f9', borderColor: '#16899d', width: 208, ...style }}
			>
				<div className='absolute left-1/2 top-0 z-10 h-2 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-sm' style={{ backgroundColor: '#f7ffff', borderColor: '#16899d' }} />
				<div className='flex w-full animate-pulse flex-col items-center gap-2'>
					<div className='h-4 w-[92%] rounded-md' style={{ backgroundColor: '#5db9c6' }} />
					<div className='mr-2 h-2.5 w-20 rounded-md' style={{ backgroundColor: '#91d3db' }} />
				</div>
			</Element>
		</ErrorBoundary>
	);
}

/** Provides the common card, title, and metadata treatment for every Arc graph host. */
const DEFAULT_SKIN: FlowSkin = {
	Card: ({ children, className, onClick, selected, style, tone = 'default' }) => (
		<Card
			onClick={onClick}
			size='sm'
			style={{ overflow: 'visible', ...style }}
			className={cn(
				'relative min-w-36 !overflow-visible !rounded !p-3 shadow-sm',
				(
					{
						caution: 'border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
						critical: 'border-red-500 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
						default: 'border-primary-6 bg-primary-1 text-primary-12',
						positive: 'border-green-600 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100',
						primary: 'border-primary-7 bg-primary-2 text-primary-12',
					} satisfies Record<FlowTone, string>
				)[tone],
				selected && 'ring-2 ring-primary-8',
				className,
			)}
		>
			{children}
		</Card>
	),
	Input: props => <Textarea {...props} />,
	Text: ({ children, className }) => <CardDescription className={className}>{children}</CardDescription>,
};
const SkinCtx = createContext<FlowSkin>(DEFAULT_SKIN);

/**
 * Returns the active workspace rendering skin.
 *
 * @return The current flow skin.
 */
function useSkin(): FlowSkin {
	return useContext(SkinCtx);
}
export { useEditor as useFlowEditor };

/**
 * Compares two string arrays for element equality.
 *
 * @param a - First sequence of node or edge identifiers to compare.
 * @param b - Second sequence whose length and elements must match the first.
 *
 * @return True when both arrays have equal length and matching string elements.
 */
function isArrayEqual(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Renders the common Arc logic body through the active workspace skin.
 *
 * @param props - Flow node props.
 * @param data - Logic node data.
 *
 * @return The rendered logic node body.
 */
export function LogicNode({ id, data }: NodeProps<Node<ArcCanvasNodeData>>): JSX.Element {
	const skin = useSkin();
	const type = data.graphType ?? 'function';
	const detail = type === 'function' ? data.function?.type : type === 'condition' ? data.condition?.type : undefined;

	// prettier-ignore
	return <ErrorBoundary name='LogicNode'><skin.Card
			className={cn('flex flex-col justify-center', (type === 'origin' || type === 'terminal') && 'items-center rounded-full text-center')}
			style={{ .../* prettier-ignore */ (type === 'origin' ? { background: '#f0fdf4', borderColor: '#16a34a', color: '#14532d' }
		: type === 'terminal' ? { background: '#fef2f2', borderColor: '#ef4444', color: '#7f1d1d' }
		: type === 'condition' ? { background: '#fffbeb', borderColor: '#f59e0b', color: '#78350f' }
		: { background: '#eff6ff', borderColor: '#3b82f6', color: '#172554' }), height: 72, width: 160 }}
			tone={(type === 'origin' ? 'positive' : type === 'terminal' ? 'critical' : type === 'condition' ? 'caution' : 'primary')}
		>
			{type !== 'origin' && ARC_PORTS.inbound.map(i => <Port key={i} id={i} type='target' position={HandlePos.Top} ariaLabel='Incoming route' title='Incoming route' isConnectable={type !== 'terminal'} />)}
			<strong className='block w-full truncate whitespace-nowrap'>{type.slice(0, 1).toUpperCase() + type.slice(1)}</strong>
			{detail && <skin.Text className={CLASS.meta}>{detail}</skin.Text>}
			{Array.from(new Set([...ARC_PORTS.outbound, ...useStore(s => s.edges.filter(e => e.source === id).map(e => e.sourceHandle ?? 'default'), isArrayEqual)])).map(i =>
				type === 'terminal' ? null : <Port key={i} id={i} type='source' position={HandlePos.Bottom} hidden={type === 'origin' || i === 'bottom'} isConnectable={type !== 'origin'} />,
			)}
		</skin.Card></ErrorBoundary>;
}

/**
 * Supplies the standard React Flow control panel with Carbon icons.
 *
 * @param props - Panel position and disable flag.
 * @param position - React Flow control-panel placement.
 * @param disabled - Disabled state controlling whether zoom controls accepts interaction.
 *
 * @return The zoom control cluster.
 */
export function ZoomControls({ position: pos, disabled = false }: { position: PanelPosition; disabled?: boolean }): JSX.Element {
	const { fitView, zoomIn, zoomOut } = useReactFlow();
	return (
		<ErrorBoundary name='ZoomControls'>
			<Controls position={pos} showZoom={false} showFitView={false} showInteractive={false}>
				<ButtonGroup>
					{(
						[
							{ label: 'Zoom in', icon: <ZoomInIcon aria-hidden='true' />, onClick: zoomIn },
							{ label: 'Zoom out', icon: <ZoomOutIcon aria-hidden='true' />, onClick: zoomOut },
							{ label: 'Fit view', icon: <FitToScreenIcon aria-hidden='true' />, onClick: fitView },
						] as const
					).map(({ label: l, icon: i, onClick: o }) => (
						<Button key={l} variant='ghost' size='icon-sm' aria-label={l} title={l} disabled={disabled} onClick={() => void o()}>
							{i}
						</Button>
					))}
				</ButtonGroup>
			</Controls>
		</ErrorBoundary>
	);
}

/**
 * Renders the shared floating context menu shell used by flow hosts.
 *
 * @param props - Menu state and content.
 * @param state - Current menu position and visibility.
 * @param children - Menu contents rendered inside the shell.
 *
 * @return The floating context menu when visible, otherwise `null`.
 */
function FloatingMenu({ state, children }: { state: FlowCtxMenuState; children: ReactNode }): JSX.Element | null {
	if (!state.show) return null;
	// prettier-ignore
	return (<Card className='fixed z-50' style={{ left: state.x, top: state.y }}>{children}</Card>);
}
export { FloatingMenu as FlowContextMenu };

/*//////////////////////////////////////////////////
LOADING
//////////////////////////////////////////////////*/

/**
 * Renders the loading affordance shown while a model adapter resolves graph state.
 *
 * @return The shared loading skeleton.
 */
export function Skeleton(): JSX.Element {
	return (
		<ErrorBoundary name='Skeleton'>
			<div className='flex w-full items-center justify-center' style={{ minHeight: 'calc(100vh - 20rem)' }}>
				<div className='flex animate-pulse flex-col items-center gap-8'>
					<SkeletonCard />
					<SkeletonCard className='translate-x-16 opacity-70' />
					<SkeletonCard className='-translate-x-12 opacity-40' />
				</div>
			</div>
		</ErrorBoundary>
	);
}

/*//////////////////////////////////////////////////
ARC ADAPTER
//////////////////////////////////////////////////*/

/**
 * Serializes an Arc flow canvas back into the graph model.
 *
 * @param flow - Flow canvas state.
 * @param prev - Prev input supplied to arc graph from's operation.
 *
 * @return The serialized Arc graph.
 */
export function arcGraphFrom(
	flow: /* Describes the full Arc flow graph representation used by hosts. */
	{
		nodes: /** Describes a node projected into the shared Arc flow canvas. */ (FlowNodeLike & {
			data: ArcCanvasNodeData;
		})[];
		edges: /** Describes a custom edge projected into the shared Arc flow canvas. */ {
			id: string;
			source: string;
			target: string;
			sourceHandle?: string | null | undefined;
			data?: FlowEdgeData | undefined;
			functions?: ArcFn[];
			handle?: string;
		}[];
	},
	prev: ArcGraph,
): ArcGraph {
	return {
		nodes: flow.nodes.map(n => {
			const prior = new Map(prev.nodes.map(i => [i._key, i])).get(n.data.graphKey);
			const type = n.data.graphType || (n.type === 'decision' ? 'function' : n.type === 'origin' || n.type === 'terminal' ? n.type : 'content');
			const published = isRec(n.data.published) && isString(n.data.published._id) ? n.data.published._id : undefined;
			return {
				...(prior ?? {}),
				_key: n.data.graphKey || n.id,
				type,
				position: { ...n.position, ...(n.data.hierarchy ? { row: n.data.hierarchy.row } : {}) },
				...(n.data.title ? { title: n.data.title } : {}),
				...(n.parentId ? { parentId: n.parentId } : {}),
				...(isRec(n.style) ? { style: { ...(isNumber(n.style.width) ? { width: n.style.width } : {}), ...(isNumber(n.style.height) ? { height: n.style.height } : {}) } } : {}),
				...(prior?.problem || n.data.problemId || published ? { problem: prior?.problem || { _type: 'reference' as const, _ref: n.data.problemId || published || '' } } : {}),
				...(n.data.hidden ? { hidden: true } : {}),
				...(type === 'function' && !prior?.function ? { function: { type: 'appendPrefix' as const, value: '' } } : {}),
				...(type === 'condition' && !prior?.condition ? { condition: { type: 'random' as const, weights: [] } } : {}),
			} as ArcGraphNode;
		}),
		edges: flow.edges.map(e => ({
			_key: e.id,
			source: e.source,
			target: e.target,
			...(new Map(flow.nodes.map(n => [n.id, n.data.graphType])).get(e.source) === 'content' &&
			e.sourceHandle &&
			!(
				/*
				 * Lists the canonical flow handle positions used across the shared primitives.
				 *
				 * @returns The ordered handle names used by the flow canvas.
				 */ (['top', 'right', 'bottom', 'left'] as const).includes(e.sourceHandle as Pos)
			)
				? { handle: e.sourceHandle }
				: {}),
			...(e.data?.functions?.length ? { functions: (e.data as { functions: ArcFn[] }).functions } : {}),
		})),
	};
}

/**
 * Renders the shared Arc canvas while hosts provide only policy and persistence callbacks.
 *
 * @param props - Arc elements, node renderers, layout function, labels, duration/hierarchy settings, and graph interaction callbacks.
 * @param elements - Graph elements supplied to arc canvas for layout and rendering.
 * @param annotationNodeTypes - Annotation node renderers available to arc canvas.
 * @param arrangeIcon - Arrange icon input supplied to arc canvas's operation.
 * @param editable - Editability flag controlling whether arc canvas accepts changes.
 * @param readOnly - Editability flag that prevents graph mutations in arc canvas.
 * @param onArrange - Callback invoked for arrange.
 * @param onConnect - Callback invoked with a new connection created in arc canvas.
 * @param onEdgesChange - Callback invoked with the updated edge changes from arc canvas.
 * @param onInit - Callback invoked for init.
 * @param onNodeClick - Callback invoked when a user selects a node in arc canvas.
 * @param onNodeContextMenu - Callback invoked for node context menu.
 * @param onNodesChange - Callback invoked with the updated node changes from arc canvas.
 * @param onPaneContextMenu - Callback invoked for pane context menu.
 * @param onProblemOpen - Callback invoked for problem open.
 * @param onProblemTitleChange - Callback invoked for problem title change.
 * @param onReady - Callback invoked when arc canvas finishes initialising its graph surface.
 * @param onResizeEnd - Callback invoked for resize end.
 *
 * @return The shared Arc canvas.
 */
export function ArcCanvas({
	elements: els,
	annotationNodeTypes,
	arrangeIcon = <MagicWandIcon aria-hidden='true' />,
	arrangeLabel = 'Arrange nodes',
	editable = false,
	layoutNodes,
	readOnly = false,
	showDuration = true,
	showHierarchyControls = true,
	onArrange,
	onConnect,
	onEdgesChange,
	onInit,
	onNodeClick,
	onNodeContextMenu: onNodeCtxMenu,
	onNodesChange,
	onPaneContextMenu: onPaneCtxMenu,
	onProblemOpen,
	onProblemTitleChange,
	onReady,
	onResizeEnd,
}: {
	elements: ArcCanvasEls;
	annotationNodeTypes?: Record<string, ComponentType<NodeProps<Node<GroupNodeData>>>>;
	arrangeIcon?: ReactNode;
	arrangeLabel?: string;
	editable?: boolean;
	layoutNodes?: (nodes: Node<ArcCanvasNodeData>[], edges: Edge<FlowEdgeData>[]) => Node<ArcCanvasNodeData>[];
	readOnly?: boolean;
	showDuration?: boolean;
	showHierarchyControls?: boolean;
	onArrange?: () => void;
	onConnect?: (connection: Connection) => void;
	onEdgesChange?: (changes: EdgeChange<Edge<FlowEdgeData>>[]) => void;
	onInit?: (instance: ReactFlowInstance<Node<ArcCanvasNodeData>, Edge<FlowEdgeData>>) => void;
	onNodeClick?: (_event: MouseEvent, node: Node<ArcCanvasNodeData>) => void;
	onNodeContextMenu?: (_event: MouseEvent, node: Node<ArcCanvasNodeData>) => void;
	onNodesChange?: (changes: NodeChange<Node<ArcCanvasNodeData>>[]) => void;
	onPaneContextMenu?: (_event: globalThis.MouseEvent | MouseEvent) => void;
	onProblemOpen?: (problem: FlowProblem) => void;
	onProblemTitleChange?: (nodeId: string, title: string) => void;
	onReady?: () => void;
	onResizeEnd?: (nodeId: string, params: { x: number; y: number; width: number; height: number }) => void;
}): JSX.Element {
	// STATES
	const arrangeNodes = useArcNodeLayout(layoutNodes);
	// prettier-ignore
	const topology = useMemo(() => JSON.stringify({ edges: els.edges.map(e => [e.id, e.source, e.sourceHandle, e.target]), nodes: els.nodes.map(n => [n.id, n.data.graphType, n.data.hierarchy?.row]) }), [els.edges, els.nodes]);
	const layout = useRef(topology);
	const [nodes, setNodes] = useState(() => arrangeNodes(els.nodes, els.edges));

	// INIT
	useEffect(() => {
		setNodes(c => {
			if (layout.current !== topology) {
				layout.current = topology;
				return arrangeNodes(els.nodes, els.edges);
			}
			return els.nodes.map(n => ({ ...n, position: new Map(c.map(n => [n.id, n.position])).get(n.id) ?? n.position }));
		});
	}, [arrangeNodes, els.edges, els.nodes, topology]);

	// HELPERS

	// INIT
	useEffect(() => {
		return (
			(frame: number) => (): void =>
				cancelAnimationFrame(frame)
		)(requestAnimationFrame(() => onReady?.()));
	}, [onReady]);

	// RENDER
	return (
		<ErrorBoundary name='ArcCanvas'>
			<ReactFlowProvider>
				<TooltipProvider delayDuration={120}>
					<SkinCtx.Provider value={DEFAULT_SKIN}>
						<InitCtx.Provider value>
							<ReactFlow<Node<ArcCanvasNodeData>, Edge<FlowEdgeData>>
								nodes={nodes
									.filter(n => !n.data.hidden)
									.map(n => ({
										...n,
										data: {
											...n.data,
											editable,
											readOnly,
											showDuration,
											showHierarchyControls,
											...(n.data.graphType === 'content'
												? { onOpen: () => n.data.problem && onProblemOpen?.(n.data.problem), onTitleChange: (title: string) => onProblemTitleChange?.(n.id, title) }
												: {}),
											...(n.data.hierarchy
												? {
														hierarchy: {
															...n.data.hierarchy,
															onChange: (pos: { row: number }) => onNodesChange?.([{ id: n.id, type: 'replace', item: { ...n, data: { ...n.data, hierarchy: { ...n.data.hierarchy!, ...pos } } } }]),
														},
													}
												: {}),
											...(n.data.graphType === 'group' || n.data.graphType === 'note'
												? { onResizeEnd: (_id: string, params: { x: number; y: number; width: number; height: number }) => onResizeEnd?.(n.id, params) }
												: {}),
										},
									}))}
								edges={els.edges}
								nodeTypes={useMemo(() => ({ group: annotationNodeTypes?.group, logicNode: LogicNode, note: annotationNodeTypes?.note, problemNode: ProblemNode }), [annotationNodeTypes]) as never}
								edgeTypes={{ custom: ArcEdge }}
								onInit={i => {
									onInit?.(i);
									requestAnimationFrame(() => {
										void i.fitView({ padding: 0.1, duration: 50 });
									});
								}}
								onNodesChange={useCallback(
									(c: NodeChange<Node<ArcCanvasNodeData>>[]) => {
										if (!onNodesChange) return;
										setNodes(s => applyNodeChanges(c, s));
										onNodesChange(c);
									},
									[onNodesChange],
								)}
								{...(onEdgesChange ? { onEdgesChange } : {})}
								{...(onConnect ? { onConnect: (connection: Connection) => onConnect({ ...connection, targetHandle: 'inbound' }) } : {})}
								{...(onNodeClick ? { onNodeClick } : {})}
								{...(onNodeCtxMenu ? { onNodeContextMenu: onNodeCtxMenu } : {})}
								{...(onPaneCtxMenu ? { onPaneContextMenu: onPaneCtxMenu } : {})}
								fitView
								minZoom={0.1}
								proOptions={{ hideAttribution: true }}
								panOnScroll
								panOnDrag={false}
								zoomOnScroll={false}
								selectionOnDrag={editable}
								nodesDraggable={editable}
								nodesConnectable={editable}
								elementsSelectable={editable}
							>
								{onArrange && (
									<Controls position='top-right' showFitView={false} showInteractive={false} showZoom={false}>
										<ButtonGroup>
											<Button
												variant='ghost'
												size='icon-sm'
												aria-label={arrangeLabel}
												title={arrangeLabel}
												onClick={() => {
													setNodes(arrangeNodes(els.nodes, els.edges));
													onArrange?.();
												}}
											>
												{arrangeIcon}
											</Button>
										</ButtonGroup>
									</Controls>
								)}
								<ZoomControls position='bottom-right' />
								<Background variant={BackgroundVariant.Dots} />
							</ReactFlow>
						</InitCtx.Provider>
					</SkinCtx.Provider>
				</TooltipProvider>
			</ReactFlowProvider>
		</ErrorBoundary>
	);
}

/**
 * Expands a persisted Arc into the one canonical node and edge projection.
 *
 * @param graph - Persisted Arc graph to expand.
 * @param problems - Problems input supplied to arc canvas elements's operation.
 * @param edgeData - Optional mapper that builds rendered edge metadata from a persisted edge and its source problem.
 *
 * @return The canonical canvas elements.
 */
export function arcCanvasElements(graph: ArcGraph, problems: Problem[], edgeData?: (edge: ArcGraphEdge, src: Problem | undefined) => FlowEdgeData): ArcCanvasEls {
	const norm = normArcGraph(graph);
	const byId = new Map(problems.map(p => [canonicalId(p._id), p]));
	return {
		nodes: norm.nodes.map(n => {
			const problem = n.problem?._ref ? byId.get(canonicalId(n.problem._ref)) : undefined;
			return {
				id: n._key,
				position: n.position ?? { x: 0, y: 0 },
				type: n.type === 'content' ? 'problemNode' : n.type === 'group' || n.type === 'note' ? n.type : 'logicNode',
				...(n.parentId ? { parentId: n.parentId } : {}),
				...(n.style ? { style: n.style } : {}),
				draggable: n.type !== 'origin' && n.type !== 'terminal' && !(n.position && 'row' in n.position),
				selectable: n.type !== 'origin' && n.type !== 'terminal',
				data: {
					graphKey: n._key,
					graphType: n.type,
					title:
						n.type === 'content' ? problem?.title || 'Problem' : n.title || (n.type === 'group' ? 'Container' : n.type === 'note' ? 'Sticky note' : n.type.slice(0, 1).toUpperCase() + n.type.slice(1)),
					...(n.type === 'group' || n.type === 'note' ? { editable: true, id: n._key } : {}),
					...(n.type === 'content'
						? {
								problem: {
									id: n.problem?._ref ?? n._key,
									...(problem?.title ? { title: problem.title } : {}),
									...(problem?.duration !== undefined ? { duration: problem.duration } : {}),
									...(problem?.choice?.opts || problem?.choice?.options
										? { choices: (problem.choice.opts?.length ? problem.choice.opts : (problem.choice.options ?? [])).map(c => ({ id: c._key, ...(c.label ? { label: c.label } : {}) })) }
										: {}),
								},
								...(problem ? { published: problem } : {}),
							}
						: {}),
					...(n.function ? { function: n.function } : {}),
					...(n.condition ? { condition: n.condition } : {}),
					...(n.hidden ? { hidden: true } : {}),
					...(n.position && 'row' in n.position && typeof n.position.row === 'number' ? { hierarchy: { row: n.position.row } } : {}),
				},
			};
		}),
		edges: (() => {
			const routes = [
				...resolvedEdges(norm),
				...norm.nodes.flatMap<ArcGraphEdge>(n => {
					const problem = n.problem?._ref ? byId.get(canonicalId(n.problem._ref)) : undefined;
					return (problem?.choice?.opts ?? problem?.choice?.options ?? []).flatMap(c => {
						// Authored choice options can project to null (options stored as plain strings lose
						// their fields under the `options[]{...}` projection). Skip malformed entries rather
						// than crashing the whole canvas on CMS content this renderer does not control.
						if (!isRec(c)) return [];
						const tgt = c.referral?._ref
							? new Map(norm.nodes.filter(n => n.type === 'content' && n.problem?._ref).map(n => [canonicalId(n.problem!._ref), n._key])).get(canonicalId(c.referral._ref))
							: undefined;
						if (!tgt || new Set(norm.edges.map(e => `${e.source}:${e.target}:${e.handle ?? ''}`)).has(`${n._key}:${tgt}:${c._key}`)) return [];
						return [{ _key: `choice:${n._key}:${c._key}:${tgt}`, source: n._key, target: tgt, handle: c._key }];
					});
				}),
			].map(e => {
				return {
					edge: e,
					data:
						e.functions?.length || edgeData
							? { ...(e.functions?.length ? { functions: e.functions } : {}), ...edgeData?.(e, byId.get(canonicalId(new Map(norm.nodes.map(n => [n._key, n])).get(e.source)?.problem?._ref ?? ''))) }
							: undefined,
				};
			});
			const routesBySrc = new Map<string, Array<{ edge: ArcGraphEdge; data?: FlowEdgeData }>>();
			for (const route of routes) {
				let list = routesBySrc.get(route.edge.source);
				if (!list) {
					list = [];
					routesBySrc.set(route.edge.source, list);
				}
				list.push(route);
			}
			const laneMetaMap = new Map<string, { laneWidth: number; laneOffset: number }>();
			for (const [, group] of routesBySrc) {
				const labelledRoutes = group.filter(r => r.data?.label || r.data?.appendages?.length);
				if (labelledRoutes.length > 0) {
					const widths = labelledRoutes.map(r =>
						Math.min(
							EDGE_LANE.maxWidth,
							Math.max(
								EDGE_LANE.minWidth,
								(r.data!.label?.length ?? 0) * 6 + 24,
								r.data!.appendages?.length ? r.data!.appendages.length * EDGE_LANE.appendageWidth + (r.data!.appendages.length - 1) * EDGE_LANE.appendageGap : 0,
							),
						),
					);
					let currOffset = -(widths.reduce((s, w) => s + w, 0) + (widths.length - 1) * EDGE_LANE.gap) / 2;
					for (let i = 0; i < labelledRoutes.length; i++) {
						const w = widths[i];
						laneMetaMap.set(labelledRoutes[i].edge._key, { laneWidth: w, laneOffset: currOffset + w / 2 });
						currOffset += w + EDGE_LANE.gap;
					}
				}
			}
			return routes.map(({ edge: e, data: d }) => {
				const laneMeta = laneMetaMap.get(e._key);
				return {
					id: e._key,
					source: e.source,
					target: e.target,
					sourceHandle: e.handle ?? 'default',
					targetHandle: 'inbound',
					type: 'custom',
					...(d
						? {
								data: {
									...d,
									...(laneMeta?.laneOffset !== undefined ? { laneOffset: laneMeta.laneOffset } : {}),
									...(laneMeta?.laneWidth !== undefined ? { laneWidth: laneMeta.laneWidth } : {}),
								},
							}
						: {}),
				};
			});
		})(),
	};
}

/**
 * Renders shared labelled Arc edges while the skin controls node primitives.
 *
 * @param props - Arc edge props.
 * @param id - Identifier tying arc edge's output to its source record.
 * @param source - Source node identifier for the connection drawn by arc edge.
 * @param srcHandleId - Connection handle identifier supplied to arc edge.
 * @param srcX - Horizontal connection coordinate supplied to arc edge.
 * @param srcY - Vertical connection coordinate supplied to arc edge.
 * @param srcPos - Connection anchor position supplied to arc edge.
 * @param target - Target node identifier for the connection drawn by arc edge.
 * @param tgtHandleId - Connection handle identifier supplied to arc edge.
 * @param tgtX - Horizontal connection coordinate supplied to arc edge.
 * @param tgtY - Vertical connection coordinate supplied to arc edge.
 * @param tgtPosition - Connection anchor position supplied to arc edge.
 * @param data - Data record supplied to arc edge.
 *
 * @return The rendered edge path and label layer.
 */
export function ArcEdge({
	id,
	source: src,
	sourceHandleId: srcHandleId,
	sourceX: srcX,
	sourceY: srcY,
	sourcePosition: srcPos,
	target: tgt,
	targetHandleId: tgtHandleId,
	targetX: tgtX,
	targetY: tgtY,
	targetPosition: tgtPos,
	data,
}: EdgeProps<Edge<FlowEdgeData>>): JSX.Element {
	const appendages =
		data?.appendages ?? data?.functions?.map(f => (f.type === 'appendPrefix' ? { title: f.value, type: 'Prefix' } : { title: 'Definition', type: f.type === 'appendTerm' ? 'Term' : 'Remove' }));
	const srcNode = useInternalNode(src);
	const tgtNode = useInternalNode(tgt);
	const srcHandle = srcNode?.internals.handleBounds?.source?.find(h => h.id === srcHandleId);
	const tgtHandle = tgtNode?.internals.handleBounds?.target?.find(h => h.id === tgtHandleId);
	// prettier-ignore
	const srcCenter = srcHandle ? { x: srcNode!.internals.positionAbsolute.x + srcHandle.x + srcHandle.width / 2, y: srcNode!.internals.positionAbsolute.y + srcHandle.y + srcHandle.height / 2 } : { x: srcX, y: srcY };
	// prettier-ignore
	const tgtCenter = tgtHandle ? { x: tgtNode!.internals.positionAbsolute.x + tgtHandle.x + tgtHandle.width / 2, y: tgtNode!.internals.positionAbsolute.y + tgtHandle.y + tgtHandle.height / 2 } : { x: tgtX, y: tgtY };
	const terminal = data?.terminal;
	const vertical = (srcPos === HandlePos.Bottom || srcPos === HandlePos.Top) && (tgtPos === HandlePos.Bottom || tgtPos === HandlePos.Top);
	const srcHeight = srcNode?.measured.height;
	const tgtApproachY = tgtCenter.y - 24;
	const bendY = terminal
		? (srcHeight === undefined ? srcCenter.y : srcNode ? srcNode.internals.positionAbsolute.y + srcHeight : srcCenter.y) + 52
		: !terminal && tgtCenter.y < srcCenter.y
			? Math.min(srcCenter.y - 52, tgtApproachY - 24)
			: (srcCenter.y + tgtApproachY) / 2;
	const [fallback, fallbackX, fallbackY] = getSmoothStepPath({ sourceX: srcX, sourceY: srcY, sourcePosition: srcPos, targetX: tgtX, targetY: tgtY, targetPosition: tgtPos, offset: 16 });
	const laneX = srcCenter.x + (data?.laneOffset ?? 0);
	return (
		<ErrorBoundary name='ArcEdge'>
			<BaseEdge
				id={id}
				path={
					/* prettier-ignore */ terminal
		? `M ${srcCenter.x},${srcCenter.y} V ${bendY} H ${laneX}` : vertical
		? `M ${srcCenter.x},${srcCenter.y} V ${bendY} H ${laneX} V ${tgtApproachY} H ${tgtCenter.x} V ${tgtCenter.y}` : fallback
				}
			/>
			{(data?.label || appendages?.length) && (
				<EdgeLabelRenderer>
					<div
						className={cn('nodrag nopan flex max-w-80 flex-col items-center gap-1 text-[10px] leading-tight', data?.laneWidth ? 'w-full' : 'w-fit')}
						aria-label={`${data?.terminal ? 'Terminal route. ' : ''}${data?.label ?? 'Route'}${appendages?.length ? `. ${appendages.map(a => `${a.title}, ${a.type}`).join('; ')}` : ''}`}
						style={{
							position: 'absolute',
							transform: `translate(-50%, -50%) translate(${terminal || vertical ? laneX : fallbackX}px,${terminal ? bendY + 12 : vertical ? bendY : fallbackY}px)`,
							...(data?.laneWidth ? { width: data.laneWidth } : {}),
						}}
					>
						{data?.label && <span className='block w-full truncate whitespace-nowrap rounded bg-white/95 px-1 text-center font-medium text-primary-12 shadow-sm'>{data.label}</span>}
						<div className='flex w-full flex-wrap items-start justify-center gap-0.5'>
							{appendages?.map((a, i) => (
								<span
									key={`${a.title}-${a.type}-${i}`}
									className={cn(
										'inline-flex h-5 w-32 min-w-0 max-w-32 items-baseline justify-center gap-1 overflow-hidden rounded px-1.5 py-0.5 text-center shadow-sm',
										data?.terminal ? 'bg-primary-9 text-white' : 'bg-secondary-8 text-secondary-12',
									)}
									title={`${a.title} — ${a.type}`}
								>
									<span className='min-w-0 truncate whitespace-nowrap'>{a.title}</span>
									<span className='shrink-0 text-[9px] font-semibold uppercase tracking-wide opacity-75'>{a.type}</span>
								</span>
							))}
						</div>
					</div>
				</EdgeLabelRenderer>
			)}
		</ErrorBoundary>
	);
}

/**
 * Renders the common problem card, its handles, title editing, and route affordances.
 *
 * @param props - Problem node props.
 * @param id - Identifier tying problem node's output to its source record.
 * @param data - Problem card data and callbacks.
 * @param selected - Boolean flag controlling problem node's selected behaviour.
 *
 * @return The rendered problem node.
 */
export function ProblemNode({ id, data, selected }: NodeProps<Node<FlowProblemNodeData>>): JSX.Element {
	const skin = useSkin();
	const input = useRef<HTMLTextAreaElement | null>(null);
	const outgoing = useStore(s => s.edges.filter(e => e.source === id).map(e => e.sourceHandle ?? 'default'), isArrayEqual);
	const choices = data.problem.choices ?? [];
	const routes = [
		{ id: 'default' },
		...choices,
		...Array.from(new Set(outgoing))
			.filter(h => h !== 'default' && !choices.some(c => c.id === h))
			.map(h => ({ id: h })),
	];
	const connectable = data.editable !== false && data.draft !== false;
	const terminus = useNodeConnections({ id: 'inbound' }).length > 0 && (!outgoing.length || (!outgoing.includes('default') && choices.some(c => !outgoing.includes(c.id))));
	useEffect(() => {
		if (!data.renaming || !input.current) return;
		input.current.focus();
		input.current.select();
	}, [data.renaming]);
	return (
		<ErrorBoundary name='ProblemNode'>
			<skin.Card
				selected={selected}
				tone={terminus ? 'caution' : 'default'}
				className={cn('relative flex w-52 flex-col', data.hierarchy && data.showHierarchyControls ? 'h-[120px]' : data.showDuration === false ? 'h-16' : 'h-[84px]', terminus && 'rounded-2xl')}
				onClick={e => {
					if (!e.metaKey && !e.ctrlKey && !e.shiftKey) data.onOpen?.();
				}}
			>
				{ARC_PORTS.inbound.map(i => (
					<Port key={i} id={i} type='target' position={HandlePos.Top} ariaLabel='Incoming route' title='Incoming route' isConnectable={connectable} />
				))}
				{data.readOnly ? (
					<strong className='block truncate whitespace-nowrap leading-5' title={data.problem.title ?? 'Problem'}>
						{data.problem.title ?? 'Problem'}
					</strong>
				) : (
					<skin.Input
						ref={input}
						rows={1}
						defaultValue={data.problem.title ?? ''}
						aria-label='Problem title'
						className='h-5 !min-h-0 resize-none overflow-hidden whitespace-nowrap border-0 bg-transparent p-0 font-semibold leading-5 shadow-none outline-none focus-visible:ring-0'
						onClick={e => {
							e.stopPropagation();
						}}
						onChange={e => data.onTitleChange?.(e.currentTarget.value)}
					/>
				)}
				{data.showDuration !== false && data.problem.duration !== undefined && <skin.Text className={cn(CLASS.meta, 'mt-auto')}>{data.problem.duration} minutes</skin.Text>}
				{data.showDuration !== false && data.duration && (
					<skin.Text className={cn(CLASS.meta, data.problem.duration === undefined && 'mt-auto')}>
						{data.duration.min === data.duration.max ? data.duration.min : `${data.duration.min}-${data.duration.max}`} total
					</skin.Text>
				)}
				{data.hierarchy && data.showHierarchyControls !== false && (
					<div
						className='mt-auto text-[10px]'
						onClick={e => {
							e.stopPropagation();
						}}
					>
						<label htmlFor={`problem-row-${id}`} className='grid gap-0.5'>
							<span>Row</span>
							<input
								id={`problem-row-${id}`}
								className='h-5 rounded border bg-background px-1'
								aria-label='Hierarchy row'
								type='number'
								min='1'
								value={data.hierarchy.row}
								onChange={e => data.hierarchy?.onChange?.({ ...data.hierarchy, row: Math.max(1, Number(e.currentTarget.value) || 1) })}
							/>
						</label>
					</div>
				)}
				{skin.Meta?.({ problem: data.problem })}
				{routes.map((r, i) => (
					<Port
						key={r.id}
						id={r.id}
						type='source'
						position={HandlePos.Bottom}
						isConnectable={connectable}
						variant={r.id === 'default' ? 'default' : 'choice'}
						{...(r.id === 'default' ? { ariaLabel: 'Default referral', title: 'Default referral' } : { ariaLabel: `Choice route ${r.label ?? i}`, title: r.label })}
						style={{ left: `${((i + 1) / (routes.length + 1)) * 100}%` }}
					/>
				))}
			</skin.Card>
		</ErrorBoundary>
	);
}
