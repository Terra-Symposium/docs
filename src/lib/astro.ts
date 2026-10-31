/**
 * Vite dependencies that must be pre-bundled when an Astro React island loads
 * the published Docs package. Astro's island loader does not reliably expose
 * these package imports to Vite's dependency crawler, so both Docs entrypoints
 * and their nested CommonJS dependencies need explicit optimization.
 */
export const DOCS_VITE_OPTIMIZE_DEPS = [
  '@terra-symposium/docs',
  '@terra-symposium/docs/local-workspace',
  // Docs imports shared UI and hue utilities from this peer package. Include
  // it as a root so Vite also pre-bundles its CommonJS runtime dependencies.
  '@terra-symposium/styling',
  '@terra-symposium/styling > bezier-easing',
  '@terra-symposium/docs > @carbon/icons-react',
  '@terra-symposium/docs > @dagrejs/dagre',
  '@terra-symposium/docs > @portabletext/editor',
  '@terra-symposium/docs > @xstate/react',
  '@terra-symposium/docs > @xyflow/react',
  '@terra-symposium/docs > debug',
  '@terra-symposium/docs > prop-types',
  '@terra-symposium/docs > sanitize-html',
  '@terra-symposium/docs > use-sync-external-store/shim',
  '@terra-symposium/docs > use-sync-external-store/shim/with-selector',
  'react/compiler-runtime',
  'react-dom/server',
] as const;
