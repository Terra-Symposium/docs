---
title: Storage providers
description: Keep persistence and identity in the host application.
---

The editor is controlled: the host supplies `value` and receives edits in `onChange`. Repository-backed pages can render Markdown without a remote provider. A remote host implements `DocsRemoteProvider` for drafts, publishing, history, and optional attachment upload.

```tsx
const [value, setValue] = useState<DocsValue>(initialValue);

<Docs mode="edit" value={value} onChange={setValue} />;
```

Do not save on every keystroke. Let the host load a draft, save it with a revision check, and publish it explicitly. The provider interface is:

```ts
type DocsRemoteProvider = {
  loadDraft(slug: string): Promise<{ markdown: string; revision: number }>;
  saveDraft(slug: string, markdown: string, expectedRevision: number): Promise<number>;
  publish(slug: string, expectedRevision: number): Promise<number>;
  history(slug: string): Promise<unknown[]>;
  uploadAttachment?(slug: string, file: File): Promise<DocsAttachment>;
};
```

The host must authenticate every write and draft or history read. Use a compare-and-swap revision check so parallel editors cannot overwrite one another. Public readers should receive only published content and published attachment URLs. Local repository-backed hosts omit the provider and remain read-only in the browser.
