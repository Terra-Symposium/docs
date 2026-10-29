// @ts-nocheck -- source-preserving extraction; public host contracts are typed in src/host.ts.
/**
 * astro/src/components/editor/docs/_Embed.tsx
 */

/*//////////////////////////////////////////////////
IMPORTS
//////////////////////////////////////////////////*/

// COMPONENTS
import { ErrorBoundary } from '../../ui.js';

// TYPES
import type { DocsBlock } from '../types.js';

/*//////////////////////////////////////////////////
HELPERS
//////////////////////////////////////////////////*/

/** Converts common YouTube watch links into iframe-compatible player URLs. */
export function normalizeDocsEmbedUrl(source: string): string {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const youtubeHost =
      host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com';
    let videoId: string | undefined;

    if (youtubeHost) {
      const [, route, routeId] = url.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/) ?? [];
      if (route) videoId = routeId;
      else if (url.pathname === '/watch') videoId = url.searchParams.get('v') ?? undefined;
    } else if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0];
    }

    if (!videoId || !/^[\w-]+$/.test(videoId)) return source;

    const playerHost =
      host === 'youtube-nocookie.com' ? 'www.youtube-nocookie.com' : 'www.youtube.com';
    const embed = new URL(`https://${playerHost}/embed/${videoId}`);
    for (const parameter of ['list', 'index', 'playsinline', 'rel']) {
      const value = url.searchParams.get(parameter);
      if (value) embed.searchParams.set(parameter, value);
    }

    const explicitStart = url.searchParams.get('start');
    const time = explicitStart ?? url.searchParams.get('t');
    const seconds = time ? youtubeTimeToSeconds(time) : undefined;
    if (seconds !== undefined) embed.searchParams.set('start', String(seconds));
    return embed.toString();
  } catch {
    return source;
  }
}

function youtubeTimeToSeconds(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match || !match[0]) return undefined;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return seconds > 0 ? seconds : undefined;
}

/**
 * Renders the embed component.
 *
 * @param props - Embed block data containing the external source and title.
 *
 * @return Embedded content, or null when no source is available.
 */
export function Embed({
  block,
}: {
  block: /** Sanity Portable Text embed URL and presentation data. */ DocsBlock<'embed'>;
}): JSX.Element | null {
  if (!block.src) return null;
  return (
    <ErrorBoundary name="Embed">
      <iframe
        className="my-6 w-full border-0"
        src={normalizeDocsEmbedUrl(block.src)}
        title={block.title ?? block.src}
        style={{ height: block.height ?? '500px', width: block.width ?? '100%' }}
      />
    </ErrorBoundary>
  );
}
Object.assign(Embed, { displayName: 'DocsEmbed' });
