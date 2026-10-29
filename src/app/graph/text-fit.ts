/** Estimates how much room graph names need, so cards and tiles are sized to show them whole. */

// Wide enough for capitals and bold weights in the interface font, so the estimate errs towards
// more room instead of a clipped name.
const AVERAGE_GLYPH_EM = 0.62;
const LINE_HEIGHT_EM = 1.25;
const SMALLEST_FONT_PX = 9;

// Space inside an entity card around its name: border, colour bar and padding.
const CARD_SIDE_SPACE = 33;
const CARD_VERTICAL_SPACE = 20;
const CARD_WIDTHS = [184, 224, 264, 304];
const READABLE_NAME_PX = 16;

/** The name as a card shows it: camel case and underscores become spaces. */
export function shownName(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
}

/** How many lines the text takes in a box of this width at this font size. */
export function lineCount(text: string, boxWidth: number, fontPx: number): number {
  const glyphWidth = AVERAGE_GLYPH_EM * fontPx;
  const wordsPerLine = text.split(' ').filter(Boolean);
  let lines = 1;
  let used = 0;
  for (const word of wordsPerLine) {
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

/** The narrowest standard card width that shows the name in two lines at its normal size. */
export function cardWidthFor(name: string): number {
  const text = shownName(name);
  const normalHeight = 2 * READABLE_NAME_PX * LINE_HEIGHT_EM;
  const fitting = CARD_WIDTHS.find(width => lineCount(text, width - CARD_SIDE_SPACE, READABLE_NAME_PX) * READABLE_NAME_PX * LINE_HEIGHT_EM <= normalHeight);
  return fitting ?? CARD_WIDTHS[CARD_WIDTHS.length - 1];
}

/** The largest name size that keeps the whole name inside a card of this size. */
export function cardNameFontSize(name: string, card: { width: number; height: number; reservedHeight?: number }, wantedPx: number): number {
  return fittingFontSize(shownName(name), card.width - CARD_SIDE_SPACE, card.height - CARD_VERTICAL_SPACE - (card.reservedHeight ?? 0), wantedPx);
}
