// Colours that data chooses at run time. Groups of entities take a colour from this list by name
// or by a hash of their id, and the same colour must look right on a light and a dark page, so
// every entry is a mid-tone. This file and src/shared/theme/theme.css are the only places colour literals may
// appear.

/** The colours a group of entities can take, in the order the grouping hands them out. */
export const GROUP_PALETTE = ['#417fa8', '#9165ad', '#478a87', '#b28546', '#568866', '#ab6d64', '#6884ad', '#9a8870'] as const;

/** Entities that belong to no group. */
export const UNASSIGNED_GROUP_COLOR = '#85958e';

/** Entities grouped by their definition type. */
export const TYPE_GROUP_COLOR = '#658b80';

/** A group in the full graph that carries no colour of its own. */
export const FALLBACK_GROUP_COLOR = '#638c7b';

/** Returns the palette colour a group id hashes to. */
export function paletteColorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return GROUP_PALETTE[hash % GROUP_PALETTE.length];
}
