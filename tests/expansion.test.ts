// Tests graph expansion, shared-node retention and collapse.
import { test, expect } from 'bun:test';
import {
  registerSet,
  canvasOf,
  addedBy,
  neighbours,
  setsOf,
  type ExpansionSet,
} from '../src/graph/expansion';
import { walkReducer, emptyWalk, canvasAt } from '../src/graph/walk';

const edges = [
  ['C', 'A'],
  ['C', 'B'],
  ['A', 'X'],
  ['B', 'X'],
  ['X', 'Y'],
  ['A', 'Z'],
].map(([s, t], i) => ({ id: `e${i}`, source: s, target: t, label: 'r' }));
const expand = (from: string, _current: string[]): ExpansionSet => {
  const n = neighbours(edges, from, 'both');
  return registerSet({
    kind: 'expand',
    from,
    direction: 'both',
    nodes: n.nodes,
    edges: n.edges,
    frontier: {},
    total: n.nodes.length,
    budget: Infinity,
  });
};
const base = ['C', 'A', 'B'];
test('expand adds only nodes not already on the canvas; the set still records every neighbour', () => {
  const a = expand('A', base);
  expect(a.nodes).toEqual(['C', 'X', 'Z']);
  expect(addedBy(base, a)).toEqual(['X', 'Z']);
  expect(canvasOf(base, [a]).nodes).toEqual(['C', 'A', 'B', 'X', 'Z']);
});
test('collapse removes what that expansion alone added (reference counting), never the centre or base nodes', () => {
  const a = expand('A', base);
  const b = expand('B', base);
  const both = canvasOf(base, [a, b]).nodes;
  expect(both.sort()).toEqual(['A', 'B', 'C', 'X', 'Z']);
  // Collapse A: Z goes (only A reached it), X stays (B reaches it).
  const ca = registerSet({
    kind: 'collapse',
    from: 'A',
    target: a.id,
    direction: 'both',
    nodes: [],
    edges: [],
    frontier: {},
    total: 0,
    budget: 0,
  });
  expect(canvasOf(base, [a, b, ca]).nodes.sort()).toEqual(['A', 'B', 'C', 'X']);
  // Collapsing an expansion of the centre keeps the centre and the base view.
  const c = expand('C', base);
  const cc = registerSet({
    kind: 'collapse',
    from: 'C',
    target: c.id,
    direction: 'both',
    nodes: [],
    edges: [],
    frontier: {},
    total: 0,
    budget: 0,
  });
  expect(canvasOf(base, [c, cc]).nodes).toEqual(base);
});
test('collapsing an expansion also drops expansions made from the nodes it removed', () => {
  const a = expand('A', base);
  const x = expand('X', [...base, 'X', 'Z']);
  expect(canvasOf(base, [a, x]).nodes).toContain('Y');
  const ca = registerSet({
    kind: 'collapse',
    from: 'A',
    target: a.id,
    direction: 'both',
    nodes: [],
    edges: [],
    frontier: {},
    total: 0,
    budget: 0,
  });
  const after = canvasOf(base, [a, x, ca]);
  expect(after.nodes).not.toContain('Y');
  expect(after.active.map(s => s.id)).toEqual([]);
});
test('undo and forward through the walk restore exactly the earlier canvas', () => {
  const a = expand('A', base);
  const x = expand('X', [...base, 'X', 'Z']);
  let w = walkReducer(emptyWalk, { type: 'reset', step: { doc: 'd', center: 'C', name: 'C' } });
  w = walkReducer(w, {
    type: 'push',
    step: { doc: 'd', center: 'C', name: 'expanded A', kind: 'expand', set: a.id },
  });
  const one = canvasOf(base, setsOf(canvasAt(w).sets)).nodes;
  w = walkReducer(w, {
    type: 'push',
    step: { doc: 'd', center: 'C', name: 'expanded X', kind: 'expand', set: x.id },
  });
  const two = canvasOf(base, setsOf(canvasAt(w).sets)).nodes;
  expect(two).toContain('Y');
  w = walkReducer(w, { type: 'back' });
  expect(canvasOf(base, setsOf(canvasAt(w).sets)).nodes).toEqual(one);
  w = walkReducer(w, { type: 'forward' });
  expect(canvasOf(base, setsOf(canvasAt(w).sets)).nodes).toEqual(two);
  // Walking (re-centring) starts a new canvas.
  w = walkReducer(w, { type: 'push', step: { doc: 'd', center: 'A', name: 'A' } });
  expect(canvasAt(w).sets).toEqual([]);
});
test('neighbours follow the direction and are ordered by relationship, then name', () => {
  expect(neighbours(edges, 'A', 'out').nodes).toEqual(['X', 'Z']);
  expect(neighbours(edges, 'A', 'in').nodes).toEqual(['C']);
  const named = [
    { id: '1', source: 'S', target: 'b', label: 'z' },
    { id: '2', source: 'S', target: 'a', label: 'z' },
    { id: '3', source: 'S', target: 'c', label: 'a' },
  ];
  expect(neighbours(named, 'S', 'out').nodes).toEqual(['c', 'a', 'b']);
  expect(neighbours(named, 'S', 'out', id => id, 'z').nodes).toEqual(['a', 'b']);
});
