/** Lays each business area out as a tile sized to the entities it holds. */
import type { GroupingOptions } from './overview';
import { modelOverview } from './overview';
import type { Entity, Relationship } from '../../shared/core/model';
import { GROUP_HEADER_HEIGHT, modelCardHeight, textSizesAt } from './overview-capacity';
import { reservedNameHeight } from './full-node-data';
import { cardHeightFor, cardWidthFor, textWidth, TITLE_SIDE_SPACE, titleWidthFor } from './text-fit';

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
// Fitting the model leaves this share of the canvas empty on every side.
const FIT_PADDING = 0.12;
// How many times the text sizes are re-planned, because they depend on the zoom the layout ends up with.
const PLANNING_ROUNDS = 5;
// Plans for a slightly smaller zoom than estimated, so a card is never planned smaller than it later needs.
const PLANNING_ZOOM_MARGIN = 0.9;
// The title may use two lines of the header, so it never plans for more than this size.
const LARGEST_PLANNED_TITLE_PX = 40;
const LINKS_TEXT_SAMPLE = 'links to 00 areas';
const LINKS_TEXT_SIDE_SPACE = 40;

/** The size, in canvas units, of the text the tiles are planned for. */
export type TextPlan = { entityNamePx: number; areaTitlePx: number; areaLinksPx: number };

/** The size of the canvas the graph is shown in, which decides the shape the tiles are packed to. */
export type CanvasSize = { width: number; height: number };

const CANVAS_WIDTH_STEP = 400;
const CANVAS_HEIGHT_STEP = 200;

/** Rounds the canvas size to coarse steps, so small resizes keep the same layout. */
export function coarseCanvasSize(canvas: CanvasSize): CanvasSize {
  return {
    width: Math.max(CANVAS_WIDTH_STEP / 2, Math.round(canvas.width / CANVAS_WIDTH_STEP) * CANVAS_WIDTH_STEP),
    height: Math.max(CANVAS_HEIGHT_STEP, Math.round(canvas.height / CANVAS_HEIGHT_STEP) * CANVAS_HEIGHT_STEP),
  };
}

function textPlanAt(zoom: number): TextPlan {
  const sizes = textSizesAt(zoom);
  return { entityNamePx: sizes.entityName, areaTitlePx: Math.min(LARGEST_PLANNED_TITLE_PX, sizes.areaTitle), areaLinksPx: sizes.areaLinks };
}

/** The zoom that fitting a layout of this size into the canvas gives. */
export function fitZoom(layout: { width: number; height: number }, canvas: CanvasSize): number {
  const usable = 1 - 2 * FIT_PADDING;
  return Math.min((canvas.width * usable) / layout.width, (canvas.height * usable) / layout.height);
}

type TileEntity = { entity: Entity; width: number; height: number };

function columnCountFor(entityCount: number): number {
  return Math.max(1, Math.min(entityCount, Math.ceil(Math.sqrt(entityCount * TILE_ASPECT))));
}

/** Places an area's entities on a grid of equal cells and returns each position with the tile size. */
function arrangeTile(entities: Entity[], areaName: string, plan: TextPlan) {
  const cards: TileEntity[] = entities.map(entity => {
    const width = cardWidthFor(entity.name, plan.entityNamePx);
    return { entity, width, height: cardHeightFor(entity.name, width, plan.entityNamePx, modelCardHeight(Boolean(entity.definition?.collapsedArea)), reservedNameHeight(entity, false)) };
  });
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
  const headerWidth = Math.max(titleWidthFor(areaName, plan.areaTitlePx, MIN_TILE_WIDTH, TITLE_SIDE_SPACE), textWidth(LINKS_TEXT_SAMPLE, plan.areaLinksPx) + LINKS_TEXT_SIDE_SPACE);
  return {
    placed,
    width: Math.max(headerWidth, contentWidth + 2 * TILE_PADDING),
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
 * keeps the arrangement whose shape is closest to the target aspect (a screen's by default), and the smaller one on a tie.
 */
export function packTiles(sizes: TileSize[], targetAspect: number = PACKED_ASPECT) {
  const order = sizes.map((size, index) => ({ ...size, index })).sort((first, second) => second.height - first.height || second.width - first.width || first.index - second.index);
  const widest = Math.max(0, ...order.map(tile => tile.width));
  const widestRow = order.reduce((sum, tile) => sum + tile.width + TILE_GAP, 0);
  let best = fillRows(order, widest);
  let bestMiss = Infinity;
  for (let rowLimit = widest; rowLimit <= widestRow; rowLimit += ROW_LIMIT_STEP) {
    const candidate = fillRows(order, rowLimit);
    const miss = Math.abs(Math.log(candidate.width / candidate.height / targetAspect));
    if (miss < bestMiss - 0.001) {
      best = candidate;
      bestMiss = miss;
    }
  }
  return best;
}

function packAreas(overview: ReturnType<typeof modelOverview>, plan: TextPlan, targetAspect: number) {
  const tiles = overview.groups.map(group => ({ group, ...arrangeTile(group.entities, group.name, plan) }));
  return { tiles, packed: packTiles(tiles, targetAspect) };
}

/**
 * Re-plans the text sizes until they stop changing, because the sizes decide the layout and the
 * layout decides the zoom the sizes follow. The round limit only guards against a plan that flips.
 */
export function planTextForCanvas(overview: ReturnType<typeof modelOverview>, canvas: CanvasSize, targetAspect: number) {
  let plan = textPlanAt(1);
  let arranged = packAreas(overview, plan, targetAspect);
  for (let round = 0; round < PLANNING_ROUNDS; round++) {
    const nextPlan = textPlanAt(fitZoom(arranged.packed, canvas) * PLANNING_ZOOM_MARGIN);
    if (JSON.stringify(nextPlan) === JSON.stringify(plan)) break;
    plan = nextPlan;
    arranged = packAreas(overview, plan, targetAspect);
  }
  return { plan, arranged };
}

/**
 * Builds one tile per area and packs the tiles so that none overlap. Text sizes follow the zoom the
 * canvas will fit the result at, and the packing follows the canvas shape, so a tall phone canvas
 * gets fewer columns and its names stay readable.
 */
export function layoutNetwork(entities: Entity[], edges: Relationship[], name: string, grouping?: GroupingOptions, canvas?: CanvasSize) {
  const overview = modelOverview(entities, edges, name, false, grouping);
  const targetAspect = canvas ? canvas.width / canvas.height : PACKED_ASPECT;
  const startingPlan = textPlanAt(1);
  const { plan, arranged } = canvas ? planTextForCanvas(overview, canvas, targetAspect) : { plan: startingPlan, arranged: packAreas(overview, startingPlan, targetAspect) };
  const { tiles, packed } = arranged;
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
    textPlan: plan,
    routes: {} as Record<string, { x: number; y: number }[][]>,
  };
}
