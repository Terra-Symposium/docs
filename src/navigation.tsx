import { colors } from '@terra-symposium/styling';
import type { CSSProperties, JSX } from 'react';

export type DocsNavNode = {
  id?: string;
  path?: string;
  title: string;
  href?: string;
  description?: string;
  updatedAt?: string;
  attachments?: import('./workspace.js').DocsAttachment[];
  children?: DocsNavNode[];
};

export function DocsNavigation({
  nodes,
  currentPath,
  hue = 210,
}: {
  nodes: DocsNavNode[];
  currentPath: string;
  hue?: number | null;
}): JSX.Element {
  const [accent] = colors(hue);
  const style = { '--docs-accent': `rgb(${accent.light[8]})` } as CSSProperties;
  const render = (items: DocsNavNode[]): JSX.Element => (
    <ul className="terra-docs-nav-list">
      {items.map((node, index) => (
        <li key={`${node.href ?? node.title}-${index}`}>
          {node.href ? (
            <a href={node.href} aria-current={node.href === currentPath ? 'page' : undefined}>
              {node.title}
            </a>
          ) : (
            <span>{node.title}</span>
          )}
          {node.children?.length ? render(node.children) : null}
        </li>
      ))}
    </ul>
  );
  return (
    <nav className="terra-docs-nav" aria-label="Documentation" style={style}>
      {render(nodes)}
    </nav>
  );
}
