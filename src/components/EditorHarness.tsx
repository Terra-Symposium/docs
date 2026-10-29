import { StrictMode, useState } from 'react';
import { TerraContentEditor } from './terra/editor/TerraContentEditor.js';
import { configureDocsHost } from '../lib/host-runtime.js';
import type { DocsHostAdapter, DocsActionOperation } from '../lib/host.js';
import type { DocsBlockOptions } from './blocks.js';
import type { DocsHostAttachment } from '../lib/host.js';
import type { JSX } from 'react';

declare global {
  interface Window {
    __terraContentFixture?: unknown[];
    __terraContentOptions?: {
      attachments?: DocsHostAttachment[];
      blocks?: DocsBlockOptions;
      readOnly?: boolean;
    };
    __terraDocsMockResponses?: Record<
      string,
      { data?: unknown; dataByInput?: Record<string, unknown>; error?: string }
    >;
  }
}

function mapContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mapContent);
  if (!value || typeof value !== 'object') return value;
  const node = value as Record<string, unknown>;
  const type = node._type === 'terraBlock' ? 'block' : node._type;
  return Object.fromEntries(
    Object.entries(node).map(([key, entry]) => [key, key === '_type' ? type : mapContent(entry)]),
  );
}

const host: DocsHostAdapter = {
  capabilities: {
    read: true,
    write: true,
    attachments: true,
    reorder: true,
    export: true,
    history: true,
    publish: true,
  },
  async invoke<T = unknown>(
    operation: DocsActionOperation,
    input?: unknown,
  ): Promise<{ data?: T; error?: unknown }> {
    const mock =
      typeof window === 'undefined' ? undefined : window.__terraDocsMockResponses?.[operation];
    if (mock?.error) return { error: new Error(mock.error) };
    const inputKey =
      input && typeof input === 'object' && 'source' in input
        ? String((input as { source: unknown }).source)
        : '';
    const data = inputKey ? (mock?.dataByInput?.[inputKey] ?? mock?.data) : mock?.data;
    return { data: mapContent(data) as T };
  },
};

export default function EditorHarness(): JSX.Element {
  configureDocsHost(host);
  const [readOnly] = useState(() =>
    typeof window === 'undefined' ? false : (window.__terraContentOptions?.readOnly ?? false),
  );
  const [options] = useState(() =>
    typeof window === 'undefined' ? {} : (window.__terraContentOptions ?? {}),
  );
  const [content, setContent] = useState(
    () =>
      (mapContent(
        typeof window === 'undefined' ? [] : (window.__terraContentFixture ?? []),
      ) as unknown[]) ?? [],
  );
  return (
    <StrictMode>
      <main className="terra-docs-workspace mx-auto min-h-svh max-w-5xl p-6">
        <TerraContentEditor
          content={content}
          {...(options.attachments ? { docsAttachments: options.attachments } : {})}
          {...(options.blocks ? { blocks: options.blocks } : {})}
          readOnly={readOnly}
          onChange={(value) => setContent(value)}
        />
        <pre data-testid="editor-output" className="sr-only">
          {JSON.stringify(content)}
        </pre>
      </main>
    </StrictMode>
  );
}
