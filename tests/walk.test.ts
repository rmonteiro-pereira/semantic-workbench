// Tests graph navigation history and restoration of expansion steps.
import { test, expect } from 'bun:test';
import { walkReducer, emptyWalk, currentStep, canBack, canForward, MAX_STEPS, reconcileWalk, walkWithinProject, type Walk, type WalkAction } from '../src/app/graph/walk';
const step = (center: string, doc = 'd') => ({ doc, center, name: center });
const run = (walk: Walk, ...actions: WalkAction[]): Walk => actions.reduce(walkReducer, walk);
test('push, back and forward move through the trail', () => {
  let walk = run(emptyWalk, { type: 'push', step: step('a') }, { type: 'push', step: step('b') }, { type: 'push', step: step('c') });
  expect(walk.steps.map(s => s.center)).toEqual(['a', 'b', 'c']);
  expect(currentStep(walk).center).toBe('c');
  walk = run(walk, { type: 'back' }, { type: 'back' });
  expect(currentStep(walk).center).toBe('a');
  expect(canBack(walk)).toBe(false);
  walk = run(walk, { type: 'back' });
  expect(walk.index).toBe(0);
  walk = run(walk, { type: 'forward' });
  expect(currentStep(walk).center).toBe('b');
  expect(canForward(walk)).toBe(true);
  walk = run(walk, { type: 'forward' }, { type: 'forward' });
  expect(walk.index).toBe(2);
});
test('pushing after going back truncates forward history; the same center is not pushed twice', () => {
  let walk = run(
    emptyWalk,
    { type: 'push', step: step('a') },
    { type: 'push', step: step('b') },
    { type: 'push', step: step('c') },
    { type: 'back' },
    { type: 'back' },
    { type: 'push', step: step('x') },
  );
  expect(walk.steps.map(s => s.center)).toEqual(['a', 'x']);
  expect(canForward(walk)).toBe(false);
  expect(run(walk, { type: 'push', step: step('x') })).toBe(walk);
  expect(run(walk, { type: 'push', step: step('x', 'other') }).steps).toHaveLength(3);
});
test('jump and reset; the trail is bounded', () => {
  let walk = run(emptyWalk, { type: 'push', step: step('a') }, { type: 'push', step: step('b') }, { type: 'jump', index: 0 });
  expect(currentStep(walk).center).toBe('a');
  expect(run(walk, { type: 'jump', index: 9 })).toBe(walk);
  expect(run(walk, { type: 'reset', step: step('z') }).steps.map(s => s.center)).toEqual(['z']);
  expect(run(walk, { type: 'reset' })).toEqual(emptyWalk);
  for (let i = 0; i < MAX_STEPS + 20; i++) walk = walkReducer(walk, { type: 'push', step: step('s' + i) });
  expect(walk.steps).toHaveLength(MAX_STEPS);
  expect(walk.index).toBe(MAX_STEPS - 1);
});
// Expansion steps (data-model WalkStep); steps without `kind` stay re-centering steps.
import { canvasAt } from '../src/app/graph/walk';
const expand = (center: string, set: string, name = set) => ({
  doc: 'd',
  center,
  name,
  kind: 'expand' as const,
  set,
});
test('expansion steps keep the center and are pushed even when the center repeats', () => {
  let walk = run(emptyWalk, { type: 'push', step: step('a') }, { type: 'push', step: expand('a', 's1', 'b') }, { type: 'push', step: expand('a', 's2', 'c') });
  expect(walk.steps.map(s => s.kind ?? 'center')).toEqual(['center', 'expand', 'expand']);
  expect(canvasAt(walk)).toEqual({ center: step('a'), sets: ['s1', 's2'] });
  expect(run(walk, { type: 'push', step: expand('a', 's2', 'c') })).toBe(walk);
  walk = run(walk, { type: 'back' });
  expect(canvasAt(walk).sets).toEqual(['s1']);
  walk = run(walk, { type: 'back' });
  expect(canvasAt(walk)).toEqual({ center: step('a'), sets: [] });
  walk = run(walk, { type: 'forward' }, { type: 'forward' });
  expect(canvasAt(walk).sets).toEqual(['s1', 's2']);
});
test('re-centering starts a new canvas; legacy steps without kind still dedupe', () => {
  let walk = run(emptyWalk, { type: 'push', step: step('a') }, { type: 'push', step: expand('a', 's1') }, { type: 'push', step: step('b') });
  expect(canvasAt(walk)).toEqual({ center: step('b'), sets: [] });
  expect(run(walk, { type: 'push', step: step('b') })).toBe(walk);
  walk = run(walk, { type: 'back' });
  expect(canvasAt(walk)).toEqual({ center: step('a'), sets: ['s1'] });
  expect(canvasAt(emptyWalk)).toEqual({ center: undefined, sets: [] });
  const legacy: Walk = { steps: [{ doc: 'd', center: 'x', name: 'x' }], index: 0 };
  expect(canvasAt(legacy).center?.center).toBe('x');
});

test('reconcileWalk keeps the steps ahead when Back moves within one branch', () => {
  const full = run(emptyWalk, { type: 'push', step: step('a') }, { type: 'push', step: step('b') });
  const earlier = { steps: full.steps.slice(0, 1), index: 0 };
  expect(reconcileWalk(full, earlier)).toEqual({ steps: full.steps, index: 0 });
  expect(reconcileWalk(earlier, full)).toEqual({ steps: full.steps, index: 1 });
});

test('reconcileWalk restores a different branch as it was', () => {
  const left = run(emptyWalk, { type: 'push', step: step('a') }, { type: 'push', step: step('b') });
  const right = run(emptyWalk, { type: 'push', step: step('a') }, { type: 'push', step: step('c') });
  expect(reconcileWalk(left, right)).toBe(right);
});

test('the trail stops at the project boundary', () => {
  const projectOf = (id: string) => id.split('/')[0];
  const walk = run(emptyWalk, { type: 'push', step: step('a', 'sales/a.yaml') }, { type: 'push', step: step('b', 'billing/b.yaml') }, { type: 'push', step: step('c', 'billing/c.yaml') });
  const inBilling = walkWithinProject(walk, 'billing', projectOf);
  expect(inBilling.steps.map(s => s.center)).toEqual(['b', 'c']);
  expect(currentStep(inBilling).center).toBe('c');
  const inSales = walkWithinProject(walk, 'sales', projectOf);
  expect(inSales.steps.map(s => s.center)).toEqual(['a']);
  expect(inSales.index).toBe(0);
  expect(walkWithinProject(walk, 'empty', projectOf)).toEqual(emptyWalk);
  const unchanged = walkWithinProject(inSales, 'sales', projectOf);
  expect(unchanged).toBe(inSales);
});

test('with no kept step before the position the trail goes to its first kept step', () => {
  const projectOf = (id: string) => id.split('/')[0];
  const walk = run(
    emptyWalk,
    { type: 'push', step: step('a', 'sales/a.yaml') },
    { type: 'push', step: step('b', 'billing/b.yaml') },
    { type: 'push', step: step('c', 'billing/c.yaml') },
    { type: 'jump', index: 0 },
  );
  const inBilling = walkWithinProject(walk, 'billing', projectOf);
  expect(inBilling.steps.map(s => s.center)).toEqual(['b', 'c']);
  expect(inBilling.index).toBe(0);
});
