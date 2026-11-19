// Checks the derived schema is a pure function of the pinned schema and the registry, and that the checked-in file and its validator match it.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { SUPPORTED_BASES } from '../../src/shared/tessera/bases';
import { REGISTRY, createRegistry, type AdditionEntry } from '../../src/shared/tessera/registry';
import { RESERVED_NAMES } from '../../src/shared/tessera/reserved-names';
import { derivedSchemaFileName, deriveTesseraSchema, printDerivedSchema } from '../../src/shared/tessera/schema-derivation';
import { derivedSchemaFiles } from '../../scripts/derive-tessera-schema';
import pinned from '../../schemas/ossie-ontology-0.2.0.dev0.json';

const base = SUPPORTED_BASES[0];

test('the checked-in derived schema equals a fresh derivation byte for byte', () => {
  const files = derivedSchemaFiles();
  expect(files.map(file => file.path)).toEqual([`schemas/${derivedSchemaFileName(base, 1)}`, `schemas/${derivedSchemaFileName(base, 2)}`]);
  for (const file of files) expect(readFileSync(file.path, 'utf8')).toBe(file.text);
});

test('the derivation does not change the pinned schema it reads', () => {
  const before = JSON.stringify(base.ontologySchema);
  deriveTesseraSchema(base, REGISTRY, 1);
  expect(JSON.stringify(base.ontologySchema)).toBe(before);
  expect(JSON.stringify(pinned)).toBe(before);
});

test('the derivation adds only the identifier, the comment, the marker and the notes at three places', () => {
  const derived = deriveTesseraSchema(base, REGISTRY, 1);
  expect(derived.$id).toContain('tessera-ontology:1:ossie-0.2.0.dev0');
  expect(derived.$comment).toContain('0.2.0.dev0');
  expect(derived.required).toEqual(['tessera', ...pinned.required]);
  expect(derived.properties.tessera.const).toBe(1);
  const strip = (schema: any) => {
    const copy = structuredClone(schema);
    delete copy.$id;
    delete copy.$comment;
    delete copy.properties.tessera;
    delete copy.properties.tessera_notes;
    delete copy.$defs.OntologyComponent.properties.tessera_notes;
    delete copy.$defs.Relationship.properties.tessera_notes;
    copy.required = copy.required.filter((name: string) => name !== 'tessera');
    delete copy.$id;
    return copy;
  };
  const pinnedWithoutId = structuredClone(pinned) as any;
  delete pinnedWithoutId.$id;
  expect(strip(derived)).toEqual(pinnedWithoutId);
});

test('the compiled validator accepts a marked document with notes and refuses one with the wrong marker or an empty note', () => {
  const validate = base.validators[1];
  const document = { tessera: 1, version: '0.2.0.dev0', name: 'Retail', tessera_notes: 'Hello', ontology: [{ concept: 'Order', type: 'EntityType', tessera_notes: 'A note' }] };
  expect(validate(document)).toBe(true);
  expect(validate({ ...document, tessera: 2 })).toBe(false);
  expect(validate({ ...document, ontology: [{ concept: 'Order', type: 'EntityType', tessera_notes: '' }] })).toBe(false);
  expect(validate({ ...document, ontology: [{ concept: 'Order', type: 'EntityType', tessera_notes: 'x'.repeat(10_001) }] })).toBe(false);
  const { tessera: _marker, ...unmarked } = document;
  expect(validate(unmarked)).toBe(false);
});

test('an addition that starts at a later revision is left out of the earlier schema and printing is stable', () => {
  const later: AdditionEntry = { ...REGISTRY.additions[0], name: 'tessera_later', since: 2, places: ['concept'] };
  const registry = createRegistry([...REGISTRY.additions, later], RESERVED_NAMES);
  const first = deriveTesseraSchema(base, registry, 1);
  const second = deriveTesseraSchema(base, registry, 2);
  expect(first.$defs.OntologyComponent.properties.tessera_later).toBeUndefined();
  expect(second.$defs.OntologyComponent.properties.tessera_later).toBeDefined();
  expect(printDerivedSchema(first)).toBe(printDerivedSchema(deriveTesseraSchema(base, registry, 1)));
});
