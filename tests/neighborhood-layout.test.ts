import { test, expect } from 'bun:test';
import { neighborhoodLayout, NEIGHBOR_COLUMN } from '../src/layout';
import { assignRoutes, routePoints, orthogonalPath, type Box } from '../src/graph/routes';
// Centered layout (defect 9) and per-edge routes (defect 7).
test('the center is in the middle column, incoming on the left and outgoing on the right', () => {
  const p = neighborhoodLayout('c', ['i1', 'i2'], ['o1', 'o2', 'o3'], ['b1']);
  expect(p.get('c')!.x).toBe(0);
  for (const id of ['i1', 'i2']) expect(p.get(id)!.x).toBeLessThan(0);
  for (const id of ['o1', 'o2', 'o3']) expect(p.get(id)!.x).toBeGreaterThan(0);
  expect(p.get('b1')!.x).toBe(-NEIGHBOR_COLUMN);
  const ys = [...p.values()].map(v => v.y),
    mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  expect(Math.abs(p.get('c')!.y - mid)).toBeLessThan(1);
  const many = neighborhoodLayout(
    'c',
    Array.from({ length: 14 }, (_, i) => 'i' + i),
    [],
  );
  expect(new Set([...many.values()].map(v => `${v.x}/${v.y}`)).size).toBe(15);
  expect(Math.min(...[...many.values()].map(v => v.x))).toBe(-3 * NEIGHBOR_COLUMN);
});
const segments = (points: [number, number][]) =>
  points.slice(1).map((p, i) => [points[i], p] as const);
function shared(a: [number, number][], b: [number, number][]) {
  // Two routes share a path when collinear segments overlap by more than a few pixels.
  for (const [p, q] of segments(a))
    for (const [r, s] of segments(b)) {
      if (p[1] === q[1] && r[1] === s[1] && p[1] === r[1]) {
        const o =
          Math.min(Math.max(p[0], q[0]), Math.max(r[0], s[0])) -
          Math.max(Math.min(p[0], q[0]), Math.min(r[0], s[0]));
        if (o > 4) return true;
      }
      if (p[0] === q[0] && r[0] === s[0] && p[0] === r[0]) {
        const o =
          Math.min(Math.max(p[1], q[1]), Math.max(r[1], s[1])) -
          Math.max(Math.min(p[1], q[1]), Math.min(r[1], s[1]));
        if (o > 4) return true;
      }
    }
  return false;
}
test('no two edges share a path, including long and backward ones; labels sit apart', () => {
  const center = 'c',
    incoming = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7'],
    outgoing = ['o1', 'o2', 'o3'];
  const pos = neighborhoodLayout(center, incoming, outgoing),
    boxes = new Map<string, Box>(
      [...pos].map(([id, p]) => [id, { x: p.x, y: p.y, width: 250, height: 96 }]),
    );
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
  const paths = edges.map(e => {
    const s = boxes.get(e.source)!,
      t = boxes.get(e.target)!;
    return {
      id: e.id,
      ...routePoints(s.x + s.width, s.y + s.height / 2, t.x, t.y + t.height / 2, routes.get(e.id)!),
    };
  });
  for (let i = 0; i < paths.length; i++)
    for (let j = i + 1; j < paths.length; j++) {
      expect(shared(paths[i].points, paths[j].points), `${paths[i].id} / ${paths[j].id}`).toBe(
        false,
      );
    }
  expect(new Set(paths.map(p => p.label.join('/'))).size).toBe(paths.length);
  // Backward edges travel below, forward long edges above; each on its own lane.
  const lanes = [...routes.values()].filter(r => r.route === 'lane') as any[];
  expect(new Set(lanes.map(r => r.laneY)).size).toBe(lanes.length);
  expect((routes.get('o3>i2') as any).laneY).toBeGreaterThan(
    Math.max(...[...boxes.values()].map(b => b.y + b.height)),
  );
  expect((routes.get('i1>o2') as any).laneY).toBeLessThan(
    Math.min(...[...boxes.values()].map(b => b.y)),
  );
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
  expect(path).toBe(
    'M 300,100 L 310,100 Q 320,100 320,110 L 320,390 Q 320,400 310,400 L 10,400 Q 0,400 0,390 L 0,210 Q 0,200 10,200 L 20,200',
  );
});
