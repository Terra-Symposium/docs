# Docs test ownership during extraction

The public package owns tests for its portable contract: Markdown and rich-block conversion, rendering, the workspace header and toolbar order, navigation controls, and capability-gated Edit. Run them with `pnpm test`, `pnpm test:browser`, and `pnpm check`.

The Terra website still owns the following tests because their subjects remain website implementations. They must keep running there until those subjects are extracted and the tests can use public package APIs without a sibling checkout:

| Website suite                                                         | Current website dependency                                                             | Package replacement needed                                                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `tests/astro/content/terra-content/docs/*.case.ts` and `docs.spec.ts` | `TerraContentEditor`, Sanity `TerraContent`, website Playwright harness                | Extract the shared Article/Problem/Docs editor surface and run component cases here                        |
| `tests/docs/docs.spec.ts`                                             | Hosted Docs routes, auth, Sanity actions, website migrations and custom product blocks | Keep host authorization and storage tests in Terra; move only portable editor and renderer assertions here |
| `tests/docs/docs.test.ts`                                             | Website Docs paths, datatable, local Development export, Sanity metadata               | Keep host adapters and product data tests in Terra; move any portable path and document logic here         |

Do not remove the website tests while they are the only coverage for its hosted editor, permissions, storage, and legacy content. Completing the move requires the shared editor extraction, replacing website internal imports with package exports, then running the same browser assertions against the package harness. A copied test that cannot run does not count as migrated coverage.
