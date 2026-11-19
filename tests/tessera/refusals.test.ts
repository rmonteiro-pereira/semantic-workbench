// Checks every refusal class gives the same finding through the editor path, the save path, the scanner and the compiler, and never becomes "not validated".
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InputError } from '../../src/shared/validation/diagnostics';
import { validateInput } from '../../src/shared/validation/input';
import { isNotValidated } from '../../src/shared/validation/validation';
import { compileUnit } from '../../src/shared/tessera/compile-unit';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { indexBytes } from '../../src/server/projects/scanner';
import { testWorkspace } from '../helpers/temp-data-dir';
import { EXPECTED_FINDINGS, REFUSED_FILES } from '../helpers/tessera-refusals';

const folder = join(import.meta.dir, '../fixtures/tessera/documents');
const read = (name: string) => readFileSync(join(folder, name), 'utf8');
const errorsOf = (issues: { severity: string; code: string; path: string }[]) => issues.filter(issue => issue.severity === 'error').map(issue => `${issue.code} ${issue.path}`);

for (const name of REFUSED_FILES) {
  const source = read(name);
  const expected = EXPECTED_FINDINGS[name];

  test(`${name}: the editor path reports ${expected.join(' and ')} and never a not-validated notice`, () => {
    const result = validateInput(source, name);
    expect(result.valid).toBe(false);
    expect(errorsOf(result.issues)).toEqual(expected);
    expect(result.issues.some(isNotValidated)).toBe(false);
    expect(errorsOf(validateInput(source, name, { assumeOssieVersion: true }).issues)).toEqual(expected);
  });

  test(`${name}: a save is refused with the same findings and writes nothing`, async () => {
    using workspace = await testWorkspace();
    const { slug } = await workspace.seed([{ path: 'retail.ontology.yaml', source: read('valid.yaml').replace('tessera: 1\n', '') }], 'Retail');
    const before = workspace.ws.readFile(slug, 'retail.ontology.yaml');
    const failure = await workspace.ws.saveFile(slug, 'retail.ontology.yaml', { baseHash: before.hash, source }, LOCAL_READER).catch(error => error);
    expect(failure).toBeInstanceOf(InputError);
    expect(errorsOf((failure as InputError).issues)).toEqual(expected);
    expect(workspace.ws.readFile(slug, 'retail.ontology.yaml').source).toBe(before.source);
  });

  test(`${name}: the scanner marks the file invalid with the same findings`, () => {
    const indexed = indexBytes('retail', name, new TextEncoder().encode(source));
    expect(indexed.file.valid).toBe(false);
    expect(errorsOf(indexed.findings)).toEqual(expected);
  });

  test(`${name}: the compiler refuses the unit as an invalid source`, () => {
    const result = compileUnit([{ path: name, bytes: new TextEncoder().encode(source) }], { lossPolicySha256: null });
    expect(result.outputs).toEqual([]);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures.every(failure => failure.code === 'invalid-source' && failure.document === name)).toBe(true);
    for (const finding of expected) expect(result.failures.some(failure => failure.message.startsWith(finding.split(' ')[1]))).toBe(true);
  });
}

test('a Turtle file that contains the word tessera is read as RDF with no Tessera finding', () => {
  const turtle = '@prefix ex: <http://example.com/> .\nex:tessera a ex:Thing ;\n  ex:tessera_notes "a note" ;\n  ex:label "tessera: 1" .\n';
  const result = validateInput(turtle, 'vocabulary.ttl');
  expect(result.valid).toBe(true);
  expect(result.issues.filter(issue => issue.code.startsWith('tessera'))).toEqual([]);
  expect(result.model?.kind).toBe('RDF');
});

test('a JSON document that declares the marker twice gives the syntax finding', () => {
  const source = '{ "tessera": 1, "tessera": 1, "version": "0.2.0.dev0", "name": "x", "ontology": [{ "concept": "A", "type": "EntityType" }] }';
  const result = validateInput(source, 'twice.json');
  expect(result.valid).toBe(false);
  expect(result.issues.map(issue => issue.code)).toEqual(['syntax']);
});

test('the one registry check for each refusal class is what stops the document', () => {
  const classes = new Set(REFUSED_FILES.flatMap(name => EXPECTED_FINDINGS[name].map(finding => finding.split(' ')[0])));
  for (const code of ['tessera-marker', 'tessera-revision', 'tessera-base', 'tessera-kind', 'tessera-property', 'tessera-reserved', 'tessera-location', 'schema'])
    expect(classes.has(code), code).toBe(true);
});
