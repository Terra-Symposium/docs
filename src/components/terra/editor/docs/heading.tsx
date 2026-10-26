// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/docs/heading.tsx
 * Shared Docs heading identifiers and copyable read-only headings.
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

import { Children, isValidElement, useEffect, useRef, useState } from 'react';
import { Link as LinkIcon } from '@carbon/icons-react';
import * as TerraQualityRegex from '../../regex.mjs';

import type { ReactNode } from 'react';

/*//////////////////////////////////////////////////
CONFIG
//////////////////////////////////////////////////*/

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/**
 * Normalizes text into the URL identifier used by Docs headings and their table of contents.
 *
 * @param text - The heading text to normalize.
 * @returns The heading's URL fragment.
 */
export const toHeadingId = (text: string): string =>
  text
    .toLowerCase()
    .replace(TerraQualityRegex.REGEX_A_Z0_9_G_REGEX(), '-')
    .replace(TerraQualityRegex.REGEX_G_REGEX_6(), '');

/*//////////////////////////////////////////////////
COMPONENTS
//////////////////////////////////////////////////*/

/**
 * Renders a Docs heading with a keyboard-accessible control for copying its link.
 *
 * @param props - The heading level and its content.
 * @returns A heading with a copy-link button.
 */
export function DocsHeading({
  children,
  level,
}: {
  children: ReactNode;
  level: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}): React.JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [text, setText] = useState(() => {
    const pending = Children.toArray(children).reverse();
    let result = '';
    while (pending.length > 0) {
      const child = pending.pop();
      if (typeof child === 'string' || typeof child === 'number') result += String(child);
      else if (isValidElement<{ children?: ReactNode }>(child))
        pending.push(...Children.toArray(child.props.children).reverse());
    }
    return result.trim();
  });
  useEffect(() => {
    const renderedText = headingRef.current?.textContent?.trim();
    if (renderedText) setText(renderedText);
  }, [children]);
  const id = toHeadingId(text);
  const Heading = level;
  return (
    <Heading id={id} ref={headingRef}>
      <button
        type="button"
        className="heading-anchor"
        aria-label={`Copy link to ${text}`}
        title={`Copy link to ${text}`}
        onClick={() => {
          void navigator.clipboard.writeText(
            `${window.location.origin}${window.location.pathname}#${id}`,
          );
        }}
      >
        {children}
        <span className="heading-anchor-icon" aria-hidden="true">
          <LinkIcon />
        </span>
      </button>
    </Heading>
  );
}
