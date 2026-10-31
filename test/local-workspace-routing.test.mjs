import assert from 'node:assert/strict';
import test from 'node:test';
import { findDocsLocalPage } from '../lib-dist/components/LocalDocsWorkspace.js';

const pages = [
  { id: 'index', path: 'content/index.md', pathname: '/', title: 'Home' },
  {
    id: 'languages',
    path: 'content/programming/programming-1/languages/index.md',
    pathname: '/#languages',
    title: 'Languages',
  },
  {
    id: 'python',
    path: 'content/programming/programming-1/python/index.md',
    pathname: '/#python',
    title: 'Python',
  },
  {
    id: 'java',
    path: 'content/programming/programming-1/java/index.md',
    pathname: '/#java',
    title: 'Java',
  },
];

test('hash routes resolve before the shared root pathname', () => {
  assert.equal(findDocsLocalPage(pages, '/#java'), pages[3]);
  assert.equal(findDocsLocalPage(pages, '/?mode=attachments#java'), pages[3]);
  assert.equal(findDocsLocalPage(pages, '/?mode=view#python'), pages[2]);
  assert.equal(findDocsLocalPage(pages, '/'), pages[0]);
});

test('local page paths continue to resolve when multiple leaves use index.md', () => {
  assert.equal(
    findDocsLocalPage(pages, 'content/programming/programming-1/python/index.md'),
    pages[2],
  );
  assert.equal(findDocsLocalPage(pages, 'java'), pages[3]);
});
