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
type AnnotatedEntity = Entity & { change?: import('../../shared/item-diff/item-change').ChangeState };

/** Reserves the card's internal labels; KPI badges float outside the card. */
export function reservedNameHeight(entity: AnnotatedEntity): number {
  let reservedHeight = 0;
  if (entity.definition?.collapsedArea) reservedHeight += COLLAPSED_CARD_HINT_HEIGHT;
  if (entity.kind === 'Metric') reservedHeight += METRIC_BADGE_HEIGHT;
  if (entity.change) reservedHeight += 26;
  return reservedHeight;
}

/** The data of an entity card, with the largest name size at which the whole name fits. */
export function entityCardData(entity: AnnotatedEntity, size: { width: number; height: number }) {
  const reservedHeight = reservedNameHeight(entity);
  const nameCap = cardNameFontSize(entity.name, { ...size, reservedHeight }, LARGEST_ENTITY_NAME_PX);
  const change = entity.change ? { change: entity.change } : {};
  if (entity.imported) return { nameCap: `${Math.min(nameCap, 13)}px`, imported: entity.imported, ...change };
  return { nameCap: `${nameCap}px`, ...change };
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
