// Tests collapsed graph groups and their connections.
import { test, expect } from 'bun:test';
import { inspect } from '../src/shared/core/model';
import { modelOverview } from '../src/app/graph/overview';
import { collapseAreas } from '../src/app/graph/collapse';
test('area collapse accounts for every original entity and relationship exactly once', async () => {
  const inspection = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const overview = modelOverview(inspection.entities, inspection.edges, inspection.name);
  const display = collapseAreas(overview, new Set(overview.groups.map(g => g.id)));
  expect(display.entities).toHaveLength(overview.groups.length);
  const memberIds = display.entities.flatMap(e => e.definition.memberIds);
  expect(memberIds).toHaveLength(inspection.entities.length);
  expect(new Set(memberIds)).toEqual(new Set(inspection.entities.map(entity => entity.id)));
  const ids = [...display.edges, ...[...display.internal.values()].flat()].map(e => e.id);
  expect(ids).toHaveLength(277);
  expect(new Set(ids)).toEqual(new Set(inspection.edges.map(e => e.id)));
});
test('expanding a business area restores original nodes and internal links', async () => {
  const inspection = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const overview = modelOverview(inspection.entities, inspection.edges, inspection.name);
  const order = inspection.entities.find(e => e.name === 'Order')!;
  const expanded = overview.groups.find(group => group.id === overview.groupOf.get(order.id))!;
  const collapsedAreas = new Set(overview.groups.map(g => g.id));
  collapsedAreas.delete(expanded.id);
  const display = collapseAreas(overview, collapsedAreas);
  expect(display.entities).toHaveLength(overview.groups.length - 1 + expanded.entities.length);
  for (const entity of expanded.entities) expect(display.entities.find(e => e.id === entity.id)).toBe(entity);
  const expandedIds = new Set(expanded.entities.map(entity => entity.id));
  const internalEdges = inspection.edges.filter(edge => expandedIds.has(edge.source) && expandedIds.has(edge.target));
  expect(internalEdges.length).toBeGreaterThan(0);
  for (const edge of internalEdges) expect(display.edges.find(candidate => candidate.id === edge.id)).toEqual(edge);
  expect(display.edges.some(e => e.source === order.id)).toBe(true);
  const all = collapseAreas(overview, new Set());
  expect(all.entities).toEqual(inspection.entities);
  expect(all.edges).toEqual(inspection.edges);
});
