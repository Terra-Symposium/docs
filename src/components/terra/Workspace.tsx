import type { JSX } from 'react';
import Scaffold from './pages/docs/_main.js';
import { configureDocsHost } from '../../lib/host-runtime.js';
import type { TerraDocsWorkspaceProps } from '../../lib/host.js';

/** The source-preserving shared Terra Docs workspace used by host route adapters. */
export function TerraDocsWorkspace(props: TerraDocsWorkspaceProps): JSX.Element {
  configureDocsHost(props.host, props.customBlocks);
  return <Scaffold tree={props.tree as any} pathname={props.pathname} permission={props.permission} userData={props.userData ?? null} title={props.title} {...(props.path ? { path: props.path } : {})} {...(props.description ? { description: props.description } : {})} {...(props.contributors ? { contributors: props.contributors } : {})} {...(props.updatedAt ? { updatedAt: props.updatedAt } : {})} {...(props.source ? { source: props.source } : {})} {...(props.content !== undefined ? { content: props.content as any } : {})} {...(props.standalone !== undefined ? { standalone: props.standalone } : {})} {...(props.full !== undefined ? { full: props.full } : {})} {...(props.mode ? { mode: props.mode } : {})} />;
}
