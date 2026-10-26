import { stringifyDocBody } from './content/document-markdown.js';
import type { DocBody } from './types.js';

export const toPortableBody = (value: unknown): DocBody =>
  Array.isArray(value) ? (value as DocBody) : [];
export const currLeafBody = (value: unknown): DocBody => {
  if (Array.isArray(value)) return toPortableBody(value);
  if (value && typeof value === 'object') {
    const item = value as { main?: unknown; content?: unknown };
    return toPortableBody(Array.isArray(item.main) ? item.main : item.content);
  }
  return [];
};
export const currLeafSrc = (value: unknown): string =>
  typeof value === 'string' ? value : stringifyDocBody(currLeafBody(value));
