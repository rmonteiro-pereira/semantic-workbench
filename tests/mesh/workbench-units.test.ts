/** Validates a Tessera unit's source files through the workbench input path. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { validateInput } from '../../src/shared/validation/input';
import { inspectOntologyUnit } from '../../src/shared/core/model';
import { readUnitStructure } from '../../src/shared/tessera/unit-structure';
import { indexBytes } from '../../src/server/projects/scanner';

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

test('the scanner indexes fragments as ontology files and the dependency lock as project metadata', () => {
  const bytes = readFileSync('tests/fixtures/tessera/mesh/units/three-parts/orders.yaml');
  const part = indexBytes('retail', 'orders.yaml', bytes);
  expect(part.file).toMatchObject({ docType: 'Ossie ontology', valid: true, visible: true });
  expect(part.entities).toMatchObject([{ name: 'Order' }]);
  const manifest = indexBytes('retail', 'tessera-dependencies.json', Buffer.from(JSON.stringify({ manifestVersion: 1, root: 'ontology.yaml', providers: [] })));
  expect(manifest.file).toMatchObject({ docType: 'Tessera dependency manifest', valid: true, visible: true });
  expect(manifest.entities).toEqual([]);
});

test('inspection gives the same graph for the composed unit and the single file', () => {
  const splitFiles = ['ontology.yaml', 'orders.yaml', 'returns.yaml', 'customers.json'];
  const { units } = readUnitStructure(
    splitFiles.map(path => ({
      path,
      data: JSON.parse(readFileSync(`tests/fixtures/tessera/mesh/units/three-parts/${path}`, 'utf8')),
    })),
  );
  const composed = inspectOntologyUnit(units[0]);
  const twin = validateFixture('one-file-twin', 'ontology.yaml').model;
  expect(composed.entities).toEqual(twin?.entities);
  expect(composed.edges).toEqual(twin?.edges);
});
