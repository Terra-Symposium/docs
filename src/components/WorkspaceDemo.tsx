import { useEffect, useMemo, useState } from 'react';
import { colors, flattenColors, invert } from '@terra-symposium/styling';
import { DocsLocalWorkspace, TerraDocsWorkspace } from '../lib/index.js';
import {
  createWorkspaceDemoHost,
  createWorkspaceDemoSeed,
  readWorkspaceDemoState,
  routeForWorkspaceDocument,
  routedWorkspaceTree,
  WORKSPACE_DEMO_PATH,
  type WorkspaceDemoState,
} from './workspace-demo-fixture.js';
import type { DocsHostTreeNode } from '../lib/host.js';
import type { CSSProperties, JSX } from 'react';

function withLocalRoute(nodes: DocsHostTreeNode[]): DocsHostTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    ...(node.type === 'leaf' ? { url: '/workspace-readonly/' } : {}),
    ...(node.children ? { children: withLocalRoute(node.children) } : {}),
  }));
}

function currentLocation(): string {
  if (typeof window === 'undefined') return WORKSPACE_DEMO_PATH;
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function activeDocumentId(state: WorkspaceDemoState, location: string): string {
  try {
    const requested = new URL(location, 'http://localhost').searchParams.get('leaf');
    if (requested && state.documents[requested]) return requested;
  } catch {
    // The seed leaf is the stable fallback for malformed demo routes.
  }
  return state.documents.salesphere ? 'salesphere' : (Object.keys(state.documents)[0] ?? '');
}

export default function WorkspaceDemo({
  readOnly = false,
  hue = 145,
  siteTitle = 'Salesphere Docs',
  siteDescription = 'Product and engineering documentation.',
}: {
  readOnly?: boolean;
  hue?: number | null;
  siteTitle?: string;
  siteDescription?: string | null;
} = {}): JSX.Element {
  const [state, setState] = useState<WorkspaceDemoState>(() => createWorkspaceDemoSeed());
  const [location, setLocation] = useState(WORKSPACE_DEMO_PATH);

  useEffect(() => {
    const syncFixture = (): void => {
      setState(readWorkspaceDemoState());
      setLocation(currentLocation());
    };
    const syncLocation = (event: Event): void => {
      const detail = (event as CustomEvent<{ pathname?: unknown; url?: unknown }>).detail;
      const route =
        typeof detail?.pathname === 'string'
          ? detail.pathname
          : typeof detail?.url === 'string'
            ? detail.url
            : currentLocation();
      setLocation(route);
      setState(readWorkspaceDemoState());
    };
    syncFixture();
    window.addEventListener('terra-docs-fixture-updated', syncFixture);
    window.addEventListener('popstate', syncFixture);
    document.addEventListener('docs:navigate', syncLocation);
    return () => {
      window.removeEventListener('terra-docs-fixture-updated', syncFixture);
      window.removeEventListener('popstate', syncFixture);
      document.removeEventListener('docs:navigate', syncLocation);
    };
  }, []);

  const selectedId = activeDocumentId(state, location);
  const selectedDocument = state.documents[selectedId] ?? state.documents.salesphere;
  const host = useMemo(() => {
    const demoHost = createWorkspaceDemoHost(readOnly);
    if (!siteDescription) delete demoHost.siteDescription;
    return {
      ...demoHost,
      siteTitle,
      ...(siteDescription ? { siteDescription } : {}),
    };
  }, [readOnly, siteDescription, siteTitle]);
  // Keep the parity fixture's palette construction identical to the pinned
  // pre-extraction website fixture. This makes screenshot diffs report UI
  // regressions instead of comparing a different secondary/gray palette.
  const [primary, baseGray] = colors(hue);
  const [secondary, gray] = colors(invert(hue));
  const colorTokens = {
    ...flattenColors('primary', primary),
    ...flattenColors('gray', gray ?? baseGray),
    ...flattenColors('secondary', secondary ?? baseGray),
  };
  const theme = {
    ...Object.fromEntries(primary.light.map((rgb, index) => [`--primary-${index + 1}`, rgb])),
    ...Object.fromEntries(
      (gray ?? baseGray).light.map((rgb, index) => [`--gray-${index + 1}`, rgb]),
    ),
    ...Object.fromEntries(
      (secondary ?? baseGray).light.map((rgb, index) => [`--secondary-${index + 1}`, rgb]),
    ),
    ...colorTokens,
  } as CSSProperties;

  if (!selectedDocument) return <div className="min-h-svh" />;

  const localPage = {
    id: 'salesphere',
    path: selectedDocument.path,
    pathname: '/workspace-readonly/',
    title: selectedDocument.title,
    description: 'A page level description for the Salesphere overview.',
    updatedAt: selectedDocument.updatedAt,
    markdown:
      '# Salesphere\n\nSalesphere helps sales professionals choose a useful next step in a customer relationship and understand why it matters.\n\n## Start with the product\n\nRead [Salesphere’s purpose](/product/purpose/) for the larger aim.',
    attachments: selectedDocument.attachments,
  };

  const workspace = readOnly ? (
    <DocsLocalWorkspace
      tree={withLocalRoute(routedWorkspaceTree(state, true))}
      pages={[localPage]}
      pathname={localPage.pathname}
      title="Salesphere Docs"
      description="Product and engineering documentation."
      rootPath="/workspace-readonly/"
      homePath={localPage.pathname}
    />
  ) : (
    <TerraDocsWorkspace
      tree={routedWorkspaceTree(state, false)}
      host={host}
      pathname={routeForWorkspaceDocument(state, selectedDocument.id)}
      permission="write"
      path={selectedDocument.path}
      title={selectedDocument.title}
      description={selectedDocument.description}
      contributors={selectedDocument.contributors}
      updatedAt={selectedDocument.updatedAt}
      content={selectedDocument.content}
      source={selectedDocument.source}
    />
  );

  return (
    <div className="workspace-demo-theme min-h-svh bg-primary-1 text-primary-12" style={theme}>
      {workspace}
    </div>
  );
}
