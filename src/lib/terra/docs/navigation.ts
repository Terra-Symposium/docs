/** Client-side Docs navigation and transition handling. */
import { clearTransition, setTransition } from './state.js';
import type { Mode } from '../runtime/types.js';

export function navigateDocs({ href, mode }: { href: string; mode: Mode }): void {
  setTransition('local');
  const url = new URL(href, window.location.origin);
  new URL(window.location.href).searchParams.forEach((value, key) => {
    if (key !== 'mode' && !url.searchParams.has(key)) url.searchParams.set(key, value);
  });
  if (mode !== 'view') url.searchParams.set('mode', mode);
  else url.searchParams.delete('mode');
  window.history.pushState(null, '', url.toString());
  document.dispatchEvent(
    new CustomEvent('docs:navigate', {
      detail: { url: url.pathname + url.search, pathname: url.pathname + url.search },
    }),
  );
  // Safety escape hatch in case route reconciliation fails to unlock the shell.
  setTimeout(clearTransition, 1000);
}
