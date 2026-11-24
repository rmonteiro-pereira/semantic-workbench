/** Tests the unit file labels and navigation markup without reading any inaccessible parts. */
import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PartPicker } from '../../src/app/mesh/PartPicker';

test('nothing is rendered for a one-file ontology', () => {
  expect(renderToStaticMarkup(<PartPicker selection={{ active: 'ontology.yaml', files: [], part: false }} />)).toBe('');
});

test('the root and part labels show complete long paths', () => {
  const root = 'A very long department ontology name '.repeat(5) + 'ontology.yaml';
  const part = 'orders/approved-and-returned-purchases.yaml';
  const files = [root, part];
  const rootView = renderToStaticMarkup(<PartPicker selection={{ active: root, files, part: false }} open={() => {}} />);
  const partView = renderToStaticMarkup(<PartPicker selection={{ active: part, files, part: true }} />);
  expect(rootView).toContain('Root with 1 part');
  expect(rootView).toContain(part);
  expect(rootView).toContain('aria-current="true"');
  expect(partView).toContain('Part of <strong>' + root);
});

test('the orphan status gives no missing file name', () => {
  const status = renderToStaticMarkup(<PartPicker selection={{ active: 'orders.yaml', files: [], part: true }} />);
  expect(status).toContain('No readable root lists this part.');
  expect(status).not.toContain('orders.yaml');
});
