# @terra-symposium/docs

## 0.1.71

### Patch Changes

- Add a host-owned View slot that renders before the canonical document body.
- Preserve inline code marks inside nested Docs table cells when the editor uses the Sanity-compatible mark alias.

## 0.1.69

### Patch Changes

- Preserve inline LaTeX expressions when Markdown lexing splits their source across text and escape tokens.

## 0.1.68

### Patch Changes

- Keep optional leaf metadata such as contributors safe when local Docs navigation events omit it.

## 0.1.67

### Patch Changes

- Restore the original full-row selector in View mode while keeping Attachments compact beside its filters, and strengthen source-to-render parity checks.

## 0.1.66

### Patch Changes

- Keep the document mode selector intrinsically sized across all host instances.
- Strengthen source-to-render TOC parity for typographic quote variants.

## 0.1.65

### Patch Changes

- Resolve local Docs routes by their leaf node when a section and leaf share an ID.
- Keep host-provided table-of-contents labels separate from the active document title.

## 0.1.63

### Patch Changes

- Scope Docs utility styles to the Docs theme wrapper so host utility bundles cannot override responsive layout behavior.

## 0.1.62

### Patch Changes

- Use the pre-extraction Terra Docs UI primitives from Styling and keep the mode selector full-width in View and compact in Attachments.

## 0.1.61

### Patch Changes

- Scope prose link colors to text links so section-hued diagram node colors remain visible, and preserve compact, indented list rendering and ordered-list starts in the packaged workspace.

## 0.1.60

### Patch Changes

- Refresh the shared Docs stylesheet so diagram text variants and section hue palettes render correctly in consuming repositories.

## 0.1.59

### Patch Changes

- 64e302e: Keep the active section and selected leaf synchronized when host navigation changes between repository-backed routes.
- 64e302e: Preserve ordered-list numbering across Markdown conversion and render thematic breaks as visible dividers in repository-backed pages.
- 64e302e: Render nested callouts and rich blocks inside grouped Markdown with independent parser scopes.
- Restore the original content-sized Docs mode selector across the shared workspace.
- 64e302e: Preserve Markdown and HTML images as structured content inside table cells while keeping readable table Markdown.
- 64e302e: Serialize nested callouts with safe deeper Markdown fences, render nested rich blocks recursively, and ignore visually empty Portable Text paragraphs during semantic round-trip checks.
- 64e302e: Serialize Sanity tables with readable Markdown cells while preserving rich cell content and avoiding Portable Text source dumps.
- Route Docs development servers through the shared Terra Quality port-acquisition utility.

## 0.1.58

### Patch Changes

- Preserve ordered-list numbering across Markdown conversion and render thematic breaks as visible dividers in repository-backed pages.

## 0.1.57

### Patch Changes

- Render nested rich blocks inside grouped Markdown with independent parser scopes, and skip YAML parsing for grouped Markdown payloads.

## 0.1.56

### Patch Changes

- Serialize nested callouts with safe deeper Markdown fences, render nested rich blocks recursively, and ignore visually empty Portable Text paragraphs during semantic round-trip checks.

## 0.1.55

### Patch Changes

- Serialize Sanity tables with readable Markdown cells, preserving rich cell content without Portable Text source dumps.

## 0.1.54

### Patch Changes

- Render raw Markdown thematic breaks as visible document dividers instead of source code.

## 0.1.53

### Patch Changes

- Keep the active section and selected leaf synchronized when host navigation changes between repository-backed routes.

## 0.1.52

### Patch Changes

- Preserve Markdown and HTML images as structured content inside table cells while keeping readable table Markdown.

## 0.1.51

### Patch Changes

- Preview local text attachments by recognizing their display names and resolving adjacent file paths from the owning document.

## 0.1.50

### Patch Changes

- Preserve multiline inline-code marks in readable Markdown tables.

## 0.1.49

### Patch Changes

- Keep nested grouped content readable in Markdown when its blocks round-trip faithfully, preserve plain emails and URLs in table cells without auto-linking them, and serialize multi-paragraph plain-text cells as readable tables.

## 0.1.48

### Patch Changes

- Keep nested accordion and tab content readable as Markdown when its rich blocks can be represented faithfully, and prevent plain table-cell emails and URLs from becoming unintended links.

## 0.1.47

### Patch Changes

- Serialize structured Docs content as readable YAML directives when ordinary Markdown would lose source fields, and render Portable Text fallback blocks as document content.

## 0.1.46

### Patch Changes

- Preserve table cells with nested Portable Text as rich table blocks when plain GFM would lose their structure, and keep overlapping inline marks lossless when Markdown delimiters are ambiguous.

## 0.1.45

### Patch Changes

- Associate tab panels with their triggers, hide inactive panels, and keep duplicate-title accordion items independent.

## 0.1.44

### Patch Changes

- Skip compound-group and self-loop edges in Dagre's position-only graph so authored diagram edges and nodes continue to render.
- Convert YouTube watch URLs into player URLs that can render in an iframe, preserving any requested start time.

## 0.1.43

### Patch Changes

- Import canonical Terra Docs JSX blocks from exported Markdown and preserve adjacent legacy code blocks.
- 37dcac9: Add a host content slot to the local workspace for interactive page content.
- 37dcac9: Apply the shared hue palette to standalone remote Docs hosts so system and explicit dark themes work consistently.
- 37dcac9: Fit long document titles to the available header width.

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
