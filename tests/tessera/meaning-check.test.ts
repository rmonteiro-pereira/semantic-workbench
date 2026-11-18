// Checks the meaning check passes for clean compiler output and fails for each kind of injected fault.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileDocument } from '../../src/shared/tessera/compile-document';
import { documentMeaningFailures, unitMeaningFailures } from '../../src/shared/tessera/meaning-check';
import { REGISTRY } from '../../src/shared/tessera/registry';
import { COMMITTED_FILES, PROJECT_FOLDER } from '../helpers/tessera-repository';

const path = 'retail.ontology.yaml';
const source = readFileSync(join(import.meta.dir, '../fixtures/tessera/documents/notes-everywhere.yaml'), 'utf8');
const compiled = compileDocument({ path, source }, REGISTRY);
if (!compiled.ok) throw new Error('The fixture must compile.');
const clean = { path, source: compiled.text };

test('clean compiler output passes the document check', () => {
  expect(documentMeaningFailures({ path, source }, clean)).toEqual([]);
});

test('a changed value fails the document check', () => {
  const changed = compiled.text.replace('A customer order.', 'A customer purchase.');
  const failures = documentMeaningFailures({ path, source }, { path, source: changed });
  expect(failures.map(failure => failure.code)).toEqual(['meaning']);
});

test('a dropped concept fails the document check', () => {
  const text = compiled.text.slice(0, compiled.text.indexOf('  - concept: Customer'));
  const failures = documentMeaningFailures({ path, source }, { path, source: text });
  expect(failures.length).toBeGreaterThan(0);
  expect(failures.every(failure => failure.code === 'meaning')).toBe(true);
});

const sourceSet = Object.entries(COMMITTED_FILES)
  .filter(([name]) => name.startsWith(PROJECT_FOLDER))
  .map(([name, text]) => ({ path: name, source: text }));

test('an unchanged set of documents passes the set check', () => {
  expect(unitMeaningFailures(sourceSet, sourceSet)).toEqual([]);
});

test('a renamed document fails the set check because its name now points elsewhere', () => {
  const renamed = sourceSet.map(file => (file.path.endsWith('ontology.yaml') ? { ...file, path: file.path.replace('ontology.yaml', 'renamed.yaml') } : file));
  expect(unitMeaningFailures(sourceSet, renamed).map(failure => failure.code)).toEqual(['meaning']);
});

test('a changed mapping fails the set check', () => {
  const changed = sourceSet.map(file => (file.path.endsWith('mapping.yaml') ? { ...file, source: file.source + '# edited\n' } : file));
  const failures = unitMeaningFailures(sourceSet, changed);
  expect(failures.map(failure => failure.document)).toEqual([`${PROJECT_FOLDER}/mapping.yaml`]);
});
