import {
  defineBlockObject,
  defineInlineObject,
  defineTextBlock,
  EditorProvider,
  PortableTextEditable,
  useEditor,
  useEditorSelector,
} from '@portabletext/editor';
import * as selectors from '@portabletext/editor/selectors';
import { createElement, useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import type { PortableTextBlock } from '@portabletext/editor';
import { NodePlugin } from '@portabletext/editor/plugins';
import { DOCS_BLOCK_TYPES } from '../../blocks.js';
import type { DocsBlockOptions, DocsBlockType } from '../../blocks.js';
import { BlockContext } from './docs/BlockContext.js';
import { TERRA_CONTENT_PROSE_CLASS } from './terra-content.styles.js';
import { renderCallout } from './docs/_Callout.js';
import { renderCode } from './docs/_DocsCode.js';
import { renderImage } from './docs/_DocsImage.js';
import { Embed } from './docs/_Embed.js';
import { renderMathBlock } from './docs/_Math.js';
import { NodesBlock } from './docs/_Nodes.js';
import { Raw } from './docs/_Raw.js';
import { renderTable } from './docs/_Table.js';
import { renderSections } from './docs/_Tabs.js';
import { TsDocs } from './docs/_TsDocs.js';
import MathInline from './docs/_math_inline.js';
import { DocsHeading } from './docs/heading.js';
import { TerraToolbar } from './docs/TerraToolbar.js';
import type { DocsHostAttachment } from '../../../lib/host.js';
import { createDocsSchema, safeLink } from '../../../lib/schema.js';
import { ErrorBoundary } from '../ui.js';

type ContentMember = Record<string, any> & { _key?: string; _type: string };
type EditorValue = PortableTextBlock[];

const containerTypes = new Set(['accordion', 'callout', 'tabs']);
const INLINE_CODE_MARK = 'terra-inline-code';

const rendererByType: Record<string, (props: any) => JSX.Element | null> = {
  accordion: renderSections,
  callout: renderCallout,
  code: renderCode,
  docImage: renderImage,
  embed: ({ attributes, children, node }) => (
    <div {...attributes} data-docs-editor-block="Embed">
      <Embed block={node} />
      {children}
    </div>
  ),
  math: renderMathBlock,
  nodes: ({ attributes, children, node }) => (
    <div {...attributes} data-docs-editor-block="Diagram">
      <NodesBlock block={node} />
      {children}
    </div>
  ),
  raw: ({ attributes, children, node }) => (
    <div {...attributes} data-docs-editor-block="Raw Markdown">
      <Raw block={node} />
      {children}
    </div>
  ),
  table: renderTable,
  tabs: renderSections,
  tsDocs: ({ attributes, children, node }) => (
    <div {...attributes} data-docs-editor-block="TypeScript docs">
      <TsDocs block={node} />
      {children}
    </div>
  ),
};

function isMember(value: unknown): value is ContentMember {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { _type?: unknown })._type === 'string',
  );
}

function isPreservedMember(value: unknown): value is ContentMember {
  return isMember(value) && typeof value._key === 'string';
}

function fallbackInline(value: ContentMember): ContentMember {
  return {
    ...(value._key ? { _key: value._key } : {}),
    _type: 'todoInline',
    source: value,
  };
}

function normalizeTextChildren(
  value: unknown,
  options: DocsBlockOptions,
  blockKey?: string,
): unknown[] {
  if (typeof value === 'string') {
    value = value
      ? [
          {
            _key: `${blockKey ?? 'docs-block'}-text`,
            _type: 'span',
            marks: [],
            text: value,
          },
        ]
      : [];
  }
  if (!Array.isArray(value)) return [];
  return value.map((child) => {
    if (!isMember(child)) return child;
    if (child._type === 'span') {
      const marks = Array.isArray(child.marks) ? child.marks : [];
      return {
        ...child,
        marks: marks.map((mark: unknown) => (mark === 'code' ? INLINE_CODE_MARK : mark)),
      };
    }
    if (child._type === 'todoInline') return child;
    if (child._type === 'math' && options.inlineMath !== false) return child;
    return fallbackInline(child);
  });
}

function normalizeNestedContent(value: unknown, options: DocsBlockOptions): unknown {
  return Array.isArray(value) ? toEditorValue(value, options) : value;
}

/** Translate the stored Terra text-block alias into Portable Text's editor member. */
function toEditorValue(value: unknown[], options: DocsBlockOptions = {}): EditorValue {
  return value.filter(isMember).map((member) => {
    if (member._type === 'block' || member._type === 'terraBlock') {
      const { c, children, ...rest } = member;
      return {
        ...rest,
        _type: 'block',
        children: normalizeTextChildren(
          typeof children === 'string'
            ? children
            : Array.isArray(children) && children.length > 0
              ? children
              : c,
          options,
          typeof member._key === 'string' ? member._key : undefined,
        ),
      } as unknown as PortableTextBlock;
    }
    if (member._type === 'todoBlock') return member as unknown as PortableTextBlock;
    if (DOCS_BLOCK_TYPES.includes(member._type as DocsBlockType)) {
      if (options[member._type as DocsBlockType] === false)
        return {
          _key: member._key,
          _type: 'todoBlock',
          source: member,
        } as unknown as PortableTextBlock;
      if (member._type === 'callout')
        return {
          ...member,
          content: normalizeNestedContent(member.content, options),
        } as unknown as PortableTextBlock;
      if (member._type === 'tabs' || member._type === 'accordion')
        return {
          ...member,
          items: Array.isArray(member.items)
            ? member.items.map((item: unknown) =>
                isMember(item)
                  ? { ...item, content: normalizeNestedContent(item.content, options) }
                  : item,
              )
            : member.items,
        } as unknown as PortableTextBlock;
      if (member._type === 'table')
        return {
          ...member,
          rows: Array.isArray(member.rows)
            ? member.rows.map((row: unknown) =>
                isMember(row)
                  ? {
                      ...row,
                      cells: Array.isArray(row.cells)
                        ? row.cells.map((cell: unknown) =>
                            isMember(cell)
                              ? {
                                  ...cell,
                                  content: normalizeNestedContent(cell.content, options),
                                }
                              : cell,
                          )
                        : row.cells,
                    }
                  : row,
              )
            : member.rows,
        } as unknown as PortableTextBlock;
      return member as unknown as PortableTextBlock;
    }
    return {
      _key: member._key,
      _type: 'todoBlock',
      source: member,
    } as unknown as PortableTextBlock;
  });
}

function restoreTextChildren(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((child) => {
    if (!isMember(child)) return child;
    if (child._type === 'todoInline' && isPreservedMember(child.source)) return child.source;
    if (child._type === 'span' && Array.isArray(child.marks))
      return {
        ...child,
        marks: child.marks.map((mark: unknown) => (mark === INLINE_CODE_MARK ? 'code' : mark)),
      };
    return child;
  });
}

/** Restore editor aliases and recursively preserve nested Portable Text source. */
function toTerraValue(value: EditorValue): unknown[] {
  return value.map((block) => {
    const member = block as unknown as ContentMember;
    if (member._type === 'block')
      return {
        ...member,
        _type: 'terraBlock',
        children: restoreTextChildren(member.children),
      };
    if (member._type === 'todoBlock' && isPreservedMember(member.source)) return member.source;
    if (member._type === 'callout')
      return {
        ...member,
        content: Array.isArray(member.content)
          ? toTerraValue(member.content as EditorValue)
          : member.content,
      };
    if (member._type === 'tabs' || member._type === 'accordion')
      return {
        ...member,
        items: Array.isArray(member.items)
          ? member.items.map((item: unknown) =>
              isMember(item)
                ? {
                    ...item,
                    content: Array.isArray(item.content)
                      ? toTerraValue(item.content as EditorValue)
                      : item.content,
                  }
                : item,
            )
          : member.items,
      };
    if (member._type === 'table')
      return {
        ...member,
        rows: Array.isArray(member.rows)
          ? member.rows.map((row: unknown) =>
              isMember(row)
                ? {
                    ...row,
                    cells: Array.isArray(row.cells)
                      ? row.cells.map((cell: unknown) =>
                          isMember(cell)
                            ? {
                                ...cell,
                                content: Array.isArray(cell.content)
                                  ? toTerraValue(cell.content as EditorValue)
                                  : cell.content,
                              }
                            : cell,
                        )
                      : row.cells,
                  }
                : row,
            )
          : member.rows,
      };
    return member;
  });
}

function renderTextStyle(style: unknown, children: ReactNode, readOnly: boolean): JSX.Element {
  if (style === 'blockquote') return <blockquote>{children}</blockquote>;
  if (typeof style === 'string' && /^h[2-6]$/.test(style) && readOnly)
    return <DocsHeading level={style as 'h2' | 'h3' | 'h4' | 'h5' | 'h6'}>{children}</DocsHeading>;
  if (typeof style === 'string' && /^h[1-6]$/.test(style))
    return createElement(style, {}, children);
  return <p>{children}</p>;
}

function OrderedListItem({
  block,
  children,
  level,
}: {
  block: PortableTextBlock;
  children: ReactNode;
  level: number;
}): JSX.Element {
  const editor = useEditor();
  const value = useEditorSelector(editor, selectors.getValue);
  const index = value.findIndex((candidate) => candidate._key === block._key);
  let start = 1;
  if (index >= 0) {
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      const previous = value[cursor];
      if (!previous?.listItem) break;
      const previousLevel = Number(previous.level ?? 1);
      if (previousLevel < level) break;
      if (previousLevel > level) continue;
      if (previous.listItem !== 'number') break;
      start++;
    }
  }

  return (
    <ol
      className="list-outside list-decimal pl-6 leading-6"
      data-docs-list-level={level}
      start={start}
      style={{ marginInlineStart: `${Math.max(0, level - 1) * 1.5}rem` }}
    >
      <li data-level={level} data-list-item="number">
        {children}
      </li>
    </ol>
  );
}

function TerraTextBlock({ attributes, children, node, readOnly }: any): JSX.Element {
  const content = renderTextStyle(node.style, children, readOnly);
  if (!node.listItem)
    return (
      <div {...attributes} data-level={node.level} data-style={node.style}>
        {content}
      </div>
    );
  return (
    <div {...attributes} data-level={node.level ?? 1} data-list-item={node.listItem}>
      {node.listItem === 'number' ? (
        <OrderedListItem block={node} level={node.level ?? 1}>
          {content}
        </OrderedListItem>
      ) : (
        <ul
          className="list-outside list-disc pl-6 leading-6"
          data-docs-list-level={node.level ?? 1}
          style={{ marginInlineStart: `${Math.max(0, (node.level ?? 1) - 1) * 1.5}rem` }}
        >
          <li data-level={node.level ?? 1} data-list-item={node.listItem}>
            {content}
          </li>
        </ul>
      )}
    </div>
  );
}

function UnsupportedBlock({ attributes, children, node }: any): JSX.Element {
  const source = isPreservedMember(node.source) ? node.source : node;
  return (
    <div {...attributes} contentEditable={false} data-docs-unsupported-block={source._type}>
      <p className="text-sm text-primary-10">
        Unsupported document block ({source._type}) retained in source.
      </p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-primary-5 p-3 text-xs">
        {JSON.stringify(source, null, 2)}
      </pre>
      {children}
    </div>
  );
}

function UnsupportedInline({ attributes, children, node }: any): JSX.Element {
  const source = isPreservedMember(node.source) ? node.source : node;
  return (
    <span {...attributes} contentEditable={false} data-docs-unsupported-inline={source._type}>
      {source.text ?? `[Unsupported ${source._type}]`}
      {children}
    </span>
  );
}

function ContentChangeListener({ onChange }: { onChange: (content: unknown[]) => void }): null {
  const value = useEditorSelector(useEditor(), (snapshot) => snapshot.context.value);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    onChange(toTerraValue(value as EditorValue));
  }, [onChange, value]);
  return null;
}

function validateNesting(value: unknown, depth = 0): true | string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = validateNesting(item, depth);
      if (result !== true) return result;
    }
  } else if (value && typeof value === 'object') {
    const member = value as Record<string, unknown>;
    const nextDepth =
      depth + (typeof member._type === 'string' && containerTypes.has(member._type) ? 1 : 0);
    if (nextDepth > 1)
      return 'Tabs, accordions, and callouts cannot be nested inside another tabs, accordion, or callout block.';
    for (const child of Object.values(member)) {
      const result = validateNesting(child, nextDepth);
      if (result !== true) return result;
    }
  }
  return true;
}

/** Portable Docs editor profile extracted from Terra's shared content editor. */
export function TerraContentEditor({
  content = [],
  onChange,
  readOnly = false,
  resetKey,
  nested = false,
  toolbar = true,
  docsAttachments = [],
  toolbarActions,
  blocks = {},
}: {
  content?: unknown[];
  onChange?: (content: unknown[]) => void;
  readOnly?: boolean;
  resetKey?: string;
  nested?: boolean;
  toolbar?: boolean;
  docsAttachments?: DocsHostAttachment[];
  toolbarActions?: ReactNode;
  blocks?: DocsBlockOptions;
}): JSX.Element {
  const [nestingError, setNestingError] = useState<string | undefined>(undefined);
  const [rejectedChanges, setRejectedChanges] = useState(0);
  const updateContent = (value: unknown[]): void => {
    const result = validateNesting(value, nested ? 1 : 0);
    if (result !== true) {
      setNestingError(result);
      setRejectedChanges((count: number) => count + 1);
      return;
    }
    setNestingError(undefined);
    onChange?.(value);
  };
  const nodes = [
    defineTextBlock({
      type: 'block',
      render: (props) => <TerraTextBlock {...props} />,
    }),
    ...Object.entries(rendererByType)
      .filter(([type]) => blocks[type as DocsBlockType] !== false)
      .map(([type, render]) =>
        defineBlockObject({ type, render: (props) => render(props as any) ?? <></> }),
      ),
    ...(blocks.inlineMath === false
      ? []
      : [defineInlineObject({ type: 'math', render: (props) => <MathInline {...props} /> })]),
    defineBlockObject({ type: 'todoBlock', render: (props) => <UnsupportedBlock {...props} /> }),
    defineInlineObject({ type: 'todoInline', render: (props) => <UnsupportedInline {...props} /> }),
  ];
  return (
    <ErrorBoundary name="TerraContent">
      <EditorProvider
        key={`${resetKey ?? ''}:${rejectedChanges}`}
        initialConfig={{
          initialValue: toEditorValue(content, blocks),
          readOnly,
          schemaDefinition: createDocsSchema(blocks),
        }}
      >
        <NodePlugin nodes={nodes} />
        {!readOnly && <ContentChangeListener onChange={updateContent} />}
        {!readOnly && toolbar && (
          <div className="not-prose sticky top-3 z-20 mb-3">
            <TerraToolbar
              nested={nested}
              actions={toolbarActions}
              attachments={docsAttachments}
              blocks={blocks}
              onChange={(value) => updateContent(toTerraValue(value as EditorValue))}
            />
          </div>
        )}
        {nestingError && <p role="alert">{nestingError}</p>}
        <BlockContext enabled={!readOnly}>
          <section
            aria-label={readOnly ? 'Terra content preview' : 'Terra content editor'}
            className="bg-transparent"
            data-terra-content-editor
          >
            <div className={nested ? (readOnly ? '' : 'my-4 min-h-24') : 'my-6 min-h-96'}>
              <PortableTextEditable
                aria-label={readOnly ? 'Document viewer' : 'Document editor'}
                aria-readonly={readOnly || undefined}
                className={`terra-docs-content ${TERRA_CONTENT_PROSE_CLASS} outline-none`}
                contentEditable={!readOnly}
                renderListItem={({ block, children, level, value }) => {
                  const item = (
                    <li data-level={level} data-list-item={value}>
                      {children}
                    </li>
                  );
                  return value === 'number' ? (
                    <OrderedListItem block={block} level={level}>
                      {children}
                    </OrderedListItem>
                  ) : (
                    <ul
                      className="list-outside list-disc pl-6 leading-6"
                      data-docs-list-level={level}
                      style={{ marginInlineStart: `${Math.max(0, level - 1) * 1.5}rem` }}
                    >
                      {item}
                    </ul>
                  );
                }}
                renderAnnotation={({ children, value }) => {
                  const href = safeLink(value.href);
                  return href ? <a href={href}>{children}</a> : <>{children}</>;
                }}
                renderBlock={({ children }) => <>{children}</>}
                renderDecorator={({ children, value }) => {
                  if (value === 'strong') return <strong>{children}</strong>;
                  if (value === 'em') return <em>{children}</em>;
                  if (value === 'underline') return <u>{children}</u>;
                  if (value === 'strike-through') return <s>{children}</s>;
                  if (value === INLINE_CODE_MARK) return <code>{children}</code>;
                  return <>{children}</>;
                }}
                renderStyle={({ children, schemaType }) =>
                  renderTextStyle(schemaType.value, children, readOnly)
                }
              />
            </div>
          </section>
        </BlockContext>
      </EditorProvider>
    </ErrorBoundary>
  );
}
