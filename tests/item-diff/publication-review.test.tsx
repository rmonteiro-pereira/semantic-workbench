import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicationChanges } from '../../src/app/item-diff/PublicationReview';
import type { ComparisonState } from '../../src/app/item-diff/use-item-diff';
import type { ItemDiff } from '../../src/shared/item-diff/item-change';

const diff: ItemDiff = {
  from: { side: 'published', version: 'base' },
  to: { side: 'branch:item/customer', version: 'next' },
  counts: { added: 0, changed: 0, removed: 0 },
  changes: [],
  notCompared: [],
  omitted: 0,
};

function markup(result: ComparisonState) {
  return renderToStaticMarkup(
    <>
      <PublicationChanges result={result} onRetry={() => {}} />
      <button>Publish to main</button>
    </>,
  );
}

test('an empty, loading or failed review leaves confirmation available', () => {
  expect(markup({ state: 'empty', diff })).toContain('No unpublished item changes');
  expect(markup({ state: 'loading' })).toContain('Comparing saved items');
  const failed = markup({ state: 'error', message: 'Branch could not be read.' });
  expect(failed).toContain('Branch could not be read.');
  expect(failed).toContain('<button>Publish to main</button>');
});

test('publication review counts changed kinds and bounds its list', () => {
  const changes = Array.from({ length: 35 }, (_, index) => ({ kind: 'attribute', state: 'changed' as const, address: String(index), name: `Attribute ${index}`, fields: [], ambiguous: 0 }));
  const html = markup({ state: 'ready', diff: { ...diff, changes } });
  expect(html).toContain('attribute: 35');
  expect(html).toContain('Attribute 29');
  expect(html).not.toContain('Attribute 30');
  expect(html).toContain('5 more items are not shown');
});
