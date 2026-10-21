// Tests the generated UBL example and its schema-derived relationships.
import { test, expect } from 'bun:test';
import { inspect } from '../src/model';
import { graphView } from '../src/graph-view';
test('UBL model derives 45 business entities and 277 roles from XSD references', async () => {
  const map = await Bun.file('public/examples/ubl/model-map.json').json();
  const model = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  expect(model.entities).toHaveLength(45);
  expect(model.edges).toHaveLength(277);
  const names = new Set(model.entities.map(e => e.name));
  for (const e of map.entities) {
    expect(e.source.startsWith('https://docs.oasis-open.org/ubl/')).toBe(true);
    for (const r of e.relationships) {
      expect(names.has(r.target)).toBe(true);
      expect(r.ref).toBe('cac:' + r.name);
    }
  }
});
test('UBL ODCS and semantic schema validation; bridge-table joins refer to actual columns', async () => {
  const contract = inspect(await Bun.file('public/examples/ubl/ubl.odcs.yaml').text());
  const semantic = inspect(await Bun.file('public/examples/ubl/ubl.semantic.yaml').text());
  expect(contract.entities).toHaveLength(169);
  expect(semantic.entities.filter(e => e.kind === 'Dataset')).toHaveLength(169);
  const byName = new Map(semantic.entities.map(e => [e.name, e]));
  for (const edge of semantic.edges.filter(e => e.data.kind === 'Dataset relationship')) {
    const def = edge.data.definition;
    expect(
      def.from_columns.every((col: string) => byName.get(def.from)?.fields.includes(col)),
    ).toBe(true);
    expect(def.to_columns.every((col: string) => byName.get(def.to)?.fields.includes(col))).toBe(
      true,
    );
  }
  for (const table of contract.entities) {
    expect(byName.get(table.name)?.definition.source).toBe(table.definition.physicalName);
  }
});
test('UBL OWL and SHACL imports remain bounded in default graph', async () => {
  for (const f of ['ubl.owl.ttl', 'ubl.shacl.ttl']) {
    const model = inspect(await Bun.file('public/examples/ubl/' + f).text(), f);
    expect(model.entities.length).toBeGreaterThan(30);
    expect(graphView(model.entities, model.edges, '').entities.length).toBeLessThanOrEqual(16);
  }
});
