/** Measures painted paths only when their bounds reach the visible label plane. */
import { nearestRoutePoint, routeBoundsIntersect, type Box } from './routes';

type Point = [number, number];
type Sample = { offset: number; point: Point };
/** Cached painted route with lazy, bounded geometry sampling. */
export type LabelRoute = {
  path: string;
  element: SVGPathElement;
  bounds: Box;
  samples?: Sample[];
  points?: Point[];
  candidates?: Point[];
};

/** Reads cheap SVG bounds before any path-length sampling. */
export function measureLabelRoute(element: SVGPathElement): LabelRoute {
  const { x, y, width, height } = element.getBBox();
  return { path: element.getAttribute('d') ?? '', element, bounds: { x, y, width, height } };
}

function pathSample(element: SVGPathElement, offset: number): Sample {
  const point = element.getPointAtLength(offset);
  return { offset, point: [point.x, point.y] };
}

function sampleVisibleRoute(route: LabelRoute) {
  const length = route.element.getTotalLength();
  const samples: Sample[] = [pathSample(route.element, 0)];
  const subdivide = (start: Sample, end: Sample, depth: number) => {
    const middle = pathSample(route.element, (start.offset + end.offset) / 2);
    const chord = nearestRoutePoint([start.point, end.point], middle.point);
    const error = Math.hypot(chord[0] - middle.point[0], chord[1] - middle.point[1]);
    // Seed intervals avoid missing inflections; a depth cap bounds work on very long paths.
    if (error > 0.25 && depth < 4) {
      subdivide(start, middle, depth + 1);
      subdivide(middle, end, depth + 1);
    } else samples.push(end);
  };
  for (let index = 1; index <= 16; index++) {
    subdivide(samples[samples.length - 1], pathSample(route.element, (length * index) / 16), 0);
  }
  route.samples = samples;
  route.points = samples.map(sample => sample.point);
  route.candidates = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].map(fraction => pathSample(route.element, length * fraction).point);
}

/** Samples visible routes once per painted path, with cached bounds for offscreen culling. */
export function visibleLabelRoute(route: LabelRoute, viewport: Box) {
  if (!routeBoundsIntersect(route.bounds, viewport)) return undefined;
  if (!route.samples) sampleVisibleRoute(route);
  return { points: route.points!, candidates: route.candidates, bounds: route.bounds };
}

/** Refines the nearest sampled segment on the painted curve instead of ending on its chord. */
export function labelRouteAnchor(route: LabelRoute, center: Point): Point {
  const samples = route.samples!;
  let segment = 1;
  let distance = Infinity;
  for (let index = 1; index < samples.length; index++) {
    const candidate = nearestRoutePoint([samples[index - 1].point, samples[index].point], center);
    const reach = Math.hypot(candidate[0] - center[0], candidate[1] - center[1]);
    if (reach >= distance) continue;
    segment = index;
    distance = reach;
  }
  let left = samples[segment - 1].offset;
  let right = samples[segment].offset;
  const squaredDistance = (sample: Sample) => (sample.point[0] - center[0]) ** 2 + (sample.point[1] - center[1]) ** 2;
  for (let iteration = 0; iteration < 18; iteration++) {
    const first = pathSample(route.element, left + (right - left) / 3);
    const second = pathSample(route.element, right - (right - left) / 3);
    if (squaredDistance(first) < squaredDistance(second)) right = second.offset;
    else left = first.offset;
  }
  const candidates = [samples[segment - 1], samples[segment], pathSample(route.element, (left + right) / 2)];
  candidates.sort((first, second) => squaredDistance(first) - squaredDistance(second));
  return candidates[0].point;
}
