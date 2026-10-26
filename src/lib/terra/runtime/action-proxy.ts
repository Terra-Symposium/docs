import type { DocsActionOperation, DocsActionResult } from '../../host.js';

let invoke: <T = unknown>(
  operation: DocsActionOperation,
  input?: unknown,
) => Promise<DocsActionResult<T>> = async (operation) => ({
  error: new Error(`Docs host action is not configured: ${operation}`),
});

type ActionProxy = ((...args: unknown[]) => Promise<DocsActionResult<unknown>>) & {
  [key: string]: ActionProxy;
};
type ActionCall<T> = (input?: unknown) => Promise<DocsActionResult<T>>;
type ActionTree = {
  read: {
    asset: { get: ActionCall<ArrayBuffer> };
    doc: {
      attachments: ActionCall<unknown[]>;
      get: ActionCall<Record<string, unknown>>;
      list: ActionCall<string[]>;
    };
    external: {
      pdf: ActionCall<{ pdfBase64?: string }>;
      youtube: ActionCall<{ title?: unknown; transcript?: unknown }>;
    };
    tsdocs: ActionCall<{ docs?: unknown }>;
    util: { pathname: ActionCall<string> };
  };
  write: {
    asset: {
      upload: ActionCall<{
        message?: unknown;
        path?: string;
        src?: string;
        compressedSize?: number;
        name?: string;
      }>;
    };
  };
};

export function configureDocsActionProxy(
  handler: <T = unknown>(
    operation: DocsActionOperation,
    input?: unknown,
  ) => Promise<DocsActionResult<T>>,
): void {
  invoke = handler;
}

function action(path: string): ActionProxy {
  const callable = ((...args: unknown[]) =>
    invoke(path as DocsActionOperation, args[0])) as ActionProxy;
  return new Proxy(callable, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      return action(path ? `${path}.${key}` : key);
    },
  });
}

/** Internal compatibility bridge for the original UI's nested host-action calls. */
export const actions = action('') as unknown as ActionTree;
