// Tests business-area grouping and summary connections in the overview graph.
import { test, expect } from 'bun:test';
import { inspect } from '../src/shared/core/model';
import { modelOverview } from '../src/app/graph/overview';
async function ubl() {
  return inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
}
test('overview represents every business entity exactly once in eight explicit areas', async () => {
  const model = await ubl();
  const overview = modelOverview(model.entities, model.edges, model.name);
  expect(overview.groups).toHaveLength(8);
  const ids = overview.groups.flatMap(g => g.entities.map(e => e.id));
  expect(ids).toHaveLength(45);
  expect(new Set(ids).size).toBe(45);
  expect(new Set(ids)).toEqual(new Set(model.entities.map(e => e.id)));
  expect(overview.groups[0].name).toBe('Business documents');
});
test('directed matrix preserves all 277 relationship identities, including internal links', async () => {
  const model = await ubl();
  const overview = modelOverview(model.entities, model.edges, model.name);
  const links = [...overview.matrix.values()].flat();
  expect(links).toHaveLength(277);
  expect(new Set(links.map(e => e.id))).toEqual(new Set(model.edges.map(e => e.id)));
  expect(overview.matrix.get(JSON.stringify(['documents', 'parties']))?.length).toBeGreaterThan(0);
  for (const [key, links] of overview.matrix) {
    const [from, to] = JSON.parse(key);
    expect(links.every(e => overview.groupOf.get(e.source) === from && overview.groupOf.get(e.target) === to)).toBe(true);
  }
});
test('OWL overview distinguishes business classes from technical definitions without losing access', async () => {
  const model = inspect(await Bun.file('public/examples/ubl/ubl.owl.ttl').text(), 'ubl.owl.ttl');
  const business = modelOverview(model.entities, model.edges, model.name);
  const technical = modelOverview(model.entities, model.edges, model.name, true);
  expect(business.entities).toHaveLength(45);
  expect(business.technicalCount).toBe(277);
  expect(business.links).toHaveLength(277);
  expect(technical.entities.length).toBe(model.entities.length);
  expect(technical.links.length).toBe(model.edges.length);
});
test('unknown models fall back to definition types rather than invented business semantics', () => {
  const entities = [{ id: 'a', name: 'Unknown', kind: 'Concept', path: [], fields: [], description: '' }];
  const overview = modelOverview(entities, [], 'A custom model');
  expect(overview.groups[0].name).toBe('Concept');
  expect(overview.entities).toHaveLength(1);
});
