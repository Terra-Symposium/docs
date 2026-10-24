---
title: Configuration
description: Configure the Docs component in a host application.
---

The library has no global configuration object. Configure each instance through React props and host-owned code.

## Component props

```tsx
<Docs mode="edit" value={document} onChange={setDocument} className="article-editor" />
<Docs mode="view" value={document} />
```

`mode` is `edit` or `view`. Edit mode requires `onChange`; view mode is read-only. `value` is a Portable Text block array. `className` adds a class to the component container.

Import `@terra-symposium/docs/style.css` for the default styles. Add host styles under your own wrapper class to adjust spacing and colors. A supported theme prop is not available yet.

## Data boundary

The component emits standard Portable Text blocks with `_type: 'block'`. If your CMS uses a different stored format, translate it at the host boundary before passing values to Docs and translate it back when saving. Do not pass website generated types into the package.
