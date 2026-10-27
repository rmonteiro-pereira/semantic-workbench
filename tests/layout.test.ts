// Tests graph alignment, scale and relationship metadata.
import { test, expect } from 'bun:test';
import { layoutGraph } from '../src/app/graph/layout';
import { inspect } from '../src/shared/core/model';
test('chain follows left-to-right direction without overlaps', () => {
  const positions = layoutGraph(
    ['a', 'b', 'c'],
    [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ],
  );
  expect(positions.map(n => n.position)).toEqual([
    { x: 0, y: 0 },
    { x: 330, y: 0 },
    { x: 660, y: 0 },
  ]);
});
test('cycles, self links, disconnected nodes and missing endpoints terminate', () => {
  const nodes = layoutGraph(
    ['a', 'b', 'c', 'd'],
    [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
      { source: 'c', target: 'c' },
      { source: 'missing', target: 'd' },
    ],
  );
  expect(nodes.length).toBe(4);
  expect(new Set(nodes.map(n => `${n.position.x},${n.position.y}`)).size).toBe(4);
});
test('5,000 entities and 15,000 relationships parse and align', () => {
  const count = 5000;
  const ontology = Array.from({ length: count }, (_, i) => ({
    concept: `Entity_${i}`,
    type: 'EntityType',
    relationships: [1, 7, 31].map(k => ({
      name: `link_${k}`,
      roles: [{ concept: `Entity_${(i + k) % count}` }],
      verbalizes: ['links'],
    })),
  }));
  const start = performance.now();
  const model = inspect(JSON.stringify({ name: 'Scale test', ontology }));
  const parsed = performance.now();
  const positions = layoutGraph(
    model.entities.map(e => e.id),
    model.edges,
  );
  const end = performance.now();
  expect(model.entities).toHaveLength(count);
  expect(model.edges).toHaveLength(15000);
  expect(new Set(positions.map(n => `${n.position.x},${n.position.y}`)).size).toBe(count);
  expect(end - parsed).toBeLessThan(2000);
  console.log(
    `Scale benchmark: parsing ${(parsed - start).toFixed(0)}ms, layout ${(end - parsed).toFixed(0)}ms`,
  );
});

test('loadable enterprise example has exactly 1,000 entities and 5,000 relationships', async () => {
  const model = inspect(await Bun.file('public/examples/enterprise-1000.ossie.yaml').text());
  expect(model.entities).toHaveLength(1000);
  expect(model.edges).toHaveLength(5000);
  expect(model.edges[0].data.definition.multiplicity).toBe('ManyToOne');
  expect(model.edges[0].data.path).toEqual(['ontology', 0, 'relationships', 0]);
});
test('semantic join metadata retains keys and editable source path', () => {
  const m = inspect(
    JSON.stringify({
      name: 'Commerce',
      datasets: [
        { name: 'orders', source: 'orders' },
        { name: 'customers', source: 'customers' },
      ],
      relationships: [
        {
          name: 'customer',
          from: 'orders',
          to: 'customers',
          from_columns: ['customer_id'],
          to_columns: ['id'],
        },
      ],
    }),
  );
  expect(m.edges[0].data.definition.from_columns).toEqual(['customer_id']);
  expect(m.edges[0].data.path).toEqual(['relationships', 0]);
});
