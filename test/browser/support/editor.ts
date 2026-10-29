import type { Page } from '@playwright/test';

export type TerraContent = unknown[];

export async function openEditor(
  page: Page,
  content: TerraContent,
  options: {
    nested?: boolean;
    persistKey?: string;
    readOnly?: boolean;
    mockResponses?: Record<string, { data?: unknown; error?: string }>;
    toolbar?: boolean;
  } = {},
): Promise<void> {
  await page.addInitScript(
    ({ fixture, settings }) => {
      Object.assign(window, {
        __terraContentFixture: fixture,
        __terraContentOptions: settings,
        __terraDocsMockResponses: settings.mockResponses,
      });
    },
    { fixture: content, settings: options },
  );
  await page.goto('/editor-harness/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-terra-content-editor]').first().waitFor({ state: 'visible' });
}
