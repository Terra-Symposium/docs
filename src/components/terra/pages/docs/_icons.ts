// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/pages/docs/_icons.ts
 * Shared Docs block icon registry.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// COMPONENTS
import {
  Catalog as CatalogIcon,
  Code as CodeIcon,
  DecisionNode as NodesIcon,
  FunctionMath as MathIcon,
  Heading as HeadingIcon,
  Image as ImageIcon,
  InformationSquare as CalloutIcon,
  Link as EmbedIcon,
  Table as AccordionIcon,
  TableSplit as TableIcon,
  TextFont as TextIcon,
  WatsonHealthStackedScrolling_1 as TabsIcon,
} from '@carbon/icons-react';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

export const DOCS_BLOCK_ICONS = {
  accordion: AccordionIcon,
  callout: CalloutIcon,
  code: CodeIcon,
  docImage: ImageIcon,
  embed: EmbedIcon,
  heading: HeadingIcon,
  math: MathIcon,
  nodes: NodesIcon,
  paragraph: TextIcon,
  raw: CodeIcon,
  table: TableIcon,
  tabs: TabsIcon,
  tsDocs: CatalogIcon,
} as const;
