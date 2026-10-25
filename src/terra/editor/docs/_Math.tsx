// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/docs/_Math.tsx
 * Docs math renderer with optional editing controls.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import katex from 'katex';
import { cn } from '../../runtime/runtime.js';
import { createElement as __terraQualityCreateElement, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '@portabletext/editor';

// COMPONENTS
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import { Edit as EditIcon, FunctionMath as MathIcon } from '@carbon/icons-react';
import { ErrorBoundary } from '../../runtime/ui.js';
import { Popover, PopoverContent } from '@terra-symposium/styling/ui/terra-original';
import { Textarea } from '@terra-symposium/styling/ui/terra-original';

// TYPES
import type { BlockTgt } from '../../runtime/types.js';
import type { DocsBlock, PortableTextBlockEditorProps, PortableTextBlockRendererProps } from '../types.js';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/** Sanity Portable Text math expression block fields. */
type MathBlockData = DocsBlock<'math'>;

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Renders the formula display and, when supplied, its edit popover.
 *
 * @param props - Math source, inline or block mode, optional class name, and callback for updating authored source.
 *
 * @return The formatted math expression or editable math control.
 */
export function renderMath({ code, inline, className, write }: { code: string; inline?: boolean; className?: string; write?: (code: string, inline?: boolean) => void }): JSX.Element {
	const [open, setOpen] = useState(false);
	const [val, setVal] = useState(code);
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		setVal(code);
	}, [code]);
	useEffect(() => {
		if (!ref.current || !write) return;
		(ref.current as BlockTgt).__blockActions = [
			{ text: 'Edit Formula', icon: <EditIcon className='mr-2 size-4' aria-hidden='true' />, onSelect: () => setOpen(true) },
			{ text: `Set to ${inline ? 'Display' : 'Inline'}`, icon: <MathIcon className='mr-2 size-4' aria-hidden='true' />, onSelect: () => write(code, !inline) },
		];
	}, [code, inline, write]);
	const math = __terraQualityCreateElement(inline ? 'span' : 'div', {
		className: cn('docs-math', !inline && 'my-4 flex w-full justify-center overflow-x-auto', className),
		dangerouslySetInnerHTML: {
			__html: useMemo(() => {
				if (!code) return '';
				try {
					return katex.renderToString(code, { throwOnError: false, displayMode: !inline, strict: false });
				} catch (err) {
					return `<span class="text-red-500">${String(err)}</span>`;
				}
			}, [code, inline]),
		},
	});
	if (!write) return math;
	return (
		<ErrorBoundary name='MathBlock'>
			<Popover open={open} onOpenChange={setOpen}>
				<span
					ref={ref}
					className={cn('docs-math-wrapper relative cursor-context-menu select-none outline-none ring-0', inline ? 'inline-block' : 'block')}
					contentEditable={false}
					data-docs-editor-block='math'
					data-math-inline={inline ? 'true' : 'false'}
					data-math-code={code}
				>
					<PopoverPrimitive.Anchor className={cn('pointer-events-none', inline ? 'inline-block' : 'block')}>{math}</PopoverPrimitive.Anchor>
				</span>
				<PopoverContent
					align='center'
					className='not-prose z-[120] w-96 space-y-4'
					onClick={e => e.stopPropagation()}
					onInteractOutside={e => {
						if ((e.target as HTMLElement).closest('[data-radix-popper-content-wrapper], [data-radix-menu-content]')) e.preventDefault();
					}}
				>
					<div className='space-y-2'>
						<h4 className='text-sm font-semibold'>Edit LaTeX Formula</h4>
						<Textarea aria-label='LaTeX formula' value={val} onChange={e => setVal(e.target.value)} placeholder="f'(x) = ..." className='h-32 font-mono text-xs' />
					</div>
					<div className='flex justify-end gap-2'>
						<Button
							variant='ghost'
							size='sm'
							onClick={() => {
								setVal(code);
								setOpen(false);
							}}
						>
							Cancel
						</Button>
						<Button
							variant='default'
							size='sm'
							onClick={() => {
								write(val, inline);
								setOpen(false);
							}}
						>
							Save Formula
						</Button>
					</div>
				</PopoverContent>
			</Popover>
		</ErrorBoundary>
	);
}

/**
 * Renders a Docs math block from its authored block.
 *
 * @param props - Authored expression and display mode from the math block.
 *
 * @return The rendered math expression.
 */
function MathBlock({ block }: { block: MathBlockData }): JSX.Element {
	return renderMath({ code: block.code ?? '', inline: Boolean(block.inline) });
}
Object.assign(MathBlock, { displayName: 'DocsMathPreview' });

/** Adapts Portable Text's block-object contract to the math renderer. */
/**
 * Renders the renderMathBlock component.
 *
 * @param props - Portable Text renderer attributes, nested children, math node, path, and read-only mode.
 *
 * @return The math block renderer in editable or read-only mode.
 */
export function renderMathBlock({ attributes: attrs, children, node, path, readOnly }: PortableTextBlockRendererProps<MathBlockData>): JSX.Element {
	return readOnly ? <MathBlock block={node} /> : <MathEditor attributes={attrs} children={children} node={node} path={path} />;
}
Object.assign(renderMathBlock, { displayName: 'DocsMathRenderer' });

/** Connects the math block's local controls to its Portable Text state. */
/**
 * Renders the MathEditor component.
 *
 * @param props - Portable Text editor attributes, nested children, math node, and path used to update the expression.
 *
 * @return The editable math expression controls.
 */
function MathEditor(props: PortableTextBlockEditorProps<MathBlockData>): JSX.Element {
	return <MathEditorContent {...props} editor={useEditor()} />;
}
Object.assign(MathEditor, { displayName: 'DocsMathEditor' });

/**
 * Renders math controls using the editor context supplied by the Portable Text boundary.
 *
 * @param props - Portable Text attributes, children, math node, path, and editor context.
 *
 * @return The math block controls and any nested editor content.
 */
function MathEditorContent({ attributes: attrs, children, node, path, editor }: PortableTextBlockEditorProps<MathBlockData> & { editor: ReturnType<typeof useEditor> }): JSX.Element {
	const math = node as { code?: string; inline?: boolean };
	return (
		<div {...attrs} contentEditable={false} data-terra-block='math'>
			{renderMath({
				code: math.code ?? '',
				...(math.inline === undefined ? {} : { inline: math.inline }),
				write: (code, inline) => editor.send({ type: 'block.set', at: path, props: { code, inline } }),
			})}
			{children}
		</div>
	);
}
Object.assign(MathEditorContent, { displayName: 'DocsMathEditorContent' });
