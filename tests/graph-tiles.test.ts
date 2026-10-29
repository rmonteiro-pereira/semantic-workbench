// Tests the area link summary and the estimates that keep graph names whole.
import { expect, test } from 'bun:test';
import { crossesAreas, linkedAreaCounts, linkedAreasText } from '../src/app/graph/area-links';
import { cardNameFontSize, cardWidthFor, fittingFontSize, lineCount, shownName } from '../src/app/graph/text-fit';

const areaOf = (entityId: string) => ({ a1: 'A', a2: 'A', b1: 'B', c1: 'C' })[entityId as 'a1'];

test('links inside an area are not summarised, and each other area counts once', () => {
  const links = [
    { source: 'a1', target: 'a2' },
    { source: 'a1', target: 'b1' },
    { source: 'a2', target: 'b1' },
    { source: 'c1', target: 'a1' },
  ];
  expect(crossesAreas(links[0], areaOf)).toBe(false);
  expect(crossesAreas(links[1], areaOf)).toBe(true);
  const counts = linkedAreaCounts(links, areaOf);
  expect(counts.get('A')).toBe(2);
  expect(counts.get('B')).toBe(1);
  expect(counts.get('C')).toBe(1);
});

test('an entity without an area never counts as a link between areas', () => {
  expect(crossesAreas({ source: 'a1', target: 'unknown' }, areaOf)).toBe(false);
});

test('the link summary reads as a sentence', () => {
  expect(linkedAreasText(0)).toBe('no links to other areas');
  expect(linkedAreasText(1)).toBe('links to 1 area');
  expect(linkedAreasText(4)).toBe('links to 4 areas');
});

test('names are shown with spaces between words', () => {
  expect(shownName('DespatchAdvice')).toBe('Despatch Advice');
  expect(shownName('line_item')).toBe('line item');
});

test('a word wider than its box breaks inside itself and adds lines', () => {
  expect(lineCount('Order', 200, 16)).toBe(1);
  expect(lineCount('Supercalifragilisticexpialidocious', 100, 16)).toBeGreaterThan(2);
});

test('the largest fitting font never exceeds the wanted size and always fits the box', () => {
  const text = 'Transport Handling Unit';
  const fontPx = fittingFontSize(text, 150, 40, 44);
  expect(fontPx).toBeLessThanOrEqual(44);
  expect(Math.floor(40 / (fontPx * 1.25))).toBeGreaterThanOrEqual(lineCount(text, 150, fontPx));
});

test('long names get a wider card and the name size drops until the whole name fits', () => {
  expect(cardWidthFor('Order')).toBe(184);
  expect(cardWidthFor('TransportHandlingUnitIdentification')).toBeGreaterThan(184);
  const small = cardNameFontSize('TransportHandlingUnit', { width: 184, height: 60 }, 44);
  expect(small).toBeLessThan(44);
  const reserved = cardNameFontSize('Order', { width: 184, height: 96, reservedHeight: 40 }, 44);
  expect(reserved).toBeLessThanOrEqual(cardNameFontSize('Order', { width: 184, height: 96 }, 44));
});
