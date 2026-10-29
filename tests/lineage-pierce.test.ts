// Tests complete upstream and downstream column paths.
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { buildLineage, closure, cardOfNode, selectionNodes } from '../src/app/odcs/lineage';
import { lineagePierce } from '../src/app/odcs/lineage-pierce';
// Lineage Show all connected: the cards of a column's complete upstream and downstream path.
const files = readdirSync('public/examples/ubl')
  .filter(f => /\.ya?ml$/.test(f))
  .map(f => ({ path: f, data: parse(readFileSync(`public/examples/ubl/${f}`, 'utf8')) }));
const lineageGraph = buildLineage(files, 'ubl.odcs.yaml');
const input = (start: string[], direction: 'out' | 'in' | 'both', budget = 150) => ({
  edges: lineageGraph.edges.map(e => [e.from, e.to] as [string, string]),
  owners: Object.fromEntries([...lineageGraph.cards.values()].flatMap(c => c.columns.map(x => [x.id, c.id]))),
  start,
  direction,
  budget,
});
test('UBL invoice_line.line_extension_amount, Both: exactly the cards on its upstream and downstream path, through to fields', () => {
  const col = [...lineageGraph.cards.values()].find(c => c.label === 'invoice_line')!.columns.find(x => x.path === 'line_extension_amount')!.id;
  const pierced = lineagePierce(input([col], 'both'));
  const want = new Set([...closure(lineageGraph, [col], 'both').nodes].map(n => cardOfNode(lineageGraph, n)));
  expect(new Set(pierced.cards)).toEqual(want);
  expect(pierced.total).toBe(want.size);
  expect(pierced.hidden).toBe(0);
  // UBL's governed metrics count rows rather than reading this column, and the invoice_line dataset copies its table column for column, so the path ends at the table card, which stands for the
  // dataset too.
  expect(pierced.cards).not.toContain('dataset:ubl.semantic.yaml#/invoice_line');
  const table = [...lineageGraph.cards.values()].find(c => c.label === 'invoice_line')!;
  expect(table.badges?.some(b => b.kind === 'semantic')).toBe(true);
  expect(pierced.steps[pierced.cards[0]]).toBe(0);
});
test('direction: upstream never includes downstream-only cards; a card pierces the union of its columns; the budget cuts in step order', () => {
  const card = [...lineageGraph.cards.values()].find(c => c.label === 'invoice_line')!;
  const up = lineagePierce(input(selectionNodes(lineageGraph, card.id), 'in'));
  const down = lineagePierce(input(selectionNodes(lineageGraph, card.id), 'out'));
  expect(new Set(up.cards)).toEqual(new Set([...closure(lineageGraph, selectionNodes(lineageGraph, card.id), 'up').nodes].map(n => cardOfNode(lineageGraph, n))));
  expect(new Set(down.cards)).toEqual(new Set([...closure(lineageGraph, selectionNodes(lineageGraph, card.id), 'down').nodes].map(n => cardOfNode(lineageGraph, n))));
  const all = lineagePierce(input(selectionNodes(lineageGraph, card.id), 'both'));
  const cut = lineagePierce(input(selectionNodes(lineageGraph, card.id), 'both', 3));
  expect(cut.cards).toEqual(all.cards.slice(0, 3));
  expect(cut.total).toBe(all.total);
  expect(cut.hidden).toBe(all.total - 3);
});
test('commerce orders.amount, Both: through to the metrics over it', () => {
  const files = readdirSync('public/examples/commerce')
    .filter(f => /\.ya?ml$/.test(f))
    .map(fileName => ({
      path: fileName,
      data: (() => {
        try {
          return parse(readFileSync(`public/examples/commerce/${fileName}`, 'utf8'));
        } catch {
          return null;
        }
      })(),
    }));
  const lineage = buildLineage(files, 'commerce.odcs.yaml');
  const col = 'object:commerce.odcs.yaml#orders/amount';
  const pierced = lineagePierce({
    edges: lineage.edges.map(e => [e.from, e.to] as [string, string]),
    owners: Object.fromEntries([...lineage.cards.values()].flatMap(k => k.columns.map(x => [x.id, k.id]))),
    start: [col],
    direction: 'both',
    budget: 150,
  });
  expect(pierced.cards).toContain('metric:sales.ossie.yaml#/gross_revenue');
  expect(pierced.cards).not.toContain('object:commerce.odcs.yaml#customers');
});
