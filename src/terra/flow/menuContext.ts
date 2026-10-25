// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/** Context tracked by the shared React Flow context menu. */
export type FlowMenuContext = { type: 'pane' | '_node' | 'e'; id: string | null };

/**
 * Indicates whether the active menu context is expected to resolve to a graph node.
 *
 * @param ctx - Active context-menu target.
 * @returns Whether the context identifies a node whose lock state should be resolved.
 */
export function shouldResolveNodeMenuTarget(ctx: FlowMenuContext): boolean {
	return ctx.type === '_node' && ctx.id !== null;
}
