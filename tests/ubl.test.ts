// Tests the generated UBL example, its schema-derived relationships and the example mappings.
import { test, expect } from 'bun:test';
import { inspect } from '../src/shared/core/model';
import { graphView } from '../src/app/graph/graph-view';
import { parse } from 'yaml';
import { buildContext } from '../src/server/agent/runtime';
import { validateStructured } from '../src/shared/validation/validation';
test('UBL model derives 45 business entities and 277 roles from XSD references', async () => {
  const map = await Bun.file('public/examples/ubl/model-map.json').json();
  const model = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  expect(model.entities).toHaveLength(45);
  expect(model.edges).toHaveLength(277);
  const names = new Set(model.entities.map(e => e.name));
  for (const entity of map.entities) {
    expect(entity.source.startsWith('https://docs.oasis-open.org/ubl/')).toBe(true);
    for (const relationship of entity.relationships) {
      expect(names.has(relationship.target)).toBe(true);
      expect(relationship.ref).toBe('cac:' + relationship.name);
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
    expect(def.from_columns.every((col: string) => byName.get(def.from)?.fields.includes(col))).toBe(true);
    expect(def.to_columns.every((col: string) => byName.get(def.to)?.fields.includes(col))).toBe(true);
  }
  for (const table of contract.entities) {
    expect(byName.get(table.name)?.definition.source).toBe(table.definition.physicalName);
  }
});
test('UBL OWL and SHACL imports remain bounded in default graph', async () => {
  for (const fileName of ['ubl.owl.ttl', 'ubl.shacl.ttl']) {
    const model = inspect(await Bun.file('public/examples/ubl/' + fileName).text(), fileName);
    expect(model.entities.length).toBeGreaterThan(30);
    expect(graphView(model.entities, model.edges, '').entities.length).toBeLessThanOrEqual(16);
  }
});

/** Reads shipped example files as the stored documents of one project. */
async function exampleProject(project: string, filenames: string[]) {
  return Promise.all(
    filenames.map(async (filename, index) => ({
      id: `${project}/${filename}`,
      filename,
      project,
      revision: index + 1,
      source: await Bun.file(`public/examples/${project}/${filename}`).text(),
    })),
  );
}

test('the UBL ontology declares its Ossie version, so it gets full schema checks', async () => {
  const ontology = parse(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  expect(validateStructured(ontology)).toEqual([]);
});

test('the UBL mapping maps every component and role to its dataset, key or bridge', async () => {
  const documents = await exampleProject('ubl', ['ubl.ontology.yaml', 'ubl.semantic.yaml', 'ubl.semantic-mapping.yaml']);
  const context = buildContext(documents, 'ubl/ubl.semantic-mapping.yaml');
  expect(context.findings).toEqual([]);
  const mapped = new Set(context.bindings.map(binding => binding.rootConcept));
  expect(mapped.size).toBe(45);
  // Each link also binds its subject, with no relationship; only the role targets count here.
  const links = context.bindings.filter(binding => binding.relationships.length > 0);
  const roles = new Set(links.map(link => `${link.rootConcept}.${link.relationships.join('.')}`));
  expect(roles.size).toBe(277);
});

test('the commerce sales mapping maps each concept that has a sales table', async () => {
  const documents = await exampleProject('commerce', ['commerce-business.ossie.yaml', 'sales.ossie.yaml', 'sales.mapping.yaml']);
  const context = buildContext(documents, 'commerce/sales.mapping.yaml');
  expect(context.findings).toEqual([]);
  const mapped = [...new Set(context.bindings.map(binding => binding.rootConcept))].sort();
  expect(mapped).toEqual(['Customer', 'Order', 'OrderLine', 'Product']);
});
