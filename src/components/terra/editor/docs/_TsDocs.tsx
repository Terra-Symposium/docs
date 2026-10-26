// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/docs/_TsDocs.tsx
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { actions } from '../../runtime/action-proxy.js';
import { cn } from '../../runtime/runtime.js';
import { useEffect, useState } from 'react';

// COMPONENTS
import { AlertError } from '@terra-symposium/styling/ui/terra-original';
import { ErrorBoundary } from '../../runtime/ui.js';
import { Empty } from '../../runtime/ui.js';
import { TerraContentEditor } from '../TerraContentEditor.js';

// TYPES
import type { DocsBlock } from '../types.js';
import type { TerraContent as TerraContentData } from '../../runtime/types.js';
import type { TsDocsItem } from '../../runtime/types.js';

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/** Loads and renders TypeScript documentation for a selected scope. */
/**
 * Renders the TsDocsRenderer component.
 *
 * @param props - Optional API documentation scope and styling class used to load the reference panel.
 *
 * @return The API reference panel, or `null` when no scope is selected.
 */
function TsDocsRenderer({
  scope,
  className,
}: {
  scope?: string;
  className?: string;
}): React.JSX.Element | null {
  const [items, setItems] = useState<TsDocsItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!scope) return;
    let a = true;
    actions.read
      .tsdocs({ scope })
      .then(
        async ({
          data: d,
          error: e,
        }: {
          data?: { docs?: Array<{ slug: string; title: string; body: string }> } | null;
          error?: unknown;
        }) => {
          if (e || !d?.docs) throw e || new Error('Failed to fetch tsdocs');
          const docs: TsDocsItem[] = [];
          for (const entry of d.docs) {
            const { data: body, error: bodyErr } = await actions.read.source.body({
              source: entry.body,
            });
            if (bodyErr || !body) throw bodyErr || new Error(`Failed to parse ${entry.slug}`);
            docs.push({ slug: entry.slug, title: entry.title, body });
          }
          if (a) setItems(docs);
        },
      )
      .catch((e: unknown) => {
        if (a) setErr(e instanceof Error ? e.message : 'Failed to fetch tsdocs');
      });
    return () => {
      a = false;
    };
  }, [scope]);
  if (!scope) return null;
  if (err)
    return (
      <ErrorBoundary name="TsDocsRenderer">
        <AlertError title="TsDocs Error" description={err} />
      </ErrorBoundary>
    );
  if (!items)
    return (
      <ErrorBoundary name="TsDocsRenderer">
        <div
          className="h-24 w-full animate-pulse rounded-sm bg-primary-3"
          data-docs-block-skeleton
        />
      </ErrorBoundary>
    );
  if (items.length === 0)
    return (
      <ErrorBoundary name="TsDocsRenderer">
        <Empty>
          No tsdocs found for <code>{scope}</code>.
        </Empty>
      </ErrorBoundary>
    );
  return (
    <ErrorBoundary name="TsDocsRenderer">
      <div className={cn('tsdocs-wrapper max-w-none space-y-10', className)}>
        {items.length > 1 && (
          <nav aria-label="TSDocs contents">
            <ul className="m-0 list-none p-0">
              {items.map((d) => (
                <li key={d.slug}>
                  <a
                    href={`#${d.slug.replaceAll('/', '-')}`}
                    className="text-primary-9 hover:underline"
                  >
                    {d.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {items.map((d) => (
          <section key={d.slug} id={d.slug.replaceAll('/', '-')}>
            {items.length > 1 && <h2>{d.title}</h2>}
            <TerraContentEditor
              content={d.body as unknown as TerraContentData}
              docsAttachments={[]}
              memberProfile="docs"
              nested
              readOnly
            />
          </section>
        ))}
      </div>
    </ErrorBoundary>
  );
}
Object.assign(TsDocsRenderer, { displayName: 'TsDocsRenderer' });

/**
 * Renders the ts docs component.
 *
 * @param props - TypeScript documentation block data and rendering props.
 *
 * @return Rendered TypeScript documentation content.
 */
export function TsDocs({
  block,
}: {
  block: /** Sanity Portable Text block selecting a TypeScript API reference scope. */ DocsBlock<'tsDocs'>;
}): React.JSX.Element | null {
  return (
    <ErrorBoundary name="TsDocs">
      <TsDocsRenderer {...(block.scope === undefined ? {} : { scope: block.scope })} />
    </ErrorBoundary>
  );
}
Object.assign(TsDocs, { displayName: 'TsDocs' });
