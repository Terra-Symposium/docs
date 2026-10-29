import {
  EditorProvider,
  PortableTextEditable,
  defineBlockObject,
  defineInlineObject,
} from '@portabletext/editor';
import { EventListenerPlugin, NodePlugin } from '@portabletext/editor/plugins';
import { createDocsSchema, safeLink } from '../../../lib/schema.js';
import type { DocsBlockOptions } from '../../blocks.js';
import { Toolbar } from '../../_Toolbar.js';
import { Embed } from './docs/_Embed.js';
import { renderCallout } from './docs/_Callout.js';
import { renderCode } from './docs/_DocsCode.js';
import { renderImage } from './docs/_DocsImage.js';
import { renderMathBlock } from './docs/_Math.js';
import MathInline from './docs/_math_inline.js';
import { NodesBlock } from './docs/_Nodes.js';
import { Raw } from './docs/_Raw.js';
import { renderTable } from './docs/_Table.js';
import { renderSections } from './docs/_Tabs.js';
import { TsDocs } from './docs/_TsDocs.js';
import { DocsHeading } from './docs/heading.js';
import { createElement } from 'react';
import type { JSX } from 'react';

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
    <div {...attributes}>
      <NodesBlock block={node} />
      {children}
    </div>
  ),
  raw: ({ attributes, children, node }) => (
    <div {...attributes}>
      <Raw block={node} />
      {children}
    </div>
  ),
  table: renderTable,
  tabs: renderSections,
  tsDocs: ({ attributes, children, node }) => (
    <div {...attributes}>
      <TsDocs block={node} />
      {children}
    </div>
  ),
};

function docsNodes(): any[] {
  const blocks = Object.entries(rendererByType).map(([type, render]) =>
    defineBlockObject({ type, render: (props) => render(props as any) ?? <></> }),
  );
  blocks.push(
    defineInlineObject({ type: 'math', render: (props) => <MathInline {...props} /> }) as any,
  );
  return blocks;
}

/** Docs-only Portable Text profile extracted from the website's shared editor. */
export function TerraContentEditor({
  content = [],
  onChange,
  readOnly = false,
  resetKey,
  nested = false,
  toolbar = false,
}: {
  content?: any[];
  onChange?: (content: any[]) => void;
  readOnly?: boolean;
  resetKey?: string;
  nested?: boolean;
  toolbar?: boolean;
  [key: string]: any;
}): JSX.Element {
  const nestedBlocks: DocsBlockOptions = { accordion: false, callout: false, tabs: false };
  return (
    <div data-terra-content-editor>
      <EditorProvider
        key={resetKey}
        initialConfig={{
          schemaDefinition: createDocsSchema(nested ? nestedBlocks : undefined),
          initialValue: content,
          readOnly,
        }}
      >
        <EventListenerPlugin
          on={(event) => {
            if (event.type === 'mutation' && !readOnly) onChange?.(event.value ?? []);
          }}
        />
        <NodePlugin nodes={docsNodes()} />
        {toolbar && <Toolbar blocks={nested ? nestedBlocks : undefined} />}
        <PortableTextEditable
          aria-label={readOnly ? 'Document viewer' : 'Document editor'}
          contentEditable={!readOnly}
          className="terra-docs-content outline-none"
          renderStyle={({ children, schemaType }) => {
            const style = schemaType.value;
            if (style === 'blockquote') return <blockquote>{children}</blockquote>;
            if (readOnly && typeof style === 'string' && /^h[2-6]$/.test(style))
              return (
                <DocsHeading level={style as 'h2' | 'h3' | 'h4' | 'h5' | 'h6'}>
                  {children}
                </DocsHeading>
              );
            if (typeof style === 'string' && /^h[1-6]$/.test(style))
              return createElement(style, {}, children);
            return <p>{children}</p>;
          }}
          renderDecorator={({ children, value }) =>
            value === 'strong' ? (
              <strong>{children}</strong>
            ) : value === 'em' ? (
              <em>{children}</em>
            ) : value === 'underline' ? (
              <u>{children}</u>
            ) : value === 'strike-through' ? (
              <s>{children}</s>
            ) : value === 'code' ? (
              <code>{children}</code>
            ) : (
              <>{children}</>
            )
          }
          renderAnnotation={({ children, value }) => {
            const href = safeLink(value.href);
            return href ? <a href={href}>{children}</a> : <>{children}</>;
          }}
        />
      </EditorProvider>
    </div>
  );
}
