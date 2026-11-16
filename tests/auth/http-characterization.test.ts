// Compares the HTTP contract with the recording made before the boundary extraction.
import { expect, test } from 'bun:test';
import expected from '../fixtures/characterization/http-v1.json';
import { characterizeHttp } from './http-characterization';

function canonicalComparison(capture: { audit: unknown[] }) {
  return {
    ...capture,
    audit: capture.audit.map(record => {
      if (!record || typeof record !== 'object' || !('rules' in record) || !Array.isArray(record.rules)) return record;
      // Cedar reports a set of matching rules whose order has no meaning.
      return { ...record, rules: [...record.rules].sort() };
    }),
  };
}

test('HTTP responses and audit records equal the original characterization', async () => {
  const actual = await characterizeHttp();
  expect(actual).toHaveLength(expected.length);
  for (const [index, capture] of actual.entries()) {
    expect(canonicalComparison(capture), `${capture.caller}: ${capture.method} ${capture.path}`).toEqual(canonicalComparison(expected[index]));
  }
}, 120_000);
