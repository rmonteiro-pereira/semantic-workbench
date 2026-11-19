import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChangeList } from '../../src/app/item-diff/ChangeList';
import type { ItemDiff } from '../../src/shared/item-diff/item-change';

const diff: ItemDiff = {
  from: { side: 'published', version: 'base' },
  to: { side: 'working', version: 'saved' },
  counts: { added: 0, changed: 0, removed: 0 },
  changes: [],
  notCompared: [],
  omitted: 0,
};
const onRetry = () => {};

test('the comparison list gives empty, loading and retryable error states', () => {
  expect(renderToStaticMarkup(<ChangeList result={{ state: 'empty', diff }} onRetry={onRetry} />)).toContain('No unpublished item changes');
  expect(renderToStaticMarkup(<ChangeList result={{ state: 'loading' }} onRetry={onRetry} />)).toContain('Comparing saved items');
  const error = renderToStaticMarkup(<ChangeList result={{ state: 'error', message: 'Comparison failed.' }} onRetry={onRetry} />);
  expect(error).toContain('Comparison failed.');
  expect(error).toContain('Try again');
});

test('a partial comparison shows changed fields, full displayed text, omissions and failed files', () => {
  const long = 'a'.repeat(425);
  const partial: ItemDiff = {
    ...diff,
    changes: [{ kind: 'concept', name: long, address: 'customer', state: 'changed', ambiguous: 0, fields: [{ field: 'description', before: long, after: 'After text' }] }],
    omitted: 3,
    notCompared: [{ path: 'broken.ontology.yaml', side: 'to', reason: 'Invalid syntax.' }],
  };
  const markup = renderToStaticMarkup(<ChangeList result={{ state: 'partial', diff: partial }} onRetry={onRetry} />);
  for (const text of ['concept (1)', long, 'description', 'Before: ' + long, 'After: After text', '3 more items are not shown', 'broken.ontology.yaml']) {
    expect(markup).toContain(text);
  }
});
