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
  await expect(flowchart.locator('.react-flow__attribution')).toHaveCSS('display', 'none');
});

const autoLayoutNodesFixture = [
  {
    _key: 'nodes-without-positions',
    _type: 'nodes',
    direction: 'TB',
    nodes: [
      {
        _key: 'source-start',
        _type: 'node',
        id: 'start',
        type: 'origin',
        data: { title: 'Unpositioned start' },
      },
      {
        _key: 'source-finish',
        _type: 'node',
        id: 'finish',
        type: 'terminal',
        data: { title: 'Unpositioned finish' },
      },
    ],
    edges: [
      {
        _key: 'source-edge',
        _type: 'edge',
        id: 'source-edge',
        source: 'start',
        target: 'finish',
        data: { arrowHead: true },
      },
    ],
  },
] satisfies TerraContent;

test('nodes.spec: Auto-layout Sanity nodes that have no saved positions', async ({ page }) => {
  await openEditor(page, autoLayoutNodesFixture);
  const flowchart = page.locator('[data-docs-editor-block="Nodes"]');
  await expect(flowchart.locator('.react-flow__node')).toHaveCount(2);
  await expect(flowchart.locator('.react-flow__edge')).toHaveCount(1);
  await expect(flowchart.getByText('Unpositioned start')).toBeVisible();
  await expect(flowchart.getByText('Unpositioned finish')).toBeVisible();
});

const selfLoopNodesFixture = [
  {
    _key: 'nodes-with-self-loop',
    _type: 'nodes',
    direction: 'TB',
    nodes: [
      {
        _key: 'self-loop-node',
        _type: 'node',
        id: 'repeat',
        type: 'process',
        data: { title: 'Repeat this step' },
      },
    ],
    edges: [
      {
        _key: 'self-loop-edge',
        _type: 'edge',
        id: 'repeat-edge',
        source: 'repeat',
        target: 'repeat',
      },
    ],
  },
] satisfies TerraContent;

test('nodes.spec: Auto-layout graphs with self-loop edges', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openEditor(page, selfLoopNodesFixture);
  const flowchart = page.locator('[data-docs-editor-block="Nodes"]');
  await expect(flowchart.locator('.react-flow__node')).toHaveCount(1);
  await expect(flowchart.locator('.react-flow__edge')).toHaveCount(1);
  await expect(flowchart.getByText('Repeat this step')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

const compoundGroupNodesFixture = [
  {
    _key: 'nodes-with-compound-groups',
    _type: 'nodes',
    direction: 'LR',
    height: 320,
    nodes: [
      {
        _key: 'group-source',
        _type: 'node',
        id: 'group-source',
        type: 'group',
        data: { title: 'Source group' },
      },
      {
        _key: 'group-target',
        _type: 'node',
        id: 'group-target',
        type: 'group',
        data: { title: 'Target group' },
      },
      {
        _key: 'source-child',
        _type: 'node',
        id: 'source-child',
        type: 'process',
        parentId: 'group-source',
        data: { title: 'Source child' },
      },
      {
        _key: 'target-child',
        _type: 'node',
        id: 'target-child',
        type: 'process',
        data: { title: 'Target child', groupId: 'group-target' },
      },
      {
        _key: 'driver',
        _type: 'node',
        id: 'driver',
        type: 'note',
        data: { title: 'Driver' },
      },
    ],
    edges: [
      {
        _key: 'between-children',
        _type: 'edge',
        id: 'between-children',
        source: 'source-child',
        target: 'target-child',
      },
      {
        _key: 'to-group',
        _type: 'edge',
        id: 'to-group',
        source: 'driver',
        target: 'group-target',
      },
      {
        _key: 'child-self-loop',
        _type: 'edge',
        id: 'child-self-loop',
        source: 'target-child',
        target: 'target-child',
      },
    ],
  },
] satisfies TerraContent;

test('nodes.spec: Auto-layout compound groups with group-target and self-loop edges', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openEditor(page, compoundGroupNodesFixture);
  const flowchart = page.locator('[data-docs-editor-block="Nodes"]');
  await expect(flowchart.locator('.react-flow__node')).toHaveCount(5);
  await expect(flowchart.locator('.react-flow__edge')).toHaveCount(3);
  await expect(flowchart.getByText('Target child')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
