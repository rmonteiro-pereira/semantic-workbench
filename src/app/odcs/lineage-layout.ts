/** Builds left-to-right ELK geometry with row ports; layout runs in ELK's worker. */
import type { LineageCard, LineageColumn } from './lineage';
// Layout of the lineage canvas: ELK `layered`, left to right, one port per visible row on each
// side of a card (FIXED_POS, so lines leave and enter at their rows). Pure geometry here; the ELK
// run happens in ELK's own worker (elk-worker), off the main thread.
export const CARD_W = 360;
export const HEADER_H = 64;
export const ROW_H = 52;
export const MORE_H = 28;
// An opened card lists all its columns in a scrolling list of at most LIST_ROWS rows, with an
// optional filter box above and a "Show fewer" line below.
export const LIST_ROWS = 10;
export const FILTER_H = 36;
export const FOOT_H = 32;
const textLines = (text: string, width: number, charWidth: number) =>
  text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / Math.max(1, Math.floor(width / charWidth)))), 0);
const metadataLines = (texts: string[], width: number) => {
  let lines = 0;
  let used = 0;
  for (const text of texts) {
    const size = text.length * 8 + 14;
    if (!lines || used + size > width) {
      lines++;
      used = 0;
    }
    lines += Math.max(0, Math.ceil(size / width) - 1);
    used += Math.min(size, width) + 6;
  }
  return lines;
};
/** Reserves full wrapped names and constraint labels before placing cards and row ports. */
export const columnHeight = (column: LineageColumn) =>
  Math.max(ROW_H, 8 + textLines(column.path, CARD_W - 20, 8) * 18 + metadataLines([...(column.type ? [column.type] : []), ...column.badges.map(b => b.label)], CARD_W - 20) * 20);
/** Keeps the complete title, detail and badges clear of the header actions. */
export const cardHeaderHeight = (card: LineageCard) =>
  Math.max(
    HEADER_H,
    14 +
      16 +
      textLines(card.label, CARD_W - 116, 9) * 18 +
      (card.detail ? textLines(card.detail, CARD_W - 116, 8) * 16 : 0) +
      metadataLines(
        (card.badges ?? []).map(b => b.label),
        CARD_W - 116,
      ) *
        20,
  );
/** Gives layout and rendered rows exactly the same geometry. */
export const cardGeometry = (card: LineageCard, columns: LineageColumn[]) => ({
  headerHeight: cardHeaderHeight(card),
  rowHeights: columns.map(columnHeight),
});
/** Supplies a card's rows and footer for layout. `rows` are the rows in display order; only the
 * rows in `portRows` carry a port. An opened card lists every column in `rows` and gives
 * `filter` when the list has a filter box. */
export type LayoutCard = {
  id: string;
  rows: string[];
  portRows: string[];
  more: boolean;
  headerHeight?: number;
  rowHeights?: number[];
  open?: { filter: boolean; visibleRows: number };
};
/** Identifies row endpoints and their containing cards for layout. */
export type LayoutEdge = { id: string; from: string; to: string; fromCard: string; toCard: string };
/** Returns the top and height of an opened card's list. */
export const listBox = (columnCount: number, filter: boolean, visibleRows = LIST_ROWS, headerHeight = HEADER_H, rowHeights?: number[]) => ({
  top: headerHeight + (filter ? FILTER_H : 0),
  height: rowHeights ? rowHeights.slice(0, visibleRows).reduce((sum, height) => sum + height, 0) : Math.min(columnCount, visibleRows) * ROW_H,
});
/** Returns the offset before a row, shared by collapsed and virtualized lists. */
export const rowTop = (card: LayoutCard, index: number) => card.rowHeights?.slice(0, index).reduce((sum, height) => sum + height, 0) ?? index * ROW_H;
/** Computes a card's height from its rows and visible footer sections. */
export function cardHeight(layoutCard: LayoutCard) {
  if (layoutCard.open) {
    const box = listBox(layoutCard.rows.length, layoutCard.open.filter, layoutCard.open.visibleRows, layoutCard.headerHeight, layoutCard.rowHeights);
    return box.top + box.height + FOOT_H;
  }
  return (layoutCard.headerHeight ?? HEADER_H) + rowTop(layoutCard, layoutCard.rows.length) + (layoutCard.more ? MORE_H : 0);
}

/** Returns a row port's vertical offset, using the header for a column-less card. A row of an
 * opened card that is out of the list's view sits on the list's edge. */
export function portY(layoutCard: LayoutCard, row: string) {
  const header = layoutCard.headerHeight ?? HEADER_H;
  if (row === layoutCard.id) return header / 2;
  const i = layoutCard.rows.indexOf(row);
  if (layoutCard.open) {
    const box = listBox(layoutCard.rows.length, layoutCard.open.filter, layoutCard.open.visibleRows, header, layoutCard.rowHeights);
    return box.top + Math.min(Math.max(rowTop(layoutCard, Math.max(0, i)) + (layoutCard.rowHeights?.[i] ?? ROW_H) / 2, 0), box.height);
  }
  if (i >= 0) return header + rowTop(layoutCard, i) + (layoutCard.rowHeights?.[i] ?? ROW_H) / 2;
  return header + rowTop(layoutCard, layoutCard.rows.length) + MORE_H / 2;
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
    children: cards.map(card => ({
      id: card.id,
      width: CARD_W,
      height: cardHeight(card),
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [card.id, ...card.portRows, ...(card.more ? [card.id + '/#more'] : [])].flatMap(row => [
        {
          id: row + ':in',
          x: 0,
          y: portY(card, row),
          width: 1,
          height: 1,
          layoutOptions: { 'elk.port.side': 'WEST' },
        },
        {
          id: row + ':out',
          x: CARD_W - 1,
          y: portY(card, row),
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
  positions: Object.fromEntries((result.children ?? []).map((n: any) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])),
  routes: Object.fromEntries((result.edges ?? []).map((e: any) => [e.id, (e.sections?.[0]?.bendPoints ?? []).map((p: any) => ({ x: p.x, y: p.y }))])),
});
