import { expect, test } from 'bun:test';
import { compileMeshRoot } from '../../src/shared/tessera/compile-mesh';
import { buildManifest } from '../../src/shared/tessera/manifest';
import { compileDocument } from '../../src/shared/tessera/compile-document';
import { compileUnit, type UnitFile } from '../../src/shared/tessera/compile-unit';
import type { ResolvedImportInterface } from '../../src/shared/tessera/imports';

const base = '0.2.0.dev0';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function definition(path: string, data: object): UnitFile {
  return { path, bytes: encoder.encode(JSON.stringify(data)) };
}

const invoice = { concept: 'Invoice', type: 'EntityType', extends: ['Record'] };
const record = { concept: 'Record', type: 'EntityType' };
const provider: ResolvedImportInterface = {
  project: 'finance',
  ontology: 'finance.yaml',
  exports: new Set(['Invoice', 'Record']),
  scope: base,
  ontologyName: 'Finance',
  interfaceHash: 'sha256:' + 'c'.repeat(64),
  version: 'a'.repeat(40),
  concepts: new Map([
    ['Invoice', invoice],
    ['Record', record],
  ]),
};
const root = {
  version: base,
  tessera: 3,
  name: 'Retail',
  tessera_includes: ['part.json'],
  tessera_imports: [{ alias: 'fin', project: 'finance', concepts: ['Invoice'] }],
  tessera_exports: ['Customer'],
  ontology: [{ concept: 'Order', type: 'EntityType', extends: ['fin.Invoice'] }],
};
const part = { tessera: 3, tessera_part: true, ontology: [{ concept: 'Customer', type: 'EntityType' }] };

test('compiles declared parts and provider prerequisites into one regular Ossie ontology', () => {
  const files = [definition('root.json', root), definition('part.json', part)];
  const result = compileUnit(files, { lossPolicySha256: null, providers: new Map([['root.json', [provider]]]), project: 'retail' });
  expect(result.failures).toEqual([]);
  expect(result.outputs.map(output => output.path)).toEqual(['root.json']);
  const compiled = JSON.parse(decoder.decode(result.outputs[0].bytes));
  expect(compiled).toEqual({
    version: base,
    name: 'Retail',
    ontology: [
      { concept: 'Order', type: 'EntityType', extends: ['finance~finance%2Eyaml~Invoice'] },
      { concept: 'Customer', type: 'EntityType' },
      { concept: 'finance~finance%2Eyaml~Invoice', type: 'EntityType', extends: ['finance~finance%2Eyaml~Record'] },
      { concept: 'finance~finance%2Eyaml~Record', type: 'EntityType' },
    ],
  });
  expect(result.report.inputs).toMatchObject([
    { path: 'part.json', treatment: 'compiled' },
    { path: 'root.json', treatment: 'compiled' },
  ]);
  expect(result.report.losses).toMatchObject([{ document: 'root.json', property: 'tessera_exports' }]);
});

test('a folder without a published provider interface refuses compilation', () => {
  const result = compileUnit([definition('root.json', root), definition('part.json', part)], { lossPolicySha256: null });
  expect(result.outputs).toEqual([]);
  expect(result.failures).toMatchObject([{ code: 'translation', message: expect.stringContaining('locked public interface') }]);
});

test('the bundle gives the compiled addresses of both part and imported concepts', () => {
  const result = compileUnit([definition('root.json', root), definition('part.json', part)], {
    lossPolicySha256: null,
    project: 'retail',
    providers: new Map([['root.json', [provider]]]),
  });
  const manifest = buildManifest(result, { kind: 'snapshot' }, 'none');
  expect(manifest).toMatchObject({
    manifestVersion: 2,
    units: [{ root: 'root.json', parts: ['part.json'] }],
    providers: [{ project: 'finance', commit: provider.version, interfaceHash: provider.interfaceHash }],
    addressMap: expect.arrayContaining([
      { from: 'sw1:retail/part.json#ontology:Retail/concept:Customer', to: 'sw1:retail/root.json#ontology:Retail/concept:Customer' },
      { from: 'sw1:finance/finance.yaml#ontology:Finance/concept:Invoice', to: 'sw1:retail/root.json#ontology:Retail/concept:finance~finance%252Eyaml~Invoice' },
    ]),
  });
});

test('a compiler that changes part content cannot release a merged ontology', () => {
  const result = compileUnit(
    [definition('root.json', root), definition('part.json', part)],
    {
      lossPolicySha256: null,
      providers: new Map([['root.json', [provider]]]),
    },
    {
      compileDocument: (...args) => {
        const result = compileDocument(...args);
        if (!result.ok || args[0].path !== 'part.json') return result;
        return { ...result, text: result.text.replace('Customer', 'Invented') };
      },
    },
  );
  expect(result.outputs).toEqual([]);
  expect(result.failures).toMatchObject([{ code: 'meaning', document: 'part.json' }]);
});

test('changing one imported concept in the output prevents the bundle from being released', () => {
  const result = compileUnit(
    [definition('root.json', root), definition('part.json', part)],
    { lossPolicySha256: null, providers: new Map([['root.json', [provider]]]) },
    {
      compileDocument,
      compileMeshRoot: (...args) => {
        const output = compileMeshRoot(...args);
        if ('failures' in output) return output;
        const data = JSON.parse(output.text);
        const imported = data.ontology.find((concept: { concept: string }) => concept.concept.endsWith('~Invoice'));
        imported.description = 'Changed meaning in the emitted interface';
        return { ...output, text: JSON.stringify(data) };
      },
    },
  );
  expect(result.outputs).toEqual([]);
  expect(result.failures).toMatchObject([{ code: 'meaning', document: 'root.json' }]);
});
