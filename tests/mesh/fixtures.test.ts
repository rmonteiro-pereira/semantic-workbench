/** Checks syntax and equivalent concepts in split and single-file fixture ontologies. */
import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';

const fixtureRoot = 'tests/fixtures/tessera/mesh';

function readFixture(path: string) {
  const document = parseDocument(readFileSync(join(fixtureRoot, path), 'utf8'), { uniqueKeys: true });
  expect(document.errors, path).toEqual([]);
  return document.toJS({ maxAliasCount: 100 });
}

function fixtureConcepts(folder: string) {
  const root = readFixture(`units/${folder}/ontology.yaml`);
  return [...root.ontology, ...(root.tessera_includes ?? []).flatMap((path: string) => readFixture(`units/${folder}/${path}`).ontology)];
}

test('the root and three ordered parts contain exactly the single-file twin', () => {
  expect(fixtureConcepts('three-parts')).toEqual(fixtureConcepts('one-file-twin'));
  expect(fixtureConcepts('three-parts').map(concept => concept.concept)).toEqual(['Shop', 'Order', 'Return', 'Customer']);
});

test('an empty root gets all its concepts from the listed part', () => {
  expect(readFixture('units/empty-root/ontology.yaml').ontology).toEqual([]);
  expect(fixtureConcepts('empty-root')).toEqual(fixtureConcepts('one-file-twin'));
});

test('each unit fixture has valid YAML or JSON syntax', () => {
  for (const folder of readdirSync(join(fixtureRoot, 'units'))) {
    for (const file of readdirSync(join(fixtureRoot, 'units', folder))) {
      const data = readFixture(`units/${folder}/${file}`);
      expect(Array.isArray(data.ontology)).toBe(true);
    }
  }
});

test('each refusal envelope parses and its inventory names the expected finding', () => {
  const inventory = readFileSync(join(fixtureRoot, 'README.md'), 'utf8');
  for (const name of readdirSync(join(fixtureRoot, 'refusals'))) {
    const refusal = readFixture(`refusals/${name}`);
    expect(inventory).toContain(`\`${name}\` | \`${refusal.code}\``);
    for (const file of refusal.files) {
      const document = parseDocument(file.source, { uniqueKeys: true });
      expect(document.errors, `${name}: ${file.path}`).toEqual([]);
      expect(document.toJS({ maxAliasCount: 100 })).toBeObject();
    }
  }
});
