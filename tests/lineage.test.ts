// Tests column lineage against independently derived edges and saved reference graphs.
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from 'yaml';
import { buildLineage, objectId, closure, around, type LineageGraph } from '../src/app/odcs/lineage';
// Expected edges are derived independently from parsed YAML, without the lineage builder. Saved
// reference graphs make edge changes visible in review.
type Edge = [string, string, string];
const load = (dir: string) =>
  readdirSync(`public/examples/${dir}`)
    .filter(fileName => /\.(ya?ml|json)$/.test(fileName) && fileName !== 'manifest.json' && fileName !== 'expected.json' && fileName !== 'model-map.json' && fileName !== 'summary.json')
    .map(fileName => ({
      path: fileName,
      data: (() => {
        try {
          return parse(readFileSync(`public/examples/${dir}/${fileName}`, 'utf8'));
        } catch {
          return null;
        }
      })(),
    }));
const edgesOf = (g: LineageGraph): Edge[] => g.edges.map(e => [e.from, e.to, e.kind] as Edge).sort((a, b) => a.join('>').localeCompare(b.join('>')));
function oracle(files: { path: string; data: any }[], contract: string): Edge[] {
  const contractData = files.find(f => f.path === contract)!.data;
  const out: Edge[] = [];
  const obj = (n: string) => `object:${contract}#${n}`;
  for (const schemaObject of contractData.schema)
    for (const property of schemaObject.properties ?? [])
      for (const relationship of property.relationships ?? []) {
        const [targetTable, targetColumn] = String(relationship.to).split('.');
        out.push([`${obj(targetTable)}/${targetColumn}`, `${obj(schemaObject.name)}/${property.name}`, 'foreign-key']);
      }
  const byPhysical = new Map(contractData.schema.map((o: any) => [o.physicalName ?? o.name, o]));
  for (const file of files) {
    const fileModel = file.data;
    if (!fileModel || !Array.isArray(fileModel.datasets)) continue;
    const ansi = (x: any) => {
      const ds = x?.expression?.dialects ?? [];
      return (ds.find((d: any) => d.dialect === 'ANSI_SQL') ?? ds[0])?.expression;
    };
    const fields = new Map<string, string>();
    for (const dataset of fileModel.datasets) {
      const schemaObject: any = byPhysical.get(dataset.source) ?? contractData.schema.find((x: any) => x.name === dataset.source);
      if (!schemaObject) continue;
      const ds = `dataset:${file.path}#/${dataset.name}`;
      // A dataset named after its table whose fields are that table's columns, unchanged, is a
      // copy: its fields are the table's own columns and it adds no card or reads lines.
      const column = (name: string) => (schemaObject.properties ?? []).find((x: any) => (x.physicalName ?? x.name) === name);
      const named = [schemaObject.name, schemaObject.physicalName ?? schemaObject.name].map((n: string) => n.toLowerCase());
      const copy =
        named.includes(String(dataset.name).toLowerCase()) &&
        (dataset.fields ?? []).length > 0 &&
        (dataset.fields ?? []).every((fd: any) => column(fd.name) && String(ansi(fd) ?? fd.name).trim() === fd.name);
      if (copy) {
        for (const fd of dataset.fields) fields.set(`${dataset.name}.${fd.name}`, `${obj(schemaObject.name)}/${column(fd.name).name}`);
        continue;
      }
      for (const fd of dataset.fields ?? []) {
        fields.set(`${dataset.name}.${fd.name}`, `${ds}/${fd.name}`);
        const expression = String(ansi(fd) ?? fd.name);
        // Field expressions in the shipped examples are column names or arithmetic over column
        // names.
        expect(/^[A-Za-z0-9_\s*+\-/()]+$/.test(expression)).toBe(true);
        for (const col of new Set(expression.match(/[A-Za-z_]\w*/g) ?? [])) {
          const property = (schemaObject.properties ?? []).find((x: any) => (x.physicalName ?? x.name) === col);
          if (property) out.push([`${obj(schemaObject.name)}/${property.name}`, `${ds}/${fd.name}`, 'reads']);
        }
      }
    }
    const names = new Set((fileModel.metrics ?? []).map((x: any) => x.name));
    const inLineage = new Set<string>();
    for (const x of fileModel.metrics ?? []) {
      const expression = String(ansi(x) ?? '');
      for (const [, datasetName, col] of expression.matchAll(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g)) {
        const fid = fields.get(`${datasetName}.${col}`);
        if (fid) {
          out.push([fid, `metric:${file.path}#/${x.name}`, 'aggregates']);
          inLineage.add(x.name);
        }
      }
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const x of fileModel.metrics ?? []) {
        const expression = String(ansi(x) ?? '').replace(/'[^']*'/g, '');
        for (const [metricName] of expression.matchAll(/\b[A-Za-z_]\w*\b/g))
          if (names.has(metricName) && metricName !== x.name && !/\.\s*$/.test(expression.slice(0, expression.indexOf(metricName))) && inLineage.has(metricName)) {
            const edge: Edge = [`metric:${file.path}#/${metricName}`, `metric:${file.path}#/${x.name}`, 'uses'];
            if (!out.some(o => o.join() === edge.join())) {
              out.push(edge);
              if (!inLineage.has(x.name)) {
                inLineage.add(x.name);
              }
              grew = true;
            }
          }
      }
    }
  }
  return [...new Map(out.map(e => [e.join('>'), e])).values()].sort((a, b) => a.join('>').localeCompare(b.join('>')));
}
function golden(name: string, edges: Edge[]) {
  const file = `tests/fixtures/lineage/${name}.edges.json`;
  if (!existsSync(file) || process.env.UPDATE_GOLDEN) {
    mkdirSync('tests/fixtures/lineage', { recursive: true });
    writeFileSync(file, JSON.stringify(edges, null, 1) + '\n');
  }
  expect(edges).toEqual(JSON.parse(readFileSync(file, 'utf8')));
}
for (const [dir, contract] of [
  ['commerce', 'commerce.odcs.yaml'],
  ['mall', 'mall.odcs.yaml'],
  ['ubl', 'ubl.odcs.yaml'],
] as const) {
  test(`${dir}: every drawn edge is expected and no expected edge is missing`, () => {
    const files = load(dir);
    const lineageGraph = buildLineage(files, contract);
    const got = edgesOf(lineageGraph);
    const want = oracle(files, contract);
    expect(got.filter(e => !want.some(w => w.join() === e.join()))).toEqual([]);
    expect(want.filter(w => !got.some(e => e.join() === w.join()))).toEqual([]);
    golden(dir, got);
    // A card appears once; every edge end is a known card or column.
    const nodes = new Set([...lineageGraph.cards.keys(), ...[...lineageGraph.cards.values()].flatMap(c => c.columns.map(x => x.id))]);
    for (const edge of lineageGraph.edges) {
      expect(nodes.has(edge.from)).toBe(true);
      expect(nodes.has(edge.to)).toBe(true);
    }
  });
}
test('commerce: customers.customer_id → orders.customer_id (parent left of child), fields and metrics to the right', () => {
  const lineageGraph = buildLineage(load('commerce'), 'commerce.odcs.yaml');
  const tableId = (n: string) => objectId('commerce.odcs.yaml', n);
  expect(lineageGraph.edges).toContainEqual(
    expect.objectContaining({
      from: `${tableId('customers')}/customer_id`,
      to: `${tableId('orders')}/customer_id`,
      kind: 'foreign-key',
    }),
  );
  // The orders dataset copies the orders table column for column, so the table card stands for
  // it: no second card, no reads lines, and the metric reads the table column directly.
  expect(lineageGraph.cards.has('dataset:sales.ossie.yaml#/orders')).toBe(false);
  expect(lineageGraph.edges.some(e => e.from === `${tableId('orders')}/amount` && e.kind === 'reads')).toBe(false);
  expect(lineageGraph.edges.filter(e => e.from === `${tableId('orders')}/amount` && e.kind === 'aggregates').map(e => e.to)).toContain('metric:sales.ossie.yaml#/gross_revenue');
  const semantic = lineageGraph.cards.get(tableId('orders'))!.badges!.filter(b => b.kind === 'semantic');
  expect(semantic.map(b => b.label)).toEqual(['Semantic dataset']);
  // A dataset that adds a field of its own is not a copy and keeps its card.
  expect(lineageGraph.cards.has('dataset:commerce.mapped-semantic.yaml#/customers')).toBe(true);
  // The average order value is built on gross revenue, so it reaches the amount through it.
  expect(lineageGraph.edges).toContainEqual(
    expect.objectContaining({
      from: 'metric:sales.ossie.yaml#/gross_revenue',
      to: 'metric:sales.ossie.yaml#/average_order_value',
      kind: 'uses',
    }),
  );
  const orders = lineageGraph.cards.get(tableId('orders'))!;
  expect(orders.columns.find(c => c.path === 'order_id')!.badges.map(b => b.label)).toEqual(['PK', 'Required', 'Unique']);
  expect(orders.columns.find(c => c.path === 'customer_id')!.badges.map(b => b.label)).toContain('FK');
  expect(orders.columns.find(c => c.path === 'customer_id')!.fk).toEqual(['customers.customer_id']);
});
const contract = (schema: any[]) => ({
  path: 'c.odcs.yaml',
  data: {
    apiVersion: 'v3.1.0',
    kind: 'DataContract',
    id: 'c',
    name: 'C',
    version: '1',
    status: 'active',
    schema,
  },
});
test('nested columns, composite keys, external stubs, declared transforms, cycles and ambiguous sources', () => {
  const files = [
    contract([
      {
        name: 'a',
        physicalName: 'db.a',
        properties: [
          { name: 'id' },
          { name: 'k2' },
          { name: 'address', properties: [{ name: 'zip' }] },
          { name: 'parent', relationships: [{ to: 'a.id' }] },
          { name: 'ext', relationships: [{ to: 'crm.odcs.yaml#/schema/c/properties/id' }] },
        ],
      },
      {
        name: 'b',
        physicalName: 'a',
        properties: [
          { name: 'x' },
          { name: 'y' },
          {
            name: 'total',
            transformSourceObjects: ['a', 'raw_feed'],
            transformLogic: 'SELECT 1',
          },
        ],
        relationships: [{ from: ['b.x', 'b.y'], to: ['a.id', 'a.k2'] }],
      },
    ]),
    {
      path: 's.yaml',
      data: {
        name: 'S',
        datasets: [{ name: 'a', source: 'a', fields: [{ name: 'id' }] }],
        metrics: [
          {
            name: 'n',
            expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'COUNT(a.id)' }] },
          },
          {
            name: 'n2',
            expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'n * 2' }] },
          },
          {
            name: 'orphan',
            expression: { dialects: [{ dialect: 'ANSI_SQL', expression: '1' }] },
          },
        ],
      },
    },
  ];
  const lineageGraph = buildLineage(files, 'c.odcs.yaml');
  const cardA = 'object:c.odcs.yaml#a';
  const cardB = 'object:c.odcs.yaml#b';
  expect(lineageGraph.cards.get(cardA)!.columns.map(c => c.path)).toEqual(['id', 'k2', 'address', 'address.zip', 'parent', 'ext']);
  expect(lineageGraph.edges.filter(e => e.kind === 'foreign-key').map(e => [e.from, e.to])).toEqual([
    [`${cardA}/id`, `${cardA}/parent`],
    [`${cardA}/id`, `${cardB}/x`],
    [`${cardA}/k2`, `${cardB}/y`],
    ['external:crm.odcs.yaml#/schema/c/properties/id', `${cardA}/ext`],
  ]);
  expect(lineageGraph.cards.get('external:crm.odcs.yaml#/schema/c/properties/id')!.kind).toBe('external');
  expect(lineageGraph.edges.filter(e => e.kind === 'transform').map(e => [e.from, e.to])).toEqual([
    [cardA, `${cardB}/total`],
    ['external:raw_feed', `${cardB}/total`],
  ]);
  // Dataset source "a" is a's name and b's physical name: both lines, flagged ambiguous.
  const reads = lineageGraph.edges.filter(e => e.kind === 'reads');
  expect(reads.map(e => e.from).sort()).toEqual([`${cardA}/id`]);
  expect(reads.every(e => e.ambiguous)).toBe(true);
  expect(lineageGraph.edges.filter(e => e.kind === 'uses').map(e => [e.from, e.to])).toEqual([['metric:s.yaml#/n', 'metric:s.yaml#/n2']]);
  expect(lineageGraph.cards.has('metric:s.yaml#/orphan')).toBe(false);
  // Self-referencing foreign key: path highlighting terminates.
  const closureResult = closure(lineageGraph, [`${cardA}/id`]);
  expect(closureResult.nodes.has(`${cardA}/parent`)).toBe(true);
  // A dataset reading nothing of this contract is counted, not drawn.
  const g2 = buildLineage(
    [
      ...files,
      {
        path: 't.yaml',
        data: { name: 'T', datasets: [{ name: 'z', source: 'nowhere', fields: [] }] },
      },
    ],
    'c.odcs.yaml',
  );
  expect(g2.unmatchedDatasets).toBe(1);
  void around;
});
