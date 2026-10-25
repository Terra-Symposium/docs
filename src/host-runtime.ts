import { configureDocsActionProxy } from './terra/runtime/action-proxy.js';
import { setDocsCustomComponents } from './terra/pages/docs/_custom.js';
import type { DocsActionOperation, DocsActionResult, DocsCustomBlock, DocsHostAdapter } from './host.js';

let activeHost: DocsHostAdapter | undefined;

export function getDocsHostAdapter(): DocsHostAdapter | undefined { return activeHost; }

/** Install host-owned storage and capability checks before mounting the Docs surface. */
export function configureDocsHost(host: DocsHostAdapter, customBlocks: DocsCustomBlock[] = []): void {
  activeHost = host;
  setDocsCustomComponents(customBlocks);
  configureDocsActionProxy(async <T,>(operation: DocsActionOperation, input?: unknown): Promise<DocsActionResult<T>> => {
    if (operation.startsWith('write.') && !host.capabilities.write) return { error: new Error('This Docs instance is read-only.') };
    if (operation.startsWith('write.attachment.') && !host.capabilities.attachments) return { error: new Error('Attachment changes are disabled for this Docs instance.') };
    if (operation.startsWith('write.doc.reorder') && !host.capabilities.reorder) return { error: new Error('Reordering is disabled for this Docs instance.') };
    if (operation.includes('.versions.') && !host.capabilities.history) return { error: new Error('History is disabled for this Docs instance.') };
    return host.invoke<T>(operation, input);
  });
}
