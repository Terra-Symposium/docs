# Docs interface

The basic component uses Portable Text block arrays (`DocsValue`) and supports paragraphs, headings 2–6, quotes, bold, italic, underline, strikethrough, and links. It exports `Docs`, `DocsProps`, `DocsMode`, and `DocsValue`.

One React component supports two modes:

```tsx
<Docs mode="edit" value={document} onChange={setDocument} />

<Docs mode="view" value={document} />
```

| Prop                 | Purpose                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `mode`               | `'edit'` enables editing; `'view'` renders read-only content.                                  |
| `value`              | The document supplied by the host application.                                                 |
| `onChange(document)` | Required in edit mode; sends the updated document to the host. It does not save automatically. |
| `className`          | Optional class for the component container.                                                    |

View mode does not accept editing callbacks; `DocsProps` enforces this distinction using `mode`. Both modes accept updated values from the host. Use an immutable array for each update.

Import `@terra-symposium/docs/style.css` for the default scoped styles. `className` allows host-specific styling. A `theme` prop is deferred.

This is a client-side component in both modes. `value` uses standard `_type: 'block'` text blocks; the website's `_type: 'terraBlock'` storage format needs a host adapter before use. Complex Terra blocks are outside this first version.

The formatting toolbar follows Terra’s compact, sticky layout: a block-style dropdown, Carbon formatting icons, and a link control. Custom block insertion and attachments remain deferred until their renderers are migrated.

## Planned image uploads

Image blocks and `onUpload` are not implemented yet. The agreed future callback lets the host choose where files are stored:

```tsx
async function uploadFile(file: File): Promise<{ url: string }> {
  const url = await storage.upload(file);
  return { url };
}
```

The intended behavior is for Docs to store the returned URL in an image block, report it through `onChange`, and render the image from that URL. Upload failures should be shown without adding a broken image block.

Stored URLs must remain usable when documents reopen. Expiring private URLs need a separate attachment-ID/resolver contract, which is deferred. Local-only documents also need durable attachment storage; temporary object URLs are not sufficient.

The host owns saving/loading, authentication, permissions, and storage. Docs owns editing and rendering.

## Terra source

This component follows the schema/provider/editable surface and formatting commands in [TerraContentEditor](https://github.com/Terra-Symposium/terra-symposium-website/blob/7041215247802c8a779c6a81a6f76150cdcb67c3/astro/src/components/editor/TerraContentEditor.tsx) and its toolbar. It uses the same `@portabletext/editor` version (7.9.0), retaining only the basic text subset. It does not depend on Terra's generated Sanity types or internal UI components.
