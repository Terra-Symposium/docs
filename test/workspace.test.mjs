import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocsSiteLayout } from '../lib-dist/SiteLayout.js';

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

test('document header precedes the shared mode toolbar and body', () => {
  const html = renderToStaticMarkup(
    React.createElement(DocsSiteLayout, {
      title: 'Docs',
      pageTitle: 'Intro',
      nodes: [],
      sections,
      currentPath: '/intro',
      children: React.createElement('p', null, 'Body text'),
    }),
  );
  assert.ok(html.indexOf('terra-docs-document-header') < html.indexOf('terra-docs-toolbar-shell'));
  assert.ok(html.indexOf('terra-docs-toolbar-shell') < html.indexOf('Body text'));
  assert.doesNotMatch(html, /Search pages|Search this section/);
  assert.match(html, /Actions for Intro/);
  assert.match(html, /Open in new tab/);
  assert.doesNotMatch(html, /<option value="edit"/);
});

test('remote edit appears only when provider and capability are both supplied', () => {
  const provider = {
    loadDraft: async () => ({ markdown: '', revision: 0 }),
    saveDraft: async () => 1,
    publish: async () => 1,
    history: async () => [],
  };
  const html = renderToStaticMarkup(
    React.createElement(DocsSiteLayout, {
      title: 'Docs',
      nodes: [],
      sections,
      currentPath: '/intro',
      capabilities: { edit: true },
      remoteProvider: provider,
      children: React.createElement('p', null, 'Body'),
    }),
  );
  assert.match(html, /<button[^>]*>Edit<\/button>/);
});
