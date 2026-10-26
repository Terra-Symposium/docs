// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/docs/_math_inline.tsx
 * Read-only Docs math inline renderer for the shared Terra content editor.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { renderMath } from './_Math.js';

// TYPES
import type { InlineObjectRenderProps } from '@portabletext/editor';

/*//////////////////////////////////////////////////
COMPONENTS
//////////////////////////////////////////////////*/

/**
 * Renders a read-only Docs formula as an inline Portable Text object.
 *
 * @param props - Portable Text inline-object attributes, children, and node.
 *
 * @return Inline rendered formula.
 */
export default function MathInline({ attributes: attrs, children, node }: InlineObjectRenderProps): React.JSX.Element {
	return (
		<span {...attrs} className='mx-1 inline align-baseline' contentEditable={false} data-terra-inline='math' suppressContentEditableWarning>
			{renderMath({
				code:
					(
						node as /** Optional math source read from the inline Portable Text object's node value. */ {
							code?: string;
						}
					).code || '',
				inline: true,
				className: 'align-baseline',
			})}
			{children}
		</span>
	);
}
Object.assign(MathInline, { displayName: 'DocsMathInline' });
