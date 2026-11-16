import React from 'react';
import { CatalogView } from '../src/app/workspace/CatalogView';
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ValidationPanel } from '../src/app/validation/ValidationPanel';
import { EntityName } from '../src/app/graph/EntityName';
import type { Issue } from '../src/shared/validation/diagnostics';

function findings(errors: number, warnings: number): Issue[] {
  const errorIssues: Issue[] = Array.from({ length: errors }, () => ({
    severity: 'error',
    code: 'empty',
    path: '/',
    message: 'Definition is empty.',
  }));
  const warningIssues: Issue[] = Array.from({ length: warnings }, () => ({
    severity: 'warning',
    code: 'reference',
    path: '/',
    message: 'Check the reference.',
  }));
  return [...errorIssues, ...warningIssues];
}

test.each([
  [0, 0, '0 errors · 0 warnings'],
  [1, 1, '1 error · 1 warning'],
  [2, 1, '2 errors · 1 warning'],
  [1, 2, '1 error · 2 warnings'],
])('validation counts agree with %i errors and %i warnings', (errors, warnings, summary) => {
  const html = renderToStaticMarkup(<ValidationPanel issues={findings(errors, warnings)} />);
  expect(html).toContain(`<p>${summary}</p>`);
});

test('empty-definition recovery does not assume the operation is an import', () => {
  const html = renderToStaticMarkup(<ValidationPanel issues={findings(1, 0)} />);
  expect(html).toContain('Provide a definition before continuing.');
  expect(html).not.toContain('before importing');
});

test.each([
  ['DocumentReference', 'Document<wbr/>Reference'],
  ['XMLDocument', 'XML<wbr/>Document'],
  ['order.total_amount', 'order.<wbr/>total_<wbr/>amount'],
])('entity names wrap at identifier boundaries: %s', (name, broken) => {
  const html = renderToStaticMarkup(<EntityName name={name} />);
  expect(html).toContain(`>${broken}</strong>`);
  expect(html.replaceAll('<wbr/>', '')).toContain(`>${name}</strong>`);
});

test('catalog search explains no matches and keeps its total', () => {
  const props = {
    model: { entities: [{ id: 'address', name: 'Address', kind: 'EntityType' }], relationships: [] },
    search: 'missing',
    clearSearch: () => {},
    area: null,
    clearArea: () => {},
    selectEntity: () => {},
    kpiBadges: new Map(),
    entityTarget: () => null,
    rdfTarget: () => null,
    setEditing: () => {},
    setRdfEditing: () => {},
  } as unknown as React.ComponentProps<typeof CatalogView>;
  const empty = renderToStaticMarkup(<CatalogView {...props} />);
  expect(empty).toContain('No entity matches');
  expect(empty).toContain('Clear search');
  expect(empty).toContain('0 of 1');
  const matching = renderToStaticMarkup(<CatalogView {...props} search="Address" />);
  expect(matching).toContain('1 of 1');
  expect(matching).not.toContain('Clear search');
  const description = 'A complete description '.repeat(12);
  const describedModel = { ...props.model!, entities: [{ ...props.model!.entities[0], description }] };
  const described = renderToStaticMarkup(<CatalogView {...props} model={describedModel} search="Address" />);
  expect(described).toContain('description…</p>');
  expect(described).toContain(`title="${description}"`);
});
