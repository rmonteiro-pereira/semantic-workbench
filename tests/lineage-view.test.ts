// Tests which cards open whole in the first view of the lineage canvas.
import { test, expect } from 'bun:test';
import { planFirstView, walkTargetSize, fitsReadableView } from '../src/app/odcs/lineage-view';

// customers -> orders -> order_lines -> metric, each 200 tall.
const heights = new Map([
  ['customers', 200],
  ['orders', 200],
  ['order_lines', 200],
  ['metric', 200],
]);
const lines = [
  { from: 'customers', to: 'orders' },
  { from: 'orders', to: 'order_lines' },
  { from: 'order_lines', to: 'metric' },
];
const base = {
  centre: 'orders',
  heights,
  lines,
  rank: () => 0,
  zoom: 1,
  margin: 20,
  cardWidth: 360,
  columnGap: 100,
  rowGap: 30,
};
const wide = (width: number) => ({ width, height: 600 });

test('every card shows when the columns fit', () => {
  const shown = planFirstView({ ...base, view: wide(2200) });
  expect([...shown].sort()).toEqual(['customers', 'metric', 'order_lines', 'orders']);
});

test('only the nearest cards that fit whole show, never a cut card', () => {
  // Three columns of 360 with two gaps of 100 need 1280 plus the margin.
  const shown = planFirstView({ ...base, view: wide(1400) });
  expect([...shown].sort()).toEqual(['customers', 'order_lines', 'orders']);
});

test('a lower rank wins between cards at the same distance', () => {
  const ranked = planFirstView({
    ...base,
    view: wide(900),
    rank: card => (card === 'order_lines' ? 0 : 1),
  });
  expect([...ranked].sort()).toEqual(['order_lines', 'orders']);
});

test('the centre shows even when it is larger than the view', () => {
  expect([...planFirstView({ ...base, view: { width: 100, height: 100 } })]).toEqual(['orders']);
});

test('cards of one column stack, and a stack that is too tall leaves the last card out', () => {
  const twoParents = [
    { from: 'customers', to: 'orders' },
    { from: 'regions', to: 'orders' },
  ];
  const tallHeights = new Map([
    ['orders', 200],
    ['customers', 300],
    ['regions', 300],
  ]);
  const shown = planFirstView({
    ...base,
    heights: tallHeights,
    lines: twoParents,
    view: { width: 1200, height: 500 },
  });
  expect([...shown].sort()).toEqual(['customers', 'orders']);
});

test('walk targets compensate zoom and disappear when the card cannot hold them', () => {
  expect(walkTargetSize(1, 360)).toBe(24);
  expect(walkTargetSize(0.5, 360)).toBe(48);
  expect(walkTargetSize(0.1, 360)).toBe(240);
  expect(walkTargetSize(0.05, 360)).toBeNull();
  expect(walkTargetSize(2, 360)).toBe(24);
});

test('first view uses the whole reach only when its actual bounds fit readably', () => {
  const cards = [
    { x: -100, y: -50, width: 360, height: 200 },
    { x: 500, y: 0, width: 360, height: 300 },
  ];
  expect(fitsReadableView(cards, { width: 1008, height: 398 }, 1, 24)).toBe(true);
  expect(fitsReadableView(cards, { width: 1007, height: 398 }, 1, 24)).toBe(false);
  expect(fitsReadableView(cards, { width: 1008, height: 397 }, 1, 24)).toBe(false);
  expect(fitsReadableView([], { width: 1008, height: 398 }, 1, 24)).toBe(false);
});
