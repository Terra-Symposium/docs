---
title: Storage providers
description: Keep persistence and identity in the host application.
---

The standalone editor component is controlled: the host supplies `value` and receives edits in `onChange`. Repository-backed pages use `DocsLocalWorkspace` to render Markdown and adjacent files without an account or server. A remote Docs installation mounts `TerraDocsWorkspace` and implements the `DocsHostAdapter` operations required for drafts, publishing, history, and attachment upload.

```tsx
const [value, setValue] = useState<DocsValue>(initialValue);

<Docs mode="edit" value={value} onChange={setValue} />;
```

Do not save on every keystroke. Let the host load a draft, save it with a revision check, and publish it explicitly. The host adapter contract is:

```ts
type DocsHostAdapter = {
  capabilities: DocsHostCapabilities;
  invoke(operation: DocsActionOperation, input?: unknown): Promise<DocsActionResult>;
  loadDraft?(path: string): Promise<DocsHostDocument | null>;
  publishDraft?(path: string): Promise<void>;
};
```

The host must authenticate every write and draft or history read. Use a compare-and-swap revision check so parallel editors cannot overwrite one another. Public readers should receive only published content and published attachment URLs. Local repository-backed hosts use the read-only local adapter and expose no browser write controls.
