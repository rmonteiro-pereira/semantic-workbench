/** Validates a Tessera unit's source files through the workbench input path. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { validateInput } from '../../src/shared/validation/input';

function validateFixture(folder: string, path: string) {
  return validateInput(readFileSync(`tests/fixtures/tessera/mesh/units/${folder}/${path}`, 'utf8'), path);
}

test('roots and parts validate as their own documents and allow references across files', () => {
  for (const path of ['ontology.yaml', 'orders.yaml', 'returns.yaml', 'customers.json']) {
    const result = validateFixture('three-parts', path);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  }
  expect(validateFixture('empty-root', 'ontology.yaml').valid).toBe(true);
});

test('an invalid part gets a specific schema finding, never an unchecked-version notice', () => {
  const result = validateInput(JSON.stringify({ tessera: 3, tessera_part: true, version: '0.2.0.dev0', ontology: [{ concept: 'A', type: 'EntityType' }] }), 'part.json');
  expect(result.valid).toBe(false);
  expect(result.issues).toMatchObject([{ code: 'tessera-part-shape', path: '/version' }]);
});
