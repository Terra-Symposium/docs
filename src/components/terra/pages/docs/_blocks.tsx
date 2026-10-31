// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/pages/docs/_blocks.tsx
 * Legacy Docs utilities and TypeDoc scope selector.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { actions } from '../../../../lib/terra/runtime/action-proxy.js';
import { cn, error as logError, errorLog } from '../../../../lib/terra/runtime/runtime.js';
import { useEffect, useMemo, useState } from 'react';

// COMPONENTS
import * as TerraQualityRegex from '../../../../lib/terra/regex.mjs';
import React from 'react';
import { Button } from '@terra-symposium/styling/ui';
import {
  Checkmark as CheckmarkIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  Close as CloseIcon,
  Doc as DocumentIcon,
  Folder as FolderIcon,
  Search as SearchIcon,
} from '@carbon/icons-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@terra-symposium/styling/ui';
import { ErrorBoundary } from '../../ui.js';
import { Empty } from '../../ui.js';
import { Input } from '@terra-symposium/styling/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@terra-symposium/styling/ui';
import { SearchEmpty } from '@terra-symposium/styling/ui';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Composes a full markdown syntax block identifying an image reference.
 *
 * @param src - Direct path or remote location pointer.
 * @param alt - Descriptive accessibility text representing the image payload.
 *
 * @return Clean MD string containing image formatting descriptors.
 *
 * @remarks Strips out un-intended bracketing prior to final execution.
 */
export function toImgMd(src: string, alt = ''): string {
  return `\n![${alt.replace(/[[\]]/g, '').trim()}](<${src}>)\n`;
}

/**
 * Synthesizes a valid image alt description parsing base filename syntax.
 *
 * @param v - The target filename including extension suffixes.
 *
 * @return Normalized text title equivalent.
 *
 * @remarks Scrubs file identifiers leaving human-readable labels automatically.
 */
export function toImgAlt(v: string): string {
  return v
    .replace(/\.[^.]+$/u, '')
    .replace(TerraQualityRegex.REGEX_G_REGEX_8(), ' ')
    .trim();
}

/**
 * Controller input handling scope selections mapped against active documented resources.
 *
 * @param props - Interactive config mapping tracking single/multi value inputs.
 * @param value - Value supplied to ts docs select for rendering or processing.
 * @param onChange - Callback invoked for change.
 * @param className - Additional CSS classes merged into ts docs select.
 * @param variant - Visual variant controlling ts docs select's presentation.
 * @param multiple - Multiple input supplied to ts docs select's operation.
 *
 * @return Interactive dropdown presentation filtering file structures directly.
 *
 * @remarks Evaluates fetched payload blobs compiling the text formats to valid functional react representations natively.
 */
export function TsDocsSelect({
  value,
  onChange,
  className,
  variant = 'dialog',
  multiple = false,
}: {
  value?: string | string[];
  onChange: (val: string | string[]) => void;
  className?: string;
  variant?: 'dialog' | 'inline';
  multiple?: boolean;
}): React.JSX.Element {
  // STATES
  const [scopes, setScopes] = useState<
    {
      path: string;
      type: 'folder' | 'file';
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // EFFECTS
  useEffect(() => {
    let a = true;
    actions.read
      .tsdocs({})
      .then(
        ({
          data: d,
          error: err,
        }: {
          data?: { scopes?: typeof scopes } | null;
          error?: unknown;
        }) => {
          if (err) throw err;
          if (a && d?.scopes) setScopes(d.scopes);
        },
      )
      .catch((e: unknown) => {
        errorLog('TsDocsSelect', 'Failed to fetch scopes', logError(e));
      })
      .finally(() => {
        if (a) setLoading(false);
      });
    return () => {
      a = false;
    };
  }, []);
  const selSet = useMemo(
    () =>
      new Set<string>(
        multiple
          ? Array.isArray(value)
            ? value
            : value
              ? [value]
              : []
          : value && typeof value === 'string'
            ? [value]
            : [],
      ),
    [value, multiple],
  );
  const visibleScopes = useMemo(() => {
    if (!search.trim())
      return scopes.filter((s) => {
        const parts = s.path.split('/');
        parts.pop();
        let cur = '';
        for (const p of parts) {
          cur = cur ? `${cur}/${p}` : p;
          if (!expanded.has(cur)) return false;
        }
        return true;
      });
    return scopes.filter((s) => s.path.toLowerCase().includes(search.toLowerCase()));
  }, [scopes, expanded, search]);

  // RENDER HELPERS
  /**
   * Renders the TypeDoc scope tree.
   *
   * @returns The scope tree.
   */
  const renderTree = (): React.JSX.Element => (
    <div className="flex flex-col gap-0.5">
      {visibleScopes.map((s) => {
        const isFolder = s.type === 'folder',
          isSearching = !!search.trim(),
          depth = isSearching ? 0 : s.path.split('/').length - 1;
        const isExpanded = expanded.has(s.path),
          isSel = selSet.has(s.path);
        return (
          <div key={s.path} className="flex w-full items-center">
            <div style={{ width: `${depth * 1.25}rem` }} className="shrink-0" />
            {!isSearching && (
              <button
                type="button"
                aria-label={
                  isExpanded
                    ? `Collapse ${s.path.split('/').pop() ?? 'folder'}`
                    : `Expand ${s.path.split('/').pop() ?? 'folder'}`
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((p) => {
                    const n = new Set(p);
                    if (n.has(s.path)) n.delete(s.path);
                    else n.add(s.path);
                    return n;
                  });
                }}
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded text-primary-10 transition-colors hover:bg-primary-3 hover:text-primary-12',
                  !isFolder && 'invisible',
                )}
              >
                {isFolder &&
                  (isExpanded ? (
                    <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronRightIcon className="size-3.5" aria-hidden="true" />
                  ))}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (multiple) {
                  const n = new Set(selSet);
                  if (n.has(s.path)) n.delete(s.path);
                  else n.add(s.path);
                  onChange(Array.from(n));
                } else {
                  onChange(s.path);
                  setDialogOpen(false);
                }
              }}
              className={cn(
                'flex w-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-primary-3',
                isSel ? 'bg-primary-4 font-medium text-primary-12' : 'text-primary-11',
                isSearching && 'ml-1',
              )}
            >
              {isFolder ? (
                <FolderIcon className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <DocumentIcon className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span className="flex-1 truncate">
                {isSearching ? s.path : s.path.split('/').pop()}
              </span>
              {multiple && isSel && (
                <CheckmarkIcon className="size-4 shrink-0 text-primary-12" aria-hidden="true" />
              )}
            </button>
          </div>
        );
      })}
      {scopes.length === 0 && !loading && <Empty variant="padded">No TypeDoc entries found.</Empty>}
      {scopes.length > 0 && visibleScopes.length === 0 && <SearchEmpty query={search} />}
    </div>
  );
  const TriggerDiv = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    (p, r) => (
      <div
        ref={r}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={dialogOpen}
        aria-label="Select TSDocs scope"
        onKeyDown={(e) => {
          p.onKeyDown?.(e);
          if (!e.defaultPrevented && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            p.onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        }}
        {...p}
        className={cn(
          'flex min-h-9 w-full cursor-pointer items-center justify-start rounded-md border border-primary-6 bg-transparent px-3 py-2 text-xs shadow-sm transition-colors hover:bg-primary-3 focus:outline-none focus:ring-1 focus:ring-ring',
          multiple && selSet.size > 0 ? 'h-auto flex-wrap gap-1.5' : '',
          p.className,
        )}
      >
        {loading ? (
          <span className="text-primary-11">Loading scopes...</span>
        ) : selSet.size > 0 ? (
          Array.from(selSet).map((s) => (
            <span
              key={s}
              className="flex cursor-default items-center gap-1 rounded bg-primary-5 px-1.5 py-0.5 text-[10px] font-medium text-primary-12"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              {s.split('/').pop()}
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove ${s.split('/').pop() ?? s}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (multiple) {
                    const n = new Set(selSet);
                    n.delete(s);
                    onChange(Array.from(n));
                  } else onChange('');
                }}
              >
                <CloseIcon className="size-2.5" aria-hidden="true" />
              </Button>
            </span>
          ))
        ) : (
          <span className="text-primary-11">Select scope...</span>
        )}
      </div>
    ),
  );
  TriggerDiv.displayName = 'TriggerDiv';

  // RENDER
  if (variant === 'inline')
    return (
      <ErrorBoundary name="TsDocsSelect">
        <Popover
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setSearch('');
          }}
        >
          <PopoverTrigger asChild>
            <TriggerDiv className={className} />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] p-0"
            style={{ width: 'var(--radix-popover-trigger-width)' }}
          >
            <div className="border-b border-primary-6 p-1">
              <div className="relative">
                <SearchIcon
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary-9"
                  aria-hidden="true"
                />
                <Input
                  autoFocus
                  placeholder="Search scopes..."
                  aria-label="Search scopes"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  className="h-8 border-none bg-transparent pl-9 text-xs shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="max-h-60 flex-1 overflow-y-auto p-1">{renderTree()}</div>
          </PopoverContent>
        </Popover>
      </ErrorBoundary>
    );
  return (
    <ErrorBoundary name="TsDocsSelect">
      <div className={cn('w-full', className)}>
        <TriggerDiv
          onClick={() => {
            setDialogOpen(true);
          }}
        />
        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setSearch('');
          }}
        >
          <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select TSDocs Scope</DialogTitle>
              <DialogDescription>Choose a specific file or an entire directory.</DialogDescription>
            </DialogHeader>
            <div className="px-1 pb-2">
              <div className="relative">
                <SearchIcon
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary-9"
                  aria-hidden="true"
                />
                <Input
                  autoFocus
                  placeholder="Search folders and files..."
                  aria-label="Search folders and files"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  className="pl-9 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-1 pb-4">{renderTree()}</div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setDialogOpen(false);
                }}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}
