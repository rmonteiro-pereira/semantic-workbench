/** Proves a provider's interface is closed and its digest excludes private definitions. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { exportClosure } from '../../src/shared/tessera/export-closure';
import { combineUnit } from '../../src/shared/tessera/unit-model';
import { readUnitStructure } from '../../src/shared/tessera/unit-structure';

function close(data: unknown, imported?: ReadonlyMap<string, Record<string, unknown>>) {
  const path = 'ontology.yaml';
  const { units } = readUnitStructure([{ path, data }]);
  return exportClosure(combineUnit(units[0]), path, imported);
}

for (const fixture of ['open-export', 'unknown-export']) {
  test(`refuses ${fixture} at the root export declaration`, () => {
    const sample = JSON.parse(readFileSync(`tests/fixtures/tessera/mesh/refusals/${fixture}.json`, 'utf8'));
    const result = close(JSON.parse(sample.files[0].source));
    expect(result.findings).toMatchObject([{ code: sample.code, files: ['ontology.yaml'], path: '/tessera_exports' }]);
  });
}

const order = {
  concept: 'Order',
  type: 'EntityType',
  extends: ['Document'],
  identify_by: ['Key.number'],
  requires: ["Currency.scale > 0 AND 'Private.secret' <> ''"],
  relationships: [{ name: 'customer', roles: [{ concept: 'accounts.Customer' }], verbalizes: [] }],
};
const base = {
  tessera: 3,
  version: '0.2.0.dev0',
  ontology: [order, ...['Currency', 'Document', 'Key', 'Private'].map(concept => ({ concept, type: 'EntityType' }))],
  tessera_exports: ['Order', 'Currency', 'Document', 'Key', 'accounts.Customer'],
};
const imported = new Map([['accounts.Customer', { concept: 'Customer', type: 'EntityType' }]]);

test('a closed export includes parent, identifier, constraint and re-exported role dependencies', () => {
  expect(close(base, imported).findings).toEqual([]);
  const result = close({ ...base, tessera_exports: ['Order'] }, imported);
  expect(result.findings.map(finding => finding.message)).toEqual(
    ['Document', 'Key', 'Currency', 'accounts.Customer'].map(name => `ontology.yaml: Export "Order" requires exported concept "${name}".`),
  );
});

test('changes to a public constraint affect the hash while private edits do not', () => {
  const original = close(base, imported).interfaceHash;
  const changed = { ...base, ontology: [{ ...order, requires: ['Currency.scale > 1'] }, ...base.ontology.slice(1)] };
  expect(close(changed, imported).interfaceHash).not.toBe(original);
  const privateEdit = { ...base, ontology: [...base.ontology.slice(0, -1), { concept: 'Private', type: 'EntityType', description: 'Internal edit.' }] };
  expect(close(privateEdit, imported).interfaceHash).toBe(original);
});
