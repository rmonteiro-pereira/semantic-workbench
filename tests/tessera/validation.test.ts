// Runs every Tessera fixture document through the Tessera findings and checks the code and path of each, with one finding per mistake.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { EXPECTED_FINDINGS } from '../helpers/tessera-refusals';
import { tesseraIssues } from '../../src/shared/tessera/validate';
import { validateInput } from '../../src/shared/validation/input';
import { isNotValidated } from '../../src/shared/validation/validation';

const folder = join(import.meta.dir, '../fixtures/tessera/documents');

function load(name: string): unknown {
  const text = readFileSync(join(folder, name), 'utf8');
  return name.endsWith('.json') ? JSON.parse(text) : parse(text);
}

function findings(name: string): string[] {
  return tesseraIssues(load(name)).issues.map(issue => `${issue.code} ${issue.path}`);
}

for (const [name, expected] of Object.entries(EXPECTED_FINDINGS)) {
  test(`${name} gives ${expected.length ? expected.join(' and ') : 'no finding'}`, () => {
    expect(findings(name)).toEqual(expected);
  });
}

test('a valid Tessera document is described as Tessera revision 1 on the draft base', () => {
  const result = tesseraIssues(load('notes-everywhere.yaml'));
  expect(result.format).toEqual({ family: 'tessera', revision: 1, base: '0.2.0.dev0', baseLabel: 'valid against the bundled Ossie 0.2.0.dev0 draft' });
});

test('a document without the marker is standard and gets no finding', () => {
  expect(tesseraIssues(load('lookalike-unmarked.yaml'))).toEqual({ issues: [], format: { family: 'standard' } });
});

test('a refused document has no format', () => {
  expect(tesseraIssues(load('revision-2.yaml')).format).toBeNull();
});

test('messages name the property, say what is allowed and list the supported revisions', () => {
  expect(tesseraIssues(load('revision-2.yaml')).issues[0].message).toContain('Supported revisions: 1');
  expect(tesseraIssues(load('marker-string.yaml')).issues[0].message).toContain('Supported revisions: 1');
  expect(tesseraIssues(load('unknown-property.yaml')).issues[0].message).toContain('tessera_note is not');
  expect(tesseraIssues(load('unknown-property.yaml')).issues[0].message).toContain('Registered properties: tessera_notes');
  expect(tesseraIssues(load('reserved-governance.yaml')).issues[0].message).toContain('reserved');
  expect(tesseraIssues(load('notes-on-dataset.yaml')).issues[1].message).toContain('allowed on: the ontology root, a concept, a relationship of a concept');
});

test('a prefixed key in the prefix map is ordinary data', () => {
  const document = { tessera: 1, version: '0.2.0.dev0', name: 'Retail', prefixes: { tessera_x: 'http://example.com/x#' }, ontology: [{ concept: 'Order', type: 'EntityType' }] };
  expect(tesseraIssues(document).issues).toEqual([]);
});

const STANDARD_ONLY = ['lookalike-unmarked.yaml'];

for (const [name, expected] of Object.entries(EXPECTED_FINDINGS)) {
  test(`${name} gives the same errors through the editor path`, () => {
    const text = readFileSync(join(folder, name), 'utf8');
    const result = validateInput(text, name);
    const errors = result.issues.filter(issue => issue.severity === 'error').map(issue => `${issue.code} ${issue.path}`);
    const wanted = STANDARD_ONLY.includes(name) ? ['schema /ontology/0/tessera_notes'] : expected;
    expect(errors).toEqual(wanted);
    expect(result.issues.some(issue => isNotValidated(issue))).toBe(false);
    expect(validateInput(text, name, { assumeOssieVersion: true }).issues.map(issue => issue.code)).toEqual(result.issues.map(issue => issue.code));
  });
}
