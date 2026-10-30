# Test ownership

Docs owns portable editor, workspace, and rich-block behavior. Its Node and Playwright suites exercise the package directly through public entrypoints and deterministic host adapters.

| Owner                                                                      | Retained coverage                                                                                    | Execution                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/lib/terra/runtime`                                                    | Markdown conversion, source preservation, validation, and safe rendering                             | Node tests in `test/*.test.mjs`                        |
| `src/components/terra/editor`                                              | Rich-block rendering and editing, including nodes with persisted positions                           | `test/browser/rich-blocks.spec.ts`                     |
| `src/components/terra/pages/docs` and `src/components/terra/Workspace.tsx` | Workspace navigation, permissions, document actions, persistence, attachments, and responsive layout | `test/browser/workspace.spec.ts`                       |
| Public package build                                                       | Consumer-facing exports and compiled styles/runtime                                                  | `pnpm build`, `pnpm build:demo`, and `pnpm docs:build` |

## Browser evidence and viewport choices

`playwright.config.ts` runs the suite once at the canonical 1280 × 720 desktop viewport. The workspace navigation scenario also checks and captures the actual 768 px transition at 768 and 767 px, while the read-only flow captures its 390 px attachment state. The Standards Reporting reporter writes each test screenshot and named responsive captures to `test-results/visual/screenshots`, then generates the run workbook and screenshot-only PowerPoint. Screenshot metadata carries the run ID so incomplete and historical captures remain distinguishable.

Accordion nested editing and section lifecycle, and Nodes canvas sizing and rendering, share one editor setup and run as single journeys. Table editing remains two tests: a measured combined journey took 14.7 seconds, versus 12.5 seconds for its separate scenarios, so merging it made the suite slower.

## Retired coverage

`test/consumer-browser/workspace.spec.ts` and `playwright.consumer.config.ts` were removed because `DOCS_CONSUMER_URLS` was unset and no in-scope application currently consumes the Docs workspace. The suite skipped its only case without a URL and repeated the package-owned workspace browser assertions. Host-specific adapter behavior remains covered by `test/browser/workspace.spec.ts` using the deterministic demo host. Add a consumer suite only when a real application integration exists, and keep it limited to behavior that integration adds.
