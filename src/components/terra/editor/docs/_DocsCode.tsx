// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/** Docs code block renderer with view and edit modes. */

import { useEditor } from '@portabletext/editor';
import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from '../../ui.js';
import { Button } from '@terra-symposium/styling/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@terra-symposium/styling/ui';
import { Input } from '@terra-symposium/styling/ui';
import { Label } from '@terra-symposium/styling/ui';
import { CodeBlock } from './_CodeBlock.js';

import type { BlockTgt } from '../../../../lib/terra/runtime/types.js';
import type {
  DocsBlock,
  PortableTextBlockEditorProps,
  PortableTextBlockRendererProps,
} from '../types.js';

/** Sanity Portable Text code-block fields used by the docs editor. */
type CodeBlockData = DocsBlock<'code'>;
/** Renders a Docs code block from its authored block.
 *
 * @param props - Authored code block and its language, title, and display settings.
 * @returns The authored code block and its preview.
 */
function Code({ block }: { block: CodeBlockData }): JSX.Element {
  return (
    <ErrorBoundary name="Code">
      <CodeBlock
        code={block.value ?? ''}
        language={block.language ?? 'text'}
        source={block.source}
        tone="view"
      />
    </ErrorBoundary>
  );
}
Object.assign(Code, { displayName: 'DocsCodePreview' });
/** Adapts Portable Text's block-object contract to the code renderer. */
/**
 * Renders the renderCode component.
 *
 * @param props - Portable Text renderer attributes, nested children, code block node, path, and read-only mode.
 * @returns The code block renderer in editable or read-only mode.
 */
export function renderCode({
  attributes: attrs,
  children,
  node,
  path,
  readOnly,
}: PortableTextBlockRendererProps<CodeBlockData>): JSX.Element {
  return readOnly ? (
    <Code block={node} />
  ) : (
    <CodeEditor attributes={attrs} children={children} node={node} path={path} />
  );
}
Object.assign(renderCode, { displayName: 'DocsCodeRenderer' });

/** Connects the code block's local controls to its Portable Text state. */
/**
 * Renders the CodeEditor component.
 *
 * @param props - Portable Text editor attributes, nested children, code node, and path used to update code content.
 * @returns The editable code block controls.
 */
function CodeEditor({
  attributes: attrs,
  children,
  node,
  path,
}: PortableTextBlockEditorProps<CodeBlockData>): JSX.Element {
  const editor = useEditor();
  const code = node;
  const [endpoint, setEndpoint] = useState(code.source ?? '');
  const [endpointDialog, setEndpointDialog] = useState<'change' | 'receive' | null>(null);
  const boundary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!boundary.current) return;
    const stop = (e: Event): void => e.stopPropagation();
    const es = [
      'beforeinput',
      'input',
      'keydown',
      'keyup',
      'paste',
      'copy',
      'cut',
      'focusin',
      'focusout',
      'pointerdown',
      'pointerup',
    ];
    const element = boundary.current;
    for (const e of es) element.addEventListener(e, stop);
    return () => {
      for (const e of es) element.removeEventListener(e, stop);
    };
  }, [code.source]);
  useEffect(() => {
    if (!boundary.current) return;
    const block = boundary.current as BlockTgt;
    block.__blockActions = code.source
      ? [
          {
            text: 'Change API endpoint',
            onSelect: () => setEndpointDialog('change'),
          },
          {
            text: 'Convert to local definition',
            onSelect: () => {
              const received = boundary.current?.querySelector<HTMLElement>(
                '[data-docs-code-received][data-state="received"]',
              );
              if (!received) return;
              const { source: _source, ...localCode } = code;
              editor.send({
                type: 'set',
                at: path,
                value: {
                  ...localCode,
                  language: code.language ?? 'json',
                  value: received.textContent ?? '',
                },
              });
            },
          },
        ]
      : [{ text: 'Convert to received value', onSelect: () => setEndpointDialog('receive') }];
    return () => {
      delete block.__blockActions;
    };
  }, [code.language, code.source, editor, path]);
  useEffect(() => setEndpoint(code.source ?? ''), [code.source]);
  const update = (val: string, lang = code.language ?? 'text'): void =>
    editor.send({
      type: 'block.set',
      at: path,
      props: { language: lang, source: code.source, value: val },
    });
  return (
    <ErrorBoundary name="CodeBlock">
      <>
        <div
          {...attrs}
          ref={boundary}
          contentEditable={false}
          data-terra-block="code"
          data-docs-editor-block="code"
        >
          <CodeBlock
            code={code.value ?? ''}
            expandAll
            language={code.language ?? 'text'}
            source={code.source}
            tone="edit"
            onCodeChange={(v) => update(v)}
            onCommit={(v, l) => update(v, l)}
            onLanguageChange={(l, v) => update(v, l)}
          />
          {children}
        </div>
        <Dialog
          open={endpointDialog !== null}
          onOpenChange={(open) => !open && setEndpointDialog(null)}
        >
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>
                {endpointDialog === 'receive' ? 'Convert to received value' : 'Change API endpoint'}
              </DialogTitle>
            </DialogHeader>
            <Label htmlFor="docs-code-endpoint">API endpoint</Label>
            <Input
              id="docs-code-endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.currentTarget.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEndpointDialog(null)}>
                Cancel
              </Button>
              <Button
                disabled={!endpoint.trim()}
                onClick={() => {
                  const src = endpoint.trim();
                  if (!src) return;
                  editor.send({
                    type: 'set',
                    at: path,
                    value: {
                      ...code,
                      language: code.language ?? 'json',
                      source: src,
                      value: code.value ?? '',
                    },
                  });
                  setEndpointDialog(null);
                }}
              >
                {endpointDialog === 'receive' ? 'Receive value' : 'Change API endpoint'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    </ErrorBoundary>
  );
}
Object.assign(CodeEditor, { displayName: 'DocsCodeEditor' });
