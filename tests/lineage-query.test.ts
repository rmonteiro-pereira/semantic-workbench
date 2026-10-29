// Tests neighborhood reachability and directional lineage paths.
import { test, expect } from 'bun:test';
import { buildLineage, around, closure, findAssets, selectionNodes } from '../src/app/odcs/lineage';
const doc = (n: string, props: any[], extra: any = {}) => ({
  name: n,
  physicalName: 'db.' + n,
  properties: props,
  ...extra,
});
// Chain: c0 ← c1 ← c2 ← c3 (each child references the previous one); c1 is read by dataset d1 with
// metrics m1 (on d1.k) and m2 (on m1); c2 is read by d2.
const files = [
  {
    path: 'c.odcs.yaml',
    data: {
      schema: [
        doc('c0', [{ name: 'k' }]),
        doc('c1', [{ name: 'k' }, { name: 'p', relationships: [{ to: 'c0.k' }] }]),
        doc('c2', [{ name: 'k' }, { name: 'p', relationships: [{ to: 'c1.k' }] }]),
        doc('c3', [{ name: 'k' }, { name: 'p', relationships: [{ to: 'c2.k' }] }]),
      ],
    },
  },
  {
    path: 's.yaml',
    data: {
      name: 'S',
      datasets: [
        { name: 'd1', source: 'db.c1', fields: [{ name: 'k' }, { name: 'p' }] },
        { name: 'd2', source: 'db.c2', fields: [{ name: 'k' }] },
      ],
      metrics: [
        {
          name: 'm1',
          expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'COUNT(d1.k)' }] },
        },
        { name: 'm2', expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'm1 + 1' }] } },
      ],
    },
  },
];
const g = buildLineage(files, 'c.odcs.yaml');
const o = (n: string) => `object:c.odcs.yaml#${n}`;
test('default reach: one foreign-key step each way plus everything downstream to metrics; hidden counts', () => {
  const a = around(g, o('c1'));
  expect([...a.cards].sort()).toEqual([o('c0'), o('c1'), o('c2'), 'dataset:s.yaml#/d1', 'metric:s.yaml#/m1', 'metric:s.yaml#/m2'].sort());
  expect(a.hidden.get(o('c2'))).toBe(1);
  expect(a.hidden.get(o('c0'))).toBeUndefined();
  const two = around(g, o('c1'), 2);
  expect(two.cards.has(o('c3'))).toBe(true);
  expect(two.hidden.size).toBe(0);
  // Centring on a metric shows what feeds it and the objects one key away from its sources.
  const m = around(g, 'metric:s.yaml#/m2');
  expect([...m.cards].sort()).toEqual([o('c0'), o('c1'), o('c2'), 'dataset:s.yaml#/d1', 'metric:s.yaml#/m1', 'metric:s.yaml#/m2'].sort());
});
test('closure follows direction: up = ancestors, down = descendants, both = union, never siblings', () => {
  const start = 'dataset:s.yaml#/d1/k';
  const down = closure(g, [start], 'down');
  expect([...down.nodes].sort()).toEqual([start, 'metric:s.yaml#/m1', 'metric:s.yaml#/m2'].sort());
  const up = closure(g, [start], 'up');
  expect([...up.nodes].sort()).toEqual([start, `${o('c1')}/k`].sort());
  const both = closure(g, [start]);
  expect(both.nodes.size).toBe(4);
  // The sibling field d1.p is not reached through c1.
  expect(both.nodes.has('dataset:s.yaml#/d1/p')).toBe(false);
  expect(both.nodes.has(`${o('c2')}/p`)).toBe(false);
  // From c1.k downstream: the child key of c2, then nothing further through c2.k (a different
  // column).
  const fk = closure(g, [`${o('c1')}/k`], 'down');
  expect(fk.nodes.has(`${o('c2')}/p`)).toBe(true);
  expect(fk.nodes.has(`${o('c3')}/p`)).toBe(false);
  // Edges in the closure are those between its nodes.
  for (const i of both.edges) expect(both.nodes.has(g.edges[i].from) && both.nodes.has(g.edges[i].to)).toBe(true);
});
test('a card selection stands for all its columns', () => {
  expect(selectionNodes(g, o('c1')).sort()).toEqual([o('c1'), `${o('c1')}/k`, `${o('c1')}/p`].sort());
  const c = closure(g, selectionNodes(g, o('c1')));
  expect(c.nodes.has(`${o('c0')}/k`)).toBe(true);
  expect(c.nodes.has('metric:s.yaml#/m2')).toBe(true);
});
test('Find assets ranks exact names first and ignores separators', () => {
  expect(findAssets(g, 'c1')[0].id).toBe(o('c1'));
  expect(findAssets(g, 'd 1').map(h => h.id)).toContain('dataset:s.yaml#/d1');
  expect(findAssets(g, 'm1')[0].id).toBe('metric:s.yaml#/m1');
  expect(findAssets(g, '')).toEqual([]);
});
