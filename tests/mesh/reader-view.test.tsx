import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnitSetNotice } from '../../src/app/mesh/UnitSetNotice';

test('a partial set notice omits paths, counts and hidden names', () => {
  const html = renderToStaticMarkup(<UnitSetNotice validation={{ singleFile: {}, set: [], setNotChecked: true }} />);
  expect(html).toContain('The ontology set was not checked for you.');
  expect(html).not.toContain('private');
  expect(renderToStaticMarkup(<UnitSetNotice validation={{ singleFile: {}, set: [], setNotChecked: false }} />)).toBe('');
});
