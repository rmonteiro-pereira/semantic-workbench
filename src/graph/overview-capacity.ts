/** Decides how many entity cards the whole-model graph can show with names people can read. */

// Names are 16 px, so this zoom keeps them at 12 px or more on screen without any help.
const READABLE_ZOOM = 0.75;
// Below it names are drawn larger. At this zoom they are 18 px, one line, still 12 px on screen,
// and the cards still hold most of a name; a first view needs no more room than this.
const CAPACITY_ZOOM = 0.7;
const CARD_WIDTH = 184;
const CARD_HEIGHT = 60;
// The layout leaves room for areas and lines around each card; measured on the 45-entity UBL
// model, one card takes about six cards' worth of space.
const SPACE_PER_CARD = 6;
const LARGE_MODEL = 250;

/** Returns the type sizes, in canvas units, that keep names readable once the canvas is scaled. */
export function textSizesAt(zoom: number) {
  const entityName = zoom >= READABLE_ZOOM ? 16 : Math.min(30, Math.ceil(12 / zoom));
  const areaTitle = Math.min(48, Math.max(20, Math.ceil(13 / zoom)));
  // Two lines of the larger name no longer fit the card, so it keeps one.
  const entityLines = entityName > 17 ? 1 : 2;
  // Detail starts at 12 canvas pixels, so it needs an unscaled view to stay readable.
  const showDetail = zoom >= 1;
  return { entityName, areaTitle, entityLines, showDetail };
}

/** The pane the graph is drawn in, in screen pixels. */
export type PaneSize = { width: number; height: number };

/** Returns how many entity cards fit the pane at a zoom where their names read at 12 px. */
export function readableCapacity(pane: PaneSize): number {
  const worldArea = (pane.width * pane.height) / CAPACITY_ZOOM ** 2;
  return Math.floor(worldArea / (CARD_WIDTH * CARD_HEIGHT * SPACE_PER_CARD));
}

/** Says whether the first view shows each area as one card, because the entities would not read. */
export function startsCollapsed(entityCount: number, pane: PaneSize): boolean {
  return entityCount > LARGE_MODEL || entityCount > readableCapacity(pane);
}
