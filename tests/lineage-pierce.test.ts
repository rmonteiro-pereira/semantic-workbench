// Tests complete upstream and downstream column paths.
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { buildLineage, closure, cardOfNode, selectionNodes } from '../src/odcs/lineage';
import { lineagePierce } from '../src/odcs/lineage-pierce';
// Lineage Full pierce: the cards of a column's complete upstream and downstream path.
const files = readdirSync('public/examples/ubl')
  .filter(f => /\.ya?ml$/.test(f))
  .map(f => ({ path: f, data: parse(readFileSync(`public/examples/ubl/${f}`, 'utf8')) }));
const g = buildLineage(files, 'ubl.odcs.yaml');
const input = (start: string[], direction: 'out' | 'in' | 'both', budget = 150) => ({
  edges: g.edges.map(e => [e.from, e.to] as [string, string]),
  owners: Object.fromEntries([...g.cards.values()].flatMap(c => c.columns.map(x => [x.id, c.id]))),
  start,
  direction,
  budget,
});
test('UBL invoice_line.line_extension_amount, Both: exactly the cards on its upstream and downstream path, through to fields', () => {
  const col = [...g.cards.values()]
    .find(c => c.label === 'invoice_line')!
    .columns.find(x => x.path === 'line_extension_amount')!.id;
  const r = lineagePierce(input([col], 'both'));
  const want = new Set([...closure(g, [col], 'both').nodes].map(n => cardOfNode(g, n)));
  expect(new Set(r.cards)).toEqual(want);
  expect(r.total).toBe(want.size);
  expect(r.hidden).toBe(0);
  // UBL's governed metrics count rows rather than reading this column, so its path ends
  // at the dataset field.
  expect(r.cards).toContain('dataset:ubl.semantic.yaml#/invoice_line');
  expect(r.steps[r.cards[0]]).toBe(0);
});
test('direction: upstream never includes downstream-only cards; a card pierces the union of its columns; the budget cuts in step order', () => {
  const card = [...g.cards.values()].find(c => c.label === 'invoice_line')!;
  const up = lineagePierce(input(selectionNodes(g, card.id), 'in'));
  const down = lineagePierce(input(selectionNodes(g, card.id), 'out'));
  expect(new Set(up.cards)).toEqual(
    new Set([...closure(g, selectionNodes(g, card.id), 'up').nodes].map(n => cardOfNode(g, n))),
  );
  expect(new Set(down.cards)).toEqual(
    new Set([...closure(g, selectionNodes(g, card.id), 'down').nodes].map(n => cardOfNode(g, n))),
  );
  const all = lineagePierce(input(selectionNodes(g, card.id), 'both'));
  const cut = lineagePierce(input(selectionNodes(g, card.id), 'both', 3));
  expect(cut.cards).toEqual(all.cards.slice(0, 3));
  expect(cut.total).toBe(all.total);
  expect(cut.hidden).toBe(all.total - 3);
});
test('commerce orders.amount, Both: through to the metrics over it', () => {
  const files = readdirSync('public/examples/commerce')
    .filter(f => /\.ya?ml$/.test(f))
    .map(f => ({
      path: f,
      data: (() => {
        try {
          return parse(readFileSync(`public/examples/commerce/${f}`, 'utf8'));
        } catch {
          return null;
        }
      })(),
    }));
  const c = buildLineage(files, 'commerce.odcs.yaml');
  const col = 'object:commerce.odcs.yaml#orders/amount';
  const r = lineagePierce({
    edges: c.edges.map(e => [e.from, e.to] as [string, string]),
    owners: Object.fromEntries(
      [...c.cards.values()].flatMap(k => k.columns.map(x => [x.id, k.id])),
    ),
    start: [col],
    direction: 'both',
    budget: 150,
  });
  expect(r.cards).toContain('metric:sales.ossie.yaml#/gross_revenue');
  expect(r.cards).not.toContain('object:commerce.odcs.yaml#customers');
});
