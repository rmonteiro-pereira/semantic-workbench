import { expect, test } from 'bun:test';
import { branchChangeNotice, overlaySummary } from '../../src/app/item-diff/OverlayControl';
import { branchObservation } from '../../src/app/item-diff/use-item-diff';
import type { ItemDiff } from '../../src/shared/item-diff/item-change';

const diff: ItemDiff = {
  from: { side: 'published', version: 'base' },
  to: { side: 'working', version: 'saved' },
  counts: { added: 1, changed: 2, removed: 3 },
  changes: [],
  notCompared: [],
  omitted: 0,
};

test('overlay comparison explains each state in words', () => {
  expect(overlaySummary({ state: 'off' }, false)).toBe('This project has no published commit.');
  expect(overlaySummary({ state: 'off' }, true)).toBe('Overlay off.');
  expect(overlaySummary({ state: 'loading' }, true)).toBe('Comparing saved items.');
  expect(overlaySummary({ state: 'error', message: 'Comparison unavailable.' }, true)).toBe('Comparison unavailable.');
  expect(overlaySummary({ state: 'empty', diff }, true)).toBe('No unpublished item changes.');
  expect(overlaySummary({ state: 'ready', diff }, true)).toBe('1 added, 2 changed, 3 removed.');
  expect(overlaySummary({ state: 'partial', diff }, true)).toContain('Some items could not be shown.');
});

test('branch replacement or removal is announced by name', () => {
  expect(branchChangeNotice('work/customer', 'main')).toContain('branch main');
  expect(branchChangeNotice('work/customer', 'work/customer', 'old', 'new')).toContain('Branch work/customer moved');
  expect(branchChangeNotice('work/customer', '')).toContain('Branch work/customer is no longer checked out');
});

test('switching projects on the same branch does not announce a branch move', () => {
  const firstProject = branchObservation(undefined, 'first', 'main', 'first-head');
  const loadingSecondProject = branchObservation(firstProject, 'second', 'main');
  const secondProject = branchObservation(loadingSecondProject, 'second', 'main', 'second-head');
  expect(loadingSecondProject.head).toBeUndefined();
  expect(branchChangeNotice(loadingSecondProject.branch, secondProject.branch, loadingSecondProject.head, secondProject.head)).toBe('');
});

test('status loading retains a head only within the same project and branch', () => {
  const observed = branchObservation(undefined, 'first', 'main', 'first-head');
  expect(branchObservation(observed, 'first', 'main').head).toBe('first-head');
  expect(branchObservation(observed, 'first', 'feature').head).toBeUndefined();
  const updated = branchObservation(observed, 'first', 'main', 'updated-head');
  expect(branchChangeNotice(observed.branch, updated.branch, observed.head, updated.head)).toContain('Branch main moved');
});
