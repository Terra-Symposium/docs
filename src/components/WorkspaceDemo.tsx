import { DocsLocalWorkspace, TerraDocsWorkspace } from '../lib/index.js';
import { colors } from '@terra-symposium/styling';
import type {
  DocsActionOperation,
  DocsActionResult,
  DocsHostAdapter,
  DocsHostTreeNode,
} from '../lib/host.js';
import type { CSSProperties, JSX } from 'react';

const pathname = '/workspace-demo/';
const leafPath = 'overview/start-here/salesphere.mdx';
const tree: DocsHostTreeNode[] = [
  {
    type: 'branch',
    origName: 'overview',
    title: 'Overview',
    path: 'overview',
    url: `${pathname}#overview`,
    permission: 'write',
    hue: 145,
    children: [
      {
        type: 'branch',
        origName: 'start-here',
        title: 'Start here',
        path: 'overview/start-here',
        url: `${pathname}#start-here`,
        permission: 'write',
        children: [
          {
            type: 'leaf',
            origName: 'salesphere',
            title: 'Salesphere',
            path: leafPath,
            url: pathname,
            permission: 'write',
          },
          {
            type: 'leaf',
            origName: 'runtime-map',
            title: 'Runtime map',
            path: 'overview/start-here/runtime-map.mdx',
            url: `${pathname}#runtime-map`,
            permission: 'write',
          },
        ],
      },
    ],
  },
  {
    type: 'branch',
    origName: 'configure',
    title: 'Configure',
    path: 'configure',
    url: `${pathname}#configure`,
    permission: 'write',
    hue: 210,
    children: [
      {
        type: 'branch',
        origName: 'providers',
        title: 'Storage providers',
        path: 'configure/providers',
        url: `${pathname}#providers`,
        permission: 'write',
        children: [
          {
            type: 'leaf',
            origName: 'local-files',
            title: 'Local files',
            path: 'configure/providers/local-files.mdx',
            url: pathname,
            permission: 'write',
          },
        ],
      },
    ],
  },
];

const content = [
  {
    _key: 'intro',
    _type: 'block',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _key: 'intro-text',
        _type: 'span',
        marks: [],
        text: 'Salesphere helps sales professionals choose a useful next step in a customer relationship and understand why it matters. This site connects that product intent to the current implementation.',
      },
    ],
  },
  {
    _key: 'start-heading',
    _type: 'block',
    style: 'h2',
    markDefs: [],
    children: [{ _key: 'heading-text', _type: 'span', marks: [], text: 'Start with the product' }],
  },
  {
    _key: 'product-copy',
    _type: 'block',
    style: 'normal',
    markDefs: [
      { _key: 'purpose', _type: 'link', href: '/product/purpose/' },
      { _key: 'map', _type: 'link', href: '/product/structure/' },
    ],
    children: [
      { _key: 'read', _type: 'span', marks: [], text: 'Read ' },
      { _key: 'purpose-text', _type: 'span', marks: ['purpose'], text: 'Salesphere’s purpose' },
      { _key: 'then', _type: 'span', marks: [], text: ' for the larger aim, then use the ' },
      { _key: 'map-text', _type: 'span', marks: ['map'], text: 'product map' },
      {
        _key: 'rest',
        _type: 'span',
        marks: [],
        text: ' to see how principles, intelligence, work surfaces, reflection, and platform capabilities fit together.',
      },
    ],
  },
  {
    _key: 'implementation-heading',
    _type: 'block',
    style: 'h2',
    markDefs: [],
    children: [
      { _key: 'implementation-title', _type: 'span', marks: [], text: 'Find the implementation' },
    ],
  },
  {
    _key: 'runtime',
    _type: 'block',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _key: 'runtime-copy',
        _type: 'span',
        marks: [],
        text: 'Runtime system map follows a request through the Astro app.',
      },
    ],
  },
];

const document = {
  title: 'Salesphere',
  description: 'Product and engineering documentation.',
  contributors: ['Kai'],
  updatedAt: 'Oct 24, 2026',
  content,
};
const attachments = [
  {
    id: 'overview-brief',
    name: 'Product brief.pdf',
    path: '/assets/product-brief.pdf',
    type: 'application/pdf',
    size: 328_512,
  },
];

function withPermission(
  nodes: DocsHostTreeNode[],
  permission: 'read' | 'write',
): DocsHostTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    permission,
    ...(node.children ? { children: withPermission(node.children, permission) } : {}),
  }));
}

function withLocalRoute(nodes: DocsHostTreeNode[]): DocsHostTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    ...(node.type === 'leaf' ? { url: '/workspace-readonly/' } : {}),
    ...(node.children ? { children: withLocalRoute(node.children) } : {}),
  }));
}

const host: DocsHostAdapter = {
  siteTitle: 'Salesphere Docs',
  siteDescription: 'Product and engineering documentation.',
  rootPath: '/',
  homePath: pathname,
  capabilities: {
    read: true,
    write: true,
    reorder: true,
    attachments: true,
    export: true,
    history: true,
    publish: true,
  },
  async invoke<T = unknown>(
    operation: DocsActionOperation,
    input?: unknown,
  ): Promise<DocsActionResult<T>> {
    if (typeof window !== 'undefined') {
      const browserWindow = window as Window & {
        __terraDocsActionCalls?: Array<{ operation: string; input?: unknown }>;
      };
      browserWindow.__terraDocsActionCalls ??= [];
      browserWindow.__terraDocsActionCalls.push({ operation, input });
    }
    let data: unknown = null;
    if (operation === 'read.doc.list') {
      const request = input as { type?: string } | undefined;
      data = request?.type === 'nav' ? tree : [];
    } else if (operation === 'read.doc.get') data = document;
    else if (operation === 'read.doc.attachments') data = attachments;
    else if (operation === 'read.asset.get') data = new ArrayBuffer(0);
    else if (operation === 'read.util.pathname') data = pathname;
    else if (operation === 'read.util.node') data = { title: 'Salesphere', origName: 'salesphere' };
    else if (operation === 'read.tsdocs') data = { scopes: [] };
    else if (operation === 'read.source.body') data = content;
    return { data: data as T };
  },
  assetUrl: () => undefined,
  resolveRoute: (value) => ({
    sectionId: 'overview',
    groupId: 'start-here',
    leafId: 'salesphere',
    targetId: 'salesphere',
    pathname: new URL(value, 'http://localhost').pathname,
  }),
  buildRoute: () => pathname,
  isDevelopmentOrigin: (value) =>
    /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?$/u.test(value),
};

export default function WorkspaceDemo({
  readOnly = false,
}: { readOnly?: boolean } = {}): JSX.Element {
  const [primary, secondary] = colors(145);
  const theme = {
    ...Object.fromEntries(primary.light.map((rgb, index) => [`--primary-${index + 1}`, rgb])),
    ...Object.fromEntries(secondary.light.map((rgb, index) => [`--secondary-${index + 1}`, rgb])),
  } as CSSProperties;
  const fixtureTree = withPermission(tree, readOnly ? 'read' : 'write');
  const fixtureHost: DocsHostAdapter = {
    ...host,
    capabilities: {
      ...host.capabilities,
      write: !readOnly,
      reorder: !readOnly,
      attachments: !readOnly,
      history: !readOnly,
      publish: !readOnly,
    },
  };
  const localPage = {
    id: 'salesphere',
    path: leafPath,
    pathname: '/workspace-readonly/',
    title: document.title,
    description: document.description,
    updatedAt: document.updatedAt,
    markdown:
      '# Salesphere\n\nSalesphere helps sales professionals choose a useful next step in a customer relationship and understand why it matters.\n\n## Start with the product\n\nRead [Salesphere’s purpose](/product/purpose/) for the larger aim.',
    attachments: [
      {
        id: 'overview-brief',
        name: 'Product brief.pdf',
        path: '/assets/product-brief.pdf',
        type: 'application/pdf',
        size: 328_512,
      },
    ],
  };
  const workspace = readOnly ? (
    <DocsLocalWorkspace
      tree={withLocalRoute(fixtureTree)}
      pages={[localPage]}
      pathname={localPage.pathname}
      title="Salesphere Docs"
      description={document.description}
      rootPath="/workspace-readonly/"
      homePath={localPage.pathname}
    />
  ) : (
    <TerraDocsWorkspace
      tree={fixtureTree}
      host={fixtureHost}
      pathname={pathname}
      permission="write"
      path={leafPath}
      title={document.title}
      description={document.description}
      contributors={document.contributors}
      updatedAt={document.updatedAt}
      content={content}
    />
  );
  return (
    <div className="min-h-svh bg-primary-1 text-primary-12" style={theme}>
      {workspace}
    </div>
  );
}
