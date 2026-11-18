import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MeshContents } from '../../src/app/mesh/MeshView';

const onSelect = () => {};

test('the ontology mesh announces empty, loading and failure states', () => {
  expect(renderToStaticMarkup(<MeshContents state={{ status: 'loading' }} selected="" onSelect={onSelect} />)).toContain('Loading ontology mesh');
  expect(renderToStaticMarkup(<MeshContents state={{ status: 'error', message: 'Error loading' }} selected="" onSelect={onSelect} />)).toContain('role="alert"');
  expect(renderToStaticMarkup(<MeshContents state={{ status: 'ready', value: { projects: [], links: [] } }} selected="" onSelect={onSelect} />)).toContain('No readable projects');
});

test('selectable project buttons wrap long text and a partial link gives no identity', () => {
  const name = 'A long readable project name '.repeat(9).trim();
  const graph = { projects: [{ project: 'retail', name, domain: null }], links: [{ consumer: 'retail', provider: null, items: [] }] };
  const html = renderToStaticMarkup(<MeshContents state={{ status: 'ready', value: graph }} selected="" onSelect={onSelect} />);
  expect(html).toContain(name);
  expect(html).toContain('No domain');
  expect(html).toContain('imports from an unavailable provider');
  expect(html).toContain('<button type="button" class="mesh-project-tile" aria-pressed="false"');
});
