/** Lays each business area out as a tile sized to the entities it holds. */
import type { GroupingOptions } from './overview';
import { modelOverview } from './overview';
import type { Entity, Relationship } from '../../shared/core/model';
import { GROUP_HEADER_HEIGHT, modelCardHeight } from './overview-capacity';
import { cardWidthFor } from './text-fit';

const TILE_PADDING = 24;
const CARD_GAP_X = 20;
const CARD_GAP_Y = 16;
const MIN_TILE_WIDTH = 300;
// Tiles are about this much wider than tall, so a busy area gets a roomy block instead of a column.
const TILE_ASPECT = 1.4;
const TILE_GAP = 56;
const CANVAS_MARGIN = 40;
// The packed tiles are about this much wider than tall, like the screen they are shown on.
const PACKED_ASPECT = 1.7;
const ROW_LIMIT_STEP = 40;

type TileEntity = { entity: Entity; width: number; height: number };

function columnCountFor(entityCount: number): number {
  return Math.max(1, Math.min(entityCount, Math.ceil(Math.sqrt(entityCount * TILE_ASPECT))));
}

/** Places an area's entities on a grid of equal cells and returns each position with the tile size. */
function arrangeTile(entities: Entity[]) {
  const cards: TileEntity[] = entities.map(entity => ({
    entity,
    width: cardWidthFor(entity.name),
    height: modelCardHeight(Boolean(entity.definition?.collapsedArea)),
  }));
  const cellWidth = Math.max(0, ...cards.map(card => card.width));
  const cellHeight = Math.max(0, ...cards.map(card => card.height));
  const columns = columnCountFor(cards.length);
  const rows = Math.ceil(cards.length / columns);
  const placed = cards.map((card, index) => ({
    id: card.entity.id,
    x: TILE_PADDING + (index % columns) * (cellWidth + CARD_GAP_X),
    y: GROUP_HEADER_HEIGHT + Math.floor(index / columns) * (cellHeight + CARD_GAP_Y),
    width: cellWidth,
    height: cellHeight,
  }));
  const contentWidth = columns * cellWidth + (columns - 1) * CARD_GAP_X;
  const contentHeight = rows * cellHeight + (rows - 1) * CARD_GAP_Y;
  return {
    placed,
    width: Math.max(MIN_TILE_WIDTH, contentWidth + 2 * TILE_PADDING),
    height: GROUP_HEADER_HEIGHT + contentHeight + TILE_PADDING,
  };
}

type TileSize = { width: number; height: number };

// Fills rows left to right up to the given width, starting a new row when the next tile would pass it.
function fillRows(order: (TileSize & { index: number })[], rowLimit: number) {
  const corners = order.map(() => ({ x: 0, y: 0 }));
  let x = CANVAS_MARGIN;
  let y = CANVAS_MARGIN;
  let rowHeight = 0;
  let usedWidth = 0;
  for (const tile of order) {
    const startsNewRow = x > CANVAS_MARGIN && x - CANVAS_MARGIN + tile.width > rowLimit;
    if (startsNewRow) {
      x = CANVAS_MARGIN;
      y += rowHeight + TILE_GAP;
      rowHeight = 0;
    }
    corners[tile.index] = { x, y };
    x += tile.width + TILE_GAP;
    rowHeight = Math.max(rowHeight, tile.height);
    usedWidth = Math.max(usedWidth, x - TILE_GAP);
  }
  return { corners, width: usedWidth + CANVAS_MARGIN, height: y + rowHeight + CANVAS_MARGIN };
}

/**
 * Places tiles in rows, tallest first, so that none overlap. Of the row widths worth trying, it
 * keeps the arrangement whose shape is closest to a screen's, and the smaller one on a tie.
 */
export function packTiles(sizes: TileSize[]) {
  const order = sizes.map((size, index) => ({ ...size, index })).sort((first, second) => second.height - first.height || second.width - first.width || first.index - second.index);
  const widest = Math.max(0, ...order.map(tile => tile.width));
  const widestRow = order.reduce((sum, tile) => sum + tile.width + TILE_GAP, 0);
  let best = fillRows(order, widest);
  let bestMiss = Infinity;
  for (let rowLimit = widest; rowLimit <= widestRow; rowLimit += ROW_LIMIT_STEP) {
    const candidate = fillRows(order, rowLimit);
    const miss = Math.abs(Math.log(candidate.width / candidate.height / PACKED_ASPECT));
    if (miss < bestMiss - 0.001) {
      best = candidate;
      bestMiss = miss;
    }
  }
  return best;
}

/** Builds one tile per area and packs the tiles so that none overlap. */
export function layoutNetwork(entities: Entity[], edges: Relationship[], name: string, grouping?: GroupingOptions) {
  const overview = modelOverview(entities, edges, name, false, grouping);
  const tiles = overview.groups.map(group => ({ group, ...arrangeTile(group.entities) }));
  const packed = packTiles(tiles);
  const nodes = tiles.flatMap((tile, index) => {
    const areaId = 'area:' + tile.group.id;
    const corner = packed.corners[index];
    const area = { id: areaId, x: corner.x, y: corner.y, width: tile.width, height: tile.height, group: tile.group.id as string | undefined, parentId: undefined as string | undefined };
    const members = tile.placed.map(card => ({ ...card, group: undefined as string | undefined, parentId: areaId as string | undefined }));
    return [area, ...members];
  });
  return {
    nodes,
    width: packed.width,
    height: packed.height,
    entityCount: overview.entities.length,
    relationshipCount: overview.links.length,
    routes: {} as Record<string, { x: number; y: number }[][]>,
  };
}
