# @terra-symposium/docs

## 0.1.37

### Patch Changes

- Include Styling's original global text rendering defaults in the published Docs stylesheet.

## 0.1.36

### Patch Changes

- Pre-bundle the Docs Astro island entrypoints and nested CommonJS dependencies so hosted instances hydrate reliably.
- Restore extracted Docs tree operations, metadata boundaries, browser parity coverage, and shared Astro dependency optimization for the portable host adapter.
- Optimize the Portable Text, Carbon icon, and React Flow dependency entrypoints used by Docs Astro islands.
- Pre-bundle the editor's nested external-store shims for Astro React islands so installed Docs consumers hydrate consistently.
- Explicitly optimize Styling's CommonJS easing dependency for Astro React islands.
- Pre-bundle the shared Styling peer and its runtime dependencies in Astro React islands.
- Preserve Terra rich text when serializing nested blocks and restore editable Markdown imports for common tables, lists, images, callouts, and math.

## 0.1.26

### Patch Changes

- Compile Docs and Styling utilities in one cascade so responsive primitive variants retain their original precedence.

## 0.1.25

### Patch Changes

- 01f8a35: Restore package exports, site builds, and tests after organizing the Docs source tree.
- Keep the published Docs artifact aligned with its restored runtime styles and browser coverage.
- 1a37827: Restore read-only leaf description controls and keep consumer artifacts in sync with the shared workspace.
