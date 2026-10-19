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
pnpm dev
```

The React playground opens in your browser. Vite prints the local URL in the terminal, usually `http://127.0.0.1:5173`. It currently provides a placeholder for the future Docs component.

```sh
pnpm run check
pnpm run build
pnpm run build:demo
```

`pnpm run check` runs formatting, lint, and strict type checks for the library and playground. `pnpm run format` applies Prettier formatting. `pnpm run dev:library` watches the library build for development in another repo.

React and React DOM are peer dependencies so hosts supply their React runtime. They are also installed for local development. Builds emit ESM and TypeScript declarations into `dist/`.

The playground lives in `demo/` and builds into `demo-dist/`. It is excluded from the library output.

Publication is disabled while the API, package name, and license remain undecided.
