import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { validateInput } from '../../src/shared/validation/input';
import { indexBytes } from '../../src/server/projects/scanner';
import { readOntologySet } from '../../src/server/mesh/unit-reader';

function fixture(name: string) {
  const samples = 'tests/fixtures/tessera/mesh/refusals';
  return JSON.parse(readFileSync(`${samples}/${name}.json`, 'utf8')).files as { path: string; source: string }[];
}

function findings(file: { path: string; source: string }) {
  const individual = validateInput(file.source, file.path).issues;
  const scanned = indexBytes('retail', file.path, new TextEncoder().encode(file.source), 'clean', 'scan').findings;
  expect(scanned).toEqual(individual);
  expect(individual.every(issue => issue.code !== 'not-validated')).toBe(true);
  return individual;
}

test.each([
  ['part-header', '/name'],
  ['mixed-version', '/version'],
])('single-file validation refuses a forbidden property in %s', (sample, path) => {
  expect(findings(fixture(sample)[1])).toContainEqual(expect.objectContaining({ code: 'tessera-part-shape', path }));
});

test.each([
  ['part-bound', '/tessera_includes'],
  ['import-bound', '/tessera_imports'],
  ['empty-allow', '/tessera_imports/0/concepts'],
  ['repeated-allow', '/tessera_imports/0/concepts'],
])('single-file validation refuses the list in %s', (sample, path) => {
  expect(findings(fixture(sample)[0])).toContainEqual(expect.objectContaining({ code: 'schema', path }));
});

test('a part opened alone gets its own findings and a whole-unit status', async () => {
  const source = JSON.stringify({ tessera: 3, tessera_part: true, ontology: [{ concept: 'Child', type: 'EntityType', extends: ['Parent'] }] });
  const file = { path: 'standalone.yaml', source };
  expect(findings(file)).toEqual([]);
  const result = await readOntologySet(file, { available: () => false, read: () => null, rootPaths: () => [] }, async () => undefined);
  expect(result).toEqual({ singleFile: { 'standalone.yaml': [] }, set: [], setNotChecked: true });
});

test('single-file checks cannot infer the ownership or presence of declared parts', () => {
  expect(findings(fixture('missing')[0])).toEqual([]);
  expect(findings(fixture('duplicate-owner')[0])).toEqual([]);
});
