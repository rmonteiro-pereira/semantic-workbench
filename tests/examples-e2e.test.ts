// Tests shipped examples across parsing and query execution.
import { test, expect } from 'bun:test';
import { checkExamples } from '../scripts/example-checks';
import { EXPECTED_EXAMPLE_METRICS, checkExampleMetrics } from '../scripts/example-metric-checks';
test('all official Ossie examples and generated billing model round-trip; generated SQL produces verified fixture results', async () => {
  const r = await checkExamples();
  expect(r.imports).toHaveLength(5);
  expect(r.sqlExecutions).toHaveLength(24);
  expect(r.generated.businessEntities).toBe(36);
  expect(r.generated.governedMetrics).toBe(8);
  expect(r.blockedCases).toHaveLength(2);
}, 30000);
test('every example set shows its governed metrics, validates cleanly and leaves upstream files unchanged', async () => {
  const sets = await checkExampleMetrics();
  expect(Object.fromEntries(sets.map(set => [set.set, set.metrics]))).toEqual({
    ubl: 9,
    commerce: 6,
    'mapped-commerce': 4,
    flights: 7,
    billing: 8,
    mall: 25,
  });
  for (const set of sets) {
    const expected = EXPECTED_EXAMPLE_METRICS[set.set];
    expect(set.joins.length).toBeGreaterThanOrEqual(expected.path.joins);
    // Every metric reaches at least one contract column.
    expect(Object.values(set.contractLinks).every(links => links > 0)).toBe(true);
  }
}, 60000);
