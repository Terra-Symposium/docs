import type { DocsActionOperation, DocsActionResult } from '../../../lib/host.js';

let invoke: <T = unknown>(
  operation: DocsActionOperation,
  input?: unknown,
) => Promise<DocsActionResult<T>> = async (operation) => ({
  error: new Error(`Docs host action is not configured: ${operation}`),
});

export function configureDocsActionProxy(
  handler: <T = unknown>(
    operation: DocsActionOperation,
    input?: unknown,
  ) => Promise<DocsActionResult<T>>,
): void {
  invoke = handler;
}

function action(path: string): unknown {
  const callable = (...args: unknown[]) => invoke(path as DocsActionOperation, args[0]);
  return new Proxy(callable, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      return action(path ? `${path}.${key}` : key);
    },
  });
}

/** Internal compatibility bridge for the original UI's nested host-action calls. */
export const actions = action('') as Record<string, any>;
