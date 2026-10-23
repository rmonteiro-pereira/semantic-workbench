/** Places the labels of the lines on the lineage canvas so none covers a card or another label. */
// A label sits on its line, halfway between the two cards, where the layout leaves a gap. When the
// gap is too narrow or another label is already there, the label is left out of the picture and
// shows when the line is hovered instead.
import { foreignKeyHop, type LineageGraph } from './lineage';
import { pointAtHalf, type Point } from './edge-route';
import { CARD_W, portY, type LayoutCard } from './lineage-layout';

/** The size of one character of a 12 px label and the padding of its pill, in canvas units. */
const CHAR_WIDTH = 7;
const LINE_HEIGHT = 15;
const PAD_X = 8;
const PAD_Y = 4;
const GAP_AROUND = 16;
const LINE_CLEARANCE = 6;

/** A rectangle on the canvas: its top-left corner and its size. */
export type Rect = { x: number; y: number; w: number; h: number };

/** A label that wants a place: its lines of text, the point on its line, and its urgency. */
export type LabelRequest = {
  id: string;
  lines: string[];
  /** The point on the line where the label sits. */
  at: { x: number; y: number };
  /** The width of the gap the label has to fit in, or null when the line is routed freely. */
  room: number | null;
  priority: number;
};

/** Returns the size of the pill that holds the label's lines. */
export function labelSize(lines: readonly string[]): { w: number; h: number } {
  const longest = Math.max(0, ...lines.map(line => line.length));
  return { w: longest * CHAR_WIDTH + 2 * PAD_X, h: lines.length * LINE_HEIGHT + 2 * PAD_Y };
}

const touches = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** Chooses a place for as many labels as fit; the rest are left out, in request order. */
export function placeEdgeLabels(
  requests: readonly LabelRequest[],
  obstacles: readonly Rect[],
): Map<string, Rect> {
  const placed = new Map<string, Rect>();
  const ordered = [...requests].sort((a, b) => a.priority - b.priority || a.at.y - b.at.y);
  for (const request of ordered) {
    const { w, h } = labelSize(request.lines);
    if (request.room !== null && request.room < w + 2 * GAP_AROUND) continue;
    const centre = request.at;
    // A label sits just above its line, then just below it, and only then on it. An opaque pill
    // over a line reads as part of the line.
    const clear = h / 2 + LINE_CLEARANCE;
    for (const shift of [-clear, clear, 0, h + GAP_AROUND, -(h + GAP_AROUND)]) {
      const spot = { x: centre.x - w / 2, y: centre.y + shift - h / 2, w, h };
      const blocked =
        obstacles.some(o => touches(spot, o)) ||
        [...placed.values()].some(o => touches(spot, o, GAP_AROUND));
      if (blocked) continue;
      placed.set(request.id, spot);
      break;
    }
  }
  return placed;
}

/** What the canvas knows about one drawn line when it asks for labels. */
export type LabelledLine = {
  id: string;
  from: string;
  to: string;
  fromCard: string;
  toCard: string;
  kind: string;
  onPath: boolean;
  count: number;
  edges: number[];
};
/** What a line says: the lines of its text, and where the canvas drew it if there was room. */
export type LineLabel = { lines: string[]; place?: Rect };

type LabelContext = {
  graph: LineageGraph;
  positions: Record<string, { x: number; y: number }>;
  routes: Record<string, Point[]>;
  layoutCards: ReadonlyMap<string, LayoutCard>;
  heights: ReadonlyMap<string, number>;
  /** Cards whose rows scroll; their line ends move, so their lines are labelled on hover only. */
  scrolling: ReadonlySet<string>;
};
function lineText(context: LabelContext, line: LabelledLine): string[] | null {
  if (line.count > 1) return [String(line.count)];
  const edge = context.graph.edges[line.edges[0]];
  const hop = edge && foreignKeyHop(context.graph, edge);
  return hop ? [hop.child, `→ ${hop.parent}`] : null;
}
function lineEnds(context: LabelContext, line: LabelledLine) {
  const source = context.positions[line.fromCard];
  const target = context.positions[line.toCard];
  const sourceCard = context.layoutCards.get(line.fromCard);
  const targetCard = context.layoutCards.get(line.toCard);
  if (!source || !target || !sourceCard || !targetCard) return null;
  return {
    from: { x: source.x + CARD_W, y: source.y + portY(sourceCard, line.from) },
    to: { x: target.x, y: target.y + portY(targetCard, line.to) },
  };
}
/** Gives every foreign key its sentence and every bundle its count. A label that finds room is
 * drawn on its line; the others show when the line is hovered. */
export function buildLineLabels(
  context: LabelContext,
  lines: readonly LabelledLine[],
): Map<string, LineLabel> {
  const texts = new Map<string, string[]>();
  const requests: LabelRequest[] = [];
  for (const line of lines) {
    const text = lineText(context, line);
    if (!text) continue;
    texts.set(line.id, text);
    const ends = lineEnds(context, line);
    const fixed = !context.scrolling.has(line.fromCard) && !context.scrolling.has(line.toCard);
    if (!ends || !fixed) continue;
    const priority = line.onPath ? 0 : line.count > 1 ? 2 : 1;
    const route = context.routes[line.id];
    const routed = route !== undefined && route.length > 0;
    const middle = pointAtHalf(routed ? [ends.from, ...route, ends.to] : [ends.from, ends.to]);
    const room = routed ? null : ends.to.x - ends.from.x;
    requests.push({ id: line.id, lines: text, priority, at: middle, room });
  }
  const obstacles = Object.entries(context.positions).map(([id, at]) => ({
    x: at.x,
    y: at.y,
    w: CARD_W,
    h: context.heights.get(id) ?? 0,
  }));
  const placed = placeEdgeLabels(requests, obstacles);
  return new Map([...texts].map(([id, text]) => [id, { lines: text, place: placed.get(id) }]));
}
