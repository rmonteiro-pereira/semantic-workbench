/** Checks resolved imports in model validation, graph inspection and alias editing. */
import { expect, test } from 'bun:test';
import { renameUnitAlias, type ProjectDoc } from '../../src/app/edit/references';
import { inspectOntologyUnit, isStructuredEntity } from '../../src/shared/core/model';
import { formatAddress } from '../../src/shared/core/item-address';
import type { ResolvedImportInterface } from '../../src/shared/tessera/imports';
import type { OntologyUnit } from '../../src/shared/tessera/unit-structure';
import { validateInput } from '../../src/shared/validation/input';

const commit = 'a'.repeat(40);
const provider: ResolvedImportInterface = {
  project: 'finance',
  ontology: 'ontology.yaml',
  scope: 'Finance',
  version: commit,
  exports: new Set(['Invoice', 'Currency']),
  concepts: new Map([
    ['Invoice', { concept: 'Invoice', type: 'EntityType' }],
    ['Currency', { concept: 'Currency', type: 'ValueType' }],
  ]),
};

function consumer(alias: string, name = 'Invoice'): OntologyUnit {
  const data = {
    tessera: 3,
    version: '0.2.0.dev0',
    name: 'Retail',
    ontology: [{ concept: 'Purchase', type: 'EntityType', extends: [`${alias}.${name}`] }],
    tessera_imports: [{ project: 'finance', alias, concepts: ['Invoice', 'Currency'] }],
  };
  return { root: { path: 'ontology.yaml', data }, parts: [] };
}

test('the graph connects to the same read-only provider address through different aliases', () => {
  const addresses: string[] = [];
  for (const alias of ['fin', 'billing']) {
    const unit = consumer(alias);
    const checked = validateInput(JSON.stringify(unit.root.data), unit.root.path, { providerInterfaces: [provider] });
    expect(checked.valid).toBe(true);
    const graph = inspectOntologyUnit(unit, 'retail', [provider]);
    const invoice = graph.entities.filter(isStructuredEntity).find(entity => entity.name === `${alias}.Invoice`)!;
    expect(invoice).toMatchObject({ readOnlyForm: true, imported: { project: 'finance', alias, concept: 'Invoice', version: commit } });
    expect(graph.edges.some(edge => edge.target === invoice.id && edge.label === 'extends')).toBe(true);
    addresses.push(formatAddress(invoice.address));
  }
  expect(new Set(addresses)).toEqual(new Set([`sw1:finance/ontology.yaml#ontology:Finance/concept:Invoice@${commit}`]));
});

test('validation refuses unlisted uses, private exports, duplicate aliases and atomic pins', () => {
  const root = consumer('fin', 'Ledger').root;
  const issues = validateInput(JSON.stringify(root.data), root.path, { providerInterfaces: [provider] }).issues;
  expect(issues).toMatchObject([{ code: 'tessera-import-use', path: '/ontology/0/extends/0' }]);
  const data = structuredClone(root.data) as { tessera_imports: { project: string; alias: string; concepts: string[]; version?: { pin: string } }[] };
  data.tessera_imports[0].concepts.push('Ledger');
  const listed = validateInput(JSON.stringify(data), root.path, { providerInterfaces: [provider] });
  expect(listed.issues).toMatchObject([{ code: 'tessera-import-unexported' }]);
  data.tessera_imports.push({ ...data.tessera_imports[0], project: 'units' });
  expect(validateInput(JSON.stringify(data), root.path, { providerInterfaces: [provider] }).issues.map(issue => issue.code)).toContain('tessera-import-alias');
  data.tessera_imports.splice(1);
  data.tessera_imports[0].version = { pin: commit };
  expect(validateInput(JSON.stringify(data), root.path, { providerInterfaces: [{ ...provider, sameRepository: true }] }).issues.map(issue => issue.code)).toContain('tessera-import-pin');
});

test('alias renaming preserves the unrelated text and edits only the declared files', () => {
  function document(path: string, data: unknown): ProjectDoc {
    return { id: path, path, filename: path, source: JSON.stringify(data, null, 2) };
  }
  const input = consumer('fin').root.data as Record<string, unknown>;
  const root = document('ontology.json', { ...input, tessera_includes: ['part.json'] });
  const definition = { concept: 'Return', extends: ['fin.Invoice'], description: 'fin.Invoice is an example', requires: ["fin.Invoice.code <> 'fin.Invoice.code'"] };
  const part = document('part.json', { tessera: 3, tessera_part: true, ontology: [definition] });
  const unrelated = document('other.json', { ontology: [definition] });
  const writes = renameUnitAlias(root, [root, part, unrelated], 'fin', 'billing');
  expect(writes.map(write => write.docId)).toEqual([root.id, part.id]);
  const after = JSON.parse(writes[1].source).ontology[0];
  expect(after.extends).toEqual(['billing.Invoice']);
  expect(after.description).toBe(definition.description);
  expect(after.requires[0]).toContain('"billing"."Invoice".code');
  expect(after.requires[0]).toContain("'fin.Invoice.code'");
});
