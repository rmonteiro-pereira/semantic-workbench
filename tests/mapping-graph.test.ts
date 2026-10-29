// Tests concept mapping graphs derived from resolved bindings.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildContext, agentCatalog, type StoredDocument, type RuntimeContext } from '../src/server/agent/runtime';
import { buildMappingGraph, conceptId, datasetId, fieldId, metricId, type MappingGraph } from '../src/app/mappings/mapping-graph';
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
const edgesOf = (g: MappingGraph, binding: string) => g.edges.filter(e => e.bindings?.includes(binding));
test('five mappings are covered: Flights standalone and consolidated, mapped commerce, billing, mall', () => {
  expect(contexts.map(([n]) => n.split(':')[0]).sort()).toEqual(['billing', 'commerce', 'flights', 'flights', 'mall']);
  for (const [, runtimeContext] of contexts) expect(runtimeContext.findings.filter(f => f.severity === 'error')).toEqual([]);
});
for (const [name, context] of contexts)
  test(`${name}: every binding is drawn as its own kind of line, ends on known rows and cards`, () => {
    const mappingGraph = buildMappingGraph(context);
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
        for (const mappingEdge of own) expect(mappingEdge.from).toBe(`${conceptId(binding.rootConcept)}/${binding.relationships.join('.')}`);
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
  expect(mappingGraph.cards.get(conceptId('Customer'))!.kind).toBe('concept');
  expect(mappingGraph.cards.get(datasetId('customers'))!.kind).toBe('dataset');
  expect(mappingGraph.edges.filter(e => e.kind === 'object' && e.from === conceptId('Customer') && e.to === datasetId('customers'))).toHaveLength(1);
  const customers = mappingGraph.cards.get(datasetId('customers'))!;
  expect(customers.columns.find(c => c.path === 'customer_id')!.badges.map(b => b.label)).toContain('Identifying');
  expect(customers.columns.find(c => c.path === 'region')!.badges.map(b => b.label)).not.toContain('Identifying');
  expect(mappingGraph.edges.some(e => e.kind === 'referent' && e.from === `${conceptId('Customer')}/id` && e.to === fieldId('customers', 'customer_id'))).toBe(true);
  // Concept rows are its relationships, in declared order.
  expect(mappingGraph.cards.get(conceptId('Order'))!.columns.map(c => c.path)).toEqual(['id', 'customer', 'amount']);
});
test('commerce: link Order.customer → Customer through the join fields orders.customer_id → customers.customer_id, labelled', () => {
  const mappingGraph = commerce();
  const link = mappingGraph.edges.find(e => e.kind === 'link' && e.from === `${conceptId('Order')}/customer`)!;
  expect(link.to).toBe(conceptId('Customer'));
  expect(link.label).toBe('customer');
  expect(link.via).toEqual([fieldId('orders', 'customer_id'), fieldId('customers', 'customer_id')]);
  const region = mappingGraph.edges.find(e => e.kind === 'link' && e.from === `${conceptId('Customer')}/region`)!;
  expect(region.to).toBe(conceptId('Region'));
  expect(region.via).toEqual([fieldId('customers', 'region')]);
});
test('commerce: an object mapping whose expression is a governed metric draws concept → metric', () => {
  const mappingGraph = commerce();
  expect(mappingGraph.edges.some(e => e.kind === 'object' && e.from === conceptId('Revenue') && e.to === metricId('gross_revenue'))).toBe(true);
  expect(mappingGraph.cards.get(metricId('gross_revenue'))!.kind).toBe('metric');
});
test('mall: KPI bindings: billed_amount measures kpi:BilledAmount (solid) and is of Lease (dashed)', () => {
  const runtimeContext = contexts.find(([n]) => n.startsWith('mall'))![1];
  const mappingGraph = buildMappingGraph(runtimeContext);
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
  const metric = metricId('billed_amount');
  const view = aroundHops(graph as never, metric, 1);
  expect(view.cards.has(datasetId('leases'))).toBe(true);
});
