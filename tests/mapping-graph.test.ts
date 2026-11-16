// Tests concept mapping graphs derived from resolved bindings.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildContext, agentCatalog, modelContext, type StoredDocument, type RuntimeContext } from '../src/server/agent/runtime';
import { buildMappingGraph, defaultMappingCenter, type MappingGraph } from '../src/app/mappings/mapping-graph';
import { formatAddress } from '../src/shared/core/item-address';
import { aroundHops } from '../src/app/odcs/lineage';
// The concept-mapping graph: built from the resolver's context, so every drawn line is a binding
// the Mappings tab and the agent context also see.
const docs = (folder: string, files: string[]): StoredDocument[] =>
  files.map((file, i) => ({
    id: `p/${file}`,
    filename: file,
    source: readFileSync(`public/examples/${folder}/${file}`, 'utf8'),
    revision: i + 1,
    project: 'p',
  }));
const sets: Record<string, StoredDocument[]> = {
  commerce: docs('commerce', ['commerce.mapping.yaml', 'commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml']),
  flights: docs('ossie', ['flights.ontology.yaml', 'flights.semantic_model.yaml', 'flights.mapping.yaml', 'flights.yaml']),
  billing: docs('billing', ['billing.mapping.yaml', 'billing.ontology.yaml', 'billing.semantic.yaml']),
  mall: docs('mall', ['mall.ontology.yaml', 'mall.semantic.yaml', 'mall.mapping.yaml']),
};
const contexts: [string, RuntimeContext][] = Object.entries(sets).flatMap(([name, d]) => agentCatalog(d).mappings.map(m => [`${name}:${m.id}`, buildContext(d, m.id)] as [string, RuntimeContext]));
function graphKeys(graph: MappingGraph) {
  const cardKey = (kind: string, name: string) => [...graph.cards.values()].find(card => card.kind === kind && card.label === name)!.id;
  const conceptId = (name: string) => cardKey('concept', name);
  const datasetId = (name: string) => cardKey('dataset', name);
  const metricId = (name: string) => cardKey('metric', name);
  const fieldId = (dataset: string, field: string) => graph.cards.get(datasetId(dataset))!.columns.find(column => column.path === field)!.id;
  const relationshipId = (concept: string, relationship: string) => graph.cards.get(conceptId(concept))!.columns.find(column => column.path === relationship)!.id;
  return { conceptId, datasetId, metricId, fieldId, relationshipId };
}
const edgesOf = (g: MappingGraph, binding: string) => g.edges.filter(e => e.bindings?.includes(binding));
test('five mappings are covered: Flights standalone and consolidated, mapped commerce, billing, mall', () => {
  expect(contexts.map(([n]) => n.split(':')[0]).sort()).toEqual(['billing', 'commerce', 'flights', 'flights', 'mall']);
  for (const [, runtimeContext] of contexts) expect(runtimeContext.findings.filter(f => f.severity === 'error')).toEqual([]);
});
for (const [name, context] of contexts)
  test(`${name}: every binding is drawn as its own kind of line, ends on known rows and cards`, () => {
    const mappingGraph = buildMappingGraph(context);
    const { conceptId, metricId, fieldId, relationshipId } = graphKeys(mappingGraph);
    const nodes = new Set([...mappingGraph.cards.keys(), ...[...mappingGraph.cards.values()].flatMap(c => c.columns.map(x => x.id))]);
    for (const edge of mappingGraph.edges) {
      expect(nodes.has(edge.from)).toBe(true);
      expect(nodes.has(edge.to)).toBe(true);
      for (const viaId of edge.via ?? []) expect(nodes.has(viaId)).toBe(true);
    }
    for (const binding of context.bindings) {
      const own = edgesOf(mappingGraph, binding.id).filter(e => e.kind === binding.kind);
      expect(own.length).toBeGreaterThan(0);
      if (binding.kind === 'referent') {
        // Exactly one line per field (or metric) the expression reads, from the concept's row.
        for (const fieldJson of binding.fields) {
          const field = JSON.parse(fieldJson) as [string, string];
          expect(own.filter(e => e.to === fieldId(field[0], field[1])).length).toBe(1);
        }
        for (const metric of binding.metrics) expect(own.filter(e => e.to === metricId(metric)).length).toBe(1);
        for (const mappingEdge of own) expect(mappingEdge.from).toBe(relationshipId(binding.rootConcept, binding.relationships.join('.')));
      }
      // A link child's fields are the rows its line passes through (the link's anchor only
      // identifies the subject).
      if (binding.kind === 'link' && binding.evidence.path.includes('children')) {
        const fields = binding.fields.map(f => {
          const [d, n] = JSON.parse(f);
          return fieldId(d, n);
        });
        expect(own.some(e => fields.every(x => e.via?.includes(x)))).toBe(true);
      }
    }
    // Metric bindings: measures solid, of dashed.
    for (const metricBinding of context.metricBindings) {
      if (metricBinding.measures.concept)
        expect(mappingGraph.edges.filter(e => e.kind === 'measures' && e.from === conceptId(metricBinding.measures.concept!) && e.to === metricId(metricBinding.metric)).length).toBe(1);
      if (metricBinding.of?.concept)
        expect(mappingGraph.edges.filter(e => e.kind === 'of' && e.from === conceptId(metricBinding.of!.concept!) && e.to === metricId(metricBinding.metric)).length).toBe(1);
    }
    expect(mappingGraph.edges.length).toBeGreaterThan(0);
  });
const commerce = () => buildMappingGraph(contexts.find(([n]) => n.startsWith('commerce'))![1]);
test('commerce: object mapping Customer → customers with customer_id identifying; referent Customer.id → customers.customer_id', () => {
  const mappingGraph = commerce();
  const { conceptId, datasetId, fieldId, relationshipId } = graphKeys(mappingGraph);
  expect(mappingGraph.cards.get(conceptId('Customer'))!.kind).toBe('concept');
  expect(mappingGraph.cards.get(datasetId('customers'))!.kind).toBe('dataset');
  expect(mappingGraph.edges.filter(e => e.kind === 'object' && e.from === conceptId('Customer') && e.to === datasetId('customers'))).toHaveLength(1);
  const customers = mappingGraph.cards.get(datasetId('customers'))!;
  expect(customers.columns.find(c => c.path === 'customer_id')!.badges.map(b => b.label)).toContain('Identifying');
  expect(customers.columns.find(c => c.path === 'region')!.badges.map(b => b.label)).not.toContain('Identifying');
  expect(mappingGraph.edges.some(e => e.kind === 'referent' && e.from === relationshipId('Customer', 'id') && e.to === fieldId('customers', 'customer_id'))).toBe(true);
  // Concept rows are its relationships, in declared order.
  expect(mappingGraph.cards.get(conceptId('Order'))!.columns.map(c => c.path)).toEqual(['id', 'customer', 'amount']);
});
test('commerce: link Order.customer → Customer through the join fields orders.customer_id → customers.customer_id, labelled', () => {
  const mappingGraph = commerce();
  const { conceptId, fieldId, relationshipId } = graphKeys(mappingGraph);
  const link = mappingGraph.edges.find(e => e.kind === 'link' && e.from === relationshipId('Order', 'customer'))!;
  expect(link.to).toBe(conceptId('Customer'));
  expect(link.label).toBe('customer');
  expect(link.via).toEqual([fieldId('orders', 'customer_id'), fieldId('customers', 'customer_id')]);
  const region = mappingGraph.edges.find(e => e.kind === 'link' && e.from === relationshipId('Customer', 'region'))!;
  expect(region.to).toBe(conceptId('Region'));
  expect(region.via).toEqual([fieldId('customers', 'region')]);
});
test('commerce: an object mapping whose expression is a governed metric draws concept → metric', () => {
  const mappingGraph = commerce();
  const { conceptId, metricId } = graphKeys(mappingGraph);
  expect(mappingGraph.edges.some(e => e.kind === 'object' && e.from === conceptId('Revenue') && e.to === metricId('gross_revenue'))).toBe(true);
  expect(mappingGraph.cards.get(metricId('gross_revenue'))!.kind).toBe('metric');
});
test('mall: KPI bindings: billed_amount measures kpi:BilledAmount (solid) and is of Lease (dashed)', () => {
  const runtimeContext = contexts.find(([n]) => n.startsWith('mall'))![1];
  const mappingGraph = buildMappingGraph(runtimeContext);
  const { conceptId, metricId } = graphKeys(mappingGraph);
  const metricBinding = runtimeContext.metricBindings.find(m => m.metric === 'billed_amount')!;
  expect(
    mappingGraph.edges
      .filter(e => e.to === metricId('billed_amount'))
      .map(e => [e.kind, e.from])
      .sort(),
  ).toEqual(
    [
      ['measures', conceptId(metricBinding.measures.concept!)],
      ['object', conceptId('BilledAmount')],
      ['of', conceptId('Lease')],
    ].sort() as any,
  );
  // The object line is the concept mapping `BilledAmount: expression billed_amount`, a binding of
  // its own.
  expect(metricBinding.measures.concept).toBe('BilledAmount');
});
// Synthetic changes to mapped commerce for unmapped items and findings.
function changed(edit: (files: Record<string, string>) => void) {
  const documents = sets.commerce.map(x => ({ ...x }));
  const files = Object.fromEntries(documents.map(x => [x.filename, x.source]));
  edit(files);
  for (const x of documents) x.source = files[x.filename];
  return buildContext(documents, agentCatalog(documents).mappings[0].id);
}
test('unmapped: a concept with no mapping and a field nothing reads carry the Unmapped badge; mapped ones do not', () => {
  const runtimeContext = changed(files => {
    files['commerce.mapped-ontology.yaml'] += '  - concept: Shipment\n    type: EntityType\n';
    files['commerce.mapped-semantic.yaml'] = files['commerce.mapped-semantic.yaml'].replace(
      /(  - name: customers\n[\s\S]*?fields:\n)/,
      '$1      - {name: notes, expression: {dialects: [{dialect: ANSI_SQL, expression: notes}]}}\n',
    );
  });
  const mappingGraph = buildMappingGraph(runtimeContext);
  const { conceptId, datasetId } = graphKeys(mappingGraph);
  const labels = (x: { badges?: { label: string }[] } | undefined) => (x?.badges ?? []).map(b => b.label);
  expect(labels(mappingGraph.cards.get(conceptId('Shipment')))).toContain('Unmapped');
  expect(labels(mappingGraph.cards.get(conceptId('Customer')))).not.toContain('Unmapped');
  const customers = mappingGraph.cards.get(datasetId('customers'))!;
  expect(labels(customers.columns.find(x => x.path === 'notes'))).toContain('Unmapped');
  expect(labels(customers.columns.find(x => x.path === 'customer_id'))).not.toContain('Unmapped');
});
test('findings sit on the affected card: unknown concept, missing field, ambiguous relationship; an unresolved KPI binding on its metric card', () => {
  const runtimeContext = changed(files => {
    files['commerce.mapping.yaml'] = files['commerce.mapping.yaml']
      .replace('  - concept: OrderCount', '  - concept: Ghost\n    object_mappings:\n      - expression: customers.region\n  - concept: OrderCount')
      .replace('            - relationship: id\n              expression: orders.order_id', '            - relationship: id\n              expression: orders.no_such_field');
  });
  const mappingGraph = buildMappingGraph(runtimeContext);
  const { conceptId, metricId } = graphKeys(mappingGraph);
  expect(mappingGraph.cards.get(conceptId('Ghost'))!.findings!.join(' ')).toContain('Unknown ontology concept Ghost');
  expect(mappingGraph.cards.get(conceptId('Order'))!.findings!.join(' ')).toContain('no_such_field');
  // A finding is never attached to an unrelated card.
  expect(mappingGraph.cards.get(conceptId('Customer'))!.findings ?? []).toEqual([]);
  const unknownRelationshipContext = changed(files => {
    files['commerce.mapping.yaml'] = files['commerce.mapping.yaml'].replace(
      '      - referent_mappings:\n          - relationship: id\n            expression: customers.customer_id',
      '      - referent_mappings:\n          - relationship: nope\n            expression: customers.customer_id',
    );
  });
  expect(buildMappingGraph(unknownRelationshipContext).cards.get(conceptId('Customer'))!.findings!.join(' ')).toContain('Customer.nope resolves to 0 definitions');
  const unresolvedKpiContext = changed(files => {
    files['commerce.mapping.yaml'] = files['commerce.mapping.yaml'].replace('{"metric":"gross_revenue","measures":"Revenue","of":"Customer"}', '{"metric":"gross_revenue","measures":"Nope"}');
  });
  const unresolvedKpiGraph = buildMappingGraph(unresolvedKpiContext);
  expect(unresolvedKpiGraph.cards.get(metricId('gross_revenue'))!.findings!.join(' ')).toContain('Nope');
});
test('the view around a metric also holds the datasets of the concepts it binds', () => {
  const [, context] = contexts.find(([name]) => name.startsWith('mall:'))!;
  const graph = buildMappingGraph(context);
  const { datasetId, metricId } = graphKeys(graph);
  const metric = metricId('billed_amount');
  const view = aroundHops(graph as never, metric, 1);
  expect(view.cards.has(datasetId('leases'))).toBe(true);
});
test('reserved field names stay distinct from dataset cards and carry the resolved model scope', () => {
  const context = changed(files => {
    files['commerce.mapped-semantic.yaml'] += '\n';
  });
  context.datasets.push({ name: 'a', fields: [{ name: 'a/b' }, { name: 'b' }] });
  const graph = buildMappingGraph(context);
  const card = [...graph.cards.values()].find(candidate => candidate.kind === 'dataset' && candidate.label === 'a')!;
  expect(new Set([card.id, ...card.columns.map(column => column.id)]).size).toBe(3);
  expect(card.columns[0].id).toContain('/dataset:a/field:a%2Fb');
  expect(card.columns[1].id).toContain('/dataset:a/field:b');
  expect(card.id).toStartWith('sw1:#model:');
});

test('a model-only context does not label its synthetic ontology with the model address', () => {
  const context = modelContext(sets.commerce, 'p/commerce.mapped-semantic.yaml');
  expect(context.ontology.address).toBeUndefined();
  expect(context.semanticModel.address.chain).toEqual([{ kind: 'model', name: context.semanticModel.name }]);
});

test('a declared concept with a built-in name retains its source locator', () => {
  const context = changed(files => {
    files['commerce.mapped-ontology.yaml'] += '  - concept: String\n    type: ValueType\n';
  });
  context.metricBindings.push({
    metric: 'gross_revenue',
    measures: { input: 'String', concept: 'String' },
    findings: [],
    evidence: context.metrics[0].evidence,
  });
  const graph = buildMappingGraph(context);
  const declared = [...graph.cards.values()].find(card => card.kind === 'concept' && card.label === 'String')!;
  expect(declared.id).toStartWith('sw1:#ontology:');
  expect(declared.id).toEndWith('/concept:String');
});

test('default mapping center breaks connection ties by visible names rather than escaped keys', () => {
  const scope = contexts[0][1].ontology.address;
  const cards = ['A', 'é'].map(name => ({
    id: formatAddress({ ...scope, chain: [...scope.chain, { kind: 'concept' as const, name }] }),
    kind: 'concept' as const,
    label: name,
    file: 'ontology.yaml',
    columns: [],
  }));
  const graph: MappingGraph = {
    ...commerce(),
    cards: new Map(cards.map(card => [card.id, card])),
    edges: [{ from: cards[0].id, to: cards[1].id, kind: 'object', bindings: [], source: { file: 'mapping.yaml', path: [] } }],
  };
  expect(defaultMappingCenter(graph)).toBe(cards[0].id);
});

test('model context preserves accepted unnamed legacy roots without fabricating a scope label', () => {
  const original = sets.flights.find(entry => entry.filename === 'flights.yaml')!;
  const document = { ...original, source: original.source.replace(/^(?:name|version):.*\n/gm, '') };
  const context = modelContext([document], document.id, ['ontology_mappings', 0, 'semantic_model']);
  expect(context.datasets.length).toBeGreaterThan(0);
  expect(context.ontology.address).toBeUndefined();
  expect(context.semanticModel.address).toBeUndefined();
});
