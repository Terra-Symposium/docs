# Terra Docs

A standalone React document editor and viewer, planned for Terra Symposium and other host applications.

This repository contains a TypeScript library scaffold and a [proposed component interface](docs/interface.md). The `Docs` component is not implemented yet. No website code has been migrated.

## Development

Use Node.js from `.nvmrc` and pnpm 10.30.3:

```sh
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
```

`pnpm run check` runs formatting, lint, and strict type checks. `pnpm run format` applies Prettier formatting. `pnpm run dev` watches the library build.

React and React DOM are peer dependencies so hosts supply their React runtime. They are also installed for local development. Builds emit ESM and TypeScript declarations into `dist/`.

Publication is disabled while the API, package name, and license remain undecided.
