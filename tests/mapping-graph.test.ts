// Tests concept mapping graphs derived from resolved bindings.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  buildContext,
  agentCatalog,
  type StoredDocument,
  type RuntimeContext,
} from '../server/agent/runtime';
import {
  buildMappingGraph,
  conceptId,
  datasetId,
  fieldId,
  metricId,
  type MappingGraph,
} from '../src/mappings/mapping-graph';
import { aroundHops } from '../src/odcs/lineage';
// The concept-mapping graph: built from the resolver's context, so every drawn line is a binding
// the Mappings tab and the agent context also see.
const docs = (folder: string, files: string[]): StoredDocument[] =>
  files.map((f, i) => ({
    id: `p/${f}`,
    filename: f,
    source: readFileSync(`public/examples/${folder}/${f}`, 'utf8'),
    revision: i + 1,
    project: 'p',
  }));
const sets: Record<string, StoredDocument[]> = {
  commerce: docs('commerce', [
    'commerce.mapping.yaml',
    'commerce.mapped-ontology.yaml',
    'commerce.mapped-semantic.yaml',
  ]),
  flights: docs('ossie', [
    'flights.ontology.yaml',
    'flights.semantic_model.yaml',
    'flights.mapping.yaml',
    'flights.yaml',
  ]),
  billing: docs('billing', [
    'billing.mapping.yaml',
    'billing.ontology.yaml',
    'billing.semantic.yaml',
  ]),
  mall: docs('mall', ['mall.ontology.yaml', 'mall.semantic.yaml', 'mall.mapping.yaml']),
};
const contexts: [string, RuntimeContext][] = Object.entries(sets).flatMap(([name, d]) =>
  agentCatalog(d).mappings.map(
    m => [`${name}:${m.id}`, buildContext(d, m.id)] as [string, RuntimeContext],
  ),
);
const edgesOf = (g: MappingGraph, binding: string) =>
  g.edges.filter(e => e.bindings?.includes(binding));
test('five mappings are covered: Flights standalone and consolidated, mapped commerce, billing, mall', () => {
  expect(contexts.map(([n]) => n.split(':')[0]).sort()).toEqual([
    'billing',
    'commerce',
    'flights',
    'flights',
    'mall',
  ]);
  for (const [, c] of contexts) expect(c.findings.filter(f => f.severity === 'error')).toEqual([]);
});
for (const [name, context] of contexts)
  test(`${name}: every binding is drawn as its own kind of line, ends on known rows and cards`, () => {
    const g = buildMappingGraph(context);
    const nodes = new Set([
      ...g.cards.keys(),
      ...[...g.cards.values()].flatMap(c => c.columns.map(x => x.id)),
    ]);
    for (const e of g.edges) {
      expect(nodes.has(e.from)).toBe(true);
      expect(nodes.has(e.to)).toBe(true);
      for (const v of e.via ?? []) expect(nodes.has(v)).toBe(true);
    }
    for (const b of context.bindings) {
      const own = edgesOf(g, b.id).filter(e => e.kind === b.kind);
      expect(own.length).toBeGreaterThan(0);
      if (b.kind === 'referent') {
        // Exactly one line per field (or metric) the expression reads, from the concept's row.
        for (const f of b.fields) {
          const field = JSON.parse(f) as [string, string];
          expect(own.filter(e => e.to === fieldId(field[0], field[1])).length).toBe(1);
        }
        for (const m of b.metrics) expect(own.filter(e => e.to === metricId(m)).length).toBe(1);
        for (const e of own)
          expect(e.from).toBe(`${conceptId(b.rootConcept)}/${b.relationships.join('.')}`);
      }
      // A link child's fields are the rows its line passes through (the link's anchor only
      // identifies the subject).
      if (b.kind === 'link' && b.evidence.path.includes('children')) {
        const fields = b.fields.map(f => {
          const [d, n] = JSON.parse(f);
          return fieldId(d, n);
        });
        expect(own.some(e => fields.every(x => e.via?.includes(x)))).toBe(true);
      }
    }
    // Metric bindings: measures solid, of dashed.
    for (const m of context.metricBindings) {
      if (m.measures.concept)
        expect(
          g.edges.filter(
            e =>
              e.kind === 'measures' &&
              e.from === conceptId(m.measures.concept!) &&
              e.to === metricId(m.metric),
          ).length,
        ).toBe(1);
      if (m.of?.concept)
        expect(
          g.edges.filter(
            e =>
              e.kind === 'of' &&
              e.from === conceptId(m.of!.concept!) &&
              e.to === metricId(m.metric),
          ).length,
        ).toBe(1);
    }
    expect(g.edges.length).toBeGreaterThan(0);
  });
const commerce = () => buildMappingGraph(contexts.find(([n]) => n.startsWith('commerce'))![1]);
test('commerce: object mapping Customer → customers with customer_id identifying; referent Customer.id → customers.customer_id', () => {
  const g = commerce();
  expect(g.cards.get(conceptId('Customer'))!.kind).toBe('concept');
  expect(g.cards.get(datasetId('customers'))!.kind).toBe('dataset');
  expect(
    g.edges.filter(
      e =>
        e.kind === 'object' && e.from === conceptId('Customer') && e.to === datasetId('customers'),
    ),
  ).toHaveLength(1);
  const customers = g.cards.get(datasetId('customers'))!;
  expect(customers.columns.find(c => c.path === 'customer_id')!.badges.map(b => b.label)).toContain(
    'Identifying',
  );
  expect(customers.columns.find(c => c.path === 'region')!.badges.map(b => b.label)).not.toContain(
    'Identifying',
  );
  expect(
    g.edges.some(
      e =>
        e.kind === 'referent' &&
        e.from === `${conceptId('Customer')}/id` &&
        e.to === fieldId('customers', 'customer_id'),
    ),
  ).toBe(true);
  // Concept rows are its relationships, in declared order.
  expect(g.cards.get(conceptId('Order'))!.columns.map(c => c.path)).toEqual([
    'id',
    'customer',
    'amount',
  ]);
});
test('commerce: link Order.customer → Customer through the join fields orders.customer_id → customers.customer_id, labelled', () => {
  const g = commerce();
  const link = g.edges.find(e => e.kind === 'link' && e.from === `${conceptId('Order')}/customer`)!;
  expect(link.to).toBe(conceptId('Customer'));
  expect(link.label).toBe('customer');
  expect(link.via).toEqual([fieldId('orders', 'customer_id'), fieldId('customers', 'customer_id')]);
  const region = g.edges.find(
    e => e.kind === 'link' && e.from === `${conceptId('Customer')}/region`,
  )!;
  expect(region.to).toBe(conceptId('Region'));
  expect(region.via).toEqual([fieldId('customers', 'region')]);
});
test('commerce: an object mapping whose expression is a governed metric draws concept → metric', () => {
  const g = commerce();
  expect(
    g.edges.some(
      e =>
        e.kind === 'object' &&
        e.from === conceptId('Revenue') &&
        e.to === metricId('gross_revenue'),
    ),
  ).toBe(true);
  expect(g.cards.get(metricId('gross_revenue'))!.kind).toBe('metric');
});
test('mall: KPI bindings: billed_amount measures kpi:BilledAmount (solid) and is of Lease (dashed)', () => {
  const c = contexts.find(([n]) => n.startsWith('mall'))![1];
  const g = buildMappingGraph(c);
  const b = c.metricBindings.find(m => m.metric === 'billed_amount')!;
  expect(
    g.edges
      .filter(e => e.to === metricId('billed_amount'))
      .map(e => [e.kind, e.from])
      .sort(),
  ).toEqual(
    [
      ['measures', conceptId(b.measures.concept!)],
      ['object', conceptId('BilledAmount')],
      ['of', conceptId('Lease')],
    ].sort() as any,
  );
  // The object line is the concept mapping `BilledAmount: expression billed_amount`, a binding of
  // its own.
  expect(b.measures.concept).toBe('BilledAmount');
});
// Synthetic changes to mapped commerce for unmapped items and findings.
function changed(edit: (files: Record<string, string>) => void) {
  const d = sets.commerce.map(x => ({ ...x }));
  const files = Object.fromEntries(d.map(x => [x.filename, x.source]));
  edit(files);
  for (const x of d) x.source = files[x.filename];
  return buildContext(d, agentCatalog(d).mappings[0].id);
}
test('unmapped: a concept with no mapping and a field nothing reads carry the Unmapped badge; mapped ones do not', () => {
  const c = changed(f => {
    f['commerce.mapped-ontology.yaml'] += '  - concept: Shipment\n    type: EntityType\n';
    f['commerce.mapped-semantic.yaml'] = f['commerce.mapped-semantic.yaml'].replace(
      /(  - name: customers\n[\s\S]*?fields:\n)/,
      '$1      - {name: notes, expression: {dialects: [{dialect: ANSI_SQL, expression: notes}]}}\n',
    );
  });
  const g = buildMappingGraph(c);
  const labels = (x: { badges?: { label: string }[] } | undefined) =>
    (x?.badges ?? []).map(b => b.label);
  expect(labels(g.cards.get(conceptId('Shipment')))).toContain('Unmapped');
  expect(labels(g.cards.get(conceptId('Customer')))).not.toContain('Unmapped');
  const customers = g.cards.get(datasetId('customers'))!;
  expect(labels(customers.columns.find(x => x.path === 'notes'))).toContain('Unmapped');
  expect(labels(customers.columns.find(x => x.path === 'customer_id'))).not.toContain('Unmapped');
});
test('findings sit on the affected card: unknown concept, missing field, ambiguous relationship; an unresolved KPI binding on its metric card', () => {
  const c = changed(f => {
    f['commerce.mapping.yaml'] = f['commerce.mapping.yaml']
      .replace(
        '  - concept: OrderCount',
        '  - concept: Ghost\n    object_mappings:\n      - expression: customers.region\n  - concept: OrderCount',
      )
      .replace(
        '            - relationship: id\n              expression: orders.order_id',
        '            - relationship: id\n              expression: orders.no_such_field',
      );
  });
  const g = buildMappingGraph(c);
  expect(g.cards.get(conceptId('Ghost'))!.findings!.join(' ')).toContain(
    'Unknown ontology concept Ghost',
  );
  expect(g.cards.get(conceptId('Order'))!.findings!.join(' ')).toContain('no_such_field');
  // A finding is never attached to an unrelated card.
  expect(g.cards.get(conceptId('Customer'))!.findings ?? []).toEqual([]);
  const r = changed(f => {
    f['commerce.mapping.yaml'] = f['commerce.mapping.yaml'].replace(
      '      - referent_mappings:\n          - relationship: id\n            expression: customers.customer_id',
      '      - referent_mappings:\n          - relationship: nope\n            expression: customers.customer_id',
    );
  });
  expect(buildMappingGraph(r).cards.get(conceptId('Customer'))!.findings!.join(' ')).toContain(
    'Customer.nope resolves to 0 definitions',
  );
  const k = changed(f => {
    f['commerce.mapping.yaml'] = f['commerce.mapping.yaml'].replace(
      '{"metric":"gross_revenue","measures":"Revenue","of":"Customer"}',
      '{"metric":"gross_revenue","measures":"Nope"}',
    );
  });
  const gk = buildMappingGraph(k);
  expect(gk.cards.get(metricId('gross_revenue'))!.findings!.join(' ')).toContain('Nope');
});
test('the view around a metric also holds the datasets of the concepts it binds', () => {
  const [, context] = contexts.find(([name]) => name.startsWith('mall:'))!;
  const graph = buildMappingGraph(context);
  const metric = metricId('billed_amount');
  const view = aroundHops(graph as never, metric, 1);
  expect(view.cards.has(datasetId('leases'))).toBe(true);
});
