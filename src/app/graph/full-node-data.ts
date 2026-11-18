/** Builds the data the whole-model graph's entity cards and area tiles show. */
import type { Entity } from '../../shared/core/model';
import { linkedAreasText } from './area-links';
import { LARGEST_AREA_TITLE_PX, LARGEST_ENTITY_NAME_PX } from './overview-capacity';
import { cardNameFontSize, fittingFontSize, TITLE_SIDE_SPACE } from './text-fit';

// The metric kind label shares the named entity's card height.
const METRIC_BADGE_HEIGHT = 16;
// The title may use two lines of a tile's header, beside its colour dot.
const TITLE_BOX_HEIGHT = 100;
/** Reserves the label on a metric entity card. */
export function reservedNameHeight(entity: Entity): number {
  // Counted areas only enlarge the count when the hint and metric label are hidden.
  return !entity.definition?.collapsedArea && entity.kind === 'Metric' ? METRIC_BADGE_HEIGHT : 0;
}

/** The data of an entity card, with the largest name size at which the whole name fits. */
export function entityCardData(entity: Entity, size: { width: number; height: number }) {
  const reservedHeight = reservedNameHeight(entity);
  const nameCap = cardNameFontSize(entity.name, { ...size, reservedHeight }, LARGEST_ENTITY_NAME_PX);
  return { nameCap: `${nameCap}px` };
}

/** The data of an area tile: its title, the largest title size that fits, and its link summary. */
export function areaTileData(area: { name: string; color: string; entityCount: number }, tileWidth: number, linkedAreaCount?: number) {
  const titleCap = fittingFontSize(area.name, tileWidth - TITLE_SIDE_SPACE, TITLE_BOX_HEIGHT, LARGEST_AREA_TITLE_PX);
  return {
    name: area.name,
    color: area.color,
    count: area.entityCount,
    linksText: linkedAreaCount === undefined ? undefined : linkedAreasText(linkedAreaCount),
    titleCap: `${titleCap}px`,
  };
}
