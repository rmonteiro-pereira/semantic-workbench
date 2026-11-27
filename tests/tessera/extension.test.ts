// Proves a new addition and a new Ossie base are table entries: a throwaway registry and base are validated, compiled and refused without any change to the marker, validator or report code.
import { expect, test } from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import ossieSemanticSchema from '../../schemas/ossie-0.2.0.dev0.json';
import { SUPPORTED_BASES, baseLabel, registerBase, type SupportedBase } from '../../src/shared/tessera/bases';
import { compileDocument } from '../../src/shared/tessera/compile-document';
import { REGISTRY, createRegistry, type AdditionEntry, type Disposition } from '../../src/shared/tessera/registry';
import { RESERVED_NAMES } from '../../src/shared/tessera/reserved-names';
import { deriveTesseraSchema } from '../../src/shared/tessera/schema-derivation';
import { tesseraIssues } from '../../src/shared/tessera/validate';
import colliding from '../fixtures/ossie-next-base/colliding-ontology.json';
import synthetic from '../fixtures/ossie-next-base/synthetic-ontology.json';

const SEMANTIC_SCHEMA_ID = 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json';

function addition(disposition: Disposition): AdditionEntry {
  return { name: 'tessera_stewards', since: 2, places: ['concept'], value: { description: 'a non-empty string', schema: { type: 'string', minLength: 1 } }, disposition, owner: 'a later feature' };
}

const registryWith = (disposition: Disposition) => createRegistry([...REGISTRY.additions, addition(disposition)], RESERVED_NAMES);

function compiledValidator(schema: object) {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  ajv.addSchema(ossieSemanticSchema, SEMANTIC_SCHEMA_ID);
  return ajv.compile(schema);
}

function baseWithRevisions(registry: ReturnType<typeof registryWith>): SupportedBase {
  const shipped = SUPPORTED_BASES[0];
  return { ...shipped, validators: { 1: shipped.validators[1], 2: compiledValidator(deriveTesseraSchema(shipped, registry, 2)) } };
}

const document = (revision: number) => ({
  tessera: revision,
  version: '0.2.0.dev0',
  name: 'Retail',
  ontology: [{ concept: 'Order', type: 'EntityType', tessera_stewards: 'finance' }],
});

test('an addition from revision 2 used by a revision 1 document gives the revision finding', () => {
  const registry = registryWith('drop');
  const result = tesseraIssues(document(1), { registry, bases: [baseWithRevisions(registry)], revisions: [1, 2] });
  expect(result.issues.map(issue => `${issue.code} ${issue.path}`)).toEqual(['tessera-revision /ontology/0/tessera_stewards']);
});

test('the same document at revision 2 validates and compiles, reporting a loss for a dropped addition', () => {
  const registry = registryWith('drop');
  const options = { registry, bases: [baseWithRevisions(registry)], revisions: [1, 2] };
  expect(tesseraIssues(document(2), options)).toMatchObject({ issues: [], format: { family: 'tessera', revision: 2 } });
  const compiled = compileDocument({ path: 'retail.ontology.json', source: JSON.stringify(document(2)) }, registry);
  expect(compiled.ok && compiled.losses.map(loss => loss.property)).toEqual(['tessera_stewards']);
  expect(compiled.ok && compiled.text).not.toContain('tessera');
});

test('the same document at revision 2 fails the compile when the addition must be refused', () => {
  const registry = registryWith('refuse');
  const compiled = compileDocument({ path: 'retail.ontology.json', source: JSON.stringify(document(2)) }, registry);
  expect(compiled.ok).toBe(false);
  expect(!compiled.ok && compiled.failures.map(failure => failure.code)).toEqual(['translation']);
});

test('a registered second base validates with its own derived schema and labels its output with its own name', () => {
  const next: SupportedBase = { version: '0.4.0.dev0', name: 'Ossie 0.4.0 draft', label: baseLabel('0.4.0.dev0', true), draft: true, ontologySchema: synthetic, validators: {} };
  next.validators[1] = compiledValidator(deriveTesseraSchema(next, REGISTRY, 1));
  const bases = registerBase(SUPPORTED_BASES, next);
  const data = { tessera: 1, version: '0.4.0.dev0', name: 'Retail', ontology: [{ concept: 'Order', type: 'EntityType', tessera_notes: 'a note' }] };
  const result = tesseraIssues(data, { bases });
  expect(result.issues).toEqual([]);
  expect(result.format).toMatchObject({ base: '0.4.0.dev0', baseLabel: 'valid against the bundled Ossie 0.4.0.dev0 draft' });
  expect(tesseraIssues({ ...data, version: '0.2.0.dev0' }, { bases }).issues).toEqual([]);
});

test('a base whose schema already defines a Tessera property is refused', () => {
  expect(() => registerBase(SUPPORTED_BASES, { version: '0.4.0.dev0', name: 'x', label: 'x', draft: true, ontologySchema: colliding, validators: {} })).toThrow('tessera_flag');
});

test('this file uses the marker, validator and report code only through their public functions', () => {
  const source = readFileSync(import.meta.path, 'utf8');
  const importsOf = (module: string) => [...source.matchAll(new RegExp(`import \\{([^}]*)\\} from '[^']*/${module}'`, 'g'))].flatMap(match => match[1].split(',').map(name => name.trim()));
  expect(source).not.toMatch(/from '[^']*\/marker'/);
  expect(source).not.toMatch(/from '[^']*\/loss-report'/);
  expect(importsOf('validate')).toEqual(['tesseraIssues']);
});
