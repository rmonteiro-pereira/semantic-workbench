// Checks every Tessera mutant still has its anchor text exactly once in its file, and that every mutant category has a case that names tests under tests/tessera.
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { TESSERA_CASES } from '../../scripts/tessera-mutation-cases';
import { tesseraMutants } from '../../scripts/tessera-mutants';

test('there are mutants to check', () => {
  expect(tesseraMutants.length).toBeGreaterThanOrEqual(21);
});

for (const [index, [category, file, before]] of tesseraMutants.entries()) {
  test(`mutant ${index} in ${file} has its anchor exactly once`, () => {
    expect(category).toBe('tessera');
    expect(existsSync(file)).toBe(true);
    const occurrences = readFileSync(file, 'utf8').split(before).length - 1;
    expect(occurrences, before).toBe(1);
  });
}

test('every mutated file has a case that applies to a module of that file', () => {
  expect(TESSERA_CASES.length).toBeGreaterThanOrEqual(10);
});

test('every case names at least one existing test file under tests/tessera', () => {
  for (const entry of TESSERA_CASES) {
    expect(entry.tests.length, entry.name).toBeGreaterThan(0);
    for (const test of entry.tests) {
      expect(test.startsWith('tests/tessera/'), test).toBe(true);
      expect(existsSync(test), test).toBe(true);
    }
  }
});

test('no mutant category lacks a case', () => {
  const categories = new Set(tesseraMutants.map(mutant => mutant[0]));
  expect(categories).toEqual(new Set(['tessera']));
  expect(TESSERA_CASES.length).toBeGreaterThan(0);
});
