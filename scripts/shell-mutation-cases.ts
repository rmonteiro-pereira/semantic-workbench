/** Exercises one candidate's public presentation entry point. */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const candidate = await import(process.argv[2]);
if (candidate.trashSections) {
  const items = [
    { kind: 'file', entryId: 'a', project: 'alpha' },
    { kind: 'file', entryId: 'b', project: 'beta' },
    { kind: 'project', entryId: 'c', project: 'gamma' },
  ];
  const sections = candidate.trashSections(items, 'beta');
  assert.deepEqual(
    sections.otherFiles.map((item: { entryId: string }) => item.entryId),
    ['a'],
  );
  assert.equal(sections.otherProjectFiles, 1);
} else {
  const props = {
    model: { entities: [{ id: 'address', name: 'Address', kind: 'EntityType' }], edges: [] },
    search: 'missing',
    clearSearch() {},
    area: null,
    clearArea() {},
    selectEntity() {},
    kpiBadges: new Map(),
    entityTarget: () => null,
    rdfTarget: () => null,
    setEditing() {},
    setRdfEditing() {},
  };
  const empty = renderToStaticMarkup(React.createElement(candidate.CatalogView, props));
  assert.match(empty, /No entity matches/);
  assert.match(empty, /Clear search/);
  const matching = renderToStaticMarkup(React.createElement(candidate.CatalogView, { ...props, search: 'Address' }));
  assert.doesNotMatch(matching, /Clear search/);
}
