// Tests the rounded route a line takes through the layout's bend points.
import { test, expect } from 'bun:test';
import { pointAtHalf, roundedPath } from '../src/app/odcs/edge-route';

test('a route with no corner is one straight segment', () => {
  expect(
    roundedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]),
  ).toBe('M 0 0 L 100 0');
});

test('a corner is rounded by a curve that stays inside the two segments', () => {
  const path = roundedPath(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ],
    20,
  );
  expect(path).toBe('M 0 0 L 80 0 Q 100 0 100 20 L 100 100');
});

test('a short segment limits the rounding to half of its length', () => {
  const path = roundedPath(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 100 },
    ],
    40,
  );
  expect(path).toBe('M 0 0 L 5 0 Q 10 0 10 5 L 10 100');
});

test('the half-way point is measured along the whole route', () => {
  const route = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  expect(pointAtHalf(route)).toEqual({ x: 100, y: 0 });
  expect(
    pointAtHalf([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]),
  ).toEqual({ x: 50, y: 0 });
});
