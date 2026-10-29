/** Sizes the whole-model graph's cards and decides when its areas start as single cards. */

// Names are 16 px, so this zoom keeps them at 12 px or more on screen without any help.
const READABLE_ZOOM = 0.75;
const CARD_HEIGHT = 60;
const LARGE_MODEL = 250;
/** Area titles also grow as the graph zooms out, up to this size. */
export const LARGEST_AREA_TITLE_PX = 48;
/** Room above an area's entities for its title (two lines at the largest size) and its link summary. */
export const GROUP_HEADER_HEIGHT = 160;
/** Taller names no longer fit a card, so names stop growing here as the canvas zooms out. */
export const LARGEST_ENTITY_NAME_PX = 44;

/** Reserves room for both the entity count and relationship guidance in a collapsed area. */
export function modelCardHeight(collapsed: boolean): number {
  return collapsed ? 96 : CARD_HEIGHT;
}

/** Returns the type sizes, in canvas units, that keep names readable once the canvas is scaled. */
export function textSizesAt(zoom: number) {
  const entityName = zoom >= READABLE_ZOOM ? 16 : Math.min(LARGEST_ENTITY_NAME_PX, Math.ceil(12 / zoom));
  const areaTitle = Math.min(LARGEST_AREA_TITLE_PX, Math.max(20, Math.ceil(13 / zoom)));
  // Two lines of the larger name no longer fit the card, so it keeps one.
  const entityLines = entityName > 17 ? 1 : 2;
  const entityPadding = entityName > 30 ? 2 : 9;
  // Detail starts at 12 canvas pixels, so it needs an unscaled view to stay readable.
  const showDetail = zoom >= 1;
  return { entityName, areaTitle, entityLines, entityPadding, showDetail };
}

/** Says whether the first view shows each area as one card, because the model is very large. */
export function startsCollapsed(entityCount: number): boolean {
  return entityCount > LARGE_MODEL;
}
