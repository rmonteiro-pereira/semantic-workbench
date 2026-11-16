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

import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { operationInventory, HANDLER_CHECKS, type OperationInventory } from '../../src/server/auth/operation-inventory';
import { ROUTE_ACTIONS, type RouteAction } from '../../src/server/auth/route-actions';
import { REQUEST_LIMITS } from '../../src/server/request';
import { operationClassifiers } from '../../src/server/auth/operation-classifiers';
import { operationInventoryTable } from '../../scripts/operation-inventory-table';
import { routeExamples } from './route-actions';

function checkRows(inventory: OperationInventory, rows: RouteAction[]) {
  for (const row of rows) {
    const entry = inventory.operations[row.path];
    if (!entry) throw Error(`${row.path}: missing inventory entry`);
    if (entry.action !== row.action) throw Error(`${row.path}: action differs`);
    if (entry.clientAction !== row.clientAction) throw Error(`${row.path}: client action differs`);
    if (Boolean(row.public) !== (entry.dispatch !== 'twin' && entry.dispatch.no === 'public')) throw Error(`${row.path}: public flag differs`);
    if (row.targets === 'body' && entry.targets !== 'body') throw Error(`${row.path}: body target differs`);
  }
  for (const path of Object.keys(inventory.operations)) {
    if (!rows.some(row => row.path === path)) throw Error(`${path}: inventory entry without row`);
  }
}

test('every row and entry agree, with named failures for contract drift', () => {
  checkRows(operationInventory, ROUTE_ACTIONS);
  const first = ROUTE_ACTIONS[0];
  const deleted = structuredClone(operationInventory);
  delete deleted.operations[first.path];
  expect(() => checkRows(deleted, ROUTE_ACTIONS)).toThrow(first.path);
  expect(() => checkRows(operationInventory, [...ROUTE_ACTIONS, { ...first, path: 'GET /unreviewed' }])).toThrow('GET /unreviewed');
  expect(() => checkRows(operationInventory, [{ ...first, action: 'admin' }, ...ROUTE_ACTIONS.slice(1)])).toThrow(first.path);
});

test('resource kinds, request limits and classifiers resolve to their owners', () => {
  for (const row of ROUTE_ACTIONS) {
    const entry = operationInventory.operations[row.path];
    const example = routeExamples.find(example => (row.methods ?? [row.method]).includes(example.method) && row.pattern.test(example.path));
    if (example && !row.targets && !['handler', 'path'].includes(entry.targets)) {
      const url = new URL(example.path, 'http://inventory.internal');
      expect(entry.targets, row.path).toBe(row.resource(url.pathname.match(row.pattern)!, url).type);
    }
    if (entry.limits.request !== 'none') {
      const limit = REQUEST_LIMITS[entry.limits.request];
      expect(Number.isInteger(limit) && limit > 0, row.path).toBe(true);
    }
    if (entry.outcomeClassifier) expect(typeof operationClassifiers[entry.outcomeClassifier], row.path).toBe('function');
  }
  for (const capability of operationInventory.browserCapabilities) expect(existsSync(capability.source), capability.id).toBe(true);
});

test('every handler check appears in the executable parity table', () => {
  const source = ts.createSourceFile('parity.ts', readFileSync(new URL('./operation-parity.test.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const ids: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'parityCases' && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      for (const element of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        for (const property of element.properties) {
          if (ts.isPropertyAssignment(property) && property.name.getText(source) === 'id' && ts.isStringLiteral(property.initializer)) ids.push(property.initializer.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(ids.length).toBeGreaterThan(20);
  const covered = new Set(
    Object.values(operationInventory.operations)
      .filter(entry => ids.includes(entry.id))
      .flatMap(entry => entry.handlerChecks),
  );
  for (const check of HANDLER_CHECKS) expect(covered.has(check), check).toBe(true);
});

test('generated operation reference equals the reviewed inventory', async () => {
  const actual = await Bun.file(new URL('../../docs/operations.md', import.meta.url)).text();
  expect(actual).toBe(operationInventoryTable());
  expect(actual + '\nHand edit\n').not.toBe(operationInventoryTable());
});
