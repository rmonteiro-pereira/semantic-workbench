// Tests shipped examples across parsing and query execution.
import { test, expect } from 'bun:test';
import { checkExamples } from '../scripts/example-checks';
import { checkExampleMetrics } from '../scripts/example-metric-checks';
test('all official Ossie examples and generated billing model round-trip; generated SQL produces verified fixture results', async () => {
  const examples = await checkExamples();
  expect(examples.imports).toHaveLength(5);
  expect(examples.sqlExecutions).toHaveLength(24);
  expect(examples.generated.businessEntities).toBe(36);
  expect(examples.generated.governedMetrics).toBe(8);
  expect(examples.blockedCases).toHaveLength(2);
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
  const commerce = sets.find(set => set.set === 'commerce')!;
  expect([...commerce.joins].sort()).toEqual(['lines_order', 'orders_customer']);
}, 60000);
