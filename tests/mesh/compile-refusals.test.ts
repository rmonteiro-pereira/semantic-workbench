import { expect, test } from 'bun:test';
import { compileUnit } from '../../src/shared/tessera/compile-unit';
import { qualifiedConcept } from '../../src/shared/tessera/qualify';
import { decideAcceptance } from '../../src/server/tessera/accept-loss';
import type { ResolvedImportInterface } from '../../src/shared/tessera/imports';

const version = '0.2.0.dev0';
const target = { project: 'finance', ontology: 'root.json', concept: 'Invoice' };
const provider: ResolvedImportInterface = {
  ...target,
  version: 'a'.repeat(40),
  scope: version,
  exports: new Set(['Invoice']),
  concepts: new Map([['Invoice', { concept: 'Invoice', type: 'EntityType' }]]),
};

function compile(resolved: ResolvedImportInterface, name = 'Order', other?: ResolvedImportInterface) {
  const file = {
    path: 'root.json',
    bytes: new TextEncoder().encode(
      JSON.stringify({
        tessera: 3,
        version,
        name: 'Retail',
        tessera_imports: [{ project: target.project, alias: 'finance', concepts: ['Invoice'] }],
        ontology: [{ concept: name, type: 'EntityType', extends: ['finance.Invoice'] }],
      }),
    ),
  };
  const providers = new Map([[file.path, [resolved]]]);
  if (other) providers.set('other.json', [other]);
  return compileUnit([file], { lossPolicySha256: null, providers });
}

test('a private dependency inside a provider is an absolute refusal', () => {
  const concepts = new Map([['Invoice', { concept: 'Invoice', type: 'EntityType', extends: ['Private'] }]]);
  const result = compile({ ...provider, concepts });
  expect(result.outputs).toEqual([]);
  expect(result.failures[0]?.message ?? '').toContain('lacks required concept "Private"');
  expect(decideAcceptance(result.report, result.failures, { digest: result.report.digest }).decision).toBe('refused');
});

test('a different provider base and a qualified local collision cannot release output', () => {
  const baseConflict = compile({ ...provider, scope: 'another-base' });
  expect(baseConflict.failures[0]?.message ?? '').toContain('different Ossie base');
  expect(baseConflict.outputs).toEqual([]);
  const collision = compile(provider, qualifiedConcept(target));
  expect(collision.failures[0]?.message ?? '').toContain('collides with imported name');
  expect(collision.outputs).toEqual([]);
});

test('incompatible versions selected by different roots refuse the complete bundle', () => {
  const other = 'b'.repeat(40);
  const result = compile(provider, 'Order', { ...provider, version: other });
  expect(result.failures[0]?.message ?? '').toContain(`"${provider.version}"`);
  expect(result.failures[0]?.message ?? '').toContain(`"${other}"`);
  expect(decideAcceptance(result.report, result.failures, { digest: result.report.digest }).decision).toBe('refused');
});

test('a provider addition with no translation cannot be erased silently', () => {
  const concepts = new Map([['Invoice', { concept: 'Invoice', type: 'EntityType', tessera_includes: ['part.json'] }]]);
  const result = compile({ ...provider, concepts });
  expect(result.outputs).toEqual([]);
  expect(result.failures[0]?.message ?? '').toContain('tessera_includes');
  expect(decideAcceptance(result.report, result.failures, { digest: result.report.digest }).decision).toBe('refused');
});
