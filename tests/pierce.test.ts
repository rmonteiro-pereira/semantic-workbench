// Tests bounded graph traversal against an independent breadth-first search.
import { test, expect } from 'bun:test';
import { inspect } from '../src/model';
import { boundedClosure, PIERCE_BUDGET, type PierceOptions } from '../src/graph/pierce';
// Bounded closure on the UBL and shopping center ontologies and a 5,000-entity model.
const load = async (path: string) => inspect(await Bun.file(path).text(), path.split('/').pop());
const ubl = await load('public/examples/ubl/ubl.ontology.yaml');
const mall = await load('public/examples/mall/mall.ontology.yaml');
const big = inspect(
  JSON.stringify({
    name: 'Scale',
    ontology: Array.from({ length: 5000 }, (_, i) => ({
      concept: `E${i}`,
      type: 'EntityType',
      relationships: [1, 7, 31].map(k => ({
        name: `link_${k}`,
        roles: [{ concept: `E${(i + k) % 5000}` }],
        verbalizes: ['x'],
      })),
    })),
  }),
);
const id = (m: any, name: string) => m.entities.find((e: any) => e.name === name)!.id;
const opts = (o: Partial<PierceOptions> = {}): PierceOptions => ({
  direction: 'out',
  valueTypes: true,
  technical: true,
  metrics: true,
  budget: 10_000,
  ...o,
});
// Independent reference: plain BFS reachability.
function reach(
  m: any,
  start: string,
  dir: 'out' | 'in' | 'both',
  ok: (id: string) => boolean = () => true,
  label?: string,
) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const n = q.shift()!;
    for (const e of m.edges) {
      if (label && e.label !== label) continue;
      const o =
        dir !== 'in' && e.source === n
          ? e.target
          : dir !== 'out' && e.target === n
            ? e.source
            : null;
      if (o && o !== n && !seen.has(o) && ok(o)) {
        seen.add(o);
        q.push(o);
      }
    }
  }
  return seen;
}
for (const [name, m, start] of [
  ['UBL Invoice', ubl, 'Invoice'],
  ['mall Lease', mall, 'Lease'],
] as const)
  for (const dir of ['out', 'in', 'both'] as const)
    test(`${name} ${dir}: the unbounded closure equals plain reachability; each node once; steps are BFS distances`, () => {
      const s = id(m, start);
      const r = boundedClosure(m.entities, m.edges, [s], opts({ direction: dir }));
      expect(new Set(r.nodes)).toEqual(reach(m, s, dir));
      expect(r.nodes.length).toBe(new Set(r.nodes).size);
      expect(r.total).toBe(r.nodes.length);
      expect(r.hidden).toBe(0);
      expect(r.steps[s]).toBe(0);
      for (const n of r.nodes)
        if (n !== s) expect(r.nodes.some(p => r.steps[p] === r.steps[n] - 1)).toBe(true);
    });
test('UBL Both from Invoice: budget 150 keeps the first 150 in breadth-first order, frontier counts, totals equal the full closure', () => {
  const s = id(ubl, 'Invoice');
  const full = boundedClosure(ubl.entities, ubl.edges, [s], opts({ direction: 'both' }));
  const r = boundedClosure(
    ubl.entities,
    ubl.edges,
    [s],
    opts({ direction: 'both', budget: PIERCE_BUDGET }),
  );
  expect(r.nodes).toEqual(full.nodes.slice(0, Math.min(150, full.total)));
  expect(r.total).toBe(full.total);
  expect(r.hidden).toBe(full.total - r.nodes.length);
  for (let i = 1; i < r.nodes.length; i++)
    expect(r.steps[r.nodes[i]]).toBeGreaterThanOrEqual(r.steps[r.nodes[i - 1]]);
  if (r.hidden > 0) expect(Object.values(r.frontier).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  for (const [n, h] of Object.entries(r.frontier)) {
    expect(r.nodes).toContain(n);
    expect(h).toBeGreaterThan(0);
  }
});
test('value types, metrics and a relationship filter limit the closure', () => {
  const s = id(mall, 'Lease');
  const all = boundedClosure(mall.entities, mall.edges, [s], opts());
  const noValues = boundedClosure(mall.entities, mall.edges, [s], opts({ valueTypes: false }));
  const kinds = new Map(mall.entities.map(e => [e.id, e.kind]));
  expect(noValues.nodes.some(n => kinds.get(n) === 'ValueType')).toBe(false);
  expect(noValues.nodes.length).toBeLessThan(all.nodes.length);
  expect(new Set(noValues.nodes)).toEqual(
    reach(mall, s, 'out', n => !['ValueType', 'Built-in concept'].includes(kinds.get(n)!)),
  );
  const label = mall.edges.find(e => e.source === s)!.label;
  const one = boundedClosure(mall.entities, mall.edges, [s], opts({ relationship: label }));
  expect(new Set(one.nodes)).toEqual(reach(mall, s, 'out', () => true, label));
  const withMetric = [
    ...mall.entities,
    { ...mall.entities[0], id: 'm1', name: 'm1', kind: 'Metric' },
  ];
  const edges = [...mall.edges, { ...mall.edges[0], id: 'mm', source: s, target: 'm1' }];
  expect(boundedClosure(withMetric, edges, [s], opts({ metrics: false })).nodes).not.toContain(
    'm1',
  );
  expect(boundedClosure(withMetric, edges, [s], opts()).nodes).toContain('m1');
});
test('technical resources follow the switch in models with OWL classes', () => {
  const nodes = [
    { id: 'a', name: 'a', kind: 'OWL class' },
    { id: 'p', name: 'p', kind: 'OWL property' },
    { id: 'b', name: 'b', kind: 'OWL class' },
  ];
  const edges = [
    { id: '1', source: 'a', target: 'p', label: 'x' },
    { id: '2', source: 'p', target: 'b', label: 'x' },
    { id: '3', source: 'a', target: 'b', label: 'y' },
  ];
  expect(boundedClosure(nodes, edges, ['a'], opts({ technical: false })).nodes).toEqual(['a', 'b']);
  expect(boundedClosure(nodes, edges, ['a'], opts({ technical: true })).nodes.sort()).toEqual([
    'a',
    'b',
    'p',
  ]);
});
test('5,000 entities: budgets 150 and 500, the total is the whole cycle-connected closure, cycles terminate, and it is fast and deterministic', () => {
  const t = performance.now();
  const r = boundedClosure(big.entities, big.edges, [id(big, 'E0')], opts({ budget: 150 }));
  const ms = performance.now() - t;
  expect(r.nodes).toHaveLength(150);
  expect(r.total).toBe(5000);
  expect(r.hidden).toBe(4850);
  expect(ms).toBeLessThan(1500);
  const r500 = boundedClosure(big.entities, big.edges, [id(big, 'E0')], opts({ budget: 500 }));
  expect(r500.nodes.slice(0, 150)).toEqual(r.nodes);
  expect(r500.nodes).toHaveLength(500);
  expect(
    boundedClosure(big.entities, big.edges, [id(big, 'E0')], opts({ budget: 9999 })).nodes,
  ).toHaveLength(500);
  expect(boundedClosure(big.entities, big.edges, [id(big, 'E0')], opts({ budget: 150 }))).toEqual(
    r,
  );
});
test('the lines of a pierce form a tree: one line reaching each shown node except the start', () => {
  const s = id(ubl, 'Invoice');
  const r = boundedClosure(ubl.entities, ubl.edges, [s], opts({ direction: 'both' }));
  expect(r.edges).toHaveLength(r.nodes.length - 1);
  const ends = new Set(
    r.edges.flatMap(e => {
      const x = ubl.edges.find(y => y.id === e)!;
      return [x.source, x.target];
    }),
  );
  for (const n of r.nodes) expect(ends.has(n)).toBe(true);
});
