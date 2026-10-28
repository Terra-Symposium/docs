import { openEditor } from '../support/editor.js';
import { expect, test } from '@playwright/test';
import type { TerraContent } from '../support/editor.js';

const nodesFixture = [
  {
    _key: 'nodes-under-test',
    _type: 'nodes',
    direction: 'LR',
    height: 240,
    nodes: [
      {
        _key: 'start-node',
        _type: 'node',
        id: 'start',
        type: 'terminator',
        position: { x: 0, y: 0 },
        data: { title: 'Start step' },
      },
      {
        _key: 'finish-node',
        _type: 'node',
        id: 'finish',
        type: 'terminator',
        position: { x: 220, y: 0 },
        data: { title: 'Finish step' },
      },
    ],
    edges: [
      {
        _key: 'start-finish',
        _type: 'edge',
        id: 'start-finish',
        source: 'start',
        target: 'finish',
      },
    ],
  },
] satisfies TerraContent;

test('nodes.spec: Preserve canvas height', async ({ page }) => {
  await openEditor(page, nodesFixture);
  await expect(page.locator('[data-docs-editor-block="Nodes"]')).toHaveCSS('height', '240px');
});

test('nodes.spec: Render nodes and edges', async ({ page }) => {
  await openEditor(page, nodesFixture);
  const flowchart = page.locator('[data-docs-editor-block="Nodes"]');
  await expect(flowchart).toBeVisible();
  await expect(flowchart).toHaveCSS('height', '240px');
  await expect(flowchart.getByText('Start step')).toBeVisible();
  await expect(flowchart.getByText('Finish step')).toBeVisible();
});
