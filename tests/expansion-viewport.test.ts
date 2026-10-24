import { expect, test } from 'bun:test';
import { expansionViewport } from '../src/graph/expansion-viewport';

const pane = { width: 1000, height: 600 };

test('a wide expansion opens directly around its origin at readable zoom', () => {
  const viewport = expansionViewport(
    { x: 0, y: 0, width: 5000, height: 2000 },
    { x: 400, y: 200 },
    pane,
    1,
  );
  expect(viewport).toEqual({ x: 100, y: 100, zoom: 1 });
});

test('a compact expansion fits its complete bounds instead of centering on its origin', () => {
  const viewport = expansionViewport(
    { x: 100, y: 50, width: 200, height: 100 },
    { x: 999, y: 999 },
    pane,
    1,
  );
  expect(viewport.zoom).toBe(2);
  expect(viewport.x).toBe(100);
  expect(viewport.y).toBe(100);
});

test('readable centering follows the actual pane dimensions and chosen zoom', () => {
  const viewport = expansionViewport(
    { x: -500, y: -500, width: 5000, height: 5000 },
    { x: -200, y: 300 },
    { width: 390, height: 500 },
    0.75,
  );
  expect(viewport).toEqual({ x: 345, y: 25, zoom: 0.75 });
});
