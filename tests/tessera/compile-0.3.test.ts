// Checks compiling on the Ossie 0.3 draft base: output keeps the declared version and the annotations, the report names the draft base, and a unit mixing versions is refused.
import { beforeAll, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { compileUnit, type UnitFile } from '../../src/shared/tessera/compile-unit';
import { loadDraftValidators } from '../../src/shared/validation/draft-validators';
import { validateInput } from '../../src/shared/validation/input';

const FIXTURES = join(import.meta.dir, '../fixtures/ossie-0.3');
const GOLDEN = join(FIXTURES, 'compile-golden');
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const unitFile = (path: string, folder = FIXTURES): UnitFile => ({ path, bytes: encoder.encode(readFileSync(join(folder, path), 'utf8')) });
const draftUnit = ['retail.tessera.yaml', 'sales.mapping.yaml', 'sales.ontology.yaml', 'sales.semantic.yaml'].map(path => unitFile(path));

beforeAll(async () => {
  await loadDraftValidators();
});

test('a 0.3 unit compiles against the draft base, keeps the declared version and the annotations, and drops the notes', () => {
  const result = compileUnit(draftUnit, { lossPolicySha256: null });
  expect(result.failures).toEqual([]);
  expect(result.report.base).toEqual({ version: '0.3.0.dev0', label: 'valid against the bundled Ossie 0.3.0 draft' });
  const ontology = result.outputs.find(output => output.path === 'retail.tessera.yaml')!;
  const text = decoder.decode(ontology.bytes);
  expect(text).not.toContain('tessera');
  expect(parse(text)).toMatchObject({
    version: '0.3.0.dev0',
    annotations: { imported_from: 'owl' },
    ontology: [{ concept: 'Order', annotations: { owl_class: 'ex:Order' } }, { concept: 'Customer' }],
  });
  expect(validateInput(text, 'retail.ontology.yaml').issues.filter(issue => issue.severity === 'error')).toEqual([]);
  expect(result.report.losses.map(loss => loss.pointer).sort()).toEqual(['/ontology/0/tessera_notes', '/tessera_notes']);
});

test('the released files and the loss report equal the recorded golden files', () => {
  const result = compileUnit(draftUnit, { lossPolicySha256: null });
  const actual = new Map([...result.outputs.map(output => [output.path, decoder.decode(output.bytes)] as const), ['loss-report.json', JSON.stringify(result.report, null, 2) + '\n']]);
  if (process.env.UPDATE_GOLDEN === '1') {
    rmSync(GOLDEN, { recursive: true, force: true });
    mkdirSync(GOLDEN, { recursive: true });
    for (const [path, text] of actual) writeFileSync(join(GOLDEN, path), text);
  }
  const golden = new Map(readdirSync(GOLDEN).map(path => [path, readFileSync(join(GOLDEN, path), 'utf8')] as const));
  expect([...actual.keys()].sort()).toEqual([...golden.keys()].sort());
  for (const [path, text] of actual) expect({ path, text }).toEqual({ path, text: golden.get(path)! });
});

test('a unit whose documents declare 0.2 and 0.3 is refused with each file and its version named', () => {
  const old = unitFile('billing.semantic.yaml', join(import.meta.dir, '../../public/examples/billing'));
  const result = compileUnit([...draftUnit, old], { lossPolicySha256: null });
  const mixed = result.failures.filter(failure => failure.message.includes('different Ossie versions'));
  expect(mixed.map(failure => failure.document)).toContain('billing.semantic.yaml');
  expect(mixed.map(failure => failure.document)).toContain('retail.tessera.yaml');
  expect(mixed[0].message).toContain('billing.semantic.yaml (0.2.0.dev0)');
  expect(result.outputs).toEqual([]);
});

test('a unit of 0.2 documents only is still reported against the 0.2 base', () => {
  const old = unitFile('billing.semantic.yaml', join(import.meta.dir, '../../public/examples/billing'));
  expect(compileUnit([old], { lossPolicySha256: null }).report.base.version).toBe('0.2.0.dev0');
});
