import {
  Link,
  Redo,
  TextBold,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  Undo,
} from '@carbon/icons-react';
import { useEditor, useEditorSelector } from '@portabletext/editor';
import {
  getActiveStyle,
  isActiveAnnotation,
  isActiveDecorator,
} from '@portabletext/editor/selectors';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@terra-symposium/styling/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { safeLink, schema } from '../lib/schema.js';
import { defaultDocsBlock, enabledDocsBlocks } from './blocks.js';
import type { DocsBlockOptions } from './blocks.js';
import type { EditorSelection } from '@portabletext/editor';
import type { JSX } from 'react';

/** Terra's style dropdown and Carbon formatting controls, without website UI dependencies. */
export function Toolbar({ blocks }: { blocks?: DocsBlockOptions | undefined }): JSX.Element {
  const editor = useEditor();
  const snapshot = useEditorSelector(editor, (state) => state);
  const selection = useRef<EditorSelection>(null);
  const linkDialog = useRef<HTMLDialogElement>(null);
  const linkId = useId();
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState(false);
  const [blockSelection, setBlockSelection] = useState('');
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.querySelector<HTMLElement>('.terra-docs-formatting-slot')), []);

  const controls = (
    <div className="terra-docs-toolbar" role="toolbar" aria-label="Editor controls">
      <Select
        value={getActiveStyle(snapshot) ?? 'normal'}
        onValueChange={(style) => {
          if (selection.current) editor.send({ type: 'select', at: selection.current });
          editor.send({ type: 'style.toggle', style });
          editor.send({ type: 'focus' });
        }}
      >
        <SelectTrigger
          className="terra-docs-select"
          aria-label="Block type"
          onPointerDownCapture={() => {
            selection.current = editor.getSnapshot().context.selection;
          }}
          onKeyDownCapture={() => {
            selection.current = editor.getSnapshot().context.selection;
          }}
        >
          <SelectValue placeholder="Text" />
        </SelectTrigger>
        <SelectContent
          className="terra-docs-select-menu"
          position="popper"
          sideOffset={8}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {schema.styles.map(({ name, title }) => (
            <SelectItem key={name} value={name} className="terra-docs-select-item">
              {title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="terra-docs-toolbar-divider" aria-hidden="true" />
      {[
        { Icon: TextBold, name: 'strong', label: 'Bold' },
        { Icon: TextItalic, name: 'em', label: 'Italic' },
        { Icon: TextUnderline, name: 'underline', label: 'Underline' },
        { Icon: TextStrikethrough, name: 'strike-through', label: 'Strikethrough' },
      ].map(({ Icon, name, label }) => (
        <Button
          key={name}

          variant="ghost"
          size="xs"
          aria-label={label}
          title={label}
          aria-pressed={isActiveDecorator(name)(snapshot)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            editor.send({ type: 'decorator.toggle', decorator: name });
            editor.send({ type: 'focus' });
          }}
        >
          <Icon size={16} aria-hidden="true" />
        </Button>
      ))}
      <Button

        variant="ghost"
        size="xs"
        aria-label="Link"
        title="Link"
        aria-pressed={isActiveAnnotation('link')(snapshot)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          selection.current = editor.getSnapshot().context.selection;
          setLinkValue('');
          setLinkError(false);
          linkDialog.current?.showModal();
        }}
      >
        <Link size={16} aria-hidden="true" />
      </Button>
      <Select
        value={blockSelection}
        onValueChange={(value) => {
          const type = value as ReturnType<typeof enabledDocsBlocks>[number];
          if (!type) return;
          editor.send({
            type: 'insert.block object',
            blockObject: { name: type, value: defaultDocsBlock(type) },
            placement: 'after',
          });
          setBlockSelection('');
          editor.send({ type: 'focus' });
        }}
      >
        <SelectTrigger aria-label="Insert rich block">
          <SelectValue placeholder="Insert block" />
        </SelectTrigger>
        <SelectContent>
          {enabledDocsBlocks(blocks).map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {blocks?.inlineMath !== false && (
        <Button

          variant="ghost"
          size="xs"
          aria-label="Insert inline math"
          title="Insert inline math"
          onClick={() => {
            editor.send({
              type: 'insert.inline object',
              inlineObject: { name: 'math', value: { code: 'E = mc^2', inline: true } },
            });
            editor.send({ type: 'focus' });
          }}
        >
          ∑
        </Button>
      )}
      <Button

        variant="ghost"
        size="xs"
        aria-label="Undo"
        title="Undo"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          editor.send({ type: 'history.undo' });
          editor.send({ type: 'focus' });
        }}
      >
        <Undo size={16} aria-hidden="true" />
      </Button>
      <Button

        variant="ghost"
        size="xs"
        aria-label="Redo"
        title="Redo"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          editor.send({ type: 'history.redo' });
          editor.send({ type: 'focus' });
        }}
      >
        <Redo size={16} aria-hidden="true" />
      </Button>
      <dialog
        ref={linkDialog}
        className="terra-docs-link-dialog"
        aria-labelledby={`${linkId}-title`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const href = safeLink(linkValue);
            if (!href) {
              setLinkError(true);
              return;
            }
            if (selection.current) editor.send({ type: 'select', at: selection.current });
            editor.send({ type: 'annotation.add', annotation: { name: 'link', value: { href } } });
            linkDialog.current?.close();
            editor.send({ type: 'focus' });
          }}
        >
          <h2 id={`${linkId}-title`}>Add link</h2>
          <label htmlFor={`${linkId}-url`}>URL</label>
          <Input
            id={`${linkId}-url`}
            autoFocus
            required
            value={linkValue}
            onChange={(event) => setLinkValue(event.currentTarget.value)}
            placeholder="https://example.com"
          />
          {linkError && <p role="alert">Enter a valid web, email, or relative URL.</p>}
          <div>
            <Button

              variant="ghost"
              onClick={() => {
                linkDialog.current?.close();
                editor.send({ type: 'focus' });
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Add link</Button>
          </div>
        </form>
      </dialog>
    </div>
  );
  return slot ? createPortal(controls, slot) : controls;
}
