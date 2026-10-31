// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/pages/docs/_export-dialog.tsx
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { useState } from 'react';

// COMPONENTS
import { Button } from '@terra-symposium/styling/ui';
import { Checkbox } from '@terra-symposium/styling/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@terra-symposium/styling/ui';
import { ErrorBoundary } from '../../ui.js';
import { Label } from '@terra-symposium/styling/ui';
import { Progress } from '@terra-symposium/styling/ui';

// TYPES
import type {
  DocsExportOpts as ExportOptions,
  ExportTgt,
} from '../../../../lib/terra/runtime/types.js';
import type { ReactElement } from 'react';

/*//////////////////////////////////////////////////
CLASSES
//////////////////////////////////////////////////*/

const TEXT_SM_FONT_MEDIUM_TEXT_PRIMARY_12_CLASS = 'text-sm font-medium text-primary-12';
const FLEX_ITEMS_CENTER_SPACE_X_2_CLASS = 'flex items-center space-x-2';

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Renders the export dialog component.
 *
 * @param props - Export target, document data, and dialog state callbacks.
 *
 * @return Dialog for exporting documentation content.
 */
export function ExportDialog({
  target: tgt,
  setTarget: setTgt,
  disabled,
  onExport,
}: {
  target: ExportTgt;
  setTarget: (val: ExportTgt) => void;
  disabled?: boolean;
  onExport: (
    tgt: Exclude<ExportTgt, null>,
    opts: ExportOptions,
    progress: (val: number) => void,
  ) => Promise<void>;
}): ReactElement | null {
  const [opts, setOpts] = useState<ExportOptions>({
    flatten: false,
    format: 'raw',
    filters: { pages: true, pdfs: true, images: true, youtube: true, tsdocs: true, other: true },
    merges: { pages: false, pdfs: false, images: false, youtube: false, tsdocs: false },
  });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  if (!tgt) return null;
  const content = [
    { key: 'pages', label: 'Text' },
    { key: 'pdfs', label: 'PDFs' },
    { key: 'images', label: 'Images' },
    { key: 'youtube', label: 'YouTube Transcripts' },
    { key: 'tsdocs', label: 'TSDocs' },
    { key: 'other', label: 'Other' },
  ] as const;
  return (
    <ErrorBoundary name="ExportDialog">
      <Dialog open onOpenChange={(o) => !busy && !o && setTgt(null)}>
        <DialogContent
          className="text-foreground bg-background dark:bg-zinc-950 dark:text-zinc-50"
          size="sm"
          aria-busy={busy}
        >
          <DialogHeader>
            <DialogTitle>Export {tgt.title}</DialogTitle>
            <DialogDescription>
              Select the content and formats to include in your export.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div
              className="space-y-3"
              role="group"
              aria-labelledby="export-include-content-heading"
            >
              <h4
                id="export-include-content-heading"
                className={TEXT_SM_FONT_MEDIUM_TEXT_PRIMARY_12_CLASS}
              >
                Include Content
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {content.map((i) => (
                  <div className={FLEX_ITEMS_CENTER_SPACE_X_2_CLASS} key={i.key}>
                    <Checkbox
                      id={`filter-${i.key}`}
                      checked={opts.filters[i.key]}
                      disabled={disabled || busy}
                      onCheckedChange={(c) => {
                        setOpts((p) => ({ ...p, filters: { ...p.filters, [i.key]: !!c } }));
                      }}
                    />
                    <Label htmlFor={`filter-${i.key}`}>{i.label}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3" role="group" aria-labelledby="export-merge-heading">
              <h4 id="export-merge-heading" className={TEXT_SM_FONT_MEDIUM_TEXT_PRIMARY_12_CLASS}>
                Merge
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {content
                  .filter((i) => i.key !== 'other')
                  .map((i) => (
                    <div className={FLEX_ITEMS_CENTER_SPACE_X_2_CLASS} key={i.key}>
                      <Checkbox
                        id={`merge-${i.key}`}
                        checked={opts.merges[i.key] && opts.filters[i.key]}
                        disabled={disabled || busy || !opts.filters[i.key]}
                        onCheckedChange={(c) => {
                          setOpts((p) => ({ ...p, merges: { ...p.merges, [i.key]: !!c } }));
                        }}
                      />
                      <Label
                        htmlFor={`merge-${i.key}`}
                        className={!opts.filters[i.key] ? 'opacity-50' : ''}
                      >
                        {i.label}
                      </Label>
                    </div>
                  ))}
              </div>
            </div>
            <div className="space-y-3" role="group" aria-labelledby="export-processing-heading">
              <h4
                id="export-processing-heading"
                className={TEXT_SM_FONT_MEDIUM_TEXT_PRIMARY_12_CLASS}
              >
                Processing Options
              </h4>
              <div className="flex flex-col gap-3">
                <div className={FLEX_ITEMS_CENTER_SPACE_X_2_CLASS}>
                  <Checkbox
                    id="opt-flatten"
                    checked={opts.flatten}
                    disabled={disabled || busy}
                    onCheckedChange={(c) => {
                      setOpts((p) => ({ ...p, flatten: !!c }));
                    }}
                  />
                  <Label htmlFor="opt-flatten">Flatten folder structure</Label>
                </div>
                <div className={FLEX_ITEMS_CENTER_SPACE_X_2_CLASS}>
                  <Checkbox
                    id="opt-format"
                    checked={opts.format === 'pdf'}
                    disabled={disabled || busy || !opts.filters.pages}
                    onCheckedChange={(c) => {
                      setOpts((p) => ({ ...p, format: c ? 'pdf' : 'raw' }));
                    }}
                  />
                  <Label htmlFor="opt-format">Convert Pages to PDF</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            {busy ? (
              <div className="flex w-full items-center gap-4" role="status" aria-live="polite">
                <Progress
                  value={progress}
                  className="h-2 flex-1"
                  aria-label={`Exporting ${tgt.title} progress`}
                  aria-valuetext={`${progress}%`}
                />
                <span className="font-mono text-sm">{progress}%</span>
              </div>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setTgt(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      setProgress(0);
                      try {
                        await onExport(tgt, opts, setProgress);
                        setTgt(null);
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                  disabled={!Object.values(opts.filters).some(Boolean)}
                >
                  Download ZIP
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ErrorBoundary>
  );
}
