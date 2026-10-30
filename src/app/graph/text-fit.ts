/** Estimates how much room graph names need, so cards and tiles are sized to show them whole. */

// Wide enough for capitals and bold weights in the interface font, so the estimate errs towards
// more room instead of a clipped name.
const AVERAGE_GLYPH_EM = 0.62;
const LINE_HEIGHT_EM = 1.25;
const SMALLEST_FONT_PX = 9;

// Space inside an entity card around its name: border, colour bar and padding.
const CARD_SIDE_SPACE = 33;
const CARD_VERTICAL_SPACE = 20;
const READABLE_NAME_PX = 16;

/** The name as a card shows it: camel case and underscores become spaces. */
export function shownName(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
}

/** How many lines the text takes in a box of this width at this font size. */
export function lineCount(text: string, boxWidth: number, fontPx: number): number {
  const glyphWidth = AVERAGE_GLYPH_EM * fontPx;
  const words = text.split(' ').filter(Boolean);
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const wordWidth = word.length * glyphWidth;
    const withSpace = used === 0 ? wordWidth : used + glyphWidth + wordWidth;
    if (withSpace <= boxWidth) {
      used = withSpace;
      continue;
    }
    if (used > 0) lines++;
    // A word wider than the box breaks inside itself.
    const extraLines = Math.ceil(wordWidth / boxWidth) - 1;
    lines += extraLines;
    used = wordWidth - extraLines * boxWidth;
  }
  return lines;
}

/** The largest font size, up to the wanted one, at which the whole text fits the box. */
export function fittingFontSize(text: string, boxWidth: number, boxHeight: number, wantedPx: number): number {
  for (let fontPx = Math.floor(wantedPx); fontPx > SMALLEST_FONT_PX; fontPx--) {
    const linesThatFit = Math.floor(boxHeight / (fontPx * LINE_HEIGHT_EM));
    if (linesThatFit >= lineCount(text, boxWidth, fontPx)) return fontPx;
  }
  return SMALLEST_FONT_PX;
}

const CARD_WIDTH_STEP = 40;
const SMALLEST_CARD_WIDTH = 184;
const LARGEST_CARD_WIDTH_AT_READABLE_SIZE = 304;

/** The narrowest card width, in steps of 40, that shows the name in two lines at the given size. */
export function cardWidthFor(name: string, fontPx: number = READABLE_NAME_PX): number {
  const text = shownName(name);
  const widest = Math.round(LARGEST_CARD_WIDTH_AT_READABLE_SIZE * Math.max(1, fontPx / READABLE_NAME_PX));
  let width = SMALLEST_CARD_WIDTH;
  while (width + CARD_WIDTH_STEP <= widest && lineCount(text, width - CARD_SIDE_SPACE, fontPx) > 2) width += CARD_WIDTH_STEP;
  return width;
}

/** The card height that holds the whole name at the given size, never less than the standard height. */
export function cardHeightFor(name: string, width: number, fontPx: number, standardHeight: number, reservedHeight: number = 0): number {
  const lines = lineCount(shownName(name), width - CARD_SIDE_SPACE, fontPx);
  return Math.max(standardHeight, Math.ceil(lines * fontPx * LINE_HEIGHT_EM) + CARD_VERTICAL_SPACE + reservedHeight);
}

// A tile title never asks for a tile wider than this.
const WIDEST_TILE = 1200;
/** Room a tile's header keeps beside its title for the colour dot and padding. */
export const TITLE_SIDE_SPACE = 60;

/** The narrowest tile width, from the minimum, that shows the title in two lines at the given size. */
export function titleWidthFor(title: string, fontPx: number, minimumWidth: number, sideSpace: number): number {
  let width = minimumWidth;
  while (lineCount(title, width - sideSpace, fontPx) > 2 && width < WIDEST_TILE) width += CARD_WIDTH_STEP;
  return width;
}

/** The width one line of text takes at the given size. */
export function textWidth(text: string, fontPx: number): number {
  return Math.ceil(text.length * AVERAGE_GLYPH_EM * fontPx);
}

/** The largest name size that keeps the whole name inside a card of this size. */
export function cardNameFontSize(name: string, card: { width: number; height: number; reservedHeight?: number }, wantedPx: number): number {
  return fittingFontSize(shownName(name), card.width - CARD_SIDE_SPACE, card.height - CARD_VERTICAL_SPACE - (card.reservedHeight ?? 0), wantedPx);
}
