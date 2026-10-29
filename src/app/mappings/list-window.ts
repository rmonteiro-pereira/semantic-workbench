/** How many items a long list shows at first and how many each "Show more" press adds. */
export const BINDINGS_PER_GROUP = 5;
export const BINDINGS_STEP = 10;
export const CONCEPTS_SHOWN = 12;
export const CONCEPTS_STEP = 30;
export const GROUPS_SHOWN = 3;
export const GROUPS_STEP = 5;

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

/** Label for the control that reveals the next step of hidden items. */
export function showMoreLabel(hidden: number, step: number) {
  return `Show ${Math.min(hidden, step)} more`;
}
