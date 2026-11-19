// Exercises response limits through the complete response envelope.
import { expect, test } from 'bun:test';
import { boundDiff, boundValue, DIFF_LIMITS } from '../../src/shared/item-diff/bounds';
import type { ItemDiff } from '../../src/shared/item-diff/item-change';

function answer(): ItemDiff {
  return {
    from: { side: 'published', version: 'a'.repeat(40) },
    to: { side: 'working', version: 'saved' },
    counts: { added: 3, removed: 0, changed: 0 },
    changes: Array.from({ length: 3 }, (_, index) => ({ address: `sw1:p/a.yaml#ontology:A/concept:C${index}`, kind: 'concept', state: 'added', name: `C${index}`, ambiguous: 0, fields: [] })),
    notCompared: [],
    omitted: 0,
  };
}

test('item limit keeps exact omitted and total counts without mutating the input', () => {
  const original = answer();
  const result = boundDiff(original, { ...DIFF_LIMITS, items: 1 });
  expect(result.changes).toHaveLength(1);
  expect(result.omitted).toBe(2);
  expect(result.counts.added).toBe(3);
  expect(original.changes).toHaveLength(3);
});

test('byte limit includes the envelope and never returns a later smaller change', () => {
  const original = answer();
  original.changes[1].name = '長'.repeat(200);
  const result = boundDiff(original, { ...DIFF_LIMITS, bytes: 650 });
  expect(result.changes).toHaveLength(1);
  expect(result.omitted).toBe(2);
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(650);
});

test('long values are labelled, bounded and do not split Unicode characters', () => {
  const result = boundValue('😀'.repeat(600));
  expect(Array.from(result)).toHaveLength(500);
  expect(result.endsWith('(value shortened)')).toBe(true);
  expect(result.isWellFormed()).toBe(true);
  const original = answer();
  original.changes[0].fields = [{ field: 'description', before: '', after: 'a'.repeat(600) }];
  expect(boundDiff(original).changes[0].fields[0].after).toHaveLength(500);
});
