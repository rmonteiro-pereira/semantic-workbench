// Incremental placement (FR-018, SC-011, research R5): new nodes go into the column beside the node
// they were expanded from (left for incoming, right for outgoing), at the free row nearest to that
// node's row. Placed nodes never move; the result is deterministic for the same input order.
export type Pos = { x: number; y: number };
export type Grid = { column: number; row: number };
const free = (positions: Map<string, Pos>, x: number, y: number, g: Grid) => {
  for (const p of positions.values())
    if (Math.abs(p.x - x) < g.column / 2 && Math.abs(p.y - y) < g.row / 2) return false;
  return true;
};
// Rows tried around a row: 0, +1, -1, +2, -2, …
function nearestFree(positions: Map<string, Pos>, x: number, y: number, g: Grid) {
  for (let k = 0; k < 10_000; k++) {
    const offset = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2);
    const cy = y + offset * g.row;
    if (free(positions, x, cy, g)) return { x, y: cy };
  }
  return { x, y };
}
// `items` in the order to place; `side` -1 places left of `from`, 1 right, and `step` (default 1)
// how many columns away (Full pierce places by step distance).
export function placeNew(
  positions: Map<string, Pos>,
  from: string,
  items: { id: string; side: -1 | 1; step?: number }[],
  g: Grid,
): Map<string, Pos> {
  const out = new Map(positions);
  const origin = out.get(from) ?? { x: 0, y: 0 };
  for (const it of items) {
    if (out.has(it.id)) continue;
    out.set(it.id, nearestFree(out, origin.x + it.side * (it.step ?? 1) * g.column, origin.y, g));
  }
  return out;
}
// Full pierce placement: nodes by step distance, each step in columns of at most `rows` nodes,
// further steps further out; within the free space, never moving placed nodes.
export function placeLayers(
  positions: Map<string, Pos>,
  from: string,
  items: { id: string; side: -1 | 1; step: number }[],
  g: Grid,
  rows = 8,
): Map<string, Pos> {
  const out = new Map(positions);
  const origin = out.get(from) ?? { x: 0, y: 0 };
  for (const side of [1, -1] as const) {
    const mine = items.filter(i => i.side === side && !out.has(i.id));
    const steps = [...new Set(mine.map(i => i.step))].sort((a, b) => a - b);
    let column = 0;
    for (const s of steps) {
      const layer = mine.filter(i => i.step === s);
      const cols = Math.ceil(layer.length / rows);
      layer.forEach((it, i) => {
        const c = column + Math.floor(i / rows);
        const inCol = Math.min(rows, layer.length - Math.floor(i / rows) * rows);
        const r = i % rows;
        out.set(
          it.id,
          nearestFree(
            out,
            origin.x + side * (c + 1) * g.column,
            origin.y + (r - (inCol - 1) / 2) * g.row,
            g,
          ),
        );
      });
      column += cols;
    }
  }
  return out;
}
// Cards of different heights (lineage): a new card goes beside its origin (right: after it; left:
// before it) at the nearest vertical slot, scanning down and up in `step` px, that overlaps no
// placed card. Placed cards never move.
export type Box = { x: number; y: number; w: number; h: number };
export function placeBoxes(
  boxes: Map<string, Box>,
  from: string,
  items: { id: string; side: -1 | 1; w: number; h: number }[],
  gapX = 110,
  gapY = 24,
  step = 24,
): Map<string, Box> {
  const out = new Map(boxes);
  const o = out.get(from) ?? { x: 0, y: 0, w: 0, h: 0 };
  const hits = (b: Box) => {
    for (const p of out.values())
      if (
        b.x < p.x + p.w + gapX / 2 &&
        b.x + b.w + gapX / 2 > p.x &&
        b.y < p.y + p.h + gapY &&
        b.y + b.h + gapY > p.y
      )
        return true;
    return false;
  };
  for (const it of items) {
    if (out.has(it.id)) continue;
    const x = it.side > 0 ? o.x + o.w + gapX : o.x - gapX - it.w;
    let placed: Box | null = null;
    for (let k = 0; k < 4000 && !placed; k++) {
      const dy = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
      const b = { x, y: o.y + dy, w: it.w, h: it.h };
      if (!hits(b)) placed = b;
    }
    out.set(it.id, placed ?? { x, y: o.y, w: it.w, h: it.h });
  }
  return out;
}
