/** Maps a request count to one of five intensity levels, relative to the largest count on screen. */

/** Levels drawn for traffic; level 0 means no mark at all. */
export const INTENSITY_LEVELS = 5;

/** The share of the largest count each level starts above. Five steps stay distinguishable by outline weight in both themes. */
const LEVEL_FLOORS = [0, 0.1, 0.25, 0.5, 0.75] as const;

/** Level of one count: 0 for no requests, otherwise 1 to 5 by its share of the largest count shown. */
export function intensityLevel(count: number, largest: number): number {
  if (!(count > 0) || !(largest > 0)) return 0;
  const share = Math.min(1, count / largest);
  let level = 1;
  for (let step = 1; step < LEVEL_FLOORS.length; step++) {
    if (share > LEVEL_FLOORS[step]) level = step + 1;
  }
  return level;
}

/** How much a line grows per level; width is a weight, so it does not depend on colour. */
const STROKE_STEP = 0.7;

/** The width of a relationship line at one intensity level, from its width without Traffic. */
export function trafficStrokeWidth(baseWidth: number, level: number): number {
  return baseWidth + level * STROKE_STEP;
}
