// Tests shipped examples across parsing and query execution.
import { test, expect } from 'bun:test';
import { checkExamples } from '../scripts/example-checks';
test('all official Ossie examples and generated billing model round-trip; generated SQL produces verified fixture results', async () => {
  const r = await checkExamples();
  expect(r.imports).toHaveLength(5);
  expect(r.sqlExecutions).toHaveLength(20);
  expect(r.generated.businessEntities).toBe(36);
  expect(r.blockedCases).toHaveLength(2);
}, 30000);
