// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/docs/_Raw.tsx
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// COMPONENTS
import { CodeBlock } from './_CodeBlock.js';
import { ErrorBoundary } from '../../runtime/ui.js';

// TYPES
import type { DocsBlock } from '../types.js';

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Renders the raw component.
 *
 * @param props - Raw block props containing the authored markup.
 *
 * @return Rendered raw documentation content.
 */
export function Raw({ block }: { block: /** Sanity Portable Text raw markup block fields. */ DocsBlock<'raw'> }): JSX.Element {
	return (
		<ErrorBoundary name='Raw'>
			<CodeBlock docsSource code={block.markdown ?? ''} language='mdx' tone='view' />
		</ErrorBoundary>
	);
}
Object.assign(Raw, { displayName: 'DocsRawMarkup' });
