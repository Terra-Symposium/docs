import { StrictMode, useState } from 'react';
import { DocsLocalWorkspace } from './LocalDocsWorkspace.js';
import type { DocsLocalWorkspaceProps } from './LocalDocsWorkspace.js';
import type { JSX } from 'react';

declare global {
  interface Window {
    __terraDocsLocalWorkspaceFixture?: DocsLocalWorkspaceProps;
  }
}

function HarnessContent(): JSX.Element {
  const [fixture] = useState(() =>
    typeof window === 'undefined' ? undefined : window.__terraDocsLocalWorkspaceFixture,
  );

  return fixture ? (
    <DocsLocalWorkspace {...fixture} />
  ) : (
    <main>Local Docs workspace fixture not provided.</main>
  );
}

/** Exercise the local host adapter under the same React StrictMode as consumers. */
export default function StrictLocalWorkspaceHarness(): JSX.Element {
  return (
    <StrictMode>
      <HarnessContent />
    </StrictMode>
  );
}
