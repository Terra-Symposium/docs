---
title: Develop Terra Docs
description: Work on the package and documentation site.
---

Use Node.js from `.nvmrc` and pnpm 10.30.3:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The command starts the Vite component playground. Run the Astro installation guide separately with `pnpm docs:dev`. Build the package, playground, and guide with `pnpm run check`, `pnpm run build`, `pnpm run build:demo`, and `pnpm run docs:build`.
