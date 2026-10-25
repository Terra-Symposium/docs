// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/** Docs table renderer with view and edit modes. */

import { useEditor } from '@portabletext/editor';
import { Add as AddIcon, TrashCan as TrashIcon } from '@carbon/icons-react';
import { TerraContentEditor } from '../TerraContentEditor.js';
import { ErrorBoundary } from '../../runtime/ui.js';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import { Input } from '@terra-symposium/styling/ui/terra-original';
import { isRec } from '../../runtime/runtime.js';

import type { DocTableCell } from '../../runtime/types.js';
import type { TableRow } from '../../runtime/types.js';
import type { DocsBlock, PortableTextBlockEditorProps, PortableTextBlockRendererProps } from '../types.js';
import type { TerraContent as TerraContentData } from '../../runtime/types.js';

/** Sanity Portable Text table rows and headers. */
type TableBlock = DocsBlock<'table'>;
/** Sanity Portable Text table cell content and formatting. */
type TableCell = NonNullable<NonNullable<TableBlock['rows']>[number]['cells']>[number];

const key = (val: unknown, fallback: string): string => (isRec(val) && typeof val._key === 'string' ? val._key : fallback);
const cells = <T,>(vals: T[], count: number): Array<T | undefined> => Array.from({ length: count }, (_cell, i) => vals[i]);
const newKey = (): string => crypto.randomUUID().replaceAll('-', '');
const cell = (text = ''): TableCell => ({
	_key: newKey(),
	_type: 'cell',
	content: text ? [{ _key: newKey(), _type: 'block', children: [{ _key: newKey(), _type: 'span', marks: [], text }], markDefs: [], style: 'normal' }] : [],
});

/** Renders a Docs table and its nested cell content.
 *
 * @param props - Authored table block with its headers, rows, and cell content.
 * @returns The accessible table view.
 */
function Table({ block }: { block: TableBlock }): React.JSX.Element {
	const rows = (block.rows ?? []) as TableRow[];
	const count = rows.reduce((m, r) => Math.max(m, Array.isArray(r.cells) ? r.cells.length : 0), 0);
	const renderCell = (c: DocTableCell | undefined): React.JSX.Element | null =>
		c ? <TerraContentEditor content={(Array.isArray(c.content) ? c.content : []) as unknown as TerraContentData} docsAttachments={[]} memberProfile='docs' nested readOnly /> : null;
	return (
		<ErrorBoundary name='TableBlock'>
			<section className='my-6 overflow-x-auto' data-docs-editor-block='DocsTable'>
				{block.header && block.header !== 'Table' && <h3 className='sr-only'>{block.header}</h3>}
				<table>
					<thead>
						<tr>
							{cells(Array.isArray(rows[0]?.cells) ? rows[0].cells : [], count).map((c, i) => (
								<th key={c ? key(c, `${i}`) : i}>{renderCell(c)}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.slice(1).map((r, v) => {
							return (
								<tr key={key(r, `${v}`)}>
									{cells(Array.isArray(r.cells) ? r.cells : [], count).map((c, i) => (
										<td key={c ? key(c, `${i}`) : i}>{renderCell(c)}</td>
									))}
								</tr>
							);
						})}
					</tbody>
				</table>
			</section>
		</ErrorBoundary>
	);
}
Object.assign(Table, { displayName: 'DocsTablePreview' });

/** Renders editable Docs table controls and cells.
 *
 * @param props - Portable Text editor attributes, nested children, table node, and path used to update rows and cells.
 * @returns The editable table controls and cells.
 */
function TableEditor({ attributes: attrs, children, node, path }: PortableTextBlockEditorProps<TableBlock>): React.JSX.Element {
	const editor = useEditor();
	const block = node;
	const rows = block.rows ?? [];
	const colCount = Math.max(1, ...rows.map(r => r.cells?.length ?? 0));
	const update = (nRows: NonNullable<TableBlock['rows']>): void => editor.send({ type: 'block.set', at: path, props: { rows: nRows } });
	return (
		<ErrorBoundary name='TableEditor'>
			<section {...attrs} contentEditable={false} className='my-6 overflow-x-auto rounded-md border border-primary-5 p-3' data-terra-block='table'>
				<div className='mb-3 flex flex-wrap items-center gap-2'>
					<Input
						aria-label='Table heading'
						className='max-w-sm'
						value={block.header ?? ''}
						onChange={e => editor.send({ type: 'block.set', at: path, props: { header: e.currentTarget.value } })}
						placeholder='Table heading'
					/>
					<Button size='sm' variant='outline' onClick={() => update([...rows, { _key: newKey(), _type: 'row', cells: Array.from({ length: colCount }, () => cell()) }])}>
						<AddIcon aria-hidden='true' /> Row
					</Button>
					<Button size='sm' variant='outline' onClick={() => update(rows.map(r => ({ ...r, cells: [...(r.cells ?? []), cell()] })))}>
						<AddIcon aria-hidden='true' /> Column
					</Button>
				</div>
				<table className='w-full border-collapse text-left'>
					<tbody>
						{rows.map((r, v) => (
							<tr key={r._key}>
								{Array.from({ length: colCount }, (_cell, i) => {
									const Tag = i === 0 ? 'th' : 'td';
									return (
										<Tag key={r.cells?.[i]?._key ?? i} className='border border-primary-5 p-1 align-top'>
											<textarea
												aria-label={`Table cell ${v + 1}, ${i + 1}`}
												className='min-h-10 w-full resize-y bg-transparent p-1 outline-none'
												value={((c: TableCell | undefined) => {
													return Array.isArray(c?.content)
														? c.content.map(b => (Array.isArray(b.children) ? b.children.map(c => ('text' in c && typeof c.text === 'string' ? c.text : '')).join('') : '')).join('\n')
														: '';
												})(r.cells?.[i])}
												onChange={({ currentTarget: { value: text } }) => {
													update(
														rows.map((r, c) => ({
															...r,
															cells: Array.from({ length: colCount }, (_cell, x) => {
																const curr = r.cells?.[x] ?? cell();
																return c === v && x === i ? { ...curr, content: cell(text).content } : curr;
															}),
														})),
													);
												}}
											/>
										</Tag>
									);
								})}
								<td className='w-9 p-1'>
									<Button aria-label={`Delete row ${v + 1}`} size='icon' variant='ghost' onClick={() => update(rows.filter((_row, i) => i !== v))}>
										<TrashIcon aria-hidden='true' />
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{colCount > 1 && (
					<div className='mt-2 flex gap-1'>
						{Array.from({ length: colCount }, (_cell, v) => (
							<Button key={v} size='xs' variant='ghost' onClick={() => update(rows.map(r => ({ ...r, cells: (r.cells ?? []).filter((_cell, i) => i !== v) })))}>
								Delete column {v + 1}
							</Button>
						))}
					</div>
				)}
				{children}
			</section>
		</ErrorBoundary>
	);
}
Object.assign(TableEditor, { displayName: 'DocsTableEditor' });

/** Adapts Portable Text's block-object contract to the table renderer.
 *
 * @param props - Portable Text renderer attributes, nested children, table node, path, and read-only mode.
 * @returns The table renderer in editable or read-only mode.
 */
export function renderTable({ attributes: attrs, children, node, path, readOnly }: PortableTextBlockRendererProps<TableBlock>): React.JSX.Element {
	return readOnly ? <Table block={node} /> : <TableEditor attributes={attrs} children={children} node={node} path={path} />;
}
Object.assign(renderTable, { displayName: 'DocsTableRenderer' });
