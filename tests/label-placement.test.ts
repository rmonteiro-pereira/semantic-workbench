import { expect, test } from 'bun:test';
import { labelBox, placeLabels, labelInViewport, nearestRoutePoint, type Box } from '../src/app/graph/routes';

const line: [number, number][] = [
  [0, 100],
  [200, 100],
];

function overlapArea(boxA: Box, boxB: Box) {
  const width = Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x);
  const height = Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y);
  return Math.max(0, width) * Math.max(0, height);
}

function totalOverlap(items: { text: string }[], placed: Map<string, [number, number]>) {
  let total = 0;
  const boxes = items.map((item, index) => labelBox(item.text, placed.get(String(index))!));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) total += overlapArea(boxes[i], boxes[j]);
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

test('zoom-compensated labels reserve their painted space between cards', () => {
  const cards = [
    { x: 0, y: 0, width: 250, height: 100 },
    { x: 400, y: 0, width: 250, height: 100 },
  ];
  const points: [number, number][] = [
    [250, 50],
    [400, 50],
  ];
  const text = '3 relationships';
  for (const scale of [1, 1.5, 2.25, 44 / 12]) {
    const position = placeLabels([{ id: 'link', text, points }], cards, scale).get('link')!;
    const width = (text.length * 7.5 + 16) * scale;
    const height = 22 * scale;
    const painted = {
      x: position[0] - width / 2,
      y: position[1] - height / 2,
      width,
      height,
    };
    for (const card of cards) expect(overlapArea(painted, card)).toBe(0);
  }
});

test('crowded compensated labels add clear lanes instead of covering cards', () => {
  const cards = [{ x: -1000, y: -1000, width: 2000, height: 2000 }];
  const items = Array.from({ length: 14 }, (_, index) => ({
    id: String(index),
    text: '3 relationships',
    points: line,
  }));
  const scale = 44 / 12;
  const positions = placeLabels(items, cards, scale);
  const painted = items.map(item => labelBox(item.text, positions.get(item.id)!, scale));
  for (const [index, box] of painted.entries()) {
    expect(overlapArea(box, cards[0])).toBe(0);
    for (const other of painted.slice(index + 1)) expect(overlapArea(box, other)).toBe(0);
  }
});

test('a displaced label anchors to the nearest route segment', () => {
  const route: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 100],
  ];
  expect(nearestRoutePoint(route, [40, -30])).toEqual([40, 0]);
  expect(nearestRoutePoint(route, [140, 60])).toEqual([100, 60]);
  expect(nearestRoutePoint(route, [140, 180])).toEqual([100, 100]);
});

test('pan and zoom keep labels whole or hide them rather than show fragments', () => {
  const box = { x: 20, y: 20, width: 50, height: 20 };
  expect(labelInViewport(box, [0, 0, 1], 100, 80)).toBe(true);
  expect(labelInViewport(box, [-25, 0, 1], 100, 80)).toBe(false);
  expect(labelInViewport(box, [50, 0, 1], 100, 80)).toBe(false);
  expect(labelInViewport(box, [0, 0, 2], 100, 80)).toBe(false);
  expect(labelInViewport(box, [-20, -20, 2], 150, 100)).toBe(true);
});
