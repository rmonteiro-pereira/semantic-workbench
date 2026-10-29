/** Assigns separate orthogonal routes and rounded corners to neighborhood relationships. */
import type { Link } from './layout';
import type { Pos } from './incremental-layout';
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
  const corners = points.filter((pt, i) => i === 0 || pt[0] !== points[i - 1][0] || pt[1] !== points[i - 1][1]);
  let pathData = `M ${corners[0][0]},${corners[0][1]}`;
  for (let i = 1; i < corners.length; i++) {
    const [x, y] = corners[i];
    if (i === corners.length - 1) {
      pathData += ` L ${x},${y}`;
      break;
    }
    const [px, py] = corners[i - 1];
    const [nx, ny] = corners[i + 1];
    const cornerRadius = Math.min(radius, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
    const ax = x - Math.sign(x - px) * cornerRadius;
    const ay = y - Math.sign(y - py) * cornerRadius;
    const bx = x + Math.sign(nx - x) * cornerRadius;
    const by = y + Math.sign(ny - y) * cornerRadius;
    pathData += ` L ${ax},${ay} Q ${x},${y} ${bx},${by}`;
  }
  return pathData;
}
/** Returns route vertices and an initial label position for the current endpoints. */
export function routePoints(source: Pos, target: Pos, edgeRoute: EdgeRoute): { points: [number, number][]; label: [number, number] } {
  const { x: sx, y: sy0 } = source;
  const { x: tx, y: ty0 } = target;
  const sy = sy0 + (edgeRoute.dyOut ?? 0);
  const ty = ty0 + (edgeRoute.dyIn ?? 0);
  // Between two nodes of one column: out of the source's right side, along the column, into the
  // target's right side.
  if (edgeRoute.route === 'side') {
    const ey = edgeRoute.endY + (edgeRoute.dyIn ?? 0);
    return {
      points: [
        [sx, sy],
        [edgeRoute.laneX, sy],
        [edgeRoute.laneX, ey],
        [edgeRoute.endX, ey],
      ],
      label: [edgeRoute.laneX, (sy + ey) / 2],
    };
  }
  if (edgeRoute.route === 'short')
    return {
      points: [
        [sx, sy],
        [edgeRoute.bendX, sy],
        [edgeRoute.bendX, ty],
        [tx, ty],
      ],
      label: [edgeRoute.bendX, (sy + ty) / 2],
    };
  const lane = edgeRoute.route === 'loop' ? edgeRoute.top : edgeRoute.laneY;
  return {
    points: [
      [sx, sy],
      [edgeRoute.outX, sy],
      [edgeRoute.outX, lane],
      [edgeRoute.inX, lane],
      [edgeRoute.inX, ty],
      [tx, ty],
    ],
    label: [(edgeRoute.outX + edgeRoute.inX) / 2, lane],
  };
}
// Routes for a set of edges between laid-out nodes. Boxes are the node rectangles; handles sit on
// the right (source) and left (target) edges at mid height.
/** Records a positioned rectangle used for graph layout. */
export type Box = { x: number; y: number; width: number; height: number };
// Edges meeting one card side are spread this far apart (an arrowhead is 14 px wide) and stay this far from its corners.
const END_SPACING = 14;
const END_MARGIN = 10;
/** The card height that keeps this many edge ends on one side at full spacing. */
export const heightForEdgeEnds = (count: number) => Math.max(0, count - 1) * END_SPACING + 2 * END_MARGIN;
/** Height of the nth self loop above a box. */
const loopTop = (box: Box, index: number) => box.y - 14 - index * 10;

/**
 * Chooses the height of each long-edge lane. A lane runs just beyond the boxes it passes, not
 * around the whole canvas, clears the self loops above those boxes and moves outward past any
 * lane already placed over the same stretch.
 */
function createLanePlacer(boxes: Map<string, Box>, edges: { source: string; target: string }[]) {
  const loopCount = new Map<string, number>();
  for (const edge of edges) if (edge.source === edge.target) loopCount.set(edge.source, (loopCount.get(edge.source) ?? 0) + 1);
  const entries = [...boxes];
  const clearanceAbove = ([id, box]: [string, Box]) => {
    const loops = loopCount.get(id) ?? 0;
    return loops ? loopTop(box, loops - 1) - 8 : box.y;
  };
  const placed: { y: number; left: number; right: number; below: boolean }[] = [];
  return (left: number, right: number, below: boolean) => {
    const passed = entries.filter(([, b]) => b.x + b.width > left && b.x < right);
    const reach = passed.length ? passed : entries;
    let y = below ? Math.max(...reach.map(([, b]) => b.y + b.height)) + 22 : Math.min(...reach.map(clearanceAbove)) - 22;
    const shares = (lane: (typeof placed)[number]) => lane.below === below && lane.left < right && left < lane.right && Math.abs(lane.y - y) < 16;
    while (placed.some(shares)) y += below ? 16 : -16;
    placed.push({ y, left, right, below });
    return y;
  };
}

/** Assigns edge lanes and handle offsets between positioned node rectangles. */
export function assignRoutes(edges: (Link & { id: string })[], boxes: Map<string, Box>): Map<string, EdgeRoute> {
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
  const need = (range: readonly [number, number], gapNeed: Need) => {
    const gapKey = range.map(Math.round).join(':');
    const gap = gaps.get(gapKey) ?? { range, needs: [] };
    gap.needs.push(gapNeed);
    gaps.set(gapKey, gap);
  };
  const placeLane = createLanePlacer(boxes, edges);
  for (const edge of [...edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const sourceBox = boxes.get(edge.source);
    const targetBox = boxes.get(edge.target);
    if (!sourceBox || !targetBox) continue;
    const sx = sourceBox.x + sourceBox.width;
    const sy = sourceBox.y + sourceBox.height / 2;
    const tx = targetBox.x;
    const ty = targetBox.y + targetBox.height / 2;
    if (edge.source === edge.target) {
      // A self loop sits just above its own card.
      routes.set(edge.id, { route: 'loop', outX: 0, inX: 0, top: sourceBox.y - 14 });
      need(rightOf(sx), { edge: edge.id, slot: 'outX', order: sy });
      need(leftOf(tx), { edge: edge.id, slot: 'inX', order: ty });
      continue;
    }
    // Same column: a lane of its own just right of the column.
    if (Math.abs(sourceBox.x - targetBox.x) < 4) {
      routes.set(edge.id, { route: 'side', laneX: 0, endX: targetBox.x + targetBox.width, endY: ty });
      need(rightOf(Math.max(sx, targetBox.x + targetBox.width)), {
        edge: edge.id,
        slot: 'laneX',
        order: (sy + ty) / 2,
      });
      continue;
    }
    // Forward to the next column only: bend in the gap. Anything else gets a lane of its own.
    if (tx - sx > 24 && !all.some(b => b !== sourceBox && b !== targetBox && b.x > sx && b.x + b.width < tx)) {
      routes.set(edge.id, { route: 'short', bendX: 0 });
      need([sx, tx], { edge: edge.id, slot: 'bendX', order: sy + ty });
      continue;
    }
    const backward = tx <= sx;
    routes.set(edge.id, {
      route: 'lane',
      laneY: placeLane(Math.min(sx, tx), Math.max(sx, tx), backward),
      outX: 0,
      inX: 0,
    });
    need(rightOf(sx), { edge: edge.id, slot: 'outX', order: sy });
    need(leftOf(tx), { edge: edge.id, slot: 'inX', order: ty });
  }
  // Loops climb just above their node, each at its own height.
  const loopHeights = new Map<string, number>();
  for (const edge of edges)
    if (edge.source === edge.target && routes.get(edge.id)?.route === 'loop') {
      const loopIndex = loopHeights.get(edge.source) ?? 0;
      loopHeights.set(edge.source, loopIndex + 1);
      (routes.get(edge.id) as any).top = loopTop(boxes.get(edge.source)!, loopIndex);
    }
  // Spread every vertical segment of a gap evenly across it, ordered to limit crossings.
  for (const { range, needs } of gaps.values()) {
    needs.sort((a, b) => a.order - b.order || a.edge.localeCompare(b.edge));
    const [rangeStart, rangeEnd] = range;
    const inner = Math.max(4, rangeEnd - rangeStart - 24);
    const step = needs.length > 1 ? Math.min(12, inner / (needs.length - 1)) : 0;
    const start = (rangeStart + rangeEnd) / 2 - (step * (needs.length - 1)) / 2;
    needs.forEach((n, i) => {
      (routes.get(n.edge) as any)[n.slot] = start + i * step;
    });
  }
  // Spread edge ends along each node side, ordered by the other end's height, so no two edges
  // share a start or end segment.
  const spread = (key: 'dyOut' | 'dyIn', ends: Map<string, { id: string; other: number }[]>) => {
    for (const [node, list] of ends) {
      const box = boxes.get(node)!;
      const usable = Math.max(0, box.height / 2 - END_MARGIN);
      list.sort((a, b) => a.other - b.other || a.id.localeCompare(b.id));
      const step = list.length > 1 ? Math.min(END_SPACING, (2 * usable) / (list.length - 1)) : 0;
      list.forEach((e, i) => {
        const r = routes.get(e.id);
        if (r) r[key] = (i - (list.length - 1) / 2) * step;
      });
    }
  };
  const outs = new Map<string, { id: string; other: number }[]>();
  const ins = new Map<string, { id: string; other: number }[]>();
  for (const edge of edges) {
    const sourceBox = boxes.get(edge.source);
    const targetBox = boxes.get(edge.target);
    if (!sourceBox || !targetBox || !routes.has(edge.id)) continue;
    const edgeRoute = routes.get(edge.id)!;
    outs.set(edge.source, [...(outs.get(edge.source) ?? []), { id: edge.id, other: targetBox.y }]);
    (edgeRoute.route === 'side' ? outs : ins).set(edgeRoute.route === 'side' ? edge.target + '#right' : edge.target, [
      ...((edgeRoute.route === 'side' ? outs : ins).get(edgeRoute.route === 'side' ? edge.target + '#right' : edge.target) ?? []),
      { id: edge.id, other: sourceBox.y },
    ]);
  }
  // Ends on a node's right side (outgoing and same-column arrivals) share one spread.
  // Iterate over a copy: the loop adds and removes entries of the map.
  // oxlint-disable-next-line no-useless-spread
  for (const [key, list] of [...outs])
    if (key.endsWith('#right')) {
      const node = key.slice(0, -6);
      outs.set(node, [...(outs.get(node) ?? []), ...list.map(x => ({ ...x, id: x.id + '#in' }))]);
      outs.delete(key);
    }
  const sideIn = new Map<string, number>();
  for (const [node, list] of outs) {
    const box = boxes.get(node)!;
    const usable = Math.max(0, box.height / 2 - END_MARGIN);
    list.sort((a, b) => a.other - b.other || a.id.localeCompare(b.id));
    const step = list.length > 1 ? Math.min(END_SPACING, (2 * usable) / (list.length - 1)) : 0;
    list.forEach((port, i) => {
      const dy = (i - (list.length - 1) / 2) * step;
      if (port.id.endsWith('#in')) sideIn.set(port.id.slice(0, -3), dy);
      else {
        const edgeRoute = routes.get(port.id);
        if (edgeRoute) edgeRoute.dyOut = dy;
      }
    });
  }
  for (const [id, dy] of sideIn) {
    const edgeRoute = routes.get(id);
    if (edgeRoute) edgeRoute.dyIn = dy;
  }
  spread('dyIn', ins);
  return routes;
}
// Label positions that do not overlap each other or the nodes: each label tries the middle of each
// segment of its route (longest first), then the same points shifted up and down; widths are
// estimated from the text (12 px labels).
/** The space an edge label of this text takes when centred on a point. */
export function labelBox(text: string, center: [number, number], labelScale = 1): Box {
  const width = (text.length * 7.5 + 16) * labelScale;
  const height = 22 * labelScale;
  return { x: center[0] - width / 2, y: center[1] - height / 2, width, height };
}
function labelCandidates(points: [number, number][]) {
  return points
    .slice(1)
    .map((point, index) => {
      const previous = points[index];
      return {
        center: [(point[0] + previous[0]) / 2, (point[1] + previous[1]) / 2] as [number, number],
        length: Math.abs(point[0] - previous[0]) + Math.abs(point[1] - previous[1]),
      };
    })
    .sort((first, second) => second.length - first.length)
    .map(segment => segment.center);
}

function rectanglesOverlap(first: Box, second: Box) {
  return first.x < second.x + second.width && second.x < first.x + first.width && first.y < second.y + second.height && second.y < first.y + first.height;
}

function clearLabelPosition(text: string, candidates: [number, number][], obstacles: Box[], labelScale: number): [number, number] {
  const clear = (position: [number, number]) => !obstacles.some(obstacle => rectanglesOverlap(obstacle, labelBox(text, position, labelScale)));
  const onRoute = candidates.find(clear);
  if (onRoute) return onRoute;
  // Dense routes need more than a fixed number of lanes to keep enlarged labels off cards.
  for (let offset = 22 * labelScale; ; offset += 22 * labelScale) {
    for (const [centerX, centerY] of candidates) {
      const above: [number, number] = [centerX, centerY - offset];
      if (clear(above)) return above;
      const below: [number, number] = [centerX, centerY + offset];
      if (clear(below)) return below;
    }
  }
}

/** Puts each label clear of other labels and nodes, adding lanes when routes are crowded. */
export function placeLabels(items: { id: string; text: string; points: [number, number][] }[], boxes: Box[], labelScale = 1) {
  const obstacles = [...boxes];
  const positions = new Map<string, [number, number]>();
  for (const item of items) {
    const candidates = labelCandidates(item.points);
    if (!candidates.length) continue;
    const position = clearLabelPosition(item.text, candidates, obstacles, labelScale);
    obstacles.push(labelBox(item.text, position, labelScale));
    positions.set(item.id, position);
  }
  return positions;
}

/** Finds the closest point on an orthogonal route for a displaced label's leader. */
export function nearestRoutePoint(points: [number, number][], center: [number, number]) {
  let nearest = points[0];
  let distance = Infinity;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const candidate: [number, number] = [
      Math.max(Math.min(start[0], end[0]), Math.min(Math.max(start[0], end[0]), center[0])),
      Math.max(Math.min(start[1], end[1]), Math.min(Math.max(start[1], end[1]), center[1])),
    ];
    const reach = Math.hypot(candidate[0] - center[0], candidate[1] - center[1]);
    if (reach >= distance) continue;
    nearest = candidate;
    distance = reach;
  }
  return nearest;
}

/** Keeps an entire label inside the visible canvas instead of showing clipped fragments. */
export function labelInViewport(box: Box, transform: [number, number, number], width: number, height: number) {
  const [offsetX, offsetY, zoom] = transform;
  return box.x * zoom + offsetX >= 2 && box.y * zoom + offsetY >= 2 && (box.x + box.width) * zoom + offsetX <= width - 2 && (box.y + box.height) * zoom + offsetY <= height - 2;
}
