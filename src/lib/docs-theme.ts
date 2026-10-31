import { colors, invert } from '@terra-symposium/styling';
import type { CSSProperties } from 'react';
import type { DocsHostTreeNode, DocsResolvedRoute } from './host.js';

function findNode(
  nodes: DocsHostTreeNode[],
  target: string,
  ancestors: DocsHostTreeNode[] = [],
): { node: DocsHostTreeNode; ancestors: DocsHostTreeNode[] } | undefined {
  for (const node of nodes) {
    const branch = [...ancestors, node];
    if (node.origName === target || node.path === target) return { node, ancestors };
    const found = node.children ? findNode(node.children, target, branch) : undefined;
    if (found) return found;
  }
  return undefined;
}

/** Resolve the nearest saved hue for the active leaf, group, or section route. */
export function resolveDocsTreeHue(
  tree: DocsHostTreeNode[],
  route: DocsResolvedRoute | undefined,
  fallback: number | null | undefined,
): number | null | undefined {
  const targets = [route?.leafId, route?.groupId, route?.sectionId, route?.targetId];
  for (const target of targets) {
    if (!target) continue;
    const found = findNode(tree, target);
    if (!found) continue;

    let hue = fallback;
    for (const node of [...found.ancestors, found.node]) {
      if (typeof node.hue === 'number' || node.hue === null) {
        if (node.hue !== null) hue = node.hue;
      }
    }
    return hue;
  }
  return fallback;
}

/** Build both hue scales; CSS selects the active one for the host's theme. */
export function docsHueTheme(hue: number | null): CSSProperties {
  const [primary, baseGray] = colors(hue);
  // Keep the original Styling contract: links and diagram nodes use the
  // complementary secondary palette, while gray remains neutral.
  const [secondary, gray] = hue === null ? [baseGray, baseGray] : colors(invert(hue));
  const variables: Record<string, string> = { '--hue': String(hue ?? 0) };

  for (let index = 0; index < 12; index += 1) {
    const step = index + 1;
    variables[`--primaryLight${step}`] = primary.light[index]!;
    variables[`--primaryDark${step}`] = primary.dark[index]!;
    variables[`--secondaryLight${step}`] = secondary.light[index]!;
    variables[`--secondaryDark${step}`] = secondary.dark[index]!;
    variables[`--grayLight${step}`] = gray.light[index]!;
    variables[`--grayDark${step}`] = gray.dark[index]!;
  }

  return variables as CSSProperties;
}
