# Proposed Docs interface

This is a design sketch, not an implemented API. The document/block format is still undecided.

One React component supports two modes:

```tsx
<Docs mode="edit" value={document} onChange={setDocument} onUpload={uploadFile} />

<Docs mode="view" value={document} />
```

| Prop                 | Purpose                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `mode`               | `'edit'` enables editing; `'view'` renders read-only content.                                                               |
| `value`              | The document supplied by the host application.                                                                              |
| `onChange(document)` | Required in edit mode; sends the updated document to the host. It does not save automatically.                              |
| `onUpload(file)`     | Optional in edit mode; uploads a `File` and returns `Promise<{ url: string }>`. Upload controls are unavailable without it. |
| `className`          | Optional class for the component container.                                                                                 |
| `theme`              | Proposed appearance configuration; its shape is still undecided.                                                            |

View mode does not accept editing callbacks. The eventual prop types should enforce this distinction using `mode`.

## Image uploads

The host chooses where files are stored:

```tsx
async function uploadFile(file: File): Promise<{ url: string }> {
  const url = await storage.upload(file);
  return { url };
}
```

Docs stores the returned URL in the image block, reports the updated document through `onChange`, and renders the image from that URL. Upload failures should be shown without adding a broken image block.

Stored URLs must remain usable when documents reopen. Expiring private URLs need a separate attachment-ID/resolver contract, which is deferred. Local-only documents also need durable attachment storage; temporary object URLs are not sufficient.

The host owns saving/loading, authentication, permissions, and storage. Docs owns editing and rendering. This scaffold exports only `DocsMode`; it does not export a runtime `Docs` component yet.
