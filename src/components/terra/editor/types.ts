// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/types.ts
 * Shared Terra content and Portable Text renderer contracts.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// DATA
import { DOCS_BLOCK_SCHEMAS, PROBLEM_BLOCK_TYPES } from '../../../lib/terra/runtime/types.js';

// TYPES
import type {
  ArticleContent,
  DocsContent,
  ProblemContent,
} from '../../../lib/terra/runtime/types.js';
import type { BlockObjectRenderProps } from '@portabletext/editor';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/** Sanity Portable Text block names supported by the docs editor. */
export type DocsBlockType = Extract<keyof typeof DOCS_BLOCK_SCHEMAS, DocsContent[number]['_type']>;
/** Extracts one docs block shape by its Sanity `_type` discriminator. */
export type DocsMember<T extends DocsContent[number]['_type']> = Extract<
  DocsContent[number],
  { _type: T }
>;
/** Resolves a docs block shape for a supported docs block name. */
export type DocsBlock<T extends DocsBlockType> = DocsMember<T>;
/** Inline Sanity content types supported by article editors. */
export type ArticleInlineType =
  'image' | 'video' | 'table' | 'questions' | 'dialogue' | 'definition';

/** Article inline block shape selected by its Sanity type discriminator. */
export type ArticleInline<T extends ArticleInlineType> = Extract<
  NonNullable<
    Extract<
      ArticleContent[number],
      {
        children?: unknown;
      }
    >['children']
  >[number],
  { _type: T }
>;
/** Sanity Portable Text block names supported by the problem editor. */
export type ProblemBlockType = (typeof PROBLEM_BLOCK_TYPES)[number];
/** Resolves a problem block shape for a supported problem block name. */
export type ProblemBlock<T extends ProblemBlockType> = Extract<
  ProblemContent[number],
  { _type: T }
>;
/** Extracts one problem inline shape by its Sanity `_type` discriminator. */
export type ProblemInline<T extends 'definition'> = Extract<ProblemContent[number], { _type: T }>;
/** Props supplied to a read-only renderer for a typed Portable Text block. */
export type PortableTextBlockRendererProps<TBlock> = Pick<
  BlockObjectRenderProps,
  'attributes' | 'children' | 'path' | 'readOnly'
> & { node: TBlock };
/** Props supplied to an editable renderer for a typed Portable Text block. */
export type PortableTextBlockEditorProps<TBlock> = Omit<
  PortableTextBlockRendererProps<TBlock>,
  'readOnly'
>;
