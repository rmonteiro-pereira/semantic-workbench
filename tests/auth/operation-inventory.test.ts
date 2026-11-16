// Rejects invalid operation contracts before dispatch or audit consumes their metadata.
import { expect, test } from 'bun:test';
import { parseOperationInventory } from '../../src/server/auth/operation-inventory';

const valid = {
  operations: {
    'GET /example': {
      id: 'example.read',
      service: 'projects/workspace',
      action: 'read',
      targets: 'workspace',
      handlerChecks: [],
      input: { query: [], body: [] },
      limits: { request: 'none', response: 'bounded', work: 'light' },
      effects: ['read'],
      dispatch: 'twin',
      exposure: { increment: 'local-edit' },
    },
  },
  browserCapabilities: [],
};

test('inventory parser accepts the reviewed entry shape', () => {
  expect(parseOperationInventory(valid).operations['GET /example'].id).toBe('example.read');
});

test('inventory parser names the invalid row and field', () => {
  const changes = [
    { id: 'Bad id' },
    { action: 'unknown' },
    { service: '' },
    { targets: 'unknown' },
    { handlerChecks: ['unknown'] },
    { input: { query: 'text', body: [] } },
    { limits: { request: 'MISSING', response: 'bounded', work: 'light' } },
    { limits: { request: 'none', response: 'unknown', work: 'light' } },
    { limits: { request: 'none', response: 'bounded', work: 'unknown' } },
    { effects: ['unknown'] },
    { dispatch: { no: 'public' } },
    { clientAction: 'edit' },
    { exposure: { increment: 'later' } },
  ];
  for (const change of changes) {
    const value = structuredClone(valid);
    Object.assign(value.operations['GET /example'], change);
    expect(() => parseOperationInventory(value), JSON.stringify(change)).toThrow('GET /example');
  }
  const duplicate = { ...valid, operations: { ...valid.operations, 'GET /duplicate': valid.operations['GET /example'] } };
  expect(() => parseOperationInventory(duplicate)).toThrow('duplicate operation id');
});
