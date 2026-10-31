import { defineBlockObject, defineInlineObject, useEditor } from '@portabletext/editor';
import { useState } from 'react';
import katex from 'katex';
import { docsValueToMarkdown } from '../lib/markdown-model.js';
import { renderMarkdown } from '../lib/markdown.js';
import type { JSX, ReactNode } from 'react';
import type { Path } from '@portabletext/editor';

/** The portable Docs members. A host can disable any member without changing stored data. */
export const DOCS_BLOCK_TYPES = [
  'accordion',
  'tabs',
  'table',
  'callout',
  'code',
  'docImage',
  'embed',
  'math',
  'nodes',
  'raw',
  'tsDocs',
] as const;
export type DocsBlockType = (typeof DOCS_BLOCK_TYPES)[number];
export type DocsBlockOptions = Partial<Record<DocsBlockType | 'inlineMath', boolean>>;
export type RichBlock = { _type: string; _key?: string; markdown?: string; [key: string]: unknown };

export function enabledDocsBlocks(options: DocsBlockOptions = {}): DocsBlockType[] {
  return DOCS_BLOCK_TYPES.filter((type) => options[type] !== false);
}

export const DOCS_BLOCK_FIELDS: Record<
  DocsBlockType,
  { name: string; type: 'string' | 'number' | 'boolean' | 'array' | 'object' }[]
> = {
  accordion: [
    { name: 'items', type: 'array' },
    { name: 'markdown', type: 'string' },
  ],
  tabs: [
    { name: 'items', type: 'array' },
    { name: 'markdown', type: 'string' },
  ],
  table: [
    { name: 'header', type: 'string' },
    { name: 'rows', type: 'array' },
    { name: 'markdown', type: 'string' },
  ],
  callout: [
    { name: 'kind', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'content', type: 'array' },
    { name: 'markdown', type: 'string' },
  ],
  code: [
    { name: 'language', type: 'string' },
    { name: 'source', type: 'string' },
    { name: 'value', type: 'string' },
    { name: 'markdown', type: 'string' },
  ],
  docImage: [
    { name: 'alt', type: 'string' },
    { name: 'url', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'width', type: 'string' },
    { name: 'height', type: 'string' },
    { name: 'markdown', type: 'string' },
  ],
  embed: [
    { name: 'src', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'width', type: 'string' },
    { name: 'height', type: 'string' },
    { name: 'markdown', type: 'string' },
  ],
  math: [
    { name: 'code', type: 'string' },
    { name: 'inline', type: 'boolean' },
    { name: 'markdown', type: 'string' },
  ],
  nodes: [
    { name: 'nodes', type: 'array' },
    { name: 'edges', type: 'array' },
    { name: 'direction', type: 'string' },
    { name: 'height', type: 'number' },
    { name: 'nodeSep', type: 'number' },
    { name: 'rankSep', type: 'number' },
    { name: 'proximityConnect', type: 'boolean' },
    { name: 'markdown', type: 'string' },
  ],
  raw: [{ name: 'markdown', type: 'string' }],
  tsDocs: [
    { name: 'scope', type: 'string' },
    { name: 'markdown', type: 'string' },
  ],
};

const defaults: Record<DocsBlockType, RichBlock> = {
  accordion: { _type: 'accordion', items: [{ title: 'Item', content: [] }] },
  tabs: { _type: 'tabs', items: [{ title: 'Tab', content: [] }] },
  table: { _type: 'table', header: 'Table', rows: [] },
  callout: { _type: 'callout', kind: 'info', title: 'Note', content: [] },
  code: { _type: 'code', language: 'text', value: '' },
  docImage: { _type: 'docImage', alt: '', url: '' },
  embed: { _type: 'embed', src: '', title: '' },
  math: { _type: 'math', code: '', inline: false },
  nodes: { _type: 'nodes', nodes: [], edges: [], direction: 'TB' },
  raw: { _type: 'raw', markdown: '' },
  tsDocs: { _type: 'tsDocs', scope: '' },
};
export function defaultDocsBlock(type: DocsBlockType): RichBlock {
  return structuredClone(defaults[type]);
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(text).join(' ');
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return text(item.markdown ?? item.text ?? item.children ?? item.content ?? '');
  }
  return '';
}
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value, 'https://docs.invalid');
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

function renderPortableTextChild(
  child: unknown,
  markDefinitions: Map<string, Record<string, unknown>>,
  key: string,
): JSX.Element | string | null {
  if (!child || typeof child !== 'object') return null;
  const member = child as Record<string, unknown>;
  if (member._type === 'math') return <DocsRichBlock key={key} block={member as RichBlock} />;
  if (member._type !== 'span') return null;

  const textValue = typeof member.text === 'string' ? member.text : '';
  let node: ReactNode = textValue
    .split('\n')
    .flatMap((line, index) => (index ? [<br key={`${key}-br-${index}`} />, line] : [line]));
  const marks = Array.isArray(member.marks) ? member.marks : [];
  for (const mark of marks) {
    if (typeof mark !== 'string') continue;
    if (mark === 'strong') node = <strong key={`${key}-strong`}>{node}</strong>;
    else if (mark === 'em') node = <em key={`${key}-em`}>{node}</em>;
    else if (mark === 'underline') node = <u key={`${key}-underline`}>{node}</u>;
    else if (mark === 'strike-through') node = <del key={`${key}-strike`}>{node}</del>;
    else if (mark === 'code') node = <code key={`${key}-code`}>{node}</code>;
    else {
      const definition = markDefinitions.get(mark);
      const href = safeUrl(definition?.href);
      if (href)
        node = (
          <a key={`${key}-link`} href={href}>
            {node}
          </a>
        );
    }
  }
  return <span key={key}>{node}</span>;
}

function PortableTextBlockView({ block }: { block: RichBlock }): JSX.Element {
  const style = typeof block.style === 'string' ? block.style : 'normal';
  const Tag = /^h[2-6]$/.test(style)
    ? (style as 'h2' | 'h3' | 'h4' | 'h5' | 'h6')
    : style === 'blockquote'
      ? 'blockquote'
      : 'p';
  const definitions = Array.isArray(block.markDefs) ? block.markDefs : [];
  const markDefinitions = new Map(
    definitions.flatMap((item) =>
      item && typeof item === 'object' && typeof item._key === 'string'
        ? [[item._key, item as Record<string, unknown>] as const]
        : [],
    ),
  );
  const children = Array.isArray(block.children) ? block.children : [];
  const rendered = children.map((child, index) =>
    renderPortableTextChild(child, markDefinitions, `portable-${index}`),
  );
  if (block.listItem === 'bullet')
    return (
      <ul>
        <li>{rendered}</li>
      </ul>
    );
  if (block.listItem === 'number')
    return (
      <ol>
        <li>{rendered}</li>
      </ol>
    );
  return <Tag>{rendered}</Tag>;
}
function nestedMarkdown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return docsValueToMarkdown(value as never).trimEnd();
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    if (typeof item.markdown === 'string' && item.markdown) return item.markdown;
    if (Array.isArray(item.content)) return docsValueToMarkdown(item.content as never).trimEnd();
    return text(item);
  }
  return '';
}
function Diagram({ block }: { block: RichBlock }): JSX.Element {
  const nodes = (Array.isArray(block.nodes) ? block.nodes : []).filter(
    (node): node is Record<string, unknown> => Boolean(node) && typeof node === 'object',
  );
  const edges = (Array.isArray(block.edges) ? block.edges : []).filter(
    (edge): edge is Record<string, unknown> => Boolean(edge) && typeof edge === 'object',
  );
  const horizontal = block.direction === 'LR';
  const width = horizontal ? Math.max(320, nodes.length * 180) : 320;
  const height = horizontal ? 140 : Math.max(140, nodes.length * 100);
  const positions = new Map(
    nodes.map((node, index) => [
      String(node.id ?? index),
      horizontal ? { x: 90 + index * 180, y: 70 } : { x: 160, y: 70 + index * 100 },
    ]),
  );
  return (
    <figure className="terra-docs-diagram">
      <svg role="img" aria-label="Document diagram" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <marker
            id="terra-docs-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
          </marker>
        </defs>
        {edges.map((edge, i) => {
          const from = positions.get(String(edge.source ?? ''));
          const to = positions.get(String(edge.target ?? ''));
          return from && to ? (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="currentColor"
              markerEnd="url(#terra-docs-arrow)"
            />
          ) : null;
        })}
        {nodes.map((node, i) => {
          const point = positions.get(String(node.id ?? i))!;
          const data =
            node.data && typeof node.data === 'object'
              ? (node.data as Record<string, unknown>)
              : {};
          return (
            <g key={i}>
              <rect
                x={point.x - 75}
                y={point.y - 24}
                width="150"
                height="48"
                rx="7"
                fill="white"
                stroke="currentColor"
              />
              <text x={point.x} y={point.y + 5} textAnchor="middle">
                {text(data.title ?? node.id)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        {nodes.length} nodes, {edges.length} connections
      </figcaption>
    </figure>
  );
}

/** Read-only rendering for every reusable Terra Docs member. Unknown data stays in the value. */
export function DocsRichBlock({ block }: { block: RichBlock }): JSX.Element {
  const items = Array.isArray(block.items) ? (block.items as Record<string, unknown>[]) : [];
  switch (block._type) {
    case 'block':
    case 'terraBlock':
      return <PortableTextBlockView block={block} />;
    case 'accordion':
      return (
        <div className="terra-docs-accordions">
          {items.map((item, i) => (
            <details key={i}>
              <summary>{text(item.title)}</summary>
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(nestedMarkdown(item)) }} />
            </details>
          ))}
        </div>
      );
    case 'tabs':
      return (
        <div className="terra-docs-tabs" role="tablist">
          {items.map((item, i) => (
            <details key={i} open={i === 0}>
              <summary>{text(item.title)}</summary>
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(nestedMarkdown(item)) }} />
            </details>
          ))}
        </div>
      );
    case 'table':
      return (
        <section className="terra-docs-table">
          <strong>{text(block.header)}</strong>
          <table>
            <tbody>
              {(Array.isArray(block.rows) ? block.rows : []).map((row, i) => (
                <tr key={i}>
                  {(Array.isArray((row as Record<string, unknown>).cells)
                    ? ((row as Record<string, unknown>).cells as unknown[])
                    : []
                  ).map((cell, j) => (
                    <td
                      key={j}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(nestedMarkdown(cell)) }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      );
    case 'callout':
      return (
        <aside
          className={`terra-docs-callout terra-docs-callout-${text(block.kind).replace(/[^a-z0-9-]/gi, '') || 'info'}`}
        >
          <strong>{text(block.title)}</strong>
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(nestedMarkdown(block)) }} />
        </aside>
      );
    case 'code':
      return (
        <pre className="terra-docs-code">
          <code data-language={text(block.language)}>{text(block.value)}</code>
        </pre>
      );
    case 'docImage':
      return safeUrl(block.url) ? (
        <figure>
          <img src={safeUrl(block.url)} alt={text(block.alt)} />
          <figcaption>{text(block.title)}</figcaption>
        </figure>
      ) : (
        <p>Image URL unavailable</p>
      );
    case 'embed':
      return safeUrl(block.src) ? (
        <iframe
          title={text(block.title) || 'Embedded content'}
          src={safeUrl(block.src)}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      ) : (
        <p>Embed URL unavailable</p>
      );
    case 'math': {
      const code = text(block.code);
      const html = katex.renderToString(code, {
        displayMode: !block.inline,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
      });
      return block.inline ? (
        <span
          className="terra-docs-math"
          aria-label={code}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div
          className="terra-docs-math"
          aria-label={code}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    case 'nodes':
      return <Diagram block={block} />;
    case 'raw':
      return (
        <div
          className="terra-docs-raw"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(text(block.markdown)) }}
        />
      );
    case 'tsDocs':
      return (
        <section className="terra-docs-tsdocs">
          <strong>TypeScript: {text(block.scope)}</strong>
          {block.markdown && <p>{text(block.markdown)}</p>}
        </section>
      );
    default:
      return (
        <pre data-unsupported-block={block._type}>{block.markdown ?? JSON.stringify(block)}</pre>
      );
  }
}

function BlockEditor({
  block,
  path,
  readOnly,
}: {
  block: RichBlock;
  path: Path;
  readOnly: boolean;
}): JSX.Element {
  const editor = useEditor();
  const [expanded, setExpanded] = useState(false);
  const type = block._type as DocsBlockType;
  const fields = DOCS_BLOCK_FIELDS[type] ?? [];
  const set = (props: Record<string, unknown>) =>
    editor.send({ type: 'block.set', at: path, props });
  const update = (field: string, next: unknown) =>
    set({
      [field]: next,
      ...(type === 'callout' && (field === 'title' || field === 'kind')
        ? {}
        : { markdown: field === 'markdown' ? next : '' }),
    });
  const items = Array.isArray(block.items) ? (block.items as Record<string, unknown>[]) : [];
  const rows = Array.isArray(block.rows) ? (block.rows as Record<string, unknown>[]) : [];
  const nodes = Array.isArray(block.nodes) ? (block.nodes as Record<string, unknown>[]) : [];
  const edges = Array.isArray(block.edges) ? (block.edges as Record<string, unknown>[]) : [];
  return (
    <div className="terra-docs-rich-editor">
      <DocsRichBlock block={block} />
      {!readOnly && (
        <>
          <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
            Edit {type}
          </button>
          {expanded && (
            <div className="terra-docs-rich-fields">
              {fields.map((field) => {
                const value = block[field.name];
                if (field.name === 'items')
                  return (
                    <fieldset key="items">
                      <legend>Items</legend>
                      {items.map((item, index) => (
                        <div className="terra-docs-rich-item" key={index}>
                          <label>
                            Title
                            <input
                              value={text(item.title)}
                              onChange={(event) =>
                                set({
                                  items: items.map((entry, i) =>
                                    i === index
                                      ? { ...entry, title: event.currentTarget.value }
                                      : entry,
                                  ),
                                  markdown: '',
                                })
                              }
                            />
                          </label>
                          <label>
                            Content
                            <textarea
                              value={nestedMarkdown(item)}
                              onChange={(event) =>
                                set({
                                  items: items.map((entry, i) =>
                                    i === index
                                      ? { ...entry, markdown: event.currentTarget.value }
                                      : entry,
                                  ),
                                  markdown: '',
                                })
                              }
                            />
                          </label>
                          <button
                            onClick={() =>
                              set({ items: items.filter((_entry, i) => i !== index), markdown: '' })
                            }
                          >
                            Remove item
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() =>
                          set({
                            items: [...items, { title: 'Item', markdown: '', content: [] }],
                            markdown: '',
                          })
                        }
                      >
                        Add item
                      </button>
                    </fieldset>
                  );
                if (field.name === 'rows')
                  return (
                    <fieldset key="rows">
                      <legend>Table rows</legend>
                      {rows.map((row, rowIndex) => {
                        const cells = Array.isArray(row.cells)
                          ? (row.cells as Record<string, unknown>[])
                          : [];
                        return (
                          <div key={rowIndex} className="terra-docs-rich-item">
                            {cells.map((cell, cellIndex) => (
                              <label key={cellIndex}>
                                Cell {cellIndex + 1}
                                <input
                                  value={text(cell.content ?? cell.markdown)}
                                  onChange={(event) =>
                                    set({
                                      rows: rows.map((entry, i) =>
                                        i === rowIndex
                                          ? {
                                              ...entry,
                                              cells: cells.map((current, j) =>
                                                j === cellIndex
                                                  ? {
                                                      ...current,
                                                      markdown: event.currentTarget.value,
                                                      content: [],
                                                    }
                                                  : current,
                                              ),
                                            }
                                          : entry,
                                      ),
                                      markdown: '',
                                    })
                                  }
                                />
                              </label>
                            ))}
                            <button
                              onClick={() =>
                                set({
                                  rows: rows.map((entry, i) =>
                                    i === rowIndex
                                      ? {
                                          ...entry,
                                          cells: [
                                            ...cells,
                                            { _type: 'cell', content: [], markdown: '' },
                                          ],
                                        }
                                      : entry,
                                  ),
                                  markdown: '',
                                })
                              }
                            >
                              Add cell
                            </button>
                            <button
                              onClick={() =>
                                set({
                                  rows: rows.filter((_entry, i) => i !== rowIndex),
                                  markdown: '',
                                })
                              }
                            >
                              Remove row
                            </button>
                          </div>
                        );
                      })}
                      <button
                        onClick={() =>
                          set({
                            rows: [
                              ...rows,
                              {
                                _type: 'row',
                                cells: [{ _type: 'cell', content: [], markdown: '' }],
                              },
                            ],
                            markdown: '',
                          })
                        }
                      >
                        Add row
                      </button>
                    </fieldset>
                  );
                if (field.name === 'nodes')
                  return (
                    <fieldset key="nodes">
                      <legend>Diagram nodes</legend>
                      {nodes.map((node, index) => (
                        <div key={index} className="terra-docs-rich-item">
                          <label>
                            ID
                            <input
                              value={text(node.id)}
                              onChange={(event) =>
                                set({
                                  nodes: nodes.map((entry, i) =>
                                    i === index
                                      ? { ...entry, id: event.currentTarget.value }
                                      : entry,
                                  ),
                                  markdown: '',
                                })
                              }
                            />
                          </label>
                          <label>
                            Title
                            <input
                              value={text(
                                (node.data as Record<string, unknown> | undefined)?.title,
                              )}
                              onChange={(event) =>
                                set({
                                  nodes: nodes.map((entry, i) =>
                                    i === index
                                      ? {
                                          ...entry,
                                          data: {
                                            ...((entry.data as Record<string, unknown>) ?? {}),
                                            title: event.currentTarget.value,
                                          },
                                        }
                                      : entry,
                                  ),
                                  markdown: '',
                                })
                              }
                            />
                          </label>
                          <button
                            onClick={() =>
                              set({ nodes: nodes.filter((_entry, i) => i !== index), markdown: '' })
                            }
                          >
                            Remove node
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() =>
                          set({
                            nodes: [
                              ...nodes,
                              { id: crypto.randomUUID(), type: 'process', data: { title: 'Node' } },
                            ],
                            markdown: '',
                          })
                        }
                      >
                        Add node
                      </button>
                    </fieldset>
                  );
                if (field.name === 'edges')
                  return (
                    <fieldset key="edges">
                      <legend>Connections</legend>
                      {edges.map((edge, index) => (
                        <div key={index} className="terra-docs-rich-item">
                          {(['source', 'target'] as const).map((name) => (
                            <label key={name}>
                              {name}
                              <select
                                value={text(edge[name])}
                                onChange={(event) =>
                                  set({
                                    edges: edges.map((entry, i) =>
                                      i === index
                                        ? { ...entry, [name]: event.currentTarget.value }
                                        : entry,
                                    ),
                                    markdown: '',
                                  })
                                }
                              >
                                {nodes.map((node) => (
                                  <option key={text(node.id)} value={text(node.id)}>
                                    {text(
                                      (node.data as Record<string, unknown> | undefined)?.title ??
                                        node.id,
                                    )}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                          <button
                            onClick={() =>
                              set({ edges: edges.filter((_entry, i) => i !== index), markdown: '' })
                            }
                          >
                            Remove connection
                          </button>
                        </div>
                      ))}
                      <button
                        disabled={nodes.length < 2}
                        onClick={() =>
                          set({
                            edges: [
                              ...edges,
                              {
                                id: crypto.randomUUID(),
                                source: nodes[0]?.id,
                                target: nodes[1]?.id,
                              },
                            ],
                            markdown: '',
                          })
                        }
                      >
                        Add connection
                      </button>
                    </fieldset>
                  );
                if (field.name === 'content')
                  return (
                    <label key="content">
                      Content
                      <textarea
                        value={typeof block.markdown === 'string' ? block.markdown : text(value)}
                        onChange={(event) => set({ markdown: event.currentTarget.value })}
                      />
                    </label>
                  );
                return (
                  <label key={field.name}>
                    {field.name}
                    {field.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) => update(field.name, event.currentTarget.checked)}
                      />
                    ) : (
                      <textarea
                        value={String(value ?? '')}
                        onChange={(event) =>
                          update(
                            field.name,
                            field.type === 'number'
                              ? Number(event.currentTarget.value)
                              : event.currentTarget.value,
                          )
                        }
                      />
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function docsBlockNodes(options: DocsBlockOptions = {}) {
  const nodes = enabledDocsBlocks(options).map((type) =>
    defineBlockObject({
      type,
      render: ({ attributes, children, node, path, readOnly }) => (
        <div {...attributes} data-docs-block={type} contentEditable={false}>
          <BlockEditor block={node as RichBlock} path={path} readOnly={readOnly} />
          {children}
        </div>
      ),
    }),
  );
  if (options.inlineMath !== false)
    nodes.push(
      defineInlineObject({
        type: 'math',
        render: ({ attributes, children, node }) => (
          <span {...attributes} contentEditable={false}>
            <DocsRichBlock block={{ ...(node as RichBlock), _type: 'math', inline: true }} />
            {children}
          </span>
        ),
      }) as never,
    );
  return nodes;
}
