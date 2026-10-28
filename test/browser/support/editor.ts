import type { Page } from '@playwright/test';
import type { DocsBlockOptions } from '../../../src/components/blocks.js';
import type { DocsHostAttachment } from '../../../src/lib/host.js';

export type TerraContent = unknown[];

export async function openEditor(
  page: Page,
  content: TerraContent,
  options: {
    attachments?: DocsHostAttachment[];
    blocks?: DocsBlockOptions;
    readOnly?: boolean;
    mockResponses?: Record<string, { data?: unknown; error?: string }>;
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
  await page.goto('/editor-harness/');
  await page.locator('[data-terra-content-editor]').first().waitFor();
}
