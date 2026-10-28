import { useEditor } from '@portabletext/editor';
import {
  Add as AddIcon,
  Link as LinkIcon,
  TextBold as BoldIcon,
  TextItalic as ItalicIcon,
  TextStrikethrough as StrikethroughIcon,
  TextUnderline as UnderlineIcon,
} from '@carbon/icons-react';
import { useState } from 'react';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@terra-symposium/styling/ui/terra-original';
import { ErrorBoundary } from '../../ui.js';
import { defaultDocsBlock, enabledDocsBlocks } from '../../../blocks.js';
import { DocsAttachmentPicker } from './DocsAttachmentPicker.js';
import type { DocsBlockOptions, DocsBlockType } from '../../../blocks.js';
import type { DocsHostAttachment } from '../../../../lib/host.js';
import type { JSX, MouseEvent, MouseEventHandler, ReactNode } from 'react';

type DocsInsertionType = DocsBlockType | 'attachment';
type DocsInsertion = { label: string; type: DocsInsertionType; value: string };

/** Keep the Docs insertion order and labels from Terra's original editor. */
const DOCS_INSERTIONS: readonly DocsInsertion[] = [
  { label: 'Math', type: 'math', value: 'docs:math' },
  { label: 'Code', type: 'code', value: 'docs:code' },
  { label: 'Receive value', type: 'code', value: 'docs:code-received' },
  { label: 'Add attachment', type: 'attachment', value: 'docs:attachment' },
  { label: 'Nodes', type: 'nodes', value: 'docs:nodes' },
  { label: 'TypeScript docs', type: 'tsDocs', value: 'docs:tsDocs' },
  { label: 'Raw', type: 'raw', value: 'docs:raw' },
  { label: 'Table', type: 'table', value: 'docs:table' },
  { label: 'Callout', type: 'callout', value: 'docs:callout' },
  { label: 'Tabs', type: 'tabs', value: 'docs:tabs' },
  { label: 'Accordion', type: 'accordion', value: 'docs:accordion' },
];

/** Formatting and insertion controls mechanically adapted from Terra's original Docs toolbar. */
export function TerraToolbar({
  actions,
  attachments,
  blocks,
  onChange,
  nested = false,
}: {
  actions?: ReactNode;
  attachments: DocsHostAttachment[];
  blocks?: DocsBlockOptions;
  onChange: (content: unknown[]) => void;
  nested?: boolean;
}): JSX.Element {
  const editor = useEditor();
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const [receivedValueOpen, setReceivedValueOpen] = useState(false);
  const [endpoint, setEndpoint] = useState('');

  const sync = (): void => onChange(editor.getSnapshot().context.value as unknown[]);
  const run = (event: MouseEvent<HTMLButtonElement>, action: () => void): void => {
    event.preventDefault();
    action();
    editor.send({ type: 'focus' });
  };
  const insertBlock = (type: DocsBlockType, override?: Record<string, unknown>): void => {
    const value: Record<string, unknown> = {
      ...defaultDocsBlock(type),
      _key: crypto.randomUUID(),
      ...(override ?? {}),
    };
    if (type === 'table') {
      const key = (): string => crypto.randomUUID();
      const cell = (text: string): Record<string, unknown> => ({
        _key: key(),
        _type: 'cell',
        content: [
          {
            _key: key(),
            _type: 'block',
            children: [{ _key: key(), _type: 'span', marks: [], text }],
            markDefs: [],
            style: 'normal',
          },
        ],
      });
      value.header = 'Table';
      value.rows = [
        { _key: key(), _type: 'row', cells: [cell('Header'), cell('Header')] },
        { _key: key(), _type: 'row', cells: [cell('Cell'), cell('Cell')] },
      ];
    }
    editor.send({
      type: 'insert.block object',
      blockObject: { name: type, value },
      placement: 'after',
    } as never);
    sync();
    editor.send({ type: 'focus' });
  };
  const insertAttachment = (member: Record<string, unknown>): void => {
    if (member._type === 'terraBlock') {
      editor.send({
        type: 'insert.block',
        block: { ...member, _type: 'block' },
        placement: 'after',
      } as never);
    } else {
      editor.send({
        type: 'insert.block object',
        blockObject: { name: String(member._type), value: member },
        placement: 'after',
      } as never);
    }
    sync();
    editor.send({ type: 'focus' });
  };
  const insertReceivedValue = (): void => {
    const src = endpoint.trim();
    if (!src) return;
    insertBlock('code', { language: 'json', source: src, value: '' });
    setEndpoint('');
    setReceivedValueOpen(false);
  };
  const availableBlocks = enabledDocsBlocks(blocks);

  return (
    <ErrorBoundary name="TerraToolbar">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-xl border border-primary-7 bg-primary-3 px-3 py-2 shadow-lg shadow-primary-12/20 sm:px-4"
        role="toolbar"
        aria-label="Editor controls"
      >
        {actions && (
          <>
            {actions}
            <div className="hidden h-6 w-px bg-primary-5 sm:block" />
          </>
        )}
        <div className="flex items-center gap-1">
          <Select
            onValueChange={(style) => {
              editor.send({ type: 'style.toggle', style } as never);
              editor.send({ type: 'focus' });
            }}
          >
            <SelectTrigger className="w-32 sm:w-36" size="sm" aria-label="Block type">
              <SelectValue placeholder="Text" />
            </SelectTrigger>
            <SelectContent align="start">
              {[
                { title: 'Normal', value: 'normal' },
                { title: 'Heading 2', value: 'h2' },
                { title: 'Heading 3', value: 'h3' },
                { title: 'Heading 4', value: 'h4' },
                { title: 'Heading 5', value: 'h5' },
                { title: 'Heading 6', value: 'h6' },
                { title: 'Quote', value: 'blockquote' },
              ].map(({ title, value }) => (
                <SelectItem key={value} value={value}>
                  {title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mx-1 hidden h-6 w-px bg-primary-5 sm:block" />
          {[
            { Icon: BoldIcon, decorator: 'strong', label: 'Bold' },
            { Icon: ItalicIcon, decorator: 'em', label: 'Italic' },
            { Icon: UnderlineIcon, decorator: 'underline', label: 'Underline' },
            { Icon: StrikethroughIcon, decorator: 'strike-through', label: 'Strikethrough' },
          ].map(({ Icon, decorator, label }) => (
            <ToolbarButton
              key={label}
              label={label}
              onMouseDown={(event) =>
                run(event, () => editor.send({ type: 'decorator.toggle', decorator } as never))
              }
            >
              <Icon className="size-4" aria-hidden="true" />
            </ToolbarButton>
          ))}
          <ToolbarButton
            label="Link"
            onMouseDown={(event) =>
              run(event, () => {
                const href = window.prompt('Link URL');
                if (href)
                  editor.send({
                    type: 'annotation.add',
                    annotation: { name: 'link', value: { href } },
                  } as never);
              })
            }
          >
            <LinkIcon className="size-4" aria-hidden="true" />
          </ToolbarButton>
        </div>
        <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 sm:flex-none">
          <DocsAttachmentPicker
            attachments={attachments}
            {...(blocks ? { blocks } : {})}
            onConfirm={insertAttachment}
            open={attachmentPickerOpen}
            onOpenChange={setAttachmentPickerOpen}
          />
          <InsertMenu
            blocks={availableBlocks}
            nested={nested}
            onAttachment={() => setAttachmentPickerOpen(true)}
            onBlock={(value) => {
              if (value === 'docs:code-received') setReceivedValueOpen(true);
              else if (value === 'docs:attachment') setAttachmentPickerOpen(true);
              else {
                const choice = DOCS_INSERTIONS.find((item) => item.value === value);
                if (choice && choice.type !== 'attachment') insertBlock(choice.type);
              }
            }}
            onInlineMath={() => {
              editor.send({
                type: 'insert.inline object',
                inlineObject: { name: 'math', value: { code: 'E = mc^2', inline: true } },
              } as never);
              sync();
              editor.send({ type: 'focus' });
            }}
            canInlineMath={blocks?.inlineMath !== false}
          />
        </div>
        <Dialog
          open={receivedValueOpen}
          onOpenChange={(open) => {
            setReceivedValueOpen(open);
            if (!open) setEndpoint('');
          }}
        >
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Receive value</DialogTitle>
            </DialogHeader>
            <Label htmlFor="docs-received-code-endpoint">API endpoint</Label>
            <Input
              id="docs-received-code-endpoint"
              value={endpoint}
              onChange={(event) => setEndpoint(event.currentTarget.value)}
              placeholder="/api/docs?action=testimonials"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReceivedValueOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!endpoint.trim()} onClick={insertReceivedValue}>
                Receive value
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}

function InsertMenu({
  blocks,
  canInlineMath,
  nested,
  onAttachment,
  onBlock,
  onInlineMath,
}: {
  blocks: DocsBlockType[];
  canInlineMath: boolean;
  nested: boolean;
  onAttachment: () => void;
  onBlock: (value: string) => void;
  onInlineMath: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const enabled = new Set(blocks);
  const choices = DOCS_INSERTIONS.filter((choice) => {
    if (choice.value === 'docs:code-received') return enabled.has('code');
    if (choice.type === 'attachment') return true;
    if (!enabled.has(choice.type)) return false;
    return !nested || !['tabs', 'accordion', 'callout'].includes(choice.type);
  });
  const choose = (action: () => void): void => {
    action();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="size-9 shrink-0 p-0"
          aria-label="Insert content"
          aria-expanded={open}
          title="Insert content"
        >
          <AddIcon className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 overflow-hidden p-0">
        <Command>
          <CommandInput
            autoFocus
            className="border-b border-primary-5 py-3"
            placeholder="Search content…"
          />
          <CommandList className="max-h-80 p-1.5">
            <CommandEmpty>No content types found.</CommandEmpty>
            {canInlineMath && (
              <CommandGroup
                heading="Inline"
                className="px-1 py-2 [&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-2 [&_[cmdk-group-items]]:gap-1"
              >
                <CommandItem
                  className="min-w-0 px-3 py-2"
                  value="inline:docs:math"
                  keywords={['Docs', 'Math']}
                  onSelect={() => choose(onInlineMath)}
                >
                  Math
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup
              heading="Block"
              className="border-t border-primary-5 px-1 py-2 [&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-2 [&_[cmdk-group-items]]:gap-1"
            >
              {choices.map((choice) => (
                <CommandItem
                  className="min-w-0 px-3 py-2"
                  key={choice.value}
                  value={`block:${choice.value}`}
                  keywords={['Docs', choice.label, choice.type]}
                  onSelect={() =>
                    choose(() => {
                      if (choice.type === 'attachment') onAttachment();
                      else onBlock(choice.value);
                    })
                  }
                >
                  {choice.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ToolbarButton({
  children,
  label,
  onMouseDown,
}: {
  children: ReactNode;
  label: string;
  onMouseDown: MouseEventHandler<HTMLButtonElement>;
}): JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onMouseDown={onMouseDown}
    >
      {children}
    </Button>
  );
}
