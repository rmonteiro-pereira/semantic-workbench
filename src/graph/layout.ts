/** Places graph nodes in bounded columns so broad layers remain readable. */
/** Identifies the source and target nodes of an edge. */
export type Link = { source: string; target: string };
// Linear-time layered layout. Cyclic components get a deterministic starting node. Edges
// discovered after a node has been placed do not continually increase its rank.
/** Assigns stable layered positions without repeatedly increasing ranks around cycles. */
export function layoutGraph(ids: string[], edges: Link[]) {
  const outgoing = new Map(ids.map(id => [id, [] as string[]]));
  const incoming = new Map(ids.map(id => [id, 0]));
  for (const e of edges)
    if (outgoing.has(e.source) && outgoing.has(e.target) && e.source !== e.target) {
      outgoing.get(e.source)!.push(e.target);
      incoming.set(e.target, incoming.get(e.target)! + 1);
    }
  const ranks = new Map<string, number>();
  const queue: string[] = [];
  for (const id of ids)
    if (!incoming.get(id)) {
      ranks.set(id, 0);
      queue.push(id);
    }
  let head = 0;
  function drain() {
    while (head < queue.length) {
      const id = queue[head++];
      for (const target of outgoing.get(id)!)
        if (!ranks.has(target)) {
          ranks.set(target, ranks.get(id)! + 1);
          queue.push(target);
        }
    }
  }
  drain();
  for (const id of ids)
    if (!ranks.has(id)) {
      ranks.set(id, 0);
      queue.push(id);
      drain();
    }
  // Wrap broad layers into short columns so a hub's neighbors do not form a tall strip that
  // becomes unreadable when fitted to the canvas.
  const maxRows = ids.length <= 200 ? 4 : Math.ceil(Math.sqrt(ids.length));
  const counts = new Map<number, number>();
  let maxRank = 0;
  for (const rank of ranks.values()) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
    maxRank = Math.max(maxRank, rank);
  }
  const columns = new Map<number, number>();
  let offset = 0;
  for (let rank = 0; rank <= maxRank; rank++) {
    columns.set(rank, offset);
    offset += Math.ceil((counts.get(rank) ?? 0) / maxRows);
  }
  const rows = new Map<number, number>();
  return ids.map(id => {
    const rank = ranks.get(id)!;
    const row = rows.get(rank) ?? 0;
    rows.set(rank, row + 1);
    return {
      id,
      position: {
        x: (columns.get(rank)! + Math.floor(row / maxRows)) * 330,
        y: (row % maxRows) * 150,
      },
    };
  });
}
// Neighborhood layout: the center in the middle column, neighbors that only point at it on the
// left, neighbors it points at on the right; two-way neighbors join the shorter side. Each side
// wraps outward into extra columns, and every column is centered on the center's row.
export const NEIGHBOR_COLUMN = 400;
export const NEIGHBOR_ROW = 180;
export const NEIGHBOR_ROWS = 6;
/** Places incoming and outgoing neighbors in bounded columns around the center. */
export function neighborhoodLayout(
  center: string,
  incoming: string[],
  outgoing: string[],
  both: string[] = [],
) {
  const left = [...incoming];
  const right = [...outgoing];
  for (const id of both) (left.length < right.length ? left : right).push(id);
  const rows = Math.min(NEIGHBOR_ROWS, Math.max(1, left.length, right.length));
  // Equalize the outer extent of both sides without adding rows or changing edge direction.
  const columns = Math.max(Math.ceil(left.length / rows), Math.ceil(right.length / rows));
  const positions = new Map<string, { x: number; y: number }>([
    [center, { x: 0, y: ((rows - 1) * NEIGHBOR_ROW) / 2 }],
  ]);
  const place = (ids: string[], side: -1 | 1) => {
    const spacing = columns / Math.max(1, Math.ceil(ids.length / rows));
    for (let c = 0; c * rows < ids.length; c++) {
      const column = ids.slice(c * rows, (c + 1) * rows);
      const top = ((rows - column.length) * NEIGHBOR_ROW) / 2;
      column.forEach((id, r) =>
        positions.set(id, {
          x: side * (c + 1) * NEIGHBOR_COLUMN * spacing,
          y: top + r * NEIGHBOR_ROW,
        }),
      );
    }
  };
  place(left, -1);
  place(right, 1);
  return positions;
}
