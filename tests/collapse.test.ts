// Tests collapsed graph groups and their connections.
import { test, expect } from 'bun:test';
import { inspect } from '../src/shared/core/model';
import { modelOverview } from '../src/app/graph/overview';
import { collapseAreas } from '../src/app/graph/collapse';
test('area collapse accounts for every original entity and relationship exactly once', async () => {
  const inspection = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const overview = modelOverview(inspection.entities, inspection.edges, inspection.name);
  const display = collapseAreas(overview, new Set(overview.groups.map(g => g.id)));
  expect(display.entities).toHaveLength(8);
  expect(display.entities.flatMap(e => e.definition.memberIds)).toHaveLength(45);
  const ids = [...display.edges, ...[...display.internal.values()].flat()].map(e => e.id);
  expect(ids).toHaveLength(277);
  expect(new Set(ids)).toEqual(new Set(inspection.edges.map(e => e.id)));
});
test('expanding a business area restores original nodes and internal links', async () => {
  const inspection = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const overview = modelOverview(inspection.entities, inspection.edges, inspection.name);
  const collapsedAreas = new Set(overview.groups.map(g => g.id));
  collapsedAreas.delete('documents');
  const display = collapseAreas(overview, collapsedAreas);
  expect(display.entities).toHaveLength(16);
  const order = inspection.entities.find(e => e.name === 'Order')!;
  expect(display.entities.find(e => e.id === order.id)).toBe(order);
  expect(display.edges.some(e => e.source === order.id)).toBe(true);
  const all = collapseAreas(overview, new Set());
  expect(all.entities).toEqual(inspection.entities);
  expect(all.edges).toEqual(inspection.edges);
});
