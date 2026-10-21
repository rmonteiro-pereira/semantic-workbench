// Tests collapsed graph groups and their connections.
import { test, expect } from 'bun:test';
import { inspect } from '../src/model';
import { modelOverview } from '../src/overview';
import { collapseAreas } from '../src/collapse';
test('area collapse accounts for every original entity and relationship exactly once', async () => {
  const m = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const o = modelOverview(m.entities, m.edges, m.name);
  const display = collapseAreas(o, new Set(o.groups.map(g => g.id)));
  expect(display.entities).toHaveLength(8);
  expect(display.entities.flatMap(e => e.definition.memberIds)).toHaveLength(45);
  const ids = [...display.edges, ...[...display.internal.values()].flat()].map(e => e.id);
  expect(ids).toHaveLength(277);
  expect(new Set(ids)).toEqual(new Set(m.edges.map(e => e.id)));
});
test('expanding a business area restores original nodes and internal links', async () => {
  const m = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const o = modelOverview(m.entities, m.edges, m.name);
  const c = new Set(o.groups.map(g => g.id));
  c.delete('documents');
  const display = collapseAreas(o, c);
  expect(display.entities).toHaveLength(16);
  const order = m.entities.find(e => e.name === 'Order')!;
  expect(display.entities.find(e => e.id === order.id)).toBe(order);
  expect(display.edges.some(e => e.source === order.id)).toBe(true);
  const all = collapseAreas(o, new Set());
  expect(all.entities).toEqual(m.entities);
  expect(all.edges).toEqual(m.edges);
});
