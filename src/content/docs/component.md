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

`markdownToDocsValue(source)` and `docsValueToMarkdown(value)` bridge local Markdown and visual editing. The supported representations are:

- Paragraphs, headings 2–6, quotes, inline emphasis, links, and inline math use Markdown syntax. A level-one heading follows the original Terra contract and imports as normal text.
- Ordered and unordered lists, including nested list levels, use Markdown list syntax.
- GFM pipe tables and native HTML tables import as editable table blocks and export as pipe tables.
- A standalone `![alt](./image.png "Title")` paragraph imports as an image block. An image embedded within prose remains in the paragraph source.
- Fenced code blocks import as code content. Display math uses `$$` delimiters.
- Callouts use container directives such as `:::warning[Check this]` followed by Markdown body content and a closing `:::`.
- Accordions use `=== [Title]` and tabs use `||| [Title]`; the body between the opening and closing delimiter is Markdown.
- Other structured rich blocks use `:::terra-docs type` with a JSON object containing the block. The `type` must match the object's `_type`.

Unknown Markdown tokens and disabled block syntax are kept as raw source. Fields that cannot be represented in Markdown remain in the `:::terra-docs type` JSON form, so an open and save does not silently discard them. Store images and attachments beside the Markdown file and use relative paths.

## Workspace shell

`DocsSiteLayout` (React) and `@terra-symposium/docs/site-layout.astro` are static-host adapters around the same Terra Docs workspace used by the local and remote providers. They render the original section selector, nested group and leaf tree, document header, and View/Attachments toolbar. They do not add a second site shell or a persistent page-search field. Pass `sections` as an ordered array of `{ title, groups: [{ title, leaves: [{ title, href, description?, updatedAt?, attachments? }] }] }`. Each attachment belongs to its leaf and appears in Attachments mode, not in the navigation tree.

Local hosts use `DocsLocalWorkspace` and remain read-only in the browser. Remote hosts mount `TerraDocsWorkspace` with a `DocsHostAdapter`; the adapter supplies capabilities and routes all reads and mutations to the host. The shared UI does not decide identity or authorization.
