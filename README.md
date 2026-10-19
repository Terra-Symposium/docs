# Terra Docs

A standalone React document editor and viewer, planned for Terra Symposium and other host applications.

The `Docs` component provides basic Portable Text editing and read-only rendering. It follows the editor foundation used by Terra Symposium's `TerraContentEditor`, without website, Sanity, or authentication dependencies. See the [component interface](docs/interface.md).

## Usage

```tsx
import { Docs } from '@terra-symposium/docs';
import type { DocsValue } from '@terra-symposium/docs';
import '@terra-symposium/docs/style.css';
import { useState } from 'react';

function Example() {
  const [value, setValue] = useState<DocsValue>([]);
  return <Docs mode="edit" value={value} onChange={setValue} />;
}
```

Use `<Docs mode="view" value={value} />` to render the same document without editing controls. The host owns persistence. This first version supports paragraphs, headings 2–6, quotes, bold, italic, underline, strikethrough, and links. Images, uploads, lists, and custom blocks are not implemented yet.

## Development

Use Node.js from `.nvmrc` and pnpm 10.30.3:

```sh
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The React playground opens in your browser. Vite prints the local URL in the terminal, usually `http://127.0.0.1:5173`. Edit the sample document, switch between Edit and View, inspect its JSON, or reset it. Demo changes stay in memory.

```sh
pnpm run check
pnpm run build
pnpm run build:demo
```

`pnpm run check` runs formatting, lint, and strict type checks for the library and playground. `pnpm run format` applies Prettier formatting. `pnpm run dev:library` watches the library build for development in another repo.

React and React DOM are peer dependencies so hosts supply their React runtime. They are also installed for local development. Builds emit ESM and TypeScript declarations into `dist/`.

The playground lives in `demo/` and builds into `demo-dist/`. It is excluded from the library output.

Publication is disabled while the API, package name, and license remain undecided.
