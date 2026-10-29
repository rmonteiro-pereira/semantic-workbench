/** Decides where an open menu goes: beside its button, inside the window, never clipped. */

export type Box = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };
export type MenuPlacement = {
  top: number;
  left: number;
  maxHeight: number;
  side: 'below' | 'above';
};
export type MenuPreference = { side: 'below' | 'above'; align: 'start' | 'end' };

const GAP = 6;
const EDGE = 12;

/** Picks the preferred side unless the menu does not fit there and the other side has more room. */
function chooseSide(anchor: Box, menu: Size, viewport: Size, preferred: MenuPreference['side']) {
  const roomBelow = viewport.height - anchor.bottom - GAP - EDGE;
  const roomAbove = anchor.top - GAP - EDGE;
  const preferredRoom = preferred === 'below' ? roomBelow : roomAbove;
  const otherRoom = preferred === 'below' ? roomAbove : roomBelow;
  if (menu.height <= preferredRoom || otherRoom <= preferredRoom) {
    return { side: preferred, room: preferredRoom };
  }
  return { side: preferred === 'below' ? 'above' : 'below', room: otherRoom } as const;
}

/** Computes fixed-position coordinates for a menu of the given natural size. */
export function placeMenu(anchor: Box, menu: Size, viewport: Size, preference: MenuPreference): MenuPlacement {
  const { side, room } = chooseSide(anchor, menu, viewport, preference.side);
  const maxHeight = Math.max(0, Math.min(menu.height, room));
  const top = side === 'below' ? anchor.bottom + GAP : anchor.top - GAP - maxHeight;
  const wanted = preference.align === 'end' ? anchor.right - menu.width : anchor.left;
  const furthest = viewport.width - EDGE - menu.width;
  const left = Math.max(EDGE, Math.min(wanted, furthest));
  return { top, left, maxHeight, side };
}

/** Windows this narrow or narrower use the drawer layout, where a flyout has no room. */
const PHONE_BREAKPOINT = 650;

/**
 * Places a menu against the right side of its button, bottom-aligned with it and growing upward,
 * so the menu reads as coming out of the button. Returns nothing when the window is a phone or the
 * menu does not fit sideways, so the caller can fall back to the normal placement.
 */
export function placeFlyout(anchor: Box, menu: Size, viewport: Size): MenuPlacement | undefined {
  const left = anchor.right;
  const fitsSideways = left + menu.width <= viewport.width - EDGE;
  if (viewport.width <= PHONE_BREAKPOINT || !fitsSideways) return undefined;
  const room = Math.max(0, anchor.bottom - EDGE);
  const maxHeight = Math.min(menu.height, room);
  return { top: anchor.bottom - maxHeight, left, maxHeight, side: 'above' };
}

/** The widest a submenu beside its menu can be: the max-width of .menu-popup in style.css. */
const SUBMENU_WIDTH = 340;
/** Clears the menu's padding and border, so the submenu starts just past the menu's edge. */
const SUBMENU_GAP = 10;

/** True when a submenu fits beside the open menu, which never happens on a phone. */
export function submenuFits(menu: Box, viewport: Size): boolean {
  const fits = menu.right + SUBMENU_GAP + SUBMENU_WIDTH <= viewport.width - EDGE;
  return viewport.width > PHONE_BREAKPOINT && fits;
}

/**
 * Places a submenu beside the row that opened it, its first item level with that row. It moves
 * up when it would run past the bottom of the window, and is capped to the window's height.
 */
export function placeSubmenu(row: Box, menu: Size, viewport: Size): MenuPlacement {
  const maxHeight = Math.max(0, Math.min(menu.height, viewport.height - 2 * EDGE));
  const lowest = viewport.height - EDGE - maxHeight;
  const top = Math.max(EDGE, Math.min(row.top - SUBMENU_GAP / 2, lowest));
  const furthest = viewport.width - EDGE - menu.width;
  const left = Math.max(EDGE, Math.min(row.right + SUBMENU_GAP, furthest));
  return { top, left, maxHeight, side: 'below' };
}
