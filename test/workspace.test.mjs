import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocsSiteLayout } from '../lib-dist/components/SiteLayout.js';

const sections = [
  {
    title: 'Development',
    groups: [
      {
        title: 'Guides',
        leaves: [
          { title: 'Intro', href: '/intro', attachments: [{ title: 'Notes', href: '/notes.pdf' }] },
        ],
      },
    ],
  },
];

test('static layout delegates to the shared workspace and keeps its document order', () => {
  const html = renderToStaticMarkup(
    React.createElement(DocsSiteLayout, {
      title: 'Docs',
      pageTitle: 'Intro',
      description: 'Site tagline stays in the sidebar.',
      nodes: [],
      sections,
      currentPath: '/intro',
      children: React.createElement('p', null, 'Body text'),
    }),
  );
  assert.ok(html.indexOf('terra-docs-document-header') < html.indexOf('data-docs-toolbar-frame'));
  assert.ok(html.indexOf('data-docs-toolbar-frame') < html.indexOf('Body text'));
  assert.doesNotMatch(html, /Search pages/);
  assert.match(html, /data-can-edit="false"/);
  const header = html.match(
    /<header class="terra-docs-document-header[^>]*>[\s\S]*?<\/header>/,
  )?.[0];
  assert.ok(header, 'the canonical document header renders');
  assert.match(header, /Intro/);
  assert.doesNotMatch(header, /Site tagline stays in the sidebar/);
  assert.match(html, /Site tagline stays in the sidebar/);
  assert.doesNotMatch(html, />Edit</);
});
