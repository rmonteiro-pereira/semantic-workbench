import { expect, test } from 'bun:test';
import { branchChangeNotice, overlaySummary } from '../../src/app/item-diff/OverlayControl';
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
