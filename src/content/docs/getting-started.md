---
title: Create an instance
description: Set up a separate React app that uses Terra Docs.
---

## Requirements

- Node.js 24.12 or newer
- pnpm 10.30.3 or newer
- React 19

## Create the host app

```sh
pnpm create vite my-docs --template react-ts
cd my-docs
pnpm install
pnpm add react react-dom
```

Install the published package when a release is available:

```sh
pnpm add @terra-symposium/docs
```

For development against this repository before publication, use a local package link:

```sh
pnpm add /path/to/terra-docs
```

The host app remains its own project and Git repository. React and React DOM are peer dependencies and must be installed by the host.

## Add the editor

Replace the starter component with:

```tsx
import { useState } from 'react';
import { Docs } from '@terra-symposium/docs';
import type { DocsValue } from '@terra-symposium/docs';
import '@terra-symposium/docs/style.css';

export default function App() {
  const [value, setValue] = useState<DocsValue>([]);
  return <Docs mode="edit" value={value} onChange={setValue} />;
}
```

Run `pnpm dev`. This example stores changes in memory; saving and loading are responsibilities of the host app. See [storage](/storage/) before using it for durable documents.
