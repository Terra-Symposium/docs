import { useRef, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@terra-symposium/styling/ui';
import { ErrorBoundary } from '../../ui.js';
import type { JSX, ReactNode } from 'react';

type BlockActionItem = {
  text: string;
  icon?: ReactNode;
  intent?: string;
  onSelect?: () => void;
};
type BlockAction =
  BlockActionItem | { sep: true } | { text: string; icon?: ReactNode; sub: BlockActionItem[] };
type BlockActionTarget = HTMLElement & { __blockActions?: BlockAction[] };

/** Preserve the original Docs block context menu and its deferred focus handoff. */
export function BlockContext({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}): JSX.Element {
  const [actions, setActions] = useState<BlockAction[] | null>(null);
  const selectedAction = useRef<Array<(() => void) | null>>([]);
  if (!enabled) return <>{children}</>;

  return (
    <ErrorBoundary name="BlockContext">
      <ContextMenu onOpenChange={(open) => !open && setActions(null)}>
        <ContextMenuTrigger asChild>
          <div className="docs-context-menu-trigger-wrapper">
            <div
              className="relative w-full"
              onContextMenuCapture={(event) => {
                let current: BlockActionTarget | null =
                  event.target instanceof HTMLElement
                    ? (event.target as BlockActionTarget)
                    : event.target instanceof Node
                      ? (event.target.parentElement as BlockActionTarget | null)
                      : null;
                const nextActions: BlockAction[] = [];
                while (current && current !== event.currentTarget) {
                  if (current.__blockActions?.length) {
                    if (nextActions.length) nextActions.push({ sep: true });
                    nextActions.push(...current.__blockActions);
                  }
                  current = current.parentElement as BlockActionTarget | null;
                }
                if (!nextActions.length) {
                  const block = (event.target as HTMLElement).closest<HTMLElement>(
                    '[data-docs-editor-block], [data-docs-block], [data-terra-block]',
                  );
                  if (!block) {
                    event.stopPropagation();
                    return;
                  }
                  nextActions.push({
                    text: 'Select block',
                    onSelect: () =>
                      document.dispatchEvent(
                        new CustomEvent('docs:block-select', {
                          detail: {
                            block,
                            decorator: block.closest('.docs-context-wrapper') || block,
                          },
                        }),
                      ),
                  });
                }
                setActions(nextActions);
              }}
            >
              {children}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-64"
          onCloseAutoFocus={(event) => {
            if (!selectedAction.current.length) return;
            event.preventDefault();
            selectedAction.current.splice(0, 1)[0]?.();
          }}
        >
          {actions?.map((action, index) => {
            if ('sep' in action) return <ContextMenuSeparator key={`separator-${index}`} />;
            if ('sub' in action)
              return (
                <ContextMenuSub key={action.text}>
                  <ContextMenuSubTrigger>
                    {action.icon} {action.text}
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {action.sub.map((item) => (
                      <ContextMenuItem
                        key={item.text}
                        intent={item.intent as never}
                        onSelect={() => {
                          selectedAction.current[0] = item.onSelect ?? null;
                        }}
                      >
                        {item.icon} {item.text}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              );
            return (
              <ContextMenuItem
                key={action.text}
                intent={action.intent as never}
                onSelect={() => {
                  selectedAction.current.splice(0, 1, action.onSelect ?? null);
                }}
              >
                {action.icon} {action.text}
              </ContextMenuItem>
            );
          })}
        </ContextMenuContent>
      </ContextMenu>
    </ErrorBoundary>
  );
}
