import { defineSchema } from '@portabletext/editor';

/** Basic text schema shared by the document surface and Terra formatting toolbar. */
export const schema = defineSchema({
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
  ],
  annotations: [{ name: 'link', fields: [{ name: 'href', type: 'string' }] }],
  lists: [],
  inlineObjects: [],
  blockObjects: [],
});

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
