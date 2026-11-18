// Checks the registry rejects bad entries when it is built and that only the format module spells the Tessera names.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TesseraNames } from '../../src/shared/tessera/format';
import { RESERVED_NAMES } from '../../src/shared/tessera/reserved-names';
import { ADDITIONS, REGISTRY, createRegistry, type AdditionEntry } from '../../src/shared/tessera/registry';

const notes = ADDITIONS[0];
const entryNamed = (name: string): AdditionEntry => ({ ...notes, name });

test('the shipped registry holds the notes addition and four reserved names', () => {
  expect(REGISTRY.additions.map(addition => addition.name)).toEqual(['tessera_notes']);
  expect(REGISTRY.reservedNames.map(entry => entry.name)).toEqual(['tessera_ai_context', 'tessera_governance', 'tessera_attributes', 'tessera_imports']);
  expect(REGISTRY.byName('tessera_notes')).toBe(notes);
  expect(REGISTRY.atPlace('concept')).toEqual([notes]);
  expect(REGISTRY.reservedOwner('tessera_governance')).toBe('governance');
});

test('a duplicate name fails when the registry is built', () => {
  expect(() => createRegistry([notes, notes], RESERVED_NAMES)).toThrow('registered twice');
});

test('a name without the prefix fails', () => {
  expect(() => createRegistry([entryNamed('notes')], RESERVED_NAMES)).toThrow('does not start with');
  expect(() => createRegistry([entryNamed(TesseraNames.markerKey)], RESERVED_NAMES)).toThrow('does not start with');
});

test('a name that is also reserved fails', () => {
  expect(() => createRegistry([entryNamed('tessera_governance')], RESERVED_NAMES)).toThrow('also a reserved name');
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
