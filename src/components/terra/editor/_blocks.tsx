// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/_blocks.tsx
 * Reusable structural blocks and image editing primitives for portable editors.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { isValidElement, useId, useState } from 'react';
import { cn } from '../../../lib/terra/runtime/runtime.js';

// COMPONENTS
import { Add as AddIcon, Close as CloseIcon, TrashCan as TrashIcon } from '@carbon/icons-react';
import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem as AccordionPrimitiveItem,
  AccordionTrigger,
} from '@terra-symposium/styling/ui/terra-original';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import { Card, CardContent, CardHeader } from '@terra-symposium/styling/ui/terra-original';
import { ErrorBoundary } from '../ui.js';
import { Input } from '@terra-symposium/styling/ui/terra-original';
import { Tabs, TabsList, TabsTrigger } from '@terra-symposium/styling/ui/terra-original';

// TYPES
import type { ReactElement, ReactNode } from 'react';
import * as TerraQualityRegex from '../../../lib/terra/regex.mjs';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/**
 * Focus ring tokens shared by editor blocks, table cells, and inline image controls.
 */
const FOCUS_RING = {
  base: 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-8 focus-visible:ring-0',
  block: 'transition-all duration-200',
  cell: 'outline outline-2 outline-primary-8 -outline-offset-2',
} as const;
const TABS = {
  body: '!my-0 p-5',
  head: 'border-b border-primary-6 p-0',
  list: '!my-0 flex flex-wrap justify-start gap-0 flex-1',
  trigger: 'rounded-none border-0 py-2 px-5 h-10 text-base font-bold !shadow-none',
} as const;

/**
 * Renders the tabs group component.
 *
 * @param children - Tab content rendered inside the tabs group.
 * @param onAdd - Adds a new empty tab to the group.
 * @param onDelete - Removes the tab at the supplied index.
 * @param onRename - Persists a new title for the tab at the supplied index.
 */
export const TabsGroup = ({
  children,
  onAdd,
  onDelete,
  onRename,
}: {
  children: ReactNode;
  onAdd?: () => void;
  onDelete?: (index: number) => void;
  onRename?: (index: number, title: string) => void;
}): React.JSX.Element => {
  const items = React.Children.toArray(children).filter(isValidElement) as ReactElement<{
      children?: ReactNode;
      title?: string;
    }>[],
    [a, setActive] = useState('0');
  return (
    <ErrorBoundary name="TabsGroup">
      <div className={cn('rounded-sm', FOCUS_RING.block)}>
        <Card className="!my-0 !rounded-sm bg-transparent">
          {items.length > 0 && (
            <CardHeader className={TABS.head}>
              <EditorTabsList
                tabs={items.map((i, v) => ({
                  value: `${v}`,
                  title: i.props.title || `Tab ${v + 1}`,
                }))}
                value={a}
                onValueChange={setActive}
                {...(onAdd ? { onAdd } : {})}
                {...(onDelete
                  ? {
                      onDelete: (val) => {
                        onDelete(Number(val));
                      },
                    }
                  : {})}
                {...(onRename
                  ? {
                      onRename: (val, title) => {
                        onRename(Number(val), title);
                      },
                    }
                  : {})}
              />
            </CardHeader>
          )}
          <CardContent className={TABS.body}>
            {items.map((i, v) => (
              <div key={v} className={cn(a === `${v}` ? 'block' : 'hidden', 'editor-block-copy')}>
                {i.props.children}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
};
/**
 * Renders the tabs item component.
 *
 * @param children - Content rendered inside the block wrapper.
 */
export const TabsItem = ({
  children,
}: {
  children: ReactNode;
  title: string;
}): React.JSX.Element => <ErrorBoundary name="TabsItem">{children}</ErrorBoundary>;
/**
 * Renders the accordion group component.
 *
 * @param children - Content rendered inside the block preview.
 */
export const AccordionGroup = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <ErrorBoundary name="AccordionGroup">
    <div className={cn('rounded-sm', FOCUS_RING.block)}>
      <Card className="!my-0 w-full overflow-visible !rounded-sm bg-transparent">
        <CardHeader className="p-0">
          <Accordion type="single" collapsible variant="sm" className="w-full">
            {children}
          </Accordion>
        </CardHeader>
      </Card>
    </div>
  </ErrorBoundary>
);
/**
 * Renders the accordion item component.
 *
 * @param title - Block title displayed above the content.
 * @param children - Block content rendered below the title.
 * @param onDelete - Removes this accordion section from its parent group.
 * @param onRename - Persists a new title for this accordion section.
 */
export const AccordionItem = ({
  title,
  children,
  onDelete,
  onRename,
}: {
  children: ReactNode;
  title: string;
  onDelete?: () => void;
  onRename?: (title: string) => void;
}): React.JSX.Element => {
  const id = useId();
  return (
    <ErrorBoundary name="AccordionItem">
      <AccordionPrimitiveItem
        value={title.replace(TerraQualityRegex.REGEX_S_G_REGEX(), '-').toLowerCase() || id}
        className="first:border-0 [&>*]:!my-0"
      >
        {onRename || onDelete ? (
          <div className="flex w-full items-center gap-1.5 px-4 py-1">
            {onRename ? (
              <Input
                aria-label="Accordion title"
                className="h-8 border-0 bg-transparent px-1 text-base font-bold shadow-none focus-visible:ring-0"
                value={title}
                onChange={(e) => {
                  onRename(e.currentTarget.value);
                }}
              />
            ) : (
              <strong>{title}</strong>
            )}
            <AccordionTrigger
              aria-label={`Toggle ${title}`}
              className="!my-0 size-7 shrink-0 p-0"
            />
            {onDelete && (
              <Button
                aria-label="Delete accordion section"
                variant="destructive"
                size="xs"
                onClick={onDelete}
              >
                <TrashIcon aria-hidden="true" />
              </Button>
            )}
          </div>
        ) : (
          <AccordionTrigger
            aria-label={`Toggle ${title}`}
            className="!my-0 scroll-mt-16 px-4 text-base"
          >
            {title}
          </AccordionTrigger>
        )}
        <AccordionContent className="!my-0 space-y-4 !px-4 !py-2 text-base">
          {children}
        </AccordionContent>
      </AccordionPrimitiveItem>
    </ErrorBoundary>
  );
};

/*//////////////////////////////////////////////////
COMPONENTS
//////////////////////////////////////////////////*/

/**
 * Renders the editor tabs list component.
 *
 * @param props - Tab definitions, active value, and optional mutation callbacks.
 *
 * @return The tab list and controls for selecting, renaming, deleting, or adding editor tabs.
 */
export function EditorTabsList({
  tabs,
  value: a,
  onValueChange: onValChange,
  onRename,
  onDelete,
  onAdd,
}: {
  onAdd?: () => void;
  onDelete?: (val: string) => void;
  onRename?: (val: string, title: string) => void;
  onValueChange: (val: string) => void;
  tabs: {
    fallback?: string;
    title: string;
    value: string;
  }[];
  value: string;
}): React.JSX.Element {
  return (
    <ErrorBoundary name="EditorTabsList">
      <Tabs value={a} onValueChange={onValChange}>
        <TabsList className="mb-0 inline-flex w-full items-center justify-start gap-0 overflow-x-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} asChild>
              {/* intermediate level necessary because <button> cannot be a descendant of <button> */}
              <div
                className={cn(
                  'group flex min-w-32 items-center gap-1 border-none px-2 py-1 font-bold',
                  t.value === a && 'bg-primary-3',
                )}
              >
                {onRename ? (
                  <Input
                    value={t.title || t.fallback || 'Untitled'}
                    onChange={(e) => {
                      onRename(t.value, e.target.value);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    className="h-7 border-0 bg-transparent px-1 text-sm font-bold shadow-none focus-visible:ring-0"
                    aria-label="Tab title"
                  />
                ) : (
                  <strong className="px-1 text-sm font-bold">
                    {t.title || t.fallback || 'Untitled'}
                  </strong>
                )}
                {onDelete && tabs.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 opacity-60 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(t.value);
                    }}
                    aria-label={`Delete tab ${t.title || t.fallback || 'Untitled'}`}
                  >
                    <CloseIcon className="size-3" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </TabsTrigger>
          ))}
          {onAdd && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onAdd}
              aria-label="Add tab"
              className="h-7"
            >
              <AddIcon className="size-4" aria-hidden="true" />
            </Button>
          )}
        </TabsList>
      </Tabs>
    </ErrorBoundary>
  );
}
