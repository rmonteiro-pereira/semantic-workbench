import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'bun:test';
import { footerCounts, StatusFooter } from '../src/app/workspace/StatusFooter';

test('an ontology reports entities and relationships', () => {
  expect(footerCounts('Ossie ontology', 45, 277)).toBe('45 entities · 277 relationships');
  expect(footerCounts(undefined, 1, 1)).toBe('1 entity · 1 relationship');
});

test('a mapping file reports its concept mappings, not an empty relationship count', () => {
  expect(footerCounts('Ossie mappings', 167, 0)).toBe('167 concept mappings');
  expect(footerCounts('Ossie mappings', 1, 0)).toBe('1 concept mapping');
});

test('Source keeps validation details without repeating the invalid-draft banner', () => {
  const props = {
    error: 'Invalid YAML',
    hasSource: true,
    hasDocument: true,
    dirty: true,
    setShowValidation: () => {},
    issueCount: 1,
    validated: false,
    entityCount: 0,
    relationshipCount: 0,
    message: '',
    tab: 'source',
  };
  const source = renderToStaticMarkup(React.createElement(StatusFooter, props));
  expect(source).toContain('Validation details');
  expect(source).not.toContain('Validation failed');
  const overview = renderToStaticMarkup(React.createElement(StatusFooter, { ...props, tab: 'overview' }));
  expect(overview).toContain('Validation failed. Review the findings and repair in Source.');
});
