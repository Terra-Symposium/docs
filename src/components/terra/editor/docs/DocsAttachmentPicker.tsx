import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@terra-symposium/styling/ui';
import { ErrorBoundary } from '../../ui.js';
import type { DocsBlockOptions } from '../../../blocks.js';
import type { DocsHostAttachment } from '../../../../lib/host.js';
import type { JSX } from 'react';

const imageFile = /\.(?:png|jpe?g|gif|webp|svg|avif)$/iu;

function canEmbedAttachment(attachment: DocsHostAttachment, blocks: DocsBlockOptions): boolean {
  return imageFile.test(attachment.name) ? blocks.docImage !== false : blocks.embed !== false;
}

/** Select an attachment belonging to the current leaf and insert it in the document body. */
export function DocsAttachmentPicker({
  attachments,
  blocks = {},
  onConfirm,
  onOpenChange,
  open,
}: {
  attachments: DocsHostAttachment[];
  blocks?: DocsBlockOptions;
  onConfirm: (member: Record<string, unknown>) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}): JSX.Element {
  const [mode, setMode] = useState<'embed' | 'link'>('embed');
  const [path, setPath] = useState('');
  const attachment = attachments.find((item) => item.path === path);
  const visualEmbedAvailable = attachment
    ? canEmbedAttachment(attachment, blocks)
    : attachments.some((item) => canEmbedAttachment(item, blocks));
  const selectedMode =
    mode === 'embed' &&
    visualEmbedAvailable &&
    (!attachment || canEmbedAttachment(attachment, blocks))
      ? 'embed'
      : 'link';

  return (
    <ErrorBoundary name="DocsAttachmentPicker">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) setPath('');
        }}
      >
        <DialogContent size="xs" className="space-y-4">
          <div>
            <DialogTitle>Add attachment</DialogTitle>
            <DialogDescription className="mt-2">
              Select an existing document attachment, then choose how it should appear.
            </DialogDescription>
          </div>
          <Select value={path} onValueChange={setPath}>
            <SelectTrigger aria-label="Document attachment">
              <SelectValue placeholder="Select an attachment" />
            </SelectTrigger>
            <SelectContent>
              {attachments.map((item) => (
                <SelectItem key={item.path} value={item.path}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2" aria-label="Attachment format" role="group">
            {visualEmbedAvailable && (
              <Button
                aria-pressed={selectedMode === 'embed'}
                className="flex-1"
                onClick={() => setMode('embed')}
                size="sm"
                type="button"
                variant={selectedMode === 'embed' ? 'default' : 'outline'}
              >
                Visual embed
              </Button>
            )}
            <Button
              aria-pressed={selectedMode === 'link'}
              className="flex-1"
              onClick={() => setMode('link')}
              size="sm"
              type="button"
              variant={selectedMode === 'link' ? 'default' : 'outline'}
            >
              Text link
            </Button>
          </div>
          <Button
            className="w-full"
            disabled={!attachment}
            onClick={() => {
              if (!attachment) return;
              if (selectedMode === 'link') {
                const linkKey = crypto.randomUUID();
                onConfirm({
                  _key: crypto.randomUUID(),
                  _type: 'terraBlock',
                  children: [
                    {
                      _key: crypto.randomUUID(),
                      _type: 'span',
                      marks: [linkKey],
                      text: attachment.name,
                    },
                  ],
                  markDefs: [{ _key: linkKey, _type: 'link', href: attachment.path }],
                  style: 'normal',
                });
              } else if (imageFile.test(attachment.name)) {
                onConfirm({
                  _key: crypto.randomUUID(),
                  _type: 'docImage',
                  alt: attachment.name,
                  title: attachment.name,
                  url: attachment.path,
                });
              } else {
                onConfirm({
                  _key: crypto.randomUUID(),
                  _type: 'embed',
                  src: attachment.path,
                  title: attachment.name,
                });
              }
              onOpenChange(false);
            }}
          >
            {selectedMode === 'embed' ? 'Insert visual attachment' : 'Insert text link'}
          </Button>
        </DialogContent>
      </Dialog>
    </ErrorBoundary>
  );
}
