---
title: Component reference
description: Supported modes, props, and document content.
---

```tsx
import { Docs } from '@terra-symposium/docs';
import type { DocsProps, DocsValue, DocsMode } from '@terra-symposium/docs';
import '@terra-symposium/docs/style.css';
```

`DocsValue` is a Portable Text block array. The current editor and viewer support paragraphs, headings 2–6, quotes, bold, italic, underline, strikethrough, and links. Complex custom blocks, images, uploads, lists, and Markdown conversion are not implemented in the current package.

| Prop        | Edit mode               | View mode              |
| ----------- | ----------------------- | ---------------------- |
| `mode`      | Required: `edit`        | Required: `view`       |
| `value`     | Current document        | Document to render     |
| `onChange`  | Required; reports edits | Not accepted           |
| `className` | Optional wrapper class  | Optional wrapper class |
