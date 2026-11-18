// Checks the registry rejects bad entries when it is built and that only the format module spells the Tessera names.
import { expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TesseraNames } from '../../src/shared/tessera/format';
import { RESERVED_NAMES } from '../../src/shared/tessera/reserved-names';
import { ADDITIONS, REGISTRY, createRegistry, type AdditionEntry } from '../../src/shared/tessera/registry';

const notes = ADDITIONS[0];
const entryNamed = (name: string): AdditionEntry => ({ ...notes, name });

test('the shipped registry holds the notes addition, the three revision 2 additions and one reserved name', () => {
  expect(REGISTRY.additions.map(addition => addition.name)).toEqual(['tessera_notes', 'tessera_attributes', 'tessera_ai_context', 'tessera_governance']);
  expect(REGISTRY.reservedNames.map(entry => entry.name)).toEqual(['tessera_imports']);
  expect(REGISTRY.byName('tessera_notes')).toBe(notes);
  expect(REGISTRY.atPlace('concept').map(addition => addition.name)).toEqual(['tessera_notes', 'tessera_attributes', 'tessera_ai_context', 'tessera_governance']);
  expect(REGISTRY.reservedOwner('tessera_imports')).toBe('multi-file units');
});

test('a duplicate name fails when the registry is built', () => {
  expect(() => createRegistry([notes, notes], RESERVED_NAMES)).toThrow('registered twice');
});

test('a name without the prefix fails', () => {
  expect(() => createRegistry([entryNamed('notes')], RESERVED_NAMES)).toThrow('does not start with');
  expect(() => createRegistry([entryNamed(TesseraNames.markerKey)], RESERVED_NAMES)).toThrow('does not start with');
});

test('a name that is also reserved fails', () => {
  expect(() => createRegistry([entryNamed('tessera_imports')], RESERVED_NAMES)).toThrow('also a reserved name');
});

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap(name => {
    const path = join(folder, name);
    if (path.endsWith('src/generated')) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// The document family value 'tessera' is a value of the family field, not the marker key, so it is allowed.
test('no module under src spells the prefix or the marker key except the format module', () => {
  const spellings = [/tessera_/, /['"`]tessera['"`]/, /['"`]Tessera['"`]/];
  const offenders = sourceFiles('src')
    .filter(path => !path.endsWith('src/shared/tessera/format.ts'))
    .filter(path => {
      const withoutFamilyValue = readFileSync(path, 'utf8').replaceAll(/family(: | === )'tessera'/g, '');
      return spellings.some(pattern => pattern.test(withoutFamilyValue));
    });
  expect(offenders).toEqual([]);
});

const FIXTURE_FOLDER = 'tests/fixtures/tessera/additions';

/** Names the registered additions that have no fixture document under the fixture folder. */
function additionsWithoutFixtures(additions: readonly AdditionEntry[], folder: string): string[] {
  return additions.filter(addition => !existsSync(`${folder}/${addition.name}`) || readdirSync(`${folder}/${addition.name}`).length === 0).map(addition => addition.name);
}

test('every registered addition has fixture documents', () => {
  expect(additionsWithoutFixtures(REGISTRY.additions, FIXTURE_FOLDER)).toEqual([]);
});

test('a registry entry added without a fixture folder is reported', () => {
  const later: AdditionEntry = { ...notes, name: 'tessera_later' };
  expect(additionsWithoutFixtures([...REGISTRY.additions, later], FIXTURE_FOLDER)).toEqual(['tessera_later']);
});

test('no reserved name is registered', () => {
  const registered = new Set(REGISTRY.additions.map(addition => addition.name));
  expect(RESERVED_NAMES.filter(reserved => registered.has(reserved.name))).toEqual([]);
});
