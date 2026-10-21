/** Builds left-to-right ELK geometry with fixed row ports; layout runs in ELK's worker. */
// Layout of the lineage canvas: ELK `layered`, left to right, one port per visible row on each
// side of a card (FIXED_POS, so lines leave and enter at their rows). Pure geometry here; the ELK
// run happens in ELK's own worker (elk-worker), off the main thread.
export const CARD_W = 400;
export const HEADER_H = 64;
export const ROW_H = 30;
export const PAGER_H = 32;
export const MORE_H = 28;
/** Supplies a card's visible rows and optional footer sections for layout. */
export type LayoutCard = { id: string; rows: string[]; pager: boolean; more: boolean };
/** Identifies row endpoints and their containing cards for layout. */
export type LayoutEdge = { id: string; from: string; to: string; fromCard: string; toCard: string };
/** Computes a card's height from its rows and visible footer sections. */
export const cardHeight = (c: LayoutCard) =>
  HEADER_H + c.rows.length * ROW_H + (c.more ? MORE_H : 0) + (c.pager ? PAGER_H : 0);

/** Returns a row port's vertical offset, using the header for a column-less card. */
export function portY(c: LayoutCard, row: string) {
  if (row === c.id) return HEADER_H / 2;
  const i = c.rows.indexOf(row);
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
      'elk.edgeRouting': 'SPLINES',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
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
      ports: [c.id, ...c.rows, ...(c.more ? [c.id + '/#more'] : [])].flatMap(r => [
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
/** Maps card identifiers to layout coordinates. */
export type LayoutResult = { positions: Record<string, { x: number; y: number }> };
/** Extracts card positions from an ELK layout result. */
export const positionsOf = (result: any): LayoutResult => ({
  positions: Object.fromEntries(
    (result.children ?? []).map((n: any) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]),
  ),
});
