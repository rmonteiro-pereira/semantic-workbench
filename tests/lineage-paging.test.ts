// Tests which columns a card shows, the "more columns" row and where edges to hidden columns land.
import { test, expect } from 'bun:test';
import {
  cardRows,
  moreRowId,
  COLLAPSED_MAX,
  SMALL_CARD,
  type ColumnWhy,
  type LineageCard,
} from '../src/odcs/lineage';

const none: ColumnWhy = { focus: new Set(), connected: new Set() };
const columnId = (i: number) => `object:c#big/c${i}`;
function wideCard(count: number, keyed: number[] = []): LineageCard {
  return {
    id: 'object:c#big',
    kind: 'object',
    label: 'big',
    file: 'c',
    columns: Array.from({ length: count }, (_, i) => ({
      id: columnId(i),
      path: `c${i}`,
      badges: keyed.includes(i)
        ? [{ kind: 'fk' as const, label: 'FK', title: 'Foreign key to x' }]
        : [],
    })),
  };
}

test('a small card shows every column and has no more row', () => {
  const shown = cardRows(wideCard(SMALL_CARD), none);
  expect(shown.rows).toHaveLength(SMALL_CARD);
  expect(shown.hidden).toBe(0);
});

test('a wide card shows its keys, connected and focused columns in file order', () => {
  const card = wideCard(40, [9]);
  const why: ColumnWhy = { focus: new Set([columnId(30)]), connected: new Set([columnId(2)]) };
  const shown = cardRows(card, why);
  expect(shown.rows.map(r => r.path)).toEqual(['c2', 'c9', 'c30']);
  expect(shown.hidden).toBe(37);
  expect(shown.filterable).toBe(true);
});

test('a card with nothing that matters shows no rows, only the count of columns behind it', () => {
  const shown = cardRows(wideCard(40), none);
  expect(shown.rows).toEqual([]);
  expect(shown.hidden).toBe(40);
});

test('focus beats connection beats key when the rows are capped', () => {
  const card = wideCard(
    60,
    Array.from({ length: 30 }, (_, i) => i),
  );
  const why: ColumnWhy = { focus: new Set([columnId(50)]), connected: new Set([columnId(45)]) };
  const shown = cardRows(card, why);
  expect(shown.rows).toHaveLength(COLLAPSED_MAX);
  expect(shown.rows.map(r => r.path)).toContain('c50');
  expect(shown.rows.map(r => r.path)).toContain('c45');
  expect(shown.rows.map(r => r.path)).not.toContain('c29');
});

test('a full pierce lifts the cap for connected columns', () => {
  const card = wideCard(60);
  const connected = new Set(Array.from({ length: 30 }, (_, i) => columnId(i)));
  const why: ColumnWhy = { focus: new Set(), connected };
  expect(cardRows(card, why).rows).toHaveLength(COLLAPSED_MAX);
  expect(cardRows(card, why, { uncapped: true }).rows).toHaveLength(30);
});

test('an opened card lists every column', () => {
  const shown = cardRows(wideCard(100), none, { open: true });
  expect(shown.rows).toHaveLength(100);
  expect(shown.hidden).toBe(0);
});

test('an edge to a hidden column attaches to the more row; others keep their own row', () => {
  const card = wideCard(40, [3]);
  const shown = cardRows(card, none);
  expect(shown.port(columnId(3))).toBe(columnId(3));
  expect(shown.port(columnId(17))).toBe(moreRowId(card.id));
  expect(shown.port('object:c#other/x')).toBe('object:c#other/x');
  expect(shown.port(card.id)).toBe(card.id);
});
