/** Places added nodes beside their origins without moving nodes already on the canvas. */
// Incremental placement: new nodes go into the column beside the node they were expanded from
// (left for incoming, right for outgoing), at the free row nearest to that node's row. Placed
// nodes never move; the result is deterministic for the same input order.
/** Records a node's canvas coordinates. */
export type Pos = { x: number; y: number };
/** Defines horizontal and vertical spacing for incremental placement. */
export type Grid = { column: number; row: number };
const free = (positions: Map<string, Pos>, x: number, y: number, grid: Grid) => {
  for (const position of positions.values()) if (Math.abs(position.x - x) < grid.column / 2 && Math.abs(position.y - y) < grid.row / 2) return false;
  return true;
};
// Rows tried around a row: 0, +1, -1, +2, -2, …
function nearestFree(positions: Map<string, Pos>, x: number, y: number, grid: Grid) {
  for (let k = 0; k < 10_000; k++) {
    const offset = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2);
    const cy = y + offset * grid.row;
    if (free(positions, x, cy, grid)) return { x, y: cy };
  }
  return { x, y };
}
// `items` in the order to place; `side` -1 places left of `from`, 1 right, and `step` (default 1)
// how many columns away (Full pierce places by step distance).
/** Places new nodes beside their origin without moving existing positions. */
export function placeNew(positions: Map<string, Pos>, from: string, items: { id: string; side: -1 | 1; step?: number }[], grid: Grid): Map<string, Pos> {
  const out = new Map(positions);
  const origin = out.get(from) ?? { x: 0, y: 0 };
  for (const it of items) {
    if (out.has(it.id)) continue;
    out.set(it.id, nearestFree(out, origin.x + it.side * (it.step ?? 1) * grid.column, origin.y, grid));
  }
  return out;
}
/** The grid spacing plus the most nodes one column holds before the layer starts another column. */
export type LayerLayout = Grid & { rows?: number };
// Full pierce placement: nodes by step distance, each step in columns of at most `rows` nodes,
// further steps further out; within the free space, never moving placed nodes.
/** Places traversal layers outward in bounded columns without moving existing nodes. */
export function placeLayers(positions: Map<string, Pos>, from: string, items: { id: string; side: -1 | 1; step: number }[], layout: LayerLayout): Map<string, Pos> {
  const { rows = 8, ...grid } = layout;
  const out = new Map(positions);
  const origin = out.get(from) ?? { x: 0, y: 0 };
  for (const side of [1, -1] as const) {
    const mine = items.filter(i => i.side === side && !out.has(i.id));
    const steps = [...new Set(mine.map(i => i.step))].sort((a, b) => a - b);
    let column = 0;
    for (const step of steps) {
      const layer = mine.filter(i => i.step === step);
      const cols = Math.ceil(layer.length / rows);
      layer.forEach((it, i) => {
        const itemColumn = column + Math.floor(i / rows);
        const inCol = Math.min(rows, layer.length - Math.floor(i / rows) * rows);
        const itemRow = i % rows;
        out.set(it.id, nearestFree(out, origin.x + side * (itemColumn + 1) * grid.column, origin.y + (itemRow - (inCol - 1) / 2) * grid.row, grid));
      });
      column += cols;
    }
  }
  return out;
}
// Cards of different heights (lineage): a new card goes beside its origin (right: after it; left:
// before it) at the nearest vertical slot, scanning down and up in `step` px, that overlaps no
// placed card. Placed cards never move.
/** Records a positioned rectangle used for graph layout. */
export type Box = { x: number; y: number; w: number; h: number };
/** Places variable-height cards in nearby free slots without moving existing cards. */
export function placeBoxes(boxes: Map<string, Box>, from: string, items: { id: string; side: -1 | 1; w: number; h: number }[], gapX = 110, gapY = 24, step = 24): Map<string, Box> {
  const out = new Map(boxes);
  const fromBox = out.get(from) ?? { x: 0, y: 0, w: 0, h: 0 };
  const hits = (candidate: Box) => {
    for (const placedBox of out.values())
      if (
        candidate.x < placedBox.x + placedBox.w + gapX / 2 &&
        candidate.x + candidate.w + gapX / 2 > placedBox.x &&
        candidate.y < placedBox.y + placedBox.h + gapY &&
        candidate.y + candidate.h + gapY > placedBox.y
      )
        return true;
    return false;
  };
  for (const it of items) {
    if (out.has(it.id)) continue;
    const x = it.side > 0 ? fromBox.x + fromBox.w + gapX : fromBox.x - gapX - it.w;
    let placed: Box | null = null;
    for (let k = 0; k < 4000 && !placed; k++) {
      const dy = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
      const candidate = { x, y: fromBox.y + dy, w: it.w, h: it.h };
      if (!hits(candidate)) placed = candidate;
    }
    out.set(it.id, placed ?? { x, y: fromBox.y, w: it.w, h: it.h });
  }
  return out;
}
