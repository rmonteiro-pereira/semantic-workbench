/** Verifies the agent catalog reads complete, authorized published ontologies as units. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildContext, type StoredDocument } from '../../src/server/agent/context';
import { parseDocuments, targets } from '../../src/server/agent/context-documents';

function document(filename: string, source: string): StoredDocument {
  return { id: `retail/${filename}`, project: 'retail', filename, revision: 1, source };
}

function ontology(folder: string, paths: string[]) {
  return paths.map(path => document(path, readFileSync(`tests/fixtures/tessera/mesh/units/${folder}/${path}`, 'utf8')));
}

const mapping = document(
  'mapping.yaml',
  JSON.stringify({
    version: '0.2.0.dev0',
    name: 'Retail mapping',
    ontology_ref: { name: 'Retail' },
    semantic_model_ref: { name: 'Retail data' },
    concept_mappings: [],
  }),
);
const semantic = document('semantic.yaml', JSON.stringify({ version: '0.2.0.dev0', name: 'Retail data', datasets: [{ name: 'sales', source: 'sales', fields: [] }] }));
const split = ontology('three-parts', ['ontology.yaml', 'orders.yaml', 'returns.yaml', 'customers.json']);
const single = ontology('one-file-twin', ['ontology.yaml']);

test('agent context is identical for a complete split ontology and its single-file twin', () => {
  const separate = buildContext([...split, mapping, semantic], mapping.id);
  const together = buildContext([...single, mapping, semantic], mapping.id);
  expect(separate.concepts.slice(0, 4).map(concept => concept.concept)).toEqual(['Shop', 'Order', 'Return', 'Customer']);
  expect(separate).toEqual(together);
  const parsed = targets(parseDocuments(split), 'ontology');
  expect(parsed.map(target => target.doc.filename)).toEqual(['ontology.yaml']);
  expect(JSON.stringify(parsed[0].data)).not.toMatch(/tessera_(part|includes)/);
});

test('incomplete units have no ontology target and a provider draft is never a substitute', () => {
  expect(targets(parseDocuments(split.slice(0, -1)), 'ontology')).toEqual([]);
  const root = JSON.parse(single[0].source);
  root.tessera_imports = [{ project: 'finance', alias: 'fin', concepts: ['Invoice'] }];
  const imported = { ...single[0], source: JSON.stringify(root) };
  expect(targets(parseDocuments([imported]), 'ontology')).toEqual([]);
});
