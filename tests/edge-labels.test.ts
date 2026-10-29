// Tests that line labels never cover a card or each other.
import { test, expect } from 'bun:test';
import { labelSize, placeEdgeLabels, type LabelRequest, type Rect } from '../src/app/odcs/edge-labels';

const request = (id: string, y: number, priority = 1, width = 260): LabelRequest => ({
  id,
  lines: ['orders.customer_id', '→ customers.id'],
  at: { x: width / 2, y },
  room: width,
  priority,
});

test('a label sits halfway along its line, just above it', () => {
  const placed = placeEdgeLabels([request('a', 100)], []);
  const spot = placed.get('a')!;
  expect(spot.x + spot.w / 2).toBe(130);
  expect(spot.y + spot.h).toBe(100 - 6);
});

test('a gap too narrow for the label leaves it out of the picture', () => {
  expect(placeEdgeLabels([request('a', 100, 1, 100)], []).size).toBe(0);
});

test('two labels on neighbouring lines never overlap; the urgent one keeps its place', () => {
  const placed = placeEdgeLabels([request('late', 100, 2), request('urgent', 104, 0)], []);
  const urgent = placed.get('urgent')!;
  expect(urgent.y + urgent.h).toBe(104 - 6);
  const late = placed.get('late');
  if (late) expect(late.y >= urgent.y + urgent.h || late.y + late.h <= urgent.y).toBe(true);
});

test('a label that would cover a card moves off it or is left out', () => {
  const card: Rect = { x: 60, y: 80, w: 100, h: 40 };
  const placed = placeEdgeLabels([request('a', 100)], [card]);
  const spot = placed.get('a');
  if (spot) expect(spot.y + spot.h <= card.y || spot.y >= card.y + card.h).toBe(true);
});

test('label size grows with its longest line', () => {
  expect(labelSize(['ab']).w).toBeLessThan(labelSize(['abcdef']).w);
  expect(labelSize(['a', 'b']).h).toBeGreaterThan(labelSize(['a']).h);
});

test('labels stay inside fitted card bounds or remain available on hover', () => {
  const bounds = { x: 0, y: 0, w: 400, h: 200 };
  const placed = placeEdgeLabels([request('top', 2), request('bottom', 198)], [], bounds);
  expect(placed.size).toBeGreaterThan(0);
  for (const spot of placed.values()) {
    expect(spot.x).toBeGreaterThanOrEqual(bounds.x);
    expect(spot.y).toBeGreaterThanOrEqual(bounds.y);
    expect(spot.x + spot.w).toBeLessThanOrEqual(bounds.w);
    expect(spot.y + spot.h).toBeLessThanOrEqual(bounds.h);
  }
  expect(placeEdgeLabels([request('outside', -200)], [], bounds).size).toBe(0);
});
