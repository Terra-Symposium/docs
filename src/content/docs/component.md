---
title: Component reference
description: Supported modes, props, and document content.
---

```tsx
import { Docs } from '@terra-symposium/docs';
import type { DocsProps, DocsValue, DocsMode } from '@terra-symposium/docs';
import '@terra-symposium/docs/style.css';
```

`DocsValue` is a Portable Text block array. The editor and viewer support paragraphs, headings 2–6, quotes, bold, italic, underline, strikethrough, links, and the reusable rich blocks below. The host controls persistence and authorization.

| Prop        | Edit mode               | View mode               |
| ----------- | ----------------------- | ----------------------- |
| `mode`      | Required: `edit`        | Required: `view`        |
| `value`     | Current document        | Document to render      |
| `onChange`  | Required; reports edits | Not accepted            |
| `className` | Optional wrapper class  | Optional wrapper class  |
| `blocks`    | Per-block opt-out flags | Per-block opt-out flags |

## Rich blocks

The default registry includes accordions, tabs, tables, callouts, code, images, embeds, math (including inline math), diagrams, raw Markdown, and TypeScript documentation. The editor provides insertion and structured fields for these blocks. Code is document content; there is no raw document-code mode.

To disable a member in one instance, set its flag to `false`:

```tsx
<Docs mode="edit" value={value} onChange={setValue} blocks={{ embed: false, nodes: false }} />
```

The same options can be passed to `renderMarkdown(markdown, blocks)`. Unknown or disabled structured source stays visible as escaped source, so it is not silently discarded.

`markdownToDocsValue(source)` and `docsValueToMarkdown(value)` bridge local Markdown and visual editing. Existing `=== [Title]` accordions and `||| [Title]` tabs remain supported. Other structured members use a `:::terra-docs type` block containing JSON. Unrecognized Markdown tokens are kept as raw blocks; conversions preserve them verbatim. Store images and attachments beside the Markdown file and use relative paths.

## Workspace shell

`DocsSiteLayout` (React) and `@terra-symposium/docs/site-layout.astro` (Astro) render the shared section selector, page search, group and leaf navigation, document header, and View/Attachments toolbar. Pass `sections` as an ordered array of `{ title, groups: [{ title, leaves: [{ title, href, description?, updatedAt?, attachments? }] }] }`. Pass the active leaf's attachments separately to `attachments` so the toolbar displays them. Each attachment has `title` and `href`, with optional `type` and `size`.

Local hosts use the default read-only capabilities. Remote React hosts pass a `DocsRemoteProvider`, grant `capabilities={{ edit: true, save: true, history: true, publish: true }}`, and supply the toolbar callbacks. **Edit only appears when both the provider and write capability are present.** The host still owns authorization and persistence. The Astro layout is for repository-backed read-only pages.
