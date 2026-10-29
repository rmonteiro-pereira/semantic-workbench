/** How many concepts and datasets a list shows at first, and how many more each press adds. */
export const CONCEPTS_SHOWN = 7;
export const DATASETS_SHOWN = 3;
export const DATASETS_STEP = 10;

/** How many items to render given the requested limit; never more than the list holds. */
export function visibleCount(requested: number, total: number) {
  return Math.min(Math.max(requested, 0), total);
}

/**
 * Widens a limit so the item at `index` is rendered. Selecting an item that sits past the limit
 * must still show it, so the list scrolls to something that exists.
 */
export function limitCovering(requested: number, index: number) {
  return index < 0 ? requested : Math.max(requested, index + 1);
}

/** Label for the control that reveals the next step of hidden datasets. */
export function showMoreDatasetsLabel(hidden: number) {
  return `Show ${Math.min(hidden, DATASETS_STEP)} more datasets`;
}
