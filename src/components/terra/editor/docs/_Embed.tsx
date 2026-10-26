// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/docs/_Embed.tsx
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// COMPONENTS
import { ErrorBoundary } from '../../runtime/ui.js';

// TYPES
import type { DocsBlock } from '../types.js';

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Renders the embed component.
 *
 * @param props - Embed block data containing the external source and title.
 *
 * @return Embedded content, or null when no source is available.
 */
export function Embed({ block }: { block: /** Sanity Portable Text embed URL and presentation data. */ DocsBlock<'embed'> }): JSX.Element | null {
	if (!block.src) return null;
	return (
		<ErrorBoundary name='Embed'>
			<iframe className='my-6 w-full border-0' src={block.src} title={block.title ?? block.src} style={{ height: block.height ?? '500px', width: block.width ?? '100%' }} />
		</ErrorBoundary>
	);
}
Object.assign(Embed, { displayName: 'DocsEmbed' });
