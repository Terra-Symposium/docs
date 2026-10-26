// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/docs/_DocsImage.tsx
 * Docs image renderer with view and edit modes.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// API
import { useEditor } from '@portabletext/editor';

// COMPONENTS
import { AlertError } from '@terra-symposium/styling/ui/terra-original';
import { Button } from '@terra-symposium/styling/ui/terra-original';
import { ErrorBoundary } from '../../ui.js';
import { Empty } from '../../ui.js';
import { Image as ImageIcon, TrashCan as TrashIcon } from '@carbon/icons-react';
import { Input } from '@terra-symposium/styling/ui/terra-original';

// TYPES
import type {
  DocsBlock,
  PortableTextBlockEditorProps,
  PortableTextBlockRendererProps,
} from '../types.js';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/** Sanity Portable Text image fields authored in documentation content. */
type DocsImgBlock = DocsBlock<'docImage'>;
const FIELD_LABEL = 'block text-sm font-medium text-primary-12';

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Renders a Docs image block from its authored block.
 *
 * @param props - Authored image block containing the source URL, dimensions, and accessibility metadata.
 *
 * @return The image with its authored caption and alternate text.
 */
function Img({ block }: { block: DocsImgBlock }): JSX.Element {
  if (!block.url)
    return (
      <ErrorBoundary name="Image">
        <AlertError title="Image unavailable" description="This image block has no URL." />
      </ErrorBoundary>
    );
  return (
    <ErrorBoundary name="Image">
      <img
        src={block.url}
        alt={block.alt ?? ''}
        className="max-w-full"
        {...(block.title === undefined ? {} : { title: block.title })}
        {...(block.width === undefined ? {} : { width: block.width })}
        {...(block.height === undefined ? {} : { height: block.height })}
      />
    </ErrorBoundary>
  );
}
Object.assign(Img, { displayName: 'DocsImagePreview' });

/** Adapts Portable Text's block-object contract to the image renderer. */
/**
 * Renders the renderImage component.
 *
 * @param props - Portable Text renderer attributes, nested children, image node, path, and read-only mode.
 *
 * @return The image renderer in editable or read-only mode.
 */
export function renderImage({
  attributes: attrs,
  children,
  node,
  path,
  readOnly,
}: PortableTextBlockRendererProps<DocsImgBlock>): JSX.Element {
  return readOnly ? (
    <Img block={node} />
  ) : (
    <ImgEditor attributes={attrs} children={children} node={node} path={path} />
  );
}
Object.assign(renderImage, { displayName: 'DocsImageRenderer' });

/** Connects the image block's local controls to its Portable Text state. */
/**
 * Renders the ImageEditor component.
 *
 * @param props - Portable Text editor attributes, nested children, image node, and path used to update image metadata.
 *
 * @return The editable image block controls.
 */
function ImgEditor({
  attributes: attrs,
  children,
  node,
  path,
}: PortableTextBlockEditorProps<DocsImgBlock>): JSX.Element {
  const editor = useEditor();
  const update = (
    field:
      | /** Image metadata keys edited by the docs image form. */ 'alt'
      | 'height'
      | 'title'
      | 'url'
      | 'width',
    val: string,
  ): void => editor.send({ type: 'block.set', at: path, props: { [field]: val } });
  return (
    <ErrorBoundary name="ImageBlock">
      <section
        {...attrs}
        contentEditable={false}
        className="my-8 rounded-xl border border-secondary-6 bg-secondary-1/40 p-4 shadow-sm sm:p-5"
        data-terra-block="docImage"
      >
        <div className="flex items-center gap-3 border-b border-secondary-5 pb-3 text-primary-12">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary-3 text-secondary-11">
            <ImageIcon className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold">Image</h3>
            <p className="text-sm text-primary-11">Docs image block</p>
          </div>
        </div>
        <label className={`mt-4 ${FIELD_LABEL}`}>
          <span>Image URL</span>
          <Input
            className="mt-1.5"
            type="url"
            value={node.url ?? ''}
            onChange={(e) => update('url', e.currentTarget.value)}
            placeholder="https://example.com/image.png"
          />
        </label>
        {node.url ? (
          <figure className="mt-4 overflow-hidden rounded-lg border border-secondary-5 bg-primary-1">
            <img
              src={node.url}
              alt={node.alt ?? ''}
              title={node.title ?? undefined}
              className="max-h-[32rem] w-full object-contain"
              {...(node.width ? { width: node.width } : {})}
              {...(node.height ? { height: node.height } : {})}
            />
            {node.title ? (
              <figcaption className="border-t border-secondary-5 px-3 py-2 text-sm text-primary-11">
                {node.title}
              </figcaption>
            ) : null}
          </figure>
        ) : (
          <Empty variant="preview">Add an image URL to preview it here.</Empty>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Alternative text</span>
            <Input
              className="mt-1.5"
              value={node.alt ?? ''}
              onChange={(e) => update('alt', e.currentTarget.value)}
              placeholder="Describe the image"
            />
          </label>
          <label className={FIELD_LABEL}>
            <span>Caption</span>
            <Input
              className="mt-1.5"
              value={node.title ?? ''}
              onChange={(e) => update('title', e.currentTarget.value)}
              placeholder="Optional caption"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Width</span>
            <Input
              className="mt-1.5"
              value={node.width ?? ''}
              onChange={(e) => update('width', e.currentTarget.value)}
              placeholder="e.g. 640px"
            />
          </label>
          <label className={FIELD_LABEL}>
            <span>Height</span>
            <Input
              className="mt-1.5"
              value={node.height ?? ''}
              onChange={(e) => update('height', e.currentTarget.value)}
              placeholder="e.g. auto"
            />
          </label>
        </div>
        <p className="mt-3 text-xs leading-5 text-primary-10">
          Use a stable, publicly accessible image URL. Uploading assets is part of real-content
          integration.
        </p>
        <Button
          className="mt-4"
          size="sm"
          variant="destructive"
          onClick={() => editor.send({ type: 'unset', at: path })}
        >
          <TrashIcon aria-hidden="true" /> Delete image
        </Button>
        {children}
      </section>
    </ErrorBoundary>
  );
}
Object.assign(ImgEditor, { displayName: 'DocsImageEditor' });
