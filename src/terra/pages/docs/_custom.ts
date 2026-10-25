import type { DocsCustomBlock } from '../../../host.js';

/** Mutated in place by a host before the workspace renders. */
export const components: DocsCustomBlock[] = [];
export function setDocsCustomComponents(next: DocsCustomBlock[]): void {
  components.splice(0, components.length, ...next);
}
