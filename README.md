# Terra Docs

Terra Docs is a reusable React editor and viewer package. Each installation lives in its own host application and controls its own document data, storage, identity, and permissions. This repository contains the component package, an in-memory playground, and the installation and configuration guide.

## Create an instance

Start with the [instance installation guide](src/content/docs/getting-started.md). The React component can be installed into any React 19 app:

```sh
pnpm add @terra-symposium/docs
```

```tsx
import { Docs } from '@terra-symposium/docs';
import type { DocsValue } from '@terra-symposium/docs';
import '@terra-symposium/docs/style.css';
```

The current package release is still under development and is not yet published. To work on a separate local instance against this checkout, install it by local path (`pnpm add /path/to/terra-docs`). Every instance must supply and save a Portable Text value. See the [storage guide](src/content/docs/storage.md) for the current host contract and limitations.

## Run the playground and docs site

Requirements: Node.js 24.12+, pnpm 10.30.3. Run `pnpm install --frozen-lockfile`, then use:

```sh
pnpm dev        # Vite component playground
pnpm docs:dev   # Starlight installation and configuration site
```

Build commands: `pnpm run check`, `pnpm run build`, `pnpm run build:demo`, and `pnpm run docs:build`.

The playground stores edits in memory. It is for trying the component and does not represent a configured installation. A complete product roadmap for Markdown files, adjacent assets, additional content blocks, and storage providers is tracked in the Terra Docs extraction plan.
