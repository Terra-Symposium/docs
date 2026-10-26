/** Maps the current DOM selection to the Docs toolbar block kind. */

const VAL_BY_KIND: Record<string, string> = {
  Aside: 'aside',
  DocsTable: 'table',
  Nodes: 'nodes',
  attachment: 'attachment',
  callout: 'aside',
  component: 'component',
  math: 'math',
  table: 'table',
  tsdocs: 'tsdocs',
};

/**
 * Determines which Docs toolbar block is active at the current editor selection.
 *
 * @param el - Focused element inside the active Docs editor.
 * @param vals - Supported block kinds that may be returned for custom content.
 *
 * @return The active block kind, or `null` when the selection is outside a supported block.
 */
export function toolbarFocusValue(el: Element, vals: readonly string[]): string | null {
  const text = el.closest('h1, h2, h3, h4, h5, h6, p');
  if (text) return text.tagName.toLowerCase();
  if (
    el
      .closest('td, th')
      ?.closest('[data-docs-editor-block="DocsTable"], [data-terra-block="table"]')
  )
    return 'p';
  const block = el.closest(
    '[data-docs-editor-block], [data-terra-block], .docs-math-wrapper, [data-math-code], [data-docs-view-root="true"]',
  );
  if (!block) return null;
  const kind =
    block.getAttribute('data-docs-editor-block') ?? block.getAttribute('data-terra-block') ?? '';
  if (kind && VAL_BY_KIND[kind]) return VAL_BY_KIND[kind];
  if (kind && vals.includes(kind.toLowerCase())) return kind.toLowerCase();
  if (block.matches('.docs-math-wrapper, [data-math-code]')) return 'math';
  return block.matches('[data-docs-view-root="true"]') ? 'component' : null;
}
