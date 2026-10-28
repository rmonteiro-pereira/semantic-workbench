/** Draws a line through the bend points the layout chose, with rounded corners. */
// The layout routes a line that spans several columns around the cards between them. The canvas
// draws that route instead of a single curve between the two ends, so the line never runs across
// a card it does not join.

/** A point on the canvas. */
export type Point = { x: number; y: number };

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const toward = (from: Point, to: Point, by: number): Point => {
  const length = distance(from, to) || 1;
  return {
    x: from.x + ((to.x - from.x) * by) / length,
    y: from.y + ((to.y - from.y) * by) / length,
  };
};

/** Returns an SVG path through the points; each corner is rounded by at most `radius`. */
export function roundedPath(points: readonly Point[], radius = 18): string {
  if (points.length === 0) return '';
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1];
    const corner = points[i];
    const after = points[i + 1];
    const cut = Math.min(radius, distance(before, corner) / 2, distance(corner, after) / 2);
    const start = toward(corner, before, cut);
    const end = toward(corner, after, cut);
    parts.push(`L ${start.x} ${start.y}`, `Q ${corner.x} ${corner.y} ${end.x} ${end.y}`);
  }
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}

/** Returns the point halfway along the route, measured along its length. */
export function pointAtHalf(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const total = points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const length = distance(points[i - 1], points[i]);
    if (left <= length) return toward(points[i - 1], points[i], left);
    left -= length;
  }
  return points[points.length - 1];
}
