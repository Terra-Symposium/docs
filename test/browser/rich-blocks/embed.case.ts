import { openEditor } from '../support/editor.js';
import { expect, test } from '@playwright/test';
import type { TerraContent } from '../support/editor.js';

const embedFixture = [
  {
    _key: 'embed-under-test',
    _type: 'embed',
    src: 'about:blank',
    title: 'Local example',
    width: '320px',
    height: '180px',
  },
] satisfies TerraContent;

test('embed.spec: Render title and size without remote requests', async ({ page }) => {
  await openEditor(page, embedFixture);
  const frame = page.getByTitle('Local example');
  await expect(frame).toHaveAttribute('src', 'about:blank');
  await expect(frame).toHaveCSS('width', '320px');
  await expect(frame).toHaveCSS('height', '180px');
});

const youtubeEmbedFixture = [
  {
    _key: 'youtube-embed-under-test',
    _type: 'embed',
    src: 'https://www.youtube.com/watch?v=86xWVb4XIyE&t=7m20s',
    title: 'The essence of C++',
  },
] satisfies TerraContent;

test('embed.spec: Convert YouTube watch links to player URLs and preserve start time', async ({
  page,
}) => {
  await page.route('https://www.youtube.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<main>Offline video fixture</main>',
    }),
  );
  await openEditor(page, youtubeEmbedFixture);

  const frame = page.getByTitle('The essence of C++');
  await expect(frame).toHaveAttribute('src', 'https://www.youtube.com/embed/86xWVb4XIyE?start=440');
  await expect(frame).toBeVisible();
});
