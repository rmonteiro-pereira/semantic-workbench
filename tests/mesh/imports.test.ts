/** Checks import declarations and uses without consulting private provider names. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { checkImports, type ProviderInterface } from '../../src/shared/tessera/imports';
import { readUnitStructure, type OntologyUnit } from '../../src/shared/tessera/unit-structure';

function fixture(name: string) {
  const sample = JSON.parse(readFileSync(`tests/fixtures/tessera/mesh/refusals/${name}.json`, 'utf8'));
  const { units } = readUnitStructure(sample.files.map((file: { path: string; source: string }) => ({ path: file.path, data: JSON.parse(file.source) })));
  return { unit: units[0], code: sample.code as string };
}

for (const name of ['alias-twice', 'provider-twice', 'empty-allow', 'repeated-allow', 'unlisted-use']) {
  test(`reports ${name} once with the source file`, () => {
    const { unit, code } = fixture(name);
    expect(checkImports(unit).findings).toMatchObject([{ code, files: ['ontology.yaml'] }]);
  });
}

const provider: ProviderInterface = { project: 'finance', ontology: 'ontology.yaml', exports: new Set(['Currency']) };

test('private and missing concepts produce identical findings from the same public interface', () => {
  const { unit, code } = fixture('unexported');
  const noInvoice = checkImports(unit, [provider]).findings;
  expect(noInvoice).toMatchObject([{ code, files: ['ontology.yaml'] }]);
  expect(checkImports(unit, [{ ...provider, exports: new Set() }]).findings).toEqual(noInvoice);
});

function consumer(alias: string): OntologyUnit {
  return {
    root: {
      path: 'ontology.yaml',
      data: {
        ontology: [],
        tessera_imports: [{ project: 'finance', alias, concepts: ['Currency'] }],
      },
    },
    parts: [
      {
        path: 'part.yaml',
        data: {
          ontology: [
            {
              concept: 'Total',
              extends: [`${alias}.Currency`],
              identify_by: [`${alias}.Currency.code`],
              requires: [`${alias}.Currency.code <> 'unrelated.Foreign'`],
              relationships: [{ roles: [{ concept: `${alias}.Currency` }] }],
            },
          ],
        },
      },
    ],
  };
}

test('each unit may choose its own alias for the same provider', () => {
  for (const alias of ['fin', 'billing']) {
    const { aliases, findings } = checkImports(consumer(alias), [provider]);
    expect(findings).toEqual([]);
    expect(aliases.get(alias)).toMatchObject({ project: 'finance', version: 'latest' });
  }
});
