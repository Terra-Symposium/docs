# Test ownership

Terra Docs owns the reusable editor, document workspace, rich blocks, and the deterministic browser host used to exercise document behavior. `test/browser` follows the package source boundaries: workspace journeys live in `workspace.spec.ts`, while rich-block scenarios live beside their block modules. Browser tests use Playwright controls and assert the rendered result and persisted state; they do not substitute source-text checks for UI behavior.

`test/consumer-browser` has one narrow responsibility: verify that a separately installed package works through its public exports in a consumer app. It checks the consumer integration boundary and does not repeat the package's editor or rich-block behavior cases.

The Terra website owns only behavior introduced by its host: authorization, Sanity actions, migrations, persistence adapters, and website-specific route composition. Those tests use the Docs package's public entry points for editor behavior. Portable editor, workspace, and rich-block assertions belong here and should not be duplicated in the website.

Use the declared viewport tags in each browser scenario to select only the sizes that can change its observable behavior. Keep layout-independent editing and persistence journeys at XL. Add a mobile or tablet run when the workspace navigation, controls, wrapping, or overflow changes the interaction, and record the reason in the test annotation.

Run package unit tests with `pnpm test`, the package browser inventory with `pnpm test:browser`, and the public consumer check with `pnpm test:consumer`. `pnpm check` validates formatting, lint, and types.
