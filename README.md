# Terra Docs

Terra Docs is a reusable React editor and viewer package. Each installation lives in its own host application and controls its own document data, storage, identity, and permissions. This repository contains the component package and installation guide.

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

The current package release is still under development and is not yet published. To work on a separate local instance against this checkout, install it by local path (`pnpm add /path/to/terra-docs`). Markdown hosts can use `renderMarkdown`, `markdownToDocsValue`, and `docsValueToMarkdown`; remote hosts implement the [storage provider](src/content/docs/storage.md).

## Run the playground and docs site

Requirements: Node.js 24.12+, pnpm 10.30.3. Run `pnpm install --frozen-lockfile`, then use:

```sh
pnpm dev        # Vite component playground
pnpm docs:dev   # Astro installation and configuration guide
```

The launcher delegates port acquisition to Terra Quality, then starts the dev server with strict port handling. Host apps use this shared launcher; set DOCS_DEV_PORT to override their preferred port.

Build commands: `pnpm run check`, `pnpm run build`, `pnpm run build:demo`, and `pnpm run docs:build`.

The reusable block registry includes accordions, tabs, tables, callouts, code, images, embeds, math, diagrams, raw Markdown, and TypeScript documentation. All are available by default; hosts can disable individual members with the `blocks` prop. Local repository pages stay read-only in the browser.

## Embed a Docs workspace

The shared workspace accepts sections containing groups and leaves. Each leaf owns its attachment links; files are never navigation entries. The host provides URLs, storage, access decisions, and mutations.

```tsx
import { DocsSiteLayout } from '@terra-symposium/docs';
import type { DocsSection } from '@terra-symposium/docs';

const sections: DocsSection[] = [
  {
    title: 'Guides',
    groups: [
      {
        title: 'Getting started',
        leaves: [
          {
            title: 'Install',
            href: '/install/',
            attachments: [{ title: 'Example PDF', href: '/files/install/example.pdf' }],
          },
        ],
      },
    ],
  },
];

<DocsSiteLayout
  title="My Docs"
  nodes={[]}
  sections={sections}
  currentPath="/install/"
  attachments={sections[0].groups[0].leaves[0].attachments}
>
  <article>Document content</article>
</DocsSiteLayout>;
```

`DocsSiteLayout` delegates to the canonical shared workspace and is intended for static React pages. Repository-backed hosts should use `DocsLocalWorkspace`, which loads each leaf and its adjacent attachments from the host-provided tree and remains read-only. Remote hosts should use `TerraDocsWorkspace` with a `DocsHostAdapter`; that adapter supplies the original tree controls and performs create, rename, duplicate, reorder, attachment, export, and delete operations after applying the host's own permission checks.
