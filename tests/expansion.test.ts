// Tests graph expansion, shared-node retention and collapse.
import { test, expect } from 'bun:test';
import { registerSet, canvasOf, addedBy, neighbours, setsOf, type ExpansionSet } from '../src/app/graph/expansion';
import { walkReducer, emptyWalk, canvasAt } from '../src/app/graph/walk';

const edges = [
  ['C', 'A'],
  ['C', 'B'],
  ['A', 'X'],
  ['B', 'X'],
  ['X', 'Y'],
  ['A', 'Z'],
].map(([s, t], i) => ({ id: `e${i}`, source: s, target: t, label: 'r' }));
const expand = (from: string, _current: string[]): ExpansionSet => {
  const neighbourhood = neighbours(edges, from, 'both');
  return registerSet({
    kind: 'expand',
    from,
    direction: 'both',
    nodes: neighbourhood.nodes,
    edges: neighbourhood.edges,
    frontier: {},
    total: neighbourhood.nodes.length,
    budget: Infinity,
  });
};
const base = ['C', 'A', 'B'];
test('expand adds only nodes not already on the canvas; the set still records every neighbour', () => {
  const expansionSet = expand('A', base);
  expect(expansionSet.nodes).toEqual(['C', 'X', 'Z']);
  expect(addedBy(base, expansionSet)).toEqual(['X', 'Z']);
  expect(canvasOf(base, [expansionSet]).nodes).toEqual(['C', 'A', 'B', 'X', 'Z']);
});
test('collapse removes what that expansion alone added (reference counting), never the centre or base nodes', () => {
  const expansionSet = expand('A', base);
  const expansionOfB = expand('B', base);
  const both = canvasOf(base, [expansionSet, expansionOfB]).nodes;
  expect(both.sort()).toEqual(['A', 'B', 'C', 'X', 'Z']);
  // Collapse A: Z goes (only A reached it), X stays (B reaches it).
  const ca = registerSet({
    kind: 'collapse',
    from: 'A',
    target: expansionSet.id,
    direction: 'both',
    nodes: [],
    edges: [],
    frontier: {},
    total: 0,
    budget: 0,
  });
  expect(canvasOf(base, [expansionSet, expansionOfB, ca]).nodes.sort()).toEqual(['A', 'B', 'C', 'X']);
  // Collapsing an expansion of the centre keeps the centre and the base view.
  const expansionOfC = expand('C', base);
  const cc = registerSet({
    kind: 'collapse',
    from: 'C',
    target: expansionOfC.id,
    direction: 'both',
    nodes: [],
    edges: [],
    frontier: {},
    total: 0,
    budget: 0,
  });
  expect(canvasOf(base, [expansionOfC, cc]).nodes).toEqual(base);
});
test('collapsing an expansion also drops expansions made from the nodes it removed', () => {
  const expansionSet = expand('A', base);
  const x = expand('X', [...base, 'X', 'Z']);
  expect(canvasOf(base, [expansionSet, x]).nodes).toContain('Y');
  const ca = registerSet({
    kind: 'collapse',
    from: 'A',
    target: expansionSet.id,
    direction: 'both',
    nodes: [],
    edges: [],
    frontier: {},
    total: 0,
    budget: 0,
  });
  const after = canvasOf(base, [expansionSet, x, ca]);
  expect(after.nodes).not.toContain('Y');
  expect(after.active.map(s => s.id)).toEqual([]);
});
test('undo and forward through the walk restore exactly the earlier canvas', () => {
  const expansionSet = expand('A', base);
  const x = expand('X', [...base, 'X', 'Z']);
  let walk = walkReducer(emptyWalk, { type: 'reset', step: { doc: 'd', center: 'C', name: 'C' } });
  walk = walkReducer(walk, {
    type: 'push',
    step: { doc: 'd', center: 'C', name: 'expanded A', kind: 'expand', set: expansionSet.id },
  });
  const one = canvasOf(base, setsOf(canvasAt(walk).sets)).nodes;
  walk = walkReducer(walk, {
    type: 'push',
    step: { doc: 'd', center: 'C', name: 'expanded X', kind: 'expand', set: x.id },
  });
  const two = canvasOf(base, setsOf(canvasAt(walk).sets)).nodes;
  expect(two).toContain('Y');
  walk = walkReducer(walk, { type: 'back' });
  expect(canvasOf(base, setsOf(canvasAt(walk).sets)).nodes).toEqual(one);
  walk = walkReducer(walk, { type: 'forward' });
  expect(canvasOf(base, setsOf(canvasAt(walk).sets)).nodes).toEqual(two);
  // Walking (re-centring) starts a new canvas.
  walk = walkReducer(walk, { type: 'push', step: { doc: 'd', center: 'A', name: 'A' } });
  expect(canvasAt(walk).sets).toEqual([]);
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
