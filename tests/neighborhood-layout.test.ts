// Tests centered graph placement and separate edge routes.
import { test, expect } from 'bun:test';
import { neighborhoodLayout, NEIGHBOR_COLUMN } from '../src/app/graph/layout';
import { assignRoutes, routePoints, orthogonalPath, type Box } from '../src/app/graph/routes';

test('the center is in the middle column, incoming on the left and outgoing on the right', () => {
  const positions = neighborhoodLayout('c', ['i1', 'i2'], ['o1', 'o2', 'o3'], ['b1']);
  expect(positions.get('c')!.x).toBe(0);
  for (const id of ['i1', 'i2']) expect(positions.get(id)!.x).toBeLessThan(0);
  for (const id of ['o1', 'o2', 'o3']) expect(positions.get(id)!.x).toBeGreaterThan(0);
  expect(positions.get('b1')!.x).toBe(-NEIGHBOR_COLUMN);
  const ys = [...positions.values()].map(v => v.y);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  expect(Math.abs(positions.get('c')!.y - mid)).toBeLessThan(1);
  const many = neighborhoodLayout(
    'c',
    Array.from({ length: 14 }, (_, i) => 'i' + i),
    [],
  );
  expect(new Set([...many.values()].map(v => `${v.x}/${v.y}`)).size).toBe(15);
  expect(Math.min(...[...many.values()].map(v => v.x))).toBe(-3 * NEIGHBOR_COLUMN);
});
const segments = (points: [number, number][]) => points.slice(1).map((p, i) => [points[i], p] as const);
function shared(first: [number, number][], second: [number, number][]) {
  // Two routes share a path when collinear segments overlap by more than a few pixels.
  for (const [firstStart, firstEnd] of segments(first))
    for (const [secondStart, secondEnd] of segments(second)) {
      if (firstStart[1] === firstEnd[1] && secondStart[1] === secondEnd[1] && firstStart[1] === secondStart[1]) {
        const overlap = Math.min(Math.max(firstStart[0], firstEnd[0]), Math.max(secondStart[0], secondEnd[0])) - Math.max(Math.min(firstStart[0], firstEnd[0]), Math.min(secondStart[0], secondEnd[0]));
        if (overlap > 4) return true;
      }
      if (firstStart[0] === firstEnd[0] && secondStart[0] === secondEnd[0] && firstStart[0] === secondStart[0]) {
        const overlap = Math.min(Math.max(firstStart[1], firstEnd[1]), Math.max(secondStart[1], secondEnd[1])) - Math.max(Math.min(firstStart[1], firstEnd[1]), Math.min(secondStart[1], secondEnd[1]));
        if (overlap > 4) return true;
      }
    }
  return false;
}
test('no two edges share a path, including long and backward ones; labels sit apart', () => {
  const center = 'c';
  const incoming = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7'];
  const outgoing = ['o1', 'o2', 'o3'];
  const pos = neighborhoodLayout(center, incoming, outgoing);
  const boxes = new Map<string, Box>([...pos].map(([id, p]) => [id, { x: p.x, y: p.y, width: 250, height: 96 }]));
  const edges = [
    ...incoming.map(i => ({ id: i + '>c', source: i, target: 'c' })),
    ...outgoing.map(o => ({ id: 'c>' + o, source: 'c', target: o })),
    { id: 'o1>c', source: 'o1', target: 'c' },
    { id: 'i1>o2', source: 'i1', target: 'o2' },
    { id: 'o3>i2', source: 'o3', target: 'i2' },
    { id: 'i7>o3', source: 'i7', target: 'o3' },
    { id: 'o2>o3', source: 'o2', target: 'o3' },
    { id: 'c>c', source: 'c', target: 'c' },
  ];
  const routes = assignRoutes(edges, boxes);
  expect(routes.size).toBe(edges.length);
  const paths = edges.map(edge => {
    const sourceBox = boxes.get(edge.source)!;
    const targetBox = boxes.get(edge.target)!;
    return {
      id: edge.id,
      ...routePoints({ x: sourceBox.x + sourceBox.width, y: sourceBox.y + sourceBox.height / 2 }, { x: targetBox.x, y: targetBox.y + targetBox.height / 2 }, routes.get(edge.id)!),
    };
  });
  for (let i = 0; i < paths.length; i++)
    for (let j = i + 1; j < paths.length; j++) {
      expect(shared(paths[i].points, paths[j].points), `${paths[i].id} / ${paths[j].id}`).toBe(false);
    }
  expect(new Set(paths.map(p => p.label.join('/'))).size).toBe(paths.length);
  // Backward edges travel below, forward long edges above. A lane clears the boxes it passes,
  // and two lanes over the same stretch never share a height.
  const laneEdges = edges.filter(e => routes.get(e.id)?.route === 'lane');
  const stretch = (id: string) => {
    const edge = edges.find(e => e.id === id)!;
    const from = boxes.get(edge.source)!;
    const to = boxes.get(edge.target)!;
    return [Math.min(from.x + from.width, to.x), Math.max(from.x + from.width, to.x)];
  };
  const passes = (id: string) => {
    const [left, right] = stretch(id);
    return [...boxes.values()].filter(b => b.x + b.width > left && b.x < right);
  };
  const laneOf = (id: string) => (routes.get(id) as any).laneY as number;
  for (const edge of laneEdges)
    for (const other of laneEdges) {
      if (edge.id >= other.id) continue;
      const [a1, a2] = stretch(edge.id);
      const [b1, b2] = stretch(other.id);
      if (a1 < b2 && b1 < a2) expect(laneOf(edge.id)).not.toBe(laneOf(other.id));
    }
  expect(laneOf('o3>i2')).toBeGreaterThan(Math.max(...passes('o3>i2').map(b => b.y + b.height)));
  expect(laneOf('i1>o2')).toBeLessThan(Math.min(...passes('i1>o2').map(b => b.y)));
  // A lane hugs the boxes it passes: it is no further out than one lane height per lane above.
  const highestPassed = Math.min(...passes('i1>o2').map(b => b.y));
  expect(laneOf('i1>o2')).toBeGreaterThan(highestPassed - 22 - 16 * laneEdges.length);
});
test('corners turn the way the path travels: a backward route has no hooks', () => {
  const path = orthogonalPath([
    [300, 100],
    [320, 100],
    [320, 400],
    [0, 400],
    [0, 200],
    [20, 200],
  ]);
  expect(path).toBe('M 300,100 L 310,100 Q 320,100 320,110 L 320,390 Q 320,400 310,400 L 10,400 Q 0,400 0,390 L 0,210 Q 0,200 10,200 L 20,200');
});
