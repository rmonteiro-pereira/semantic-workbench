/** Verifies the imports UI names each read state and preserves long identifiers. */
import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImportsView } from '../../src/app/mesh/ImportsSection';
import { ImportEditor } from '../../src/app/mesh/ImportEditor';

const onOpen = () => {};

test('imports have explicit empty, loading and failure states', () => {
  expect(renderToStaticMarkup(<ImportsView state={{ status: 'ready', value: undefined }} canEdit onOpen={onOpen} />)).toContain('No imports');
  expect(renderToStaticMarkup(<ImportsView state={{ status: 'loading' }} canEdit={false} onOpen={onOpen} />)).toContain('Loading imports');
  expect(renderToStaticMarkup(<ImportsView state={{ status: 'error', message: 'Unavailable' }} canEdit={false} onOpen={onOpen} />)).toContain('role="alert"');
});

test('the section reports unpublished declarations and includes their full names', () => {
  const name = 'Long-department-ontology-name'.repeat(10);
  const value = { path: 'ontology.yaml', imports: [{ project: name, ontology: 'provider.yaml', alias: 'fin', concepts: [name], version: 'latest' as const }], state: 'needs-update' as const };
  const html = renderToStaticMarkup(<ImportsView state={{ status: 'ready', value }} canEdit={false} onOpen={onOpen} />);
  expect(html).toContain(name);
  expect(html).toContain('Not published');
  expect(html).toContain('mesh-import-list');
});

test('the provider editor offers a wrapping option label and reports an empty provider list', () => {
  const name = 'Long-department-ontology-name'.repeat(10);
  const providers = [{ project: 'finance', name, ontology: 'concepts.yaml', version: '1'.repeat(40), concepts: ['Order'] }];
  const options = { aliases: new Set<string>(), onCancel: onOpen, onAdd: async () => {} };
  expect(renderToStaticMarkup(<ImportEditor providers={[]} {...options} />)).toContain('No readable project has a published interface');
  const html = renderToStaticMarkup(<ImportEditor providers={providers} {...options} />);
  expect(html).toContain(name);
  expect(html).toContain('class="mesh-option"');
});
