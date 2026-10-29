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
export function placeMenu(
  anchor: Box,
  menu: Size,
  viewport: Size,
  preference: MenuPreference,
): MenuPlacement {
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
 * Places a menu just beyond `edge` (a sidebar's right side), bottom-aligned with its button and
 * growing upward. Returns nothing when the window is a phone or the menu does not fit sideways, so
 * the caller can fall back to the normal placement.
 */
export function placeFlyout(
  anchor: Box,
  edge: number,
  menu: Size,
  viewport: Size,
): MenuPlacement | undefined {
  const left = edge + GAP;
  const fitsSideways = left + menu.width <= viewport.width - EDGE;
  if (viewport.width <= PHONE_BREAKPOINT || !fitsSideways) return undefined;
  const room = Math.max(0, anchor.bottom - EDGE);
  const maxHeight = Math.min(menu.height, room);
  return { top: anchor.bottom - maxHeight, left, maxHeight, side: 'above' };
}
