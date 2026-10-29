// Tests grouping related documents into projects.
import { test, expect } from 'bun:test';
import { inspect, type Entity, type Relationship } from '../src/shared/core/model';
import { modelOverview } from '../src/app/graph/overview';
const node = (id: string, kind = 'EntityType', definition: any = {}): Entity => ({
  id,
  name: id,
  kind,
  description: '',
  fields: [],
  path: [],
  definition,
});
const edge = (source: string, target: string, id = source + '-' + target, kind = 'Ontology relationship'): Relationship => ({
  id,
  source,
  target,
  label: kind === 'Inheritance' ? 'extends' : id,
  data: { path: [], definition: {}, kind },
});
const entities = ['a', 'b', 'c', 'x', 'y', 'z'].map(id => node(id));
const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'c'), edge('x', 'y'), edge('x', 'z'), edge('y', 'z'), edge('c', 'x')];
const memberships = (o: ReturnType<typeof modelOverview>) => [...o.groupOf].sort(([a], [b]) => a.localeCompare(b));
test('community suggestions are invariant under input permutations, direction and duplicate weights', () => {
  const first = modelOverview(entities, edges, 'Unknown');
  const reversed = modelOverview(
    [...entities].reverse(),
    [...edges].reverse().map(e => ({ ...e, source: e.target, target: e.source })),
    'Unknown',
  );
  expect(first.mode).toBe('suggested');
  expect(first.groups).toHaveLength(2);
  expect(memberships(first)).toEqual(memberships(reversed));
  expect(memberships(modelOverview(entities, [...edges, ...edges.map(e => ({ ...e, id: e.id + 'duplicate' }))], 'Unknown'))).toEqual(memberships(first));
});
test('inheritance and primitive hubs do not change business communities', () => {
  const original = modelOverview(entities, edges, 'Unknown');
  const extra = [node('String', 'Built-in concept'), node('Shared', 'ValueType')];
  const withHubs = modelOverview([...entities, ...extra], [...edges, ...entities.flatMap(e => [edge(e.id, 'String'), edge(e.id, 'Shared')]), edge('a', 'z', 'inherit', 'Inheritance')], 'Unknown');
  for (const entity of entities) expect(withHubs.groupOf.get(entity.id)).toBe(original.groupOf.get(entity.id));
  expect(withHubs.groupOf.get('Shared')).toBe('shared-values');
  expect(withHubs.groupOf.get('String')).toBe('builtins');
});
test('single-community value types follow their owners; ownerless values stay honest', () => {
  const overview = modelOverview([...entities, node('Weight', 'ValueType'), node('UnknownValue', 'ValueType')], [...edges, edge('Weight', 'a'), edge('Weight', 'b')], 'Unknown');
  expect(overview.groupOf.get('Weight')).toBe(overview.groupOf.get('a'));
  expect(overview.groupOf.get('UnknownValue')).toBe('unassigned-values');
});
test('declared domains preserve secondary affiliations, omit inferred RDF domain and retain unassigned', () => {
  const nodes = [
    node('a', 'EntityType', { domain: 'Sales', domains: ['Finance', 'Sales'] }),
    node('b', 'EntityType', { domains: ['Operations'] }),
    node('c', 'OWL class', { domain: { id: 'Not a declaration' } }),
  ];
  const overview = modelOverview(nodes, [], 'Unknown', true, { mode: 'declared' });
  expect(overview.groupOf.get('a')).toBe('domain:Sales');
  expect(overview.memberships.get('a')).toEqual(['domain:Sales', 'domain:Finance']);
  expect(overview.groupOf.get('c')).toBe('unassigned');
  expect(overview.provenance.counts.declared).toBe(2);
});
test('workspace corrections use exact stable keys and names without touching definitions or dropping links', () => {
  const before = JSON.stringify(entities);
  const overview = modelOverview(entities, edges, 'Unknown', false, {
    mode: 'types',
    assignments: { a: 'my-group', b: 'my-group' },
    names: { 'my-group': 'Reviewed area' },
  });
  expect(overview.groupOf.get('a')).toBe('my-group');
  expect(overview.groups.find(g => g.id === 'my-group')?.name).toBe('Reviewed area');
  expect(JSON.stringify(entities)).toBe(before);
  expect(
    [...overview.matrix.values()]
      .flat()
      .map(e => e.id)
      .sort(),
  ).toEqual(edges.map(e => e.id).sort());
  expect(overview.provenance.counts.corrected).toBe(2);
});
test('official Flights has deterministic structural suggestions and retains all links', async () => {
  const inspection = inspect(await Bun.file('public/examples/ossie/flights.ontology.yaml').text(), 'flights.ontology.yaml');
  const overview = modelOverview(inspection.entities, inspection.edges, inspection.name);
  const reversed = modelOverview([...inspection.entities].reverse(), [...inspection.edges].reverse(), inspection.name);
  expect(overview.mode).toBe('suggested');
  expect(memberships(overview)).toEqual(memberships(reversed));
  expect(overview.links.length).toBe(inspection.edges.length);
  expect([...overview.matrix.values()].flat().length).toBe(inspection.edges.length);
  expect(overview.explanation).toContain('suggestions');
});
test('unknown benchmarks use definition types; suggested mode is bounded on large simple backbones', () => {
  expect(modelOverview([node('unknown', 'Concept')], [], 'Unknown').mode).toBe('types');
  const nodes = Array.from({ length: 1000 }, (_, i) => node(String(i)));
  const links = Array.from({ length: 5000 }, (_, i) => edge(String(i % 1000), String((i * 37 + 1) % 1000), String(i)));
  const start = performance.now();
  const overview = modelOverview(nodes, links, 'Benchmark');
  expect(overview.entities).toHaveLength(1000);
  expect(overview.links).toHaveLength(5000);
  expect(performance.now() - start).toBeLessThan(5000);
});

test('ODCS contract domain is preserved as a declared affiliation without rewriting source', async () => {
  const source = await Bun.file('public/examples/commerce/commerce.odcs.yaml').text();
  const inspection = inspect(source, 'commerce.odcs.yaml');
  // The contract-level domain stays every object's declared affiliation, but on its own it is one
  // group, so Declared domains is disabled and Auto moves on.
  expect(inspection.entities.every(e => e.declaredDomains?.[0] === 'Commerce')).toBe(true);
  const overview = modelOverview(inspection.entities, inspection.edges, inspection.name);
  expect(overview.modes.declared.reason).toBe('Only the contract-level domain is declared');
  expect(overview.mode).not.toBe('declared');
});
