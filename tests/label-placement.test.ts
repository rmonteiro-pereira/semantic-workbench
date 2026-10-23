import { expect, test } from 'bun:test';
import { labelBox, placeLabels, type Box } from '../src/graph/routes';

const line: [number, number][] = [
  [0, 100],
  [200, 100],
];

function overlapArea(a: Box, b: Box) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}

function totalOverlap(items: { text: string }[], placed: Map<string, [number, number]>) {
  let total = 0;
  const boxes = items.map((item, index) => labelBox(item.text, placed.get(String(index))!));
  for (let first = 0; first < boxes.length; first++)
    for (let second = first + 1; second < boxes.length; second++)
      total += overlapArea(boxes[first], boxes[second]);
  return total;
}

test('labels on the same line are stacked apart instead of drawn over each other', () => {
  const items = [
    { id: '0', text: 'AllowanceCharge', points: line },
    { id: '1', text: '2 relationships', points: line },
  ];
  expect(totalOverlap(items, placeLabels(items, []))).toBe(0);
});

test('a label keeps clear of a node box when a free spot exists', () => {
  const node = { x: 80, y: 90, width: 40, height: 20 };
  const placed = placeLabels([{ id: 'a', text: 'owns', points: line }], [node]);
  expect(overlapArea(labelBox('owns', placed.get('a')!), node)).toBe(0);
});

test('when no spot is free the labels spread instead of all landing on the line', () => {
  const items = Array.from({ length: 14 }, (_, index) => ({
    id: String(index),
    text: 'relationship',
    points: line,
  }));
  const spread = placeLabels(items, []);
  const stacked = new Map(items.map(item => [item.id, [100, 100] as [number, number]]));
  expect(totalOverlap(items, spread)).toBeLessThan(totalOverlap(items, stacked));
});
