/** Chooses the cards of the first view of the lineage canvas: the centre and as many of its
 * nearest neighbours as fit whole at a readable size. */
// The canvas never opens with a card cut by its edge. When not every card fits at the readable
// zoom, the nearest cards show whole and the rest wait behind a counted "Show all" control.
// Cards sit in columns left to right the way the layout puts them: a card that a line leaves is
// one column left of the card the line enters. The estimate adds cards nearest first and keeps
// each one only while the columns still fit the pane.
import type { CardKind } from './lineage';

/** Describes the canvas pane the first view has to fit into, in screen pixels. */
export type ViewSize = { width: number; height: number };

/** A line between two cards, from the card it leaves to the card it enters. */
export type CardLine = { from: string; to: string };

// Tables come before the datasets that read them, and metrics come last.
const KIND_ORDER: Record<CardKind, number> = {
  object: 0,
  external: 1,
  concept: 1,
  dataset: 2,
  metric: 3,
};
/** Orders card kinds for the first view: tables first, metrics last. */
export const kindOrder = (kind: CardKind) => KIND_ORDER[kind] ?? 4;

type Plan = {
  centre: string;
  heights: ReadonlyMap<string, number>;
  lines: readonly CardLine[];
  rank: (card: string) => number;
  view: ViewSize;
  zoom: number;
  margin: number;
  cardWidth: number;
  columnGap: number;
  rowGap: number;
};
type Reached = { card: string; column: number; distance: number };
// Cards by distance from the centre with the column each one sits in; within a distance, lower
// rank first, then taller cards last so small ones are not crowded out by one large one.
function reachFromCentre({ centre, heights, lines, rank }: Plan): Reached[] {
  const column = new Map([[centre, 0]]);
  const distance = new Map([[centre, 0]]);
  const queue = [centre];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const line of lines) {
      const forward = line.from === current;
      const other = forward ? line.to : line.from;
      if ((!forward && line.to !== current) || distance.has(other) || !heights.has(other)) continue;
      column.set(other, column.get(current)! + (forward ? 1 : -1));
      distance.set(other, distance.get(current)! + 1);
      queue.push(other);
    }
  }
  const reached = queue.slice(1).map(card => ({
    card,
    column: column.get(card)!,
    distance: distance.get(card)!,
  }));
  return reached.sort(
    (a, b) =>
      a.distance - b.distance ||
      rank(a.card) - rank(b.card) ||
      heights.get(a.card)! - heights.get(b.card)!,
  );
}
/** Picks the cards that fit whole, with the margin, into the view at the readable zoom. The
 * centre is always in, even when it alone is larger than the view. */
export function planFirstView(plan: Plan): Set<string> {
  const { centre, heights, view, zoom, margin, cardWidth, columnGap, rowGap } = plan;
  const chosen = new Set<string>([centre]);
  if (!heights.has(centre)) return chosen;
  const room = { width: view.width / zoom - 2 * margin, height: view.height / zoom - 2 * margin };
  const stacks = new Map<number, number[]>([[0, [heights.get(centre)!]]]);
  const fits = () => {
    const columns = [...stacks.keys()];
    const span = Math.max(...columns) - Math.min(...columns) + 1;
    const wide = span * cardWidth + (span - 1) * columnGap;
    const tall = Math.max(
      ...[...stacks.values()].map(s => s.reduce((a, b) => a + b, 0) + (s.length - 1) * rowGap),
    );
    return wide <= room.width && tall <= room.height;
  };
  for (const { card, column } of reachFromCentre(plan)) {
    const stack = stacks.get(column) ?? [];
    const before = stacks.get(column);
    stacks.set(column, [...stack, heights.get(card)!]);
    if (fits()) chosen.add(card);
    else if (before) stacks.set(column, before);
    else stacks.delete(column);
  }
  return chosen;
}
