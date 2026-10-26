// @ts-nocheck -- Docs heading observation depends on live browser layout.
/** Tracks visible document headings and renders the navigation table of contents. */
import { useEffect, useState } from 'react';
import { toHeadingId } from '../../editor/docs/heading.js';
import { cn } from '../../../../lib/terra/runtime/runtime.js';
import {
  ButtonLink,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from '@terra-symposium/styling/ui/terra-original';

/** Returns the rendered Docs mode shell used by navigation and the table of contents. */
const docsShellOf = (): HTMLElement | null =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-docs-shell]')).find((e) => {
    const style = window.getComputedStyle(e);
    return (
      e.dataset.docsMode === (new URL(window.location.href).searchParams.get('mode') || 'view') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      e.dataset.loading !== 'true' &&
      e.querySelector('[data-docs-transition-content]')?.getAttribute('aria-hidden') !== 'true' &&
      e.getClientRects().length > 0
    );
  }) ?? null;

/**
 * Handles navigate heading.
 *
 * @param id - Tree node identifier used to create the link target.
 * @param text - Tree node label displayed to the reader.
 */
const navigateHeading = (id: string, text: string): void => {
  const shell = docsShellOf();
  const root =
    shell?.dataset.docsMode === 'view'
      ? shell.querySelector<HTMLElement>('[data-docs-view-root], [data-docs-body-content]')
      : shell?.dataset.docsMode === 'edit'
        ? shell.querySelector<HTMLElement>('[data-docs-body-editor], [data-docs-body-content]')
        : null;
  Array.from(root?.querySelectorAll<HTMLElement>('h2') ?? [])
    .find((e) => e.id === id || e.textContent?.trim() === text)
    ?.scrollIntoView({ behavior: 'auto', block: 'start' });
  window.history.pushState(null, '', `#${id}`);
};

export function Toc({ title }: { title?: string }): JSX.Element | null {
  const [heads, setHeads] = useState<{ id: string; text: string }[]>([]);
  const [a, setActive] = useState<string | null>(null);
  useEffect(() => {
    const syncState = {
      frame: 0,
      tries: 0,
      els: [] as HTMLElement[],
      observedRoot: null as HTMLElement | null,
      threshold: 0,
    };
    const surfaceObserver = new MutationObserver(() => syncLifecycle.sync());
    const bodyObserver = new MutationObserver(() => {
      syncLifecycle.sync();
      if (syncState.observedRoot) bodyObserver.disconnect();
    });
    /**
     * Sync active.
     */
    const syncLifecycle = {
      syncActive: (): void => {
        if (!syncState.els.length) {
          setActive(null);
          return;
        }
        syncState.threshold = window.innerWidth >= 768 ? 160 : 112;
        for (let i = syncState.els.length - 1; i >= 0; i--) {
          const el = syncState.els[i];
          if (el && el.getBoundingClientRect().top <= syncState.threshold) {
            setActive(el.id);
            return;
          }
        }
        setActive(syncState.els[0]?.id ?? null);
      },
      /*
       * Queue active.
       */
      queueActive: (): void => {
        cancelAnimationFrame(syncState.frame);
        syncState.frame = requestAnimationFrame(syncLifecycle.syncActive);
      },
      /*
       * Synchronizes the current view state with the source data.
       */
      sync: (): void => {
        try {
          const seen = new Set<string>();
          const shell = docsShellOf();
          let root: HTMLElement | null = null;
          for (const e of document.querySelectorAll<HTMLElement>(
            shell?.dataset.docsMode === 'view'
              ? '[data-docs-view-root], [data-docs-body-content]'
              : '[data-docs-body-editor], [data-docs-body-content]',
          )) {
            const style = window.getComputedStyle(e);
            if (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              e.getClientRects().length > 0
            ) {
              root = e;
              break;
            }
          }
          if (!root) return;
          if (root !== syncState.observedRoot) {
            surfaceObserver.disconnect();
            surfaceObserver.observe(root, {
              childList: true,
              characterData: true,
              subtree: true,
            });
            syncState.observedRoot = root;
          }
          const lowerTitle = title ? title.toLowerCase() : null;
          const validEls: HTMLElement[] = [];
          const headsList: { id: string; text: string }[] = [];
          for (const e of Array.from(root.querySelectorAll<HTMLElement>('h2') ?? [])) {
            if (e.closest('[data-placeholder], [data-tabs-placeholder]') || e.closest('[hidden]'))
              continue;
            let text = '';
            for (const child of Array.from(e.childNodes)) {
              if (child instanceof Element && child.classList.contains('heading-anchor-icon'))
                continue;
              text += child.textContent || '';
            }
            text = text.trim();
            if (lowerTitle && text.toLowerCase() === lowerTitle) continue;
            const id = e.id || (e.id = toHeadingId(text));
            if (!id || seen.has(id)) continue;
            seen.add(id);
            validEls.push(e);
            headsList.push({ id, text });
          }
          syncState.els = validEls;
          if (!syncState.els.length) {
            setHeads([]);
            setActive(null);
            return;
          }
          setHeads(headsList);
          syncLifecycle.queueActive();
        } catch {
          /* ignore */
        }
      },
      /*
       * Re-reads headings until the surface has mounted them.
       *
       */
      pump: (): void => {
        syncLifecycle.sync();
        if (syncState.els.length || syncState.tries++ >= 60) return;
        syncState.frame = requestAnimationFrame(syncLifecycle.pump);
      },
      /*
       * Handles navigate.
       *
       * @param e - Pointer event received from the tree interaction.
       */
      navigate: (e: MouseEvent): void => {
        const link =
          e.target instanceof Element
            ? e.target.closest<HTMLElement>('[data-docs-toc-heading]')
            : null;
        const id = link?.dataset.docsTocId;
        const text = link?.dataset.docsTocHeading;
        if (!id || !text) return;
        e.preventDefault();
        navigateHeading(id, text);
      },
    };
    syncLifecycle.pump();
    if (!syncState.observedRoot)
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('click', syncLifecycle.navigate, true);
    document.addEventListener('docs:surface-ready', syncLifecycle.sync);
    document.addEventListener('astro:after-swap', syncLifecycle.sync);
    window.addEventListener('hashchange', syncLifecycle.sync);
    window.addEventListener('resize', syncLifecycle.queueActive);
    window.addEventListener('scroll', syncLifecycle.queueActive, { passive: true });
    return () => {
      window.removeEventListener('click', syncLifecycle.navigate, true);
      document.removeEventListener('docs:surface-ready', syncLifecycle.sync);
      document.removeEventListener('astro:after-swap', syncLifecycle.sync);
      window.removeEventListener('hashchange', syncLifecycle.sync);
      window.removeEventListener('resize', syncLifecycle.queueActive);
      window.removeEventListener('scroll', syncLifecycle.queueActive);
      bodyObserver.disconnect();
      surfaceObserver.disconnect();
      cancelAnimationFrame(syncState.frame);
    };
  }, [title]);
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    let heading: { id: string; text: string } | undefined;
    for (const i of heads) {
      if (i.id === id) {
        heading = i;
        break;
      }
    }
    if (heading) navigateHeading(id, heading.text);
  }, [heads]);
  if (!heads?.length) return null;
  return (
    <nav aria-label="Table of contents">
      <SidebarMenuSub className="mr-0 pr-0">
        {heads.map((h) => (
          <SidebarMenuSubItem key={h.id}>
            <ButtonLink
              data-docs-toc-id={h.id}
              data-docs-toc-heading={h.text}
              href={`#${h.id}`}
              variant="ghost"
              size="xs"
              aria-label={`Jump to ${h.text}`}
              className={cn(
                'relative w-full justify-start truncate pl-4 before:absolute before:left-1.5 before:top-1/2 before:size-1 before:-translate-y-1/2 before:rounded-full before:content-[""] hover:!bg-transparent',
                a === h.id
                  ? 'text-primary-12 before:bg-current'
                  : 'text-primary-11 before:bg-primary-11 before:opacity-0 hover:before:opacity-100',
              )}
            >
              {h.text}
            </ButtonLink>
          </SidebarMenuSubItem>
        ))}
      </SidebarMenuSub>
    </nav>
  );
}
