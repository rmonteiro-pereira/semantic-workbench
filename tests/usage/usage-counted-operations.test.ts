// Tests that the counted-operations table, the operation inventory and the guide agree.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { operationInventory } from '../../src/server/auth/operation-inventory';
import { CountedOperationsError, countedOperation, countedOperations, parseCountedOperations } from '../../src/server/usage/usage-counted-operations';

const flaggedOperations = Object.values(operationInventory.operations)
  .filter(entry => entry.usage)
  .map(entry => entry.id)
  .sort();

describe('counted operations', () => {
  test('the table and the inventory flags name the same operations', () => {
    expect(countedOperations.map(entry => entry.operation).sort()).toEqual(flaggedOperations);
  });

  test('every counted operation exists in the inventory as a read twin', () => {
    for (const { operation } of countedOperations) {
      const entry = Object.values(operationInventory.operations).find(candidate => candidate.id === operation);
      expect(entry?.dispatch).toBe('twin');
      expect(entry?.effects).toEqual(['read']);
    }
  });

  test('the guide lists the same operations in its counted table', () => {
    const guide = readFileSync('docs/usage-counters.md', 'utf8');
    const section = guide.slice(guide.indexOf('## What is counted'), guide.indexOf('## What is stored'));
    const listed = [...section.matchAll(/^\| `([a-z.]+)` \|/gm)].map(match => match[1]).sort();
    expect(listed).toEqual(flaggedOperations);
  });

  test('an operation outside the table is not counted', () => {
    expect(countedOperation('agent.catalog.read')).toBeUndefined();
    expect(countedOperation('agent.plan')?.items).toBe('plan-items');
  });

  test('a malformed table is refused', () => {
    expect(() => parseCountedOperations({})).toThrow(CountedOperationsError);
    expect(() => parseCountedOperations({ operations: [{ operation: 'a.b', items: 'nope', measure: 'workbench-requests' }] })).toThrow(CountedOperationsError);
    expect(() => parseCountedOperations({ operations: [{ operation: 'a.b', items: 'metric', measure: 'imported' }] })).toThrow(CountedOperationsError);
    const row = { operation: 'a.b', items: 'metric', measure: 'workbench-requests' };
    expect(() => parseCountedOperations({ operations: [row, row] })).toThrow(CountedOperationsError);
  });
});
