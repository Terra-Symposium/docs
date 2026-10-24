---
title: Storage providers
description: Keep persistence and identity in the host application.
---

The editor is controlled: the host supplies `value` and receives edits in `onChange`. This is the persistence boundary. Save the new value to your chosen database, file system, or API and reload it into the component when the instance opens.

```tsx
const [value, setValue] = useState<DocsValue>(initialValue);

async function save(next: DocsValue) {
  setValue(next);
  await fetch('/api/documents/current', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  });
}

<Docs mode="edit" value={value} onChange={save} />;
```

This example assumes your host already provides that API and its authorization checks. Terra Docs does not currently include a local Markdown provider, asset upload interface, authentication, or remote storage adapter. The in-repository playground keeps edits in memory only.
