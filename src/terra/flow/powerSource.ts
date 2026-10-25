// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/flow/powerSource.ts
 * Power Source graph placement and route presentation.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// TYPES
import type { PowerSrcGraph } from '../runtime/types.js';
import type { StructureQuestion } from '../runtime/types.js';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Handles with power source positions.
 *
 * @param graph - Power Source graph whose content nodes need positions.
 * @param questions - Questions used to resolve node titles by document id.
 *
 * @return Graph with deterministic row positions for its content and terminal nodes.
 */
export function withPowerSrcPositions(graph: PowerSrcGraph, questions: StructureQuestion[]): PowerSrcGraph {
	const titleById = new Map<string, string>();
	for (const q of questions) {
		if (q._id && q.question) titleById.set(q._id, q.question);
	}
	const positioned = graph.nodes.map(n => {
		if (n.type !== 'content') return n;
		const match = titleById.get(n.question?._ref ?? '')?.match(/^\s*0*(\d+)\.(\d+)\b/);
		const parsed = match ? { row: Number(match[1]) } : undefined;
		return { ...n, ...(n.position?.row === undefined && parsed ? { position: parsed } : n.position?.row === undefined ? {} : { position: { row: n.position.row } }) };
	});
	let lastRow = 0;
	let hasTrailing = false;
	for (const n of positioned) {
		if (n.type === 'content') {
			if (n.position?.row !== undefined) {
				if (n.position.row > lastRow) lastRow = n.position.row;
			} else {
				hasTrailing = true;
			}
		}
	}
	return {
		...graph,
		nodes: positioned.map(n => {
			if (n.type === 'origin') return { ...n, position: { row: 0 } };
			if (n.type === 'terminal') return { ...n, position: { row: lastRow + (hasTrailing ? 2 : 1) } };
			if (n.type !== 'content' || n.position?.row !== undefined) return n;
			return { ...n, position: { row: lastRow + 1 } };
		}),
	};
}
