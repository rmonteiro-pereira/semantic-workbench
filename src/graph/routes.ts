/** Assigns separate orthogonal routes and rounded corners to neighborhood relationships. */
import type { Link } from '../layout';
// Short forward edges bend between columns; long and backward edges get separate outer lanes.
// Self-relationships loop over their nodes, and each corner follows the travel direction.
/** Describes an edge's assigned lane or bend and endpoint offsets. */
export type EdgeRoute = (
  | { route: 'short'; bendX: number }
  | { route: 'side'; laneX: number; endX: number; endY: number }
  | { route: 'lane'; laneY: number; outX: number; inX: number }
  | { route: 'loop'; outX: number; inX: number; top: number }
) & { dyOut?: number; dyIn?: number };
/** Builds a rounded SVG path through orthogonal points. */
export function orthogonalPath(points: [number, number][], radius = 10) {
  const p = points.filter(
    (pt, i) => i === 0 || pt[0] !== points[i - 1][0] || pt[1] !== points[i - 1][1],
  );
  let d = `M ${p[0][0]},${p[0][1]}`;
  for (let i = 1; i < p.length; i++) {
    const [x, y] = p[i];
    if (i === p.length - 1) {
      d += ` L ${x},${y}`;
      break;
    }
    const [px, py] = p[i - 1];
    const [nx, ny] = p[i + 1];
    const r = Math.min(radius, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
    const ax = x - Math.sign(x - px) * r;
    const ay = y - Math.sign(y - py) * r;
    const bx = x + Math.sign(nx - x) * r;
    const by = y + Math.sign(ny - y) * r;
    d += ` L ${ax},${ay} Q ${x},${y} ${bx},${by}`;
  }
  return d;
}
/** Returns route vertices and an initial label position for the current endpoints. */
export function routePoints(
  sx: number,
  sy0: number,
  tx: number,
  ty0: number,
  r: EdgeRoute,
): { points: [number, number][]; label: [number, number] } {
  const sy = sy0 + (r.dyOut ?? 0);
  const ty = ty0 + (r.dyIn ?? 0);
  // Between two nodes of one column: out of the source's right side, along the column, into the
  // target's right side.
  if (r.route === 'side') {
    const ey = r.endY + (r.dyIn ?? 0);
    return {
      points: [
        [sx, sy],
        [r.laneX, sy],
        [r.laneX, ey],
        [r.endX, ey],
      ],
      label: [r.laneX, (sy + ey) / 2],
    };
  }
  if (r.route === 'short')
    return {
      points: [
        [sx, sy],
        [r.bendX, sy],
        [r.bendX, ty],
        [tx, ty],
      ],
      label: [r.bendX, (sy + ty) / 2],
    };
  const lane = r.route === 'loop' ? r.top : r.laneY;
  return {
    points: [
      [sx, sy],
      [r.outX, sy],
      [r.outX, lane],
      [r.inX, lane],
      [r.inX, ty],
      [tx, ty],
    ],
    label: [(r.outX + r.inX) / 2, lane],
  };
}
// Routes for a set of edges between laid-out nodes. Boxes are the node rectangles; handles sit on
// the right (source) and left (target) edges at mid height.
/** Records a positioned rectangle used for graph layout. */
export type Box = { x: number; y: number; width: number; height: number };
/** Height of the nth self loop above a box. */
const loopTop = (box: Box, index: number) => box.y - 14 - index * 10;

/**
 * Chooses the height of each long-edge lane. A lane runs just beyond the boxes it passes, not
 * around the whole canvas, clears the self loops above those boxes and moves outward past any
 * lane already placed over the same stretch.
 */
function createLanePlacer(boxes: Map<string, Box>, edges: { source: string; target: string }[]) {
  const loopCount = new Map<string, number>();
  for (const e of edges)
    if (e.source === e.target) loopCount.set(e.source, (loopCount.get(e.source) ?? 0) + 1);
  const entries = [...boxes];
  const clearanceAbove = ([id, box]: [string, Box]) => {
    const loops = loopCount.get(id) ?? 0;
    return loops ? loopTop(box, loops - 1) - 8 : box.y;
  };
  const placed: { y: number; left: number; right: number; below: boolean }[] = [];
  return (left: number, right: number, below: boolean) => {
    const passed = entries.filter(([, b]) => b.x + b.width > left && b.x < right);
    const reach = passed.length ? passed : entries;
    let y = below
      ? Math.max(...reach.map(([, b]) => b.y + b.height)) + 22
      : Math.min(...reach.map(clearanceAbove)) - 22;
    const shares = (lane: (typeof placed)[number]) =>
      lane.below === below && lane.left < right && left < lane.right && Math.abs(lane.y - y) < 16;
    while (placed.some(shares)) y += below ? 16 : -16;
    placed.push({ y, left, right, below });
    return y;
  };
}

/** Assigns edge lanes and handle offsets between positioned node rectangles. */
export function assignRoutes(
  edges: (Link & { id: string })[],
  boxes: Map<string, Box>,
): Map<string, EdgeRoute> {
  const routes = new Map<string, EdgeRoute>();
  const all = [...boxes.values()];
  if (!all.length) return routes;
  // The free gap right of x (next column's left edge) and left of x (previous column's right
  // edge).
  const rightOf = (x: number) => {
    const n = all.filter(b => b.x > x + 1).map(b => b.x);
    return [x, n.length ? Math.min(...n) : x + 110] as const;
  };
  const leftOf = (x: number) => {
    const n = all.filter(b => b.x + b.width < x - 1).map(b => b.x + b.width);
    return [n.length ? Math.max(...n) : x - 110, x] as const;
  };
  type Need = { edge: string; slot: 'bendX' | 'laneX' | 'outX' | 'inX'; order: number };
  const gaps = new Map<string, { range: readonly [number, number]; needs: Need[] }>();
  const need = (range: readonly [number, number], n: Need) => {
    const k = range.map(Math.round).join(':');
    const g = gaps.get(k) ?? { range, needs: [] };
    g.needs.push(n);
    gaps.set(k, g);
  };
  const placeLane = createLanePlacer(boxes, edges);
  for (const e of [...edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const s = boxes.get(e.source);
    const t = boxes.get(e.target);
    if (!s || !t) continue;
    const sx = s.x + s.width;
    const sy = s.y + s.height / 2;
    const tx = t.x;
    const ty = t.y + t.height / 2;
    if (e.source === e.target) {
      // A self loop sits just above its own card.
      routes.set(e.id, { route: 'loop', outX: 0, inX: 0, top: s.y - 14 });
      need(rightOf(sx), { edge: e.id, slot: 'outX', order: sy });
      need(leftOf(tx), { edge: e.id, slot: 'inX', order: ty });
      continue;
    }
    // Same column: a lane of its own just right of the column.
    if (Math.abs(s.x - t.x) < 4) {
      routes.set(e.id, { route: 'side', laneX: 0, endX: t.x + t.width, endY: ty });
      need(rightOf(Math.max(sx, t.x + t.width)), {
        edge: e.id,
        slot: 'laneX',
        order: (sy + ty) / 2,
      });
      continue;
    }
    // Forward to the next column only: bend in the gap. Anything else gets a lane of its own.
    if (tx - sx > 24 && !all.some(b => b !== s && b !== t && b.x > sx && b.x + b.width < tx)) {
      routes.set(e.id, { route: 'short', bendX: 0 });
      need([sx, tx], { edge: e.id, slot: 'bendX', order: sy + ty });
      continue;
    }
    const backward = tx <= sx;
    routes.set(e.id, {
      route: 'lane',
      laneY: placeLane(Math.min(sx, tx), Math.max(sx, tx), backward),
      outX: 0,
      inX: 0,
    });
    need(rightOf(sx), { edge: e.id, slot: 'outX', order: sy });
    need(leftOf(tx), { edge: e.id, slot: 'inX', order: ty });
  }
  // Loops climb just above their node, each at its own height.
  const loopHeights = new Map<string, number>();
  for (const e of edges)
    if (e.source === e.target && routes.get(e.id)?.route === 'loop') {
      const n = loopHeights.get(e.source) ?? 0;
      loopHeights.set(e.source, n + 1);
      (routes.get(e.id) as any).top = loopTop(boxes.get(e.source)!, n);
    }
  // Spread every vertical segment of a gap evenly across it, ordered to limit crossings.
  for (const { range, needs } of gaps.values()) {
    needs.sort((a, b) => a.order - b.order || a.edge.localeCompare(b.edge));
    const [l, r] = range;
    const inner = Math.max(4, r - l - 24);
    const step = needs.length > 1 ? Math.min(12, inner / (needs.length - 1)) : 0;
    const start = (l + r) / 2 - (step * (needs.length - 1)) / 2;
    needs.forEach((n, i) => {
      (routes.get(n.edge) as any)[n.slot] = start + i * step;
    });
  }
  // Spread edge ends along each node side, ordered by the other end's height, so no two edges
  // share a start or end segment.
  const spread = (key: 'dyOut' | 'dyIn', ends: Map<string, { id: string; other: number }[]>) => {
    for (const [node, list] of ends) {
      const box = boxes.get(node)!;
      const usable = Math.max(0, box.height / 2 - 14);
      list.sort((a, b) => a.other - b.other || a.id.localeCompare(b.id));
      const step = list.length > 1 ? Math.min(14, (2 * usable) / (list.length - 1)) : 0;
      list.forEach((e, i) => {
        const r = routes.get(e.id);
        if (r) r[key] = (i - (list.length - 1) / 2) * step;
      });
    }
  };
  const outs = new Map<string, { id: string; other: number }[]>();
  const ins = new Map<string, { id: string; other: number }[]>();
  for (const e of edges) {
    const s = boxes.get(e.source);
    const t = boxes.get(e.target);
    if (!s || !t || !routes.has(e.id)) continue;
    const r = routes.get(e.id)!;
    outs.set(e.source, [...(outs.get(e.source) ?? []), { id: e.id, other: t.y }]);
    (r.route === 'side' ? outs : ins).set(r.route === 'side' ? e.target + '#right' : e.target, [
      ...((r.route === 'side' ? outs : ins).get(
        r.route === 'side' ? e.target + '#right' : e.target,
      ) ?? []),
      { id: e.id, other: s.y },
    ]);
  }
  // Ends on a node's right side (outgoing and same-column arrivals) share one spread.
  // Iterate over a copy: the loop adds and removes entries of the map.
  // oxlint-disable-next-line no-useless-spread
  for (const [k, list] of [...outs])
    if (k.endsWith('#right')) {
      const node = k.slice(0, -6);
      outs.set(node, [...(outs.get(node) ?? []), ...list.map(x => ({ ...x, id: x.id + '#in' }))]);
      outs.delete(k);
    }
  const sideIn = new Map<string, number>();
  for (const [node, list] of outs) {
    const box = boxes.get(node)!;
    const usable = Math.max(0, box.height / 2 - 14);
    list.sort((a, b) => a.other - b.other || a.id.localeCompare(b.id));
    const step = list.length > 1 ? Math.min(14, (2 * usable) / (list.length - 1)) : 0;
    list.forEach((e, i) => {
      const dy = (i - (list.length - 1) / 2) * step;
      if (e.id.endsWith('#in')) sideIn.set(e.id.slice(0, -3), dy);
      else {
        const r = routes.get(e.id);
        if (r) r.dyOut = dy;
      }
    });
  }
  for (const [id, dy] of sideIn) {
    const r = routes.get(id);
    if (r) r.dyIn = dy;
  }
  spread('dyIn', ins);
  return routes;
}
// Label positions that do not overlap each other or the nodes: each label tries the middle of each
// segment of its route (longest first), then the same points shifted up and down; widths are
// estimated from the text (12 px labels).
/** The space an edge label of this text takes when centred on a point. */
export function labelBox(text: string, center: [number, number]): Box {
  const width = text.length * 7.5 + 16;
  const height = 22;
  return { x: center[0] - width / 2, y: center[1] - height / 2, width, height };
}
/** Puts each label on its line clear of other labels and of nodes, stacking when space is tight. */
export function placeLabels(
  items: { id: string; text: string; points: [number, number][] }[],
  boxes: Box[],
) {
  const placed: Box[] = [];
  const out = new Map<string, [number, number]>();
  const hits = (a: Box, b: Box) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const overlapArea = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  for (const item of items) {
    const mids = item.points
      .slice(1)
      .map((p, i) => {
        const q = item.points[i];
        return {
          at: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as [number, number],
          len: Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]),
        };
      })
      .sort((a, b) => b.len - a.len)
      .map(m => m.at);
    const candidates = [
      ...mids,
      ...[22, -22, 44, -44, 66, -66, 88, -88].flatMap(dy =>
        mids.map(m => [m[0], m[1] + dy] as [number, number]),
      ),
    ];
    const box = (c: [number, number]) => labelBox(item.text, c);
    const clearOfLabels = (c: [number, number]) => !placed.some(b => hits(b, box(c)));
    const clearOfNodes = (c: [number, number]) => !boxes.some(b => hits(b, box(c)));
    // When every spot touches another label, the one that covers the least of them is used.
    const leastOverlap = () =>
      candidates.reduce((best, c) => {
        const covered = (at: [number, number]) =>
          placed.reduce((sum, b) => sum + overlapArea(b, box(at)), 0);
        return covered(c) < covered(best) ? c : best;
      }, mids[0]);
    const free =
      candidates.find(c => clearOfLabels(c) && clearOfNodes(c)) ??
      candidates.find(clearOfLabels) ??
      leastOverlap();
    placed.push(box(free));
    out.set(item.id, free);
  }
  return out;
}
