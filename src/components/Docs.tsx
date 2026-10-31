import { TerraContentEditor } from './terra/editor/TerraContentEditor.js';
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

/** Controlled editor surface backed by the canonical Terra Docs editor. */
export function Docs(props: DocsProps): JSX.Element {
  return (
    <div className={['terra-docs', props.className].filter(Boolean).join(' ')}>
      <TerraContentEditor
        content={props.value}
        readOnly={props.mode === 'view'}
        {...(props.blocks !== undefined ? { blocks: props.blocks } : {})}
        {...(props.mode === 'edit'
          ? { onChange: (value: unknown[]) => props.onChange(value as DocsValue) }
          : {})}
      />
    </div>
  );
}
