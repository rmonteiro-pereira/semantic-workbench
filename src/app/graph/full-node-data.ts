/** Builds the data the whole-model graph's entity cards and area tiles show. */
import type { Entity } from '../../shared/core/model';
import { linkedAreasText } from './area-links';
import { LARGEST_AREA_TITLE_PX, LARGEST_ENTITY_NAME_PX } from './overview-capacity';
import { cardNameFontSize, fittingFontSize, TITLE_SIDE_SPACE } from './text-fit';

// Room inside a card for a collapsed area's hint or a metric's kind label.
const COLLAPSED_CARD_HINT_HEIGHT = 40;
const METRIC_BADGE_HEIGHT = 16;
// The title may use two lines of a tile's header, beside its colour dot.
const TITLE_BOX_HEIGHT = 100;
/** Reserves the card's internal labels; KPI badges float outside the card. */
export function reservedNameHeight(entity: Entity): number {
  let reservedHeight = 0;
  if (entity.definition?.collapsedArea) reservedHeight += COLLAPSED_CARD_HINT_HEIGHT;
  if (entity.kind === 'Metric') reservedHeight += METRIC_BADGE_HEIGHT;
  return reservedHeight;
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
