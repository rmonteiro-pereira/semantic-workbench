// Tests bounded graph traversal against an independent breadth-first search.
import { test, expect } from 'bun:test';
import { inspect } from '../src/shared/core/model';
import { boundedClosure, PIERCE_BUDGET, type PierceOptions } from '../src/app/graph/pierce';
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
      relationships: [1, 7, 31].map(index => ({
        name: `link_${index}`,
        roles: [{ concept: `E${(i + index) % 5000}` }],
        verbalizes: ['x'],
      })),
    })),
  }),
);
const id = (m: any, name: string) => m.entities.find((e: any) => e.name === name)!.id;
const opts = (options: Partial<PierceOptions> = {}): PierceOptions => ({
  direction: 'out',
  valueTypes: true,
  technical: true,
  metrics: true,
  budget: 10_000,
  ...options,
});
// Independent reference: plain BFS reachability.
function reach(model: any, start: string, dir: 'out' | 'in' | 'both', ok: (id: string) => boolean = () => true, label?: string) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of model.edges) {
      if (label && edge.label !== label) continue;
      let neighbor: string | null;
      if (dir !== 'in' && edge.source === current) {
        neighbor = edge.target;
      } else if (dir !== 'out' && edge.target === current) {
        neighbor = edge.source;
      } else {
        neighbor = null;
      }
      if (neighbor && neighbor !== current && !seen.has(neighbor) && ok(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return seen;
}
for (const [name, model, start] of [
  ['UBL Invoice', ubl, 'Invoice'],
  ['mall Lease', mall, 'Lease'],
] as const)
  for (const dir of ['out', 'in', 'both'] as const)
    test(`${name} ${dir}: the unbounded closure equals plain reachability; each node once; steps are BFS distances`, () => {
      const startId = id(model, start);
      const closure = boundedClosure(model.entities, model.edges, [startId], opts({ direction: dir }));
      expect(new Set(closure.nodes)).toEqual(reach(model, startId, dir));
      expect(closure.nodes.length).toBe(new Set(closure.nodes).size);
      expect(closure.total).toBe(closure.nodes.length);
      expect(closure.hidden).toBe(0);
      expect(closure.steps[startId]).toBe(0);
      for (const node of closure.nodes) if (node !== startId) expect(closure.nodes.some(p => closure.steps[p] === closure.steps[node] - 1)).toBe(true);
    });
test('UBL Both from Invoice: budget 150 keeps the first 150 in breadth-first order, frontier counts, totals equal the full closure', () => {
  const startId = id(ubl, 'Invoice');
  const full = boundedClosure(ubl.entities, ubl.edges, [startId], opts({ direction: 'both' }));
  const closure = boundedClosure(ubl.entities, ubl.edges, [startId], opts({ direction: 'both', budget: PIERCE_BUDGET }));
  expect(closure.nodes).toEqual(full.nodes.slice(0, Math.min(150, full.total)));
  expect(closure.total).toBe(full.total);
  expect(closure.hidden).toBe(full.total - closure.nodes.length);
  for (let i = 1; i < closure.nodes.length; i++) expect(closure.steps[closure.nodes[i]]).toBeGreaterThanOrEqual(closure.steps[closure.nodes[i - 1]]);
  if (closure.hidden > 0) expect(Object.values(closure.frontier).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  for (const [nodeId, hiddenCount] of Object.entries(closure.frontier)) {
    expect(closure.nodes).toContain(nodeId);
    expect(hiddenCount).toBeGreaterThan(0);
  }
});
test('value types, metrics and a relationship filter limit the closure', () => {
  const startId = id(mall, 'Lease');
  const all = boundedClosure(mall.entities, mall.edges, [startId], opts());
  const noValues = boundedClosure(mall.entities, mall.edges, [startId], opts({ valueTypes: false }));
  const kinds = new Map(mall.entities.map(e => [e.id, e.kind]));
  expect(noValues.nodes.some(n => kinds.get(n) === 'ValueType')).toBe(false);
  expect(noValues.nodes.length).toBeLessThan(all.nodes.length);
  expect(new Set(noValues.nodes)).toEqual(reach(mall, startId, 'out', n => !['ValueType', 'Built-in concept'].includes(kinds.get(n)!)));
  const label = mall.edges.find(e => e.source === startId)!.label;
  const one = boundedClosure(mall.entities, mall.edges, [startId], opts({ relationship: label }));
  expect(new Set(one.nodes)).toEqual(reach(mall, startId, 'out', () => true, label));
  const withMetric = [...mall.entities, { ...mall.entities[0], id: 'm1', name: 'm1', kind: 'Metric' }];
  const edges = [...mall.edges, { ...mall.edges[0], id: 'mm', source: startId, target: 'm1' }];
  expect(boundedClosure(withMetric, edges, [startId], opts({ metrics: false })).nodes).not.toContain('m1');
  expect(boundedClosure(withMetric, edges, [startId], opts()).nodes).toContain('m1');
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
  expect(boundedClosure(nodes, edges, ['a'], opts({ technical: true })).nodes.sort()).toEqual(['a', 'b', 'p']);
});
test('5,000 entities: budgets 150 and 500, the total is the whole cycle-connected closure, cycles terminate, and it is fast and deterministic', () => {
  const startedAt = performance.now();
  const closure = boundedClosure(big.entities, big.edges, [id(big, 'E0')], opts({ budget: 150 }));
  const ms = performance.now() - startedAt;
  expect(closure.nodes).toHaveLength(150);
  expect(closure.total).toBe(5000);
  expect(closure.hidden).toBe(4850);
  expect(ms).toBeLessThan(1500);
  const r500 = boundedClosure(big.entities, big.edges, [id(big, 'E0')], opts({ budget: 500 }));
  expect(r500.nodes.slice(0, 150)).toEqual(closure.nodes);
  expect(r500.nodes).toHaveLength(500);
  expect(boundedClosure(big.entities, big.edges, [id(big, 'E0')], opts({ budget: 9999 })).nodes).toHaveLength(500);
  expect(boundedClosure(big.entities, big.edges, [id(big, 'E0')], opts({ budget: 150 }))).toEqual(closure);
});
test('the lines of a pierce form a tree: one line reaching each shown node except the start', () => {
  const startId = id(ubl, 'Invoice');
  const closure = boundedClosure(ubl.entities, ubl.edges, [startId], opts({ direction: 'both' }));
  expect(closure.edges).toHaveLength(closure.nodes.length - 1);
  const ends = new Set(
    closure.edges.flatMap(e => {
      const x = ubl.edges.find(y => y.id === e)!;
      return [x.source, x.target];
    }),
  );
  for (const node of closure.nodes) expect(ends.has(node)).toBe(true);
});
