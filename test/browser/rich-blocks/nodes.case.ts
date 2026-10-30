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
        data: { title: 'Start step' },
        position: { x: 0, y: 0 },
      },
      {
        _key: 'finish-node',
        _type: 'node',
        id: 'finish',
        type: 'terminator',
        data: { title: 'Finish step' },
        position: { x: 240, y: 0 },
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

test('nodes.spec: Render the canvas, nodes, and edges', async ({ page }) => {
  await openEditor(page, nodesFixture);
  const flowchart = page.locator('[data-docs-editor-block="Nodes"]');
  await expect(flowchart).toBeVisible();
  await expect(flowchart).toHaveCSS('height', '240px');
  await expect(flowchart.getByText('Start step')).toBeVisible();
  await expect(flowchart.getByText('Finish step')).toBeVisible();
});
