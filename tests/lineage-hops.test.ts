// Tests that foreign keys read as sentences and group by hop.
import { test, expect } from 'bun:test';
import {
  around,
  buildLineage,
  foreignKeyHop,
  foreignKeyPath,
  hopSentence,
} from '../src/odcs/lineage';

const table = (name: string, properties: any[]) => ({
  name,
  physicalName: 'db.' + name,
  properties: [{ name: 'id', primaryKey: true }, ...properties],
});
// orders reference customers; customers reference regions; order_lines reference orders.
const files = [
  {
    path: 'c.odcs.yaml',
    data: {
      schema: [
        table('regions', []),
        table('customers', [{ name: 'region_id', relationships: [{ to: 'regions.id' }] }]),
        table('orders', [{ name: 'customer_id', relationships: [{ to: 'customers.id' }] }]),
        table('order_lines', [{ name: 'order_id', relationships: [{ to: 'orders.id' }] }]),
      ],
    },
  },
];
const graph = buildLineage(files, 'c.odcs.yaml');
const orders = 'object:c.odcs.yaml#orders';

test('a foreign key reads child column to parent column, whichever way the line is drawn', () => {
  const edge = graph.edges.find(
    e => e.kind === 'foreign-key' && e.to.endsWith('orders/customer_id'),
  )!;
  const hop = foreignKeyHop(graph, edge)!;
  expect(hopSentence(hop)).toBe('orders.customer_id → customers.id');
  expect(foreignKeyHop(graph, { ...edge, kind: 'reads' })).toBeNull();
});

test('one hop reaches the tables next to the centre, in both directions', () => {
  const path = foreignKeyPath(graph, around(graph, orders, 1).hops);
  expect(path.levels.map(names => [...names].sort())).toEqual([
    ['orders'],
    ['customers', 'order_lines'],
  ]);
  expect(path.steps.map(s => [s.hop, s.sentence])).toEqual([
    [1, 'order_lines.order_id → orders.id'],
    [1, 'orders.customer_id → customers.id'],
  ]);
});

test('two hops add the next tables and number their keys as hop 2', () => {
  const path = foreignKeyPath(graph, around(graph, orders, 2).hops);
  expect(path.levels[2]).toEqual(['regions']);
  expect(path.steps.at(-1)).toMatchObject({
    hop: 2,
    sentence: 'customers.region_id → regions.id',
    child: 'customers',
    parent: 'regions',
  });
});
