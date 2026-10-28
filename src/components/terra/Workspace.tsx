import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { docsHueTheme } from '../../lib/docs-theme.js';
import Scaffold from './pages/docs/_main.js';
import { configureDocsHost } from '../../lib/host-runtime.js';
import type { TerraDocsWorkspaceProps } from '../../lib/host.js';

/** The source-preserving shared Terra Docs workspace used by host route adapters. */
export function TerraDocsWorkspace(props: TerraDocsWorkspaceProps): JSX.Element {
  configureDocsHost(props.host, props.customBlocks);
  const portalThemeRoot = useRef<HTMLDivElement>(null);
  const theme = props.host.hue === undefined ? undefined : docsHueTheme(props.host.hue);

  useEffect(() => {
    const wrapper = portalThemeRoot.current;
    const workspace = wrapper?.querySelector<HTMLElement>('.terra-docs-workspace');
    if (!workspace || typeof document === 'undefined') return;

    // Radix keeps the original Docs portal behavior and mounts menus/dialogs
    // under body. Mirror only the Docs palette there so those portals inherit
    // the same hue as the inline workspace, as they did when the site applied
    // the hue palette to the document root before extraction.
    const target = document.body;
    const themeTokens = [
      '--hue',
      '--background',
      '--foreground',
      '--ring',
      ...(['primary', 'gray', 'secondary'] as const).flatMap((family) =>
        Array.from({ length: 12 }, (_, index) => {
          const step = index + 1;
          return [`--${family}-${step}`, `--${family}Light${step}`, `--${family}Dark${step}`];
        }).flat(),
      ),
    ];
    const originalValues = new Map<string, { value: string; priority: string }>();
    const appliedValues = new Map<string, string>();
    const originalThemeClasses = {
      dark: target.classList.contains('dark'),
      light: target.classList.contains('light'),
    };
    const originalBodyFont = {
      value: target.style.getPropertyValue('font-family'),
      priority: target.style.getPropertyPriority('font-family'),
    };
    let appliedBodyFont: string | undefined;
    let appliedThemeClasses: { dark: boolean; light: boolean } | undefined;

    const syncPortalTheme = () => {
      const computed = getComputedStyle(workspace);
      // Sanity's global editor styles supplied Inter on the original Terra Docs route.
      // Keep body-mounted Radix menus and dialogs on that same Docs typeface.
      const docsFont = computed.fontFamily;
      if (docsFont && target.style.fontFamily !== docsFont) {
        target.style.fontFamily = docsFont;
      }
      appliedBodyFont = docsFont;
      for (const token of themeTokens) {
        const value = computed.getPropertyValue(token).trim();
        if (!value) continue;
        if (!originalValues.has(token)) {
          originalValues.set(token, {
            value: target.style.getPropertyValue(token),
            priority: target.style.getPropertyPriority(token),
          });
        }
        if (target.style.getPropertyValue(token) !== value) target.style.setProperty(token, value);
        appliedValues.set(token, value);
      }

      const explicitTheme = workspace.closest<HTMLElement>('.dark, .light');
      if (explicitTheme) {
        const nextClasses = {
          dark: explicitTheme.classList.contains('dark'),
          light: explicitTheme.classList.contains('light'),
        };
        target.classList.toggle('dark', nextClasses.dark);
        target.classList.toggle('light', nextClasses.light);
        appliedThemeClasses = nextClasses;
      }
    };

    syncPortalTheme();
    const observer = new MutationObserver(syncPortalTheme);
    for (
      let element: HTMLElement | null = workspace;
      element && element !== target;
      element = element.parentElement
    ) {
      observer.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    const darkPreference = window.matchMedia('(prefers-color-scheme: dark)');
    darkPreference.addEventListener('change', syncPortalTheme);

    return () => {
      observer.disconnect();
      darkPreference.removeEventListener('change', syncPortalTheme);
      for (const [token, original] of originalValues) {
        if (target.style.getPropertyValue(token) !== appliedValues.get(token)) continue;
        if (original.value) target.style.setProperty(token, original.value, original.priority);
        else target.style.removeProperty(token);
      }
      if (appliedBodyFont && target.style.fontFamily === appliedBodyFont) {
        if (originalBodyFont.value) {
          target.style.setProperty(
            'font-family',
            originalBodyFont.value,
            originalBodyFont.priority,
          );
        } else {
          target.style.removeProperty('font-family');
        }
      }
      if (appliedThemeClasses) {
        if (target.classList.contains('dark') === appliedThemeClasses.dark) {
          target.classList.toggle('dark', originalThemeClasses.dark);
        }
        if (target.classList.contains('light') === appliedThemeClasses.light) {
          target.classList.toggle('light', originalThemeClasses.light);
        }
      }
    };
  }, []);

  return (
    <div ref={portalThemeRoot} {...(theme ? { className: 'docs-theme-scope', style: theme } : {})}>
      <Scaffold
        tree={props.tree as any}
        pathname={props.pathname}
        permission={props.permission}
        userData={props.userData ?? null}
        title={props.title}
        {...(props.path ? { path: props.path } : {})}
        {...(props.description ? { description: props.description } : {})}
        {...(props.contributors ? { contributors: props.contributors } : {})}
        {...(props.updatedAt ? { updatedAt: props.updatedAt } : {})}
        {...(props.source ? { source: props.source } : {})}
        {...(props.content !== undefined ? { content: props.content as any } : {})}
        {...(props.renderContent !== undefined ? { viewContent: props.renderContent } : {})}
        {...(props.afterContent !== undefined ? { afterContent: props.afterContent } : {})}
        {...(props.standalone !== undefined ? { standalone: props.standalone } : {})}
        {...(props.full !== undefined ? { full: props.full } : {})}
        {...(props.mode ? { mode: props.mode } : {})}
        {...(props.blocks ? { blocks: props.blocks } : {})}
      />
    </div>
  );
}
