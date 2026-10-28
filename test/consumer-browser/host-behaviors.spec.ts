import { expect, test } from '@playwright/test';

const standardsUrl = process.env.DOCS_STANDARDS_URL?.trim() ?? '';
const compressionUrl = process.env.DOCS_COMPRESSION_URL?.trim() ?? '';

test('Compression landing page uses portable Docs content instead of raw MDX source', async ({
  page,
}) => {
  test.skip(!compressionUrl, 'Set DOCS_COMPRESSION_URL to the running Compression Docs host.');

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  const response = await page.goto(new URL('/', compressionUrl).toString(), {
    waitUntil: 'networkidle',
  });
  expect(response?.status()).toBe(200);
  await page.addStyleTag({
    content: 'astro-dev-toolbar, astro-dev-overlay { display: none !important; }',
  });

  const body = page.locator('[data-docs-body-content]');
  await expect(page.locator('#docs-title')).toHaveValue('Compression project');
  await expect(body.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(body.getByRole('heading', { name: 'Assessment snapshot' })).toBeVisible();
  await expect(body.getByRole('heading', { name: 'Project lifecycle' })).toBeVisible();
  await expect(body.getByRole('heading', { name: 'Expected project checkpoints' })).toBeVisible();
  await expect(body.getByText('Source of truth', { exact: true })).toBeVisible();
  for (const [name, href] of [
    ['Brief', '/at3/brief/'],
    ['Code submission', '/at3/code/'],
    ['Report submission', '/at3/report/'],
    ['API proposal', '/plan/0-overview/'],
    ['Compression plan', '/plan/1-compression/'],
  ]) {
    await expect(body.getByRole('link', { name, exact: false })).toHaveAttribute('href', href);
  }
  await expect(body).not.toContainText('import AssessmentFlow');
  await expect(body).not.toContainText('<AssessmentBadge');
  await expect(body).not.toContainText('<AssessmentFlow');
  await expect(body.locator('h1')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/consumer-compression-home.png', fullPage: true });
  expect(browserErrors).toEqual([]);
});

test('Standards Docs preserves the interactive Skills explorer', async ({ page }) => {
  test.skip(!standardsUrl, 'Set DOCS_STANDARDS_URL to the running Standards Docs host.');

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  const response = await page.goto(new URL('/skills/', standardsUrl).toString(), {
    waitUntil: 'networkidle',
  });
  expect(response?.status()).toBe(200);
  await page.addStyleTag({
    content: 'astro-dev-toolbar, astro-dev-overlay { display: none !important; }',
  });

  const body = page.locator('[data-docs-body-content]');
  await expect(
    body.getByText(
      'Browse shared Terra workflows and package-owned agent skills. Expand a package or group, then select a skill to inspect its Markdown source.',
      { exact: true },
    ),
  ).toBeVisible();
  const explorer = body.getByRole('region', { name: 'Skills browser' });
  await expect(explorer).toBeVisible();
  const tree = explorer.getByRole('list', { name: 'Available skills' });
  await expect(tree).toBeVisible();

  // The tree starts collapsed; expand its package/group hierarchy until a
  // selectable skill appears, then verify the source detail is hydrated.
  for (let depth = 0; depth < 8; depth += 1) {
    if (await tree.locator('button.skills-tree__skill:visible').count()) break;
    const collapsedGroup = tree
      .locator('button.skills-tree__group[aria-expanded="false"]:visible')
      .first();
    if (!(await collapsedGroup.count())) break;
    await collapsedGroup.click();
  }

  const firstSkill = tree.locator('button.skills-tree__skill:visible').first();
  await expect(firstSkill).toBeVisible();
  await firstSkill.click();
  await expect(explorer.getByText('Selected skill', { exact: true })).toBeVisible();
  await expect(tree.locator('.skills-tree__skill.is-selected')).toBeVisible();
  await expect(explorer.locator('.skills-explorer__source code')).not.toBeEmpty();
  await page.screenshot({ path: 'test-results/consumer-standards-skills.png', fullPage: true });
  expect(browserErrors).toEqual([]);
});
