/** Builds left-to-right ELK geometry with fixed row ports; layout runs in ELK's worker. */
// Layout of the lineage canvas: ELK `layered`, left to right, one port per visible row on each
// side of a card (FIXED_POS, so lines leave and enter at their rows). Pure geometry here; the ELK
// run happens in ELK's own worker (elk-worker), off the main thread.
export const CARD_W = 330;
export const HEADER_H = 64;
export const ROW_H = 30;
export const MORE_H = 28;
// An opened card lists all its columns in a scrolling list of at most LIST_ROWS rows, with an
// optional filter box above and a "Show fewer" line below.
export const LIST_ROWS = 10;
export const FILTER_H = 36;
export const FOOT_H = 32;
/** Supplies a card's rows and footer for layout. `rows` are the rows in display order; only the
 * rows in `portRows` carry a port. An opened card lists every column in `rows` and gives
 * `filter` when the list has a filter box. */
export type LayoutCard = {
  id: string;
  rows: string[];
  portRows: string[];
  more: boolean;
  open?: { filter: boolean; visibleRows: number };
};
/** Identifies row endpoints and their containing cards for layout. */
export type LayoutEdge = { id: string; from: string; to: string; fromCard: string; toCard: string };
/** Returns the top and height of an opened card's list. */
export const listBox = (columnCount: number, filter: boolean, visibleRows = LIST_ROWS) => ({
  top: HEADER_H + (filter ? FILTER_H : 0),
  height: Math.min(columnCount, visibleRows) * ROW_H,
});
/** Computes a card's height from its rows and visible footer sections. */
export function cardHeight(c: LayoutCard) {
  if (c.open) {
    const box = listBox(c.rows.length, c.open.filter, c.open.visibleRows);
    return box.top + box.height + FOOT_H;
  }
  return HEADER_H + c.rows.length * ROW_H + (c.more ? MORE_H : 0);
}

/** Returns a row port's vertical offset, using the header for a column-less card. A row of an
 * opened card that is out of the list's view sits on the list's edge. */
export function portY(c: LayoutCard, row: string) {
  if (row === c.id) return HEADER_H / 2;
  const i = c.rows.indexOf(row);
  if (c.open) {
    const box = listBox(c.rows.length, c.open.filter, c.open.visibleRows);
    return box.top + Math.min(Math.max(i * ROW_H + ROW_H / 2, 0), box.height);
  }
  if (i >= 0) return HEADER_H + i * ROW_H + ROW_H / 2;
  return HEADER_H + c.rows.length * ROW_H + MORE_H / 2;
}
/** Builds an ELK graph with fixed ports aligned to visible card rows. */
export function elkGraph(cards: LayoutCard[], edges: LayoutEdge[]) {
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'POLYLINE',
      'elk.layered.spacing.nodeNodeBetweenLayers': '230',
      'elk.spacing.nodeNode': '34',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.semiInteractive': 'false',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '60',
    },
    children: cards.map(c => ({
      id: c.id,
      width: CARD_W,
      height: cardHeight(c),
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [c.id, ...c.portRows, ...(c.more ? [c.id + '/#more'] : [])].flatMap(r => [
        {
          id: r + ':in',
          x: 0,
          y: portY(c, r),
          width: 1,
          height: 1,
          layoutOptions: { 'elk.port.side': 'WEST' },
        },
        {
          id: r + ':out',
          x: CARD_W - 1,
          y: portY(c, r),
          width: 1,
          height: 1,
          layoutOptions: { 'elk.port.side': 'EAST' },
        },
      ]),
    })),
    edges: edges.map(e => ({ id: e.id, sources: [e.from + ':out'], targets: [e.to + ':in'] })),
  };
}
/** Maps card identifiers to layout coordinates, and line identifiers to the bend points of the
 * route the layout chose for them. */
export type LayoutResult = {
  positions: Record<string, { x: number; y: number }>;
  routes: Record<string, { x: number; y: number }[]>;
};
/** Extracts card positions and line routes from an ELK layout result. */
export const positionsOf = (result: any): LayoutResult => ({
  positions: Object.fromEntries(
    (result.children ?? []).map((n: any) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]),
  ),
  routes: Object.fromEntries(
    (result.edges ?? []).map((e: any) => [
      e.id,
      (e.sections?.[0]?.bendPoints ?? []).map((p: any) => ({ x: p.x, y: p.y })),
    ]),
  ),
});
