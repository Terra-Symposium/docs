import { defineSchema } from '@portabletext/editor';
import { DOCS_BLOCK_FIELDS, enabledDocsBlocks } from '../components/blocks.js';
import type { DocsBlockOptions } from '../components/blocks.js';

/** Basic text schema shared by the document surface and Terra formatting toolbar. */
export function createDocsSchema(options: DocsBlockOptions = {}) {
  return defineSchema({
    styles: [
      { name: 'normal', title: 'Normal' },
      { name: 'h2', title: 'Heading 2' },
      { name: 'h3', title: 'Heading 3' },
      { name: 'h4', title: 'Heading 4' },
      { name: 'h5', title: 'Heading 5' },
      { name: 'h6', title: 'Heading 6' },
      { name: 'blockquote', title: 'Quote' },
    ],
    decorators: [
      { name: 'strong', title: 'Bold' },
      { name: 'em', title: 'Italic' },
      { name: 'underline', title: 'Underline' },
      { name: 'strike-through', title: 'Strikethrough' },
      { name: 'code', title: 'Code' },
    ],
    annotations: [{ name: 'link', fields: [{ name: 'href', type: 'string' }] }],
    lists: [{ name: 'bullet' }, { name: 'number' }],
    blockObjects: [
      ...enabledDocsBlocks(options).map((name) => ({
        name,
        fields: DOCS_BLOCK_FIELDS[name],
      })),
      { name: 'todoBlock', fields: [{ name: 'source', type: 'object' as const }] },
    ],
    inlineObjects: [
      ...(options.inlineMath === false
        ? []
        : [
            {
              name: 'math',
              fields: [
                { name: 'code', type: 'string' as const },
                { name: 'inline', type: 'boolean' as const },
              ],
            },
          ]),
      { name: 'todoInline', fields: [{ name: 'source', type: 'object' as const }] },
    ],
  });
}
export const schema = createDocsSchema();

/** Accepts web and email links, including relative links, without executable URL schemes. */
export function safeLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(
      new URL(value, 'https://docs.invalid').protocol,
    )
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
