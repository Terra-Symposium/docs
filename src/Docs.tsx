import { EditorProvider, PortableTextEditable, useEditor } from '@portabletext/editor';
import { EventListenerPlugin, NodePlugin } from '@portabletext/editor/plugins';
import { useEffect } from 'react';
import { Toolbar } from './_Toolbar.js';
import { safeLink, createDocsSchema } from './schema.js';
import { docsBlockNodes } from './blocks.js';
import type { DocsBlockOptions } from './blocks.js';
import type { PortableTextBlock } from '@portabletext/editor';
import type { JSX } from 'react';

/** Portable Text blocks supplied and retained by the host application. */
export type DocsValue = PortableTextBlock[];

/** Selects editing or read-only rendering. */
export type DocsMode = 'edit' | 'view';

/** Controlled content with editing callbacks available only in edit mode. */
export type DocsProps = {
  value: DocsValue;
  className?: string;
  blocks?: DocsBlockOptions;
} & ({ mode: 'edit'; onChange: (value: DocsValue) => void } | { mode: 'view'; onChange?: never });

/** A minimal standalone version of TerraContentEditor's Portable Text surface. */
export function Docs(props: DocsProps): JSX.Element {
  return (
    <div className={['terra-docs', props.className].filter(Boolean).join(' ')}>
      <EditorProvider
        initialConfig={{
          schemaDefinition: createDocsSchema(props.blocks),
          initialValue: props.value,
          readOnly: props.mode === 'view',
        }}
      >
        <DocsSurface {...props} />
      </EditorProvider>
    </div>
  );
}

function DocsSurface(props: DocsProps): JSX.Element {
  const editor = useEditor();

  // initialConfig is read once; subsequent host values and mode changes need explicit updates.
  useEffect(() => {
    editor.send({ type: 'update value', value: props.value });
  }, [editor, props.value]);

  useEffect(() => {
    editor.send({ type: 'update readOnly', readOnly: props.mode === 'view' });
  }, [editor, props.mode]);

  return (
    <>
      <EventListenerPlugin
        on={(event) => {
          if (event.type === 'mutation' && props.mode === 'edit') {
            props.onChange(event.value ?? []);
          }
        }}
      />
      <NodePlugin nodes={docsBlockNodes(props.blocks)} />
      {props.mode === 'edit' && <Toolbar blocks={props.blocks} />}
      <PortableTextEditable
        aria-label={props.mode === 'edit' ? 'Document editor' : 'Document viewer'}
        aria-readonly={props.mode === 'view'}
        contentEditable={props.mode === 'edit'}
        className="terra-docs-content"
        renderStyle={({ children, schemaType }) => {
          if (schemaType.value === 'h2') return <h2>{children}</h2>;
          if (schemaType.value === 'h3') return <h3>{children}</h3>;
          if (schemaType.value === 'h4') return <h4>{children}</h4>;
          if (schemaType.value === 'h5') return <h5>{children}</h5>;
          if (schemaType.value === 'h6') return <h6>{children}</h6>;
          if (schemaType.value === 'blockquote') return <blockquote>{children}</blockquote>;
          return <p>{children}</p>;
        }}
        renderDecorator={({ children, value }) => {
          if (value === 'strong') return <strong>{children}</strong>;
          if (value === 'em') return <em>{children}</em>;
          if (value === 'underline') return <u>{children}</u>;
          if (value === 'strike-through') return <s>{children}</s>;
          if (value === 'code') return <code>{children}</code>;
          return <>{children}</>;
        }}
        renderAnnotation={({ children, value }) => {
          const href = safeLink(value.href);
          return href ? <a href={href}>{children}</a> : <>{children}</>;
        }}
      />
    </>
  );
}
