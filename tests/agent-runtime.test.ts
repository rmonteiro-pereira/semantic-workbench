// Tests grounded agent queries and rejection of invalid requests.
import { test, expect } from 'bun:test';
import { parse, stringify } from 'yaml';
import { Database } from 'bun:sqlite';
import { inspect } from '../src/shared/core/model';
import { validateInput } from '../src/shared/validation/input';
import { agentCatalog, buildContext, selectContext, planQuery, type StoredDocument } from '../src/server/agent/runtime';
import { parseExpression, columnRefs } from '../src/server/agent/sql';
const names = ['commerce.mapping.yaml', 'commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml'];
const fixture: StoredDocument[] = await Promise.all(
  names.map(async (filename, i) => ({
    id: String(i),
    filename,
    revision: 1,
    source: await Bun.file('public/examples/commerce/' + filename).text(),
  })),
);
function change(docs: StoredDocument[], index: number, edit: (data: any) => void) {
  const editedDocs = structuredClone(docs);
  const data = parse(editedDocs[index].source);
  edit(data);
  editedDocs[index].source = stringify(data);
  return editedDocs;
}
const context = () => buildContext(fixture, '0');
const plan = (runtimeContext = context(), overrides: any = {}) =>
  planQuery(runtimeContext, {
    mappingId: '0',
    metrics: ['gross_revenue'],
    dimensions: [JSON.stringify(['customers', 'region'])],
    ...overrides,
  });
test('standalone mappings validate and retain exact source paths in the inspector', () => {
  const inspection = inspect(fixture[0].source, fixture[0].filename);
  expect(inspection.kind).toBe('Ossie mappings');
  expect(inspection.entities).toHaveLength(4);
  expect(inspection.entities[0].path).toEqual(['concept_mappings', 0]);
  expect(inspection.entities[0].definition.object_mappings).toBeDefined();
});
test('malformed mapping references, nodes, version and ambiguous families are rejected', () => {
  for (const mutate of [
    (d: any) => delete d.ontology_ref,
    (d: any) => (d.semantic_model_ref = {}),
    (d: any) => (d.concept_mappings[0].object_mappings = [{}]),
    (d: any) => (d.concept_mappings[0].link_mappings = [{}]),
    (d: any) => (d.datasets = []),
  ]) {
    const docs = change(fixture, 0, mutate);
    expect(validateInput(docs[0].source, docs[0].filename).valid).toBe(false);
  }
});
test('a mapping that names an unknown version is reported as not validated rather than rejected', () => {
  const docs = change(fixture, 0, (d: any) => (d.version = 'wrong'));
  const result = validateInput(docs[0].source, docs[0].filename);
  expect(result.issues.map(issue => issue.code)).toEqual(['not-validated']);
});
test('mapping runtime exposes concept → nested mapping → field → physical source and AI context', () => {
  const runtimeContext = context();
  expect(runtimeContext.findings).toEqual([]);
  const region = runtimeContext.bindings.find(b => b.expression === 'customers.region')!;
  expect(region.concept).toBe('Region');
  expect(region.rootConcept).toBe('Customer');
  expect(region.relationships).toEqual(['region']);
  expect(region.fields).toEqual(['["customers","region"]']);
  expect(region.evidence.path).toEqual(['concept_mappings', 0, 'link_mappings', 0, 'children', 0, 'object_mapping', 'expression']);
  expect(runtimeContext.datasets.find(d => d.name === 'customers').source).toBe('analytics.commerce.customers');
  expect(runtimeContext.aiContext.map(a => a.scope)).toEqual(['ontology', 'semantic model']);
  expect(runtimeContext.concepts.find(c => c.concept === 'Order').identify_by).toEqual(['id']);
});
test('governed metrics are reached by mapping, retain source formulas, and resolve dataset dependencies', () => {
  const runtimeContext = context();
  const metric = runtimeContext.metrics.find(m => m.id === 'gross_revenue')!;
  expect(runtimeContext.bindings.find(b => b.rootConcept === 'Revenue')!.metrics).toEqual(['gross_revenue']);
  expect(metric.fields).toEqual(['["orders","amount"]']);
  expect(metric.datasets).toEqual(['orders']);
  expect(metric.definition.expression.dialects[0].expression).toBe('SUM(orders.amount)');
  const selected = selectContext(runtimeContext, ['Revenue']);
  expect(selected.metrics.map(m => m.id)).toEqual(['gross_revenue']);
  expect(selected.fields.map(f => f.name)).toEqual(['amount']);
  expect(() => selectContext(runtimeContext, ['Unknown'])).toThrow('Unknown concept');
});
test('novel revenue by region query composes governed metric and declared join without predefined query', () => {
  const before = structuredClone(fixture);
  const queryPlan = plan();
  expect(queryPlan.sql).toContain('SUM("orders".amount)');
  expect(queryPlan.sql).toContain('GROUP BY "customers".region');
  expect(queryPlan.sql).toContain('LEFT JOIN "analytics"."commerce"."customers"');
  expect(queryPlan.joins.map(j => j.name)).toEqual(['orders_customer']);
  expect(queryPlan.metrics[0].governedExpression.dialects[0].expression).toBe('SUM(orders.amount)');
  expect(fixture).toEqual(before);
  expect(queryPlan.documents.every(d => d.revision === 1)).toBe(true);
  expect(plan().sql).toBe(queryPlan.sql);
});
test('generated query executes on a fixture and preserves aggregate grain and unmatched facts', () => {
  const db = new Database(':memory:');
  try {
    db.exec(
      "ATTACH ':memory:' AS commerce; CREATE TABLE commerce.orders(order_id INT,customer_id INT,amount REAL); CREATE TABLE commerce.customers(customer_id INT PRIMARY KEY,region TEXT); INSERT INTO commerce.orders VALUES(1,10,100),(2,10,50),(3,20,80),(4,99,25); INSERT INTO commerce.customers VALUES(10,'North'),(20,'South');",
    );
    const docs = change(fixture, 2, d => d.datasets.forEach((x: any) => (x.source = x.source.replace('analytics.', ''))));
    const queryPlan = plan(buildContext(docs, '0'));
    const rows = db.query(queryPlan.sql).all() as any[];
    expect(rows.find(r => r.dimension_1 === 'North').metric_1).toBe(150);
    expect(rows.find(r => r.dimension_1 === 'South').metric_1).toBe(80);
    expect(rows.find(r => r.dimension_1 === null).metric_1).toBe(25);
    expect(rows.reduce((s, r) => s + r.metric_1, 0)).toBe(255);
  } finally {
    db.close();
  }
});
test('local reference resolution never guesses missing, conflicting or duplicate targets', () => {
  expect(
    buildContext(
      fixture.filter(d => d.id !== '1'),
      '0',
    ).findings.some(f => f.code === 'reference'),
  ).toBe(true);
  expect(buildContext([...fixture, { ...fixture[1], id: 'duplicate' }], '0').findings[0].message).toContain('2 local documents');
  const renamed = change(fixture, 0, d => (d.ontology_ref.name = 'wrong'));
  expect(buildContext(renamed, '0').findings.some(f => f.code === 'reference')).toBe(true);
  const wrongLocation = change(fixture, 0, d => (d.ontology_ref.iri = './wrong.yaml'));
  expect(buildContext(wrongLocation, '0').findings.some(f => f.code === 'reference')).toBe(true);
  const remote = change(fixture, 0, d => (d.ontology_ref.iri = 'https://example.org/ontology.yaml'));
  expect(buildContext(remote, '0').findings.some(f => f.code === 'local-resolution' && f.severity === 'warning')).toBe(true);
  expect(() => buildContext(fixture, 'missing')).toThrow('Mapping not found');
});
for (const [name, edit] of [
  ['concept', (d: any) => (d.concept_mappings[0].concept = 'Missing')],
  ['relationship', (d: any) => (d.concept_mappings[0].object_mappings[0].referent_mappings[0].relationship = 'missing')],
  ['field', (d: any) => (d.concept_mappings[0].object_mappings[0].referent_mappings[0].expression = 'customers.missing')],
  ['dataset', (d: any) => (d.concept_mappings[0].object_mappings[0].referent_mappings[0].expression = 'missing.customer_id')],
  ['unqualified ambiguity', (d: any) => (d.concept_mappings[0].object_mappings[0].referent_mappings[0].expression = 'customer_id')],
] as [string, (data: any) => void][])
  test(`unresolved mapping ${name} is reported and blocks SQL`, () => {
    const runtimeContext = buildContext(change(fixture, 0, edit), '0');
    expect(runtimeContext.findings.some(f => f.severity === 'error')).toBe(true);
    expect(() => plan(runtimeContext)).toThrow('Resolve mapping context errors');
  });
test('SQL references use syntax trees, not substring matches inside literals, comments or similarly named fields', () => {
  const ast = parseExpression("CASE WHEN orders.amount > 0 THEN 'ghost.missing' ELSE 'orders.amount' END /* ghost.bad */");
  expect(columnRefs(ast).map(r => r.table + '.' + r.column)).toEqual(['orders.amount']);
  expect(() => parseExpression('orders.amount FROM secret')).toThrow();
  expect(() => parseExpression('orders.amount; SELECT 1')).toThrow();
  expect(() => parseExpression('(SELECT password FROM secrets)')).toThrow();
  expect(() => parseExpression('orders.*')).toThrow();
});
test('conditional mapping population is preserved in context and blocks automatic query-wide filtering', () => {
  const docs = change(fixture, 0, d => (d.concept_mappings[0].link_mappings[0].children[0].object_mapping.expression = "customers.region WHERE customers.region == 'North'"));
  const runtimeContext = buildContext(docs, '0');
  expect(runtimeContext.findings).toEqual([]);
  expect(runtimeContext.bindings.find(b => b.concept === 'Region')!.condition).not.toBeNull();
  expect(() => plan(runtimeContext)).toThrow('population conditions');
});
test('metric dependencies are reusable and cyclic formulas cannot be traversed or queried', () => {
  let docs = change(fixture, 2, d => (d.metrics[0].expression.dialects[0].expression = 'order_count * 5'));
  const runtimeContext = buildContext(docs, '0');
  expect(runtimeContext.metrics.find(m => m.id === 'gross_revenue')!.fields).toEqual(['["orders","order_id"]']);
  expect(plan(runtimeContext).sql).toContain('COUNT(DISTINCT');
  docs = change(docs, 2, d => (d.metrics[1].expression.dialects[0].expression = 'gross_revenue'));
  expect(buildContext(docs, '0').findings.some(f => f.code === 'metric' && f.message.includes('cycle'))).toBe(true);
});
test('metric names and dimensional fields must be explicitly reachable through selected mappings', () => {
  expect(() => plan(context(), { concepts: ['Revenue'] })).toThrow('not reachable');
  expect(() => plan(context(), { metrics: ['unmapped'] })).toThrow('not reachable');
  expect(() => plan(context(), { dimensions: ['["customers","missing"]'] })).toThrow('not reachable');
  expect(() => plan(context(), { metrics: ['gross_revenue', 'gross_revenue'] })).toThrow('Duplicate');
});
test('disconnected, reverse, parallel/ambiguous and undeclared-unique joins are rejected', () => {
  const disconnected = change(fixture, 2, d => (d.relationships = []));
  expect(() => plan(buildContext(disconnected, '0'))).toThrow('No fan-out-safe');
  const reverse = change(fixture, 2, d => {
    const r = d.relationships[0];
    [r.from, r.to] = [r.to, r.from];
  });
  expect(() => plan(buildContext(reverse, '0'))).toThrow('No fan-out-safe');
  const parallel = change(fixture, 2, d => d.relationships.push({ ...d.relationships[0], name: 'alternate' }));
  expect(() => plan(buildContext(parallel, '0'))).toThrow('Ambiguous join');
  const noKey = change(fixture, 2, d => delete d.datasets[1].primary_key);
  expect(() => plan(buildContext(noKey, '0'))).toThrow('no declared unique target key');
});
test('computed logical fields resolve to physical expressions and remain scalar', () => {
  let docs = change(fixture, 2, d => (d.datasets[0].fields[2].expression.dialects[0].expression = 'amount * 1.25'));
  expect(plan(buildContext(docs, '0')).sql).toContain('"orders".amount * 1.25');
  docs = change(docs, 2, d => (d.datasets[0].fields[2].expression.dialects[0].expression = 'SUM(amount)'));
  expect(() => plan(buildContext(docs, '0'))).toThrow('not scalar');
});
test('embedded mappings resolve without flattening layers or duplicating metadata', () => {
  const ontology = parse(fixture[1].source);
  const mapping = parse(fixture[0].source);
  const semantic = parse(fixture[2].source);
  ontology.ontology_mappings = [
    {
      name: 'Embedded commerce',
      semantic_model: semantic,
      concept_mappings: mapping.concept_mappings,
    },
  ];
  const docs = [{ ...fixture[1], source: stringify(ontology) }];
  const catalog = agentCatalog(docs);
  expect(catalog.mappings[0].embedded).toBe(true);
  const runtimeContext = buildContext(docs, catalog.mappings[0].id);
  expect(runtimeContext.findings).toEqual([]);
  expect(runtimeContext.bindings.some(b => b.evidence.path[0] === 'ontology_mappings')).toBe(true);
  expect(runtimeContext.metrics[0].evidence.path.slice(0, 3)).toEqual(['ontology_mappings', 0, 'semantic_model']);
  expect(plan(runtimeContext).sql).toContain('SUM(');
});
test('upstream Apache Flights documents validate and all nested mappings and population conditions resolve', async () => {
  const docs: StoredDocument[] = await Promise.all(
    ['flights.mapping.yaml', 'flights.ontology.yaml', 'flights.semantic_model.yaml'].map(async (filename, i) => ({
      id: String(i),
      filename,
      revision: 1,
      source: await Bun.file('tests/fixtures/ossie-mapping/' + filename).text(),
    })),
  );
  for (const doc of docs) expect(validateInput(doc.source, doc.filename).valid).toBe(true);
  const runtimeContext = buildContext(docs, '0');
  expect(runtimeContext.findings).toEqual([]);
  expect(runtimeContext.bindings.length).toBe(60);
  expect(runtimeContext.bindings.filter(b => b.condition)).toHaveLength(2);
  expect(runtimeContext.bindings.some(b => b.concept === 'String')).toBe(true);
  expect(inspect(docs[1].source, docs[1].filename).entities.some(e => e.id === 'builtin/String')).toBe(true);
});
test('two equal-length join paths are ambiguous and cycles terminate', () => {
  let docs = change(fixture, 2, data => {
    const customers = data.datasets[1];
    data.datasets.push({ ...customers, name: 'bridge_a' }, { ...customers, name: 'bridge_b' });
    data.relationships = [
      {
        name: 'a',
        from: 'orders',
        to: 'bridge_a',
        from_columns: ['customer_id'],
        to_columns: ['customer_id'],
      },
      {
        name: 'b',
        from: 'orders',
        to: 'bridge_b',
        from_columns: ['customer_id'],
        to_columns: ['customer_id'],
      },
      {
        name: 'ac',
        from: 'bridge_a',
        to: 'customers',
        from_columns: ['customer_id'],
        to_columns: ['customer_id'],
      },
      {
        name: 'bc',
        from: 'bridge_b',
        to: 'customers',
        from_columns: ['customer_id'],
        to_columns: ['customer_id'],
      },
      {
        name: 'loop',
        from: 'bridge_a',
        to: 'orders',
        from_columns: ['customer_id'],
        to_columns: ['customer_id'],
      },
    ];
  });
  expect(() => plan(buildContext(docs, '0'))).toThrow('Ambiguous');
  docs = change(docs, 2, d => (d.relationships = d.relationships.filter((j: any) => !['b', 'bc'].includes(j.name))));
  expect(plan(buildContext(docs, '0')).joins.map(j => j.name)).toEqual(['a', 'ac']);
});
test('cross-fact metrics cannot be combined by a fan-out-producing join', () => {
  const docs = change(fixture, 2, d => (d.metrics[1].expression.dialects[0].expression = 'SUM(customers.customer_id)'));
  expect(() => plan(buildContext(docs, '0'), { metrics: ['gross_revenue', 'order_count'] })).toThrow('Multi-fact');
});
test('selected context includes transitive governed formulas', () => {
  const docs = change(fixture, 2, d => (d.metrics[0].expression.dialects[0].expression = 'order_count * 5'));
  const selected = selectContext(buildContext(docs, '0'), ['Revenue']);
  expect(selected.metrics.map(m => m.name)).toEqual(['gross_revenue', 'order_count']);
  expect(selected.metrics.find(m => m.name === 'gross_revenue')!.dependsOn).toEqual(['order_count']);
});
test('inherited identifier relationships and multi-level referents retain ontology provenance', () => {
  let docs = change(fixture, 1, d => {
    d.ontology.push({ concept: 'PreferredCustomer', type: 'EntityType', extends: ['Customer'] });
  });
  docs = change(docs, 0, d => {
    d.concept_mappings[0].concept = 'PreferredCustomer';
  });
  const runtimeContext = buildContext(docs, '0');
  expect(runtimeContext.findings).toEqual([]);
  expect(runtimeContext.bindings.some(b => b.rootConcept === 'PreferredCustomer' && b.relationships.includes('id'))).toBe(true);
});

test('query clauses cannot be smuggled into an expression or silently discarded', () => {
  for (const source of ['orders.amount UNION SELECT 1', 'orders.amount INTO public.bad', 'orders.amount AS replacement', 'orders.amount ORDER BY 1', 'orders.amount LIMIT 1'])
    expect(() => parseExpression(source)).toThrow();
});
test('raw mapping trees remain available alongside flattened traversal evidence', () => {
  const runtimeContext = context();
  expect(runtimeContext.mapping.conceptMappings).toEqual(parse(fixture[0].source).concept_mappings);
  expect(runtimeContext.mapping.evidence.documentId).toBe('0');
  expect(runtimeContext.mapping.ontologyRef.name).toBe('Mapped commerce ontology');
});

test('longer alternative paths are ambiguous too; distance does not select a business role', () => {
  const docs = change(fixture, 2, data => {
    data.datasets.push({ ...data.datasets[1], name: 'billing_bridge' });
    data.relationships.push(
      {
        name: 'via_billing',
        from: 'orders',
        to: 'billing_bridge',
        from_columns: ['customer_id'],
        to_columns: ['customer_id'],
      },
      {
        name: 'billing_customer',
        from: 'billing_bridge',
        to: 'customers',
        from_columns: ['customer_id'],
        to_columns: ['customer_id'],
      },
    );
  });
  expect(() => plan(buildContext(docs, '0'))).toThrow('Ambiguous join paths');
});

test('physical expression substitution preserves arithmetic precedence in governed metrics', () => {
  const docs = change(fixture, 2, data => {
    data.datasets.forEach((x: any) => (x.source = x.source.replace('analytics.', '')));
    data.datasets[0].fields[2].expression.dialects[0].expression = 'amount + fee';
    data.metrics[0].expression.dialects[0].expression = 'SUM(orders.amount * 2)';
  });
  const queryPlan = plan(buildContext(docs, '0'));
  const db = new Database(':memory:');
  try {
    db.exec(
      "ATTACH ':memory:' AS commerce; CREATE TABLE commerce.orders(order_id INT,customer_id INT,amount REAL,fee REAL); CREATE TABLE commerce.customers(customer_id INT PRIMARY KEY,region TEXT); INSERT INTO commerce.orders VALUES(1,10,100,10); INSERT INTO commerce.customers VALUES(10,'North');",
    );
    expect((db.query(queryPlan.sql).get() as any).metric_1).toBe(220);
  } finally {
    db.close();
  }
});
test('governed metric dependency expansion preserves arithmetic precedence', () => {
  const docs = change(fixture, 2, d => {
    d.metrics[0].expression.dialects[0].expression = 'order_count * 5';
    d.metrics[1].expression.dialects[0].expression = 'COUNT(DISTINCT orders.order_id) + 1';
  });
  expect(plan(buildContext(docs, '0'), { dimensions: [] }).sql).toContain('(COUNT(DISTINCT "orders".order_id) + 1) * 5');
});

test('embedded semantic definitions receive the same duplicate and reference integrity checks', () => {
  const ontology = parse(fixture[1].source);
  const mapping = parse(fixture[0].source);
  const semantic = parse(fixture[2].source);
  semantic.datasets.push(semantic.datasets[0]);
  ontology.ontology_mappings = [{ semantic_model: semantic, concept_mappings: mapping.concept_mappings }];
  const validation = validateInput(stringify(ontology), 'embedded.yaml');
  expect(validation.valid).toBe(false);
  expect(validation.issues.some(i => i.code === 'duplicate' && i.path.startsWith('/ontology_mappings/0/semantic_model/datasets'))).toBe(true);
});
