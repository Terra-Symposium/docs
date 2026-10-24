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

Repository-backed hosts omit `capabilities`, so the browser shows View and Attachments. Remote hosts pass a `DocsRemoteProvider`, grant `capabilities={{ edit: true, save: true, history: true, publish: true }}`, and wire save, history, and publish callbacks after their own permission checks. These callbacks do not bypass host authorization. Astro hosts can use `@terra-symposium/docs/site-layout.astro` for read-only pages.

For a mutable tree, pass `treeActions` to `DocsSiteLayout`. Its `available(action)` function decides which section, group, and leaf menu items to show; `perform(action)` persists a requested operation through the host. Supported requests include create, rename, duplicate, move or reorder, attachment management, download, and deletion. The host must check permissions again on the server and return an error if the mutation fails. Read-only hosts omit `treeActions` and retain leaf links, Copy link, Open in new tab, and Attachments view.
